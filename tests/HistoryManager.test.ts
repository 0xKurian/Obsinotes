import { test, describe } from "node:test";
import assert from "node:assert";
import {
  AddStrokeCommand,
  ConvertShapeCommand,
  DeleteElementsCommand,
  EraseStrokesCommand,
  HistoryManager,
  TransformElementsCommand,
  MoveElementsAcrossPagesCommand
} from "../src/history/HistoryManager";
import { PageData, ShapeObject, StrokeObject } from "../src/types";

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
});
