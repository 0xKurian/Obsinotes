import { describe, test } from "node:test";
import assert from "node:assert";
import {
  DEFAULT_PEN_PRESETS,
  createDefaultPenPresets,
  sanitizePenPresets
} from "../src/settings/NotePagesSettings";
import {
  HistoryManager,
  SetPageBookmarkCommand,
  SetPageTitleCommand
} from "../src/history/HistoryManager";
import { DocumentSerializer } from "../src/storage/DocumentSerializer";
import { CURRENT_SCHEMA_VERSION, NotebookDocument, PageData, PenPreset } from "../src/types";
import { buildToolbarSubDock } from "../src/view/toolbar/ToolbarSubDockBuilder";
import type { NotePagesToolbarDelegate } from "../src/view/NotePagesToolbar";

interface TestDomElement {
  tagName: string;
  classes: Set<string>;
  attributes: Map<string, string>;
  style: Record<string, string>;
  textContent: string;
  value: string;
  disabled: boolean;
  isShown: boolean;
  children: TestDomElement[];
  listeners: Map<string, Array<(ev?: unknown) => void>>;
  createEl: (tag: string, opts?: { cls?: string; text?: string; value?: string }) => TestDomElement;
  createDiv: (opts?: { cls?: string }) => TestDomElement;
  createSpan: (opts?: { cls?: string; text?: string }) => TestDomElement;
  addClass: (cls: string) => void;
  removeClass: (cls: string) => void;
  toggleClass: (cls: string, force?: boolean) => void;
  hasClass: (cls: string) => boolean;
  setAttribute: (k: string, v: string) => void;
  getAttribute: (k: string) => string | undefined;
  setCssStyles: (styles: Record<string, string>) => void;
  setText: (txt: string) => void;
  empty: () => void;
  toggle: (show?: boolean) => void;
  trigger: (eventName: string, ev?: unknown) => void;
}

function createTestElement(tag: string = "div", initialCls: string = ""): TestDomElement {
  const classes = new Set<string>(initialCls.split(" ").filter(Boolean));
  const attributes = new Map<string, string>();
  const style: Record<string, string> = {};
  const children: TestDomElement[] = [];
  const listeners = new Map<string, Array<(ev?: unknown) => void>>();

  const el: TestDomElement = {
    tagName: tag.toUpperCase(),
    classes,
    attributes,
    style,
    textContent: "",
    value: "",
    disabled: false,
    isShown: true,
    children,
    listeners,
    createEl: (childTag: string, opts?: { cls?: string; text?: string; value?: string }) => {
      const child = createTestElement(childTag, opts?.cls || "");
      if (opts?.text !== undefined) child.textContent = opts.text;
      if (opts?.value !== undefined) child.value = opts.value;
      children.push(child);
      return child;
    },
    createDiv: (opts?: { cls?: string }) => {
      const child = createTestElement("div", opts?.cls || "");
      children.push(child);
      return child;
    },
    createSpan: (opts?: { cls?: string; text?: string }) => {
      const child = createTestElement("span", opts?.cls || "");
      if (opts?.text !== undefined) child.textContent = opts.text;
      children.push(child);
      return child;
    },
    addClass: (cls: string) => {
      cls.split(" ").filter(Boolean).forEach((c) => classes.add(c));
    },
    removeClass: (cls: string) => {
      cls.split(" ").filter(Boolean).forEach((c) => classes.delete(c));
    },
    toggleClass: (cls: string, force?: boolean) => {
      if (force === undefined) {
        if (classes.has(cls)) classes.delete(cls);
        else classes.add(cls);
      } else if (force) {
        classes.add(cls);
      } else {
        classes.delete(cls);
      }
    },
    hasClass: (cls: string) => classes.has(cls),
    setAttribute: (k: string, v: string) => {
      attributes.set(k, v);
    },
    getAttribute: (k: string) => attributes.get(k),
    setCssStyles: (styles: Record<string, string>) => {
      Object.assign(style, styles);
    },
    setText: (txt: string) => {
      el.textContent = txt;
    },
    empty: () => {
      children.length = 0;
    },
    toggle: (show?: boolean) => {
      el.isShown = show !== undefined ? Boolean(show) : !el.isShown;
    },
    trigger: (eventName: string, ev?: unknown) => {
      const handlers = listeners.get(eventName) || [];
      handlers.forEach((h) => h(ev));
    }
  };
  return el;
}

function makeSamplePage(): PageData {
  return {
    id: "page-1",
    pageNumber: 1,
    dimensions: { width: 595.28, height: 841.89, unit: "pt" },
    orientation: "portrait",
    template: {
      type: "ruled",
      backgroundColor: "#ffffff",
      lineColor: "#94a3b8",
      spacing: 24,
      opacity: 0.8
    },
    strokes: [],
    shapes: [],
    texts: [],
    images: []
  };
}

describe("Bookmarks, Custom Page Titles & Quick Pen Presets", () => {
  test("sanitizePenPresets validates entries, clamps widths, and falls back safely", () => {
    const fallback = sanitizePenPresets(null);
    assert.strictEqual(fallback.length, DEFAULT_PEN_PRESETS.length);
    assert.notStrictEqual(fallback[0], DEFAULT_PEN_PRESETS[0]);

    const emptyFallback = sanitizePenPresets([]);
    assert.strictEqual(emptyFallback.length, DEFAULT_PEN_PRESETS.length);

    const parsed = sanitizePenPresets([
      { id: "p1", label: "Fine Pencil", tool: "pencil", color: "#334155", width: 99, strokePattern: "dashed" },
      { id: "", label: "", tool: "eraser", color: "", width: 0.1, strokePattern: "invalid" },
      "bad-entry"
    ]);

    assert.strictEqual(parsed.length, 2);
    assert.deepStrictEqual(parsed[0], {
      id: "p1",
      label: "Fine Pencil",
      tool: "pencil",
      color: "#334155",
      width: 48,
      strokePattern: "dashed"
    });
    assert.deepStrictEqual(parsed[1], {
      id: "preset-2",
      label: "Preset 2",
      tool: "pressure",
      color: "#1e293b",
      width: 0.5,
      strokePattern: "solid"
    });
  });

  test("SetPageBookmarkCommand and SetPageTitleCommand support full undo/redo", () => {
    const page = makeSamplePage();
    const history = new HistoryManager();
    let mutations = 0;

    history.execute(new SetPageBookmarkCommand(page, true, () => { mutations++; }));
    assert.strictEqual(page.bookmarked, true);
    assert.strictEqual(mutations, 1);

    history.execute(new SetPageTitleCommand(page, "  Lecture 4  ", () => { mutations++; }));
    assert.strictEqual(page.title, "Lecture 4");

    history.execute(new SetPageTitleCommand(page, "   ", () => { mutations++; }));
    assert.strictEqual(page.title, undefined);

    assert.strictEqual(history.undo(), true);
    assert.strictEqual(page.title, "Lecture 4");

    assert.strictEqual(history.undo(), true);
    assert.strictEqual(page.title, undefined);

    assert.strictEqual(history.undo(), true);
    assert.strictEqual(page.bookmarked, undefined);

    assert.strictEqual(history.redo(), true);
    assert.strictEqual(page.bookmarked, true);
    assert.strictEqual(history.redo(), true);
    assert.strictEqual(page.title, "Lecture 4");
  });

  test("DocumentSerializer preserves PageData title and bookmarked flag on round-trip", () => {
    const page1 = makeSamplePage();
    page1.title = "Table of Contents";
    page1.bookmarked = true;

    const doc: NotebookDocument = {
      metadata: {
        title: "Bookmarked Notebook",
        createdAt: 1000,
        updatedAt: 2000,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        defaultPageSize: "A4",
        defaultOrientation: "portrait"
      },
      pages: [page1]
    };

    const raw = DocumentSerializer.serializeDocument(doc);
    const parsed = DocumentSerializer.deserializeDocument(raw);
    assert.strictEqual(parsed.success, true);
    if (parsed.success) {
      assert.strictEqual(parsed.document.pages[0].title, "Table of Contents");
      assert.strictEqual(parsed.document.pages[0].bookmarked, true);
    }
  });

  test("Toolbar sub-dock renders quick pen presets and dispatches select and save events", () => {
    const subToolbarEl = createTestElement("div", "notepages-sub-toolbar");
    const presets = createDefaultPenPresets();
    let selectedPreset: PenPreset | null = null;
    let savedIndex = -1;

    const delegate: Partial<NotePagesToolbarDelegate> = {
      getActiveTool: () => "pressure",
      getActiveColor: () => "#1e293b",
      getActiveWidth: () => 2.5,
      getStrokePattern: () => "solid",
      getCurrentShapeType: () => "rectangle",
      isShapeFillEnabled: () => false,
      getCurrentStickyColor: () => "#fef08a",
      getTextOptions: () => ({
        fontSize: 16,
        fontWeight: "normal",
        italic: false,
        underline: false,
        textAlign: "left"
      }),
      getPenPresets: () => presets,
      onSelectPenPreset: (p) => {
        selectedPreset = p;
      },
      onSavePenPreset: (idx) => {
        savedIndex = idx;
      },
      onSelectTool: () => {},
      onSelectColor: () => {},
      onSelectWidth: () => {},
      registerDomEvent: (el, type, callback) => {
        const mock = el as unknown as TestDomElement;
        if (mock.listeners) {
          const list = mock.listeners.get(type) || [];
          list.push(callback as (ev?: unknown) => void);
          mock.listeners.set(type, list);
        }
      }
    };

    const refs = buildToolbarSubDock(
      subToolbarEl as unknown as HTMLElement,
      delegate as NotePagesToolbarDelegate,
      {
        onShapeTypeSelected: () => {},
        onStickyColorSelected: () => {},
        onEraserRadiusSelected: () => {},
        onSelectionSubModeSelected: () => {}
      }
    );

    const container = refs.penPresetsContainer as unknown as TestDomElement;
    assert.strictEqual(container.children.length, presets.length);
    assert.strictEqual(container.children[0].hasClass("is-active"), true);
    assert.strictEqual(container.children[1].hasClass("is-active"), false);

    container.children[2].trigger("click", { shiftKey: false });
    assert.strictEqual(selectedPreset?.id, presets[2].id);

    container.children[1].trigger("click", { shiftKey: true });
    assert.strictEqual(savedIndex, 1);

    container.children[3].trigger("contextmenu", {
      preventDefault: () => {},
      stopPropagation: () => {}
    });
    assert.strictEqual(savedIndex, 3);
  });
});
