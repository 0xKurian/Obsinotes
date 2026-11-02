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

  getActiveEditorContainer(): HTMLElement | null {
    return this.activeEditorContainer;
  }

  updateActiveFormatting(options: TextFormattingOptions): void {
    if (!this.activeText || !this.activeTextarea) {
      return;
    }
    if (options.fontSize !== undefined) {
      this.activeText.fontSize = options.fontSize;
      this.activeTextarea.style.fontSize = `${options.fontSize}px`;
    }
    if (options.fontWeight !== undefined) {
      this.activeText.fontWeight = options.fontWeight;
      this.activeTextarea.style.fontWeight = options.fontWeight;
    }
    if (options.italic !== undefined) {
      this.activeText.italic = options.italic;
      this.activeTextarea.style.fontStyle = options.italic ? "italic" : "normal";
    }
    if (options.underline !== undefined) {
      this.activeText.underline = options.underline;
      this.activeTextarea.style.textDecoration = options.underline ? "underline" : "none";
    }
    if (options.textAlign !== undefined) {
      this.activeText.textAlign = options.textAlign;
      this.activeTextarea.style.textAlign = options.textAlign;
    }
    if (options.color !== undefined) {
      this.activeText.color = options.color;
      this.activeTextarea.style.color = options.color;
    }
    if (options.backgroundColor !== undefined) {
      this.activeText.backgroundColor = options.backgroundColor;
      this.activeTextarea.style.backgroundColor = options.backgroundColor;
    }
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

    if (newContent.length === 0) {
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
      this.hiddenTextElement.style.visibility = "visible";
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
      const existingBox = pageEl.querySelector(`.notepages-text-box[data-text-id="${textObj.id}"]`) as HTMLElement | null;
      if (existingBox) {
        existingBox.style.visibility = "hidden";
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

    const textarea = document.createElement("textarea");
    textarea.className = "notepages-inline-text-editor";
    if (currentText.isSticky) {
      textarea.classList.add("notepages-sticky-note");
      if (currentText.backgroundColor) {
        textarea.style.backgroundColor = currentText.backgroundColor;
      }
    } else {
      textarea.style.backgroundColor = "transparent";
      textarea.style.background = "transparent";
    }
    textarea.value = currentText.content;
    textarea.placeholder = "Type text, $LaTeX$, [[wikilinks]]...";
    textarea.style.position = "absolute";
    textarea.style.left = `${currentText.x}px`;
    textarea.style.top = `${currentText.y}px`;
    textarea.style.width = `${currentText.width}px`;
    textarea.style.height = `${currentText.height}px`;
    textarea.style.minWidth = "60px";
    textarea.style.minHeight = "30px";
    textarea.style.maxWidth = `${maxAllowedW}px`;
    textarea.style.maxHeight = `${maxAllowedH}px`;
    textarea.style.zIndex = "100";
    textarea.style.fontSize = `${currentText.fontSize}px`;
    textarea.style.fontFamily = currentText.fontFamily;
    textarea.style.fontWeight = currentText.fontWeight;
    textarea.style.fontStyle = currentText.italic ? "italic" : "normal";
    textarea.style.textDecoration = currentText.underline ? "underline" : "none";
    textarea.style.textAlign = currentText.textAlign;
    textarea.style.color = currentText.color;
    textarea.style.boxSizing = "border-box";

    textarea.addEventListener("pointerdown", (e: PointerEvent) => {
      e.stopPropagation();
    });

    textarea.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape" || ((e.ctrlKey || e.metaKey) && e.key === "Enter")) {
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
        textarea.style.height = `${nextH}px`;
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
              target.style.width = `${maxW}px`;
            }
            if (target.offsetHeight > maxH) {
              target.style.height = `${maxH}px`;
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

    pageEl.appendChild(textarea);

    this.activeEditorContainer = textarea;
    this.activeTextarea = textarea;

    this.callbacks.onEditingStarted?.();
    this.notifyFormattingChanged();

    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.value.length;
      textarea.selectionEnd = textarea.value.length;
    }, 10);
  }

  renderPageTexts(page: PageData, pageEl: HTMLElement): void {
    let layer = pageEl.querySelector(".notepages-text-layer") as HTMLElement | null;
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "notepages-text-layer";
      layer.style.position = "absolute";
      layer.style.top = "0";
      layer.style.left = "0";
      layer.style.width = "100%";
      layer.style.height = "100%";
      layer.style.pointerEvents = "none";
      layer.style.zIndex = "4";
      pageEl.appendChild(layer);
    } else {
      layer.innerHTML = "";
    }

    if (!Array.isArray(page.texts)) {
      return;
    }

    const margin = 10;
    page.texts.forEach(t => {
      const box = document.createElement("div");
      box.className = "notepages-text-box";
      box.dataset.textId = t.id;
      box.style.position = "absolute";
      box.style.left = `${t.x}px`;
      box.style.top = `${t.y}px`;
      box.style.width = `${t.width}px`;
      box.style.minHeight = `${t.height}px`;
      box.style.maxWidth = `${Math.max(60, page.dimensions.width - margin - t.x)}px`;
      box.style.maxHeight = `${Math.max(30, page.dimensions.height - margin - t.y)}px`;
      box.style.overflow = "hidden";
      box.style.boxSizing = "border-box";
      box.style.fontSize = `${t.fontSize}px`;
      box.style.fontFamily = t.fontFamily;
      box.style.fontWeight = t.fontWeight;
      box.style.fontStyle = t.italic ? "italic" : "normal";
      box.style.textDecoration = t.underline ? "underline" : "none";
      box.style.color = t.color;
      box.style.textAlign = t.textAlign;
      box.style.pointerEvents = "auto";
      box.style.userSelect = "text";
      if (t.isSticky) {
        box.classList.add("notepages-sticky-note");
        if (t.backgroundColor) {
          box.style.backgroundColor = t.backgroundColor;
        }
      } else {
        box.style.backgroundColor = "transparent";
        box.style.background = "transparent";
      }

      this.renderFormattedContent(t.content, box);

      box.addEventListener("dblclick", (e: MouseEvent) => {
        e.stopPropagation();
        this.startEditing(page, pageEl, t);
      });

      layer!.appendChild(box);
    });

    if (this.mathFlusher) {
      this.mathFlusher().catch(() => {});
    }
  }

  private renderFormattedContent(content: string, container: HTMLElement): void {
    const tokens = tokenizeText(content);
    tokens.forEach(tok => {
      if (tok.type === "text") {
        const lines = tok.value.split("\n");
        lines.forEach((line, idx) => {
          if (idx > 0) {
            container.appendChild(document.createElement("br"));
          }
          if (line.length > 0) {
            container.appendChild(document.createTextNode(line));
          }
        });
      } else if (tok.type === "wikilink") {
        const linkEl = document.createElement("a");
        linkEl.className = "notepages-wikilink";
        linkEl.textContent = tok.value;
        linkEl.dataset.target = tok.target || tok.value;
        linkEl.addEventListener("click", (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          this.callbacks.onWikilinkClick(tok.target || tok.value, e);
        });
        container.appendChild(linkEl);
      } else if (tok.type === "math-inline" || tok.type === "math-display") {
        if (this.mathRenderer) {
          try {
            const mathEl = this.mathRenderer(tok.value, tok.type === "math-display");
            container.appendChild(mathEl);
          } catch {
            const fallback = document.createElement("span");
            fallback.className = "notepages-math-fallback";
            fallback.textContent = tok.raw;
            container.appendChild(fallback);
          }
        } else {
          const fallback = document.createElement("span");
          fallback.className = "notepages-math-fallback";
          fallback.textContent = tok.raw;
          container.appendChild(fallback);
        }
      }
    });
  }
}
