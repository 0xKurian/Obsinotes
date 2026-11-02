import { App, Modal } from "obsidian";

export class ImageSourceModal extends Modal {
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
    contentEl.addClass("notepages-image-source-modal");

    contentEl.createEl("h3", { text: "Insert image" });

    contentEl.createEl("p", {
      text: "Choose the image source to insert into your notebook:"
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
