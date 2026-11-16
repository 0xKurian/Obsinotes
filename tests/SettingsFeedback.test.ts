import { test, describe } from "node:test";
import assert from "node:assert";
import { App } from "obsidian";
import type { SettingDefinitionControl, SettingDefinitionItem } from "obsidian";
import { NotePagesSettingTab } from "../src/settings/NotePagesSettingTab";
import { DEFAULT_SETTINGS, NotePagesSettings } from "../src/settings/NotePagesSettings";
import type NotePagesPlugin from "../src/main";

function collectControlDefinitions(items: SettingDefinitionItem[]): SettingDefinitionControl[] {
  const result: SettingDefinitionControl[] = [];
  for (const item of items) {
    if ("control" in item && item.control) {
      result.push(item as SettingDefinitionControl);
    }
    if ("items" in item && Array.isArray(item.items)) {
      result.push(...collectControlDefinitions(item.items as SettingDefinitionItem[]));
    }
  }
  return result;
}

describe("Settings & Feedback Integration", () => {
  test("DEFAULT_SETTINGS initializes feedbackUrl with official Google Form link", () => {
    assert.strictEqual(typeof DEFAULT_SETTINGS.feedbackUrl, "string");
    assert.strictEqual(
      DEFAULT_SETTINGS.feedbackUrl,
      "https://docs.google.com/forms/d/e/1FAIpQLSeP3GLlOFJzvoTfJ4lVFXmvIGDNLdk_NyyQ909papxkeJXL9g/viewform"
    );
  });

  test("getSettingDefinitions includes grouped settings, hotkeys page, and feedbackUrl", () => {
    const mockPlugin = {
      settings: { ...DEFAULT_SETTINGS, customHotkeys: {} },
      saveSettings: async () => {}
    } as unknown as NotePagesPlugin;

    const tab = new NotePagesSettingTab({} as unknown as App, mockPlugin);
    const definitions = tab.getSettingDefinitions();
    const controls = collectControlDefinitions(definitions);

    const feedbackDef = controls.find((def) => def.control.key === "feedbackUrl");
    assert.ok(feedbackDef, "SettingDefinitions must include feedbackUrl");
    assert.strictEqual(feedbackDef.control.type, "text");

    const shortcutsGroup = definitions.find(
      (def) => "type" in def && def.type === "group" && def.heading === "Shortcuts"
    );
    assert.ok(shortcutsGroup && "items" in shortcutsGroup && Array.isArray(shortcutsGroup.items));
    const hotkeysPage = shortcutsGroup.items.find(
      (item) => "type" in item && item.type === "page" && item.name === "Hotkeys"
    );
    assert.ok(hotkeysPage, "SettingDefinitions must include Hotkeys subpage");
  });

  test("setControlValue trims and updates feedbackUrl cleanly", async () => {
    let saved = false;
    const settings: NotePagesSettings = { ...DEFAULT_SETTINGS, customHotkeys: {} };
    const mockPlugin = {
      settings,
      saveSettings: async () => {
        saved = true;
      }
    } as unknown as NotePagesPlugin;

    const tab = new NotePagesSettingTab({} as unknown as App, mockPlugin);

    assert.strictEqual(
      tab.getControlValue("feedbackUrl"),
      "https://docs.google.com/forms/d/e/1FAIpQLSeP3GLlOFJzvoTfJ4lVFXmvIGDNLdk_NyyQ909papxkeJXL9g/viewform"
    );

    await tab.setControlValue("feedbackUrl", "   https://forms.gle/xyz123   ");
    assert.strictEqual(settings.feedbackUrl, "https://forms.gle/xyz123");
    assert.strictEqual(saved, true);
    assert.strictEqual(tab.getControlValue("feedbackUrl"), "https://forms.gle/xyz123");
  });

  test("fallback URL is used when feedbackUrl is blank", () => {
    const customUrl = "https://forms.gle/test";
    const defaultFallback = "https://github.com/0xKurian/Obsinotes/issues/new/choose";

    const emptyUrl = "";
    const resolvedWhenEmpty = emptyUrl || defaultFallback;
    assert.strictEqual(resolvedWhenEmpty, defaultFallback);

    const resolvedWhenCustom = customUrl || defaultFallback;
    assert.strictEqual(resolvedWhenCustom, customUrl);
  });

  test("toolbar size & layout settings definitions and validation work cleanly", async () => {
    const settings: NotePagesSettings = { ...DEFAULT_SETTINGS, customHotkeys: {} };
    const mockPlugin = {
      settings,
      saveSettings: async () => {}
    } as unknown as NotePagesPlugin;

    const tab = new NotePagesSettingTab({} as unknown as App, mockPlugin);
    const controls = collectControlDefinitions(tab.getSettingDefinitions());

    const toolbarKeys = [
      "toolbarPlacement",
      "toolbarScale",
      "toolbarDimWhileDrawing",
      "toolbarWrap",
      "toolbarMaxWidth",
      "toolbarShowTitle",
      "toolbarShowZoomControls"
    ];
    for (const key of toolbarKeys) {
      const def = controls.find((d) => d.control.key === key);
      assert.ok(def, `SettingDefinitions must include ${key}`);
    }

    await tab.setControlValue("toolbarScale", 2.4);
    assert.strictEqual(settings.toolbarScale, 1.5);
    await tab.setControlValue("toolbarScale", 0.2);
    assert.strictEqual(settings.toolbarScale, 0.7);
    await tab.setControlValue("toolbarScale", 1.25);
    assert.strictEqual(settings.toolbarScale, 1.25);

    await tab.setControlValue("toolbarMaxWidth", "480");
    assert.strictEqual(settings.toolbarMaxWidth, 480);
    assert.strictEqual(tab.getControlValue("toolbarMaxWidth"), "480");

    await tab.setControlValue("toolbarMaxWidth", "  ");
    assert.strictEqual(settings.toolbarMaxWidth, null);
    assert.strictEqual(tab.getControlValue("toolbarMaxWidth"), "");
  });

  test("stylus and drawing customization settings validate bounds and allowed options", async () => {
    const settings: NotePagesSettings = { ...DEFAULT_SETTINGS, customHotkeys: {} };
    assert.strictEqual(settings.stylusButtonAction, "hold");
    assert.strictEqual(settings.defaultTool, "pressure");
    assert.strictEqual(settings.palmRejectionDelayMs, 350);

    const mockPlugin = {
      settings,
      saveSettings: async () => {}
    } as unknown as NotePagesPlugin;

    const tab = new NotePagesSettingTab({} as unknown as App, mockPlugin);
    const controls = collectControlDefinitions(tab.getSettingDefinitions());

    const drawingKeys = [
      "defaultTool",
      "defaultPenColor",
      "defaultPenWidth",
      "defaultHighlighterWidth",
      "defaultEraserMode",
      "defaultEraserRadius",
      "shapeRecognitionEnabled",
      "drawWithFinger",
      "twoFingerTapUndoRedo",
      "palmRejectionDelayMs",
      "stylusButtonAction"
    ];
    for (const key of drawingKeys) {
      const def = controls.find((d) => d.control.key === key);
      assert.ok(def, `SettingDefinitions must include ${key}`);
    }

    await tab.setControlValue("stylusButtonAction", "toggle");
    assert.strictEqual(settings.stylusButtonAction, "toggle");
    await tab.setControlValue("stylusButtonAction", "invalid-value");
    assert.strictEqual(settings.stylusButtonAction, "toggle");

    await tab.setControlValue("defaultTool", "highlighter");
    assert.strictEqual(settings.defaultTool, "highlighter");
    await tab.setControlValue("defaultTool", "invalid");
    assert.strictEqual(settings.defaultTool, "highlighter");

    await tab.setControlValue("defaultPenWidth", 50);
    assert.strictEqual(settings.defaultPenWidth, 15);
    await tab.setControlValue("defaultPenWidth", 0.1);
    assert.strictEqual(settings.defaultPenWidth, 0.5);

    await tab.setControlValue("defaultHighlighterWidth", 100);
    assert.strictEqual(settings.defaultHighlighterWidth, 36);
    await tab.setControlValue("defaultHighlighterWidth", 1);
    assert.strictEqual(settings.defaultHighlighterWidth, 4);

    await tab.setControlValue("defaultEraserRadius", 99);
    assert.strictEqual(settings.defaultEraserRadius, 50);

    await tab.setControlValue("palmRejectionDelayMs", -50);
    assert.strictEqual(settings.palmRejectionDelayMs, 0);
    await tab.setControlValue("palmRejectionDelayMs", 2000);
    assert.strictEqual(settings.palmRejectionDelayMs, 1000);

    await tab.setControlValue("defaultEraserMode", "precision");
    assert.strictEqual(settings.defaultEraserMode, "precision");

    await tab.setControlValue("toolbarPlacement", "bottom");
    assert.strictEqual(settings.toolbarPlacement, "bottom");
    await tab.setControlValue("toolbarPlacement", "invalid");
    assert.strictEqual(settings.toolbarPlacement, "bottom");
  });
});
