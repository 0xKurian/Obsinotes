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

    contentEl.createEl("h3", { text: "Document import options" });

    contentEl.createEl("p", {
      text: `This notebook already contains imported document pages. Choose how to handle "${this.pdfName}":`
    });

    const btnContainer = contentEl.createDiv({ cls: "notepages-pdf-action-buttons" });

    const replaceBtn = btnContainer.createEl("button", {
      cls: "mod-warning notepages-pdf-action-btn",
      text: "Replace all existing content"
    });
    replaceBtn.addEventListener("click", () => {
      this.close();
      this.onReplaceAll();
    });

    const appendBtn = btnContainer.createEl("button", {
      cls: "mod-cta notepages-pdf-action-btn",
      text: "Append to the end"
    });
    appendBtn.addEventListener("click", () => {
      this.close();
      this.onAppendToEnd();
    });

    const cancelBtn = btnContainer.createEl("button", {
      cls: "notepages-pdf-cancel-btn",
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
