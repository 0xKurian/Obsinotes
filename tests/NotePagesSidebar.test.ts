import { test, describe } from "node:test";
import assert from "node:assert";
import { NotePagesSidebar, NotePagesSidebarDelegate } from "../src/view/NotePagesSidebar";
import { PageData, PaperTemplateConfig } from "../src/types";
import { PageManager } from "../src/model/PageManager";

interface MockDomElement {
  tagName: string;
  classes: Set<string>;
  dataset: Record<string, string>;
  attributes: Map<string, string>;
  children: MockDomElement[];
  width: number;
  height: number;
  createEl: (tag: string, opts?: { cls?: string; text?: string }) => MockDomElement;
  createDiv: (opts?: { cls?: string }) => MockDomElement;
  createSpan: (opts?: { cls?: string; text?: string }) => MockDomElement;
  addClass: (cls: string) => void;
  removeClass: (cls: string) => void;
  hasClass: (cls: string) => boolean;
  setAttribute: (key: string, val: string) => void;
  getAttribute: (key: string) => string | undefined;
  querySelector: (sel: string) => MockDomElement | null;
  querySelectorAll: (sel: string) => MockDomElement[];
  empty: () => void;
  remove: () => void;
  getContext: (type: string) => unknown;
}

function createMockElement(tag: string = "div", initialCls: string = ""): MockDomElement {
  const classes = new Set<string>();
  if (initialCls) {
    initialCls.split(" ").filter(Boolean).forEach((c) => classes.add(c));
  }
  const attributes = new Map<string, string>();
  const dataset: Record<string, string> = {};
  const children: MockDomElement[] = [];

  const el: MockDomElement = {
    tagName: tag.toUpperCase(),
    classes,
    dataset,
    attributes,
    children,
    width: 100,
    height: 100,
    createEl: (childTag: string, opts?: { cls?: string; text?: string }) => {
      const child = createMockElement(childTag, opts?.cls || "");
      children.push(child);
      return child;
    },
    createDiv: (opts?: { cls?: string }) => el.createEl("div", opts),
    createSpan: (opts?: { cls?: string; text?: string }) => el.createEl("span", opts),
    addClass: (cls: string) => {
      classes.add(cls);
    },
    removeClass: (cls: string) => {
      classes.delete(cls);
    },
    hasClass: (cls: string) => classes.has(cls),
    setAttribute: (key: string, val: string) => {
      attributes.set(key, val);
    },
    getAttribute: (key: string) => attributes.get(key),
    querySelector: (_sel: string) => null,
    querySelectorAll: (_sel: string) => [],
    empty: () => {
      children.length = 0;
    },
    remove: () => {},
    getContext: () => ({
      clearRect: () => {},
      drawImage: () => {},
      save: () => {},
      restore: () => {},
      scale: () => {},
      fill: () => {},
      beginPath: () => {},
      stroke: () => {}
    })
  };

  return el;
}

const defaultTemplate: PaperTemplateConfig = {
  type: "blank",
  backgroundColor: "#ffffff",
  lineColor: "#e2e8f0",
  spacing: 24,
  opacity: 1
};

describe("NotePagesSidebar - Collapsed Guard and Dirty Thumbnails", () => {
  test("skips updating thumbnails when sidebar is collapsed and marks pages dirty", () => {
    const pages: PageData[] = [
      {
        id: "page-1",
        pageNumber: 1,
        dimensions: { width: 595, height: 842, unit: "pt" },
        orientation: "portrait",
        template: defaultTemplate,
        strokes: [],
        shapes: [],
        texts: [],
        images: []
      },
      {
        id: "page-2",
        pageNumber: 2,
        dimensions: { width: 595, height: 842, unit: "pt" },
        orientation: "portrait",
        template: defaultTemplate,
        strokes: [],
        shapes: [],
        texts: [],
        images: []
      }
    ];

    const pageManager = new PageManager({
      metadata: {
        title: "Test",
        createdAt: 100,
        updatedAt: 100,
        schemaVersion: 1,
        defaultPageSize: "A4",
        defaultOrientation: "portrait"
      },
      pages
    });

    const mockDelegate: NotePagesSidebarDelegate = {
      app: {} as any,
      getPageManager: () => pageManager,
      getCurrentPageNumber: () => 1,
      getPdfBackgroundManager: () => ({ renderPdfToCanvas: async () => false } as any),
      getPageFrame: () => null,
      resolveResourcePath: (p) => p,
      renderDocument: () => {},
      requestSave: () => {},
      scrollToPage: () => {},
      deletePageAndSyncDom: () => {},
      registerDomEvent: () => {}
    };

    const sidebar = new NotePagesSidebar(mockDelegate);
    const parentEl = createMockElement("div") as unknown as HTMLElement;
    sidebar.build(parentEl);

    // Initial state: not collapsed
    assert.strictEqual(sidebar.sidebarEl.hasClass("is-collapsed"), false);
    assert.strictEqual(sidebar.dirtyPageThumbnails.size, 0);

    // Collapse sidebar
    sidebar.toggle();
    assert.strictEqual(sidebar.sidebarEl.hasClass("is-collapsed"), true);

    // Call updateThumbnailStrokes on page 1 and page 2 while collapsed
    sidebar.updateThumbnailStrokes(pages[0]);
    sidebar.updateThumbnailStrokes(pages[1]);

    // Should be recorded as dirty, not processed
    assert.strictEqual(sidebar.dirtyPageThumbnails.size, 2);
    assert.ok(sidebar.dirtyPageThumbnails.has("page-1"));
    assert.ok(sidebar.dirtyPageThumbnails.has("page-2"));

    // Toggle back to open: should trigger refreshDirtyThumbnails and clear the set
    sidebar.toggle();
    assert.strictEqual(sidebar.sidebarEl.hasClass("is-collapsed"), false);
    assert.strictEqual(sidebar.dirtyPageThumbnails.size, 0);

    // Clean up
    sidebar.destroy();
    assert.strictEqual(sidebar.dirtyPageThumbnails.size, 0);
  });
});
