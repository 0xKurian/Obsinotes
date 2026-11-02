import { App, FuzzySuggestModal, TFile } from "obsidian";

export class PdfPickerModal extends FuzzySuggestModal<TFile> {
  private onSelect: (file: TFile) => void;

  constructor(app: App, onSelect: (file: TFile) => void) {
    super(app);
    this.onSelect = onSelect;
    this.setPlaceholder("Select a PDF file from Vault to import...");
  }

  getItems(): TFile[] {
    return this.app.vault.getFiles().filter(f => f.extension.toLowerCase() === "pdf");
  }

  getItemText(item: TFile): string {
    return `${item.basename}.${item.extension} (${item.parent ? item.parent.path : ""})`;
  }

  onChooseItem(item: TFile): void {
    this.onSelect(item);
  }
}
