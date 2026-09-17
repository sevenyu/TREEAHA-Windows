// TREEAHA Windows —— Tauri 后端入口

pub mod image_module;
pub mod lottie;
pub mod document;
pub mod video;
pub mod concurrency;

use crate::image_module::{ImageOptions, ExportResult as ImageExportResult, ProbeResult};
use crate::lottie::{LottieOptions, ExportResult as LottieExportResult};
use crate::document::{DocOptions, ExportResult as DocExportResult};
use crate::video::{VideoOptions, ExportResult as VideoExportResult};
use crate::concurrency::{cpu_sem, video_sem};

use tauri::{AppHandle, Emitter};

/// 后端向前端发进度事件时用的名字
const VIDEO_PROGRESS_EVENT: &str = "video-progress";

#[derive(serde::Serialize, Clone)]
struct VideoProgress {
    id: String,
    progress: f64,
}

#[tauri::command]
fn ping() -> &'static str { "pong" }

#[tauri::command]
fn probe_image(path: String) -> Result<ProbeResult, String> {
    let _g = cpu_sem().acquire();
    crate::image_module::probe(&path).map_err(|e| format!("{e:#}"))
}
#[tauri::command]
fn compress_image(source: String, opts: ImageOptions) -> Result<ImageExportResult, String> {
    let _g = cpu_sem().acquire();
    crate::image_module::export(&source, &opts).map_err(|e| format!("{e:#}"))
}
#[tauri::command]
fn compress_lottie(source: String, opts: LottieOptions) -> Result<LottieExportResult, String> {
    let _g = cpu_sem().acquire();
    crate::lottie::export(&source, &opts).map_err(|e| format!("{e:#}"))
}
#[tauri::command]
fn convert_document(source: String, opts: DocOptions) -> Result<DocExportResult, String> {
    let _g = cpu_sem().acquire();
    crate::document::export(&source, &opts).map_err(|e| format!("{e:#}"))
}
#[tauri::command]
fn probe_pandoc() -> Option<String> {
    crate::document::locate_pandoc().map(|p| p.to_string_lossy().into_owned())
}
#[tauri::command]
fn probe_ffmpeg() -> Option<String> {
    crate::video::locate_ffmpeg().map(|p| p.to_string_lossy().into_owned())
}

/// 视频压缩:阻塞跑,过程中通过 event 发进度。
/// 前端调时应该显式传 id(即 WorkItem.id),配合 listen 该 event 更新对应卡片。
#[tauri::command]
fn compress_video(app: AppHandle, id: String, source: String, opts: VideoOptions) -> Result<VideoExportResult, String> {
    let _g = video_sem().acquire();
    let (tx, rx) = std::sync::mpsc::channel::<f64>();
    let app_c = app.clone();
    let id_c = id.clone();
    // 单独线程 relay 事件到前端(避免阻塞导出线程)
    let handle = std::thread::spawn(move || {
        while let Ok(p) = rx.recv() {
            let _ = app_c.emit(VIDEO_PROGRESS_EVENT, VideoProgress { id: id_c.clone(), progress: p });
        }
    });
    let r = crate::video::export(&source, &opts, Some(tx)).map_err(|e| format!("{e:#}"));
    // tx 已被 export 内部使用,export 结束后 drop 触发 rx 关闭,relay 线程自然退出
    let _ = handle.join();
    // 最后发一次 1.0 让 UI 立即到 100%
    let _ = app.emit(VIDEO_PROGRESS_EVENT, VideoProgress { id, progress: 1.0 });
    r
}

// 未来:导出取消。目前不支持。

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            ping,
            probe_image,
            compress_image,
            compress_lottie,
            convert_document,
            probe_pandoc,
            probe_ffmpeg,
            compress_video,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
