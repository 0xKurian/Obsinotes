import { test, describe } from "node:test";
import assert from "node:assert";
import {
  AddStrokeCommand,
  AddElementsCommand,
  ConvertShapeCommand,
  DeleteElementsCommand,
  EraseStrokesCommand,
  HistoryManager,
  TransformElementsCommand,
  MoveElementsAcrossPagesCommand,
  DeletePageCommand
} from "../src/history/HistoryManager";
import { PageData, ShapeObject, StrokeObject, TextObject, ImageObject } from "../src/types";

describe("HistoryManager", () => {
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

  function createStroke(id: string): StrokeObject {
    return {
      id,
      tool: "pen",
      color: "#000000",
      width: 2,
      opacity: 1,
      points: [
        { x: 10, y: 10, pressure: 0.5, timestamp: 1 },
        { x: 20, y: 20, pressure: 0.5, timestamp: 2 }
      ],
      bounds: { minX: 10, minY: 10, maxX: 20, maxY: 20 },
      createdAt: 1
    };
  }

  test("AddStrokeCommand adds, undoes, and redoes stroke", () => {
    const page = createSamplePage();
    const history = new HistoryManager();
    const stroke = createStroke("s1");

    let mutateCount = 0;
    const cmd = new AddStrokeCommand(page, stroke, () => mutateCount++);

    history.execute(cmd);
    assert.strictEqual(page.strokes.length, 1);
    assert.strictEqual(mutateCount, 1);
    assert.strictEqual(history.canUndo(), true);
    assert.strictEqual(history.canRedo(), false);

    history.undo();
    assert.strictEqual(page.strokes.length, 0);
    assert.strictEqual(mutateCount, 2);
    assert.strictEqual(history.canUndo(), false);
    assert.strictEqual(history.canRedo(), true);

    history.redo();
    assert.strictEqual(page.strokes.length, 1);
    assert.strictEqual(page.strokes[0].id, "s1");
    assert.strictEqual(mutateCount, 3);
  });

  test("EraseStrokesCommand restores deleted strokes upon undo", () => {
    const page = createSamplePage();
    const history = new HistoryManager();
    const s1 = createStroke("s1");
    const s2 = createStroke("s2");
    page.strokes = [s1, s2];

    const cmd = new EraseStrokesCommand(page, [s1, s2], [s2], () => {});
    history.execute(cmd);
    assert.strictEqual(page.strokes.length, 1);
    assert.strictEqual(page.strokes[0].id, "s2");

    history.undo();
    assert.strictEqual(page.strokes.length, 2);

    history.redo();
    assert.strictEqual(page.strokes.length, 1);
  });

  test("ConvertShapeCommand safely converts stroke to shape and reverts cleanly", () => {
    const page = createSamplePage();
    const history = new HistoryManager();
    const rawStroke = createStroke("raw_circle");
    page.strokes = [rawStroke];

    const circleShape: ShapeObject = {
      id: "shape_circle_1",
      type: "circle",
      color: "#000000",
      strokeWidth: 2,
      bounds: { minX: 0, minY: 0, maxX: 40, maxY: 40 },
      geometryData: { cx: 20, cy: 20, r: 20 }
    };

    const cmd = new ConvertShapeCommand(page, rawStroke, circleShape, () => {});
    history.execute(cmd);
    assert.strictEqual(page.strokes.length, 0);
    assert.strictEqual(page.shapes.length, 1);
    assert.strictEqual(page.shapes[0].id, "shape_circle_1");

    history.undo();
    assert.strictEqual(page.shapes.length, 0);
    assert.strictEqual(page.strokes.length, 1);
    assert.strictEqual(page.strokes[0].id, "raw_circle");

    history.redo();
    assert.strictEqual(page.strokes.length, 0);
    assert.strictEqual(page.shapes.length, 1);
  });

  test("TransformElementsCommand applies new coordinates and restores previous upon undo", () => {
    const page = createSamplePage();
    const history = new HistoryManager();
    const prevStroke = createStroke("s1");
    const nextStroke: StrokeObject = {
      ...prevStroke,
      points: [
        { x: 50, y: 50, pressure: 0.5, timestamp: 1 },
        { x: 60, y: 60, pressure: 0.5, timestamp: 2 }
      ],
      bounds: { minX: 50, minY: 50, maxX: 60, maxY: 60 }
    };
    page.strokes = [prevStroke];

    const cmd = new TransformElementsCommand(page, [prevStroke], [nextStroke], [], [], () => {});
    history.execute(cmd);
    assert.strictEqual(page.strokes[0].bounds.minX, 50);

    history.undo();
    assert.strictEqual(page.strokes[0].bounds.minX, 10);

    history.redo();
    assert.strictEqual(page.strokes[0].bounds.minX, 50);
  });

  test("DeleteElementsCommand removes and revives elements", () => {
    const page = createSamplePage();
    const history = new HistoryManager();
    const s1 = createStroke("s1");
    page.strokes = [s1];

    const cmd = new DeleteElementsCommand(page, [s1], [], () => {});
    history.execute(cmd);
    assert.strictEqual(page.strokes.length, 0);

    history.undo();
    assert.strictEqual(page.strokes.length, 1);
    assert.strictEqual(page.strokes[0].id, "s1");

    history.redo();
    assert.strictEqual(page.strokes.length, 0);
  });

  test("MoveElementsAcrossPagesCommand transfers elements between pages and reverts cleanly", () => {
    const page1 = createSamplePage();
    const page2 = createSamplePage();
    page2.id = "page_2";
    page2.pageNumber = 2;

    const s1 = createStroke("s1");
    page1.strokes = [s1];

    const s1Moved: StrokeObject = {
      ...s1,
      points: s1.points.map((p) => ({ ...p, x: p.x + 100 }))
    };

    let mutateCalled = false;
    const cmd = new MoveElementsAcrossPagesCommand(
      page1,
      page2,
      [s1],
      [s1Moved],
      [],
      [],
      () => {
        mutateCalled = true;
      }
    );

    const history = new HistoryManager();
    history.execute(cmd);

    assert.strictEqual(mutateCalled, true);
    assert.strictEqual(page1.strokes.length, 0);
    assert.strictEqual(page2.strokes.length, 1);
    assert.strictEqual(page2.strokes[0].points[0].x, 110);

    history.undo();
    assert.strictEqual(page1.strokes.length, 1);
    assert.strictEqual(page2.strokes.length, 0);
    assert.strictEqual(page1.strokes[0].points[0].x, 10);

    history.redo();
    assert.strictEqual(page1.strokes.length, 0);
    assert.strictEqual(page2.strokes.length, 1);
  });

  test("history stack caps at maximum limit", () => {
    const page = createSamplePage();
    const history = new HistoryManager(3);

    for (let i = 0; i < 5; i++) {
      const stroke = createStroke(`s_${i}`);
      history.execute(new AddStrokeCommand(page, stroke, () => {}));
    }

    assert.strictEqual(history.canUndo(), true);
    history.undo();
    history.undo();
    history.undo();
    assert.strictEqual(history.canUndo(), false);
  });

  test("AddElementsCommand adds, undoes, and redoes strokes, shapes, texts, and images", () => {
    const page = createSamplePage();
    const history = new HistoryManager();
    const s1 = createStroke("s_dup");
    const sh1: ShapeObject = {
      id: "sh_dup",
      type: "rectangle",
      color: "#000000",
      strokeWidth: 2,
      bounds: { minX: 10, minY: 10, maxX: 50, maxY: 50 },
      geometryData: { x: 10, y: 10, width: 40, height: 40 }
    };
    const t1: TextObject = {
      id: "t_dup",
      elementType: "text",
      x: 20,
      y: 20,
      width: 100,
      height: 40,
      content: "Duplicated Text",
      fontSize: 16,
      fontFamily: "sans-serif",
      fontWeight: "normal",
      color: "#000000",
      textAlign: "left",
      bounds: { minX: 20, minY: 20, maxX: 120, maxY: 60 }
    };
    const img1: ImageObject = {
      id: "img_dup",
      elementType: "image",
      vaultPath: "assets/test.png",
      x: 40,
      y: 40,
      width: 120,
      height: 90,
      bounds: { minX: 40, minY: 40, maxX: 160, maxY: 130 }
    };

    let mutateCount = 0;
    const cmd = new AddElementsCommand(
      page,
      [s1],
      [sh1],
      () => {
        mutateCount++;
      },
      [t1],
      [img1]
    );

    history.execute(cmd);
    assert.strictEqual(page.strokes.length, 1);
    assert.strictEqual(page.shapes.length, 1);
    assert.strictEqual(page.texts.length, 1);
    assert.strictEqual(page.images.length, 1);
    assert.strictEqual(page.texts[0].id, "t_dup");
    assert.strictEqual(page.images[0].id, "img_dup");
    assert.strictEqual(mutateCount, 1);

    history.undo();
    assert.strictEqual(page.strokes.length, 0);
    assert.strictEqual(page.shapes.length, 0);
    assert.strictEqual(page.texts.length, 0);
    assert.strictEqual(page.images.length, 0);
    assert.strictEqual(mutateCount, 2);

    history.redo();
    assert.strictEqual(page.strokes.length, 1);
    assert.strictEqual(page.shapes.length, 1);
    assert.strictEqual(page.texts.length, 1);
    assert.strictEqual(page.images.length, 1);
    assert.strictEqual(mutateCount, 3);
  });

  test("EraseStrokesCommand erases and restores shapes alongside strokes", () => {
    const page = createSamplePage();
    const history = new HistoryManager();
    const s1 = createStroke("s_erase");
    const sh1: ShapeObject = {
      id: "sh_erase",
      type: "arrow",
      color: "#000000",
      strokeWidth: 2,
      bounds: { minX: 10, minY: 10, maxX: 100, maxY: 10 },
      geometryData: { x1: 10, y1: 10, x2: 100, y2: 10 }
    };
    page.strokes = [s1];
    page.shapes = [sh1];

    const cmd = new EraseStrokesCommand(page, [s1], [], () => {}, [sh1], []);
    history.execute(cmd);
    assert.strictEqual(page.strokes.length, 0);
    assert.strictEqual(page.shapes.length, 0);

    history.undo();
    assert.strictEqual(page.strokes.length, 1);
    assert.strictEqual(page.shapes.length, 1);
    assert.strictEqual(page.shapes[0].id, "sh_erase");

    history.redo();
    assert.strictEqual(page.strokes.length, 0);
    assert.strictEqual(page.shapes.length, 0);
  });

  test("DeletePageCommand deletes page, renumbers remaining pages, and restores on undo", () => {
    const p1 = createSamplePage();
    p1.id = "page_1";
    p1.pageNumber = 1;

    const p2 = createSamplePage();
    p2.id = "page_2";
    p2.pageNumber = 2;

    const p3 = createSamplePage();
    p3.id = "page_3";
    p3.pageNumber = 3;

    const pages: PageData[] = [p1, p2, p3];
    const history = new HistoryManager();
    let deletedPageId = "";
    let restoredPageId = "";

    const cmd = new DeletePageCommand(
      pages,
      p2,
      1,
      (deleted) => {
        deletedPageId = deleted.id;
      },
      (restored) => {
        restoredPageId = restored.id;
      }
    );

    history.execute(cmd);
    assert.strictEqual(pages.length, 2);
    assert.strictEqual(pages[0].id, "page_1");
    assert.strictEqual(pages[0].pageNumber, 1);
    assert.strictEqual(pages[1].id, "page_3");
    assert.strictEqual(pages[1].pageNumber, 2);
    assert.strictEqual(deletedPageId, "page_2");

    history.undo();
    assert.strictEqual(pages.length, 3);
    assert.strictEqual(pages[0].id, "page_1");
    assert.strictEqual(pages[0].pageNumber, 1);
    assert.strictEqual(pages[1].id, "page_2");
    assert.strictEqual(pages[1].pageNumber, 2);
    assert.strictEqual(pages[2].id, "page_3");
    assert.strictEqual(pages[2].pageNumber, 3);
    assert.strictEqual(restoredPageId, "page_2");

    history.redo();
    assert.strictEqual(pages.length, 2);
    assert.strictEqual(pages[1].id, "page_3");
    assert.strictEqual(pages[1].pageNumber, 2);
  });
});
