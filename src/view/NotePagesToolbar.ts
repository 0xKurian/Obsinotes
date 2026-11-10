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
  onQuickRename(): void;
  getNotebookTitle(): string;
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
    el: HTMLElement | Window,
    type: K,
    callback: (ev: HTMLElementEventMap[K]) => void
  ): void;
}

export class NotePagesToolbar {
  private delegate: NotePagesToolbarDelegate;
  toolbarWrapperEl!: HTMLElement;
  toolbarEl!: HTMLElement;
  subToolbarEl!: HTMLElement;
  pagePopoverEl!: HTMLElement;
  collapseBtn!: HTMLButtonElement;
  pageMenuBtn!: HTMLButtonElement;
  isCollapsed: boolean = false;
  isPagePopoverOpen: boolean = false;
  private hasSelection: boolean = false;
  private currentTool: ToolType = "pressure";

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
  titleBtn!: HTMLButtonElement;
  titleTextEl!: HTMLElement;
  addPageBtn!: HTMLButtonElement;
  duplicatePageBtn!: HTMLButtonElement;
  deletePageBtn!: HTMLButtonElement;
  importPdfBtn!: HTMLButtonElement;

  constructor(delegate: NotePagesToolbarDelegate) {
    this.delegate = delegate;
  }

  build(parentEl: HTMLElement): void {
    this.toolbarWrapperEl = parentEl.createDiv({
      cls: "notepages-toolbar-float-wrapper"
    });

    this.toolbarEl = this.toolbarWrapperEl.createDiv({
      cls: "notepages-toolbar notepages-floating-dock"
    });

    this.subToolbarEl = this.toolbarWrapperEl.createDiv({
      cls: "notepages-subtoolbar-float"
    });

    this.pagePopoverEl = this.toolbarWrapperEl.createDiv({
      cls: "notepages-page-popover is-hidden"
    });

    this.buildMainDock();
    this.buildSubDock();
    this.buildPagePopover();
    this.registerGlobalEvents();

    const activeTool = this.delegate.getActiveTool();
    this.currentTool = activeTool;
    this.setActiveTool(activeTool, this.delegate.getCurrentShapeType(), false);
  }

  private buildMainDock(): void {
    const leftGroup = this.toolbarEl.createDiv({
      cls: "notepages-dock-section notepages-dock-left"
    });

    const sidebarToggleBtn = leftGroup.createEl("button", {
      cls: "notepages-tool-button"
    });
    setIcon(sidebarToggleBtn, "panel-left");
    sidebarToggleBtn.setAttribute("title", "Toggle pages sidebar (b)");
    this.delegate.registerDomEvent(sidebarToggleBtn, "click", () => {
      this.delegate.onToggleSidebar();
    });

    this.titleBtn = leftGroup.createEl("button", {
      cls: "notepages-title-btn"
    });
    this.titleBtn.setAttribute("title", "Quick rename notebook (f2)");
    this.titleTextEl = this.titleBtn.createSpan({
      cls: "notepages-title-text",
      text: this.delegate.getNotebookTitle() || "Untitled Notebook"
    });
    const editIconEl = this.titleBtn.createSpan({
      cls: "notepages-title-edit-icon"
    });
    setIcon(editIconEl, "pencil");
    this.delegate.registerDomEvent(this.titleBtn, "click", () => {
      this.delegate.onQuickRename();
    });

    leftGroup.createDiv({ cls: "notepages-toolbar-separator notepages-keep-collapsed" });

    this.undoBtn = leftGroup.createEl("button", {
      cls: "notepages-tool-button notepages-icon-btn"
    });
    setIcon(this.undoBtn, "undo");
    this.undoBtn.setAttribute("title", "Undo (Ctrl+Z)");
    this.undoBtn.disabled = true;
    this.delegate.registerDomEvent(this.undoBtn, "click", () => {
      this.delegate.onUndo();
    });

    this.redoBtn = leftGroup.createEl("button", {
      cls: "notepages-tool-button notepages-icon-btn"
    });
    setIcon(this.redoBtn, "redo");
    this.redoBtn.setAttribute("title", "Redo (Ctrl+Y)");
    this.redoBtn.disabled = true;
    this.delegate.registerDomEvent(this.redoBtn, "click", () => {
      this.delegate.onRedo();
    });

    this.toolbarEl.createDiv({ cls: "notepages-toolbar-separator" });

    const toolsGroup = this.toolbarEl.createDiv({
      cls: "notepages-dock-section notepages-dock-tools"
    });

    this.toolButtons.clear();
    const primaryTools: { type: ToolType; icon: string; title: string }[] = [
      { type: "select", icon: "mouse-pointer", title: "Select / Pan (V)" },
      { type: "pressure", icon: "pen-tool", title: "Pen (P)" },
      { type: "highlighter", icon: "highlighter", title: "Highlighter (H)" },
      { type: "eraser", icon: "eraser", title: "Eraser (E)" },
      { type: "shape", icon: "shapes", title: "Shapes (S)" },
      { type: "connector", icon: "arrow-up-right", title: "Line / Connector (C)" },
      { type: "sticky", icon: "sticky-note", title: "Sticky Note (N)" },
      { type: "text", icon: "type", title: "Text Box (T)" },
      { type: "image", icon: "image", title: "Insert Image (I)" },
      { type: "lasso", icon: "lasso-select", title: "Lasso Selection (L)" }
    ];

    const currentActiveTool = this.delegate.getActiveTool();
    for (const tool of primaryTools) {
      const isInitiallyActive =
        tool.type === "pressure"
          ? (currentActiveTool === "pen" || currentActiveTool === "pressure" || currentActiveTool === "fountain")
          : tool.type === currentActiveTool;

      const btn = toolsGroup.createEl("button", {
        cls: isInitiallyActive ? "notepages-tool-button is-active" : "notepages-tool-button"
      });
      setIcon(btn, tool.icon);
      btn.setAttribute("title", tool.title);
      this.toolButtons.set(tool.type, btn);

      this.delegate.registerDomEvent(btn, "click", () => {
        this.delegate.onSelectTool(tool.type);
      });
    }

    this.toolbarEl.createDiv({ cls: "notepages-toolbar-separator" });

    const rightGroup = this.toolbarEl.createDiv({
      cls: "notepages-dock-section notepages-dock-right"
    });

    this.pageMenuBtn = rightGroup.createEl("button", {
      cls: "notepages-tool-button notepages-dock-page-btn"
    });
    setIcon(this.pageMenuBtn, "layout-template");
    this.pageMenuBtn.setAttribute("title", "Paper templates & page management");
    this.delegate.registerDomEvent(this.pageMenuBtn, "click", (e: MouseEvent) => {
      e.stopPropagation();
      this.togglePagePopover();
    });

    const zoomGroup = rightGroup.createDiv({
      cls: "notepages-dock-zoom-group"
    });

    const zoomOutBtn = zoomGroup.createEl("button", {
      cls: "notepages-tool-button notepages-zoom-stepper-btn"
    });
    setIcon(zoomOutBtn, "zoom-out");
    zoomOutBtn.setAttribute("title", "Zoom out (-)");
    this.delegate.registerDomEvent(zoomOutBtn, "click", () => {
      this.delegate.onChangeZoom(-0.1);
    });

    this.zoomResetBtn = zoomGroup.createEl("button", {
      cls: "notepages-tool-button notepages-zoom-btn"
    });
    this.zoomResetBtn.setText(`${Math.round(this.delegate.getZoomLevel() * 100)}%`);
    this.zoomResetBtn.setAttribute("title", "Reset zoom to 100% (0)");
    this.delegate.registerDomEvent(this.zoomResetBtn, "click", () => {
      this.delegate.onResetZoom();
    });

    const zoomInBtn = zoomGroup.createEl("button", {
      cls: "notepages-tool-button notepages-zoom-stepper-btn"
    });
    setIcon(zoomInBtn, "zoom-in");
    zoomInBtn.setAttribute("title", "Zoom in (+)");
    this.delegate.registerDomEvent(zoomInBtn, "click", () => {
      this.delegate.onChangeZoom(0.1);
    });

    const exportBtn = rightGroup.createEl("button", {
      cls: "notepages-tool-button notepages-export-btn"
    });
    setIcon(exportBtn, "file-down");
    exportBtn.setAttribute("title", "Export notebook (PDF / PNG / SVG)");
    this.delegate.registerDomEvent(exportBtn, "click", () => {
      this.delegate.onExportNotebook();
    });

    rightGroup.createDiv({ cls: "notepages-toolbar-separator notepages-keep-collapsed" });

    this.collapseBtn = rightGroup.createEl("button", {
      cls: "notepages-tool-button notepages-collapse-btn notepages-keep-collapsed"
    });
    setIcon(this.collapseBtn, "chevron-up");
    this.collapseBtn.setAttribute("title", "Collapse toolbar (focus mode)");
    this.delegate.registerDomEvent(this.collapseBtn, "click", () => {
      this.toggleCollapse();
    });

    this.delegate.registerDomEvent(this.toolbarEl, "wheel", (e: WheelEvent) => {
      if (e.deltaY !== 0 && !e.shiftKey && this.toolbarEl.scrollWidth > this.toolbarEl.clientWidth) {
        this.toolbarEl.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    });
  }

  private buildSubDock(): void {
    const currentActiveTool = this.delegate.getActiveTool();

    this.textControlsContainer = this.subToolbarEl.createDiv({
      cls: "notepages-palette-group notepages-subdock-group"
    });
    this.textControlsContainer.toggleClass("is-hidden", currentActiveTool !== "text");
    this.textControlsContainer.toggle(currentActiveTool === "text");

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

    this.shapeControlsContainer = this.subToolbarEl.createDiv({
      cls: "notepages-palette-group notepages-subdock-group"
    });
    this.shapeControlsContainer.toggleClass("is-hidden", currentActiveTool !== "shape");
    this.shapeControlsContainer.toggle(currentActiveTool === "shape");

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

    this.stickyControlsContainer = this.subToolbarEl.createDiv({
      cls: "notepages-palette-group notepages-subdock-group"
    });
    this.stickyControlsContainer.toggleClass("is-hidden", currentActiveTool !== "sticky");
    this.stickyControlsContainer.toggle(currentActiveTool === "sticky");

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
      chip.setCssStyles({ backgroundColor: item.color });
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

    this.colorPaletteContainer = this.subToolbarEl.createDiv({
      cls: "notepages-palette-group notepages-subdock-group"
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
      chip.setCssStyles({ backgroundColor: color });
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

    this.widthSelectorContainer = this.subToolbarEl.createDiv({
      cls: "notepages-palette-group notepages-subdock-group"
    });

    const currentActiveWidth = this.delegate.getActiveWidth();
    this.widthButtons = [];

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
    this.widthPreviewDot.setCssStyles({
      width: `${previewSize}px`,
      height: `${previewSize}px`,
      backgroundColor: this.delegate.getActiveColor()
    });

    this.delegate.registerDomEvent(this.widthSliderInput, "input", () => {
      const val = Math.round(Number(this.widthSliderInput.value) * 10) / 10;
      this.delegate.onSelectWidth(val);
    });

    this.delegate.registerDomEvent(this.widthSliderInput, "change", () => {
      const val = Math.round(Number(this.widthSliderInput.value) * 10) / 10;
      this.delegate.onSelectWidth(val);
    });

    this.delegate.registerDomEvent(sliderWrapper, "wheel", (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const current = Number(this.widthSliderInput.value) || 2.5;
      const step = e.deltaY < 0 ? 0.5 : -0.5;
      const next = Math.max(0.5, Math.min(30, Math.round((current + step) * 10) / 10));
      this.delegate.onSelectWidth(next);
    });

    this.eraserControlsContainer = this.subToolbarEl.createDiv({
      cls: "notepages-palette-group notepages-subdock-group"
    });
    this.eraserControlsContainer.toggleClass("is-hidden", true);
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

    this.selectionActionsContainer = this.subToolbarEl.createDiv({
      cls: "notepages-palette-group notepages-subdock-group"
    });
    this.selectionActionsContainer.toggleClass("is-hidden", true);
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
      cls: "notepages-tool-button notepages-danger-action"
    });
    setIcon(this.deleteSelectionBtn, "trash-2");
    this.deleteSelectionBtn.setAttribute("title", "Delete selection (del)");
    this.delegate.registerDomEvent(this.deleteSelectionBtn, "click", () => {
      this.delegate.onDeleteSelection();
    });
  }

  private buildPagePopover(): void {
    const popoverHeader = this.pagePopoverEl.createDiv({
      cls: "notepages-popover-header"
    });
    popoverHeader.createSpan({
      cls: "notepages-popover-title",
      text: "Paper & Layout"
    });

    const templateSection = this.pagePopoverEl.createDiv({
      cls: "notepages-popover-section"
    });
    templateSection.createDiv({
      cls: "notepages-popover-section-label",
      text: "Paper Template"
    });

    const templateGrid = templateSection.createDiv({
      cls: "notepages-popover-grid"
    });

    this.paperTemplateButtons.clear();
    const templateDefs: { type: PaperTemplateType; icon: string; title: string }[] = [
      { type: "ruled", icon: "align-justify", title: "Ruled" },
      { type: "grid", icon: "grid", title: "Grid" },
      { type: "dotted", icon: "more-horizontal", title: "Dotted" },
      { type: "cornell", icon: "columns", title: "Cornell" },
      { type: "blank", icon: "file", title: "Blank" }
    ];

    const currentTpl = this.delegate.getNotebookTemplate();
    for (const t of templateDefs) {
      const btn = templateGrid.createEl("button", {
        cls: t.type === currentTpl.type ? "notepages-popover-item is-active" : "notepages-popover-item"
      });
      const iconSpan = btn.createSpan({ cls: "notepages-popover-item-icon" });
      setIcon(iconSpan, t.icon);
      btn.createSpan({ cls: "notepages-popover-item-text", text: t.title });
      btn.setAttribute("title", `${t.title} paper`);
      this.paperTemplateButtons.set(t.type, btn);

      this.delegate.registerDomEvent(btn, "click", () => {
        this.delegate.onSelectPaperTemplate(t.type);
        this.closePagePopover();
      });
    }

    const orientationSection = this.pagePopoverEl.createDiv({
      cls: "notepages-popover-section"
    });
    orientationSection.createDiv({
      cls: "notepages-popover-section-label",
      text: "Orientation"
    });

    const currentOrient = this.delegate.getNotebookOrientation();
    this.notebookOrientationBtn = orientationSection.createEl("button", {
      cls: "notepages-popover-row-btn"
    });
    const orientIconSpan = this.notebookOrientationBtn.createSpan({ cls: "notepages-popover-item-icon" });
    const orientIcon = currentOrient === "portrait" ? "smartphone" : "monitor";
    setIcon(orientIconSpan, orientIcon);
    this.notebookOrientationBtn.createSpan({
      cls: "notepages-popover-item-text",
      text: `Orientation: ${currentOrient === "portrait" ? "Portrait" : "Landscape"}`
    });
    this.notebookOrientationBtn.setAttribute(
      "title",
      `Rotate Page Orientation (R) - Currently ${currentOrient === "portrait" ? "Portrait" : "Landscape"}`
    );

    this.delegate.registerDomEvent(this.notebookOrientationBtn, "click", () => {
      this.delegate.onToggleOrientation();
      this.closePagePopover();
    });

    const pageActionSection = this.pagePopoverEl.createDiv({
      cls: "notepages-popover-section"
    });
    pageActionSection.createDiv({
      cls: "notepages-popover-section-label",
      text: "Page Actions"
    });

    const pageActionList = pageActionSection.createDiv({
      cls: "notepages-popover-actions-list"
    });

    this.addPageBtn = pageActionList.createEl("button", {
      cls: "notepages-popover-action-btn"
    });
    const addIconSpan = this.addPageBtn.createSpan({ cls: "notepages-popover-item-icon" });
    setIcon(addIconSpan, "file-plus");
    this.addPageBtn.createSpan({ text: "Add page below (A)" });
    this.delegate.registerDomEvent(this.addPageBtn, "click", () => {
      this.delegate.onAddNewPage();
      this.closePagePopover();
    });

    this.duplicatePageBtn = pageActionList.createEl("button", {
      cls: "notepages-popover-action-btn"
    });
    const dupIconSpan = this.duplicatePageBtn.createSpan({ cls: "notepages-popover-item-icon" });
    setIcon(dupIconSpan, "copy");
    this.duplicatePageBtn.createSpan({ text: "Duplicate current page" });
    this.delegate.registerDomEvent(this.duplicatePageBtn, "click", () => {
      this.delegate.onDuplicateCurrentPage();
      this.closePagePopover();
    });

    this.deletePageBtn = pageActionList.createEl("button", {
      cls: "notepages-popover-action-btn notepages-danger-action"
    });
    const delIconSpan = this.deletePageBtn.createSpan({ cls: "notepages-popover-item-icon" });
    setIcon(delIconSpan, "trash-2");
    this.deletePageBtn.createSpan({ text: "Delete current page" });
    this.delegate.registerDomEvent(this.deletePageBtn, "click", () => {
      this.delegate.onDeleteCurrentPage();
      this.closePagePopover();
    });

    const importSection = this.pagePopoverEl.createDiv({
      cls: "notepages-popover-section"
    });
    this.importPdfBtn = importSection.createEl("button", {
      cls: "notepages-popover-action-btn"
    });
    const importIconSpan = this.importPdfBtn.createSpan({ cls: "notepages-popover-item-icon" });
    setIcon(importIconSpan, "file-up");
    this.importPdfBtn.createSpan({ text: "Import document (PDF / SVG)" });
    this.delegate.registerDomEvent(this.importPdfBtn, "click", () => {
      this.delegate.onOpenPdfPicker();
      this.closePagePopover();
    });
  }

  private registerGlobalEvents(): void {
    if (typeof window === "undefined") {
      return;
    }
    this.delegate.registerDomEvent(window, "pointerdown", (e: PointerEvent) => {
      if (this.isPagePopoverOpen) {
        const target = e.target as Node;
        if (
          this.pagePopoverEl &&
          !this.pagePopoverEl.contains(target) &&
          this.pageMenuBtn &&
          !this.pageMenuBtn.contains(target)
        ) {
          this.closePagePopover();
        }
      }
    });
  }

  toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed;
    if (this.toolbarWrapperEl) {
      this.toolbarWrapperEl.toggleClass("is-dock-collapsed", this.isCollapsed);
    }
    if (this.collapseBtn) {
      this.collapseBtn.empty();
      setIcon(this.collapseBtn, this.isCollapsed ? "chevron-down" : "chevron-up");
      this.collapseBtn.setAttribute(
        "title",
        this.isCollapsed ? "Expand toolbar (focus mode off)" : "Collapse toolbar (focus mode on)"
      );
    }
    if (this.isCollapsed) {
      this.closePagePopover();
      if (this.subToolbarEl) {
        this.subToolbarEl.addClass("is-hidden");
        this.subToolbarEl.toggle(false);
      }
    } else {
      this.setActiveTool(this.currentTool, this.delegate.getCurrentShapeType(), this.hasSelection);
    }
  }

  togglePagePopover(): void {
    if (this.isPagePopoverOpen) {
      this.closePagePopover();
    } else {
      this.openPagePopover();
    }
  }

  openPagePopover(): void {
    if (this.pagePopoverEl) {
      this.pagePopoverEl.removeClass("is-hidden");
      this.isPagePopoverOpen = true;
      if (this.pageMenuBtn) {
        this.pageMenuBtn.addClass("is-active");
      }
    }
  }

  closePagePopover(): void {
    if (this.pagePopoverEl) {
      this.pagePopoverEl.addClass("is-hidden");
      this.isPagePopoverOpen = false;
      if (this.pageMenuBtn) {
        this.pageMenuBtn.removeClass("is-active");
      }
    }
  }

  setDrawingActive(isDrawing: boolean): void {
    if (this.toolbarWrapperEl) {
      this.toolbarWrapperEl.toggleClass("is-drawing", isDrawing);
    }
  }

  updateTitle(newTitle: string): void {
    if (this.titleTextEl) {
      this.titleTextEl.setText(newTitle || "Untitled Notebook");
    }
  }

  setActiveTool(tool: ToolType, currentShapeType: ShapeType, hasSelection: boolean): void {
    this.currentTool = tool;
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
      this.colorPaletteContainer.toggleClass("is-hidden", !usesPenColors);
      this.colorPaletteContainer.toggle(usesPenColors);
    }
    if (this.widthSelectorContainer) {
      const showWidth = isPen || tool === "shape" || tool === "connector" || tool === "highlighter";
      this.widthSelectorContainer.toggleClass("is-hidden", !showWidth);
      this.widthSelectorContainer.toggle(showWidth);
    }
    if (this.eraserControlsContainer) {
      this.eraserControlsContainer.toggleClass("is-hidden", tool !== "eraser");
      this.eraserControlsContainer.toggle(tool === "eraser");
    }
    if (this.selectionActionsContainer) {
      const showSelection = tool === "lasso" && hasSelection;
      this.selectionActionsContainer.toggleClass("is-hidden", !showSelection);
      this.selectionActionsContainer.toggle(showSelection);
    }
    if (this.textControlsContainer) {
      this.textControlsContainer.toggleClass("is-hidden", tool !== "text");
      this.textControlsContainer.toggle(tool === "text");
    }
    if (this.shapeControlsContainer) {
      this.shapeControlsContainer.toggleClass("is-hidden", tool !== "shape");
      this.shapeControlsContainer.toggle(tool === "shape");
    }
    if (tool === "shape") {
      this.shapeButtons.forEach((b, t) => {
        b.toggleClass("is-active", t === currentShapeType);
      });
    }
    if (this.stickyControlsContainer) {
      this.stickyControlsContainer.toggleClass("is-hidden", tool !== "sticky");
      this.stickyControlsContainer.toggle(tool === "sticky");
    }

    const needsSubToolbar =
      isPen ||
      tool === "shape" ||
      tool === "connector" ||
      tool === "highlighter" ||
      tool === "text" ||
      tool === "sticky" ||
      tool === "eraser" ||
      (tool === "lasso" && hasSelection);

    if (this.subToolbarEl) {
      const showSub = Boolean(needsSubToolbar && !this.isCollapsed);
      this.subToolbarEl.toggleClass("is-hidden", !showSub);
      this.subToolbarEl.toggle(showSub);
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
      this.widthPreviewDot.setCssStyles({ backgroundColor: color });
    }
  }

  setActiveWidth(width: number): void {
    const rounded = Math.round(width * 10) / 10;
    if (this.widthSliderInput) {
      this.widthSliderInput.value = String(rounded);
    }
    if (this.widthValueBadge) {
      this.widthValueBadge.setText(`${rounded} pt`);
    }
    if (this.widthPreviewDot) {
      const previewSize = Math.min(18, Math.max(2, rounded));
      this.widthPreviewDot.setCssStyles({
        width: `${previewSize}px`,
        height: `${previewSize}px`
      });
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
    this.hasSelection = hasSelection;
    if (this.selectionActionsContainer) {
      this.selectionActionsContainer.toggleClass("is-hidden", !hasSelection);
      this.selectionActionsContainer.toggle(hasSelection);
    }
    if (this.currentTool === "lasso" && this.subToolbarEl && !this.isCollapsed) {
      this.subToolbarEl.toggleClass("is-hidden", !hasSelection);
      this.subToolbarEl.toggle(hasSelection);
    }
  }

  updateOrientationButtonDisplay(orient: PageOrientation): void {
    if (this.notebookOrientationBtn) {
      const iconName = orient === "portrait" ? "smartphone" : "monitor";
      this.notebookOrientationBtn.empty();
      const iconSpan = this.notebookOrientationBtn.createSpan({ cls: "notepages-popover-item-icon" });
      setIcon(iconSpan, iconName);
      this.notebookOrientationBtn.createSpan({
        cls: "notepages-popover-item-text",
        text: `Orientation: ${orient === "portrait" ? "Portrait" : "Landscape"}`
      });
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
