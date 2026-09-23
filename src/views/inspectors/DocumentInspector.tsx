import { useEffect, useState } from "react";
import { useStore } from "../../store";
import { probePandoc, probePdfium } from "../../ipc";
import type { DocumentTargetFormat, PDFCompressionPreset } from "../../types";
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
  pdf: "压缩 PDF",
  png: "PNG",
  jpeg: "JPEG",
  pptx: "PowerPoint",
  rtf: "RTF",
  html: "HTML",
  txt: "纯文本",
};

// 当前 Windows 版实际支持的目标格式
// - PDF 源:pdf(压缩)、rtf、html、txt(后三个走 pandoc,pdf 走 pdfium)
// - 其他:rtf、html、txt、pdf(全走 pandoc)
const IMPLEMENTED: Set<DocumentTargetFormat> = new Set(["pdf", "rtf", "html", "txt"]);

const PDF_PRESETS: { value: PDFCompressionPreset; label: string; desc: string }[] = [
  { value: "light",       label: "轻度",  desc: "保留原图尺寸 · 体积略减" },
  { value: "recommended", label: "推荐",  desc: "1600 px · 体积明显减少" },
  { value: "deep",        label: "深度",  desc: "1200 px · 最小体积" },
];

export function DocumentInspector({ docKind }: Props) {
  const opts = useStore(s => s.documentOptions);
  const setOpts = useStore(s => s.setDocumentOptions);
  const [pandoc, setPandoc] = useState<string | null | undefined>(undefined);
  const [pdfium, setPdfium] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    probePandoc().then(setPandoc).catch(() => setPandoc(null));
    probePdfium().then(setPdfium).catch(() => setPdfium(false));
  }, []);

  const choices = documentChoicesFor(docKind).filter(t => IMPLEMENTED.has(t));
  const current: DocumentTargetFormat = docKind === "pdf" ? opts.pdfTargetFormat : opts.richTextTargetFormat;

  const setTarget = (t: DocumentTargetFormat) => {
    if (docKind === "pdf") setOpts({ pdfTargetFormat: t });
    else setOpts({ richTextTargetFormat: t });
  };

  const showPdfCompression = docKind === "pdf" && current === "pdf";
  const showPandocSection = !(docKind === "pdf" && current === "pdf");

  return (
    <div className="inspector">
      <h3>{KIND_LABEL[docKind]} 导出设置</h3>
      <p className="sub">
        {docKind === "pdf" ? "PDF 可重压缩或转成其他文档" : "通过 pandoc 在文档格式之间互转"}
      </p>

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

      {showPdfCompression && (
        <>
          <div className="inspector-section">
            <div className="inspector-section-title">压缩预设</div>
            <div className="chip-grid">
              {PDF_PRESETS.map(p => (
                <button
                  key={p.value}
                  className={"chip" + (opts.pdfPreset === p.value && !opts.useManual ? " selected" : "")}
                  onClick={() => setOpts({ pdfPreset: p.value, useManual: false })}
                >{p.label}</button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "var(--fg-secondary)", marginTop: 6 }}>
              {PDF_PRESETS.find(p => p.value === opts.pdfPreset)?.desc}
            </div>
          </div>

          <div className="inspector-section">
            <div className="inspector-section-title">手动调节</div>
            <div className="switch-row">
              <input
                id="pdfManual"
                type="checkbox"
                checked={opts.useManual}
                onChange={(e) => setOpts({ useManual: e.target.checked })}
              />
              <label htmlFor="pdfManual">覆盖预设</label>
            </div>
            {opts.useManual && (
              <>
                <div className="slider-row">
                  <label>质量</label>
                  <input
                    type="range"
                    min={10} max={100} step={5}
                    value={Math.round(opts.manualQuality * 100)}
                    onChange={(e) => setOpts({ manualQuality: Number(e.target.value) / 100 })}
                  />
                  <span className="value">{Math.round(opts.manualQuality * 100)}%</span>
                </div>
                <div className="slider-row">
                  <label>最长边</label>
                  <input
                    type="range"
                    min={600} max={4096} step={100}
                    value={opts.manualMaxPixel}
                    onChange={(e) => setOpts({ manualMaxPixel: Number(e.target.value) })}
                  />
                  <span className="value">{opts.manualMaxPixel} px</span>
                </div>
              </>
            )}
          </div>

          <div className="inspector-section">
            <div className="inspector-section-title">依赖</div>
            {pdfium === undefined && <p className="sub">正在检测 PDFium…</p>}
            {pdfium === false && (
              <div style={{ background: "rgba(255,176,60,0.12)", padding: 10, borderRadius: 8 }}>
                <div style={{ color: "#B45300", fontWeight: 500, marginBottom: 6 }}>
                  ⚠︎ 未检测到 PDFium 动态库
                </div>
                <div style={{ fontSize: 12, color: "var(--fg-secondary)", marginBottom: 8 }}>
                  PDF 压缩依赖 PDFium(免费,Google 开源)。macOS 可用 <code>brew install pdfium</code>;
                  Windows 请下载 pdfium.dll 放到 TREEAHA.exe 同目录。
                </div>
                <a
                  href="https://github.com/bblanchon/pdfium-binaries/releases"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--brand-coral)", fontSize: 12, fontWeight: 500 }}
                >前往下载 →</a>
              </div>
            )}
            {pdfium === true && (
              <div style={{ fontSize: 11, color: "var(--fg-secondary)" }}>✓ PDFium 已就绪</div>
            )}
          </div>
        </>
      )}

      {showPandocSection && (
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
      )}
    </div>
  );
}
