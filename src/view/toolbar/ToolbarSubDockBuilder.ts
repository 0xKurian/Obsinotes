import { setIcon } from "obsidian";
import { PenPreset, ShapeType, StrokePattern } from "../../types";
import type { NotePagesToolbarDelegate } from "../NotePagesToolbar";

export const STROKE_WIDTH_PRESETS: readonly number[] = [1, 2.5, 5, 12];

export function parseStrokeWidthInput(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.round(Math.max(0.5, Math.min(30, parsed)) * 10) / 10;
}

export interface ToolbarSubDockRefs {
  penPresetsContainer: HTMLElement;
  renderPenPresets: (presets: PenPreset[], activeTool: string, activeColor: string, activeWidth: number, activePattern: StrokePattern) => void;
  textControlsContainer: HTMLElement;
  textSizeSelect: HTMLSelectElement;
  textBoldBtn: HTMLButtonElement;
  textItalicBtn: HTMLButtonElement;
  textUnderlineBtn: HTMLButtonElement;
  textAlignSelect: HTMLSelectElement;
  textDoneBtn: HTMLButtonElement;
  shapeControlsContainer: HTMLElement;
  shapeButtons: Map<ShapeType, HTMLElement>;
  shapeFillBtn: HTMLButtonElement;
  stickyControlsContainer: HTMLElement;
  stickyChips: HTMLElement[];
  colorPaletteContainer: HTMLElement;
  colorChips: HTMLElement[];
  colorPickerInput: HTMLInputElement;
  widthSelectorContainer: HTMLElement;
  widthButtons: HTMLElement[];
  widthPresetButtons: Map<number, HTMLElement>;
  widthSliderInput: HTMLInputElement;
  widthNumberInput: HTMLInputElement;
  widthValueBadge: HTMLElement;
  widthPreviewDot: HTMLElement;
  strokePatternContainer: HTMLElement;
  strokePatternButtons: Map<StrokePattern, HTMLElement>;
  eraserControlsContainer: HTMLElement;
  strokeEraserBtn: HTMLButtonElement;
  precisionEraserBtn: HTMLButtonElement;
  eraserSizeButtons: Map<number, HTMLElement>;
  selectionActionsContainer: HTMLElement;
  selectionLassoBtn: HTMLButtonElement;
  selectionPanBtn: HTMLButtonElement;
  duplicateSelectionBtn: HTMLButtonElement;
  deleteSelectionBtn: HTMLButtonElement;
}

export interface ToolbarSubDockCallbacks {
  onShapeTypeSelected(shapeType: ShapeType): void;
  onStickyColorSelected(color: string): void;
  onEraserRadiusSelected(radius: number): void;
  onSelectionSubModeSelected(mode: "lasso" | "pan"): void;
}

export function buildToolbarSubDock(
  subToolbarEl: HTMLElement,
  delegate: NotePagesToolbarDelegate,
  callbacks: ToolbarSubDockCallbacks
): ToolbarSubDockRefs {
  const currentActiveTool = delegate.getActiveTool();

  const textControlsContainer = subToolbarEl.createDiv({
    cls: "notepages-palette-group notepages-subdock-group"
  });
  textControlsContainer.toggleClass("is-hidden", currentActiveTool !== "text");
  textControlsContainer.toggle(currentActiveTool === "text");

  const textOpts = delegate.getTextOptions();
  const textSizeSelect = textControlsContainer.createEl("select", {
    cls: "notepages-text-size-select"
  });
  textSizeSelect.setAttribute("title", "Font size");
  const fontSizes = [12, 14, 16, 18, 20, 24, 28, 32, 36, 48];
  for (const size of fontSizes) {
    const opt = textSizeSelect.createEl("option", {
      value: String(size),
      text: `${size}pt`
    });
    if (size === textOpts.fontSize) {
      opt.selected = true;
    }
  }
  delegate.registerDomEvent(textSizeSelect, "change", () => {
    delegate.onTextSizeChanged(Number(textSizeSelect.value));
  });

  const textBoldBtn = textControlsContainer.createEl("button", {
    cls: textOpts.fontWeight === "bold" ? "notepages-tool-button is-active" : "notepages-tool-button"
  });
  textBoldBtn.setAttribute("title", "Bold (Ctrl+B)");
  textBoldBtn.createEl("strong", { text: "B" });
  delegate.registerDomEvent(textBoldBtn, "click", () => {
    delegate.onTextBoldToggled();
  });

  const textItalicBtn = textControlsContainer.createEl("button", {
    cls: textOpts.italic ? "notepages-tool-button is-active" : "notepages-tool-button"
  });
  textItalicBtn.setAttribute("title", "Italic (Ctrl+I)");
  textItalicBtn.createEl("em", { text: "I" });
  delegate.registerDomEvent(textItalicBtn, "click", () => {
    delegate.onTextItalicToggled();
  });

  const textUnderlineBtn = textControlsContainer.createEl("button", {
    cls: textOpts.underline ? "notepages-tool-button is-active" : "notepages-tool-button"
  });
  textUnderlineBtn.setAttribute("title", "Underline (Ctrl+U)");
  textUnderlineBtn.createEl("u", { text: "U" });
  delegate.registerDomEvent(textUnderlineBtn, "click", () => {
    delegate.onTextUnderlineToggled();
  });

  const textAlignSelect = textControlsContainer.createEl("select", {
    cls: "notepages-text-align-select"
  });
  textAlignSelect.setAttribute("title", "Text alignment");
  const aligns: Array<"left" | "center" | "right"> = ["left", "center", "right"];
  for (const align of aligns) {
    const opt = textAlignSelect.createEl("option", {
      value: align,
      text: align.charAt(0).toUpperCase() + align.slice(1)
    });
    if (align === textOpts.textAlign) {
      opt.selected = true;
    }
  }
  delegate.registerDomEvent(textAlignSelect, "change", () => {
    delegate.onTextAlignChanged(textAlignSelect.value as "left" | "center" | "right");
  });

  const textDoneBtn = textControlsContainer.createEl("button", {
    cls: "notepages-tool-button"
  });
  textDoneBtn.setAttribute("title", "Finish editing (Ctrl+Enter / Esc)");
  setIcon(textDoneBtn, "check");
  delegate.registerDomEvent(textDoneBtn, "click", () => {
    delegate.onTextDone();
  });

  const shapeControlsContainer = subToolbarEl.createDiv({
    cls: "notepages-palette-group notepages-subdock-group"
  });
  shapeControlsContainer.toggleClass("is-hidden", currentActiveTool !== "shape");
  shapeControlsContainer.toggle(currentActiveTool === "shape");

  const shapeButtons = new Map<ShapeType, HTMLElement>();
  const shapeDefs: { type: ShapeType; icon: string; title: string }[] = [
    { type: "rectangle", icon: "square", title: "Rectangle" },
    { type: "rounded-rectangle", icon: "box", title: "Rounded Rectangle" },
    { type: "circle", icon: "circle", title: "Circle" },
    { type: "triangle", icon: "triangle", title: "Triangle" },
    { type: "diamond", icon: "gem", title: "Diamond" },
    { type: "star", icon: "star", title: "Star" },
    { type: "callout", icon: "message-square", title: "Speech Bubble" }
  ];

  const currentShape = delegate.getCurrentShapeType();
  for (const def of shapeDefs) {
    const btn = shapeControlsContainer.createEl("button", {
      cls: def.type === currentShape ? "notepages-tool-button is-active" : "notepages-tool-button"
    });
    setIcon(btn, def.icon);
    btn.setAttribute("title", def.title);
    shapeButtons.set(def.type, btn);

    delegate.registerDomEvent(btn, "click", () => {
      delegate.onSelectShapeType(def.type);
      callbacks.onShapeTypeSelected(def.type);
    });
  }

  const shapeFillBtn = shapeControlsContainer.createEl("button", {
    cls: delegate.isShapeFillEnabled() ? "notepages-tool-button is-active" : "notepages-tool-button"
  });
  shapeFillBtn.setAttribute("title", "Toggle shape fill");
  setIcon(shapeFillBtn, "paint-bucket");
  delegate.registerDomEvent(shapeFillBtn, "click", () => {
    const filled = delegate.onToggleShapeFill();
    shapeFillBtn.toggleClass("is-active", filled);
  });

  const stickyControlsContainer = subToolbarEl.createDiv({
    cls: "notepages-palette-group notepages-subdock-group"
  });
  stickyControlsContainer.toggleClass("is-hidden", currentActiveTool !== "sticky");
  stickyControlsContainer.toggle(currentActiveTool === "sticky");

  const pastelColors = [
    { color: "#fef08a", title: "Yellow" },
    { color: "#bbf7d0", title: "Green" },
    { color: "#bfdbfe", title: "Blue" },
    { color: "#fbcfe8", title: "Pink" },
    { color: "#fed7aa", title: "Orange" },
    { color: "#e9d5ff", title: "Purple" }
  ];

  const currentStickyColor = delegate.getCurrentStickyColor();
  const stickyChips: HTMLElement[] = [];
  for (const item of pastelColors) {
    const chip = stickyControlsContainer.createEl("button", {
      cls: item.color === currentStickyColor ? "notepages-sticky-chip is-active" : "notepages-sticky-chip"
    });
    chip.setCssStyles({ backgroundColor: item.color });
    chip.setAttribute("title", `Sticky Note ${item.title}`);
    stickyChips.push(chip);

    delegate.registerDomEvent(chip, "click", () => {
      delegate.onSelectStickyColor(item.color);
      callbacks.onStickyColorSelected(item.color);
    });
  }

  const stickyDoneBtn = stickyControlsContainer.createEl("button", {
    cls: "notepages-tool-button"
  });
  stickyDoneBtn.setAttribute("title", "Finish editing (Ctrl+Enter / Esc)");
  setIcon(stickyDoneBtn, "check");
  delegate.registerDomEvent(stickyDoneBtn, "click", () => {
    delegate.onTextDone();
  });

  const penPresetsContainer = subToolbarEl.createDiv({
    cls: "notepages-palette-group notepages-subdock-group notepages-presets-group"
  });

  const renderPenPresets = (
    presets: PenPreset[],
    activeTool: string,
    activeColor: string,
    activeWidth: number,
    activePattern: StrokePattern
  ) => {
    penPresetsContainer.empty();
    if (presets.length === 0) {
      penPresetsContainer.toggleClass("is-hidden", true);
      penPresetsContainer.toggle(false);
      return;
    }

    const activePatternNormalized = activePattern || "solid";
    presets.forEach((preset, idx) => {
      const presetPattern = preset.strokePattern ?? "solid";
      const isPenFamilyMatch =
        preset.tool === activeTool ||
        ((preset.tool === "pen" || preset.tool === "pressure" || preset.tool === "fountain") &&
          (activeTool === "pen" || activeTool === "pressure" || activeTool === "fountain"));
      const isActive =
        isPenFamilyMatch &&
        preset.color.toLowerCase() === activeColor.toLowerCase() &&
        Math.abs(preset.width - activeWidth) < 0.26 &&
        presetPattern === activePatternNormalized;

      const chip = penPresetsContainer.createEl("button", {
        cls: isActive ? "notepages-preset-chip is-active" : "notepages-preset-chip"
      });
      chip.setAttribute("type", "button");
      chip.setAttribute(
        "title",
        `${preset.label} (${preset.width} pt) — click to apply, shift-click or right-click to save current pen`
      );
      const swatch = chip.createSpan({ cls: "notepages-preset-swatch" });
      swatch.setCssStyles({ backgroundColor: preset.color });
      if (preset.tool === "pencil") {
        swatch.addClass("is-pencil");
      } else if (preset.tool === "highlighter") {
        swatch.addClass("is-highlighter");
      }
      chip.createSpan({
        cls: "notepages-preset-width",
        text: String(Math.round(preset.width * 10) / 10)
      });

      delegate.registerDomEvent(chip, "click", (e: MouseEvent) => {
        if (e.shiftKey) {
          delegate.onSavePenPreset?.(idx);
          return;
        }
        delegate.onSelectPenPreset?.(preset);
      });
      delegate.registerDomEvent(chip, "contextmenu", (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        delegate.onSavePenPreset?.(idx);
      });
    });
  };

  const initialPresets = delegate.getPenPresets ? delegate.getPenPresets() : [];
  renderPenPresets(
    initialPresets,
    currentActiveTool,
    delegate.getActiveColor(),
    delegate.getActiveWidth(),
    delegate.getStrokePattern ? delegate.getStrokePattern() : "solid"
  );

  const colorPaletteContainer = subToolbarEl.createDiv({
    cls: "notepages-palette-group notepages-subdock-group"
  });

  const colorPresets = ["#1e293b", "#2563eb", "#dc2626", "#16a34a", "#9333ea", "#f59e0b"];

  const currentActiveColor = delegate.getActiveColor();
  const colorChips: HTMLElement[] = [];
  for (const color of colorPresets) {
    const chip = colorPaletteContainer.createEl("button", {
      cls: color === currentActiveColor ? "notepages-color-chip is-active" : "notepages-color-chip"
    });
    chip.setCssStyles({ backgroundColor: color });
    chip.setAttribute("title", `Select color ${color}`);
    colorChips.push(chip);

    delegate.registerDomEvent(chip, "click", () => {
      delegate.onSelectColor(color);
    });
  }

  const pickerWrapper = colorPaletteContainer.createDiv({
    cls: "notepages-color-picker-wrapper"
  });
  const colorPickerInput = pickerWrapper.createEl("input", {
    cls: "notepages-color-picker-input",
    type: "color",
    value: currentActiveColor
  });
  colorPickerInput.setAttribute("title", "Custom color picker");

  delegate.registerDomEvent(colorPickerInput, "change", () => {
    delegate.onSelectColor(colorPickerInput.value);
  });

  const widthSelectorContainer = subToolbarEl.createDiv({
    cls: "notepages-palette-group notepages-subdock-group notepages-width-selector"
  });

  const currentActiveWidth = Math.round(delegate.getActiveWidth() * 10) / 10;
  const widthButtons: HTMLElement[] = [];
  const widthPresetButtons = new Map<number, HTMLElement>();

  const widthPresetsGroup = widthSelectorContainer.createDiv({
    cls: "notepages-width-presets"
  });

  for (const presetWidth of STROKE_WIDTH_PRESETS) {
    const isMatched = Math.abs(presetWidth - currentActiveWidth) < 0.05;
    const btn = widthPresetsGroup.createEl("button", {
      cls: isMatched ? "notepages-width-preset-btn is-active" : "notepages-width-preset-btn",
      text: String(presetWidth)
    });
    btn.setAttribute("data-width", String(presetWidth));
    btn.setAttribute("title", `Set stroke width to ${presetWidth} pt`);
    widthButtons.push(btn);
    widthPresetButtons.set(presetWidth, btn);

    delegate.registerDomEvent(btn, "click", () => {
      delegate.onSelectWidth(presetWidth);
    });
  }

  const sliderWrapper = widthSelectorContainer.createDiv({
    cls: "notepages-width-slider-wrapper"
  });

  const widthSliderInput = sliderWrapper.createEl("input", {
    cls: "notepages-width-slider",
    type: "range"
  });
  widthSliderInput.min = "0.5";
  widthSliderInput.max = "30";
  widthSliderInput.step = "0.5";
  widthSliderInput.value = String(currentActiveWidth);
  widthSliderInput.setAttribute("title", "Adjust stroke width (0.5 - 30 pt)");

  const numberGroup = sliderWrapper.createDiv({
    cls: "notepages-width-input-group"
  });
  const widthNumberInput = numberGroup.createEl("input", {
    cls: "notepages-width-number-input",
    type: "text"
  });
  widthNumberInput.inputMode = "decimal";
  widthNumberInput.value = String(currentActiveWidth);
  widthNumberInput.setAttribute("aria-label", "Stroke width in points");
  widthNumberInput.setAttribute("title", "Enter custom stroke width (0.5 - 30 pt)");

  const widthValueBadge = numberGroup.createSpan({
    cls: "notepages-width-badge notepages-width-unit",
    text: "pt"
  });
  widthValueBadge.setAttribute("title", "Current stroke width (scroll to adjust)");

  const commitNumberInput = (): void => {
    const parsed = parseStrokeWidthInput(widthNumberInput.value);
    if (parsed !== null) {
      widthNumberInput.value = String(parsed);
      delegate.onSelectWidth(parsed);
    } else {
      const fallback = Math.round(delegate.getActiveWidth() * 10) / 10;
      widthNumberInput.value = String(fallback);
    }
  };

  delegate.registerDomEvent(widthNumberInput, "focus", () => {
    if (typeof widthNumberInput.select === "function") {
      widthNumberInput.select();
    }
  });

  delegate.registerDomEvent(widthNumberInput, "keydown", (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      commitNumberInput();
      if (typeof widthNumberInput.blur === "function") {
        widthNumberInput.blur();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      widthNumberInput.value = String(Math.round(delegate.getActiveWidth() * 10) / 10);
      if (typeof widthNumberInput.blur === "function") {
        widthNumberInput.blur();
      }
    }
  });

  delegate.registerDomEvent(widthNumberInput, "change", commitNumberInput);
  delegate.registerDomEvent(widthNumberInput, "blur", commitNumberInput);

  const previewWrapper = sliderWrapper.createDiv({
    cls: "notepages-width-preview-wrapper"
  });
  const widthPreviewDot = previewWrapper.createDiv({
    cls: "notepages-width-preview-dot"
  });
  const previewSize = Math.min(18, Math.max(2, currentActiveWidth));
  widthPreviewDot.setCssStyles({
    width: `${previewSize}px`,
    height: `${previewSize}px`,
    backgroundColor: delegate.getActiveColor()
  });

  delegate.registerDomEvent(widthSliderInput, "input", () => {
    const val = Math.round(Number(widthSliderInput.value) * 10) / 10;
    delegate.onSelectWidth(val);
  });

  delegate.registerDomEvent(widthSliderInput, "change", () => {
    const val = Math.round(Number(widthSliderInput.value) * 10) / 10;
    delegate.onSelectWidth(val);
  });

  delegate.registerDomEvent(sliderWrapper, "wheel", (e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const current = Number(widthSliderInput.value) || 2.5;
    const step = e.deltaY < 0 ? 0.5 : -0.5;
    const next = Math.max(0.5, Math.min(30, Math.round((current + step) * 10) / 10));
    delegate.onSelectWidth(next);
  });

  const strokePatternContainer = subToolbarEl.createDiv({
    cls: "notepages-palette-group notepages-subdock-group notepages-pattern-group"
  });
  const strokePatternButtons = new Map<StrokePattern, HTMLElement>();
  const activePattern: StrokePattern = delegate.getStrokePattern ? delegate.getStrokePattern() : "solid";
  const patternDefs: Array<{ pattern: StrokePattern; label: string; title: string }> = [
    { pattern: "solid", label: "—", title: "Solid line" },
    { pattern: "dashed", label: "- -", title: "Dashed line" },
    { pattern: "dotted", label: "···", title: "Dotted line" }
  ];
  for (const pd of patternDefs) {
    const btn = strokePatternContainer.createEl("button", {
      cls: pd.pattern === activePattern ? "notepages-pattern-btn is-active" : "notepages-pattern-btn",
      text: pd.label
    });
    btn.setAttribute("title", pd.title);
    strokePatternButtons.set(pd.pattern, btn);
    delegate.registerDomEvent(btn, "click", () => {
      delegate.onSelectStrokePattern?.(pd.pattern);
      for (const [pat, pBtn] of strokePatternButtons.entries()) {
        pBtn.toggleClass("is-active", pat === pd.pattern);
      }
    });
  }

  const eraserControlsContainer = subToolbarEl.createDiv({
    cls: "notepages-palette-group notepages-subdock-group"
  });
  eraserControlsContainer.toggleClass("is-hidden", true);
  eraserControlsContainer.toggle(false);

  const strokeEraserBtn = eraserControlsContainer.createEl("button", {
    cls: "notepages-tool-button is-active"
  });
  setIcon(strokeEraserBtn, "eraser");
  strokeEraserBtn.setAttribute("title", "Stroke eraser (erase whole stroke upon contact)");

  const precisionEraserBtn = eraserControlsContainer.createEl("button", {
    cls: "notepages-tool-button"
  });
  setIcon(precisionEraserBtn, "scissors");
  precisionEraserBtn.setAttribute("title", "Precision eraser (trim exact contact points)");

  delegate.registerDomEvent(strokeEraserBtn, "click", () => {
    delegate.onSelectEraserMode("stroke");
  });

  delegate.registerDomEvent(precisionEraserBtn, "click", () => {
    delegate.onSelectEraserMode("precision");
  });

  const sizeWrapper = eraserControlsContainer.createDiv({
    cls: "notepages-eraser-size-group"
  });

  const eraserSizes: { label: string; radius: number; title: string }[] = [
    { label: "S", radius: 6, title: "Small eraser (6px)" },
    { label: "M", radius: 12, title: "Medium eraser (12px)" },
    { label: "L", radius: 24, title: "Large eraser (24px)" }
  ];

  const currentRadius = delegate.getActiveEraserRadius ? delegate.getActiveEraserRadius() : 12;
  const eraserSizeButtons = new Map<number, HTMLElement>();

  for (const size of eraserSizes) {
    const btn = sizeWrapper.createEl("button", {
      cls: size.radius === currentRadius ? "notepages-eraser-size-btn is-active" : "notepages-eraser-size-btn",
      text: size.label
    });
    btn.setAttribute("title", size.title);
    eraserSizeButtons.set(size.radius, btn);
    delegate.registerDomEvent(btn, "click", () => {
      if (delegate.onSelectEraserRadius) {
        delegate.onSelectEraserRadius(size.radius);
      }
      callbacks.onEraserRadiusSelected(size.radius);
    });
  }

  const selectionActionsContainer = subToolbarEl.createDiv({
    cls: "notepages-palette-group notepages-subdock-group"
  });
  selectionActionsContainer.toggleClass("is-hidden", true);
  selectionActionsContainer.toggle(false);

  const selectionLassoBtn = selectionActionsContainer.createEl("button", {
    cls: "notepages-tool-button is-active"
  });
  setIcon(selectionLassoBtn, "lasso-select");
  selectionLassoBtn.setAttribute("title", "Lasso selection mode");
  delegate.registerDomEvent(selectionLassoBtn, "click", () => {
    callbacks.onSelectionSubModeSelected("lasso");
  });

  const selectionPanBtn = selectionActionsContainer.createEl("button", {
    cls: "notepages-tool-button"
  });
  setIcon(selectionPanBtn, "hand");
  selectionPanBtn.setAttribute("title", "Pan / scroll page mode");
  delegate.registerDomEvent(selectionPanBtn, "click", () => {
    callbacks.onSelectionSubModeSelected("pan");
  });

  const duplicateSelectionBtn = selectionActionsContainer.createEl("button", {
    cls: "notepages-tool-button"
  });
  setIcon(duplicateSelectionBtn, "copy");
  duplicateSelectionBtn.setAttribute("title", "Duplicate selection (Ctrl+D)");
  delegate.registerDomEvent(duplicateSelectionBtn, "click", () => {
    delegate.onDuplicateSelection();
  });

  const deleteSelectionBtn = selectionActionsContainer.createEl("button", {
    cls: "notepages-tool-button notepages-danger-action"
  });
  setIcon(deleteSelectionBtn, "trash-2");
  deleteSelectionBtn.setAttribute("title", "Delete selection (del)");
  delegate.registerDomEvent(deleteSelectionBtn, "click", () => {
    delegate.onDeleteSelection();
  });

  return {
    penPresetsContainer,
    renderPenPresets,
    textControlsContainer,
    textSizeSelect,
    textBoldBtn,
    textItalicBtn,
    textUnderlineBtn,
    textAlignSelect,
    textDoneBtn,
    shapeControlsContainer,
    shapeButtons,
    shapeFillBtn,
    stickyControlsContainer,
    stickyChips,
    colorPaletteContainer,
    colorChips,
    colorPickerInput,
    widthSelectorContainer,
    widthButtons,
    widthPresetButtons,
    widthSliderInput,
    widthNumberInput,
    widthValueBadge,
    widthPreviewDot,
    strokePatternContainer,
    strokePatternButtons,
    eraserControlsContainer,
    strokeEraserBtn,
    precisionEraserBtn,
    eraserSizeButtons,
    selectionActionsContainer,
    selectionLassoBtn,
    selectionPanBtn,
    duplicateSelectionBtn,
    deleteSelectionBtn
  };
}
