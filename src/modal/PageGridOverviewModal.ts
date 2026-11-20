import { App, Modal, Notice, setIcon } from "obsidian";
import { PageData } from "../types";
import { TemplateRenderer } from "../renderer/TemplateRenderer";
import { renderPageVectorPreview } from "../view/NotePagesSidebar";

export interface PageGridOverviewDelegate {
  getPages(): PageData[];
  getCurrentPageNumber(): number;
  onJumpToPage(pageNumber: number): void;
  onAddPage(): void;
  onReorderPage(fromIndex: number, toIndex: number): boolean;
  onDuplicatePages(pageIds: string[]): void;
  onDeletePages(pageIds: string[]): void;
  onBookmarkPages(pageIds: string[], bookmarked: boolean): void;
  onRenamePage(pageId: string, nextTitle: string): void;
}

export class PageGridOverviewModal extends Modal {
  private delegate: PageGridOverviewDelegate;
  private filterMode: "all" | "bookmarked" = "all";
  private searchQuery: string = "";
  private selectedPageIds: Set<string> = new Set();
  private draggedIndex: number | null = null;

  private gridEl?: HTMLElement;
  private countBadgeEl?: HTMLElement;
  private filterAllBtn?: HTMLButtonElement;
  private filterStarBtn?: HTMLButtonElement;
  private batchCountEl?: HTMLElement;
  private batchBookmarkBtn?: HTMLButtonElement;
  private batchUnbookmarkBtn?: HTMLButtonElement;
  private batchDuplicateBtn?: HTMLButtonElement;
  private batchDeleteBtn?: HTMLButtonElement;
  private clearSelBtn?: HTMLButtonElement;
  private previewObserver: IntersectionObserver | null = null;
  private searchDebounceTimer: number | null = null;
  private sharedOffscreenCanvas: HTMLCanvasElement | null = null;
  private cardCheckboxes: Map<string, { card: HTMLElement; checkbox: HTMLInputElement }> = new Map();

  constructor(app: App, delegate: PageGridOverviewDelegate) {
    super(app);
    this.delegate = delegate;
  }

  onOpen(): void {
    const { modalEl, contentEl } = this;
    modalEl.addClass("notepages-grid-overview-modal");
    contentEl.empty();
    contentEl.addClass("notepages-grid-overview-content");

    const header = contentEl.createDiv({ cls: "notepages-grid-overview-header" });
    const titleWrap = header.createDiv({ cls: "notepages-grid-overview-title-wrap" });
    titleWrap.createEl("h3", { text: "Page grid overview" });
    this.countBadgeEl = titleWrap.createSpan({ cls: "notepages-grid-count-badge" });

    const headerActions = header.createDiv({ cls: "notepages-grid-overview-header-actions" });
    const addBtn = headerActions.createEl("button", { cls: "mod-cta" });
    addBtn.setAttribute("type", "button");
    const addIcon = addBtn.createSpan({ cls: "notepages-grid-btn-icon" });
    setIcon(addIcon, "file-plus");
    addBtn.createSpan({ text: "Add page" });
    addBtn.addEventListener("click", () => {
      this.delegate.onAddPage();
      this.renderGrid();
    });

    const controlsBar = contentEl.createDiv({ cls: "notepages-grid-overview-controls" });
    const filterGroup = controlsBar.createDiv({ cls: "notepages-grid-filter-group" });

    this.filterAllBtn = filterGroup.createEl("button", {
      cls: "notepages-filter-pill is-active",
      text: "All pages"
    });
    this.filterAllBtn.setAttribute("type", "button");
    this.filterAllBtn.addEventListener("click", () => {
      this.filterMode = "all";
      this.syncFilterButtons();
      this.renderGrid();
    });

    this.filterStarBtn = filterGroup.createEl("button", {
      cls: "notepages-filter-pill",
      text: "Bookmarked"
    });
    this.filterStarBtn.setAttribute("type", "button");
    this.filterStarBtn.addEventListener("click", () => {
      this.filterMode = "bookmarked";
      this.syncFilterButtons();
      this.renderGrid();
    });

    const searchInput = controlsBar.createEl("input", {
      cls: "notepages-grid-search",
      type: "search"
    });
    searchInput.setAttribute("placeholder", "Filter by page number or title...");
    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value;
      if (this.searchDebounceTimer !== null) {
        window.clearTimeout(this.searchDebounceTimer);
      }
      this.searchDebounceTimer = window.setTimeout(() => {
        this.searchDebounceTimer = null;
        this.renderGrid();
      }, 150);
    });

    const batchBar = contentEl.createDiv({ cls: "notepages-grid-batch-bar" });
    const selInfoGroup = batchBar.createDiv({ cls: "notepages-grid-batch-info" });

    const selectAllBtn = selInfoGroup.createEl("button", {
      cls: "notepages-grid-batch-btn",
      text: "Select visible"
    });
    selectAllBtn.setAttribute("type", "button");
    selectAllBtn.addEventListener("click", () => {
      for (const page of this.getFilteredPages()) {
        this.selectedPageIds.add(page.id);
        const ref = this.cardCheckboxes.get(page.id);
        if (ref) {
          ref.checkbox.checked = true;
          ref.card.toggleClass("is-selected", true);
        }
      }
      this.updateBatchToolbarState();
    });

    this.clearSelBtn = selInfoGroup.createEl("button", {
      cls: "notepages-grid-batch-btn",
      text: "Clear"
    });
    this.clearSelBtn.setAttribute("type", "button");
    this.clearSelBtn.addEventListener("click", () => {
      this.selectedPageIds.clear();
      this.cardCheckboxes.forEach((ref) => {
        ref.checkbox.checked = false;
        ref.card.toggleClass("is-selected", false);
      });
      this.updateBatchToolbarState();
    });

    this.batchCountEl = selInfoGroup.createSpan({ cls: "notepages-grid-batch-count" });

    const batchActionGroup = batchBar.createDiv({ cls: "notepages-grid-batch-actions" });

    this.batchBookmarkBtn = batchActionGroup.createEl("button", {
      cls: "notepages-grid-batch-btn",
      text: "Bookmark"
    });
    this.batchBookmarkBtn.setAttribute("type", "button");
    this.batchBookmarkBtn.addEventListener("click", () => {
      const ids = this.getValidSelectedIds();
      if (ids.length === 0) return;
      this.delegate.onBookmarkPages(ids, true);
      this.renderGrid();
    });

    this.batchUnbookmarkBtn = batchActionGroup.createEl("button", {
      cls: "notepages-grid-batch-btn",
      text: "Unbookmark"
    });
    this.batchUnbookmarkBtn.setAttribute("type", "button");
    this.batchUnbookmarkBtn.addEventListener("click", () => {
      const ids = this.getValidSelectedIds();
      if (ids.length === 0) return;
      this.delegate.onBookmarkPages(ids, false);
      this.renderGrid();
    });

    this.batchDuplicateBtn = batchActionGroup.createEl("button", {
      cls: "notepages-grid-batch-btn",
      text: "Duplicate"
    });
    this.batchDuplicateBtn.setAttribute("type", "button");
    this.batchDuplicateBtn.addEventListener("click", () => {
      const ids = this.getValidSelectedIds();
      if (ids.length === 0) return;
      this.delegate.onDuplicatePages(ids);
      this.selectedPageIds.clear();
      this.renderGrid();
    });

    let pendingBatchDeleteTimer: number | null = null;
    const batchDeleteBtn = batchActionGroup.createEl("button", {
      cls: "notepages-grid-batch-btn mod-warning",
      text: "Delete"
    });
    this.batchDeleteBtn = batchDeleteBtn;
    batchDeleteBtn.setAttribute("type", "button");
    batchDeleteBtn.addEventListener("click", () => {
      const ids = this.getValidSelectedIds();
      const total = this.delegate.getPages().length;
      if (ids.length === 0) return;
      if (ids.length >= total) {
        new Notice("A notebook must keep at least one page");
        return;
      }
      if (batchDeleteBtn.dataset.confirmPending !== "true") {
        batchDeleteBtn.dataset.confirmPending = "true";
        batchDeleteBtn.setText(`Confirm (${ids.length})?`);
        if (pendingBatchDeleteTimer !== null) {
          window.clearTimeout(pendingBatchDeleteTimer);
        }
        pendingBatchDeleteTimer = window.setTimeout(() => {
          batchDeleteBtn.dataset.confirmPending = "false";
          batchDeleteBtn.setText("Delete");
          pendingBatchDeleteTimer = null;
        }, 3500);
        return;
      }
      if (pendingBatchDeleteTimer !== null) {
        window.clearTimeout(pendingBatchDeleteTimer);
        pendingBatchDeleteTimer = null;
      }
      batchDeleteBtn.dataset.confirmPending = "false";
      batchDeleteBtn.setText("Delete");
      this.delegate.onDeletePages(ids);
      this.selectedPageIds.clear();
      this.renderGrid();
    });

    this.gridEl = contentEl.createDiv({ cls: "notepages-grid-overview-grid" });
    this.syncFilterButtons();
    this.renderGrid();
  }

  onClose(): void {
    if (this.searchDebounceTimer !== null) {
      window.clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    this.previewObserver?.disconnect();
    this.previewObserver = null;
    this.gridEl?.querySelectorAll("canvas").forEach((c) => {
      c.width = 0;
      c.height = 0;
    });
    if (this.sharedOffscreenCanvas) {
      this.sharedOffscreenCanvas.width = 0;
      this.sharedOffscreenCanvas.height = 0;
      this.sharedOffscreenCanvas = null;
    }
    this.cardCheckboxes.clear();
    this.contentEl.empty();
    this.selectedPageIds.clear();
    this.draggedIndex = null;
  }

  private syncFilterButtons(): void {
    this.filterAllBtn?.toggleClass("is-active", this.filterMode === "all");
    this.filterStarBtn?.toggleClass("is-active", this.filterMode === "bookmarked");
  }

  private getValidSelectedIds(): string[] {
    const existing = new Set(this.delegate.getPages().map((p) => p.id));
    return Array.from(this.selectedPageIds).filter((id) => existing.has(id));
  }

  private getFilteredPages(): PageData[] {
    const query = this.searchQuery.trim().toLowerCase();
    return this.delegate.getPages().filter((page) => {
      if (this.filterMode === "bookmarked" && !page.bookmarked) {
        return false;
      }
      if (!query) {
        return true;
      }
      const title = (page.title ?? "").toLowerCase();
      return title.includes(query) || String(page.pageNumber).includes(query) || `page ${page.pageNumber}`.includes(query);
    });
  }

  private updateBatchToolbarState(): void {
    const validIds = this.getValidSelectedIds();
    const total = this.delegate.getPages().length;
    const count = validIds.length;
    if (this.batchCountEl) {
      this.batchCountEl.setText(count > 0 ? `${count} selected` : "No pages selected");
    }
    const disabled = count === 0;
    if (this.clearSelBtn) this.clearSelBtn.disabled = disabled;
    if (this.batchBookmarkBtn) this.batchBookmarkBtn.disabled = disabled;
    if (this.batchUnbookmarkBtn) this.batchUnbookmarkBtn.disabled = disabled;
    if (this.batchDuplicateBtn) this.batchDuplicateBtn.disabled = disabled;
    if (this.batchDeleteBtn) this.batchDeleteBtn.disabled = disabled || count >= total;
  }

  private renderGrid(): void {
    if (!this.gridEl) {
      return;
    }
    const allPages = this.delegate.getPages();
    const indexById = new Map<string, number>();
    allPages.forEach((p, idx) => indexById.set(p.id, idx));

    const filtered = this.getFilteredPages();
    const currentPageNumber = this.delegate.getCurrentPageNumber();
    if (this.countBadgeEl) {
      this.countBadgeEl.setText(`${filtered.length} / ${allPages.length} pages`);
    }
    this.updateBatchToolbarState();

    this.previewObserver?.disconnect();
    this.previewObserver = null;
    this.gridEl.querySelectorAll("canvas").forEach((c) => {
      c.width = 0;
      c.height = 0;
    });
    this.cardCheckboxes.clear();
    this.gridEl.empty();
    if (filtered.length === 0) {
      this.gridEl.createDiv({
        cls: "notepages-grid-empty",
        text: this.filterMode === "bookmarked" ? "No bookmarked pages match your filter" : "No pages match your filter"
      });
      return;
    }

    const pendingDrawMap = new Map<HTMLElement, { canvas: HTMLCanvasElement; page: PageData; w: number; h: number }>();
    if (typeof IntersectionObserver !== "undefined") {
      this.previewObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) {
              continue;
            }
            const cardEl = entry.target as HTMLElement;
            const job = pendingDrawMap.get(cardEl);
            if (job) {
              pendingDrawMap.delete(cardEl);
              this.previewObserver?.unobserve(cardEl);
              this.drawMiniPreview(job.canvas, job.page, job.w, job.h);
            }
          }
        },
        {
          root: this.gridEl,
          rootMargin: "200px 0px"
        }
      );
    }

    for (const page of filtered) {
      const actualIndex = indexById.get(page.id) ?? 0;
      const isSelected = this.selectedPageIds.has(page.id);
      const isCurrent = page.pageNumber === currentPageNumber;

      const card = this.gridEl.createDiv({
        cls: "notepages-grid-card"
      });
      card.toggleClass("is-current", isCurrent);
      card.toggleClass("is-selected", isSelected);
      card.setAttribute("draggable", "true");

      const topBar = card.createDiv({ cls: "notepages-grid-card-top" });
      const checkbox = topBar.createEl("input", {
        cls: "notepages-grid-card-check",
        type: "checkbox"
      });
      checkbox.checked = isSelected;
      this.cardCheckboxes.set(page.id, { card, checkbox });
      checkbox.setAttribute("aria-label", `Select page ${page.pageNumber}`);
      checkbox.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (checkbox.checked) {
          this.selectedPageIds.add(page.id);
        } else {
          this.selectedPageIds.delete(page.id);
        }
        card.toggleClass("is-selected", checkbox.checked);
        this.updateBatchToolbarState();
      });

      const moveGroup = topBar.createDiv({ cls: "notepages-grid-card-top-actions" });
      const moveLeftBtn = moveGroup.createEl("button", { cls: "notepages-icon-btn" });
      moveLeftBtn.setAttribute("type", "button");
      moveLeftBtn.setAttribute("title", "Move page earlier");
      setIcon(moveLeftBtn, "chevron-left");
      moveLeftBtn.disabled = actualIndex === 0;
      moveLeftBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (actualIndex > 0 && this.delegate.onReorderPage(actualIndex, actualIndex - 1)) {
          this.renderGrid();
        }
      });

      const moveRightBtn = moveGroup.createEl("button", { cls: "notepages-icon-btn" });
      moveRightBtn.setAttribute("type", "button");
      moveRightBtn.setAttribute("title", "Move page later");
      setIcon(moveRightBtn, "chevron-right");
      moveRightBtn.disabled = actualIndex >= allPages.length - 1;
      moveRightBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (actualIndex < allPages.length - 1 && this.delegate.onReorderPage(actualIndex, actualIndex + 1)) {
          this.renderGrid();
        }
      });

      const starBtn = moveGroup.createEl("button", {
        cls: page.bookmarked ? "notepages-icon-btn is-bookmarked" : "notepages-icon-btn"
      });
      starBtn.setAttribute("type", "button");
      setIcon(starBtn, "star");
      starBtn.setAttribute("title", page.bookmarked ? "Remove bookmark" : "Bookmark page");
      starBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.delegate.onBookmarkPages([page.id], !page.bookmarked);
        this.renderGrid();
      });

      const isLandscape = page.orientation === "landscape";
      const previewWrap = card.createDiv({
        cls: isLandscape ? "notepages-grid-card-preview is-landscape" : "notepages-grid-card-preview"
      });
      previewWrap.style.backgroundColor = page.template.backgroundColor;

      const canvas = previewWrap.createEl("canvas", { cls: "notepages-grid-card-canvas" });
      const thumbW = isLandscape ? 210 : 150;
      const thumbH = isLandscape ? 148 : 212;
      canvas.width = thumbW;
      canvas.height = thumbH;
      if (this.previewObserver) {
        pendingDrawMap.set(card, { canvas, page, w: thumbW, h: thumbH });
        this.previewObserver.observe(card);
      } else {
        this.drawMiniPreview(canvas, page, thumbW, thumbH);
      }

      previewWrap.addEventListener("click", () => {
        this.delegate.onJumpToPage(page.pageNumber);
        this.close();
      });

      const footer = card.createDiv({ cls: "notepages-grid-card-footer" });
      const titleInput = footer.createEl("input", {
        cls: "notepages-grid-card-title-input",
        type: "text"
      });
      titleInput.value = page.title ?? "";
      titleInput.setAttribute("placeholder", `Page ${page.pageNumber}`);
      titleInput.setAttribute("aria-label", `Title for page ${page.pageNumber}`);
      titleInput.addEventListener("click", (ev) => ev.stopPropagation());
      titleInput.addEventListener("keydown", (ev: KeyboardEvent) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          titleInput.blur();
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          ev.stopPropagation();
          titleInput.value = page.title ?? "";
          titleInput.blur();
        }
      });
      titleInput.addEventListener("change", () => {
        this.delegate.onRenamePage(page.id, titleInput.value);
      });

      const pageBadge = footer.createSpan({
        cls: "notepages-grid-card-num",
        text: `#${page.pageNumber}`
      });
      pageBadge.addEventListener("click", () => {
        this.delegate.onJumpToPage(page.pageNumber);
        this.close();
      });

      card.addEventListener("dragstart", (e: DragEvent) => {
        this.draggedIndex = actualIndex;
        card.addClass("is-dragging");
        if (e.dataTransfer) {
          e.dataTransfer.setData("text/plain", String(actualIndex));
          e.dataTransfer.effectAllowed = "move";
        }
      });

      card.addEventListener("dragover", (e: DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = "move";
        }
        card.addClass("is-drag-target");
      });

      card.addEventListener("dragleave", () => {
        card.removeClass("is-drag-target");
      });

      card.addEventListener("drop", (e: DragEvent) => {
        e.preventDefault();
        card.removeClass("is-drag-target");
        if (this.draggedIndex !== null && this.draggedIndex !== actualIndex) {
          if (this.delegate.onReorderPage(this.draggedIndex, actualIndex)) {
            this.renderGrid();
          }
        }
      });

      card.addEventListener("dragend", () => {
        card.removeClass("is-dragging");
        card.removeClass("is-drag-target");
        this.draggedIndex = null;
      });
    }
  }

  private drawMiniPreview(canvas: HTMLCanvasElement, page: PageData, width: number, height: number): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    if (!page.pdfSource) {
      if (!this.sharedOffscreenCanvas) {
        this.sharedOffscreenCanvas = createEl("canvas");
      }
      const offscreen = this.sharedOffscreenCanvas;
      offscreen.width = page.dimensions.width;
      offscreen.height = page.dimensions.height;
      TemplateRenderer.renderTemplate(offscreen, page.dimensions, page.template);
      ctx.drawImage(offscreen, 0, 0, width, height);
    }
    renderPageVectorPreview(ctx, page, width, height);
  }
}
