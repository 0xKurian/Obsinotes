import { PDFDocument } from "pdf-lib";
import { NotebookDocument, PageData } from "../types";
import { ExportOptions } from "./ExportTypes";
import { PngExporter, PngExportOptions } from "./PngExporter";

export interface PdfExportDependencies {
  renderPageToPng?: (page: PageData, options: PngExportOptions) => Promise<Uint8Array>;
  readBinary?: (path: string) => Promise<ArrayBuffer | null>;
  resourceResolver?: (vaultPath: string) => string;
}

export class PdfExporter {
  static async exportNotebookToPdf(
    doc: NotebookDocument,
    pageNumbers: number[],
    options: ExportOptions,
    dependencies: PdfExportDependencies = {}
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const renderPng = dependencies.renderPageToPng ?? PngExporter.exportPageToUint8Array.bind(PngExporter);
    const pdfCache = new Map<string, PDFDocument>();

    for (const pageNum of pageNumbers) {
      const page = doc.pages.find(p => p.pageNumber === pageNum);
      if (!page) {
        continue;
      }

      let targetPage = null;
      let isCopiedPdf = false;

      if (options.includePdfBackground && page.pdfSource?.pdfPath && dependencies.readBinary) {
        try {
          let sourcePdf = pdfCache.get(page.pdfSource.pdfPath);
          if (!sourcePdf) {
            const bytes = await dependencies.readBinary(page.pdfSource.pdfPath);
            if (bytes) {
              sourcePdf = await PDFDocument.load(bytes);
              pdfCache.set(page.pdfSource.pdfPath, sourcePdf);
            }
          }

          if (sourcePdf && page.pdfSource.pageIndex >= 0 && page.pdfSource.pageIndex < sourcePdf.getPageCount()) {
            const [copied] = await pdfDoc.copyPages(sourcePdf, [page.pdfSource.pageIndex]);
            targetPage = pdfDoc.addPage(copied);
            isCopiedPdf = true;
          }
        } catch {
          targetPage = null;
        }
      }

      if (!targetPage) {
        targetPage = pdfDoc.addPage([page.dimensions.width, page.dimensions.height]);
      }

      const hasContent =
        (page.strokes && page.strokes.length > 0) ||
        (page.shapes && page.shapes.length > 0) ||
        (page.texts && page.texts.length > 0) ||
        (page.images && page.images.length > 0) ||
        (!isCopiedPdf && options.includeBackgroundTemplate);

      if (hasContent || !isCopiedPdf) {
        try {
          const pngBytes = await renderPng(page, {
            scale: options.resolution,
            includeTemplate: isCopiedPdf ? false : options.includeBackgroundTemplate,
            includePdfBackground: !isCopiedPdf && options.includePdfBackground,
            transparentBackground: isCopiedPdf,
            resourceResolver: dependencies.resourceResolver
          });

          if (pngBytes && pngBytes.length > 0) {
            const embeddedPng = await pdfDoc.embedPng(pngBytes);
            targetPage.drawImage(embeddedPng, {
              x: 0,
              y: 0,
              width: page.dimensions.width,
              height: page.dimensions.height
            });
          }
        } catch (err) {
          void err;
        }
      }
    }

    if (pdfDoc.getPageCount() === 0) {
      pdfDoc.addPage([595.28, 841.89]);
    }

    return await pdfDoc.save();
  }
}
