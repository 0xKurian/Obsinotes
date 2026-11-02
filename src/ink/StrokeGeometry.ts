import { getStroke, StrokeOptions } from "perfect-freehand";
import {
  PointSample,
  StrokeBoundingBox,
  StrokeObject,
  ToolType
} from "../types";

export class StrokeGeometry {
  static getStrokeOptions(tool: ToolType, width: number): StrokeOptions {
    switch (tool) {
      case "pressure":
        return {
          size: Math.max(1, width * 1.5),
          thinning: 0.65,
          smoothing: 0.6,
          streamline: 0.55,
          simulatePressure: false,
          start: {
            taper: Math.max(1, width * 1.8),
            cap: true
          },
          end: {
            taper: Math.max(1, width * 1.8),
            cap: true
          }
        };

      case "fountain":
        return {
          size: Math.max(1, width * 1.3),
          thinning: 0.35,
          smoothing: 0.45,
          streamline: 0.45,
          simulatePressure: false,
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
          simulatePressure: false,
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

  static generateOutline(points: PointSample[], tool: ToolType, width: number): number[][] {
    if (points.length === 0) {
      return [];
    }

    if (points.length === 1) {
      const p = points[0];
      const radius = Math.max(1, width / 2);
      const circle: number[][] = [];
      const segments = 12;
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        circle.push([p.x + Math.cos(angle) * radius, p.y + Math.sin(angle) * radius]);
      }
      return circle;
    }

    const rawInput = points.map((p) => [p.x, p.y, Math.max(0.05, Math.min(1.0, p.pressure))]);
    const options = this.getStrokeOptions(tool, width);
    return getStroke(rawInput, options);
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
