import { App, TFile, setIcon } from "obsidian";
import { PageData } from "../types";
import { PageManager } from "../model/PageManager";
import { PdfBackgroundManager } from "../pdf/PdfBackgroundManager";
import { StrokeGeometry } from "../ink/StrokeGeometry";
import { ShapeRecognizer } from "../shape/ShapeRecognizer";
import { TemplateRenderer } from "../renderer/TemplateRenderer";

export interface NotePagesSidebarDelegate {
  app: App;
  getPageManager(): PageManager | null;
  getCurrentPageNumber(): number;
  getPdfBackgroundManager(): PdfBackgroundManager;
  getPageFrame(pageNumber: number): HTMLElement | null;
  resolveResourcePath(vaultPath: string): string;
  renderDocument(): void;
  requestSave(): void;
  scrollToPage(pageNumber: number): void;
  deletePageAndSyncDom(pageId: string): void;
  registerDomEvent<K extends keyof HTMLElementEventMap>(
    el: HTMLElement,
    type: K,
    callback: (ev: HTMLElementEventMap[K]) => void
  ): void;
}

export class NotePagesSidebar {
  private delegate: NotePagesSidebarDelegate;
  sidebarEl!: HTMLElement;
  sidebarListEl!: HTMLElement;
  thumbnailElements: Map<number, HTMLElement> = new Map();
  thumbnailCanvasMap: Map<string, HTMLCanvasElement> = new Map();
  thumbnailIntersectionObserver: IntersectionObserver | null = null;
  draggedPageIndex: number | null = null;

  constructor(delegate: NotePagesSidebarDelegate) {
    this.delegate = delegate;
  }

  build(parentEl: HTMLElement): void {
    this.sidebarEl = parentEl.createDiv({
      cls: "notepages-sidebar"
    });

    const sidebarHeader = this.sidebarEl.createDiv({
      cls: "notepages-sidebar-header"
    });
    sidebarHeader.createSpan({ text: "PAGES" });

    this.sidebarListEl = this.sidebarEl.createDiv({
      cls: "notepages-sidebar-list"
    });

    if (typeof IntersectionObserver !== "undefined") {
      this.thumbnailIntersectionObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const card = entry.target as HTMLElement;
              const pageId = card.dataset.pageId;
              const pageIndex = Number(card.dataset.pageIndex);
              const pageManager = this.delegate.getPageManager();
              const page = (pageId ? pageManager?.getPage(pageId) : null) ?? pageManager?.getPages()[pageIndex];
              if (page && card.dataset.rendered !== "true") {
                card.dataset.rendered = "true";
                this.updateThumbnailStrokes(page);
              }
            }
          }
        },
        {
          root: this.sidebarListEl,
          rootMargin: "250px 0px"
        }
      );
    }
  }

  toggle(): void {
    if (this.sidebarEl) {
      if (this.sidebarEl.hasClass("is-collapsed")) {
        this.sidebarEl.removeClass("is-collapsed");
      } else {
        this.sidebarEl.addClass("is-collapsed");
      }
    }
  }

  renderThumbnail(page: PageData, index: number): void {
    const card = this.sidebarListEl.createDiv({
      cls: "notepages-thumbnail-card"
    });
    card.setAttribute("draggable", "true");
    card.dataset.pageIndex = String(index);
    card.dataset.pageId = page.id;

    if (page.pageNumber === this.delegate.getCurrentPageNumber()) {
      card.addClass("is-active");
    }
    this.thumbnailElements.set(page.pageNumber, card);

    const isLandscape = page.orientation === "landscape";
    const preview = card.createDiv({
      cls: isLandscape ? "notepages-thumbnail-preview is-landscape" : "notepages-thumbnail-preview"
    });
    preview.style.backgroundColor = page.template.backgroundColor;

    const previewCanvas = preview.createEl("canvas", {
      cls: "notepages-thumbnail-canvas"
    });
    const previewWidth = isLandscape ? 160 : 120;
    const previewHeight = isLandscape ? 113 : 170;
    previewCanvas.width = previewWidth;
    previewCanvas.height = previewHeight;
    this.thumbnailCanvasMap.set(page.id, previewCanvas);

    if (this.thumbnailIntersectionObserver) {
      this.thumbnailIntersectionObserver.observe(card);
    } else {
      this.updateThumbnailStrokes(page);
    }

    const footer = card.createDiv({
      cls: "notepages-thumbnail-footer"
    });

    footer.createDiv({
      cls: "notepages-thumbnail-label",
      text: `Page ${page.pageNumber}`
    });

    const thumbActions = footer.createDiv({
      cls: "notepages-thumbnail-actions"
    });

    const duplicateThumbBtn = thumbActions.createEl("button", {
      cls: "notepages-icon-btn"
    });
    setIcon(duplicateThumbBtn, "copy");
    duplicateThumbBtn.setAttribute("title", "Duplicate");
    this.delegate.registerDomEvent(duplicateThumbBtn, "click", (e) => {
      e.stopPropagation();
      const pageManager = this.delegate.getPageManager();
      if (pageManager) {
        const dup = pageManager.duplicatePage(page.id);
        if (dup) {
          this.delegate.renderDocument();
          this.delegate.requestSave();
          this.delegate.scrollToPage(dup.pageNumber);
        }
      }
    });

    const pageManager = this.delegate.getPageManager();
    if (pageManager && pageManager.getPageCount() > 1) {
      this.appendDeleteButtonToThumbnail(thumbActions, page.id);
    }

    this.delegate.registerDomEvent(card, "click", () => {
      const pm = this.delegate.getPageManager();
      const pageToScroll = pm?.getPage(page.id);
      if (pageToScroll) {
        this.delegate.scrollToPage(pageToScroll.pageNumber);
      }
    });

    this.delegate.registerDomEvent(card, "dragstart", (e: DragEvent) => {
      const currentIndex = Number(card.dataset.pageIndex);
      this.draggedPageIndex = currentIndex;
      card.addClass("is-dragging");
      if (e.dataTransfer) {
        e.dataTransfer.setData("text/plain", String(currentIndex));
        e.dataTransfer.effectAllowed = "move";
      }
    });

    this.delegate.registerDomEvent(card, "dragover", (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "move";
      }

      const rect = card.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (e.clientY < midY) {
        card.addClass("drag-over-top");
        card.removeClass("drag-over-bottom");
      } else {
        card.addClass("drag-over-bottom");
        card.removeClass("drag-over-top");
      }
    });

    this.delegate.registerDomEvent(card, "dragleave", () => {
      card.removeClass("drag-over-top");
      card.removeClass("drag-over-bottom");
    });

    this.delegate.registerDomEvent(card, "drop", (e: DragEvent) => {
      e.preventDefault();
      card.removeClass("drag-over-top");
      card.removeClass("drag-over-bottom");

      const currentIndex = Number(card.dataset.pageIndex);
      const pm = this.delegate.getPageManager();
      if (this.draggedPageIndex === null || this.draggedPageIndex === currentIndex || !pm) {
        return;
      }

      const rect = card.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      let targetIndex = currentIndex;
      if (e.clientY >= midY && currentIndex > this.draggedPageIndex) {
        targetIndex = currentIndex;
      }

      const success = pm.reorderPages(this.draggedPageIndex, targetIndex);
      if (success) {
        this.delegate.renderDocument();
        this.delegate.requestSave();
        this.delegate.scrollToPage(targetIndex + 1);
      }
    });

    this.delegate.registerDomEvent(card, "dragend", () => {
      card.removeClass("is-dragging");
      card.removeClass("drag-over-top");
      card.removeClass("drag-over-bottom");
      this.draggedPageIndex = null;
    });
  }

  appendDeleteButtonToThumbnail(actionsEl: HTMLElement, pageId: string): void {
    if (actionsEl.querySelector('.notepages-icon-btn[title="Delete"]')) {
      return;
    }
    const deleteThumbBtn = actionsEl.createEl("button", {
      cls: "notepages-icon-btn"
    });
    setIcon(deleteThumbBtn, "trash-2");
    deleteThumbBtn.setAttribute("title", "Delete");
    this.delegate.registerDomEvent(deleteThumbBtn, "click", (e) => {
      e.stopPropagation();
      this.delegate.deletePageAndSyncDom(pageId);
    });
  }

  updateThumbnailStrokes(page: PageData): void {
    const previewCanvas = this.thumbnailCanvasMap.get(page.id);
    if (!previewCanvas) {
      return;
    }

    const isLandscape = page.orientation === "landscape";
    const previewWidth = isLandscape ? 160 : 120;
    const previewHeight = isLandscape ? 113 : 170;

    const ctx = previewCanvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, previewWidth, previewHeight);

    const pageFrame = this.delegate.getPageFrame(page.pageNumber);
    if (page.pdfSource?.svgPath) {
      const svgFile = this.delegate.app.vault.getAbstractFileByPath(page.pdfSource.svgPath);
      if (svgFile instanceof TFile) {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, previewWidth, previewHeight);
          this.drawThumbnailStrokesOnly(ctx, page, previewWidth, previewHeight);
        };
        img.src = this.delegate.resolveResourcePath(svgFile.path);
        return;
      }
    }

    const pdfCanvas = pageFrame?.querySelector("canvas.notepages-pdf-canvas") as HTMLCanvasElement | null;
    if (page.pdfSource && pdfCanvas && pdfCanvas.width > 1 && pdfCanvas.height > 1 && pdfCanvas.dataset.rendered === "true") {
      ctx.drawImage(pdfCanvas, 0, 0, previewWidth, previewHeight);
      this.drawThumbnailStrokesOnly(ctx, page, previewWidth, previewHeight);
    } else if (page.pdfSource) {
      void this.delegate.getPdfBackgroundManager().renderPdfToCanvas(
        page.pdfSource.pdfPath,
        page.pdfSource.pageIndex,
        previewCanvas,
        previewWidth,
        previewHeight
      ).then((ok) => {
        if (ok) {
          this.drawThumbnailStrokesOnly(ctx, page, previewWidth, previewHeight);
        }
      });
    } else {
      const templateCanvas = pageFrame?.querySelector<HTMLCanvasElement>("canvas.notepages-template-layer");
      if (templateCanvas && templateCanvas.width > 0 && templateCanvas.height > 0) {
        ctx.drawImage(templateCanvas, 0, 0, previewWidth, previewHeight);
      } else {
        const offscreen = createEl("canvas");
        offscreen.width = page.dimensions.width;
        offscreen.height = page.dimensions.height;
        TemplateRenderer.renderTemplate(offscreen, page.dimensions, page.template);
        ctx.drawImage(offscreen, 0, 0, previewWidth, previewHeight);
      }
      this.drawThumbnailStrokesOnly(ctx, page, previewWidth, previewHeight);
    }
  }

  private drawThumbnailStrokesOnly(
    ctx: CanvasRenderingContext2D,
    page: PageData,
    previewWidth: number,
    previewHeight: number
  ): void {
    const scaleX = previewWidth / page.dimensions.width;
    const scaleY = previewHeight / page.dimensions.height;

    ctx.save();
    ctx.scale(scaleX, scaleY);

    for (const stroke of page.strokes) {
      if (stroke.tool === "highlighter") {
        StrokeGeometry.renderStroke(ctx, stroke);
      }
    }
    for (const shape of page.shapes) {
      ShapeRecognizer.renderShape(ctx, shape);
    }
    for (const stroke of page.strokes) {
      if (stroke.tool !== "highlighter") {
        StrokeGeometry.renderStroke(ctx, stroke);
      }
    }
    ctx.restore();
  }

  updateActivePage(pageNumber: number): void {
    this.thumbnailElements.forEach((el, num) => {
      if (num === pageNumber) {
        el.addClass("is-active");
      } else {
        el.removeClass("is-active");
      }
    });
  }

  removeThumbnail(pageId: string): void {
    const thumbCard = this.sidebarListEl?.querySelector<HTMLElement>(`[data-page-id="${pageId}"]`);
    if (thumbCard && this.thumbnailIntersectionObserver) {
      this.thumbnailIntersectionObserver.unobserve(thumbCard);
    }
    const thumbCanvas = this.thumbnailCanvasMap.get(pageId);
    if (thumbCanvas) {
      thumbCanvas.width = 1;
      thumbCanvas.height = 1;
      this.thumbnailCanvasMap.delete(pageId);
    }
    if (thumbCard) {
      const extraThumbCanvases = thumbCard.querySelectorAll("canvas");
      extraThumbCanvases.forEach((c) => {
        c.width = 1;
        c.height = 1;
      });
      thumbCard.remove();
    }
  }

  renumberThumbnails(pages: PageData[]): void {
    this.thumbnailElements.clear();
    for (let index = 0; index < pages.length; index++) {
      const p = pages[index];
      const card = this.sidebarListEl?.querySelector<HTMLElement>(`[data-page-id="${p.id}"]`);
      if (card) {
        card.dataset.pageIndex = String(index);
        const label = card.querySelector(".notepages-thumbnail-label");
        if (label) {
          label.textContent = `Page ${p.pageNumber}`;
        }
        this.thumbnailElements.set(p.pageNumber, card);
      }
    }

    if (pages.length <= 1) {
      const loneCard = this.sidebarListEl?.querySelector(".notepages-thumbnail-card");
      const delBtn = loneCard?.querySelector('.notepages-icon-btn[title="Delete"]');
      delBtn?.remove();
    }
  }

  getThumbnailActionsEl(pageId: string): HTMLElement | null {
    const card = this.sidebarListEl?.querySelector(`[data-page-id="${pageId}"]`);
    return (card?.querySelector(".notepages-thumbnail-actions") as HTMLElement | null) ?? null;
  }

  clear(): void {
    this.thumbnailCanvasMap.forEach((c) => {
      c.width = 1;
      c.height = 1;
    });
    if (this.sidebarListEl) {
      this.sidebarListEl.empty();
    }
    this.thumbnailElements.clear();
    this.thumbnailCanvasMap.clear();
    this.thumbnailIntersectionObserver?.disconnect();
  }

  destroy(): void {
    this.clear();
    this.thumbnailIntersectionObserver = null;
  }
}
