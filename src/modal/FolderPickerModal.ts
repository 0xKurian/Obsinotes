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
    header.style.marginBottom = "14px";

    const titleEl = header.createEl("h3", { text: "Select Destination Folder" });
    titleEl.style.margin = "0 0 6px 0";

    const subEl = header.createEl("p", { text: this.placeholderText });
    subEl.style.margin = "0 0 12px 0";
    subEl.style.color = "var(--text-muted)";
    subEl.style.fontSize = "0.88em";

    const breadcrumbContainer = header.createDiv({ cls: "notepages-folder-breadcrumbs" });
    breadcrumbContainer.style.display = "flex";
    breadcrumbContainer.style.flexWrap = "wrap";
    breadcrumbContainer.style.alignItems = "center";
    breadcrumbContainer.style.gap = "4px";
    breadcrumbContainer.style.padding = "6px 10px";
    breadcrumbContainer.style.background = "var(--background-secondary)";
    breadcrumbContainer.style.borderRadius = "6px";
    breadcrumbContainer.style.marginBottom = "12px";

    const rootPart = breadcrumbContainer.createSpan({ cls: "notepages-breadcrumb-item" });
    rootPart.setText("📁 Vault Root");
    rootPart.style.cursor = "pointer";
    rootPart.style.color = "var(--text-accent)";
    rootPart.style.fontWeight = "bold";
    rootPart.addEventListener("click", () => {
      this.currentFolder = this.app.vault.getRoot();
      this.filterQuery = "";
      this.render();
    });

    if (!this.currentFolder.isRoot()) {
      const parts = this.currentFolder.path.split("/");
      let accumulated = "";
      for (let i = 0; i < parts.length; i++) {
        const sep = breadcrumbContainer.createSpan({ text: "/" });
        sep.style.color = "var(--text-muted)";
        sep.style.margin = "0 2px";

        accumulated = accumulated ? `${accumulated}/${parts[i]}` : parts[i];
        const isLast = i === parts.length - 1;
        const partEl = breadcrumbContainer.createSpan({ cls: "notepages-breadcrumb-item" });
        partEl.setText(parts[i]);
        if (isLast) {
          partEl.style.fontWeight = "bold";
          partEl.style.color = "var(--text-normal)";
        } else {
          partEl.style.cursor = "pointer";
          partEl.style.color = "var(--text-accent)";
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
    selectCurrentBar.style.display = "flex";
    selectCurrentBar.style.alignItems = "center";
    selectCurrentBar.style.justifyContent = "space-between";
    selectCurrentBar.style.padding = "8px 12px";
    selectCurrentBar.style.background = "var(--interactive-accent)";
    selectCurrentBar.style.color = "var(--text-on-accent)";
    selectCurrentBar.style.borderRadius = "6px";
    selectCurrentBar.style.marginBottom = "12px";
    selectCurrentBar.style.cursor = "pointer";

    const selectInfo = selectCurrentBar.createDiv();
    const currentName = this.currentFolder.isRoot() ? "/ (Vault Root)" : this.currentFolder.path;
    const labelSpan = selectInfo.createSpan({ text: "Save to this folder: " });
    labelSpan.style.fontSize = "0.85em";
    labelSpan.style.opacity = "0.9";
    const pathSpan = selectInfo.createSpan({ text: currentName });
    pathSpan.style.fontWeight = "bold";

    const confirmBtn = selectCurrentBar.createEl("button", {
      cls: "mod-cta",
      text: "Select"
    });
    confirmBtn.style.padding = "4px 12px";
    confirmBtn.style.background = "rgba(255, 255, 255, 0.25)";
    confirmBtn.style.color = "var(--text-on-accent)";
    confirmBtn.style.border = "1px solid rgba(255, 255, 255, 0.4)";

    selectCurrentBar.addEventListener("click", () => {
      this.close();
      this.onSelect(this.currentFolder);
    });

    const searchInput = contentEl.createEl("input", {
      type: "text",
      value: this.filterQuery,
      placeholder: "Lọc thư mục con / Filter subfolders..."
    });
    searchInput.style.width = "100%";
    searchInput.style.padding = "6px 10px";
    searchInput.style.marginBottom = "10px";
    searchInput.style.borderRadius = "4px";
    searchInput.style.border = "1px solid var(--background-modifier-border)";
    searchInput.addEventListener("input", (e) => {
      this.filterQuery = (e.target as HTMLInputElement).value.toLowerCase();
      this.updateFolderList(listContainer);
    });

    const listContainer = contentEl.createDiv({ cls: "notepages-folder-list" });
    listContainer.style.maxHeight = "280px";
    listContainer.style.overflowY = "auto";
    listContainer.style.border = "1px solid var(--background-modifier-border)";
    listContainer.style.borderRadius = "6px";
    listContainer.style.padding = "4px";

    this.updateFolderList(listContainer);

    const bottomBar = contentEl.createDiv();
    bottomBar.style.display = "flex";
    bottomBar.style.justifyContent = "flex-end";
    bottomBar.style.marginTop = "14px";

    const cancelBtn = bottomBar.createEl("button", { text: "Hủy bỏ (Cancel)" });
    cancelBtn.addEventListener("click", () => {
      this.close();
    });
  }

  private updateFolderList(container: HTMLElement): void {
    container.empty();

    if (!this.currentFolder.isRoot()) {
      const upItem = container.createDiv({ cls: "notepages-folder-item" });
      upItem.style.display = "flex";
      upItem.style.alignItems = "center";
      upItem.style.gap = "8px";
      upItem.style.padding = "8px 10px";
      upItem.style.borderRadius = "4px";
      upItem.style.cursor = "pointer";
      upItem.style.fontWeight = "bold";
      upItem.style.color = "var(--text-muted)";

      const upIcon = upItem.createSpan();
      setIcon(upIcon, "corner-left-up");
      upItem.createSpan({ text: ".. (Quay lại thư mục cha / Parent folder)" });

      upItem.addEventListener("mouseenter", () => {
        upItem.style.background = "var(--background-modifier-hover)";
      });
      upItem.addEventListener("mouseleave", () => {
        upItem.style.background = "transparent";
      });
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
      const emptyItem = container.createDiv({ text: "(No subfolders)" });
      emptyItem.style.padding = "16px";
      emptyItem.style.textAlign = "center";
      emptyItem.style.color = "var(--text-muted)";
      emptyItem.style.fontSize = "0.9em";
      return;
    }

    for (const folder of subfolders) {
      const item = container.createDiv({ cls: "notepages-folder-item" });
      item.style.display = "flex";
      item.style.alignItems = "center";
      item.style.justifyContent = "space-between";
      item.style.padding = "8px 10px";
      item.style.borderRadius = "4px";
      item.style.cursor = "pointer";

      const left = item.createDiv();
      left.style.display = "flex";
      left.style.alignItems = "center";
      left.style.gap = "8px";
      const folderIcon = left.createSpan();
      setIcon(folderIcon, "folder");
      folderIcon.style.color = "var(--interactive-accent)";

      const nameSpan = left.createSpan({ text: folder.name });
      nameSpan.style.fontWeight = "500";

      const chevron = item.createSpan();
      setIcon(chevron, "chevron-right");
      chevron.style.color = "var(--text-muted)";
      chevron.style.opacity = "0.6";

      item.addEventListener("mouseenter", () => {
        item.style.background = "var(--background-modifier-hover)";
      });
      item.addEventListener("mouseleave", () => {
        item.style.background = "transparent";
      });

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
