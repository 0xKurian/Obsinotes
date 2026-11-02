import { App, Modal, setIcon } from "obsidian";

export class DocumentImportModal extends Modal {
  private onChoosePdfComputer: () => void;
  private onChoosePdfVault: () => void;
  private onChooseSvgFolder: () => void;

  constructor(
    app: App,
    onChoosePdfComputer: () => void,
    onChoosePdfVault: () => void,
    onChooseSvgFolder: () => void
  ) {
    super(app);
    this.onChoosePdfComputer = onChoosePdfComputer;
    this.onChoosePdfVault = onChoosePdfVault;
    this.onChooseSvgFolder = onChooseSvgFolder;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("notepages-document-import-modal");

    contentEl.createEl("h3", { text: "Import document" });

    const pdfSection = contentEl.createDiv({ cls: "notepages-import-section" });
    const pdfHeader = pdfSection.createDiv({ cls: "notepages-import-header" });
    const pdfIcon = pdfHeader.createSpan({ cls: "notepages-import-icon" });
    setIcon(pdfIcon, "file-text");
    pdfHeader.createEl("strong", { text: "Import PDF (convert to vector SVG)" });

    pdfSection.createEl("p", {
      cls: "notepages-import-desc",
      text: "PDF documents are automatically converted into vector SVG page assets for smooth inking performance and optimal memory usage. If existing SVG assets are found, you can reuse them directly."
    });

    const pdfBtnGroup = pdfSection.createDiv({ cls: "notepages-import-buttons" });

    const compBtn = pdfBtnGroup.createEl("button", {
      cls: "mod-cta",
      text: "Upload from computer"
    });
    compBtn.addEventListener("click", () => {
      this.close();
      this.onChoosePdfComputer();
    });

    const vaultBtn = pdfBtnGroup.createEl("button", {
      cls: "mod-primary",
      text: "Choose from vault"
    });
    vaultBtn.addEventListener("click", () => {
      this.close();
      this.onChoosePdfVault();
    });

    contentEl.createEl("hr");

    const svgSection = contentEl.createDiv({ cls: "notepages-import-section" });
    const svgHeader = svgSection.createDiv({ cls: "notepages-import-header" });
    const svgIcon = svgHeader.createSpan({ cls: "notepages-import-icon" });
    setIcon(svgIcon, "folder-archive");
    svgHeader.createEl("strong", { text: "Import SVG folder (existing SVG assets)" });

    svgSection.createEl("p", {
      cls: "notepages-import-desc",
      text: "Select an existing folder containing SVG page files from your vault to import directly as notebook pages (instant load, no PDF conversion needed)."
    });

    const svgBtnGroup = svgSection.createDiv({ cls: "notepages-import-buttons" });
    const svgFolderBtn = svgBtnGroup.createEl("button", {
      text: "Select SVG folder from vault"
    });
    svgFolderBtn.addEventListener("click", () => {
      this.close();
      this.onChooseSvgFolder();
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
