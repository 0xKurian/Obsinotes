import { test, describe } from "node:test";
import assert from "node:assert";
import { StrokeGeometry } from "../src/ink/StrokeGeometry";
import { EraserEngine } from "../src/ink/EraserEngine";
import { PointSample, StrokeObject } from "../src/types";

describe("InkingEngine & StrokeGeometry", () => {
  test("getStrokeOptions gives distinct configs for different tools", () => {
    const penOpt = StrokeGeometry.getStrokeOptions("pen", 2);
    const pressureOpt = StrokeGeometry.getStrokeOptions("pressure", 2);
    const fountainOpt = StrokeGeometry.getStrokeOptions("fountain", 2);
    const highlighterOpt = StrokeGeometry.getStrokeOptions("highlighter", 2);

    assert.strictEqual(penOpt.size, 2);
    assert.strictEqual(pressureOpt.thinning, 0.65);
    assert.strictEqual(fountainOpt.thinning, 0.35);
    assert.strictEqual(highlighterOpt.thinning, 0);
    assert.strictEqual(highlighterOpt.size, 9);
  });

  test("generateOutline produces polygon points from points", () => {
    const points: PointSample[] = [
      { x: 50, y: 50, pressure: 0.5, timestamp: 100 },
      { x: 100, y: 50, pressure: 0.8, timestamp: 120 },
      { x: 150, y: 100, pressure: 0.4, timestamp: 140 }
    ];

    const outline = StrokeGeometry.generateOutline(points, "pen", 3);
    assert.ok(outline.length > 5);
    for (const pt of outline) {
      assert.strictEqual(pt.length, 2);
      assert.ok(typeof pt[0] === "number");
      assert.ok(typeof pt[1] === "number");
    }
  });

  test("computeBoundingBox encapsulates all points with padding", () => {
    const points: PointSample[] = [
      { x: 20, y: 40, pressure: 0.5, timestamp: 1 },
      { x: 100, y: 150, pressure: 0.5, timestamp: 2 },
      { x: 60, y: 10, pressure: 0.5, timestamp: 3 }
    ];

    const bounds = StrokeGeometry.computeBoundingBox(points, 5);
    assert.strictEqual(bounds.minX, 15);
    assert.strictEqual(bounds.minY, 5);
    assert.strictEqual(bounds.maxX, 105);
    assert.strictEqual(bounds.maxY, 155);
  });
});

describe("EraserEngine", () => {
  function createSampleStroke(id: string, startX: number, endX: number, y: number): StrokeObject {
    const points: PointSample[] = [];
    const step = 5;
    for (let x = startX; x <= endX; x += step) {
      points.push({ x, y, pressure: 0.5, timestamp: x });
    }

    return {
      id,
      tool: "pen",
      color: "#000000",
      width: 2,
      opacity: 1,
      points,
      bounds: StrokeGeometry.computeBoundingBox(points, 4),
      createdAt: 100
    };
  }

  test("hitTestStroke accurately identifies collision", () => {
    const stroke = createSampleStroke("stroke_1", 10, 100, 50);

    const hit = EraserEngine.hitTestStroke(stroke, 50, 50, 5);
    assert.strictEqual(hit, true);

    const missFar = EraserEngine.hitTestStroke(stroke, 200, 200, 5);
    assert.strictEqual(missFar, false);

    const missNear = EraserEngine.hitTestStroke(stroke, 50, 70, 5);
    assert.strictEqual(missNear, false);
  });

  test("eraseByStroke removes entire intersecting stroke", () => {
    const stroke1 = createSampleStroke("stroke_1", 10, 100, 50);
    const stroke2 = createSampleStroke("stroke_2", 10, 100, 150);
    const strokes = [stroke1, stroke2];

    const result = EraserEngine.eraseByStroke(strokes, 50, 50, 8);
    assert.strictEqual(result.remaining.length, 1);
    assert.strictEqual(result.remaining[0].id, "stroke_2");
    assert.strictEqual(result.deletedIds.length, 1);
    assert.strictEqual(result.deletedIds[0], "stroke_1");
  });

  test("erasePrecision splits a stroke into two segments", () => {
    const stroke = createSampleStroke("stroke_split", 0, 100, 50);
    const strokes = [stroke];

    const result = EraserEngine.erasePrecision(strokes, 50, 50, 10);
    assert.strictEqual(result.changed, true);
    assert.strictEqual(result.updatedStrokes.length, 2);

    const leftPart = result.updatedStrokes[0];
    const rightPart = result.updatedStrokes[1];

    assert.ok(leftPart.bounds.maxX < 50);
    assert.ok(rightPart.bounds.minX > 50);
  });

  test("benchmark hit testing across 1000 strokes", () => {
    const thousandStrokes: StrokeObject[] = [];
    for (let i = 0; i < 1000; i++) {
      const y = (i % 50) * 15;
      const x = Math.floor(i / 50) * 40;
      thousandStrokes.push(createSampleStroke(`s_${i}`, x, x + 30, y));
    }

    const start = performance.now();
    const result = EraserEngine.eraseByStroke(thousandStrokes, 120, 150, 12);
    const elapsed = performance.now() - start;

    assert.ok(elapsed < 16, `Eraser hit-testing took ${elapsed}ms, expected under 16ms`);
    assert.ok(result.deletedIds.length >= 0);
  });

  test("benchmark hit testing across 5000 strokes", () => {
    const fiveThousandStrokes: StrokeObject[] = [];
    for (let i = 0; i < 5000; i++) {
      const y = (i % 100) * 10;
      const x = Math.floor(i / 100) * 20;
      fiveThousandStrokes.push(createSampleStroke(`s_${i}`, x, x + 15, y));
    }

    const start = performance.now();
    const result = EraserEngine.eraseByStroke(fiveThousandStrokes, 250, 250, 15);
    const elapsed = performance.now() - start;

    assert.ok(elapsed < 32, `5000-stroke eraser hit-testing took ${elapsed}ms, expected under 32ms`);
    assert.ok(result.deletedIds.length >= 0);
  });
});
