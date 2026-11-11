import { PageData, PageDimensions, PageOrientation, ShapeObject, StrokeObject, TextObject, ImageObject } from "../types";

export interface HistoryCommand {
  id: string;
  description: string;
  execute: () => void;
  undo: () => void;
  redo: () => void;
}

export class AddStrokeCommand implements HistoryCommand {
  id: string;
  description: string = "Add stroke";
  private page: PageData;
  private stroke: StrokeObject;
  private onMutate: (isInitial?: boolean) => void;
  private isInitial: boolean = true;

  constructor(page: PageData, stroke: StrokeObject, onMutate: (isInitial?: boolean) => void) {
    this.id = `cmd_add_${stroke.id}`;
    this.page = page;
    this.stroke = stroke;
    this.onMutate = onMutate;
  }

  execute(): void {
    if (!this.page.strokes.some((s) => s.id === this.stroke.id)) {
      this.page.strokes.push(this.stroke);
      this.onMutate(this.isInitial);
      this.isInitial = false;
    }
  }

  undo(): void {
    const idx = this.page.strokes.findIndex((s) => s.id === this.stroke.id);
    if (idx !== -1) {
      this.page.strokes.splice(idx, 1);
      this.onMutate(false);
    }
  }

  redo(): void {
    this.execute();
  }
}

export class EraseStrokesCommand implements HistoryCommand {
  id: string;
  description: string = "Erase strokes";
  private page: PageData;
  private deletedStrokes: { index: number; stroke: StrokeObject }[] = [];
  private addedStrokes: StrokeObject[] = [];
  private deletedShapes: { index: number; shape: ShapeObject }[] = [];
  private addedShapes: ShapeObject[] = [];
  private onMutate: () => void;

  constructor(
    page: PageData,
    previousStrokes: StrokeObject[],
    nextStrokes: StrokeObject[],
    onMutate: () => void,
    previousShapes?: ShapeObject[],
    nextShapes?: ShapeObject[]
  ) {
    this.id = `cmd_erase_${Date.now()}`;
    this.page = page;
    this.onMutate = onMutate;

    const prevShapesArr = previousShapes ? previousShapes : page.shapes;
    const nextShapesArr = nextShapes ? nextShapes : page.shapes;

    const nextStrokeIds = new Set(nextStrokes.map((s) => s.id));
    const prevStrokeIds = new Set(previousStrokes.map((s) => s.id));

    for (let i = 0; i < previousStrokes.length; i++) {
      const s = previousStrokes[i];
      if (!nextStrokeIds.has(s.id)) {
        this.deletedStrokes.push({ index: i, stroke: s });
      }
    }
    for (const s of nextStrokes) {
      if (!prevStrokeIds.has(s.id)) {
        this.addedStrokes.push(s);
      }
    }

    const nextShapeIds = new Set(nextShapesArr.map((sh) => sh.id));
    const prevShapeIds = new Set(prevShapesArr.map((sh) => sh.id));

    for (let i = 0; i < prevShapesArr.length; i++) {
      const sh = prevShapesArr[i];
      if (!nextShapeIds.has(sh.id)) {
        this.deletedShapes.push({ index: i, shape: sh });
      }
    }
    for (const sh of nextShapesArr) {
      if (!prevShapeIds.has(sh.id)) {
        this.addedShapes.push(sh);
      }
    }
  }

  execute(): void {
    const deletedStrokeIds = new Set(this.deletedStrokes.map((d) => d.stroke.id));
    this.page.strokes = this.page.strokes.filter((s) => !deletedStrokeIds.has(s.id));
    for (const s of this.addedStrokes) {
      if (!this.page.strokes.some((existing) => existing.id === s.id)) {
        this.page.strokes.push(s);
      }
    }

    const deletedShapeIds = new Set(this.deletedShapes.map((d) => d.shape.id));
    this.page.shapes = this.page.shapes.filter((sh) => !deletedShapeIds.has(sh.id));
    for (const sh of this.addedShapes) {
      if (!this.page.shapes.some((existing) => existing.id === sh.id)) {
        this.page.shapes.push(sh);
      }
    }

    this.onMutate();
  }

  undo(): void {
    const addedStrokeIds = new Set(this.addedStrokes.map((s) => s.id));
    this.page.strokes = this.page.strokes.filter((s) => !addedStrokeIds.has(s.id));
    for (const item of this.deletedStrokes) {
      const idx = Math.min(Math.max(0, item.index), this.page.strokes.length);
      if (!this.page.strokes.some((existing) => existing.id === item.stroke.id)) {
        this.page.strokes.splice(idx, 0, item.stroke);
      }
    }

    const addedShapeIds = new Set(this.addedShapes.map((sh) => sh.id));
    this.page.shapes = this.page.shapes.filter((sh) => !addedShapeIds.has(sh.id));
    for (const item of this.deletedShapes) {
      const idx = Math.min(Math.max(0, item.index), this.page.shapes.length);
      if (!this.page.shapes.some((existing) => existing.id === item.shape.id)) {
        this.page.shapes.splice(idx, 0, item.shape);
      }
    }

    this.onMutate();
  }

  redo(): void {
    this.execute();
  }
}

export class ConvertShapeCommand implements HistoryCommand {
  id: string;
  description: string = "Convert stroke to shape";
  private page: PageData;
  private rawStroke: StrokeObject;
  private shape: ShapeObject;
  private onMutate: () => void;

  constructor(
    page: PageData,
    rawStroke: StrokeObject,
    shape: ShapeObject,
    onMutate: () => void
  ) {
    this.id = `cmd_shape_${shape.id}`;
    this.page = page;
    this.rawStroke = rawStroke;
    this.shape = shape;
    this.onMutate = onMutate;
  }

  execute(): void {
    this.page.strokes = this.page.strokes.filter((s) => s.id !== this.rawStroke.id);
    if (!this.page.shapes.some((sh) => sh.id === this.shape.id)) {
      this.page.shapes.push(this.shape);
    }
    this.onMutate();
  }

  undo(): void {
    this.page.shapes = this.page.shapes.filter((sh) => sh.id !== this.shape.id);
    if (!this.page.strokes.some((s) => s.id === this.rawStroke.id)) {
      this.page.strokes.push(this.rawStroke);
    }
    this.onMutate();
  }

  redo(): void {
    this.execute();
  }
}

export class AddShapeCommand implements HistoryCommand {
  id: string;
  description: string = "Add shape";
  private page: PageData;
  private shape: ShapeObject;
  private onMutate: () => void;

  constructor(page: PageData, shape: ShapeObject, onMutate: () => void) {
    this.id = `cmd_add_shape_${shape.id}`;
    this.page = page;
    this.shape = shape;
    this.onMutate = onMutate;
  }

  execute(): void {
    if (!this.page.shapes.some((sh) => sh.id === this.shape.id)) {
      this.page.shapes.push(this.shape);
      this.onMutate();
    }
  }

  undo(): void {
    const idx = this.page.shapes.findIndex((sh) => sh.id === this.shape.id);
    if (idx !== -1) {
      this.page.shapes.splice(idx, 1);
      this.onMutate();
    }
  }

  redo(): void {
    this.execute();
  }
}

export class TransformElementsCommand implements HistoryCommand {
  id: string;
  description: string = "Transform elements";
  private page: PageData;
  private prevStrokes: StrokeObject[];
  private nextStrokes: StrokeObject[];
  private prevShapes: ShapeObject[];
  private nextShapes: ShapeObject[];
  private prevImages: ImageObject[];
  private nextImages: ImageObject[];
  private prevTexts: TextObject[];
  private nextTexts: TextObject[];
  private onMutate: () => void;

  constructor(
    page: PageData,
    prevStrokes: StrokeObject[],
    nextStrokes: StrokeObject[],
    prevShapes: ShapeObject[],
    nextShapes: ShapeObject[],
    onMutate: () => void,
    prevImages: ImageObject[] = [],
    nextImages: ImageObject[] = [],
    prevTexts: TextObject[] = [],
    nextTexts: TextObject[] = []
  ) {
    this.id = `cmd_transform_${Date.now()}`;
    this.page = page;
    this.prevStrokes = [...prevStrokes];
    this.nextStrokes = [...nextStrokes];
    this.prevShapes = [...prevShapes];
    this.nextShapes = [...nextShapes];
    this.prevImages = [...prevImages];
    this.nextImages = [...nextImages];
    this.prevTexts = [...prevTexts];
    this.nextTexts = [...nextTexts];
    this.onMutate = onMutate;
  }

  private applyState(
    strokes: StrokeObject[],
    shapes: ShapeObject[],
    images: ImageObject[],
    texts: TextObject[] = []
  ): void {
    const strokeMap = new Map(strokes.map((s) => [s.id, s]));
    this.page.strokes = this.page.strokes.map((s) =>
      strokeMap.has(s.id) ? strokeMap.get(s.id)! : s
    );

    const shapeMap = new Map(shapes.map((sh) => [sh.id, sh]));
    this.page.shapes = this.page.shapes.map((sh) =>
      shapeMap.has(sh.id) ? shapeMap.get(sh.id)! : sh
    );

    if (images.length > 0) {
      const imageMap = new Map(images.map((img) => [img.id, img]));
      this.page.images = this.page.images.map((img) =>
        imageMap.has(img.id) ? imageMap.get(img.id)! : img
      );
    }

    if (texts.length > 0) {
      const textMap = new Map(texts.map((t) => [t.id, t]));
      this.page.texts = this.page.texts.map((t) =>
        textMap.has(t.id) ? textMap.get(t.id)! : t
      );
    }

    this.onMutate();
  }

  execute(): void {
    this.applyState(this.nextStrokes, this.nextShapes, this.nextImages, this.nextTexts);
  }

  undo(): void {
    this.applyState(this.prevStrokes, this.prevShapes, this.prevImages, this.prevTexts);
  }

  redo(): void {
    this.execute();
  }
}

export class DeleteElementsCommand implements HistoryCommand {
  id: string;
  description: string = "Delete elements";
  private page: PageData;
  private deletedStrokes: StrokeObject[];
  private deletedShapes: ShapeObject[];
  private deletedTexts: TextObject[];
  private deletedImages: ImageObject[];
  private onMutate: () => void;

  constructor(
    page: PageData,
    strokes: StrokeObject[],
    shapes: ShapeObject[],
    onMutate: () => void,
    texts: TextObject[] = [],
    images: ImageObject[] = []
  ) {
    this.id = `cmd_del_${Date.now()}`;
    this.page = page;
    this.deletedStrokes = [...strokes];
    this.deletedShapes = [...shapes];
    this.deletedTexts = [...texts];
    this.deletedImages = [...images];
    this.onMutate = onMutate;
  }

  execute(): void {
    const strokeIds = new Set(this.deletedStrokes.map((s) => s.id));
    const shapeIds = new Set(this.deletedShapes.map((sh) => sh.id));
    const textIds = new Set(this.deletedTexts.map((t) => t.id));
    const imageIds = new Set(this.deletedImages.map((img) => img.id));

    this.page.strokes = this.page.strokes.filter((s) => !strokeIds.has(s.id));
    this.page.shapes = this.page.shapes.filter((sh) => !shapeIds.has(sh.id));
    this.page.texts = this.page.texts.filter((t) => !textIds.has(t.id));
    this.page.images = this.page.images.filter((img) => !imageIds.has(img.id));
    this.onMutate();
  }

  undo(): void {
    for (const s of this.deletedStrokes) {
      if (!this.page.strokes.some((existing) => existing.id === s.id)) {
        this.page.strokes.push(s);
      }
    }
    for (const sh of this.deletedShapes) {
      if (!this.page.shapes.some((existing) => existing.id === sh.id)) {
        this.page.shapes.push(sh);
      }
    }
    for (const t of this.deletedTexts) {
      if (!this.page.texts.some((existing) => existing.id === t.id)) {
        this.page.texts.push(t);
      }
    }
    for (const img of this.deletedImages) {
      if (!this.page.images.some((existing) => existing.id === img.id)) {
        this.page.images.push(img);
      }
    }
    this.onMutate();
  }

  redo(): void {
    this.execute();
  }
}

export class AddTextCommand implements HistoryCommand {
  id: string;
  description: string = "Add text";
  private page: PageData;
  private text: TextObject;
  private onMutate: () => void;

  constructor(page: PageData, text: TextObject, onMutate: () => void) {
    this.id = `cmd_add_text_${Date.now()}`;
    this.page = page;
    this.text = { ...text };
    this.onMutate = onMutate;
  }

  execute(): void {
    if (!this.page.texts.some(t => t.id === this.text.id)) {
      this.page.texts.push({ ...this.text });
    }
    this.onMutate();
  }

  undo(): void {
    this.page.texts = this.page.texts.filter(t => t.id !== this.text.id);
    this.onMutate();
  }

  redo(): void {
    this.execute();
  }
}

export class ModifyTextCommand implements HistoryCommand {
  id: string;
  description: string = "Modify text";
  private page: PageData;
  private prevText: TextObject;
  private nextText: TextObject;
  private onMutate: () => void;

  constructor(page: PageData, prevText: TextObject, nextText: TextObject, onMutate: () => void) {
    this.id = `cmd_mod_text_${Date.now()}`;
    this.page = page;
    this.prevText = { ...prevText };
    this.nextText = { ...nextText };
    this.onMutate = onMutate;
  }

  execute(): void {
    this.page.texts = this.page.texts.map(t => (t.id === this.nextText.id ? { ...this.nextText } : t));
    this.onMutate();
  }

  undo(): void {
    this.page.texts = this.page.texts.map(t => (t.id === this.prevText.id ? { ...this.prevText } : t));
    this.onMutate();
  }

  redo(): void {
    this.execute();
  }
}

export class AddImageCommand implements HistoryCommand {
  id: string;
  description: string = "Add image";
  private page: PageData;
  private image: ImageObject;
  private onMutate: () => void;

  constructor(page: PageData, image: ImageObject, onMutate: () => void) {
    this.id = `cmd_add_img_${Date.now()}`;
    this.page = page;
    this.image = { ...image };
    this.onMutate = onMutate;
  }

  execute(): void {
    if (!this.page.images.some(img => img.id === this.image.id)) {
      this.page.images.push({ ...this.image });
    }
    this.onMutate();
  }

  undo(): void {
    this.page.images = this.page.images.filter(img => img.id !== this.image.id);
    this.onMutate();
  }

  redo(): void {
    this.execute();
  }
}

export class ModifyImageCommand implements HistoryCommand {
  id: string;
  description: string = "Modify image";
  private page: PageData;
  private previousImage: ImageObject;
  private nextImage: ImageObject;
  private onMutate: () => void;

  constructor(
    page: PageData,
    previousImage: ImageObject,
    nextImage: ImageObject,
    onMutate: () => void
  ) {
    this.id = `cmd_mod_img_${Date.now()}`;
    this.page = page;
    this.previousImage = { ...previousImage };
    this.nextImage = { ...nextImage };
    this.onMutate = onMutate;
  }

  private applyImage(img: ImageObject): void {
    const idx = this.page.images.findIndex((existing) => existing.id === img.id);
    if (idx !== -1) {
      this.page.images[idx] = { ...img };
    } else {
      this.page.images.push({ ...img });
    }
    this.onMutate();
  }

  execute(): void {
    this.applyImage(this.nextImage);
  }

  undo(): void {
    this.applyImage(this.previousImage);
  }

  redo(): void {
    this.execute();
  }
}

export class AddElementsCommand implements HistoryCommand {
  id: string;
  description: string = "Add elements";
  private page: PageData;
  private addedStrokes: StrokeObject[];
  private addedShapes: ShapeObject[];
  private addedTexts: TextObject[];
  private addedImages: ImageObject[];
  private onMutate: () => void;

  constructor(
    page: PageData,
    strokes: StrokeObject[],
    shapes: ShapeObject[],
    onMutate: () => void,
    texts: TextObject[] = [],
    images: ImageObject[] = []
  ) {
    this.id = `cmd_add_elems_${Date.now()}`;
    this.page = page;
    this.addedStrokes = [...strokes];
    this.addedShapes = [...shapes];
    this.addedTexts = [...texts];
    this.addedImages = [...images];
    this.onMutate = onMutate;
  }

  execute(): void {
    for (const s of this.addedStrokes) {
      if (!this.page.strokes.some((existing) => existing.id === s.id)) {
        this.page.strokes.push(s);
      }
    }
    for (const sh of this.addedShapes) {
      if (!this.page.shapes.some((existing) => existing.id === sh.id)) {
        this.page.shapes.push(sh);
      }
    }
    for (const t of this.addedTexts) {
      if (!this.page.texts.some((existing) => existing.id === t.id)) {
        this.page.texts.push(t);
      }
    }
    for (const img of this.addedImages) {
      if (!this.page.images.some((existing) => existing.id === img.id)) {
        this.page.images.push(img);
      }
    }
    this.onMutate();
  }

  undo(): void {
    const strokeIds = new Set(this.addedStrokes.map((s) => s.id));
    const shapeIds = new Set(this.addedShapes.map((sh) => sh.id));
    const textIds = new Set(this.addedTexts.map((t) => t.id));
    const imageIds = new Set(this.addedImages.map((img) => img.id));
    this.page.strokes = this.page.strokes.filter((s) => !strokeIds.has(s.id));
    this.page.shapes = this.page.shapes.filter((sh) => !shapeIds.has(sh.id));
    this.page.texts = this.page.texts.filter((t) => !textIds.has(t.id));
    this.page.images = this.page.images.filter((img) => !imageIds.has(img.id));
    this.onMutate();
  }

  redo(): void {
    this.execute();
  }
}

export class MoveElementsAcrossPagesCommand implements HistoryCommand {
  id: string;
  description: string = "Move elements across pages";
  private sourcePage: PageData;
  private targetPage: PageData;
  private sourceStrokes: StrokeObject[];
  private targetStrokes: StrokeObject[];
  private sourceShapes: ShapeObject[];
  private targetShapes: ShapeObject[];
  private sourceImages: ImageObject[];
  private targetImages: ImageObject[];
  private sourceTexts: TextObject[];
  private targetTexts: TextObject[];
  private onMutate: (sourcePage: PageData, targetPage: PageData) => void;

  constructor(
    sourcePage: PageData,
    targetPage: PageData,
    sourceStrokes: StrokeObject[],
    targetStrokes: StrokeObject[],
    sourceShapes: ShapeObject[],
    targetShapes: ShapeObject[],
    onMutate: (sourcePage: PageData, targetPage: PageData) => void,
    sourceImages: ImageObject[] = [],
    targetImages: ImageObject[] = [],
    sourceTexts: TextObject[] = [],
    targetTexts: TextObject[] = []
  ) {
    this.id = `cmd_move_across_${Date.now()}`;
    this.sourcePage = sourcePage;
    this.targetPage = targetPage;
    this.sourceStrokes = [...sourceStrokes];
    this.targetStrokes = [...targetStrokes];
    this.sourceShapes = [...sourceShapes];
    this.targetShapes = [...targetShapes];
    this.sourceImages = [...sourceImages];
    this.targetImages = [...targetImages];
    this.sourceTexts = [...sourceTexts];
    this.targetTexts = [...targetTexts];
    this.onMutate = onMutate;
  }

  execute(): void {
    const srcStrokeIds = new Set(this.sourceStrokes.map((s) => s.id));
    const srcShapeIds = new Set(this.sourceShapes.map((sh) => sh.id));
    const srcImageIds = new Set(this.sourceImages.map((img) => img.id));
    const srcTextIds = new Set(this.sourceTexts.map((t) => t.id));
    this.sourcePage.strokes = this.sourcePage.strokes.filter((s) => !srcStrokeIds.has(s.id));
    this.sourcePage.shapes = this.sourcePage.shapes.filter((sh) => !srcShapeIds.has(sh.id));
    this.sourcePage.images = this.sourcePage.images.filter((img) => !srcImageIds.has(img.id));
    this.sourcePage.texts = this.sourcePage.texts.filter((t) => !srcTextIds.has(t.id));

    for (const s of this.targetStrokes) {
      if (!this.targetPage.strokes.some((existing) => existing.id === s.id)) {
        this.targetPage.strokes.push(s);
      }
    }
    for (const sh of this.targetShapes) {
      if (!this.targetPage.shapes.some((existing) => existing.id === sh.id)) {
        this.targetPage.shapes.push(sh);
      }
    }
    for (const img of this.targetImages) {
      if (!this.targetPage.images.some((existing) => existing.id === img.id)) {
        this.targetPage.images.push(img);
      }
    }
    for (const t of this.targetTexts) {
      if (!this.targetPage.texts.some((existing) => existing.id === t.id)) {
        this.targetPage.texts.push(t);
      }
    }
    this.onMutate(this.sourcePage, this.targetPage);
  }

  undo(): void {
    const tgtStrokeIds = new Set(this.targetStrokes.map((s) => s.id));
    const tgtShapeIds = new Set(this.targetShapes.map((sh) => sh.id));
    const tgtImageIds = new Set(this.targetImages.map((img) => img.id));
    const tgtTextIds = new Set(this.targetTexts.map((t) => t.id));
    this.targetPage.strokes = this.targetPage.strokes.filter((s) => !tgtStrokeIds.has(s.id));
    this.targetPage.shapes = this.targetPage.shapes.filter((sh) => !tgtShapeIds.has(sh.id));
    this.targetPage.images = this.targetPage.images.filter((img) => !tgtImageIds.has(img.id));
    this.targetPage.texts = this.targetPage.texts.filter((t) => !tgtTextIds.has(t.id));

    for (const s of this.sourceStrokes) {
      if (!this.sourcePage.strokes.some((existing) => existing.id === s.id)) {
        this.sourcePage.strokes.push(s);
      }
    }
    for (const sh of this.sourceShapes) {
      if (!this.sourcePage.shapes.some((existing) => existing.id === sh.id)) {
        this.sourcePage.shapes.push(sh);
      }
    }
    for (const img of this.sourceImages) {
      if (!this.sourcePage.images.some((existing) => existing.id === img.id)) {
        this.sourcePage.images.push(img);
      }
    }
    for (const t of this.sourceTexts) {
      if (!this.sourcePage.texts.some((existing) => existing.id === t.id)) {
        this.sourcePage.texts.push(t);
      }
    }
    this.onMutate(this.sourcePage, this.targetPage);
  }

  redo(): void {
    this.execute();
  }
}

export class DeletePageCommand implements HistoryCommand {
  id: string;
  description: string = "Delete page";
  private pages: PageData[];
  private deletedPage: PageData;
  private deletedIndex: number;
  private onDeleteSync: (deletedPage: PageData, deletedIndex: number) => void;
  private onRestoreSync: (restoredPage: PageData, restoredIndex: number) => void;

  constructor(
    pages: PageData[],
    deletedPage: PageData,
    deletedIndex: number,
    onDeleteSync: (deletedPage: PageData, deletedIndex: number) => void,
    onRestoreSync: (restoredPage: PageData, restoredIndex: number) => void
  ) {
    this.id = `cmd_del_page_${deletedPage.id}_${Date.now()}`;
    this.pages = pages;
    this.deletedPage = deletedPage;
    this.deletedIndex = deletedIndex;
    this.onDeleteSync = onDeleteSync;
    this.onRestoreSync = onRestoreSync;
  }

  execute(): void {
    const idx = this.pages.findIndex((p) => p.id === this.deletedPage.id);
    if (idx !== -1 && this.pages.length > 1) {
      this.deletedIndex = idx;
      this.pages.splice(idx, 1);
      for (let i = 0; i < this.pages.length; i++) {
        this.pages[i].pageNumber = i + 1;
      }
      this.onDeleteSync(this.deletedPage, this.deletedIndex);
    }
  }

  undo(): void {
    if (!this.pages.some((p) => p.id === this.deletedPage.id)) {
      const insertIdx = Math.max(0, Math.min(this.deletedIndex, this.pages.length));
      this.pages.splice(insertIdx, 0, this.deletedPage);
      for (let i = 0; i < this.pages.length; i++) {
        this.pages[i].pageNumber = i + 1;
      }
      this.onRestoreSync(this.deletedPage, insertIdx);
    }
  }

  redo(): void {
    this.execute();
  }
}

export class ResizePageCommand implements HistoryCommand {
  id: string;
  description: string = "Resize page";
  private page: PageData;
  private prevDimensions: PageDimensions;
  private newDimensions: PageDimensions;
  private prevOrientation?: PageOrientation;
  private newOrientation?: PageOrientation;
  private onMutate: (page: PageData) => void;

  constructor(
    page: PageData,
    prevDimensions: PageDimensions,
    newDimensions: PageDimensions,
    onMutate: (page: PageData) => void,
    prevOrientation?: PageOrientation,
    newOrientation?: PageOrientation
  ) {
    this.id = `cmd_resize_${page.id}_${Date.now()}`;
    this.page = page;
    this.prevDimensions = { ...prevDimensions };
    this.newDimensions = { ...newDimensions };
    this.prevOrientation = prevOrientation;
    this.newOrientation = newOrientation;
    this.onMutate = onMutate;
  }

  execute(): void {
    this.page.dimensions = { ...this.newDimensions };
    if (this.newOrientation) {
      this.page.orientation = this.newOrientation;
    }
    this.onMutate(this.page);
  }

  undo(): void {
    this.page.dimensions = { ...this.prevDimensions };
    if (this.prevOrientation) {
      this.page.orientation = this.prevOrientation;
    }
    this.onMutate(this.page);
  }

  redo(): void {
    this.execute();
  }
}

export class HistoryManager {
  private undoStack: HistoryCommand[] = [];
  private redoStack: HistoryCommand[] = [];
  private maxStackSize: number = 80;
  private onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;

  constructor(
    maxStackSize: number = 80,
    onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void
  ) {
    this.maxStackSize = maxStackSize;
    this.onHistoryChange = onHistoryChange;
  }

  setOnHistoryChange(cb: (canUndo: boolean, canRedo: boolean) => void): void {
    this.onHistoryChange = cb;
  }

  execute(command: HistoryCommand): void {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = [];

    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift();
    }

    this.notifyChange();
  }

  undo(): boolean {
    if (this.undoStack.length === 0) {
      return false;
    }

    const command = this.undoStack.pop()!;
    command.undo();
    this.redoStack.push(command);
    this.notifyChange();
    return true;
  }

  redo(): boolean {
    if (this.redoStack.length === 0) {
      return false;
    }

    const command = this.redoStack.pop()!;
    command.redo();
    this.undoStack.push(command);
    this.notifyChange();
    return true;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notifyChange();
  }

  private notifyChange(): void {
    if (this.onHistoryChange) {
      this.onHistoryChange(this.canUndo(), this.canRedo());
    }
  }
}
