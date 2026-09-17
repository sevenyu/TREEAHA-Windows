import { useStore } from "../../store";

export function LottieInspector() {
  const opts = useStore(s => s.lottieOptions);
  const setOpts = useStore(s => s.setLottieOptions);

  return (
    <div className="inspector">
      <h3>Lottie 导出设置</h3>
      <p className="sub">压缩 Lottie JSON:精简元数据、截断浮点、可选剥离资源</p>

      <div className="inspector-section">
        <div className="inspector-section-title">格式</div>
        <div className="switch-row">
          <input
            id="lotMinify"
            type="checkbox"
            checked={opts.minify}
            onChange={(e) => setOpts({ minify: e.target.checked })}
          />
          <label htmlFor="lotMinify">压缩输出(去空白/换行)</label>
        </div>
      </div>

      <div className="inspector-section">
        <div className="inspector-section-title">浮点精度</div>
        <div className="slider-row">
          <label>小数位</label>
          <input
            type="range"
            min={0} max={6} step={1}
            value={opts.floatPrecision}
            onChange={(e) => setOpts({ floatPrecision: Number(e.target.value) })}
          />
          <span className="value">{opts.floatPrecision} 位</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--fg-secondary)", marginTop: 4 }}>
          常规动画用 2 位即可。0 = 全整数(仅极简 UI 动画)。
        </div>
      </div>

      <div className="inspector-section">
        <div className="inspector-section-title">剥离</div>
        <div className="switch-row">
          <input
            id="lotStripMeta"
            type="checkbox"
            checked={opts.stripMetadata}
            onChange={(e) => setOpts({ stripMetadata: e.target.checked })}
          />
          <label htmlFor="lotStripMeta">剥离 AE 元数据(nm/mn/cl/ln)</label>
        </div>
        <div className="switch-row">
          <input
            id="lotStripAssets"
            type="checkbox"
            checked={opts.stripAssets}
            onChange={(e) => setOpts({ stripAssets: e.target.checked })}
          />
          <label htmlFor="lotStripAssets">剥离嵌入资源(慎用:含图片则会丢)</label>
        </div>
      </div>
    </div>
  );
}
