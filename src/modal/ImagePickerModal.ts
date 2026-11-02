import { App, FuzzySuggestModal, TFile } from "obsidian";

export class ImagePickerModal extends FuzzySuggestModal<TFile> {
  private onSelect: (file: TFile) => void;
  private static imageExtensions = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "avif"]);

  constructor(app: App, onSelect: (file: TFile) => void) {
    super(app);
    this.onSelect = onSelect;
    this.setPlaceholder("Select an image from vault to insert...");
  }

  getItems(): TFile[] {
    return this.app.vault.getFiles().filter(f => ImagePickerModal.imageExtensions.has(f.extension.toLowerCase()));
  }

  getItemText(item: TFile): string {
    return `${item.basename}.${item.extension} (${item.parent ? item.parent.path : ""})`;
  }

  onChooseItem(item: TFile): void {
    this.onSelect(item);
  }
}
