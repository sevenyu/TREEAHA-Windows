import { useEffect, useState } from "react";
import { useStore } from "../../store";
import { probePandoc } from "../../ipc";
import type { DocumentTargetFormat } from "../../types";
import { documentChoicesFor } from "../../types";

interface Props {
  docKind: "pdf" | "word" | "richText" | "markdown";
}

const KIND_LABEL: Record<string, string> = {
  pdf: "PDF",
  word: "Word",
  richText: "富文本",
  markdown: "Markdown",
};

const TARGET_LABEL: Record<DocumentTargetFormat, string> = {
  pdf: "PDF",
  png: "PNG",
  jpeg: "JPEG",
  pptx: "PowerPoint",
  rtf: "RTF",
  html: "HTML",
  txt: "纯文本",
};

// 当前 Windows 版实际支持的目标格式(其他先隐藏,免得用户点了报错)
const IMPLEMENTED: Set<DocumentTargetFormat> = new Set(["pdf", "rtf", "html", "txt"]);

export function DocumentInspector({ docKind }: Props) {
  const opts = useStore(s => s.documentOptions);
  const setOpts = useStore(s => s.setDocumentOptions);
  const [pandoc, setPandoc] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    probePandoc().then(setPandoc).catch(() => setPandoc(null));
  }, []);

  const choices = documentChoicesFor(docKind).filter(t => IMPLEMENTED.has(t));
  const current: DocumentTargetFormat = docKind === "pdf" ? opts.pdfTargetFormat : opts.richTextTargetFormat;

  const setTarget = (t: DocumentTargetFormat) => {
    if (docKind === "pdf") setOpts({ pdfTargetFormat: t });
    else setOpts({ richTextTargetFormat: t });
  };

  return (
    <div className="inspector">
      <h3>{KIND_LABEL[docKind]} 导出设置</h3>
      <p className="sub">通过 pandoc 在文档格式之间互转</p>

      <div className="inspector-section">
        <div className="inspector-section-title">目标格式</div>
        <div className="chip-grid">
          {choices.map(t => (
            <button
              key={t}
              className={"chip" + (current === t ? " selected" : "")}
              onClick={() => setTarget(t)}
            >{TARGET_LABEL[t]}</button>
          ))}
        </div>
      </div>

      <div className="inspector-section">
        <div className="inspector-section-title">依赖</div>
        {pandoc === undefined && <p className="sub">正在检测 pandoc…</p>}
        {pandoc === null && (
          <div style={{ background: "rgba(255,176,60,0.12)", padding: 10, borderRadius: 8 }}>
            <div style={{ color: "#B45300", fontWeight: 500, marginBottom: 6 }}>
              ⚠︎ 未检测到 pandoc
            </div>
            <div style={{ fontSize: 12, color: "var(--fg-secondary)", marginBottom: 8 }}>
              文档互转依赖 pandoc(免费开源工具)。请先安装。
            </div>
            <a
              href="https://pandoc.org/installing.html"
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--brand-coral)", fontSize: 12, fontWeight: 500 }}
            >前往下载 →</a>
          </div>
        )}
        {typeof pandoc === "string" && (
          <div style={{ fontSize: 11, color: "var(--fg-secondary)" }}>
            ✓ pandoc: <code>{pandoc}</code>
          </div>
        )}
      </div>
    </div>
  );
}
