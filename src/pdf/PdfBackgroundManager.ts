import { App, TFile, loadPdfJs } from "obsidian";
import { normalizeVaultPath } from "../storage/StorageManager";
import { CURRENT_SCHEMA_VERSION, NotebookDocument, PageData, PageDimensions, PageOrientation } from "../types";

export interface PdfInfo {
  pageCount: number;
  dimensions?: PageDimensions;
}

export interface PdfJsViewport {
  width: number;
  height: number;
}

export interface PdfJsRenderContext {
  canvasContext: CanvasRenderingContext2D;
  viewport: PdfJsViewport;
  background?: string;
}

export interface PdfJsRenderTask {
  promise: Promise<void>;
}

export interface PdfJsPage {
  getViewport(options: { scale: number }): PdfJsViewport;
  render(context: PdfJsRenderContext): PdfJsRenderTask;
  cleanup?(): void;
}

export interface PdfJsDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfJsPage>;
  destroy?(): Promise<void>;
}

export interface PdfJsLib {
  getDocument(src: string | { data: Uint8Array }): { promise: Promise<PdfJsDocument> };
}

declare global {
  interface Window {
    pdfjsLib?: PdfJsLib;
  }
}

export function extractPdfInfo(buffer: ArrayBuffer): PdfInfo {
  const bytes = new Uint8Array(buffer);
  const maxScanLength = Math.min(bytes.length, 1000000);
  let text = "";
  for (let i = 0; i < maxScanLength; i++) {
    text += String.fromCharCode(bytes[i]);
  }

  let pageCount = 1;
  const countMatches = text.match(/\/Count\s+(\d+)/g);
  if (countMatches) {
    for (const match of countMatches) {
      const num = parseInt(match.replace(/\/Count\s+/, ""), 10);
      if (num > pageCount) {
        pageCount = num;
      }
    }
  }

  if (pageCount === 1) {
    const pageMatches = text.match(/\/Type\s*\/Page\b/g);
    if (pageMatches && pageMatches.length > 0) {
      pageCount = pageMatches.length;
    }
  }

  let dimensions: PageDimensions | undefined = undefined;
  const mediaBoxMatch = text.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  if (mediaBoxMatch) {
    const w = parseFloat(mediaBoxMatch[1]);
    const h = parseFloat(mediaBoxMatch[2]);
    if (w > 0 && h > 0) {
      dimensions = { width: w, height: h, unit: "pt" };
    }
  }

  return { pageCount, dimensions };
}

export function extractSvgDimensions(svgContent: string): { width: number; height: number } {
  const viewBoxMatch = svgContent.match(/viewBox=["']([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)["']/i);
  if (viewBoxMatch) {
    const w = parseFloat(viewBoxMatch[3]);
    const h = parseFloat(viewBoxMatch[4]);
    if (w > 0 && h > 0) {
      return { width: w, height: h };
    }
  }
  const widthMatch = svgContent.match(/width=["']([0-9.]+)px?["']/i);
  const heightMatch = svgContent.match(/height=["']([0-9.]+)px?["']/i);
  if (widthMatch && heightMatch) {
    const w = parseFloat(widthMatch[1]);
    const h = parseFloat(heightMatch[1]);
    if (w > 0 && h > 0) {
      return { width: w, height: h };
    }
  }
  return { width: 595.28, height: 841.89 };
}

export function sortSvgFilesByPageNumber<T extends { name: string }>(files: T[]): T[] {
  const extractNum = (name: string): number => {
    const match = name.match(/_p(\d+)\.svg$/i) || name.match(/page[_-]?(\d+)\.svg$/i) || name.match(/(\d+)\.svg$/i);
    return match ? parseInt(match[1], 10) : 0;
  };
  return [...files].sort((a, b) => {
    const numA = extractNum(a.name);
    const numB = extractNum(b.name);
    if (numA !== numB && numA > 0 && numB > 0) {
      return numA - numB;
    }
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });
}

export class PdfBackgroundManager {
  private app: App;
  private docCache: Map<string, PdfJsDocument> = new Map();
  private pdfJsLib: PdfJsLib | null = null;
  private renderQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;

  constructor(app: App) {
    this.app = app;
  }

  private async getPdfJsLib(): Promise<PdfJsLib | null> {
    if (this.pdfJsLib) {
      return this.pdfJsLib;
    }
    if (typeof window !== "undefined" && window.pdfjsLib) {
      this.pdfJsLib = window.pdfjsLib;
      return this.pdfJsLib;
    }
    try {
      const lib = (await loadPdfJs()) as unknown as PdfJsLib;
      if (lib && typeof lib.getDocument === "function") {
        this.pdfJsLib = lib;
        return this.pdfJsLib;
      }
    } catch (err) {
      void err;
    }
    if (typeof window !== "undefined" && window.pdfjsLib) {
      this.pdfJsLib = window.pdfjsLib;
      return this.pdfJsLib;
    }
    return null;
  }

  private enqueueRender(task: () => Promise<void>): Promise<void> {
    return new Promise((resolve) => {
      this.renderQueue.push(async () => {
        try {
          await task();
        } finally {
          resolve();
        }
      });
      void this.processRenderQueue();
    });
  }

  private async processRenderQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      return;
    }
    this.isProcessingQueue = true;
    while (this.renderQueue.length > 0) {
      const task = this.renderQueue.shift();
      if (task) {
        try {
          await task();
        } catch (err) {
          void err;
        }
      }
    }
    this.isProcessingQueue = false;
  }

  async getPdfDocument(pdfPath: string): Promise<PdfJsDocument | null> {
    if (this.docCache.has(pdfPath)) {
      return this.docCache.get(pdfPath) || null;
    }
    const file = this.app.vault.getAbstractFileByPath(pdfPath);
    if (!(file instanceof TFile)) {
      return null;
    }
    const pdfjs = await this.getPdfJsLib();
    if (!pdfjs) {
      return null;
    }
    try {
      const buffer = await this.app.vault.readBinary(file);
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
      const doc = await loadingTask.promise;
      this.docCache.set(pdfPath, doc);
      return doc;
    } catch (err) {
      void err;
      return null;
    }
  }

  async convertPageToSvg(pdfDoc: PdfJsDocument, pageNumber: number, width: number, height: number): Promise<string> {
    const pdfPage = await pdfDoc.getPage(pageNumber);
    const viewport = pdfPage.getViewport({ scale: 1 });
    let svgString = "";

    const pdfjs = await this.getPdfJsLib();
    const SVGGraphicsClass = pdfjs ? (pdfjs as unknown as { SVGGraphics?: new (commonObjs: unknown, objs: unknown) => { getSVG: (opList: unknown, viewport: unknown) => Promise<SVGElement> } }).SVGGraphics : null;
    if (SVGGraphicsClass && typeof (pdfPage as unknown as { getOperatorList?: () => Promise<unknown> }).getOperatorList === "function") {
      try {
        const opList = await (pdfPage as unknown as { getOperatorList: () => Promise<unknown> }).getOperatorList();
        const svgGfx = new SVGGraphicsClass((pdfPage as unknown as { commonObjs: unknown }).commonObjs, (pdfPage as unknown as { objs: unknown }).objs);
        const svgElement = await svgGfx.getSVG(opList, viewport);
        svgString = new XMLSerializer().serializeToString(svgElement);
      } catch (err) {
        void err;
      }
    }

    if (!svgString && typeof document !== "undefined") {
      const scale = 2.0;
      const canvas = createEl("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const renderViewport = pdfPage.getViewport({ scale });
        await pdfPage.render({ canvasContext: ctx, viewport: renderViewport }).promise;
        const dataUrl = canvas.toDataURL("image/webp", 0.9);
        svgString = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#ffffff"/><image width="${width}" height="${height}" href="${dataUrl}"/></svg>`;
      }
    }

    if (typeof pdfPage.cleanup === "function") {
      pdfPage.cleanup();
    }

    return svgString;
  }

  async savePageSvg(
    pdfFile: TFile,
    pageIndex: number,
    svgString: string,
    destinationFolder?: string
  ): Promise<string> {
    const parentFolder = destinationFolder !== undefined
      ? destinationFolder
      : (pdfFile.parent ? pdfFile.parent.path : "");
    const baseName = pdfFile.basename;
    const svgFolderName = `${baseName}_svg`;
    const targetFolder = parentFolder ? `${parentFolder}/${svgFolderName}` : svgFolderName;
    const svgFileName = `${baseName}_p${pageIndex + 1}.svg`;
    const targetSvgPath = normalizeVaultPath(`${targetFolder}/${svgFileName}`);

    const lastSlash = targetSvgPath.lastIndexOf("/");
    if (lastSlash !== -1) {
      const dirPath = targetSvgPath.substring(0, lastSlash);
      const adapter = this.app.vault.adapter;
      if (adapter) {
        const segments = dirPath.split("/").filter(Boolean);
        let currPath = "";
        for (const seg of segments) {
          currPath = currPath ? `${currPath}/${seg}` : seg;
          if (!(await adapter.exists(currPath))) {
            if (adapter.mkdir) {
              await adapter.mkdir(currPath);
            }
          }
        }
      }
    }

    const existingFile = this.app.vault.getAbstractFileByPath(targetSvgPath);
    if (existingFile instanceof TFile) {
      await this.app.vault.modify(existingFile, svgString);
      return existingFile.path;
    }

    const created = await this.app.vault.create(targetSvgPath, svgString);
    return created.path;
  }

  async extractPagesFromPdf(pdfFile: TFile, destinationFolder?: string): Promise<PageData[]> {
    const pdfDoc = await this.getPdfDocument(pdfFile.path);
    if (pdfDoc && pdfDoc.numPages > 0) {
      const pages: PageData[] = [];
      let defaultWidth = 595.28;
      let defaultHeight = 841.89;
      let defaultOrientation: PageOrientation = "portrait";

      for (let i = 0; i < pdfDoc.numPages; i++) {
        let pageWidth = defaultWidth;
        let pageHeight = defaultHeight;
        let pageOrientation: PageOrientation = defaultOrientation;

        try {
          const pdfPage = await pdfDoc.getPage(i + 1);
          const viewport = pdfPage.getViewport({ scale: 1 });
          pageWidth = viewport.width;
          pageHeight = viewport.height;
          pageOrientation = pageWidth > pageHeight ? "landscape" : "portrait";
          if (i === 0) {
            defaultWidth = pageWidth;
            defaultHeight = pageHeight;
            defaultOrientation = pageOrientation;
          }
          if (typeof pdfPage.cleanup === "function") {
            pdfPage.cleanup();
          }
        } catch (err) {
          void err;
        }

        let svgPath: string | undefined = undefined;
        try {
          const svgContent = await this.convertPageToSvg(pdfDoc, i + 1, pageWidth, pageHeight);
          if (svgContent) {
            svgPath = await this.savePageSvg(pdfFile, i, svgContent, destinationFolder);
          }
        } catch (err) {
          void err;
        }

        pages.push({
          id: `pdf_page_${i + 1}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          pageNumber: i + 1,
          dimensions: {
            width: pageWidth,
            height: pageHeight,
            unit: "pt"
          },
          orientation: pageOrientation,
          template: {
            type: "blank",
            backgroundColor: "#ffffff",
            lineColor: "#e2e8f0",
            spacing: 24,
            opacity: 1
          },
          pdfSource: {
            pdfPath: pdfFile.path,
            pageIndex: i,
            svgPath
          },
          strokes: [],
          shapes: [],
          texts: [],
          images: []
        });
      }

      if (typeof pdfDoc.destroy === "function") {
        try {
          void pdfDoc.destroy();
        } catch (err) {
          void err;
        }
      }
      this.docCache.delete(pdfFile.path);

      return pages;
    }

    const buffer = await this.app.vault.readBinary(pdfFile);
    const info = extractPdfInfo(buffer);

    const baseWidth = info.dimensions ? info.dimensions.width : 595.28;
    const baseHeight = info.dimensions ? info.dimensions.height : 841.89;
    const orientation: PageOrientation = baseWidth > baseHeight ? "landscape" : "portrait";

    const pages: PageData[] = [];
    for (let i = 0; i < info.pageCount; i++) {
      pages.push({
        id: `pdf_page_${i + 1}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        pageNumber: i + 1,
        dimensions: {
          width: baseWidth,
          height: baseHeight,
          unit: "pt"
        },
        orientation,
        template: {
          type: "blank",
          backgroundColor: "#ffffff",
          lineColor: "#e2e8f0",
          spacing: 24,
          opacity: 1
        },
        pdfSource: {
          pdfPath: pdfFile.path,
          pageIndex: i
        },
        strokes: [],
        shapes: [],
        texts: [],
        images: []
      });
    }

    return pages;
  }

  async extractPagesFromSvgFiles(
    svgFiles: TFile[],
    associatedPdfPath: string = ""
  ): Promise<PageData[]> {
    const pages: PageData[] = [];
    for (let i = 0; i < svgFiles.length; i++) {
      const file = svgFiles[i];
      let width = 595.28;
      let height = 841.89;
      try {
        const content = await this.app.vault.read(file);
        const dims = extractSvgDimensions(content);
        width = dims.width;
        height = dims.height;
      } catch (err) {
        void err;
      }

      const orientation: PageOrientation = width > height ? "landscape" : "portrait";
      pages.push({
        id: `svg_page_${i + 1}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        pageNumber: i + 1,
        dimensions: {
          width,
          height,
          unit: "pt"
        },
        orientation,
        template: {
          type: "blank",
          backgroundColor: "#ffffff",
          lineColor: "#e2e8f0",
          spacing: 24,
          opacity: 1
        },
        pdfSource: {
          pdfPath: associatedPdfPath,
          pageIndex: i,
          svgPath: file.path
        },
        strokes: [],
        shapes: [],
        texts: [],
        images: []
      });
    }
    return pages;
  }

  async createNotebookFromPdf(pdfFile: TFile, destinationFolder?: string): Promise<NotebookDocument> {
    const pages = await this.extractPagesFromPdf(pdfFile, destinationFolder);
    const defaultOrientation = pages.length > 0 ? pages[0].orientation : "portrait";
    const now = Date.now();
    return {
      metadata: {
        title: pdfFile.basename,
        createdAt: now,
        updatedAt: now,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        defaultPageSize: "Custom",
        defaultOrientation
      },
      pages
    };
  }

  async renderPdfBackground(
    page: PageData,
    pageEl: HTMLElement,
    onRenderComplete?: () => void
  ): Promise<void> {
    if (!page.pdfSource) {
      const existing = pageEl.querySelector(".notepages-pdf-background-layer");
      if (existing && existing.parentElement) {
        existing.parentElement.removeChild(existing);
      }
      return;
    }

    let layer = pageEl.querySelector<HTMLElement>(".notepages-pdf-background-layer");
    if (!layer) {
      layer = pageEl.createDiv({ cls: "notepages-pdf-background-layer" });
      const firstChild = pageEl.firstChild;
      if (firstChild && firstChild !== layer) {
        pageEl.insertBefore(layer, firstChild);
      }
    }

    let canvas = layer.querySelector<HTMLCanvasElement>("canvas.notepages-pdf-canvas");
    if (!canvas) {
      layer.empty();
      canvas = layer.createEl("canvas", { cls: "notepages-pdf-canvas" });
    }

    const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;
    const renderScale = Math.min(1.75, Math.max(1.25, dpr));
    const targetWidth = Math.round(page.dimensions.width * renderScale);
    const targetHeight = Math.round(page.dimensions.height * renderScale);

    if (canvas.width === targetWidth && canvas.height === targetHeight && canvas.dataset.rendered === "true") {
      return;
    }

    await this.enqueueRender(async () => {
      if (!canvas || !layer || !page.pdfSource) {
        return;
      }

      const pdfDoc = await this.getPdfDocument(page.pdfSource.pdfPath);
      if (!pdfDoc) {
        layer.empty();
        layer.createDiv({
          cls: "notepages-pdf-missing-notice",
          text: `PDF source not found: ${page.pdfSource.pdfPath}`
        });
        return;
      }

      canvas.width = targetWidth;
      canvas.height = targetHeight;

      try {
        const pdfPage = await pdfDoc.getPage(page.pdfSource.pageIndex + 1);
        const unscaledViewport = pdfPage.getViewport({ scale: 1 });
        const scaleX = targetWidth / unscaledViewport.width;
        const scaleY = targetHeight / unscaledViewport.height;
        const viewport = pdfPage.getViewport({ scale: Math.min(scaleX, scaleY) });

        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, targetWidth, targetHeight);
          await pdfPage.render({
            canvasContext: ctx,
            viewport
          }).promise;
          canvas.dataset.rendered = "true";
          if (typeof pdfPage.cleanup === "function") {
            pdfPage.cleanup();
          }
          if (onRenderComplete) {
            onRenderComplete();
          }
        }
      } catch (err) {
        void err;
      }
    });
  }

  unrenderPdfBackground(page: PageData, pageEl: HTMLElement): void {
    if (!page.pdfSource) {
      return;
    }
    const canvas = pageEl.querySelector<HTMLCanvasElement>("canvas.notepages-pdf-canvas");
    if (canvas && canvas.dataset.rendered === "true") {
      canvas.width = 1;
      canvas.height = 1;
      canvas.dataset.rendered = "false";
    }
  }

  async renderPdfToCanvas(
    pdfPath: string,
    pageIndex: number,
    targetCanvas: HTMLCanvasElement,
    width: number,
    height: number
  ): Promise<boolean> {
    const pdfDoc = await this.getPdfDocument(pdfPath);
    if (!pdfDoc) {
      return false;
    }
    let success = false;
    await this.enqueueRender(async () => {
      try {
        const pdfPage = await pdfDoc.getPage(pageIndex + 1);
        const unscaledViewport = pdfPage.getViewport({ scale: 1 });
        const scaleX = width / unscaledViewport.width;
        const scaleY = height / unscaledViewport.height;
        const viewport = pdfPage.getViewport({ scale: Math.min(scaleX, scaleY) });

        const ctx = targetCanvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          await pdfPage.render({
            canvasContext: ctx,
            viewport
          }).promise;
          if (typeof pdfPage.cleanup === "function") {
            pdfPage.cleanup();
          }
          success = true;
        }
      } catch (err) {
        void err;
      }
    });
    return success;
  }

  destroy(): void {
    this.renderQueue = [];
    this.isProcessingQueue = false;
    for (const doc of this.docCache.values()) {
      if (doc && typeof doc.destroy === "function") {
        try {
          void doc.destroy();
        } catch (err) {
          void err;
        }
      }
    }
    this.docCache.clear();
  }
}
