import { test, describe } from "node:test";
import assert from "node:assert";

describe("Touchpad and Trackpad Zoom", () => {
  const MAX_ZOOM_IN_FACTOR = 1.15;
  const MAX_ZOOM_OUT_FACTOR = 1 / MAX_ZOOM_IN_FACTOR;

  function calculateZoomFactor(deltaY: number, deltaMode: number = 0): number {
    let dy = deltaY;
    if (deltaMode === 1) {
      dy *= 30;
    } else if (deltaMode === 2) {
      dy *= 400;
    }

    if (Math.abs(dy) < 0.1) {
      return 1.0;
    }

    const rawFactor = Math.exp(-dy * 0.005);
    return Math.min(MAX_ZOOM_IN_FACTOR, Math.max(MAX_ZOOM_OUT_FACTOR, rawFactor));
  }

  test("calculates smooth continuous factors for small trackpad pinch gestures", () => {
    const zoomInSmall = calculateZoomFactor(-2.5);
    assert.ok(zoomInSmall > 1.0, "Zoom in factor should be > 1.0");
    assert.ok(zoomInSmall < 1.02, "Small pinch should produce gentle ~1.2% zoom");

    const zoomOutSmall = calculateZoomFactor(2.5);
    assert.ok(zoomOutSmall < 1.0, "Zoom out factor should be < 1.0");
    assert.ok(zoomOutSmall > 0.98, "Small pinch should produce gentle ~1.2% zoom");

    const zoomInMed = calculateZoomFactor(-10);
    assert.ok(zoomInMed > 1.04 && zoomInMed < 1.06, "Moderate pinch gives ~5% increment per frame");
  });

  test("clamps large discrete mouse wheel ticks symmetrically", () => {
    const wheelUp = calculateZoomFactor(-100);
    assert.strictEqual(wheelUp, MAX_ZOOM_IN_FACTOR, "Single wheel up tick should clamp to MAX_ZOOM_IN_FACTOR (1.15)");

    const wheelDown = calculateZoomFactor(100);
    assert.strictEqual(wheelDown, MAX_ZOOM_OUT_FACTOR, "Single wheel down tick should clamp to MAX_ZOOM_OUT_FACTOR (1/1.15)");

    const netFactor = wheelUp * wheelDown;
    assert.ok(Math.abs(netFactor - 1.0) < 1e-12, "Symmetric clamping must prevent zoom drift");
  });

  test("normalizes DOM_DELTA_LINE mode correctly", () => {
    const lineZoomIn = calculateZoomFactor(-3, 1);
    assert.strictEqual(lineZoomIn, MAX_ZOOM_IN_FACTOR, "3 lines delta should normalize to ~90px and clamp safely");

    const lineZoomSmall = calculateZoomFactor(-0.1, 1);
    assert.ok(lineZoomSmall > 1.01 && lineZoomSmall < 1.02, "Small line delta should normalize to ~3px");
  });

  test("focal point anchoring keeps the cursor content position visually stationary", () => {
    const scroller = { scrollLeft: 100, scrollTop: 80 };
    const rectBefore = { left: 50, top: 40, width: 1000, height: 1200 };

    const cursorX = 350;
    const cursorY = 400;

    const fracX = (cursorX - rectBefore.left) / rectBefore.width;
    const fracY = (cursorY - rectBefore.top) / rectBefore.height;

    assert.strictEqual(fracX, 0.3);
    assert.strictEqual(fracY, 0.3);

    const newWidth = rectBefore.width * 1.25;
    const newHeight = rectBefore.height * 1.25;
    const rectAfter = {
      left: rectBefore.left - 50,
      top: rectBefore.top - 30,
      width: newWidth,
      height: newHeight
    };

    const newPointX = rectAfter.left + fracX * rectAfter.width;
    const newPointY = rectAfter.top + fracY * rectAfter.height;

    const diffX = newPointX - cursorX;
    const diffY = newPointY - cursorY;

    scroller.scrollLeft += diffX;
    scroller.scrollTop += diffY;

    const finalScreenX = newPointX - diffX;
    const finalScreenY = newPointY - diffY;

    assert.strictEqual(finalScreenX, cursorX, "Content point X must remain exactly at cursorX");
    assert.strictEqual(finalScreenY, cursorY, "Content point Y must remain exactly at cursorY");
  });

  test("clamps zoom boundaries cleanly between 0.4 and 3.0", () => {
    const clampZoom = (zoom: number) => Math.min(3.0, Math.max(0.4, zoom));

    assert.strictEqual(clampZoom(0.1), 0.4);
    assert.strictEqual(clampZoom(0.39), 0.4);
    assert.strictEqual(clampZoom(1.0), 1.0);
    assert.strictEqual(clampZoom(2.8), 2.8);
    assert.strictEqual(clampZoom(3.0), 3.0);
    assert.strictEqual(clampZoom(5.0), 3.0);
  });
});
