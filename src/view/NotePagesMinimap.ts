import { setIcon } from "obsidian";
import { PageDimensions } from "../types";

export interface NotePagesMinimapDelegate {
  getCurrentPageNumber(): number;
  getCurrentPageDimensions(): PageDimensions | undefined;
  getCurrentPageBackgroundColor?(): string | undefined;
  getPageElement(pageNumber: number): HTMLElement | undefined;
  getCommittedCanvas(pageId: string): HTMLCanvasElement | undefined;
  getCurrentPageId(): string | undefined;
  getScrollerEl(): HTMLElement | undefined;
  getZoomLevel(): number;
  scrollBy(deltaX: number, deltaY: number): void;
  scrollToPagePoint(pageNumber: number, xRatio: number, yRatio: number): void;
  registerDomEvent<K extends keyof HTMLElementEventMap>(
    el: HTMLElement | Window | Document,
    type: K,
    callback: (this: HTMLElement, ev: HTMLElementEventMap[K]) => void
  ): void;
}

export class NotePagesMinimap {
  private delegate: NotePagesMinimapDelegate;
  private containerEl!: HTMLElement;
  private headerEl!: HTMLElement;
  private pageLabelEl!: HTMLElement;
  private pinBtn!: HTMLElement;
  private collapseBtn!: HTMLElement;
  private bodyEl!: HTMLElement;
  private previewBoxEl!: HTMLElement;
  private canvasEl!: HTMLCanvasElement;
  private viewfinderEl!: HTMLElement;

  private isPinned: boolean = false;
  private isCollapsed: boolean = false;
  private isDraggingViewfinder: boolean = false;
  private dragStartX: number = 0;
  private dragStartY: number = 0;

  private readonly maxMiniWidth = 140;
  private readonly maxMiniHeight = 175;
  private rafViewfinderId: number | null = null;
  private currentMiniWidth = 120;
  private currentMiniHeight = 160;

  constructor(delegate: NotePagesMinimapDelegate) {
    this.delegate = delegate;
  }

  build(parentEl: HTMLElement): void {
    this.containerEl = parentEl.createDiv({
      cls: "notepages-minimap-container is-hidden"
    });

    this.headerEl = this.containerEl.createDiv({
      cls: "notepages-minimap-header"
    });

    this.pageLabelEl = this.headerEl.createSpan({
      cls: "notepages-minimap-page-label",
      text: "P. 1 · 100%"
    });

    const actionsEl = this.headerEl.createDiv({
      cls: "notepages-minimap-actions"
    });

    this.pinBtn = actionsEl.createEl("button", {
      cls: "notepages-minimap-btn",
      title: "Pin minimap (keep visible)"
    });
    setIcon(this.pinBtn, "pin");
    this.delegate.registerDomEvent(this.pinBtn, "click", (e: MouseEvent) => {
      e.stopPropagation();
      this.togglePin();
    });

    this.collapseBtn = actionsEl.createEl("button", {
      cls: "notepages-minimap-btn",
      title: "Collapse minimap"
    });
    setIcon(this.collapseBtn, "chevron-down");
    this.delegate.registerDomEvent(this.collapseBtn, "click", (e: MouseEvent) => {
      e.stopPropagation();
      this.toggleCollapse();
    });

    this.bodyEl = this.containerEl.createDiv({
      cls: "notepages-minimap-body"
    });

    this.previewBoxEl = this.bodyEl.createDiv({
      cls: "notepages-minimap-preview"
    });

    this.canvasEl = this.previewBoxEl.createEl("canvas", {
      cls: "notepages-minimap-canvas"
    });

    this.viewfinderEl = this.previewBoxEl.createDiv({
      cls: "notepages-minimap-viewfinder"
    });

    this.bindEvents();
  }

  private bindEvents(): void {
    this.delegate.registerDomEvent(this.previewBoxEl, "click", (e: MouseEvent) => {
      if (this.isDraggingViewfinder) {
        return;
      }
      const rect = this.previewBoxEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const xRatio = Math.max(0, Math.min(1, clickX / rect.width));
      const yRatio = Math.max(0, Math.min(1, clickY / rect.height));

      const pageNum = this.delegate.getCurrentPageNumber();
      this.delegate.scrollToPagePoint(pageNum, xRatio, yRatio);
    });

    this.delegate.registerDomEvent(this.viewfinderEl, "pointerdown", (e: PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      this.isDraggingViewfinder = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.viewfinderEl.addClass("is-dragging");
      this.capturePointer(this.viewfinderEl, e.pointerId);
    });

    this.delegate.registerDomEvent(this.viewfinderEl, "pointermove", (e: PointerEvent) => {
      if (!this.isDraggingViewfinder) {
        return;
      }
      e.stopPropagation();
      e.preventDefault();

      const dx = e.clientX - this.dragStartX;
      const dy = e.clientY - this.dragStartY;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;

      const pageNum = this.delegate.getCurrentPageNumber();
      const pageFrame = this.delegate.getPageElement(pageNum);
      if (!pageFrame || this.currentMiniWidth <= 0 || this.currentMiniHeight <= 0) {
        return;
      }

      const pageRect = pageFrame.getBoundingClientRect();
      const scaleX = pageRect.width / this.currentMiniWidth;
      const scaleY = pageRect.height / this.currentMiniHeight;

      this.delegate.scrollBy(dx * scaleX, dy * scaleY);
    });

    const onPointerEnd = (e: PointerEvent) => {
      if (!this.isDraggingViewfinder) {
        return;
      }
      this.isDraggingViewfinder = false;
      this.viewfinderEl.removeClass("is-dragging");
      this.releasePointer(this.viewfinderEl, e.pointerId);
    };

    this.delegate.registerDomEvent(this.viewfinderEl, "pointerup", onPointerEnd);
    this.delegate.registerDomEvent(this.viewfinderEl, "pointercancel", onPointerEnd);
  }

  private capturePointer(targetEl: HTMLElement, pointerId: number): void {
    if (typeof targetEl.setPointerCapture !== "function") {
      return;
    }
    try {
      targetEl.setPointerCapture(pointerId);
    } catch (err) {
      console.warn("[NotePages] Unable to capture minimap pointer:", err);
    }
  }

  private releasePointer(targetEl: HTMLElement, pointerId: number): void {
    if (typeof targetEl.releasePointerCapture !== "function") {
      return;
    }
    try {
      if (typeof targetEl.hasPointerCapture !== "function" || targetEl.hasPointerCapture(pointerId)) {
        targetEl.releasePointerCapture(pointerId);
      }
    } catch (err) {
      console.warn("[NotePages] Unable to release minimap pointer:", err);
    }
  }

  togglePin(): void {
    this.isPinned = !this.isPinned;
    this.pinBtn.toggleClass("is-active", this.isPinned);
    if (this.isPinned) {
      this.show();
    } else if (this.delegate.getZoomLevel() <= 1.0) {
      this.autoHide();
    }
  }

  toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed;
    this.containerEl.toggleClass("is-collapsed", this.isCollapsed);
    setIcon(this.collapseBtn, this.isCollapsed ? "chevron-up" : "chevron-down");
    if (!this.isCollapsed) {
      this.update(true);
    }
  }

  show(): void {
    this.containerEl.removeClass("is-hidden");
  }

  autoHide(): void {
    if (!this.isPinned) {
      this.containerEl.addClass("is-hidden");
    }
  }

  onZoomChanged(zoomLevel: number): void {
    if (zoomLevel > 1.0 || this.isPinned) {
      this.show();
    } else {
      this.autoHide();
    }
    this.updateLabel(zoomLevel);
    this.scheduleViewfinderUpdate();
  }

  updateLabel(zoomLevel?: number): void {
    const zoom = zoomLevel ?? this.delegate.getZoomLevel();
    const pageNum = this.delegate.getCurrentPageNumber();
    const percent = Math.round(zoom * 100);
    this.pageLabelEl.textContent = `P. ${pageNum} · ${percent}%`;
  }

  update(renderCanvas: boolean = false): void {
    const zoom = this.delegate.getZoomLevel();
    this.updateLabel(zoom);
    if (renderCanvas) {
      this.renderThumbnail();
    }
    this.scheduleViewfinderUpdate();
  }

  renderThumbnail(): void {
    if (this.isCollapsed) {
      return;
    }
    const dimensions = this.delegate.getCurrentPageDimensions();
    const pageId = this.delegate.getCurrentPageId();
    if (!dimensions || !pageId) {
      return;
    }

    const aspect = dimensions.width / dimensions.height;
    if (aspect >= this.maxMiniWidth / this.maxMiniHeight) {
      this.currentMiniWidth = this.maxMiniWidth;
      this.currentMiniHeight = Math.max(30, Math.round(this.maxMiniWidth / aspect));
    } else {
      this.currentMiniHeight = this.maxMiniHeight;
      this.currentMiniWidth = Math.max(30, Math.round(this.maxMiniHeight * aspect));
    }

    this.previewBoxEl.setCssStyles({
      width: `${this.currentMiniWidth}px`,
      height: `${this.currentMiniHeight}px`
    });

    const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;
    this.canvasEl.width = Math.round(this.currentMiniWidth * dpr);
    this.canvasEl.height = Math.round(this.currentMiniHeight * dpr);
    this.canvasEl.setCssStyles({
      width: `${this.currentMiniWidth}px`,
      height: `${this.currentMiniHeight}px`
    });

    const ctx = this.canvasEl.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, this.currentMiniWidth, this.currentMiniHeight);

    const paperBg = this.delegate.getCurrentPageBackgroundColor?.() || "#ffffff";
    ctx.fillStyle = paperBg;
    ctx.fillRect(0, 0, this.currentMiniWidth, this.currentMiniHeight);

    const committedCanvas = this.delegate.getCommittedCanvas(pageId);
    if (committedCanvas && committedCanvas.width > 0 && committedCanvas.height > 0) {
      ctx.drawImage(
        committedCanvas,
        0,
        0,
        committedCanvas.width,
        committedCanvas.height,
        0,
        0,
        this.currentMiniWidth,
        this.currentMiniHeight
      );
    }

    ctx.restore();
    this.scheduleViewfinderUpdate();
  }

  scheduleViewfinderUpdate(): void {
    if (typeof window === "undefined") {
      this.updateViewfinder();
      return;
    }
    if (this.rafViewfinderId !== null) {
      return;
    }
    this.rafViewfinderId = window.requestAnimationFrame(() => {
      this.rafViewfinderId = null;
      this.updateViewfinder();
    });
  }

  updateViewfinder(): void {
    if (this.isCollapsed) {
      return;
    }
    const pageNum = this.delegate.getCurrentPageNumber();
    const pageFrame = this.delegate.getPageElement(pageNum);
    const scrollerEl = this.delegate.getScrollerEl();

    if (!pageFrame || !scrollerEl) {
      this.viewfinderEl.toggleClass("is-hidden", true);
      return;
    }

    const scrollerRect = scrollerEl.getBoundingClientRect();
    const pageRect = pageFrame.getBoundingClientRect();

    if (pageRect.width <= 0 || pageRect.height <= 0) {
      this.viewfinderEl.toggleClass("is-hidden", true);
      return;
    }

    const visLeft = Math.max(scrollerRect.left, pageRect.left);
    const visTop = Math.max(scrollerRect.top, pageRect.top);
    const visRight = Math.min(scrollerRect.right, pageRect.right);
    const visBottom = Math.min(scrollerRect.bottom, pageRect.bottom);

    if (visRight <= visLeft || visBottom <= visTop) {
      this.viewfinderEl.toggleClass("is-hidden", true);
      return;
    }

    this.viewfinderEl.toggleClass("is-hidden", false);

    const ratioX = (visLeft - pageRect.left) / pageRect.width;
    const ratioY = (visTop - pageRect.top) / pageRect.height;
    const ratioW = (visRight - visLeft) / pageRect.width;
    const ratioH = (visBottom - visTop) / pageRect.height;

    const left = Math.round(ratioX * this.currentMiniWidth);
    const top = Math.round(ratioY * this.currentMiniHeight);
    const width = Math.max(10, Math.min(this.currentMiniWidth - left, Math.round(ratioW * this.currentMiniWidth)));
    const height = Math.max(10, Math.min(this.currentMiniHeight - top, Math.round(ratioH * this.currentMiniHeight)));

    this.viewfinderEl.setCssStyles({
      transform: `translate(${left}px, ${top}px)`,
      width: `${width}px`,
      height: `${height}px`
    });
  }

  clear(): void {
    if (this.rafViewfinderId !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(this.rafViewfinderId);
      this.rafViewfinderId = null;
    }
    this.isDraggingViewfinder = false;
    this.viewfinderEl?.removeClass("is-dragging");
    this.viewfinderEl?.toggleClass("is-hidden", true);
    if (this.canvasEl && typeof this.canvasEl.getContext === "function") {
      const ctx = this.canvasEl.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);
      }
    }
    if (!this.isPinned && this.containerEl) {
      this.containerEl.addClass("is-hidden");
    }
  }

  destroy(): void {
    this.clear();
    this.containerEl?.remove();
  }
}
