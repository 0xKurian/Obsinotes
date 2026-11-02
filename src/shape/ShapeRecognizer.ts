import { PointSample, ShapeObject } from "../types";
import { StrokeGeometry } from "../ink/StrokeGeometry";

export interface RecognizedShapeResult {
  shape: ShapeObject;
  confidence: number;
}

export class ShapeRecognizer {
  static distance(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  static calculatePathLength(points: PointSample[]): number {
    let length = 0;
    for (let i = 0; i < points.length - 1; i++) {
      length += this.distance(
        points[i].x,
        points[i].y,
        points[i + 1].x,
        points[i + 1].y
      );
    }
    return length;
  }

  static perpendicularDistance(
    p: PointSample,
    lineStart: PointSample,
    lineEnd: PointSample
  ): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lineLenSq = dx * dx + dy * dy;

    if (lineLenSq === 0) {
      return this.distance(p.x, p.y, lineStart.x, lineStart.y);
    }

    const t =
      ((p.x - lineStart.x) * dx + (p.y - lineStart.y) * dy) / lineLenSq;
    const clampedT = Math.max(0, Math.min(1, t));
    const projX = lineStart.x + clampedT * dx;
    const projY = lineStart.y + clampedT * dy;

    return this.distance(p.x, p.y, projX, projY);
  }

  static douglasPeucker(
    points: PointSample[],
    epsilon: number
  ): PointSample[] {
    if (points.length <= 2) {
      return points;
    }

    let maxDist = 0;
    let index = 0;
    const first = points[0];
    const last = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
      const dist = this.perpendicularDistance(points[i], first, last);
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }

    if (maxDist > epsilon) {
      const left = this.douglasPeucker(points.slice(0, index + 1), epsilon);
      const right = this.douglasPeucker(points.slice(index), epsilon);
      return left.slice(0, left.length - 1).concat(right);
    }

    return [first, last];
  }

  static recognize(
    points: PointSample[],
    color: string,
    strokeWidth: number,
    confidenceThreshold: number = 0.75
  ): RecognizedShapeResult | null {
    if (points.length < 5) {
      return null;
    }

    const pathLength = this.calculatePathLength(points);
    if (pathLength < 10) {
      return null;
    }

    const first = points[0];
    const last = points[points.length - 1];
    const directDistance = this.distance(first.x, first.y, last.x, last.y);
    const bounds = StrokeGeometry.computeBoundingBox(points, strokeWidth);

    const straightness = directDistance / pathLength;
    if (straightness >= 0.92) {
      let maxDev = 0;
      for (const p of points) {
        const dev = this.perpendicularDistance(p, first, last);
        if (dev > maxDev) maxDev = dev;
      }

      const relativeDeviation = maxDev / directDistance;
      if (relativeDeviation <= 0.08) {
        const confidence = Math.min(1.0, (straightness - 0.85) / 0.15);
        if (confidence >= confidenceThreshold) {
          const shape: ShapeObject = {
            id: `shape_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            elementType: "shape",
            type: "line",
            color,
            strokeWidth,
            bounds,
            geometryData: {
              x1: first.x,
              y1: first.y,
              x2: last.x,
              y2: last.y
            }
          };
          return { shape, confidence };
        }
      }
    }

    const closureRatio = directDistance / pathLength;
    if (closureRatio > 0.25) {
      return null;
    }

    let sumX = 0;
    let sumY = 0;
    for (const p of points) {
      sumX += p.x;
      sumY += p.y;
    }
    const cx = sumX / points.length;
    const cy = sumY / points.length;

    let totalR = 0;
    const radii: number[] = [];
    for (const p of points) {
      const r = this.distance(p.x, p.y, cx, cy);
      radii.push(r);
      totalR += r;
    }
    const meanR = totalR / points.length;

    let varR = 0;
    for (const r of radii) {
      varR += (r - meanR) * (r - meanR);
    }
    const stdR = Math.sqrt(varR / points.length);
    const radialCoeff = stdR / meanR;

    if (radialCoeff <= 0.18) {
      const confidence = Math.max(0, 1.0 - radialCoeff / 0.2);
      if (confidence >= confidenceThreshold) {
        const shape: ShapeObject = {
          id: `shape_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          elementType: "shape",
          type: "circle",
          color,
          strokeWidth,
          bounds: {
            minX: cx - meanR - strokeWidth,
            minY: cy - meanR - strokeWidth,
            maxX: cx + meanR + strokeWidth,
            maxY: cy + meanR + strokeWidth
          },
          geometryData: {
            cx,
            cy,
            r: meanR
          }
        };
        return { shape, confidence };
      }
    }

    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const rx = width / 2;
    const ry = height / 2;

    if (rx > 5 && ry > 5) {
      let ellipseDev = 0;
      for (const p of points) {
        const normDx = (p.x - cx) / rx;
        const normDy = (p.y - cy) / ry;
        const d = Math.sqrt(normDx * normDx + normDy * normDy);
        ellipseDev += Math.abs(d - 1.0);
      }
      const meanEllipseDev = ellipseDev / points.length;
      if (meanEllipseDev <= 0.2) {
        const confidence = Math.max(0, 1.0 - meanEllipseDev / 0.22);
        if (confidence >= confidenceThreshold) {
          const shape: ShapeObject = {
            id: `shape_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            elementType: "shape",
            type: "ellipse",
            color,
            strokeWidth,
            bounds,
            geometryData: {
              cx,
              cy,
              rx,
              ry
            }
          };
          return { shape, confidence };
        }
      }
    }

    const diag = Math.sqrt(width * width + height * height);
    const simplified = this.douglasPeucker(points, diag * 0.08);

    const uniqueVertices: PointSample[] = [];
    for (let i = 0; i < simplified.length; i++) {
      const pt = simplified[i];
      if (
        i === simplified.length - 1 &&
        this.distance(pt.x, pt.y, simplified[0].x, simplified[0].y) < diag * 0.15
      ) {
        continue;
      }
      uniqueVertices.push(pt);
    }

    if (uniqueVertices.length === 3) {
      const shape: ShapeObject = {
        id: `shape_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        elementType: "shape",
        type: "triangle",
        color,
        strokeWidth,
        bounds,
        geometryData: {
          x1: uniqueVertices[0].x,
          y1: uniqueVertices[0].y,
          x2: uniqueVertices[1].x,
          y2: uniqueVertices[1].y,
          x3: uniqueVertices[2].x,
          y3: uniqueVertices[2].y
        }
      };
      return { shape, confidence: 0.85 };
    }

    if (uniqueVertices.length === 4) {
      const shape: ShapeObject = {
        id: `shape_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        elementType: "shape",
        type: "rectangle",
        color,
        strokeWidth,
        bounds,
        geometryData: {
          x: bounds.minX + strokeWidth,
          y: bounds.minY + strokeWidth,
          width: width - strokeWidth * 2,
          height: height - strokeWidth * 2
        }
      };
      return { shape, confidence: 0.88 };
    }

    return null;
  }

  static renderShape(ctx: CanvasRenderingContext2D, shape: ShapeObject): void {
    ctx.save();
    ctx.strokeStyle = shape.color;
    ctx.lineWidth = shape.strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (shape.fillColor) {
      ctx.fillStyle = shape.fillColor;
    }

    switch (shape.type) {
      case "line": {
        const { x1, y1, x2, y2 } = shape.geometryData;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        break;
      }

      case "circle": {
        const { cx, cy, r } = shape.geometryData;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        if (shape.fillColor) ctx.fill();
        ctx.stroke();
        break;
      }

      case "ellipse": {
        const { cx, cy, rx, ry } = shape.geometryData;
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
        if (shape.fillColor) ctx.fill();
        ctx.stroke();
        break;
      }

      case "rectangle": {
        const { x, y, width, height } = shape.geometryData;
        ctx.beginPath();
        ctx.rect(x, y, width, height);
        if (shape.fillColor) ctx.fill();
        ctx.stroke();
        break;
      }

      case "rounded-rectangle": {
        const { x, y, width, height } = shape.geometryData;
        const rad = Math.min(Math.max(2, shape.geometryData.radius || 10), width / 2, height / 2);
        ctx.beginPath();
        ctx.moveTo(x + rad, y);
        ctx.lineTo(x + width - rad, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + rad);
        ctx.lineTo(x + width, y + height - rad);
        ctx.quadraticCurveTo(x + width, y + height, x + width - rad, y + height);
        ctx.lineTo(x + rad, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - rad);
        ctx.lineTo(x, y + rad);
        ctx.quadraticCurveTo(x, y, x + rad, y);
        ctx.closePath();
        if (shape.fillColor) ctx.fill();
        ctx.stroke();
        break;
      }

      case "triangle": {
        const { x1, y1, x2, y2, x3, y3 } = shape.geometryData;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.closePath();
        if (shape.fillColor) ctx.fill();
        ctx.stroke();
        break;
      }

      case "diamond": {
        const { x, y, width, height } = shape.geometryData;
        const cx = x + width / 2;
        const cy = y + height / 2;
        ctx.beginPath();
        ctx.moveTo(cx, y);
        ctx.lineTo(x + width, cy);
        ctx.lineTo(cx, y + height);
        ctx.lineTo(x, cy);
        ctx.closePath();
        if (shape.fillColor) ctx.fill();
        ctx.stroke();
        break;
      }

      case "arrow": {
        let x1 = shape.geometryData.x1;
        let y1 = shape.geometryData.y1;
        let x2 = shape.geometryData.x2;
        let y2 = shape.geometryData.y2;
        if (x1 === undefined || x2 === undefined || y1 === undefined || y2 === undefined) {
          x1 = shape.geometryData.x ?? 0;
          y1 = (shape.geometryData.y ?? 0) + (shape.geometryData.height ?? 0) / 2;
          x2 = (shape.geometryData.x ?? 0) + (shape.geometryData.width ?? 0);
          y2 = y1;
        }
        const dx = x2 - x1;
        const dy = y2 - y1;
        const angle = Math.atan2(dy, dx);
        const headLength = Math.max(10, Math.min(24, shape.strokeWidth * 4));
        const headAngle = Math.PI / 6;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - headLength * Math.cos(angle - headAngle),
          y2 - headLength * Math.sin(angle - headAngle)
        );
        ctx.lineTo(
          x2 - headLength * Math.cos(angle + headAngle),
          y2 - headLength * Math.sin(angle + headAngle)
        );
        ctx.closePath();
        ctx.fillStyle = shape.color;
        ctx.fill();
        ctx.stroke();
        break;
      }

      case "star": {
        const { x, y, width, height } = shape.geometryData;
        const cx = x + width / 2;
        const cy = y + height / 2;
        const outerR = Math.min(width, height) / 2;
        const innerR = outerR * 0.42;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? outerR : innerR;
          const a = (i * Math.PI) / 5 - Math.PI / 2;
          const px = cx + r * Math.cos(a);
          const py = cy + r * Math.sin(a);
          if (i === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.closePath();
        if (shape.fillColor) ctx.fill();
        ctx.stroke();
        break;
      }

      case "callout": {
        const { x, y, width, height } = shape.geometryData;
        const bubbleH = height * 0.78;
        const rad = Math.min(10, width / 4, bubbleH / 4);
        const tailStartX = x + width * 0.25;
        const tailEndX = x + width * 0.45;
        const tailTipX = x + width * 0.15;
        const tailTipY = y + height;

        ctx.beginPath();
        ctx.moveTo(x + rad, y);
        ctx.lineTo(x + width - rad, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + rad);
        ctx.lineTo(x + width, y + bubbleH - rad);
        ctx.quadraticCurveTo(x + width, y + bubbleH, x + width - rad, y + bubbleH);
        ctx.lineTo(tailEndX, y + bubbleH);
        ctx.lineTo(tailTipX, tailTipY);
        ctx.lineTo(tailStartX, y + bubbleH);
        ctx.lineTo(x + rad, y + bubbleH);
        ctx.quadraticCurveTo(x, y + bubbleH, x, y + bubbleH - rad);
        ctx.lineTo(x, y + rad);
        ctx.quadraticCurveTo(x, y, x + rad, y);
        ctx.closePath();
        if (shape.fillColor) ctx.fill();
        ctx.stroke();
        break;
      }
    }

    ctx.restore();
  }
}
