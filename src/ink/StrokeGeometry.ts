import { getStrokeOutlinePoints, getStrokePoints, StrokeOptions } from "perfect-freehand";
import {
  PointSample,
  StrokeBoundingBox,
  StrokeObject,
  StrokePattern,
  ToolType
} from "../types";

export interface CachedStrokeGeometry {
  outline: number[][];
  path?: Path2D;
}

const strokeGeometryCache = new WeakMap<StrokeObject, CachedStrokeGeometry>();

export class StrokeGeometry {
  static hasCachedGeometry(stroke: StrokeObject): boolean {
    return strokeGeometryCache.has(stroke);
  }

  static getCachedGeometry(stroke: StrokeObject): CachedStrokeGeometry | null {
    if (stroke.points.length === 0) {
      return null;
    }
    let cached = strokeGeometryCache.get(stroke);
    if (!cached) {
      const outline = this.generateOutline(stroke.points, stroke.tool, stroke.width);
      if (outline.length < 2) {
        return null;
      }
      cached = { outline };
      if (typeof Path2D !== "undefined") {
        cached.path = this.createPath2D(outline);
      }
      if (stroke.id !== "active") {
        strokeGeometryCache.set(stroke, cached);
      }
    }
    return cached;
  }

  static invalidateStrokeCache(stroke: StrokeObject): void {
    strokeGeometryCache.delete(stroke);
  }

  static setCachedGeometry(stroke: StrokeObject, geometry: CachedStrokeGeometry): void {
    strokeGeometryCache.set(stroke, geometry);
  }

  private static traceOutlineSubpath(
    target: Path2D | CanvasRenderingContext2D,
    outline: number[][]
  ): void {
    target.moveTo(outline[0][0], outline[0][1]);
    for (let i = 1; i < outline.length - 1; i++) {
      const xc = (outline[i][0] + outline[i + 1][0]) / 2;
      const yc = (outline[i][1] + outline[i + 1][1]) / 2;
      target.quadraticCurveTo(outline[i][0], outline[i][1], xc, yc);
    }
    const last = outline[outline.length - 1];
    target.lineTo(last[0], last[1]);
    target.closePath();
  }

  static createPath2D(outline: number[][]): Path2D | undefined {
    if (typeof Path2D === "undefined" || outline.length < 2) {
      return undefined;
    }
    try {
      const path = new Path2D();
      this.traceOutlineSubpath(path, outline);
      return path;
    } catch {
      return undefined;
    }
  }
  static getStrokeOptions(tool: ToolType, width: number, simulatePressure: boolean = false): StrokeOptions {
    switch (tool) {
      case "pressure":
        return {
          size: Math.max(1, width * 1.5),
          thinning: 0.65,
          smoothing: 0.55,
          streamline: 0.38,
          simulatePressure,
          last: true,
          start: {
            taper: 0,
            cap: true
          },
          end: {
            taper: 0,
            cap: true
          }
        };

      case "fountain":
        return {
          size: Math.max(1, width * 1.3),
          thinning: 0.35,
          smoothing: 0.45,
          streamline: 0.35,
          simulatePressure,
          last: true,
          start: {
            taper: 0,
            cap: true
          },
          end: {
            taper: 0,
            cap: true
          }
        };

      case "pencil":
        return {
          size: Math.max(1.2, width * 1.35),
          thinning: 0.4,
          smoothing: 0.35,
          streamline: 0.28,
          simulatePressure,
          last: true,
          start: {
            taper: 0,
            cap: true
          },
          end: {
            taper: 0,
            cap: true
          }
        };

      case "highlighter":
        return {
          size: Math.max(6, width * 4.5),
          thinning: 0,
          smoothing: 0.65,
          streamline: 0.45,
          simulatePressure: false,
          last: true,
          start: {
            taper: 0,
            cap: false
          },
          end: {
            taper: 0,
            cap: false
          }
        };

      case "pen":
      default:
        return {
          size: Math.max(1, width),
          thinning: 0.15,
          smoothing: 0.5,
          streamline: 0.35,
          simulatePressure,
          last: true,
          start: {
            taper: 0,
            cap: true
          },
          end: {
            taper: 0,
            cap: true
          }
        };
    }
  }

  static getToolSize(tool: ToolType, width: number): number {
    switch (tool) {
      case "pressure":
        return Math.max(1, width * 1.5);
      case "fountain":
        return Math.max(1, width * 1.3);
      case "pencil":
        return Math.max(1.2, width * 1.35);
      case "highlighter":
        return Math.max(6, width * 4.5);
      case "pen":
      default:
        return Math.max(1, width);
    }
  }

  static getBoundsPadding(tool: ToolType, width: number): number {
    const toolSize = this.getToolSize(tool, width);
    if (tool === "highlighter") {
      return Math.max(4, Math.ceil(toolSize / 2) + 1);
    }
    if (tool === "pressure") {
      return Math.max(2, Math.ceil(toolSize * 0.825) + 1);
    }
    if (tool === "fountain" || tool === "pencil") {
      return Math.max(2, Math.ceil(toolSize * 0.7) + 1);
    }
    return Math.max(2, Math.ceil(toolSize / 2) + 1);
  }

  static isDot(points: PointSample[], width: number): boolean {
    if (points.length <= 1) {
      return true;
    }
    const p0 = points[0];
    const threshold = Math.min(2.0, Math.max(1.2, width * 0.3));
    for (let i = 1; i < points.length; i++) {
      const dist = Math.hypot(points[i].x - p0.x, points[i].y - p0.y);
      if (dist > threshold) {
        return false;
      }
    }
    return true;
  }

  static generateDotOutline(points: PointSample[], tool: ToolType, width: number): number[][] {
    if (points.length === 0) {
      return [];
    }
    let sumX = 0;
    let sumY = 0;
    let maxPressure = 0.5;
    for (const p of points) {
      sumX += p.x;
      sumY += p.y;
      if (p.pressure && p.pressure > maxPressure) {
        maxPressure = p.pressure;
      }
    }
    const cx = sumX / points.length;
    const cy = sumY / points.length;

    const baseSize = this.getToolSize(tool, width);
    const pressureClamped = Math.max(0.15, Math.min(1.0, maxPressure));
    const pressureScale = tool === "pressure" ? (0.7 + pressureClamped * 0.3) : 1.0;
    const radius = Math.max(1.2, (baseSize * pressureScale) / 2);

    const circle: number[][] = [];
    const segments = 16;
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      circle.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
    }
    return circle;
  }

  static hasVaryingPressure(points: PointSample[]): boolean {
    if (points.length < 2) {
      return false;
    }
    const firstPressure = points[0].pressure;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(points[i].pressure - firstPressure) > 0.01) {
        return true;
      }
    }
    return false;
  }

  static straightenHighlighterPoints(points: PointSample[]): PointSample[] {
    if (points.length < 2) {
      return [...points];
    }
    const p0 = points[0];
    const pn = points[points.length - 1];
    const dx = pn.x - p0.x;
    const dy = pn.y - p0.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 10) {
      return [...points];
    }
    let targetX = pn.x;
    let targetY = pn.y;
    if (Math.abs(dy) / Math.max(1, Math.abs(dx)) < 0.2) {
      targetY = p0.y;
    } else if (Math.abs(dx) / Math.max(1, Math.abs(dy)) < 0.2) {
      targetX = p0.x;
    }
    const count = Math.max(5, Math.min(30, Math.floor(dist / 15)));
    const result: PointSample[] = [];
    const t0 = p0.timestamp || Date.now();
    const tn = pn.timestamp || (t0 + 100);
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      result.push({
        x: p0.x + (targetX - p0.x) * t,
        y: p0.y + (targetY - p0.y) * t,
        pressure: 0.5,
        timestamp: t0 + t * (tn - t0)
      });
    }
    return result;
  }

  private static sanitizePoints(points: PointSample[]): PointSample[] {
    const cleaned: PointSample[] = [];
    for (const p of points) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        continue;
      }
      const prev = cleaned[cleaned.length - 1];
      if (prev && prev.x === p.x && prev.y === p.y) {
        continue;
      }
      cleaned.push(p);
    }
    return cleaned;
  }

  static generateOutline(points: PointSample[], tool: ToolType, width: number): number[][] {
    const cleanPoints = this.sanitizePoints(points);
    if (cleanPoints.length === 0) {
      return [];
    }

    if (this.isDot(cleanPoints, width)) {
      return this.generateDotOutline(cleanPoints, tool, width);
    }

    const shouldSimulate = tool !== "highlighter" && !this.hasVaryingPressure(cleanPoints);
    const rawInput = cleanPoints.map((p) => {
      const baseP = Math.max(0.05, Math.min(1.0, p.pressure));
      if (tool === "pencil") {
        const tiltMag = Math.min(1, Math.hypot(p.tiltX ?? 0, p.tiltY ?? 0) / 60);
        const shadedP = Math.min(1.0, baseP * (0.78 + tiltMag * 0.55));
        return [p.x, p.y, shadedP];
      }
      return [p.x, p.y, baseP];
    });
    const options = this.getStrokeOptions(tool, width, shouldSimulate);
    // Keep strokePoints resolution independent of tool width so short strokes and accents keep corners.
    const strokePoints = getStrokePoints(rawInput, { ...options, size: 0.5, last: true });
    const outline = getStrokeOutlinePoints(strokePoints, { ...options, last: true });
    if (outline.length < 3) {
      return this.generateDotOutline(cleanPoints, tool, width);
    }
    return outline;
  }

  static computeBoundingBox(points: PointSample[], padding: number = 4): StrokeBoundingBox {
    if (points.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    return {
      minX: minX - padding,
      minY: minY - padding,
      maxX: maxX + padding,
      maxY: maxY + padding
    };
  }

  static drawOutlinePath(ctx: CanvasRenderingContext2D, outline: number[][]): void {
    if (outline.length < 2) {
      return;
    }

    ctx.beginPath();
    this.traceOutlineSubpath(ctx, outline);
    ctx.fill();
  }

  static getLineDashArray(pattern: StrokePattern | undefined, width: number): number[] {
    if (pattern === "dashed") {
      const dash = Math.max(4, width * 3.2);
      const gap = Math.max(3, width * 2.1);
      return [dash, gap];
    }
    if (pattern === "dotted") {
      const gap = Math.max(3, width * 2.1);
      return [0.1, gap];
    }
    return [];
  }

  static drawCenterlinePath(ctx: CanvasRenderingContext2D, points: PointSample[]): void {
    if (points.length === 0) {
      return;
    }
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    if (points.length === 1) {
      ctx.lineTo(points[0].x + 0.01, points[0].y + 0.01);
    } else {
      for (let i = 1; i < points.length - 1; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2;
        const yc = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
      }
      const last = points[points.length - 1];
      ctx.lineTo(last.x, last.y);
    }
    ctx.stroke();
  }

  static computePencilOpacity(stroke: StrokeObject): number {
    if (stroke.points.length === 0) {
      return Math.max(0.25, Math.min(0.9, stroke.opacity));
    }
    let pressureSum = 0;
    for (const p of stroke.points) {
      pressureSum += p.pressure || 0.5;
    }
    const avgP = Math.max(0.15, Math.min(1, pressureSum / stroke.points.length));
    return Math.max(0.35, Math.min(0.9, (0.55 + avgP * 0.35) * stroke.opacity));
  }

  private static applyStrokeCompositeStyle(ctx: CanvasRenderingContext2D, stroke: StrokeObject): void {
    if (stroke.tool === "highlighter") {
      ctx.globalAlpha = Math.max(0.1, Math.min(0.5, stroke.opacity));
      ctx.globalCompositeOperation = "multiply";
    } else if (stroke.tool === "pencil") {
      ctx.globalAlpha = this.computePencilOpacity(stroke);
      ctx.globalCompositeOperation = "source-over";
    } else {
      ctx.globalAlpha = Math.max(0, Math.min(1, stroke.opacity));
      ctx.globalCompositeOperation = "source-over";
    }
  }

  static renderStroke(ctx: CanvasRenderingContext2D, stroke: StrokeObject): void {
    if (stroke.points.length === 0) {
      return;
    }

    if (stroke.strokePattern === "dashed" || stroke.strokePattern === "dotted") {
      const effectiveWidth =
        stroke.tool === "highlighter"
          ? this.getToolSize("highlighter", stroke.width)
          : Math.max(1, stroke.width);
      const dash = this.getLineDashArray(stroke.strokePattern, effectiveWidth);
      ctx.save();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = effectiveWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (typeof ctx.setLineDash === "function") {
        ctx.setLineDash(dash);
      }
      this.applyStrokeCompositeStyle(ctx, stroke);
      this.drawCenterlinePath(ctx, stroke.points);
      ctx.restore();
      return;
    }

    const geometry = this.getCachedGeometry(stroke);
    if (!geometry || geometry.outline.length < 2) {
      return;
    }

    ctx.save();
    ctx.fillStyle = stroke.color;
    this.applyStrokeCompositeStyle(ctx, stroke);

    if (geometry.path && typeof ctx.fill === "function") {
      ctx.fill(geometry.path);
    } else {
      this.drawOutlinePath(ctx, geometry.outline);
    }

    if (
      stroke.tool === "pencil" &&
      stroke.points.length > 2 &&
      geometry.path &&
      typeof ctx.clip === "function" &&
      typeof ctx.fillRect === "function"
    ) {
      ctx.clip(geometry.path);
      ctx.globalAlpha = Math.min(0.28, ctx.globalAlpha * 0.35);
      const grainSize = Math.max(0.5, stroke.width * 0.22);
      for (let i = 0; i < stroke.points.length; i += 2) {
        const pt = stroke.points[i];
        const seed = Math.sin(pt.x * 12.9898 + pt.y * 78.233) * 43758.5453;
        const frac = seed - Math.floor(seed);
        const offsetX = (frac - 0.5) * stroke.width * 0.65;
        const offsetY = (((frac * 7.13) % 1) - 0.5) * stroke.width * 0.65;
        ctx.fillRect(pt.x + offsetX, pt.y + offsetY, grainSize, grainSize);
      }
    }
    ctx.restore();
  }
}
