import { Notice } from "obsidian";
import {
  ImageObject,
  PageData,
  ShapeObject,
  StrokeBoundingBox,
  StrokeObject,
  TextObject
} from "../types";
import { SelectionController } from "../selection/SelectionController";
import { StrokeGeometry } from "../ink/StrokeGeometry";
import { ShapeRecognizer } from "../shape/ShapeRecognizer";
import { AddElementsCommand, HistoryManager } from "../history/HistoryManager";

export interface SelectionDragDelegate {
  getPagesContainerEl(): HTMLElement | undefined;
  getPages(): PageData[];
  getPage(pageId: string): PageData | undefined;
  getPageByNumber(pageNumber: number): PageData | undefined;
  getCurrentPageNumber(): number;
  getZoomLevel(): number;
  getPageElement(pageNumber: number): HTMLElement | undefined;
  getPageFrame(pageNumber: number): HTMLElement | null;
  getActiveCanvas(pageId: string): HTMLCanvasElement | undefined;
  mountPageCanvases(pageNumber: number): void;
  getSelectionController(): SelectionController;
  getHistoryManager(): HistoryManager;
  handleMutation(page: PageData): void;
  renderPageTexts(page: PageData, frameEl: HTMLElement): void;
  renderPageImages(page: PageData, frameEl: HTMLElement): void;
}

export class SelectionDragCoordinator {
  private delegate: SelectionDragDelegate;
  private dragOverlayEl: HTMLElement | null = null;
  private dragOverlayCanvas: HTMLCanvasElement | null = null;
  private isDragging: boolean = false;
  private dragStartClientX: number = 0;
  private dragStartClientY: number = 0;
  private dragInitialOverlayX: number = 0;
  private dragInitialOverlayY: number = 0;
  private dragOverlayPadding: number = 16;
  private dragBoxWidth: number = 0;
  private dragBoxHeight: number = 0;
  private clipboard: {
    strokes: StrokeObject[];
    shapes: ShapeObject[];
    texts: TextObject[];
    images: ImageObject[];
  } | null = null;

  constructor(delegate: SelectionDragDelegate) {
    this.delegate = delegate;
  }

  isDraggingSelection(): boolean {
    return this.isDragging;
  }

  setDragStartClient(clientX: number, clientY: number): void {
    this.dragStartClientX = clientX;
    this.dragStartClientY = clientY;
  }

  hasClipboard(): boolean {
    return this.clipboard !== null;
  }

  clearOverlayRef(): void {
    this.dragOverlayEl = null;
    this.dragOverlayCanvas = null;
  }

  ensureDragOverlay(): void {
    const pagesContainerEl = this.delegate.getPagesContainerEl();
    if (!pagesContainerEl) {
      return;
    }
    if (!this.dragOverlayEl || this.dragOverlayEl.parentElement !== pagesContainerEl) {
      if (this.dragOverlayEl && this.dragOverlayEl.parentElement) {
        this.dragOverlayEl.remove();
      }
      this.dragOverlayEl = pagesContainerEl.createDiv({
        cls: "notepages-drag-overlay"
      });
      this.dragOverlayCanvas = this.dragOverlayEl.createEl("canvas", {
        cls: "notepages-drag-canvas"
      });
    }
  }

  startSelectionDrag(
    sourcePageId: string,
    bounds: StrokeBoundingBox,
    clientX?: number,
    clientY?: number
  ): void {
    this.ensureDragOverlay();
    const pagesContainerEl = this.delegate.getPagesContainerEl();
    const sourcePage = this.delegate.getPage(sourcePageId);
    if (!pagesContainerEl || !this.dragOverlayEl || !this.dragOverlayCanvas || !sourcePage) {
      return;
    }

    if (typeof clientX === "number" && typeof clientY === "number") {
      this.dragStartClientX = clientX;
      this.dragStartClientY = clientY;
    }

    const containerRect = pagesContainerEl.getBoundingClientRect();
    const canvas = this.delegate.getActiveCanvas(sourcePage.id);
    const pageWrapper = this.delegate.getPageElement(sourcePage.pageNumber);
    if (!canvas && !pageWrapper) {
      return;
    }
    const pageRect = canvas ? canvas.getBoundingClientRect() : pageWrapper!.getBoundingClientRect();
    const zoomLevel = this.delegate.getZoomLevel();
    const pageLeft = (pageRect.left - containerRect.left) / zoomLevel;
    const pageTop = (pageRect.top - containerRect.top) / zoomLevel;

    const boxWidth = Math.max(1, bounds.maxX - bounds.minX);
    const boxHeight = Math.max(1, bounds.maxY - bounds.minY);
    const padding = 20;
    const canvasWidth = Math.ceil(boxWidth + padding * 2);
    const canvasHeight = Math.ceil(boxHeight + padding * 2);

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    this.dragOverlayCanvas.width = Math.round(canvasWidth * dpr);
    this.dragOverlayCanvas.height = Math.round(canvasHeight * dpr);
    this.dragOverlayCanvas.setCssStyles({
      width: `${canvasWidth}px`,
      height: `${canvasHeight}px`
    });

    const selectionController = this.delegate.getSelectionController();
    const ctx = this.dragOverlayCanvas.getContext("2d");
    if (ctx) {
      ctx.save();
      if (typeof ctx.setTransform === "function") {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      ctx.clearRect(0, 0, this.dragOverlayCanvas.width, this.dragOverlayCanvas.height);
      ctx.restore();

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.translate(padding - bounds.minX, padding - bounds.minY);

      for (const stroke of selectionController.getSelectedStrokes()) {
        StrokeGeometry.renderStroke(ctx, stroke);
      }
      for (const shape of selectionController.getSelectedShapes()) {
        ShapeRecognizer.renderShape(ctx, shape);
      }
      for (const text of selectionController.getSelectedTexts()) {
        this.renderTextObjectToCanvas(ctx, text);
      }
      for (const img of selectionController.getSelectedImages()) {
        this.renderImageObjectToCanvas(ctx, img);
      }
      selectionController.renderSelectionDashedBox(ctx, bounds);

      ctx.restore();
    }

    const initialOverlayX = pageLeft + bounds.minX - padding;
    const initialOverlayY = pageTop + bounds.minY - padding;

    this.dragOverlayEl.setCssStyles({
      transform: `translate3d(${initialOverlayX}px, ${initialOverlayY}px, 0)`
    });
    this.dragOverlayEl.addClass("is-active");

    const sourceCanvas = this.delegate.getActiveCanvas(sourcePageId);
    if (sourceCanvas) {
      const srcCtx = sourceCanvas.getContext("2d");
      srcCtx?.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    }

    for (const text of selectionController.getSelectedTexts()) {
      const el = pagesContainerEl.querySelector<HTMLElement>(`[data-text-id="${text.id}"]`);
      el?.addClass("is-hidden");
    }
    for (const img of selectionController.getSelectedImages()) {
      const el = pagesContainerEl.querySelector<HTMLElement>(`[data-image-id="${img.id}"]`);
      el?.addClass("is-hidden");
    }

    this.isDragging = true;
    this.dragInitialOverlayX = initialOverlayX;
    this.dragInitialOverlayY = initialOverlayY;
    this.dragOverlayPadding = padding;
    this.dragBoxWidth = boxWidth;
    this.dragBoxHeight = boxHeight;
  }

  updateSelectionDrag(clientX: number, clientY: number): void {
    if (!this.isDragging || !this.dragOverlayEl) {
      return;
    }
    const zoomLevel = this.delegate.getZoomLevel();
    const dx = (clientX - this.dragStartClientX) / zoomLevel;
    const dy = (clientY - this.dragStartClientY) / zoomLevel;
    const currentX = this.dragInitialOverlayX + dx;
    const currentY = this.dragInitialOverlayY + dy;
    this.dragOverlayEl.setCssStyles({
      transform: `translate3d(${currentX}px, ${currentY}px, 0)`
    });
  }

  finishSelectionDrag(clientX: number, clientY: number): void {
    if (!this.isDragging || !this.dragOverlayEl) {
      return;
    }
    this.isDragging = false;
    this.dragOverlayEl.removeClass("is-active");

    const pagesContainerEl = this.delegate.getPagesContainerEl();
    pagesContainerEl?.querySelectorAll(".is-hidden").forEach((el) => {
      el.removeClass("is-hidden");
    });

    const movedDist = Math.hypot(clientX - this.dragStartClientX, clientY - this.dragStartClientY);
    if (movedDist < 3) {
      this.cancelSelectionDrag();
      return;
    }

    const zoomLevel = this.delegate.getZoomLevel();
    const dx = (clientX - this.dragStartClientX) / zoomLevel;
    const dy = (clientY - this.dragStartClientY) / zoomLevel;

    const finalContainerBoxMinX = this.dragInitialOverlayX + dx + this.dragOverlayPadding;
    const finalContainerBoxMinY = this.dragInitialOverlayY + dy + this.dragOverlayPadding;
    const finalContainerBoxCenterX = finalContainerBoxMinX + this.dragBoxWidth / 2;
    const finalContainerBoxCenterY = finalContainerBoxMinY + this.dragBoxHeight / 2;

    const targetInfo = this.findPageAtContainerPoint(
      finalContainerBoxCenterX,
      finalContainerBoxCenterY
    );
    if (!targetInfo) {
      this.cancelSelectionDrag();
      return;
    }

    const { page: targetPage, pageLeft, pageTop } = targetInfo;
    const targetPageMinX = finalContainerBoxMinX - pageLeft;
    const targetPageMinY = finalContainerBoxMinY - pageTop;

    const maxW = Math.max(0, targetPage.dimensions.width - this.dragBoxWidth);
    const maxH = Math.max(0, targetPage.dimensions.height - this.dragBoxHeight);
    const clampedMinX = Math.max(0, Math.min(targetPageMinX, maxW));
    const clampedMinY = Math.max(0, Math.min(targetPageMinY, maxH));

    const targetBox: StrokeBoundingBox = {
      minX: clampedMinX,
      minY: clampedMinY,
      maxX: clampedMinX + this.dragBoxWidth,
      maxY: clampedMinY + this.dragBoxHeight
    };

    let targetCanvas = this.delegate.getActiveCanvas(targetPage.id);
    if (!targetCanvas || targetCanvas.width <= 1) {
      this.delegate.mountPageCanvases(targetPage.pageNumber);
      targetCanvas = this.delegate.getActiveCanvas(targetPage.id);
    }
    if (targetCanvas) {
      this.delegate.getSelectionController().commitMove(targetPage, targetBox, targetCanvas);
    }
  }

  cancelSelectionDrag(): void {
    if (!this.isDragging && !this.dragOverlayEl?.hasClass("is-active")) {
      return;
    }
    this.isDragging = false;
    this.dragOverlayEl?.removeClass("is-active");

    const pagesContainerEl = this.delegate.getPagesContainerEl();
    pagesContainerEl?.querySelectorAll(".is-hidden").forEach((el) => {
      el.removeClass("is-hidden");
    });

    const selectionController = this.delegate.getSelectionController();
    selectionController.cancelMove();

    const activePageId = selectionController.getActivePageId();
    if (activePageId) {
      const canvas = this.delegate.getActiveCanvas(activePageId);
      const bounds = selectionController.getCombinedBounds();
      if (canvas && bounds) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          selectionController.renderSelectionOverlay(ctx, canvas, bounds);
        }
      }
    }
  }

  private findPageAtContainerPoint(
    _containerX: number,
    containerY: number
  ): { page: PageData; pageLeft: number; pageTop: number } | null {
    const pages = this.delegate.getPages();
    const pagesContainerEl = this.delegate.getPagesContainerEl();
    if (pages.length === 0 || !pagesContainerEl) {
      return null;
    }

    const containerRect = pagesContainerEl.getBoundingClientRect();
    const zoomLevel = this.delegate.getZoomLevel();
    let closestPage = pages[0];
    let closestLeft = 0;
    let closestTop = 0;
    let minDistance = Number.POSITIVE_INFINITY;

    for (const page of pages) {
      const canvas = this.delegate.getActiveCanvas(page.id);
      const pageWrapper = this.delegate.getPageElement(page.pageNumber);
      if (!canvas && !pageWrapper) {
        continue;
      }
      const canvasRect = canvas ? canvas.getBoundingClientRect() : pageWrapper!.getBoundingClientRect();
      const pageLeft = (canvasRect.left - containerRect.left) / zoomLevel;
      const pageTop = (canvasRect.top - containerRect.top) / zoomLevel;
      const pageBottom = pageTop + page.dimensions.height;

      if (containerY >= pageTop && containerY <= pageBottom) {
        return { page, pageLeft, pageTop };
      }

      const pageCenterY = pageTop + page.dimensions.height / 2;
      const distY = Math.abs(containerY - pageCenterY);
      if (distY < minDistance) {
        minDistance = distY;
        closestPage = page;
        closestLeft = pageLeft;
        closestTop = pageTop;
      }
    }

    return { page: closestPage, pageLeft: closestLeft, pageTop: closestTop };
  }

  private renderTextObjectToCanvas(ctx: CanvasRenderingContext2D, text: TextObject): void {
    ctx.save();

    if (text.isSticky) {
      ctx.fillStyle = text.backgroundColor || "#fef08a";
      ctx.shadowColor = "rgba(0, 0, 0, 0.15)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;

      const r = 4;
      ctx.beginPath();
      ctx.moveTo(text.x + r, text.y);
      ctx.lineTo(text.x + text.width - r, text.y);
      ctx.quadraticCurveTo(text.x + text.width, text.y, text.x + text.width, text.y + r);
      ctx.lineTo(text.x + text.width, text.y + text.height - r);
      ctx.quadraticCurveTo(text.x + text.width, text.y + text.height, text.x + text.width - r, text.y + text.height);
      ctx.lineTo(text.x + r, text.y + text.height);
      ctx.quadraticCurveTo(text.x, text.y + text.height, text.x, text.y + text.height - r);
      ctx.lineTo(text.x, text.y + r);
      ctx.quadraticCurveTo(text.x, text.y, text.x + r, text.y);
      ctx.closePath();
      ctx.fill();

      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
    }

    const fontSize = text.fontSize || 16;
    const fontStyle = text.italic ? "italic" : "normal";
    const fontWeight = text.fontWeight || "normal";
    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${text.fontFamily || "sans-serif"}`;
    ctx.fillStyle = text.color || "#000000";

    const paddingX = text.isSticky ? 12 : 4;
    const paddingTop = text.isSticky ? 12 : 2;
    const lineHeight = fontSize * 1.35;

    let textX = text.x + paddingX;
    if (text.textAlign === "center") {
      ctx.textAlign = "center";
      textX = text.x + text.width / 2;
    } else if (text.textAlign === "right") {
      ctx.textAlign = "right";
      textX = text.x + text.width - paddingX;
    } else {
      ctx.textAlign = "left";
    }

    const lines = (text.content || "").split("\n");
    lines.forEach((line, idx) => {
      const lineY = text.y + paddingTop + fontSize + idx * lineHeight;
      ctx.fillText(line, textX, lineY);
      if (text.underline) {
        const textMetric = ctx.measureText(line);
        let underlineStart = textX;
        if (text.textAlign === "center") {
          underlineStart = textX - textMetric.width / 2;
        } else if (text.textAlign === "right") {
          underlineStart = textX - textMetric.width;
        }
        ctx.fillRect(underlineStart, lineY + 2, textMetric.width, 1);
      }
    });

    ctx.restore();
  }

  private renderImageObjectToCanvas(ctx: CanvasRenderingContext2D, img: ImageObject): void {
    ctx.save();
    const pagesContainerEl = this.delegate.getPagesContainerEl();
    const domImg = pagesContainerEl?.querySelector<HTMLImageElement>(
      `[data-image-id="${img.id}"] img`
    );
    if (domImg && domImg.complete && domImg.naturalWidth > 0) {
      if (typeof img.opacity === "number") {
        ctx.globalAlpha = img.opacity;
      }
      if (img.rotation) {
        const cx = img.x + img.width / 2;
        const cy = img.y + img.height / 2;
        ctx.translate(cx, cy);
        ctx.rotate((img.rotation * Math.PI) / 180);
        ctx.drawImage(domImg, -img.width / 2, -img.height / 2, img.width, img.height);
      } else {
        ctx.drawImage(domImg, img.x, img.y, img.width, img.height);
      }
    } else {
      ctx.fillStyle = "rgba(59, 130, 246, 0.1)";
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(img.x, img.y, img.width, img.height);
      ctx.fillRect(img.x, img.y, img.width, img.height);
    }
    ctx.restore();
  }

  private cloneOffsetElements(
    page: PageData,
    strokes: StrokeObject[],
    shapes: ShapeObject[],
    texts: TextObject[],
    images: ImageObject[],
    offset: number
  ): {
    clonedStrokes: StrokeObject[];
    clonedShapes: ShapeObject[];
    clonedTexts: TextObject[];
    clonedImages: ImageObject[];
  } {
    const clonedStrokes: StrokeObject[] = strokes.map((s) => {
      const newPoints = s.points.map((p) => ({
        ...p,
        x: p.x + offset,
        y: p.y + offset
      }));
      return {
        ...s,
        id: `stroke_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        points: newPoints,
        bounds: StrokeGeometry.computeBoundingBox(newPoints, StrokeGeometry.getBoundsPadding(s.tool, s.width))
      };
    });

    const clonedShapes: ShapeObject[] = shapes.map((sh) => {
      const newGeom = { ...sh.geometryData };
      if (
        sh.type === "rectangle" ||
        sh.type === "rounded-rectangle" ||
        sh.type === "diamond" ||
        sh.type === "star" ||
        sh.type === "callout"
      ) {
        newGeom.x = (newGeom.x || 0) + offset;
        newGeom.y = (newGeom.y || 0) + offset;
      } else if (sh.type === "circle" || sh.type === "ellipse") {
        newGeom.cx = (newGeom.cx || 0) + offset;
        newGeom.cy = (newGeom.cy || 0) + offset;
      } else if (sh.type === "line" || sh.type === "arrow") {
        newGeom.x1 = (newGeom.x1 || 0) + offset;
        newGeom.y1 = (newGeom.y1 || 0) + offset;
        newGeom.x2 = (newGeom.x2 || 0) + offset;
        newGeom.y2 = (newGeom.y2 || 0) + offset;
      } else if (sh.type === "triangle") {
        newGeom.x1 = (newGeom.x1 || 0) + offset;
        newGeom.y1 = (newGeom.y1 || 0) + offset;
        newGeom.x2 = (newGeom.x2 || 0) + offset;
        newGeom.y2 = (newGeom.y2 || 0) + offset;
        newGeom.x3 = (newGeom.x3 || 0) + offset;
        newGeom.y3 = (newGeom.y3 || 0) + offset;
      }

      return {
        ...sh,
        id: `shape_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        bounds: {
          minX: sh.bounds.minX + offset,
          minY: sh.bounds.minY + offset,
          maxX: sh.bounds.maxX + offset,
          maxY: sh.bounds.maxY + offset
        },
        geometryData: newGeom
      };
    });

    const clonedTexts: TextObject[] = texts.map((t) => {
      const newX = Math.max(0, Math.min(page.dimensions.width - t.width, t.x + offset));
      const newY = Math.max(0, Math.min(page.dimensions.height - t.height, t.y + offset));
      return {
        ...t,
        id: `text_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        x: newX,
        y: newY,
        bounds: {
          minX: newX,
          minY: newY,
          maxX: newX + t.width,
          maxY: newY + t.height
        }
      };
    });

    const clonedImages: ImageObject[] = images.map((img) => {
      const newX = Math.max(0, Math.min(page.dimensions.width - img.width, img.x + offset));
      const newY = Math.max(0, Math.min(page.dimensions.height - img.height, img.y + offset));
      return {
        ...img,
        id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        x: newX,
        y: newY,
        bounds: {
          minX: newX,
          minY: newY,
          maxX: newX + img.width,
          maxY: newY + img.height
        }
      };
    });

    return { clonedStrokes, clonedShapes, clonedTexts, clonedImages };
  }

  private commitClonedElements(
    page: PageData,
    clonedStrokes: StrokeObject[],
    clonedShapes: ShapeObject[],
    clonedTexts: TextObject[],
    clonedImages: ImageObject[],
    noticeMessage: string
  ): void {
    const activeCanvas = this.delegate.getActiveCanvas(page.id);
    this.delegate.getSelectionController().setSelection(
      page.id,
      clonedStrokes,
      clonedShapes,
      activeCanvas,
      clonedTexts,
      clonedImages
    );

    this.delegate.getHistoryManager().execute(
      new AddElementsCommand(
        page,
        clonedStrokes,
        clonedShapes,
        () => {
          this.delegate.handleMutation(page);
          const frameEl = this.delegate.getPageFrame(page.pageNumber);
          if (frameEl) {
            if (clonedTexts.length > 0) {
              this.delegate.renderPageTexts(page, frameEl);
            }
            if (clonedImages.length > 0) {
              this.delegate.renderPageImages(page, frameEl);
            }
          }
        },
        clonedTexts,
        clonedImages
      )
    );
    new Notice(noticeMessage);
  }

  duplicateActiveSelection(): void {
    const selectionController = this.delegate.getSelectionController();
    if (!selectionController.hasSelection()) {
      return;
    }
    const pageId = selectionController.getActivePageId();
    if (!pageId) return;
    const page = this.delegate.getPage(pageId);
    if (!page) return;

    const { clonedStrokes, clonedShapes, clonedTexts, clonedImages } = this.cloneOffsetElements(
      page,
      selectionController.getSelectedStrokes(),
      selectionController.getSelectedShapes(),
      selectionController.getSelectedTexts(),
      selectionController.getSelectedImages(),
      20
    );

    this.commitClonedElements(page, clonedStrokes, clonedShapes, clonedTexts, clonedImages, "Duplicated selection");
  }

  deleteActiveSelection(): void {
    const selectionController = this.delegate.getSelectionController();
    if (!selectionController.hasSelection()) {
      return;
    }
    const pageId = selectionController.getActivePageId();
    if (!pageId) return;
    const page = this.delegate.getPage(pageId);
    if (!page) return;
    const activeCanvas = this.delegate.getActiveCanvas(page.id);
    if (!activeCanvas) return;

    selectionController.deleteSelection(page, activeCanvas);
  }

  copySelection(): void {
    const selectionController = this.delegate.getSelectionController();
    if (!selectionController.hasSelection()) {
      return;
    }
    this.clipboard = {
      strokes: selectionController.getSelectedStrokes().map((s) => ({
        ...s,
        points: s.points.map((p) => ({ ...p }))
      })),
      shapes: selectionController.getSelectedShapes().map((sh) => ({
        ...sh,
        geometryData: { ...sh.geometryData }
      })),
      texts: selectionController.getSelectedTexts().map((t) => ({
        ...t,
        bounds: t.bounds ? { ...t.bounds } : undefined
      })),
      images: selectionController.getSelectedImages().map((img) => ({
        ...img,
        bounds: img.bounds ? { ...img.bounds } : undefined
      }))
    };
    new Notice("Selection copied");
  }

  pasteSelection(): void {
    if (!this.clipboard) {
      return;
    }
    const page = this.delegate.getPageByNumber(this.delegate.getCurrentPageNumber());
    if (!page) return;

    const { clonedStrokes, clonedShapes, clonedTexts, clonedImages } = this.cloneOffsetElements(
      page,
      this.clipboard.strokes,
      this.clipboard.shapes,
      this.clipboard.texts,
      this.clipboard.images,
      25
    );

    this.commitClonedElements(page, clonedStrokes, clonedShapes, clonedTexts, clonedImages, "Pasted elements");
  }
}
