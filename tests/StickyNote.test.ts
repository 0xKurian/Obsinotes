import { test, describe } from "node:test";
import assert from "node:assert";
import { DocumentSerializer } from "../src/storage/DocumentSerializer";
import { HistoryManager } from "../src/history/HistoryManager";
import { AddTextCommand, ModifyTextCommand } from "../src/history/HistoryManager";
import { NotebookDocument, PageData, TextObject } from "../src/types";
import { SelectionController } from "../src/selection/SelectionController";
import { TextController } from "../src/text/TextController";

describe("Sticky Notes Feature", () => {
  function createSamplePage(): PageData {
    return {
      id: "page_1",
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

  test("serializes and deserializes sticky note object with isSticky flag", () => {
    const page = createSamplePage();
    const sticky: TextObject = {
      id: "sticky_1",
      elementType: "text",
      isSticky: true,
      x: 100,
      y: 150,
      width: 140,
      height: 140,
      content: "Brainstorming idea #1",
      fontSize: 16,
      fontFamily: "Inter, sans-serif",
      fontWeight: "normal",
      color: "#1e293b",
      backgroundColor: "#fef08a",
      textAlign: "left",
      bounds: { minX: 100, minY: 150, maxX: 240, maxY: 290 }
    };
    page.texts.push(sticky);

    const doc: NotebookDocument = {
      metadata: {
        title: "Sticky Note Board",
        createdAt: 1000,
        updatedAt: 2000,
        schemaVersion: 1,
        defaultPageSize: "A4",
        defaultOrientation: "portrait"
      },
      pages: [page]
    };

    const serialized = DocumentSerializer.serializeDocument(doc);
    const deserialized = DocumentSerializer.deserializeDocument(serialized);

    assert.strictEqual(deserialized.success, true);
    assert.notStrictEqual(deserialized.document, undefined);
    assert.strictEqual(deserialized.document!.pages[0].texts.length, 1);
    const restored = deserialized.document!.pages[0].texts[0];
    assert.strictEqual(restored.isSticky, true);
    assert.strictEqual(restored.backgroundColor, "#fef08a");
    assert.strictEqual(restored.content, "Brainstorming idea #1");
  });

  test("adds, modifies and undoes sticky notes via HistoryManager", () => {
    const history = new HistoryManager(50);
    const page = createSamplePage();

    const sticky: TextObject = {
      id: "sticky_2",
      elementType: "text",
      isSticky: true,
      x: 50,
      y: 80,
      width: 140,
      height: 140,
      content: "Initial Note",
      fontSize: 16,
      fontFamily: "Inter, sans-serif",
      fontWeight: "normal",
      color: "#1e293b",
      backgroundColor: "#bbf7d0",
      textAlign: "left",
      bounds: { minX: 50, minY: 80, maxX: 190, maxY: 220 }
    };

    history.execute(new AddTextCommand(page, sticky, () => {}));
    assert.strictEqual(page.texts.length, 1);
    assert.strictEqual(page.texts[0].isSticky, true);

    const modifiedSticky: TextObject = {
      ...sticky,
      content: "Updated Note",
      backgroundColor: "#fbcfe8"
    };
    history.execute(new ModifyTextCommand(page, sticky, modifiedSticky, () => {}));
    assert.strictEqual(page.texts[0].content, "Updated Note");
    assert.strictEqual(page.texts[0].backgroundColor, "#fbcfe8");

    history.undo();
    assert.strictEqual(page.texts[0].content, "Initial Note");
    assert.strictEqual(page.texts[0].backgroundColor, "#bbf7d0");

    history.undo();
    assert.strictEqual(page.texts.length, 0);

    history.redo();
    assert.strictEqual(page.texts.length, 1);
    assert.strictEqual(page.texts[0].content, "Initial Note");
  });

  test("updates sticky note background color via SelectionController changeColor", () => {
    let committedNextTexts: TextObject[] = [];
    const controller = new SelectionController({
      onSelectionChanged: () => {},
      onTransformCommitted: (_p, _ps, _ns, _psh, _nsh, _pi, _ni, _pt, nextTexts) => {
        if (nextTexts) {
          committedNextTexts = nextTexts;
        }
      },
      onElementsDeleted: () => {},
      onRequestRedraw: () => {}
    });

    const page = createSamplePage();
    const sticky: TextObject = {
      id: "sticky_sel_1",
      elementType: "text",
      isSticky: true,
      x: 100,
      y: 100,
      width: 140,
      height: 140,
      content: "Select me",
      fontSize: 16,
      fontFamily: "Inter, sans-serif",
      fontWeight: "normal",
      color: "#1e293b",
      backgroundColor: "#fef08a",
      textAlign: "left",
      bounds: { minX: 100, minY: 100, maxX: 240, maxY: 240 }
    };
    page.texts.push(sticky);

    const mockCtx = {
      clearRect: () => {},
      save: () => {},
      restore: () => {},
      strokeRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      setLineDash: () => {},
      closePath: () => {},
      rect: () => {},
      ellipse: () => {},
      quadraticCurveTo: () => {},
      setTransform: () => {}
    };

    const canvas = {
      width: 595,
      height: 842,
      getContext: () => mockCtx,
      setPointerCapture: () => {},
      releasePointerCapture: () => {}
    } as unknown as HTMLCanvasElement;

    controller.handlePointerDown(
      { button: 0, pointerType: "mouse", pointerId: 1 } as PointerEvent,
      page,
      canvas,
      { x: 150, y: 150 }
    );
    controller.handlePointerUp({ pointerId: 1 } as PointerEvent, page, canvas);

    assert.strictEqual(controller.hasSelection(), true);
    assert.strictEqual(controller.getSelectedTexts().length, 1);

    controller.changeColor("#bfdbfe", page, canvas);
    assert.strictEqual(controller.getSelectedTexts()[0].backgroundColor, "#bfdbfe");
    assert.strictEqual(committedNextTexts.length, 1);
    assert.strictEqual(committedNextTexts[0].backgroundColor, "#bfdbfe");
  });

  test("preserves empty sticky note upon commit while discarding empty regular text", () => {
    interface MockNode {
      style: Record<string, string>;
      classList: {
        add: (cls: string) => void;
        contains: (cls: string) => boolean;
      };
      dataset: Record<string, string>;
      value: string;
      parentElement: { removeChild: (child: unknown) => void } | null;
      appendChild: (child: unknown) => unknown;
      removeChild: (child: unknown) => unknown;
      createEl: (tag: string, opts?: { cls?: string }) => MockNode;
      createDiv: (opts?: { cls?: string }) => MockNode;
      createSpan: (opts?: { cls?: string }) => MockNode;
      setCssStyles: (styles: Record<string, string>) => void;
      addClass: (cls: string) => void;
      removeClass: (cls: string) => void;
      empty: () => void;
      addEventListener: (type: string, fn: unknown) => void;
      focus: () => void;
      offsetWidth: number;
      offsetHeight: number;
      scrollHeight: number;
      clientHeight: number;
      selectionStart: number;
      selectionEnd: number;
    }

    const createMockNode = (): MockNode => {
      const classes = new Set<string>();
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
        createEl: (_tag: string, opts?: { cls?: string }) => {
          const child = createMockNode();
          if (opts?.cls) child.classList.add(opts.cls);
          return child;
        },
        createDiv: (opts?: { cls?: string }) => {
          const child = createMockNode();
          if (opts?.cls) child.classList.add(opts.cls);
          return child;
        },
        createSpan: (opts?: { cls?: string }) => {
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
        addEventListener: () => {},
        focus: () => {},
        offsetWidth: 140,
        offsetHeight: 140,
        scrollHeight: 140,
        clientHeight: 140,
        selectionStart: 0,
        selectionEnd: 0
      };
      node.parentElement = { removeChild: () => {} };
      return node;
    };

    const previousDoc = (globalThis as unknown as { document?: unknown }).document;
    const previousWin = (globalThis as unknown as { window?: unknown }).window;
    (globalThis as unknown as { document: unknown }).document = {
      createElement: () => createMockNode(),
      querySelector: () => null
    };
    (globalThis as unknown as { window: unknown }).window = globalThis;

    try {
      let committedText: TextObject | null = null;
      const textController = new TextController({
        onTextCommitted: (_p, text) => {
          committedText = text;
        },
        onTextDeleted: () => {},
        onWikilinkClick: () => {},
        getActiveTool: () => "sticky"
      });

      const page = createSamplePage();
      const mockFrame = createMockNode() as unknown as HTMLElement;

      textController.startEditing(page, mockFrame, undefined, 50, 50, 140, 140, {
        isSticky: true,
        backgroundColor: "#fef08a"
      });

      assert.strictEqual(textController.isEditing(), true);
      const activeText = textController.getActiveText();
      assert.notStrictEqual(activeText, null);
      assert.strictEqual(activeText!.isSticky, true);
      assert.strictEqual(activeText!.backgroundColor, "#fef08a");

      textController.updateActiveFormatting({ backgroundColor: "#bbf7d0" });
      assert.strictEqual(textController.getActiveText()!.backgroundColor, "#bbf7d0");

      textController.commitActiveEdit();
      assert.strictEqual(textController.isEditing(), false);
      assert.strictEqual(page.texts.length, 1);
      assert.strictEqual(page.texts[0].isSticky, true);
      assert.strictEqual(page.texts[0].content, "");
      assert.strictEqual(page.texts[0].backgroundColor, "#bbf7d0");
      assert.strictEqual(committedText !== null, true);

      committedText = null;
      textController.startEditing(page, mockFrame, undefined, 60, 60, 200, 40, {
        isSticky: false,
        fontSize: 18,
        color: "#3b82f6"
      });
      assert.strictEqual(textController.isEditing(), true);
      const activeTextObj = textController.getActiveText();
      assert.notStrictEqual(activeTextObj, null);
      assert.strictEqual(activeTextObj!.isSticky, false);
      assert.strictEqual(activeTextObj!.fontSize, 18);
      assert.strictEqual(activeTextObj!.color, "#3b82f6");

      textController.updateActiveFormatting({ fontWeight: "bold", italic: true });
      assert.strictEqual(textController.getActiveText()!.fontWeight, "bold");
      assert.strictEqual(textController.getActiveText()!.italic, true);

      const activeTextarea = textController.getActiveEditorContainer() as unknown as MockNode;
      assert.notStrictEqual(activeTextarea, null);
      activeTextarea.value = "Hello Obsidian NotePages!";

      textController.commitActiveEdit();
      assert.strictEqual(textController.isEditing(), false);
      assert.strictEqual(page.texts.length, 2);
      assert.strictEqual(page.texts[1].content, "Hello Obsidian NotePages!");
      assert.strictEqual(page.texts[1].isSticky, false);
      assert.strictEqual(page.texts[1].fontWeight, "bold");
      assert.strictEqual(page.texts[1].italic, true);
      assert.notStrictEqual(committedText, null);
      assert.strictEqual(committedText!.content, "Hello Obsidian NotePages!");
    } finally {
      (globalThis as unknown as { document?: unknown }).document = previousDoc;
      (globalThis as unknown as { window?: unknown }).window = previousWin;
    }
  });
});
