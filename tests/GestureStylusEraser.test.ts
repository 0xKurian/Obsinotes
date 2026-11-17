import { test, describe } from "node:test";
import assert from "node:assert";
import { GestureInputRouter, GestureInputDelegate } from "../src/view/GestureInputRouter";
import { InkingController } from "../src/ink/InkingController";
import { StrokeGeometry } from "../src/ink/StrokeGeometry";
import { PageData, StrokeObject, ToolType } from "../src/types";

type EventMap = Map<string, Array<(ev: unknown) => void>>;

function createMockElement() {
  const classes = new Set<string>();
  const listeners: EventMap = new Map();
  const styles: Record<string, string> = {};

  return {
    classes,
    listeners,
    styles,
    scrollLeft: 0,
    scrollTop: 0,
    width: 595,
    height: 842,
    dataset: { pageWidth: "595", pageHeight: "842" },
    addClass: (c: string) => classes.add(c),
    removeClass: (c: string) => classes.delete(c),
    toggleClass: (c: string, force?: boolean) => {
      const shouldAdd = force !== undefined ? force : !classes.has(c);
      if (shouldAdd) classes.add(c);
      else classes.delete(c);
    },
    hasClass: (c: string) => classes.has(c),
    setCssStyles: (s: Record<string, string>) => Object.assign(styles, s),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 595, height: 842, right: 595, bottom: 842 }),
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    getContext: () => ({
      clearRect: () => {},
      save: () => {},
      restore: () => {},
      setTransform: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      arc: () => {}
    })
  };
}

function makeStroke(id: string, x1: number, x2: number, y: number): StrokeObject {
  const points = [
    { x: x1, y, pressure: 0.5, timestamp: 10 },
    { x: (x1 + x2) / 2, y, pressure: 0.5, timestamp: 20 },
    { x: x2, y, pressure: 0.5, timestamp: 30 }
  ];
  return {
    id,
    elementType: "stroke",
    tool: "pressure",
    color: "#1e293b",
    width: 2.5,
    opacity: 1,
    points,
    bounds: StrokeGeometry.computeBoundingBox(points, 2.5),
    createdAt: 10
  };
}

function createTestHarness() {
  const rootEl = createMockElement();
  const scrollerEl = createMockElement();
  const pagesContainerEl = createMockElement();
  const pageFrameEl = createMockElement();
  const activeCanvasEl = createMockElement();
  const committedCanvasEl = createMockElement();
  const eraserCursorEl = createMockElement();
  eraserCursorEl.addClass("is-hidden");

  const page: PageData = {
    id: "page_1",
    pageNumber: 1,
    template: { type: "ruled", backgroundColor: "#ffffff", lineColor: "#94a3b8", lineSpacing: 24 },
    dimensions: { width: 595, height: 842, unit: "pt" },
    strokes: [makeStroke("hello_stroke", 100, 180, 120)],
    shapes: [],
    texts: [],
    images: []
  };

  const toolbarToolHistory: ToolType[] = [];
  const committedNewStrokes: StrokeObject[] = [];
  const windowListeners: EventMap = new Map();

  const inking = new InkingController({
    onStrokeCommitted: (_pageId, stroke) => {
      page.strokes.push(stroke);
      committedNewStrokes.push(stroke);
    },
    onStrokesErased: (_pageId, remainingStrokes, remainingShapes) => {
      page.strokes = remainingStrokes;
      if (remainingShapes) {
        page.shapes = remainingShapes;
      }
    }
  });
  inking.setTool("pressure");
  inking.setEraserMode("stroke");
  inking.setEraserRadius(15);

  const registerOnMap = (map: EventMap, type: string, cb: (ev: unknown) => void) => {
    if (!map.has(type)) map.set(type, []);
    map.get(type)!.push(cb);
  };

  const delegate: GestureInputDelegate = {
    app: {} as GestureInputDelegate["app"],
    getRootContainerEl: () => rootEl as unknown as HTMLElement,
    getScrollerEl: () => scrollerEl as unknown as HTMLElement,
    getPagesContainerEl: () => pagesContainerEl as unknown as HTMLElement,
    getEraserCursorEl: () => eraserCursorEl as unknown as HTMLElement,
    getFilePath: () => "test.md",
    getCurrentPageNumber: () => 1,
    getPageByNumber: () => page,
    getAllPages: () => [page],
    getInkingController: () => inking,
    getSelectionController: () => ({
      hasSelection: () => false,
      handlePointerDown: () => {},
      handlePointerMove: () => {},
      handlePointerUp: () => {},
      clearSelection: () => {}
    }) as unknown as ReturnType<GestureInputDelegate["getSelectionController"]>,
    getTextController: () => ({ isEditing: () => false, commitActiveEdit: () => {} }) as unknown as ReturnType<GestureInputDelegate["getTextController"]>,
    getImageController: () => ({ getSelectedImageId: () => null }) as unknown as ReturnType<GestureInputDelegate["getImageController"]>,
    getHistoryManager: () => ({ execute: () => {} }) as unknown as ReturnType<GestureInputDelegate["getHistoryManager"]>,
    getCanvasHost: () => ({ ensurePageCanvasesMounted: () => {} }) as unknown as ReturnType<GestureInputDelegate["getCanvasHost"]>,
    getZoomController: () => ({
      getZoomLevel: () => 1,
      flushCanvasResolutionUpdate: () => {},
      scheduleCanvasResolutionUpdate: () => {}
    }) as unknown as ReturnType<GestureInputDelegate["getZoomController"]>,
    getDragCoordinator: () => ({
      isDraggingSelection: () => false,
      setDragStartClient: () => {},
      updateSelectionDrag: () => {},
      finishSelectionDrag: () => {},
      cancelSelectionDrag: () => {}
    }) as unknown as ReturnType<GestureInputDelegate["getDragCoordinator"]>,
    getSelectionSubMode: () => "lasso",
    getCurrentShapeType: () => "rectangle",
    isShapeFillEnabled: () => false,
    getShapeFillColor: () => "#ffffff",
    getCurrentStickyColor: () => "#fef08a",
    getCurrentTextOptions: () => ({ fontSize: 14, fontWeight: "normal", italic: false, underline: false, textAlign: "left", color: "#1e293b" }),
    getDrawWithFinger: () => false,
    getTwoFingerTapUndoRedo: () => true,
    getStylusButtonAction: () => "hold",
    isDarkColor: () => false,
    resolveResourcePath: (p) => p,
    blurFocusedToolbarControl: () => {},
    setToolbarDrawingActive: () => {},
    setToolbarActiveTool: (tool) => {
      toolbarToolHistory.push(tool);
    },
    setActiveTool: (tool) => {
      inking.setTool(tool);
      toolbarToolHistory.push(tool);
    },
    onUndo: () => {},
    onRedo: () => {},
    handleMutation: () => {},
    insertTextBox: () => {},
    insertStickyNote: () => {},
    openImagePicker: () => {},
    openPdfPicker: () => {},
    addNewPage: () => {},
    duplicateCurrentPage: () => {},
    openQuickRenameModal: () => {},
    openExportModal: () => {},
    promptAndImportLocalPdf: async () => {},
    promptAndImportVaultPdf: async () => {},
    registerDomEvent: (el, type, cb) => {
      const mockEl = el as unknown as ReturnType<typeof createMockElement>;
      registerOnMap(mockEl.listeners, type, cb as (ev: unknown) => void);
    },
    registerWindowDomEvent: (type, cb) => {
      registerOnMap(windowListeners, type, cb as (ev: unknown) => void);
    }
  };

  const router = new GestureInputRouter(delegate);
  router.bindScrollerAndGlobalEvents(
    scrollerEl as unknown as HTMLElement,
    pagesContainerEl as unknown as HTMLElement,
    rootEl as unknown as HTMLElement
  );
  router.bindPageInteractionEvents(
    page,
    pageFrameEl as unknown as HTMLElement,
    activeCanvasEl as unknown as HTMLCanvasElement,
    committedCanvasEl as unknown as HTMLCanvasElement
  );

  const emitCanvas = (type: string, props: Record<string, unknown>) => {
    let prevented = false;
    let stopped = false;
    const ev = {
      pointerId: 1,
      pointerType: "pen",
      button: 0,
      buttons: 0,
      pressure: 0,
      clientX: 0,
      clientY: 0,
      timeStamp: 100,
      preventDefault: () => {
        prevented = true;
      },
      stopPropagation: () => {
        stopped = true;
      },
      ...props
    };
    for (const cb of activeCanvasEl.listeners.get(type) ?? []) {
      cb(ev);
    }
    return { prevented, stopped, ev };
  };

  return {
    page,
    inking,
    router,
    rootEl,
    eraserCursorEl,
    toolbarToolHistory,
    committedNewStrokes,
    emitCanvas
  };
}

describe("GestureInputRouter S-Pen Side-Button Eraser Integration", () => {
  test("erases Hello stroke with standard pen secondary button press and reverts to pen", () => {
    const h = createTestHarness();

    h.emitCanvas("pointerdown", { pointerType: "pen", button: 2, buttons: 3, pressure: 0.4, clientX: 80, clientY: 120, timeStamp: 100 });
    assert.strictEqual(h.inking.activeTool, "eraser");
    assert.strictEqual(h.rootEl.hasClass("is-tool-eraser"), true);
    assert.strictEqual(h.eraserCursorEl.hasClass("is-hidden"), false);

    h.emitCanvas("pointermove", { pointerType: "pen", button: -1, buttons: 3, pressure: 0.4, clientX: 130, clientY: 120, timeStamp: 116 });
    h.emitCanvas("pointerup", { pointerType: "pen", button: 0, buttons: 0, pressure: 0, clientX: 130, clientY: 120, timeStamp: 132 });

    assert.strictEqual(h.page.strokes.length, 0);
    assert.strictEqual(h.committedNewStrokes.length, 0);
    assert.strictEqual(h.inking.activeTool, "pressure");
    assert.strictEqual(h.rootEl.hasClass("is-tool-eraser"), false);
  });

  test("erases Hello stroke when S-Pen button triggers mouse-emulated button=2 after pen hover", () => {
    const h = createTestHarness();

    // Hover pen establishes recent pen activity
    h.emitCanvas("pointermove", { pointerType: "pen", button: -1, buttons: 0, pressure: 0, clientX: 90, clientY: 120, timeStamp: 90 });

    // Secondary click arrives as mouse button=2
    const down = h.emitCanvas("pointerdown", { pointerId: 7, pointerType: "mouse", button: 2, buttons: 2, pressure: 0.5, clientX: 100, clientY: 120, timeStamp: 100 });
    assert.strictEqual(down.prevented, true);
    assert.strictEqual(h.router.isPanning, false);
    assert.strictEqual(h.inking.activeTool, "eraser");

    h.emitCanvas("pointermove", { pointerId: 7, pointerType: "mouse", button: -1, buttons: 2, pressure: 0.5, clientX: 140, clientY: 120, timeStamp: 116 });
    h.emitCanvas("pointerup", { pointerId: 7, pointerType: "mouse", button: 2, buttons: 0, pressure: 0, clientX: 140, clientY: 120, timeStamp: 132 });

    assert.strictEqual(h.page.strokes.length, 0);
    assert.strictEqual(h.committedNewStrokes.length, 0);
    assert.strictEqual(h.inking.activeTool, "pressure");
  });

  test("recovers eraser session on pointermove when WebView swallows or cancels pointerdown while side button is held", () => {
    const h = createTestHarness();

    // Android hover quirk with button held
    h.emitCanvas("pointermove", { pointerType: "pen", button: -1, buttons: 1, pressure: 0, clientX: 80, clientY: 120, timeStamp: 90 });
    assert.strictEqual(h.inking.activeTool, "eraser");

    // Simulate WebView cancelling pointerdown before contact drag continues
    h.emitCanvas("pointerdown", { pointerType: "pen", button: 2, buttons: 3, pressure: 0.4, clientX: 80, clientY: 120, timeStamp: 100 });
    h.emitCanvas("pointercancel", { pointerType: "pen", button: 0, buttons: 0, pressure: 0, clientX: 80, clientY: 120, timeStamp: 102 });

    // Contact move arrives while side button is still pressed over the Hello stroke
    h.emitCanvas("pointermove", { pointerType: "pen", button: -1, buttons: 33, pressure: 0.45, clientX: 110, clientY: 120, timeStamp: 112 });
    assert.strictEqual(h.inking.activeTool, "eraser");
    assert.strictEqual(h.inking.isCurrentlyDrawing("page_1"), true);

    h.emitCanvas("pointermove", { pointerType: "pen", button: -1, buttons: 33, pressure: 0.45, clientX: 150, clientY: 120, timeStamp: 124 });
    // Simulate lifting tip back into hover (pressure=0, buttons=0) without pointerup
    h.emitCanvas("pointermove", { pointerType: "pen", button: -1, buttons: 0, pressure: 0, clientX: 150, clientY: 120, timeStamp: 140 });

    assert.strictEqual(h.page.strokes.length, 0);
    assert.strictEqual(h.committedNewStrokes.length, 0);
    assert.strictEqual(h.inking.isCurrentlyDrawing(), false);
    assert.strictEqual(h.inking.activeTool, "pressure");
  });

  test("prevents default on mousedown and auxclick during stylus button usage", () => {
    const h = createTestHarness();

    h.emitCanvas("pointermove", { pointerType: "pen", button: -1, buttons: 2, pressure: 0, clientX: 90, clientY: 120, timeStamp: 90 });
    const md = h.emitCanvas("mousedown", { button: 2, buttons: 2, clientX: 90, clientY: 120 });
    const ac = h.emitCanvas("auxclick", { button: 2, buttons: 0, clientX: 90, clientY: 120 });

    assert.strictEqual(md.prevented, true);
    assert.strictEqual(ac.prevented, true);
    assert.strictEqual(ac.stopped, true);
  });
});
