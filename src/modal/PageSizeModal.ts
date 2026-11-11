import { App, Modal, Setting } from "obsidian";
import {
  PageDimensions,
  PageOrientation,
  PageSizePreset,
  getEffectivePageDimensions
} from "../types";

export interface PageSizeModalResult {
  preset: PageSizePreset;
  dimensions: PageDimensions;
  orientation: PageOrientation;
  applyToAll: boolean;
}

export class PageSizeModal extends Modal {
  private currentPageNumber: number;
  private selectedPreset: PageSizePreset;
  private currentOrientation: PageOrientation;
  private customWidth: number;
  private customHeight: number;
  private applyToAll: boolean = false;
  private onSubmit: (result: PageSizeModalResult) => void;

  private widthSettingEl?: Setting;
  private heightSettingEl?: Setting;

  constructor(
    app: App,
    currentPageNumber: number,
    initialPreset: PageSizePreset,
    initialDimensions: PageDimensions,
    initialOrientation: PageOrientation,
    onSubmit: (result: PageSizeModalResult) => void
  ) {
    super(app);
    this.currentPageNumber = currentPageNumber;
    this.selectedPreset = initialPreset;
    this.currentOrientation = initialOrientation;
    this.customWidth = Math.round(initialDimensions.width);
    this.customHeight = Math.round(initialDimensions.height);
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("notepages-page-size-modal");

    contentEl.createEl("h3", { text: "Page size & layout" });

    new Setting(contentEl)
      .setName("Page size preset")
      .setDesc("Choose a standard paper size or custom.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("A4", "A4 (standard 210 × 297 mm)")
          .addOption("A3", "A3 (large mindmap 297 × 420 mm)")
          .addOption("A5", "A5 (pocket notebook 148 × 210 mm)")
          .addOption("B5", "B5 (standard notebook 176 × 250 mm)")
          .addOption("Letter", "Letter (US standard 8.5 × 11 in)")
          .addOption("16:9", "16:9 (slide presentation)")
          .addOption("Square", "Square (1:1 canvas 700 × 700 pt)")
          .addOption("Custom", "Custom dimensions (width × height)")
          .setValue(this.selectedPreset)
          .onChange((value) => {
            this.selectedPreset = value as PageSizePreset;
            if (this.selectedPreset !== "Custom") {
              const eff = getEffectivePageDimensions(this.selectedPreset, this.currentOrientation);
              this.customWidth = Math.round(eff.width);
              this.customHeight = Math.round(eff.height);
            }
            this.updateCustomInputs();
          });
      });

    new Setting(contentEl)
      .setName("Orientation")
      .setDesc("Select page orientation.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("portrait", "Portrait (vertical)")
          .addOption("landscape", "Landscape (horizontal)")
          .setValue(this.currentOrientation)
          .onChange((value) => {
            this.currentOrientation = value as PageOrientation;
            if (this.selectedPreset !== "Custom") {
              const eff = getEffectivePageDimensions(this.selectedPreset, this.currentOrientation);
              this.customWidth = Math.round(eff.width);
              this.customHeight = Math.round(eff.height);
            } else {
              const w = this.customWidth;
              const h = this.customHeight;
              this.customWidth = this.currentOrientation === "landscape" ? Math.max(w, h) : Math.min(w, h);
              this.customHeight = this.currentOrientation === "landscape" ? Math.min(w, h) : Math.max(w, h);
            }
            this.updateCustomInputs();
          });
      });

    this.widthSettingEl = new Setting(contentEl)
      .setName("Width (pt)")
      .setDesc("Page width in points (1 pt ≈ 0.353 mm).")
      .addText((text) => {
        text
          .setValue(String(this.customWidth))
          .setDisabled(this.selectedPreset !== "Custom")
          .onChange((val) => {
            const num = parseFloat(val);
            if (Number.isFinite(num) && num > 50) {
              this.customWidth = Math.round(num);
            }
          });
      });

    this.heightSettingEl = new Setting(contentEl)
      .setName("Height (pt)")
      .setDesc("Page height in points.")
      .addText((text) => {
        text
          .setValue(String(this.customHeight))
          .setDisabled(this.selectedPreset !== "Custom")
          .onChange((val) => {
            const num = parseFloat(val);
            if (Number.isFinite(num) && num > 50) {
              this.customHeight = Math.round(num);
            }
          });
      });

    new Setting(contentEl)
      .setName("Scope")
      .setDesc("Apply to the current page only or all pages in this notebook.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("current", `Current page only (Page ${this.currentPageNumber})`)
          .addOption("all", "All pages in this notebook")
          .setValue(this.applyToAll ? "all" : "current")
          .onChange((value) => {
            this.applyToAll = value === "all";
          });
      });

    const footer = contentEl.createDiv({ cls: "notepages-modal-footer" });
    const cancelBtn = footer.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());

    const submitBtn = footer.createEl("button", {
      text: "Apply size",
      cls: "mod-cta"
    });
    submitBtn.addEventListener("click", () => {
      let finalDimensions: PageDimensions;
      if (this.selectedPreset === "Custom") {
        finalDimensions = {
          width: Math.max(100, this.customWidth),
          height: Math.max(100, this.customHeight),
          unit: "pt"
        };
      } else {
        finalDimensions = getEffectivePageDimensions(this.selectedPreset, this.currentOrientation);
      }

      this.onSubmit({
        preset: this.selectedPreset,
        dimensions: finalDimensions,
        orientation: this.currentOrientation,
        applyToAll: this.applyToAll
      });
      this.close();
    });
  }

  private updateCustomInputs(): void {
    if (this.widthSettingEl) {
      const input = this.widthSettingEl.controlEl.querySelector<HTMLInputElement>("input");
      if (input) {
        input.value = String(this.customWidth);
        input.disabled = this.selectedPreset !== "Custom";
      }
    }
    if (this.heightSettingEl) {
      const input = this.heightSettingEl.controlEl.querySelector<HTMLInputElement>("input");
      if (input) {
        input.value = String(this.customHeight);
        input.disabled = this.selectedPreset !== "Custom";
      }
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
