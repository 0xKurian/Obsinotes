import { describe, it } from "node:test";
import assert from "node:assert";
import { getEffectivePageDimensions, PAGE_DIMENSION_PRESETS, PageSizePreset } from "../src/types";

describe("Page Dimensions Presets", () => {
  it("resolves all built-in presets accurately in portrait and landscape", () => {
    const presets: Exclude<PageSizePreset, "Custom">[] = [
      "A4",
      "A3",
      "A5",
      "B5",
      "Letter",
      "16:9",
      "Square"
    ];

    for (const preset of presets) {
      const base = PAGE_DIMENSION_PRESETS[preset];
      const minDim = Math.min(base.width, base.height);
      const maxDim = Math.max(base.width, base.height);

      const portrait = getEffectivePageDimensions(preset, "portrait");
      assert.strictEqual(portrait.width, minDim, `${preset} portrait width`);
      assert.strictEqual(portrait.height, maxDim, `${preset} portrait height`);
      assert.strictEqual(portrait.unit, "pt");

      const landscape = getEffectivePageDimensions(preset, "landscape");
      assert.strictEqual(landscape.width, maxDim, `${preset} landscape width`);
      assert.strictEqual(landscape.height, minDim, `${preset} landscape height`);
      assert.strictEqual(landscape.unit, "pt");
    }
  });

  it("handles Custom preset with orientation normalization and fallback", () => {
    const customLandscape = getEffectivePageDimensions("Custom", "landscape", {
      width: 500,
      height: 800,
      unit: "pt"
    });
    assert.deepStrictEqual(customLandscape, { width: 800, height: 500, unit: "pt" });

    const customPortrait = getEffectivePageDimensions("Custom", "portrait", {
      width: 800,
      height: 500,
      unit: "pt"
    });
    assert.deepStrictEqual(customPortrait, { width: 500, height: 800, unit: "pt" });

    const fallback = getEffectivePageDimensions("Custom", "portrait");
    assert.deepStrictEqual(fallback, PAGE_DIMENSION_PRESETS.A4);
  });
});
