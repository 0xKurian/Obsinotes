import { PageDimensions, ShapeObject, StrokeBoundingBox, StrokeObject } from "../types";
import { StrokeGeometry } from "../ink/StrokeGeometry";
import { ShapeRecognizer } from "../shape/ShapeRecognizer";
import { PageSpatialIndex } from "../geometry/PageSpatialIndex";

interface BackingEntry {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  byteSize: number;
}

const MAX_BACKING_ENTRIES = 4;
const MAX_BACKING_BYTES = 64 * 1024 * 1024;

export class PageBackingCache {
  private entries: Map<string, BackingEntry> = new Map();
  private totalBytes: number = 0;

  private touchEntry(pageId: string, entry: BackingEntry): void {
    this.entries.delete(pageId);
    this.entries.set(pageId, entry);
  }

  private evictIfNeeded(protectedPageId?: string): void {
    for (const [id, entry] of this.entries) {
      if (this.entries.size <= MAX_BACKING_ENTRIES && this.totalBytes <= MAX_BACKING_BYTES) {
        break;
      }
      if (id === protectedPageId && this.entries.size > 1) {
        continue;
      }
      entry.canvas.width = 0;
      entry.canvas.height = 0;
      this.totalBytes = Math.max(0, this.totalBytes - entry.byteSize);
      this.entries.delete(id);
    }
  }

  private getOrCreateEntry(pageId: string, width: number, height: number): BackingEntry | null {
    if (typeof createEl !== "function" || width <= 1 || height <= 1) {
      return null;
    }
    const byteSize = width * height * 4;
    let entry = this.entries.get(pageId);
    if (!entry) {
      const canvas = createEl("canvas");
      canvas.width = width;
      canvas.height = height;
      entry = { canvas, width, height, byteSize };
      this.entries.set(pageId, entry);
      this.totalBytes += byteSize;
    } else if (entry.width !== width || entry.height !== height) {
      this.totalBytes = Math.max(0, this.totalBytes - entry.byteSize);
      entry.canvas.width = width;
      entry.canvas.height = height;
      entry.width = width;
      entry.height = height;
      entry.byteSize = byteSize;
      this.totalBytes += byteSize;
      this.touchEntry(pageId, entry);
    } else {
      this.touchEntry(pageId, entry);
    }
    this.evictIfNeeded(pageId);
    return entry;
  }

  hasValidBacking(pageId: string, width: number, height: number): boolean {
    const entry = this.entries.get(pageId);
    return Boolean(entry && entry.width === width && entry.height === height && width > 1 && height > 1);
  }

  renderFull(
    targetCanvas: HTMLCanvasElement,
    pageId: string,
    dimensions: PageDimensions,
    strokes: StrokeObject[],
    shapes: ShapeObject[]
  ): void {
    const entry = this.getOrCreateEntry(pageId, targetCanvas.width, targetCanvas.height);
    if (!entry) {
      this.renderDirectToContext(targetCanvas, dimensions, strokes, shapes);
      return;
    }

    this.renderDirectToContext(entry.canvas, dimensions, strokes, shapes);
    this.blitFull(entry.canvas, targetCanvas);
  }

  redrawDirtyRect(
    targetCanvas: HTMLCanvasElement,
    pageId: string,
    dimensions: PageDimensions,
    dirtyBox: StrokeBoundingBox,
    strokes: StrokeObject[],
    shapes: ShapeObject[],
    spatialIndex?: PageSpatialIndex
  ): void {
    const entry = this.entries.get(pageId);
    if (!entry || entry.width !== targetCanvas.width || entry.height !== targetCanvas.height) {
      this.renderFull(targetCanvas, pageId, dimensions, strokes, shapes);
      return;
    }
    this.touchEntry(pageId, entry);

    const pad = 16;
    const minX = Math.max(0, Math.floor(dirtyBox.minX - pad));
    const minY = Math.max(0, Math.floor(dirtyBox.minY - pad));
    const maxX = Math.min(dimensions.width, Math.ceil(dirtyBox.maxX + pad));
    const maxY = Math.min(dimensions.height, Math.ceil(dirtyBox.maxY + pad));
    const rectW = maxX - minX;
    const rectH = maxY - minY;

    if (rectW <= 0 || rectH <= 0) {
      return;
    }

    const paddedBox: StrokeBoundingBox = { minX, minY, maxX, maxY };
    const candidateStrokes = spatialIndex
      ? spatialIndex.queryStrokes(paddedBox)
      : strokes.filter((s) => this.intersects(s.bounds, paddedBox));
    const candidateShapes = spatialIndex
      ? spatialIndex.queryShapes(paddedBox)
      : shapes.filter((sh) => this.intersects(sh.bounds, paddedBox));

    const backingCtx = entry.canvas.getContext("2d");
    if (!backingCtx) {
      return;
    }

    const scale = entry.canvas.width / dimensions.width;
    backingCtx.save();
    if (typeof backingCtx.setTransform === "function") {
      backingCtx.setTransform(scale, 0, 0, scale, 0, 0);
    }
    backingCtx.imageSmoothingEnabled = true;
    backingCtx.imageSmoothingQuality = "high";
    backingCtx.beginPath();
    backingCtx.rect(minX, minY, rectW, rectH);
    backingCtx.clip();
    backingCtx.clearRect(minX, minY, rectW, rectH);

    for (const stroke of candidateStrokes) {
      if (stroke.tool === "highlighter") {
        StrokeGeometry.renderStroke(backingCtx, stroke);
      }
    }
    for (const shape of candidateShapes) {
      ShapeRecognizer.renderShape(backingCtx, shape);
    }
    for (const stroke of candidateStrokes) {
      if (stroke.tool !== "highlighter") {
        StrokeGeometry.renderStroke(backingCtx, stroke);
      }
    }
    backingCtx.restore();

    const targetCtx = targetCanvas.getContext("2d");
    if (!targetCtx) {
      return;
    }
    const pxX = Math.max(0, Math.floor(minX * scale));
    const pxY = Math.max(0, Math.floor(minY * scale));
    const pxRight = Math.min(targetCanvas.width, Math.ceil(maxX * scale));
    const pxBottom = Math.min(targetCanvas.height, Math.ceil(maxY * scale));
    const pxW = pxRight - pxX;
    const pxH = pxBottom - pxY;
    if (pxW <= 0 || pxH <= 0) {
      return;
    }

    targetCtx.save();
    if (typeof targetCtx.setTransform === "function") {
      targetCtx.setTransform(1, 0, 0, 1, 0, 0);
    }
    targetCtx.clearRect(pxX, pxY, pxW, pxH);
    targetCtx.drawImage(entry.canvas, pxX, pxY, pxW, pxH, pxX, pxY, pxW, pxH);
    targetCtx.restore();
  }

  appendStroke(
    targetCanvas: HTMLCanvasElement,
    pageId: string,
    dimensions: PageDimensions,
    stroke: StrokeObject
  ): void {
    const entry = this.entries.get(pageId);
    if (!entry || entry.width !== targetCanvas.width || entry.height !== targetCanvas.height) {
      return;
    }
    const backingCtx = entry.canvas.getContext("2d");
    if (!backingCtx) {
      return;
    }
    const scale = entry.canvas.width / dimensions.width;
    backingCtx.save();
    if (typeof backingCtx.setTransform === "function") {
      backingCtx.setTransform(scale, 0, 0, scale, 0, 0);
    }
    backingCtx.imageSmoothingEnabled = true;
    backingCtx.imageSmoothingQuality = "high";
    StrokeGeometry.renderStroke(backingCtx, stroke);
    backingCtx.restore();
  }

  release(pageId: string): void {
    const entry = this.entries.get(pageId);
    if (entry) {
      entry.canvas.width = 0;
      entry.canvas.height = 0;
      this.totalBytes = Math.max(0, this.totalBytes - entry.byteSize);
      this.entries.delete(pageId);
    }
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      entry.canvas.width = 0;
      entry.canvas.height = 0;
    }
    this.totalBytes = 0;
    this.entries.clear();
  }

  private blitFull(sourceCanvas: HTMLCanvasElement, targetCanvas: HTMLCanvasElement): void {
    const targetCtx = targetCanvas.getContext("2d");
    if (!targetCtx) {
      return;
    }
    targetCtx.save();
    if (typeof targetCtx.setTransform === "function") {
      targetCtx.setTransform(1, 0, 0, 1, 0, 0);
    }
    targetCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    targetCtx.drawImage(sourceCanvas, 0, 0);
    targetCtx.restore();
  }

  private renderDirectToContext(
    canvas: HTMLCanvasElement,
    dimensions: PageDimensions,
    strokes: StrokeObject[],
    shapes: ShapeObject[]
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

  private intersects(a: StrokeBoundingBox, b: StrokeBoundingBox): boolean {
    return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
  }
}
