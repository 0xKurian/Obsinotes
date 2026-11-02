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

    const titleEl = contentEl.createEl("h3", { text: "Existing SVG Assets Found" });
    titleEl.style.marginBottom = "14px";

    const noticeBox = contentEl.createDiv({ cls: "notepages-svg-found-box" });
    noticeBox.style.padding = "12px 14px";
    noticeBox.style.backgroundColor = "var(--background-secondary)";
    noticeBox.style.borderRadius = "8px";
    noticeBox.style.marginBottom = "16px";
    noticeBox.style.border = "1px solid var(--background-modifier-border)";

    const pathLine = noticeBox.createDiv();
    pathLine.style.display = "flex";
    pathLine.style.alignItems = "center";
    pathLine.style.gap = "8px";
    const folderIcon = pathLine.createSpan();
    setIcon(folderIcon, "folder");
    pathLine.createEl("strong", { text: this.folderPath });

    const countLine = noticeBox.createDiv({
      text: `Contains ${this.svgCount} converted SVG page assets previously generated for "${this.baseName}".`
    });
    countLine.style.color = "var(--text-muted)";
    countLine.style.fontSize = "0.9em";
    countLine.style.marginTop = "4px";

    const questionEl = contentEl.createEl("p", {
      text: "Would you like to reuse these existing SVG pages or re-convert the entire document from PDF?"
    });
    questionEl.style.marginBottom = "20px";
    questionEl.style.color = "var(--text-normal)";

    const btnContainer = contentEl.createDiv();
    btnContainer.style.display = "flex";
    btnContainer.style.flexDirection = "column";
    btnContainer.style.gap = "10px";

    const reuseBtn = btnContainer.createEl("button", {
      cls: "mod-cta",
      text: `Reuse Existing SVG (${this.svgCount} pages) - Recommended`
    });
    reuseBtn.style.padding = "10px 16px";
    reuseBtn.style.textAlign = "center";
    reuseBtn.style.fontWeight = "bold";
    reuseBtn.addEventListener("click", () => {
      this.close();
      this.onReuseExisting();
    });

    const reconvertBtn = btnContainer.createEl("button", {
      cls: "mod-primary",
      text: "Re-convert from PDF"
    });
    reconvertBtn.style.padding = "10px 16px";
    reconvertBtn.style.textAlign = "center";
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
