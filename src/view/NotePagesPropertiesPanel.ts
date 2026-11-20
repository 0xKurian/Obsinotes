import { App, Notice, TFile, setIcon } from "obsidian";

export const PLUGIN_OWNED_FRONTMATTER_KEYS: ReadonlySet<string> = new Set([
  "notepages-plugin",
  "notepages-version",
  "title",
  "page-count",
  "updated"
]);

export type PropertyValueType = "text" | "list" | "number" | "checkbox";

export interface NotePagesPropertiesDelegate {
  app: App;
  getFile(): TFile | null;
  hasUnsavedChanges(): boolean;
  saveBeforeFrontmatterEdit(): Promise<void>;
  registerDomEvent<K extends keyof HTMLElementEventMap>(
    el: HTMLElement,
    type: K,
    callback: (ev: HTMLElementEventMap[K]) => unknown
  ): void;
  onScrollToTop?(): void;
}

export class NotePagesPropertiesPanel {
  private delegate: NotePagesPropertiesDelegate;
  private containerEl: HTMLElement | null = null;
  private isExpanded: boolean = false;
  private isMutating: boolean = false;
  private localSnapshot: Record<string, unknown> | null = null;
  private focusNewKeyOnRender: boolean = false;

  constructor(delegate: NotePagesPropertiesDelegate) {
    this.delegate = delegate;
  }

  build(parentEl: HTMLElement, beforeEl?: HTMLElement | null): HTMLElement {
    this.containerEl = parentEl.createDiv({ cls: "notepages-properties-panel" });
    if (beforeEl && beforeEl.parentElement === parentEl) {
      parentEl.insertBefore(this.containerEl, beforeEl);
    }

    // Prevent canvas panning/gestures/hotkeys from hijacking clicks or typing inside the panel
    const stopEvent = (e: Event) => {
      e.stopPropagation();
    };
    this.delegate.registerDomEvent(this.containerEl, "pointerdown", stopEvent);
    this.delegate.registerDomEvent(this.containerEl, "mousedown", stopEvent);
    this.delegate.registerDomEvent(this.containerEl, "dblclick", stopEvent);
    this.delegate.registerDomEvent(this.containerEl, "keydown", (e: KeyboardEvent) => {
      e.stopPropagation();
    });

    this.render();
    return this.containerEl;
  }

  expandAndFocus(): void {
    this.isExpanded = true;
    this.focusNewKeyOnRender = true;
    this.delegate.onScrollToTop?.();
    this.render();
  }

  toggleExpanded(): void {
    this.isExpanded = !this.isExpanded;
    this.render();
  }

  refresh(invalidateSnapshot: boolean = false): void {
    if (invalidateSnapshot) {
      this.localSnapshot = null;
    }
    this.render();
  }

  clear(): void {
    this.localSnapshot = null;
    if (this.containerEl) {
      this.containerEl.empty();
      this.containerEl.addClass("is-hidden");
    }
  }

  private getUserProperties(): Array<[string, unknown]> {
    const file = this.delegate.getFile();
    if (!file || file.extension.toLowerCase() !== "md") {
      return [];
    }

    const rawFm: Record<string, unknown> | undefined =
      this.localSnapshot ?? this.delegate.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!rawFm || typeof rawFm !== "object") {
      return [];
    }

    const entries: Array<[string, unknown]> = [];
    for (const [key, value] of Object.entries(rawFm)) {
      if (key === "position" || PLUGIN_OWNED_FRONTMATTER_KEYS.has(key)) {
        continue;
      }
      entries.push([key, value]);
    }
    return entries;
  }

  private async mutateFrontmatter(mutator: (fm: Record<string, unknown>) => void): Promise<void> {
    const file = this.delegate.getFile();
    if (!file || file.extension.toLowerCase() !== "md" || this.isMutating) {
      return;
    }

    this.isMutating = true;
    try {
      if (this.delegate.hasUnsavedChanges()) {
        await this.delegate.saveBeforeFrontmatterEdit();
      }
      let nextSnapshot: Record<string, unknown> | null = null;
      await this.delegate.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        mutator(fm);
        nextSnapshot = { ...fm };
      });
      if (nextSnapshot) {
        this.localSnapshot = nextSnapshot;
      }
      this.render();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      new Notice(`Failed to update properties: ${msg}`);
    } finally {
      this.isMutating = false;
    }
  }

  private render(): void {
    if (!this.containerEl) {
      return;
    }
    const file = this.delegate.getFile();
    if (!file || file.extension.toLowerCase() !== "md") {
      this.containerEl.empty();
      this.containerEl.addClass("is-hidden");
      return;
    }
    this.containerEl.removeClass("is-hidden");
    this.containerEl.empty();
    this.containerEl.toggleClass("is-expanded", this.isExpanded);

    const entries = this.getUserProperties();

    // Header bar
    const headerEl = this.containerEl.createDiv({ cls: "notepages-properties-header" });
    const toggleBtn = headerEl.createEl("button", {
      cls: "notepages-properties-toggle-btn"
    });
    toggleBtn.setAttribute("type", "button");
    toggleBtn.setAttribute("aria-expanded", String(this.isExpanded));
    const chevronEl = toggleBtn.createSpan({ cls: "notepages-properties-chevron" });
    setIcon(chevronEl, this.isExpanded ? "chevron-down" : "chevron-right");
    toggleBtn.createSpan({
      cls: "notepages-properties-title",
      text: "Properties"
    });
    toggleBtn.createSpan({
      cls: "notepages-properties-count",
      text: String(entries.length)
    });
    this.delegate.registerDomEvent(toggleBtn, "click", () => {
      this.toggleExpanded();
    });

    // Collapsed preview pills
    if (!this.isExpanded && entries.length > 0) {
      const previewEl = headerEl.createDiv({ cls: "notepages-properties-preview" });
      for (const [key, val] of entries.slice(0, 4)) {
        if (key === "tags" && Array.isArray(val)) {
          for (const tag of val.slice(0, 3)) {
            const text = String(tag).trim();
            if (text) {
              previewEl.createSpan({
                cls: "notepages-property-preview-pill is-tag",
                text: text.startsWith("#") ? text : `#${text}`
              });
            }
          }
        } else {
          const display = Array.isArray(val)
            ? val.map((item) => this.formatPropertyValue(item)).join(", ")
            : this.formatPropertyValue(val);
          previewEl.createSpan({
            cls: "notepages-property-preview-pill",
            text: display ? `${key}: ${display}` : key
          });
        }
      }
    }

    const quickAddBtn = headerEl.createEl("button", {
      cls: "notepages-properties-quick-add"
    });
    quickAddBtn.setAttribute("type", "button");
    const plusIcon = quickAddBtn.createSpan({ cls: "notepages-properties-btn-icon" });
    setIcon(plusIcon, "plus");
    quickAddBtn.createSpan({ text: "Add property" });
    this.delegate.registerDomEvent(quickAddBtn, "click", (e) => {
      e.stopPropagation();
      this.isExpanded = true;
      this.focusNewKeyOnRender = true;
      this.render();
    });

    if (!this.isExpanded) {
      return;
    }

    const bodyEl = this.containerEl.createDiv({ cls: "notepages-properties-body" });

    if (entries.length === 0) {
      bodyEl.createDiv({
        cls: "notepages-properties-empty",
        text: "No custom properties yet. Add tags, status, or metadata below."
      });
    } else {
      const listEl = bodyEl.createDiv({ cls: "notepages-properties-list" });
      for (const [key, val] of entries) {
        this.renderPropertyRow(listEl, key, val);
      }
    }

    this.renderAddPropertyRow(bodyEl);
  }

  private renderPropertyRow(listEl: HTMLElement, key: string, value: unknown): void {
    const rowEl = listEl.createDiv({ cls: "notepages-property-row" });

    const keyCol = rowEl.createDiv({ cls: "notepages-property-key" });
    const iconSpan = keyCol.createSpan({ cls: "notepages-property-type-icon" });
    if (key === "tags" || Array.isArray(value)) {
      setIcon(iconSpan, key === "tags" ? "tags" : "list");
    } else if (typeof value === "boolean") {
      setIcon(iconSpan, "check-square");
    } else if (typeof value === "number") {
      setIcon(iconSpan, "hash");
    } else {
      setIcon(iconSpan, "text");
    }
    keyCol.createSpan({ cls: "notepages-property-key-text", text: key });

    const valCol = rowEl.createDiv({ cls: "notepages-property-value" });
    if (Array.isArray(value) || key === "tags" || key === "aliases") {
      const items = Array.isArray(value)
        ? value.map((v) => this.formatPropertyValue(v))
        : value !== null && value !== undefined && this.formatPropertyValue(value).trim() !== ""
          ? [this.formatPropertyValue(value)]
          : [];
      this.renderListValueEditor(valCol, key, items);
    } else if (typeof value === "boolean") {
      const checkbox = valCol.createEl("input", {
        type: "checkbox",
        cls: "notepages-property-checkbox"
      });
      checkbox.checked = value;
      checkbox.setAttribute("aria-label", key);
      this.delegate.registerDomEvent(checkbox, "change", () => {
        void this.mutateFrontmatter((fm) => {
          fm[key] = checkbox.checked;
        });
      });
    } else if (typeof value === "number") {
      const numInput = valCol.createEl("input", {
        type: "number",
        cls: "notepages-property-input",
        value: String(value)
      });
      numInput.step = "any";
      numInput.setAttribute("aria-label", key);
      const commitNum = () => {
        const parsed = parseFloat(numInput.value);
        if (Number.isFinite(parsed) && parsed !== value) {
          void this.mutateFrontmatter((fm) => {
            fm[key] = parsed;
          });
        }
      };
      this.delegate.registerDomEvent(numInput, "change", commitNum);
      this.delegate.registerDomEvent(numInput, "keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitNum();
          numInput.blur();
        }
      });
    } else {
      const strVal = this.formatPropertyValue(value);
      const textInput = valCol.createEl("input", {
        type: "text",
        cls: "notepages-property-input",
        value: strVal
      });
      textInput.placeholder = "Empty";
      textInput.setAttribute("aria-label", key);
      const commitText = () => {
        if (textInput.value !== strVal) {
          void this.mutateFrontmatter((fm) => {
            fm[key] = textInput.value;
          });
        }
      };
      this.delegate.registerDomEvent(textInput, "change", commitText);
      this.delegate.registerDomEvent(textInput, "keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitText();
          textInput.blur();
        }
      });
    }

    const deleteBtn = rowEl.createEl("button", {
      cls: "notepages-icon-btn notepages-property-delete-btn"
    });
    deleteBtn.setAttribute("type", "button");
    deleteBtn.setAttribute("title", `Remove "${key}"`);
    deleteBtn.setAttribute("aria-label", `Remove ${key}`);
    setIcon(deleteBtn, "trash-2");
    this.delegate.registerDomEvent(deleteBtn, "click", () => {
      void this.mutateFrontmatter((fm) => {
        delete fm[key];
      });
    });
  }

  private renderListValueEditor(container: HTMLElement, key: string, items: string[]): void {
    const chipsWrap = container.createDiv({ cls: "notepages-property-chips" });
    const isTagKey = key === "tags";

    items.forEach((item, index) => {
      const chip = chipsWrap.createSpan({
        cls: isTagKey ? "notepages-property-chip is-tag" : "notepages-property-chip"
      });
      chip.createSpan({ text: isTagKey && !item.startsWith("#") ? `#${item}` : item });
      const removeBtn = chip.createEl("button", {
        cls: "notepages-property-chip-remove",
        text: "×"
      });
      removeBtn.setAttribute("type", "button");
      removeBtn.setAttribute("aria-label", `Remove ${item}`);
      this.delegate.registerDomEvent(removeBtn, "click", () => {
        const nextItems = items.filter((_, i) => i !== index);
        void this.mutateFrontmatter((fm) => {
          fm[key] = nextItems;
        });
      });
    });

    const addInput = chipsWrap.createEl("input", {
      type: "text",
      cls: "notepages-property-chip-input"
    });
    addInput.placeholder = isTagKey ? "+ tag..." : "+ item...";
    addInput.setAttribute("aria-label", `Add item to ${key}`);

    const commitItem = () => {
      let next = addInput.value.trim();
      if (isTagKey && next.startsWith("#")) {
        next = next.slice(1).trim();
      }
      if (!next) {
        addInput.value = "";
        return;
      }
      if (items.includes(next)) {
        addInput.value = "";
        return;
      }
      addInput.value = "";
      void this.mutateFrontmatter((fm) => {
        fm[key] = [...items, next];
      });
    };

    this.delegate.registerDomEvent(addInput, "keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        commitItem();
      } else if (e.key === "Backspace" && addInput.value === "" && items.length > 0) {
        e.preventDefault();
        const nextItems = items.slice(0, -1);
        void this.mutateFrontmatter((fm) => {
          fm[key] = nextItems;
        });
      }
    });
    this.delegate.registerDomEvent(addInput, "blur", () => {
      if (addInput.value.trim().length > 0) {
        commitItem();
      }
    });
  }

  private renderAddPropertyRow(bodyEl: HTMLElement): void {
    const addRow = bodyEl.createDiv({ cls: "notepages-property-add-row" });

    const keyInput = addRow.createEl("input", {
      type: "text",
      cls: "notepages-property-add-key"
    });
    keyInput.placeholder = "Property name (e.g. Tags, status)";

    const typeSelect = addRow.createEl("select", {
      cls: "notepages-property-add-type"
    });
    const types: Array<{ value: PropertyValueType; label: string }> = [
      { value: "text", label: "Text" },
      { value: "list", label: "List / Tags" },
      { value: "number", label: "Number" },
      { value: "checkbox", label: "Checkbox" }
    ];
    for (const t of types) {
      const opt = typeSelect.createEl("option", { text: t.label });
      opt.value = t.value;
    }

    const valInput = addRow.createEl("input", {
      type: "text",
      cls: "notepages-property-add-val"
    });
    valInput.placeholder = "Value...";

    const checkInput = addRow.createEl("input", {
      type: "checkbox",
      cls: "notepages-property-checkbox is-hidden"
    });

    const syncInputType = () => {
      const kind = typeSelect.value as PropertyValueType;
      if (kind === "checkbox") {
        valInput.addClass("is-hidden");
        checkInput.removeClass("is-hidden");
      } else {
        valInput.removeClass("is-hidden");
        checkInput.addClass("is-hidden");
        valInput.type = kind === "number" ? "number" : "text";
        valInput.placeholder =
          kind === "list"
            ? "Comma-separated (e.g. class, math)"
            : kind === "number"
              ? "0"
              : "Value...";
      }
    };

    this.delegate.registerDomEvent(keyInput, "input", () => {
      const k = keyInput.value.trim().toLowerCase();
      if ((k === "tags" || k === "aliases") && typeSelect.value === "text") {
        typeSelect.value = "list";
        syncInputType();
      }
    });
    this.delegate.registerDomEvent(typeSelect, "change", syncInputType);

    const addBtn = addRow.createEl("button", {
      cls: "mod-cta notepages-property-add-btn",
      text: "Add"
    });
    addBtn.setAttribute("type", "button");

    const submitAdd = () => {
      const key = keyInput.value.trim();
      if (!key) {
        keyInput.focus();
        return;
      }
      if (PLUGIN_OWNED_FRONTMATTER_KEYS.has(key) || key === "position") {
        new Notice(`"${key}" is managed automatically by NotePages.`);
        return;
      }
      const kind = typeSelect.value as PropertyValueType;
      let parsedValue: unknown = valInput.value;
      if (kind === "checkbox") {
        parsedValue = checkInput.checked;
      } else if (kind === "number") {
        const num = parseFloat(valInput.value);
        parsedValue = Number.isFinite(num) ? num : 0;
      } else if (kind === "list") {
        parsedValue = valInput.value
          .split(",")
          .map((s) => s.trim().replace(/^#/, ""))
          .filter((s) => s.length > 0);
      }

      void this.mutateFrontmatter((fm) => {
        fm[key] = parsedValue;
      });
    };

    this.delegate.registerDomEvent(addBtn, "click", submitAdd);
    this.delegate.registerDomEvent(keyInput, "keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (typeSelect.value === "checkbox") {
          submitAdd();
        } else {
          valInput.focus();
        }
      }
    });
    this.delegate.registerDomEvent(valInput, "keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitAdd();
      }
    });

    if (this.focusNewKeyOnRender) {
      this.focusNewKeyOnRender = false;
      window.setTimeout(() => {
        keyInput.focus();
      }, 0);
    }
  }

  private formatPropertyValue(val: unknown): string {
    if (val === null || val === undefined) {
      return "";
    }
    if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
      return String(val);
    }
    try {
      return JSON.stringify(val);
    } catch {
      return "";
    }
  }
}
