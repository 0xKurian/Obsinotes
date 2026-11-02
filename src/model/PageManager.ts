import {
  NotebookDocument,
  PageData,
  PaperTemplateConfig,
  PageOrientation,
  PageDimensions,
  getEffectivePageDimensions,
  StrokeObject,
  ShapeObject,
  TextObject,
  ImageObject
} from "../types";

export interface CreatePageOptions {
  template?: PaperTemplateConfig;
  orientation?: PageOrientation;
  dimensions?: PageDimensions;
}

export class PageManager {
  private document: NotebookDocument;

  constructor(document: NotebookDocument) {
    this.document = document;
  }

  getDocument(): NotebookDocument {
    return this.document;
  }

  getPages(): PageData[] {
    return this.document.pages;
  }

  getPageCount(): number {
    return this.document.pages.length;
  }

  getPage(pageId: string): PageData | undefined {
    return this.document.pages.find((p) => p.id === pageId);
  }

  getPageByIndex(index: number): PageData | undefined {
    return this.document.pages[index];
  }

  getPageByNumber(pageNumber: number): PageData | undefined {
    return this.document.pages.find((p) => p.pageNumber === pageNumber);
  }

  getPageIndex(pageId: string): number {
    return this.document.pages.findIndex((p) => p.id === pageId);
  }

  addPage(options?: CreatePageOptions): PageData {
    return this.insertPage(this.document.pages.length, options);
  }

  insertPage(targetIndex: number, options?: CreatePageOptions): PageData {
    const orientation = options?.orientation ?? this.document.metadata.defaultOrientation;
    const dimensions = options?.dimensions ?? getEffectivePageDimensions(
      this.document.metadata.defaultPageSize,
      orientation
    );

    const template: PaperTemplateConfig = options?.template ?? {
      type: "ruled",
      backgroundColor: "#ffffff",
      lineColor: "#e2e8f0",
      spacing: 24,
      opacity: 0.8
    };

    const newPage: PageData = {
      id: this.generateStableId("page"),
      pageNumber: targetIndex + 1,
      dimensions,
      orientation,
      template,
      strokes: [],
      shapes: [],
      texts: [],
      images: []
    };

    const boundedIndex = Math.max(0, Math.min(targetIndex, this.document.pages.length));
    this.document.pages.splice(boundedIndex, 0, newPage);
    this.renumberPages();
    return newPage;
  }

  insertPages(targetIndex: number, pagesToInsert: PageData[], replaceCount: number = 0): void {
    if (pagesToInsert.length === 0) {
      return;
    }
    const boundedIndex = Math.max(0, Math.min(targetIndex, this.document.pages.length));
    this.document.pages.splice(boundedIndex, replaceCount, ...pagesToInsert);
    this.renumberPages();
  }

  duplicatePage(pageId: string): PageData | null {
    const sourceIndex = this.getPageIndex(pageId);
    if (sourceIndex === -1) {
      return null;
    }

    const source = this.document.pages[sourceIndex];
    const duplicatedStrokes: StrokeObject[] = source.strokes.map((stroke) => ({
      ...stroke,
      id: this.generateStableId("stroke"),
      points: stroke.points.map((pt) => ({ ...pt })),
      bounds: { ...stroke.bounds }
    }));

    const duplicatedShapes: ShapeObject[] = source.shapes.map((shape) => ({
      ...shape,
      id: this.generateStableId("shape"),
      bounds: { ...shape.bounds },
      geometryData: { ...shape.geometryData }
    }));

    const duplicatedTexts: TextObject[] = source.texts.map((text) => ({
      ...text,
      id: this.generateStableId("text")
    }));

    const duplicatedImages: ImageObject[] = source.images.map((img) => ({
      ...img,
      id: this.generateStableId("img")
    }));

    const duplicatedPage: PageData = {
      id: this.generateStableId("page"),
      pageNumber: sourceIndex + 2,
      dimensions: { ...source.dimensions },
      orientation: source.orientation,
      template: {
        ...source.template,
        cornell: source.template.cornell ? { ...source.template.cornell } : undefined
      },
      pdfSource: source.pdfSource ? { ...source.pdfSource } : undefined,
      strokes: duplicatedStrokes,
      shapes: duplicatedShapes,
      texts: duplicatedTexts,
      images: duplicatedImages
    };

    this.document.pages.splice(sourceIndex + 1, 0, duplicatedPage);
    this.renumberPages();
    return duplicatedPage;
  }

  deletePage(pageId: string): boolean {
    if (this.document.pages.length <= 1) {
      return false;
    }

    const index = this.getPageIndex(pageId);
    if (index === -1) {
      return false;
    }

    this.document.pages.splice(index, 1);
    this.renumberPages();
    return true;
  }

  reorderPages(sourceIndex: number, destinationIndex: number): boolean {
    const total = this.document.pages.length;
    if (
      sourceIndex < 0 ||
      sourceIndex >= total ||
      destinationIndex < 0 ||
      destinationIndex >= total ||
      sourceIndex === destinationIndex
    ) {
      return false;
    }

    const [movedPage] = this.document.pages.splice(sourceIndex, 1);
    this.document.pages.splice(destinationIndex, 0, movedPage);
    this.renumberPages();
    return true;
  }

  updatePageTemplate(pageId: string, template: PaperTemplateConfig): boolean {
    const page = this.getPage(pageId);
    if (!page) {
      return false;
    }
    page.template = {
      ...template,
      cornell: template.cornell ? { ...template.cornell } : undefined
    };
    this.document.metadata.updatedAt = Date.now();
    return true;
  }

  getNotebookTemplate(): PaperTemplateConfig {
    if (this.document.pages.length > 0) {
      return { ...this.document.pages[0].template };
    }
    return {
      type: this.document.metadata.defaultTemplate ?? "ruled",
      backgroundColor: this.document.metadata.defaultPaperBackground ?? "#ffffff",
      lineColor: this.document.metadata.defaultLineColor ?? "#e2e8f0",
      spacing: this.document.metadata.defaultLineSpacing ?? 24,
      opacity: 0.8
    };
  }

  getNotebookOrientation(): PageOrientation {
    if (this.document.pages.length > 0) {
      return this.document.pages[0].orientation;
    }
    return this.document.metadata.defaultOrientation;
  }

  updateAllPagesTemplate(template: PaperTemplateConfig): void {
    for (const page of this.document.pages) {
      page.template = {
        ...template,
        cornell: template.cornell ? { ...template.cornell } : undefined
      };
    }
    this.document.metadata.defaultTemplate = template.type;
    this.document.metadata.defaultPaperBackground = template.backgroundColor;
    this.document.metadata.defaultLineColor = template.lineColor;
    this.document.metadata.defaultLineSpacing = template.spacing;
    this.document.metadata.updatedAt = Date.now();
  }

  updateAllPagesOrientation(orientation: PageOrientation): void {
    for (const page of this.document.pages) {
      if (page.orientation !== orientation) {
        const currentW = page.dimensions.width;
        const currentH = page.dimensions.height;
        page.orientation = orientation;
        page.dimensions = {
          width: orientation === "landscape" ? Math.max(currentW, currentH) : Math.min(currentW, currentH),
          height: orientation === "landscape" ? Math.min(currentW, currentH) : Math.max(currentW, currentH),
          unit: "pt"
        };
      }
    }
    this.document.metadata.defaultOrientation = orientation;
    this.document.metadata.updatedAt = Date.now();
  }

  updatePageOrientation(pageId: string, orientation: PageOrientation): boolean {
    const page = this.getPage(pageId);
    if (!page) {
      return false;
    }
    if (page.orientation === orientation) {
      return true;
    }

    const currentW = page.dimensions.width;
    const currentH = page.dimensions.height;

    page.orientation = orientation;
    page.dimensions = {
      width: orientation === "landscape" ? Math.max(currentW, currentH) : Math.min(currentW, currentH),
      height: orientation === "landscape" ? Math.min(currentW, currentH) : Math.max(currentW, currentH),
      unit: "pt"
    };

    this.document.metadata.updatedAt = Date.now();
    return true;
  }

  private renumberPages(): void {
    for (let i = 0; i < this.document.pages.length; i++) {
      this.document.pages[i].pageNumber = i + 1;
    }
    this.document.metadata.updatedAt = Date.now();
  }

  private generateStableId(prefix: string): string {
    const randPart = Math.random().toString(36).substring(2, 10);
    const timePart = Date.now().toString(36).substring(4);
    return `${prefix}_${randPart}${timePart}`;
  }
}
