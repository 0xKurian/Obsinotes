import { App, PluginSettingTab, Setting, SliderComponent, TextComponent, ToggleComponent } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
import type NotePagesPlugin from "../main";
import { DEFAULT_SETTINGS } from "./NotePagesSettings";
import { PageSizePreset, PageOrientation, PaperTemplateType } from "../types";

export class NotePagesSettingTab extends PluginSettingTab {
  plugin: NotePagesPlugin;

  constructor(app: App, plugin: NotePagesPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  override getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: "Default page size",
        desc: "Choose the default paper size for newly created notebooks and pages.",
        control: {
          type: "dropdown",
          key: "defaultPageSize",
          options: {
            A4: "A4 (210 X 297 mm)",
            Letter: "US Letter (8.5 x 11 in)",
          },
        },
      },
      {
        name: "Default page orientation",
        desc: "Orientation applied to new pages.",
        control: {
          type: "dropdown",
          key: "defaultOrientation",
          options: {
            portrait: "Portrait (vertical)",
            landscape: "Landscape (horizontal)",
          },
        },
      },
      {
        name: "Default paper template",
        desc: "Template pattern rendered on new pages.",
        control: {
          type: "dropdown",
          key: "defaultTemplate",
          options: {
            blank: "Blank",
            ruled: "Ruled (lined)",
            grid: "Grid",
            dotted: "Dotted",
            cornell: "Cornell note",
          },
        },
      },
      {
        name: "Default paper background",
        desc: "Background color applied to newly created notebook pages.",
        control: {
          type: "color",
          key: "defaultPaperBackground",
        },
      },
      {
        name: "Default line color",
        desc: "Color applied to paper template rule lines and grids.",
        control: {
          type: "color",
          key: "defaultLineColor",
        },
      },
      {
        name: "Default line spacing (pt)",
        desc: "Distance in points between ruled lines, grid cells, or dots (12 to 64).",
        control: {
          type: "number",
          key: "defaultLineSpacing",
          min: 12,
          max: 64,
        },
      },
      {
        name: "Draw with finger",
        desc: "Allow drawing with finger touch on touchscreens instead of only panning and zooming.",
        control: {
          type: "toggle",
          key: "drawWithFinger",
        },
      },
      {
        name: "Autosave interval (ms)",
        desc: "Debounce delay in milliseconds before saving changes to disk.",
        control: {
          type: "number",
          key: "autosaveIntervalMs",
          min: 300,
        },
      },
      {
        name: "Toolbar scale",
        desc: "Adjust overall size of floating toolbar buttons, icons, and spacing (70% to 150%).",
        control: {
          type: "slider",
          key: "toolbarScale",
          min: 0.7,
          max: 1.5,
          step: 0.05,
        },
      },
      {
        name: "Auto-wrap toolbar buttons",
        desc: "Automatically wrap toolbar buttons onto multiple rows when space is narrow or resized.",
        control: {
          type: "toggle",
          key: "toolbarWrap",
        },
      },
      {
        name: "Toolbar maximum width (px)",
        desc: "Optional max width in pixels (200 to 1600). Leave empty for automatic width.",
        control: {
          type: "text",
          key: "toolbarMaxWidth",
        },
      },
      {
        name: "Show notebook title on toolbar",
        desc: "Display the clickable notebook title pill on the floating dock.",
        control: {
          type: "toggle",
          key: "toolbarShowTitle",
        },
      },
      {
        name: "Show zoom controls on toolbar",
        desc: "Display zoom stepper buttons and percentage pill on the floating dock.",
        control: {
          type: "toggle",
          key: "toolbarShowZoomControls",
        },
      },
      {
        name: "Custom feedback form URL",
        desc: "Optional URL for user feedback. If blank, GitHub issues is opened.",
        control: {
          type: "text",
          key: "feedbackUrl",
        },
      },
    ];
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
      const parsed = typeof value === "number" ? value : typeof value === "string" ? parseInt(value, 10) : NaN;
      if (!isNaN(parsed) && parsed >= 300) {
        settings[key] = parsed;
        await this.plugin.saveSettings();
      }
      return;
    }
    if (key === "defaultLineSpacing") {
      const parsed = typeof value === "number" ? value : typeof value === "string" ? parseInt(value, 10) : NaN;
      if (!isNaN(parsed) && parsed >= 12 && parsed <= 64) {
        settings[key] = parsed;
        await this.plugin.saveSettings();
      }
      return;
    }
    if (key === "toolbarScale") {
      const parsed = typeof value === "number" ? value : typeof value === "string" ? parseFloat(value) : NaN;
      if (!isNaN(parsed)) {
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
    if (key === "feedbackUrl") {
      settings[key] = typeof value === "string" ? value.trim() : "";
      await this.plugin.saveSettings();
      return;
    }
    settings[key] = value;
    await this.plugin.saveSettings();
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Default page size")
      .setDesc("Choose the default paper size for newly created notebooks and pages.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("A4", "A4 (210 X 297 mm)")
          .addOption("Letter", "US Letter (8.5 x 11 in)")
          .setValue(this.plugin.settings.defaultPageSize)
          .onChange(async (value) => {
            this.plugin.settings.defaultPageSize = value as PageSizePreset;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Default page orientation")
      .setDesc("Orientation applied to new pages.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("portrait", "Portrait (vertical)")
          .addOption("landscape", "Landscape (horizontal)")
          .setValue(this.plugin.settings.defaultOrientation)
          .onChange(async (value) => {
            this.plugin.settings.defaultOrientation = value as PageOrientation;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Default paper template")
      .setDesc("Template pattern rendered on new pages.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("blank", "Blank")
          .addOption("ruled", "Ruled (lined)")
          .addOption("grid", "Grid")
          .addOption("dotted", "Dotted")
          .addOption("cornell", "Cornell note")
          .setValue(this.plugin.settings.defaultTemplate)
          .onChange(async (value) => {
            this.plugin.settings.defaultTemplate = value as PaperTemplateType;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Default paper background")
      .setDesc("Background color applied to newly created notebook pages.")
      .addColorPicker((picker) => {
        picker
          .setValue(this.plugin.settings.defaultPaperBackground)
          .onChange(async (value) => {
            this.plugin.settings.defaultPaperBackground = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Default line color")
      .setDesc("Color applied to paper template rule lines and grids.")
      .addColorPicker((picker) => {
        picker
          .setValue(this.plugin.settings.defaultLineColor)
          .onChange(async (value) => {
            this.plugin.settings.defaultLineColor = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Default line spacing (pt)")
      .setDesc("Distance in points between ruled lines, grid cells, or dots (12 to 64).")
      .addText((text) => {
        text
          .setValue(String(this.plugin.settings.defaultLineSpacing))
          .onChange(async (value) => {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed) && parsed >= 12 && parsed <= 64) {
              this.plugin.settings.defaultLineSpacing = parsed;
              await this.plugin.saveSettings();
            }
          });
      });

    new Setting(containerEl)
      .setName("Draw with finger")
      .setDesc("Allow drawing with finger touch on touchscreens instead of only panning and zooming.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.drawWithFinger)
          .onChange(async (value) => {
            this.plugin.settings.drawWithFinger = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Autosave interval (ms)")
      .setDesc("Debounce delay in milliseconds before saving changes to disk.")
      .addText((text) => {
        text
          .setValue(String(this.plugin.settings.autosaveIntervalMs))
          .onChange(async (value) => {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed) && parsed >= 300) {
              this.plugin.settings.autosaveIntervalMs = parsed;
              await this.plugin.saveSettings();
            }
          });
      });

    new Setting(containerEl).setName("Toolbar size & layout").setHeading();

    let scaleSlider: SliderComponent | undefined;
    let wrapToggle: ToggleComponent | undefined;
    let maxWidthText: TextComponent | undefined;
    let showTitleToggle: ToggleComponent | undefined;
    let showZoomToggle: ToggleComponent | undefined;

    new Setting(containerEl)
      .setName("Toolbar scale")
      .setDesc("Adjust overall size of floating toolbar buttons, icons, and spacing (70% to 150%).")
      .addSlider((slider) => {
        scaleSlider = slider;
        slider
          .setLimits(0.7, 1.5, 0.05)
          .setValue(this.plugin.settings.toolbarScale ?? 1.0)
          .onChange(async (value) => {
            this.plugin.settings.toolbarScale = Math.round(value * 100) / 100;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Auto-wrap toolbar buttons")
      .setDesc("Automatically wrap toolbar buttons onto multiple rows when space is narrow or resized.")
      .addToggle((toggle) => {
        wrapToggle = toggle;
        toggle
          .setValue(this.plugin.settings.toolbarWrap ?? false)
          .onChange(async (value) => {
            this.plugin.settings.toolbarWrap = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Toolbar maximum width (px)")
      .setDesc("Optional max width in pixels (200 to 1600). Leave empty for automatic width.")
      .addText((text) => {
        maxWidthText = text;
        text
          .setPlaceholder("Auto")
          .setValue(this.plugin.settings.toolbarMaxWidth ? String(this.plugin.settings.toolbarMaxWidth) : "")
          .onChange(async (value) => {
            const raw = value.trim();
            if (!raw) {
              this.plugin.settings.toolbarMaxWidth = null;
              await this.plugin.saveSettings();
              return;
            }
            const parsed = parseInt(raw, 10);
            if (!isNaN(parsed) && parsed >= 200) {
              this.plugin.settings.toolbarMaxWidth = Math.min(1600, Math.round(parsed));
              await this.plugin.saveSettings();
            }
          });
      });

    new Setting(containerEl)
      .setName("Show notebook title on toolbar")
      .setDesc("Display the clickable notebook title pill on the floating dock.")
      .addToggle((toggle) => {
        showTitleToggle = toggle;
        toggle
          .setValue(this.plugin.settings.toolbarShowTitle ?? true)
          .onChange(async (value) => {
            this.plugin.settings.toolbarShowTitle = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Show zoom controls on toolbar")
      .setDesc("Display zoom stepper buttons and percentage pill on the floating dock.")
      .addToggle((toggle) => {
        showZoomToggle = toggle;
        toggle
          .setValue(this.plugin.settings.toolbarShowZoomControls ?? true)
          .onChange(async (value) => {
            this.plugin.settings.toolbarShowZoomControls = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Reset toolbar layout")
      .setDesc("Restore default toolbar scale, width, wrapping, and position.")
      .addButton((button) => {
        button
          .setButtonText("Reset defaults")
          .onClick(async () => {
            this.plugin.settings.toolbarScale = DEFAULT_SETTINGS.toolbarScale;
            this.plugin.settings.toolbarMaxWidth = DEFAULT_SETTINGS.toolbarMaxWidth;
            this.plugin.settings.toolbarWrap = DEFAULT_SETTINGS.toolbarWrap;
            this.plugin.settings.toolbarShowTitle = DEFAULT_SETTINGS.toolbarShowTitle;
            this.plugin.settings.toolbarShowZoomControls = DEFAULT_SETTINGS.toolbarShowZoomControls;
            this.plugin.settings.toolbarPlacement = DEFAULT_SETTINGS.toolbarPlacement;
            this.plugin.settings.toolbarFloatingPos = DEFAULT_SETTINGS.toolbarFloatingPos;
            await this.plugin.saveSettings();
            scaleSlider?.setValue(DEFAULT_SETTINGS.toolbarScale);
            wrapToggle?.setValue(DEFAULT_SETTINGS.toolbarWrap);
            maxWidthText?.setValue("");
            showTitleToggle?.setValue(DEFAULT_SETTINGS.toolbarShowTitle);
            showZoomToggle?.setValue(DEFAULT_SETTINGS.toolbarShowZoomControls);
          });
      });

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
      .setDesc("Optional URL to your feedback form. If blank, GitHub issues is opened.")
      .addText((text) => {
        text
          .setPlaceholder("Enter form URL...")
          .setValue(this.plugin.settings.feedbackUrl || "")
          .onChange(async (value) => {
            this.plugin.settings.feedbackUrl = value.trim();
            await this.plugin.saveSettings();
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
  }
}
