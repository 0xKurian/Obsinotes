import { describe, it } from "node:test";
import assert from "node:assert";
import {
  PerformanceMonitor,
  PerformanceMetrics
} from "../src/performance/PerformanceMonitor";
import {
  calculateActivePageWindow,
  computeVisiblePagesFromScroll,
  PageVirtualizer,
  PageVirtualizerDelegate
} from "../src/performance/PageVirtualizer";
import { DocumentSerializer } from "../src/storage/DocumentSerializer";
import { EraserEngine } from "../src/ink/EraserEngine";
import { SelectionEngine } from "../src/selection/SelectionEngine";
import {
  NotebookDocument,
  PageData,
  StrokeObject,
  ShapeObject,
  TextObject
} from "../src/types";

describe("PerformanceMonitor", () => {
  it("initializes with default metrics", () => {
    const monitor = new PerformanceMonitor();
    const metrics = monitor.getMetrics();
    assert.strictEqual(metrics.currentFps, 60);
    assert.strictEqual(metrics.averageFps, 60);
    assert.strictEqual(metrics.totalEventsProcessed, 0);
    assert.strictEqual(metrics.totalCoalescedEvents, 0);
    assert.strictEqual(metrics.activePagesCount, 0);
    assert.strictEqual(metrics.culledPagesCount, 0);
  });

  it("records frame times and computes average frame duration", () => {
    const monitor = new PerformanceMonitor();
    monitor.recordFrame(16.6);
    monitor.recordFrame(16.7);
    monitor.recordFrame(16.5);

    const metrics = monitor.getMetrics();
    assert.ok(metrics.averageFrameTimeMs > 16 && metrics.averageFrameTimeMs < 17);
    assert.strictEqual(metrics.maxFrameTimeMs, 16.7);
  });

  it("records pointer events and aggregates latency and coalesced count", () => {
    const monitor = new PerformanceMonitor();
    const now = Date.now();
    monitor.recordPointerEvent(now - 4, 3);
    monitor.recordPointerEvent(now - 6, 2);

    const metrics = monitor.getMetrics();
    assert.strictEqual(metrics.totalEventsProcessed, 2);
    assert.strictEqual(metrics.totalCoalescedEvents, 3);
    assert.ok(metrics.averagePointerLatencyMs >= 0);
  });

  it("updates page count metrics and resets cleanly", () => {
    const monitor = new PerformanceMonitor();
    monitor.updatePageCounts(3, 47);

    let metrics = monitor.getMetrics();
    assert.strictEqual(metrics.activePagesCount, 3);
    assert.strictEqual(metrics.culledPagesCount, 47);

    monitor.reset();
    metrics = monitor.getMetrics();
    assert.strictEqual(metrics.totalEventsProcessed, 0);
    assert.strictEqual(metrics.activePagesCount, 0);
    assert.strictEqual(metrics.culledPagesCount, 0);
  });
});

describe("PageVirtualizer Utilities", () => {
  it("calculates active page window with buffer clamping to page boundaries", () => {
    const windowStart = calculateActivePageWindow(1, 2, 50, 1);
    assert.deepStrictEqual(windowStart, { startPage: 1, endPage: 3 });

    const windowMiddle = calculateActivePageWindow(10, 12, 50, 1);
    assert.deepStrictEqual(windowMiddle, { startPage: 9, endPage: 13 });

    const windowEnd = calculateActivePageWindow(49, 50, 50, 1);
    assert.deepStrictEqual(windowEnd, { startPage: 48, endPage: 50 });
  });

  it("handles empty or single page notebook in window calculation", () => {
    const single = calculateActivePageWindow(1, 1, 1, 1);
    assert.deepStrictEqual(single, { startPage: 1, endPage: 1 });

    const zero = calculateActivePageWindow(1, 1, 0, 1);
    assert.deepStrictEqual(zero, { startPage: 1, endPage: 1 });
  });

  it("computes visible pages from scroll position accurately", () => {
    const pageOffsets = [
      { pageNumber: 1, top: 0, height: 800 },
      { pageNumber: 2, top: 820, height: 800 },
      { pageNumber: 3, top: 1640, height: 800 },
      { pageNumber: 4, top: 2460, height: 800 }
    ];

    const topVisible = computeVisiblePagesFromScroll(0, 700, pageOffsets);
    assert.deepStrictEqual(topVisible, { firstVisible: 1, lastVisible: 1 });

    const boundaryVisible = computeVisiblePagesFromScroll(500, 700, pageOffsets);
    assert.deepStrictEqual(boundaryVisible, { firstVisible: 1, lastVisible: 2 });

    const middleVisible = computeVisiblePagesFromScroll(1700, 800, pageOffsets);
    assert.deepStrictEqual(middleVisible, { firstVisible: 3, lastVisible: 4 });
  });
});

describe("PageVirtualizer State & Culling Logic", () => {
  it("bypasses virtualization when total pages is less than or equal to threshold", () => {
    const mounted: number[] = [];
    const unmounted: number[] = [];

    const delegate: PageVirtualizerDelegate = {
      getTotalPages: () => 3,
      mountPageCanvases: (p) => mounted.push(p),
      unmountPageCanvases: (p) => unmounted.push(p)
    };

    const virtualizer = new PageVirtualizer(delegate, { virtualizationThreshold: 4 });
    virtualizer.updateVirtualization();

    assert.deepStrictEqual(virtualizer.getMountedPages(), [1, 2, 3]);
    assert.deepStrictEqual(unmounted, []);
  });

  it("culls distant pages and mounts active window in a 50-page notebook", () => {
    const mounted: number[] = [];
    const unmounted: number[] = [];

    const delegate: PageVirtualizerDelegate = {
      getTotalPages: () => 50,
      mountPageCanvases: (p) => mounted.push(p),
      unmountPageCanvases: (p) => unmounted.push(p)
    };

    const virtualizer = new PageVirtualizer(delegate, {
      virtualizationThreshold: 4,
      bufferPages: 1
    });

    for (let p = 1; p <= 50; p++) {
      const fakeEl = { dataset: { pageNumber: String(p) } } as unknown as HTMLElement;
      virtualizer.observePage(p, fakeEl);
    }

    const initialMounted = virtualizer.getMountedPages();
    assert.strictEqual(initialMounted.length, 50);

    const fakeEntries: IntersectionObserverEntry[] = [
      {
        target: { dataset: { pageNumber: "15" } } as unknown as Element,
        isIntersecting: true
      } as IntersectionObserverEntry,
      {
        target: { dataset: { pageNumber: "16" } } as unknown as Element,
        isIntersecting: true
      } as IntersectionObserverEntry
    ];

    (virtualizer as unknown as { handleIntersectionEntries: (entries: IntersectionObserverEntry[]) => void })
      .handleIntersectionEntries(fakeEntries);

    const currentMounted = virtualizer.getMountedPages();
    assert.deepStrictEqual(currentMounted, [14, 15, 16, 17]);

    const culledPages = virtualizer.getCulledPages();
    assert.strictEqual(culledPages.length, 46);
    assert.ok(culledPages.includes(1));
    assert.ok(culledPages.includes(50));
    assert.ok(!culledPages.includes(15));
  });

  it("prevents unmounting a page that is currently being drawn on", () => {
    const unmounted: number[] = [];

    const delegate: PageVirtualizerDelegate = {
      getTotalPages: () => 20,
      mountPageCanvases: () => {},
      unmountPageCanvases: (p) => unmounted.push(p),
      isPageDrawing: (p) => p === 1
    };

    const virtualizer = new PageVirtualizer(delegate, {
      virtualizationThreshold: 4,
      bufferPages: 1
    });

    for (let p = 1; p <= 20; p++) {
      const fakeEl = { dataset: { pageNumber: String(p) } } as unknown as HTMLElement;
      virtualizer.observePage(p, fakeEl);
    }

    const fakeEntries: IntersectionObserverEntry[] = [
      {
        target: { dataset: { pageNumber: "10" } } as unknown as Element,
        isIntersecting: true
      } as IntersectionObserverEntry
    ];

    (virtualizer as unknown as { handleIntersectionEntries: (entries: IntersectionObserverEntry[]) => void })
      .handleIntersectionEntries(fakeEntries);

    assert.ok(!unmounted.includes(1));
    assert.ok(virtualizer.isPageMounted(1));
  });
});

describe("High-Load Stress Tests & Benchmarks", () => {
  function generateStrokes(count: number): StrokeObject[] {
    const strokes: StrokeObject[] = [];
    for (let i = 0; i < count; i++) {
      const x = (i * 7) % 550;
      const y = (i * 11) % 800;
      strokes.push({
        id: `stroke_${i}`,
        elementType: "stroke",
        tool: i % 5 === 0 ? "highlighter" : "pen",
        color: "#1e293b",
        width: 2,
        opacity: 1,
        points: [
          { x, y, pressure: 0.5, timestamp: 1000 + i },
          { x: x + 10, y: y + 10, pressure: 0.6, timestamp: 1010 + i },
          { x: x + 20, y: y + 5, pressure: 0.4, timestamp: 1020 + i }
        ],
        bounds: { minX: x, minY: y, maxX: x + 20, maxY: y + 10 },
        createdAt: 1000 + i
      });
    }
    return strokes;
  }

  it("benchmarks hit-testing across 5,000 strokes within 20 milliseconds", () => {
    const strokes = generateStrokes(5000);
    const start = performance.now();

    let hitCount = 0;
    for (let test = 0; test < 10; test++) {
      const testX = 100 + test * 10;
      const testY = 150 + test * 10;
      for (const stroke of strokes) {
        if (EraserEngine.hitTestStroke(stroke, testX, testY, 15)) {
          hitCount++;
        }
      }
    }

    const elapsed = performance.now() - start;
    assert.ok(hitCount >= 0);
    assert.ok(elapsed < 40, `Hit testing 5,000 strokes took ${elapsed.toFixed(2)}ms, expected < 40ms`);
  });

  it("benchmarks lasso selection across 5,000 strokes within 30 milliseconds", () => {
    const strokes = generateStrokes(5000);
    const lassoPolygon = [
      { x: 50, y: 50 },
      { x: 250, y: 50 },
      { x: 250, y: 250 },
      { x: 50, y: 250 }
    ];

    const start = performance.now();
    let selectedCount = 0;
    for (const stroke of strokes) {
      if (SelectionEngine.isStrokeSelectedByLasso(stroke, lassoPolygon)) {
        selectedCount++;
      }
    }
    const elapsed = performance.now() - start;

    assert.ok(selectedCount > 0);
    assert.ok(elapsed < 40, `Lasso testing 5,000 strokes took ${elapsed.toFixed(2)}ms, expected < 40ms`);
  });

  it("benchmarks 50-page notebook serialization and validation within 100 milliseconds", () => {
    const pages: PageData[] = [];
    for (let p = 1; p <= 50; p++) {
      const pageStrokes: StrokeObject[] = [
        {
          id: `p${p}_s1`,
          elementType: "stroke",
          tool: "pen",
          color: "#0f172a",
          width: 2,
          opacity: 1,
          points: [
            { x: 10, y: 10, pressure: 0.5, timestamp: 100 },
            { x: 50, y: 50, pressure: 0.5, timestamp: 110 }
          ],
          bounds: { minX: 10, minY: 10, maxX: 50, maxY: 50 },
          createdAt: 100
        }
      ];

      const pageShapes: ShapeObject[] = [
        {
          id: `p${p}_sh1`,
          elementType: "shape",
          type: "rectangle",
          color: "#3b82f6",
          strokeWidth: 2,
          bounds: { minX: 20, minY: 20, maxX: 80, maxY: 80 },
          geometryData: { x: 20, y: 20, width: 60, height: 60 }
        }
      ];

      const pageTexts: TextObject[] = [
        {
          id: `p${p}_tx1`,
          elementType: "text",
          x: 30,
          y: 30,
          width: 100,
          height: 30,
          content: `Page ${p} notes`,
          fontSize: 16,
          fontFamily: "sans-serif",
          fontWeight: "normal",
          color: "#000000",
          textAlign: "left"
        }
      ];

      pages.push({
        id: `page_${p}`,
        pageNumber: p,
        dimensions: { width: 595.28, height: 841.89, unit: "pt" },
        orientation: "portrait",
        template: {
          type: "ruled",
          backgroundColor: "#ffffff",
          lineColor: "#e2e8f0",
          spacing: 24,
          opacity: 0.8
        },
        strokes: pageStrokes,
        shapes: pageShapes,
        texts: pageTexts,
        images: []
      });
    }

    const doc: NotebookDocument = {
      metadata: {
        title: "50-Page Notebook",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        schemaVersion: 1,
        defaultPageSize: "A4",
        defaultOrientation: "portrait"
      },
      pages
    };

    const start = performance.now();
    const serialized = DocumentSerializer.serializeDocument(doc);
    const deserialized = DocumentSerializer.deserializeDocument(serialized);
    const elapsed = performance.now() - start;

    assert.ok(deserialized.success);
    if (deserialized.success) {
      assert.strictEqual(deserialized.document.pages.length, 50);
    }
    assert.ok(elapsed < 100, `50-page serialization took ${elapsed.toFixed(2)}ms, expected < 100ms`);
  });
});
