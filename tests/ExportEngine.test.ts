import { describe, it } from "node:test";
import assert from "node:assert";
import { PDFDocument } from "pdf-lib";
import {
  parsePageRange,
  DEFAULT_EXPORT_OPTIONS,
  ExportOptions
} from "../src/export/ExportTypes";
import {
  escapeXml,
  outlineToSvgPath,
  renderTemplateToSvg,
  renderShapeToSvg,
  renderStrokeToSvg,
  renderTextToSvg,
  exportPageToSvg
} from "../src/export/SvgExporter";
import { PdfExporter } from "../src/export/PdfExporter";
import { ExportEngine, toArrayBuffer } from "../src/export/ExportEngine";
import { StrokeGeometry } from "../src/ink/StrokeGeometry";
import {
  NotebookDocument,
  PageData,
  PaperTemplateConfig,
  ShapeObject,
  StrokeObject,
  TextObject
} from "../src/types";

describe("ExportTypes - parsePageRange", () => {
  it("returns all page numbers when range is all", () => {
    const pages = parsePageRange("all", undefined, 5, 2);
    assert.deepStrictEqual(pages, [1, 2, 3, 4, 5]);
  });

  it("returns current page number when range is current", () => {
    const pages = parsePageRange("current", undefined, 5, 3);
    assert.deepStrictEqual(pages, [3]);
  });

  it("clamps current page when currentPage is out of bounds", () => {
    const pagesMin = parsePageRange("current", undefined, 5, 0);
    assert.deepStrictEqual(pagesMin, [1]);

    const pagesMax = parsePageRange("current", undefined, 5, 10);
    assert.deepStrictEqual(pagesMax, [5]);
  });

  it("parses comma-separated custom page numbers", () => {
    const pages = parsePageRange("custom", "1, 3, 5", 5, 1);
    assert.deepStrictEqual(pages, [1, 3, 5]);
  });

  it("parses range syntax like 2-4 and mixed with single numbers", () => {
    const pages = parsePageRange("custom", "1, 3-5", 6, 1);
    assert.deepStrictEqual(pages, [1, 3, 4, 5]);
  });

  it("handles reversed range syntax gracefully", () => {
    const pages = parsePageRange("custom", "4-2", 6, 1);
    assert.deepStrictEqual(pages, [2, 3, 4]);
  });

  it("filters out invalid numbers and numbers beyond totalPages", () => {
    const pages = parsePageRange("custom", "0, 2, abc, 99", 5, 1);
    assert.deepStrictEqual(pages, [2]);
  });

  it("falls back to all pages when custom string is empty or whitespace", () => {
    const pages = parsePageRange("custom", "   ", 3, 1);
    assert.deepStrictEqual(pages, [1, 2, 3]);
  });

  it("returns empty array when totalPages is 0", () => {
    const pages = parsePageRange("all", undefined, 0, 1);
    assert.deepStrictEqual(pages, []);
  });
});

describe("SvgExporter - Template and Element Rendering", () => {
  it("escapes xml special characters accurately", () => {
    const input = `<script>alert("test" & 'hello');</script>`;
    const escaped = escapeXml(input);
    assert.ok(!escaped.includes("<"));
    assert.ok(!escaped.includes(">"));
    assert.ok(escaped.includes("&lt;"));
    assert.ok(escaped.includes("&gt;"));
    assert.ok(escaped.includes("&quot;"));
    assert.ok(escaped.includes("&apos;"));
    assert.ok(escaped.includes("&amp;"));
  });

  it("renders blank, ruled, grid, dotted, and cornell templates to svg", () => {
    const blankConfig: PaperTemplateConfig = {
      type: "blank",
      backgroundColor: "#ffffff",
      lineColor: "#e2e8f0",
      spacing: 24,
      opacity: 0.8
    };
    const blankSvg = renderTemplateToSvg(595, 842, blankConfig);
    assert.ok(blankSvg.includes('fill="#ffffff"'));

    const ruledConfig: PaperTemplateConfig = {
      type: "ruled",
      backgroundColor: "#f8fafc",
      lineColor: "#94a3b8",
      spacing: 20,
      opacity: 0.7
    };
    const ruledSvg = renderTemplateToSvg(595, 842, ruledConfig);
    assert.ok(ruledSvg.includes("<line"));

    const gridConfig: PaperTemplateConfig = {
      type: "grid",
      backgroundColor: "#ffffff",
      lineColor: "#cbd5e1",
      spacing: 20,
      opacity: 0.7
    };
    const gridSvg = renderTemplateToSvg(595, 842, gridConfig);
    assert.ok(gridSvg.includes("<line"));

    const dottedConfig: PaperTemplateConfig = {
      type: "dotted",
      backgroundColor: "#ffffff",
      lineColor: "#94a3b8",
      spacing: 25,
      opacity: 0.8
    };
    const dottedSvg = renderTemplateToSvg(595, 842, dottedConfig);
    assert.ok(dottedSvg.includes("<circle"));

    const cornellConfig: PaperTemplateConfig = {
      type: "cornell",
      backgroundColor: "#ffffff",
      lineColor: "#94a3b8",
      spacing: 20,
      opacity: 0.8,
      cornell: {
        headerHeight: 60,
        cueWidthPercent: 30,
        summaryHeight: 80
      }
    };
    const cornellSvg = renderTemplateToSvg(595, 842, cornellConfig);
    assert.ok(cornellSvg.includes("<line"));
  });

  it("renders shapes to valid SVG elements", () => {
    const rectShape: ShapeObject = {
      id: "sh-1",
      type: "rectangle",
      color: "#ef4444",
      strokeWidth: 2,
      bounds: { minX: 10, minY: 10, maxX: 110, maxY: 60 },
      geometryData: { x: 10, y: 10, width: 100, height: 50 }
    };
    const rectSvg = renderShapeToSvg(rectShape);
    assert.ok(rectSvg.includes("<rect"));
    assert.ok(rectSvg.includes('stroke="#ef4444"'));

    const circleShape: ShapeObject = {
      id: "sh-2",
      type: "circle",
      color: "#3b82f6",
      strokeWidth: 3,
      bounds: { minX: 50, minY: 50, maxX: 150, maxY: 150 },
      geometryData: { cx: 100, cy: 100, radius: 50 }
    };
    const circleSvg = renderShapeToSvg(circleShape);
    assert.ok(circleSvg.includes("<circle"));

    const arrowShape: ShapeObject = {
      id: "sh-3",
      type: "arrow",
      color: "#10b981",
      strokeWidth: 2,
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 50 },
      geometryData: { x1: 0, y1: 0, x2: 100, y2: 50 }
    };
    const arrowSvg = renderShapeToSvg(arrowShape);
    assert.ok(arrowSvg.includes("<path") || arrowSvg.includes("<line"));
  });

  it("renders stroke with highlighter multiply mix-blend-mode", () => {
    const penStroke: StrokeObject = {
      id: "st-1",
      tool: "pen",
      color: "#1e293b",
      width: 2,
      opacity: 1,
      points: [
        { x: 10, y: 10, pressure: 0.5, timestamp: 1000 },
        { x: 20, y: 20, pressure: 0.5, timestamp: 1010 }
      ],
      bounds: { minX: 9, minY: 9, maxX: 21, maxY: 21 },
      createdAt: 1000
    };
    const penSvg = renderStrokeToSvg(penStroke);
    assert.ok(penSvg.includes("<path"));
    assert.ok(!penSvg.includes("mix-blend-mode: multiply"));

    const hlStroke: StrokeObject = {
      id: "st-2",
      tool: "highlighter",
      color: "#facc15",
      width: 14,
      opacity: 0.35,
      points: [
        { x: 10, y: 30, pressure: 0.5, timestamp: 1000 },
        { x: 50, y: 30, pressure: 0.5, timestamp: 1010 }
      ],
      bounds: { minX: 10, minY: 20, maxX: 50, maxY: 40 },
      createdAt: 1000
    };
    const hlSvg = renderStrokeToSvg(hlStroke);
    assert.ok(hlSvg.includes("mix-blend-mode: multiply"));
  });

  it("renderStrokeToSvg seamlessly re-uses pre-calculated StrokeGeometry cache", () => {
    const cachedStroke: StrokeObject = {
      id: "st-cached-1",
      tool: "pen",
      color: "#ff0000",
      width: 4,
      opacity: 0.9,
      points: [
        { x: 10, y: 10, pressure: 0.5, timestamp: 100 },
        { x: 50, y: 50, pressure: 0.5, timestamp: 120 }
      ],
      bounds: { minX: 8, minY: 8, maxX: 52, maxY: 52 },
      createdAt: 100
    };

    // Pre-populate geometry cache (as would happen during inking or rendering on canvas)
    const customOutline = [[10, 10], [50, 50], [10, 50]];
    StrokeGeometry.setCachedGeometry(cachedStroke, {
      outline: customOutline
    });

    // SvgExporter should use the cached outline directly
    const svg = renderStrokeToSvg(cachedStroke);
    assert.ok(svg.includes("<path"));
    assert.ok(svg.includes('fill="#ff0000"'));
    assert.ok(svg.includes('fill-opacity="0.9"'));
    assert.ok(svg.includes("M 10.00 10.00"));
  });

  it("renders text and sticky notes with correct styling", () => {
    const textObj: TextObject = {
      id: "txt-1",
      x: 40,
      y: 50,
      width: 120,
      height: 40,
      content: "Hello World",
      fontSize: 16,
      fontFamily: "sans-serif",
      fontWeight: "bold",
      color: "#0f172a",
      textAlign: "left"
    };
    const textSvg = renderTextToSvg(textObj);
    assert.ok(textSvg.includes("Hello World"));
    assert.ok(textSvg.includes("<text"));

    const stickyObj: TextObject = {
      id: "txt-2",
      x: 100,
      y: 100,
      width: 160,
      height: 120,
      content: "Sticky Idea",
      fontSize: 14,
      fontFamily: "sans-serif",
      fontWeight: "normal",
      color: "#1f2937",
      textAlign: "left",
      isSticky: true,
      backgroundColor: "#fef08a"
    };
    const stickySvg = renderTextToSvg(stickyObj);
    assert.ok(stickySvg.includes('fill="#fef08a"'));
    assert.ok(stickySvg.includes("Sticky Idea"));
  });

  it("exports a complete page into an svg document string", () => {
    const page: PageData = {
      id: "page-1",
      pageNumber: 1,
      dimensions: { width: 595.28, height: 841.89, unit: "pt" },
      orientation: "portrait",
      template: {
        type: "ruled",
        backgroundColor: "#ffffff",
        lineColor: "#e2e8f0",
        spacing: 24,
        opacity: 0.8
      },
      strokes: [],
      shapes: [
        {
          id: "sh-1",
          type: "rectangle",
          color: "#000000",
          strokeWidth: 2,
          bounds: { minX: 10, minY: 10, maxX: 100, maxY: 100 },
          geometryData: { x: 10, y: 10, width: 90, height: 90 }
        }
      ],
      texts: [
        {
          id: "tx-1",
          x: 20,
          y: 20,
          width: 80,
          height: 30,
          content: "Test Page",
          fontSize: 16,
          fontFamily: "sans-serif",
          fontWeight: "normal",
          color: "#000000",
          textAlign: "left"
        }
      ],
      images: []
    };

    const svg = exportPageToSvg(page);
    assert.ok(svg.startsWith("<svg"));
    assert.ok(svg.endsWith("</svg>"));
    assert.ok(svg.includes('viewBox="0 0 595.28 841.89"'));
    assert.ok(svg.includes("template-layer"));
    assert.ok(svg.includes("shape-layer"));
    assert.ok(svg.includes("text-layer"));
  });
});

describe("PdfExporter", () => {
  const minimalPngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const minimalPngBytes = Uint8Array.from(Buffer.from(minimalPngBase64, "base64"));

  const sampleDoc: NotebookDocument = {
    metadata: {
      title: "Test Notebook",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: 1,
      defaultPageSize: "A4",
      defaultOrientation: "portrait"
    },
    pages: [
      {
        id: "page-1",
        pageNumber: 1,
        dimensions: { width: 595.28, height: 841.89, unit: "pt" },
        orientation: "portrait",
        template: {
          type: "blank",
          backgroundColor: "#ffffff",
          lineColor: "#e2e8f0",
          spacing: 24,
          opacity: 0.8
        },
        strokes: [],
        shapes: [],
        texts: [],
        images: []
      },
      {
        id: "page-2",
        pageNumber: 2,
        dimensions: { width: 595.28, height: 841.89, unit: "pt" },
        orientation: "portrait",
        template: {
          type: "ruled",
          backgroundColor: "#ffffff",
          lineColor: "#e2e8f0",
          spacing: 24,
          opacity: 0.8
        },
        strokes: [],
        shapes: [],
        texts: [],
        images: []
      }
    ]
  };

  it("exports multi-page notebook to valid PDF bytes with custom renderer dependency", async () => {
    const options: ExportOptions = {
      ...DEFAULT_EXPORT_OPTIONS,
      pageRange: "all"
    };

    const pdfBytes = await PdfExporter.exportNotebookToPdf(
      sampleDoc,
      [1, 2],
      options,
      {
        renderPageToPng: async () => minimalPngBytes
      }
    );

    assert.ok(pdfBytes.length > 0);
    const header = Buffer.from(pdfBytes.slice(0, 5)).toString("utf8");
    assert.strictEqual(header, "%PDF-");

    const loadedDoc = await PDFDocument.load(pdfBytes);
    assert.strictEqual(loadedDoc.getPageCount(), 2);
  });

  it("exports only specified page numbers in pageNumbers array", async () => {
    const options: ExportOptions = {
      ...DEFAULT_EXPORT_OPTIONS,
      pageRange: "current"
    };

    const pdfBytes = await PdfExporter.exportNotebookToPdf(
      sampleDoc,
      [2],
      options,
      {
        renderPageToPng: async () => minimalPngBytes
      }
    );

    const loadedDoc = await PDFDocument.load(pdfBytes);
    assert.strictEqual(loadedDoc.getPageCount(), 1);
  });

  it("handles copied source PDF background when readBinary dependency is provided", async () => {
    const basePdf = await PDFDocument.create();
    basePdf.addPage([595.28, 841.89]);
    basePdf.addPage([595.28, 841.89]);
    const baseBytes = await basePdf.save();

    const docWithPdfSource: NotebookDocument = {
      metadata: sampleDoc.metadata,
      pages: [
        {
          id: "page-1",
          pageNumber: 1,
          dimensions: { width: 595.28, height: 841.89, unit: "pt" },
          orientation: "portrait",
          template: {
            type: "blank",
            backgroundColor: "#ffffff",
            lineColor: "#e2e8f0",
            spacing: 24,
            opacity: 0.8
          },
          pdfSource: {
            pdfPath: "attachments/sample.pdf",
            pageIndex: 1
          },
          strokes: [],
          shapes: [],
          texts: [],
          images: []
        }
      ]
    };

    const pdfBytes = await PdfExporter.exportNotebookToPdf(
      docWithPdfSource,
      [1],
      DEFAULT_EXPORT_OPTIONS,
      {
        renderPageToPng: async () => minimalPngBytes,
        readBinary: async (p: string) => {
          if (p === "attachments/sample.pdf") {
            return baseBytes.buffer.slice(baseBytes.byteOffset, baseBytes.byteOffset + baseBytes.byteLength);
          }
          return null;
        }
      }
    );

    const loadedDoc = await PDFDocument.load(pdfBytes);
    assert.strictEqual(loadedDoc.getPageCount(), 1);
  });
});

describe("ExportEngine Utilities", () => {
  it("converts Uint8Array to ArrayBuffer cleanly", () => {
    const source = new Uint8Array([1, 2, 3, 4, 5]);
    const buffer = toArrayBuffer(source);
    assert.strictEqual(buffer.byteLength, 5);
    const view = new Uint8Array(buffer);
    assert.deepStrictEqual(Array.from(view), [1, 2, 3, 4, 5]);
  });

  it("generates available path with incrementing index upon collisions", () => {
    const existingFiles = new Set(["notes/MyNote.pdf", "notes/MyNote (1).pdf"]);
    const fakeApp = {
      vault: {
        getAbstractFileByPath: (path: string) => (existingFiles.has(path) ? {} : null)
      }
    };

    const available = ExportEngine.getAvailablePath(
      fakeApp as unknown as import("obsidian").App,
      "notes/MyNote",
      "pdf"
    );
    assert.strictEqual(available, "notes/MyNote (2).pdf");
  });
});
