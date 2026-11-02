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

    const titleEl = contentEl.createEl("h3", { text: "Insert Image" });
    titleEl.style.marginBottom = "16px";

    const descEl = contentEl.createEl("p", {
      text: "Choose the image source to insert into your notebook:"
    });
    descEl.style.color = "var(--text-muted)";
    descEl.style.marginBottom = "20px";

    const btnContainer = contentEl.createDiv();
    btnContainer.style.display = "flex";
    btnContainer.style.gap = "12px";
    btnContainer.style.justifyContent = "flex-end";

    const vaultBtn = btnContainer.createEl("button", {
      cls: "mod-cta",
      text: "Choose from Vault"
    });
    vaultBtn.addEventListener("click", () => {
      this.close();
      this.onChooseVault();
    });

    const computerBtn = btnContainer.createEl("button", {
      cls: "mod-primary",
      text: "Upload from Computer"
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
