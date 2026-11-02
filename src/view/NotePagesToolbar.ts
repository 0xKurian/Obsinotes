import { setIcon } from "obsidian";
import {
  EraserMode,
  PageOrientation,
  PaperTemplateType,
  ShapeType,
  ToolType
} from "../types";

export interface NotePagesToolbarDelegate {
  onToggleSidebar(): void;
  onUndo(): void;
  onRedo(): void;
  onSelectTool(tool: ToolType): void;
  onSelectColor(color: string): void;
  onSelectWidth(width: number): void;
  onSelectEraserMode(mode: EraserMode): void;
  onDuplicateSelection(): void;
  onDeleteSelection(): void;
  onSelectPaperTemplate(type: PaperTemplateType): void;
  onToggleOrientation(): void;
  onChangeZoom(delta: number): void;
  onResetZoom(): void;
  onOpenPdfPicker(): void;
  onExportNotebook(): void;
  onAddNewPage(): void;
  onDuplicateCurrentPage(): void;
  onDeleteCurrentPage(): void;
  onTextSizeChanged(size: number): void;
  onTextBoldToggled(): void;
  onTextItalicToggled(): void;
  onTextUnderlineToggled(): void;
  onTextAlignChanged(align: "left" | "center" | "right"): void;
  onTextDone(): void;
  onSelectShapeType(shape: ShapeType): void;
  onToggleShapeFill(): boolean;
  onSelectStickyColor(color: string): void;
  getNotebookTemplate(): { type: PaperTemplateType };
  getNotebookOrientation(): PageOrientation;
  getZoomLevel(): number;
  getActiveTool(): ToolType;
  getActiveColor(): string;
  getActiveWidth(): number;
  getCurrentShapeType(): ShapeType;
  isShapeFillEnabled(): boolean;
  getCurrentStickyColor(): string;
  getTextOptions(): {
    fontSize: number;
    fontWeight: string;
    italic: boolean;
    underline: boolean;
    textAlign: "left" | "center" | "right";
  };
  registerDomEvent<K extends keyof HTMLElementEventMap>(
    el: HTMLElement,
    type: K,
    callback: (ev: HTMLElementEventMap[K]) => void
  ): void;
}

export class NotePagesToolbar {
  private delegate: NotePagesToolbarDelegate;
  toolbarEl!: HTMLElement;
  undoBtn!: HTMLButtonElement;
  redoBtn!: HTMLButtonElement;
  toolButtons: Map<ToolType, HTMLElement> = new Map();
  textControlsContainer!: HTMLElement;
  textSizeSelect!: HTMLSelectElement;
  textBoldBtn!: HTMLButtonElement;
  textItalicBtn!: HTMLButtonElement;
  textUnderlineBtn!: HTMLButtonElement;
  textAlignSelect!: HTMLSelectElement;
  textDoneBtn!: HTMLButtonElement;
  shapeControlsContainer!: HTMLElement;
  shapeButtons: Map<ShapeType, HTMLElement> = new Map();
  shapeFillBtn!: HTMLButtonElement;
  stickyControlsContainer!: HTMLElement;
  stickyChips: HTMLElement[] = [];
  colorPaletteContainer!: HTMLElement;
  colorChips: HTMLElement[] = [];
  colorPickerInput!: HTMLInputElement;
  widthSelectorContainer!: HTMLElement;
  widthButtons: HTMLElement[] = [];
  widthSliderInput!: HTMLInputElement;
  widthValueBadge!: HTMLElement;
  widthPreviewDot!: HTMLElement;
  eraserControlsContainer!: HTMLElement;
  strokeEraserBtn!: HTMLButtonElement;
  precisionEraserBtn!: HTMLButtonElement;
  selectionActionsContainer!: HTMLElement;
  duplicateSelectionBtn!: HTMLButtonElement;
  deleteSelectionBtn!: HTMLButtonElement;
  paperTemplateButtons: Map<PaperTemplateType, HTMLElement> = new Map();
  notebookOrientationBtn!: HTMLButtonElement;
  zoomResetBtn!: HTMLButtonElement;

  constructor(delegate: NotePagesToolbarDelegate) {
    this.delegate = delegate;
  }

  build(parentEl: HTMLElement): void {
    this.toolbarEl = parentEl.createDiv({
      cls: "notepages-toolbar"
    });

    const leftGroup = this.toolbarEl.createDiv({
      cls: "notepages-toolbar-left"
    });

    const sidebarToggleBtn = leftGroup.createEl("button", {
      cls: "notepages-tool-button"
    });
    setIcon(sidebarToggleBtn, "panel-left");
    sidebarToggleBtn.setAttribute("title", "Toggle pages sidebar (b)");
    this.delegate.registerDomEvent(sidebarToggleBtn, "click", () => {
      this.delegate.onToggleSidebar();
    });

    leftGroup.createDiv({ cls: "notepages-toolbar-separator" });

    this.undoBtn = leftGroup.createEl("button", {
      cls: "notepages-icon-btn"
    });
    setIcon(this.undoBtn, "undo");
    this.undoBtn.setAttribute("title", "Undo (Ctrl+Z)");
    this.undoBtn.disabled = true;
    this.delegate.registerDomEvent(this.undoBtn, "click", () => {
      this.delegate.onUndo();
    });

    this.redoBtn = leftGroup.createEl("button", {
      cls: "notepages-icon-btn"
    });
    setIcon(this.redoBtn, "redo");
    this.redoBtn.setAttribute("title", "Redo (Ctrl+Y)");
    this.redoBtn.disabled = true;
    this.delegate.registerDomEvent(this.redoBtn, "click", () => {
      this.delegate.onRedo();
    });

    leftGroup.createDiv({ cls: "notepages-toolbar-separator" });

    this.toolButtons.clear();
    const primaryTools: { type: ToolType; icon: string; title: string }[] = [
      { type: "select", icon: "mouse-pointer", title: "Select / Pan (V)" },
      { type: "pressure", icon: "pen-tool", title: "Pen (P)" },
      { type: "highlighter", icon: "highlighter", title: "Highlighter (H)" },
      { type: "eraser", icon: "eraser", title: "Eraser (E)" },
      { type: "shape", icon: "shapes", title: "Shapes (S)" },
      { type: "connector", icon: "arrow-up-right", title: "Line / Connector (L)" },
      { type: "sticky", icon: "sticky-note", title: "Sticky Note (N)" },
      { type: "text", icon: "type", title: "Text Box (T)" },
      { type: "image", icon: "image", title: "Insert Image (I)" },
      { type: "lasso", icon: "lasso-select", title: "Lasso Selection (Q)" }
    ];

    const currentActiveTool = this.delegate.getActiveTool();
    for (const tool of primaryTools) {
      const isInitiallyActive =
        tool.type === "pressure"
          ? (currentActiveTool === "pen" || currentActiveTool === "pressure" || currentActiveTool === "fountain")
          : tool.type === currentActiveTool;

      const btn = leftGroup.createEl("button", {
        cls: isInitiallyActive ? "notepages-tool-button is-active" : "notepages-tool-button"
      });
      setIcon(btn, tool.icon);
      btn.setAttribute("title", tool.title);
      this.toolButtons.set(tool.type, btn);

      this.delegate.registerDomEvent(btn, "click", () => {
        this.delegate.onSelectTool(tool.type);
      });
    }

    leftGroup.createDiv({ cls: "notepages-toolbar-separator" });

    this.textControlsContainer = leftGroup.createDiv({
      cls: "notepages-palette-group"
    });
    this.textControlsContainer.style.display = currentActiveTool === "text" ? "flex" : "none";

    const textOpts = this.delegate.getTextOptions();
    this.textSizeSelect = this.textControlsContainer.createEl("select", {
      cls: "notepages-text-size-select"
    });
    this.textSizeSelect.setAttribute("title", "Font size");
    const fontSizes = [12, 14, 16, 18, 20, 24, 28, 32, 36, 48];
    for (const size of fontSizes) {
      const opt = this.textSizeSelect.createEl("option", {
        value: String(size),
        text: `${size}pt`
      });
      if (size === textOpts.fontSize) {
        opt.selected = true;
      }
    }
    this.delegate.registerDomEvent(this.textSizeSelect, "change", () => {
      this.delegate.onTextSizeChanged(Number(this.textSizeSelect.value));
    });

    this.textBoldBtn = this.textControlsContainer.createEl("button", {
      cls: textOpts.fontWeight === "bold" ? "notepages-tool-button is-active" : "notepages-tool-button"
    });
    this.textBoldBtn.setAttribute("title", "Bold (Ctrl+B)");
    this.textBoldBtn.createEl("strong", { text: "B" });
    this.delegate.registerDomEvent(this.textBoldBtn, "click", () => {
      this.delegate.onTextBoldToggled();
    });

    this.textItalicBtn = this.textControlsContainer.createEl("button", {
      cls: textOpts.italic ? "notepages-tool-button is-active" : "notepages-tool-button"
    });
    this.textItalicBtn.setAttribute("title", "Italic (Ctrl+I)");
    this.textItalicBtn.createEl("em", { text: "I" });
    this.delegate.registerDomEvent(this.textItalicBtn, "click", () => {
      this.delegate.onTextItalicToggled();
    });

    this.textUnderlineBtn = this.textControlsContainer.createEl("button", {
      cls: textOpts.underline ? "notepages-tool-button is-active" : "notepages-tool-button"
    });
    this.textUnderlineBtn.setAttribute("title", "Underline (Ctrl+U)");
    this.textUnderlineBtn.createEl("u", { text: "U" });
    this.delegate.registerDomEvent(this.textUnderlineBtn, "click", () => {
      this.delegate.onTextUnderlineToggled();
    });

    this.textAlignSelect = this.textControlsContainer.createEl("select", {
      cls: "notepages-text-align-select"
    });
    this.textAlignSelect.setAttribute("title", "Text alignment");
    const aligns: Array<"left" | "center" | "right"> = ["left", "center", "right"];
    for (const align of aligns) {
      const opt = this.textAlignSelect.createEl("option", {
        value: align,
        text: align.charAt(0).toUpperCase() + align.slice(1)
      });
      if (align === textOpts.textAlign) {
        opt.selected = true;
      }
    }
    this.delegate.registerDomEvent(this.textAlignSelect, "change", () => {
      this.delegate.onTextAlignChanged(this.textAlignSelect.value as "left" | "center" | "right");
    });

    this.textDoneBtn = this.textControlsContainer.createEl("button", {
      cls: "notepages-tool-button"
    });
    this.textDoneBtn.setAttribute("title", "Finish editing (Ctrl+Enter / Esc)");
    setIcon(this.textDoneBtn, "check");
    this.delegate.registerDomEvent(this.textDoneBtn, "click", () => {
      this.delegate.onTextDone();
    });

    this.shapeControlsContainer = leftGroup.createDiv({
      cls: "notepages-palette-group"
    });
    this.shapeControlsContainer.style.display = currentActiveTool === "shape" ? "flex" : "none";

    this.shapeButtons.clear();
    const shapeDefs: { type: ShapeType; icon: string; title: string }[] = [
      { type: "rectangle", icon: "square", title: "Rectangle" },
      { type: "rounded-rectangle", icon: "box", title: "Rounded Rectangle" },
      { type: "circle", icon: "circle", title: "Circle" },
      { type: "triangle", icon: "triangle", title: "Triangle" },
      { type: "diamond", icon: "gem", title: "Diamond" },
      { type: "star", icon: "star", title: "Star" },
      { type: "callout", icon: "message-square", title: "Speech Bubble" }
    ];

    const currentShape = this.delegate.getCurrentShapeType();
    for (const def of shapeDefs) {
      const btn = this.shapeControlsContainer.createEl("button", {
        cls: def.type === currentShape ? "notepages-tool-button is-active" : "notepages-tool-button"
      });
      setIcon(btn, def.icon);
      btn.setAttribute("title", def.title);
      this.shapeButtons.set(def.type, btn);

      this.delegate.registerDomEvent(btn, "click", () => {
        this.delegate.onSelectShapeType(def.type);
        this.setShapeType(def.type);
      });
    }

    this.shapeFillBtn = this.shapeControlsContainer.createEl("button", {
      cls: this.delegate.isShapeFillEnabled() ? "notepages-tool-button is-active" : "notepages-tool-button"
    });
    this.shapeFillBtn.setAttribute("title", "Toggle shape fill");
    setIcon(this.shapeFillBtn, "paint-bucket");
    this.delegate.registerDomEvent(this.shapeFillBtn, "click", () => {
      const filled = this.delegate.onToggleShapeFill();
      this.shapeFillBtn.toggleClass("is-active", filled);
    });

    this.stickyControlsContainer = leftGroup.createDiv({
      cls: "notepages-palette-group"
    });
    this.stickyControlsContainer.style.display = currentActiveTool === "sticky" ? "flex" : "none";

    const pastelColors = [
      { color: "#fef08a", title: "Yellow" },
      { color: "#bbf7d0", title: "Green" },
      { color: "#bfdbfe", title: "Blue" },
      { color: "#fbcfe8", title: "Pink" },
      { color: "#fed7aa", title: "Orange" },
      { color: "#e9d5ff", title: "Purple" }
    ];

    const currentStickyColor = this.delegate.getCurrentStickyColor();
    this.stickyChips = [];
    for (const item of pastelColors) {
      const chip = this.stickyControlsContainer.createEl("button", {
        cls: item.color === currentStickyColor ? "notepages-sticky-chip is-active" : "notepages-sticky-chip"
      });
      chip.style.backgroundColor = item.color;
      chip.setAttribute("title", `Sticky Note ${item.title}`);
      this.stickyChips.push(chip);

      this.delegate.registerDomEvent(chip, "click", () => {
        this.delegate.onSelectStickyColor(item.color);
        this.setStickyColor(item.color);
      });
    }

    const stickyDoneBtn = this.stickyControlsContainer.createEl("button", {
      cls: "notepages-tool-button"
    });
    stickyDoneBtn.setAttribute("title", "Finish editing (Ctrl+Enter / Esc)");
    setIcon(stickyDoneBtn, "check");
    this.delegate.registerDomEvent(stickyDoneBtn, "click", () => {
      this.delegate.onTextDone();
    });

    leftGroup.createDiv({ cls: "notepages-toolbar-separator" });

    this.colorPaletteContainer = leftGroup.createDiv({
      cls: "notepages-palette-group"
    });

    const colorPresets = [
      "#1e293b",
      "#2563eb",
      "#dc2626",
      "#16a34a",
      "#9333ea",
      "#f59e0b"
    ];

    const currentActiveColor = this.delegate.getActiveColor();
    this.colorChips = [];
    for (const color of colorPresets) {
      const chip = this.colorPaletteContainer.createEl("button", {
        cls: color === currentActiveColor ? "notepages-color-chip is-active" : "notepages-color-chip"
      });
      chip.style.backgroundColor = color;
      chip.setAttribute("title", `Select color ${color}`);
      this.colorChips.push(chip);

      this.delegate.registerDomEvent(chip, "click", () => {
        this.delegate.onSelectColor(color);
      });
    }

    const pickerWrapper = this.colorPaletteContainer.createDiv({
      cls: "notepages-color-picker-wrapper"
    });
    this.colorPickerInput = pickerWrapper.createEl("input", {
      cls: "notepages-color-picker-input",
      type: "color",
      value: currentActiveColor
    });
    this.colorPickerInput.setAttribute("title", "Custom color picker");

    this.delegate.registerDomEvent(this.colorPickerInput, "change", () => {
      this.delegate.onSelectColor(this.colorPickerInput.value);
    });

    leftGroup.createDiv({ cls: "notepages-toolbar-separator" });

    this.widthSelectorContainer = leftGroup.createDiv({
      cls: "notepages-palette-group"
    });

    const widthPresets: { width: number; dotSize: number; title: string }[] = [
      { width: 1.0, dotSize: 3, title: "Fine (1.0pt)" },
      { width: 2.5, dotSize: 6, title: "Medium (2.5pt)" },
      { width: 5.0, dotSize: 9, title: "Thick (5.0pt)" },
      { width: 10.0, dotSize: 13, title: "Marker (10.0pt)" },
      { width: 18.0, dotSize: 17, title: "Highlight (18.0pt)" }
    ];

    const currentActiveWidth = this.delegate.getActiveWidth();
    this.widthButtons = [];
    for (const preset of widthPresets) {
      const btn = this.widthSelectorContainer.createEl("button", {
        cls: preset.width === currentActiveWidth ? "notepages-width-btn is-active" : "notepages-width-btn"
      });
      btn.setAttribute("title", preset.title);
      const dot = btn.createDiv({ cls: "notepages-width-dot" });
      dot.style.width = `${preset.dotSize}px`;
      dot.style.height = `${preset.dotSize}px`;
      btn.dataset.width = String(preset.width);
      this.widthButtons.push(btn);

      this.delegate.registerDomEvent(btn, "click", () => {
        this.delegate.onSelectWidth(preset.width);
      });
    }

    const sliderWrapper = this.widthSelectorContainer.createDiv({
      cls: "notepages-width-slider-wrapper"
    });

    this.widthSliderInput = sliderWrapper.createEl("input", {
      cls: "notepages-width-slider",
      type: "range"
    });
    this.widthSliderInput.min = "0.5";
    this.widthSliderInput.max = "30";
    this.widthSliderInput.step = "0.5";
    this.widthSliderInput.value = String(currentActiveWidth);
    this.widthSliderInput.setAttribute("title", "Adjust stroke width (0.5 - 30 pt)");

    this.widthValueBadge = sliderWrapper.createSpan({
      cls: "notepages-width-badge",
      text: `${currentActiveWidth} pt`
    });
    this.widthValueBadge.setAttribute("title", "Current stroke width (scroll to adjust)");

    const previewWrapper = sliderWrapper.createDiv({
      cls: "notepages-width-preview-wrapper"
    });
    this.widthPreviewDot = previewWrapper.createDiv({
      cls: "notepages-width-preview-dot"
    });
    const previewSize = Math.min(18, Math.max(2, currentActiveWidth));
    this.widthPreviewDot.style.width = `${previewSize}px`;
    this.widthPreviewDot.style.height = `${previewSize}px`;
    this.widthPreviewDot.style.backgroundColor = this.delegate.getActiveColor();

    this.delegate.registerDomEvent(this.widthSliderInput, "input", () => {
      const val = Math.round(Number(this.widthSliderInput.value) * 10) / 10;
      this.delegate.onSelectWidth(val);
    });

    this.delegate.registerDomEvent(sliderWrapper, "wheel", (e: WheelEvent) => {
      e.preventDefault();
      const current = Number(this.widthSliderInput.value) || 2.5;
      const step = e.deltaY < 0 ? 0.5 : -0.5;
      const next = Math.max(0.5, Math.min(30, Math.round((current + step) * 10) / 10));
      this.delegate.onSelectWidth(next);
    });

    this.eraserControlsContainer = leftGroup.createDiv({
      cls: "notepages-palette-group"
    });
    this.eraserControlsContainer.toggle(false);

    this.strokeEraserBtn = this.eraserControlsContainer.createEl("button", {
      cls: "notepages-tool-button is-active"
    });
    setIcon(this.strokeEraserBtn, "eraser");
    this.strokeEraserBtn.setAttribute("title", "Stroke eraser (erase whole stroke upon contact)");

    this.precisionEraserBtn = this.eraserControlsContainer.createEl("button", {
      cls: "notepages-tool-button"
    });
    setIcon(this.precisionEraserBtn, "scissors");
    this.precisionEraserBtn.setAttribute("title", "Precision eraser (trim exact contact points)");

    this.delegate.registerDomEvent(this.strokeEraserBtn, "click", () => {
      this.delegate.onSelectEraserMode("stroke");
    });

    this.delegate.registerDomEvent(this.precisionEraserBtn, "click", () => {
      this.delegate.onSelectEraserMode("precision");
    });

    this.selectionActionsContainer = leftGroup.createDiv({
      cls: "notepages-palette-group"
    });
    this.selectionActionsContainer.toggle(false);

    this.duplicateSelectionBtn = this.selectionActionsContainer.createEl("button", {
      cls: "notepages-tool-button"
    });
    setIcon(this.duplicateSelectionBtn, "copy");
    this.duplicateSelectionBtn.setAttribute("title", "Duplicate selection (Ctrl+D)");
    this.delegate.registerDomEvent(this.duplicateSelectionBtn, "click", () => {
      this.delegate.onDuplicateSelection();
    });

    this.deleteSelectionBtn = this.selectionActionsContainer.createEl("button", {
      cls: "notepages-tool-button"
    });
    setIcon(this.deleteSelectionBtn, "trash-2");
    this.deleteSelectionBtn.setAttribute("title", "Delete selection (del)");
    this.delegate.registerDomEvent(this.deleteSelectionBtn, "click", () => {
      this.delegate.onDeleteSelection();
    });

    const rightGroup = this.toolbarEl.createDiv({
      cls: "notepages-toolbar-right"
    });

    const pageFormatGroup = rightGroup.createDiv({
      cls: "notepages-palette-group"
    });

    this.paperTemplateButtons.clear();
    const templateDefs: { type: PaperTemplateType; icon: string; title: string }[] = [
      { type: "ruled", icon: "align-justify", title: "Ruled Paper" },
      { type: "grid", icon: "grid", title: "Grid Paper" },
      { type: "dotted", icon: "more-horizontal", title: "Dotted Paper" },
      { type: "cornell", icon: "columns", title: "Cornell Paper" },
      { type: "blank", icon: "file", title: "Blank Paper" }
    ];

    const currentTpl = this.delegate.getNotebookTemplate();
    for (const t of templateDefs) {
      const btn = pageFormatGroup.createEl("button", {
        cls: t.type === currentTpl.type ? "notepages-tool-button is-active" : "notepages-tool-button"
      });
      setIcon(btn, t.icon);
      btn.setAttribute("title", t.title);
      this.paperTemplateButtons.set(t.type, btn);

      this.delegate.registerDomEvent(btn, "click", () => {
        this.delegate.onSelectPaperTemplate(t.type);
      });
    }

    const currentOrient = this.delegate.getNotebookOrientation();
    this.notebookOrientationBtn = pageFormatGroup.createEl("button", {
      cls: "notepages-tool-button"
    });
    const orientIcon = currentOrient === "portrait" ? "smartphone" : "monitor";
    setIcon(this.notebookOrientationBtn, orientIcon);
    this.notebookOrientationBtn.setAttribute(
      "title",
      `Rotate Page Orientation (R) - Currently ${currentOrient === "portrait" ? "Portrait" : "Landscape"}`
    );

    this.delegate.registerDomEvent(this.notebookOrientationBtn, "click", () => {
      this.delegate.onToggleOrientation();
    });

    rightGroup.createDiv({ cls: "notepages-toolbar-separator" });

    const zoomOutBtn = rightGroup.createEl("button", {
      cls: "notepages-tool-button"
    });
    setIcon(zoomOutBtn, "zoom-out");
    zoomOutBtn.setAttribute("title", "Zoom out (-)");
    this.delegate.registerDomEvent(zoomOutBtn, "click", () => {
      this.delegate.onChangeZoom(-0.1);
    });

    this.zoomResetBtn = rightGroup.createEl("button", {
      cls: "notepages-tool-button notepages-zoom-btn"
    });
    this.zoomResetBtn.setText(`${Math.round(this.delegate.getZoomLevel() * 100)}%`);
    this.zoomResetBtn.setAttribute("title", "Reset zoom to 100% (0)");
    this.delegate.registerDomEvent(this.zoomResetBtn, "click", () => {
      this.delegate.onResetZoom();
    });

    const zoomInBtn = rightGroup.createEl("button", {
      cls: "notepages-tool-button"
    });
    setIcon(zoomInBtn, "zoom-in");
    zoomInBtn.setAttribute("title", "Zoom in (+)");
    this.delegate.registerDomEvent(zoomInBtn, "click", () => {
      this.delegate.onChangeZoom(0.1);
    });

    const importPdfBtn = rightGroup.createEl("button", {
      cls: "notepages-tool-button"
    });
    setIcon(importPdfBtn, "file-up");
    importPdfBtn.setAttribute("title", "Import document (PDF / SVG)");
    this.delegate.registerDomEvent(importPdfBtn, "click", () => {
      this.delegate.onOpenPdfPicker();
    });

    const exportBtn = rightGroup.createEl("button", {
      cls: "notepages-tool-button"
    });
    setIcon(exportBtn, "file-down");
    exportBtn.setAttribute("title", "Export notebook (PDF / PNG / SVG)");
    this.delegate.registerDomEvent(exportBtn, "click", () => {
      this.delegate.onExportNotebook();
    });

    const addPageBtn = rightGroup.createEl("button", {
      cls: "notepages-tool-button"
    });
    setIcon(addPageBtn, "file-plus");
    addPageBtn.setAttribute("title", "Add new page (a)");
    this.delegate.registerDomEvent(addPageBtn, "click", () => {
      this.delegate.onAddNewPage();
    });

    const duplicatePageBtn = rightGroup.createEl("button", {
      cls: "notepages-tool-button"
    });
    setIcon(duplicatePageBtn, "copy");
    duplicatePageBtn.setAttribute("title", "Duplicate current page");
    this.delegate.registerDomEvent(duplicatePageBtn, "click", () => {
      this.delegate.onDuplicateCurrentPage();
    });

    const deletePageBtn = rightGroup.createEl("button", {
      cls: "notepages-tool-button"
    });
    setIcon(deletePageBtn, "trash-2");
    deletePageBtn.setAttribute("title", "Delete current page");
    this.delegate.registerDomEvent(deletePageBtn, "click", () => {
      this.delegate.onDeleteCurrentPage();
    });
  }

  setActiveTool(tool: ToolType, currentShapeType: ShapeType, hasSelection: boolean): void {
    const isPen = tool === "pen" || tool === "pressure" || tool === "fountain";

    this.toolButtons.forEach((btn, t) => {
      if (t === "pressure" || t === "pen") {
        if (isPen) {
          btn.addClass("is-active");
        } else {
          btn.removeClass("is-active");
        }
      } else {
        if (t === tool) {
          btn.addClass("is-active");
        } else {
          btn.removeClass("is-active");
        }
      }
    });

    const usesPenColors = isPen || tool === "shape" || tool === "connector" || tool === "highlighter" || tool === "text";
    if (this.colorPaletteContainer) {
      this.colorPaletteContainer.style.display = usesPenColors ? "flex" : "none";
    }
    if (this.widthSelectorContainer) {
      this.widthSelectorContainer.style.display = (isPen || tool === "shape" || tool === "connector" || tool === "highlighter") ? "flex" : "none";
    }
    if (this.eraserControlsContainer) {
      this.eraserControlsContainer.style.display = tool === "eraser" ? "flex" : "none";
    }
    if (this.selectionActionsContainer) {
      this.selectionActionsContainer.style.display = (tool === "lasso" && hasSelection) ? "flex" : "none";
    }
    if (this.textControlsContainer) {
      this.textControlsContainer.style.display = tool === "text" ? "flex" : "none";
    }
    if (this.shapeControlsContainer) {
      this.shapeControlsContainer.style.display = tool === "shape" ? "flex" : "none";
    }
    if (tool === "shape") {
      this.shapeButtons.forEach((b, t) => {
        b.toggleClass("is-active", t === currentShapeType);
      });
    }
    if (this.stickyControlsContainer) {
      this.stickyControlsContainer.style.display = tool === "sticky" ? "flex" : "none";
    }
  }

  setActiveColor(color: string): void {
    for (const chip of this.colorChips) {
      if (chip.style.backgroundColor === color || this.normalizeColor(chip.style.backgroundColor) === color) {
        chip.addClass("is-active");
      } else {
        chip.removeClass("is-active");
      }
    }
    if (this.colorPickerInput) {
      this.colorPickerInput.value = color;
    }
    if (this.widthPreviewDot) {
      this.widthPreviewDot.style.backgroundColor = color;
    }
  }

  setActiveWidth(width: number): void {
    for (const btn of this.widthButtons) {
      if (Number(btn.dataset.width) === width) {
        btn.addClass("is-active");
      } else {
        btn.removeClass("is-active");
      }
    }
    if (this.widthSliderInput) {
      this.widthSliderInput.value = String(width);
    }
    if (this.widthValueBadge) {
      this.widthValueBadge.setText(`${width} pt`);
    }
    if (this.widthPreviewDot) {
      const previewSize = Math.min(18, Math.max(2, width));
      this.widthPreviewDot.style.width = `${previewSize}px`;
      this.widthPreviewDot.style.height = `${previewSize}px`;
    }
  }

  setEraserMode(mode: EraserMode): void {
    if (this.strokeEraserBtn) {
      this.strokeEraserBtn.toggleClass("is-active", mode === "stroke");
    }
    if (this.precisionEraserBtn) {
      this.precisionEraserBtn.toggleClass("is-active", mode === "precision");
    }
  }

  setShapeType(shapeType: ShapeType): void {
    this.shapeButtons.forEach((b, t) => {
      b.toggleClass("is-active", t === shapeType);
    });
  }

  setShapeFill(filled: boolean): void {
    if (this.shapeFillBtn) {
      this.shapeFillBtn.toggleClass("is-active", filled);
    }
  }

  setStickyColor(color: string): void {
    for (const c of this.stickyChips) {
      c.toggleClass("is-active", c.style.backgroundColor === color || this.normalizeColor(c.style.backgroundColor) === color);
    }
  }

  updateHistoryButtons(canUndo: boolean, canRedo: boolean): void {
    if (this.undoBtn) {
      this.undoBtn.disabled = !canUndo;
    }
    if (this.redoBtn) {
      this.redoBtn.disabled = !canRedo;
    }
  }

  updateSelectionUi(hasSelection: boolean): void {
    if (this.selectionActionsContainer) {
      this.selectionActionsContainer.style.display = hasSelection ? "flex" : "none";
    }
  }

  updateOrientationButtonDisplay(orient: PageOrientation): void {
    if (this.notebookOrientationBtn) {
      const iconName = orient === "portrait" ? "smartphone" : "monitor";
      this.notebookOrientationBtn.empty();
      setIcon(this.notebookOrientationBtn, iconName);
      this.notebookOrientationBtn.setAttribute(
        "title",
        `Rotate Page Orientation (R) - Currently ${orient === "portrait" ? "Portrait" : "Landscape"}`
      );
    }
  }

  updatePaperTemplateButtons(activeType: PaperTemplateType): void {
    this.paperTemplateButtons.forEach((b, type) => {
      b.toggleClass("is-active", type === activeType);
    });
  }

  updateZoomDisplay(zoomLevel: number): void {
    if (this.zoomResetBtn) {
      this.zoomResetBtn.setText(`${Math.round(zoomLevel * 100)}%`);
    }
  }

  syncTextToolbar(formatting: {
    fontSize: number;
    fontWeight: string;
    italic: boolean;
    underline: boolean;
    textAlign: "left" | "center" | "right";
    color: string;
  }): void {
    if (this.textSizeSelect) {
      let hasOption = false;
      for (let i = 0; i < this.textSizeSelect.options.length; i++) {
        if (this.textSizeSelect.options[i].value === String(formatting.fontSize)) {
          hasOption = true;
          break;
        }
      }
      if (!hasOption) {
        const opt = this.textSizeSelect.createEl("option", {
          value: String(formatting.fontSize),
          text: `${formatting.fontSize}pt`
        });
        opt.selected = true;
      } else {
        this.textSizeSelect.value = String(formatting.fontSize);
      }
    }
    if (this.textBoldBtn) {
      this.textBoldBtn.toggleClass("is-active", formatting.fontWeight === "bold");
    }
    if (this.textItalicBtn) {
      this.textItalicBtn.toggleClass("is-active", formatting.italic);
    }
    if (this.textUnderlineBtn) {
      this.textUnderlineBtn.toggleClass("is-active", formatting.underline);
    }
    if (this.textAlignSelect) {
      this.textAlignSelect.value = formatting.textAlign;
    }
    this.setActiveColor(formatting.color);
  }

  private normalizeColor(c: string): string {
    const ctx = createEl("canvas").getContext("2d");
    if (!ctx) return c;
    ctx.fillStyle = c;
    return ctx.fillStyle;
  }
}
