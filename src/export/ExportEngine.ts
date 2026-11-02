import { App, Notice, TFile } from "obsidian";
import { NotebookDocument } from "../types";
import { ExportOptions, parsePageRange } from "./ExportTypes";
import { PdfExporter } from "./PdfExporter";
import { PngExporter } from "./PngExporter";
import { exportPageToSvg } from "./SvgExporter";

export interface ExportResult {
  success: boolean;
  format: string;
  destination: string;
  exportedPaths: string[];
  error?: string;
}

function isTFile(file: unknown): file is TFile {
  return file instanceof TFile;
}

function notify(message: string): void {
  new Notice(message);
}

export function toArrayBuffer(uint8Array: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(uint8Array.byteLength);
  new Uint8Array(buf).set(uint8Array);
  return buf;
}

export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === "undefined") {
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = createEl("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export class ExportEngine {
  static async exportNotebook(
    app: App,
    doc: NotebookDocument,
    options: ExportOptions,
    sourceFile?: TFile | null,
    currentPageNumber: number = 1
  ): Promise<ExportResult> {
    const pageNumbers = parsePageRange(
      options.pageRange,
      options.customPageRange,
      doc.pages.length,
      currentPageNumber
    );

    if (pageNumbers.length === 0) {
      return {
        success: false,
        format: options.format,
        destination: options.destination,
        exportedPaths: [],
        error: "No pages selected for export"
      };
    }

    const baseName = sourceFile?.basename || doc.metadata.title || "notebook";
    const parentFolder = sourceFile?.parent?.path ?? "";
    const folderPrefix = parentFolder && parentFolder !== "/" ? `${parentFolder}/` : "";

    const resourceResolver = (vaultPath: string): string => {
      const file = app.vault.getAbstractFileByPath(vaultPath);
      if (isTFile(file)) {
        return app.vault.getResourcePath(file);
      }
      return vaultPath;
    };

    const exportedPaths: string[] = [];

    try {
      if (options.format === "pdf") {
        const readBinary = async (path: string): Promise<ArrayBuffer | null> => {
          const file = app.vault.getAbstractFileByPath(path);
          if (isTFile(file)) {
            return await app.vault.readBinary(file);
          }
          return null;
        };

        const pdfBytes = await PdfExporter.exportNotebookToPdf(
          doc,
          pageNumbers,
          options,
          {
            readBinary,
            resourceResolver
          }
        );

        const fileName = `${baseName}.pdf`;
        const pdfArrayBuffer = toArrayBuffer(pdfBytes);
        if (options.destination === "download") {
          const blob = new Blob([pdfArrayBuffer], { type: "application/pdf" });
          downloadBlob(blob, fileName);
          exportedPaths.push(fileName);
        } else {
          const fullPath = this.getAvailablePath(app, `${folderPrefix}${baseName}`, "pdf");
          await app.vault.createBinary(fullPath, pdfArrayBuffer);
          exportedPaths.push(fullPath);
        }
      } else if (options.format === "png") {
        for (const pageNum of pageNumbers) {
          const page = doc.pages.find((p) => p.pageNumber === pageNum);
          if (!page) {
            continue;
          }

          const pngBlob = await PngExporter.exportPageToBlob(page, {
            scale: options.resolution,
            includeTemplate: options.includeBackgroundTemplate,
            includePdfBackground: options.includePdfBackground,
            resourceResolver
          });

          const pageSuffix =
            pageNumbers.length === 1 && options.pageRange === "current"
              ? `_page_${pageNum}`
              : pageNumbers.length > 1
                ? `_page_${pageNum}`
                : "";
          const fileName = `${baseName}${pageSuffix}.png`;

          if (options.destination === "download") {
            downloadBlob(pngBlob, fileName);
            exportedPaths.push(fileName);
          } else {
            const fullPath = this.getAvailablePath(app, `${folderPrefix}${baseName}${pageSuffix}`, "png");
            const buffer = await pngBlob.arrayBuffer();
            await app.vault.createBinary(fullPath, buffer);
            exportedPaths.push(fullPath);
          }
        }
      } else if (options.format === "svg") {
        for (const pageNum of pageNumbers) {
          const page = doc.pages.find((p) => p.pageNumber === pageNum);
          if (!page) {
            continue;
          }

          const svgContent = exportPageToSvg(page, {
            includeTemplate: options.includeBackgroundTemplate,
            includePdfBackground: options.includePdfBackground,
            resourceResolver
          });

          const pageSuffix =
            pageNumbers.length === 1 && options.pageRange === "current"
              ? `_page_${pageNum}`
              : pageNumbers.length > 1
                ? `_page_${pageNum}`
                : "";
          const fileName = `${baseName}${pageSuffix}.svg`;

          if (options.destination === "download") {
            const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
            downloadBlob(blob, fileName);
            exportedPaths.push(fileName);
          } else {
            const fullPath = this.getAvailablePath(app, `${folderPrefix}${baseName}${pageSuffix}`, "svg");
            await app.vault.create(fullPath, svgContent);
            exportedPaths.push(fullPath);
          }
        }
      }

      notify(`Exported ${exportedPaths.length} file(s) successfully`);

      return {
        success: true,
        format: options.format,
        destination: options.destination,
        exportedPaths
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      notify(`Export failed: ${errorMsg}`);
      return {
        success: false,
        format: options.format,
        destination: options.destination,
        exportedPaths,
        error: errorMsg
      };
    }
  }

  static getAvailablePath(app: App, basePath: string, extension: string): string {
    let targetPath = `${basePath}.${extension}`;
    let counter = 1;
    while (app.vault.getAbstractFileByPath(targetPath) !== null) {
      targetPath = `${basePath} (${counter}).${extension}`;
      counter++;
    }
    return targetPath;
  }
}
