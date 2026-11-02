import { describe, it } from "node:test";
import assert from "node:assert";
import { PageManager } from "../src/model/PageManager";
import { DocumentSerializer } from "../src/storage/DocumentSerializer";
import { HistoryManager, AddStrokeCommand } from "../src/history/HistoryManager";
import { SelectionEngine } from "../src/selection/SelectionEngine";
import { exportPageToSvg } from "../src/export/SvgExporter";
import { PdfExporter } from "../src/export/PdfExporter";
import { DEFAULT_EXPORT_OPTIONS } from "../src/export/ExportTypes";
import { PageVirtualizer, PageVirtualizerDelegate } from "../src/performance/PageVirtualizer";
import {
  NotebookDocument,
  StrokeObject,
  ShapeObject,
  TextObject,
  ImageObject
} from "../src/types";

describe("Obsinotes Full Lifecycle Integration", () => {
  const minimalPngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const minimalPngBytes = Uint8Array.from(Buffer.from(minimalPngBase64, "base64"));

  it("completes full end-to-end authoring, editing, serialization, virtualization, and export pipeline", async () => {
    const initialDoc: NotebookDocument = {
      metadata: {
        title: "Integration Notebook",
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
        }
      ]
    };

    const pageManager = new PageManager(initialDoc);
    assert.strictEqual(pageManager.getPages().length, 1);

    const page2 = pageManager.addPage({
      template: {
        type: "ruled",
        backgroundColor: "#ffffff",
        lineColor: "#e2e8f0",
        spacing: 24,
        opacity: 0.8
      }
    });
    assert.strictEqual(pageManager.getPages().length, 2);
    assert.strictEqual(page2.pageNumber, 2);

    const page1 = pageManager.getPages()[0];

    const stroke1: StrokeObject = {
      id: "stroke-1",
      elementType: "stroke",
      tool: "pen",
      color: "#0f172a",
      width: 2.5,
      opacity: 1,
      points: [
        { x: 100, y: 100, pressure: 0.5, timestamp: 1000 },
        { x: 150, y: 120, pressure: 0.6, timestamp: 1010 },
        { x: 200, y: 150, pressure: 0.5, timestamp: 1020 }
      ],
      bounds: { minX: 100, minY: 100, maxX: 200, maxY: 150 },
      createdAt: 1000
    };

    const historyManager = new HistoryManager(50);
    historyManager.execute(new AddStrokeCommand(page1, stroke1, () => {}));
    assert.strictEqual(page1.strokes.length, 1);

    historyManager.undo();
    assert.strictEqual(page1.strokes.length, 0);
    historyManager.redo();
    assert.strictEqual(page1.strokes.length, 1);

    const shape1: ShapeObject = {
      id: "shape-1",
      elementType: "shape",
      type: "rectangle",
      color: "#2563eb",
      strokeWidth: 2,
      fillColor: "#dbeafe",
      bounds: { minX: 50, minY: 50, maxX: 150, maxY: 120 },
      geometryData: { x: 50, y: 50, width: 100, height: 70 }
    };
    page1.shapes.push(shape1);

    const sticky1: TextObject = {
      id: "text-1",
      elementType: "text",
      x: 250,
      y: 100,
      width: 140,
      height: 120,
      content: "Important Idea\nWith multiple lines",
      fontSize: 14,
      fontFamily: "sans-serif",
      fontWeight: "normal",
      color: "#1e293b",
      textAlign: "left",
      isSticky: true,
      backgroundColor: "#fef08a"
    };
    page1.texts.push(sticky1);

    const image1: ImageObject = {
      id: "img-1",
      elementType: "image",
      assetId: "asset-1",
      vaultPath: "attachments/diagram.png",
      x: 80,
      y: 300,
      width: 200,
      height: 150,
      rotation: 0
    };
    page1.images.push(image1);

    const lassoPolygon = [
      { x: 40, y: 40 },
      { x: 220, y: 40 },
      { x: 220, y: 180 },
      { x: 40, y: 180 }
    ];
    assert.ok(SelectionEngine.isStrokeSelectedByLasso(stroke1, lassoPolygon));
    assert.ok(SelectionEngine.isShapeSelectedByLasso(shape1, lassoPolygon));

    const document: NotebookDocument = {
      metadata: {
        title: "Integration Notebook",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        schemaVersion: 1,
        defaultPageSize: "A4",
        defaultOrientation: "portrait"
      },
      pages: pageManager.getPages()
    };

    const serializedPayload = DocumentSerializer.serializeDocument(document);
    assert.ok(serializedPayload.includes("---"));
    assert.ok(serializedPayload.includes("notepages-plugin"));
    assert.ok(serializedPayload.includes("Integration Notebook"));

    const deserialized = DocumentSerializer.deserializeDocument(serializedPayload);
    assert.ok(deserialized.success);
    if (deserialized.success) {
      assert.strictEqual(deserialized.document.pages.length, 2);
      const deserializedP1 = deserialized.document.pages[0];
      assert.strictEqual(deserializedP1.strokes.length, 1);
      assert.strictEqual(deserializedP1.shapes.length, 1);
      assert.strictEqual(deserializedP1.texts.length, 1);
      assert.strictEqual(deserializedP1.images.length, 1);
      assert.strictEqual(deserializedP1.texts[0].isSticky, true);
    }

    const mountedPages: number[] = [];
    const unmountedPages: number[] = [];
    const virtualizerDelegate: PageVirtualizerDelegate = {
      getTotalPages: () => pageManager.getPages().length,
      mountPageCanvases: (p) => mountedPages.push(p),
      unmountPageCanvases: (p) => unmountedPages.push(p)
    };
    const virtualizer = new PageVirtualizer(virtualizerDelegate, { virtualizationThreshold: 4 });
    virtualizer.updateVirtualization();
    assert.deepStrictEqual(virtualizer.getMountedPages(), [1, 2]);

    const svg = exportPageToSvg(page1);
    assert.ok(svg.startsWith("<svg"));
    assert.ok(svg.includes("template-layer"));
    assert.ok(svg.includes("shape-layer"));
    assert.ok(svg.includes("text-layer"));
    assert.ok(svg.includes("ink-layer"));
    assert.ok(svg.includes("Important Idea"));

    const pdfBytes = await PdfExporter.exportNotebookToPdf(
      document,
      [1, 2],
      DEFAULT_EXPORT_OPTIONS,
      {
        renderPageToPng: async () => minimalPngBytes
      }
    );
    assert.ok(pdfBytes.length > 0);
    const magic = Buffer.from(pdfBytes.slice(0, 5)).toString("utf8");
    assert.strictEqual(magic, "%PDF-");
  });
});
