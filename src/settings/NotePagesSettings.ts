import {
  DefaultToolPreset,
  EraserMode,
  HotkeyMap,
  PageSizePreset,
  PageOrientation,
  PaperTemplateType,
  PenPreset,
  StrokePattern,
  StylusButtonAction,
  ToolType,
  ToolbarPlacement
} from "../types";
import { sanitizeHotkeyMap } from "./HotkeyHelper";
import { isValidVersionString } from "../changelog/VersionUtils";

const PRESET_INK_TOOLS: ReadonlySet<ToolType> = new Set([
  "pen",
  "pressure",
  "fountain",
  "pencil",
  "highlighter"
]);

const VALID_STROKE_PATTERNS: ReadonlySet<StrokePattern> = new Set([
  "solid",
  "dashed",
  "dotted"
]);

export const DEFAULT_PEN_PRESETS: PenPreset[] = [
  { id: "preset-black", label: "Black pen", tool: "pressure", color: "#1e293b", width: 2.5, strokePattern: "solid" },
  { id: "preset-blue", label: "Blue pen", tool: "pressure", color: "#2563eb", width: 2.5, strokePattern: "solid" },
  { id: "preset-pencil", label: "Pencil", tool: "pencil", color: "#475569", width: 2, strokePattern: "solid" },
  { id: "preset-highlighter", label: "Yellow highlight", tool: "highlighter", color: "#facc15", width: 14, strokePattern: "solid" }
];

export function createDefaultPenPresets(): PenPreset[] {
  return DEFAULT_PEN_PRESETS.map((preset) => ({ ...preset }));
}

export function sanitizePenPresets(raw: unknown): PenPreset[] {
  if (!Array.isArray(raw)) {
    return createDefaultPenPresets();
  }

  const items: unknown[] = raw;
  const sanitized: PenPreset[] = [];
  for (let i = 0; i < items.length && sanitized.length < 6; i++) {
    const item = items[i];
    if (!item || typeof item !== "object") {
      continue;
    }
    const candidate = item as Partial<PenPreset>;
    const tool: ToolType =
      candidate.tool && PRESET_INK_TOOLS.has(candidate.tool) ? candidate.tool : "pressure";
    const color = typeof candidate.color === "string" && candidate.color.trim().length > 0
      ? candidate.color.trim()
      : "#1e293b";
    const rawWidth = typeof candidate.width === "number" && Number.isFinite(candidate.width)
      ? candidate.width
      : 2.5;
    const width = Math.max(0.5, Math.min(48, Math.round(rawWidth * 2) / 2));
    const strokePattern: StrokePattern =
      candidate.strokePattern && VALID_STROKE_PATTERNS.has(candidate.strokePattern)
        ? candidate.strokePattern
        : "solid";
    const id = typeof candidate.id === "string" && candidate.id.trim().length > 0
      ? candidate.id.trim()
      : `preset-${sanitized.length + 1}`;
    const label = typeof candidate.label === "string" && candidate.label.trim().length > 0
      ? candidate.label.trim()
      : `Preset ${sanitized.length + 1}`;

    sanitized.push({ id, label, tool, color, width, strokePattern });
  }

  return sanitized.length > 0 ? sanitized : createDefaultPenPresets();
}

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
  showPenHoverCursor: boolean;
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
  penPresets: PenPreset[];
  customHotkeys: HotkeyMap;
  lastSeenVersion: string | null;
  showWhatsNewOnUpdate: boolean;
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
  showPenHoverCursor: true,
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
  penPresets: createDefaultPenPresets(),
  customHotkeys: {},
  lastSeenVersion: null,
  showWhatsNewOnUpdate: true
};

export const FALLBACK_FEEDBACK_URL = "https://github.com/0xKurian/Obsinotes/issues/new/choose";
export const RELEASES_URL = "https://github.com/0xKurian/Obsinotes/releases";

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

/**
 * Sanitize persisted plugin settings so corrupt/out-of-range values cannot break UI or rendering.
 */
export function sanitizeSettings(raw: unknown): NotePagesSettings {
  const input =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Partial<NotePagesSettings>) : {};
  const merged: NotePagesSettings = Object.assign({}, DEFAULT_SETTINGS, input);

  merged.defaultPenWidth = clampNumber(input.defaultPenWidth, DEFAULT_SETTINGS.defaultPenWidth, 0.5, 15);
  merged.defaultHighlighterWidth = clampNumber(
    input.defaultHighlighterWidth,
    DEFAULT_SETTINGS.defaultHighlighterWidth,
    4,
    36
  );
  merged.defaultEraserRadius = clampNumber(
    input.defaultEraserRadius,
    DEFAULT_SETTINGS.defaultEraserRadius,
    4,
    50
  );
  merged.palmRejectionDelayMs = clampNumber(
    input.palmRejectionDelayMs,
    DEFAULT_SETTINGS.palmRejectionDelayMs,
    0,
    1000
  );
  merged.autosaveIntervalMs = clampNumber(
    input.autosaveIntervalMs,
    DEFAULT_SETTINGS.autosaveIntervalMs,
    300,
    30000
  );
  merged.defaultLineSpacing = clampNumber(
    input.defaultLineSpacing,
    DEFAULT_SETTINGS.defaultLineSpacing,
    8,
    120
  );
  merged.toolbarScale = clampNumber(input.toolbarScale, DEFAULT_SETTINGS.toolbarScale, 0.75, 1.4);

  if (input.toolbarMaxWidth !== null && input.toolbarMaxWidth !== undefined) {
    merged.toolbarMaxWidth = clampNumber(input.toolbarMaxWidth, 960, 280, 2400);
  } else {
    merged.toolbarMaxWidth = null;
  }

  if (
    input.toolbarFloatingPos &&
    typeof input.toolbarFloatingPos === "object" &&
    typeof input.toolbarFloatingPos.left === "number" &&
    Number.isFinite(input.toolbarFloatingPos.left) &&
    typeof input.toolbarFloatingPos.top === "number" &&
    Number.isFinite(input.toolbarFloatingPos.top)
  ) {
    merged.toolbarFloatingPos = {
      left: Math.max(0, input.toolbarFloatingPos.left),
      top: Math.max(0, input.toolbarFloatingPos.top)
    };
  } else {
    merged.toolbarFloatingPos = null;
  }

  merged.defaultEraserMode = input.defaultEraserMode === "precision" ? "precision" : "stroke";
  merged.stylusButtonAction =
    input.stylusButtonAction === "toggle" || input.stylusButtonAction === "off"
      ? input.stylusButtonAction
      : "hold";
  merged.toolbarPlacement =
    input.toolbarPlacement === "bottom" ||
    input.toolbarPlacement === "left" ||
    input.toolbarPlacement === "right"
      ? input.toolbarPlacement
      : "top";

  merged.penPresets = sanitizePenPresets(input.penPresets);
  merged.customHotkeys = sanitizeHotkeyMap(input.customHotkeys);
  merged.lastSeenVersion = isValidVersionString(input.lastSeenVersion)
    ? input.lastSeenVersion.trim()
    : null;
  merged.showWhatsNewOnUpdate =
    typeof input.showWhatsNewOnUpdate === "boolean"
      ? input.showWhatsNewOnUpdate
      : DEFAULT_SETTINGS.showWhatsNewOnUpdate;

  return merged;
}

/**
 * Validate that an external URL uses http(s) before opening in a new window with noopener/noreferrer.
 */
export function openSafeExternalUrl(rawUrl: string, fallbackUrl = FALLBACK_FEEDBACK_URL): boolean {
  const candidate = (rawUrl || "").trim() || fallbackUrl;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      window.open(parsed.toString(), "_blank", "noopener,noreferrer");
      return true;
    }
  } catch {
    // Fall through to fallback
  }
  if (candidate !== fallbackUrl) {
    try {
      const parsedFallback = new URL(fallbackUrl);
      if (parsedFallback.protocol === "https:" || parsedFallback.protocol === "http:") {
        window.open(parsedFallback.toString(), "_blank", "noopener,noreferrer");
      }
    } catch {
      // Ignore
    }
  }
  return false;
}
