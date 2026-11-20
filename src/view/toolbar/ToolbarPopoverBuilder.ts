import { setIcon } from "obsidian";
import {
  PageSizePreset,
  PaperTemplateType,
  ToolbarLayoutConfig,
  ToolbarPlacement
} from "../../types";
import type { NotePagesToolbarDelegate } from "../NotePagesToolbar";

export interface PagePopoverRefs {
  paperTemplateButtons: Map<PaperTemplateType, HTMLElement>;
  pageSizeButtons: Map<PageSizePreset, HTMLElement>;
  paperColorSwatches: Map<string, HTMLElement>;
  customPaperInput: HTMLInputElement;
  notebookOrientationBtn: HTMLButtonElement;
  addPageBtn: HTMLButtonElement;
  duplicatePageBtn: HTMLButtonElement;
  deletePageBtn: HTMLButtonElement;
  importPdfBtn: HTMLButtonElement;
}

export interface ToolbarPopoverRefs {
  toolbarTitleToggleBtn: HTMLElement;
  toolbarZoomToggleBtn: HTMLElement;
  dockPlacementButtons: Map<ToolbarPlacement, HTMLElement>;
}

export interface ToolbarPopoverHost {
  getLayoutConfig(): ToolbarLayoutConfig;
  getCurrentPlacement(): ToolbarPlacement;
  closePagePopover(): void;
  openToolbarPopover(): void;
  closeToolbarPopover(): void;
  setPlacement(placement: ToolbarPlacement, notify?: boolean): void;
  applyLayoutConfig(config: ToolbarLayoutConfig): void;
  updateLayoutConfig(partial: Partial<ToolbarLayoutConfig>): void;
}

export function buildPagePopover(
  pagePopoverEl: HTMLElement,
  delegate: NotePagesToolbarDelegate,
  host: ToolbarPopoverHost
): PagePopoverRefs {
  const popoverHeader = pagePopoverEl.createDiv({
    cls: "notepages-popover-header"
  });
  popoverHeader.createSpan({
    cls: "notepages-popover-title",
    text: "Paper & Layout"
  });

  const templateSection = pagePopoverEl.createDiv({
    cls: "notepages-popover-section"
  });
  templateSection.createDiv({
    cls: "notepages-popover-section-label",
    text: "Paper Template"
  });

  const templateGrid = templateSection.createDiv({
    cls: "notepages-popover-grid"
  });

  const paperTemplateButtons = new Map<PaperTemplateType, HTMLElement>();
  const templateDefs: { type: PaperTemplateType; icon: string; title: string }[] = [
    { type: "ruled", icon: "align-justify", title: "Ruled" },
    { type: "grid", icon: "grid", title: "Grid" },
    { type: "dotted", icon: "more-horizontal", title: "Dotted" },
    { type: "cornell", icon: "columns", title: "Cornell" },
    { type: "blank", icon: "file", title: "Blank" }
  ];

  const currentTpl = delegate.getNotebookTemplate();
  for (const t of templateDefs) {
    const btn = templateGrid.createEl("button", {
      cls: t.type === currentTpl.type ? "notepages-popover-item is-active" : "notepages-popover-item"
    });
    const iconSpan = btn.createSpan({ cls: "notepages-popover-item-icon" });
    setIcon(iconSpan, t.icon);
    btn.createSpan({ cls: "notepages-popover-item-text", text: t.title });
    btn.setAttribute("title", `${t.title} paper`);
    paperTemplateButtons.set(t.type, btn);

    delegate.registerDomEvent(btn, "click", () => {
      delegate.onSelectPaperTemplate(t.type);
      host.closePagePopover();
    });
  }

  const orientationSection = pagePopoverEl.createDiv({
    cls: "notepages-popover-section"
  });
  orientationSection.createDiv({
    cls: "notepages-popover-section-label",
    text: "Orientation"
  });

  const currentOrient = delegate.getNotebookOrientation();
  const notebookOrientationBtn = orientationSection.createEl("button", {
    cls: "notepages-popover-row-btn"
  });
  const orientIconSpan = notebookOrientationBtn.createSpan({ cls: "notepages-popover-item-icon" });
  const orientIcon = currentOrient === "portrait" ? "smartphone" : "monitor";
  setIcon(orientIconSpan, orientIcon);
  notebookOrientationBtn.createSpan({
    cls: "notepages-popover-item-text",
    text: `Orientation: ${currentOrient === "portrait" ? "Portrait" : "Landscape"}`
  });
  notebookOrientationBtn.setAttribute(
    "title",
    `Rotate Page Orientation (R) - Currently ${currentOrient === "portrait" ? "Portrait" : "Landscape"}`
  );

  delegate.registerDomEvent(notebookOrientationBtn, "click", () => {
    delegate.onToggleOrientation();
    host.closePagePopover();
  });

  const pageActionSection = pagePopoverEl.createDiv({
    cls: "notepages-popover-section"
  });
  pageActionSection.createDiv({
    cls: "notepages-popover-section-label",
    text: "Page Actions"
  });

  const pageActionList = pageActionSection.createDiv({
    cls: "notepages-popover-actions-list"
  });

  const addPageBtn = pageActionList.createEl("button", {
    cls: "notepages-popover-action-btn"
  });
  const addIconSpan = addPageBtn.createSpan({ cls: "notepages-popover-item-icon" });
  setIcon(addIconSpan, "file-plus");
  addPageBtn.createSpan({ text: "Add page below (A)" });
  delegate.registerDomEvent(addPageBtn, "click", () => {
    delegate.onAddNewPage();
    host.closePagePopover();
  });

  const duplicatePageBtn = pageActionList.createEl("button", {
    cls: "notepages-popover-action-btn"
  });
  const dupIconSpan = duplicatePageBtn.createSpan({ cls: "notepages-popover-item-icon" });
  setIcon(dupIconSpan, "copy");
  duplicatePageBtn.createSpan({ text: "Duplicate current page" });
  delegate.registerDomEvent(duplicatePageBtn, "click", () => {
    delegate.onDuplicateCurrentPage();
    host.closePagePopover();
  });

  const deletePageBtn = pageActionList.createEl("button", {
    cls: "notepages-popover-action-btn notepages-danger-action"
  });
  const delIconSpan = deletePageBtn.createSpan({ cls: "notepages-popover-item-icon" });
  setIcon(delIconSpan, "trash-2");
  deletePageBtn.createSpan({ text: "Delete current page" });
  delegate.registerDomEvent(deletePageBtn, "click", () => {
    delegate.onDeleteCurrentPage();
    host.closePagePopover();
  });

  const gridOverviewBtn = pageActionList.createEl("button", {
    cls: "notepages-popover-action-btn"
  });
  const gridIconSpan = gridOverviewBtn.createSpan({ cls: "notepages-popover-item-icon" });
  setIcon(gridIconSpan, "layout-grid");
  gridOverviewBtn.createSpan({ text: "Grid overview..." });
  delegate.registerDomEvent(gridOverviewBtn, "click", () => {
    host.closePagePopover();
    delegate.onOpenGridOverview?.();
  });

  const importSection = pagePopoverEl.createDiv({
    cls: "notepages-popover-section"
  });
  const importPdfBtn = importSection.createEl("button", {
    cls: "notepages-popover-action-btn"
  });
  const importIconSpan = importPdfBtn.createSpan({ cls: "notepages-popover-item-icon" });
  setIcon(importIconSpan, "file-up");
  importPdfBtn.createSpan({ text: "Import document (PDF / SVG)" });
  delegate.registerDomEvent(importPdfBtn, "click", () => {
    delegate.onOpenPdfPicker();
    host.closePagePopover();
  });

  const sizeSection = pagePopoverEl.createDiv({
    cls: "notepages-popover-section"
  });
  sizeSection.createDiv({
    cls: "notepages-popover-section-label",
    text: "Page Size"
  });

  const sizeGrid = sizeSection.createDiv({
    cls: "notepages-popover-grid notepages-popover-size-grid"
  });

  const sizePresets: PageSizePreset[] = ["A4", "A3", "A5", "B5", "Letter", "16:9", "Square"];
  const currentSize = delegate.getNotebookPageSize ? delegate.getNotebookPageSize() : "A4";
  const pageSizeButtons = new Map<PageSizePreset, HTMLElement>();

  for (const preset of sizePresets) {
    const btn = sizeGrid.createEl("button", {
      cls: preset === currentSize ? "notepages-popover-item is-active" : "notepages-popover-item"
    });
    btn.createSpan({ cls: "notepages-popover-item-text", text: preset });
    btn.setAttribute("title", `Set size to ${preset}`);
    pageSizeButtons.set(preset, btn);
    delegate.registerDomEvent(btn, "click", () => {
      if (delegate.onSelectPagePreset) {
        delegate.onSelectPagePreset(preset);
      }
      host.closePagePopover();
    });
  }

  const customSizeBtn = sizeSection.createEl("button", {
    cls: "notepages-popover-row-btn"
  });
  const customIconSpan = customSizeBtn.createSpan({ cls: "notepages-popover-item-icon" });
  setIcon(customIconSpan, "sliders");
  customSizeBtn.createSpan({
    cls: "notepages-popover-item-text",
    text: "Custom Dimensions & Scope..."
  });
  customSizeBtn.setAttribute("title", "Configure custom page dimensions and application scope");
  delegate.registerDomEvent(customSizeBtn, "click", () => {
    host.closePagePopover();
    if (delegate.onOpenPageSizeModal) {
      delegate.onOpenPageSizeModal();
    }
  });

  const colorThemeSection = pagePopoverEl.createDiv({
    cls: "notepages-popover-section"
  });
  colorThemeSection.createDiv({
    cls: "notepages-popover-section-label",
    text: "Paper Theme & Color"
  });

  const paperColors = [
    { name: "White", color: "#ffffff" },
    { name: "Warm Sepia", color: "#fbf0d9" },
    { name: "Dark Slate", color: "#1e1e2e" },
    { name: "Chalkboard", color: "#1b3323" },
    { name: "Blueprint", color: "#1a2a44" }
  ];

  const paperColorRow = colorThemeSection.createDiv({
    cls: "notepages-popover-color-row"
  });
  paperColorRow.createSpan({ cls: "notepages-popover-sublabel", text: "Paper:" });

  const activePaperColor = delegate.getNotebookPaperColor ? delegate.getNotebookPaperColor() : "#ffffff";
  const paperColorSwatches = new Map<string, HTMLElement>();
  for (const p of paperColors) {
    const swatch = paperColorRow.createEl("button", {
      cls:
        p.color.toLowerCase() === (activePaperColor || "#ffffff").toLowerCase()
          ? "notepages-paper-swatch is-active"
          : "notepages-paper-swatch",
      title: p.name
    });
    swatch.setCssStyles({ backgroundColor: p.color });
    paperColorSwatches.set(p.color.toLowerCase(), swatch);
    delegate.registerDomEvent(swatch, "click", () => {
      if (delegate.onSelectPaperColor) {
        delegate.onSelectPaperColor(p.color);
      }
      host.closePagePopover();
    });
  }

  const customPaperInput = paperColorRow.createEl("input", {
    cls: "notepages-color-picker-input",
    title: "Pick custom paper color"
  });
  customPaperInput.type = "color";
  customPaperInput.value = activePaperColor || "#ffffff";
  delegate.registerDomEvent(customPaperInput, "change", () => {
    if (delegate.onSelectPaperColor) {
      delegate.onSelectPaperColor(customPaperInput.value);
    }
    host.closePagePopover();
  });

  const toolbarCustomizeSection = pagePopoverEl.createDiv({
    cls: "notepages-popover-section"
  });
  const openCustomizeBtn = toolbarCustomizeSection.createEl("button", {
    cls: "notepages-popover-row-btn"
  });
  const customDockIconSpan = openCustomizeBtn.createSpan({ cls: "notepages-popover-item-icon" });
  setIcon(customDockIconSpan, "sliders-horizontal");
  openCustomizeBtn.createSpan({
    cls: "notepages-popover-item-text",
    text: "Toolbar position & display..."
  });
  openCustomizeBtn.setAttribute("title", "Configure toolbar dock position and visibility");
  delegate.registerDomEvent(openCustomizeBtn, "click", (e: MouseEvent) => {
    e.stopPropagation();
    host.closePagePopover();
    host.openToolbarPopover();
  });

  return {
    paperTemplateButtons,
    pageSizeButtons,
    paperColorSwatches,
    customPaperInput,
    notebookOrientationBtn,
    addPageBtn,
    duplicatePageBtn,
    deletePageBtn,
    importPdfBtn
  };
}

export function buildToolbarPopover(
  toolbarPopoverEl: HTMLElement,
  delegate: NotePagesToolbarDelegate,
  host: ToolbarPopoverHost
): ToolbarPopoverRefs {
  const layoutConfig = host.getLayoutConfig();
  const currentPlacement = host.getCurrentPlacement();

  const header = toolbarPopoverEl.createDiv({
    cls: "notepages-popover-header"
  });
  header.createSpan({
    cls: "notepages-popover-title",
    text: "Toolbar position & display"
  });
  const resetAllBtn = header.createEl("button", {
    cls: "notepages-popover-mini-btn",
    text: "Reset"
  });
  resetAllBtn.setAttribute("title", "Reset toolbar position and visibility to defaults");
  delegate.registerDomEvent(resetAllBtn, "click", () => {
    host.setPlacement("top");
    delegate.onSetToolbarFloatingPos?.(null);
    host.updateLayoutConfig({
      scale: 1.0,
      maxWidth: null,
      wrap: false,
      showTitle: true,
      showZoomControls: true
    });
  });

  const dockSection = toolbarPopoverEl.createDiv({
    cls: "notepages-popover-section"
  });
  dockSection.createDiv({
    cls: "notepages-popover-section-label",
    text: "Toolbar position"
  });

  const dockGrid = dockSection.createDiv({
    cls: "notepages-popover-grid notepages-popover-dock-grid"
  });

  const dockPlacementButtons = new Map<ToolbarPlacement, HTMLElement>();
  const dockPositions: Array<{ pos: ToolbarPlacement; label: string; icon: string }> = [
    { pos: "top", label: "Top", icon: "arrow-up" },
    { pos: "bottom", label: "Bottom", icon: "arrow-down" },
    { pos: "left", label: "Left", icon: "arrow-left" },
    { pos: "right", label: "Right", icon: "arrow-right" }
  ];

  for (const dp of dockPositions) {
    const btn = dockGrid.createEl("button", {
      cls: dp.pos === currentPlacement ? "notepages-popover-item is-active" : "notepages-popover-item"
    });
    const iconSpan = btn.createSpan({ cls: "notepages-popover-item-icon" });
    setIcon(iconSpan, dp.icon);
    btn.createSpan({ cls: "notepages-popover-item-text", text: dp.label });
    btn.setAttribute("title", `Dock toolbar to ${dp.label}`);
    dockPlacementButtons.set(dp.pos, btn);
    delegate.registerDomEvent(btn, "click", () => {
      host.setPlacement(dp.pos);
      delegate.onSetToolbarFloatingPos?.(null);
      host.closeToolbarPopover();
    });
  }

  const displaySection = toolbarPopoverEl.createDiv({
    cls: "notepages-popover-section"
  });
  displaySection.createDiv({
    cls: "notepages-popover-section-label",
    text: "Display"
  });

  const togglesRow = displaySection.createDiv({
    cls: "notepages-popover-toggles-row"
  });

  const toolbarTitleToggleBtn = togglesRow.createEl("button", {
    cls: layoutConfig.showTitle ? "notepages-popover-chip is-active" : "notepages-popover-chip",
    text: "Show title"
  });
  toolbarTitleToggleBtn.setAttribute("title", "Show or hide notebook title on the toolbar");
  delegate.registerDomEvent(toolbarTitleToggleBtn, "click", () => {
    host.updateLayoutConfig({ showTitle: !host.getLayoutConfig().showTitle });
  });

  const toolbarZoomToggleBtn = togglesRow.createEl("button", {
    cls: layoutConfig.showZoomControls ? "notepages-popover-chip is-active" : "notepages-popover-chip",
    text: "Show zoom"
  });
  toolbarZoomToggleBtn.setAttribute("title", "Show or hide zoom controls on the toolbar");
  delegate.registerDomEvent(toolbarZoomToggleBtn, "click", () => {
    host.updateLayoutConfig({ showZoomControls: !host.getLayoutConfig().showZoomControls });
  });

  return {
    toolbarTitleToggleBtn,
    toolbarZoomToggleBtn,
    dockPlacementButtons
  };
}
