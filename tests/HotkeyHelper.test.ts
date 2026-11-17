import { test, describe } from "node:test";
import assert from "node:assert";
import {
  HOTKEY_ACTION_METADATA,
  areHotkeyBindingsEqual,
  countCustomizedHotkeys,
  findHotkeyConflicts,
  formatHotkeyBinding,
  normalizeKeyboardEventToBinding,
  resolveHotkeyBinding,
  sanitizeHotkeyMap
} from "../src/settings/HotkeyHelper";
import { HotkeyMap } from "../src/types";

describe("HotkeyHelper", () => {
  test("resolveHotkeyBinding returns defaults, overrides, and disabled null state", () => {
    assert.deepStrictEqual(resolveHotkeyBinding("toolPen", {}), { modifiers: [], key: "p" });

    const custom: HotkeyMap = {
      toolPen: { modifiers: ["Alt"], key: "B" },
      toolEraser: null
    };
    assert.deepStrictEqual(resolveHotkeyBinding("toolPen", custom), { modifiers: ["Alt"], key: "b" });
    assert.strictEqual(resolveHotkeyBinding("toolEraser", custom), null);
    assert.deepStrictEqual(resolveHotkeyBinding("undo", custom), { modifiers: ["Mod"], key: "z" });
  });

  test("normalizeKeyboardEventToBinding captures single keys, combos, and ignores bare modifiers", () => {
    assert.strictEqual(
      normalizeKeyboardEventToBinding({ key: "Shift", ctrlKey: false, metaKey: false, shiftKey: true, altKey: false }),
      null
    );
    assert.strictEqual(
      normalizeKeyboardEventToBinding({ key: "Control", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false }),
      null
    );

    assert.deepStrictEqual(
      normalizeKeyboardEventToBinding({ key: "P", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }, false),
      { modifiers: [], key: "p" }
    );
    assert.deepStrictEqual(
      normalizeKeyboardEventToBinding({ key: "Z", ctrlKey: true, metaKey: false, shiftKey: true, altKey: false }, false),
      { modifiers: ["Mod", "Shift"], key: "z" }
    );
    assert.deepStrictEqual(
      normalizeKeyboardEventToBinding({ key: "z", ctrlKey: false, metaKey: true, shiftKey: false, altKey: true }, true),
      { modifiers: ["Mod", "Alt"], key: "z" }
    );
    assert.deepStrictEqual(
      normalizeKeyboardEventToBinding({ key: "+", ctrlKey: false, metaKey: false, shiftKey: true, altKey: false }, false),
      { modifiers: [], key: "+" }
    );
  });

  test("findHotkeyConflicts detects matching shortcuts across actions and ignores disabled entries", () => {
    const custom: HotkeyMap = {
      toolEraser: { modifiers: [], key: "x" },
      toolShape: null
    };

    assert.deepStrictEqual(
      findHotkeyConflicts("toolPen", { modifiers: [], key: "X" }, custom),
      ["toolEraser"]
    );
    assert.deepStrictEqual(
      findHotkeyConflicts("toolPen", { modifiers: [], key: "s" }, custom),
      []
    );
    assert.deepStrictEqual(
      findHotkeyConflicts("redo", { modifiers: ["Shift", "Mod"], key: "Z" }, custom),
      []
    );
    assert.deepStrictEqual(
      findHotkeyConflicts("undo", { modifiers: ["Shift", "Mod"], key: "Z" }, custom),
      ["redo"]
    );
  });

  test("formatHotkeyBinding formats platform modifier labels and disabled state", () => {
    assert.strictEqual(formatHotkeyBinding(null, false), "Disabled");
    assert.strictEqual(formatHotkeyBinding({ modifiers: ["Mod", "Shift"], key: "z" }, false), "Ctrl+Shift+Z");
    assert.strictEqual(formatHotkeyBinding({ modifiers: ["Mod", "Shift"], key: "z" }, true), "Cmd+Shift+Z");
    assert.strictEqual(formatHotkeyBinding({ modifiers: [], key: "F2" }, false), "F2");
  });

  test("countCustomizedHotkeys and sanitizeHotkeyMap validate persisted data safely", () => {
    const sanitized = sanitizeHotkeyMap({
      toolPen: { modifiers: ["Shift", "InvalidMod"], key: "K" },
      toolEraser: null,
      undo: { modifiers: [], key: "" },
      unknownAction: { modifiers: [], key: "q" },
      badEntry: "not-an-object"
    });

    assert.deepStrictEqual(sanitized, {
      toolPen: { modifiers: ["Shift"], key: "k" },
      toolEraser: null
    });
    assert.strictEqual(countCustomizedHotkeys(sanitized), 2);
    assert.strictEqual(areHotkeyBindingsEqual({ modifiers: ["Alt", "Mod"], key: "A" }, { modifiers: ["Mod", "Alt"], key: "a" }), true);
    assert.strictEqual(HOTKEY_ACTION_METADATA.length, 30);
  });
});
