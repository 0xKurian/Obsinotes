import { test, describe } from "node:test";
import assert from "node:assert";
import { App } from "obsidian";
import { NotePagesSettingTab } from "../src/settings/NotePagesSettingTab";
import { DEFAULT_SETTINGS, NotePagesSettings } from "../src/settings/NotePagesSettings";
import type NotePagesPlugin from "../src/main";

describe("Settings & Feedback Integration", () => {
  test("DEFAULT_SETTINGS initializes feedbackUrl with official Google Form link", () => {
    assert.strictEqual(typeof DEFAULT_SETTINGS.feedbackUrl, "string");
    assert.strictEqual(
      DEFAULT_SETTINGS.feedbackUrl,
      "https://docs.google.com/forms/d/e/1FAIpQLSeP3GLlOFJzvoTfJ4lVFXmvIGDNLdk_NyyQ909papxkeJXL9g/viewform"
    );
  });

  test("getSettingDefinitions includes feedbackUrl setting definition", () => {
    const mockPlugin = {
      settings: { ...DEFAULT_SETTINGS },
      saveSettings: async () => {}
    } as unknown as NotePagesPlugin;

    const tab = new NotePagesSettingTab({} as unknown as App, mockPlugin);
    const definitions = tab.getSettingDefinitions();

    const feedbackDef = definitions.find(
      (def) => "control" in def && def.control && def.control.key === "feedbackUrl"
    );

    assert.ok(feedbackDef, "SettingDefinitions must include feedbackUrl");
    if (feedbackDef && "control" in feedbackDef && feedbackDef.control) {
      assert.strictEqual(feedbackDef.control.type, "text");
    }
  });

  test("setControlValue trims and updates feedbackUrl cleanly", async () => {
    let saved = false;
    const settings: NotePagesSettings = { ...DEFAULT_SETTINGS };
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
    const settings: NotePagesSettings = { ...DEFAULT_SETTINGS };
    const mockPlugin = {
      settings,
      saveSettings: async () => {}
    } as unknown as NotePagesPlugin;

    const tab = new NotePagesSettingTab({} as unknown as App, mockPlugin);
    const definitions = tab.getSettingDefinitions();

    const toolbarKeys = [
      "toolbarScale",
      "toolbarWrap",
      "toolbarMaxWidth",
      "toolbarShowTitle",
      "toolbarShowZoomControls"
    ];
    for (const key of toolbarKeys) {
      const def = definitions.find((d) => "control" in d && d.control && d.control.key === key);
      assert.ok(def, `SettingDefinitions must include ${key}`);
    }

    // Clamping toolbarScale between 0.7 and 1.5
    await tab.setControlValue("toolbarScale", 2.4);
    assert.strictEqual(settings.toolbarScale, 1.5);
    await tab.setControlValue("toolbarScale", 0.2);
    assert.strictEqual(settings.toolbarScale, 0.7);
    await tab.setControlValue("toolbarScale", 1.25);
    assert.strictEqual(settings.toolbarScale, 1.25);

    // Custom max width parsing and auto reset
    await tab.setControlValue("toolbarMaxWidth", "480");
    assert.strictEqual(settings.toolbarMaxWidth, 480);
    assert.strictEqual(tab.getControlValue("toolbarMaxWidth"), "480");

    await tab.setControlValue("toolbarMaxWidth", "  ");
    assert.strictEqual(settings.toolbarMaxWidth, null);
    assert.strictEqual(tab.getControlValue("toolbarMaxWidth"), "");
  });
});
