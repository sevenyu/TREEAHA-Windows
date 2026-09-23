import { useEffect } from "react";
import { useStore } from "./store";
import { Toolbar } from "./views/Toolbar";
import { MainArea } from "./views/MainArea";
import { Inspector } from "./views/Inspector";
import { RejectionBanner } from "./views/RejectionBanner";
import { ensureVideoProgressSubscribed } from "./exporter";
import "./global.css";
import "./App.css";

export default function App() {
  const theme = useStore(s => s.theme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    ensureVideoProgressSubscribed();
  }, []);

  // 全局 Delete/Backspace:删除当前选中项。若焦点在输入框,跳过让它正常编辑。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      const { selectedIds, removeSelected } = useStore.getState();
      if (selectedIds.size > 0) {
        e.preventDefault();
        removeSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app-root">
      <Toolbar />
      <RejectionBanner />
      <div className="app-body">
        <MainArea />
        <Inspector />
      </div>
    </div>
  );
}
