import { test, describe } from "node:test";
import assert from "node:assert";
import { DocumentSerializer } from "../src/storage/DocumentSerializer";
import { HistoryManager } from "../src/history/HistoryManager";
import { AddTextCommand, ModifyTextCommand } from "../src/history/HistoryManager";
import { NotebookDocument, PageData, TextObject } from "../src/types";

describe("Sticky Notes Feature", () => {
  function createSamplePage(): PageData {
    return {
      id: "page_1",
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

  test("serializes and deserializes sticky note object with isSticky flag", () => {
    const page = createSamplePage();
    const sticky: TextObject = {
      id: "sticky_1",
      elementType: "text",
      isSticky: true,
      x: 100,
      y: 150,
      width: 140,
      height: 140,
      content: "Brainstorming idea #1",
      fontSize: 16,
      fontFamily: "Inter, sans-serif",
      fontWeight: "normal",
      color: "#1e293b",
      backgroundColor: "#fef08a",
      textAlign: "left",
      bounds: { minX: 100, minY: 150, maxX: 240, maxY: 290 }
    };
    page.texts.push(sticky);

    const doc: NotebookDocument = {
      metadata: {
        title: "Sticky Note Board",
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
    assert.strictEqual(deserialized.document!.pages[0].texts.length, 1);
    const restored = deserialized.document!.pages[0].texts[0];
    assert.strictEqual(restored.isSticky, true);
    assert.strictEqual(restored.backgroundColor, "#fef08a");
    assert.strictEqual(restored.content, "Brainstorming idea #1");
  });

  test("adds, modifies and undoes sticky notes via HistoryManager", () => {
    const history = new HistoryManager(50);
    const page = createSamplePage();

    const sticky: TextObject = {
      id: "sticky_2",
      elementType: "text",
      isSticky: true,
      x: 50,
      y: 80,
      width: 140,
      height: 140,
      content: "Initial Note",
      fontSize: 16,
      fontFamily: "Inter, sans-serif",
      fontWeight: "normal",
      color: "#1e293b",
      backgroundColor: "#bbf7d0",
      textAlign: "left",
      bounds: { minX: 50, minY: 80, maxX: 190, maxY: 220 }
    };

    history.execute(new AddTextCommand(page, sticky, () => {}));
    assert.strictEqual(page.texts.length, 1);
    assert.strictEqual(page.texts[0].isSticky, true);

    const modifiedSticky: TextObject = {
      ...sticky,
      content: "Updated Note",
      backgroundColor: "#fbcfe8"
    };
    history.execute(new ModifyTextCommand(page, sticky, modifiedSticky, () => {}));
    assert.strictEqual(page.texts[0].content, "Updated Note");
    assert.strictEqual(page.texts[0].backgroundColor, "#fbcfe8");

    history.undo();
    assert.strictEqual(page.texts[0].content, "Initial Note");
    assert.strictEqual(page.texts[0].backgroundColor, "#bbf7d0");

    history.undo();
    assert.strictEqual(page.texts.length, 0);

    history.redo();
    assert.strictEqual(page.texts.length, 1);
    assert.strictEqual(page.texts[0].content, "Initial Note");
  });
});
