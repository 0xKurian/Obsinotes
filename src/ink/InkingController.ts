import {
  PointSample,
  StrokeObject,
  ToolType,
  EraserMode,
  PageDimensions,
  ShapeObject
} from "../types";
import { StrokeGeometry } from "./StrokeGeometry";
import { EraserEngine } from "./EraserEngine";
import { ShapeRecognizer } from "../shape/ShapeRecognizer";
import { PerformanceMonitor } from "../performance/PerformanceMonitor";

export interface InkingControllerCallbacks {
  onStrokeCommitted: (pageId: string, stroke: StrokeObject) => void;
  onShapeCommitted?: (pageId: string, shape: ShapeObject, rawStroke: StrokeObject) => void;
  onStrokesErased: (
    pageId: string,
    remainingStrokes: StrokeObject[],
    remainingShapes?: ShapeObject[]
  ) => void;
}

export class InkingController {
  activeTool: ToolType = "pressure";
  currentColor: string = "#1e293b";
  currentWidth: number = 2.5;
  currentOpacity: number = 1.0;
  eraserMode: EraserMode = "stroke";
  eraserRadius: number = 12;
  shapeRecognitionEnabled: boolean = true;

  private isDrawing: boolean = false;
  private activePageId: string | null = null;
  private activeCanvas: HTMLCanvasElement | null = null;
  private committedCanvas: HTMLCanvasElement | null = null;
  private currentPoints: PointSample[] = [];
  private lastPenTimestamp: number = 0;
  private lastMoveTimestamp: number = 0;
  private callbacks: InkingControllerCallbacks;
  private rafId: number | null = null;
  private isRafScheduled: boolean = false;
  private performanceMonitor?: PerformanceMonitor;

  private eraserSession: {
    pageId: string;
    initialStrokes: StrokeObject[];
    initialShapes: ShapeObject[];
    currentStrokes: StrokeObject[];
    currentShapes: ShapeObject[];
    hasChanges: boolean;
    committedCanvas: HTMLCanvasElement;
    dimensions: PageDimensions;
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

  setEraserMode(mode: EraserMode): void {
    this.eraserMode = mode;
  }

  setEraserRadius(radius: number): void {
    this.eraserRadius = Math.max(4, Math.min(50, radius));
  }

  setShapeRecognition(enabled: boolean): void {
    this.shapeRecognitionEnabled = enabled;
  }

  setPerformanceMonitor(monitor?: PerformanceMonitor): void {
    this.performanceMonitor = monitor;
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
      if (Date.now() - this.lastPenTimestamp < 350) {
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
      this.eraserSession = {
        pageId,
        initialStrokes: [...existingStrokes],
        initialShapes: [...existingShapes],
        currentStrokes: [...existingStrokes],
        currentShapes: [...existingShapes],
        hasChanges: false,
        committedCanvas,
        dimensions: dims
      };
      this.processEraserPoints([{ x: pageCoords.x, y: pageCoords.y }]);
      return;
    }

    this.isDrawing = true;
    this.currentPoints = [];

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
    pageCoordsList: { x: number; y: number }[],
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

    const basePressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5;
    const baseTime = e.timeStamp || Date.now();

    for (let i = 0; i < pageCoordsList.length; i++) {
      const pt = pageCoordsList[i];
      const lastPoint = this.currentPoints[this.currentPoints.length - 1];
      if (lastPoint) {
        const dx = pt.x - lastPoint.x;
        const dy = pt.y - lastPoint.y;
        const distSq = dx * dx + dy * dy;
        const isPressureSignificant = Math.abs(basePressure - (lastPoint.pressure || 0.5)) > 0.05;
        if (distSq < 0.25 && !isPressureSignificant) {
          lastPoint.timestamp = baseTime + i;
          lastPoint.tiltX = e.tiltX;
          lastPoint.tiltY = e.tiltY;
          continue;
        }
      }

      const sample: PointSample = {
        x: pt.x,
        y: pt.y,
        pressure: basePressure,
        timestamp: baseTime + i,
        tiltX: e.tiltX,
        tiltY: e.tiltY
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
        if (this.committedCanvas) {
          const ctx = this.committedCanvas.getContext("2d");
          if (ctx) {
            const scale = this.committedCanvas.width / (Number(this.committedCanvas.dataset?.pageWidth) || this.committedCanvas.clientWidth || this.committedCanvas.width);
            if (typeof ctx.setTransform === "function") {
              ctx.setTransform(scale, 0, 0, scale, 0, 0);
            }
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ShapeRecognizer.renderShape(ctx, recognized.shape);
          }
        }
        this.callbacks.onShapeCommitted(this.activePageId, recognized.shape, stroke);
        return;
      }
    }

    if (this.committedCanvas) {
      const ctx = this.committedCanvas.getContext("2d");
      if (ctx) {
        const scale = this.committedCanvas.width / (Number(this.committedCanvas.dataset?.pageWidth) || this.committedCanvas.clientWidth || this.committedCanvas.width);
        if (typeof ctx.setTransform === "function") {
          ctx.setTransform(scale, 0, 0, scale, 0, 0);
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        StrokeGeometry.renderStroke(ctx, stroke);
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
    if (this.eraserRafId !== null && typeof window !== "undefined" && typeof window.cancelAnimationFrame !== "undefined") {
      window.cancelAnimationFrame(this.eraserRafId);
      this.eraserRafId = null;
    }
    this.isRafScheduled = false;
    this.isEraserRafScheduled = false;
    this.isDrawing = false;
    this.eraserSession = null;
    this.activePageId = null;
    this.activeCanvas = null;
    this.committedCanvas = null;
    this.currentPoints = [];
  }

  private renderActiveStroke(): void {
    if (!this.activeCanvas || this.currentPoints.length === 0) {
      return;
    }

    const ctx = this.activeCanvas.getContext("2d");
    if (!ctx) {
      return;
    }

    this.clearCanvas(this.activeCanvas);

    const scale = this.activeCanvas.width / (Number(this.activeCanvas.dataset?.pageWidth) || this.activeCanvas.clientWidth || this.activeCanvas.width);
    if (typeof ctx.setTransform === "function") {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const opacity = this.activeTool === "highlighter" ? 0.35 : this.currentOpacity;
    const tempStroke: StrokeObject = {
      id: "active",
      elementType: "stroke",
      tool: this.activeTool,
      color: this.currentColor,
      width: this.currentWidth,
      opacity,
      points: this.currentPoints,
      bounds: StrokeGeometry.computeBoundingBox(this.currentPoints, this.currentWidth),
      createdAt: 0
    };

    StrokeGeometry.renderStroke(ctx, tempStroke);
  }

  private processEraserPoints(coordsList: { x: number; y: number }[]): void {
    if (!this.eraserSession || coordsList.length === 0) {
      return;
    }

    let changed = false;
    let strokes = this.eraserSession.currentStrokes;
    let shapes = this.eraserSession.currentShapes;

    const shapeResult = EraserEngine.eraseShapesTrajectory(shapes, coordsList, this.eraserRadius);
    if (shapeResult.deletedIds.length > 0) {
      shapes = shapeResult.remaining;
      changed = true;
    }

    if (this.eraserMode === "stroke") {
      const strokeResult = EraserEngine.eraseByStrokeTrajectory(strokes, coordsList, this.eraserRadius);
      if (strokeResult.deletedIds.length > 0) {
        strokes = strokeResult.remaining;
        changed = true;
      }
    } else {
      for (const pt of coordsList) {
        const precisionResult = EraserEngine.erasePrecision(strokes, pt.x, pt.y, this.eraserRadius);
        if (precisionResult.changed) {
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
    this.redrawCommittedStrokes(
      this.eraserSession.committedCanvas,
      this.eraserSession.dimensions,
      this.eraserSession.currentStrokes,
      this.eraserSession.currentShapes
    );
  }

  private commitEraserSession(): void {
    if (!this.eraserSession) {
      return;
    }

    if (this.eraserRafId !== null && typeof window !== "undefined" && typeof window.cancelAnimationFrame !== "undefined") {
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
    shapes: ShapeObject[] = []
  ): void {
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
