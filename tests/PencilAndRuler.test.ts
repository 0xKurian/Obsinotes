import { describe, it } from "node:test";
import assert from "node:assert";
import { StrokeGeometry } from "../src/ink/StrokeGeometry";
import {
  detectRulerEdgeSnap,
  projectPointOntoSnapLock,
  snapRulerAngle,
  RulerState
} from "../src/ink/RulerOverlayController";
import { renderShapeToSvg, renderStrokeToSvg } from "../src/export/SvgExporter";
import { DocumentSerializer } from "../src/storage/DocumentSerializer";
import { NotebookDocument, PointSample, ShapeObject, StrokeObject } from "../src/types";

describe("Pencil Tool, Stroke Patterns & Ruler Straightedge", () => {
  it("generates tilt-modulated pencil outlines and falls back cleanly without tilt", () => {
    const flatPoints: PointSample[] = [
      { x: 10, y: 10, pressure: 0.5, timestamp: 1 },
      { x: 60, y: 10, pressure: 0.5, timestamp: 2 },
      { x: 110, y: 10, pressure: 0.5, timestamp: 3 }
    ];
    const tiltedPoints: PointSample[] = [
      { x: 10, y: 10, pressure: 0.5, timestamp: 1, tiltX: 45, tiltY: 30 },
      { x: 60, y: 10, pressure: 0.5, timestamp: 2, tiltX: 45, tiltY: 30 },
      { x: 110, y: 10, pressure: 0.5, timestamp: 3, tiltX: 45, tiltY: 30 }
    ];

    const flatOutline = StrokeGeometry.generateOutline(flatPoints, "pencil", 3);
    const tiltedOutline = StrokeGeometry.generateOutline(tiltedPoints, "pencil", 3);

    assert.ok(flatOutline.length > 4);
    assert.ok(tiltedOutline.length > 4);

    const ySpread = (outline: number[][]): number => {
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of outline) {
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
      }
      return maxY - minY;
    };

    assert.ok(ySpread(tiltedOutline) > ySpread(flatOutline));
  });

  it("produces dashed and dotted SVG paths for strokes and shapes", () => {
    const dashedStroke: StrokeObject = {
      id: "st_dash",
      elementType: "stroke",
      tool: "pen",
      color: "#2563eb",
      width: 3,
      opacity: 1,
      strokePattern: "dashed",
      points: [
        { x: 10, y: 20, pressure: 0.5, timestamp: 1 },
        { x: 120, y: 20, pressure: 0.5, timestamp: 2 }
      ],
      bounds: { minX: 10, minY: 20, maxX: 120, maxY: 20 },
      createdAt: 10
    };

    const svgStroke = renderStrokeToSvg(dashedStroke);
    assert.ok(svgStroke.includes("stroke-dasharray="));
    assert.ok(svgStroke.includes('fill="none"'));

    const dottedRect: ShapeObject = {
      id: "sh_dot",
      elementType: "shape",
      type: "rectangle",
      color: "#dc2626",
      strokeWidth: 2,
      strokePattern: "dotted",
      bounds: { minX: 50, minY: 50, maxX: 150, maxY: 100 },
      geometryData: { x: 50, y: 50, width: 100, height: 50 }
    };

    const svgShape = renderShapeToSvg(dottedRect);
    assert.ok(svgShape.includes("stroke-dasharray="));
  });

  it("snaps ruler angles magnetically at cardinal and 15-degree increments", () => {
    assert.strictEqual(snapRulerAngle(1.8), 0);
    assert.strictEqual(snapRulerAngle(43.5), 45);
    assert.strictEqual(snapRulerAngle(92.1), 90);
    assert.strictEqual(snapRulerAngle(-46.5), -45);
    assert.strictEqual(snapRulerAngle(30.9), 30);
    assert.strictEqual(snapRulerAngle(22.4), 22.4);
  });

  it("detects ruler edges and projects stroke coordinates accurately onto the straightedge", () => {
    const ruler: RulerState = {
      visible: true,
      centerX: 250,
      centerY: 200,
      angleDeg: 0,
      length: 400,
      height: 52
    };

    const snapTop = detectRulerEdgeSnap(200, 200 - 26 + 5, ruler, 18);
    assert.ok(snapTop);
    assert.strictEqual(snapTop.lock.edge, "top");
    assert.ok(Math.abs(snapTop.projectedX - 200) < 1e-6);
    assert.ok(Math.abs(snapTop.projectedY - 174) < 1e-6);

    const projectedNext = projectPointOntoSnapLock(320, 190, snapTop.lock);
    assert.ok(Math.abs(projectedNext.x - 320) < 1e-6);
    assert.ok(Math.abs(projectedNext.y - 174) < 1e-6);

    const farPoint = detectRulerEdgeSnap(200, 100, ruler, 18);
    assert.strictEqual(farPoint, null);
  });

  it("validates and round-trips pencil strokes, dashed shapes, page title, and bookmarks", () => {
    const doc: NotebookDocument = {
      metadata: {
        title: "Pro Inking",
        createdAt: 100,
        updatedAt: 200,
        schemaVersion: 1,
        defaultPageSize: "A4",
        defaultOrientation: "portrait"
      },
      pages: [
        {
          id: "p1",
          pageNumber: 1,
          title: "Geometry Notes",
          bookmarked: true,
          dimensions: { width: 595.28, height: 841.89, unit: "pt" },
          orientation: "portrait",
          template: {
            type: "grid",
            backgroundColor: "#ffffff",
            lineColor: "#94a3b8",
            spacing: 24,
            opacity: 0.8
          },
          strokes: [
            {
              id: "s1",
              elementType: "stroke",
              tool: "pencil",
              color: "#334155",
              width: 2,
              opacity: 0.8,
              strokePattern: "dashed",
              points: [
                { x: 20, y: 20, pressure: 0.5, timestamp: 1, tiltX: 25, tiltY: -10 },
                { x: 100, y: 20, pressure: 0.7, timestamp: 2, tiltX: 25, tiltY: -10 }
              ],
              bounds: { minX: 18, minY: 18, maxX: 102, maxY: 22 },
              createdAt: 10
            }
          ],
          shapes: [
            {
              id: "sh1",
              elementType: "shape",
              type: "line",
              color: "#1e293b",
              strokeWidth: 2,
              strokePattern: "dotted",
              bounds: { minX: 10, minY: 10, maxX: 100, maxY: 10 },
              geometryData: { x1: 10, y1: 10, x2: 100, y2: 10 }
            }
          ],
          texts: [],
          images: []
        }
      ]
    };

    const raw = DocumentSerializer.serializeDocument(doc);
    const parsed = DocumentSerializer.deserializeDocument(raw);
    assert.strictEqual(parsed.success, true);
    if (parsed.success) {
      assert.strictEqual(parsed.document.pages[0].title, "Geometry Notes");
      assert.strictEqual(parsed.document.pages[0].bookmarked, true);
      assert.strictEqual(parsed.document.pages[0].strokes[0].tool, "pencil");
      assert.strictEqual(parsed.document.pages[0].strokes[0].strokePattern, "dashed");
      assert.strictEqual(parsed.document.pages[0].shapes[0].strokePattern, "dotted");
    }
  });
});
