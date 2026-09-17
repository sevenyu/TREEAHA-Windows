// 只用 Rust 侧跑图片压缩冒烟。用:
//   cargo run --example smoke_image -- <input> <output_dir> <format> <quality> <maxpx>

use treeaha_windows_lib::image_module::{export, ImageOptions, OutFormat, ResizeQuality};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 4 {
        eprintln!("usage: smoke_image <input> <output_dir> <format>[jpeg|png|webp] [quality 0..1] [max_px]");
        std::process::exit(2);
    }
    let input = &args[1];
    let out_dir = args[2].clone();
    let format = match args[3].as_str() {
        "jpeg" => OutFormat::Jpeg,
        "png"  => OutFormat::Png,
        "webp" => OutFormat::Webp,
        other  => { eprintln!("unknown format: {other}"); std::process::exit(2); }
    };
    let quality: f64 = args.get(4).and_then(|s| s.parse().ok()).unwrap_or(0.85);
    let max_px: u32 = args.get(5).and_then(|s| s.parse().ok()).unwrap_or(1600);

    let opts = ImageOptions {
        format,
        quality,
        limit_dimension: true,
        max_pixel_size: max_px,
        resize_quality: ResizeQuality::High,
        strip_metadata: true,
        output_directory: Some(out_dir),
    };

    let start = std::time::Instant::now();
    match export(input, &opts) {
        Ok(r) => {
            let ms = start.elapsed().as_millis();
            println!("ok: {}  ({} bytes, {} ms)", r.output_path, r.output_bytes, ms);
        }
        Err(e) => {
            eprintln!("err: {e:#}");
            std::process::exit(1);
        }
    }
}
