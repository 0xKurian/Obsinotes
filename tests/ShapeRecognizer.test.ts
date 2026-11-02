import { test, describe } from "node:test";
import assert from "node:assert";
import { ShapeRecognizer } from "../src/shape/ShapeRecognizer";
import { PointSample } from "../src/types";

describe("ShapeRecognizer", () => {
  test("recognizes a straight line with high confidence", () => {
    const points: PointSample[] = [];
    for (let x = 10; x <= 100; x += 5) {
      points.push({ x, y: 50 + (Math.random() - 0.5) * 0.5, pressure: 0.5, timestamp: x });
    }

    const result = ShapeRecognizer.recognize(points, "#000000", 2);
    assert.ok(result);
    assert.strictEqual(result.shape.type, "line");
    assert.ok(result.confidence > 0.85);
  });

  test("recognizes a circle with high confidence", () => {
    const points: PointSample[] = [];
    const cx = 100;
    const cy = 100;
    const r = 40;
    const count = 30;

    for (let i = 0; i <= count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const noise = (Math.random() - 0.5) * 1.5;
      points.push({
        x: cx + Math.cos(angle) * (r + noise),
        y: cy + Math.sin(angle) * (r + noise),
        pressure: 0.5,
        timestamp: i
      });
    }

    const result = ShapeRecognizer.recognize(points, "#000000", 2);
    assert.ok(result);
    assert.strictEqual(result.shape.type, "circle");
    assert.ok(result.confidence > 0.75);
  });

  test("recognizes a rectangle with high confidence", () => {
    const points: PointSample[] = [];
    let t = 0;

    for (let x = 20; x <= 80; x += 5) {
      points.push({ x, y: 20, pressure: 0.5, timestamp: t++ });
    }
    for (let y = 20; y <= 60; y += 5) {
      points.push({ x: 80, y, pressure: 0.5, timestamp: t++ });
    }
    for (let x = 80; x >= 20; x -= 5) {
      points.push({ x, y: 60, pressure: 0.5, timestamp: t++ });
    }
    for (let y = 60; y >= 20; y -= 5) {
      points.push({ x: 20, y, pressure: 0.5, timestamp: t++ });
    }

    const result = ShapeRecognizer.recognize(points, "#000000", 2);
    assert.ok(result);
    assert.strictEqual(result.shape.type, "rectangle");
  });

  test("recognizes a triangle with high confidence", () => {
    const points: PointSample[] = [];
    let t = 0;

    for (let i = 0; i <= 10; i++) {
      const factor = i / 10;
      points.push({ x: 50 + factor * 40, y: 10 + factor * 60, pressure: 0.5, timestamp: t++ });
    }
    for (let i = 0; i <= 10; i++) {
      const factor = i / 10;
      points.push({ x: 90 - factor * 80, y: 70, pressure: 0.5, timestamp: t++ });
    }
    for (let i = 0; i <= 10; i++) {
      const factor = i / 10;
      points.push({ x: 10 + factor * 40, y: 70 - factor * 60, pressure: 0.5, timestamp: t++ });
    }

    const result = ShapeRecognizer.recognize(points, "#000000", 2);
    assert.ok(result);
    assert.strictEqual(result.shape.type, "triangle");
  });

  test("rejects an erratic scribble", () => {
    const points: PointSample[] = [];
    for (let i = 0; i < 40; i++) {
      points.push({
        x: 50 + Math.sin(i * 1.3) * 35,
        y: 50 + Math.cos(i * 2.7) * 45,
        pressure: 0.5,
        timestamp: i
      });
    }

    const result = ShapeRecognizer.recognize(points, "#000000", 2);
    assert.strictEqual(result, null);
  });
});
