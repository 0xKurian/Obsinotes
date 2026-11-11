export const NOTE_PAGES_VIEW_TYPE = "notepages-view";
export const NOTE_PAGES_EXTENSION = "gnote";
export const NOTE_PAGES_FRONTMATTER_KEY = "notepages-plugin";
export const CURRENT_SCHEMA_VERSION = 1;

export type PageSizePreset = "A4" | "A3" | "A5" | "B5" | "Letter" | "16:9" | "Square" | "Custom";
export type PageOrientation = "portrait" | "landscape";
export type ToolbarPlacement = "top" | "bottom" | "left" | "right" | "floating";

export interface ToolbarLayoutConfig {
  scale: number;
  maxWidth: number | null;
  wrap: boolean;
  showTitle: boolean;
  showZoomControls: boolean;
}
export type ToolType = "select" | "pen" | "pressure" | "fountain" | "highlighter" | "eraser" | "lasso" | "shape" | "connector" | "sticky" | "text" | "image";
export type EraserMode = "stroke" | "precision";
export type SelectionSubMode = "lasso" | "pan";
export type PaperTemplateType = "blank" | "ruled" | "grid" | "dotted" | "cornell";

export interface PageDimensions {
  width: number;
  height: number;
  unit: "pt";
}

export const PAGE_DIMENSION_PRESETS: Record<Exclude<PageSizePreset, "Custom">, PageDimensions> = {
  A4: {
    width: 595.28,
    height: 841.89,
    unit: "pt"
  },
  A3: {
    width: 841.89,
    height: 1190.55,
    unit: "pt"
  },
  A5: {
    width: 419.53,
    height: 595.28,
    unit: "pt"
  },
  B5: {
    width: 498.9,
    height: 708.66,
    unit: "pt"
  },
  Letter: {
    width: 612.0,
    height: 792.0,
    unit: "pt"
  },
  "16:9": {
    width: 960.0,
    height: 540.0,
    unit: "pt"
  },
  Square: {
    width: 700.0,
    height: 700.0,
    unit: "pt"
  }
};

export interface PointSample {
  x: number;
  y: number;
  pressure: number;
  timestamp: number;
  tiltX?: number;
  tiltY?: number;
}

export interface StrokeBoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type CanvasElementType = "stroke" | "shape" | "text" | "image";

export interface BaseCanvasElement {
  id: string;
  elementType: CanvasElementType;
  bounds: StrokeBoundingBox;
  zIndex?: number;
  rotation?: number;
}

export interface StrokeObject {
  id: string;
  elementType?: "stroke";
  tool: ToolType;
  color: string;
  width: number;
  opacity: number;
  points: PointSample[];
  bounds: StrokeBoundingBox;
  createdAt: number;
  zIndex?: number;
  rotation?: number;
}

export type ShapeType =
  | "line"
  | "circle"
  | "ellipse"
  | "rectangle"
  | "rounded-rectangle"
  | "triangle"
  | "diamond"
  | "arrow"
  | "star"
  | "callout";

export interface ShapeObject {
  id: string;
  elementType?: "shape";
  type: ShapeType;
  color: string;
  strokeWidth: number;
  fillColor?: string;
  bounds: StrokeBoundingBox;
  geometryData: Record<string, number>;
  zIndex?: number;
  rotation?: number;
}

export interface TextObject {
  id: string;
  elementType?: "text";
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  color: string;
  textAlign: "left" | "center" | "right";
  bounds?: StrokeBoundingBox;
  zIndex?: number;
  rotation?: number;
  italic?: boolean;
  underline?: boolean;
  backgroundColor?: string;
  isSticky?: boolean;
}

export interface ImageObject {
  id: string;
  elementType?: "image";
  assetId: string;
  vaultPath: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  bounds?: StrokeBoundingBox;
  zIndex?: number;
  opacity?: number;
}

export type CanvasElement = StrokeObject | ShapeObject | TextObject | ImageObject;

export type SelectionHandle =
  | "nw"
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w"
  | "rotate";

export interface CornellConfig {
  headerHeight: number;
  cueWidthPercent: number;
  summaryHeight: number;
}

export interface PaperTemplateConfig {
  type: PaperTemplateType;
  backgroundColor: string;
  lineColor: string;
  spacing: number;
  opacity: number;
  cornell?: CornellConfig;
}

export function getEffectivePageDimensions(
  preset: PageSizePreset,
  orientation: PageOrientation,
  customDimensions?: PageDimensions
): PageDimensions {
  if (preset === "Custom" && customDimensions) {
    const w = customDimensions.width;
    const h = customDimensions.height;
    return {
      width: orientation === "landscape" ? Math.max(w, h) : Math.min(w, h),
      height: orientation === "landscape" ? Math.min(w, h) : Math.max(w, h),
      unit: "pt"
    };
  }

  const base = PAGE_DIMENSION_PRESETS[preset === "Letter" ? "Letter" : "A4"];
  const minDim = Math.min(base.width, base.height);
  const maxDim = Math.max(base.width, base.height);

  return {
    width: orientation === "landscape" ? maxDim : minDim,
    height: orientation === "landscape" ? minDim : maxDim,
    unit: "pt"
  };
}

export interface PageData {
  id: string;
  pageNumber: number;
  dimensions: PageDimensions;
  orientation: PageOrientation;
  template: PaperTemplateConfig;
  pdfSource?: {
    pdfPath: string;
    pageIndex: number;
    svgPath?: string;
  };
  strokes: StrokeObject[];
  shapes: ShapeObject[];
  texts: TextObject[];
  images: ImageObject[];
}

export interface NotebookMetadata {
  title: string;
  createdAt: number;
  updatedAt: number;
  schemaVersion: number;
  defaultPageSize: PageSizePreset;
  defaultOrientation: PageOrientation;
  defaultTemplate?: PaperTemplateType;
  defaultPaperBackground?: string;
  defaultLineColor?: string;
  defaultLineSpacing?: number;
}

export interface NotebookDocument {
  metadata: NotebookMetadata;
  pages: PageData[];
  [key: string]: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export type DeserializationResult =
  | { success: true; document: NotebookDocument }
  | { success: false; error: string; rawPayload?: string; isCorrupted: boolean };

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface EmergencyBackupInfo {
  backupPath: string;
  timestamp: number;
  originalPath: string;
}

