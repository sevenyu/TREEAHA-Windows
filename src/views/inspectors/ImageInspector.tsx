import { useStore } from "../../store";
import type { ImageFormat, ResizeQuality } from "../../types";

const FORMATS: { value: ImageFormat; label: string }[] = [
  { value: "jpeg", label: "JPEG" },
  { value: "png",  label: "PNG" },
  { value: "webp", label: "WebP" },
  { value: "avif", label: "AVIF" },
  { value: "heif", label: "HEIF" },
  { value: "tiff", label: "TIFF" },
];

const QUALITIES: { value: ResizeQuality; label: string }[] = [
  { value: "high",   label: "高" },
  { value: "medium", label: "中" },
  { value: "low",    label: "低" },
];

export function ImageInspector() {
  const opts = useStore(s => s.imageOptions);
  const setOpts = useStore(s => s.setImageOptions);

  return (
    <div className="inspector">
      <h3>图片 导出设置</h3>
      <p className="sub">批量重编码、缩放,可去除元数据</p>

      <div className="inspector-section">
        <div className="inspector-section-title">输出格式</div>
        <div className="chip-grid">
          {FORMATS.map(f => (
            <button
              key={f.value}
              className={"chip" + (opts.format === f.value ? " selected" : "")}
              onClick={() => setOpts({ format: f.value })}
            >{f.label}</button>
          ))}
        </div>
      </div>

      <div className="inspector-section">
        <div className="inspector-section-title">质量</div>
        <div className="slider-row">
          <label>质量</label>
          <input
            type="range"
            min={10} max={100} step={5}
            value={Math.round(opts.quality * 100)}
            onChange={(e) => setOpts({ quality: Number(e.target.value) / 100 })}
          />
          <span className="value">{Math.round(opts.quality * 100)}%</span>
        </div>
      </div>

      <div className="inspector-section">
        <div className="inspector-section-title">尺寸</div>
        <div className="switch-row">
          <input
            id="limitDim"
            type="checkbox"
            checked={opts.limitDimension}
            onChange={(e) => setOpts({ limitDimension: e.target.checked })}
          />
          <label htmlFor="limitDim">限制最长边</label>
        </div>
        {opts.limitDimension && (
          <>
            <div className="slider-row">
              <label>最长边</label>
              <input
                type="range"
                min={200} max={4096} step={100}
                value={opts.maxPixelSize}
                onChange={(e) => setOpts({ maxPixelSize: Number(e.target.value) })}
              />
              <span className="value">{opts.maxPixelSize} px</span>
            </div>
            <div className="chip-grid" style={{ marginTop: 6 }}>
              {QUALITIES.map(q => (
                <button
                  key={q.value}
                  className={"chip" + (opts.resizeQuality === q.value ? " selected" : "")}
                  onClick={() => setOpts({ resizeQuality: q.value })}
                >{q.label}</button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="inspector-section">
        <div className="inspector-section-title">元数据</div>
        <div className="switch-row">
          <input
            id="stripMeta"
            type="checkbox"
            checked={opts.stripMetadata}
            onChange={(e) => setOpts({ stripMetadata: e.target.checked })}
          />
          <label htmlFor="stripMeta">导出时去除 EXIF/元数据</label>
        </div>
      </div>
    </div>
  );
}
