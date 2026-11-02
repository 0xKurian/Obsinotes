import {
  PointSample,
  ShapeObject,
  StrokeBoundingBox,
  StrokeObject,
  SelectionHandle,
  TextObject,
  ImageObject
} from "../types";
import { EraserEngine } from "../ink/EraserEngine";

export class SelectionEngine {
  static pointInPolygon(
    px: number,
    py: number,
    polygon: { x: number; y: number }[]
  ): boolean {
    if (polygon.length < 3) {
      return false;
    }

    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;

      const intersect =
        yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
      if (intersect) {
        inside = !inside;
      }
    }

    return inside;
  }

  static doBoundingBoxesIntersect(
    b1: StrokeBoundingBox,
    b2: StrokeBoundingBox
  ): boolean {
    return !(
      b1.maxX < b2.minX ||
      b1.minX > b2.maxX ||
      b1.maxY < b2.minY ||
      b1.minY > b2.maxY
    );
  }

  static computePolygonBoundingBox(
    polygon: { x: number; y: number }[]
  ): StrokeBoundingBox {
    if (polygon.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const p of polygon) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    return { minX, minY, maxX, maxY };
  }

  static isStrokeSelectedByLasso(
    stroke: StrokeObject,
    lassoPolygon: { x: number; y: number }[],
    containmentRatioThreshold: number = 0.5
  ): boolean {
    if (stroke.points.length === 0 || lassoPolygon.length < 3) {
      return false;
    }

    const lassoBounds = this.computePolygonBoundingBox(lassoPolygon);
    if (!this.doBoundingBoxesIntersect(stroke.bounds, lassoBounds)) {
      return false;
    }

    let insideCount = 0;
    for (const p of stroke.points) {
      if (this.pointInPolygon(p.x, p.y, lassoPolygon)) {
        insideCount++;
      }
    }

    return insideCount / stroke.points.length >= containmentRatioThreshold;
  }

  static isShapeSelectedByLasso(
    shape: ShapeObject,
    lassoPolygon: { x: number; y: number }[]
  ): boolean {
    const lassoBounds = this.computePolygonBoundingBox(lassoPolygon);
    if (!this.doBoundingBoxesIntersect(shape.bounds, lassoBounds)) {
      return false;
    }

    const b = shape.bounds;
    const keyPoints = [
      { x: b.minX, y: b.minY },
      { x: b.maxX, y: b.minY },
      { x: b.minX, y: b.maxY },
      { x: b.maxX, y: b.maxY },
      { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
    ];

    let insideCount = 0;
    for (const kp of keyPoints) {
      if (this.pointInPolygon(kp.x, kp.y, lassoPolygon)) {
        insideCount++;
      }
    }

    return insideCount >= 2;
  }

  static isImageSelectedByLasso(
    image: ImageObject,
    lassoPolygon: { x: number; y: number }[]
  ): boolean {
    const imgBounds: StrokeBoundingBox = {
      minX: image.x,
      minY: image.y,
      maxX: image.x + image.width,
      maxY: image.y + image.height
    };
    const lassoBounds = this.computePolygonBoundingBox(lassoPolygon);
    if (!this.doBoundingBoxesIntersect(imgBounds, lassoBounds)) {
      return false;
    }

    const keyPoints = [
      { x: imgBounds.minX, y: imgBounds.minY },
      { x: imgBounds.maxX, y: imgBounds.minY },
      { x: imgBounds.minX, y: imgBounds.maxY },
      { x: imgBounds.maxX, y: imgBounds.maxY },
      { x: (imgBounds.minX + imgBounds.maxX) / 2, y: (imgBounds.minY + imgBounds.maxY) / 2 }
    ];

    let insideCount = 0;
    for (const kp of keyPoints) {
      if (this.pointInPolygon(kp.x, kp.y, lassoPolygon)) {
        insideCount++;
      }
    }

    return insideCount >= 2;
  }

  static isTextSelectedByLasso(
    text: TextObject,
    lassoPolygon: { x: number; y: number }[]
  ): boolean {
    const w = text.width || 100;
    const h = text.height || 30;
    const textBounds: StrokeBoundingBox = {
      minX: text.x,
      minY: text.y,
      maxX: text.x + w,
      maxY: text.y + h
    };
    const lassoBounds = this.computePolygonBoundingBox(lassoPolygon);
    if (!this.doBoundingBoxesIntersect(textBounds, lassoBounds)) {
      return false;
    }

    const keyPoints = [
      { x: textBounds.minX, y: textBounds.minY },
      { x: textBounds.maxX, y: textBounds.minY },
      { x: textBounds.minX, y: textBounds.maxY },
      { x: textBounds.maxX, y: textBounds.maxY },
      { x: (textBounds.minX + textBounds.maxX) / 2, y: (textBounds.minY + textBounds.maxY) / 2 }
    ];

    let insideCount = 0;
    for (const kp of keyPoints) {
      if (this.pointInPolygon(kp.x, kp.y, lassoPolygon)) {
        insideCount++;
      }
    }

    return insideCount >= 2;
  }

  static hitTestSingleElement(
    strokes: StrokeObject[],
    shapes: ShapeObject[],
    x: number,
    y: number,
    tolerance = 8,
    texts: TextObject[] = [],
    images: ImageObject[] = []
  ): { stroke?: StrokeObject; shape?: ShapeObject; text?: TextObject; image?: ImageObject } | null {
    for (let i = strokes.length - 1; i >= 0; i--) {
      const s = strokes[i];
      if (EraserEngine.hitTestStroke(s, x, y, tolerance)) {
        return { stroke: s };
      }
    }

    for (let i = shapes.length - 1; i >= 0; i--) {
      const sh = shapes[i];
      const b = sh.bounds;
      if (
        x >= b.minX - tolerance &&
        x <= b.maxX + tolerance &&
        y >= b.minY - tolerance &&
        y <= b.maxY + tolerance
      ) {
        return { shape: sh };
      }
    }

    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      const w = t.width || 100;
      const h = t.height || 30;
      if (x >= t.x - tolerance && x <= t.x + w + tolerance && y >= t.y - tolerance && y <= t.y + h + tolerance) {
        return { text: t };
      }
    }

    for (let i = images.length - 1; i >= 0; i--) {
      const img = images[i];
      if (x >= img.x - tolerance && x <= img.x + img.width + tolerance && y >= img.y - tolerance && y <= img.y + img.height + tolerance) {
        return { image: img };
      }
    }

    return null;
  }

  static computeCombinedBoundingBox(
    strokes: StrokeObject[],
    shapes: ShapeObject[],
    texts: TextObject[] = [],
    images: ImageObject[] = []
  ): StrokeBoundingBox | null {
    if (strokes.length === 0 && shapes.length === 0 && texts.length === 0 && images.length === 0) {
      return null;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const s of strokes) {
      if (s.bounds.minX < minX) minX = s.bounds.minX;
      if (s.bounds.minY < minY) minY = s.bounds.minY;
      if (s.bounds.maxX > maxX) maxX = s.bounds.maxX;
      if (s.bounds.maxY > maxY) maxY = s.bounds.maxY;
    }

    for (const sh of shapes) {
      if (sh.bounds.minX < minX) minX = sh.bounds.minX;
      if (sh.bounds.minY < minY) minY = sh.bounds.minY;
      if (sh.bounds.maxX > maxX) maxX = sh.bounds.maxX;
      if (sh.bounds.maxY > maxY) maxY = sh.bounds.maxY;
    }

    for (const t of texts) {
      const w = t.width || 100;
      const h = t.height || 30;
      if (t.x < minX) minX = t.x;
      if (t.y < minY) minY = t.y;
      if (t.x + w > maxX) maxX = t.x + w;
      if (t.y + h > maxY) maxY = t.y + h;
    }

    for (const img of images) {
      if (img.x < minX) minX = img.x;
      if (img.y < minY) minY = img.y;
      if (img.x + img.width > maxX) maxX = img.x + img.width;
      if (img.y + img.height > maxY) maxY = img.y + img.height;
    }

    return { minX, minY, maxX, maxY };
  }

  static getHandlePositions(
    box: StrokeBoundingBox,
    rotateDistance: number = 22
  ): Record<SelectionHandle, { x: number; y: number }> {
    const midX = (box.minX + box.maxX) / 2;
    const midY = (box.minY + box.maxY) / 2;

    return {
      nw: { x: box.minX, y: box.minY },
      n: { x: midX, y: box.minY },
      ne: { x: box.maxX, y: box.minY },
      e: { x: box.maxX, y: midY },
      se: { x: box.maxX, y: box.maxY },
      s: { x: midX, y: box.maxY },
      sw: { x: box.minX, y: box.maxY },
      w: { x: box.minX, y: midY },
      rotate: { x: midX, y: box.minY - rotateDistance }
    };
  }

  static hitTestHandle(
    box: StrokeBoundingBox,
    x: number,
    y: number,
    hitRadius: number = 10
  ): SelectionHandle | null {
    const handles = this.getHandlePositions(box);
    const keys: SelectionHandle[] = [
      "rotate",
      "nw",
      "ne",
      "se",
      "sw",
      "n",
      "e",
      "s",
      "w"
    ];

    for (const key of keys) {
      const pos = handles[key];
      const dx = x - pos.x;
      const dy = y - pos.y;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        return key;
      }
    }

    return null;
  }

  static transformPoint(
    p: PointSample,
    originBox: StrokeBoundingBox,
    targetBox: StrokeBoundingBox,
    rotationDelta: number = 0
  ): PointSample {
    const origWidth = Math.max(1, originBox.maxX - originBox.minX);
    const origHeight = Math.max(1, originBox.maxY - originBox.minY);
    const targetWidth = targetBox.maxX - targetBox.minX;
    const targetHeight = targetBox.maxY - targetBox.minY;

    const normX = (p.x - originBox.minX) / origWidth;
    const normY = (p.y - originBox.minY) / origHeight;

    let unrotatedX = targetBox.minX + normX * targetWidth;
    let unrotatedY = targetBox.minY + normY * targetHeight;

    if (rotationDelta !== 0) {
      const centerX = (targetBox.minX + targetBox.maxX) / 2;
      const centerY = (targetBox.minY + targetBox.maxY) / 2;
      const cos = Math.cos(rotationDelta);
      const sin = Math.sin(rotationDelta);
      const dx = unrotatedX - centerX;
      const dy = unrotatedY - centerY;

      unrotatedX = centerX + (dx * cos - dy * sin);
      unrotatedY = centerY + (dx * sin + dy * cos);
    }

    return {
      ...p,
      x: unrotatedX,
      y: unrotatedY
    };
  }
}
