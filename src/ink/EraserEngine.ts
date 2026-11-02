import { PointSample, StrokeObject } from "../types";
import { StrokeGeometry } from "./StrokeGeometry";

export interface EraseResult {
  remaining: StrokeObject[];
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
}
