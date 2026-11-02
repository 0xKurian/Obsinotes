import { App, Modal, setIcon } from "obsidian";

export class ExistingSvgReuseModal extends Modal {
  private baseName: string;
  private folderPath: string;
  private svgCount: number;
  private onReuseExisting: () => void;
  private onReconvertPdf: () => void;

  constructor(
    app: App,
    baseName: string,
    folderPath: string,
    svgCount: number,
    onReuseExisting: () => void,
    onReconvertPdf: () => void
  ) {
    super(app);
    this.baseName = baseName;
    this.folderPath = folderPath;
    this.svgCount = svgCount;
    this.onReuseExisting = onReuseExisting;
    this.onReconvertPdf = onReconvertPdf;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("notepages-existing-svg-modal");

    contentEl.createEl("h3", { text: "Existing SVG assets found" });

    const noticeBox = contentEl.createDiv({ cls: "notepages-svg-found-box" });

    const pathLine = noticeBox.createDiv({ cls: "notepages-svg-path-line" });
    const folderIcon = pathLine.createSpan();
    setIcon(folderIcon, "folder");
    pathLine.createEl("strong", { text: this.folderPath });

    noticeBox.createDiv({
      cls: "notepages-svg-count-line",
      text: `Contains ${this.svgCount} converted SVG page assets previously generated for "${this.baseName}".`
    });

    contentEl.createEl("p", {
      text: "Would you like to reuse these existing SVG pages or re-convert the entire document from PDF?"
    });

    const btnContainer = contentEl.createDiv({ cls: "notepages-svg-reuse-actions" });

    const reuseBtn = btnContainer.createEl("button", {
      cls: "mod-cta",
      text: `Reuse existing SVG (${this.svgCount} pages) (recommended)`
    });
    reuseBtn.addEventListener("click", () => {
      this.close();
      this.onReuseExisting();
    });

    const reconvertBtn = btnContainer.createEl("button", {
      cls: "mod-primary",
      text: "Re-convert from PDF"
    });
    reconvertBtn.addEventListener("click", () => {
      this.close();
      this.onReconvertPdf();
    });

    const cancelBtn = btnContainer.createEl("button", {
      text: "Cancel"
    });
    cancelBtn.addEventListener("click", () => {
      this.close();
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
