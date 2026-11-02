import {
  Plugin,
  TFile,
  TFolder,
  WorkspaceLeaf,
  Notice,
  normalizePath,
  loadMathJax
} from "obsidian";
import { NotePagesView } from "./view/NotePagesView";
import { NotePagesSettings, DEFAULT_SETTINGS } from "./settings/NotePagesSettings";
import { NotePagesSettingTab } from "./settings/NotePagesSettingTab";
import {
  NOTE_PAGES_VIEW_TYPE,
  NOTE_PAGES_EXTENSION,
  NOTE_PAGES_FRONTMATTER_KEY,
  CURRENT_SCHEMA_VERSION,
  PAGE_DIMENSION_PRESETS,
  NotebookDocument
} from "./types";

export default class NotePagesPlugin extends Plugin {
  settings: NotePagesSettings = DEFAULT_SETTINGS;
  manualMarkdownLeaves: WeakSet<WorkspaceLeaf> = new WeakSet();

  async onload(): Promise<void> {
    await this.loadSettings();

    try {
      await loadMathJax();
    } catch {}

    this.registerView(
      NOTE_PAGES_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new NotePagesView(leaf, this)
    );

    this.registerExtensions(["gnote"], NOTE_PAGES_VIEW_TYPE);

    this.registerEvent(
      this.app.workspace.on("file-open", (file: TFile | null) => {
        this.handleFileOpen(file);
      })
    );

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf: WorkspaceLeaf | null) => {
        this.handleActiveLeafChange(leaf);
      })
    );

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!file) {
          return;
        }

        if (file instanceof TFolder) {
          menu.addItem((item) => {
            item
              .setTitle("New Obsinotes notebook")
              .setIcon("notebook-pen")
              .onClick(async () => {
                await this.createNewNotebook(file.path);
              });
          });
          return;
        }

        if (file instanceof TFile) {
          if (this.isNotePagesDocument(file)) {
            menu.addItem((item) => {
              item
                .setTitle("Open in Obsinotes")
                .setIcon("notebook-pen")
                .onClick(() => {
                  const leaf = this.app.workspace.getLeaf(false);
                  leaf.setViewState({
                    type: NOTE_PAGES_VIEW_TYPE,
                    state: { file: file.path }
                  });
                });
            });

            menu.addItem((item) => {
              item
                .setTitle("Export Obsinotes notebook...")
                .setIcon("file-down")
                .onClick(async () => {
                  const leaf = this.app.workspace.getLeaf(false);
                  await leaf.setViewState({
                    type: NOTE_PAGES_VIEW_TYPE,
                    state: { file: file.path }
                  });
                  if (leaf.view instanceof NotePagesView) {
                    leaf.view.openExportModal();
                  }
                });
            });
          } else if (file.extension.toLowerCase() === "pdf") {
            menu.addItem((item) => {
              item
                .setTitle("Import PDF as Obsinotes notebook")
                .setIcon("notebook-pen")
                .onClick(async () => {
                  const tempView = new NotePagesView(this.app.workspace.getLeaf(false), this);
                  await tempView.promptAndImportVaultPdf(file, true);
                });
            });
          }
        }
      })
    );

    this.addRibbonIcon("notebook-pen", "New Obsinotes notebook", async () => {
      await this.createNewNotebook();
    });

    this.addCommand({
      id: "create-new-notepages-notebook",
      name: "Create new Obsinotes notebook",
      callback: async () => {
        await this.createNewNotebook();
      }
    });

    this.addCommand({
      id: "toggle-notepages-markdown-view",
      name: "Toggle between Obsinotes and Markdown view",
      checkCallback: (checking: boolean) => {
        const activeLeaf = this.app.workspace.activeLeaf;
        if (!activeLeaf || !activeLeaf.view) {
          return false;
        }

        const viewType = activeLeaf.view.getViewType();
        if (viewType !== "markdown" && viewType !== NOTE_PAGES_VIEW_TYPE) {
          return false;
        }

        if (checking) {
          return true;
        }

        this.toggleActiveLeafView(activeLeaf);
        return true;
      }
    });

    this.addCommand({
      id: "notepages-insert-text-box",
      name: "Obsinotes: Insert text box",
      checkCallback: (checking: boolean) => {
        const activeLeaf = this.app.workspace.activeLeaf;
        if (!activeLeaf || !(activeLeaf.view instanceof NotePagesView)) {
          return false;
        }
        if (checking) {
          return true;
        }
        activeLeaf.view.insertTextBox();
        return true;
      }
    });

    this.addCommand({
      id: "notepages-insert-image",
      name: "Obsinotes: Insert image",
      checkCallback: (checking: boolean) => {
        const activeLeaf = this.app.workspace.activeLeaf;
        if (!activeLeaf || !(activeLeaf.view instanceof NotePagesView)) {
          return false;
        }
        if (checking) {
          return true;
        }
        activeLeaf.view.openImagePicker();
        return true;
      }
    });

    this.addCommand({
      id: "notepages-import-pdf",
      name: "Obsinotes: Import PDF",
      callback: () => {
        const activeLeaf = this.app.workspace.activeLeaf;
        if (activeLeaf && activeLeaf.view instanceof NotePagesView) {
          activeLeaf.view.openPdfPicker(false);
        } else {
          const tempView = new NotePagesView(this.app.workspace.getLeaf(false), this);
          tempView.openPdfPicker(true);
        }
      }
    });

    this.addCommand({
      id: "notepages-import-pdf-new-notebook",
      name: "Obsinotes: Import PDF as new notebook",
      callback: () => {
        const activeLeaf = this.app.workspace.activeLeaf;
        if (activeLeaf && activeLeaf.view instanceof NotePagesView) {
          activeLeaf.view.openPdfPicker(true);
        } else {
          const tempView = new NotePagesView(this.app.workspace.getLeaf(false), this);
          tempView.openPdfPicker(true);
        }
      }
    });

    this.addCommand({
      id: "notepages-export-notebook",
      name: "Obsinotes: Export notebook",
      checkCallback: (checking: boolean) => {
        const activeLeaf = this.app.workspace.activeLeaf;
        if (!activeLeaf || !(activeLeaf.view instanceof NotePagesView)) {
          return false;
        }
        if (checking) {
          return true;
        }
        activeLeaf.view.openExportModal();
        return true;
      }
    });

    this.addSettingTab(new NotePagesSettingTab(this.app, this));
  }

  async onunload(): Promise<void> {
    this.app.workspace.detachLeavesOfType(NOTE_PAGES_VIEW_TYPE);
  }

  async loadSettings(): Promise<void> {
    const loadedData = (await this.loadData()) as Partial<NotePagesSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private handleFileOpen(file: TFile | null): void {
    if (!file || !(file instanceof TFile)) {
      return;
    }

    if (!this.isNotePagesDocument(file)) {
      this.app.workspace.iterateAllLeaves((leaf) => {
        const view = leaf.view;
        if (!view) {
          return;
        }
        const leafFile = (view as { file?: TFile }).file;
        if (view.getViewType() === NOTE_PAGES_VIEW_TYPE && leafFile?.path === file.path) {
          leaf.setViewState({
            type: "markdown",
            state: { file: file.path }
          });
        }
      });
      return;
    }

    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (!view) {
        return;
      }
      if (this.manualMarkdownLeaves.has(leaf)) {
        return;
      }
      const leafFile = (view as { file?: TFile }).file;
      if (view.getViewType() === "markdown" && leafFile?.path === file.path) {
        leaf.setViewState({
          type: NOTE_PAGES_VIEW_TYPE,
          state: { file: file.path }
        });
      }
    });
  }

  private handleActiveLeafChange(leaf: WorkspaceLeaf | null): void {
    if (!leaf || !leaf.view) {
      return;
    }

    if (this.manualMarkdownLeaves.has(leaf)) {
      return;
    }

    const view = leaf.view;
    const viewType = view.getViewType();
    const file = (view as { file?: TFile }).file;

    if (viewType === NOTE_PAGES_VIEW_TYPE && file && !this.isNotePagesDocument(file)) {
      leaf.setViewState({
        type: "markdown",
        state: { file: file.path }
      });
      return;
    }

    if (viewType !== "markdown") {
      return;
    }

    if (!file || !(file instanceof TFile)) {
      return;
    }

    if (!this.isNotePagesDocument(file)) {
      return;
    }

    leaf.setViewState({
      type: NOTE_PAGES_VIEW_TYPE,
      state: { file: file.path }
    });
  }

  isNotePagesDocument(file: TFile): boolean {
    if (
      file.extension === "gnote" ||
      file.name.endsWith(".gnote") ||
      file.name.endsWith(".gnote.md") ||
      file.name.endsWith(".notepages.md") ||
      file.name.endsWith(".notepages")
    ) {
      return true;
    }

    const cache = this.app.metadataCache.getFileCache(file);
    if (cache?.frontmatter && cache.frontmatter[NOTE_PAGES_FRONTMATTER_KEY] === true) {
      return true;
    }

    return false;
  }

  private async toggleActiveLeafView(leaf: WorkspaceLeaf): Promise<void> {
    const currentViewType = leaf.view.getViewType();
    const currentFile = (leaf.view as { file?: TFile }).file;

    if (!currentFile) {
      new Notice("No file currently open in this leaf.");
      return;
    }

    if (currentViewType === NOTE_PAGES_VIEW_TYPE) {
      this.manualMarkdownLeaves.add(leaf);
      await leaf.setViewState({
        type: "markdown",
        state: { file: currentFile.path }
      });
    } else {
      this.manualMarkdownLeaves.delete(leaf);
      await leaf.setViewState({
        type: NOTE_PAGES_VIEW_TYPE,
        state: { file: currentFile.path }
      });
    }
  }

  async createNewNotebook(folderPath?: string): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    const parentFolder = folderPath !== undefined
      ? folderPath
      : (activeFile ? activeFile.parent?.path ?? "" : "");

    let fileName = `Untitled.${NOTE_PAGES_EXTENSION}`;
    let filePath = normalizePath(parentFolder ? `${parentFolder}/${fileName}` : fileName);

    let counter = 1;
    while (this.app.vault.getAbstractFileByPath(filePath) instanceof TFile) {
      fileName = `Untitled ${counter}.${NOTE_PAGES_EXTENSION}`;
      filePath = normalizePath(parentFolder ? `${parentFolder}/${fileName}` : fileName);
      counter++;
    }

    const initialContent = this.generateInitialDocumentContent(fileName.replace(`.${NOTE_PAGES_EXTENSION}`, ""));

    try {
      const createdFile = await this.app.vault.create(filePath, initialContent);
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.setViewState({
        type: NOTE_PAGES_VIEW_TYPE,
        state: { file: createdFile.path }
      });
      new Notice(`Created notebook: ${createdFile.name}`);
    } catch {
      new Notice("Error creating NotePages notebook. Check Obsidian console.");
    }
  }

  private generateInitialDocumentContent(title: string): string {
    const now = Date.now();
    const dimensions = PAGE_DIMENSION_PRESETS[this.settings.defaultPageSize === "Letter" ? "Letter" : "A4"];

    const initialDoc: NotebookDocument = {
      metadata: {
        title,
        createdAt: now,
        updatedAt: now,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        defaultPageSize: this.settings.defaultPageSize,
        defaultOrientation: this.settings.defaultOrientation
      },
      pages: [
        {
          id: "page-" + Math.random().toString(36).substring(2, 10),
          pageNumber: 1,
          dimensions: { ...dimensions },
          orientation: this.settings.defaultOrientation,
          template: {
            type: this.settings.defaultTemplate,
            backgroundColor: this.settings.defaultPaperBackground,
            lineColor: this.settings.defaultLineColor,
            spacing: this.settings.defaultLineSpacing,
            opacity: 0.8
          },
          strokes: [],
          shapes: [],
          texts: [],
          images: []
        }
      ]
    };

    const isoDate = new Date(now).toISOString();
    const jsonBlock = JSON.stringify(initialDoc, null, 2);

    return `---
${NOTE_PAGES_FRONTMATTER_KEY}: true
notepages-version: ${CURRENT_SCHEMA_VERSION}
title: "${title}"
page-count: 1
updated: "${isoDate}"
---

> [!NOTE] NotePages Notebook
> Pages: 1 | Format: ${this.settings.defaultPageSize} ${this.settings.defaultOrientation}
> Created: ${isoDate}

\`\`\`notepages-data
${jsonBlock}
\`\`\`
`;
  }
}
