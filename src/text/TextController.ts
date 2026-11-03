import { PageData, TextObject } from "../types";
import { tokenizeText } from "./TextTokenizer";

export interface TextFormattingOptions {
  fontSize?: number;
  fontWeight?: string;
  italic?: boolean;
  underline?: boolean;
  textAlign?: "left" | "center" | "right";
  color?: string;
  backgroundColor?: string;
  isSticky?: boolean;
}

export interface TextControllerCallbacks {
  onTextCommitted: (page: PageData, text: TextObject, isNew: boolean) => void;
  onTextDeleted: (page: PageData, textId: string) => void;
  onWikilinkClick: (linkTarget: string, event: MouseEvent) => void;
  onWikilinkHover?: (linkTarget: string, targetEl: HTMLElement, event: MouseEvent) => void;
  onActiveFormattingChanged?: (formatting: {
    fontSize: number;
    fontWeight: string;
    italic: boolean;
    underline: boolean;
    textAlign: "left" | "center" | "right";
    color: string;
  }) => void;
  onEditingStarted?: () => void;
  onEditingEnded?: () => void;
  getActiveTool?: () => string;
}

export class TextController {
  private activeEditorContainer: HTMLElement | null = null;
  private activeTextarea: HTMLTextAreaElement | null = null;
  private activeText: TextObject | null = null;
  private activePage: PageData | null = null;
  private hiddenTextElement: HTMLElement | null = null;
  private isNewText: boolean = false;
  private textareaResizeObserver: ResizeObserver | null = null;
  private callbacks: TextControllerCallbacks;
  private mathRenderer?: (math: string, display: boolean) => HTMLElement;
  private mathFlusher?: () => Promise<void>;

  constructor(
    callbacks: TextControllerCallbacks,
    mathRenderer?: (math: string, display: boolean) => HTMLElement,
    mathFlusher?: () => Promise<void>
  ) {
    this.callbacks = callbacks;
    this.mathRenderer = mathRenderer;
    this.mathFlusher = mathFlusher;
  }

  isEditing(): boolean {
    return this.activeEditorContainer !== null;
  }

  getActiveText(): TextObject | null {
    return this.activeText;
  }

  getActiveEditorContainer(): HTMLElement | null {
    return this.activeEditorContainer;
  }

  updateActiveFormatting(options: TextFormattingOptions): void {
    if (!this.activeText || !this.activeTextarea) {
      return;
    }
    const styles: Partial<CSSStyleDeclaration> = {};
    if (options.fontSize !== undefined) {
      this.activeText.fontSize = options.fontSize;
      styles.fontSize = `${options.fontSize}px`;
    }
    if (options.fontWeight !== undefined) {
      this.activeText.fontWeight = options.fontWeight;
      styles.fontWeight = options.fontWeight;
    }
    if (options.italic !== undefined) {
      this.activeText.italic = options.italic;
      styles.fontStyle = options.italic ? "italic" : "normal";
    }
    if (options.underline !== undefined) {
      this.activeText.underline = options.underline;
      styles.textDecoration = options.underline ? "underline" : "none";
    }
    if (options.textAlign !== undefined) {
      this.activeText.textAlign = options.textAlign;
      styles.textAlign = options.textAlign;
    }
    if (options.color !== undefined) {
      this.activeText.color = options.color;
      styles.color = options.color;
    }
    if (options.backgroundColor !== undefined) {
      this.activeText.backgroundColor = options.backgroundColor;
      styles.backgroundColor = options.backgroundColor;
    }
    this.activeTextarea.setCssStyles(styles);
  }

  private notifyFormattingChanged(): void {
    if (!this.activeText) {
      return;
    }
    this.callbacks.onActiveFormattingChanged?.({
      fontSize: this.activeText.fontSize,
      fontWeight: this.activeText.fontWeight,
      italic: !!this.activeText.italic,
      underline: !!this.activeText.underline,
      textAlign: this.activeText.textAlign,
      color: this.activeText.color
    });
  }

  commitActiveEdit(): void {
    if (!this.activeTextarea || !this.activeText || !this.activePage) {
      this.closeActiveEditor();
      return;
    }

    const newContent = this.activeTextarea.value.trim();
    const page = this.activePage;
    const textObj = this.activeText;
    const isNew = this.isNewText;

    const margin = 10;
    const maxAllowedW = Math.max(60, page.dimensions.width - margin - textObj.x);
    const maxAllowedH = Math.max(30, page.dimensions.height - margin - textObj.y);
    const currentW = Math.min(maxAllowedW, this.activeTextarea.offsetWidth);
    const currentH = Math.min(maxAllowedH, Math.max(this.activeTextarea.offsetHeight, this.activeTextarea.scrollHeight));
    if (currentW > 0) {
      textObj.width = currentW;
    }
    if (currentH > 0) {
      textObj.height = currentH;
    }

    this.closeActiveEditor();

    if (newContent.length === 0 && !textObj.isSticky) {
      if (!isNew) {
        page.texts = page.texts.filter(t => t.id !== textObj.id);
        this.callbacks.onTextDeleted(page, textObj.id);
      }
      return;
    }

    textObj.content = newContent;
    textObj.bounds = {
      minX: textObj.x,
      minY: textObj.y,
      maxX: textObj.x + textObj.width,
      maxY: textObj.y + textObj.height
    };

    if (isNew) {
      page.texts.push(textObj);
    }

    this.callbacks.onTextCommitted(page, textObj, isNew);
  }

  cancelActiveEdit(): void {
    this.closeActiveEditor();
  }

  private closeActiveEditor(): void {
    if (this.textareaResizeObserver) {
      this.textareaResizeObserver.disconnect();
      this.textareaResizeObserver = null;
    }
    if (this.activeEditorContainer && this.activeEditorContainer.parentElement) {
      this.activeEditorContainer.parentElement.removeChild(this.activeEditorContainer);
    }
    if (this.hiddenTextElement) {
      this.hiddenTextElement.removeClass("is-hidden");
      this.hiddenTextElement = null;
    }
    this.activeEditorContainer = null;
    this.activeTextarea = null;
    this.activeText = null;
    this.activePage = null;
    this.isNewText = false;
    this.callbacks.onEditingEnded?.();
  }

  startEditing(
    page: PageData,
    pageEl: HTMLElement,
    textObj?: TextObject,
    initialX = 50,
    initialY = 50,
    initialWidth?: number,
    initialHeight?: number,
    defaultOptions?: TextFormattingOptions
  ): void {
    this.commitActiveEdit();

    this.activePage = page;
    if (textObj) {
      this.activeText = { ...textObj };
      this.isNewText = false;
      const existingBox = pageEl.querySelector<HTMLElement>(`.notepages-text-box[data-text-id="${textObj.id}"]`);
      if (existingBox) {
        existingBox.addClass("is-hidden");
        this.hiddenTextElement = existingBox;
      }
    } else {
      this.isNewText = true;
      const margin = 10;
      const isSticky = defaultOptions?.isSticky ?? false;
      const fallbackW = isSticky ? 140 : 220;
      const fallbackH = isSticky ? 140 : 60;
      const maxPossibleW = Math.max(60, page.dimensions.width - margin * 2);
      const maxPossibleH = Math.max(30, page.dimensions.height - margin * 2);
      const desiredW = Math.min(maxPossibleW, Math.max(60, initialWidth || fallbackW));
      const desiredH = Math.min(maxPossibleH, Math.max(30, initialHeight || fallbackH));
      const clampedX = Math.max(margin, Math.min(initialX, page.dimensions.width - margin - desiredW));
      const clampedY = Math.max(margin, Math.min(initialY, page.dimensions.height - margin - desiredH));
      const width = Math.min(desiredW, page.dimensions.width - margin - clampedX);
      const height = Math.min(desiredH, page.dimensions.height - margin - clampedY);
      this.activeText = {
        id: `text_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        elementType: "text",
        isSticky,
        backgroundColor: defaultOptions?.backgroundColor ?? (isSticky ? "#fef08a" : undefined),
        x: clampedX,
        y: clampedY,
        width,
        height,
        content: "",
        fontSize: defaultOptions?.fontSize ?? 16,
        fontFamily: "Inter, sans-serif",
        fontWeight: defaultOptions?.fontWeight ?? "normal",
        color: defaultOptions?.color ?? "#1e293b",
        textAlign: defaultOptions?.textAlign ?? "left",
        italic: defaultOptions?.italic ?? false,
        underline: defaultOptions?.underline ?? false,
        bounds: {
          minX: clampedX,
          minY: clampedY,
          maxX: clampedX + width,
          maxY: clampedY + height
        }
      };
    }

    const currentText = this.activeText;
    const margin = 10;
    const maxAllowedW = Math.max(60, page.dimensions.width - margin - currentText.x);
    const maxAllowedH = Math.max(30, page.dimensions.height - margin - currentText.y);

    const textarea = pageEl.createEl("textarea", { cls: "notepages-inline-text-editor" });
    if (currentText.isSticky) {
      textarea.addClass("notepages-sticky-note");
    }
    textarea.value = currentText.content;
    textarea.placeholder = currentText.isSticky ? "Sticky note..." : "Type text, $LaTeX$, [[wikilinks]]...";

    textarea.setCssStyles({
      left: `${currentText.x}px`,
      top: `${currentText.y}px`,
      width: `${currentText.width}px`,
      height: `${currentText.height}px`,
      maxWidth: `${maxAllowedW}px`,
      maxHeight: `${maxAllowedH}px`,
      fontSize: `${currentText.fontSize}px`,
      fontFamily: currentText.fontFamily,
      fontWeight: currentText.fontWeight,
      fontStyle: currentText.italic ? "italic" : "normal",
      textDecoration: currentText.underline ? "underline" : "none",
      textAlign: currentText.textAlign,
      color: currentText.color,
      caretColor: "var(--interactive-accent)",
      ...(currentText.isSticky && currentText.backgroundColor ? { backgroundColor: currentText.backgroundColor } : {})
    });

    textarea.addEventListener("pointerdown", (e: PointerEvent) => {
      e.stopPropagation();
    });
    textarea.addEventListener("pointerup", (e: PointerEvent) => {
      e.stopPropagation();
    });
    textarea.addEventListener("mousedown", (e: MouseEvent) => {
      e.stopPropagation();
    });
    textarea.addEventListener("mouseup", (e: MouseEvent) => {
      e.stopPropagation();
    });
    textarea.addEventListener("click", (e: MouseEvent) => {
      e.stopPropagation();
    });

    textarea.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (this.isNewText && !this.activeTextarea?.value.trim()) {
          this.cancelActiveEdit();
        } else {
          this.commitActiveEdit();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        this.commitActiveEdit();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        const nextWeight = currentText.fontWeight === "bold" ? "normal" : "bold";
        this.updateActiveFormatting({ fontWeight: nextWeight });
        this.notifyFormattingChanged();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "i" || e.key === "I")) {
        e.preventDefault();
        const nextItalic = !currentText.italic;
        this.updateActiveFormatting({ italic: nextItalic });
        this.notifyFormattingChanged();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "u" || e.key === "U")) {
        e.preventDefault();
        const nextUnderline = !currentText.underline;
        this.updateActiveFormatting({ underline: nextUnderline });
        this.notifyFormattingChanged();
        return;
      }
    });

    textarea.addEventListener("input", () => {
      if (textarea.scrollHeight > textarea.clientHeight) {
        const maxH = Math.max(30, page.dimensions.height - margin - currentText.y);
        const nextH = Math.min(maxH, Math.max(currentText.height, textarea.scrollHeight));
        textarea.setCssStyles({ height: `${nextH}px` });
        currentText.height = nextH;
        currentText.bounds = {
          minX: currentText.x,
          minY: currentText.y,
          maxX: currentText.x + currentText.width,
          maxY: currentText.y + currentText.height
        };
      }
    });

    if (typeof ResizeObserver !== "undefined") {
      this.textareaResizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const target = entry.target as HTMLTextAreaElement;
          if (target === textarea) {
            const maxW = Math.max(60, page.dimensions.width - margin - currentText.x);
            const maxH = Math.max(30, page.dimensions.height - margin - currentText.y);
            const w = Math.min(maxW, target.offsetWidth);
            const h = Math.min(maxH, target.offsetHeight);
            if (target.offsetWidth > maxW) {
              target.setCssStyles({ width: `${maxW}px` });
            }
            if (target.offsetHeight > maxH) {
              target.setCssStyles({ height: `${maxH}px` });
            }
            if (w > 0 && h > 0) {
              currentText.width = w;
              currentText.height = h;
              currentText.bounds = {
                minX: currentText.x,
                minY: currentText.y,
                maxX: currentText.x + w,
                maxY: currentText.y + h
              };
            }
          }
        }
      });
      this.textareaResizeObserver.observe(textarea);
    }

    this.activeEditorContainer = textarea;
    this.activeTextarea = textarea;

    this.callbacks.onEditingStarted?.();
    this.notifyFormattingChanged();

    textarea.focus();
    textarea.selectionStart = textarea.value.length;
    textarea.selectionEnd = textarea.value.length;

    window.setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.value.length;
      textarea.selectionEnd = textarea.value.length;
    }, 10);
  }

  renderPageTexts(page: PageData, pageEl: HTMLElement): void {
    let layer = pageEl.querySelector<HTMLElement>(".notepages-text-layer");
    if (!layer) {
      layer = pageEl.createDiv({ cls: "notepages-text-layer" });
    } else {
      layer.empty();
    }

    if (!Array.isArray(page.texts)) {
      return;
    }

    const activeTool = this.callbacks.getActiveTool ? this.callbacks.getActiveTool() : "";
    const isDrawingTool =
      activeTool === "pen" ||
      activeTool === "pressure" ||
      activeTool === "fountain" ||
      activeTool === "highlighter" ||
      activeTool === "eraser" ||
      activeTool === "shape" ||
      activeTool === "connector" ||
      activeTool === "lasso";

    const margin = 10;
    page.texts.forEach(t => {
      const box = layer.createDiv({ cls: "notepages-text-box" });
      box.dataset.textId = t.id;
      if (t.isSticky) {
        box.addClass("notepages-sticky-note");
      }
      if (isDrawingTool) {
        box.addClass("is-drawing");
      }

      box.setCssStyles({
        left: `${t.x}px`,
        top: `${t.y}px`,
        width: `${t.width}px`,
        minHeight: `${t.height}px`,
        maxWidth: `${Math.max(60, page.dimensions.width - margin - t.x)}px`,
        maxHeight: `${Math.max(30, page.dimensions.height - margin - t.y)}px`,
        fontSize: `${t.fontSize}px`,
        fontFamily: t.fontFamily,
        fontWeight: t.fontWeight,
        fontStyle: t.italic ? "italic" : "normal",
        textDecoration: t.underline ? "underline" : "none",
        color: t.color,
        textAlign: t.textAlign,
        ...(t.isSticky && t.backgroundColor ? { backgroundColor: t.backgroundColor } : {})
      });

      this.renderFormattedContent(t.content, box);

      box.addEventListener("dblclick", (e: MouseEvent) => {
        const curTool = this.callbacks.getActiveTool ? this.callbacks.getActiveTool() : "";
        if (curTool !== "select" && curTool !== "text" && curTool !== "sticky") {
          return;
        }
        if (curTool === "sticky" && !t.isSticky) {
          return;
        }
        if (curTool === "text" && t.isSticky) {
          return;
        }
        e.stopPropagation();
        this.startEditing(page, pageEl, t);
      });

      box.addEventListener("click", (e: MouseEvent) => {
        const curTool = this.callbacks.getActiveTool ? this.callbacks.getActiveTool() : "";
        if ((curTool === "sticky" && t.isSticky) || (curTool === "text" && !t.isSticky)) {
          e.stopPropagation();
          this.startEditing(page, pageEl, t);
        }
      });
    });

    if (this.mathFlusher) {
      void this.mathFlusher().catch((err: unknown) => { void err; });
    }
  }

  private renderFormattedContent(content: string, container: HTMLElement): void {
    const tokens = tokenizeText(content);
    tokens.forEach(tok => {
      if (tok.type === "text") {
        const lines = tok.value.split("\n");
        lines.forEach((line, idx) => {
          if (idx > 0) {
            container.createEl("br");
          }
          if (line.length > 0) {
            container.appendChild(document.createTextNode(line));
          }
        });
      } else if (tok.type === "wikilink") {
        const linkEl = container.createEl("a", { cls: "notepages-wikilink", text: tok.value });
        linkEl.dataset.target = tok.target || tok.value;
        linkEl.addEventListener("click", (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          this.callbacks.onWikilinkClick(tok.target || tok.value, e);
        });
        linkEl.addEventListener("mouseover", (e: MouseEvent) => {
          this.callbacks.onWikilinkHover?.(tok.target || tok.value, linkEl, e);
        });
      } else if (tok.type === "math-inline" || tok.type === "math-display") {
        if (this.mathRenderer) {
          try {
            const mathEl = this.mathRenderer(tok.value, tok.type === "math-display");
            container.appendChild(mathEl);
          } catch (err) {
            void err;
            container.createSpan({ cls: "notepages-math-fallback", text: tok.raw });
          }
        } else {
          container.createSpan({ cls: "notepages-math-fallback", text: tok.raw });
        }
      }
    });
  }
}
