import { PointSample, ShapeObject, StrokeObject } from "../types";
import { StrokeGeometry } from "./StrokeGeometry";
import { PageSpatialIndex } from "../geometry/PageSpatialIndex";

export interface EraseResult {
  remaining: StrokeObject[];
  deletedIds: string[];
}

export interface EraseShapesResult {
  remaining: ShapeObject[];
  deletedIds: string[];
}

export interface PrecisionTrajectoryEraseResult {
  updatedStrokes: StrokeObject[];
  removedStrokes: StrokeObject[];
  addedStrokes: StrokeObject[];
  changed: boolean;
}

export class EraserEngine {
  private static subdivideTrajectory(
    points: { x: number; y: number }[],
    stepSize: number
  ): { x: number; y: number }[] {
    if (points.length <= 1 || stepSize <= 0) {
      return points;
    }
    const result: { x: number; y: number }[] = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const dist = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      if (dist > stepSize) {
        const steps = Math.min(64, Math.ceil(dist / stepSize));
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          result.push({
            x: prev.x + (curr.x - prev.x) * t,
            y: prev.y + (curr.y - prev.y) * t
          });
        }
      }
      result.push(curr);
    }
    return result;
  }

  private static interpolatePoint(a: PointSample, b: PointSample, t: number): PointSample {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      pressure: a.pressure + (b.pressure - a.pressure) * t,
      timestamp: Math.round(a.timestamp + (b.timestamp - a.timestamp) * t),
      ...(a.tiltX !== undefined || b.tiltX !== undefined
        ? { tiltX: (a.tiltX ?? 0) + ((b.tiltX ?? 0) - (a.tiltX ?? 0)) * t }
        : {}),
      ...(a.tiltY !== undefined || b.tiltY !== undefined
        ? { tiltY: (a.tiltY ?? 0) + ((b.tiltY ?? 0) - (a.tiltY ?? 0)) * t }
        : {})
    };
  }

  private static segmentCircleIntersections(
    a: PointSample,
    b: PointSample,
    cx: number,
    cy: number,
    r: number
  ): number[] {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const fx = a.x - cx;
    const fy = a.y - cy;
    const A = dx * dx + dy * dy;
    if (A < 1e-8) {
      return [];
    }
    const B = 2 * (fx * dx + fy * dy);
    const C = fx * fx + fy * fy - r * r;
    const disc = B * B - 4 * A * C;
    if (disc <= 0) {
      return [];
    }
    const sqrtD = Math.sqrt(disc);
    const t1 = (-B - sqrtD) / (2 * A);
    const t2 = (-B + sqrtD) / (2 * A);
    const ts: number[] = [];
    if (t1 > 0 && t1 < 1) ts.push(t1);
    if (t2 > 0 && t2 < 1 && Math.abs(t2 - t1) > 1e-6) ts.push(t2);
    ts.sort((u, v) => u - v);
    return ts;
  }
  static distanceToSegmentSq(
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
      return sx * sx + sy * sy;
    }

    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    const diffX = px - projX;
    const diffY = py - projY;

    return diffX * diffX + diffY * diffY;
  }

  static distanceToSegment(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number {
    return Math.sqrt(this.distanceToSegmentSq(px, py, x1, y1, x2, y2));
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

    const effectiveRadius = radius + Math.max(1, StrokeGeometry.getToolSize(stroke.tool, stroke.width) / 2);
    const effectiveRadiusSq = effectiveRadius * effectiveRadius;
    const points = stroke.points;

    if (points.length === 1) {
      const p = points[0];
      const dx = eraserX - p.x;
      const dy = eraserY - p.y;
      return dx * dx + dy * dy <= effectiveRadiusSq;
    }

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const distSq = this.distanceToSegmentSq(eraserX, eraserY, p1.x, p1.y, p2.x, p2.y);
      if (distSq <= effectiveRadiusSq) {
        return true;
      }
    }

    return false;
  }

  static eraseByStroke(
    strokes: StrokeObject[],
    eraserX: number,
    eraserY: number,
    radius: number,
    spatialIndex?: PageSpatialIndex
  ): EraseResult {
    const candidates = spatialIndex
      ? spatialIndex.queryStrokes({
          minX: eraserX - radius,
          minY: eraserY - radius,
          maxX: eraserX + radius,
          maxY: eraserY + radius
        })
      : strokes;

    const deletedSet = new Set<string>();
    const deletedIds: string[] = [];

    for (const stroke of candidates) {
      if (this.hitTestStroke(stroke, eraserX, eraserY, radius)) {
        deletedSet.add(stroke.id);
        deletedIds.push(stroke.id);
      }
    }

    if (deletedIds.length === 0) {
      return { remaining: strokes, deletedIds: [] };
    }

    const remaining = strokes.filter((s) => !deletedSet.has(s.id));
    return { remaining, deletedIds };
  }

  static eraseByStrokeTrajectory(
    strokes: StrokeObject[],
    points: { x: number; y: number }[],
    radius: number,
    spatialIndex?: PageSpatialIndex
  ): EraseResult {
    if (points.length === 0) {
      return { remaining: strokes, deletedIds: [] };
    }
    if (points.length === 1) {
      return this.eraseByStroke(strokes, points[0].x, points[0].y, radius, spatialIndex);
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const chunkMinX = minX - radius;
    const chunkMinY = minY - radius;
    const chunkMaxX = maxX + radius;
    const chunkMaxY = maxY + radius;

    const sweptPoints = this.subdivideTrajectory(points, Math.max(2, radius * 0.75));
    const candidates = spatialIndex
      ? spatialIndex.queryStrokes({ minX: chunkMinX, minY: chunkMinY, maxX: chunkMaxX, maxY: chunkMaxY })
      : strokes;

    const deletedSet = new Set<string>();
    const deletedIds: string[] = [];

    for (const stroke of candidates) {
      const b = stroke.bounds;
      if (
        chunkMaxX < b.minX ||
        chunkMinX > b.maxX ||
        chunkMaxY < b.minY ||
        chunkMinY > b.maxY
      ) {
        continue;
      }

      let hit = false;
      for (const p of sweptPoints) {
        if (this.hitTestStroke(stroke, p.x, p.y, radius)) {
          hit = true;
          break;
        }
      }

      if (hit) {
        deletedSet.add(stroke.id);
        deletedIds.push(stroke.id);
      }
    }

    if (deletedIds.length === 0) {
      return { remaining: strokes, deletedIds: [] };
    }

    const remaining = strokes.filter((s) => !deletedSet.has(s.id));
    return { remaining, deletedIds };
  }

  private static splitStrokeByCircle(
    stroke: StrokeObject,
    eraserX: number,
    eraserY: number,
    effectiveRadius: number
  ): StrokeObject[] | null {
    const pts = stroke.points;
    if (pts.length === 0) {
      return null;
    }
    const rSq = effectiveRadius * effectiveRadius;
    const segments: PointSample[][] = [];
    let currentSegment: PointSample[] = [];
    let erasedAny = false;

    const isInside = (p: PointSample): boolean => {
      const dx = p.x - eraserX;
      const dy = p.y - eraserY;
      return dx * dx + dy * dy <= rSq;
    };

    for (let i = 0; i < pts.length; i++) {
      const curr = pts[i];
      const currIn = isInside(curr);

      if (i > 0) {
        const prev = pts[i - 1];
        const ts = this.segmentCircleIntersections(prev, curr, eraserX, eraserY, effectiveRadius);
        if (ts.length > 0) {
          erasedAny = true;
          for (const t of ts) {
            const inter = this.interpolatePoint(prev, curr, t);
            const midBefore = this.interpolatePoint(prev, curr, Math.max(0, t - 0.01));
            if (isInside(midBefore)) {
              // Exiting circle: start a new segment from boundary
              currentSegment = [inter];
            } else {
              // Entering circle: close current segment at boundary
              currentSegment.push(inter);
              if (currentSegment.length > 0) {
                segments.push(currentSegment);
                currentSegment = [];
              }
            }
          }
        }
      }

      if (!currIn) {
        currentSegment.push(curr);
      } else {
        erasedAny = true;
        if (currentSegment.length > 0) {
          segments.push(currentSegment);
          currentSegment = [];
        }
      }
    }

    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }

    if (!erasedAny) {
      return null;
    }

    const splitStrokes: StrokeObject[] = [];
    for (const seg of segments) {
      if (seg.length > 0) {
        const newBounds = StrokeGeometry.computeBoundingBox(
          seg,
          StrokeGeometry.getBoundsPadding(stroke.tool, stroke.width)
        );
        splitStrokes.push({
          ...stroke,
          id: `stroke_${Math.random().toString(36).substring(2, 9)}`,
          points: seg,
          bounds: newBounds
        });
      }
    }
    return splitStrokes;
  }

  static erasePrecision(
    strokes: StrokeObject[],
    eraserX: number,
    eraserY: number,
    radius: number,
    spatialIndex?: PageSpatialIndex
  ): { updatedStrokes: StrokeObject[]; changed: boolean } {
    const res = this.erasePrecisionTrajectory(
      strokes,
      [{ x: eraserX, y: eraserY }],
      radius,
      spatialIndex
    );
    return { updatedStrokes: res.updatedStrokes, changed: res.changed };
  }

  static erasePrecisionTrajectory(
    strokes: StrokeObject[],
    points: { x: number; y: number }[],
    radius: number,
    spatialIndex?: PageSpatialIndex
  ): PrecisionTrajectoryEraseResult {
    if (points.length === 0 || strokes.length === 0) {
      return { updatedStrokes: strokes, removedStrokes: [], addedStrokes: [], changed: false };
    }

    const sweptPoints = this.subdivideTrajectory(points, Math.max(2, radius * 0.75));
    let working = strokes;
    const removedMap = new Map<string, StrokeObject>();
    const addedMap = new Map<string, StrokeObject>();
    let changed = false;

    for (const pt of sweptPoints) {
      const candidates = spatialIndex && !changed
        ? spatialIndex.queryStrokes({
            minX: pt.x - radius,
            minY: pt.y - radius,
            maxX: pt.x + radius,
            maxY: pt.y + radius
          })
        : working;

      if (candidates.length === 0) {
        continue;
      }

      const hitMap = new Map<string, StrokeObject[]>();
      let stepChanged = false;

      for (const stroke of candidates) {
        if (!this.hitTestStroke(stroke, pt.x, pt.y, radius)) {
          continue;
        }
        const effectiveRadius = radius + Math.max(1, StrokeGeometry.getToolSize(stroke.tool, stroke.width) / 2);
        const split = this.splitStrokeByCircle(stroke, pt.x, pt.y, effectiveRadius);
        if (split !== null) {
          stepChanged = true;
          hitMap.set(stroke.id, split);
          if (addedMap.has(stroke.id)) {
            addedMap.delete(stroke.id);
          } else {
            removedMap.set(stroke.id, stroke);
          }
          for (const ns of split) {
            addedMap.set(ns.id, ns);
          }
        }
      }

      if (stepChanged) {
        changed = true;
        const nextWorking: StrokeObject[] = [];
        for (const stroke of working) {
          const replacement = hitMap.get(stroke.id);
          if (replacement !== undefined) {
            nextWorking.push(...replacement);
          } else {
            nextWorking.push(stroke);
          }
        }
        working = nextWorking;
      }
    }

    return {
      updatedStrokes: working,
      removedStrokes: Array.from(removedMap.values()),
      addedStrokes: Array.from(addedMap.values()),
      changed
    };
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
        if (shape.type === "star") {
          const cx = x + w / 2;
          const cy = y + h / 2;
          const rOuter = Math.min(w, h) / 2;
          const rInner = rOuter * 0.45;
          const starPts: Array<{ x: number; y: number }> = [];
          for (let i = 0; i < 10; i++) {
            const sr = i % 2 === 0 ? rOuter : rInner;
            const ang = (i * Math.PI) / 5 - Math.PI / 2;
            starPts.push({ x: cx + sr * Math.cos(ang), y: cy + sr * Math.sin(ang) });
          }
          for (let i = 0; i < starPts.length; i++) {
            const pA = starPts[i];
            const pB = starPts[(i + 1) % starPts.length];
            if (this.distanceToSegment(eraserX, eraserY, pA.x, pA.y, pB.x, pB.y) <= effectiveRadius) {
              return true;
            }
          }
          if (isFilled) {
            return Math.hypot(eraserX - cx, eraserY - cy) <= rOuter + effectiveRadius;
          }
          return false;
        }
        if (shape.type === "callout") {
          const tailH = Math.min(18, h * 0.25);
          const bodyH = h - tailH;
          const tailX = x + w * 0.22;
          const tailW = Math.min(24, w * 0.25);
          if (isFilled && eraserX >= x && eraserX <= x + w && eraserY >= y && eraserY <= y + bodyH) {
            return true;
          }
          const edges: Array<[number, number, number, number]> = [
            [x, y, x + w, y],
            [x + w, y, x + w, y + bodyH],
            [x + w, y + bodyH, tailX + tailW, y + bodyH],
            [tailX + tailW, y + bodyH, tailX, y + h],
            [tailX, y + h, tailX + tailW * 0.35, y + bodyH],
            [tailX + tailW * 0.35, y + bodyH, x, y + bodyH],
            [x, y + bodyH, x, y]
          ];
          return edges.some(([ax, ay, bx, by]) => this.distanceToSegment(eraserX, eraserY, ax, ay, bx, by) <= effectiveRadius);
        }
        if (isFilled && eraserX >= x && eraserX <= x + w && eraserY >= y && eraserY <= y + h) {
          return true;
        }
        const topDist = this.distanceToSegment(eraserX, eraserY, x, y, x + w, y);
        const rightDist = this.distanceToSegment(eraserX, eraserY, x + w, y, x + w, y + h);
        const bottomDist = this.distanceToSegment(eraserX, eraserY, x + w, y + h, x, y + h);
        const leftDist = this.distanceToSegment(eraserX, eraserY, x, y + h, x, y);
        return (
          topDist <= effectiveRadius ||
          rightDist <= effectiveRadius ||
          bottomDist <= effectiveRadius ||
          leftDist <= effectiveRadius
        );
      }
    }
  }

  static eraseShapes(
    shapes: ShapeObject[],
    eraserX: number,
    eraserY: number,
    radius: number,
    spatialIndex?: PageSpatialIndex
  ): EraseShapesResult {
    const queryPad = radius + 16;
    const candidates = spatialIndex
      ? spatialIndex.queryShapes({
          minX: eraserX - queryPad,
          minY: eraserY - queryPad,
          maxX: eraserX + queryPad,
          maxY: eraserY + queryPad
        })
      : shapes;

    const deletedSet = new Set<string>();
    const deletedIds: string[] = [];

    for (const shape of candidates) {
      if (this.hitTestShape(shape, eraserX, eraserY, radius)) {
        deletedSet.add(shape.id);
        deletedIds.push(shape.id);
      }
    }

    if (deletedIds.length === 0) {
      return { remaining: shapes, deletedIds: [] };
    }

    const remaining = shapes.filter((sh) => !deletedSet.has(sh.id));
    return { remaining, deletedIds };
  }

  static eraseShapesTrajectory(
    shapes: ShapeObject[],
    points: { x: number; y: number }[],
    radius: number,
    spatialIndex?: PageSpatialIndex
  ): EraseShapesResult {
    if (points.length === 0) {
      return { remaining: shapes, deletedIds: [] };
    }
    if (points.length === 1) {
      return this.eraseShapes(shapes, points[0].x, points[0].y, radius, spatialIndex);
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const queryPad = radius + 16;
    const chunkMinX = minX - queryPad;
    const chunkMinY = minY - queryPad;
    const chunkMaxX = maxX + queryPad;
    const chunkMaxY = maxY + queryPad;

    const sweptPoints = this.subdivideTrajectory(points, Math.max(2, radius * 0.75));
    const candidates = spatialIndex
      ? spatialIndex.queryShapes({ minX: chunkMinX, minY: chunkMinY, maxX: chunkMaxX, maxY: chunkMaxY })
      : shapes;

    const deletedSet = new Set<string>();
    const deletedIds: string[] = [];

    for (const shape of candidates) {
      const b = shape.bounds;
      const strokePad = Math.max(4, shape.strokeWidth / 2);
      if (
        chunkMaxX < b.minX - strokePad ||
        chunkMinX > b.maxX + strokePad ||
        chunkMaxY < b.minY - strokePad ||
        chunkMinY > b.maxY + strokePad
      ) {
        continue;
      }

      let hit = false;
      for (const p of sweptPoints) {
        if (this.hitTestShape(shape, p.x, p.y, radius)) {
          hit = true;
          break;
        }
      }

      if (hit) {
        deletedSet.add(shape.id);
        deletedIds.push(shape.id);
      }
    }

    if (deletedIds.length === 0) {
      return { remaining: shapes, deletedIds: [] };
    }

    const remaining = shapes.filter((sh) => !deletedSet.has(sh.id));
    return { remaining, deletedIds };
  }
}
