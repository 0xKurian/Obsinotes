import { App, Menu, Notice, TFile, setIcon } from "obsidian";
import { DocumentSerializer } from "../storage/DocumentSerializer";

export const PLUGIN_OWNED_FRONTMATTER_KEYS: ReadonlySet<string> = new Set([
  "notepages-plugin",
  "notepages-version",
  "title",
  "page-count",
  "updated"
]);

export type PropertyValueType = "text" | "list" | "number" | "checkbox" | "date" | "datetime";

export interface NotePagesPropertiesDelegate {
  app: App;
  getFile(): TFile | null;
  getPreservedFrontmatter(): string | null;
  setPreservedFrontmatter(nextFrontmatter: string): Promise<void>;
  hasUnsavedChanges(): boolean;
  saveBeforeFrontmatterEdit(): Promise<void>;
  registerDomEvent<K extends keyof HTMLElementEventMap>(
    el: HTMLElement,
    type: K,
    callback: (ev: HTMLElementEventMap[K]) => unknown
  ): void;
  onScrollToTop?(): void;
}

interface SuggestOption {
  value: string;
  icon?: string;
}

export class NotePagesPropertiesPanel {
  private delegate: NotePagesPropertiesDelegate;
  private containerEl: HTMLElement | null = null;
  private isExpanded: boolean = true;
  private modalMode: boolean = false;
  private isMutating: boolean = false;
  private localSnapshot: Record<string, unknown> | null = null;
  private draftNewRow: { key: string; type: PropertyValueType } | null = null;
  private focusTargetKey: string | null = null;
  private activeSuggestEl: HTMLElement | null = null;

  constructor(delegate: NotePagesPropertiesDelegate, options?: { modalMode?: boolean }) {
    this.delegate = delegate;
    this.modalMode = options?.modalMode ?? false;
  }

  build(parentEl: HTMLElement, beforeEl?: HTMLElement | null): HTMLElement {
    this.containerEl = parentEl.createDiv({
      cls: this.modalMode
        ? "notepages-properties-panel metadata-container is-modal"
        : "notepages-properties-panel metadata-container"
    });
    if (beforeEl && beforeEl.parentElement === parentEl) {
      parentEl.insertBefore(this.containerEl, beforeEl);
    }

    if (!this.modalMode) {
      const stopEvent = (e: Event) => {
        e.stopPropagation();
      };
      this.delegate.registerDomEvent(this.containerEl, "pointerdown", stopEvent);
      this.delegate.registerDomEvent(this.containerEl, "mousedown", stopEvent);
      this.delegate.registerDomEvent(this.containerEl, "dblclick", stopEvent);
      this.delegate.registerDomEvent(this.containerEl, "keydown", (e: KeyboardEvent) => {
        e.stopPropagation();
      });
    }

    this.render();
    return this.containerEl;
  }

  expandAndFocus(): void {
    this.isExpanded = true;
    this.startNewPropertyDraft();
    this.delegate.onScrollToTop?.();
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
    this.closeSuggest();
    this.localSnapshot = null;
    this.draftNewRow = null;
    this.focusTargetKey = null;
    if (this.containerEl) {
      this.containerEl.empty();
      this.containerEl.addClass("is-hidden");
    }
  }

  private closeSuggest(): void {
    if (this.activeSuggestEl) {
      this.activeSuggestEl.remove();
      this.activeSuggestEl = null;
    }
  }

  private startNewPropertyDraft(): void {
    this.isExpanded = true;
    this.draftNewRow = { key: "", type: "text" };
    this.focusTargetKey = "__draft__";
    this.render();
  }

  private getUserProperties(): Array<[string, unknown]> {
    const file = this.delegate.getFile();
    if (!file) {
      return [];
    }

    const isMarkdown = file.extension.toLowerCase() === "md";
    const rawFm: Record<string, unknown> | undefined =
      this.localSnapshot ??
      (isMarkdown
        ? this.delegate.app.metadataCache.getFileCache(file)?.frontmatter
        : DocumentSerializer.parseFrontmatterProperties(this.delegate.getPreservedFrontmatter()));
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

  private getVaultPropertySuggestions(excludeKeys: Set<string>): SuggestOption[] {
    const keyTypeMap = new Map<string, PropertyValueType>();
    keyTypeMap.set("aliases", "list");
    keyTypeMap.set("tags", "list");
    keyTypeMap.set("cssclasses", "list");

    const mdFiles = this.delegate.app.vault.getMarkdownFiles?.() ?? [];
    for (const f of mdFiles) {
      const fm = this.delegate.app.metadataCache.getFileCache(f)?.frontmatter;
      if (!fm) continue;
      for (const [k, v] of Object.entries(fm)) {
        if (k === "position" || PLUGIN_OWNED_FRONTMATTER_KEYS.has(k)) continue;
        if (!keyTypeMap.has(k)) {
          keyTypeMap.set(k, this.inferPropertyType(k, v));
        }
      }
    }

    const results: SuggestOption[] = [];
    for (const [k, t] of keyTypeMap.entries()) {
      if (excludeKeys.has(k)) continue;
      results.push({
        value: k,
        icon: this.getTypeIconName(k, t)
      });
    }
    return results.sort((a, b) => a.value.localeCompare(b.value));
  }

  private getVaultValueSuggestions(key: string, excludeValues: Set<string>): SuggestOption[] {
    const values = new Set<string>();
    const lowerKey = key.toLowerCase();

    if (lowerKey === "tags") {
      const cacheWithTags = this.delegate.app.metadataCache as unknown as {
        getTags?: () => Record<string, number>;
      };
      if (typeof cacheWithTags.getTags === "function") {
        const tagMap = cacheWithTags.getTags() ?? {};
        for (const rawTag of Object.keys(tagMap)) {
          const clean = rawTag.replace(/^#/, "").trim();
          if (clean && !excludeValues.has(clean)) {
            values.add(clean);
          }
        }
      }
    }

    const mdFiles = this.delegate.app.vault.getMarkdownFiles?.() ?? [];
    for (const f of mdFiles) {
      const fm = this.delegate.app.metadataCache.getFileCache(f)?.frontmatter;
      if (!fm || !Object.prototype.hasOwnProperty.call(fm, key)) continue;
      const val: unknown = fm[key];
      if (Array.isArray(val)) {
        for (const item of val) {
          const s = this.formatPropertyValue(item).trim().replace(/^#/, "");
          if (s && !excludeValues.has(s)) values.add(s);
        }
      } else {
        const s = this.formatPropertyValue(val).trim();
        if (s && !excludeValues.has(s)) values.add(s);
      }
    }

    return Array.from(values)
      .sort((a, b) => a.localeCompare(b))
      .map((v) => ({ value: v }));
  }

  private attachAutocomplete(
    inputEl: HTMLInputElement,
    getOptions: () => SuggestOption[],
    onPick: (value: string) => void
  ): void {
    let selectedIndex = -1;
    let filtered: SuggestOption[] = [];

    const renderSuggestList = () => {
      this.closeSuggest();
      const query = inputEl.value.trim().toLowerCase();
      filtered = getOptions()
        .filter((opt) => !query || opt.value.toLowerCase().includes(query))
        .slice(0, 30);

      if (filtered.length === 0) {
        return;
      }

      if (selectedIndex >= filtered.length) {
        selectedIndex = 0;
      }

      const suggestEl = document.body.createDiv({
        cls: "suggestion-container notepages-property-suggest"
      });
      this.activeSuggestEl = suggestEl;

      const rect = inputEl.getBoundingClientRect();
      const top = Math.min(window.innerHeight - 220, rect.bottom + 4);
      const left = Math.min(window.innerWidth - 230, Math.max(8, rect.left));
      suggestEl.setCssProps({
        "--np-suggest-top": `${top}px`,
        "--np-suggest-left": `${left}px`,
        "--np-suggest-width": `${Math.max(200, Math.min(300, rect.width + 40))}px`
      });

      const listEl = suggestEl.createDiv({ cls: "suggestion" });
      filtered.forEach((opt, idx) => {
        const itemEl = listEl.createDiv({
          cls: idx === selectedIndex ? "suggestion-item is-selected" : "suggestion-item"
        });
        if (opt.icon) {
          const iconSpan = itemEl.createSpan({ cls: "suggestion-icon" });
          setIcon(iconSpan, opt.icon);
        }
        itemEl.createSpan({ cls: "suggestion-title", text: opt.value });

        itemEl.addEventListener("mouseenter", () => {
          selectedIndex = idx;
          listEl.querySelectorAll(".suggestion-item").forEach((el, i) => {
            el.toggleClass("is-selected", i === selectedIndex);
          });
        });

        itemEl.addEventListener("mousedown", (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          this.closeSuggest();
          onPick(opt.value);
        });
      });
    };

    this.delegate.registerDomEvent(inputEl, "focus", () => {
      selectedIndex = -1;
      renderSuggestList();
    });
    this.delegate.registerDomEvent(inputEl, "input", () => {
      selectedIndex = 0;
      renderSuggestList();
    });
    this.delegate.registerDomEvent(inputEl, "keydown", (e: KeyboardEvent) => {
      if (!this.activeSuggestEl || filtered.length === 0) {
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        selectedIndex = (selectedIndex + 1) % filtered.length;
        this.activeSuggestEl.querySelectorAll(".suggestion-item").forEach((el, i) => {
          el.toggleClass("is-selected", i === selectedIndex);
          if (i === selectedIndex) {
            el.scrollIntoView({ block: "nearest" });
          }
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        selectedIndex = selectedIndex <= 0 ? filtered.length - 1 : selectedIndex - 1;
        this.activeSuggestEl.querySelectorAll(".suggestion-item").forEach((el, i) => {
          el.toggleClass("is-selected", i === selectedIndex);
          if (i === selectedIndex) {
            el.scrollIntoView({ block: "nearest" });
          }
        });
      } else if (e.key === "Enter" && selectedIndex >= 0 && selectedIndex < filtered.length) {
        e.preventDefault();
        e.stopPropagation();
        const picked = filtered[selectedIndex].value;
        this.closeSuggest();
        onPick(picked);
      } else if (e.key === "Escape") {
        e.stopPropagation();
        this.closeSuggest();
      }
    });
    this.delegate.registerDomEvent(inputEl, "blur", () => {
      window.setTimeout(() => {
        this.closeSuggest();
      }, 120);
    });
  }

  private inferPropertyType(key: string, value: unknown): PropertyValueType {
    if (key === "tags" || key === "aliases" || key === "cssclasses" || Array.isArray(value)) {
      return "list";
    }
    if (typeof value === "boolean") {
      return "checkbox";
    }
    if (typeof value === "number") {
      return "number";
    }
    if (typeof value === "string") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return "date";
      }
      if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value)) {
        return "datetime";
      }
    }
    return "text";
  }

  private getTypeIconName(key: string, type: PropertyValueType): string {
    if (key === "tags") return "tags";
    if (key === "aliases") return "forward";
    if (key === "cssclasses") return "code";
    switch (type) {
      case "list":
        return "list";
      case "checkbox":
        return "check-square";
      case "number":
        return "hash";
      case "date":
        return "calendar";
      case "datetime":
        return "clock";
      default:
        return "text";
    }
  }

  private convertValueToType(value: unknown, targetType: PropertyValueType): unknown {
    switch (targetType) {
      case "list": {
        if (Array.isArray(value)) return value.map((v) => this.formatPropertyValue(v));
        const str = this.formatPropertyValue(value).trim();
        return str ? str.split(",").map((s) => s.trim()).filter(Boolean) : [];
      }
      case "checkbox":
        if (typeof value === "boolean") return value;
        return this.formatPropertyValue(value).trim().toLowerCase() === "true";
      case "number": {
        if (typeof value === "number" && Number.isFinite(value)) return value;
        const parsed = parseFloat(this.formatPropertyValue(value));
        return Number.isFinite(parsed) ? parsed : 0;
      }
      case "date": {
        const str = this.formatPropertyValue(value).trim();
        const match = /^(\d{4}-\d{2}-\d{2})/.exec(str);
        return match ? match[1] : "";
      }
      case "datetime": {
        const str = this.formatPropertyValue(value).trim();
        const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(str);
        return match ? `${match[1]}T${match[2]}` : "";
      }
      case "text":
      default:
        if (Array.isArray(value)) {
          return value.map((v) => this.formatPropertyValue(v)).join(", ");
        }
        return this.formatPropertyValue(value);
    }
  }

  private async mutateFrontmatter(mutator: (fm: Record<string, unknown>) => void): Promise<void> {
    const file = this.delegate.getFile();
    if (!file || this.isMutating) {
      return;
    }

    this.isMutating = true;
    try {
      if (file.extension.toLowerCase() === "md") {
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
      } else {
        const updatedRaw = DocumentSerializer.updateFrontmatterProperties(
          this.delegate.getPreservedFrontmatter(),
          mutator
        );
        this.localSnapshot = DocumentSerializer.parseFrontmatterProperties(updatedRaw);
        await this.delegate.setPreservedFrontmatter(updatedRaw);
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
    this.closeSuggest();
    if (!this.containerEl) {
      return;
    }
    const file = this.delegate.getFile();
    if (!file) {
      this.containerEl.empty();
      this.containerEl.addClass("is-hidden");
      return;
    }
    this.containerEl.removeClass("is-hidden");
    this.containerEl.empty();
    this.containerEl.toggleClass("is-collapsed", !this.isExpanded);

    const entries = this.getUserProperties();

    const headingEl = this.containerEl.createDiv({ cls: "metadata-properties-heading" });
    if (!this.modalMode) {
      const collapseIndicator = headingEl.createDiv({
        cls: this.isExpanded ? "collapse-indicator" : "collapse-indicator is-collapsed"
      });
      setIcon(collapseIndicator, "chevron-down");
      headingEl.setAttribute("role", "button");
      headingEl.setAttribute("tabindex", "0");
      headingEl.setAttribute("aria-expanded", String(this.isExpanded));
      this.delegate.registerDomEvent(headingEl, "click", () => {
        this.toggleExpanded();
      });
      this.delegate.registerDomEvent(headingEl, "keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.toggleExpanded();
        }
      });
    }
    headingEl.createDiv({
      cls: "metadata-properties-title",
      text: "Properties"
    });

    if (!this.isExpanded) {
      return;
    }

    const contentEl = this.containerEl.createDiv({ cls: "metadata-content" });
    const listEl = contentEl.createDiv({ cls: "metadata-properties" });

    for (const [key, val] of entries) {
      this.renderPropertyRow(listEl, key, val);
    }

    if (this.draftNewRow) {
      this.renderDraftNewPropertyRow(listEl, this.draftNewRow);
    }

    const addBtn = contentEl.createEl("button", {
      cls: "metadata-add-button"
    });
    addBtn.setAttribute("type", "button");
    const plusIcon = addBtn.createSpan({ cls: "metadata-add-button-icon" });
    setIcon(plusIcon, "plus");
    addBtn.createSpan({ text: "Add property" });
    this.delegate.registerDomEvent(addBtn, "click", () => {
      this.startNewPropertyDraft();
    });
  }

  private openPropertyMenu(e: MouseEvent, key: string, value: unknown, currentType: PropertyValueType): void {
    const menu = new Menu();
    const typeItems: Array<{ type: PropertyValueType; title: string; icon: string }> = [
      { type: "text", title: "Text", icon: "text" },
      { type: "list", title: "List", icon: "list" },
      { type: "number", title: "Number", icon: "hash" },
      { type: "checkbox", title: "Checkbox", icon: "check-square" },
      { type: "date", title: "Date", icon: "calendar" },
      { type: "datetime", title: "Date & time", icon: "clock" }
    ];

    menu.addItem((item) => {
      item.setTitle("Property type").setIcon("info");
      const subMenu = (item as unknown as { setSubmenu?: () => Menu }).setSubmenu?.();
      if (subMenu) {
        for (const entry of typeItems) {
          subMenu.addItem((subItem) => {
            subItem
              .setTitle(entry.title)
              .setIcon(entry.icon)
              .setChecked(currentType === entry.type)
              .onClick(() => {
                if (currentType === entry.type) return;
                const converted = this.convertValueToType(value, entry.type);
                void this.mutateFrontmatter((fm) => {
                  fm[key] = converted;
                });
              });
          });
        }
      }
    });

    menu.addSeparator();

    const serializedPair = `${key}: ${
      Array.isArray(value)
        ? `[${value.map((v) => this.formatPropertyValue(v)).join(", ")}]`
        : this.formatPropertyValue(value)
    }`;

    menu.addItem((item) => {
      item
        .setTitle("Cut")
        .setIcon("scissors")
        .onClick(() => {
          void navigator.clipboard?.writeText(serializedPair).catch(() => {});
          void this.mutateFrontmatter((fm) => {
            delete fm[key];
          });
        });
    });

    menu.addItem((item) => {
      item
        .setTitle("Copy")
        .setIcon("copy")
        .onClick(() => {
          void navigator.clipboard?.writeText(serializedPair).catch(() => {});
          new Notice(`Copied "${key}"`);
        });
    });

    menu.addItem((item) => {
      item
        .setTitle("Paste")
        .setIcon("clipboard-paste")
        .onClick(() => {
          void (async () => {
            try {
              const raw = (await navigator.clipboard?.readText()) ?? "";
              const parsed = DocumentSerializer.parseFrontmatterProperties(raw);
              const entries = Object.entries(parsed).filter(
                ([k]) => k !== "position" && !PLUGIN_OWNED_FRONTMATTER_KEYS.has(k)
              );
              if (entries.length === 0) {
                new Notice("Clipboard does not contain a valid property.");
                return;
              }
              await this.mutateFrontmatter((fm) => {
                for (const [k, v] of entries) {
                  fm[k] = v;
                }
              });
            } catch {
              new Notice("Unable to read clipboard.");
            }
          })();
        });
    });

    menu.addSeparator();
    menu.addItem((item) => {
      item
        .setTitle("Remove")
        .setIcon("trash-2")
        .onClick(() => {
          void this.mutateFrontmatter((fm) => {
            delete fm[key];
          });
        });
      const maybeWarning = item as unknown as { setWarning?: (w: boolean) => void };
      maybeWarning.setWarning?.(true);
    });

    menu.showAtMouseEvent(e);
  }

  private renderPropertyRow(listEl: HTMLElement, key: string, value: unknown): void {
    const propType = this.inferPropertyType(key, value);
    const rowEl = listEl.createDiv({ cls: "metadata-property" });
    rowEl.setAttribute("data-property-key", key);
    this.delegate.registerDomEvent(rowEl, "contextmenu", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.openPropertyMenu(e, key, value, propType);
    });

    const keyCol = rowEl.createDiv({ cls: "metadata-property-key" });
    const iconBtn = keyCol.createEl("button", {
      cls: "metadata-property-icon"
    });
    iconBtn.setAttribute("type", "button");
    iconBtn.setAttribute("title", "Property options");
    iconBtn.setAttribute("aria-label", `Property options for ${key}`);
    setIcon(iconBtn, this.getTypeIconName(key, propType));
    this.delegate.registerDomEvent(iconBtn, "click", (e: MouseEvent) => {
      e.stopPropagation();
      this.openPropertyMenu(e, key, value, propType);
    });

    const keyInput = keyCol.createEl("input", {
      type: "text",
      cls: "metadata-property-key-input",
      value: key
    });
    keyInput.setAttribute("aria-label", `Property name ${key}`);

    const commitKeyRename = () => {
      const nextKey = keyInput.value.trim();
      if (!nextKey || nextKey === key) {
        keyInput.value = key;
        return;
      }
      if (PLUGIN_OWNED_FRONTMATTER_KEYS.has(nextKey) || nextKey === "position") {
        new Notice(`"${nextKey}" is managed automatically by NotePages.`);
        keyInput.value = key;
        return;
      }
      void this.mutateFrontmatter((fm) => {
        const existingVal = fm[key];
        delete fm[key];
        fm[nextKey] = existingVal;
      });
    };
    this.delegate.registerDomEvent(keyInput, "change", commitKeyRename);
    this.delegate.registerDomEvent(keyInput, "keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitKeyRename();
        keyInput.blur();
      } else if (e.key === "Escape") {
        keyInput.value = key;
        keyInput.blur();
      }
    });

    const valCol = rowEl.createDiv({ cls: "metadata-property-value" });
    let focusEl: HTMLElement | null = null;

    if (propType === "list") {
      const items = Array.isArray(value)
        ? value.map((v) => this.formatPropertyValue(v))
        : value !== null && value !== undefined && this.formatPropertyValue(value).trim() !== ""
          ? [this.formatPropertyValue(value)]
          : [];
      focusEl = this.renderListValueEditor(valCol, key, items);
    } else if (propType === "checkbox") {
      const checkbox = valCol.createEl("input", {
        type: "checkbox",
        cls: "metadata-input-checkbox"
      });
      checkbox.checked = Boolean(value);
      checkbox.setAttribute("aria-label", key);
      this.delegate.registerDomEvent(checkbox, "change", () => {
        void this.mutateFrontmatter((fm) => {
          fm[key] = checkbox.checked;
        });
      });
      focusEl = checkbox;
    } else if (propType === "number") {
      const numInput = valCol.createEl("input", {
        type: "number",
        cls: "metadata-input-number",
        value: typeof value === "number" ? String(value) : ""
      });
      numInput.step = "any";
      numInput.placeholder = "Empty";
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
      focusEl = numInput;
    } else if (propType === "date" || propType === "datetime") {
      const dateInput = valCol.createEl("input", {
        type: propType === "date" ? "date" : "datetime-local",
        cls: "metadata-input-date",
        value: this.formatPropertyValue(value)
      });
      dateInput.setAttribute("aria-label", key);
      this.delegate.registerDomEvent(dateInput, "change", () => {
        void this.mutateFrontmatter((fm) => {
          fm[key] = dateInput.value;
        });
      });
      focusEl = dateInput;
    } else {
      const strVal = this.formatPropertyValue(value);
      const textInput = valCol.createEl("input", {
        type: "text",
        cls: "metadata-input-text",
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
      this.attachAutocomplete(
        textInput,
        () => this.getVaultValueSuggestions(key, new Set([strVal])),
        (picked) => {
          textInput.value = picked;
          commitText();
        }
      );
      this.delegate.registerDomEvent(textInput, "change", commitText);
      this.delegate.registerDomEvent(textInput, "keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitText();
          textInput.blur();
        }
      });
      focusEl = textInput;
    }

    if (this.focusTargetKey === key && focusEl) {
      this.focusTargetKey = null;
      window.setTimeout(() => {
        focusEl?.focus();
      }, 0);
    }
  }

  private renderDraftNewPropertyRow(
    listEl: HTMLElement,
    draft: { key: string; type: PropertyValueType }
  ): void {
    const rowEl = listEl.createDiv({ cls: "metadata-property is-draft" });
    const keyCol = rowEl.createDiv({ cls: "metadata-property-key" });
    const iconBtn = keyCol.createEl("button", {
      cls: "metadata-property-icon"
    });
    iconBtn.setAttribute("type", "button");
    setIcon(iconBtn, this.getTypeIconName(draft.key, draft.type));

    const keyInput = keyCol.createEl("input", {
      type: "text",
      cls: "metadata-property-key-input",
      value: draft.key
    });
    keyInput.placeholder = "Property name";
    keyInput.setAttribute("aria-label", "New property name");

    const valCol = rowEl.createDiv({ cls: "metadata-property-value" });
    const valInput = valCol.createEl("input", {
      type: "text",
      cls: "metadata-input-text"
    });
    valInput.placeholder = "Empty";
    valInput.setAttribute("aria-label", "New property value");

    let committed = false;
    const commitDraft = (focusValueAfter: boolean, overrideKey?: string) => {
      if (committed) return;
      const newKey = (overrideKey ?? keyInput.value).trim();
      if (!newKey) {
        if (!focusValueAfter) {
          this.draftNewRow = null;
          this.render();
        }
        return;
      }
      if (PLUGIN_OWNED_FRONTMATTER_KEYS.has(newKey) || newKey === "position") {
        new Notice(`"${newKey}" is managed automatically by NotePages.`);
        keyInput.focus();
        return;
      }
      committed = true;
      const suggestions = this.getVaultPropertySuggestions(new Set());
      const matched = suggestions.find((s) => s.value === newKey);
      const isListKey =
        newKey.toLowerCase() === "tags" ||
        newKey.toLowerCase() === "aliases" ||
        newKey.toLowerCase() === "cssclasses" ||
        matched?.icon === "list";
      const rawVal = valInput.value.trim();
      const initialVal = isListKey
        ? rawVal
          ? rawVal.split(",").map((s) => s.trim().replace(/^#/, "")).filter(Boolean)
          : []
        : rawVal;

      this.draftNewRow = null;
      if (focusValueAfter) {
        this.focusTargetKey = newKey;
      }
      void this.mutateFrontmatter((fm) => {
        if (!Object.prototype.hasOwnProperty.call(fm, newKey)) {
          fm[newKey] = initialVal;
        }
      });
    };

    const existingKeys = new Set(this.getUserProperties().map(([k]) => k));
    this.attachAutocomplete(
      keyInput,
      () => this.getVaultPropertySuggestions(existingKeys),
      (pickedKey) => {
        keyInput.value = pickedKey;
        commitDraft(true, pickedKey);
      }
    );

    this.delegate.registerDomEvent(keyInput, "input", () => {
      const k = keyInput.value.trim().toLowerCase();
      setIcon(iconBtn, k === "tags" ? "tags" : k === "aliases" ? "forward" : "text");
    });

    this.delegate.registerDomEvent(keyInput, "keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Tab") {
        if (keyInput.value.trim().length > 0) {
          e.preventDefault();
          commitDraft(true);
        } else if (e.key === "Enter") {
          e.preventDefault();
          this.draftNewRow = null;
          this.render();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.draftNewRow = null;
        this.render();
      }
    });

    this.delegate.registerDomEvent(keyInput, "blur", () => {
      window.setTimeout(() => {
        if (this.draftNewRow && !this.activeSuggestEl && document.activeElement !== valInput) {
          commitDraft(false);
        }
      }, 140);
    });

    this.delegate.registerDomEvent(valInput, "keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitDraft(false);
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.draftNewRow = null;
        this.render();
      }
    });

    if (this.focusTargetKey === "__draft__") {
      this.focusTargetKey = null;
      window.setTimeout(() => {
        keyInput.focus();
      }, 0);
    }
  }

  private renderListValueEditor(container: HTMLElement, key: string, items: string[]): HTMLElement {
    const pillsContainer = container.createDiv({ cls: "multi-select-container" });
    const isTagKey = key === "tags";

    items.forEach((item, index) => {
      const pill = pillsContainer.createDiv({
        cls: isTagKey ? "multi-select-pill notepages-tag-pill" : "multi-select-pill"
      });
      pill.createDiv({
        cls: "multi-select-pill-content",
        text: isTagKey && !item.startsWith("#") ? `#${item}` : item
      });
      const removeBtn = pill.createEl("button", {
        cls: "multi-select-pill-remove-button"
      });
      removeBtn.setAttribute("type", "button");
      removeBtn.setAttribute("aria-label", `Remove ${item}`);
      setIcon(removeBtn, "x");
      this.delegate.registerDomEvent(removeBtn, "click", () => {
        const nextItems = items.filter((_, i) => i !== index);
        void this.mutateFrontmatter((fm) => {
          fm[key] = nextItems;
        });
      });
    });

    const addInput = pillsContainer.createEl("input", {
      type: "text",
      cls: "multi-select-input"
    });
    addInput.placeholder = items.length === 0 ? "Empty" : "";
    addInput.setAttribute("aria-label", `Add item to ${key}`);

    const commitItem = (rawOverride?: string) => {
      let next = (rawOverride ?? addInput.value).trim();
      if (isTagKey && next.startsWith("#")) {
        next = next.slice(1).trim();
      }
      if (!next || items.includes(next)) {
        addInput.value = "";
        return;
      }
      addInput.value = "";
      this.focusTargetKey = key;
      void this.mutateFrontmatter((fm) => {
        fm[key] = [...items, next];
      });
    };

    const existingSet = new Set(items.map((i) => i.replace(/^#/, "")));
    this.attachAutocomplete(
      addInput,
      () => this.getVaultValueSuggestions(key, existingSet),
      (pickedVal) => {
        commitItem(pickedVal);
      }
    );

    this.delegate.registerDomEvent(addInput, "keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        commitItem();
      } else if (e.key === "Backspace" && addInput.value === "" && items.length > 0) {
        e.preventDefault();
        const nextItems = items.slice(0, -1);
        this.focusTargetKey = key;
        void this.mutateFrontmatter((fm) => {
          fm[key] = nextItems;
        });
      }
    });
    this.delegate.registerDomEvent(addInput, "blur", () => {
      window.setTimeout(() => {
        if (!this.activeSuggestEl && addInput.value.trim().length > 0) {
          commitItem();
        }
      }, 140);
    });

    return addInput;
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
