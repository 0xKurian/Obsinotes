import { App, Modal } from "obsidian";

export class PdfImportActionModal extends Modal {
  private pdfName: string;
  private onReplaceAll: () => void;
  private onAppendToEnd: () => void;

  constructor(
    app: App,
    pdfName: string,
    onReplaceAll: () => void,
    onAppendToEnd: () => void
  ) {
    super(app);
    this.pdfName = pdfName;
    this.onReplaceAll = onReplaceAll;
    this.onAppendToEnd = onAppendToEnd;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("notepages-pdf-action-modal");

    const titleEl = contentEl.createEl("h3", { text: "Document Import Options" });
    titleEl.style.marginBottom = "12px";

    const descEl = contentEl.createEl("p", {
      text: `This notebook already contains imported document pages. Choose how to handle "${this.pdfName}":`
    });
    descEl.style.color = "var(--text-normal)";
    descEl.style.marginBottom = "20px";

    const btnContainer = contentEl.createDiv();
    btnContainer.style.display = "flex";
    btnContainer.style.flexDirection = "column";
    btnContainer.style.gap = "12px";

    const replaceBtn = btnContainer.createEl("button", {
      cls: "mod-warning",
      text: "Replace all existing content"
    });
    replaceBtn.style.padding = "10px 16px";
    replaceBtn.style.textAlign = "center";
    replaceBtn.style.fontWeight = "bold";
    replaceBtn.addEventListener("click", () => {
      this.close();
      this.onReplaceAll();
    });

    const appendBtn = btnContainer.createEl("button", {
      cls: "mod-cta",
      text: "Append to the end"
    });
    appendBtn.style.padding = "10px 16px";
    appendBtn.style.textAlign = "center";
    appendBtn.style.fontWeight = "bold";
    appendBtn.addEventListener("click", () => {
      this.close();
      this.onAppendToEnd();
    });

    const cancelBtn = btnContainer.createEl("button", {
      text: "Cancel"
    });
    cancelBtn.style.padding = "8px 16px";
    cancelBtn.style.marginTop = "8px";
    cancelBtn.addEventListener("click", () => {
      this.close();
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
