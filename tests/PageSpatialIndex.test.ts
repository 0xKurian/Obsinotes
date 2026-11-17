import { describe, it } from "node:test";
import assert from "node:assert";
import { PageSpatialIndex, PageSpatialIndexRegistry } from "../src/geometry/PageSpatialIndex";
import { EraserEngine } from "../src/ink/EraserEngine";
import { SelectionEngine } from "../src/selection/SelectionEngine";
import { PageData, ShapeObject, StrokeObject } from "../src/types";

function makeStroke(id: string, x1: number, y1: number, x2: number, y2: number): StrokeObject {
  return {
    id,
    elementType: "stroke",
    tool: "pressure",
    color: "#1e293b",
    width: 2.5,
    opacity: 1,
    points: [
      { x: x1, y: y1, pressure: 0.5, timestamp: 1 },
      { x: (x1 + x2) / 2, y: (y1 + y2) / 2, pressure: 0.6, timestamp: 2 },
      { x: x2, y: y2, pressure: 0.5, timestamp: 3 }
    ],
    bounds: {
      minX: Math.min(x1, x2) - 4,
      minY: Math.min(y1, y2) - 4,
      maxX: Math.max(x1, x2) + 4,
      maxY: Math.max(y1, y2) + 4
    },
    createdAt: 100
  };
}

describe("PageSpatialIndex", () => {
  it("indexes and queries strokes, shapes, texts, and images accurately", () => {
    const page: PageData = {
      id: "page_1",
      pageNumber: 1,
      dimensions: { width: 595.28, height: 841.89, unit: "pt" },
      orientation: "portrait",
      template: {
        type: "blank",
        backgroundColor: "#ffffff",
        lineColor: "#e2e8f0",
        spacing: 24,
        opacity: 0.8
      },
      strokes: [
        makeStroke("s1", 20, 20, 80, 80),
        makeStroke("s2", 400, 600, 480, 650)
      ],
      shapes: [
        {
          id: "sh1",
          elementType: "shape",
          type: "rectangle",
          color: "#000000",
          strokeWidth: 2,
          bounds: { minX: 100, minY: 100, maxX: 160, maxY: 150 },
          geometryData: { x: 100, y: 100, width: 60, height: 50 }
        }
      ],
      texts: [
        {
          id: "t1",
          x: 200,
          y: 200,
          width: 120,
          height: 40,
          content: "Hello",
          fontSize: 16,
          fontFamily: "sans-serif",
          fontWeight: "normal",
          color: "#1e293b",
          textAlign: "left"
        }
      ],
      images: [
        {
          id: "img1",
          assetId: "a1",
          vaultPath: "img.png",
          x: 300,
          y: 300,
          width: 80,
          height: 80,
          rotation: 0
        }
      ]
    };

    const idx = PageSpatialIndexRegistry.getOrBuild(page);
    const nearOrigin = idx.queryStrokes({ minX: 0, minY: 0, maxX: 90, maxY: 90 });
    assert.deepStrictEqual(nearOrigin.map((s) => s.id), ["s1"]);

    const nearShape = idx.queryShapes({ minX: 110, minY: 110, maxX: 120, maxY: 120 });
    assert.deepStrictEqual(nearShape.map((sh) => sh.id), ["sh1"]);

    const nearText = idx.queryTexts({ minX: 210, minY: 210, maxX: 220, maxY: 220 });
    assert.deepStrictEqual(nearText.map((t) => t.id), ["t1"]);

    const nearImg = idx.queryImages({ minX: 320, minY: 320, maxX: 350, maxY: 350 });
    assert.deepStrictEqual(nearImg.map((img) => img.id), ["img1"]);

    idx.removeStroke("s1");
    assert.strictEqual(idx.queryStrokes({ minX: 0, minY: 0, maxX: 90, maxY: 90 }).length, 0);
  });

  it("matches linear EraserEngine and SelectionEngine behavior with spatialIndex", () => {
    const strokes: StrokeObject[] = [];
    for (let i = 0; i < 400; i++) {
      const col = i % 20;
      const row = Math.floor(i / 20);
      strokes.push(makeStroke(`s_${i}`, col * 28 + 10, row * 38 + 10, col * 28 + 25, row * 38 + 30));
    }
    const shapes: ShapeObject[] = [
      {
        id: "sh_target",
        elementType: "shape",
        type: "rectangle",
        color: "#000000",
        strokeWidth: 2,
        bounds: { minX: 150, minY: 150, maxX: 220, maxY: 200 },
        geometryData: { x: 150, y: 150, width: 70, height: 50 }
      }
    ];

    const idx = new PageSpatialIndex();
    for (const s of strokes) idx.insertStroke(s);
    for (const sh of shapes) idx.insertShape(sh);

    const trajectory = [
      { x: 15, y: 15 },
      { x: 45, y: 45 },
      { x: 75, y: 60 }
    ];

    const linearRes = EraserEngine.eraseByStrokeTrajectory(strokes, trajectory, 12);
    const spatialRes = EraserEngine.eraseByStrokeTrajectory(strokes, trajectory, 12, idx);
    assert.deepStrictEqual(spatialRes.deletedIds.sort(), linearRes.deletedIds.sort());
    assert.strictEqual(spatialRes.remaining.length, linearRes.remaining.length);

    const linearPrec = EraserEngine.erasePrecision(strokes, 18, 20, 10);
    const spatialPrec = EraserEngine.erasePrecision(strokes, 18, 20, 10, idx);
    assert.strictEqual(spatialPrec.changed, linearPrec.changed);
    assert.strictEqual(spatialPrec.updatedStrokes.length, linearPrec.updatedStrokes.length);

    const linearHit = SelectionEngine.hitTestSingleElement(strokes, shapes, 150, 175, 10);
    const spatialHit = SelectionEngine.hitTestSingleElement(strokes, shapes, 150, 175, 10, [], [], idx);
    assert.strictEqual(spatialHit?.shape?.id, linearHit?.shape?.id);
  });
});
