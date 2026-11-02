import { test, describe } from "node:test";
import assert from "node:assert";
import { SelectionController } from "../src/selection/SelectionController";
import { PageData, ShapeObject, StrokeObject, TextObject } from "../src/types";

describe("SelectionController", () => {
  function createSamplePage(): PageData {
    const stroke: StrokeObject = {
      id: "s1",
      tool: "pen",
      color: "#000000",
      width: 2,
      opacity: 1,
      points: [
        { x: 30, y: 30, pressure: 0.5, timestamp: 1 },
        { x: 40, y: 40, pressure: 0.5, timestamp: 2 }
      ],
      bounds: { minX: 28, minY: 28, maxX: 42, maxY: 42 },
      createdAt: 1
    };

    const shape: ShapeObject = {
      id: "sh1",
      type: "rectangle",
      color: "#000000",
      strokeWidth: 2,
      bounds: { minX: 50, minY: 50, maxX: 80, maxY: 80 },
      geometryData: { x: 50, y: 50, width: 30, height: 30 }
    };

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
      strokes: [stroke],
      shapes: [shape],
      texts: [],
      images: []
    };
  }

  function createMockCanvas(): HTMLCanvasElement {
    const mockCtx = {
      clearRect: () => {},
      save: () => {},
      restore: () => {},
      strokeRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      setLineDash: () => {},
      closePath: () => {},
      rect: () => {},
      ellipse: () => {},
      quadraticCurveTo: () => {},
      setTransform: () => {}
    };

    return {
      width: 595,
      height: 842,
      getContext: () => mockCtx,
      setPointerCapture: () => {},
      releasePointerCapture: () => {}
    } as unknown as HTMLCanvasElement;
  }

  test("selects elements via lasso loop and clears selection", () => {
    let selectionState = false;
    const controller = new SelectionController({
      onSelectionChanged: (has) => {
        selectionState = has;
      },
      onTransformCommitted: () => {},
      onElementsDeleted: () => {},
      onRequestRedraw: () => {}
    });

    const page = createSamplePage();
    const canvas = createMockCanvas();

    const mockDown = { button: 0, pointerType: "mouse", pointerId: 1 } as PointerEvent;
    controller.handlePointerDown(mockDown, page, canvas, { x: 10, y: 10 });

    controller.handlePointerMove(canvas, { x: 100, y: 10 });
    controller.handlePointerMove(canvas, { x: 100, y: 100 });
    controller.handlePointerMove(canvas, { x: 10, y: 100 });
    controller.handlePointerMove(canvas, { x: 10, y: 10 });

    const mockUp = { pointerId: 1 } as PointerEvent;
    controller.handlePointerUp(mockUp, page, canvas);

    assert.strictEqual(selectionState, true);
    assert.strictEqual(controller.hasSelection(), true);
    assert.strictEqual(controller.getSelectedStrokes().length, 1);
    assert.strictEqual(controller.getSelectedShapes().length, 1);

    controller.clearSelection(canvas);
    assert.strictEqual(selectionState, false);
    assert.strictEqual(controller.hasSelection(), false);
  });

  test("deleteSelection triggers callback and clears selected items", () => {
    let deletedCount = 0;
    const controller = new SelectionController({
      onSelectionChanged: () => {},
      onTransformCommitted: () => {},
      onElementsDeleted: (_p, strokes, shapes) => {
        deletedCount = strokes.length + shapes.length;
      },
      onRequestRedraw: () => {}
    });

    const page = createSamplePage();
    const canvas = createMockCanvas();

    controller.handlePointerDown(
      { button: 0, pointerType: "mouse", pointerId: 1 } as PointerEvent,
      page,
      canvas,
      { x: 10, y: 10 }
    );
    controller.handlePointerMove(canvas, { x: 100, y: 10 });
    controller.handlePointerMove(canvas, { x: 100, y: 100 });
    controller.handlePointerMove(canvas, { x: 10, y: 100 });
    controller.handlePointerUp({ pointerId: 1 } as PointerEvent, page, canvas);

    controller.deleteSelection(page, canvas);
    assert.strictEqual(deletedCount, 2);
    assert.strictEqual(controller.hasSelection(), false);
  });

  test("changeColor and changeWidth mutate selection and commit", () => {
    let committedColor = "";
    let committedWidth = 0;

    const controller = new SelectionController({
      onSelectionChanged: () => {},
      onTransformCommitted: (_p, _ps, nextStrokes) => {
        if (nextStrokes.length > 0) {
          committedColor = nextStrokes[0].color;
          committedWidth = nextStrokes[0].width;
        }
      },
      onElementsDeleted: () => {},
      onRequestRedraw: () => {}
    });

    const page = createSamplePage();
    const canvas = createMockCanvas();

    controller.handlePointerDown(
      { button: 0, pointerType: "mouse", pointerId: 1 } as PointerEvent,
      page,
      canvas,
      { x: 10, y: 10 }
    );
    controller.handlePointerMove(canvas, { x: 100, y: 10 });
    controller.handlePointerMove(canvas, { x: 100, y: 100 });
    controller.handlePointerMove(canvas, { x: 10, y: 100 });
    controller.handlePointerUp({ pointerId: 1 } as PointerEvent, page, canvas);

    controller.changeColor("#2563eb", page, canvas);
    assert.strictEqual(committedColor, "#2563eb");

    controller.changeWidth(6.0, page, canvas);
    assert.strictEqual(committedWidth, 6.0);
  });

  test("moves selected elements and commits transform on pointerup", () => {
    let committed = false;
    let redrawCount = 0;
    const controller = new SelectionController({
      onSelectionChanged: () => {},
      onTransformCommitted: (_p, prevStrokes, nextStrokes) => {
        committed = true;
        assert.notDeepStrictEqual(prevStrokes[0].points, nextStrokes[0].points);
      },
      onElementsDeleted: () => {},
      onRequestRedraw: () => {
        redrawCount++;
      }
    });

    const page = createSamplePage();
    const canvas = createMockCanvas();

    controller.handlePointerDown(
      { button: 0, pointerType: "mouse", pointerId: 1 } as PointerEvent,
      page,
      canvas,
      { x: 10, y: 10 }
    );
    controller.handlePointerMove(canvas, { x: 100, y: 10 });
    controller.handlePointerMove(canvas, { x: 100, y: 100 });
    controller.handlePointerMove(canvas, { x: 10, y: 100 });
    controller.handlePointerUp({ pointerId: 1 } as PointerEvent, page, canvas);

    assert.strictEqual(controller.hasSelection(), true);
    const boundsBefore = controller.getCombinedBounds();
    assert.notStrictEqual(boundsBefore, null);

    const centerX = (boundsBefore!.minX + boundsBefore!.maxX) / 2;
    const centerY = (boundsBefore!.minY + boundsBefore!.maxY) / 2;

    controller.handlePointerDown(
      { button: 0, pointerType: "mouse", pointerId: 1 } as PointerEvent,
      page,
      canvas,
      { x: centerX, y: centerY }
    );
    controller.handlePointerMove(canvas, { x: centerX + 50, y: centerY + 50 });
    controller.handlePointerUp({ pointerId: 1 } as PointerEvent, page, canvas);

    assert.strictEqual(committed, true);
    assert.strictEqual(redrawCount > 0, true);
    const boundsAfter = controller.getCombinedBounds();
    assert.notStrictEqual(boundsAfter, null);
    assert.strictEqual(boundsAfter!.minX > boundsBefore!.minX, true);
  });

  test("cross-page drag moves elements to targetPage and invokes onElementsMovedAcrossPages", () => {
    let movedAcross = false;
    let targetPageReceived = "";

    const controller = new SelectionController({
      onSelectionChanged: () => {},
      onTransformCommitted: () => {},
      onElementsDeleted: () => {},
      onRequestRedraw: () => {},
      onElementsMovedAcrossPages: (srcId, tgtId, _s, nextStrokes) => {
        movedAcross = true;
        targetPageReceived = tgtId;
        assert.strictEqual(srcId, "page_1");
        assert.strictEqual(tgtId, "page_2");
        assert.strictEqual(nextStrokes.length, 1);
      }
    });

    const page1 = createSamplePage();
    const page2 = createSamplePage();
    page2.id = "page_2";
    page2.pageNumber = 2;

    const canvas1 = createMockCanvas();
    const canvas2 = createMockCanvas();

    controller.handlePointerDown(
      { button: 0, pointerType: "mouse", pointerId: 1 } as PointerEvent,
      page1,
      canvas1,
      { x: 10, y: 10 }
    );
    controller.handlePointerMove(canvas1, { x: 100, y: 10 });
    controller.handlePointerMove(canvas1, { x: 100, y: 100 });
    controller.handlePointerMove(canvas1, { x: 10, y: 100 });
    controller.handlePointerUp({ pointerId: 1 } as PointerEvent, page1, canvas1);

    assert.strictEqual(controller.hasSelection(), true);
    assert.strictEqual(controller.getActivePageId(), "page_1");

    const bounds = controller.getCombinedBounds()!;
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;

    controller.handlePointerDown(
      { button: 0, pointerType: "mouse", pointerId: 1 } as PointerEvent,
      page1,
      canvas1,
      { x: cx, y: cy }
    );

    controller.handlePointerMove(
      canvas1,
      { x: cx, y: cy + 500 },
      page2,
      canvas2,
      { x: 150, y: 150 }
    );

    controller.handlePointerUp(
      { pointerId: 1 } as PointerEvent,
      page1,
      canvas1,
      page2,
      canvas2
    );

    assert.strictEqual(movedAcross, true);
    assert.strictEqual(targetPageReceived, "page_2");
    assert.strictEqual(controller.getActivePageId(), "page_2");
  });

  test("commitMove transfers elements smoothly across pages", () => {
    let movedAcross = false;
    let targetPageReceived = "";
    const controller = new SelectionController({
      onSelectionChanged: () => {},
      onTransformCommitted: () => {},
      onElementsDeleted: () => {},
      onRequestRedraw: () => {},
      onElementsMovedAcrossPages: (srcId, tgtId, _s, nextStrokes) => {
        movedAcross = true;
        targetPageReceived = tgtId;
        assert.strictEqual(srcId, "page_1");
        assert.strictEqual(tgtId, "page_2");
        assert.strictEqual(nextStrokes.length, 1);
      }
    });

    const page1 = createSamplePage();
    const page2 = createSamplePage();
    page2.id = "page_2";
    page2.pageNumber = 2;

    const canvas1 = createMockCanvas();
    const canvas2 = createMockCanvas();

    controller.handlePointerDown(
      { button: 0, pointerType: "mouse", pointerId: 1 } as PointerEvent,
      page1,
      canvas1,
      { x: 10, y: 10 }
    );
    controller.handlePointerMove(canvas1, { x: 100, y: 10 });
    controller.handlePointerMove(canvas1, { x: 100, y: 100 });
    controller.handlePointerMove(canvas1, { x: 10, y: 100 });
    controller.handlePointerUp({ pointerId: 1 } as PointerEvent, page1, canvas1);

    assert.strictEqual(controller.hasSelection(), true);

    const bounds = controller.getCombinedBounds()!;
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;

    controller.handlePointerDown(
      { button: 0, pointerType: "mouse", pointerId: 1 } as PointerEvent,
      page1,
      canvas1,
      { x: cx, y: cy }
    );

    controller.commitMove(
      page2,
      { minX: 200, minY: 200, maxX: 230, maxY: 230 },
      canvas2
    );

    assert.strictEqual(movedAcross, true);
    assert.strictEqual(targetPageReceived, "page_2");
    assert.strictEqual(controller.getActivePageId(), "page_2");
    assert.ok(Math.abs((controller.getCombinedBounds()?.minX ?? 0) - 200) < 2);
    assert.ok(Math.abs((controller.getCombinedBounds()?.minY ?? 0) - 200) < 2);
  });

  test("selects text via lasso and commits transformed text position", () => {
    let committedTexts: TextObject[] = [];
    const controller = new SelectionController({
      onSelectionChanged: () => {},
      onTransformCommitted: (
        pageId,
        prevStrokes,
        nextStrokes,
        prevShapes,
        nextShapes,
        prevImages,
        nextImages,
        prevTexts,
        nextTexts
      ) => {
        committedTexts = nextTexts || [];
      },
      onElementsDeleted: () => {},
      onRequestRedraw: () => {}
    });

    const page = createSamplePage();
    page.strokes = [];
    page.shapes = [];
    page.texts = [
      {
        id: "t_sel",
        elementType: "text",
        x: 30,
        y: 30,
        width: 120,
        height: 60,
        content: "Selectable text",
        fontSize: 14,
        fontFamily: "Inter",
        fontWeight: "normal",
        color: "#000",
        textAlign: "left"
      }
    ];

    const canvas = createMockCanvas();

    controller.handlePointerDown(
      { button: 0, pointerType: "mouse", pointerId: 1 } as PointerEvent,
      page,
      canvas,
      { x: 10, y: 10 }
    );
    controller.handlePointerMove(canvas, { x: 180, y: 10 });
    controller.handlePointerMove(canvas, { x: 180, y: 120 });
    controller.handlePointerMove(canvas, { x: 10, y: 120 });
    controller.handlePointerUp({ pointerId: 1 } as PointerEvent, page, canvas);

    assert.strictEqual(controller.hasSelection(), true);
    assert.strictEqual(controller.getSelectedTexts().length, 1);
    assert.strictEqual(controller.getSelectedTexts()[0].id, "t_sel");

    const bounds = controller.getCombinedBounds()!;
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;

    controller.handlePointerDown(
      { button: 0, pointerType: "mouse", pointerId: 1 } as PointerEvent,
      page,
      canvas,
      { x: cx, y: cy }
    );
    controller.handlePointerMove(canvas, { x: cx + 50, y: cy + 30 });
    controller.handlePointerUp({ pointerId: 1 } as PointerEvent, page, canvas);

    assert.strictEqual(committedTexts.length, 1);
    assert.strictEqual(committedTexts[0].id, "t_sel");
    assert.ok(committedTexts[0].x > 30);
  });
});
