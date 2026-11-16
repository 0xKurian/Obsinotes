import {
  DefaultToolPreset,
  EraserMode,
  HotkeyMap,
  PageSizePreset,
  PageOrientation,
  PaperTemplateType,
  StylusButtonAction,
  ToolbarPlacement
} from "../types";

export interface NotePagesSettings {
  defaultPageSize: PageSizePreset;
  defaultOrientation: PageOrientation;
  defaultTemplate: PaperTemplateType;
  defaultTool: DefaultToolPreset;
  defaultPenColor: string;
  defaultPenWidth: number;
  defaultHighlighterWidth: number;
  defaultEraserMode: EraserMode;
  defaultEraserRadius: number;
  shapeRecognitionEnabled: boolean;
  drawWithFinger: boolean;
  twoFingerTapUndoRedo: boolean;
  palmRejectionDelayMs: number;
  stylusButtonAction: StylusButtonAction;
  autosaveIntervalMs: number;
  defaultLineColor: string;
  defaultLineSpacing: number;
  defaultPaperBackground: string;
  feedbackUrl: string;
  toolbarScale: number;
  toolbarMaxWidth: number | null;
  toolbarWrap: boolean;
  toolbarShowTitle: boolean;
  toolbarShowZoomControls: boolean;
  toolbarDimWhileDrawing: boolean;
  toolbarPlacement: ToolbarPlacement;
  toolbarFloatingPos: { left: number; top: number } | null;
  customHotkeys: HotkeyMap;
}

export const DEFAULT_SETTINGS: NotePagesSettings = {
  defaultPageSize: "A4",
  defaultOrientation: "portrait",
  defaultTemplate: "ruled",
  defaultTool: "pressure",
  defaultPenColor: "#1e293b",
  defaultPenWidth: 2.5,
  defaultHighlighterWidth: 14,
  defaultEraserMode: "stroke",
  defaultEraserRadius: 12,
  shapeRecognitionEnabled: true,
  drawWithFinger: false,
  twoFingerTapUndoRedo: true,
  palmRejectionDelayMs: 350,
  stylusButtonAction: "hold",
  autosaveIntervalMs: 1000,
  defaultLineColor: "#94a3b8",
  defaultLineSpacing: 24,
  defaultPaperBackground: "#ffffff",
  feedbackUrl: "https://docs.google.com/forms/d/e/1FAIpQLSeP3GLlOFJzvoTfJ4lVFXmvIGDNLdk_NyyQ909papxkeJXL9g/viewform",
  toolbarScale: 1.0,
  toolbarMaxWidth: null,
  toolbarWrap: false,
  toolbarShowTitle: true,
  toolbarShowZoomControls: true,
  toolbarDimWhileDrawing: true,
  toolbarPlacement: "top",
  toolbarFloatingPos: null,
  customHotkeys: {}
};
