// 导出编排:根据每个 WorkItem 的 kind 分派到对应 Rust 命令。
// 目前只接了 image;其他类型走占位,标记为 failed。

import { useStore } from "./store";
import { compressImage, compressLottie, convertDocument, compressVideo, compressPdf, probeImage, subscribeVideoProgress } from "./ipc";
import type { WorkItem, DocumentTargetFormat } from "./types";

// 全局订阅视频进度事件(App 启动时 App.tsx 里 mount 一次即可)
let progressSubscribed = false;
export function ensureVideoProgressSubscribed() {
  if (progressSubscribed) return;
  progressSubscribed = true;
  subscribeVideoProgress((id, progress) => {
    const s = useStore.getState();
    const item = s.items.find(i => i.id === id);
    if (!item) return;
    if (item.status.kind === "processing") {
      s.updateItemStatus(id, { kind: "processing", progress });
    }
  });
}

export async function runExportAll() {
  const s = useStore.getState();
  if (s.items.length === 0 || s.isExporting) return;

  s.setError(undefined);
  s.setExporting(true);
  try {
    // 简单并发:并行 4 个,足以在本地跑得快同时不炸 CPU。
    const concurrency = 4;
    const queue = [...s.items];
    const workers = Array.from({ length: concurrency }, () => worker(queue));
    await Promise.all(workers);
  } finally {
    useStore.getState().setExporting(false);
  }
}

async function worker(queue: WorkItem[]) {
  while (queue.length) {
    const item = queue.shift();
    if (!item) return;
    await runOne(item);
  }
}

async function runOne(item: WorkItem) {
  const { updateItemStatus } = useStore.getState();
  updateItemStatus(item.id, { kind: "processing", progress: 0.02 });

  try {
    switch (item.kind) {
      case "image": {
        const opts = useStore.getState().imageOptions;
        const r = await compressImage(item.path, opts);
        updateItemStatus(item.id, { kind: "done", outputPath: r.outputPath, outputBytes: r.outputBytes });
        break;
      }
      case "lottie": {
        const opts = useStore.getState().lottieOptions;
        const r = await compressLottie(item.path, opts);
        updateItemStatus(item.id, { kind: "done", outputPath: r.outputPath, outputBytes: r.outputBytes });
        break;
      }
      case "pdf":
      case "word":
      case "richText":
      case "markdown": {
        const docOpts = useStore.getState().documentOptions;
        const target: DocumentTargetFormat = item.kind === "pdf"
          ? docOpts.pdfTargetFormat
          : docOpts.richTextTargetFormat;
        // PDF → 压缩 PDF 单独走 pdfium(和 Mac 版一致);其他 doc 走 pandoc
        if (item.kind === "pdf" && target === "pdf") {
          const r = await compressPdf(item.path, {
            preset: docOpts.pdfPreset,
            manualQuality: docOpts.useManual ? docOpts.manualQuality : undefined,
            manualMaxPixel: docOpts.useManual ? docOpts.manualMaxPixel : undefined,
            outputDirectory: docOpts.outputDirectory,
          });
          updateItemStatus(item.id, { kind: "done", outputPath: r.outputPath, outputBytes: r.outputBytes });
          break;
        }
        const r = await convertDocument(item.path, {
          sourceKind: item.kind,
          target,
          outputDirectory: docOpts.outputDirectory,
        });
        updateItemStatus(item.id, { kind: "done", outputPath: r.outputPath, outputBytes: r.outputBytes });
        break;
      }
      case "video": {
        const opts = useStore.getState().videoOptions;
        const r = await compressVideo(item.id, item.path, opts);
        updateItemStatus(item.id, { kind: "done", outputPath: r.outputPath, outputBytes: r.outputBytes });
        break;
      }
      default:
        updateItemStatus(item.id, { kind: "failed", message: `${item.kind} 类型暂未接入 Windows 后端` });
    }
  } catch (e: any) {
    const msg = typeof e === "string" ? e : e?.message ?? String(e);
    updateItemStatus(item.id, { kind: "failed", message: msg });
  }
}

/// 单个条目导入后异步探测(拿宽高、缩略图);失败静默(item 仍可导出)。
export async function probeAsync(itemId: string, path: string, kind: WorkItem["kind"]) {
  if (kind !== "image") return; // 其他类型暂未接
  try {
    const r = await probeImage(path);
    useStore.getState().updateItem(itemId, {
      pixelSize: { width: r.width, height: r.height },
      thumbnailDataUrl: r.thumbnailDataUrl,
    });
  } catch { /* 忽略 */ }
}
