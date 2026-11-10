import { getStroke, StrokeOptions } from "perfect-freehand";
import {
  PointSample,
  StrokeBoundingBox,
  StrokeObject,
  ToolType
} from "../types";

export class StrokeGeometry {
  static getStrokeOptions(tool: ToolType, width: number, simulatePressure: boolean = false): StrokeOptions {
    switch (tool) {
      case "pressure":
        return {
          size: Math.max(1, width * 1.5),
          thinning: 0.65,
          smoothing: 0.6,
          streamline: 0.55,
          simulatePressure,
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
          streamline: 0.45,
          simulatePressure,
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
          smoothing: 0.7,
          streamline: 0.6,
          simulatePressure: false,
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
          smoothing: 0.55,
          streamline: 0.5,
          simulatePressure,
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
      case "highlighter":
        return Math.max(6, width * 4.5);
      case "pen":
      default:
        return Math.max(1, width);
    }
  }

  static isDot(points: PointSample[], width: number): boolean {
    if (points.length <= 1) {
      return true;
    }
    const p0 = points[0];
    const threshold = Math.max(3.0, width * 0.7);
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

  static generateOutline(points: PointSample[], tool: ToolType, width: number): number[][] {
    if (points.length === 0) {
      return [];
    }

    if (this.isDot(points, width)) {
      return this.generateDotOutline(points, tool, width);
    }

    const shouldSimulate = tool !== "highlighter" && !this.hasVaryingPressure(points);
    const rawInput = points.map((p) => [p.x, p.y, Math.max(0.05, Math.min(1.0, p.pressure))]);
    const options = this.getStrokeOptions(tool, width, shouldSimulate);
    const outline = getStroke(rawInput, options);
    if (outline.length < 2) {
      return this.generateDotOutline(points, tool, width);
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
    ctx.moveTo(outline[0][0], outline[0][1]);

    for (let i = 1; i < outline.length - 1; i++) {
      const xc = (outline[i][0] + outline[i + 1][0]) / 2;
      const yc = (outline[i][1] + outline[i + 1][1]) / 2;
      ctx.quadraticCurveTo(outline[i][0], outline[i][1], xc, yc);
    }

    const last = outline[outline.length - 1];
    ctx.lineTo(last[0], last[1]);
    ctx.closePath();
    ctx.fill();
  }

  static renderStroke(ctx: CanvasRenderingContext2D, stroke: StrokeObject): void {
    if (stroke.points.length === 0) {
      return;
    }

    const outline = this.generateOutline(stroke.points, stroke.tool, stroke.width);
    if (outline.length < 2) {
      return;
    }

    ctx.save();
    ctx.fillStyle = stroke.color;

    if (stroke.tool === "highlighter") {
      ctx.globalAlpha = Math.max(0.1, Math.min(0.5, stroke.opacity));
      ctx.globalCompositeOperation = "multiply";
    } else {
      ctx.globalAlpha = Math.max(0, Math.min(1, stroke.opacity));
      ctx.globalCompositeOperation = "source-over";
    }

    this.drawOutlinePath(ctx, outline);
    ctx.restore();
  }
}
