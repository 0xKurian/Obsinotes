import { App, PluginSettingTab, Setting } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
import type NotePagesPlugin from "../main";
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
        name: "Default line color",
        desc: "Color applied to paper template rule lines and grids.",
        control: {
          type: "color",
          key: "defaultLineColor",
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
    ];
  }

  override getControlValue(key: string): unknown {
    const settings = this.plugin.settings as unknown as Record<string, unknown>;
    return settings[key];
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    const settings = this.plugin.settings as unknown as Record<string, unknown>;
    if (key === "autosaveIntervalMs") {
      const parsed = typeof value === "number" ? value : parseInt(String(value), 10);
      if (!isNaN(parsed) && parsed >= 300) {
        settings[key] = parsed;
        await this.plugin.saveSettings();
      }
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
  }
}
