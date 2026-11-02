import { App, Modal } from "obsidian";

export class PdfSourceModal extends Modal {
  private onChooseComputer: () => void;
  private onChooseVault: () => void;

  constructor(
    app: App,
    onChooseComputer: () => void,
    onChooseVault: () => void
  ) {
    super(app);
    this.onChooseComputer = onChooseComputer;
    this.onChooseVault = onChooseVault;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("notepages-pdf-source-modal");

    contentEl.createEl("h3", { text: "Import PDF as notebook" });

    contentEl.createEl("p", {
      text: "Choose the PDF source to import as a notebook:"
    });

    const btnContainer = contentEl.createDiv({ cls: "notepages-modal-actions" });

    const vaultBtn = btnContainer.createEl("button", {
      cls: "mod-cta",
      text: "Choose from vault"
    });
    vaultBtn.addEventListener("click", () => {
      this.close();
      this.onChooseVault();
    });

    const computerBtn = btnContainer.createEl("button", {
      cls: "mod-primary",
      text: "Upload from computer"
    });
    computerBtn.addEventListener("click", () => {
      this.close();
      this.onChooseComputer();
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
