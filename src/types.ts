// 与 Mac 版 WorkItem/ImageTask/DocumentTask/VideoTask/LottieTask 概念对齐。
// TypeScript 只保存元数据 + 状态,重活由 Rust 后端处理。

export type ItemKind = "image" | "video" | "lottie" | "pdf" | "word" | "richText" | "markdown";

export type TaskStatus =
  | { kind: "pending" }
  | { kind: "processing"; progress: number }         // 0..1
  | { kind: "done"; outputPath: string; outputBytes: number }
  | { kind: "failed"; message: string };

export interface WorkItem {
  id: string;
  path: string;
  displayName: string;
  kind: ItemKind;
  originalBytes: number;
  // 探测得到的元数据(异步填充)
  thumbnailDataUrl?: string;
  pixelSize?: { width: number; height: number };
  pageCount?: number;
  durationSec?: number;
  status: TaskStatus;
}

// —— 图片导出选项(与 Mac 版 ExportOptions 对齐) ——
export type ImageFormat = "jpeg" | "png" | "webp" | "heif" | "avif" | "tiff";
export type ResizeQuality = "high" | "medium" | "low";

export interface ImageOptions {
  format: ImageFormat;
  quality: number;             // 0.1..1.0
  limitDimension: boolean;
  maxPixelSize: number;        // px, longest edge
  resizeQuality: ResizeQuality;
  stripMetadata: boolean;
  outputDirectory?: string;
}

// —— 文档导出选项 ——
export type DocumentTargetFormat = "pdf" | "png" | "jpeg" | "pptx" | "rtf" | "html" | "txt";
export type PDFCompressionPreset = "light" | "recommended" | "deep";
export type PPTXMode = "highQuality" | "fast";

export interface DocumentOptions {
  pdfTargetFormat: DocumentTargetFormat;
  pdfPreset: PDFCompressionPreset;
  useManual: boolean;
  manualQuality: number;
  manualMaxPixel: number;
  richTextTargetFormat: DocumentTargetFormat;
  pptxMode: PPTXMode;
  outputDirectory?: string;
}

// —— 视频导出选项(简化,后续扩展) ——
export type VideoCodec = "h264" | "hevc";
export type VideoContainer = "mp4" | "mov";
export type VideoPreset = "light" | "recommended" | "deep";

export interface VideoOptions {
  codec: VideoCodec;
  container: VideoContainer;
  preset: VideoPreset;
  audioBitrate: number;        // bps
  outputDirectory?: string;
}

// —— Lottie ——
export interface LottieOptions {
  minify: boolean;
  floatPrecision: number;      // 0..4
  stripAssets: boolean;
  stripMetadata: boolean;
  outputDirectory?: string;
}

// —— 主题 ——
export type Theme = "light" | "dark";

// —— 派生 UI 分类 ——
export type SelectionKind =
  | { kind: "empty" }
  | { kind: "image" }
  | { kind: "video" }
  | { kind: "lottie" }
  | { kind: "document"; docKind: "pdf" | "word" | "richText" | "markdown" }
  | { kind: "mixed" };

// —— 图片格式 / 文档目标格式对源类型的适用性(移植自 Mac 版) ——
export function documentChoicesFor(docKind: "pdf" | "word" | "richText" | "markdown"): DocumentTargetFormat[] {
  switch (docKind) {
    case "pdf":       return ["pdf", "pptx", "png", "jpeg", "txt"];
    case "word":
    case "richText":
    case "markdown":  return ["pdf", "rtf", "html", "txt"];
  }
}
