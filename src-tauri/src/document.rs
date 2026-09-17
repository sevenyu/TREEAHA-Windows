// 富文本互转:pdf ↔ rtf ↔ html ↔ md ↔ txt。
//
// 策略:走系统 pandoc。TREEAHA 不 vendor pandoc(单个二进制 100+ MB),
// 而是检测系统 PATH + 常见路径。用户未装时给"请安装 pandoc"错误。
//
// pandoc 命令行:
//   pandoc -f <in-fmt> -t <out-fmt> --output=<out> <in>
// PDF 需要 --pdf-engine 参数,Mac/Win 默认 xelatex/pdflatex,pandoc 自动挑。

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DocKind {
    Pdf,
    Word,
    RichText,
    Markdown,
}

#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DocTarget {
    Pdf,
    Rtf,
    Html,
    Txt,
    Png,   // 仅 pdf 源:每页 PNG
    Jpeg,  // 仅 pdf 源:每页 JPEG
    Pptx,  // 尚未支持
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocOptions {
    pub source_kind: DocKind,
    pub target: DocTarget,
    pub output_directory: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub output_path: String,
    pub output_bytes: u64,
}

/// 探测系统 pandoc。找不到返回 None。
pub fn locate_pandoc() -> Option<PathBuf> {
    // 常见路径 + PATH
    let candidates = [
        "/opt/homebrew/bin/pandoc",
        "/usr/local/bin/pandoc",
        "/usr/bin/pandoc",
        r"C:\Program Files\Pandoc\pandoc.exe",
        r"C:\Program Files (x86)\Pandoc\pandoc.exe",
    ];
    for p in &candidates {
        if Path::new(p).exists() { return Some(PathBuf::from(p)); }
    }
    // PATH 兜底
    if let Ok(o) = Command::new(if cfg!(windows) { "where" } else { "which" }).arg("pandoc").output() {
        if o.status.success() {
            let s = String::from_utf8_lossy(&o.stdout).lines().next().unwrap_or("").trim().to_string();
            if !s.is_empty() { return Some(PathBuf::from(s)); }
        }
    }
    None
}

/// pandoc 官方下载页 —— 给 UI 用
pub const PANDOC_DOWNLOAD_URL: &str = "https://pandoc.org/installing.html";

pub fn export(source: &str, opts: &DocOptions) -> Result<ExportResult> {
    if matches!(opts.target, DocTarget::Png | DocTarget::Jpeg | DocTarget::Pptx) {
        return Err(anyhow!("目标格式 {:?} 暂未在 Windows 版实现", opts.target));
    }

    let pandoc = locate_pandoc().ok_or_else(|| anyhow!(
        "未检测到 pandoc。请到 {PANDOC_DOWNLOAD_URL} 安装后重试。"
    ))?;

    let out_dir = crate::image_module::resolve_output_dir_pub(&opts.output_directory)?;
    std::fs::create_dir_all(&out_dir).context("mkdir output directory")?;
    let src = Path::new(source);
    let base = src.file_stem().and_then(|s| s.to_str())
        .ok_or_else(|| anyhow!("bad file name: {source}"))?;
    let ext = target_ext(opts.target);
    let out = unique_output_path(&out_dir, base, ext);

    let from_fmt = pandoc_input_fmt(opts.source_kind, src);
    let to_fmt = pandoc_output_fmt(opts.target);

    let mut cmd = Command::new(&pandoc);
    if let Some(f) = from_fmt { cmd.arg("-f").arg(f); }
    cmd.arg("-t").arg(to_fmt)
       .arg("-o").arg(&out)
       .arg(source);
    // PDF 输出需要 --pdf-engine。默认让 pandoc 挑;若失败给出更清晰的错误。
    let output = cmd.output().context("run pandoc")?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!("pandoc 转换失败: {stderr}"));
    }
    let size = std::fs::metadata(&out).context("stat output")?.len();
    Ok(ExportResult {
        output_path: out.to_string_lossy().into_owned(),
        output_bytes: size,
    })
}

fn pandoc_input_fmt(k: DocKind, path: &Path) -> Option<&'static str> {
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase();
    match k {
        DocKind::Pdf => Some("pdf"),
        DocKind::Word if ext == "doc" => None, // pandoc 不支持旧版 .doc,让它按扩展识别或失败
        DocKind::Word => Some("docx"),
        DocKind::Markdown => Some("markdown"),
        DocKind::RichText => match ext.as_str() {
            "rtf"  => Some("rtf"),
            "html" | "htm" => Some("html"),
            "txt"  => Some("plain"),
            _ => None,
        },
    }
}

fn pandoc_output_fmt(t: DocTarget) -> &'static str {
    match t {
        DocTarget::Pdf  => "pdf",
        DocTarget::Rtf  => "rtf",
        DocTarget::Html => "html",
        DocTarget::Txt  => "plain",
        _ => unreachable!(),
    }
}

fn target_ext(t: DocTarget) -> &'static str {
    match t {
        DocTarget::Pdf  => "pdf",
        DocTarget::Rtf  => "rtf",
        DocTarget::Html => "html",
        DocTarget::Txt  => "txt",
        DocTarget::Png  => "png",
        DocTarget::Jpeg => "jpg",
        DocTarget::Pptx => "pptx",
    }
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
