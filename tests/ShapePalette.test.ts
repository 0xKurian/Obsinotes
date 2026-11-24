import { test, describe } from "node:test";
import assert from "node:assert";
import { DocumentSerializer } from "../src/storage/DocumentSerializer";
import { HistoryManager, AddShapeCommand } from "../src/history/HistoryManager";
import { InkingController } from "../src/ink/InkingController";
import { GestureInputRouter, GestureInputDelegate } from "../src/view/GestureInputRouter";
import { PageCanvasHost } from "../src/view/PageCanvasHost";
import { NotebookDocument, PageData, ShapeObject, ShapeType, StrokePattern } from "../src/types";

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

type EventMap = Map<string, Array<(ev: unknown) => void>>;

function createMockCanvasContext() {
  const calls: string[] = [];
  return {
    calls,
    save: () => {},
    restore: () => {},
    setTransform: () => {},
    clearRect: () => calls.push("clearRect"),
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    quadraticCurveTo: () => {},
    closePath: () => {},
    rect: () => calls.push("rect"),
    arc: () => calls.push("arc"),
    ellipse: () => calls.push("ellipse"),
    fill: () => calls.push("fill"),
    stroke: () => calls.push("stroke"),
    strokeRect: () => {},
    fillRect: () => {},
    fillText: () => {},
    setLineDash: () => {},
    drawImage: () => {}
  };
}

function createMockElement() {
  const classes = new Set<string>();
  const listeners: EventMap = new Map();
  const styles: Record<string, string> = {};
  const ctx = createMockCanvasContext();

  return {
    classes,
    listeners,
    styles,
    ctx,
    scrollLeft: 0,
    scrollTop: 0,
    width: 595,
    height: 842,
    clientWidth: 595,
    clientHeight: 842,
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
    addEventListener: (type: string, cb: (ev: unknown) => void) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type)!.push(cb);
    },
    removeEventListener: (type: string, cb: (ev: unknown) => void) => {
      const arr = listeners.get(type);
      if (!arr) return;
      const idx = arr.indexOf(cb);
      if (idx >= 0) arr.splice(idx, 1);
    },
    getContext: () => ctx
  };
}

function dispatchPointer(
  map: EventMap,
  type: string,
  opts: {
    clientX: number;
    clientY: number;
    pointerId?: number;
    pointerType?: string;
    button?: number;
  }
) {
  const listeners = map.get(type) || [];
  let stopped = false;
  const ev = {
    clientX: opts.clientX,
    clientY: opts.clientY,
    pointerId: opts.pointerId ?? 1,
    pointerType: opts.pointerType ?? "mouse",
    button: opts.button ?? 0,
    buttons: opts.button === 0 || opts.button === undefined ? 1 : 0,
    pressure: 0.5,
    preventDefault: () => {},
    stopPropagation: () => {
      stopped = true;
    }
  };
  for (const fn of [...listeners]) {
    fn(ev);
  }
  return { ev, stopped };
}

function createShapeRouterHarness(options?: {
  initialShapeType?: ShapeType;
  fillEnabled?: boolean;
  fillColor?: string;
  zoomLevel?: number;
}) {
  let zoomLevel = options?.zoomLevel ?? 1;
  let currentShapeType: ShapeType = options?.initialShapeType ?? "rectangle";
  const fillEnabled = options?.fillEnabled ?? false;
  const fillColor = options?.fillColor ?? "rgba(37, 99, 235, 0.22)";

  const rootEl = createMockElement();
  const scrollerEl = createMockElement();
  const pagesContainerEl = createMockElement();
  const pageFrameEl = createMockElement();
  const activeCanvasEl = createMockElement();
  const committedCanvasEl = createMockElement();
  activeCanvasEl.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 595 * zoomLevel,
    height: 842 * zoomLevel,
    right: 595 * zoomLevel,
    bottom: 842 * zoomLevel
  });

  const page: PageData = {
    id: "page_shape_router",
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

  const history = new HistoryManager(50);
  const inking = new InkingController({
    getZoomLevel: () => zoomLevel
  });
  inking.setTool("shape");
  inking.setColor("#2563eb");
  inking.setWidth(2.5);

  const canvasHost = new PageCanvasHost({
    getPage: (id) => (id === page.id ? page : undefined),
    getPageByNumber: (num) => (num === 1 ? page : undefined),
    getCurrentPageNumber: () => 1,
    getCanvasScale: () => zoomLevel,
    getInkingController: () => inking,
    getSelectionController: () =>
      ({
        getActivePageId: () => null,
        getSelectedStrokes: () => [],
        getSelectedShapes: () => []
      }) as unknown as ReturnType<PageCanvasHost["delegate"]["getSelectionController"]>,
    getPdfBackgroundManager: () =>
      ({}) as unknown as ReturnType<PageCanvasHost["delegate"]["getPdfBackgroundManager"]>,
    getPageVirtualizer: () =>
      ({
        markPageMounted: () => {},
        markPageUnmounted: () => {},
        getMountedPages: () => [1],
        getCulledPages: () => []
      }) as unknown as ReturnType<PageCanvasHost["delegate"]["getPageVirtualizer"]>,
    getPerformanceMonitor: () =>
      ({ updatePageCounts: () => {} }) as unknown as ReturnType<PageCanvasHost["delegate"]["getPerformanceMonitor"]>,
    isTextEditing: () => false,
    updateThumbnailStrokes: () => {}
  });
  canvasHost.committedCanvasMap.set(page.id, committedCanvasEl as unknown as HTMLCanvasElement);
  canvasHost.activeCanvasMap.set(page.id, activeCanvasEl as unknown as HTMLCanvasElement);

  const windowListeners: EventMap = new Map();
  let mutationCount = 0;
  let startedTextArgs: unknown[] | null = null;
  let previewRenderedCount = 0;
  const origRenderShapeDragPreview = canvasHost.renderShapeDragPreview.bind(canvasHost);
  canvasHost.renderShapeDragPreview = (...args) => {
    previewRenderedCount += 1;
    return origRenderShapeDragPreview(...args);
  };

  const registerOnMap = (map: EventMap, type: string, cb: (ev: unknown) => void) => {
    if (!map.has(type)) map.set(type, []);
    map.get(type)!.push(cb);
  };

  const delegate: GestureInputDelegate = {
    app: {} as GestureInputDelegate["app"],
    getRootContainerEl: () => rootEl as unknown as HTMLElement,
    getScrollerEl: () => scrollerEl as unknown as HTMLElement,
    getPagesContainerEl: () => pagesContainerEl as unknown as HTMLElement,
    getEraserCursorEl: () => undefined,
    getFilePath: () => "test.md",
    getCurrentPageNumber: () => 1,
    getPageByNumber: () => page,
    getAllPages: () => [page],
    getInkingController: () => inking,
    getSelectionController: () =>
      ({
        hasSelection: () => false,
        handlePointerDown: () => {},
        handlePointerMove: () => {},
        handlePointerUp: () => {},
        clearSelection: () => {}
      }) as unknown as ReturnType<GestureInputDelegate["getSelectionController"]>,
    getTextController: () =>
      ({
        isEditing: () => false,
        commitActiveEdit: () => {},
        startEditing: (...args: unknown[]) => {
          startedTextArgs = args;
        }
      }) as unknown as ReturnType<GestureInputDelegate["getTextController"]>,
    getImageController: () =>
      ({ getSelectedImageId: () => null }) as unknown as ReturnType<GestureInputDelegate["getImageController"]>,
    getHistoryManager: () => history,
    getCanvasHost: () => canvasHost,
    getZoomController: () =>
      ({
        getZoomLevel: () => zoomLevel,
        flushCanvasResolutionUpdate: () => {},
        scheduleCanvasResolutionUpdate: () => {},
        setZoomLevel: () => {}
      }) as unknown as ReturnType<GestureInputDelegate["getZoomController"]>,
    getDragCoordinator: () =>
      ({
        setDragStartClient: () => {},
        isDraggingSelection: () => false,
        updateSelectionDrag: () => {},
        finishSelectionDrag: () => {},
        cancelSelectionDrag: () => {}
      }) as unknown as ReturnType<GestureInputDelegate["getDragCoordinator"]>,
    getSelectionSubMode: () => "lasso",
    getCurrentShapeType: () => currentShapeType,
    isShapeFillEnabled: () => fillEnabled,
    getShapeFillColor: () => fillColor,
    getCurrentStickyColor: () => "#fef08a",
    getCurrentTextOptions: () => ({
      color: "#1e293b",
      fontSize: 16,
      fontWeight: "normal",
      italic: false,
      underline: false,
      textAlign: "left"
    }),
    getDrawWithFinger: () => false,
    getTwoFingerTapUndoRedo: () => true,
    getStylusButtonAction: () => "hold",
    isDarkColor: () => false,
    resolveResourcePath: (p) => p,
    blurFocusedToolbarControl: () => {},
    setToolbarDrawingActive: () => {},
    setToolbarActiveTool: () => {},
    setActiveTool: (t) => inking.setTool(t),
    onUndo: () => history.undo(),
    onRedo: () => history.redo(),
    handleMutation: (mutatedPage) => {
      mutationCount += 1;
      canvasHost.redrawCommittedCanvas(mutatedPage.id);
    },
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
      registerOnMap((el as unknown as ReturnType<typeof createMockElement>).listeners ?? windowListeners, type, cb as (ev: unknown) => void);
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

  return {
    page,
    history,
    inking,
    activeCanvasEl,
    committedCanvasEl,
    windowListeners,
    setShapeType: (t: ShapeType) => {
      currentShapeType = t;
    },
    setZoom: (z: number) => {
      zoomLevel = z;
    },
    getMutationCount: () => mutationCount,
    getPreviewRenderedCount: () => previewRenderedCount,
    getStartedTextArgs: () => startedTextArgs
  };
}

describe("Shape Drawing Pointer Lifecycle", () => {
  test("commits shape on drag pointerup with mouse and pen, draws on committedCanvas, and supports undo/redo", () => {
    const harness = createShapeRouterHarness({
      initialShapeType: "rounded-rectangle",
      fillEnabled: true,
      fillColor: "rgba(37, 99, 235, 0.22)"
    });
    harness.inking.setStrokePattern("dashed");

    dispatchPointer(harness.activeCanvasEl.listeners, "pointerdown", {
      clientX: 100,
      clientY: 120,
      pointerId: 1,
      pointerType: "mouse"
    });
    dispatchPointer(harness.activeCanvasEl.listeners, "pointermove", {
      clientX: 240,
      clientY: 220,
      pointerId: 1,
      pointerType: "mouse"
    });
    assert.strictEqual(harness.getPreviewRenderedCount(), 1);

    dispatchPointer(harness.activeCanvasEl.listeners, "pointerup", {
      clientX: 240,
      clientY: 220,
      pointerId: 1,
      pointerType: "mouse"
    });

    assert.strictEqual(harness.page.shapes.length, 1);
    assert.strictEqual(harness.getMutationCount(), 1);
    const first = harness.page.shapes[0];
    assert.strictEqual(first.type, "rounded-rectangle");
    assert.strictEqual(first.fillColor, "rgba(37, 99, 235, 0.22)");
    assert.strictEqual(first.strokePattern, "dashed");
    assert.deepStrictEqual(first.bounds, { minX: 100, minY: 120, maxX: 240, maxY: 220 });
    assert.ok(harness.committedCanvasEl.ctx.calls.includes("stroke"));
    assert.ok(harness.committedCanvasEl.ctx.calls.includes("fill"));

    harness.setShapeType("star");
    dispatchPointer(harness.activeCanvasEl.listeners, "pointerdown", {
      clientX: 300,
      clientY: 300,
      pointerId: 2,
      pointerType: "pen"
    });
    dispatchPointer(harness.activeCanvasEl.listeners, "pointermove", {
      clientX: 380,
      clientY: 390,
      pointerId: 2,
      pointerType: "pen"
    });
    dispatchPointer(harness.activeCanvasEl.listeners, "pointerup", {
      clientX: 380,
      clientY: 390,
      pointerId: 2,
      pointerType: "pen"
    });

    assert.strictEqual(harness.page.shapes.length, 2);
    assert.strictEqual(harness.page.shapes[1].type, "star");

    harness.history.undo();
    assert.strictEqual(harness.page.shapes.length, 1);
    harness.history.redo();
    assert.strictEqual(harness.page.shapes.length, 2);
  });

  test("creates default 120x80 shape on quick click and respects zoom scaling", () => {
    const harness = createShapeRouterHarness({ initialShapeType: "circle", zoomLevel: 2 });

    dispatchPointer(harness.activeCanvasEl.listeners, "pointerdown", {
      clientX: 400,
      clientY: 400,
      pointerId: 1,
      pointerType: "mouse"
    });
    dispatchPointer(harness.activeCanvasEl.listeners, "pointerup", {
      clientX: 404,
      clientY: 402,
      pointerId: 1,
      pointerType: "mouse"
    });

    assert.strictEqual(harness.page.shapes.length, 1);
    const circle = harness.page.shapes[0];
    assert.strictEqual(circle.type, "circle");
    assert.strictEqual(circle.bounds.maxX - circle.bounds.minX, 120);
    assert.strictEqual(circle.bounds.maxY - circle.bounds.minY, 80);
    assert.strictEqual(circle.geometryData.cx, 200);
    assert.strictEqual(circle.geometryData.cy, 200);
    assert.strictEqual(circle.geometryData.r, 40);
  });

  test("cancels shape on pointercancel and ignores secondary pointer events", () => {
    const harness = createShapeRouterHarness({ initialShapeType: "diamond" });

    dispatchPointer(harness.activeCanvasEl.listeners, "pointerdown", {
      clientX: 80,
      clientY: 80,
      pointerId: 10,
      pointerType: "pen"
    });
    dispatchPointer(harness.activeCanvasEl.listeners, "pointerup", {
      clientX: 200,
      clientY: 200,
      pointerId: 99,
      pointerType: "touch"
    });
    assert.strictEqual(harness.page.shapes.length, 0);

    dispatchPointer(harness.activeCanvasEl.listeners, "pointercancel", {
      clientX: 160,
      clientY: 180,
      pointerId: 10,
      pointerType: "pen"
    });
    assert.strictEqual(harness.page.shapes.length, 0);

    dispatchPointer(harness.activeCanvasEl.listeners, "pointerup", {
      clientX: 160,
      clientY: 180,
      pointerId: 10,
      pointerType: "pen"
    });
    assert.strictEqual(harness.page.shapes.length, 0);
  });

  test("commits connector arrow and text box drag via pointerup", () => {
    const harness = createShapeRouterHarness();

    harness.inking.setTool("connector");
    dispatchPointer(harness.activeCanvasEl.listeners, "pointerdown", {
      clientX: 50,
      clientY: 60,
      pointerId: 1,
      pointerType: "mouse"
    });
    dispatchPointer(harness.activeCanvasEl.listeners, "pointerup", {
      clientX: 210,
      clientY: 140,
      pointerId: 1,
      pointerType: "mouse"
    });
    assert.strictEqual(harness.page.shapes.length, 1);
    assert.strictEqual(harness.page.shapes[0].type, "arrow");

    harness.inking.setTool("text");
    dispatchPointer(harness.activeCanvasEl.listeners, "pointerdown", {
      clientX: 60,
      clientY: 200,
      pointerId: 2,
      pointerType: "mouse"
    });
    dispatchPointer(harness.activeCanvasEl.listeners, "pointerup", {
      clientX: 260,
      clientY: 280,
      pointerId: 2,
      pointerType: "mouse"
    });
    assert.notStrictEqual(harness.getStartedTextArgs(), null);
  });

  test("commits shape via window pointerup fallback when released outside activeCanvas", () => {
    const harness = createShapeRouterHarness({ initialShapeType: "triangle" });

    dispatchPointer(harness.activeCanvasEl.listeners, "pointerdown", {
      clientX: 120,
      clientY: 120,
      pointerId: 7,
      pointerType: "mouse"
    });
    dispatchPointer(harness.windowListeners, "pointerup", {
      clientX: 280,
      clientY: 260,
      pointerId: 7,
      pointerType: "mouse"
    });

    assert.strictEqual(harness.page.shapes.length, 1);
    assert.strictEqual(harness.page.shapes[0].type, "triangle");
  });
});
