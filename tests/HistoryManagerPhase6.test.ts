import { describe, it } from "node:test";
import assert from "node:assert";
import {
  AddTextCommand,
  ModifyTextCommand,
  AddImageCommand,
  DeleteElementsCommand,
  TransformElementsCommand,
  MoveElementsAcrossPagesCommand,
  HistoryManager
} from "../src/history/HistoryManager";
import { PageData, TextObject, ImageObject } from "../src/types";

describe("HistoryManager - Phase 6 Commands", () => {
  function createSamplePage(): PageData {
    return {
      id: "p1",
      pageNumber: 1,
      dimensions: { width: 595.28, height: 841.89, unit: "pt" },
      orientation: "portrait",
      template: {
        type: "ruled",
        backgroundColor: "#ffffff",
        lineColor: "#e2e8f0",
        spacing: 24,
        opacity: 0.8
      },
      strokes: [],
      shapes: [],
      texts: [],
      images: []
    };
  }

  it("adds, undoes, and redoes TextObject cleanly", () => {
    const page = createSamplePage();
    let mutated = false;
    const history = new HistoryManager();

    const textObj: TextObject = {
      id: "text_1",
      elementType: "text",
      x: 100,
      y: 150,
      width: 200,
      height: 40,
      content: "Hello World",
      fontSize: 16,
      fontFamily: "Inter",
      fontWeight: "normal",
      color: "#000000",
      textAlign: "left"
    };

    const cmd = new AddTextCommand(page, textObj, () => {
      mutated = true;
    });

    history.execute(cmd);
    assert.strictEqual(page.texts.length, 1);
    assert.strictEqual(page.texts[0].content, "Hello World");
    assert.strictEqual(mutated, true);

    mutated = false;
    history.undo();
    assert.strictEqual(page.texts.length, 0);
    assert.strictEqual(mutated, true);

    mutated = false;
    history.redo();
    assert.strictEqual(page.texts.length, 1);
    assert.strictEqual(page.texts[0].id, "text_1");
    assert.strictEqual(mutated, true);
  });

  it("modifies, undoes, and redoes text modifications cleanly", () => {
    const page = createSamplePage();
    const originalText: TextObject = {
      id: "text_mod",
      elementType: "text",
      x: 50,
      y: 50,
      width: 100,
      height: 30,
      content: "Initial Content",
      fontSize: 14,
      fontFamily: "Inter",
      fontWeight: "normal",
      color: "#000000",
      textAlign: "left"
    };
    page.texts.push({ ...originalText });

    const updatedText: TextObject = {
      ...originalText,
      content: "Updated Content",
      fontSize: 20,
      fontWeight: "bold"
    };

    const history = new HistoryManager();
    const cmd = new ModifyTextCommand(page, originalText, updatedText, () => {});

    history.execute(cmd);
    assert.strictEqual(page.texts[0].content, "Updated Content");
    assert.strictEqual(page.texts[0].fontSize, 20);
    assert.strictEqual(page.texts[0].fontWeight, "bold");

    history.undo();
    assert.strictEqual(page.texts[0].content, "Initial Content");
    assert.strictEqual(page.texts[0].fontSize, 14);

    history.redo();
    assert.strictEqual(page.texts[0].content, "Updated Content");
  });

  it("adds, undoes, and redoes ImageObject cleanly", () => {
    const page = createSamplePage();
    const history = new HistoryManager();

    const imageObj: ImageObject = {
      id: "img_1",
      elementType: "image",
      assetId: "attachments/photo.png",
      vaultPath: "attachments/photo.png",
      x: 80,
      y: 120,
      width: 300,
      height: 200,
      rotation: 0,
      opacity: 1
    };

    const cmd = new AddImageCommand(page, imageObj, () => {});

    history.execute(cmd);
    assert.strictEqual(page.images.length, 1);
    assert.strictEqual(page.images[0].vaultPath, "attachments/photo.png");

    history.undo();
    assert.strictEqual(page.images.length, 0);

    history.redo();
    assert.strictEqual(page.images.length, 1);
    assert.strictEqual(page.images[0].id, "img_1");
  });

  it("deletes mixed elements including texts and images and restores them upon undo", () => {
    const page = createSamplePage();
    const textObj: TextObject = {
      id: "txt_del",
      elementType: "text",
      x: 10,
      y: 10,
      width: 50,
      height: 20,
      content: "Delete me",
      fontSize: 12,
      fontFamily: "Inter",
      fontWeight: "normal",
      color: "#000",
      textAlign: "left"
    };
    const imgObj: ImageObject = {
      id: "img_del",
      elementType: "image",
      assetId: "a.png",
      vaultPath: "a.png",
      x: 20,
      y: 20,
      width: 100,
      height: 100,
      rotation: 0
    };

    page.texts.push(textObj);
    page.images.push(imgObj);

    const history = new HistoryManager();
    const cmd = new DeleteElementsCommand(
      page,
      [],
      [],
      () => {},
      [textObj],
      [imgObj]
    );

    history.execute(cmd);
    assert.strictEqual(page.texts.length, 0);
    assert.strictEqual(page.images.length, 0);

    history.undo();
    assert.strictEqual(page.texts.length, 1);
    assert.strictEqual(page.images.length, 1);
    assert.strictEqual(page.texts[0].id, "txt_del");
    assert.strictEqual(page.images[0].id, "img_del");
  });

  it("transforms texts via TransformElementsCommand with undo and redo", () => {
    const page = createSamplePage();
    const textObj: TextObject = {
      id: "txt_tf",
      elementType: "text",
      x: 50,
      y: 50,
      width: 100,
      height: 30,
      content: "Transform me",
      fontSize: 14,
      fontFamily: "Inter",
      fontWeight: "normal",
      color: "#000",
      textAlign: "left"
    };
    page.texts.push({ ...textObj });

    const transformedText: TextObject = {
      ...textObj,
      x: 120,
      y: 180,
      width: 150,
      height: 45
    };

    const history = new HistoryManager();
    const cmd = new TransformElementsCommand(
      page,
      [],
      [],
      [],
      [],
      () => {},
      [],
      [],
      [textObj],
      [transformedText]
    );

    history.execute(cmd);
    assert.strictEqual(page.texts[0].x, 120);
    assert.strictEqual(page.texts[0].y, 180);
    assert.strictEqual(page.texts[0].width, 150);

    history.undo();
    assert.strictEqual(page.texts[0].x, 50);
    assert.strictEqual(page.texts[0].y, 50);
    assert.strictEqual(page.texts[0].width, 100);

    history.redo();
    assert.strictEqual(page.texts[0].x, 120);
    assert.strictEqual(page.texts[0].y, 180);
    assert.strictEqual(page.texts[0].width, 150);
  });

  it("moves texts across pages cleanly via MoveElementsAcrossPagesCommand", () => {
    const sourcePage = createSamplePage();
    const targetPage = createSamplePage();
    targetPage.id = "p2";
    targetPage.pageNumber = 2;

    const textObj: TextObject = {
      id: "txt_move",
      elementType: "text",
      x: 40,
      y: 60,
      width: 120,
      height: 35,
      content: "Move across pages",
      fontSize: 16,
      fontFamily: "Inter",
      fontWeight: "normal",
      color: "#111",
      textAlign: "left"
    };
    sourcePage.texts.push({ ...textObj });

    const targetText: TextObject = {
      ...textObj,
      x: 80,
      y: 100
    };

    const history = new HistoryManager();
    const cmd = new MoveElementsAcrossPagesCommand(
      sourcePage,
      targetPage,
      [],
      [],
      [],
      [],
      () => {},
      [],
      [],
      [textObj],
      [targetText]
    );

    history.execute(cmd);
    assert.strictEqual(sourcePage.texts.length, 0);
    assert.strictEqual(targetPage.texts.length, 1);
    assert.strictEqual(targetPage.texts[0].x, 80);
    assert.strictEqual(targetPage.texts[0].y, 100);

    history.undo();
    assert.strictEqual(sourcePage.texts.length, 1);
    assert.strictEqual(targetPage.texts.length, 0);
    assert.strictEqual(sourcePage.texts[0].x, 40);
    assert.strictEqual(sourcePage.texts[0].y, 60);

    history.redo();
    assert.strictEqual(sourcePage.texts.length, 0);
    assert.strictEqual(targetPage.texts.length, 1);
    assert.strictEqual(targetPage.texts[0].id, "txt_move");
  });
});
