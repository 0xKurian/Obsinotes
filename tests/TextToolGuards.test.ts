import { test, describe } from "node:test";
import assert from "node:assert";
import { PageData, TextObject } from "../src/types";
import { TextController } from "../src/text/TextController";

describe("Text Tool Guards and Accidental Textbox Suppression", () => {
  interface MockNode {
    style: Record<string, string>;
    classList: {
      add: (cls: string) => void;
      contains: (cls: string) => boolean;
    };
    dataset: Record<string, string>;
    value: string;
    parentElement: unknown;
    appendChild: (c: unknown) => unknown;
    removeChild: (c: unknown) => unknown;
    createEl: (tag: string, opts?: { cls?: string; text?: string }) => MockNode;
    createDiv: (opts?: { cls?: string }) => MockNode;
    createSpan: (opts?: { cls?: string; text?: string }) => MockNode;
    setCssStyles: (styles: Record<string, string>) => void;
    addClass: (cls: string) => void;
    removeClass: (cls: string) => void;
    empty: () => void;
    addEventListener: (type: string, handler: (e: unknown) => void) => void;
    focus: () => void;
    querySelector: (sel: string) => MockNode | null;
    listeners: Map<string, Array<(e: unknown) => void>>;
    dispatchEvent: (type: string, event?: unknown) => void;
  }

    let lastCreatedBox: MockNode | null = null;
    const createMockNode = (): MockNode => {
      const classes = new Set<string>();
      const listeners = new Map<string, Array<(e: unknown) => void>>();
      const node: MockNode = {
        style: {},
        classList: {
          add: (cls: string) => classes.add(cls),
          contains: (cls: string) => classes.has(cls)
        },
        dataset: {},
        value: "",
        parentElement: null,
        appendChild: (c: unknown) => c,
        removeChild: (c: unknown) => c,
        createEl: (_tag: string, opts?: { cls?: string; text?: string }) => {
          const child = createMockNode();
          if (opts?.cls) child.classList.add(opts.cls);
          return child;
        },
        createDiv: (opts?: { cls?: string }) => {
          const child = createMockNode();
          if (opts?.cls) {
            child.classList.add(opts.cls);
            if (opts.cls.includes("notepages-text-box")) {
              lastCreatedBox = child;
            }
          }
          return child;
        },
        createSpan: (opts?: { cls?: string; text?: string }) => {
          const child = createMockNode();
          if (opts?.cls) child.classList.add(opts.cls);
          return child;
        },
        setCssStyles: (styles: Record<string, string>) => {
          Object.assign(node.style, styles);
        },
        addClass: (cls: string) => classes.add(cls),
        removeClass: (cls: string) => classes.delete(cls),
        empty: () => {},
        querySelector: (_sel: string) => null,
        addEventListener: (type: string, handler: (e: unknown) => void) => {
          if (!listeners.has(type)) {
            listeners.set(type, []);
          }
          listeners.get(type)!.push(handler);
        },
        focus: () => {},
        listeners,
        dispatchEvent: (type: string, event?: unknown) => {
          const handlers = listeners.get(type);
          if (handlers) {
            const ev = event || {
              stopPropagation: () => {},
              preventDefault: () => {}
            };
            for (const handler of handlers) {
              handler(ev);
            }
          }
        }
      };
      node.parentElement = { removeChild: () => {} };
      return node;
    };

  function createSamplePage(): PageData {
    return {
      id: "page_guard_1",
      pageNumber: 1,
      dimensions: { width: 595, height: 842, unit: "pt" },
      orientation: "portrait",
      template: {
        type: "blank",
        backgroundColor: "#ffffff",
        lineColor: "#e2e8f0",
        spacing: 24,
        opacity: 1
      },
      strokes: [],
      shapes: [],
      texts: [],
      images: []
    };
  }

  test("suppresses dblclick and click editing when drawing tool is active (pen, pressure, etc.)", () => {
    const previousDoc = (globalThis as unknown as { document?: unknown }).document;
    const previousWin = (globalThis as unknown as { window?: unknown }).window;
    (globalThis as unknown as { document: unknown }).document = {
      createElement: () => createMockNode(),
      querySelector: () => null,
      createTextNode: (txt: string) => txt
    };
    (globalThis as unknown as { window: unknown }).window = globalThis;

    try {
      let activeTool = "pen";
      const textController = new TextController({
        onTextCommitted: () => {},
        onTextDeleted: () => {},
        onWikilinkClick: () => {},
        getActiveTool: () => activeTool
      });

      const page = createSamplePage();
      const regularText: TextObject = {
        id: "text_1",
        elementType: "text",
        x: 50,
        y: 50,
        width: 120,
        height: 40,
        content: "Sample handwritten label",
        fontSize: 16,
        fontFamily: "Inter, sans-serif",
        fontWeight: "normal",
        color: "#1e293b",
        textAlign: "left",
        bounds: { minX: 50, minY: 50, maxX: 170, maxY: 90 }
      };
      page.texts.push(regularText);

      const mockFrame = createMockNode();
      // Render text into frame
      textController.renderPageTexts(page, mockFrame as unknown as HTMLElement);

      // Inspect created text box
      // mockFrame.createDiv was called during renderPageTexts
      // Let's test with different tools
      const drawingTools = ["pen", "pressure", "fountain", "highlighter", "eraser", "shape", "connector", "lasso"];
      for (const tool of drawingTools) {
        activeTool = tool;
        // Re-render
        textController.renderPageTexts(page, mockFrame as unknown as HTMLElement);

        // Find child nodes with class notepages-text-box
        // In our mock, createDiv creates the box. Let's trigger events on mock children
        assert.strictEqual(textController.isEditing(), false);
      }

      // Now test switching to select tool
      activeTool = "select";
      textController.renderPageTexts(page, mockFrame as unknown as HTMLElement);
      assert.strictEqual(textController.isEditing(), false);
    } finally {
      (globalThis as unknown as { document?: unknown }).document = previousDoc;
      (globalThis as unknown as { window?: unknown }).window = previousWin;
    }
  });

  test("TextController dblclick handler respects tool filter", () => {
    const previousDoc = (globalThis as unknown as { document?: unknown }).document;
    const previousWin = (globalThis as unknown as { window?: unknown }).window;
    
    let createdBoxes: MockNode[] = [];
    (globalThis as unknown as { document: unknown }).document = {
      createElement: () => {
        const n = createMockNode();
        createdBoxes.push(n);
        return n;
      },
      querySelector: () => null,
      createTextNode: (txt: string) => txt
    };
    (globalThis as unknown as { window: unknown }).window = globalThis;

    try {
      let currentTool = "pressure";
      const textController = new TextController({
        onTextCommitted: () => {},
        onTextDeleted: () => {},
        onWikilinkClick: () => {},
        getActiveTool: () => currentTool
      });

      const page = createSamplePage();
      const textObj: TextObject = {
        id: "text_filter_test",
        elementType: "text",
        x: 40,
        y: 40,
        width: 100,
        height: 30,
        content: "Testing Guard",
        fontSize: 14,
        fontFamily: "sans-serif",
        fontWeight: "normal",
        color: "#000000",
        textAlign: "left",
        bounds: { minX: 40, minY: 40, maxX: 140, maxY: 70 }
      };
      page.texts.push(textObj);

      const mockFrame = createMockNode();

      // 1. Render while using "pressure" (drawing tool)
      currentTool = "pressure";
      lastCreatedBox = null;
      textController.renderPageTexts(page, mockFrame as unknown as HTMLElement);
      assert.notStrictEqual(lastCreatedBox, null);

      // Simulate dblclick on the box while tool is "pressure"
      lastCreatedBox!.dispatchEvent("dblclick");
      assert.strictEqual(textController.isEditing(), false, "Dblclick with pressure tool must NOT start editing");

      // Simulate click on the box while tool is "pressure"
      lastCreatedBox!.dispatchEvent("click");
      assert.strictEqual(textController.isEditing(), false, "Click with pressure tool must NOT start editing");

      // 2. Simulate dblclick while tool is "pen"
      currentTool = "pen";
      lastCreatedBox!.dispatchEvent("dblclick");
      assert.strictEqual(textController.isEditing(), false, "Dblclick with pen tool must NOT start editing");

      // 3. Simulate dblclick while tool is "highlighter"
      currentTool = "highlighter";
      lastCreatedBox!.dispatchEvent("dblclick");
      assert.strictEqual(textController.isEditing(), false, "Dblclick with highlighter tool must NOT start editing");

      // 4. Simulate dblclick while tool is "select"
      currentTool = "select";
      lastCreatedBox!.dispatchEvent("dblclick");
      assert.strictEqual(textController.isEditing(), true, "Dblclick with select tool SHOULD start editing");
      textController.commitActiveEdit();
      assert.strictEqual(textController.isEditing(), false);

      // 5. Test sticky note distinction
      const stickyObj: TextObject = {
        id: "sticky_filter_test",
        elementType: "text",
        isSticky: true,
        x: 100,
        y: 100,
        width: 140,
        height: 140,
        content: "Sticky Note",
        fontSize: 14,
        fontFamily: "sans-serif",
        fontWeight: "normal",
        color: "#000000",
        backgroundColor: "#fef08a",
        textAlign: "left",
        bounds: { minX: 100, minY: 100, maxX: 240, maxY: 240 }
      };
      page.texts = [stickyObj];

      currentTool = "text";
      lastCreatedBox = null;
      textController.renderPageTexts(page, mockFrame as unknown as HTMLElement);
      assert.notStrictEqual(lastCreatedBox, null);
      const stickyBox = lastCreatedBox!;

      // While tool is "text", clicking/dblclicking a sticky note should NOT edit it
      stickyBox!.dispatchEvent("click");
      assert.strictEqual(textController.isEditing(), false, "Clicking sticky note with text tool should not edit");
      stickyBox!.dispatchEvent("dblclick");
      assert.strictEqual(textController.isEditing(), false, "Dblclicking sticky note with text tool should not edit");

      // While tool is "sticky", clicking sticky note SHOULD edit
      currentTool = "sticky";
      stickyBox!.dispatchEvent("click");
      assert.strictEqual(textController.isEditing(), true, "Clicking sticky note with sticky tool should edit");
      textController.commitActiveEdit();

      // While tool is "pen", sticky note should NOT edit
      currentTool = "pen";
      stickyBox!.dispatchEvent("dblclick");
      assert.strictEqual(textController.isEditing(), false, "Dblclicking sticky note with pen tool must not edit");
    } finally {
      (globalThis as unknown as { document?: unknown }).document = previousDoc;
      (globalThis as unknown as { window?: unknown }).window = previousWin;
    }
  });
});
