import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type { SettingDefinition, SettingDefinitionGroup, SettingDefinitionItem, SettingGroupItem } from "obsidian";
import type NotePagesPlugin from "../main";
import { DEFAULT_SETTINGS, createDefaultPenPresets } from "./NotePagesSettings";
import {
  HOTKEY_ACTION_METADATA,
  HotkeyActionMetadata,
  HotkeyCategory,
  areHotkeyBindingsEqual,
  countCustomizedHotkeys,
  findHotkeyConflicts,
  formatHotkeyBinding,
  getHotkeyMetadata,
  normalizeKeyboardEventToBinding,
  resolveHotkeyBinding
} from "./HotkeyHelper";
import {
  DefaultToolPreset,
  EraserMode,
  PageOrientation,
  PageSizePreset,
  PaperTemplateType,
  StylusButtonAction,
  ToolbarPlacement
} from "../types";

const PAGE_SIZE_OPTIONS: Record<Exclude<PageSizePreset, "Custom">, string> = {
  A4: "A4 (210 x 297 mm)",
  A3: "A3 (297 x 420 mm)",
  A5: "A5 (148 x 210 mm)",
  B5: "B5 (176 x 250 mm)",
  Letter: "US Letter (8.5 x 11 in)",
  "16:9": "Widescreen (16:9)",
  Square: "Square (1:1)"
};

const ORIENTATION_OPTIONS: Record<PageOrientation, string> = {
  portrait: "Portrait (vertical)",
  landscape: "Landscape (horizontal)"
};

const TEMPLATE_OPTIONS: Record<PaperTemplateType, string> = {
  blank: "Blank",
  ruled: "Ruled (lined)",
  grid: "Grid",
  dotted: "Dotted",
  cornell: "Cornell note"
};

const DEFAULT_TOOL_OPTIONS: Record<DefaultToolPreset, string> = {
  pressure: "Pen",
  pencil: "Pencil",
  highlighter: "Highlighter",
  lasso: "Lasso select",
  select: "Pan / hand"
};

const ERASER_MODE_OPTIONS: Record<EraserMode, string> = {
  stroke: "Stroke eraser",
  precision: "Precision eraser"
};

const STYLUS_BUTTON_OPTIONS: Record<StylusButtonAction, string> = {
  hold: "Hold to erase (desktop / compatible styluses)",
  toggle: "Toggle eraser on press (recommended for Android / Samsung S Pen)",
  off: "Disabled"
};

const STYLUS_BUTTON_DESC =
  "Map the stylus side button to the eraser. On Android / Samsung S Pen, use Toggle eraser on press (press while hovering, then release to erase), because Android WebView pauses pen drag events while the button remains held. Hold to erase works on desktop and compatible stylus drivers.";

const TOOLBAR_PLACEMENT_OPTIONS: Record<ToolbarPlacement, string> = {
  top: "Top",
  bottom: "Bottom",
  left: "Left",
  right: "Right",
  floating: "Floating"
};

const HOTKEY_CATEGORY_TITLES: Record<HotkeyCategory, string> = {
  tools: "Tools",
  editing: "Editing and selection",
  canvas: "Canvas and view"
};

export class NotePagesSettingTab extends PluginSettingTab {
  plugin: NotePagesPlugin;
  private hotkeyFilterQuery: string = "";
  private hotkeyRowSyncCallbacks: Set<() => void> = new Set();

  constructor(app: App, plugin: NotePagesPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  override getSettingDefinitions(): SettingDefinitionItem[] {
    const paperGroup: SettingDefinitionGroup = {
      type: "group",
      heading: "Paper and notebook defaults",
      items: [
        {
          name: "Default page size",
          desc: "Choose the default paper size for newly created notebooks and pages.",
          control: { type: "dropdown", key: "defaultPageSize", options: PAGE_SIZE_OPTIONS }
        },
        {
          name: "Default page orientation",
          desc: "Orientation applied to new pages.",
          control: { type: "dropdown", key: "defaultOrientation", options: ORIENTATION_OPTIONS }
        },
        {
          name: "Default paper template",
          desc: "Template pattern rendered on new pages.",
          control: { type: "dropdown", key: "defaultTemplate", options: TEMPLATE_OPTIONS }
        },
        {
          name: "Default paper background",
          desc: "Background color applied to newly created notebook pages.",
          control: { type: "color", key: "defaultPaperBackground" }
        },
        {
          name: "Default line color",
          desc: "Color applied to paper template rule lines and grids.",
          control: { type: "color", key: "defaultLineColor" }
        },
        {
          name: "Default line spacing (pt)",
          desc: "Distance in points between ruled lines, grid cells, or dots (12 to 64).",
          control: { type: "number", key: "defaultLineSpacing", min: 12, max: 64 }
        }
      ]
    };

    const drawingGroup: SettingDefinitionGroup = {
      type: "group",
      heading: "Drawing, stylus and touch",
      items: [
        {
          name: "Default tool",
          desc: "Tool selected automatically when opening a notebook.",
          control: { type: "dropdown", key: "defaultTool", options: DEFAULT_TOOL_OPTIONS }
        },
        {
          name: "Default pen color",
          desc: "Initial ink color selected when opening a notebook.",
          control: { type: "color", key: "defaultPenColor" }
        },
        {
          name: "Default pen width (pt)",
          desc: "Initial pen stroke width when opening a notebook (0.5 to 15).",
          control: { type: "slider", key: "defaultPenWidth", min: 0.5, max: 15, step: 0.5 }
        },
        {
          name: "Default highlighter width (pt)",
          desc: "Initial highlighter width when opening a notebook (4 to 36).",
          control: { type: "slider", key: "defaultHighlighterWidth", min: 4, max: 36, step: 1 }
        },
        {
          name: "Default eraser mode",
          desc: "Choose whether the eraser removes whole strokes or trims exact contact points.",
          control: { type: "dropdown", key: "defaultEraserMode", options: ERASER_MODE_OPTIONS }
        },
        {
          name: "Default eraser size (px)",
          desc: "Initial eraser radius in points (4 to 50).",
          control: { type: "slider", key: "defaultEraserRadius", min: 4, max: 50, step: 2 }
        },
        {
          name: "Auto-recognize shapes",
          desc: "Hold briefly at the end of a stroke to snap lines, circles, rectangles, and triangles.",
          control: { type: "toggle", key: "shapeRecognitionEnabled" }
        },
        {
          name: "Show pen nib hover preview",
          desc: "Display a size and color preview ring beneath the pointer or hovering stylus.",
          control: { type: "toggle", key: "showPenHoverCursor" }
        },
        {
          name: "Draw with finger",
          desc: "Allow drawing with finger touch on touchscreens instead of only panning and zooming.",
          control: { type: "toggle", key: "drawWithFinger" }
        },
        {
          name: "Two-finger tap undo and three-finger tap redo",
          desc: "Use quick two-finger and three-finger tap gestures on touchscreens for undo and redo.",
          control: { type: "toggle", key: "twoFingerTapUndoRedo" }
        },
        {
          name: "Palm rejection delay (ms)",
          desc: "Time window after stylus input during which stray finger touches are ignored (0 to 1000).",
          control: { type: "slider", key: "palmRejectionDelayMs", min: 0, max: 1000, step: 50 }
        },
        {
          name: "Stylus side button",
          desc: STYLUS_BUTTON_DESC,
          control: { type: "dropdown", key: "stylusButtonAction", options: STYLUS_BUTTON_OPTIONS }
        }
      ]
    };

    const toolbarGroup: SettingDefinitionGroup = {
      type: "group",
      heading: "Toolbar and workspace",
      items: [
        {
          name: "Toolbar placement",
          desc: "Anchor position of the floating toolbar dock inside the notebook view.",
          control: { type: "dropdown", key: "toolbarPlacement", options: TOOLBAR_PLACEMENT_OPTIONS }
        },
        {
          name: "Toolbar scale",
          desc: "Adjust overall size of floating toolbar buttons, icons, and spacing (70% to 150%).",
          control: { type: "slider", key: "toolbarScale", min: 0.7, max: 1.5, step: 0.05 }
        },
        {
          name: "Dim toolbar while drawing",
          desc: "Reduce floating toolbar opacity during active pen strokes so it stays out of the way.",
          control: { type: "toggle", key: "toolbarDimWhileDrawing" }
        },
        {
          name: "Auto-wrap toolbar buttons",
          desc: "Automatically wrap toolbar buttons onto multiple rows when space is narrow or resized.",
          control: { type: "toggle", key: "toolbarWrap" }
        },
        {
          name: "Toolbar maximum width (px)",
          desc: "Optional max width in pixels (200 to 1600). Leave empty for automatic width.",
          control: { type: "text", key: "toolbarMaxWidth" }
        },
        {
          name: "Show notebook title on toolbar",
          desc: "Display the clickable notebook title pill on the floating dock.",
          control: { type: "toggle", key: "toolbarShowTitle" }
        },
        {
          name: "Show zoom controls on toolbar",
          desc: "Display zoom stepper buttons and percentage pill on the floating dock.",
          control: { type: "toggle", key: "toolbarShowZoomControls" }
        },
        {
          name: "Autosave interval (ms)",
          desc: "Debounce delay in milliseconds before saving changes to disk.",
          control: { type: "number", key: "autosaveIntervalMs", min: 300 }
        },
        {
          name: "Reset toolbar layout",
          desc: "Restore default toolbar scale, width, wrapping, dimming, and position.",
          action: () => {
            void this.resetToolbarLayout(true);
          }
        },
        {
          name: "Reset pen presets",
          desc: "Restore the quick pen preset slots on the drawing sub-dock to their defaults.",
          action: () => {
            void this.resetPenPresets();
          }
        }
      ]
    };

    const hotkeySubpageItems: SettingDefinitionItem[] = [
      {
        type: "group",
        heading: "Hotkey actions",
        items: [
          {
            name: "Reset all hotkeys",
            desc: "Restore every keyboard shortcut back to its built-in default.",
            action: () => {
              void this.resetAllHotkeys(true);
            }
          }
        ]
      },
      ...this.buildHotkeyCategoryGroups(true)
    ];

    const hotkeysGroup: SettingDefinitionGroup = {
      type: "group",
      heading: "Shortcuts",
      items: [
        {
          type: "page",
          name: "Hotkeys",
          desc: "Customize keyboard shortcuts for tools, editing, and canvas navigation.",
          displayValue: () => {
            const count = countCustomizedHotkeys(this.plugin.settings.customHotkeys);
            return count > 0 ? `${count} customized` : "Default";
          },
          items: hotkeySubpageItems
        }
      ]
    };

    const communityGroup: SettingDefinitionGroup = {
      type: "group",
      heading: "Community and feedback",
      items: [
        {
          name: "Submit feedback",
          desc: "Share your feedback, ratings, or feature requests to help improve the plugin.",
          action: () => {
            const url = this.plugin.settings.feedbackUrl || "https://github.com/0xKurian/Obsinotes/issues/new/choose";
            window.open(url, "_blank");
          }
        },
        {
          name: "Custom feedback form URL",
          desc: "Optional URL for user feedback. If blank, GitHub issues is opened.",
          control: { type: "text", key: "feedbackUrl" }
        },
        {
          name: "Report an issue",
          desc: "Encountered a bug or unexpected behavior? Submit an issue on GitHub.",
          action: () => {
            window.open("https://github.com/0xKurian/Obsinotes/issues/new", "_blank");
          }
        },
        {
          name: "GitHub discussions",
          desc: "Join discussions, ask questions, or see what others are creating.",
          action: () => {
            window.open("https://github.com/0xKurian/Obsinotes/discussions", "_blank");
          }
        },
        {
          name: "Reset all settings to defaults",
          desc: "Restore all paper, drawing, toolbar, and hotkey settings to their defaults.",
          action: () => {
            void this.resetAllSettings(true);
          }
        }
      ]
    };

    return [paperGroup, drawingGroup, toolbarGroup, hotkeysGroup, communityGroup];
  }

  private buildHotkeyCategoryGroups(useDefinitionUpdate: boolean): SettingDefinitionGroup[] {
    const categories: HotkeyCategory[] = ["tools", "editing", "canvas"];
    return categories.map((category) => {
      const items: SettingGroupItem[] = HOTKEY_ACTION_METADATA
        .filter((meta) => meta.category === category)
        .map((meta): SettingDefinition => ({
          name: meta.label,
          desc: `Default: ${formatHotkeyBinding(meta.defaultBinding)}`,
          aliases: [formatHotkeyBinding(meta.defaultBinding), HOTKEY_CATEGORY_TITLES[category]],
          render: (setting) => this.renderHotkeySettingRow(setting, meta, useDefinitionUpdate)
        }));

      return {
        type: "group",
        heading: HOTKEY_CATEGORY_TITLES[category],
        items
      };
    });
  }

  override getControlValue(key: string): unknown {
    const settings = this.plugin.settings as unknown as Record<string, unknown>;
    if (key === "toolbarMaxWidth") {
      const v = settings[key];
      return typeof v === "number" && Number.isFinite(v) ? String(v) : "";
    }
    return settings[key];
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    const settings = this.plugin.settings as unknown as Record<string, unknown>;
    if (key === "autosaveIntervalMs") {
      const parsed = this.parseFiniteNumber(value);
      if (parsed !== null && parsed >= 300) {
        settings[key] = Math.round(parsed);
        await this.plugin.saveSettings();
      }
      return;
    }
    if (key === "defaultLineSpacing") {
      const parsed = this.parseFiniteNumber(value);
      if (parsed !== null && parsed >= 12 && parsed <= 64) {
        settings[key] = Math.round(parsed);
        await this.plugin.saveSettings();
      }
      return;
    }
    if (key === "defaultPenWidth") {
      const parsed = this.parseFiniteNumber(value);
      if (parsed !== null) {
        settings[key] = Math.round(Math.min(15, Math.max(0.5, parsed)) * 10) / 10;
        await this.plugin.saveSettings();
      }
      return;
    }
    if (key === "defaultHighlighterWidth") {
      const parsed = this.parseFiniteNumber(value);
      if (parsed !== null) {
        settings[key] = Math.round(Math.min(36, Math.max(4, parsed)));
        await this.plugin.saveSettings();
      }
      return;
    }
    if (key === "defaultEraserRadius") {
      const parsed = this.parseFiniteNumber(value);
      if (parsed !== null) {
        settings[key] = Math.round(Math.min(50, Math.max(4, parsed)));
        await this.plugin.saveSettings();
      }
      return;
    }
    if (key === "palmRejectionDelayMs") {
      const parsed = this.parseFiniteNumber(value);
      if (parsed !== null) {
        settings[key] = Math.round(Math.min(1000, Math.max(0, parsed)));
        await this.plugin.saveSettings();
      }
      return;
    }
    if (key === "toolbarScale") {
      const parsed = this.parseFiniteNumber(value);
      if (parsed !== null) {
        settings[key] = Math.round(Math.min(1.5, Math.max(0.7, parsed)) * 100) / 100;
        await this.plugin.saveSettings();
      }
      return;
    }
    if (key === "toolbarMaxWidth") {
      const raw = typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
      if (!raw) {
        settings[key] = null;
        await this.plugin.saveSettings();
        return;
      }
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed >= 200) {
        settings[key] = Math.min(1600, Math.round(parsed));
        await this.plugin.saveSettings();
      }
      return;
    }
    if (key === "defaultPageSize") {
      if (typeof value === "string" && Object.prototype.hasOwnProperty.call(PAGE_SIZE_OPTIONS, value)) {
        settings[key] = value;
        await this.plugin.saveSettings();
      }
      return;
    }
    if (key === "defaultOrientation") {
      if (value === "portrait" || value === "landscape") {
        settings[key] = value;
        await this.plugin.saveSettings();
      }
      return;
    }
    if (key === "defaultTemplate") {
      if (typeof value === "string" && Object.prototype.hasOwnProperty.call(TEMPLATE_OPTIONS, value)) {
        settings[key] = value;
        await this.plugin.saveSettings();
      }
      return;
    }
    if (key === "defaultTool") {
      if (typeof value === "string" && Object.prototype.hasOwnProperty.call(DEFAULT_TOOL_OPTIONS, value)) {
        settings[key] = value;
        await this.plugin.saveSettings();
      }
      return;
    }
    if (key === "defaultEraserMode") {
      if (value === "stroke" || value === "precision") {
        settings[key] = value;
        await this.plugin.saveSettings();
      }
      return;
    }
    if (key === "toolbarPlacement") {
      if (typeof value === "string" && Object.prototype.hasOwnProperty.call(TOOLBAR_PLACEMENT_OPTIONS, value)) {
        settings[key] = value;
        await this.plugin.saveSettings();
      }
      return;
    }
    if (key === "stylusButtonAction") {
      if (value === "hold" || value === "toggle" || value === "off") {
        settings[key] = value;
        await this.plugin.saveSettings();
      }
      return;
    }
    if (key === "feedbackUrl") {
      settings[key] = typeof value === "string" ? value.trim() : "";
      await this.plugin.saveSettings();
      return;
    }
    settings[key] = value;
    await this.plugin.saveSettings();
  }

  private parseFiniteNumber(value: unknown): number | null {
    const parsed = typeof value === "number"
      ? value
      : typeof value === "string"
        ? parseFloat(value)
        : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  }

  private async resetToolbarLayout(useDefinitionUpdate: boolean): Promise<void> {
    this.plugin.settings.toolbarScale = DEFAULT_SETTINGS.toolbarScale;
    this.plugin.settings.toolbarMaxWidth = DEFAULT_SETTINGS.toolbarMaxWidth;
    this.plugin.settings.toolbarWrap = DEFAULT_SETTINGS.toolbarWrap;
    this.plugin.settings.toolbarShowTitle = DEFAULT_SETTINGS.toolbarShowTitle;
    this.plugin.settings.toolbarShowZoomControls = DEFAULT_SETTINGS.toolbarShowZoomControls;
    this.plugin.settings.toolbarDimWhileDrawing = DEFAULT_SETTINGS.toolbarDimWhileDrawing;
    this.plugin.settings.toolbarPlacement = DEFAULT_SETTINGS.toolbarPlacement;
    this.plugin.settings.toolbarFloatingPos = DEFAULT_SETTINGS.toolbarFloatingPos;
    await this.plugin.saveSettings();
    new Notice("Toolbar layout reset to defaults");
    if (!useDefinitionUpdate) {
      this.renderLegacyDisplay();
    }
  }

  private async resetAllHotkeys(useDefinitionUpdate: boolean): Promise<void> {
    this.plugin.settings.customHotkeys = {};
    await this.plugin.saveSettings();
    new Notice("All hotkeys reset to defaults");
    this.syncAllHotkeyRows();
    if (!useDefinitionUpdate) {
      this.renderLegacyDisplay();
    }
  }

  private async resetPenPresets(): Promise<void> {
    this.plugin.settings.penPresets = createDefaultPenPresets();
    await this.plugin.saveSettings();
    new Notice("Quick pen presets reset to defaults");
  }

  private async resetAllSettings(useDefinitionUpdate: boolean): Promise<void> {
    this.plugin.settings = {
      ...DEFAULT_SETTINGS,
      penPresets: createDefaultPenPresets(),
      customHotkeys: {}
    };
    await this.plugin.saveSettings();
    new Notice("All settings reset to defaults");
    this.syncAllHotkeyRows();
    if (!useDefinitionUpdate) {
      this.renderLegacyDisplay();
    }
  }

  private syncAllHotkeyRows(): void {
    this.hotkeyRowSyncCallbacks.forEach((cb) => cb());
  }

  private renderHotkeySettingRow(
    setting: Setting,
    meta: HotkeyActionMetadata,
    useDefinitionUpdate: boolean
  ): () => void {
    const rowControls = setting.controlEl.createDiv({ cls: "notepages-hotkey-controls" });
    const pillEl = rowControls.createSpan({ cls: "notepages-hotkey-pill" });
    const setBtn = rowControls.createEl("button", { cls: "notepages-hotkey-btn", text: "Set" });
    setBtn.setAttribute("type", "button");
    const clearBtn = rowControls.createEl("button", { cls: "notepages-hotkey-btn", text: "Clear" });
    clearBtn.setAttribute("type", "button");
    const resetBtn = rowControls.createEl("button", { cls: "notepages-hotkey-btn", text: "Reset" });
    resetBtn.setAttribute("type", "button");

    const syncRowState = () => {
      const customHotkeys = this.plugin.settings.customHotkeys;
      const currentBinding = resolveHotkeyBinding(meta.id, customHotkeys);
      const conflicts = findHotkeyConflicts(meta.id, currentBinding, customHotkeys);
      const isDefault = areHotkeyBindingsEqual(currentBinding, meta.defaultBinding);

      pillEl.setText(formatHotkeyBinding(currentBinding));
      pillEl.toggleClass("is-disabled", currentBinding === null);
      pillEl.toggleClass("is-conflict", currentBinding !== null && conflicts.length > 0);
      if (currentBinding !== null && conflicts.length > 0) {
        const conflictNames = conflicts.map((id) => getHotkeyMetadata(id)?.label ?? id).join(", ");
        pillEl.setAttribute("title", `Conflicts with: ${conflictNames}`);
      } else {
        pillEl.removeAttribute("title");
      }
      clearBtn.disabled = currentBinding === null;
      resetBtn.disabled = isDefault;
    };

    syncRowState();
    this.hotkeyRowSyncCallbacks.add(syncRowState);

    let activeKeyListener: ((ev: KeyboardEvent) => void) | null = null;
    const stopRecording = () => {
      if (activeKeyListener && typeof window !== "undefined") {
        window.removeEventListener("keydown", activeKeyListener, true);
        activeKeyListener = null;
      }
      pillEl.removeClass("is-recording");
      setBtn.setText("Set");
    };

    const refreshRows = () => {
      this.syncAllHotkeyRows();
      if (!useDefinitionUpdate) {
        this.renderLegacyDisplay();
      }
    };

    setBtn.addEventListener("click", () => {
      if (activeKeyListener) {
        stopRecording();
        syncRowState();
        return;
      }
      pillEl.addClass("is-recording");
      pillEl.setText("Press key...");
      setBtn.setText("Cancel");

      activeKeyListener = (ev: KeyboardEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.key === "Escape") {
          stopRecording();
          syncRowState();
          return;
        }
        const binding = normalizeKeyboardEventToBinding(ev);
        if (!binding) {
          return;
        }
        stopRecording();
        const nextHotkeys = { ...(this.plugin.settings.customHotkeys ?? {}) };
        if (areHotkeyBindingsEqual(binding, meta.defaultBinding)) {
          delete nextHotkeys[meta.id];
        } else {
          nextHotkeys[meta.id] = binding;
        }
        this.plugin.settings.customHotkeys = nextHotkeys;
        const foundConflicts = findHotkeyConflicts(meta.id, binding, nextHotkeys);
        if (foundConflicts.length > 0) {
          const names = foundConflicts.map((id) => getHotkeyMetadata(id)?.label ?? id).join(", ");
          new Notice(`Shortcut ${formatHotkeyBinding(binding)} also assigned to: ${names}`);
        }
        void this.plugin.saveSettings().then(() => refreshRows());
      };

      window.addEventListener("keydown", activeKeyListener, true);
    });

    clearBtn.addEventListener("click", () => {
      stopRecording();
      const nextHotkeys = {
        ...(this.plugin.settings.customHotkeys ?? {}),
        [meta.id]: null
      };
      this.plugin.settings.customHotkeys = nextHotkeys;
      void this.plugin.saveSettings().then(() => refreshRows());
    });

    resetBtn.addEventListener("click", () => {
      stopRecording();
      const nextHotkeys = { ...(this.plugin.settings.customHotkeys ?? {}) };
      delete nextHotkeys[meta.id];
      this.plugin.settings.customHotkeys = nextHotkeys;
      void this.plugin.saveSettings().then(() => refreshRows());
    });

    return () => {
      stopRecording();
      this.hotkeyRowSyncCallbacks.delete(syncRowState);
    };
  }

  display(): void {
    this.renderLegacyDisplay();
  }

  private renderLegacyDisplay(): void {
    const { containerEl } = this;
    containerEl.empty();
    this.hotkeyRowSyncCallbacks.clear();

    new Setting(containerEl).setName("Paper and notebook defaults").setHeading();

    new Setting(containerEl)
      .setName("Default page size")
      .setDesc("Choose the default paper size for newly created notebooks and pages.")
      .addDropdown((dropdown) => {
        Object.entries(PAGE_SIZE_OPTIONS).forEach(([val, label]) => {
          dropdown.addOption(val, label);
        });
        dropdown
          .setValue(this.plugin.settings.defaultPageSize)
          .onChange(async (value) => {
            await this.setControlValue("defaultPageSize", value);
          });
      });

    new Setting(containerEl)
      .setName("Default page orientation")
      .setDesc("Orientation applied to new pages.")
      .addDropdown((dropdown) => {
        Object.entries(ORIENTATION_OPTIONS).forEach(([val, label]) => {
          dropdown.addOption(val, label);
        });
        dropdown
          .setValue(this.plugin.settings.defaultOrientation)
          .onChange(async (value) => {
            await this.setControlValue("defaultOrientation", value);
          });
      });

    new Setting(containerEl)
      .setName("Default paper template")
      .setDesc("Template pattern rendered on new pages.")
      .addDropdown((dropdown) => {
        Object.entries(TEMPLATE_OPTIONS).forEach(([val, label]) => {
          dropdown.addOption(val, label);
        });
        dropdown
          .setValue(this.plugin.settings.defaultTemplate)
          .onChange(async (value) => {
            await this.setControlValue("defaultTemplate", value);
          });
      });

    new Setting(containerEl)
      .setName("Default paper background")
      .setDesc("Background color applied to newly created notebook pages.")
      .addColorPicker((picker) => {
        picker
          .setValue(this.plugin.settings.defaultPaperBackground)
          .onChange(async (value) => {
            await this.setControlValue("defaultPaperBackground", value);
          });
      });

    new Setting(containerEl)
      .setName("Default line color")
      .setDesc("Color applied to paper template rule lines and grids.")
      .addColorPicker((picker) => {
        picker
          .setValue(this.plugin.settings.defaultLineColor)
          .onChange(async (value) => {
            await this.setControlValue("defaultLineColor", value);
          });
      });

    new Setting(containerEl)
      .setName("Default line spacing (pt)")
      .setDesc("Distance in points between ruled lines, grid cells, or dots (12 to 64).")
      .addText((text) => {
        text
          .setValue(String(this.plugin.settings.defaultLineSpacing))
          .onChange(async (value) => {
            await this.setControlValue("defaultLineSpacing", value);
          });
      });

    new Setting(containerEl).setName("Drawing, stylus and touch").setHeading();

    new Setting(containerEl)
      .setName("Default tool")
      .setDesc("Tool selected automatically when opening a notebook.")
      .addDropdown((dropdown) => {
        Object.entries(DEFAULT_TOOL_OPTIONS).forEach(([val, label]) => {
          dropdown.addOption(val, label);
        });
        dropdown
          .setValue(this.plugin.settings.defaultTool ?? "pressure")
          .onChange(async (value) => {
            await this.setControlValue("defaultTool", value);
          });
      });

    new Setting(containerEl)
      .setName("Default pen color")
      .setDesc("Initial ink color selected when opening a notebook.")
      .addColorPicker((picker) => {
        picker
          .setValue(this.plugin.settings.defaultPenColor ?? "#1e293b")
          .onChange(async (value) => {
            await this.setControlValue("defaultPenColor", value);
          });
      });

    new Setting(containerEl)
      .setName("Default pen width (pt)")
      .setDesc("Initial pen stroke width when opening a notebook (0.5 to 15).")
      .addSlider((slider) => {
        slider
          .setLimits(0.5, 15, 0.5)
          .setValue(this.plugin.settings.defaultPenWidth ?? 2.5)
          .onChange(async (value) => {
            await this.setControlValue("defaultPenWidth", value);
          });
      });

    new Setting(containerEl)
      .setName("Default highlighter width (pt)")
      .setDesc("Initial highlighter width when opening a notebook (4 to 36).")
      .addSlider((slider) => {
        slider
          .setLimits(4, 36, 1)
          .setValue(this.plugin.settings.defaultHighlighterWidth ?? 14)
          .onChange(async (value) => {
            await this.setControlValue("defaultHighlighterWidth", value);
          });
      });

    new Setting(containerEl)
      .setName("Default eraser mode")
      .setDesc("Choose whether the eraser removes whole strokes or trims exact contact points.")
      .addDropdown((dropdown) => {
        Object.entries(ERASER_MODE_OPTIONS).forEach(([val, label]) => {
          dropdown.addOption(val, label);
        });
        dropdown
          .setValue(this.plugin.settings.defaultEraserMode ?? "stroke")
          .onChange(async (value) => {
            await this.setControlValue("defaultEraserMode", value);
          });
      });

    new Setting(containerEl)
      .setName("Default eraser size (px)")
      .setDesc("Initial eraser radius in points (4 to 50).")
      .addSlider((slider) => {
        slider
          .setLimits(4, 50, 2)
          .setValue(this.plugin.settings.defaultEraserRadius ?? 12)
          .onChange(async (value) => {
            await this.setControlValue("defaultEraserRadius", value);
          });
      });

    new Setting(containerEl)
      .setName("Auto-recognize shapes")
      .setDesc("Hold briefly at the end of a stroke to snap lines, circles, rectangles, and triangles.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.shapeRecognitionEnabled ?? true)
          .onChange(async (value) => {
            await this.setControlValue("shapeRecognitionEnabled", value);
          });
      });

    new Setting(containerEl)
      .setName("Show pen nib hover preview")
      .setDesc("Display a size and color preview ring beneath the pointer or hovering stylus.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.showPenHoverCursor ?? true)
          .onChange(async (value) => {
            await this.setControlValue("showPenHoverCursor", value);
          });
      });

    new Setting(containerEl)
      .setName("Draw with finger")
      .setDesc("Allow drawing with finger touch on touchscreens instead of only panning and zooming.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.drawWithFinger)
          .onChange(async (value) => {
            await this.setControlValue("drawWithFinger", value);
          });
      });

    new Setting(containerEl)
      .setName("Two-finger tap undo and three-finger tap redo")
      .setDesc("Use quick two-finger and three-finger tap gestures on touchscreens for undo and redo.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.twoFingerTapUndoRedo ?? true)
          .onChange(async (value) => {
            await this.setControlValue("twoFingerTapUndoRedo", value);
          });
      });

    new Setting(containerEl)
      .setName("Palm rejection delay (ms)")
      .setDesc("Time window after stylus input during which stray finger touches are ignored (0 to 1000).")
      .addSlider((slider) => {
        slider
          .setLimits(0, 1000, 50)
          .setValue(this.plugin.settings.palmRejectionDelayMs ?? 350)
          .onChange(async (value) => {
            await this.setControlValue("palmRejectionDelayMs", value);
          });
      });

    new Setting(containerEl)
      .setName("Stylus side button")
      .setDesc(STYLUS_BUTTON_DESC)
      .addDropdown((dropdown) => {
        Object.entries(STYLUS_BUTTON_OPTIONS).forEach(([val, label]) => {
          dropdown.addOption(val, label);
        });
        dropdown
          .setValue(this.plugin.settings.stylusButtonAction ?? "hold")
          .onChange(async (value) => {
            await this.setControlValue("stylusButtonAction", value);
          });
      });

    new Setting(containerEl).setName("Toolbar and workspace").setHeading();

    new Setting(containerEl)
      .setName("Toolbar placement")
      .setDesc("Anchor position of the floating toolbar dock inside the notebook view.")
      .addDropdown((dropdown) => {
        Object.entries(TOOLBAR_PLACEMENT_OPTIONS).forEach(([val, label]) => {
          dropdown.addOption(val, label);
        });
        dropdown
          .setValue(this.plugin.settings.toolbarPlacement ?? "top")
          .onChange(async (value) => {
            await this.setControlValue("toolbarPlacement", value);
          });
      });

    new Setting(containerEl)
      .setName("Toolbar scale")
      .setDesc("Adjust overall size of floating toolbar buttons, icons, and spacing (70% to 150%).")
      .addSlider((slider) => {
        slider
          .setLimits(0.7, 1.5, 0.05)
          .setValue(this.plugin.settings.toolbarScale ?? 1.0)
          .onChange(async (value) => {
            await this.setControlValue("toolbarScale", value);
          });
      });

    new Setting(containerEl)
      .setName("Dim toolbar while drawing")
      .setDesc("Reduce floating toolbar opacity during active pen strokes so it stays out of the way.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.toolbarDimWhileDrawing ?? true)
          .onChange(async (value) => {
            await this.setControlValue("toolbarDimWhileDrawing", value);
          });
      });

    new Setting(containerEl)
      .setName("Auto-wrap toolbar buttons")
      .setDesc("Automatically wrap toolbar buttons onto multiple rows when space is narrow or resized.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.toolbarWrap ?? false)
          .onChange(async (value) => {
            await this.setControlValue("toolbarWrap", value);
          });
      });

    new Setting(containerEl)
      .setName("Toolbar maximum width (px)")
      .setDesc("Optional max width in pixels (200 to 1600). Leave empty for automatic width.")
      .addText((text) => {
        text
          .setPlaceholder("Auto")
          .setValue(this.plugin.settings.toolbarMaxWidth ? String(this.plugin.settings.toolbarMaxWidth) : "")
          .onChange(async (value) => {
            await this.setControlValue("toolbarMaxWidth", value);
          });
      });

    new Setting(containerEl)
      .setName("Show notebook title on toolbar")
      .setDesc("Display the clickable notebook title pill on the floating dock.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.toolbarShowTitle ?? true)
          .onChange(async (value) => {
            await this.setControlValue("toolbarShowTitle", value);
          });
      });

    new Setting(containerEl)
      .setName("Show zoom controls on toolbar")
      .setDesc("Display zoom stepper buttons and percentage pill on the floating dock.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.toolbarShowZoomControls ?? true)
          .onChange(async (value) => {
            await this.setControlValue("toolbarShowZoomControls", value);
          });
      });

    new Setting(containerEl)
      .setName("Autosave interval (ms)")
      .setDesc("Debounce delay in milliseconds before saving changes to disk.")
      .addText((text) => {
        text
          .setValue(String(this.plugin.settings.autosaveIntervalMs))
          .onChange(async (value) => {
            await this.setControlValue("autosaveIntervalMs", value);
          });
      });

    new Setting(containerEl)
      .setName("Reset pen presets")
      .setDesc("Restore the quick pen preset slots on the drawing sub-dock to their defaults.")
      .addButton((button) => {
        button
          .setButtonText("Reset presets")
          .onClick(() => {
            void this.resetPenPresets();
          });
      });

    new Setting(containerEl)
      .setName("Reset toolbar layout")
      .setDesc("Restore default toolbar scale, width, wrapping, dimming, and position.")
      .addButton((button) => {
        button
          .setButtonText("Reset defaults")
          .onClick(() => {
            void this.resetToolbarLayout(false);
          });
      });

    new Setting(containerEl).setName("Hotkeys").setHeading();

    new Setting(containerEl)
      .setName("Filter hotkeys")
      .setDesc("Search actions by name or default key.")
      .addText((text) => {
        text
          .setPlaceholder("Filter actions...")
          .setValue(this.hotkeyFilterQuery)
          .onChange((value) => {
            this.hotkeyFilterQuery = value;
            this.renderLegacyDisplay();
          });
      })
      .addButton((button) => {
        button
          .setButtonText("Reset all hotkeys")
          .onClick(() => {
            void this.resetAllHotkeys(false);
          });
      });

    const query = this.hotkeyFilterQuery.trim().toLowerCase();
    const categories: HotkeyCategory[] = ["tools", "editing", "canvas"];
    for (const category of categories) {
      const matching = HOTKEY_ACTION_METADATA.filter((meta) => {
        if (meta.category !== category) {
          return false;
        }
        if (!query) {
          return true;
        }
        const current = formatHotkeyBinding(resolveHotkeyBinding(meta.id, this.plugin.settings.customHotkeys)).toLowerCase();
        const def = formatHotkeyBinding(meta.defaultBinding).toLowerCase();
        return meta.label.toLowerCase().includes(query) || current.includes(query) || def.includes(query);
      });
      if (matching.length === 0) {
        continue;
      }
      new Setting(containerEl).setName(HOTKEY_CATEGORY_TITLES[category]).setHeading();
      for (const meta of matching) {
        const row = new Setting(containerEl)
          .setName(meta.label)
          .setDesc(`Default: ${formatHotkeyBinding(meta.defaultBinding)}`);
        this.renderHotkeySettingRow(row, meta, false);
      }
    }

    new Setting(containerEl).setName("Community and feedback").setHeading();

    new Setting(containerEl)
      .setName("Submit feedback")
      .setDesc("Share your feedback, ratings, or feature requests to help improve the plugin.")
      .addButton((button) => {
        button
          .setButtonText("Open feedback form")
          .setCta()
          .onClick(() => {
            const url = this.plugin.settings.feedbackUrl || "https://github.com/0xKurian/Obsinotes/issues/new/choose";
            window.open(url, "_blank");
          });
      });

    new Setting(containerEl)
      .setName("Custom feedback form URL")
      .setDesc("Optional URL for user feedback. If blank, GitHub issues is opened.")
      .addText((text) => {
        text
          .setPlaceholder("Enter form URL...")
          .setValue(this.plugin.settings.feedbackUrl || "")
          .onChange(async (value) => {
            await this.setControlValue("feedbackUrl", value);
          });
      });

    new Setting(containerEl)
      .setName("Report an issue")
      .setDesc("Encountered a bug or unexpected behavior? Submit an issue on GitHub.")
      .addButton((button) => {
        button
          .setButtonText("Report bug")
          .onClick(() => {
            window.open("https://github.com/0xKurian/Obsinotes/issues/new", "_blank");
          });
      });

    new Setting(containerEl)
      .setName("GitHub discussions")
      .setDesc("Join discussions, ask questions, or see what others are creating.")
      .addButton((button) => {
        button
          .setButtonText("Visit discussions")
          .onClick(() => {
            window.open("https://github.com/0xKurian/Obsinotes/discussions", "_blank");
          });
      });

    new Setting(containerEl)
      .setName("Reset all settings to defaults")
      .setDesc("Restore all paper, drawing, toolbar, and hotkey settings to their defaults.")
      .addButton((button) => {
        button.buttonEl.addClass("mod-warning");
        button
          .setButtonText("Reset all settings")
          .onClick(() => {
            void this.resetAllSettings(false);
          });
      });
  }
}
