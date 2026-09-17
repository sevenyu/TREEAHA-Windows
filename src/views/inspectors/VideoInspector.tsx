import { useEffect, useState } from "react";
import { useStore } from "../../store";
import { probeFfmpeg } from "../../ipc";
import type { VideoCodec, VideoContainer, VideoPreset } from "../../types";

const CODECS: { value: VideoCodec; label: string }[] = [
  { value: "hevc", label: "HEVC (H.265)" },
  { value: "h264", label: "H.264" },
];
const CONTAINERS: { value: VideoContainer; label: string }[] = [
  { value: "mp4", label: "MP4" },
  { value: "mov", label: "MOV" },
];
const PRESETS: { value: VideoPreset; label: string; desc: string }[] = [
  { value: "light", label: "轻度", desc: "近乎原画质,体积略减" },
  { value: "recommended", label: "推荐", desc: "肉眼几乎无损,体积明显减少" },
  { value: "deep", label: "深度", desc: "有可见压缩痕迹,体积最小" },
];

export function VideoInspector() {
  const opts = useStore(s => s.videoOptions);
  const setOpts = useStore(s => s.setVideoOptions);
  const [ffmpeg, setFfmpeg] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    probeFfmpeg().then(setFfmpeg).catch(() => setFfmpeg(null));
  }, []);

  return (
    <div className="inspector">
      <h3>视频 导出设置</h3>
      <p className="sub">通过 ffmpeg 重编码</p>

      <div className="inspector-section">
        <div className="inspector-section-title">编码器</div>
        <div className="chip-grid">
          {CODECS.map(c => (
            <button
              key={c.value}
              className={"chip" + (opts.codec === c.value ? " selected" : "")}
              onClick={() => setOpts({ codec: c.value })}
            >{c.label}</button>
          ))}
        </div>
      </div>

      <div className="inspector-section">
        <div className="inspector-section-title">容器</div>
        <div className="chip-grid">
          {CONTAINERS.map(c => (
            <button
              key={c.value}
              className={"chip" + (opts.container === c.value ? " selected" : "")}
              onClick={() => setOpts({ container: c.value })}
            >{c.label}</button>
          ))}
        </div>
      </div>

      <div className="inspector-section">
        <div className="inspector-section-title">质量预设</div>
        <div className="chip-grid">
          {PRESETS.map(p => (
            <button
              key={p.value}
              className={"chip" + (opts.preset === p.value ? " selected" : "")}
              onClick={() => setOpts({ preset: p.value })}
            >{p.label}</button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "var(--fg-secondary)", marginTop: 8 }}>
          {PRESETS.find(p => p.value === opts.preset)?.desc}
        </div>
      </div>

      <div className="inspector-section">
        <div className="inspector-section-title">音频</div>
        <div className="slider-row">
          <label>码率</label>
          <input
            type="range"
            min={64} max={320} step={32}
            value={opts.audioBitrate / 1000}
            onChange={(e) => setOpts({ audioBitrate: Number(e.target.value) * 1000 })}
          />
          <span className="value">{opts.audioBitrate / 1000} k</span>
        </div>
      </div>

      <div className="inspector-section">
        <div className="inspector-section-title">依赖</div>
        {ffmpeg === undefined && <p className="sub">正在检测 ffmpeg…</p>}
        {ffmpeg === null && (
          <div style={{ background: "rgba(255,176,60,0.12)", padding: 10, borderRadius: 8 }}>
            <div style={{ color: "#B45300", fontWeight: 500, marginBottom: 6 }}>
              ⚠︎ 未检测到 ffmpeg
            </div>
            <div style={{ fontSize: 12, color: "var(--fg-secondary)", marginBottom: 8 }}>
              视频压缩依赖 ffmpeg(免费开源工具)。请先安装。
            </div>
            <a
              href="https://www.gyan.dev/ffmpeg/builds/"
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--brand-coral)", fontSize: 12, fontWeight: 500 }}
            >Windows 下载 →</a>
          </div>
        )}
        {typeof ffmpeg === "string" && (
          <div style={{ fontSize: 11, color: "var(--fg-secondary)" }}>
            ✓ ffmpeg: <code>{ffmpeg}</code>
          </div>
        )}
      </div>
    </div>
  );
}
