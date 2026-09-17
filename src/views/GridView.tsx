import { useStore } from "../store";
import type { WorkItem } from "../types";

export function GridView() {
  const items = useStore(s => s.items);
  const selectedIds = useStore(s => s.selectedIds);
  const toggleSelection = useStore(s => s.toggleSelection);
  const removeItem = useStore(s => s.removeItem);

  return (
    <div className="grid-wrap">
      <div className="grid">
        {items.map(it => (
          <Card
            key={it.id}
            item={it}
            selected={selectedIds.has(it.id)}
            onClick={(e) => toggleSelection(it.id, e.metaKey || e.ctrlKey || e.shiftKey)}
            onRemove={() => removeItem(it.id)}
          />
        ))}
      </div>
    </div>
  );
}

function Card({ item, selected, onClick, onRemove }: {
  item: WorkItem;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onRemove: () => void;
}) {
  const kindBadge = kindBadgeFor(item);
  return (
    <div className={"card" + (selected ? " selected" : "")} onClick={onClick}>
      <div className="card-thumb">
        {item.thumbnailDataUrl
          ? <img src={item.thumbnailDataUrl} alt="" />
          : <span className="placeholder">{iconForKind(item)}</span>
        }
      </div>
      <div className="card-badge">{kindBadge}</div>
      <button
        className="card-remove"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        title="移除"
      >×</button>
      <div className="card-footer">
        <div className="card-name">{item.displayName}</div>
        <div className="card-sub">
          <span>{humanBytes(item.originalBytes)}</span>
          {item.pixelSize && <span>{item.pixelSize.width}×{item.pixelSize.height}</span>}
          {item.pageCount != null && <span>{item.pageCount} 页</span>}
        </div>
      </div>
      {renderStatus(item)}
    </div>
  );
}

function renderStatus(item: WorkItem) {
  switch (item.status.kind) {
    case "processing":
      return <div className="card-status">{Math.round(item.status.progress * 100)}%</div>;
    case "failed":
      return <div className="card-status" title={item.status.message}>失败</div>;
    case "done": {
      const savings = item.originalBytes > 0
        ? 1 - item.status.outputBytes / item.originalBytes
        : 0;
      const label = savings > 0.005
        ? `-${Math.round(savings * 100)}%`
        : humanBytes(item.status.outputBytes);
      return (
        <div className="card-status" style={{ background: "rgba(30,140,60,0.55)" }}>
          ✓ {label}
        </div>
      );
    }
    default: return null;
  }
}

function kindBadgeFor(item: WorkItem): string {
  switch (item.kind) {
    case "image": return "IMG";
    case "video": return "MP4";
    case "lottie": return "JSON";
    case "pdf": return "PDF";
    case "word": return "DOC";
    case "markdown": return "MD";
    case "richText": return "TXT";
  }
}

function iconForKind(item: WorkItem): string {
  switch (item.kind) {
    case "image": return "🖼";
    case "video": return "🎬";
    case "lottie": return "✨";
    case "pdf": return "📄";
    case "word": return "📝";
    case "markdown": return "📑";
    case "richText": return "📃";
  }
}

function humanBytes(n: number): string {
  if (n <= 0) return "—";
  const u = ["B", "KB", "MB", "GB"];
  let v = n, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${u[i]}`;
}
