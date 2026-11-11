import {
  PageData,
  SelectionHandle,
  ShapeObject,
  StrokeBoundingBox,
  StrokeObject,
  TextObject,
  ImageObject
} from "../types";
import { SelectionEngine } from "./SelectionEngine";
import { StrokeGeometry } from "../ink/StrokeGeometry";
import { ShapeRecognizer } from "../shape/ShapeRecognizer";

export type SelectionMode =
  | "idle"
  | "drawing_lasso"
  | "moving"
  | "resizing"
  | "rotating";

export interface SelectionControllerCallbacks {
  onSelectionChanged: (hasSelection: boolean) => void;
  onTransformCommitted: (
    pageId: string,
    prevStrokes: StrokeObject[],
    nextStrokes: StrokeObject[],
    prevShapes: ShapeObject[],
    nextShapes: ShapeObject[],
    prevImages?: ImageObject[],
    nextImages?: ImageObject[],
    prevTexts?: TextObject[],
    nextTexts?: TextObject[]
  ) => void;
  onElementsDeleted: (
    pageId: string,
    strokes: StrokeObject[],
    shapes: ShapeObject[],
    texts?: TextObject[],
    images?: ImageObject[]
  ) => void;
  onRequestRedraw: (pageId: string) => void;
  onElementsMovedAcrossPages?: (
    sourcePageId: string,
    targetPageId: string,
    sourceStrokes: StrokeObject[],
    targetStrokes: StrokeObject[],
    sourceShapes: ShapeObject[],
    targetShapes: ShapeObject[],
    sourceImages?: ImageObject[],
    targetImages?: ImageObject[],
    sourceTexts?: TextObject[],
    targetTexts?: TextObject[]
  ) => void;
  onMoveStart?: (sourcePageId: string, bounds: StrokeBoundingBox, clientX?: number, clientY?: number) => void;
}

export class SelectionController {
  private mode: SelectionMode = "idle";
  private activePageId: string | null = null;
  private selectedStrokes: StrokeObject[] = [];
  private selectedShapes: ShapeObject[] = [];
  private selectedTexts: TextObject[] = [];
  private selectedImages: ImageObject[] = [];
  private initialStrokes: StrokeObject[] = [];
  private initialShapes: ShapeObject[] = [];
  private initialTexts: TextObject[] = [];
  private initialImages: ImageObject[] = [];
  private combinedBounds: StrokeBoundingBox | null = null;
  private initialBounds: StrokeBoundingBox | null = null;
  private lassoPoints: { x: number; y: number }[] = [];
  private activeHandle: SelectionHandle | null = null;
  private dragStartPoint: { x: number; y: number } | null = null;
  private currentPreviewCanvas: HTMLCanvasElement | null = null;
  private previewRafId: number | null = null;
  private pendingPreviewAction: (() => void) | null = null;
  private callbacks: SelectionControllerCallbacks;

  constructor(callbacks: SelectionControllerCallbacks) {
    this.callbacks = callbacks;
  }

  private schedulePreview(action: () => void): void {
    this.pendingPreviewAction = action;
    if (this.previewRafId === null && typeof requestAnimationFrame === "function") {
      this.previewRafId = requestAnimationFrame(() => {
        this.previewRafId = null;
        if (this.pendingPreviewAction) {
          const act = this.pendingPreviewAction;
          this.pendingPreviewAction = null;
          act();
        }
      });
    } else if (typeof requestAnimationFrame !== "function") {
      action();
    }
  }

  private flushPreview(): void {
    if (this.previewRafId !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.previewRafId);
      this.previewRafId = null;
    }
    if (this.pendingPreviewAction) {
      const act = this.pendingPreviewAction;
      this.pendingPreviewAction = null;
      act();
    }
  }

  hasSelection(): boolean {
    return (
      this.selectedStrokes.length > 0 ||
      this.selectedShapes.length > 0 ||
      this.selectedTexts.length > 0 ||
      this.selectedImages.length > 0
    );
  }

  getSelectedStrokes(): StrokeObject[] {
    return this.selectedStrokes;
  }

  getSelectedShapes(): ShapeObject[] {
    return this.selectedShapes;
  }

  getSelectedTexts(): TextObject[] {
    return this.selectedTexts;
  }

  getSelectedImages(): ImageObject[] {
    return this.selectedImages;
  }

  getActivePageId(): string | null {
    return this.activePageId;
  }

  getCombinedBounds(): StrokeBoundingBox | null {
    return this.combinedBounds;
  }

  clearSelection(activeCanvas?: HTMLCanvasElement): void {
    this.flushPreview();
    const prevPageId = this.activePageId;
    this.selectedStrokes = [];
    this.selectedShapes = [];
    this.selectedTexts = [];
    this.selectedImages = [];
    this.initialStrokes = [];
    this.initialShapes = [];
    this.initialTexts = [];
    this.initialImages = [];
    this.combinedBounds = null;
    this.initialBounds = null;
    this.mode = "idle";
    this.activePageId = null;

    if (activeCanvas) {
      const ctx = activeCanvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
      }
    }

    if (this.currentPreviewCanvas && this.currentPreviewCanvas !== activeCanvas) {
      const ctx = this.currentPreviewCanvas.getContext("2d");
      ctx?.clearRect(0, 0, this.currentPreviewCanvas.width, this.currentPreviewCanvas.height);
    }
    this.currentPreviewCanvas = null;

    this.callbacks.onSelectionChanged(false);
    if (prevPageId) {
      this.callbacks.onRequestRedraw(prevPageId);
    }
  }

  setSelection(
    pageId: string,
    strokes: StrokeObject[],
    shapes: ShapeObject[],
    activeCanvas?: HTMLCanvasElement,
    texts: TextObject[] = [],
    images: ImageObject[] = []
  ): void {
    this.activePageId = pageId;
    this.selectedStrokes = [...strokes];
    this.selectedShapes = [...shapes];
    this.selectedTexts = [...texts];
    this.selectedImages = [...images];
    this.combinedBounds = SelectionEngine.computeCombinedBoundingBox(
      strokes,
      shapes,
      texts,
      images
    );
    this.mode = "idle";

    if (activeCanvas) {
      const ctx = activeCanvas.getContext("2d");
      if (ctx && this.combinedBounds) {
        ctx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
        this.renderSelectionOverlay(ctx, activeCanvas, this.combinedBounds);
      }
    }

    this.callbacks.onSelectionChanged(this.hasSelection());
    this.callbacks.onRequestRedraw(pageId);
  }

  handlePointerDown(
    e: PointerEvent,
    page: PageData,
    activeCanvas: HTMLCanvasElement,
    pageCoords: { x: number; y: number }
  ): void {
    if (e.button !== 0 && e.pointerType === "mouse") {
      return;
    }

    try {
      activeCanvas.setPointerCapture(e.pointerId);
    } catch (err) {
      void err;
    }

    this.dragStartPoint = { x: pageCoords.x, y: pageCoords.y };

    if (this.hasSelection() && this.activePageId === page.id && this.combinedBounds) {
      const hitHandle = SelectionEngine.hitTestHandle(
        this.combinedBounds,
        pageCoords.x,
        pageCoords.y,
        12
      );

      if (hitHandle) {
        this.activeHandle = hitHandle;
        this.mode = hitHandle === "rotate" ? "rotating" : "resizing";
        this.initialBounds = { ...this.combinedBounds };
        this.initialStrokes = this.selectedStrokes.map((s) => ({
          ...s,
          points: s.points.map((p) => ({ ...p }))
        }));
        this.initialShapes = this.selectedShapes.map((sh) => ({
          ...sh,
          geometryData: { ...sh.geometryData }
        }));
        this.initialTexts = this.selectedTexts.map((t) => ({ ...t }));
        this.initialImages = this.selectedImages.map((img) => ({ ...img }));
        return;
      }

      const insideBox =
        pageCoords.x >= this.combinedBounds.minX &&
        pageCoords.x <= this.combinedBounds.maxX &&
        pageCoords.y >= this.combinedBounds.minY &&
        pageCoords.y <= this.combinedBounds.maxY;

      if (insideBox) {
        this.mode = "moving";
        this.initialBounds = { ...this.combinedBounds };
        this.initialStrokes = this.selectedStrokes.map((s) => ({
          ...s,
          points: s.points.map((p) => ({ ...p }))
        }));
        this.initialShapes = this.selectedShapes.map((sh) => ({
          ...sh,
          geometryData: { ...sh.geometryData }
        }));
        this.initialTexts = this.selectedTexts.map((t) => ({ ...t }));
        this.initialImages = this.selectedImages.map((img) => ({ ...img }));
        this.currentPreviewCanvas = activeCanvas;
        this.callbacks.onMoveStart?.(page.id, this.initialBounds, e.clientX, e.clientY);
        return;
      }
    }

    this.clearSelection(activeCanvas);
    this.activePageId = page.id;
    this.currentPreviewCanvas = activeCanvas;
    this.mode = "drawing_lasso";
    this.lassoPoints = [{ x: pageCoords.x, y: pageCoords.y }];
  }

  handlePointerMove(
    activeCanvas: HTMLCanvasElement,
    pageCoords: { x: number; y: number },
    targetPage?: PageData,
    targetCanvas?: HTMLCanvasElement,
    targetPageCoords?: { x: number; y: number }
  ): void {
    if (this.mode === "idle" || !this.dragStartPoint) {
      return;
    }

    if (this.mode === "drawing_lasso") {
      const ctx = activeCanvas.getContext("2d");
      if (!ctx) return;
      this.lassoPoints.push({ x: pageCoords.x, y: pageCoords.y });
      this.renderLassoPath(ctx, activeCanvas);
      return;
    }

    if (this.mode === "moving" && this.initialBounds) {
      const effCanvas = targetCanvas || activeCanvas;
      const effCoords = targetPageCoords || pageCoords;
      const pageWidth = targetPage ? targetPage.dimensions.width : effCanvas.width;
      const pageHeight = targetPage ? targetPage.dimensions.height : effCanvas.height;

      const boxWidth = this.initialBounds.maxX - this.initialBounds.minX;
      const boxHeight = this.initialBounds.maxY - this.initialBounds.minY;
      const offsetMinX = this.initialBounds.minX - this.dragStartPoint.x;
      const offsetMinY = this.initialBounds.minY - this.dragStartPoint.y;

      const rawMinX = effCoords.x + offsetMinX;
      const rawMinY = effCoords.y + offsetMinY;

      let clampedMinX = Math.max(0, Math.min(rawMinX, pageWidth - boxWidth));
      let clampedMinY = Math.max(0, Math.min(rawMinY, pageHeight - boxHeight));
      if (boxWidth > pageWidth) clampedMinX = 0;
      if (boxHeight > pageHeight) clampedMinY = 0;

      const targetBox: StrokeBoundingBox = {
        minX: clampedMinX,
        minY: clampedMinY,
        maxX: clampedMinX + boxWidth,
        maxY: clampedMinY + boxHeight
      };

      this.schedulePreview(() => {
        this.applyPreviewTransform(targetBox, 0);

        if (this.currentPreviewCanvas && this.currentPreviewCanvas !== effCanvas) {
          const prevCtx = this.currentPreviewCanvas.getContext("2d");
          prevCtx?.clearRect(0, 0, this.currentPreviewCanvas.width, this.currentPreviewCanvas.height);
        }
        if (activeCanvas !== effCanvas) {
          const srcCtx = activeCanvas.getContext("2d");
          srcCtx?.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
        }
        this.currentPreviewCanvas = effCanvas;

        const effCtx = effCanvas.getContext("2d");
        if (effCtx) {
          this.renderSelectionOverlay(effCtx, effCanvas, targetBox);
        }
      });
      return;
    }

    if (this.mode === "resizing" && this.initialBounds && this.activeHandle) {
      const ctx = activeCanvas.getContext("2d");
      if (!ctx) return;
      const dx = pageCoords.x - this.dragStartPoint.x;
      const dy = pageCoords.y - this.dragStartPoint.y;
      const pageWidth = targetPage ? targetPage.dimensions.width : activeCanvas.width;
      const pageHeight = targetPage ? targetPage.dimensions.height : activeCanvas.height;
      const targetBox = this.calculateResizedBox(
        this.initialBounds,
        this.activeHandle,
        dx,
        dy,
        pageWidth,
        pageHeight
      );

      this.schedulePreview(() => {
        this.applyPreviewTransform(targetBox, 0);
        this.renderSelectionOverlay(ctx, activeCanvas, targetBox);
      });
      return;
    }

    if (this.mode === "rotating" && this.initialBounds) {
      const ctx = activeCanvas.getContext("2d");
      if (!ctx) return;
      const cx = (this.initialBounds.minX + this.initialBounds.maxX) / 2;
      const cy = (this.initialBounds.minY + this.initialBounds.maxY) / 2;
      const startAngle = Math.atan2(this.dragStartPoint.y - cy, this.dragStartPoint.x - cx);
      const currentAngle = Math.atan2(pageCoords.y - cy, pageCoords.x - cx);
      const angleDelta = currentAngle - startAngle;

      this.schedulePreview(() => {
        this.applyPreviewTransform(this.initialBounds!, angleDelta);
        this.renderSelectionOverlay(ctx, activeCanvas, this.initialBounds!);
      });
      return;
    }
  }

  handlePointerUp(
    e: PointerEvent,
    page: PageData,
    activeCanvas: HTMLCanvasElement,
    targetPage?: PageData,
    targetCanvas?: HTMLCanvasElement
  ): void {
    this.flushPreview();
    try {
      activeCanvas.releasePointerCapture(e.pointerId);
    } catch (err) {
      void err;
    }

    const ctx = activeCanvas.getContext("2d");
    if (this.mode === "drawing_lasso") {
      ctx?.clearRect(0, 0, activeCanvas.width, activeCanvas.height);

      const pathDist = this.calculatePathDistance(this.lassoPoints);
      const isClick = pathDist < 12;

      if (isClick && this.dragStartPoint) {
        const hit = SelectionEngine.hitTestSingleElement(
          page.strokes,
          page.shapes,
          this.dragStartPoint.x,
          this.dragStartPoint.y,
          10,
          page.texts,
          page.images
        );

        if (hit?.stroke) {
          this.selectedStrokes = [hit.stroke];
          this.selectedShapes = [];
          this.selectedTexts = [];
          this.selectedImages = [];
          this.activePageId = page.id;
          this.combinedBounds = { ...hit.stroke.bounds };
          this.callbacks.onSelectionChanged(true);
          this.callbacks.onRequestRedraw(page.id);
          if (ctx) {
            this.renderSelectionOverlay(ctx, activeCanvas, this.combinedBounds);
          }
        } else if (hit?.shape) {
          this.selectedStrokes = [];
          this.selectedShapes = [hit.shape];
          this.selectedTexts = [];
          this.selectedImages = [];
          this.activePageId = page.id;
          this.combinedBounds = { ...hit.shape.bounds };
          this.callbacks.onSelectionChanged(true);
          this.callbacks.onRequestRedraw(page.id);
          if (ctx) {
            this.renderSelectionOverlay(ctx, activeCanvas, this.combinedBounds);
          }
        } else if (hit?.text) {
          this.selectedStrokes = [];
          this.selectedShapes = [];
          this.selectedTexts = [hit.text];
          this.selectedImages = [];
          this.activePageId = page.id;
          const w = hit.text.width || 100;
          const h = hit.text.height || 30;
          this.combinedBounds = { minX: hit.text.x, minY: hit.text.y, maxX: hit.text.x + w, maxY: hit.text.y + h };
          this.callbacks.onSelectionChanged(true);
          this.callbacks.onRequestRedraw(page.id);
          if (ctx) {
            this.renderSelectionOverlay(ctx, activeCanvas, this.combinedBounds);
          }
        } else if (hit?.image) {
          this.selectedStrokes = [];
          this.selectedShapes = [];
          this.selectedTexts = [];
          this.selectedImages = [hit.image];
          this.activePageId = page.id;
          this.combinedBounds = { minX: hit.image.x, minY: hit.image.y, maxX: hit.image.x + hit.image.width, maxY: hit.image.y + hit.image.height };
          this.callbacks.onSelectionChanged(true);
          this.callbacks.onRequestRedraw(page.id);
          if (ctx) {
            this.renderSelectionOverlay(ctx, activeCanvas, this.combinedBounds);
          }
        } else {
          this.clearSelection(activeCanvas);
        }
      } else if (this.lassoPoints.length >= 3) {
        const lassoBounds = SelectionEngine.computePolygonBoundingBox(this.lassoPoints);
        const selectedStrokes = page.strokes.filter((s) =>
          SelectionEngine.isStrokeSelectedByLasso(s, this.lassoPoints, 0.45, lassoBounds)
        );
        const selectedShapes = page.shapes.filter((sh) =>
          SelectionEngine.isShapeSelectedByLasso(sh, this.lassoPoints, lassoBounds)
        );
        const selectedImages = page.images
          ? page.images.filter((img) =>
              SelectionEngine.isImageSelectedByLasso(img, this.lassoPoints, lassoBounds)
            )
          : [];
        const selectedTexts = page.texts
          ? page.texts.filter((t) =>
              SelectionEngine.isTextSelectedByLasso(t, this.lassoPoints, lassoBounds)
            )
          : [];

        if (
          selectedStrokes.length > 0 ||
          selectedShapes.length > 0 ||
          selectedImages.length > 0 ||
          selectedTexts.length > 0
        ) {
          this.selectedStrokes = selectedStrokes;
          this.selectedShapes = selectedShapes;
          this.selectedTexts = selectedTexts;
          this.selectedImages = selectedImages;
          this.activePageId = page.id;
          this.combinedBounds = SelectionEngine.computeCombinedBoundingBox(
            selectedStrokes,
            selectedShapes,
            selectedTexts,
            selectedImages
          );
          this.callbacks.onSelectionChanged(true);
          this.callbacks.onRequestRedraw(page.id);
          if (ctx && this.combinedBounds) {
            this.renderSelectionOverlay(ctx, activeCanvas, this.combinedBounds);
          }
        } else {
          this.clearSelection(activeCanvas);
        }
      }

      this.mode = "idle";
      this.lassoPoints = [];
      this.dragStartPoint = null;
      return;
    }

    if (
      (this.mode === "moving" || this.mode === "resizing" || this.mode === "rotating") &&
      this.activePageId &&
      this.initialBounds
    ) {
      const sourcePageId = this.activePageId;
      const effTargetPage = targetPage || page;
      const effCanvas = targetCanvas || activeCanvas;
      const isCrossPage = effTargetPage.id !== sourcePageId && this.mode === "moving";

      this.combinedBounds = SelectionEngine.computeCombinedBoundingBox(
        this.selectedStrokes,
        this.selectedShapes,
        this.selectedTexts,
        this.selectedImages
      );

      if (isCrossPage && this.callbacks.onElementsMovedAcrossPages) {
        if (activeCanvas !== effCanvas) {
          const srcCtx = activeCanvas.getContext("2d");
          srcCtx?.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
        }
        if (this.currentPreviewCanvas && this.currentPreviewCanvas !== effCanvas) {
          const prevCtx = this.currentPreviewCanvas.getContext("2d");
          prevCtx?.clearRect(0, 0, this.currentPreviewCanvas.width, this.currentPreviewCanvas.height);
        }

        this.activePageId = effTargetPage.id;

        this.callbacks.onElementsMovedAcrossPages(
          sourcePageId,
          effTargetPage.id,
          this.initialStrokes,
          this.selectedStrokes,
          this.initialShapes,
          this.selectedShapes,
          this.initialImages,
          this.selectedImages,
          this.initialTexts,
          this.selectedTexts
        );

        const targetCtx = effCanvas.getContext("2d");
        if (targetCtx && this.combinedBounds) {
          targetCtx.clearRect(0, 0, effCanvas.width, effCanvas.height);
          this.renderSelectionOverlay(targetCtx, effCanvas, this.combinedBounds);
        }
      } else {
        this.callbacks.onTransformCommitted(
          this.activePageId,
          this.initialStrokes,
          this.selectedStrokes,
          this.initialShapes,
          this.selectedShapes,
          this.initialImages,
          this.selectedImages,
          this.initialTexts,
          this.selectedTexts
        );

        this.callbacks.onRequestRedraw(this.activePageId);

        const targetCtx = effCanvas.getContext("2d");
        if (targetCtx && this.combinedBounds) {
          targetCtx.clearRect(0, 0, effCanvas.width, effCanvas.height);
          this.renderSelectionOverlay(targetCtx, effCanvas, this.combinedBounds);
        }
      }
    }

    this.mode = "idle";
    this.activeHandle = null;
    this.dragStartPoint = null;
    this.initialBounds = null;
    this.currentPreviewCanvas = null;
  }

  deleteSelection(page: PageData, activeCanvas: HTMLCanvasElement): void {
    if (!this.hasSelection()) {
      return;
    }

    const strokesToDelete = [...this.selectedStrokes];
    const shapesToDelete = [...this.selectedShapes];
    const textsToDelete = [...this.selectedTexts];
    const imagesToDelete = [...this.selectedImages];

    this.clearSelection(activeCanvas);
    this.callbacks.onElementsDeleted(
      page.id,
      strokesToDelete,
      shapesToDelete,
      textsToDelete,
      imagesToDelete
    );
  }

  changeColor(newColor: string, page: PageData, activeCanvas: HTMLCanvasElement): void {
    if (!this.hasSelection()) {
      return;
    }

    const prevStrokes = this.selectedStrokes.map((s) => ({ ...s }));
    const prevShapes = this.selectedShapes.map((sh) => ({ ...sh }));
    const prevTexts = this.selectedTexts.map((t) => ({ ...t }));

    this.selectedStrokes = this.selectedStrokes.map((s) => ({
      ...s,
      color: newColor
    }));

    this.selectedShapes = this.selectedShapes.map((sh) => ({
      ...sh,
      color: newColor
    }));

    this.selectedTexts = this.selectedTexts.map((t) => {
      if (t.isSticky) {
        return { ...t, backgroundColor: newColor };
      }
      return { ...t, color: newColor };
    });

    this.callbacks.onTransformCommitted(
      page.id,
      prevStrokes,
      this.selectedStrokes,
      prevShapes,
      this.selectedShapes,
      undefined,
      undefined,
      prevTexts,
      this.selectedTexts
    );

    if (this.combinedBounds) {
      const ctx = activeCanvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
        this.renderSelectionOverlay(ctx, activeCanvas, this.combinedBounds);
      }
    }
  }

  changeWidth(newWidth: number, page: PageData, activeCanvas: HTMLCanvasElement): void {
    if (!this.hasSelection()) {
      return;
    }

    const prevStrokes = this.selectedStrokes.map((s) => ({ ...s }));
    const prevShapes = this.selectedShapes.map((sh) => ({ ...sh }));

    this.selectedStrokes = this.selectedStrokes.map((s) => ({
      ...s,
      width: newWidth,
      bounds: StrokeGeometry.computeBoundingBox(s.points, newWidth)
    }));

    this.selectedShapes = this.selectedShapes.map((sh) => ({
      ...sh,
      strokeWidth: newWidth
    }));

    this.combinedBounds = SelectionEngine.computeCombinedBoundingBox(
      this.selectedStrokes,
      this.selectedShapes
    );

    this.callbacks.onTransformCommitted(
      page.id,
      prevStrokes,
      this.selectedStrokes,
      prevShapes,
      this.selectedShapes
    );

    if (this.combinedBounds) {
      const ctx = activeCanvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
        this.renderSelectionOverlay(ctx, activeCanvas, this.combinedBounds);
      }
    }
  }

  private applyPreviewTransform(
    targetBox: StrokeBoundingBox,
    rotationDelta: number
  ): void {
    if (!this.initialBounds) {
      return;
    }

    const origin = this.initialBounds;

    this.selectedStrokes = this.initialStrokes.map((s) => {
      const transformedPoints = s.points.map((p) =>
        SelectionEngine.transformPoint(p, origin, targetBox, rotationDelta)
      );
      return {
        ...s,
        points: transformedPoints,
        bounds: StrokeGeometry.computeBoundingBox(transformedPoints, s.width)
      };
    });

    this.selectedShapes = this.initialShapes.map((sh) => {
      const center = {
        x: (targetBox.minX + targetBox.maxX) / 2,
        y: (targetBox.minY + targetBox.maxY) / 2
      };
      const w = Math.max(10, targetBox.maxX - targetBox.minX);
      const h = Math.max(10, targetBox.maxY - targetBox.minY);

      const newGeometry = { ...sh.geometryData };
      if (
        sh.type === "rectangle" ||
        sh.type === "rounded-rectangle" ||
        sh.type === "diamond" ||
        sh.type === "star" ||
        sh.type === "callout"
      ) {
        newGeometry.x = targetBox.minX;
        newGeometry.y = targetBox.minY;
        newGeometry.width = w;
        newGeometry.height = h;
      } else if (sh.type === "circle") {
        newGeometry.cx = center.x;
        newGeometry.cy = center.y;
        newGeometry.r = Math.min(w, h) / 2;
      } else if (sh.type === "ellipse") {
        newGeometry.cx = center.x;
        newGeometry.cy = center.y;
        newGeometry.rx = w / 2;
        newGeometry.ry = h / 2;
      } else if (sh.type === "line" || sh.type === "arrow") {
        if (
          sh.geometryData.x1 !== undefined &&
          sh.geometryData.y1 !== undefined &&
          sh.geometryData.x2 !== undefined &&
          sh.geometryData.y2 !== undefined
        ) {
          const p1 = SelectionEngine.transformPoint(
            { x: sh.geometryData.x1, y: sh.geometryData.y1, pressure: 1, timestamp: 0 },
            origin,
            targetBox,
            rotationDelta
          );
          const p2 = SelectionEngine.transformPoint(
            { x: sh.geometryData.x2, y: sh.geometryData.y2, pressure: 1, timestamp: 0 },
            origin,
            targetBox,
            rotationDelta
          );
          newGeometry.x1 = p1.x;
          newGeometry.y1 = p1.y;
          newGeometry.x2 = p2.x;
          newGeometry.y2 = p2.y;
        } else {
          newGeometry.x = targetBox.minX;
          newGeometry.y = targetBox.minY;
          newGeometry.width = w;
          newGeometry.height = h;
        }
      } else if (sh.type === "triangle") {
        if (sh.geometryData.x1 !== undefined && sh.geometryData.y1 !== undefined) {
          const p1 = SelectionEngine.transformPoint(
            { x: sh.geometryData.x1, y: sh.geometryData.y1, pressure: 1, timestamp: 0 },
            origin,
            targetBox,
            rotationDelta
          );
          const p2 = SelectionEngine.transformPoint(
            { x: sh.geometryData.x2, y: sh.geometryData.y2, pressure: 1, timestamp: 0 },
            origin,
            targetBox,
            rotationDelta
          );
          const p3 = SelectionEngine.transformPoint(
            { x: sh.geometryData.x3, y: sh.geometryData.y3, pressure: 1, timestamp: 0 },
            origin,
            targetBox,
            rotationDelta
          );
          newGeometry.x1 = p1.x;
          newGeometry.y1 = p1.y;
          newGeometry.x2 = p2.x;
          newGeometry.y2 = p2.y;
          newGeometry.x3 = p3.x;
          newGeometry.y3 = p3.y;
        }
      }

      return {
        ...sh,
        geometryData: newGeometry,
        bounds: { ...targetBox }
      };
    });

    const origWidth = Math.max(1, origin.maxX - origin.minX);
    const origHeight = Math.max(1, origin.maxY - origin.minY);
    const targetWidth = targetBox.maxX - targetBox.minX;
    const targetHeight = targetBox.maxY - targetBox.minY;
    const scaleX = targetWidth / origWidth;
    const scaleY = targetHeight / origHeight;

    this.selectedImages = this.initialImages.map((img) => {
      const relX = img.x - origin.minX;
      const relY = img.y - origin.minY;
      const newX = targetBox.minX + relX * scaleX;
      const newY = targetBox.minY + relY * scaleY;
      const newW = Math.max(20, img.width * scaleX);
      const newH = Math.max(20, img.height * scaleY);
      let nextRotation = img.rotation || 0;
      if (rotationDelta !== 0) {
        const deg = Math.round(rotationDelta * (180 / Math.PI));
        nextRotation = ((img.rotation || 0) + deg) % 360;
        if (nextRotation < 0) nextRotation += 360;
      }
      return {
        ...img,
        x: newX,
        y: newY,
        width: newW,
        height: newH,
        rotation: nextRotation,
        bounds: {
          minX: newX,
          minY: newY,
          maxX: newX + newW,
          maxY: newY + newH
        }
      };
    });

    this.selectedTexts = this.initialTexts.map((t) => {
      const relX = t.x - origin.minX;
      const relY = t.y - origin.minY;
      const newX = targetBox.minX + relX * scaleX;
      const newY = targetBox.minY + relY * scaleY;
      const newW = Math.max(40, t.width * scaleX);
      const newH = Math.max(20, t.height * scaleY);
      return {
        ...t,
        x: newX,
        y: newY,
        width: newW,
        height: newH,
        bounds: {
          minX: newX,
          minY: newY,
          maxX: newX + newW,
          maxY: newY + newH
        }
      };
    });
  }

  private calculateResizedBox(
    box: StrokeBoundingBox,
    handle: SelectionHandle,
    dx: number,
    dy: number,
    pageWidth: number = 595,
    pageHeight: number = 842
  ): StrokeBoundingBox {
    let { minX, minY, maxX, maxY } = box;

    switch (handle) {
      case "nw":
        minX += dx;
        minY += dy;
        break;
      case "n":
        minY += dy;
        break;
      case "ne":
        maxX += dx;
        minY += dy;
        break;
      case "e":
        maxX += dx;
        break;
      case "se":
        maxX += dx;
        maxY += dy;
        break;
      case "s":
        maxY += dy;
        break;
      case "sw":
        minX += dx;
        maxY += dy;
        break;
      case "w":
        minX += dx;
        break;
    }

    if (minX > maxX - 10) minX = maxX - 10;
    if (minY > maxY - 10) minY = maxY - 10;

    minX = Math.max(0, minX);
    minY = Math.max(0, minY);
    maxX = Math.min(pageWidth, maxX);
    maxY = Math.min(pageHeight, maxY);

    return { minX, minY, maxX, maxY };
  }

  private calculatePathDistance(points: { x: number; y: number }[]): number {
    let dist = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      dist += Math.sqrt(dx * dx + dy * dy);
    }
    return dist;
  }

  private renderLassoPath(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement
  ): void {
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

    if (this.lassoPoints.length < 2) {
      return;
    }

    ctx.save();
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(this.lassoPoints[0].x, this.lassoPoints[0].y);

    for (let i = 1; i < this.lassoPoints.length; i++) {
      ctx.lineTo(this.lassoPoints[i].x, this.lassoPoints[i].y);
    }

    ctx.stroke();
    ctx.restore();
  }

  commitMove(
    targetPage: PageData,
    targetBox: StrokeBoundingBox,
    targetCanvas: HTMLCanvasElement
  ): void {
    if (!this.activePageId || !this.initialBounds) {
      return;
    }

    const sourcePageId = this.activePageId;
    const isCrossPage = targetPage.id !== sourcePageId;

    this.applyPreviewTransform(targetBox, 0);

    this.combinedBounds = SelectionEngine.computeCombinedBoundingBox(
      this.selectedStrokes,
      this.selectedShapes,
      this.selectedTexts,
      this.selectedImages
    );

    if (isCrossPage && this.callbacks.onElementsMovedAcrossPages) {
      this.activePageId = targetPage.id;

      this.callbacks.onElementsMovedAcrossPages(
        sourcePageId,
        targetPage.id,
        this.initialStrokes,
        this.selectedStrokes,
        this.initialShapes,
        this.selectedShapes,
        this.initialImages,
        this.selectedImages,
        this.initialTexts,
        this.selectedTexts
      );
      this.callbacks.onRequestRedraw(sourcePageId);
    } else {
      this.callbacks.onTransformCommitted(
        this.activePageId,
        this.initialStrokes,
        this.selectedStrokes,
        this.initialShapes,
        this.selectedShapes,
        this.initialImages,
        this.selectedImages,
        this.initialTexts,
        this.selectedTexts
      );
      this.callbacks.onRequestRedraw(this.activePageId);
    }

    const targetCtx = targetCanvas.getContext("2d");
    if (targetCtx && this.combinedBounds) {
      targetCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
      this.renderSelectionOverlay(targetCtx, targetCanvas, this.combinedBounds);
    }

    this.mode = "idle";
    this.initialBounds = null;
    this.initialStrokes = [];
    this.initialShapes = [];
    this.initialTexts = [];
    this.initialImages = [];
  }

  cancelMove(): void {
    this.flushPreview();
    if (this.mode === "moving") {
      this.mode = "idle";
      this.activeHandle = null;
      this.dragStartPoint = null;
      this.initialBounds = null;
      this.initialStrokes = [];
      this.initialShapes = [];
      this.initialTexts = [];
      this.initialImages = [];
      this.currentPreviewCanvas = null;
    }
  }

  renderSelectionDashedBox(
    ctx: CanvasRenderingContext2D,
    bounds: StrokeBoundingBox
  ): void {
    ctx.save();
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);

    const pad = 4;
    const x = bounds.minX - pad;
    const y = bounds.minY - pad;
    const w = bounds.maxX - bounds.minX + pad * 2;
    const h = bounds.maxY - bounds.minY + pad * 2;

    ctx.strokeRect(x, y, w, h);

    const handles = SelectionEngine.getHandlePositions(bounds);
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(handles.n.x, handles.n.y);
    ctx.lineTo(handles.rotate.x, handles.rotate.y);
    ctx.stroke();

    ctx.fillStyle = "#2563eb";
    ctx.beginPath();
    ctx.arc(handles.rotate.x, handles.rotate.y, 5, 0, Math.PI * 2);
    ctx.fill();

    const handleKeys: (keyof typeof handles)[] = [
      "nw",
      "n",
      "ne",
      "e",
      "se",
      "s",
      "sw",
      "w"
    ];
    for (const key of handleKeys) {
      const pos = handles[key];
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 2;
      ctx.fillRect(pos.x - 4, pos.y - 4, 8, 8);
      ctx.strokeRect(pos.x - 4, pos.y - 4, 8, 8);
    }

    ctx.restore();
  }

  renderSelectionOverlay(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    bounds: StrokeBoundingBox
  ): void {
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

    for (const stroke of this.selectedStrokes) {
      StrokeGeometry.renderStroke(ctx, stroke);
    }
    for (const shape of this.selectedShapes) {
      ShapeRecognizer.renderShape(ctx, shape);
    }

    this.renderSelectionDashedBox(ctx, bounds);
  }

  destroy(): void {
    this.flushPreview();
    this.clearSelection();
  }
}
