import { PageData, ShapeObject, ShapeType, StrokePattern } from "../types";
import { InkingController } from "../ink/InkingController";
import { SelectionController } from "../selection/SelectionController";
import { PdfBackgroundManager } from "../pdf/PdfBackgroundManager";
import { TemplateRenderer } from "../renderer/TemplateRenderer";
import { PageVirtualizer } from "../performance/PageVirtualizer";
import { PerformanceMonitor } from "../performance/PerformanceMonitor";
import { PageBackingCache } from "../performance/PageBackingCache";
import { TessellationScheduler } from "../performance/TessellationScheduler";
import { ShapeRecognizer } from "../shape/ShapeRecognizer";

export interface PageCanvasHostDelegate {
  getPage(pageId: string): PageData | undefined;
  getPageByNumber(pageNumber: number): PageData | undefined;
  getCurrentPageNumber(): number;
  getCanvasScale(): number;
  getInkingController(): InkingController;
  getSelectionController(): SelectionController;
  getPdfBackgroundManager(): PdfBackgroundManager;
  getPageVirtualizer(): PageVirtualizer;
  getPerformanceMonitor(): PerformanceMonitor;
  isTextEditing(): boolean;
  updateThumbnailStrokes(page: PageData): void;
}

export class PageCanvasHost {
  private delegate: PageCanvasHostDelegate;
  readonly pageElements: Map<number, HTMLElement> = new Map();
  readonly committedCanvasMap: Map<string, HTMLCanvasElement> = new Map();
  readonly activeCanvasMap: Map<string, HTMLCanvasElement> = new Map();
  readonly templateCanvasMap: Map<string, HTMLCanvasElement> = new Map();
  private readonly backingCache: PageBackingCache = new PageBackingCache();
  private readonly tessellationScheduler: TessellationScheduler = new TessellationScheduler();

  constructor(delegate: PageCanvasHostDelegate) {
    this.delegate = delegate;
    this.delegate.getInkingController().setBackingCache(this.backingCache);
  }

  getPageElement(pageNumber: number): HTMLElement | undefined {
    return this.pageElements.get(pageNumber);
  }

  getPageFrame(pageNumber: number): HTMLElement | null {
    const wrapper = this.pageElements.get(pageNumber);
    return wrapper ? wrapper.querySelector(".notepages-page-frame") : null;
  }

  getCommittedCanvas(pageId: string): HTMLCanvasElement | undefined {
    return this.committedCanvasMap.get(pageId);
  }

  getActiveCanvas(pageId: string): HTMLCanvasElement | undefined {
    return this.activeCanvasMap.get(pageId);
  }

  getTemplateCanvas(pageId: string): HTMLCanvasElement | undefined {
    return this.templateCanvasMap.get(pageId);
  }

  clearAll(): void {
    this.tessellationScheduler.cancelAll();
    this.backingCache.clear();
    this.pageElements.clear();
    for (const c of this.committedCanvasMap.values()) {
      c.width = 0;
      c.height = 0;
    }
    for (const c of this.activeCanvasMap.values()) {
      c.width = 0;
      c.height = 0;
    }
    for (const c of this.templateCanvasMap.values()) {
      c.width = 0;
      c.height = 0;
    }
    this.committedCanvasMap.clear();
    this.activeCanvasMap.clear();
    this.templateCanvasMap.clear();
  }

  cleanupPageCanvases(pageId: string, pageWrapper: HTMLElement | null): void {
    this.backingCache.release(pageId);
    const committedCanvas = this.committedCanvasMap.get(pageId);
    if (committedCanvas) {
      committedCanvas.width = 0;
      committedCanvas.height = 0;
      this.committedCanvasMap.delete(pageId);
    }

    const activeCanvas = this.activeCanvasMap.get(pageId);
    if (activeCanvas) {
      activeCanvas.width = 0;
      activeCanvas.height = 0;
      this.activeCanvasMap.delete(pageId);
    }

    const templateCanvas = this.templateCanvasMap.get(pageId);
    if (templateCanvas) {
      templateCanvas.width = 0;
      templateCanvas.height = 0;
      this.templateCanvasMap.delete(pageId);
    }

    if (pageWrapper) {
      const extraCanvases = pageWrapper.querySelectorAll("canvas");
      extraCanvases.forEach((c) => {
        c.width = 0;
        c.height = 0;
      });
      pageWrapper.remove();
    }
  }

  redrawCommittedCanvas(pageId: string): void {
    const page = this.delegate.getPage(pageId);
    if (!page) {
      return;
    }
    const canvas = this.committedCanvasMap.get(pageId);
    if (!canvas) {
      return;
    }

    const selectionController = this.delegate.getSelectionController();
    const isCurrentPageSelected = selectionController.getActivePageId() === pageId;
    const selectedStrokeIds = new Set(
      isCurrentPageSelected
        ? selectionController.getSelectedStrokes().map((s) => s.id)
        : []
    );
    const selectedShapeIds = new Set(
      isCurrentPageSelected
        ? selectionController.getSelectedShapes().map((sh) => sh.id)
        : []
    );

    const visibleStrokes = page.strokes.filter((s) => !selectedStrokeIds.has(s.id));
    const visibleShapes = page.shapes.filter((sh) => !selectedShapeIds.has(sh.id));

    this.delegate.getInkingController().redrawCommittedStrokes(
      canvas,
      page.dimensions,
      visibleStrokes,
      visibleShapes,
      pageId
    );
  }

  ensurePageCanvasesMounted(pageNumber: number): void {
    const page = this.delegate.getPageByNumber(pageNumber);
    if (!page) {
      return;
    }

    const committedCanvas = this.committedCanvasMap.get(page.id);
    const activeCanvas = this.activeCanvasMap.get(page.id);
    if (!committedCanvas || !activeCanvas || committedCanvas.width <= 1 || activeCanvas.width <= 1) {
      this.mountPageCanvases(pageNumber);
    }
  }

  mountPageCanvases(pageNumber: number): void {
    const page = this.delegate.getPageByNumber(pageNumber);
    if (!page) {
      return;
    }

    const scale = this.delegate.getCanvasScale();
    const areaScale = Math.min(scale, Math.sqrt(16_000_000 / Math.max(1, page.dimensions.width * page.dimensions.height)));
    const targetW = Math.max(1, Math.min(8192, Math.round(page.dimensions.width * areaScale)));
    const targetH = Math.max(1, Math.min(8192, Math.round(page.dimensions.height * areaScale)));

    const committedCanvas = this.committedCanvasMap.get(page.id);
    if (committedCanvas && (committedCanvas.width <= 1 || committedCanvas.width !== targetW || committedCanvas.height !== targetH)) {
      this.backingCache.release(page.id);
      committedCanvas.width = targetW;
      committedCanvas.height = targetH;
      this.redrawCommittedCanvas(page.id);
    }

    if (page.strokes.length > 0) {
      this.tessellationScheduler.scheduleStrokes(page.strokes);
    }

    const templateCanvas = this.templateCanvasMap.get(page.id);
    if (templateCanvas && (templateCanvas.width <= 1 || templateCanvas.width !== targetW || templateCanvas.height !== targetH)) {
      templateCanvas.width = targetW;
      templateCanvas.height = targetH;
      TemplateRenderer.renderTemplate(templateCanvas, page.dimensions, page.template);
    }

    const activeCanvas = this.activeCanvasMap.get(page.id);
    if (activeCanvas && (activeCanvas.width <= 1 || activeCanvas.width !== targetW || activeCanvas.height !== targetH)) {
      activeCanvas.width = targetW;
      activeCanvas.height = targetH;
      const ctx = activeCanvas.getContext("2d");
      if (ctx && typeof ctx.setTransform === "function") {
        const effectiveScale = targetW / Math.max(1, page.dimensions.width);
        ctx.setTransform(effectiveScale, 0, 0, effectiveScale, 0, 0);
      }
    }

    const pageEl = this.pageElements.get(pageNumber);
    if (pageEl && page.pdfSource && !page.pdfSource.svgPath) {
      const frameEl = pageEl.querySelector<HTMLElement>(".notepages-page-frame");
      if (frameEl) {
        void this.delegate.getPdfBackgroundManager().renderPdfBackground(page, frameEl, () => {
          this.delegate.updateThumbnailStrokes(page);
        });
      }
    }

    const pageVirtualizer = this.delegate.getPageVirtualizer();
    pageVirtualizer?.markPageMounted?.(pageNumber);

    this.delegate.getPerformanceMonitor().updatePageCounts(
      pageVirtualizer.getMountedPages().length,
      pageVirtualizer.getCulledPages().length
    );
  }

  unmountPageCanvases(pageNumber: number): boolean {
    const page = this.delegate.getPageByNumber(pageNumber);
    if (!page) {
      return false;
    }
    if (pageNumber === this.delegate.getCurrentPageNumber()) {
      return false;
    }
    if (this.delegate.getInkingController().isCurrentlyDrawing(page.id)) {
      return false;
    }
    if (this.delegate.isTextEditing()) {
      return false;
    }

    this.backingCache.release(page.id);

    const committedCanvas = this.committedCanvasMap.get(page.id);
    if (committedCanvas && committedCanvas.width > 0) {
      committedCanvas.width = 0;
      committedCanvas.height = 0;
    }

    const templateCanvas = this.templateCanvasMap.get(page.id);
    if (templateCanvas && templateCanvas.width > 0) {
      templateCanvas.width = 0;
      templateCanvas.height = 0;
    }

    const activeCanvas = this.activeCanvasMap.get(page.id);
    if (activeCanvas && activeCanvas.width > 0) {
      activeCanvas.width = 0;
      activeCanvas.height = 0;
    }

    const pageEl = this.pageElements.get(pageNumber);
    if (pageEl && page.pdfSource && !page.pdfSource.svgPath) {
      const frameEl = pageEl.querySelector<HTMLElement>(".notepages-page-frame");
      if (frameEl) {
        this.delegate.getPdfBackgroundManager().unrenderPdfBackground(page, frameEl);
      }
    }

    const pageVirtualizer = this.delegate.getPageVirtualizer();
    pageVirtualizer?.markPageUnmounted?.(pageNumber);

    this.delegate.getPerformanceMonitor().updatePageCounts(
      pageVirtualizer.getMountedPages().length,
      pageVirtualizer.getCulledPages().length
    );
    return true;
  }

  private preparePreviewContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }
    ctx.save();
    if (typeof ctx.setTransform === "function") {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    const scale = canvas.width / (Number(canvas.dataset?.pageWidth) || canvas.clientWidth || canvas.width);
    if (typeof ctx.setTransform === "function") {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    }
    return ctx;
  }

  renderTextDragPreview(
    canvas: HTMLCanvasElement,
    startX: number,
    startY: number,
    currX: number,
    currY: number,
    isSticky: boolean,
    stickyColor: string
  ): void {
    const ctx = this.preparePreviewContext(canvas);
    if (!ctx) {
      return;
    }

    const x = Math.min(startX, currX);
    const y = Math.min(startY, currY);
    const w = Math.abs(currX - startX);
    const h = Math.abs(currY - startY);

    if (w < 4 && h < 4) {
      return;
    }

    ctx.save();
    if (isSticky) {
      ctx.fillStyle = stickyColor || "#fef08a";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(x, y, w, h);
      const label = `Sticky • ${Math.round(w)} × ${Math.round(h)} pt`;
      ctx.font = "11px sans-serif";
      ctx.fillStyle = "#1e293b";
      ctx.fillText(label, x + 4, Math.max(14, y - 4));
    } else {
      ctx.strokeStyle = "rgba(59, 130, 246, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.fillStyle = "rgba(59, 130, 246, 0.08)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);

      const label = `${Math.round(w)} × ${Math.round(h)} pt`;
      ctx.font = "11px sans-serif";
      ctx.fillStyle = "rgba(59, 130, 246, 0.9)";
      ctx.fillText(label, x + 4, Math.max(14, y - 4));
    }
    ctx.restore();
  }

  renderShapeDragPreview(
    canvas: HTMLCanvasElement,
    startX: number,
    startY: number,
    currX: number,
    currY: number,
    shapeType: ShapeType,
    strokeColor: string,
    strokeWidth: number,
    fillColor?: string,
    strokePattern?: StrokePattern
  ): void {
    const ctx = this.preparePreviewContext(canvas);
    if (!ctx) {
      return;
    }

    const x = Math.min(startX, currX);
    const y = Math.min(startY, currY);
    const w = Math.abs(currX - startX);
    const h = Math.abs(currY - startY);

    if (w < 4 && h < 4) {
      return;
    }

    const geometryData = PageCanvasHost.buildShapeGeometryData(shapeType, x, y, w, h);

    const previewShape: ShapeObject = {
      id: "preview_shape",
      elementType: "shape",
      type: shapeType,
      color: strokeColor,
      strokeWidth,
      fillColor,
      strokePattern: strokePattern && strokePattern !== "solid" ? strokePattern : undefined,
      bounds: { minX: x, minY: y, maxX: x + w, maxY: y + h },
      geometryData
    };

    ShapeRecognizer.renderShape(ctx, previewShape);

    ctx.save();
    ctx.strokeStyle = "rgba(59, 130, 246, 0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(x, y, w, h);
    const label = `${shapeType} • ${Math.round(w)} × ${Math.round(h)} pt`;
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "rgba(59, 130, 246, 0.9)";
    ctx.fillText(label, x + 4, Math.max(14, y - 4));
    ctx.restore();
  }

  renderConnectorDragPreview(
    canvas: HTMLCanvasElement,
    startX: number,
    startY: number,
    currX: number,
    currY: number,
    strokeColor: string,
    strokeWidth: number,
    strokePattern?: StrokePattern
  ): void {
    const ctx = this.preparePreviewContext(canvas);
    if (!ctx) {
      return;
    }

    const dist = Math.hypot(currX - startX, currY - startY);
    if (dist < 4) {
      return;
    }

    const previewArrow: ShapeObject = {
      id: "preview_arrow",
      elementType: "shape",
      type: "arrow",
      color: strokeColor,
      strokeWidth,
      strokePattern: strokePattern && strokePattern !== "solid" ? strokePattern : undefined,
      bounds: {
        minX: Math.min(startX, currX),
        minY: Math.min(startY, currY),
        maxX: Math.max(startX, currX),
        maxY: Math.max(startY, currY)
      },
      geometryData: {
        x1: startX,
        y1: startY,
        x2: currX,
        y2: currY
      }
    };

    ShapeRecognizer.renderShape(ctx, previewArrow);

    ctx.save();
    const label = `Arrow • ${Math.round(dist)} pt`;
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "rgba(59, 130, 246, 0.9)";
    ctx.fillText(label, (startX + currX) / 2 + 6, (startY + currY) / 2 - 6);
    ctx.restore();
  }

  static buildShapeGeometryData(
    shapeType: ShapeType,
    x: number,
    y: number,
    w: number,
    h: number
  ): Record<string, number> {
    const geometryData: Record<string, number> = {};
    switch (shapeType) {
      case "rectangle":
      case "diamond":
      case "star":
      case "callout":
        geometryData.x = x;
        geometryData.y = y;
        geometryData.width = w;
        geometryData.height = h;
        break;
      case "rounded-rectangle":
        geometryData.x = x;
        geometryData.y = y;
        geometryData.width = w;
        geometryData.height = h;
        geometryData.radius = 10;
        break;
      case "circle":
        geometryData.cx = x + w / 2;
        geometryData.cy = y + h / 2;
        geometryData.r = Math.min(w, h) / 2;
        break;
      case "triangle":
        geometryData.x1 = x + w / 2;
        geometryData.y1 = y;
        geometryData.x2 = x;
        geometryData.y2 = y + h;
        geometryData.x3 = x + w;
        geometryData.y3 = y + h;
        break;
      default:
        geometryData.x = x;
        geometryData.y = y;
        geometryData.width = w;
        geometryData.height = h;
        break;
    }
    return geometryData;
  }
}
