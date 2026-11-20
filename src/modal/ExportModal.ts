import { App, Modal, Setting } from "obsidian";
import { ExportDestination, ExportFormat, ExportOptions, ExportPageRange } from "../export/ExportTypes";

export class ExportModal extends Modal {
  private totalPages: number;
  private currentPage: number;
  private onExport: (options: ExportOptions) => Promise<void> | void;
  private options: ExportOptions;

  constructor(
    app: App,
    totalPages: number,
    currentPage: number,
    onExport: (options: ExportOptions) => Promise<void> | void
  ) {
    super(app);
    this.totalPages = Math.max(1, totalPages);
    this.currentPage = Math.max(1, Math.min(currentPage, this.totalPages));
    this.onExport = onExport;
    this.options = {
      format: "pdf",
      pageRange: "all",
      customPageRange: `1-${this.totalPages}`,
      resolution: 2,
      includeBackgroundTemplate: true,
      includePdfBackground: true,
      destination: "vault"
    };
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("notepages-export-modal");

    contentEl.createEl("h3", { text: "Export notebook" });

    new Setting(contentEl)
      .setName("Export format")
      .setDesc("Choose the output format for your notebook.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("pdf", "PDF document (.PDF)")
          .addOption("png", "PNG image (.PNG)")
          .addOption("svg", "SVG vector (.SVG)")
          .setValue(this.options.format)
          .onChange((value) => {
            this.options.format = value as ExportFormat;
            this.updateVisibility();
          });
      });

    let customRangeSetting: Setting | null = null;

    new Setting(contentEl)
      .setName("Page range")
      .setDesc("Select which pages to export.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("all", `All pages (1 - ${this.totalPages})`)
          .addOption("current", `Current page (Page ${this.currentPage})`)
          .addOption("custom", "Custom page range")
          .setValue(this.options.pageRange)
          .onChange((value) => {
            this.options.pageRange = value as ExportPageRange;
            if (customRangeSetting) {
              customRangeSetting.settingEl.toggle(this.options.pageRange === "custom");
            }
            this.updateVisibility();
          });
      });

    customRangeSetting = new Setting(contentEl)
      .setName("Custom page numbers")
      .setDesc("Specify page numbers or ranges (e.g. 1-3, 5).")
      .addText((text) => {
        text
          .setPlaceholder(`1-${this.totalPages}`)
          .setValue(this.options.customPageRange || `1-${this.totalPages}`)
          .onChange((value) => {
            this.options.customPageRange = value;
            this.updateVisibility();
          });
      });
    customRangeSetting.settingEl.toggle(this.options.pageRange === "custom");

    const resolutionSetting = new Setting(contentEl)
      .setName("Export resolution")
      .setDesc("Image resolution for rasterized content.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("1", "Standard (72 dpi - 1x)")
          .addOption("2", "High quality (144 dpi - 2x)")
          .addOption("4.167", "Print quality (300 dpi - 4x)")
          .setValue(String(this.options.resolution))
          .onChange((value) => {
            this.options.resolution = parseFloat(value);
          });
      });

    new Setting(contentEl)
      .setName("Include paper template")
      .setDesc("Include background pattern (ruled lines, grid, dots, or cornell).")
      .addToggle((toggle) => {
        toggle
          .setValue(this.options.includeBackgroundTemplate)
          .onChange((value) => {
            this.options.includeBackgroundTemplate = value;
          });
      });

    new Setting(contentEl)
      .setName("Include PDF background")
      .setDesc("Preserve imported PDF or SVG background pages.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.options.includePdfBackground)
          .onChange((value) => {
            this.options.includePdfBackground = value;
          });
      });

    new Setting(contentEl)
      .setName("Destination")
      .setDesc("Save to Obsidian vault or download to computer.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("vault", "Save to Obsidian vault")
          .addOption("download", "Download to computer")
          .setValue(this.options.destination)
          .onChange((value) => {
            this.options.destination = value as ExportDestination;
          });
      });

    const errorEl = contentEl.createDiv({ cls: "notepages-page-size-error is-hidden" });

    const isCustomRangeValid = (): boolean => {
      if (this.options.pageRange !== "custom") return true;
      const raw = (this.options.customPageRange || "").trim();
      if (!raw) return false;
      const parts = raw.split(",");
      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) return false;
        const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(trimmed);
        if (!m) return false;
        const start = parseInt(m[1], 10);
        const end = m[2] ? parseInt(m[2], 10) : start;
        if (start < 1 || end < start || end > this.totalPages) return false;
      }
      return true;
    };

    const buttonRow = contentEl.createDiv({ cls: "notepages-export-actions" });

    const cancelBtn = buttonRow.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => {
      this.close();
    });

    const exportBtn = buttonRow.createEl("button", {
      cls: "mod-cta",
      text: "Export"
    });

    const syncValidation = () => {
      const valid = isCustomRangeValid();
      exportBtn.disabled = !valid;
      if (!valid) {
        errorEl.setText(`Enter valid page numbers between 1 and ${this.totalPages} (e.g. 1-3, 5).`);
        errorEl.removeClass("is-hidden");
      } else {
        errorEl.addClass("is-hidden");
      }
    };

    exportBtn.addEventListener("click", () => {
      if (!isCustomRangeValid()) {
        syncValidation();
        return;
      }
      exportBtn.disabled = true;
      cancelBtn.disabled = true;
      exportBtn.setText("Exporting...");
      errorEl.addClass("is-hidden");
      void (async () => {
        try {
          await this.onExport(this.options);
          this.close();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errorEl.setText(`Export failed: ${message}`);
          errorEl.removeClass("is-hidden");
          exportBtn.disabled = false;
          cancelBtn.disabled = false;
          exportBtn.setText("Export");
        }
      })();
    });

    this.updateVisibility = () => {
      const isSvg = this.options.format === "svg";
      resolutionSetting.settingEl.toggle(!isSvg);
      syncValidation();
    };
    this.updateVisibility();
  }

  private updateVisibility(): void {}

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
