// PDF 压缩:每页渲染为位图,以指定质量重编码为 JPEG,再打回一份新 PDF。
// 与 Mac 版 DocumentExporter.compressPDF 行为对齐,预设参数一致。
//
// 运行时需要 PDFium 动态库(.dll on Windows, .dylib on macOS, .so on Linux)。
// - 开发时:让 pdfium-render 从 PATH 或 DYLD_LIBRARY_PATH 找,或用户 brew install pdfium
// - 打包时:CI workflow 会把预编译的 PDFium 二进制放进 bundle
// - 加载失败会给明确错误,不会 crash

use anyhow::{anyhow, Context, Result};
use pdfium_render::prelude::*;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PdfPreset { Light, Recommended, Deep }

impl PdfPreset {
    fn quality(&self) -> f64 {
        match self { Self::Light => 0.85, Self::Recommended => 0.70, Self::Deep => 0.55 }
    }
    fn max_pixel(&self) -> Option<u32> {
        match self { Self::Light => None, Self::Recommended => Some(1600), Self::Deep => Some(1200) }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfCompressOptions {
    pub preset: PdfPreset,
    /// 覆盖预设的手动质量;None 走 preset.quality()
    pub manual_quality: Option<f64>,
    /// 覆盖预设的最长边;None 走 preset.max_pixel()
    pub manual_max_pixel: Option<u32>,
    pub output_directory: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub output_path: String,
    pub output_bytes: u64,
}

pub fn compress(source: &str, opts: &PdfCompressOptions) -> Result<ExportResult> {
    let quality = opts.manual_quality.unwrap_or(opts.preset.quality());
    let max_pixel = opts.manual_max_pixel.or_else(|| opts.preset.max_pixel());

    let pdfium = load_pdfium()?;
    let doc = pdfium.load_pdf_from_file(source, None)
        .with_context(|| format!("load PDF: {source}"))?;

    // 新建输出 PDF
    let mut out_doc = pdfium.create_new_pdf().context("new pdf")?;

    for (idx, page) in doc.pages().iter().enumerate() {
        let width_pt = page.width().value;  // pt
        let height_pt = page.height().value;

        // 决定渲染分辨率(与 Mac 版:×2 让屏显清晰,再受 maxPixel 限)
        let (target_w_px, target_h_px) = decide_render_size(width_pt, height_pt, max_pixel);

        let render_cfg = PdfRenderConfig::new()
            .set_target_width(target_w_px as i32)
            .set_target_height(target_h_px as i32)
            .rotate_if_landscape(PdfPageRenderRotation::None, false);

        let bitmap = page.render_with_config(&render_cfg)
            .with_context(|| format!("render page {}", idx + 1))?;

        // 转成 image::DynamicImage 以便走 mozjpeg 重编码
        let img = bitmap.as_image();
        let rgb = img.to_rgb8();
        let (pxw, pxh) = (rgb.width() as usize, rgb.height() as usize);
        let jpeg_bytes = std::panic::catch_unwind(|| -> Result<Vec<u8>> {
            let mut comp = mozjpeg::Compress::new(mozjpeg::ColorSpace::JCS_RGB);
            comp.set_size(pxw, pxh);
            comp.set_quality((quality * 100.0).clamp(10.0, 100.0) as f32);
            let mut started = comp.start_compress(Vec::new())?;
            started.write_scanlines(&rgb)?;
            Ok(started.finish()?)
        }).map_err(|_| anyhow!("mozjpeg panicked"))??;

        // 在输出 PDF 里加一个与原页同尺寸的空白页,然后把 JPEG 铺满该页
        let mut new_page = out_doc.pages_mut()
            .create_page_at_end(PdfPagePaperSize::from_points(
                PdfPoints::new(width_pt),
                PdfPoints::new(height_pt),
            ))
            .with_context(|| format!("create page {}", idx + 1))?;

        // 把 JPEG 解回 DynamicImage 再放上去
        let re_decoded = ::image::load_from_memory(&jpeg_bytes)
            .with_context(|| format!("decode encoded jpeg for page {}", idx + 1))?;

        // new_with_size:直接指定物件在 PDF 坐标里的宽高
        let img_obj = PdfPageImageObject::new_with_size(
            &out_doc,
            &re_decoded,
            PdfPoints::new(width_pt),
            PdfPoints::new(height_pt),
        ).context("create image object")?;

        new_page.objects_mut()
            .add_image_object(img_obj)
            .with_context(|| format!("place image on page {}", idx + 1))?;
    }

    let out_dir = crate::image_module::resolve_output_dir_pub(&opts.output_directory)?;
    std::fs::create_dir_all(&out_dir).context("mkdir output directory")?;
    let src = Path::new(source);
    let base = src.file_stem().and_then(|s| s.to_str())
        .ok_or_else(|| anyhow!("bad file name: {source}"))?;
    let out = unique_output_path(&out_dir, base, "pdf");

    out_doc.save_to_file(&out).with_context(|| format!("save PDF: {}", out.display()))?;

    // 保护:若压缩后反而变大(纯文本 PDF 常见),保留原文件
    let src_size = std::fs::metadata(source)?.len();
    let out_size = std::fs::metadata(&out)?.len();
    let final_size = if src_size > 0 && out_size > src_size {
        let _ = std::fs::remove_file(&out);
        std::fs::copy(source, &out).context("fallback copy original")?
    } else {
        out_size
    };

    Ok(ExportResult {
        output_path: out.to_string_lossy().into_owned(),
        output_bytes: final_size,
    })
}

fn decide_render_size(w_pt: f32, h_pt: f32, max_pixel: Option<u32>) -> (u32, u32) {
    // 与 Mac 版一致:2x 基线,再受 max_pixel 限
    let mut scale = 2.0;
    if let Some(mp) = max_pixel {
        let longest_at_2x = w_pt.max(h_pt) * 2.0;
        if longest_at_2x > mp as f32 {
            scale = (mp as f32) / w_pt.max(h_pt);
        }
    }
    let pxw = (w_pt * scale).round().max(1.0) as u32;
    let pxh = (h_pt * scale).round().max(1.0) as u32;
    (pxw, pxh)
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

/// 加载 PDFium 动态库。开发/未安装时给用户明确指引。
fn load_pdfium() -> Result<Pdfium> {
    // 优先系统 lib(brew install pdfium 或 Windows PATH 上有 pdfium.dll)
    if let Ok(b) = Pdfium::bind_to_system_library() {
        return Ok(Pdfium::new(b));
    }
    // 其次和可执行同目录(打包场景)
    if let Some(dir) = std::env::current_exe().ok().and_then(|p| p.parent().map(|p| p.to_path_buf())) {
        if let Ok(b) = Pdfium::bind_to_library(dir.to_string_lossy().as_ref()) {
            return Ok(Pdfium::new(b));
        }
    }
    Err(anyhow!(
        "未找到 PDFium 动态库(pdfium.dll / libpdfium.dylib)。\
         macOS: `brew install pdfium`;Windows: 从 \
         https://github.com/bblanchon/pdfium-binaries/releases 下载对应版本,\
         把 pdfium.dll 放到 TREEAHA.exe 同目录。"
    ))
}
