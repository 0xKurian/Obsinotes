import {
  PointSample,
  StrokeObject,
  StrokePattern,
  ToolType,
  EraserMode,
  PageDimensions,
  ShapeObject,
  StrokeBoundingBox
} from "../types";
import { StrokeGeometry } from "./StrokeGeometry";
import { EraserEngine } from "./EraserEngine";
import { ShapeRecognizer } from "../shape/ShapeRecognizer";
import { PerformanceMonitor } from "../performance/PerformanceMonitor";
import { PageSpatialIndex } from "../geometry/PageSpatialIndex";
import { PageBackingCache } from "../performance/PageBackingCache";

export interface CoalescedPointInput {
  x: number;
  y: number;
  pressure?: number;
  tiltX?: number;
  tiltY?: number;
  timestamp?: number;
}

export interface InkingControllerCallbacks {
  onStrokeCommitted: (pageId: string, stroke: StrokeObject) => void;
  onShapeCommitted?: (pageId: string, shape: ShapeObject, rawStroke: StrokeObject) => void;
  onStrokesErased: (
    pageId: string,
    remainingStrokes: StrokeObject[],
    remainingShapes?: ShapeObject[]
  ) => void;
}

const ACTIVE_BAKE_THRESHOLD = 48;
const ACTIVE_TAIL_KEEP = 18;
const ACTIVE_OVERLAP = 8;

export class InkingController {
  activeTool: ToolType = "pressure";
  currentColor: string = "#1e293b";
  currentWidth: number = 2.5;
  currentOpacity: number = 1.0;
  currentStrokePattern: StrokePattern = "solid";
  eraserMode: EraserMode = "stroke";
  eraserRadius: number = 12;
  shapeRecognitionEnabled: boolean = true;
  palmRejectionDelayMs: number = 350;

  private isDrawing: boolean = false;
  private activePageId: string | null = null;
  private activeCanvas: HTMLCanvasElement | null = null;
  private committedCanvas: HTMLCanvasElement | null = null;
  private activePrefixCanvas: HTMLCanvasElement | null = null;
  private settledPointCount: number = 0;
  private currentPoints: PointSample[] = [];
  private lastPenTimestamp: number = 0;
  private lastMoveTimestamp: number = 0;
  private strokeStartTimestamp: number = 0;
  private callbacks: InkingControllerCallbacks;
  private rafId: number | null = null;
  private isRafScheduled: boolean = false;
  private performanceMonitor?: PerformanceMonitor;
  private backingCache?: PageBackingCache;

  private eraserSession: {
    pageId: string;
    initialStrokes: StrokeObject[];
    initialShapes: ShapeObject[];
    currentStrokes: StrokeObject[];
    currentShapes: ShapeObject[];
    hasChanges: boolean;
    committedCanvas: HTMLCanvasElement;
    dimensions: PageDimensions;
    spatialIndex: PageSpatialIndex;
    pendingDirtyBox: StrokeBoundingBox | null;
  } | null = null;
  private eraserRafId: number | null = null;
  private isEraserRafScheduled: boolean = false;

  constructor(callbacks: InkingControllerCallbacks) {
    this.callbacks = callbacks;
  }

  setTool(tool: ToolType): void {
    this.activeTool = tool;
  }

  setColor(color: string): void {
    this.currentColor = color;
  }

  setWidth(width: number): void {
    this.currentWidth = Math.max(0.5, Math.min(30, width));
  }

  setStrokePattern(pattern: StrokePattern): void {
    this.currentStrokePattern = pattern;
  }

  setEraserMode(mode: EraserMode): void {
    this.eraserMode = mode;
  }

  setEraserRadius(radius: number): void {
    this.eraserRadius = Math.max(4, Math.min(50, radius));
  }

  setShapeRecognition(enabled: boolean): void {
    this.shapeRecognitionEnabled = enabled;
  }

  setPalmRejectionDelay(ms: number): void {
    if (Number.isFinite(ms)) {
      this.palmRejectionDelayMs = Math.max(0, Math.min(1000, Math.round(ms)));
    }
  }

  setPerformanceMonitor(monitor?: PerformanceMonitor): void {
    this.performanceMonitor = monitor;
  }

  setBackingCache(cache?: PageBackingCache): void {
    this.backingCache = cache;
  }

  isCurrentlyDrawing(pageId?: string): boolean {
    if (!this.isDrawing) {
      return false;
    }
    if (pageId && this.activePageId !== pageId) {
      return false;
    }
    return true;
  }

  getActiveStrokeMeta(): { pointCount: number; elapsedMs: number } {
    return {
      pointCount: this.currentPoints.length,
      elapsedMs: this.strokeStartTimestamp > 0 ? Date.now() - this.strokeStartTimestamp : 0
    };
  }

  discardActiveStroke(): void {
    if (this.activeCanvas) {
      this.clearCanvas(this.activeCanvas);
    }
    this.finalizeStrokeDrawing();
  }

  handlePointerDown(
    e: PointerEvent,
    pageId: string,
    activeCanvas: HTMLCanvasElement,
    committedCanvas: HTMLCanvasElement,
    pageCoords: { x: number; y: number },
    existingStrokes: StrokeObject[],
    existingShapes: ShapeObject[] = [],
    pageDimensions?: PageDimensions
  ): void {
    if (e.pointerType === "pen") {
      this.lastPenTimestamp = Date.now();
    } else if (e.pointerType === "touch") {
      if (Date.now() - this.lastPenTimestamp < this.palmRejectionDelayMs) {
        return;
      }
    }

    if (e.button !== 0 && e.pointerType === "mouse") {
      return;
    }

    if (
      this.activeTool === "select" ||
      this.activeTool === "lasso" ||
      this.activeTool === "shape" ||
      this.activeTool === "connector" ||
      this.activeTool === "sticky" ||
      this.activeTool === "text" ||
      this.activeTool === "image"
    ) {
      return;
    }

    this.activePageId = pageId;
    this.activeCanvas = activeCanvas;
    this.committedCanvas = committedCanvas;
    this.lastMoveTimestamp = Date.now();

    try {
      activeCanvas.setPointerCapture(e.pointerId);
    } catch (err) {
      void err;
    }

    if (this.activeTool === "eraser") {
      this.isDrawing = true;
      const dims: PageDimensions = pageDimensions || {
        width: Number(committedCanvas.dataset?.pageWidth) || committedCanvas.clientWidth || committedCanvas.width || 595.28,
        height: Number(committedCanvas.dataset?.pageHeight) || committedCanvas.clientHeight || committedCanvas.height || 841.89,
        unit: "pt"
      };
      const spatialIndex = new PageSpatialIndex();
      for (const s of existingStrokes) {
        spatialIndex.insertStroke(s);
      }
      for (const sh of existingShapes) {
        spatialIndex.insertShape(sh);
      }
      this.eraserSession = {
        pageId,
        initialStrokes: [...existingStrokes],
        initialShapes: [...existingShapes],
        currentStrokes: [...existingStrokes],
        currentShapes: [...existingShapes],
        hasChanges: false,
        committedCanvas,
        dimensions: dims,
        spatialIndex,
        pendingDirtyBox: null
      };
      this.processEraserPoints([{ x: pageCoords.x, y: pageCoords.y }]);
      return;
    }

    this.isDrawing = true;
    this.strokeStartTimestamp = Date.now();
    this.currentPoints = [];
    this.settledPointCount = 0;
    this.resetActivePrefixCanvas(activeCanvas);

    const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5;
    const startPoint: PointSample = {
      x: pageCoords.x,
      y: pageCoords.y,
      pressure,
      timestamp: e.timeStamp || Date.now(),
      tiltX: e.tiltX,
      tiltY: e.tiltY
    };

    this.currentPoints.push(startPoint);
    this.renderActiveStroke();
  }

  handlePointerMove(
    e: PointerEvent,
    pageCoordsList: CoalescedPointInput[],
    _existingStrokes?: StrokeObject[],
    _existingShapes?: ShapeObject[]
  ): void {
    if (!this.isDrawing || !this.activePageId) {
      return;
    }

    this.lastMoveTimestamp = Date.now();

    if (this.activeTool === "eraser") {
      if (this.eraserSession) {
        this.processEraserPoints(pageCoordsList);
      }
      return;
    }

    const fallbackPressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5;
    const fallbackTime = e.timeStamp || Date.now();

    for (let i = 0; i < pageCoordsList.length; i++) {
      const pt = pageCoordsList[i];
      const ptPressure = pt.pressure !== undefined && pt.pressure > 0 ? pt.pressure : fallbackPressure;
      const ptTiltX = pt.tiltX !== undefined ? pt.tiltX : e.tiltX;
      const ptTiltY = pt.tiltY !== undefined ? pt.tiltY : e.tiltY;
      const ptTime = pt.timestamp !== undefined && pt.timestamp > 0 ? pt.timestamp : fallbackTime + i;

      const lastPoint = this.currentPoints[this.currentPoints.length - 1];
      if (lastPoint) {
        const dx = pt.x - lastPoint.x;
        const dy = pt.y - lastPoint.y;
        const distSq = dx * dx + dy * dy;
        const isPressureSignificant = Math.abs(ptPressure - (lastPoint.pressure || 0.5)) > 0.05;
        if (distSq < 0.25 && !isPressureSignificant) {
          lastPoint.timestamp = ptTime;
          lastPoint.tiltX = ptTiltX;
          lastPoint.tiltY = ptTiltY;
          continue;
        }
      }

      const sample: PointSample = {
        x: pt.x,
        y: pt.y,
        pressure: ptPressure,
        timestamp: ptTime,
        tiltX: ptTiltX,
        tiltY: ptTiltY
      };
      this.currentPoints.push(sample);
    }

    if (this.performanceMonitor) {
      this.performanceMonitor.recordPointerEvent(e.timeStamp || Date.now(), pageCoordsList.length);
    }

    this.scheduleActiveStrokeRender();
  }

  handlePointerUp(e: PointerEvent): void {
    if (!this.isDrawing || !this.activePageId) {
      return;
    }

    if (this.activeCanvas) {
      try {
        this.activeCanvas.releasePointerCapture(e.pointerId);
      } catch (err) {
        void err;
      }
      this.clearCanvas(this.activeCanvas);
    }

    if (this.activeTool === "eraser") {
      this.commitEraserSession();
    } else {
      this.commitCurrentStroke();
    }
    this.finalizeStrokeDrawing();
  }

  handlePointerCancel(e: PointerEvent): void {
    if (this.activeCanvas) {
      try {
        this.activeCanvas.releasePointerCapture(e.pointerId);
      } catch (err) {
        void err;
      }
      this.clearCanvas(this.activeCanvas);
    }

    if (this.isDrawing && this.activePageId) {
      if (this.activeTool === "eraser") {
        this.commitEraserSession();
      } else if (this.currentPoints.length > 0) {
        this.commitCurrentStroke();
      }
    }

    this.finalizeStrokeDrawing();
  }

  private commitCurrentStroke(): void {
    if (!this.activePageId || this.currentPoints.length === 0 || this.activeTool === "eraser") {
      return;
    }

    const holdDuration = Date.now() - this.lastMoveTimestamp;
    if (this.activeTool === "highlighter" && holdDuration >= 300) {
      this.currentPoints = StrokeGeometry.straightenHighlighterPoints(this.currentPoints);
    }
    const opacity = this.activeTool === "highlighter" ? 0.35 : this.currentOpacity;
    const stroke: StrokeObject = {
      id: `stroke_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      elementType: "stroke",
      tool: this.activeTool,
      color: this.currentColor,
      width: this.currentWidth,
      opacity,
      strokePattern: this.currentStrokePattern !== "solid" ? this.currentStrokePattern : undefined,
      points: [...this.currentPoints],
      bounds: StrokeGeometry.computeBoundingBox(this.currentPoints, Math.max(2, this.currentWidth)),
      createdAt: Date.now()
    };

    const shouldCheckShape =
      this.shapeRecognitionEnabled &&
      (this.activeTool === "pen" ||
        this.activeTool === "pressure" ||
        this.activeTool === "fountain" ||
        this.activeTool === "shape") &&
      (holdDuration >= 350 || this.activeTool === "shape");

    if (shouldCheckShape && this.callbacks.onShapeCommitted) {
      const recognized = ShapeRecognizer.recognize(
        this.currentPoints,
        this.currentColor,
        this.currentWidth
      );

      if (recognized) {
        if (this.currentStrokePattern !== "solid") {
          recognized.shape.strokePattern = this.currentStrokePattern;
        }
        if (this.committedCanvas) {
          const ctx = this.committedCanvas.getContext("2d");
          if (ctx) {
            const scale =
              this.committedCanvas.width /
              (Number(this.committedCanvas.dataset?.pageWidth) ||
                this.committedCanvas.clientWidth ||
                this.committedCanvas.width);
            if (typeof ctx.setTransform === "function") {
              ctx.setTransform(scale, 0, 0, scale, 0, 0);
            }
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ShapeRecognizer.renderShape(ctx, recognized.shape);
          }
          this.backingCache?.release(this.activePageId);
        }
        this.callbacks.onShapeCommitted(this.activePageId, recognized.shape, stroke);
        return;
      }
    }

    if (this.committedCanvas) {
      const pageW =
        Number(this.committedCanvas.dataset?.pageWidth) ||
        this.committedCanvas.clientWidth ||
        this.committedCanvas.width;
      const pageH =
        Number(this.committedCanvas.dataset?.pageHeight) ||
        this.committedCanvas.clientHeight ||
        this.committedCanvas.height;
      const ctx = this.committedCanvas.getContext("2d");
      if (ctx) {
        const scale = this.committedCanvas.width / pageW;
        if (typeof ctx.setTransform === "function") {
          ctx.setTransform(scale, 0, 0, scale, 0, 0);
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        StrokeGeometry.renderStroke(ctx, stroke);
      }
      if (this.backingCache && stroke.tool !== "highlighter") {
        this.backingCache.appendStroke(
          this.committedCanvas,
          this.activePageId,
          { width: pageW, height: pageH, unit: "pt" },
          stroke
        );
      } else {
        this.backingCache?.release(this.activePageId);
      }
    }

    this.callbacks.onStrokeCommitted(this.activePageId, stroke);
  }

  private scheduleActiveStrokeRender(): void {
    if (this.isRafScheduled) {
      return;
    }
    if (typeof window === "undefined" || typeof window.requestAnimationFrame === "undefined") {
      this.renderActiveStroke();
      return;
    }
    this.isRafScheduled = true;
    this.rafId = window.requestAnimationFrame(() => {
      this.isRafScheduled = false;
      this.rafId = null;
      this.renderActiveStroke();
    });
  }

  private finalizeStrokeDrawing(): void {
    if (this.rafId !== null && typeof window !== "undefined" && typeof window.cancelAnimationFrame !== "undefined") {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (
      this.eraserRafId !== null &&
      typeof window !== "undefined" &&
      typeof window.cancelAnimationFrame !== "undefined"
    ) {
      window.cancelAnimationFrame(this.eraserRafId);
      this.eraserRafId = null;
    }
    if (this.activePrefixCanvas) {
      this.activePrefixCanvas.width = 1;
      this.activePrefixCanvas.height = 1;
      this.activePrefixCanvas = null;
    }
    this.settledPointCount = 0;
    this.isRafScheduled = false;
    this.isEraserRafScheduled = false;
    this.isDrawing = false;
    this.eraserSession = null;
    this.activePageId = null;
    this.activeCanvas = null;
    this.committedCanvas = null;
    this.currentPoints = [];
    this.strokeStartTimestamp = 0;
  }

  private resetActivePrefixCanvas(activeCanvas: HTMLCanvasElement): void {
    if (typeof createEl !== "function" || activeCanvas.width <= 1 || activeCanvas.height <= 1) {
      this.activePrefixCanvas = null;
      return;
    }
    if (!this.activePrefixCanvas) {
      this.activePrefixCanvas = createEl("canvas");
    }
    this.activePrefixCanvas.width = activeCanvas.width;
    this.activePrefixCanvas.height = activeCanvas.height;
  }

  private renderActiveStroke(): void {
    if (!this.activeCanvas || this.currentPoints.length === 0) {
      return;
    }

    const ctx = this.activeCanvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const pageW =
      Number(this.activeCanvas.dataset?.pageWidth) || this.activeCanvas.clientWidth || this.activeCanvas.width;
    const scale = this.activeCanvas.width / pageW;
    const canIncrementalBake =
      this.activePrefixCanvas !== null &&
      this.activeTool !== "highlighter" &&
      this.activeTool !== "pencil" &&
      this.currentStrokePattern === "solid" &&
      this.currentOpacity >= 0.98;

    if (canIncrementalBake && this.currentPoints.length - this.settledPointCount > ACTIVE_BAKE_THRESHOLD) {
      const nextSettledEnd = this.currentPoints.length - ACTIVE_TAIL_KEEP;
      const sliceStart = Math.max(0, this.settledPointCount - ACTIVE_OVERLAP);
      const bakePoints = this.currentPoints.slice(sliceStart, nextSettledEnd);
      const prefixCtx = this.activePrefixCanvas!.getContext("2d");
      if (prefixCtx && bakePoints.length >= 2) {
        if (typeof prefixCtx.setTransform === "function") {
          prefixCtx.setTransform(scale, 0, 0, scale, 0, 0);
        }
        prefixCtx.imageSmoothingEnabled = true;
        prefixCtx.imageSmoothingQuality = "high";
        const chunkStroke: StrokeObject = {
          id: "active",
          elementType: "stroke",
          tool: this.activeTool,
          color: this.currentColor,
          width: this.currentWidth,
          opacity: this.currentOpacity,
          points: bakePoints,
          bounds: StrokeGeometry.computeBoundingBox(bakePoints, this.currentWidth),
          createdAt: 0
        };
        StrokeGeometry.renderStroke(prefixCtx, chunkStroke);
        this.settledPointCount = nextSettledEnd;
      }
    }

    this.clearCanvas(this.activeCanvas);

    if (canIncrementalBake && this.settledPointCount > 0 && this.activePrefixCanvas) {
      ctx.save();
      if (typeof ctx.setTransform === "function") {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      ctx.drawImage(this.activePrefixCanvas, 0, 0);
      ctx.restore();
    }

    if (typeof ctx.setTransform === "function") {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const tailStart = canIncrementalBake && this.settledPointCount > 0
      ? Math.max(0, this.settledPointCount - ACTIVE_OVERLAP)
      : 0;
    const activeSlice = tailStart > 0 ? this.currentPoints.slice(tailStart) : this.currentPoints;
    const opacity = this.activeTool === "highlighter" ? 0.35 : this.currentOpacity;
    const tempStroke: StrokeObject = {
      id: "active",
      elementType: "stroke",
      tool: this.activeTool,
      color: this.currentColor,
      width: this.currentWidth,
      opacity,
      strokePattern: this.currentStrokePattern !== "solid" ? this.currentStrokePattern : undefined,
      points: activeSlice,
      bounds: StrokeGeometry.computeBoundingBox(activeSlice, this.currentWidth),
      createdAt: 0
    };

    StrokeGeometry.renderStroke(ctx, tempStroke);
  }

  private expandDirtyBox(
    existing: StrokeBoundingBox | null,
    addition: StrokeBoundingBox
  ): StrokeBoundingBox {
    if (!existing) {
      return { ...addition };
    }
    return {
      minX: Math.min(existing.minX, addition.minX),
      minY: Math.min(existing.minY, addition.minY),
      maxX: Math.max(existing.maxX, addition.maxX),
      maxY: Math.max(existing.maxY, addition.maxY)
    };
  }

  private processEraserPoints(coordsList: { x: number; y: number }[]): void {
    if (!this.eraserSession || coordsList.length === 0) {
      return;
    }

    let changed = false;
    let strokes = this.eraserSession.currentStrokes;
    let shapes = this.eraserSession.currentShapes;
    const spatialIndex = this.eraserSession.spatialIndex;

    const shapeResult = EraserEngine.eraseShapesTrajectory(shapes, coordsList, this.eraserRadius, spatialIndex);
    if (shapeResult.deletedIds.length > 0) {
      const deletedSet = new Set(shapeResult.deletedIds);
      for (const sh of shapes) {
        if (deletedSet.has(sh.id)) {
          spatialIndex.removeShape(sh.id);
          this.eraserSession.pendingDirtyBox = this.expandDirtyBox(this.eraserSession.pendingDirtyBox, sh.bounds);
        }
      }
      shapes = shapeResult.remaining;
      changed = true;
    }

    if (this.eraserMode === "stroke") {
      const strokeResult = EraserEngine.eraseByStrokeTrajectory(strokes, coordsList, this.eraserRadius, spatialIndex);
      if (strokeResult.deletedIds.length > 0) {
        const deletedSet = new Set(strokeResult.deletedIds);
        for (const s of strokes) {
          if (deletedSet.has(s.id)) {
            spatialIndex.removeStroke(s.id);
            this.eraserSession.pendingDirtyBox = this.expandDirtyBox(this.eraserSession.pendingDirtyBox, s.bounds);
          }
        }
        strokes = strokeResult.remaining;
        changed = true;
      }
    } else {
      for (const pt of coordsList) {
        const precisionResult = EraserEngine.erasePrecision(strokes, pt.x, pt.y, this.eraserRadius, spatialIndex);
        if (precisionResult.changed) {
          const prevMap = new Map(strokes.map((s) => [s.id, s]));
          const nextMap = new Map(precisionResult.updatedStrokes.map((s) => [s.id, s]));
          for (const [id, oldStroke] of prevMap) {
            if (!nextMap.has(id)) {
              spatialIndex.removeStroke(id);
              this.eraserSession.pendingDirtyBox = this.expandDirtyBox(
                this.eraserSession.pendingDirtyBox,
                oldStroke.bounds
              );
            }
          }
          for (const [id, newStroke] of nextMap) {
            if (!prevMap.has(id)) {
              spatialIndex.insertStroke(newStroke);
              this.eraserSession.pendingDirtyBox = this.expandDirtyBox(
                this.eraserSession.pendingDirtyBox,
                newStroke.bounds
              );
            }
          }
          strokes = precisionResult.updatedStrokes;
          changed = true;
        }
      }
    }

    if (changed) {
      this.eraserSession.currentStrokes = strokes;
      this.eraserSession.currentShapes = shapes;
      this.eraserSession.hasChanges = true;
      this.scheduleEraserVisualRedraw();
    }
  }

  private scheduleEraserVisualRedraw(): void {
    if (this.isEraserRafScheduled) {
      return;
    }
    if (typeof window === "undefined" || typeof window.requestAnimationFrame === "undefined") {
      this.renderEraserVisual();
      return;
    }
    this.isEraserRafScheduled = true;
    this.eraserRafId = window.requestAnimationFrame(() => {
      this.isEraserRafScheduled = false;
      this.eraserRafId = null;
      this.renderEraserVisual();
    });
  }

  private renderEraserVisual(): void {
    if (!this.eraserSession) {
      return;
    }
    const dirtyBox = this.eraserSession.pendingDirtyBox;
    this.eraserSession.pendingDirtyBox = null;

    if (
      this.backingCache &&
      dirtyBox &&
      this.backingCache.hasValidBacking(
        this.eraserSession.pageId,
        this.eraserSession.committedCanvas.width,
        this.eraserSession.committedCanvas.height
      )
    ) {
      this.backingCache.redrawDirtyRect(
        this.eraserSession.committedCanvas,
        this.eraserSession.pageId,
        this.eraserSession.dimensions,
        dirtyBox,
        this.eraserSession.currentStrokes,
        this.eraserSession.currentShapes,
        this.eraserSession.spatialIndex
      );
      return;
    }

    this.redrawCommittedStrokes(
      this.eraserSession.committedCanvas,
      this.eraserSession.dimensions,
      this.eraserSession.currentStrokes,
      this.eraserSession.currentShapes,
      this.eraserSession.pageId
    );
  }

  private commitEraserSession(): void {
    if (!this.eraserSession) {
      return;
    }

    if (
      this.eraserRafId !== null &&
      typeof window !== "undefined" &&
      typeof window.cancelAnimationFrame !== "undefined"
    ) {
      window.cancelAnimationFrame(this.eraserRafId);
      this.eraserRafId = null;
    }
    this.isEraserRafScheduled = false;

    if (this.eraserSession.hasChanges) {
      this.renderEraserVisual();
      this.callbacks.onStrokesErased(
        this.eraserSession.pageId,
        this.eraserSession.currentStrokes,
        this.eraserSession.currentShapes
      );
    }
    this.eraserSession = null;
  }

  clearCanvas(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.save();
      if (typeof ctx.setTransform === "function") {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
  }

  redrawCommittedStrokes(
    canvas: HTMLCanvasElement,
    dimensions: PageDimensions,
    strokes: StrokeObject[],
    shapes: ShapeObject[] = [],
    pageId?: string
  ): void {
    if (this.backingCache && pageId) {
      this.backingCache.renderFull(canvas, pageId, dimensions, strokes, shapes);
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const scale = canvas.width / dimensions.width;
    if (typeof ctx.setTransform === "function") {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    for (const stroke of strokes) {
      if (stroke.tool === "highlighter") {
        StrokeGeometry.renderStroke(ctx, stroke);
      }
    }

    for (const shape of shapes) {
      ShapeRecognizer.renderShape(ctx, shape);
    }

    for (const stroke of strokes) {
      if (stroke.tool !== "highlighter") {
        StrokeGeometry.renderStroke(ctx, stroke);
      }
    }
  }
}
