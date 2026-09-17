import { useStore } from "../store";

export function RejectionBanner() {
  const msg = useStore(s => s.lastRejection);
  const setRejection = useStore(s => s.setRejection);
  if (!msg) return null;
  return (
    <div className="rejection-banner">
      <span>⚠️</span>
      <div style={{ whiteSpace: "pre-line", flex: 1 }}>{msg}</div>
      <button className="close" onClick={() => setRejection(undefined)}>×</button>
    </div>
  );
}
