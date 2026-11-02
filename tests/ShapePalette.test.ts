import { test, describe } from "node:test";
import assert from "node:assert";
import { DocumentSerializer } from "../src/storage/DocumentSerializer";
import { HistoryManager, AddShapeCommand } from "../src/history/HistoryManager";
import { NotebookDocument, PageData, ShapeObject, ShapeType } from "../src/types";

describe("Shape Palette Feature", () => {
  function createSamplePage(): PageData {
    return {
      id: "page_shape_1",
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

  test("serializes and deserializes all new shape types with fill colors", () => {
    const page = createSamplePage();
    const newTypes: ShapeType[] = ["rounded-rectangle", "diamond", "star", "callout", "arrow"];

    for (const shapeType of newTypes) {
      const shape: ShapeObject = {
        id: `shape_${shapeType}_test`,
        elementType: "shape",
        type: shapeType,
        color: "#2563eb",
        strokeWidth: 2,
        fillColor: "rgba(37, 99, 235, 0.22)",
        bounds: { minX: 50, minY: 50, maxX: 150, maxY: 150 },
        geometryData: { x: 50, y: 50, width: 100, height: 100, radius: 10 }
      };
      page.shapes.push(shape);
    }

    const doc: NotebookDocument = {
      metadata: {
        title: "Shape Test Notebook",
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
    assert.strictEqual(deserialized.document!.pages[0].shapes.length, 5);

    for (let i = 0; i < newTypes.length; i++) {
      const restored = deserialized.document!.pages[0].shapes[i];
      assert.strictEqual(restored.type, newTypes[i]);
      assert.strictEqual(restored.fillColor, "rgba(37, 99, 235, 0.22)");
    }
  });

  test("adds, undoes and redoes ShapeObject using AddShapeCommand", () => {
    const history = new HistoryManager(50);
    const page = createSamplePage();

    const starShape: ShapeObject = {
      id: "star_shape_1",
      elementType: "shape",
      type: "star",
      color: "#f59e0b",
      strokeWidth: 2,
      bounds: { minX: 100, minY: 100, maxX: 200, maxY: 200 },
      geometryData: { x: 100, y: 100, width: 100, height: 100 }
    };

    history.execute(new AddShapeCommand(page, starShape, () => {}));
    assert.strictEqual(page.shapes.length, 1);
    assert.strictEqual(page.shapes[0].type, "star");

    history.undo();
    assert.strictEqual(page.shapes.length, 0);

    history.redo();
    assert.strictEqual(page.shapes.length, 1);
    assert.strictEqual(page.shapes[0].id, "star_shape_1");
  });
});
