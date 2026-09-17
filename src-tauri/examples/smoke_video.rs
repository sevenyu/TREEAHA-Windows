use treeaha_windows_lib::video::{export, VideoOptions, VideoCodec, VideoContainer, VideoPreset};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!("usage: smoke_video <input> <output_dir>");
        std::process::exit(2);
    }
    let (tx, rx) = std::sync::mpsc::channel::<f64>();
    let printer = std::thread::spawn(move || {
        let mut last = -1;
        while let Ok(p) = rx.recv() {
            let pct = (p * 100.0) as i32;
            if pct != last {
                eprint!("\rprogress: {pct}%");
                last = pct;
            }
        }
        eprintln!();
    });

    let opts = VideoOptions {
        codec: VideoCodec::H264,
        container: VideoContainer::Mp4,
        preset: VideoPreset::Recommended,
        audio_bitrate: 128_000,
        output_directory: Some(args[2].clone()),
    };
    let r = export(&args[1], &opts, Some(tx));
    let _ = printer.join();
    match r {
        Ok(r) => println!("ok: {} ({} bytes)", r.output_path, r.output_bytes),
        Err(e) => { eprintln!("err: {e:#}"); std::process::exit(1); }
    }
}
