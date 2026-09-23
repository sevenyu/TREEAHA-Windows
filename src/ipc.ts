// Rust ↔ 前端 IPC 封装。
// 每个 invoke 名字必须与 lib.rs 的 #[tauri::command] 函数名一致。

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ImageOptions, LottieOptions, DocumentTargetFormat, VideoOptions } from "./types";

export interface RustProbeResult {
  width: number;
  height: number;
  thumbnailDataUrl: string;
}
export interface RustExportResult {
  outputPath: string;
  outputBytes: number;
}

// —— 图片 ——
export async function probeImage(path: string): Promise<RustProbeResult> {
  return invoke("probe_image", { path });
}
export async function compressImage(source: string, opts: ImageOptions): Promise<RustExportResult> {
  return invoke("compress_image", { source, opts });
}

// —— Lottie ——
export async function compressLottie(source: string, opts: LottieOptions): Promise<RustExportResult> {
  return invoke("compress_lottie", { source, opts });
}

// —— 文档 ——
export interface DocInvokeOptions {
  sourceKind: "pdf" | "word" | "richText" | "markdown";
  target: DocumentTargetFormat;
  outputDirectory?: string;
}
export async function convertDocument(source: string, opts: DocInvokeOptions): Promise<RustExportResult> {
  return invoke("convert_document", { source, opts });
}
export async function probePandoc(): Promise<string | null> {
  return invoke("probe_pandoc");
}
export async function probePdfium(): Promise<boolean> {
  return invoke("probe_pdfium");
}

// —— PDF 压缩 ——
export type PdfPreset = "light" | "recommended" | "deep";
export interface PdfCompressInvokeOptions {
  preset: PdfPreset;
  manualQuality?: number;
  manualMaxPixel?: number;
  outputDirectory?: string;
}
export async function compressPdf(source: string, opts: PdfCompressInvokeOptions): Promise<RustExportResult> {
  return invoke("compress_pdf", { source, opts });
}

// —— 视频 ——
export async function probeFfmpeg(): Promise<string | null> {
  return invoke("probe_ffmpeg");
}
export async function compressVideo(id: string, source: string, opts: VideoOptions): Promise<RustExportResult> {
  return invoke("compress_video", { id, source, opts });
}
/// 订阅视频进度事件。返回取消函数。
export function subscribeVideoProgress(handler: (id: string, progress: number) => void): () => void {
  let unlisten: (() => void) | undefined;
  listen<{ id: string; progress: number }>("video-progress", e => {
    handler(e.payload.id, e.payload.progress);
  }).then(fn => { unlisten = fn; });
  return () => { unlisten?.(); };
}

// —— 心跳 ——
export async function ping(): Promise<string> {
  return invoke("ping");
}
