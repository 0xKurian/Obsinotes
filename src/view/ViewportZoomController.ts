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
  isPageDrawing?(pageId: string): boolean;
  onZoomUpdated(zoomLevel: number): void;
}

const MAX_CANVAS_AREA_PX = 16_000_000;
const MAX_CANVAS_SIDE_PX = 8192;

export class ViewportZoomController {
  private delegate: ViewportZoomDelegate;
  private zoomLevel: number = 1.0;
  private canvasResolutionTimeout: number | null = null;
  private zoomRafId: number | null = null;
  private pendingZoomTarget: { zoom: number; ax?: number; ay?: number } | null = null;

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
    const isCoarsePointer =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    const maxScale = isCoarsePointer ? 3.0 : 4.0;
    const zoom = Math.max(1, this.zoomLevel);
    const quantized = Math.round(dpr * zoom * 2) / 2;
    return Math.min(maxScale, Math.max(1, quantized));
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
    } else if (this.zoomLevel < 1) {
      const shrinkHeight = Math.floor(pagesContainerEl.offsetHeight * (1 - this.zoomLevel));
      pagesContainerEl.setCssStyles({
        transform: `scale(${this.zoomLevel})`,
        marginBottom: `-${shrinkHeight}px`,
        marginRight: "0px",
        marginLeft: "0px"
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
    if (Math.abs(clampedZoom - this.zoomLevel) < 0.0005 && !this.pendingZoomTarget) {
      return;
    }

    if (isContinuous && typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      this.pendingZoomTarget = { zoom: clampedZoom, ax: anchorClientX, ay: anchorClientY };
      if (this.zoomRafId === null) {
        this.zoomRafId = window.requestAnimationFrame(() => {
          this.zoomRafId = null;
          const pending = this.pendingZoomTarget;
          this.pendingZoomTarget = null;
          if (pending) {
            this.applyZoomLevelImmediate(pending.zoom, pending.ax, pending.ay, true);
          }
        });
      }
      return;
    }

    if (this.zoomRafId !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(this.zoomRafId);
      this.zoomRafId = null;
      this.pendingZoomTarget = null;
    }
    this.applyZoomLevelImmediate(clampedZoom, anchorClientX, anchorClientY, isContinuous);
  }

  private applyZoomLevelImmediate(
    clampedZoom: number,
    anchorClientX?: number,
    anchorClientY?: number,
    isContinuous: boolean = false
  ): void {
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
    const oldZoom = this.zoomLevel;
    const baseWidth = pagesContainerEl.offsetWidth || (rectBefore.width / Math.max(0.01, oldZoom));
    const baseHeight = pagesContainerEl.offsetHeight || (rectBefore.height / Math.max(0.01, oldZoom));

    this.zoomLevel = clampedZoom;
    this.applyPagesContainerTransform();

    if (canAnchor) {
      const newWidth = baseWidth * clampedZoom;
      const newHeight = baseHeight * clampedZoom;
      const oldExtraW = oldZoom > 1 ? Math.ceil(baseWidth * (oldZoom - 1)) : 0;
      const newExtraW = clampedZoom > 1 ? Math.ceil(baseWidth * (clampedZoom - 1)) : 0;
      const oldMarginLeft = oldZoom > 1 ? Math.ceil(oldExtraW / 2) + 60 : 0;
      const newMarginLeft = clampedZoom > 1 ? Math.ceil(newExtraW / 2) + 60 : 0;
      // With transform-origin: top center, left shifts by (newMarginLeft - oldMarginLeft) and width scales symmetrically
      const newLeft = rectBefore.left + (newMarginLeft - oldMarginLeft) + (rectBefore.width - newWidth) / 2;
      const newTop = rectBefore.top;
      const newAx = newLeft + fracX * newWidth;
      const newAy = newTop + fracY * newHeight;
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
      this.scheduleCanvasResolutionUpdate(120);
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
    let deferredForDrawing = false;

    for (const page of pages) {
      if (!mountedPageNumbers.has(page.pageNumber)) {
        continue;
      }
      if (this.delegate.isPageDrawing?.(page.id)) {
        deferredForDrawing = true;
        continue;
      }

      const areaScale = Math.min(scale, Math.sqrt(MAX_CANVAS_AREA_PX / Math.max(1, page.dimensions.width * page.dimensions.height)));
      const targetW = Math.max(1, Math.min(MAX_CANVAS_SIDE_PX, Math.round(page.dimensions.width * areaScale)));
      const targetH = Math.max(1, Math.min(MAX_CANVAS_SIDE_PX, Math.round(page.dimensions.height * areaScale)));
      const effectiveScale = targetW / Math.max(1, page.dimensions.width);

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
          ctx.setTransform(effectiveScale, 0, 0, effectiveScale, 0, 0);
        }
      }
    }

    if (deferredForDrawing) {
      this.scheduleCanvasResolutionUpdate(200);
    }
  }

  destroy(): void {
    if (this.canvasResolutionTimeout !== null) {
      window.clearTimeout(this.canvasResolutionTimeout);
      this.canvasResolutionTimeout = null;
    }
    if (this.zoomRafId !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(this.zoomRafId);
      this.zoomRafId = null;
      this.pendingZoomTarget = null;
    }
  }
}
