import { test, describe } from "node:test";
import assert from "node:assert";
import { PageManager } from "../src/model/PageManager";
import { NotebookDocument, PageData } from "../src/types";

describe("PageManager", () => {
  function createTestDocument(): NotebookDocument {
    const initialPage: PageData = {
      id: "page_init_1",
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
      strokes: [
        {
          id: "stroke_1",
          tool: "pen",
          color: "#000000",
          width: 2,
          opacity: 1,
          points: [{ x: 10, y: 10, pressure: 0.5, timestamp: 100 }],
          bounds: { minX: 10, minY: 10, maxX: 10, maxY: 10 },
          createdAt: 100
        }
      ],
      shapes: [],
      texts: [
        {
          id: "text_1",
          x: 50,
          y: 50,
          width: 100,
          height: 30,
          content: "Hello NotePages",
          fontSize: 16,
          fontFamily: "sans-serif",
          fontWeight: "normal",
          color: "#000000",
          textAlign: "left"
        }
      ],
      images: []
    };

    return {
      metadata: {
        title: "Test Notebook",
        createdAt: 1000,
        updatedAt: 1000,
        schemaVersion: 1,
        defaultPageSize: "A4",
        defaultOrientation: "portrait"
      },
      pages: [initialPage]
    };
  }

  test("initial state has 1 page", () => {
    const doc = createTestDocument();
    const manager = new PageManager(doc);

    assert.strictEqual(manager.getPageCount(), 1);
    assert.strictEqual(manager.getPage("page_init_1")?.pageNumber, 1);
  });

  test("addPage adds page at the end and renumbers", () => {
    const doc = createTestDocument();
    const manager = new PageManager(doc);

    const newPage = manager.addPage({ template: { type: "grid", backgroundColor: "#fff", lineColor: "#ccc", spacing: 20, opacity: 1 } });
    assert.strictEqual(manager.getPageCount(), 2);
    assert.strictEqual(newPage.pageNumber, 2);
    assert.strictEqual(newPage.template.type, "grid");
  });

  test("insertPage inserts at specific index", () => {
    const doc = createTestDocument();
    const manager = new PageManager(doc);
    manager.addPage();

    const inserted = manager.insertPage(1, { template: { type: "dotted", backgroundColor: "#fff", lineColor: "#000", spacing: 15, opacity: 1 } });
    assert.strictEqual(manager.getPageCount(), 3);
    assert.strictEqual(inserted.pageNumber, 2);
    assert.strictEqual(manager.getPageByIndex(0)?.id, "page_init_1");
    assert.strictEqual(manager.getPageByIndex(1)?.id, inserted.id);
    assert.strictEqual(manager.getPageByIndex(2)?.pageNumber, 3);
  });

  test("insertPages inserts multiple pages at target index and renumbers", () => {
    const doc = createTestDocument();
    const manager = new PageManager(doc);

    const pdfPage1: PageData = {
      id: "pdf_1",
      pageNumber: 1,
      dimensions: { width: 600, height: 800, unit: "pt" },
      orientation: "portrait",
      template: { type: "blank", backgroundColor: "#fff", lineColor: "#000", spacing: 20, opacity: 1 },
      pdfSource: { pdfPath: "doc.pdf", pageIndex: 0 },
      strokes: [],
      shapes: [],
      texts: [],
      images: []
    };
    const pdfPage2: PageData = {
      id: "pdf_2",
      pageNumber: 2,
      dimensions: { width: 600, height: 800, unit: "pt" },
      orientation: "portrait",
      template: { type: "blank", backgroundColor: "#fff", lineColor: "#000", spacing: 20, opacity: 1 },
      pdfSource: { pdfPath: "doc.pdf", pageIndex: 1 },
      strokes: [],
      shapes: [],
      texts: [],
      images: []
    };

    manager.insertPages(1, [pdfPage1, pdfPage2]);
    assert.strictEqual(manager.getPageCount(), 3);
    assert.strictEqual(manager.getPageByIndex(0)?.id, "page_init_1");
    assert.strictEqual(manager.getPageByIndex(0)?.pageNumber, 1);
    assert.strictEqual(manager.getPageByIndex(1)?.id, "pdf_1");
    assert.strictEqual(manager.getPageByIndex(1)?.pageNumber, 2);
    assert.strictEqual(manager.getPageByIndex(2)?.id, "pdf_2");
    assert.strictEqual(manager.getPageByIndex(2)?.pageNumber, 3);
  });

  test("insertPages with replaceCount replaces target page and renumbers", () => {
    const doc = createTestDocument();
    const manager = new PageManager(doc);

    const pdfPage1: PageData = {
      id: "pdf_1",
      pageNumber: 1,
      dimensions: { width: 600, height: 800, unit: "pt" },
      orientation: "portrait",
      template: { type: "blank", backgroundColor: "#fff", lineColor: "#000", spacing: 20, opacity: 1 },
      pdfSource: { pdfPath: "doc.pdf", pageIndex: 0 },
      strokes: [],
      shapes: [],
      texts: [],
      images: []
    };

    manager.insertPages(0, [pdfPage1], 1);
    assert.strictEqual(manager.getPageCount(), 1);
    assert.strictEqual(manager.getPageByIndex(0)?.id, "pdf_1");
    assert.strictEqual(manager.getPageByIndex(0)?.pageNumber, 1);
    assert.strictEqual(manager.getPage("page_init_1"), undefined);
  });

  test("duplicatePage deep clones content with new stable IDs", () => {
    const doc = createTestDocument();
    const manager = new PageManager(doc);

    const duplicated = manager.duplicatePage("page_init_1");
    assert.notStrictEqual(duplicated, null);
    assert.strictEqual(manager.getPageCount(), 2);
    assert.strictEqual(duplicated?.pageNumber, 2);
    assert.notStrictEqual(duplicated?.id, "page_init_1");

    assert.strictEqual(duplicated?.strokes.length, 1);
    assert.notStrictEqual(duplicated?.strokes[0].id, "stroke_1");
    assert.strictEqual(duplicated?.strokes[0].color, "#000000");

    assert.strictEqual(duplicated?.texts.length, 1);
    assert.notStrictEqual(duplicated?.texts[0].id, "text_1");
    assert.strictEqual(duplicated?.texts[0].content, "Hello NotePages");
  });

  test("deletePage removes page and renumbers, but prevents deleting only page", () => {
    const doc = createTestDocument();
    const manager = new PageManager(doc);

    const cannotDelete = manager.deletePage("page_init_1");
    assert.strictEqual(cannotDelete, false);
    assert.strictEqual(manager.getPageCount(), 1);

    const page2 = manager.addPage();
    assert.strictEqual(manager.getPageCount(), 2);

    const deleteSuccess = manager.deletePage("page_init_1");
    assert.strictEqual(deleteSuccess, true);
    assert.strictEqual(manager.getPageCount(), 1);
    assert.strictEqual(manager.getPageByIndex(0)?.id, page2.id);
    assert.strictEqual(manager.getPageByIndex(0)?.pageNumber, 1);
  });

  test("reorderPages moves page and preserves IDs and contents", () => {
    const doc = createTestDocument();
    const manager = new PageManager(doc);
    const page2 = manager.addPage();
    const page3 = manager.addPage();

    assert.strictEqual(manager.getPageByIndex(0)?.id, "page_init_1");
    assert.strictEqual(manager.getPageByIndex(1)?.id, page2.id);
    assert.strictEqual(manager.getPageByIndex(2)?.id, page3.id);

    const reordered = manager.reorderPages(2, 0);
    assert.strictEqual(reordered, true);

    assert.strictEqual(manager.getPageByIndex(0)?.id, page3.id);
    assert.strictEqual(manager.getPageByIndex(0)?.pageNumber, 1);
    assert.strictEqual(manager.getPageByIndex(1)?.id, "page_init_1");
    assert.strictEqual(manager.getPageByIndex(1)?.pageNumber, 2);
    assert.strictEqual(manager.getPageByIndex(2)?.id, page2.id);
    assert.strictEqual(manager.getPageByIndex(2)?.pageNumber, 3);
  });

  test("updatePageOrientation updates dimensions and orientation correctly", () => {
    const doc = createTestDocument();
    const manager = new PageManager(doc);

    const page = manager.getPage("page_init_1")!;
    assert.strictEqual(page.orientation, "portrait");
    assert.strictEqual(page.dimensions.width, 595.28);
    assert.strictEqual(page.dimensions.height, 841.89);

    manager.updatePageOrientation("page_init_1", "landscape");
    assert.strictEqual(page.orientation, "landscape");
    assert.strictEqual(page.dimensions.width, 841.89);
    assert.strictEqual(page.dimensions.height, 595.28);

    manager.updatePageOrientation("page_init_1", "portrait");
    assert.strictEqual(page.orientation, "portrait");
    assert.strictEqual(page.dimensions.width, 595.28);
    assert.strictEqual(page.dimensions.height, 841.89);
  });

  test("getNotebookTemplate and updateAllPagesTemplate updates all pages and metadata", () => {
    const doc = createTestDocument();
    const manager = new PageManager(doc);
    manager.addPage();

    const initialTemplate = manager.getNotebookTemplate();
    assert.strictEqual(initialTemplate.type, "ruled");

    manager.updateAllPagesTemplate({
      type: "grid",
      backgroundColor: "#f8f9fa",
      lineColor: "#cbd5e1",
      spacing: 32,
      opacity: 0.9
    });

    assert.strictEqual(manager.getPageByIndex(0)?.template.type, "grid");
    assert.strictEqual(manager.getPageByIndex(1)?.template.type, "grid");
    assert.strictEqual(doc.metadata.defaultTemplate, "grid");
    assert.strictEqual(doc.metadata.defaultPaperBackground, "#f8f9fa");
    assert.strictEqual(doc.metadata.defaultLineColor, "#cbd5e1");
    assert.strictEqual(doc.metadata.defaultLineSpacing, 32);

    const updatedTemplate = manager.getNotebookTemplate();
    assert.strictEqual(updatedTemplate.type, "grid");
    assert.strictEqual(updatedTemplate.spacing, 32);
  });

  test("getNotebookOrientation and updateAllPagesOrientation updates all pages and metadata", () => {
    const doc = createTestDocument();
    const manager = new PageManager(doc);
    manager.addPage();

    assert.strictEqual(manager.getNotebookOrientation(), "portrait");

    manager.updateAllPagesOrientation("landscape");

    assert.strictEqual(manager.getNotebookOrientation(), "landscape");
    assert.strictEqual(manager.getPageByIndex(0)?.orientation, "landscape");
    assert.strictEqual(manager.getPageByIndex(1)?.orientation, "landscape");
    assert.strictEqual(manager.getPageByIndex(0)?.dimensions.width, 841.89);
    assert.strictEqual(manager.getPageByIndex(0)?.dimensions.height, 595.28);
    assert.strictEqual(doc.metadata.defaultOrientation, "landscape");

    manager.updateAllPagesOrientation("portrait");
    assert.strictEqual(manager.getNotebookOrientation(), "portrait");
    assert.strictEqual(manager.getPageByIndex(0)?.orientation, "portrait");
    assert.strictEqual(manager.getPageByIndex(1)?.orientation, "portrait");
    assert.strictEqual(manager.getPageByIndex(0)?.dimensions.width, 595.28);
    assert.strictEqual(manager.getPageByIndex(0)?.dimensions.height, 841.89);
    assert.strictEqual(doc.metadata.defaultOrientation, "portrait");
  });
});
