import { setIcon } from "obsidian";
import {
  EraserMode,
  HotkeyActionId,
  PageOrientation,
  PageSizePreset,
  PaperTemplateType,
  PenPreset,
  SelectionSubMode,
  ShapeType,
  StrokePattern,
  ToolbarLayoutConfig,
  ToolbarPlacement,
  ToolType
} from "../types";
import { ToolbarDragResizeController } from "./toolbar/ToolbarDragResizeController";
import { buildToolbarSubDock } from "./toolbar/ToolbarSubDockBuilder";
import { buildPagePopover, buildToolbarPopover } from "./toolbar/ToolbarPopoverBuilder";

export interface NotePagesToolbarDelegate {
  onToggleSidebar(): void;
  onQuickRename(): void;
  getNotebookTitle(): string;
  onUndo(): void;
  onRedo(): void;
  onSelectTool(tool: ToolType): void;
  onSelectColor(color: string): void;
  onSelectWidth(width: number): void;
  onSelectStrokePattern?(pattern: StrokePattern): void;
  getStrokePattern?(): StrokePattern;
  getPenPresets?(): PenPreset[];
  onSelectPenPreset?(preset: PenPreset): void;
  onSavePenPreset?(index: number): void;
  onOpenGridOverview?(): void;
  onToggleRuler?(): boolean;
  isRulerVisible?(): boolean;
  onSelectEraserMode(mode: EraserMode): void;
  onSelectEraserRadius?(radius: number): void;
  getActiveEraserRadius?(): number;
  onSetSelectionSubMode?(mode: SelectionSubMode): void;
  getActiveSelectionSubMode?(): SelectionSubMode;
  onDuplicateSelection(): void;
  onDeleteSelection(): void;
  onSelectPaperTemplate(type: PaperTemplateType): void;
  onToggleOrientation(): void;
  onChangeZoom(delta: number): void;
  onResetZoom(): void;
  onOpenPdfPicker(): void;
  onOpenProperties?(): void;
  onExportNotebook(): void;
  onAddNewPage(): void;
  onDuplicateCurrentPage(): void;
  onDeleteCurrentPage(): void;
  onOpenPageSizeModal?(): void;
  onSelectPagePreset?(preset: PageSizePreset): void;
  onSelectPaperColor?(color: string): void;
  onSelectLineColor?(color: string): void;
  getNotebookPaperColor?(): string | undefined;
  getNotebookLineColor?(): string | undefined;
  getNotebookPageSize?(): PageSizePreset;
  onSetToolbarPlacement?(placement: ToolbarPlacement): void;
  getToolbarPlacement?(): ToolbarPlacement;
  getToolbarLayoutConfig?(): ToolbarLayoutConfig;
  onUpdateToolbarLayoutConfig?(partial: Partial<ToolbarLayoutConfig>): void;
  getToolbarFloatingPos?(): { left: number; top: number } | null;
  onSetToolbarFloatingPos?(pos: { left: number; top: number } | null): void;
  shouldDimToolbarWhileDrawing?(): boolean;
  shouldSuppressToolbarContextMenu?(e: MouseEvent): boolean;
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
  private dragResizeController: ToolbarDragResizeController;
  toolbarWrapperEl!: HTMLElement;
  toolbarEl!: HTMLElement;
  subToolbarEl!: HTMLElement;
  pagePopoverEl!: HTMLElement;
  toolbarPopoverEl!: HTMLElement;
  collapseBtn!: HTMLButtonElement;
  pageMenuBtn!: HTMLButtonElement;
  isCollapsed: boolean = false;
  isPagePopoverOpen: boolean = false;
  isToolbarPopoverOpen: boolean = false;
  private hasSelection: boolean = false;
  private currentTool: ToolType = "pressure";

  currentPlacement: ToolbarPlacement = "top";
  layoutConfig: ToolbarLayoutConfig = {
    scale: 1.0,
    maxWidth: null,
    wrap: false,
    showTitle: true,
    showZoomControls: true
  };
  private dragHandleEl?: HTMLElement;
  private hostParentEl?: HTMLElement;
  private toolbarTitleToggleBtn?: HTMLElement;
  private toolbarZoomToggleBtn?: HTMLElement;
  private dockPlacementButtons: Map<ToolbarPlacement, HTMLElement> = new Map();

  undoBtn!: HTMLButtonElement;
  redoBtn!: HTMLButtonElement;
  sidebarToggleBtn!: HTMLButtonElement;
  zoomOutBtn!: HTMLButtonElement;
  zoomInBtn!: HTMLButtonElement;
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
  widthPresetButtons: Map<number, HTMLElement> = new Map();
  widthSliderInput!: HTMLInputElement;
  widthNumberInput!: HTMLInputElement;
  widthValueBadge!: HTMLElement;
  widthPreviewDot!: HTMLElement;
  strokePatternContainer!: HTMLElement;
  strokePatternButtons: Map<StrokePattern, HTMLElement> = new Map();
  penPresetsContainer!: HTMLElement;
  private renderPenPresetsFn?: (
    presets: PenPreset[],
    activeTool: string,
    activeColor: string,
    activeWidth: number,
    activePattern: StrokePattern
  ) => void;
  rulerBtn!: HTMLButtonElement;
  eraserControlsContainer!: HTMLElement;
  strokeEraserBtn!: HTMLButtonElement;
  precisionEraserBtn!: HTMLButtonElement;
  eraserSizeButtons: Map<number, HTMLElement> = new Map();
  selectionActionsContainer!: HTMLElement;
  selectionLassoBtn!: HTMLButtonElement;
  selectionPanBtn!: HTMLButtonElement;
  duplicateSelectionBtn!: HTMLButtonElement;
  deleteSelectionBtn!: HTMLButtonElement;
  paperTemplateButtons: Map<PaperTemplateType, HTMLElement> = new Map();
  pageSizeButtons: Map<PageSizePreset, HTMLElement> = new Map();
  paperColorSwatches: Map<string, HTMLElement> = new Map();
  customPaperInput?: HTMLInputElement;
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
    this.dragResizeController = new ToolbarDragResizeController({
      getWrapperEl: () => this.toolbarWrapperEl,
      getToolbarEl: () => this.toolbarEl,
      getPlacement: () => this.currentPlacement,
      getLayoutConfig: () => this.layoutConfig,
      setPlacement: (placement, notify) => this.setPlacement(placement, notify),
      applyLayoutConfig: (config) => this.applyLayoutConfig(config),
      updateLayoutConfig: (partial) => this.updateLayoutConfig(partial),
      toggleToolbarPopover: () => this.toggleToolbarPopover(),
      onSetToolbarFloatingPos: (pos) => this.delegate.onSetToolbarFloatingPos?.(pos),
      registerDomEvent: (el, type, cb) => this.delegate.registerDomEvent(el, type, cb)
    });
  }

  build(parentEl: HTMLElement): void {
    this.hostParentEl = parentEl;
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

    this.toolbarPopoverEl = parentEl.createDiv({
      cls: "notepages-page-popover notepages-toolbar-popover is-hidden"
    });

    const initPlacement = this.delegate.getToolbarPlacement ? this.delegate.getToolbarPlacement() || "top" : "top";
    this.setPlacement(initPlacement, false);

    const initLayout = this.delegate.getToolbarLayoutConfig?.();
    if (initLayout) {
      this.layoutConfig = { ...initLayout };
    }

    this.buildMainDock();
    this.buildSubDock();
    this.buildPopovers();
    this.applyLayoutConfig(this.layoutConfig);
    this.registerGlobalEvents();

    const activeTool = this.delegate.getActiveTool();
    this.currentTool = activeTool;
    this.setActiveTool(activeTool, this.delegate.getCurrentShapeType(), false);
  }

  private buildMainDock(): void {
    this.delegate.registerDomEvent(this.toolbarEl, "contextmenu", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.delegate.shouldSuppressToolbarContextMenu?.(e)) {
        return;
      }
      this.toggleToolbarPopover();
    });

    const leftGroup = this.toolbarEl.createDiv({
      cls: "notepages-dock-section notepages-dock-left"
    });

    const dragHandle = leftGroup.createDiv({
      cls: "notepages-dock-drag-handle",
      title: "Drag to move (top, bottom, left, right) · Click for toolbar settings"
    });
    this.dragHandleEl = dragHandle;
    setIcon(dragHandle, "grip-vertical");
    this.dragResizeController.setupToolbarDrag(dragHandle);

    this.sidebarToggleBtn = leftGroup.createEl("button", {
      cls: "notepages-tool-button"
    });
    setIcon(this.sidebarToggleBtn, "panel-left");
    this.sidebarToggleBtn.setAttribute("title", "Toggle pages sidebar (b)");
    this.delegate.registerDomEvent(this.sidebarToggleBtn, "click", () => {
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
      { type: "lasso", icon: "lasso-select", title: "Select & Pan (L, V)" },
      { type: "pressure", icon: "pen-tool", title: "Pen (P)" },
      { type: "pencil", icon: "pencil", title: "Pencil (G)" },
      { type: "highlighter", icon: "highlighter", title: "Highlighter (H)" },
      { type: "eraser", icon: "eraser", title: "Eraser (E)" },
      { type: "shape", icon: "shapes", title: "Shapes (S)" },
      { type: "connector", icon: "arrow-up-right", title: "Line / Connector (C)" },
      { type: "sticky", icon: "sticky-note", title: "Sticky Note (N)" },
      { type: "text", icon: "type", title: "Text Box (T)" },
      { type: "image", icon: "image", title: "Insert Image (I)" }
    ];

    const currentActiveTool = this.delegate.getActiveTool();
    for (const tool of primaryTools) {
      const isInitiallyActive =
        tool.type === "pressure"
          ? currentActiveTool === "pen" || currentActiveTool === "pressure" || currentActiveTool === "fountain"
          : tool.type === "lasso"
            ? currentActiveTool === "lasso" || currentActiveTool === "select"
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

    this.rulerBtn = rightGroup.createEl("button", {
      cls: this.delegate.isRulerVisible?.() ? "notepages-tool-button is-active" : "notepages-tool-button"
    });
    setIcon(this.rulerBtn, "ruler");
    this.rulerBtn.setAttribute("title", "Toggle ruler straightedge (u)");
    this.delegate.registerDomEvent(this.rulerBtn, "click", () => {
      const visible = this.delegate.onToggleRuler?.() ?? false;
      this.setRulerActive(visible);
    });

    const zoomGroup = rightGroup.createDiv({
      cls: "notepages-dock-zoom-group"
    });

    this.zoomOutBtn = zoomGroup.createEl("button", {
      cls: "notepages-tool-button notepages-zoom-stepper-btn"
    });
    setIcon(this.zoomOutBtn, "zoom-out");
    this.zoomOutBtn.setAttribute("title", "Zoom out (-)");
    this.delegate.registerDomEvent(this.zoomOutBtn, "click", () => {
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

    this.zoomInBtn = zoomGroup.createEl("button", {
      cls: "notepages-tool-button notepages-zoom-stepper-btn"
    });
    setIcon(this.zoomInBtn, "zoom-in");
    this.zoomInBtn.setAttribute("title", "Zoom in (+)");
    this.delegate.registerDomEvent(this.zoomInBtn, "click", () => {
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
    const refs = buildToolbarSubDock(this.subToolbarEl, this.delegate, {
      onShapeTypeSelected: (shapeType) => this.setShapeType(shapeType),
      onStickyColorSelected: (color) => this.setStickyColor(color),
      onEraserRadiusSelected: (radius) => this.setEraserRadius(radius),
      onSelectionSubModeSelected: (mode) => this.setSelectionSubMode(mode)
    });

    this.textControlsContainer = refs.textControlsContainer;
    this.textSizeSelect = refs.textSizeSelect;
    this.textBoldBtn = refs.textBoldBtn;
    this.textItalicBtn = refs.textItalicBtn;
    this.textUnderlineBtn = refs.textUnderlineBtn;
    this.textAlignSelect = refs.textAlignSelect;
    this.textDoneBtn = refs.textDoneBtn;
    this.shapeControlsContainer = refs.shapeControlsContainer;
    this.shapeButtons = refs.shapeButtons;
    this.shapeFillBtn = refs.shapeFillBtn;
    this.stickyControlsContainer = refs.stickyControlsContainer;
    this.stickyChips = refs.stickyChips;
    this.colorPaletteContainer = refs.colorPaletteContainer;
    this.colorChips = refs.colorChips;
    this.colorPickerInput = refs.colorPickerInput;
    this.widthSelectorContainer = refs.widthSelectorContainer;
    this.widthButtons = refs.widthButtons;
    this.widthPresetButtons = refs.widthPresetButtons;
    this.widthSliderInput = refs.widthSliderInput;
    this.widthNumberInput = refs.widthNumberInput;
    this.widthValueBadge = refs.widthValueBadge;
    this.widthPreviewDot = refs.widthPreviewDot;
    this.strokePatternContainer = refs.strokePatternContainer;
    this.strokePatternButtons = refs.strokePatternButtons;
    this.penPresetsContainer = refs.penPresetsContainer;
    this.renderPenPresetsFn = refs.renderPenPresets;
    this.eraserControlsContainer = refs.eraserControlsContainer;
    this.strokeEraserBtn = refs.strokeEraserBtn;
    this.precisionEraserBtn = refs.precisionEraserBtn;
    this.eraserSizeButtons = refs.eraserSizeButtons;
    this.selectionActionsContainer = refs.selectionActionsContainer;
    this.selectionLassoBtn = refs.selectionLassoBtn;
    this.selectionPanBtn = refs.selectionPanBtn;
    this.duplicateSelectionBtn = refs.duplicateSelectionBtn;
    this.deleteSelectionBtn = refs.deleteSelectionBtn;
  }

  private buildPopovers(): void {
    const popoverHost = {
      getLayoutConfig: () => this.layoutConfig,
      getCurrentPlacement: () => this.currentPlacement,
      closePagePopover: () => this.closePagePopover(),
      openToolbarPopover: () => this.openToolbarPopover(),
      closeToolbarPopover: () => this.closeToolbarPopover(),
      setPlacement: (placement: ToolbarPlacement, notify?: boolean) => this.setPlacement(placement, notify),
      applyLayoutConfig: (config: ToolbarLayoutConfig) => this.applyLayoutConfig(config),
      updateLayoutConfig: (partial: Partial<ToolbarLayoutConfig>) => this.updateLayoutConfig(partial)
    };

    const pageRefs = buildPagePopover(this.pagePopoverEl, this.delegate, popoverHost);
    this.paperTemplateButtons = pageRefs.paperTemplateButtons;
    this.pageSizeButtons = pageRefs.pageSizeButtons;
    this.paperColorSwatches = pageRefs.paperColorSwatches;
    this.customPaperInput = pageRefs.customPaperInput;
    this.notebookOrientationBtn = pageRefs.notebookOrientationBtn;
    this.addPageBtn = pageRefs.addPageBtn;
    this.duplicatePageBtn = pageRefs.duplicatePageBtn;
    this.deletePageBtn = pageRefs.deletePageBtn;
    this.importPdfBtn = pageRefs.importPdfBtn;

    const tbRefs = buildToolbarPopover(this.toolbarPopoverEl, this.delegate, popoverHost);
    this.toolbarTitleToggleBtn = tbRefs.toolbarTitleToggleBtn;
    this.toolbarZoomToggleBtn = tbRefs.toolbarZoomToggleBtn;
    this.dockPlacementButtons = tbRefs.dockPlacementButtons;
  }

  applyLayoutConfig(config: ToolbarLayoutConfig): void {
    this.layoutConfig = {
      scale: 1.0,
      maxWidth: null,
      wrap: false,
      showTitle: config.showTitle !== undefined ? Boolean(config.showTitle) : true,
      showZoomControls: config.showZoomControls !== undefined ? Boolean(config.showZoomControls) : true
    };

    if (this.toolbarWrapperEl) {
      this.toolbarWrapperEl.setCssProps({
        "--np-toolbar-scale": "1",
        "--np-toolbar-max-width": "calc(100% - 24px)"
      });

      this.toolbarWrapperEl.removeClass("is-toolbar-wrap");
      this.toolbarWrapperEl.removeClass("is-auto-wrap");
      this.toolbarWrapperEl.removeClass("is-vertical-2col");
      this.toolbarWrapperEl.removeClass("is-custom-width");
      this.toolbarWrapperEl.toggleClass("is-hide-title", !this.layoutConfig.showTitle);
      this.toolbarWrapperEl.toggleClass("is-hide-zoom", !this.layoutConfig.showZoomControls);
    }

    this.toolbarTitleToggleBtn?.toggleClass("is-active", this.layoutConfig.showTitle);
    this.toolbarZoomToggleBtn?.toggleClass("is-active", this.layoutConfig.showZoomControls);
  }

  private updateLayoutConfig(partial: Partial<ToolbarLayoutConfig>): void {
    const nextConfig: ToolbarLayoutConfig = {
      ...this.layoutConfig,
      ...partial,
      scale: 1.0,
      maxWidth: null,
      wrap: false
    };
    this.applyLayoutConfig(nextConfig);
    if (this.delegate.onUpdateToolbarLayoutConfig) {
      this.delegate.onUpdateToolbarLayoutConfig(nextConfig);
    }
  }

  setPlacement(placement: ToolbarPlacement, notify: boolean = true): void {
    const validPlacement: ToolbarPlacement =
      placement === "top" || placement === "bottom" || placement === "left" || placement === "right"
        ? placement
        : "top";
    this.currentPlacement = validPlacement;
    if (!this.toolbarWrapperEl) {
      return;
    }
    this.toolbarWrapperEl.removeClass("is-position-top");
    this.toolbarWrapperEl.removeClass("is-position-bottom");
    this.toolbarWrapperEl.removeClass("is-position-left");
    this.toolbarWrapperEl.removeClass("is-position-right");

    this.toolbarWrapperEl.setCssStyles({
      left: "",
      top: "",
      right: "",
      bottom: "",
      transform: ""
    });

    this.toolbarWrapperEl.addClass(`is-position-${validPlacement}`);
    this.dockPlacementButtons.forEach((btn, pos) => {
      btn.toggleClass("is-active", pos === validPlacement);
    });

    if (notify && this.delegate.onSetToolbarPlacement) {
      this.delegate.onSetToolbarPlacement(validPlacement);
    }
  }

  private positionPopover(popoverEl: HTMLElement): void {
    if (!popoverEl || !this.toolbarWrapperEl) {
      return;
    }
    popoverEl.removeClass("is-popover-above");
    popoverEl.removeClass("is-popover-align-left");

    const hostEl = this.toolbarWrapperEl.parentElement;
    if (!hostEl || typeof hostEl.getBoundingClientRect !== "function") {
      return;
    }
    const hostRect = hostEl.getBoundingClientRect();
    const popRect = popoverEl.getBoundingClientRect();
    if (hostRect.width <= 0 || hostRect.height <= 0 || popRect.width <= 0) {
      return;
    }

    popoverEl.setCssStyles({
      maxWidth: `${Math.max(220, Math.floor(hostRect.width - 16))}px`,
      maxHeight: `${Math.max(180, Math.floor(hostRect.height - 24))}px`
    });

    if (popRect.right > hostRect.right - 8) {
      popoverEl.setCssStyles({ right: "8px", left: "auto" });
    } else if (popRect.left < hostRect.left + 8) {
      popoverEl.setCssStyles({ left: "8px", right: "auto" });
    }
  }

  updatePageSizeButtons(preset: PageSizePreset): void {
    this.pageSizeButtons.forEach((btn, key) => {
      btn.toggleClass("is-active", key === preset);
    });
  }

  updatePaperColorSwatches(color: string): void {
    const normalized = (color || "#ffffff").toLowerCase();
    this.paperColorSwatches.forEach((btn, key) => {
      btn.toggleClass("is-active", key === normalized);
    });
    if (this.customPaperInput && /^#[0-9a-f]{6}$/i.test(normalized)) {
      this.customPaperInput.value = normalized;
    }
  }

  closeAllPopovers(): void {
    this.closePagePopover();
    this.closeToolbarPopover();
  }

  private registerGlobalEvents(): void {
    if (typeof window === "undefined") {
      return;
    }
    this.delegate.registerDomEvent(window, "pointerdown", (e: PointerEvent) => {
      const target = e.target as Node;
      if (this.isPagePopoverOpen) {
        if (
          this.pagePopoverEl &&
          !this.pagePopoverEl.contains(target) &&
          this.pageMenuBtn &&
          !this.pageMenuBtn.contains(target)
        ) {
          this.closePagePopover();
        }
      }
      if (this.isToolbarPopoverOpen) {
        if (
          this.toolbarPopoverEl &&
          !this.toolbarPopoverEl.contains(target) &&
          (!this.dragHandleEl || !this.dragHandleEl.contains(target))
        ) {
          this.closeToolbarPopover();
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
      this.closeToolbarPopover();
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
    this.closeToolbarPopover();
    if (this.pagePopoverEl) {
      this.pagePopoverEl.removeClass("is-hidden");
      this.isPagePopoverOpen = true;
      this.positionPopover(this.pagePopoverEl);
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

  toggleToolbarPopover(): void {
    if (this.isToolbarPopoverOpen) {
      this.closeToolbarPopover();
    } else {
      this.openToolbarPopover();
    }
  }

  openToolbarPopover(): void {
    this.closePagePopover();
    if (this.toolbarPopoverEl) {
      this.toolbarPopoverEl.removeClass("is-hidden");
      this.isToolbarPopoverOpen = true;
      this.positionToolbarPopoverPinned();
      this.dragHandleEl?.addClass("is-active");
    }
  }

  private positionToolbarPopoverPinned(): void {
    if (!this.toolbarPopoverEl || !this.hostParentEl) {
      return;
    }
    const hasRects =
      typeof this.hostParentEl.getBoundingClientRect === "function" &&
      typeof this.toolbarEl?.getBoundingClientRect === "function" &&
      typeof this.toolbarPopoverEl.getBoundingClientRect === "function";
    if (!hasRects) {
      return;
    }
    const hostRect = this.hostParentEl.getBoundingClientRect();
    const dockRect = this.toolbarEl.getBoundingClientRect();
    const popRect = this.toolbarPopoverEl.getBoundingClientRect();
    if (hostRect.width <= 0 || hostRect.height <= 0) {
      return;
    }
    const popW = popRect.width > 0 ? popRect.width : 316;
    const popH = popRect.height > 0 ? popRect.height : 340;
    const margin = 10;

    let left = (dockRect.left + dockRect.right) / 2 - hostRect.left - popW / 2;
    let top = dockRect.bottom - hostRect.top + margin;

    if (this.currentPlacement === "right") {
      left = dockRect.left - hostRect.left - popW - margin;
      top = (dockRect.top + dockRect.bottom) / 2 - hostRect.top - popH / 2;
    } else if (this.currentPlacement === "left") {
      left = dockRect.right - hostRect.left + margin;
      top = (dockRect.top + dockRect.bottom) / 2 - hostRect.top - popH / 2;
    } else if (this.currentPlacement === "bottom") {
      top = dockRect.top - hostRect.top - popH - margin;
    }

    const maxLeft = Math.max(8, hostRect.width - popW - 8);
    const maxTop = Math.max(8, hostRect.height - popH - 8);
    const clampedLeft = Math.round(Math.max(8, Math.min(maxLeft, left)));
    const clampedTop = Math.round(Math.max(8, Math.min(maxTop, top)));

    this.toolbarPopoverEl.setCssStyles({
      left: `${clampedLeft}px`,
      top: `${clampedTop}px`,
      right: "auto",
      bottom: "auto",
      transform: "none"
    });
  }

  closeToolbarPopover(): void {
    if (this.toolbarPopoverEl) {
      this.toolbarPopoverEl.addClass("is-hidden");
      this.isToolbarPopoverOpen = false;
      this.dragHandleEl?.removeClass("is-active");
    }
  }

  setDrawingActive(isDrawing: boolean): void {
    if (this.toolbarWrapperEl) {
      const shouldDim =
        isDrawing && (this.delegate.shouldDimToolbarWhileDrawing ? this.delegate.shouldDimToolbarWhileDrawing() : true);
      this.toolbarWrapperEl.toggleClass("is-drawing", shouldDim);
    }
  }

  updateHotkeyTooltips(getHotkeyLabel: (actionId: HotkeyActionId) => string | null): void {
    const formatTitle = (base: string, ...actionIds: HotkeyActionId[]): string => {
      const labels = actionIds
        .map((id) => getHotkeyLabel(id))
        .filter((lbl): lbl is string => Boolean(lbl));
      return labels.length > 0 ? `${base} (${labels.join(", ")})` : base;
    };

    const setTitleAndAria = (el: HTMLElement | null | undefined, label: string): void => {
      if (!el) return;
      el.setAttribute("title", label);
      el.setAttribute("aria-label", label);
    };

    setTitleAndAria(this.sidebarToggleBtn, formatTitle("Toggle pages sidebar", "toggleSidebar"));
    setTitleAndAria(this.titleBtn, formatTitle("Quick rename notebook", "quickRename"));
    setTitleAndAria(this.undoBtn, formatTitle("Undo", "undo"));
    setTitleAndAria(this.redoBtn, formatTitle("Redo", "redo", "redoAlt"));
    setTitleAndAria(this.zoomOutBtn, formatTitle("Zoom out", "zoomOut"));
    setTitleAndAria(this.zoomResetBtn, formatTitle("Reset zoom to 100%", "zoomReset"));
    setTitleAndAria(this.zoomInBtn, formatTitle("Zoom in", "zoomIn"));

    const toolTitleMap: Partial<Record<ToolType, { base: string; ids: HotkeyActionId[] }>> = {
      lasso: { base: "Select & Pan", ids: ["toolLasso", "toolPan"] },
      pressure: { base: "Pen", ids: ["toolPen"] },
      pencil: { base: "Pencil", ids: ["toolPencil"] },
      highlighter: { base: "Highlighter", ids: ["toolHighlighter"] },
      eraser: { base: "Eraser", ids: ["toolEraser"] },
      shape: { base: "Shapes", ids: ["toolShape"] },
      connector: { base: "Line / Connector", ids: ["toolConnector"] },
      sticky: { base: "Sticky Note", ids: ["toolSticky"] },
      text: { base: "Text Box", ids: ["toolText"] },
      image: { base: "Insert Image", ids: ["toolImage"] }
    };

    this.rulerBtn?.setAttribute("title", formatTitle("Toggle ruler straightedge", "toggleRuler"));
    this.collapseBtn?.setAttribute("title", formatTitle("Collapse toolbar (focus mode)", "toggleFocusMode"));

    this.toolButtons.forEach((btn, toolType) => {
      const entry = toolTitleMap[toolType];
      if (entry) {
        btn.setAttribute("title", formatTitle(entry.base, ...entry.ids));
      }
    });
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
        btn.toggleClass("is-active", isPen);
      } else if (t === "lasso" || t === "select") {
        btn.toggleClass("is-active", tool === "lasso" || tool === "select");
      } else {
        btn.toggleClass("is-active", t === tool);
      }
    });

    const usesPenColors =
      isPen || tool === "pencil" || tool === "shape" || tool === "connector" || tool === "highlighter" || tool === "text";
    if (this.colorPaletteContainer) {
      this.colorPaletteContainer.toggleClass("is-hidden", !usesPenColors);
      this.colorPaletteContainer.toggle(usesPenColors);
    }
    if (this.widthSelectorContainer) {
      const showWidth = isPen || tool === "pencil" || tool === "shape" || tool === "connector" || tool === "highlighter";
      this.widthSelectorContainer.toggleClass("is-hidden", !showWidth);
      this.widthSelectorContainer.toggle(showWidth);
    }
    if (this.strokePatternContainer) {
      const showPattern = isPen || tool === "pencil" || tool === "shape" || tool === "connector";
      this.strokePatternContainer.toggleClass("is-hidden", !showPattern);
      this.strokePatternContainer.toggle(showPattern);
    }
    if (this.penPresetsContainer) {
      const presets = this.delegate.getPenPresets ? this.delegate.getPenPresets() : [];
      const showPresets = presets.length > 0 && (isPen || tool === "pencil" || tool === "highlighter");
      this.penPresetsContainer.toggleClass("is-hidden", !showPresets);
      this.penPresetsContainer.toggle(showPresets);
    }
    this.refreshPenPresets();
    if (this.eraserControlsContainer) {
      this.eraserControlsContainer.toggleClass("is-hidden", tool !== "eraser");
      this.eraserControlsContainer.toggle(tool === "eraser");
    }
    if (this.selectionActionsContainer) {
      const showSelection = tool === "lasso" || tool === "select";
      this.selectionActionsContainer.toggleClass("is-hidden", !showSelection);
      this.selectionActionsContainer.toggle(showSelection);
      if (this.duplicateSelectionBtn) {
        this.duplicateSelectionBtn.toggle(hasSelection);
      }
      if (this.deleteSelectionBtn) {
        this.deleteSelectionBtn.toggle(hasSelection);
      }
      const currentMode = this.delegate.getActiveSelectionSubMode ? this.delegate.getActiveSelectionSubMode() : "lasso";
      if (this.selectionLassoBtn) {
        this.selectionLassoBtn.toggleClass("is-active", currentMode === "lasso");
      }
      if (this.selectionPanBtn) {
        this.selectionPanBtn.toggleClass("is-active", currentMode === "pan");
      }
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
      tool === "pencil" ||
      tool === "shape" ||
      tool === "connector" ||
      tool === "highlighter" ||
      tool === "text" ||
      tool === "sticky" ||
      tool === "eraser" ||
      tool === "lasso" ||
      tool === "select";

    if (this.subToolbarEl) {
      const showSub = Boolean(needsSubToolbar && !this.isCollapsed);
      this.subToolbarEl.toggleClass("is-hidden", !showSub);
      this.subToolbarEl.toggle(showSub);
    }
  }

  setActiveColor(color: string): void {
    const normalizedTarget = color.toLowerCase();
    for (const chip of this.colorChips) {
      const chipColor = chip.getAttribute?.("data-color");
      const active = chipColor
        ? chipColor === normalizedTarget
        : chip.style.backgroundColor === color || this.normalizeColor(chip.style.backgroundColor) === normalizedTarget;
      chip.toggleClass("is-active", active);
    }
    if (this.colorPickerInput) {
      this.colorPickerInput.value = color;
    }
    if (this.widthPreviewDot) {
      this.widthPreviewDot.setCssStyles({ backgroundColor: color });
    }
    this.refreshPenPresets();
  }

  setActiveWidth(width: number): void {
    const rounded = Math.round(width * 10) / 10;
    if (this.widthSliderInput) {
      this.widthSliderInput.value = String(rounded);
    }
    const isInputFocused =
      typeof document !== "undefined" && document.activeElement === (this.widthNumberInput as unknown);
    if (this.widthNumberInput && !isInputFocused) {
      this.widthNumberInput.value = String(rounded);
    }
    for (const [presetWidth, btn] of this.widthPresetButtons.entries()) {
      btn.toggleClass("is-active", Math.abs(presetWidth - rounded) < 0.05);
    }
    if (this.widthPreviewDot) {
      const previewSize = Math.min(18, Math.max(2, rounded));
      this.widthPreviewDot.setCssStyles({
        width: `${previewSize}px`,
        height: `${previewSize}px`
      });
    }
    this.refreshPenPresets();
  }

  setStrokePattern(pattern: StrokePattern): void {
    for (const [pat, btn] of this.strokePatternButtons.entries()) {
      btn.toggleClass("is-active", pat === pattern);
    }
    this.refreshPenPresets();
  }

  refreshPenPresets(): void {
    if (!this.renderPenPresetsFn || !this.penPresetsContainer) {
      return;
    }
    const presets = this.delegate.getPenPresets ? this.delegate.getPenPresets() : [];
    const activeTool = this.delegate.getActiveTool();
    const isPen = activeTool === "pen" || activeTool === "pressure" || activeTool === "fountain";
    const showPresets = presets.length > 0 && (isPen || activeTool === "pencil" || activeTool === "highlighter");
    this.renderPenPresetsFn(
      presets,
      activeTool,
      this.delegate.getActiveColor(),
      this.delegate.getActiveWidth(),
      this.delegate.getStrokePattern ? this.delegate.getStrokePattern() : "solid"
    );
    this.penPresetsContainer.toggleClass("is-hidden", !showPresets);
    this.penPresetsContainer.toggle(showPresets);
  }

  setRulerActive(visible: boolean): void {
    if (this.rulerBtn) {
      this.rulerBtn.toggleClass("is-active", visible);
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

  setEraserRadius(radius: number): void {
    if (!this.eraserSizeButtons) {
      return;
    }
    for (const [r, btn] of this.eraserSizeButtons.entries()) {
      btn.toggleClass("is-active", r === radius);
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
    const normalizedTarget = color.toLowerCase();
    for (const c of this.stickyChips) {
      const chipColor = c.getAttribute?.("data-color");
      const active = chipColor
        ? chipColor === normalizedTarget
        : c.style.backgroundColor === color || this.normalizeColor(c.style.backgroundColor) === normalizedTarget;
      c.toggleClass("is-active", active);
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
    if (this.duplicateSelectionBtn) {
      this.duplicateSelectionBtn.toggle(hasSelection);
    }
    if (this.deleteSelectionBtn) {
      this.deleteSelectionBtn.toggle(hasSelection);
    }
  }

  setSelectionSubMode(mode: SelectionSubMode): void {
    if (this.selectionLassoBtn) {
      this.selectionLassoBtn.toggleClass("is-active", mode === "lasso");
    }
    if (this.selectionPanBtn) {
      this.selectionPanBtn.toggleClass("is-active", mode === "pan");
    }
    if (this.delegate.onSetSelectionSubMode) {
      this.delegate.onSetSelectionSubMode(mode);
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
