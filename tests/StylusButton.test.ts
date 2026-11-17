import { test, describe } from "node:test";
import assert from "node:assert";
import {
  isStylusEraserButtonPressed,
  isStylusSecondaryMaskActive,
  StylusButtonState
} from "../src/ink/StylusButtonHelper";

describe("StylusButtonHelper & Samsung S Pen Button", () => {
  test("isStylusEraserButtonPressed detects S Pen barrel and eraser signals only for pen", () => {
    assert.strictEqual(isStylusEraserButtonPressed({ pointerType: "pen", button: 2, buttons: 2 }), true);
    assert.strictEqual(isStylusEraserButtonPressed({ pointerType: "pen", button: 5, buttons: 32 }), true);
    assert.strictEqual(isStylusEraserButtonPressed({ pointerType: "pen", button: 1, buttons: 4 }), true);
    assert.strictEqual(isStylusEraserButtonPressed({ pointerType: "pen", button: 0, buttons: 64 }), true);
    assert.strictEqual(isStylusEraserButtonPressed({ pointerType: "pen", button: 0, buttons: 3 }), true);
    assert.strictEqual(isStylusEraserButtonPressed({ pointerType: "pen", button: 0, buttons: 33 }), true);
    assert.strictEqual(isStylusEraserButtonPressed({ pointerType: "pen", button: -1, buttons: 2 }), true);
    assert.strictEqual(isStylusEraserButtonPressed({ pointerType: "pen", button: 0, buttons: 1 }), false);
    assert.strictEqual(isStylusEraserButtonPressed({ pointerType: "mouse", button: 2, buttons: 2 }), false);
    assert.strictEqual(isStylusEraserButtonPressed({ pointerType: "mouse", button: 1, buttons: 4 }), false);
    assert.strictEqual(isStylusEraserButtonPressed({ pointerType: "touch", button: 2, buttons: 2 }), false);
  });

  test("isStylusSecondaryMaskActive checks buttons bitmask for hover and move", () => {
    assert.strictEqual(isStylusSecondaryMaskActive({ pointerType: "pen", button: -1, buttons: 2 }), true);
    assert.strictEqual(isStylusSecondaryMaskActive({ pointerType: "pen", button: -1, buttons: 4 }), true);
    assert.strictEqual(isStylusSecondaryMaskActive({ pointerType: "pen", button: -1, buttons: 32 }), true);
    assert.strictEqual(isStylusSecondaryMaskActive({ pointerType: "pen", button: -1, buttons: 64 }), true);
    assert.strictEqual(isStylusSecondaryMaskActive({ pointerType: "pen", button: -1, buttons: 1 }), false);
    assert.strictEqual(isStylusSecondaryMaskActive({ pointerType: "mouse", button: -1, buttons: 2 }), false);
  });

  test("hold mode switches to eraser on hover/down and reverts cleanly on release or pointerup", () => {
    const state = new StylusButtonState();

    const hoverStart = state.handleHoverMove(
      { pointerType: "pen", button: -1, buttons: 2 },
      "hold",
      "pressure",
      false
    );
    assert.strictEqual(hoverStart, "eraser");
    assert.strictEqual(state.temporaryEraserTool, "pressure");

    const downWhileHeld = state.handlePointerDown(
      { pointerType: "pen", button: 0, buttons: 3 },
      "hold",
      "eraser"
    );
    assert.strictEqual(downWhileHeld, null);

    const hoverEnd = state.handleHoverMove(
      { pointerType: "pen", button: -1, buttons: 0 },
      "hold",
      "eraser",
      false
    );
    assert.strictEqual(hoverEnd, "pressure");
    assert.strictEqual(state.temporaryEraserTool, null);

    const directDown = state.handlePointerDown(
      { pointerType: "pen", button: 2, buttons: 3 },
      "hold",
      "lasso"
    );
    assert.strictEqual(directDown, "eraser");
    assert.strictEqual(state.temporaryEraserTool, "lasso");

    const revertOnUp = state.handlePointerUpOrCancel(
      { pointerType: "pen", button: 0, buttons: 0 },
      "hold"
    );
    assert.strictEqual(revertOnUp, "lasso");
    assert.strictEqual(state.temporaryEraserTool, null);
  });

  test("hold mode ignores hover transitions while actively drawing or touching", () => {
    const state = new StylusButtonState();

    const duringStroke = state.handleHoverMove(
      { pointerType: "pen", button: -1, buttons: 2 },
      "hold",
      "pressure",
      true
    );
    assert.strictEqual(duringStroke, null);

    const whileTipDown = state.handleHoverMove(
      { pointerType: "pen", button: -1, buttons: 3 },
      "hold",
      "pressure",
      false
    );
    assert.strictEqual(whileTipDown, null);
  });

  test("toggle mode switches eraser on rising edge without double-toggling on pointerdown", () => {
    const state = new StylusButtonState();

    const firstPress = state.handleHoverMove(
      { pointerType: "pen", button: -1, buttons: 2 },
      "toggle",
      "highlighter",
      false
    );
    assert.strictEqual(firstPress, "eraser");

    const heldAcrossDown = state.handlePointerDown(
      { pointerType: "pen", button: 0, buttons: 3 },
      "toggle",
      "eraser"
    );
    assert.strictEqual(heldAcrossDown, null);

    const releaseHover = state.handleHoverMove(
      { pointerType: "pen", button: -1, buttons: 0 },
      "toggle",
      "eraser",
      false
    );
    assert.strictEqual(releaseHover, null);

    const secondPress = state.handleHoverMove(
      { pointerType: "pen", button: -1, buttons: 32 },
      "toggle",
      "eraser",
      false
    );
    assert.strictEqual(secondPress, "highlighter");
  });

  test("toggle mode falls back to pressure after manual clearToggleHistory and off mode stays inactive", () => {
    const state = new StylusButtonState();

    state.handleHoverMove({ pointerType: "pen", button: -1, buttons: 2 }, "toggle", "highlighter", false);
    state.clearToggleHistory();
    state.handleHoverMove({ pointerType: "pen", button: -1, buttons: 0 }, "toggle", "eraser", false);

    const fallback = state.handleHoverMove(
      { pointerType: "pen", button: -1, buttons: 2 },
      "toggle",
      "eraser",
      false
    );
    assert.strictEqual(fallback, "pressure");

    state.reset();
    assert.strictEqual(
      state.handleHoverMove({ pointerType: "pen", button: -1, buttons: 2 }, "off", "pressure", false),
      null
    );
    assert.strictEqual(
      state.handlePointerDown({ pointerType: "pen", button: 2, buttons: 3 }, "off", "pressure"),
      null
    );
  });

  test("shouldSuppressContextMenu prevents Android WebView contextmenu leak after pen input", () => {
    const state = new StylusButtonState();
    assert.strictEqual(state.shouldSuppressContextMenu(undefined, false, 1000), false);
    assert.strictEqual(state.isRecentPenActivity(400, 1000), false);

    state.recordPointerEvent("pen", 1000);
    assert.strictEqual(state.isRecentPenActivity(400, 1250), true);
    assert.strictEqual(state.isRecentPenActivity(400, 1450), false);
    assert.strictEqual(state.shouldSuppressContextMenu(undefined, false, 1200), true);
    assert.strictEqual(state.shouldSuppressContextMenu("", false, 1999), true);
    assert.strictEqual(state.shouldSuppressContextMenu(undefined, false, 2001), false);
    assert.strictEqual(state.shouldSuppressContextMenu("pen", false, 3000), true);
    assert.strictEqual(state.shouldSuppressContextMenu("mouse", true, 3000), true);
  });

  test("handleActiveStrokeMove transitions early stroke to eraser on late Android button bit", () => {
    const state = new StylusButtonState();
    assert.strictEqual(
      state.handlePointerDown({ pointerType: "pen", button: 0, buttons: 1 }, "hold", "pressure"),
      null
    );

    const lateTakeover = state.handleActiveStrokeMove(
      { pointerType: "pen", button: -1, buttons: 33 },
      "hold",
      "pressure",
      24,
      2
    );
    assert.strictEqual(lateTakeover, "eraser");
    assert.strictEqual(state.temporaryEraserTool, "pressure");

    state.reset();
    assert.strictEqual(
      state.handleActiveStrokeMove(
        { pointerType: "pen", button: -1, buttons: 33 },
        "hold",
        "pressure",
        250,
        2
      ),
      null
    );
    assert.strictEqual(
      state.handleActiveStrokeMove(
        { pointerType: "pen", button: -1, buttons: 3 },
        "hold",
        "pressure",
        20,
        8
      ),
      null
    );
  });

  test("hold mode keeps eraser active across pointerup while side button stays held and reverts on release or cancel", () => {
    const state = new StylusButtonState();
    assert.strictEqual(
      state.handlePointerDown({ pointerType: "pen", button: 2, buttons: 3 }, "hold", "pressure"),
      "eraser"
    );

    const liftWhileButtonHeld = state.handlePointerUpOrCancel(
      { pointerType: "pen", button: 0, buttons: 32 },
      "hold",
      false
    );
    assert.strictEqual(liftWhileButtonHeld, null);
    assert.strictEqual(state.temporaryEraserTool, "pressure");

    const hoverReleased = state.handleHoverMove(
      { pointerType: "pen", button: -1, buttons: 0 },
      "hold",
      "eraser",
      false
    );
    assert.strictEqual(hoverReleased, "pressure");
    assert.strictEqual(state.temporaryEraserTool, null);

    assert.strictEqual(
      state.handlePointerDown({ pointerType: "pen", button: 2, buttons: 3 }, "hold", "highlighter"),
      "eraser"
    );
    const cancelledWhileHeld = state.handlePointerUpOrCancel(
      { pointerType: "pen", button: 0, buttons: 32 },
      "hold",
      true
    );
    assert.strictEqual(cancelledWhileHeld, "highlighter");
    assert.strictEqual(state.temporaryEraserTool, null);
  });
});
