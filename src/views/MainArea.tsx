import { useCallback, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { stat } from "@tauri-apps/plugin-fs";
import { useStore } from "../store";
import { classify, nameOf } from "../classifier";
import type { WorkItem } from "../types";
import { GridView } from "./GridView";
import { probeAsync } from "../exporter";
import { useNativeDragDrop } from "../useNativeDragDrop";

export function MainArea() {
  const items = useStore(s => s.items);
  const addItems = useStore(s => s.addItems);
  const setRejection = useStore(s => s.setRejection);
  const [dragOver, setDragOver] = useState(false);

  const ingest = useCallback(async (paths: string[]) => {
    const rejected: string[] = [];
    const next: WorkItem[] = [];
    for (const p of paths) {
      const c = classify(p);
      if (!c.ok) {
        rejected.push(`${nameOf(p)} — ${c.reason}`);
        continue;
      }
      let size = 0;
      try {
        const s = await stat(p);
        size = s.size ?? 0;
      } catch { /* 忽略,后端会报 */ }
      next.push({
        id: crypto.randomUUID(),
        path: p,
        displayName: nameOf(p),
        kind: c.kind,
        originalBytes: size,
        status: { kind: "pending" },
      });
    }
    if (next.length) {
      addItems(next);
      for (const it of next) {
        void probeAsync(it.id, it.path, it.kind);
      }
    }
    if (rejected.length) setRejection(rejected.join("\n"));
  }, [addItems, setRejection]);

  // 原生 Tauri 拖入 —— 覆盖整个 window,任何位置都能接
  useNativeDragDrop(
    (paths) => { void ingest(paths); },
    (s) => setDragOver(s === "over"),
  );

  const openFilePicker = useCallback(async () => {
    const picked = await openDialog({ multiple: true, directory: false });
    if (!picked) return;
    const paths = Array.isArray(picked) ? picked : [picked];
    await ingest(paths);
  }, [ingest]);

  if (items.length === 0) {
    return (
      <div className="main-area">
        <div className={"empty-hero" + (dragOver ? " drag-active" : "")}>
          <h2>拖入文件到这里</h2>
          <p>支持图片、视频、Lottie JSON、PDF、Word、Markdown、富文本</p>
          <button className="cta" onClick={openFilePicker}>选择文件</button>
        </div>
      </div>
    );
  }

  return (
    <div className="main-area">
      <GridView />
    </div>
  );
}
