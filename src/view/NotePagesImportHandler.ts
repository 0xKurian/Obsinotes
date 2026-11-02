import { App, TFile, TFolder, Notice, normalizePath } from "obsidian";
import { ImagePickerModal } from "../modal/ImagePickerModal";
import { ImageSourceModal } from "../modal/ImageSourceModal";
import { PdfPickerModal } from "../modal/PdfPickerModal";
import { DocumentImportModal } from "../modal/DocumentImportModal";
import { ExistingSvgReuseModal } from "../modal/ExistingSvgReuseModal";
import { PdfImportActionModal } from "../modal/PdfImportActionModal";
import { FolderPickerModal } from "../modal/FolderPickerModal";
import { ImageController } from "../image/ImageController";
import { AddImageCommand } from "../history/HistoryManager";
import { DocumentSerializer } from "../storage/DocumentSerializer";
import {
  NOTE_PAGES_EXTENSION,
  NOTE_PAGES_VIEW_TYPE,
  CURRENT_SCHEMA_VERSION,
  PageData,
  NotebookDocument
} from "../types";
import { PageManager } from "../model/PageManager";
import { PdfBackgroundManager, sortSvgFilesByPageNumber } from "../pdf/PdfBackgroundManager";
import { HistoryManager } from "../history/HistoryManager";

export interface NotePagesImportDelegate {
  app: App;
  getFile(): TFile | null;
  getDocument(): NotebookDocument | null;
  getPageManager(): PageManager | null;
  getCurrentPageNumber(): number;
  getPdfBackgroundManager(): PdfBackgroundManager;
  getImageController(): ImageController;
  getHistoryManager(): HistoryManager;
  resolveResourcePath(vaultPath: string): string;
  handleMutation(page: PageData): void;
  getPageFrame(pageNumber: number): HTMLElement | null;
  renderDocument(): void;
  renderPage(page: PageData): void;
  renderThumbnail(page: PageData, index: number): void;
  ensureDragOverlay(): void;
  appendDeleteButtonToThumbnail(actionsEl: HTMLElement, pageId: string): void;
  getThumbnailActionsEl(pageId: string): HTMLElement | null;
  requestSave(): void;
  scrollToPage(pageNumber: number): void;
}

export class NotePagesImportHandler {
  private delegate: NotePagesImportDelegate;

  constructor(delegate: NotePagesImportDelegate) {
    this.delegate = delegate;
  }

  openImagePicker(targetPageId?: string): void {
    const pageManager = this.delegate.getPageManager();
    const targetPage = targetPageId
      ? pageManager?.getPage(targetPageId)
      : pageManager?.getPageByNumber(this.delegate.getCurrentPageNumber());
    if (!targetPage) {
      return;
    }

    const chooseFromComputer = (): void => {
      const input = createEl("input", {
        type: "file",
        cls: "notepages-hidden-file-input"
      });
      input.accept = "image/*";
      input.addEventListener("change", () => {
        void (async () => {
          if (input.files && input.files.length > 0) {
            const file = input.files[0];
            const baseName = file.name.replace(/\.[^/.]+$/, "");
            const activeFile = this.delegate.getFile();
            const imageController = this.delegate.getImageController();
            const savedPath = await imageController.saveBlobToVault(
              file,
              baseName,
              activeFile?.path || ""
            );
            const resourceUrl = this.delegate.resolveResourcePath(savedPath);
            const naturalDims = await ImageController.getImageNaturalDimensions(resourceUrl);
            const fittedDims = ImageController.calculateFittedDimensions(
              naturalDims.width,
              naturalDims.height,
              Math.min(450, targetPage.dimensions.width - 60),
              Math.min(450, targetPage.dimensions.height - 60)
            );
            const posX = Math.max(20, Math.round((targetPage.dimensions.width - fittedDims.width) / 2));
            const posY = Math.max(50, Math.round((targetPage.dimensions.height - fittedDims.height) / 2));
            const imgObj = imageController.createImageObject(
              savedPath,
              posX,
              posY,
              fittedDims.width,
              fittedDims.height
            );
            this.delegate.getHistoryManager().execute(
              new AddImageCommand(targetPage, imgObj, () => {
                this.delegate.handleMutation(targetPage);
                const frameEl = this.delegate.getPageFrame(targetPage.pageNumber);
                if (frameEl) {
                  imageController.renderPageImages(targetPage, frameEl, (p) => this.delegate.resolveResourcePath(p));
                }
              })
            );
            new Notice(`Inserted image: ${file.name}`);
          }
          input.remove();
        })();
      });
      document.body.appendChild(input);
      input.click();
    };

    const chooseFromVault = (): void => {
      const modal = new ImagePickerModal(this.delegate.app, (file: TFile) => {
        void (async () => {
          const resourceUrl = this.delegate.resolveResourcePath(file.path);
          const naturalDims = await ImageController.getImageNaturalDimensions(resourceUrl);
          const fittedDims = ImageController.calculateFittedDimensions(
            naturalDims.width,
            naturalDims.height,
            Math.min(450, targetPage.dimensions.width - 60),
            Math.min(450, targetPage.dimensions.height - 60)
          );
          const posX = Math.max(20, Math.round((targetPage.dimensions.width - fittedDims.width) / 2));
          const posY = Math.max(50, Math.round((targetPage.dimensions.height - fittedDims.height) / 2));
          const imageController = this.delegate.getImageController();
          const imgObj = imageController.createImageObject(
            file.path,
            posX,
            posY,
            fittedDims.width,
            fittedDims.height
          );
          this.delegate.getHistoryManager().execute(
            new AddImageCommand(targetPage, imgObj, () => {
              this.delegate.handleMutation(targetPage);
              const frameEl = this.delegate.getPageFrame(targetPage.pageNumber);
              if (frameEl) {
                imageController.renderPageImages(targetPage, frameEl, (p) => this.delegate.resolveResourcePath(p));
              }
            })
          );
          new Notice(`Inserted image: ${file.name}`);
        })();
      });
      modal.open();
    };

    const sourceModal = new ImageSourceModal(
      this.delegate.app,
      () => chooseFromComputer(),
      () => chooseFromVault()
    );
    sourceModal.open();
  }

  openPdfPicker(forceNewNotebook: boolean = false, targetPageNumber?: number): void {
    const choosePdfFromVault = (): void => {
      const modal = new PdfPickerModal(this.delegate.app, (pdfFile: TFile) => {
        void this.promptAndImportVaultPdf(pdfFile, forceNewNotebook, targetPageNumber);
      });
      modal.open();
    };

    const choosePdfFromComputer = (): void => {
      const input = createEl("input", {
        type: "file",
        cls: "notepages-hidden-file-input"
      });
      input.accept = "application/pdf,.pdf";
      input.addEventListener("change", () => {
        void (async () => {
          if (input.files && input.files.length > 0) {
            const file = input.files[0];
            await this.promptAndImportLocalPdf(file, forceNewNotebook, targetPageNumber);
          }
          input.remove();
        })();
      });
      document.body.appendChild(input);
      input.click();
    };

    const chooseSvgFolder = (): void => {
      const currentFolder = this.delegate.getFile()?.parent ?? (this.delegate.app.workspace.getActiveFile()?.parent ?? null);
      const folderModal = new FolderPickerModal(
        this.delegate.app,
        currentFolder,
        (selectedFolder: TFolder) => {
          void (async () => {
            const svgFiles = selectedFolder.children.filter(
              (f): f is TFile => f instanceof TFile && f.extension.toLowerCase() === "svg"
            );
            if (svgFiles.length === 0) {
              new Notice(`No SVG files found in folder "${selectedFolder.name}".`);
              return;
            }
            await this.importFromExistingSvgFolder(
              selectedFolder,
              svgFiles,
              "",
              selectedFolder.name,
              selectedFolder.parent?.path,
              forceNewNotebook,
              targetPageNumber
            );
          })();
        },
        "Select an SVG folder in vault to import as notebook pages..."
      );
      folderModal.open();
    };

    const importModal = new DocumentImportModal(
      this.delegate.app,
      () => choosePdfFromComputer(),
      () => choosePdfFromVault(),
      () => chooseSvgFolder()
    );
    importModal.open();
  }

  findExistingSvgFolder(
    baseName: string,
    destinationFolder?: string
  ): { folder: TFolder; svgFiles: TFile[] } | null {
    const svgFolderName = `${baseName}_svg`;
    const targetPath = destinationFolder
      ? normalizePath(`${destinationFolder}/${svgFolderName}`)
      : normalizePath(svgFolderName);

    const directFile = this.delegate.app.vault.getAbstractFileByPath(targetPath);
    if (directFile instanceof TFolder) {
      const svgFiles = directFile.children.filter(
        (f): f is TFile => f instanceof TFile && f.extension.toLowerCase() === "svg"
      );
      if (svgFiles.length > 0) {
        return { folder: directFile, svgFiles: sortSvgFilesByPageNumber(svgFiles) };
      }
    }

    const allLoaded = this.delegate.app.vault.getAllLoadedFiles();
    for (const item of allLoaded) {
      if (item instanceof TFolder && item.name === svgFolderName) {
        const svgFiles = item.children.filter(
          (f): f is TFile => f instanceof TFile && f.extension.toLowerCase() === "svg"
        );
        if (svgFiles.length > 0) {
          return { folder: item, svgFiles: sortSvgFilesByPageNumber(svgFiles) };
        }
      }
    }

    return null;
  }

  async promptAndImportVaultPdf(
    pdfFile: TFile,
    forceNewNotebook: boolean = false,
    targetPageNumber?: number
  ): Promise<void> {
    const defaultFolder = pdfFile.parent ?? this.delegate.getFile()?.parent ?? (this.delegate.app.workspace.getActiveFile()?.parent ?? null);
    const folderModal = new FolderPickerModal(
      this.delegate.app,
      defaultFolder,
      (selectedFolder: TFolder) => {
        void (async () => {
          const destFolder = selectedFolder.isRoot() ? "" : selectedFolder.path;
          const existingInfo = this.findExistingSvgFolder(pdfFile.basename, destFolder);
          if (existingInfo && existingInfo.svgFiles.length > 0) {
            const reuseModal = new ExistingSvgReuseModal(
              this.delegate.app,
              pdfFile.basename,
              existingInfo.folder.path,
              existingInfo.svgFiles.length,
              () => {
                void this.importFromExistingSvgFolder(
                  existingInfo.folder,
                  existingInfo.svgFiles,
                  pdfFile.path,
                  pdfFile.basename,
                  destFolder,
                  forceNewNotebook,
                  targetPageNumber
                );
              },
              () => {
                new Notice("Importing PDF: Converting pages to vector SVG format...");
                void this.importPdfFile(pdfFile, destFolder, forceNewNotebook, targetPageNumber);
              }
            );
            reuseModal.open();
            return;
          }

          new Notice("Importing PDF: Converting pages to vector SVG format...");
          await this.importPdfFile(pdfFile, destFolder, forceNewNotebook, targetPageNumber);
        })();
      },
      "Select folder in vault to store the page assets folder..."
    );
    folderModal.open();
  }

  async promptAndImportLocalPdf(
    file: File,
    forceNewNotebook: boolean = false,
    targetPageNumber?: number
  ): Promise<void> {
    const currentFolder = this.delegate.getFile()?.parent ?? (this.delegate.app.workspace.getActiveFile()?.parent ?? null);
    const folderModal = new FolderPickerModal(
      this.delegate.app,
      currentFolder,
      (selectedFolder: TFolder) => {
        void (async () => {
          const destFolder = selectedFolder.isRoot() ? "" : selectedFolder.path;
          const baseName = file.name.replace(/\.[^/.]+$/, "");
          const existingInfo = this.findExistingSvgFolder(baseName, destFolder);
          if (existingInfo && existingInfo.svgFiles.length > 0) {
            const reuseModal = new ExistingSvgReuseModal(
              this.delegate.app,
              baseName,
              existingInfo.folder.path,
              existingInfo.svgFiles.length,
              () => {
                void (async () => {
                  const savedPdf = await this.saveLocalPdfBinary(file, destFolder);
                  await this.importFromExistingSvgFolder(
                    existingInfo.folder,
                    existingInfo.svgFiles,
                    savedPdf.path,
                    baseName,
                    destFolder,
                    forceNewNotebook,
                    targetPageNumber
                  );
                })();
              },
              () => {
                new Notice("Importing PDF: Converting pages to vector SVG format...");
                void this.importLocalPdfFile(file, destFolder, forceNewNotebook, targetPageNumber);
              }
            );
            reuseModal.open();
            return;
          }

          new Notice("Importing PDF: Converting pages to vector SVG format...");
          await this.importLocalPdfFile(file, destFolder, forceNewNotebook, targetPageNumber);
        })();
      },
      "Select folder in vault to store the raw PDF and page assets folder..."
    );
    folderModal.open();
  }

  private async saveLocalPdfBinary(file: File, destinationFolder?: string): Promise<TFile> {
    const buffer = await file.arrayBuffer();
    const activeFile = this.delegate.app.workspace.getActiveFile();
    const currentFile = this.delegate.getFile();
    const finalDestFolder = destinationFolder !== undefined
      ? destinationFolder
      : (currentFile?.parent ? currentFile.parent.path : (activeFile?.parent ? activeFile.parent.path : ""));

    const baseName = file.name.replace(/\.[^/.]+$/, "");
    let candidate = normalizePath(finalDestFolder ? `${finalDestFolder}/${file.name}` : file.name);
    let counter = 1;
    while (this.delegate.app.vault.getAbstractFileByPath(candidate) instanceof TFile) {
      candidate = normalizePath(finalDestFolder ? `${finalDestFolder}/${baseName} (${counter}).pdf` : `${baseName} (${counter}).pdf`);
      counter++;
    }

    const lastSlash = candidate.lastIndexOf("/");
    if (lastSlash !== -1) {
      const dirPath = candidate.substring(0, lastSlash);
      const adapter = this.delegate.app.vault.adapter;
      if (adapter && !(await adapter.exists(dirPath))) {
        if (adapter.mkdir) {
          await adapter.mkdir(dirPath);
        }
      }
    }

    return await this.delegate.app.vault.createBinary(candidate, buffer);
  }

  async importLocalPdfFile(
    file: File,
    destinationFolder?: string,
    forceNewNotebook: boolean = false,
    targetPageNumber?: number
  ): Promise<void> {
    const savedPdfFile = await this.saveLocalPdfBinary(file, destinationFolder);
    await this.importPdfFile(savedPdfFile, destinationFolder, forceNewNotebook, targetPageNumber);
  }

  async importFromExistingSvgFolder(
    svgFolder: TFolder,
    svgFiles: TFile[],
    associatedPdfPath: string,
    baseName: string,
    destinationFolder?: string,
    forceNewNotebook: boolean = false,
    targetPageNumber?: number
  ): Promise<void> {
    const pdfBackgroundManager = this.delegate.getPdfBackgroundManager();
    const sorted = sortSvgFilesByPageNumber(svgFiles);
    const pages = await pdfBackgroundManager.extractPagesFromSvgFiles(sorted, associatedPdfPath);
    if (!pages || pages.length === 0) {
      new Notice("No valid SVG pages found.");
      return;
    }
    await this.handleImportedPages(pages, baseName, destinationFolder, forceNewNotebook, targetPageNumber);
    new Notice(`Imported ${pages.length} page(s) from SVG folder: ${svgFolder.name}`);
  }

  async importPdfFile(
    pdfFile: TFile,
    destinationFolder?: string,
    forceNewNotebook: boolean = false,
    targetPageNumber?: number
  ): Promise<void> {
    const pdfBackgroundManager = this.delegate.getPdfBackgroundManager();
    const pages = await pdfBackgroundManager.extractPagesFromPdf(pdfFile, destinationFolder);
    if (!pages || pages.length === 0) {
      new Notice("Could not read any pages from the selected PDF.");
      return;
    }
    await this.handleImportedPages(pages, pdfFile.basename, destinationFolder, forceNewNotebook, targetPageNumber);
  }

  async handleImportedPages(
    pages: PageData[],
    documentTitle: string,
    destinationFolder?: string,
    forceNewNotebook: boolean = false,
    targetPageNumber?: number
  ): Promise<void> {
    const document = this.delegate.getDocument();
    const pageManager = this.delegate.getPageManager();

    if (document && pageManager && !forceNewNotebook) {
      const hasImportedPages = document.pages.some((page) => Boolean(page.pdfSource));
      if (hasImportedPages) {
        const modal = new PdfImportActionModal(
          this.delegate.app,
          documentTitle,
          () => {
            this.executeReplaceAllWithPages(documentTitle, pages);
          },
          () => {
            this.executeAppendPagesToEnd(documentTitle, pages);
          }
        );
        modal.open();
        return;
      }

      const refPageNumber = targetPageNumber ?? this.delegate.getCurrentPageNumber();
      const refPage = pageManager.getPageByNumber(refPageNumber);
      const isCurrentPageEmpty = refPage &&
        refPage.strokes.length === 0 &&
        refPage.shapes.length === 0 &&
        refPage.texts.length === 0 &&
        refPage.images.length === 0 &&
        !refPage.pdfSource;

      let targetIndex: number;
      let replaceCount = 0;

      if (isCurrentPageEmpty) {
        const currentIndex = pageManager.getPageIndex(refPage.id);
        targetIndex = currentIndex !== -1 ? currentIndex : 0;
        replaceCount = 1;
      } else {
        targetIndex = Math.min(pageManager.getPageCount(), refPageNumber);
        replaceCount = 0;
      }

      pageManager.insertPages(targetIndex, pages, replaceCount);
      this.delegate.renderDocument();
      this.delegate.requestSave();

      const firstInsertedPageNumber = targetIndex + 1;
      this.delegate.scrollToPage(firstInsertedPageNumber);

      new Notice(`Inserted ${pages.length} page(s) into notebook`);
      return;
    }

    const defaultOrientation = pages.length > 0 ? pages[0].orientation : "portrait";
    const now = Date.now();
    const newDoc: NotebookDocument = {
      metadata: {
        title: documentTitle,
        createdAt: now,
        updatedAt: now,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        defaultPageSize: "Custom",
        defaultOrientation,
        defaultTemplate: "blank"
      },
      pages
    };

    const content = DocumentSerializer.serializeDocument(newDoc);
    const parentFolder = destinationFolder !== undefined ? destinationFolder : "";
    let targetName = `${documentTitle}.${NOTE_PAGES_EXTENSION}`;
    let targetPath = normalizePath(parentFolder ? `${parentFolder}/${targetName}` : targetName);
    let counter = 1;
    while (this.delegate.app.vault.getAbstractFileByPath(targetPath) instanceof TFile) {
      targetName = `${documentTitle} (${counter}).${NOTE_PAGES_EXTENSION}`;
      targetPath = normalizePath(parentFolder ? `${parentFolder}/${targetName}` : targetName);
      counter++;
    }
    const createdFile = await this.delegate.app.vault.create(targetPath, content);
    const leaf = this.delegate.app.workspace.getLeaf(false);
    await leaf.setViewState({
      type: NOTE_PAGES_VIEW_TYPE,
      state: { file: createdFile.path }
    });
    new Notice(`Imported notebook: ${createdFile.name}`);
  }

  private executeReplaceAllWithPages(title: string, pages: PageData[]): void {
    const document = this.delegate.getDocument();
    const pageManager = this.delegate.getPageManager();
    if (!document || !pageManager) {
      return;
    }
    const currentCount = document.pages.length;
    pageManager.insertPages(0, pages, currentCount);
    if (pages.length > 0) {
      document.metadata.defaultOrientation = pages[0].orientation;
    }
    this.delegate.renderDocument();
    this.delegate.requestSave();
    this.delegate.scrollToPage(1);
    new Notice(`Replaced all content with ${pages.length} page(s) from ${title}`);
  }

  private executeAppendPagesToEnd(title: string, pages: PageData[]): void {
    const document = this.delegate.getDocument();
    const pageManager = this.delegate.getPageManager();
    if (!document || !pageManager) {
      return;
    }
    const oldCount = document.pages.length;
    pageManager.insertPages(oldCount, pages, 0);
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      const index = oldCount + i;
      this.delegate.renderPage(p);
      this.delegate.renderThumbnail(p, index);
    }
    this.delegate.ensureDragOverlay();
    if (oldCount === 1 && pages.length > 0) {
      const firstPage = pageManager.getPages()[0];
      const actionsEl = this.delegate.getThumbnailActionsEl(firstPage.id);
      if (actionsEl) {
        this.delegate.appendDeleteButtonToThumbnail(actionsEl, firstPage.id);
      }
    }
    this.delegate.requestSave();
    const firstInsertedPageNumber = oldCount + 1;
    this.delegate.scrollToPage(firstInsertedPageNumber);
    new Notice(`Appended ${pages.length} page(s) from ${title} to the end`);
  }
}
