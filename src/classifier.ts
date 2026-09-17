// 移植自 Mac 版 FileClassifier.swift 的核心分类逻辑。
// Windows 版没有 UTType 系统,靠扩展名 + 一次读文件头判断 Lottie。
// 只做同步扩展名判断的部分;Lottie 深度检测(读 JSON schema)由 Rust 端做。

import type { ItemKind } from "./types";

type Classification =
  | { ok: true; kind: ItemKind }
  | { ok: false; reason: string };

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "heic", "heif", "gif", "bmp", "tiff", "tif", "avif"]);
const VIDEO_READABLE = new Set(["mp4", "mov", "m4v", "qt", "3gp", "3g2"]);
const VIDEO_UNREADABLE = new Set(["mkv", "webm", "avi", "flv", "wmv", "asf", "vob", "ogv", "rm", "rmvb"]);
const MARKDOWN_EXTS = new Set(["md", "markdown"]);
const RICHTEXT_EXTS = new Set(["rtf", "rtfd", "html", "htm", "txt"]);

export function classify(path: string): Classification {
  const ext = extOf(path).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return { ok: true, kind: "image" };
  if (VIDEO_UNREADABLE.has(ext)) return { ok: false, reason: `${ext.toUpperCase()} 容器无法读取。请先转成 MP4/MOV。` };
  if (VIDEO_READABLE.has(ext)) return { ok: true, kind: "video" };
  if (ext === "pdf") return { ok: true, kind: "pdf" };
  if (ext === "doc" || ext === "docx") return { ok: true, kind: "word" };
  if (MARKDOWN_EXTS.has(ext)) return { ok: true, kind: "markdown" };
  if (RICHTEXT_EXTS.has(ext)) return { ok: true, kind: "richText" };
  if (ext === "json") return { ok: true, kind: "lottie" }; // 后续 Rust 端确认是否合法 Lottie
  if (ext === "ppt" || ext === "pptx") {
    return { ok: false, reason: "PPT/Keynote 无法直接处理,请先导出为 PDF。" };
  }
  if (ext === "xls" || ext === "xlsx") {
    return { ok: false, reason: "Excel/Numbers 无法直接处理,请先导出为 PDF。" };
  }
  return { ok: false, reason: `不支持的文件类型:.${ext}` };
}

export function extOf(path: string): string {
  const idx = path.lastIndexOf(".");
  return idx >= 0 ? path.slice(idx + 1) : "";
}

export function nameOf(path: string): string {
  const s = path.replace(/\\/g, "/");
  const idx = s.lastIndexOf("/");
  return idx >= 0 ? s.slice(idx + 1) : s;
}
