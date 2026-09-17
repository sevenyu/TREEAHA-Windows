// 图片处理:解码 → 可选缩放 → 按目标格式重编码。
//
// 与 Mac 版对齐的核心行为:
// - JPEG:走 mozjpeg,质量 0–100
// - PNG:先由 image 编码,再走 oxipng 无损优化(quality 越低压得越狠,复用为压缩级别)
// - WebP:libwebp,quality 0–100
// - 其他(BMP/TIFF/GIF):透传 image crate
// - stripMetadata:image crate 天然不携带 EXIF,导出后就没有元数据。这个开关目前仅影响
//   是否保留 ICC profile —— 未来若加 kamadak-exif 拷贝流程再区分。

use anyhow::{anyhow, Context, Result};
use image::{DynamicImage, ImageFormat, imageops::FilterType};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum OutFormat {
    Jpeg,
    Png,
    Webp,
    // 后续可加 avif/heif/tiff
    Tiff,
    // AVIF/HEIF 需要额外系统 codec,先留空
    Avif,
    Heif,
}

#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ResizeQuality {
    High,
    Medium,
    Low,
}

impl ResizeQuality {
    fn filter(&self) -> FilterType {
        match self {
            ResizeQuality::High => FilterType::Lanczos3,
            ResizeQuality::Medium => FilterType::CatmullRom,
            ResizeQuality::Low => FilterType::Triangle,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageOptions {
    pub format: OutFormat,
    pub quality: f64,          // 0.1..1.0
    pub limit_dimension: bool,
    pub max_pixel_size: u32,
    pub resize_quality: ResizeQuality,
    pub strip_metadata: bool,
    pub output_directory: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub output_path: String,
    pub output_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub width: u32,
    pub height: u32,
    /// PNG-encoded base64 thumbnail data URL (max 256px)
    pub thumbnail_data_url: String,
}

pub fn probe(path: &str) -> Result<ProbeResult> {
    let img = image::open(path).with_context(|| format!("open image: {path}"))?;
    let (w, h) = (img.width(), img.height());
    let thumb = img.resize(256, 256, FilterType::Triangle);
    let mut buf: Vec<u8> = Vec::new();
    thumb.write_to(&mut std::io::Cursor::new(&mut buf), ImageFormat::Png)
        .context("encode thumbnail")?;
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
    let data_url = format!("data:image/png;base64,{b64}");
    Ok(ProbeResult { width: w, height: h, thumbnail_data_url: data_url })
}

/// 压缩单张图片。返回输出文件路径 + 字节数。
pub fn export(source: &str, opts: &ImageOptions) -> Result<ExportResult> {
    let out_dir = resolve_output_dir(&opts.output_directory)?;
    fs::create_dir_all(&out_dir).context("mkdir output directory")?;

    let src_path = Path::new(source);
    let base_name = src_path.file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| anyhow!("bad file name: {source}"))?;
    let out_path = unique_output_path(&out_dir, base_name, ext_for(opts.format));

    let mut img = image::open(source).with_context(|| format!("open image: {source}"))?;

    if opts.limit_dimension {
        let (w, h) = (img.width(), img.height());
        let longest = w.max(h);
        if longest > opts.max_pixel_size {
            let scale = opts.max_pixel_size as f64 / longest as f64;
            let nw = ((w as f64) * scale).round().max(1.0) as u32;
            let nh = ((h as f64) * scale).round().max(1.0) as u32;
            img = img.resize(nw, nh, opts.resize_quality.filter());
        }
    }

    match opts.format {
        OutFormat::Jpeg => encode_jpeg(&img, &out_path, opts.quality)?,
        OutFormat::Png  => encode_png(&img, &out_path, opts.quality)?,
        OutFormat::Webp => encode_webp(&img, &out_path, opts.quality)?,
        OutFormat::Tiff => img.save_with_format(&out_path, ImageFormat::Tiff).context("save tiff")?,
        OutFormat::Avif | OutFormat::Heif => {
            return Err(anyhow!("{:?} 暂未支持:需要额外的系统 codec,后续接入", opts.format));
        }
    }

    let bytes = fs::metadata(&out_path).context("stat output")?.len();
    Ok(ExportResult {
        output_path: out_path.to_string_lossy().into_owned(),
        output_bytes: bytes,
    })
}

fn encode_jpeg(img: &DynamicImage, out: &Path, quality: f64) -> Result<()> {
    let rgb = img.to_rgb8();
    let (w, h) = (rgb.width() as usize, rgb.height() as usize);
    let q = (quality * 100.0).clamp(10.0, 100.0) as f32;

    // mozjpeg 需要 catch_unwind 以防其 panic
    let bytes = std::panic::catch_unwind(|| -> Result<Vec<u8>> {
        let mut comp = mozjpeg::Compress::new(mozjpeg::ColorSpace::JCS_RGB);
        comp.set_size(w, h);
        comp.set_quality(q);
        let mut started = comp.start_compress(Vec::new())?;
        started.write_scanlines(&rgb)?;
        let out = started.finish()?;
        Ok(out)
    })
    .map_err(|_| anyhow!("mozjpeg panicked"))??;

    fs::write(out, bytes).context("write jpeg")?;
    Ok(())
}

fn encode_png(img: &DynamicImage, out: &Path, quality: f64) -> Result<()> {
    // 先用 image crate 编成 PNG,再交给 oxipng 优化。
    let mut raw: Vec<u8> = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut raw), ImageFormat::Png)
        .context("encode png (initial)")?;

    // quality 越低 → oxipng 级别越高(压得越狠但更慢)。0..6。
    let level: u8 = match (quality * 100.0) as u32 {
        0..=40 => 6,
        41..=60 => 5,
        61..=80 => 3,
        _ => 2,
    };
    let mut opts = oxipng::Options::from_preset(level);
    opts.strip = oxipng::StripChunks::Safe;
    match oxipng::optimize_from_memory(&raw, &opts) {
        Ok(optimized) => fs::write(out, optimized).context("write optimized png")?,
        Err(_) => fs::write(out, &raw).context("write raw png (oxipng failed)")?,
    }
    Ok(())
}

fn encode_webp(img: &DynamicImage, out: &Path, quality: f64) -> Result<()> {
    let rgb = img.to_rgba8();
    let encoder = webp::Encoder::from_rgba(&rgb, rgb.width(), rgb.height());
    let q = (quality * 100.0).clamp(10.0, 100.0) as f32;
    let mem = encoder.encode(q);
    fs::write(out, &*mem).context("write webp")?;
    Ok(())
}

fn ext_for(f: OutFormat) -> &'static str {
    match f {
        OutFormat::Jpeg => "jpg",
        OutFormat::Png  => "png",
        OutFormat::Webp => "webp",
        OutFormat::Tiff => "tiff",
        OutFormat::Avif => "avif",
        OutFormat::Heif => "heic",
    }
}

fn resolve_output_dir(explicit: &Option<String>) -> Result<PathBuf> {
    resolve_output_dir_pub(explicit)
}

/// 与 `resolve_output_dir` 相同,导出给其他模块(如 lottie)共用。
pub fn resolve_output_dir_pub(explicit: &Option<String>) -> Result<PathBuf> {
    if let Some(p) = explicit.as_ref().filter(|s| !s.is_empty()) {
        return Ok(PathBuf::from(p));
    }
    let downloads = dirs::download_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join("Downloads")))
        .ok_or_else(|| anyhow!("cannot resolve Downloads dir"))?;
    Ok(downloads.join("TREEAHA"))
}

/// photo.jpg → 若已存在则 photo-2.jpg / photo-3.jpg …
fn unique_output_path(dir: &Path, base: &str, ext: &str) -> PathBuf {
    let mut candidate = dir.join(format!("{base}.{ext}"));
    if !candidate.exists() { return candidate; }
    for i in 2..u32::MAX {
        candidate = dir.join(format!("{base}-{i}.{ext}"));
        if !candidate.exists() { return candidate; }
    }
    dir.join(format!("{base}-{}.{}", std::process::id(), ext))
}
