import { create } from "zustand";
import type {
  WorkItem, ImageOptions, DocumentOptions, VideoOptions, LottieOptions,
  Theme, SelectionKind, TaskStatus,
} from "./types";

// 默认值(与 Mac 版一致)
const defaultImageOptions: ImageOptions = {
  format: "jpeg",
  quality: 0.85,
  limitDimension: false,
  maxPixelSize: 1600,
  resizeQuality: "high",
  stripMetadata: true,
};

const defaultDocumentOptions: DocumentOptions = {
  pdfTargetFormat: "pdf",
  pdfPreset: "recommended",
  useManual: false,
  manualQuality: 0.70,
  manualMaxPixel: 1600,
  richTextTargetFormat: "pdf",
  pptxMode: "fast",
};

const defaultVideoOptions: VideoOptions = {
  codec: "hevc",
  container: "mp4",
  preset: "recommended",
  audioBitrate: 128_000,
};

const defaultLottieOptions: LottieOptions = {
  minify: true,
  floatPrecision: 2,
  stripAssets: false,
  stripMetadata: true,
};

interface Store {
  // —— data ——
  items: WorkItem[];
  selectedIds: Set<string>;

  // —— options ——
  imageOptions: ImageOptions;
  documentOptions: DocumentOptions;
  videoOptions: VideoOptions;
  lottieOptions: LottieOptions;

  // —— app state ——
  theme: Theme;
  isExporting: boolean;
  lastError?: string;
  lastRejection?: string;

  // —— actions ——
  addItems(items: WorkItem[]): void;
  removeItem(id: string): void;
  removeSelected(): void;
  clearItems(): void;
  toggleSelection(id: string, extend: boolean): void;
  clearSelection(): void;
  updateItemStatus(id: string, status: TaskStatus): void;
  updateItem(id: string, patch: Partial<WorkItem>): void;

  setImageOptions(patch: Partial<ImageOptions>): void;
  setDocumentOptions(patch: Partial<DocumentOptions>): void;
  setVideoOptions(patch: Partial<VideoOptions>): void;
  setLottieOptions(patch: Partial<LottieOptions>): void;

  setTheme(t: Theme): void;
  setError(msg?: string): void;
  setRejection(msg?: string): void;
  setExporting(v: boolean): void;

  // —— derived ——
  selectionKind(): SelectionKind;
  pendingCount(): number;
  doneCount(): number;
}

function inferKind(items: WorkItem[]): SelectionKind {
  if (items.length === 0) return { kind: "empty" };
  const hasImage = items.some(i => i.kind === "image");
  const hasVideo = items.some(i => i.kind === "video");
  const hasLottie = items.some(i => i.kind === "lottie");
  const docKinds = new Set(items.filter(i =>
    i.kind === "pdf" || i.kind === "word" || i.kind === "richText" || i.kind === "markdown"
  ).map(i => i.kind as "pdf" | "word" | "richText" | "markdown"));

  let cats = 0;
  if (hasImage) cats++;
  if (hasVideo) cats++;
  if (hasLottie) cats++;
  if (docKinds.size > 0) cats++;
  if (cats > 1) return { kind: "mixed" };

  if (hasImage) return { kind: "image" };
  if (hasVideo) return { kind: "video" };
  if (hasLottie) return { kind: "lottie" };
  if (docKinds.size === 1) return { kind: "document", docKind: [...docKinds][0] };
  return { kind: "mixed" };
}

export const useStore = create<Store>((set, get) => ({
  items: [],
  selectedIds: new Set(),

  imageOptions: defaultImageOptions,
  documentOptions: defaultDocumentOptions,
  videoOptions: defaultVideoOptions,
  lottieOptions: defaultLottieOptions,

  theme: "light",
  isExporting: false,

  addItems: (items) => set(s => ({
    items: [...s.items, ...items.filter(n => !s.items.some(e => e.path === n.path))],
  })),
  removeItem: (id) => set(s => {
    const next = new Set(s.selectedIds); next.delete(id);
    return { items: s.items.filter(i => i.id !== id), selectedIds: next };
  }),
  removeSelected: () => set(s => {
    if (s.selectedIds.size === 0) return {};
    return {
      items: s.items.filter(i => !s.selectedIds.has(i.id)),
      selectedIds: new Set(),
    };
  }),
  clearItems: () => set({ items: [], selectedIds: new Set() }),

  toggleSelection: (id, extend) => set(s => {
    if (extend) {
      const next = new Set(s.selectedIds);
      next.has(id) ? next.delete(id) : next.add(id);
      return { selectedIds: next };
    }
    return { selectedIds: new Set([id]) };
  }),
  clearSelection: () => set({ selectedIds: new Set() }),

  updateItemStatus: (id, status) => set(s => ({
    items: s.items.map(i => i.id === id ? { ...i, status } : i),
  })),
  updateItem: (id, patch) => set(s => ({
    items: s.items.map(i => i.id === id ? { ...i, ...patch } : i),
  })),

  setImageOptions: (patch) => set(s => ({ imageOptions: { ...s.imageOptions, ...patch } })),
  setDocumentOptions: (patch) => set(s => ({ documentOptions: { ...s.documentOptions, ...patch } })),
  setVideoOptions: (patch) => set(s => ({ videoOptions: { ...s.videoOptions, ...patch } })),
  setLottieOptions: (patch) => set(s => ({ lottieOptions: { ...s.lottieOptions, ...patch } })),

  setTheme: (theme) => set({ theme }),
  setError: (lastError) => set({ lastError }),
  setRejection: (lastRejection) => set({ lastRejection }),
  setExporting: (isExporting) => set({ isExporting }),

  // 注意:selectionKind 会返回新对象,不适合放 store 里让组件订阅 —— 组件里 useMemo 现算即可。
  // 保留是为了非组件场景可用。
  selectionKind: () => {
    const s = get();
    const selected = s.items.filter(i => s.selectedIds.has(i.id));
    return inferKind(selected.length ? selected : s.items);
  },
  pendingCount: () => get().items.filter(i =>
    i.status.kind !== "done" && i.status.kind !== "failed").length,
  doneCount: () => get().items.filter(i => i.status.kind === "done").length,
}));
