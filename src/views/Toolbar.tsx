import { useStore } from "../store";
import { runExportAll } from "../exporter";

export function Toolbar() {
  const theme = useStore(s => s.theme);
  const setTheme = useStore(s => s.setTheme);
  const items = useStore(s => s.items);
  const clearItems = useStore(s => s.clearItems);
  const isExporting = useStore(s => s.isExporting);

  const canExport = items.length > 0 && !isExporting;

  return (
    <div className="toolbar">
      <div className="toolbar-title">TREEAHA:)</div>
      <div className="toolbar-spacer" />
      <button
        className="tb-btn"
        onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        title="切换主题"
      >
        {theme === "light" ? "🌙" : "☀️"}
      </button>
      <button className="tb-btn danger" disabled={!items.length} onClick={clearItems}>
        清空
      </button>
      <button className="tb-btn primary" disabled={!canExport} onClick={runExportAll}>
        {isExporting ? "导出中…" : "开始导出"}
      </button>
    </div>
  );
}
