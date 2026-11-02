import { test, describe } from "node:test";
import assert from "node:assert";
import { DocumentSerializer } from "../src/storage/DocumentSerializer";
import { HistoryManager, AddShapeCommand } from "../src/history/HistoryManager";
import { NotebookDocument, PageData, ShapeObject } from "../src/types";

describe("Connector Lines Feature", () => {
  function createSamplePage(): PageData {
    return {
      id: "page_connector_1",
      pageNumber: 1,
      dimensions: { width: 595, height: 842, unit: "pt" },
      orientation: "portrait",
      template: {
        type: "blank",
        backgroundColor: "#ffffff",
        lineColor: "#e2e8f0",
        spacing: 24,
        opacity: 1
      },
      strokes: [],
      shapes: [],
      texts: [],
      images: []
    };
  }

  test("serializes and deserializes connector arrow with endpoint coordinates", () => {
    const page = createSamplePage();
    const connector: ShapeObject = {
      id: "connector_arrow_1",
      elementType: "shape",
      type: "arrow",
      color: "#dc2626",
      strokeWidth: 2.5,
      bounds: { minX: 88, minY: 88, maxX: 312, maxY: 262 },
      geometryData: {
        x1: 100,
        y1: 100,
        x2: 300,
        y2: 250
      }
    };
    page.shapes.push(connector);

    const doc: NotebookDocument = {
      metadata: {
        title: "Connector Test Notebook",
        createdAt: 1000,
        updatedAt: 2000,
        schemaVersion: 1,
        defaultPageSize: "A4",
        defaultOrientation: "portrait"
      },
      pages: [page]
    };

    const serialized = DocumentSerializer.serializeDocument(doc);
    const deserialized = DocumentSerializer.deserializeDocument(serialized);

    assert.strictEqual(deserialized.success, true);
    assert.notStrictEqual(deserialized.document, undefined);
    assert.strictEqual(deserialized.document!.pages[0].shapes.length, 1);

    const restored = deserialized.document!.pages[0].shapes[0];
    assert.strictEqual(restored.type, "arrow");
    assert.strictEqual(restored.color, "#dc2626");
    assert.strictEqual(restored.geometryData.x1, 100);
    assert.strictEqual(restored.geometryData.y1, 100);
    assert.strictEqual(restored.geometryData.x2, 300);
    assert.strictEqual(restored.geometryData.y2, 250);
  });

  test("manages connector undo and redo through AddShapeCommand", () => {
    const history = new HistoryManager(50);
    const page = createSamplePage();

    const connector: ShapeObject = {
      id: "conn_cmd_test",
      elementType: "shape",
      type: "arrow",
      color: "#16a34a",
      strokeWidth: 1.5,
      bounds: { minX: 38, minY: 38, maxX: 162, maxY: 162 },
      geometryData: {
        x1: 50,
        y1: 50,
        x2: 150,
        y2: 150
      }
    };

    history.execute(new AddShapeCommand(page, connector, () => {}));
    assert.strictEqual(page.shapes.length, 1);
    assert.strictEqual(page.shapes[0].id, "conn_cmd_test");

    history.undo();
    assert.strictEqual(page.shapes.length, 0);

    history.redo();
    assert.strictEqual(page.shapes.length, 1);
    assert.strictEqual(page.shapes[0].geometryData.x2, 150);
  });
});
