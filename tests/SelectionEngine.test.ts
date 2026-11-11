import { test, describe } from "node:test";
import assert from "node:assert";
import { SelectionEngine } from "../src/selection/SelectionEngine";
import { ShapeObject, StrokeObject, TextObject } from "../src/types";

describe("SelectionEngine", () => {
  const squarePolygon = [
    { x: 10, y: 10 },
    { x: 100, y: 10 },
    { x: 100, y: 100 },
    { x: 10, y: 100 }
  ];

  test("pointInPolygon correctly detects interior vs exterior", () => {
    assert.strictEqual(SelectionEngine.pointInPolygon(50, 50, squarePolygon), true);
    assert.strictEqual(SelectionEngine.pointInPolygon(150, 50, squarePolygon), false);
    assert.strictEqual(SelectionEngine.pointInPolygon(0, 0, squarePolygon), false);
  });

  test("isStrokeSelectedByLasso accurately selects enclosed strokes", () => {
    const enclosedStroke: StrokeObject = {
      id: "s1",
      tool: "pen",
      color: "#000000",
      width: 2,
      opacity: 1,
      points: [
        { x: 20, y: 20, pressure: 0.5, timestamp: 1 },
        { x: 30, y: 30, pressure: 0.5, timestamp: 2 },
        { x: 40, y: 40, pressure: 0.5, timestamp: 3 }
      ],
      bounds: { minX: 18, minY: 18, maxX: 42, maxY: 42 },
      createdAt: 1
    };

    const outsideStroke: StrokeObject = {
      id: "s2",
      tool: "pen",
      color: "#000000",
      width: 2,
      opacity: 1,
      points: [
        { x: 150, y: 150, pressure: 0.5, timestamp: 1 },
        { x: 160, y: 160, pressure: 0.5, timestamp: 2 }
      ],
      bounds: { minX: 148, minY: 148, maxX: 162, maxY: 162 },
      createdAt: 2
    };

    assert.strictEqual(
      SelectionEngine.isStrokeSelectedByLasso(enclosedStroke, squarePolygon),
      true
    );
    assert.strictEqual(
      SelectionEngine.isStrokeSelectedByLasso(outsideStroke, squarePolygon),
      false
    );
  });

  test("isShapeSelectedByLasso selects shapes inside polygon", () => {
    const shapeInside: ShapeObject = {
      id: "sh1",
      type: "rectangle",
      color: "#000000",
      strokeWidth: 2,
      bounds: { minX: 20, minY: 20, maxX: 60, maxY: 60 },
      geometryData: { x: 20, y: 20, width: 40, height: 40 }
    };

    const shapeOutside: ShapeObject = {
      id: "sh2",
      type: "circle",
      color: "#000000",
      strokeWidth: 2,
      bounds: { minX: 200, minY: 200, maxX: 250, maxY: 250 },
      geometryData: { cx: 225, cy: 225, rx: 25, ry: 25 }
    };

    assert.strictEqual(
      SelectionEngine.isShapeSelectedByLasso(shapeInside, squarePolygon),
      true
    );
    assert.strictEqual(
      SelectionEngine.isShapeSelectedByLasso(shapeOutside, squarePolygon),
      false
    );
  });

  test("hitTestSingleElement finds stroke or shape at click point", () => {
    const stroke: StrokeObject = {
      id: "s1",
      tool: "pen",
      color: "#000000",
      width: 2,
      opacity: 1,
      points: [
        { x: 50, y: 50, pressure: 0.5, timestamp: 1 },
        { x: 80, y: 50, pressure: 0.5, timestamp: 2 }
      ],
      bounds: { minX: 48, minY: 48, maxX: 82, maxY: 52 },
      createdAt: 1
    };

    const shape: ShapeObject = {
      id: "sh1",
      type: "rectangle",
      color: "#000000",
      strokeWidth: 2,
      bounds: { minX: 200, minY: 200, maxX: 300, maxY: 300 },
      geometryData: { x: 200, y: 200, width: 100, height: 100 }
    };

    const hitStroke = SelectionEngine.hitTestSingleElement([stroke], [shape], 60, 50, 6);
    assert.ok(hitStroke?.stroke);
    assert.strictEqual(hitStroke?.stroke.id, "s1");

    const hitShape = SelectionEngine.hitTestSingleElement([stroke], [shape], 250, 250, 6);
    assert.ok(hitShape?.shape);
    assert.strictEqual(hitShape?.shape.id, "sh1");

    const hitNone = SelectionEngine.hitTestSingleElement([stroke], [shape], 500, 500, 6);
    assert.strictEqual(hitNone, null);
  });

  test("computeCombinedBoundingBox creates tight union box", () => {
    const stroke: StrokeObject = {
      id: "s1",
      tool: "pen",
      color: "#000000",
      width: 2,
      opacity: 1,
      points: [],
      bounds: { minX: 10, minY: 20, maxX: 50, maxY: 80 },
      createdAt: 1
    };

    const shape: ShapeObject = {
      id: "sh1",
      type: "circle",
      color: "#000000",
      strokeWidth: 2,
      bounds: { minX: 40, minY: 30, maxX: 120, maxY: 140 },
      geometryData: {}
    };

    const box = SelectionEngine.computeCombinedBoundingBox([stroke], [shape]);
    assert.ok(box);
    assert.strictEqual(box.minX, 10);
    assert.strictEqual(box.minY, 20);
    assert.strictEqual(box.maxX, 120);
    assert.strictEqual(box.maxY, 140);
  });

  test("hitTestHandle detects correct corner and rotate handle", () => {
    const box = { minX: 100, minY: 100, maxX: 200, maxY: 200 };

    const rotateHandle = SelectionEngine.hitTestHandle(box, 150, 78, 10);
    assert.strictEqual(rotateHandle, "rotate");

    const nwHandle = SelectionEngine.hitTestHandle(box, 100, 100, 8);
    assert.strictEqual(nwHandle, "nw");

    const seHandle = SelectionEngine.hitTestHandle(box, 200, 200, 8);
    assert.strictEqual(seHandle, "se");

    const miss = SelectionEngine.hitTestHandle(box, 150, 150, 8);
    assert.strictEqual(miss, null);
  });

  test("transformPoint accurately shifts and scales points", () => {
    const originBox = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    const targetBox = { minX: 50, minY: 50, maxX: 250, maxY: 250 };
    const pt = { x: 50, y: 50, pressure: 0.5, timestamp: 1 };

    const transformed = SelectionEngine.transformPoint(pt, originBox, targetBox, 0);
    assert.strictEqual(transformed.x, 150);
    assert.strictEqual(transformed.y, 150);
  });

  test("isTextSelectedByLasso accurately selects enclosed text box", () => {
    const textInside: TextObject = {
      id: "t1",
      elementType: "text",
      x: 30,
      y: 30,
      width: 40,
      height: 20,
      content: "Inside",
      fontSize: 14,
      fontFamily: "Inter",
      fontWeight: "normal",
      color: "#000",
      textAlign: "left"
    };

    const textOutside: TextObject = {
      id: "t2",
      elementType: "text",
      x: 300,
      y: 300,
      width: 50,
      height: 25,
      content: "Outside",
      fontSize: 14,
      fontFamily: "Inter",
      fontWeight: "normal",
      color: "#000",
      textAlign: "left"
    };

    assert.strictEqual(SelectionEngine.isTextSelectedByLasso(textInside, squarePolygon), true);
    assert.strictEqual(SelectionEngine.isTextSelectedByLasso(textOutside, squarePolygon), false);
  });

  test("isStrokeSelectedByLasso and elements accept and respect precomputedLassoBounds", () => {
    const precomputedBounds = SelectionEngine.computePolygonBoundingBox(squarePolygon);
    assert.deepStrictEqual(precomputedBounds, { minX: 10, minY: 10, maxX: 100, maxY: 100 });

    const stroke: StrokeObject = {
      id: "s_fast",
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

    assert.strictEqual(
      SelectionEngine.isStrokeSelectedByLasso(stroke, squarePolygon, 0.5, precomputedBounds),
      true
    );

    const outsideStroke: StrokeObject = {
      id: "s_out",
      tool: "pen",
      color: "#000",
      width: 2,
      opacity: 1,
      points: [{ x: 500, y: 500, pressure: 0.5, timestamp: 1 }],
      bounds: { minX: 498, minY: 498, maxX: 502, maxY: 502 },
      createdAt: 2
    };

    assert.strictEqual(
      SelectionEngine.isStrokeSelectedByLasso(outsideStroke, squarePolygon, 0.5, precomputedBounds),
      false
    );
  });
});
