import { test, describe } from "node:test";
import assert from "node:assert";
import { StrokeGeometry } from "../src/ink/StrokeGeometry";
import { EraserEngine } from "../src/ink/EraserEngine";
import { PointSample, StrokeObject, ShapeObject } from "../src/types";

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

  test("isDot detects single point and micro-movement clusters", () => {
    assert.strictEqual(StrokeGeometry.isDot([{ x: 100, y: 100, pressure: 0.5, timestamp: 0 }], 2.5), true);

    const closePoints: PointSample[] = [
      { x: 100, y: 100, pressure: 0.4, timestamp: 0 },
      { x: 100.4, y: 100.2, pressure: 0.4, timestamp: 10 }
    ];
    assert.strictEqual(StrokeGeometry.isDot(closePoints, 2.5), true);

    const linePoints: PointSample[] = [
      { x: 100, y: 100, pressure: 0.5, timestamp: 0 },
      { x: 110, y: 100, pressure: 0.5, timestamp: 10 }
    ];
    assert.strictEqual(StrokeGeometry.isDot(linePoints, 2.5), false);
  });

  test("generateOutline renders visible dot for pressure tool with 1, 2, or 3 close points", () => {
    const singlePt: PointSample[] = [{ x: 50, y: 50, pressure: 0.5, timestamp: 0 }];
    const outline1 = StrokeGeometry.generateOutline(singlePt, "pressure", 2.5);
    assert.ok(outline1.length >= 12, "Single point must produce a multi-vertex circle outline");

    let minX1 = Infinity, maxX1 = -Infinity, minY1 = Infinity, maxY1 = -Infinity;
    for (const p of outline1) {
      if (p[0] < minX1) minX1 = p[0];
      if (p[0] > maxX1) maxX1 = p[0];
      if (p[1] < minY1) minY1 = p[1];
      if (p[1] > maxY1) maxY1 = p[1];
    }
    const w1 = maxX1 - minX1;
    const h1 = maxY1 - minY1;
    assert.ok(w1 >= 2.5, `Single point dot width (${w1}) must be at least 2.5px`);
    assert.ok(h1 >= 2.5, `Single point dot height (${h1}) must be at least 2.5px`);

    const twoClosePts: PointSample[] = [
      { x: 100, y: 100, pressure: 0.2, timestamp: 0 },
      { x: 100.5, y: 100.3, pressure: 0.2, timestamp: 10 }
    ];
    const outline2 = StrokeGeometry.generateOutline(twoClosePts, "pressure", 2.5);
    assert.ok(outline2.length >= 12, "Two close points must produce a visible dot outline");

    let minX2 = Infinity, maxX2 = -Infinity, minY2 = Infinity, maxY2 = -Infinity;
    for (const p of outline2) {
      if (p[0] < minX2) minX2 = p[0];
      if (p[0] > maxX2) maxX2 = p[0];
      if (p[1] < minY2) minY2 = p[1];
      if (p[1] > maxY2) maxY2 = p[1];
    }
    const w2 = maxX2 - minX2;
    const h2 = maxY2 - minY2;
    assert.ok(w2 >= 2.5, `Two-point dot width (${w2}) must be at least 2.5px, not collapsed`);
    assert.ok(h2 >= 2.5, `Two-point dot height (${h2}) must be at least 2.5px, not collapsed`);
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

  test("hitTestShape and eraseShapes accurately erase lines, arrows, rectangles, and circles", () => {
    const lineShape: ShapeObject = {
      id: "shape_line",
      type: "arrow",
      color: "#000000",
      strokeWidth: 2,
      bounds: { minX: 10, minY: 10, maxX: 110, maxY: 10 },
      geometryData: { x1: 10, y1: 10, x2: 110, y2: 10 }
    };
    const rectShape: ShapeObject = {
      id: "shape_rect",
      type: "rectangle",
      color: "#ff0000",
      strokeWidth: 2,
      bounds: { minX: 20, minY: 50, maxX: 120, maxY: 150 },
      geometryData: { x: 20, y: 50, width: 100, height: 100 }
    };
    const circleShape: ShapeObject = {
      id: "shape_circle",
      type: "circle",
      color: "#0000ff",
      strokeWidth: 2,
      bounds: { minX: 150, minY: 50, maxX: 250, maxY: 150 },
      geometryData: { cx: 200, cy: 100, radius: 50 }
    };

    assert.strictEqual(EraserEngine.hitTestShape(lineShape, 60, 10, 6), true);
    assert.strictEqual(EraserEngine.hitTestShape(lineShape, 60, 40, 6), false);

    assert.strictEqual(EraserEngine.hitTestShape(rectShape, 20, 100, 6), true);
    assert.strictEqual(EraserEngine.hitTestShape(rectShape, 70, 100, 6), false);

    assert.strictEqual(EraserEngine.hitTestShape(circleShape, 250, 100, 6), true);
    assert.strictEqual(EraserEngine.hitTestShape(circleShape, 200, 100, 6), false);

    const shapes = [lineShape, rectShape, circleShape];
    const eraseRes = EraserEngine.eraseShapes(shapes, 20, 100, 6);
    assert.strictEqual(eraseRes.remaining.length, 2);
    assert.deepStrictEqual(eraseRes.deletedIds, ["shape_rect"]);
  });
});
