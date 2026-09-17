use treeaha_windows_lib::lottie::{export, LottieOptions};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!("usage: smoke_lottie <input.json> <output_dir>");
        std::process::exit(2);
    }
    let opts = LottieOptions {
        minify: true,
        float_precision: 2,
        strip_assets: false,
        strip_metadata: true,
        output_directory: Some(args[2].clone()),
    };
    match export(&args[1], &opts) {
        Ok(r) => println!("ok: {} ({} bytes)", r.output_path, r.output_bytes),
        Err(e) => { eprintln!("err: {e:#}"); std::process::exit(1); }
    }
}
