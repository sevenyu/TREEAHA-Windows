// 视频压缩:调系统 ffmpeg。
//
// 与 Mac 版预设对齐(recommended/light/deep)—— 用 -crf 控质量。h264=CRF 18/23/28, hevc=CRF 20/26/32。
// 进度通过解析 stderr 的 "out_time_us=..." 行(-progress pipe:2)实现。
// 音频统一 AAC。

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc::Sender;

#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum VideoCodec { H264, Hevc }

#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum VideoContainer { Mp4, Mov }

#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum VideoPreset { Light, Recommended, Deep }

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoOptions {
    pub codec: VideoCodec,
    pub container: VideoContainer,
    pub preset: VideoPreset,
    pub audio_bitrate: u32,   // bps
    pub output_directory: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub output_path: String,
    pub output_bytes: u64,
}

pub fn locate_ffmpeg() -> Option<PathBuf> {
    let candidates = [
        "/opt/homebrew/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
        "/usr/bin/ffmpeg",
        r"C:\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
    ];
    for p in &candidates {
        if Path::new(p).exists() { return Some(PathBuf::from(p)); }
    }
    if let Ok(o) = Command::new(if cfg!(windows) { "where" } else { "which" }).arg("ffmpeg").output() {
        if o.status.success() {
            let s = String::from_utf8_lossy(&o.stdout).lines().next().unwrap_or("").trim().to_string();
            if !s.is_empty() { return Some(PathBuf::from(s)); }
        }
    }
    None
}

pub const FFMPEG_DOWNLOAD_URL: &str = "https://www.gyan.dev/ffmpeg/builds/";

/// probe:拿视频时长(秒)。用 ffprobe(和 ffmpeg 同一 bundle)。
pub fn probe_duration(path: &str) -> Result<f64> {
    let ffmpeg = locate_ffmpeg().ok_or_else(|| anyhow!("ffmpeg 未找到"))?;
    let ffprobe = ffmpeg.with_file_name(if cfg!(windows) { "ffprobe.exe" } else { "ffprobe" });
    let out = Command::new(&ffprobe)
        .args(["-v", "error", "-show_entries", "format=duration",
               "-of", "default=noprint_wrappers=1:nokey=1", path])
        .output()
        .context("run ffprobe")?;
    if !out.status.success() {
        return Err(anyhow!("ffprobe 失败: {}", String::from_utf8_lossy(&out.stderr)));
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    s.parse::<f64>().with_context(|| format!("parse duration: {s}"))
}

/// 阻塞执行。`progress` 可选:每 200ms 收到一次 0..1 进度。
pub fn export(source: &str, opts: &VideoOptions, progress: Option<Sender<f64>>) -> Result<ExportResult> {
    let ffmpeg = locate_ffmpeg().ok_or_else(|| anyhow!(
        "未检测到 ffmpeg。请到 {FFMPEG_DOWNLOAD_URL} 安装后重试。"
    ))?;

    let duration = probe_duration(source).unwrap_or(0.0);

    let out_dir = crate::image_module::resolve_output_dir_pub(&opts.output_directory)?;
    std::fs::create_dir_all(&out_dir).context("mkdir output directory")?;

    let src = Path::new(source);
    let base = src.file_stem().and_then(|s| s.to_str())
        .ok_or_else(|| anyhow!("bad file name: {source}"))?;
    let ext = match opts.container { VideoContainer::Mp4 => "mp4", VideoContainer::Mov => "mov" };
    let out = unique_output_path(&out_dir, base, ext);

    let (codec_name, crf) = match (opts.codec, opts.preset) {
        (VideoCodec::H264, VideoPreset::Light) => ("libx264", "18"),
        (VideoCodec::H264, VideoPreset::Recommended) => ("libx264", "23"),
        (VideoCodec::H264, VideoPreset::Deep) => ("libx264", "28"),
        (VideoCodec::Hevc, VideoPreset::Light) => ("libx265", "20"),
        (VideoCodec::Hevc, VideoPreset::Recommended) => ("libx265", "26"),
        (VideoCodec::Hevc, VideoPreset::Deep) => ("libx265", "32"),
    };

    let audio_kbps = format!("{}k", opts.audio_bitrate / 1000);

    let mut cmd = Command::new(&ffmpeg);
    cmd.args([
        "-y",
        "-i", source,
        "-c:v", codec_name,
        "-crf", crf,
        "-preset", "medium",
        "-c:a", "aac",
        "-b:a", &audio_kbps,
        "-progress", "pipe:2",
        "-nostats",
    ]);
    // hevc + mp4 需要 tag 才能被主流 player 识别
    if opts.codec == VideoCodec::Hevc && opts.container == VideoContainer::Mp4 {
        cmd.args(["-tag:v", "hvc1"]);
    }
    cmd.arg(out.to_string_lossy().into_owned());
    cmd.stdout(Stdio::null()).stderr(Stdio::piped());

    let mut child = cmd.spawn().context("spawn ffmpeg")?;
    if let (Some(stderr), Some(tx)) = (child.stderr.take(), progress) {
        let dur = duration;
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(|r| r.ok()) {
                if let Some(v) = line.strip_prefix("out_time_us=") {
                    if let Ok(us) = v.trim().parse::<u64>() {
                        let sec = us as f64 / 1_000_000.0;
                        let p = if dur > 0.0 { (sec / dur).clamp(0.0, 1.0) } else { 0.0 };
                        let _ = tx.send(p);
                    }
                }
            }
        });
    }

    let status = child.wait().context("wait ffmpeg")?;
    if !status.success() {
        return Err(anyhow!("ffmpeg 退出码 {:?}", status.code()));
    }
    let bytes = std::fs::metadata(&out)?.len();
    Ok(ExportResult {
        output_path: out.to_string_lossy().into_owned(),
        output_bytes: bytes,
    })
}

fn unique_output_path(dir: &Path, base: &str, ext: &str) -> PathBuf {
    let mut c = dir.join(format!("{base}.{ext}"));
    if !c.exists() { return c; }
    for i in 2..u32::MAX {
        c = dir.join(format!("{base}-{i}.{ext}"));
        if !c.exists() { return c; }
    }
    dir.join(format!("{base}-{}.{}", std::process::id(), ext))
}
