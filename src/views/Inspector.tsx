import { useMemo } from "react";
import { useStore } from "../store";
import { ImageInspector } from "./inspectors/ImageInspector";
import { LottieInspector } from "./inspectors/LottieInspector";
import { DocumentInspector } from "./inspectors/DocumentInspector";
import { VideoInspector } from "./inspectors/VideoInspector";
import type { WorkItem, SelectionKind } from "../types";

function inferKind(items: WorkItem[]): SelectionKind {
  if (items.length === 0) return { kind: "empty" };
  const hasImage = items.some(i => i.kind === "image");
  const hasVideo = items.some(i => i.kind === "video");
  const hasLottie = items.some(i => i.kind === "lottie");
  const docKinds = new Set(items.filter(i =>
    i.kind === "pdf" || i.kind === "word" || i.kind === "richText" || i.kind === "markdown"
  ).map(i => i.kind as "pdf" | "word" | "richText" | "markdown"));

  let cats = 0;
  if (hasImage) cats++;
  if (hasVideo) cats++;
  if (hasLottie) cats++;
  if (docKinds.size > 0) cats++;
  if (cats > 1) return { kind: "mixed" };

  if (hasImage) return { kind: "image" };
  if (hasVideo) return { kind: "video" };
  if (hasLottie) return { kind: "lottie" };
  if (docKinds.size === 1) return { kind: "document", docKind: [...docKinds][0] };
  return { kind: "mixed" };
}

export function Inspector() {
  // 选原始数组;派生用 useMemo 算,避免 store 里 return 新对象触发 shallow 不等的死循环
  const items = useStore(s => s.items);
  const selectedIds = useStore(s => s.selectedIds);
  const kind = useMemo(() => {
    const selected = items.filter(i => selectedIds.has(i.id));
    return inferKind(selected.length ? selected : items);
  }, [items, selectedIds]);

  if (kind.kind === "empty") {
    return (
      <div className="inspector">
        <h3>导出设置</h3>
        <p className="sub">拖入或选择文件后,在这里配置导出选项。</p>
      </div>
    );
  }
  if (kind.kind === "mixed") {
    return (
      <div className="inspector">
        <h3>混合类型</h3>
        <p className="sub">当前队列中包含多种类型的文件。请分类导出。</p>
      </div>
    );
  }
  if (kind.kind === "image") return <ImageInspector />;
  if (kind.kind === "video") return <VideoInspector />;
  if (kind.kind === "lottie") return <LottieInspector />;
  if (kind.kind === "document") return <DocumentInspector docKind={kind.docKind} />;
  return null;
}
