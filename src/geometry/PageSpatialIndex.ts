import {
  ImageObject,
  PageData,
  ShapeObject,
  StrokeBoundingBox,
  StrokeObject,
  TextObject
} from "../types";

const OVERFLOW_CELL_KEY = 0x7fffffff;

export class PageSpatialIndex {
  private readonly cellSize: number;
  private strokeBuckets: Map<number, Set<string>> = new Map();
  private shapeBuckets: Map<number, Set<string>> = new Map();
  private textBuckets: Map<number, Set<string>> = new Map();
  private imageBuckets: Map<number, Set<string>> = new Map();

  private strokeMap: Map<string, StrokeObject> = new Map();
  private shapeMap: Map<string, ShapeObject> = new Map();
  private textMap: Map<string, TextObject> = new Map();
  private imageMap: Map<string, ImageObject> = new Map();
  private strokeOrderMap: Map<string, number> = new Map();
  private shapeOrderMap: Map<string, number> = new Map();
  private nextOrder: number = 0;

  private strokeCells: Map<string, number[]> = new Map();
  private shapeCells: Map<string, number[]> = new Map();
  private textCells: Map<string, number[]> = new Map();
  private imageCells: Map<string, number[]> = new Map();

  private version: number = 0;

  constructor(cellSize: number = 64) {
    this.cellSize = Math.max(16, cellSize);
  }

  getVersion(): number {
    return this.version;
  }

  clear(): void {
    this.strokeBuckets.clear();
    this.shapeBuckets.clear();
    this.textBuckets.clear();
    this.imageBuckets.clear();
    this.strokeMap.clear();
    this.shapeMap.clear();
    this.textMap.clear();
    this.imageMap.clear();
    this.strokeCells.clear();
    this.shapeCells.clear();
    this.textCells.clear();
    this.imageCells.clear();
    this.strokeOrderMap.clear();
    this.shapeOrderMap.clear();
    this.nextOrder = 0;
    this.version++;
  }

  rebuild(page: PageData): void {
    this.clear();
    for (const s of page.strokes) {
      this.insertStroke(s);
    }
    for (const sh of page.shapes) {
      this.insertShape(sh);
    }
    for (const t of page.texts) {
      this.insertText(t);
    }
    for (const img of page.images) {
      this.insertImage(img);
    }
  }

  insertStroke(stroke: StrokeObject): void {
    const existingOrder = this.strokeOrderMap.get(stroke.id);
    if (this.strokeMap.has(stroke.id)) {
      this.removeStroke(stroke.id);
    }
    this.strokeMap.set(stroke.id, stroke);
    this.strokeOrderMap.set(stroke.id, existingOrder ?? this.nextOrder++);
    const cells = this.computeCellKeys(stroke.bounds);
    this.strokeCells.set(stroke.id, cells);
    this.addToBuckets(this.strokeBuckets, cells, stroke.id);
    this.version++;
  }

  removeStroke(strokeId: string): void {
    const cells = this.strokeCells.get(strokeId);
    if (cells) {
      this.removeFromBuckets(this.strokeBuckets, cells, strokeId);
      this.strokeCells.delete(strokeId);
    }
    this.strokeMap.delete(strokeId);
    this.strokeOrderMap.delete(strokeId);
    this.version++;
  }

  insertShape(shape: ShapeObject): void {
    const existingOrder = this.shapeOrderMap.get(shape.id);
    if (this.shapeMap.has(shape.id)) {
      this.removeShape(shape.id);
    }
    this.shapeMap.set(shape.id, shape);
    this.shapeOrderMap.set(shape.id, existingOrder ?? this.nextOrder++);
    const cells = this.computeCellKeys(shape.bounds);
    this.shapeCells.set(shape.id, cells);
    this.addToBuckets(this.shapeBuckets, cells, shape.id);
    this.version++;
  }

  removeShape(shapeId: string): void {
    const cells = this.shapeCells.get(shapeId);
    if (cells) {
      this.removeFromBuckets(this.shapeBuckets, cells, shapeId);
      this.shapeCells.delete(shapeId);
    }
    this.shapeMap.delete(shapeId);
    this.shapeOrderMap.delete(shapeId);
    this.version++;
  }

  insertText(text: TextObject): void {
    if (this.textMap.has(text.id)) {
      this.removeText(text.id);
    }
    this.textMap.set(text.id, text);
    const bounds = this.getTextBounds(text);
    const cells = this.computeCellKeys(bounds);
    this.textCells.set(text.id, cells);
    this.addToBuckets(this.textBuckets, cells, text.id);
    this.version++;
  }

  removeText(textId: string): void {
    const cells = this.textCells.get(textId);
    if (cells) {
      this.removeFromBuckets(this.textBuckets, cells, textId);
      this.textCells.delete(textId);
    }
    this.textMap.delete(textId);
    this.version++;
  }

  insertImage(image: ImageObject): void {
    if (this.imageMap.has(image.id)) {
      this.removeImage(image.id);
    }
    this.imageMap.set(image.id, image);
    const bounds = this.getImageBounds(image);
    const cells = this.computeCellKeys(bounds);
    this.imageCells.set(image.id, cells);
    this.addToBuckets(this.imageBuckets, cells, image.id);
    this.version++;
  }

  removeImage(imageId: string): void {
    const cells = this.imageCells.get(imageId);
    if (cells) {
      this.removeFromBuckets(this.imageBuckets, cells, imageId);
      this.imageCells.delete(imageId);
    }
    this.imageMap.delete(imageId);
    this.version++;
  }

  queryStrokes(rect: StrokeBoundingBox): StrokeObject[] {
    const cells = this.computeCellKeys(rect);
    if (!cells.includes(OVERFLOW_CELL_KEY) && this.strokeBuckets.has(OVERFLOW_CELL_KEY)) {
      cells.push(OVERFLOW_CELL_KEY);
    }
    const seen = new Set<string>();
    const results: StrokeObject[] = [];
    for (const key of cells) {
      const bucket = this.strokeBuckets.get(key);
      if (!bucket) continue;
      for (const id of bucket) {
        if (seen.has(id)) continue;
        seen.add(id);
        const s = this.strokeMap.get(id);
        if (s && this.intersects(s.bounds, rect)) {
          results.push(s);
        }
      }
    }
    results.sort((a, b) => (this.strokeOrderMap.get(a.id) ?? 0) - (this.strokeOrderMap.get(b.id) ?? 0));
    return results;
  }

  queryShapes(rect: StrokeBoundingBox): ShapeObject[] {
    const cells = this.computeCellKeys(rect);
    if (!cells.includes(OVERFLOW_CELL_KEY) && this.shapeBuckets.has(OVERFLOW_CELL_KEY)) {
      cells.push(OVERFLOW_CELL_KEY);
    }
    const seen = new Set<string>();
    const results: ShapeObject[] = [];
    for (const key of cells) {
      const bucket = this.shapeBuckets.get(key);
      if (!bucket) continue;
      for (const id of bucket) {
        if (seen.has(id)) continue;
        seen.add(id);
        const sh = this.shapeMap.get(id);
        if (sh && this.intersects(sh.bounds, rect)) {
          results.push(sh);
        }
      }
    }
    results.sort((a, b) => (this.shapeOrderMap.get(a.id) ?? 0) - (this.shapeOrderMap.get(b.id) ?? 0));
    return results;
  }

  queryTexts(rect: StrokeBoundingBox): TextObject[] {
    const cells = this.computeCellKeys(rect);
    if (!cells.includes(OVERFLOW_CELL_KEY) && this.textBuckets.has(OVERFLOW_CELL_KEY)) {
      cells.push(OVERFLOW_CELL_KEY);
    }
    const seen = new Set<string>();
    const results: TextObject[] = [];
    for (const key of cells) {
      const bucket = this.textBuckets.get(key);
      if (!bucket) continue;
      for (const id of bucket) {
        if (seen.has(id)) continue;
        seen.add(id);
        const t = this.textMap.get(id);
        if (t && this.intersects(this.getTextBounds(t), rect)) {
          results.push(t);
        }
      }
    }
    return results;
  }

  queryImages(rect: StrokeBoundingBox): ImageObject[] {
    const cells = this.computeCellKeys(rect);
    const seen = new Set<string>();
    const results: ImageObject[] = [];
    for (const key of cells) {
      const bucket = this.imageBuckets.get(key);
      if (!bucket) continue;
      for (const id of bucket) {
        if (seen.has(id)) continue;
        seen.add(id);
        const img = this.imageMap.get(id);
        if (img && this.intersects(this.getImageBounds(img), rect)) {
          results.push(img);
        }
      }
    }
    return results;
  }

  private getTextBounds(t: TextObject): StrokeBoundingBox {
    return t.bounds ?? { minX: t.x, minY: t.y, maxX: t.x + (t.width || 100), maxY: t.y + (t.height || 30) };
  }

  private getImageBounds(img: ImageObject): StrokeBoundingBox {
    return img.bounds ?? { minX: img.x, minY: img.y, maxX: img.x + img.width, maxY: img.y + img.height };
  }

  private intersects(a: StrokeBoundingBox, b: StrokeBoundingBox): boolean {
    return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
  }

  private computeCellKeys(bounds: StrokeBoundingBox): number[] {
    const minCx = Math.floor(bounds.minX / this.cellSize);
    const maxCx = Math.floor(bounds.maxX / this.cellSize);
    const minCy = Math.floor(bounds.minY / this.cellSize);
    const maxCy = Math.floor(bounds.maxY / this.cellSize);

    const spanX = maxCx - minCx + 1;
    const spanY = maxCy - minCy + 1;
    if (spanX * spanY > 4096) {
      return [OVERFLOW_CELL_KEY];
    }

    const keys: number[] = [];
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        keys.push(((cx + 32768) << 16) | ((cy + 32768) & 0xffff));
      }
    }
    return keys;
  }

  private addToBuckets(buckets: Map<number, Set<string>>, cells: number[], id: string): void {
    for (const key of cells) {
      let set = buckets.get(key);
      if (!set) {
        set = new Set();
        buckets.set(key, set);
      }
      set.add(id);
    }
  }

  private removeFromBuckets(buckets: Map<number, Set<string>>, cells: number[], id: string): void {
    for (const key of cells) {
      const set = buckets.get(key);
      if (set) {
        set.delete(id);
        if (set.size === 0) {
          buckets.delete(key);
        }
      }
    }
  }
}

export class PageSpatialIndexRegistry {
  private static indexes = new WeakMap<PageData, { index: PageSpatialIndex; signature: string }>();

  static getOrBuild(page: PageData): PageSpatialIndex {
    const sig = `${page.strokes.length}:${page.shapes.length}:${page.texts.length}:${page.images.length}`;
    const entry = this.indexes.get(page);
    if (entry && entry.signature === sig) {
      return entry.index;
    }
    const index = entry ? entry.index : new PageSpatialIndex();
    index.rebuild(page);
    this.indexes.set(page, { index, signature: sig });
    return index;
  }

  static invalidate(page: PageData): void {
    this.indexes.delete(page);
  }
}
