import { PointSample, ShapeObject, StrokeObject } from "../types";
import { StrokeGeometry } from "./StrokeGeometry";

export interface EraseResult {
  remaining: StrokeObject[];
  deletedIds: string[];
}

export interface EraseShapesResult {
  remaining: ShapeObject[];
  deletedIds: string[];
}

export class EraserEngine {
  static distanceToSegment(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
      const sx = px - x1;
      const sy = py - y1;
      return Math.sqrt(sx * sx + sy * sy);
    }

    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    const diffX = px - projX;
    const diffY = py - projY;

    return Math.sqrt(diffX * diffX + diffY * diffY);
  }

  static hitTestStroke(
    stroke: StrokeObject,
    eraserX: number,
    eraserY: number,
    radius: number
  ): boolean {
    const bounds = stroke.bounds;
    if (
      eraserX + radius < bounds.minX ||
      eraserX - radius > bounds.maxX ||
      eraserY + radius < bounds.minY ||
      eraserY - radius > bounds.maxY
    ) {
      return false;
    }

    const effectiveRadius = radius + Math.max(1, stroke.width / 2);
    const points = stroke.points;

    if (points.length === 1) {
      const p = points[0];
      const dx = eraserX - p.x;
      const dy = eraserY - p.y;
      return Math.sqrt(dx * dx + dy * dy) <= effectiveRadius;
    }

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const dist = this.distanceToSegment(eraserX, eraserY, p1.x, p1.y, p2.x, p2.y);
      if (dist <= effectiveRadius) {
        return true;
      }
    }

    return false;
  }

  static eraseByStroke(
    strokes: StrokeObject[],
    eraserX: number,
    eraserY: number,
    radius: number
  ): EraseResult {
    const remaining: StrokeObject[] = [];
    const deletedIds: string[] = [];

    for (const stroke of strokes) {
      if (this.hitTestStroke(stroke, eraserX, eraserY, radius)) {
        deletedIds.push(stroke.id);
      } else {
        remaining.push(stroke);
      }
    }

    return { remaining, deletedIds };
  }

  static erasePrecision(
    strokes: StrokeObject[],
    eraserX: number,
    eraserY: number,
    radius: number
  ): { updatedStrokes: StrokeObject[]; changed: boolean } {
    let changed = false;
    const resultStrokes: StrokeObject[] = [];

    for (const stroke of strokes) {
      if (!this.hitTestStroke(stroke, eraserX, eraserY, radius)) {
        resultStrokes.push(stroke);
        continue;
      }

      changed = true;
      const segments: PointSample[][] = [];
      let currentSegment: PointSample[] = [];
      const effectiveRadius = radius + Math.max(1, stroke.width / 2);

      for (const p of stroke.points) {
        const dx = p.x - eraserX;
        const dy = p.y - eraserY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > effectiveRadius) {
          currentSegment.push(p);
        } else {
          if (currentSegment.length > 0) {
            segments.push(currentSegment);
            currentSegment = [];
          }
        }
      }

      if (currentSegment.length > 0) {
        segments.push(currentSegment);
      }

      for (const seg of segments) {
        if (seg.length > 0) {
          const newBounds = StrokeGeometry.computeBoundingBox(seg, Math.max(2, stroke.width));
          resultStrokes.push({
            ...stroke,
            id: `stroke_${Math.random().toString(36).substring(2, 9)}`,
            points: seg,
            bounds: newBounds
          });
        }
      }
    }

    return { updatedStrokes: resultStrokes, changed };
  }

  static hitTestShape(
    shape: ShapeObject,
    eraserX: number,
    eraserY: number,
    radius: number
  ): boolean {
    const bounds = shape.bounds;
    const effectiveRadius = radius + Math.max(1, (shape.strokeWidth || 2) / 2);

    if (
      eraserX + effectiveRadius < bounds.minX ||
      eraserX - effectiveRadius > bounds.maxX ||
      eraserY + effectiveRadius < bounds.minY ||
      eraserY - effectiveRadius > bounds.maxY
    ) {
      return false;
    }

    const g = shape.geometryData;
    const isFilled = Boolean(shape.fillColor);

    switch (shape.type) {
      case "line":
      case "arrow": {
        const x1 = g.x1 ?? g.x ?? bounds.minX;
        const y1 = g.y1 ?? (g.y !== undefined && g.height !== undefined ? g.y + g.height / 2 : bounds.minY);
        const x2 = g.x2 ?? (g.x !== undefined && g.width !== undefined ? g.x + g.width : bounds.maxX);
        const y2 = g.y2 ?? y1;
        return this.distanceToSegment(eraserX, eraserY, x1, y1, x2, y2) <= effectiveRadius;
      }

      case "circle": {
        const cx = g.cx ?? (bounds.minX + bounds.maxX) / 2;
        const cy = g.cy ?? (bounds.minY + bounds.maxY) / 2;
        const r = g.r ?? Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2;
        const dist = Math.hypot(eraserX - cx, eraserY - cy);
        if (isFilled) {
          return dist <= r + effectiveRadius;
        }
        return Math.abs(dist - r) <= effectiveRadius;
      }

      case "ellipse": {
        const cx = g.cx ?? (bounds.minX + bounds.maxX) / 2;
        const cy = g.cy ?? (bounds.minY + bounds.maxY) / 2;
        const rx = Math.max(1, g.rx ?? (bounds.maxX - bounds.minX) / 2);
        const ry = Math.max(1, g.ry ?? (bounds.maxY - bounds.minY) / 2);
        const normDist = Math.hypot((eraserX - cx) / rx, (eraserY - cy) / ry);
        const avgR = (rx + ry) / 2;
        const tol = effectiveRadius / Math.max(1, avgR);
        if (isFilled) {
          return normDist <= 1 + tol;
        }
        return Math.abs(normDist - 1) <= tol;
      }

      case "triangle": {
        const x1 = g.x1 ?? (bounds.minX + bounds.maxX) / 2;
        const y1 = g.y1 ?? bounds.minY;
        const x2 = g.x2 ?? bounds.minX;
        const y2 = g.y2 ?? bounds.maxY;
        const x3 = g.x3 ?? bounds.maxX;
        const y3 = g.y3 ?? bounds.maxY;
        if (
          this.distanceToSegment(eraserX, eraserY, x1, y1, x2, y2) <= effectiveRadius ||
          this.distanceToSegment(eraserX, eraserY, x2, y2, x3, y3) <= effectiveRadius ||
          this.distanceToSegment(eraserX, eraserY, x3, y3, x1, y1) <= effectiveRadius
        ) {
          return true;
        }
        if (isFilled) {
          const d1 = (eraserX - x2) * (y1 - y2) - (x1 - x2) * (eraserY - y2);
          const d2 = (eraserX - x3) * (y2 - y3) - (x2 - x3) * (eraserY - y3);
          const d3 = (eraserX - x1) * (y3 - y1) - (x3 - x1) * (eraserY - y1);
          const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
          const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
          return !(hasNeg && hasPos);
        }
        return false;
      }

      case "diamond": {
        const x = g.x ?? bounds.minX;
        const y = g.y ?? bounds.minY;
        const w = g.width ?? bounds.maxX - bounds.minX;
        const h = g.height ?? bounds.maxY - bounds.minY;
        const cx = x + w / 2;
        const cy = y + h / 2;
        const vertices = [
          { x: cx, y },
          { x: x + w, y: cy },
          { x: cx, y: y + h },
          { x, y: cy }
        ];
        for (let i = 0; i < vertices.length; i++) {
          const v1 = vertices[i];
          const v2 = vertices[(i + 1) % vertices.length];
          if (this.distanceToSegment(eraserX, eraserY, v1.x, v1.y, v2.x, v2.y) <= effectiveRadius) {
            return true;
          }
        }
        if (isFilled && w > 0 && h > 0) {
          return Math.abs(eraserX - cx) / (w / 2) + Math.abs(eraserY - cy) / (h / 2) <= 1;
        }
        return false;
      }

      case "rectangle":
      case "rounded-rectangle":
      case "star":
      case "callout":
      default: {
        const x = g.x ?? bounds.minX;
        const y = g.y ?? bounds.minY;
        const w = g.width ?? bounds.maxX - bounds.minX;
        const h = g.height ?? bounds.maxY - bounds.minY;
        if (isFilled && eraserX >= x && eraserX <= x + w && eraserY >= y && eraserY <= y + h) {
          return true;
        }
        const topDist = this.distanceToSegment(eraserX, eraserY, x, y, x + w, y);
        const rightDist = this.distanceToSegment(eraserX, eraserY, x + w, y, x + w, y + h);
        const bottomDist = this.distanceToSegment(eraserX, eraserY, x + w, y + h, x, y + h);
        const leftDist = this.distanceToSegment(eraserX, eraserY, x, y + h, x, y);
        if (
          topDist <= effectiveRadius ||
          rightDist <= effectiveRadius ||
          bottomDist <= effectiveRadius ||
          leftDist <= effectiveRadius
        ) {
          return true;
        }
        if (shape.type === "star") {
          const cx = x + w / 2;
          const cy = y + h / 2;
          const outerR = Math.min(w, h) / 2;
          return Math.hypot(eraserX - cx, eraserY - cy) <= outerR + effectiveRadius;
        }
        return false;
      }
    }
  }

  static eraseShapes(
    shapes: ShapeObject[],
    eraserX: number,
    eraserY: number,
    radius: number
  ): EraseShapesResult {
    const remaining: ShapeObject[] = [];
    const deletedIds: string[] = [];

    for (const shape of shapes) {
      if (this.hitTestShape(shape, eraserX, eraserY, radius)) {
        deletedIds.push(shape.id);
      } else {
        remaining.push(shape);
      }
    }

    return { remaining, deletedIds };
  }
}
