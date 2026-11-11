import { test, describe } from "node:test";
import assert from "node:assert";
import { NotePagesMinimap, NotePagesMinimapDelegate } from "../src/view/NotePagesMinimap";
import { PageDimensions } from "../src/types";

interface MockDomElement {
  tagName: string;
  classes: Set<string>;
  style: Record<string, string>;
  textContent: string;
  clientWidth: number;
  clientHeight: number;
  width: number;
  height: number;
  children: MockDomElement[];
  createEl: (tag: string, opts?: { cls?: string; text?: string; title?: string }) => MockDomElement;
  createDiv: (opts?: { cls?: string }) => MockDomElement;
  createSpan: (opts?: { cls?: string; text?: string }) => MockDomElement;
  addClass: (cls: string) => void;
  removeClass: (cls: string) => void;
  hasClass: (cls: string) => boolean;
  toggleClass: (cls: string, force?: boolean) => void;
  setAttribute: (key: string, val: string) => void;
  getAttribute: (key: string) => string | undefined;
  getBoundingClientRect: () => DOMRect;
  setCssStyles: (styles: Record<string, string>) => void;
  setPointerCapture?: (id: number) => void;
  releasePointerCapture?: (id: number) => void;
  getContext?: (type: string) => any;
  remove: () => void;
}

function createMockElement(tagName: string = "div", initialCls: string = ""): MockDomElement {
  const classes = new Set<string>(initialCls ? initialCls.split(" ").filter(Boolean) : []);
  const style: Record<string, string> = {};
  const children: MockDomElement[] = [];

  const el: MockDomElement = {
    tagName,
    classes,
    style,
    textContent: "",
    clientWidth: 120,
    clientHeight: 160,
    width: 120,
    height: 160,
    children,
    createEl(tag, opts) {
      const child = createMockElement(tag, opts?.cls || "");
      if (opts?.text) child.textContent = opts.text;
      children.push(child);
      return child;
    },
    createDiv(opts) {
      return this.createEl("div", opts);
    },
    createSpan(opts) {
      return this.createEl("span", opts);
    },
    addClass(cls) {
      classes.add(cls);
    },
    removeClass(cls) {
      classes.delete(cls);
    },
    hasClass(cls) {
      return classes.has(cls);
    },
    toggleClass(cls, force) {
      const shouldHave = force !== undefined ? force : !classes.has(cls);
      if (shouldHave) classes.add(cls);
      else classes.delete(cls);
    },
    setAttribute(_k, _v) {},
    getAttribute(_k) { return undefined; },
    getBoundingClientRect() {
      return {
        left: 0,
        top: 0,
        right: 120,
        bottom: 160,
        width: 120,
        height: 160,
        x: 0,
        y: 0,
        toJSON: () => {}
      } as DOMRect;
    },
    setCssStyles(styles: Record<string, string>) {
      Object.assign(style, styles);
    },
    remove() {}
  };

  return el;
}

describe("NotePagesMinimap", () => {
  test("auto-shows when zoomLevel > 1.0 and hides when zoomLevel <= 1.0", () => {
    let currentZoom = 1.0;
    const parent = createMockElement("div");

    const delegate: NotePagesMinimapDelegate = {
      getCurrentPageNumber: () => 1,
      getCurrentPageDimensions: () => ({ width: 600, height: 800, unit: "pt" }),
      getPageElement: () => undefined,
      getCommittedCanvas: () => undefined,
      getCurrentPageId: () => "page_1",
      getScrollerEl: () => undefined,
      getZoomLevel: () => currentZoom,
      scrollBy: () => {},
      scrollToPagePoint: () => {},
      registerDomEvent: () => {}
    };

    const minimap = new NotePagesMinimap(delegate);
    minimap.build(parent as unknown as HTMLElement);

    const container = parent.children[0];
    assert.ok(container.hasClass("is-hidden"), "Initial state should be hidden");

    currentZoom = 1.5;
    minimap.onZoomChanged(1.5);
    assert.strictEqual(container.hasClass("is-hidden"), false, "Zoom > 1.0 should unhide minimap");

    currentZoom = 1.0;
    minimap.onZoomChanged(1.0);
    assert.strictEqual(container.hasClass("is-hidden"), true, "Zoom <= 1.0 should hide minimap");
  });

  test("pinning keeps minimap visible when zoomed out", () => {
    let currentZoom = 1.0;
    const parent = createMockElement("div");

    const delegate: NotePagesMinimapDelegate = {
      getCurrentPageNumber: () => 1,
      getCurrentPageDimensions: () => ({ width: 600, height: 800, unit: "pt" }),
      getPageElement: () => undefined,
      getCommittedCanvas: () => undefined,
      getCurrentPageId: () => "page_1",
      getScrollerEl: () => undefined,
      getZoomLevel: () => currentZoom,
      scrollBy: () => {},
      scrollToPagePoint: () => {},
      registerDomEvent: () => {}
    };

    const minimap = new NotePagesMinimap(delegate);
    minimap.build(parent as unknown as HTMLElement);

    const container = parent.children[0];
    minimap.togglePin(); // pin is now active

    assert.strictEqual(container.hasClass("is-hidden"), false, "Pinned minimap should be visible");

    minimap.onZoomChanged(0.8);
    assert.strictEqual(container.hasClass("is-hidden"), false, "Pinned minimap remains visible even at 0.8 zoom");

    minimap.togglePin(); // unpin
    assert.strictEqual(container.hasClass("is-hidden"), true, "Unpinning at zoom <= 1.0 should hide minimap");
  });

  test("calculates viewfinder position accurately for 50% visible viewport", () => {
    const parent = createMockElement("div");

    // Page: 0, 0, 1000, 1000
    // Scroller visible rect: 250, 250, 750, 750 -> exactly center 50%
    const mockPageFrame = createMockElement("div");
    mockPageFrame.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 1000,
      bottom: 1000,
      width: 1000,
      height: 1000,
      x: 0,
      y: 0,
      toJSON: () => {}
    } as DOMRect);

    const mockScroller = createMockElement("div");
    mockScroller.getBoundingClientRect = () => ({
      left: 250,
      top: 250,
      right: 750,
      bottom: 750,
      width: 500,
      height: 500,
      x: 250,
      y: 250,
      toJSON: () => {}
    } as DOMRect);

    const delegate: NotePagesMinimapDelegate = {
      getCurrentPageNumber: () => 1,
      getCurrentPageDimensions: () => ({ width: 1000, height: 1000, unit: "pt" }),
      getPageElement: () => mockPageFrame as unknown as HTMLElement,
      getCommittedCanvas: () => undefined,
      getCurrentPageId: () => "page_1",
      getScrollerEl: () => mockScroller as unknown as HTMLElement,
      getZoomLevel: () => 2.0,
      scrollBy: () => {},
      scrollToPagePoint: () => {},
      registerDomEvent: () => {}
    };

    const minimap = new NotePagesMinimap(delegate);
    minimap.build(parent as unknown as HTMLElement);

    // Trigger update
    minimap.updateViewfinder();

    // Body is children[1], previewBox is body.children[0], viewfinder is previewBox.children[1]
    const body = parent.children[0].children[1];
    const preview = body.children[0];
    const viewfinder = preview.children[1];

    assert.strictEqual(viewfinder.hasClass("is-hidden"), false);
    assert.ok(viewfinder.style.transform.includes("translate(30px, 40px)"), `Expected translate near 30px, 40px but got ${viewfinder.style.transform}`);
  });

  test("clear resets viewfinder and auto-hides without detaching DOM", () => {
    const parent = createMockElement("div");
    let removed = false;

    const mockPageFrame = createMockElement("div");
    mockPageFrame.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 1000,
      bottom: 1000,
      width: 1000,
      height: 1000,
      x: 0,
      y: 0,
      toJSON: () => {}
    } as DOMRect);

    const mockScroller = createMockElement("div");
    mockScroller.getBoundingClientRect = () => ({
      left: 250,
      top: 250,
      right: 750,
      bottom: 750,
      width: 500,
      height: 500,
      x: 250,
      y: 250,
      toJSON: () => {}
    } as DOMRect);

    const delegate: NotePagesMinimapDelegate = {
      getCurrentPageNumber: () => 1,
      getCurrentPageDimensions: () => ({ width: 1000, height: 1000, unit: "pt" }),
      getPageElement: () => mockPageFrame as unknown as HTMLElement,
      getCommittedCanvas: () => undefined,
      getCurrentPageId: () => "page_1",
      getScrollerEl: () => mockScroller as unknown as HTMLElement,
      getZoomLevel: () => 2.0,
      scrollBy: () => {},
      scrollToPagePoint: () => {},
      registerDomEvent: () => {}
    };

    const minimap = new NotePagesMinimap(delegate);
    minimap.build(parent as unknown as HTMLElement);

    const container = parent.children[0];
    container.remove = () => {
      removed = true;
    };
    const preview = container.children[1].children[0];
    const viewfinder = preview.children[1];

    minimap.onZoomChanged(2.0);
    minimap.updateViewfinder();
    assert.strictEqual(container.hasClass("is-hidden"), false);
    assert.strictEqual(viewfinder.hasClass("is-hidden"), false);

    minimap.clear();
    assert.strictEqual(removed, false);
    assert.strictEqual(viewfinder.hasClass("is-hidden"), true);
    assert.strictEqual(container.hasClass("is-hidden"), true);

    minimap.togglePin();
    minimap.updateViewfinder();
    assert.strictEqual(container.hasClass("is-hidden"), false);
    minimap.clear();
    assert.strictEqual(removed, false);
    assert.strictEqual(viewfinder.hasClass("is-hidden"), true);
    assert.strictEqual(container.hasClass("is-hidden"), false);

    minimap.destroy();
    assert.strictEqual(removed, true);
  });

  test("renders thumbnail background using getCurrentPageBackgroundColor", () => {
    const parent = createMockElement("div");
    const filledStyles: string[] = [];

    const delegate: NotePagesMinimapDelegate = {
      getCurrentPageNumber: () => 1,
      getCurrentPageDimensions: () => ({ width: 600, height: 800, unit: "pt" }),
      getCurrentPageBackgroundColor: () => "#1e293b",
      getPageElement: () => undefined,
      getCommittedCanvas: () => undefined,
      getCurrentPageId: () => "page_1",
      getScrollerEl: () => undefined,
      getZoomLevel: () => 1.5,
      scrollBy: () => {},
      scrollToPagePoint: () => {},
      registerDomEvent: () => {}
    };

    const minimap = new NotePagesMinimap(delegate);
    minimap.build(parent as unknown as HTMLElement);

    const canvasEl = parent.children[0].children[1].children[0].children[0];
    const mockCtx = {
      fillStyle: "",
      clearRect: () => {},
      fillRect: () => {
        filledStyles.push(mockCtx.fillStyle);
      },
      drawImage: () => {},
      save: () => {},
      restore: () => {},
      scale: () => {}
    };
    canvasEl.getContext = () => mockCtx;

    minimap.renderThumbnail();
    assert.ok(filledStyles.includes("#1e293b"), `Expected background #1e293b in ${JSON.stringify(filledStyles)}`);
  });
});
