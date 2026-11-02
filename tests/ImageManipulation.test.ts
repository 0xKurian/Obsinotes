import { describe, it } from "node:test";
import assert from "node:assert";
import { SelectionEngine } from "../src/selection/SelectionEngine";
import { ImageController } from "../src/image/ImageController";
import {
  HistoryManager,
  ModifyImageCommand,
  TransformElementsCommand,
  MoveElementsAcrossPagesCommand
} from "../src/history/HistoryManager";
import { ImageObject, PageData } from "../src/types";

function createDummyPage(pageNumber = 1): PageData {
  return {
    id: `page_${pageNumber}`,
    pageNumber,
    dimensions: { width: 595, height: 842 },
    template: {
      type: "blank",
      lineSpacing: 24,
      gridSize: 20,
      backgroundColor: "#ffffff",
      lineColor: "#e5e7eb"
    },
    strokes: [],
    shapes: [],
    texts: [],
    images: []
  };
}

describe("Image Manipulation Feature", () => {
  it("detects image selection by lasso accurately", () => {
    const img: ImageObject = {
      id: "img_test_1",
      elementType: "image",
      assetId: "test.png",
      vaultPath: "attachments/test.png",
      x: 100,
      y: 100,
      width: 150,
      height: 100,
      rotation: 0,
      opacity: 1,
      bounds: { minX: 100, minY: 100, maxX: 250, maxY: 200 }
    };

    const enclosingPolygon = [
      { x: 50, y: 50 },
      { x: 300, y: 50 },
      { x: 300, y: 250 },
      { x: 50, y: 250 }
    ];
    assert.strictEqual(SelectionEngine.isImageSelectedByLasso(img, enclosingPolygon), true);

    const outsidePolygon = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
      { x: 0, y: 50 }
    ];
    assert.strictEqual(SelectionEngine.isImageSelectedByLasso(img, outsidePolygon), false);
  });

  it("calculates fitted dimensions maintaining aspect ratio", () => {
    const landscape = ImageController.calculateFittedDimensions(1200, 800, 400, 400);
    assert.strictEqual(landscape.width, 400);
    assert.strictEqual(landscape.height, 267);

    const portrait = ImageController.calculateFittedDimensions(600, 1200, 400, 400);
    assert.strictEqual(portrait.width, 200);
    assert.strictEqual(portrait.height, 400);

    const small = ImageController.calculateFittedDimensions(150, 100, 400, 400);
    assert.strictEqual(small.width, 150);
    assert.strictEqual(small.height, 100);

    const invalid = ImageController.calculateFittedDimensions(0, 0, 400, 400);
    assert.strictEqual(invalid.width, 300);
    assert.strictEqual(invalid.height, 200);
  });

  it("modifies, undoes, and redoes image modifications cleanly", () => {
    const page = createDummyPage();
    const history = new HistoryManager();

    const initialImg: ImageObject = {
      id: "img_mod_1",
      elementType: "image",
      assetId: "test.png",
      vaultPath: "attachments/test.png",
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      bounds: { minX: 100, minY: 100, maxX: 300, maxY: 250 }
    };
    page.images.push({ ...initialImg });

    const updatedImg: ImageObject = {
      ...initialImg,
      x: 150,
      y: 180,
      width: 250,
      height: 188,
      bounds: { minX: 150, minY: 180, maxX: 400, maxY: 368 }
    };

    let mutationCalled = false;
    const cmd = new ModifyImageCommand(page, initialImg, updatedImg, () => {
      mutationCalled = true;
    });

    history.execute(cmd);
    assert.strictEqual(mutationCalled, true);
    assert.strictEqual(page.images[0].x, 150);
    assert.strictEqual(page.images[0].y, 180);
    assert.strictEqual(page.images[0].width, 250);

    history.undo();
    assert.strictEqual(page.images[0].x, 100);
    assert.strictEqual(page.images[0].y, 100);
    assert.strictEqual(page.images[0].width, 200);

    history.redo();
    assert.strictEqual(page.images[0].x, 150);
    assert.strictEqual(page.images[0].y, 180);
    assert.strictEqual(page.images[0].width, 250);
  });

  it("transforms images via TransformElementsCommand with undo and redo", () => {
    const page = createDummyPage();
    const history = new HistoryManager();

    const prevImg: ImageObject = {
      id: "img_trans_1",
      elementType: "image",
      assetId: "test.png",
      vaultPath: "attachments/test.png",
      x: 50,
      y: 50,
      width: 100,
      height: 100
    };
    page.images.push({ ...prevImg });

    const nextImg: ImageObject = {
      ...prevImg,
      x: 120,
      y: 140,
      width: 150,
      height: 150
    };

    const cmd = new TransformElementsCommand(
      page,
      [],
      [],
      [],
      [],
      () => {},
      [prevImg],
      [nextImg]
    );

    history.execute(cmd);
    assert.strictEqual(page.images[0].x, 120);
    assert.strictEqual(page.images[0].y, 140);
    assert.strictEqual(page.images[0].width, 150);

    history.undo();
    assert.strictEqual(page.images[0].x, 50);
    assert.strictEqual(page.images[0].y, 50);
    assert.strictEqual(page.images[0].width, 100);

    history.redo();
    assert.strictEqual(page.images[0].x, 120);
    assert.strictEqual(page.images[0].y, 140);
  });

  it("moves images across pages cleanly via MoveElementsAcrossPagesCommand", () => {
    const sourcePage = createDummyPage(1);
    const targetPage = createDummyPage(2);
    const history = new HistoryManager();

    const sourceImg: ImageObject = {
      id: "img_cross_1",
      elementType: "image",
      assetId: "test.png",
      vaultPath: "attachments/test.png",
      x: 50,
      y: 60,
      width: 120,
      height: 90
    };
    sourcePage.images.push({ ...sourceImg });

    const targetImg: ImageObject = {
      ...sourceImg,
      x: 70,
      y: 80
    };

    const cmd = new MoveElementsAcrossPagesCommand(
      sourcePage,
      targetPage,
      [],
      [],
      [],
      [],
      () => {},
      [sourceImg],
      [targetImg]
    );

    history.execute(cmd);
    assert.strictEqual(sourcePage.images.length, 0);
    assert.strictEqual(targetPage.images.length, 1);
    assert.strictEqual(targetPage.images[0].x, 70);
    assert.strictEqual(targetPage.images[0].y, 80);

    history.undo();
    assert.strictEqual(sourcePage.images.length, 1);
    assert.strictEqual(targetPage.images.length, 0);
    assert.strictEqual(sourcePage.images[0].x, 50);

    history.redo();
    assert.strictEqual(sourcePage.images.length, 0);
    assert.strictEqual(targetPage.images.length, 1);
    assert.strictEqual(targetPage.images[0].x, 70);
  });

  it("computes combined bounding box enclosing images", () => {
    const img: ImageObject = {
      id: "img_bbox",
      elementType: "image",
      assetId: "test.png",
      vaultPath: "test.png",
      x: 50,
      y: 60,
      width: 100,
      height: 80
    };

    const bounds = SelectionEngine.computeCombinedBoundingBox([], [], [], [img]);
    assert.notStrictEqual(bounds, null);
    assert.strictEqual(bounds!.minX, 50);
    assert.strictEqual(bounds!.minY, 60);
    assert.strictEqual(bounds!.maxX, 150);
    assert.strictEqual(bounds!.maxY, 140);
  });
});
