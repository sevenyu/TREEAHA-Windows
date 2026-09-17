// Tauri 2 原生拖入 —— getCurrentWebviewWindow().onDragDropEvent 会给出真实的 file paths。
// HTML5 拖入的 File.path 在 Tauri 2 里不再自动填充,必须走这个。

import { useEffect } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

export type DragDropState = "enter" | "over" | "leave" | "drop";

export function useNativeDragDrop(
  onPaths: (paths: string[]) => void,
  onStateChange: (s: DragDropState) => void,
) {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const w = getCurrentWebviewWindow();
    w.onDragDropEvent((e) => {
      // e.payload.type: "enter" | "over" | "leave" | "drop"
      const p: any = e.payload;
      switch (p.type) {
        case "enter":
        case "over":
          onStateChange("over");
          break;
        case "leave":
          onStateChange("leave");
          break;
        case "drop":
          onStateChange("drop");
          if (Array.isArray(p.paths)) onPaths(p.paths as string[]);
          break;
      }
    }).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [onPaths, onStateChange]);
}
