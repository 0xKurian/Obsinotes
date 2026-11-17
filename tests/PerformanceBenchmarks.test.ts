import { describe, it } from "node:test";
import assert from "node:assert";
import { DocumentSerializer } from "../src/storage/DocumentSerializer";
import { PageManager } from "../src/model/PageManager";
import { PageSpatialIndex } from "../src/geometry/PageSpatialIndex";
import { EraserEngine } from "../src/ink/EraserEngine";
import { InkingController } from "../src/ink/InkingController";
import { NotebookDocument, PageData, StrokeObject } from "../src/types";

function createDensePage(pageNumber: number, strokeCount: number): PageData {
  const strokes: StrokeObject[] = [];
  for (let i = 0; i < strokeCount; i++) {
    const x = (i % 50) * 11 + 10.12345;
    const y = Math.floor(i / 50) * 8 + 15.67891;
    strokes.push({
      id: `st_${pageNumber}_${i}`,
      elementType: "stroke",
      tool: "pressure",
      color: "#1e293b",
      width: 2.5,
      opacity: 1,
      createdAt: 1730000000,
      bounds: { minX: x - 2, minY: y - 2, maxX: x + 12, maxY: y + 8 },
      points: [
        { x, y, pressure: 0.45678, timestamp: 1730000000.4, tiltX: 12, tiltY: -8 },
        { x: x + 5.4321, y: y + 3.2109, pressure: 0.78912, timestamp: 1730000016.8, tiltX: 14, tiltY: -6 },
        { x: x + 10.9876, y: y + 5.5555, pressure: 0.32109, timestamp: 1730000032.2, tiltX: 10, tiltY: -4 }
      ]
    });
  }
  return {
    id: `page_${pageNumber}`,
    pageNumber,
    dimensions: { width: 595.28, height: 841.89, unit: "pt" },
    orientation: "portrait",
    template: {
      type: "ruled",
      backgroundColor: "#ffffff",
      lineColor: "#e2e8f0",
      spacing: 24,
      opacity: 0.8
    },
    strokes,
    shapes: [],
    texts: [],
    images: []
  };
}

describe("Performance Benchmarks & Engine Guarantees", () => {
  it("serializes 50 pages / 10,000 strokes compactly with 2-decimal rounding and preserves v1 compatibility", () => {
    const pages: PageData[] = [];
    for (let p = 1; p <= 50; p++) {
      pages.push(createDensePage(p, 200));
    }
    const doc: NotebookDocument = {
      metadata: {
        title: "Large 50-Page Benchmark",
        createdAt: 1730000000,
        updatedAt: 1730005000,
        schemaVersion: 1,
        defaultPageSize: "A4",
        defaultOrientation: "portrait"
      },
      pages
    };

    const start = performance.now();
    const serialized = DocumentSerializer.serializeDocument(doc);
    const serMs = performance.now() - start;

    const legacyPrettySize = JSON.stringify(doc, null, 2).length;
    assert.ok(serialized.length < legacyPrettySize * 0.65, "Compact serialization must reduce size significantly");

    const parsed = DocumentSerializer.deserializeDocument(serialized);
    assert.strictEqual(parsed.success, true);
    if (parsed.success) {
      assert.strictEqual(parsed.document.pages.length, 50);
      assert.strictEqual(parsed.document.pages[0].strokes.length, 200);
      const pt0 = parsed.document.pages[0].strokes[0].points[0];
      assert.strictEqual(pt0.x, 10.12);
      assert.strictEqual(pt0.y, 15.68);
      assert.strictEqual(pt0.pressure, 0.46);
    }

    assert.ok(serMs < 2000, `Serialization took ${serMs.toFixed(1)}ms`);
  });

  it("queries and erases on a 5,000-stroke page rapidly via PageSpatialIndex", () => {
    const page = createDensePage(1, 5000);
    const index = new PageSpatialIndex();
    for (const s of page.strokes) {
      index.insertStroke(s);
    }

    const start = performance.now();
    for (let step = 0; step < 50; step++) {
      EraserEngine.eraseByStrokeTrajectory(
        page.strokes,
        [
          { x: 100 + step * 2, y: 100 + step * 2 },
          { x: 105 + step * 2, y: 105 + step * 2 }
        ],
        12,
        index
      );
    }
    const elapsedMs = performance.now() - start;
    assert.ok(elapsedMs < 500, `50 trajectory queries on 5000 strokes took ${elapsedMs.toFixed(1)}ms`);
  });

  it("keeps PageManager O(1) lookup maps synchronized across insert, duplicate, reorder, and delete", () => {
    const pages = [createDensePage(1, 1), createDensePage(2, 1), createDensePage(3, 1)];
    const doc: NotebookDocument = {
      metadata: {
        title: "Lookup Sync",
        createdAt: 1,
        updatedAt: 1,
        schemaVersion: 1,
        defaultPageSize: "A4",
        defaultOrientation: "portrait"
      },
      pages
    };
    const pm = new PageManager(doc);

    assert.strictEqual(pm.getPage("page_2")?.pageNumber, 2);
    assert.strictEqual(pm.getPageByNumber(3)?.id, "page_3");

    const dup = pm.duplicatePage("page_1");
    assert.ok(dup);
    assert.strictEqual(pm.getPageByNumber(2)?.id, dup.id);
    assert.strictEqual(pm.getPageIndex("page_3"), 3);

    pm.reorderPages(0, 3);
    assert.strictEqual(pm.getPage("page_1")?.pageNumber, 4);
    assert.strictEqual(pm.getPageByNumber(4)?.id, "page_1");

    pm.deletePage(dup.id);
    assert.strictEqual(pm.getPage(dup.id), undefined);
    assert.strictEqual(pm.getPageCount(), 3);
    assert.strictEqual(pm.getPageByNumber(3)?.id, "page_1");
  });

  it("preserves per-coalesced-event pressure and tilt samples in InkingController", () => {
    let committedStroke: StrokeObject | null = null;
    const controller = new InkingController({
      onStrokeCommitted: (_pageId, stroke) => {
        committedStroke = stroke;
      },
      onStrokesErased: () => {}
    });

    const mockCtx = {
      save() {},
      restore() {},
      setTransform() {},
      clearRect() {},
      beginPath() {},
      moveTo() {},
      quadraticCurveTo() {},
      lineTo() {},
      closePath() {},
      fill() {}
    };
    const mockCanvas = {
      width: 595,
      height: 842,
      dataset: { pageWidth: "595", pageHeight: "842" },
      setPointerCapture() {},
      releasePointerCapture() {},
      getContext: () => mockCtx
    } as unknown as HTMLCanvasElement;

    controller.handlePointerDown(
      { pointerType: "pen", button: 0, pressure: 0.2, tiltX: 5, tiltY: 10, timeStamp: 100, pointerId: 1 } as unknown as PointerEvent,
      "page_1",
      mockCanvas,
      mockCanvas,
      { x: 10, y: 10 },
      []
    );

    controller.handlePointerMove(
      { pointerType: "pen", pressure: 0.9, tiltX: 0, tiltY: 0, timeStamp: 120, pointerId: 1 } as unknown as PointerEvent,
      [
        { x: 20, y: 20, pressure: 0.35, tiltX: 15, tiltY: -5, timestamp: 108 },
        { x: 30, y: 30, pressure: 0.75, tiltX: 25, tiltY: -15, timestamp: 116 }
      ]
    );

    controller.handlePointerUp({ pointerId: 1 } as unknown as PointerEvent);

    assert.ok(committedStroke);
    const pts = (committedStroke as StrokeObject).points;
    assert.strictEqual(pts.length, 3);
    assert.strictEqual(pts[1].pressure, 0.35);
    assert.strictEqual(pts[1].tiltX, 15);
    assert.strictEqual(pts[2].pressure, 0.75);
    assert.strictEqual(pts[2].tiltY, -15);
  });
});
