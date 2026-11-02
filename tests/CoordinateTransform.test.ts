import { test, describe } from "node:test";
import assert from "node:assert";
import {
  CoordinateTransform,
  Point2D,
  ViewportRect,
  PageLayoutInfo
} from "../src/geometry/CoordinateTransform";

describe("CoordinateTransform", () => {
  const viewportRect: ViewportRect = {
    left: 100,
    top: 50,
    width: 800,
    height: 600
  };

  const pageLayout: PageLayoutInfo = {
    pageId: "page-1",
    pageNumber: 1,
    x: 102.36,
    y: 32,
    width: 595.28,
    height: 841.89
  };

  test("screen to viewport conversion and inverse", () => {
    const screen: Point2D = { x: 250, y: 150 };
    const viewport = CoordinateTransform.screenToViewport(screen, viewportRect);

    assert.strictEqual(viewport.x, 150);
    assert.strictEqual(viewport.y, 100);

    const backToScreen = CoordinateTransform.viewportToScreen(viewport, viewportRect);
    assert.strictEqual(backToScreen.x, screen.x);
    assert.strictEqual(backToScreen.y, screen.y);
  });

  test("viewport to world conversion with zoom 1.0", () => {
    const viewport: Point2D = { x: 200, y: 300 };
    const scrollOffset: Point2D = { x: 50, y: 100 };
    const world = CoordinateTransform.viewportToWorld(viewport, 1.0, scrollOffset);

    assert.strictEqual(world.x, 250);
    assert.strictEqual(world.y, 400);

    const backToViewport = CoordinateTransform.worldToViewport(world, 1.0, scrollOffset);
    assert.strictEqual(backToViewport.x, viewport.x);
    assert.strictEqual(backToViewport.y, viewport.y);
  });

  test("viewport to world conversion with zoom 2.0", () => {
    const viewport: Point2D = { x: 200, y: 300 };
    const scrollOffset: Point2D = { x: 50, y: 100 };
    const world = CoordinateTransform.viewportToWorld(viewport, 2.0, scrollOffset);

    assert.strictEqual(world.x, 150);
    assert.strictEqual(world.y, 250);

    const backToViewport = CoordinateTransform.worldToViewport(world, 2.0, scrollOffset);
    assert.strictEqual(backToViewport.x, viewport.x);
    assert.strictEqual(backToViewport.y, viewport.y);
  });

  test("viewport to world conversion with zoom 0.5", () => {
    const viewport: Point2D = { x: 100, y: 150 };
    const scrollOffset: Point2D = { x: 20, y: 30 };
    const world = CoordinateTransform.viewportToWorld(viewport, 0.5, scrollOffset);

    assert.strictEqual(world.x, 220);
    assert.strictEqual(world.y, 330);

    const backToViewport = CoordinateTransform.worldToViewport(world, 0.5, scrollOffset);
    assert.strictEqual(backToViewport.x, viewport.x);
    assert.strictEqual(backToViewport.y, viewport.y);
  });

  test("world to page and page to world invertibility", () => {
    const world: Point2D = { x: 302.36, y: 232 };
    const page = CoordinateTransform.worldToPage(world, pageLayout);

    assert.strictEqual(Math.round(page.x), 200);
    assert.strictEqual(page.y, 200);

    const backToWorld = CoordinateTransform.pageToWorld(page, pageLayout);
    assert.strictEqual(backToWorld.x, world.x);
    assert.strictEqual(backToWorld.y, world.y);
  });

  test("full round trip screen to page and page to screen", () => {
    const originalScreen: Point2D = { x: 400, y: 300 };
    const zoom = 1.25;
    const scrollOffset: Point2D = { x: 50, y: 80 };

    const page = CoordinateTransform.screenToPage(
      originalScreen,
      viewportRect,
      zoom,
      scrollOffset,
      pageLayout
    );

    const restoredScreen = CoordinateTransform.pageToScreen(
      page,
      pageLayout,
      zoom,
      scrollOffset,
      viewportRect
    );

    assert.strictEqual(Math.round(restoredScreen.x), originalScreen.x);
    assert.strictEqual(Math.round(restoredScreen.y), originalScreen.y);
  });

  test("findPageAtWorldPoint identifies target page", () => {
    const pageLayout2: PageLayoutInfo = {
      pageId: "page-2",
      pageNumber: 2,
      x: 102.36,
      y: 905.89,
      width: 595.28,
      height: 841.89
    };
    const layouts = [pageLayout, pageLayout2];

    const pointInPage1: Point2D = { x: 200, y: 200 };
    const found1 = CoordinateTransform.findPageAtWorldPoint(pointInPage1, layouts);
    assert.notStrictEqual(found1, null);
    assert.strictEqual(found1?.pageId, "page-1");

    const pointInPage2: Point2D = { x: 200, y: 1000 };
    const found2 = CoordinateTransform.findPageAtWorldPoint(pointInPage2, layouts);
    assert.notStrictEqual(found2, null);
    assert.strictEqual(found2?.pageId, "page-2");

    const pointInGap: Point2D = { x: 200, y: 880 };
    const foundGap = CoordinateTransform.findPageAtWorldPoint(pointInGap, layouts);
    assert.strictEqual(foundGap, null);

    const closest = CoordinateTransform.findClosestPage(pointInGap, layouts);
    assert.notStrictEqual(closest, null);
    assert.strictEqual(closest?.pageId, "page-1");
  });
});
