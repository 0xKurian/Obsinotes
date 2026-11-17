import { Platform } from "obsidian";
import type { Modifier } from "obsidian";
import { HotkeyActionId, HotkeyBinding, HotkeyMap } from "../types";

export type HotkeyCategory = "tools" | "editing" | "canvas";

export interface HotkeyActionMetadata {
  id: HotkeyActionId;
  label: string;
  category: HotkeyCategory;
  defaultBinding: HotkeyBinding;
}

const MODIFIER_ORDER: readonly Modifier[] = ["Mod", "Ctrl", "Meta", "Shift", "Alt"];
const VALID_MODIFIERS = new Set<string>(MODIFIER_ORDER);
const BARE_MODIFIER_KEYS = new Set<string>(["Control", "Shift", "Alt", "Meta"]);

export const HOTKEY_ACTION_METADATA: readonly HotkeyActionMetadata[] = [
  { id: "toolPen", label: "Pen", category: "tools", defaultBinding: { modifiers: [], key: "p" } },
  { id: "toolPencil", label: "Pencil", category: "tools", defaultBinding: { modifiers: [], key: "g" } },
  { id: "toolHighlighter", label: "Highlighter", category: "tools", defaultBinding: { modifiers: [], key: "h" } },
  { id: "toolEraser", label: "Eraser", category: "tools", defaultBinding: { modifiers: [], key: "e" } },
  { id: "toolLasso", label: "Lasso select", category: "tools", defaultBinding: { modifiers: [], key: "l" } },
  { id: "toolPan", label: "Pan / hand tool", category: "tools", defaultBinding: { modifiers: [], key: "v" } },
  { id: "toolShape", label: "Shapes", category: "tools", defaultBinding: { modifiers: [], key: "s" } },
  { id: "toolConnector", label: "Line / connector", category: "tools", defaultBinding: { modifiers: [], key: "c" } },
  { id: "toolSticky", label: "Sticky note", category: "tools", defaultBinding: { modifiers: [], key: "n" } },
  { id: "toolText", label: "Text box", category: "tools", defaultBinding: { modifiers: [], key: "t" } },
  { id: "toolImage", label: "Insert image", category: "tools", defaultBinding: { modifiers: [], key: "i" } },
  { id: "toggleRuler", label: "Toggle ruler guide", category: "canvas", defaultBinding: { modifiers: [], key: "u" } },
  { id: "toggleFocusMode", label: "Toggle focus mode", category: "canvas", defaultBinding: { modifiers: [], key: "f" } },
  { id: "undo", label: "Undo", category: "editing", defaultBinding: { modifiers: ["Mod"], key: "z" } },
  { id: "redo", label: "Redo", category: "editing", defaultBinding: { modifiers: ["Mod", "Shift"], key: "z" } },
  { id: "redoAlt", label: "Redo (alternate)", category: "editing", defaultBinding: { modifiers: ["Mod"], key: "y" } },
  { id: "duplicateSelection", label: "Duplicate selection", category: "editing", defaultBinding: { modifiers: ["Mod"], key: "d" } },
  { id: "copySelection", label: "Copy selection", category: "editing", defaultBinding: { modifiers: ["Mod"], key: "c" } },
  { id: "pasteSelection", label: "Paste selection", category: "editing", defaultBinding: { modifiers: ["Mod"], key: "v" } },
  { id: "deleteSelection", label: "Delete selection or image", category: "editing", defaultBinding: { modifiers: [], key: "Delete" } },
  { id: "decreaseWidth", label: "Decrease stroke width", category: "editing", defaultBinding: { modifiers: [], key: "[" } },
  { id: "increaseWidth", label: "Increase stroke width", category: "editing", defaultBinding: { modifiers: [], key: "]" } },
  { id: "zoomIn", label: "Zoom in", category: "canvas", defaultBinding: { modifiers: [], key: "=" } },
  { id: "zoomOut", label: "Zoom out", category: "canvas", defaultBinding: { modifiers: [], key: "-" } },
  { id: "zoomReset", label: "Reset zoom (100%)", category: "canvas", defaultBinding: { modifiers: [], key: "0" } },
  { id: "toggleSidebar", label: "Toggle pages sidebar", category: "canvas", defaultBinding: { modifiers: [], key: "b" } },
  { id: "addPage", label: "Add new page", category: "canvas", defaultBinding: { modifiers: [], key: "a" } },
  { id: "toggleOrientation", label: "Toggle page orientation", category: "canvas", defaultBinding: { modifiers: [], key: "r" } },
  { id: "quickRename", label: "Quick rename notebook", category: "canvas", defaultBinding: { modifiers: [], key: "F2" } },
  { id: "clearSelection", label: "Clear selection / deselect", category: "canvas", defaultBinding: { modifiers: [], key: "Escape" } }
];

const METADATA_BY_ID = new Map<HotkeyActionId, HotkeyActionMetadata>(
  HOTKEY_ACTION_METADATA.map((item) => [item.id, item])
);

export function getHotkeyMetadata(actionId: HotkeyActionId): HotkeyActionMetadata | undefined {
  return METADATA_BY_ID.get(actionId);
}

export function normalizeKeyName(rawKey: string): string {
  if (rawKey === " ") {
    return "Space";
  }
  if (rawKey.length === 1 && rawKey >= "A" && rawKey <= "Z") {
    return rawKey.toLowerCase();
  }
  return rawKey;
}

export function sortModifiers(modifiers: readonly Modifier[]): Modifier[] {
  const unique = new Set<Modifier>();
  for (const mod of modifiers) {
    if (VALID_MODIFIERS.has(mod)) {
      unique.add(mod);
    }
  }
  return MODIFIER_ORDER.filter((mod) => unique.has(mod));
}

export function resolveHotkeyBinding(
  actionId: HotkeyActionId,
  customHotkeys?: HotkeyMap | null
): HotkeyBinding | null {
  if (customHotkeys && Object.prototype.hasOwnProperty.call(customHotkeys, actionId)) {
    const custom = customHotkeys[actionId];
    if (custom === null) {
      return null;
    }
    if (custom && typeof custom.key === "string" && custom.key.length > 0) {
      return {
        modifiers: sortModifiers(custom.modifiers ?? []),
        key: normalizeKeyName(custom.key)
      };
    }
  }
  const meta = METADATA_BY_ID.get(actionId);
  if (!meta) {
    return null;
  }
  return {
    modifiers: [...meta.defaultBinding.modifiers],
    key: meta.defaultBinding.key
  };
}

export function areHotkeyBindingsEqual(
  a: HotkeyBinding | null | undefined,
  b: HotkeyBinding | null | undefined
): boolean {
  if (!a || !b) {
    return a === b;
  }
  if (normalizeKeyName(a.key) !== normalizeKeyName(b.key)) {
    return false;
  }
  const modsA = sortModifiers(a.modifiers);
  const modsB = sortModifiers(b.modifiers);
  if (modsA.length !== modsB.length) {
    return false;
  }
  return modsA.every((mod, idx) => mod === modsB[idx]);
}

export function isApplePlatform(): boolean {
  return Boolean(Platform?.isMacOS || Platform?.isIosApp);
}

export function formatHotkeyBinding(
  binding: HotkeyBinding | null,
  applePlatform: boolean = isApplePlatform()
): string {
  if (!binding) {
    return "Disabled";
  }
  const parts: string[] = [];
  for (const mod of sortModifiers(binding.modifiers)) {
    if (mod === "Mod") {
      parts.push(applePlatform ? "Cmd" : "Ctrl");
    } else if (mod === "Meta") {
      parts.push(applePlatform ? "Cmd" : "Super");
    } else {
      parts.push(mod);
    }
  }
  const keyLabel = binding.key.length === 1 && binding.key >= "a" && binding.key <= "z"
    ? binding.key.toUpperCase()
    : binding.key;
  parts.push(keyLabel);
  return parts.join("+");
}

export function normalizeKeyboardEventToBinding(
  e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">,
  applePlatform: boolean = isApplePlatform()
): HotkeyBinding | null {
  if (!e.key || BARE_MODIFIER_KEYS.has(e.key) || e.key === "Dead" || e.key === "Unidentified") {
    return null;
  }
  const key = normalizeKeyName(e.key);
  const modifiers: Modifier[] = [];
  if (applePlatform) {
    if (e.metaKey) {
      modifiers.push("Mod");
    }
    if (e.ctrlKey) {
      modifiers.push("Ctrl");
    }
  } else {
    if (e.ctrlKey) {
      modifiers.push("Mod");
    }
    if (e.metaKey) {
      modifiers.push("Meta");
    }
  }
  const isNonAlphaSingleChar = key.length === 1 && !(key >= "a" && key <= "z");
  if (e.shiftKey && (!isNonAlphaSingleChar || modifiers.length > 0)) {
    modifiers.push("Shift");
  }
  if (e.altKey) {
    modifiers.push("Alt");
  }
  return {
    modifiers: sortModifiers(modifiers),
    key
  };
}

export function findHotkeyConflicts(
  actionId: HotkeyActionId,
  candidate: HotkeyBinding | null,
  customHotkeys?: HotkeyMap | null
): HotkeyActionId[] {
  if (!candidate) {
    return [];
  }
  const conflicts: HotkeyActionId[] = [];
  for (const meta of HOTKEY_ACTION_METADATA) {
    if (meta.id === actionId) {
      continue;
    }
    const resolved = resolveHotkeyBinding(meta.id, customHotkeys);
    if (resolved && areHotkeyBindingsEqual(candidate, resolved)) {
      conflicts.push(meta.id);
    }
  }
  return conflicts;
}

export function countCustomizedHotkeys(customHotkeys?: HotkeyMap | null): number {
  if (!customHotkeys) {
    return 0;
  }
  let count = 0;
  for (const meta of HOTKEY_ACTION_METADATA) {
    if (!Object.prototype.hasOwnProperty.call(customHotkeys, meta.id)) {
      continue;
    }
    const resolved = resolveHotkeyBinding(meta.id, customHotkeys);
    if (!areHotkeyBindingsEqual(resolved, meta.defaultBinding)) {
      count += 1;
    }
  }
  return count;
}

export function sanitizeHotkeyMap(raw: unknown): HotkeyMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const result: HotkeyMap = {};
  const record = raw as Record<string, unknown>;
  for (const meta of HOTKEY_ACTION_METADATA) {
    if (!Object.prototype.hasOwnProperty.call(record, meta.id)) {
      continue;
    }
    const entry = record[meta.id];
    if (entry === null) {
      result[meta.id] = null;
      continue;
    }
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const candidate = entry as { modifiers?: unknown; key?: unknown };
      if (typeof candidate.key === "string" && candidate.key.trim().length > 0) {
        const rawMods = Array.isArray(candidate.modifiers) ? candidate.modifiers : [];
        const validMods = rawMods.filter((m): m is Modifier => typeof m === "string" && VALID_MODIFIERS.has(m));
        result[meta.id] = {
          modifiers: sortModifiers(validMods),
          key: normalizeKeyName(candidate.key)
        };
      }
    }
  }
  return result;
}
