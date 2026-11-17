import { PageData } from "../types";
import { TemplateRenderer } from "../renderer/TemplateRenderer";

export interface ViewportZoomDelegate {
  getScrollerEl(): HTMLElement | undefined;
  getPagesContainerEl(): HTMLElement | undefined;
  getPages(): PageData[];
  getMountedPageNumbers(): Set<number>;
  getTemplateCanvas(pageId: string): HTMLCanvasElement | undefined;
  getCommittedCanvas(pageId: string): HTMLCanvasElement | undefined;
  getActiveCanvas(pageId: string): HTMLCanvasElement | undefined;
  redrawCommittedCanvas(pageId: string): void;
  onZoomUpdated(zoomLevel: number): void;
}

export class ViewportZoomController {
  private delegate: ViewportZoomDelegate;
  private zoomLevel: number = 1.0;
  private canvasResolutionTimeout: number | null = null;

  constructor(delegate: ViewportZoomDelegate) {
    this.delegate = delegate;
  }

  getZoomLevel(): number {
    return this.zoomLevel;
  }

  setRawZoomLevel(zoom: number): void {
    this.zoomLevel = Math.min(5.0, Math.max(0.2, zoom));
  }

  getCanvasScale(): number {
    const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;
    const zoom = Math.max(1, this.zoomLevel);
    return Math.min(4.0, Math.max(1, Math.round(dpr * zoom * 10) / 10));
  }

  applyPagesContainerTransform(): void {
    const pagesContainerEl = this.delegate.getPagesContainerEl();
    if (!pagesContainerEl) {
      return;
    }
    if (this.zoomLevel > 1) {
      const extraHeight = Math.ceil(pagesContainerEl.offsetHeight * (this.zoomLevel - 1));
      const extraWidth = Math.ceil(pagesContainerEl.offsetWidth * (this.zoomLevel - 1));
      const marginX = `${Math.ceil(extraWidth / 2) + 60}px`;
      pagesContainerEl.setCssStyles({
        transform: `scale(${this.zoomLevel})`,
        marginBottom: `${extraHeight + 80}px`,
        marginRight: marginX,
        marginLeft: marginX
      });
    } else {
      pagesContainerEl.setCssStyles({
        transform: `scale(${this.zoomLevel})`,
        marginBottom: "0px",
        marginRight: "0px",
        marginLeft: "0px"
      });
    }
  }

  setZoomLevel(
    targetZoom: number,
    anchorClientX?: number,
    anchorClientY?: number,
    isContinuous: boolean = false
  ): void {
    const clampedZoom = Math.min(5.0, Math.max(0.2, targetZoom));
    if (Math.abs(clampedZoom - this.zoomLevel) < 0.0005) {
      return;
    }

    const pagesContainerEl = this.delegate.getPagesContainerEl();
    const scrollerEl = this.delegate.getScrollerEl();

    if (!pagesContainerEl || !scrollerEl) {
      this.zoomLevel = clampedZoom;
      return;
    }

    let ax = anchorClientX;
    let ay = anchorClientY;
    if (ax === undefined || ay === undefined) {
      const scrollerRect = scrollerEl.getBoundingClientRect();
      ax = scrollerRect.left + scrollerRect.width / 2;
      ay = scrollerRect.top + scrollerRect.height / 2;
    }

    const rectBefore = pagesContainerEl.getBoundingClientRect();
    const canAnchor = rectBefore.width > 0 && rectBefore.height > 0;
    const fracX = canAnchor ? (ax - rectBefore.left) / rectBefore.width : 0.5;
    const fracY = canAnchor ? (ay - rectBefore.top) / rectBefore.height : 0.5;

    this.zoomLevel = clampedZoom;

    this.applyPagesContainerTransform();

    if (canAnchor) {
      const rectAfter = pagesContainerEl.getBoundingClientRect();
      const newAx = rectAfter.left + fracX * rectAfter.width;
      const newAy = rectAfter.top + fracY * rectAfter.height;
      const diffX = newAx - ax;
      const diffY = newAy - ay;

      if (Number.isFinite(diffX) && Number.isFinite(diffY)) {
        scrollerEl.scrollLeft += diffX;
        scrollerEl.scrollTop += diffY;
      }
    }

    this.delegate.onZoomUpdated(this.zoomLevel);

    if (isContinuous) {
      this.scheduleCanvasResolutionUpdate(180);
    } else {
      this.flushCanvasResolutionUpdate();
    }
  }

  zoomByFactor(factor: number, anchorClientX?: number, anchorClientY?: number): void {
    const nextZoom = Math.min(5.0, Math.max(0.2, this.zoomLevel * factor));
    this.setZoomLevel(Math.round(nextZoom * 1000) / 1000, anchorClientX, anchorClientY, true);
  }

  changeZoom(delta: number, anchorClientX?: number, anchorClientY?: number): void {
    const nextZoom = Math.min(5.0, Math.max(0.2, Math.round((this.zoomLevel + delta) * 10) / 10));
    this.setZoomLevel(nextZoom, anchorClientX, anchorClientY, false);
  }

  resetZoom(): void {
    this.setZoomLevel(1.0);
  }

  scheduleCanvasResolutionUpdate(delayMs: number = 180): void {
    if (this.canvasResolutionTimeout !== null) {
      window.clearTimeout(this.canvasResolutionTimeout);
    }
    this.canvasResolutionTimeout = window.setTimeout(() => {
      this.canvasResolutionTimeout = null;
      this.updateCanvasResolutions();
    }, delayMs);
  }

  flushCanvasResolutionUpdate(): void {
    if (this.canvasResolutionTimeout !== null) {
      window.clearTimeout(this.canvasResolutionTimeout);
      this.canvasResolutionTimeout = null;
    }
    this.updateCanvasResolutions();
  }

  updateCanvasResolutions(): void {
    const pages = this.delegate.getPages();
    if (pages.length === 0) {
      return;
    }
    const scale = this.getCanvasScale();
    const mountedPageNumbers = this.delegate.getMountedPageNumbers();

    for (const page of pages) {
      if (!mountedPageNumbers.has(page.pageNumber)) {
        continue;
      }

      const targetW = Math.round(page.dimensions.width * scale);
      const targetH = Math.round(page.dimensions.height * scale);

      const tplCanvas = this.delegate.getTemplateCanvas(page.id);
      if (tplCanvas && (tplCanvas.width !== targetW || tplCanvas.height !== targetH)) {
        tplCanvas.width = targetW;
        tplCanvas.height = targetH;
        TemplateRenderer.renderTemplate(tplCanvas, page.dimensions, page.template);
      }

      const comCanvas = this.delegate.getCommittedCanvas(page.id);
      if (comCanvas && (comCanvas.width !== targetW || comCanvas.height !== targetH)) {
        comCanvas.width = targetW;
        comCanvas.height = targetH;
        this.delegate.redrawCommittedCanvas(page.id);
      }

      const actCanvas = this.delegate.getActiveCanvas(page.id);
      if (actCanvas && (actCanvas.width !== targetW || actCanvas.height !== targetH)) {
        actCanvas.width = targetW;
        actCanvas.height = targetH;
        const ctx = actCanvas.getContext("2d");
        if (ctx && typeof ctx.setTransform === "function") {
          ctx.setTransform(scale, 0, 0, scale, 0, 0);
        }
      }
    }
  }

  destroy(): void {
    if (this.canvasResolutionTimeout !== null) {
      window.clearTimeout(this.canvasResolutionTimeout);
      this.canvasResolutionTimeout = null;
    }
  }
}
