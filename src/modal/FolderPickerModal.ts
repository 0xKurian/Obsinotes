import { App, Modal, TFolder, setIcon } from "obsidian";

export class FolderPickerModal extends Modal {
  private onSelect: (folder: TFolder) => void;
  private currentFolder: TFolder;
  private filterQuery: string = "";
  private placeholderText: string;

  constructor(
    app: App,
    initialFolder: TFolder | null,
    onSelect: (folder: TFolder) => void,
    placeholder?: string
  ) {
    super(app);
    this.onSelect = onSelect;
    const root = this.app.vault.getRoot();
    this.currentFolder = initialFolder ?? root;
    this.placeholderText = placeholder ?? "Select folder to store the raw PDF file...";
  }

  onOpen(): void {
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("notepages-folder-picker-modal");

    const header = contentEl.createDiv({ cls: "notepages-folder-picker-header" });
    header.createEl("h3", { text: "Select destination folder" });
    header.createEl("p", { text: this.placeholderText });

    const breadcrumbContainer = header.createDiv({ cls: "notepages-folder-breadcrumbs" });

    const rootPart = breadcrumbContainer.createSpan({ cls: "notepages-breadcrumb-item" });
    rootPart.setText("📁 Vault root");
    rootPart.addEventListener("click", () => {
      this.currentFolder = this.app.vault.getRoot();
      this.filterQuery = "";
      this.render();
    });

    if (!this.currentFolder.isRoot()) {
      const parts = this.currentFolder.path.split("/");
      let accumulated = "";
      for (let i = 0; i < parts.length; i++) {
        breadcrumbContainer.createSpan({ cls: "notepages-breadcrumb-sep", text: "/" });

        accumulated = accumulated ? `${accumulated}/${parts[i]}` : parts[i];
        const isLast = i === parts.length - 1;
        const partEl = breadcrumbContainer.createSpan({ cls: "notepages-breadcrumb-item" });
        partEl.setText(parts[i]);
        if (isLast) {
          partEl.addClass("is-active");
        } else {
          const targetPath = accumulated;
          partEl.addEventListener("click", () => {
            const targetFolder = this.app.vault.getAbstractFileByPath(targetPath);
            if (targetFolder instanceof TFolder) {
              this.currentFolder = targetFolder;
              this.filterQuery = "";
              this.render();
            }
          });
        }
      }
    }

    const selectCurrentBar = contentEl.createDiv({ cls: "notepages-select-current-bar" });

    const selectInfo = selectCurrentBar.createDiv({ cls: "notepages-select-current-info" });
    const currentName = this.currentFolder.isRoot() ? "/ (Vault root)" : this.currentFolder.path;
    selectInfo.createSpan({ cls: "notepages-select-current-label", text: "Save to this folder" });
    selectInfo.createSpan({ cls: "notepages-select-current-path", text: currentName });

    const confirmBtn = selectCurrentBar.createEl("button", {
      cls: "mod-cta",
      text: "Select"
    });

    confirmBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.close();
      this.onSelect(this.currentFolder);
    });

    selectCurrentBar.addEventListener("click", () => {
      this.close();
      this.onSelect(this.currentFolder);
    });

    const searchInput = contentEl.createEl("input", {
      type: "text",
      value: this.filterQuery,
      placeholder: "Filter subfolders...",
      cls: "notepages-folder-search-input"
    });
    searchInput.addEventListener("input", (e) => {
      this.filterQuery = (e.target as HTMLInputElement).value.toLowerCase();
      this.updateFolderList(listContainer);
    });

    const listContainer = contentEl.createDiv({ cls: "notepages-folder-list" });

    this.updateFolderList(listContainer);

    const bottomBar = contentEl.createDiv({ cls: "notepages-folder-picker-footer" });
    const cancelBtn = bottomBar.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => {
      this.close();
    });
  }

  private updateFolderList(container: HTMLElement): void {
    container.empty();

    if (!this.currentFolder.isRoot()) {
      const upItem = container.createDiv({ cls: "notepages-folder-item notepages-folder-item-up" });
      const upLeft = upItem.createDiv({ cls: "notepages-folder-item-left" });
      const upIcon = upLeft.createSpan();
      setIcon(upIcon, "corner-left-up");
      upLeft.createSpan({ text: ".. (Parent folder)" });

      upItem.addEventListener("click", () => {
        const parent = this.currentFolder.parent;
        this.currentFolder = parent ?? this.app.vault.getRoot();
        this.filterQuery = "";
        this.render();
      });
    }

    const subfolders: TFolder[] = [];
    for (const child of this.currentFolder.children) {
      if (child instanceof TFolder) {
        if (!this.filterQuery || child.name.toLowerCase().includes(this.filterQuery)) {
          subfolders.push(child);
        }
      }
    }

    subfolders.sort((a, b) => a.name.localeCompare(b.name));

    if (subfolders.length === 0) {
      container.createDiv({ cls: "notepages-folder-empty", text: "No subfolders" });
      return;
    }

    for (const folder of subfolders) {
      const item = container.createDiv({ cls: "notepages-folder-item" });

      const left = item.createDiv({ cls: "notepages-folder-item-left" });
      const folderIcon = left.createSpan({ cls: "notepages-folder-icon" });
      setIcon(folderIcon, "folder");
      left.createSpan({ text: folder.name });

      const chevron = item.createSpan({ cls: "notepages-folder-chevron" });
      setIcon(chevron, "chevron-right");

      item.addEventListener("click", () => {
        this.currentFolder = folder;
        this.filterQuery = "";
        this.render();
      });
    }
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
