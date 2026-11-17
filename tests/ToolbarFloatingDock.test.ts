import { test, describe } from "node:test";
import assert from "node:assert";
import { NotePagesToolbar, NotePagesToolbarDelegate } from "../src/view/NotePagesToolbar";
import { parseStrokeWidthInput, STROKE_WIDTH_PRESETS } from "../src/view/toolbar/ToolbarSubDockBuilder";
import { PaperTemplateType, ToolType, ShapeType, PageOrientation } from "../src/types";

interface MockDomElement {
  tagName: string;
  className: string;
  classes: Set<string>;
  attributes: Map<string, string>;
  style: Record<string, string>;
  disabled: boolean;
  value: string;
  textContent: string;
  children: MockDomElement[];
  options: { value: string; selected: boolean }[];
  isShown: boolean;
  createEl: (tag: string, opts?: { cls?: string; text?: string }) => MockDomElement;
  createDiv: (opts?: { cls?: string }) => MockDomElement;
  createSpan: (opts?: { cls?: string; text?: string }) => MockDomElement;
  addClass: (cls: string) => void;
  removeClass: (cls: string) => void;
  toggleClass: (cls: string, toggle?: boolean) => void;
  hasClass: (cls: string) => boolean;
  setAttribute: (key: string, val: string) => void;
  getAttribute: (key: string) => string | undefined;
  setCssStyles: (styles: Record<string, string>) => void;
  setCssProps: (props: Record<string, string>) => void;
  setText: (txt: string) => void;
  empty: () => void;
  toggle: (show?: boolean) => void;
  contains: (other: unknown) => boolean;
}

function createMockElement(tag: string = "div", initialCls: string = ""): MockDomElement {
  const classes = new Set<string>();
  if (initialCls) {
    initialCls.split(" ").filter(Boolean).forEach((c) => classes.add(c));
  }
  const attributes = new Map<string, string>();
  const style: Record<string, string> = {};
  const children: MockDomElement[] = [];
  const options: { value: string; selected: boolean }[] = [];

  const el: MockDomElement = {
    tagName: tag.toUpperCase(),
    get className() {
      return Array.from(classes).join(" ");
    },
    classes,
    attributes,
    style,
    disabled: false,
    value: "",
    textContent: "",
    children,
    options,
    isShown: true,
    createEl: (childTag: string, opts?: { cls?: string; text?: string }) => {
      const child = createMockElement(childTag, opts?.cls || "");
      if (opts?.text) child.textContent = opts.text;
      children.push(child);
      if (childTag.toLowerCase() === "option") {
        options.push({ value: opts?.text || "", selected: false });
      }
      return child;
    },
    createDiv: (opts?: { cls?: string }) => {
      const child = createMockElement("div", opts?.cls || "");
      children.push(child);
      return child;
    },
    createSpan: (opts?: { cls?: string; text?: string }) => {
      const child = createMockElement("span", opts?.cls || "");
      if (opts?.text) child.textContent = opts.text;
      children.push(child);
      return child;
    },
    addClass: (cls: string) => {
      classes.add(cls);
    },
    removeClass: (cls: string) => {
      classes.delete(cls);
    },
    toggleClass: (cls: string, toggleState?: boolean) => {
      const shouldAdd = toggleState !== undefined ? toggleState : !classes.has(cls);
      if (shouldAdd) {
        classes.add(cls);
      } else {
        classes.delete(cls);
      }
    },
    hasClass: (cls: string) => classes.has(cls),
    setAttribute: (key: string, val: string) => {
      attributes.set(key, val);
    },
    getAttribute: (key: string) => attributes.get(key),
    setCssStyles: (newStyles: Record<string, string>) => {
      Object.assign(style, newStyles);
    },
    setCssProps: (props: Record<string, string>) => {
      Object.assign(style, props);
    },
    setText: (txt: string) => {
      el.textContent = txt;
    },
    empty: () => {
      children.length = 0;
      el.textContent = "";
    },
    toggle: (show?: boolean) => {
      el.isShown = show !== undefined ? show : !el.isShown;
    },
    contains: (other: unknown) => {
      if (other === el) return true;
      return children.some((c) => c.contains(other));
    }
  };

  return el;
}

function createMockDelegate(overrides: Partial<NotePagesToolbarDelegate> = {}): NotePagesToolbarDelegate {
  return {
    onToggleSidebar: () => {},
    onQuickRename: () => {},
    getNotebookTitle: () => "My Test Notebook",
    onUndo: () => {},
    onRedo: () => {},
    onSelectTool: () => {},
    onSelectColor: () => {},
    onSelectWidth: () => {},
    onSelectEraserMode: () => {},
    onDuplicateSelection: () => {},
    onDeleteSelection: () => {},
    onSelectPaperTemplate: () => {},
    onToggleOrientation: () => {},
    onChangeZoom: () => {},
    onResetZoom: () => {},
    onOpenPdfPicker: () => {},
    onExportNotebook: () => {},
    onAddNewPage: () => {},
    onDuplicateCurrentPage: () => {},
    onDeleteCurrentPage: () => {},
    onTextSizeChanged: () => {},
    onTextBoldToggled: () => {},
    onTextItalicToggled: () => {},
    onTextUnderlineToggled: () => {},
    onTextAlignChanged: () => {},
    onTextDone: () => {},
    onSelectShapeType: () => {},
    onToggleShapeFill: () => false,
    onSelectStickyColor: () => {},
    getNotebookTemplate: () => ({ type: "ruled" as PaperTemplateType }),
    getNotebookOrientation: () => "portrait" as PageOrientation,
    getZoomLevel: () => 1.0,
    getActiveTool: () => "pressure" as ToolType,
    getActiveColor: () => "#1e293b",
    getActiveWidth: () => 2.5,
    getCurrentShapeType: () => "rectangle" as ShapeType,
    isShapeFillEnabled: () => false,
    getCurrentStickyColor: () => "#fef08a",
    getTextOptions: () => ({
      fontSize: 16,
      fontWeight: "normal",
      italic: false,
      underline: false,
      textAlign: "left" as const
    }),
    registerDomEvent: () => {},
    ...overrides
  };
}

describe("NotePages Floating Dock Toolbar Feature", () => {
  test("builds floating dock wrapper, main dock, sub-dock, and page popover elements cleanly", () => {
    const root = createMockElement("div", "notepages-view-container");
    const delegate = createMockDelegate();
    const toolbar = new NotePagesToolbar(delegate);

    toolbar.build(root as unknown as HTMLElement);

    assert.ok(toolbar.toolbarWrapperEl, "Wrapper element must exist");
    assert.strictEqual(
      (toolbar.toolbarWrapperEl as unknown as MockDomElement).hasClass("notepages-toolbar-float-wrapper"),
      true
    );
    assert.ok(toolbar.toolbarEl, "Main dock element must exist");
    assert.strictEqual(
      (toolbar.toolbarEl as unknown as MockDomElement).hasClass("notepages-floating-dock"),
      true
    );
    assert.ok(toolbar.subToolbarEl, "Sub-dock element must exist");
    assert.strictEqual(
      (toolbar.subToolbarEl as unknown as MockDomElement).hasClass("notepages-subtoolbar-float"),
      true
    );
    assert.ok(toolbar.pagePopoverEl, "Page popover element must exist");
    assert.strictEqual(
      (toolbar.pagePopoverEl as unknown as MockDomElement).hasClass("notepages-page-popover"),
      true
    );
    assert.strictEqual(
      (toolbar.pagePopoverEl as unknown as MockDomElement).hasClass("is-hidden"),
      true
    );
  });

  test("initializes primary tools with active tool button highlighted", () => {
    const root = createMockElement("div", "notepages-view-container");
    const delegate = createMockDelegate({ getActiveTool: () => "pressure" });
    const toolbar = new NotePagesToolbar(delegate);

    toolbar.build(root as unknown as HTMLElement);

    const pressureBtn = toolbar.toolButtons.get("pressure") as unknown as MockDomElement;
    assert.ok(pressureBtn, "Pressure pen button must exist");
    assert.strictEqual(pressureBtn.hasClass("is-active"), true);

    const eraserBtn = toolbar.toolButtons.get("eraser") as unknown as MockDomElement;
    assert.strictEqual(eraserBtn.hasClass("is-active"), false);
  });

  test("sub-dock visibility is automatically controlled by active tool", () => {
    const root = createMockElement("div", "notepages-view-container");
    const delegate = createMockDelegate();
    const toolbar = new NotePagesToolbar(delegate);

    toolbar.build(root as unknown as HTMLElement);
    const subDock = toolbar.subToolbarEl as unknown as MockDomElement;

    toolbar.setActiveTool("pressure", "rectangle", false);
    assert.strictEqual(subDock.isShown, true, "Sub-dock must be shown for pressure tool");
    assert.strictEqual(subDock.hasClass("is-hidden"), false, "Sub-dock must not have is-hidden for pressure tool");

    toolbar.setActiveTool("shape", "circle", false);
    assert.strictEqual(subDock.isShown, true, "Sub-dock must be shown for shape tool");
    assert.strictEqual(subDock.hasClass("is-hidden"), false, "Sub-dock must not have is-hidden for shape tool");

    toolbar.setActiveTool("text", "rectangle", false);
    assert.strictEqual(subDock.isShown, true, "Sub-dock must be shown for text tool");
    assert.strictEqual(subDock.hasClass("is-hidden"), false, "Sub-dock must not have is-hidden for text tool");

    toolbar.setActiveTool("eraser", "rectangle", false);
    assert.strictEqual(subDock.isShown, true, "Sub-dock must be shown for eraser tool");
    assert.strictEqual(subDock.hasClass("is-hidden"), false, "Sub-dock must not have is-hidden for eraser tool");

    toolbar.setActiveTool("image", "rectangle", false);
    assert.strictEqual(subDock.isShown, false, "Sub-dock must be hidden for image tool");
    assert.strictEqual(subDock.hasClass("is-hidden"), true, "Sub-dock must have is-hidden for image tool");

    toolbar.setActiveTool("lasso", "rectangle", false);
    assert.strictEqual(subDock.isShown, true, "Sub-dock must be shown for unified lasso select tool");
    assert.strictEqual(subDock.hasClass("is-hidden"), false, "Sub-dock must not have is-hidden for unified lasso select tool");

    toolbar.setSelectionSubMode("pan");
    assert.strictEqual((toolbar.selectionPanBtn as unknown as MockDomElement).hasClass("is-active"), true);
    assert.strictEqual((toolbar.selectionLassoBtn as unknown as MockDomElement).hasClass("is-active"), false);

    toolbar.setSelectionSubMode("lasso");
    assert.strictEqual((toolbar.selectionLassoBtn as unknown as MockDomElement).hasClass("is-active"), true);
    assert.strictEqual((toolbar.selectionPanBtn as unknown as MockDomElement).hasClass("is-active"), false);

    toolbar.updateSelectionUi(true);
    assert.strictEqual((toolbar.duplicateSelectionBtn as unknown as MockDomElement).isShown, true);
    assert.strictEqual((toolbar.deleteSelectionBtn as unknown as MockDomElement).isShown, true);
  });

  test("toggleCollapse toggles dock collapse state and updates UI accordingly", () => {
    const root = createMockElement("div", "notepages-view-container");
    const delegate = createMockDelegate({ getActiveTool: () => "pressure" });
    const toolbar = new NotePagesToolbar(delegate);

    toolbar.build(root as unknown as HTMLElement);
    const wrapper = toolbar.toolbarWrapperEl as unknown as MockDomElement;
    const subDock = toolbar.subToolbarEl as unknown as MockDomElement;

    assert.strictEqual(toolbar.isCollapsed, false);
    assert.strictEqual(wrapper.hasClass("is-dock-collapsed"), false);

    toolbar.toggleCollapse();
    assert.strictEqual(toolbar.isCollapsed, true);
    assert.strictEqual(wrapper.hasClass("is-dock-collapsed"), true);
    assert.strictEqual(subDock.isShown, false, "Sub-dock must be hidden when collapsed");
    assert.strictEqual(subDock.hasClass("is-hidden"), true, "Sub-dock must have is-hidden when collapsed");

    toolbar.toggleCollapse();
    assert.strictEqual(toolbar.isCollapsed, false);
    assert.strictEqual(wrapper.hasClass("is-dock-collapsed"), false);
    assert.strictEqual(subDock.isShown, true, "Sub-dock must be restored for pressure tool upon expanding");
    assert.strictEqual(subDock.hasClass("is-hidden"), false, "Sub-dock must not have is-hidden upon expanding");
  });

  test("togglePagePopover opens and closes popover modal cleanly", () => {
    const root = createMockElement("div", "notepages-view-container");
    const delegate = createMockDelegate();
    const toolbar = new NotePagesToolbar(delegate);

    toolbar.build(root as unknown as HTMLElement);
    const popover = toolbar.pagePopoverEl as unknown as MockDomElement;
    const pageMenuBtn = toolbar.pageMenuBtn as unknown as MockDomElement;

    assert.strictEqual(toolbar.isPagePopoverOpen, false);
    assert.strictEqual(popover.hasClass("is-hidden"), true);

    toolbar.togglePagePopover();
    assert.strictEqual(toolbar.isPagePopoverOpen, true);
    assert.strictEqual(popover.hasClass("is-hidden"), false);
    assert.strictEqual(pageMenuBtn.hasClass("is-active"), true);

    toolbar.togglePagePopover();
    assert.strictEqual(toolbar.isPagePopoverOpen, false);
    assert.strictEqual(popover.hasClass("is-hidden"), true);
    assert.strictEqual(pageMenuBtn.hasClass("is-active"), false);
  });

  test("setDrawingActive toggles is-drawing on floating toolbar wrapper for auto-dimming", () => {
    const root = createMockElement("div", "notepages-view-container");
    const delegate = createMockDelegate();
    const toolbar = new NotePagesToolbar(delegate);

    toolbar.build(root as unknown as HTMLElement);
    const wrapper = toolbar.toolbarWrapperEl as unknown as MockDomElement;

    assert.strictEqual(wrapper.hasClass("is-drawing"), false);

    toolbar.setDrawingActive(true);
    assert.strictEqual(wrapper.hasClass("is-drawing"), true);

    toolbar.setDrawingActive(false);
    assert.strictEqual(wrapper.hasClass("is-drawing"), false);
  });

  test("updateTitle updates notebook title display text", () => {
    const root = createMockElement("div", "notepages-view-container");
    const delegate = createMockDelegate({ getNotebookTitle: () => "Initial Title" });
    const toolbar = new NotePagesToolbar(delegate);

    toolbar.build(root as unknown as HTMLElement);
    const titleText = toolbar.titleTextEl as unknown as MockDomElement;
    assert.strictEqual(titleText.textContent, "Initial Title");

    toolbar.updateTitle("Updated Biology Notes");
    assert.strictEqual(titleText.textContent, "Updated Biology Notes");

    toolbar.updateTitle("");
    assert.strictEqual(titleText.textContent, "Untitled Notebook");
  });

  test("updateZoomDisplay updates zoom button text formatted as percentage", () => {
    const root = createMockElement("div", "notepages-view-container");
    const delegate = createMockDelegate({ getZoomLevel: () => 1.0 });
    const toolbar = new NotePagesToolbar(delegate);

    toolbar.build(root as unknown as HTMLElement);
    const zoomBtn = toolbar.zoomResetBtn as unknown as MockDomElement;
    assert.strictEqual(zoomBtn.textContent, "100%");

    toolbar.updateZoomDisplay(1.25);
    assert.strictEqual(zoomBtn.textContent, "125%");

    toolbar.updateZoomDisplay(0.5);
    assert.strictEqual(zoomBtn.textContent, "50%");
  });

  test("updatePaperTemplateButtons highlights active paper template cleanly", () => {
    const root = createMockElement("div", "notepages-view-container");
    const delegate = createMockDelegate({ getNotebookTemplate: () => ({ type: "ruled" }) });
    const toolbar = new NotePagesToolbar(delegate);

    toolbar.build(root as unknown as HTMLElement);

    const ruledBtn = toolbar.paperTemplateButtons.get("ruled") as unknown as MockDomElement;
    const gridBtn = toolbar.paperTemplateButtons.get("grid") as unknown as MockDomElement;

    assert.strictEqual(ruledBtn.hasClass("is-active"), true);
    assert.strictEqual(gridBtn.hasClass("is-active"), false);

    toolbar.updatePaperTemplateButtons("grid");
    assert.strictEqual(ruledBtn.hasClass("is-active"), false);
    assert.strictEqual(gridBtn.hasClass("is-active"), true);
  });

  test("eraser size buttons allow switching between S, M, L radius presets", () => {
    let selectedRadius: number | null = null;
    const root = createMockElement("div", "notepages-view-container");
    const delegate = createMockDelegate({
      getActiveEraserRadius: () => 12,
      onSelectEraserRadius: (r: number) => {
        selectedRadius = r;
      }
    });
    const toolbar = new NotePagesToolbar(delegate);

    toolbar.build(root as unknown as HTMLElement);

    const btnSmall = toolbar.eraserSizeButtons.get(6) as unknown as MockDomElement;
    const btnMedium = toolbar.eraserSizeButtons.get(12) as unknown as MockDomElement;
    const btnLarge = toolbar.eraserSizeButtons.get(24) as unknown as MockDomElement;

    assert.ok(btnSmall, "Small eraser size button must exist");
    assert.ok(btnMedium, "Medium eraser size button must exist");
    assert.ok(btnLarge, "Large eraser size button must exist");

    assert.strictEqual(btnMedium.hasClass("is-active"), true);
    assert.strictEqual(btnSmall.hasClass("is-active"), false);

    toolbar.setEraserRadius(24);
    assert.strictEqual(btnLarge.hasClass("is-active"), true);
    assert.strictEqual(btnMedium.hasClass("is-active"), false);
  });

  test("applyLayoutConfig keeps fixed toolbar size and toggles visibility classes", () => {
    const root = createMockElement("div", "notepages-view-container");
    const delegate = createMockDelegate({
      getToolbarLayoutConfig: () => ({
        scale: 1.0,
        maxWidth: null,
        wrap: false,
        showTitle: true,
        showZoomControls: true
      })
    });
    const toolbar = new NotePagesToolbar(delegate);
    toolbar.build(root as unknown as HTMLElement);

    const wrapper = toolbar.toolbarWrapperEl as unknown as MockDomElement;
    assert.strictEqual(wrapper.style["--np-toolbar-scale"], "1");
    assert.strictEqual(wrapper.style["--np-toolbar-max-width"], "calc(100% - 24px)");
    assert.strictEqual(wrapper.hasClass("is-toolbar-wrap"), false);
    assert.strictEqual(wrapper.hasClass("is-hide-title"), false);
    assert.strictEqual(wrapper.hasClass("is-hide-zoom"), false);
    assert.strictEqual(wrapper.hasClass("is-custom-width"), false);

    // Fixed toolbar ignores arbitrary scale/width/wrap overrides while applying visibility toggles
    toolbar.applyLayoutConfig({
      scale: 2.0,
      maxWidth: 420,
      wrap: true,
      showTitle: false,
      showZoomControls: false
    });

    assert.strictEqual(toolbar.layoutConfig.scale, 1.0);
    assert.strictEqual(toolbar.layoutConfig.maxWidth, null);
    assert.strictEqual(toolbar.layoutConfig.wrap, false);
    assert.strictEqual(wrapper.style["--np-toolbar-scale"], "1");
    assert.strictEqual(wrapper.style["--np-toolbar-max-width"], "calc(100% - 24px)");
    assert.strictEqual(wrapper.hasClass("is-toolbar-wrap"), false);
    assert.strictEqual(wrapper.hasClass("is-custom-width"), false);
    assert.strictEqual(wrapper.hasClass("is-hide-title"), true);
    assert.strictEqual(wrapper.hasClass("is-hide-zoom"), true);
  });

  test("dock omits resize handle, switches 4 edge placements cleanly, and snaps drag to nearest edge", () => {
    const root = createMockElement("div", "notepages-view-container");
    (root as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 } as DOMRect);

    const listeners = new Map<unknown, Map<string, Array<(ev: unknown) => void>>>();
    let savedPlacement = "top";
    const delegate = createMockDelegate({
      onSetToolbarPlacement: (p) => {
        savedPlacement = p;
      },
      registerDomEvent: (el: unknown, type: string, cb: (ev: unknown) => void) => {
        if (!listeners.has(el)) {
          listeners.set(el, new Map());
        }
        const elMap = listeners.get(el)!;
        if (!elMap.has(type)) {
          elMap.set(type, []);
        }
        elMap.get(type)!.push(cb);
      }
    });
    const toolbar = new NotePagesToolbar(delegate);
    toolbar.build(root as unknown as HTMLElement);

    const dock = toolbar.toolbarEl as unknown as MockDomElement;
    const resizeHandle = dock.children.find((c) => c.hasClass("notepages-dock-resize-handle"));
    assert.strictEqual(resizeHandle, undefined, "Fixed toolbar must not include resize handle");

    const wrapper = toolbar.toolbarWrapperEl as unknown as MockDomElement;
    (wrapper as unknown as { parentElement: unknown }).parentElement = root;
    toolbar.setPlacement("left");
    assert.strictEqual(savedPlacement, "left");
    assert.strictEqual(wrapper.hasClass("is-position-left"), true);
    assert.strictEqual(wrapper.hasClass("is-position-top"), false);

    // Dragging near bottom edge snaps to "bottom" rather than leaving floating
    let currentRect = { left: 20, top: 380, right: 100, bottom: 420, width: 80, height: 40 };
    (wrapper as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
      currentRect as DOMRect;
    const dragHandle = (toolbar as unknown as { dragHandleEl: MockDomElement }).dragHandleEl;
    const handleListeners = listeners.get(dragHandle)!;
    (handleListeners.get("pointerdown") ?? [])[0]({
      pointerId: 3,
      clientX: 40,
      clientY: 400,
      stopPropagation: () => {},
      preventDefault: () => {}
    });
    (handleListeners.get("pointermove") ?? [])[0]({
      pointerId: 3,
      clientX: 450,
      clientY: 740,
      stopPropagation: () => {},
      preventDefault: () => {}
    });
    currentRect = { left: 350, top: 730, right: 650, bottom: 774, width: 300, height: 44 };
    (handleListeners.get("pointerup") ?? [])[0]({ pointerId: 3 });
    assert.strictEqual(savedPlacement, "bottom");
    assert.strictEqual(wrapper.hasClass("is-position-bottom"), true);
  });

  test("toolbar customize popover opens independently and stays mutually exclusive with page popover", () => {
    const root = createMockElement("div", "notepages-view-container");
    const delegate = createMockDelegate();
    const toolbar = new NotePagesToolbar(delegate);
    toolbar.build(root as unknown as HTMLElement);

    const toolbarPopover = toolbar.toolbarPopoverEl as unknown as MockDomElement;
    const pagePopover = toolbar.pagePopoverEl as unknown as MockDomElement;
    assert.ok(toolbarPopover, "Toolbar customize popover must exist");
    assert.strictEqual(toolbarPopover.hasClass("is-hidden"), true);

    toolbar.openToolbarPopover();
    assert.strictEqual(toolbar.isToolbarPopoverOpen, true);
    assert.strictEqual(toolbarPopover.hasClass("is-hidden"), false);

    toolbar.openPagePopover();
    assert.strictEqual(toolbar.isPagePopoverOpen, true);
    assert.strictEqual(pagePopover.hasClass("is-hidden"), false);
    assert.strictEqual(toolbar.isToolbarPopoverOpen, false);
    assert.strictEqual(toolbarPopover.hasClass("is-hidden"), true);
  });

  test("toolbar customize popover remains pinned at fixed coordinates when scaling or moving dock", () => {
    const root = createMockElement("div", "notepages-view-container");
    (root as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 } as DOMRect);

    const delegate = createMockDelegate();
    const toolbar = new NotePagesToolbar(delegate);
    toolbar.build(root as unknown as HTMLElement);

    (toolbar.toolbarEl as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
      ({ left: 940, top: 100, right: 988, bottom: 700, width: 48, height: 600 } as DOMRect);
    (toolbar.toolbarPopoverEl as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 316, bottom: 340, width: 316, height: 340 } as DOMRect);

    assert.strictEqual((toolbar.toolbarWrapperEl as unknown as MockDomElement).contains(toolbar.toolbarPopoverEl), false);
    assert.strictEqual(root.contains(toolbar.toolbarPopoverEl), true);

    toolbar.setPlacement("right", false);
    toolbar.openToolbarPopover();

    const pop = toolbar.toolbarPopoverEl as unknown as MockDomElement;
    const initialLeft = pop.style.left;
    const initialTop = pop.style.top;
    assert.ok(initialLeft && initialTop, "Initial pinned coordinates must be computed");

    toolbar.applyLayoutConfig({
      scale: 1.45,
      maxWidth: 420,
      wrap: true,
      showTitle: false,
      showZoomControls: false
    });
    toolbar.setPlacement("left", false);

    assert.strictEqual(pop.style.left, initialLeft);
    assert.strictEqual(pop.style.top, initialTop);
  });

  test("toolbar contextmenu suppresses stylus popover trigger and pointercancel does not toggle popover", () => {
    const root = createMockElement("div", "notepages-view-container");
    const listeners = new Map<unknown, Map<string, Array<(ev: unknown) => void>>>();
    let suppressNext = true;

    const delegate = createMockDelegate({
      shouldSuppressToolbarContextMenu: () => suppressNext,
      registerDomEvent: (el: unknown, type: string, cb: (ev: unknown) => void) => {
        if (!listeners.has(el)) {
          listeners.set(el, new Map());
        }
        const elMap = listeners.get(el)!;
        if (!elMap.has(type)) {
          elMap.set(type, []);
        }
        elMap.get(type)!.push(cb);
      }
    });

    const toolbar = new NotePagesToolbar(delegate);
    toolbar.build(root as unknown as HTMLElement);

    const dockListeners = listeners.get(toolbar.toolbarEl)?.get("contextmenu") ?? [];
    assert.strictEqual(dockListeners.length, 1);

    let prevented = false;
    let stopped = false;
    dockListeners[0]({
      pointerType: "pen",
      preventDefault: () => {
        prevented = true;
      },
      stopPropagation: () => {
        stopped = true;
      }
    });
    assert.strictEqual(prevented, true);
    assert.strictEqual(stopped, true);
    assert.strictEqual(toolbar.isToolbarPopoverOpen, false);

    suppressNext = false;
    dockListeners[0]({
      pointerType: "mouse",
      preventDefault: () => {},
      stopPropagation: () => {}
    });
    assert.strictEqual(toolbar.isToolbarPopoverOpen, true);
    toolbar.closeToolbarPopover();

    const dragHandle = (toolbar as unknown as { dragHandleEl: MockDomElement }).dragHandleEl;
    (toolbar.toolbarWrapperEl as unknown as { getBoundingClientRect: () => { left: number; top: number } }).getBoundingClientRect = () => ({ left: 0, top: 0 });
    const handleListeners = listeners.get(dragHandle);
    assert.ok(handleListeners);
    (handleListeners.get("pointerdown") ?? [])[0]({
      pointerId: 7,
      clientX: 10,
      clientY: 10,
      stopPropagation: () => {},
      preventDefault: () => {}
    });
    (handleListeners.get("pointercancel") ?? [])[0]({ pointerId: 7 });
    assert.strictEqual(toolbar.isToolbarPopoverOpen, false);
  });

  test("parseStrokeWidthInput parses decimals, commas, clamps range, and rejects invalid text", () => {
    assert.strictEqual(parseStrokeWidthInput("3.5"), 3.5);
    assert.strictEqual(parseStrokeWidthInput(" 4,26 "), 4.3);
    assert.strictEqual(parseStrokeWidthInput("0.1"), 0.5);
    assert.strictEqual(parseStrokeWidthInput("45"), 30);
    assert.strictEqual(parseStrokeWidthInput(""), null);
    assert.strictEqual(parseStrokeWidthInput("-2"), null);
    assert.strictEqual(parseStrokeWidthInput("abc"), null);
  });

  test("stroke width presets and direct numeric input update active width cleanly", () => {
    const root = createMockElement("div", "notepages-view-container");
    const listeners = new Map<unknown, Map<string, Array<(ev: unknown) => void>>>();
    const selectedWidths: number[] = [];
    let currentWidth = 2.5;

    const delegate = createMockDelegate({
      getActiveWidth: () => currentWidth,
      onSelectWidth: (w) => {
        currentWidth = w;
        selectedWidths.push(w);
        toolbar.setActiveWidth(w);
      },
      registerDomEvent: (el: unknown, type: string, cb: (ev: unknown) => void) => {
        if (!listeners.has(el)) {
          listeners.set(el, new Map());
        }
        const elMap = listeners.get(el)!;
        if (!elMap.has(type)) {
          elMap.set(type, []);
        }
        elMap.get(type)!.push(cb);
      }
    });

    const toolbar = new NotePagesToolbar(delegate);
    toolbar.build(root as unknown as HTMLElement);

    // Preset buttons exist for all default widths and highlight active width
    assert.strictEqual(toolbar.widthPresetButtons.size, STROKE_WIDTH_PRESETS.length);
    const btn25 = toolbar.widthPresetButtons.get(2.5) as unknown as MockDomElement;
    const btn5 = toolbar.widthPresetButtons.get(5) as unknown as MockDomElement;
    assert.strictEqual(btn25.hasClass("is-active"), true);
    assert.strictEqual(btn5.hasClass("is-active"), false);

    // Clicking preset 5 selects 5 and updates active button + number input + slider
    (listeners.get(btn5)?.get("click") ?? [])[0]({});
    assert.strictEqual(currentWidth, 5);
    assert.strictEqual(btn5.hasClass("is-active"), true);
    assert.strictEqual(btn25.hasClass("is-active"), false);
    assert.strictEqual(toolbar.widthNumberInput.value, "5");
    assert.strictEqual(toolbar.widthSliderInput.value, "5");

    // Typing a custom width with comma and pressing Enter commits clamped/rounded width
    toolbar.widthNumberInput.value = "7,4";
    let enterPrevented = false;
    let enterStopped = false;
    (listeners.get(toolbar.widthNumberInput)?.get("keydown") ?? [])[0]({
      key: "Enter",
      preventDefault: () => {
        enterPrevented = true;
      },
      stopPropagation: () => {
        enterStopped = true;
      }
    });
    assert.strictEqual(enterPrevented, true);
    assert.strictEqual(enterStopped, true);
    assert.strictEqual(currentWidth, 7.4);
    assert.strictEqual(toolbar.widthSliderInput.value, "7.4");
    assert.strictEqual(btn5.hasClass("is-active"), false);

    // Pressing Escape restores active width without committing invalid edit
    toolbar.widthNumberInput.value = "99";
    (listeners.get(toolbar.widthNumberInput)?.get("keydown") ?? [])[0]({
      key: "Escape",
      preventDefault: () => {},
      stopPropagation: () => {}
    });
    assert.strictEqual(currentWidth, 7.4);
    assert.strictEqual(toolbar.widthNumberInput.value, "7.4");

    // Blurring with out-of-range value clamps to 30
    toolbar.widthNumberInput.value = "120";
    (listeners.get(toolbar.widthNumberInput)?.get("blur") ?? [])[0]({});
    assert.strictEqual(currentWidth, 30);
    assert.strictEqual(toolbar.widthNumberInput.value, "30");
    assert.deepStrictEqual(selectedWidths, [5, 7.4, 30]);
  });
});
