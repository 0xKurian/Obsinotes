import { App, Modal } from "obsidian";
import { NotePagesPropertiesDelegate, NotePagesPropertiesPanel } from "../view/NotePagesPropertiesPanel";

export class PropertiesModal extends Modal {
  private panel: NotePagesPropertiesPanel;
  private onCloseCallback?: () => void;

  constructor(
    app: App,
    delegate: NotePagesPropertiesDelegate,
    onCloseCallback?: () => void
  ) {
    super(app);
    this.panel = new NotePagesPropertiesPanel(delegate, { modalMode: true });
    this.onCloseCallback = onCloseCallback;
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    modalEl.addClass("notepages-properties-modal");
    this.panel.build(contentEl);
  }

  refresh(invalidateSnapshot: boolean = false): void {
    this.panel.refresh(invalidateSnapshot);
  }

  onClose(): void {
    this.panel.clear();
    this.contentEl.empty();
    this.onCloseCallback?.();
  }
}
