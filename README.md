# TREEAHA-Windows

TREEAHA 的跨平台重写(Tauri 2 + React + TypeScript),目标是 Windows。也能在 Mac/Linux 上跑,便于开发。

Mac 版仍在 `~/Developer/TREEAHA`,与此工程并行,互不影响。

## 现状

**Day 1 完成**:
- Tauri 工程骨架(pnpm + Vite + React 19 + TS)
- 基础 UI 布局:标题栏、拖入/网格、右侧 Inspector、拒绝提示条
- 状态管理:Zustand,对齐 Mac 版 `ConversionStore` 结构
- 文件分类器:`classifier.ts`,支持图片/视频/Lottie/PDF/Word/Markdown/富文本
- 图片 Inspector:输出格式、质量、尺寸、元数据开关(UI 已成型,后端未接)
- 主题切换(light/dark,已通过 `[data-theme]` 支持)

**未接后端**(占位):
- 图片压缩:UI 有,`invoke` 未调
- PDF/PPTX、视频、Lottie、富文本互转

## 目录结构

```
src/                    # 前端
  types.ts              # 与 Mac 版对齐的数据模型
  store.ts              # Zustand 全局 store
  classifier.ts         # 文件分类
  global.css            # 主题变量、reset
  App.tsx / App.css
  views/
    Toolbar.tsx
    MainArea.tsx        # 拖入区 / 网格
    GridView.tsx        # 卡片
    Inspector.tsx       # 右侧路由
    RejectionBanner.tsx
    inspectors/
      ImageInspector.tsx

src-tauri/              # Rust 后端
  src/
    lib.rs              # 入口 + IPC 命令(目前只有 ping)
  Cargo.toml
  tauri.conf.json       # 窗口配置
  capabilities/
    default.json        # 授予 fs/dialog 权限
```

## 开发

前置:Rust stable + pnpm。

```bash
cd ~/Developer/TREEAHA-Windows
pnpm install
pnpm tauri dev          # 开发模式(热重载)
pnpm tauri build        # 打包
```

## 下一步

1. **图片压缩后端**:Rust 端用 `image` + `mozjpeg` + `oxipng` + `libwebp` 实现,前端 `invoke("compress_image")`
2. **原生文件拖入**:接 Tauri 2 的 `webview.on_drag_drop_event`,替换 HTML5 拖入(那个拿不到真实路径)
3. **PDF 处理**:引入 `pdfium-render` crate,PDF→PPTX 分两条(纯图片相册 / LibreOffice 走 shell)
4. **搞台 Windows 机器或 VM 做真实测试**
