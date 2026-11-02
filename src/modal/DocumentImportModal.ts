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

    const titleEl = contentEl.createEl("h3", { text: "Import Document" });
    titleEl.style.marginBottom = "16px";

    const pdfSection = contentEl.createDiv({ cls: "notepages-import-section" });
    const pdfHeader = pdfSection.createDiv({ cls: "notepages-import-header" });
    pdfHeader.style.display = "flex";
    pdfHeader.style.alignItems = "center";
    pdfHeader.style.gap = "8px";
    const pdfIcon = pdfHeader.createSpan({ cls: "notepages-import-icon" });
    setIcon(pdfIcon, "file-text");
    pdfHeader.createEl("strong", { text: "Import PDF (Convert to Vector SVG)" });

    const pdfDesc = pdfSection.createEl("p", {
      text: "PDF documents are automatically converted into vector SVG page assets for smooth inking performance and optimal memory usage. If existing SVG assets are found, you can reuse them directly."
    });
    pdfDesc.style.color = "var(--text-muted)";
    pdfDesc.style.fontSize = "0.9em";
    pdfDesc.style.margin = "8px 0 14px 0";

    const pdfBtnGroup = pdfSection.createDiv({ cls: "notepages-import-buttons" });
    pdfBtnGroup.style.display = "flex";
    pdfBtnGroup.style.gap = "10px";
    pdfBtnGroup.style.flexWrap = "wrap";

    const compBtn = pdfBtnGroup.createEl("button", {
      cls: "mod-cta",
      text: "Upload from Computer"
    });
    compBtn.addEventListener("click", () => {
      this.close();
      this.onChoosePdfComputer();
    });

    const vaultBtn = pdfBtnGroup.createEl("button", {
      cls: "mod-primary",
      text: "Choose from Vault"
    });
    vaultBtn.addEventListener("click", () => {
      this.close();
      this.onChoosePdfVault();
    });

    const separator = contentEl.createEl("hr");
    separator.style.margin = "18px 0";
    separator.style.borderColor = "var(--background-modifier-border)";

    const svgSection = contentEl.createDiv({ cls: "notepages-import-section" });
    const svgHeader = svgSection.createDiv({ cls: "notepages-import-header" });
    svgHeader.style.display = "flex";
    svgHeader.style.alignItems = "center";
    svgHeader.style.gap = "8px";
    const svgIcon = svgHeader.createSpan({ cls: "notepages-import-icon" });
    setIcon(svgIcon, "folder-archive");
    svgHeader.createEl("strong", { text: "Import SVG Folder (Existing SVG Assets)" });

    const svgDesc = svgSection.createEl("p", {
      text: "Select an existing folder containing SVG page files from your Vault to import directly as notebook pages (instant load, no PDF conversion needed)."
    });
    svgDesc.style.color = "var(--text-muted)";
    svgDesc.style.fontSize = "0.9em";
    svgDesc.style.margin = "8px 0 14px 0";

    const svgBtnGroup = svgSection.createDiv({ cls: "notepages-import-buttons" });
    const svgFolderBtn = svgBtnGroup.createEl("button", {
      text: "Select SVG Folder from Vault"
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
