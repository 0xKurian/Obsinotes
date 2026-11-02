import {
  TextFileView,
  WorkspaceLeaf,
  TFile,
  Notice,
  Scope,
  Menu,
  renderMath,
  finishRenderMath,
  loadMathJax
} from "obsidian";
import type NotePagesPlugin from "../main";
import {
  NOTE_PAGES_VIEW_TYPE,
  CURRENT_SCHEMA_VERSION,
  NotebookDocument,
  PageData,
  PAGE_DIMENSION_PRESETS,
  ToolType,
  PaperTemplateType,
  PageOrientation,
  StrokeObject,
  ShapeObject,
  ShapeType,
  TextObject,
  ImageObject,
  StrokeBoundingBox,
  EraserMode
} from "../types";
import { PageManager } from "../model/PageManager";
import { TemplateRenderer } from "../renderer/TemplateRenderer";
import { InkingController } from "../ink/InkingController";
import { StrokeGeometry } from "../ink/StrokeGeometry";
import { SelectionController } from "../selection/SelectionController";
import { SelectionEngine } from "../selection/SelectionEngine";
import { ShapeRecognizer } from "../shape/ShapeRecognizer";
import {
  HistoryManager,
  AddStrokeCommand,
  AddShapeCommand,
  ConvertShapeCommand,
  EraseStrokesCommand,
  TransformElementsCommand,
  DeleteElementsCommand,
  AddElementsCommand,
  MoveElementsAcrossPagesCommand,
  AddTextCommand,
  ModifyTextCommand,
  AddImageCommand,
  ModifyImageCommand
} from "../history/HistoryManager";
import { DocumentSerializer } from "../storage/DocumentSerializer";
import { StorageManager } from "../storage/StorageManager";
import { TextController, TextFormattingOptions } from "../text/TextController";
import { ImageController } from "../image/ImageController";
import { PdfBackgroundManager } from "../pdf/PdfBackgroundManager";
import { NotePagesImportHandler, NotePagesImportDelegate } from "./NotePagesImportHandler";
import { NotePagesSidebar, NotePagesSidebarDelegate } from "./NotePagesSidebar";
import { NotePagesToolbar, NotePagesToolbarDelegate } from "./NotePagesToolbar";
import { ExportModal } from "../modal/ExportModal";
import { ExportEngine } from "../export/ExportEngine";
import { PerformanceMonitor } from "../performance/PerformanceMonitor";
import { PageVirtualizer } from "../performance/PageVirtualizer";

export class NotePagesView extends TextFileView implements NotePagesImportDelegate, NotePagesSidebarDelegate, NotePagesToolbarDelegate {
  plugin: NotePagesPlugin;
  importHandler: NotePagesImportHandler;
  sidebar: NotePagesSidebar;
  toolbar: NotePagesToolbar;
  document: NotebookDocument | null = null;
  pageManager: PageManager | null = null;
  storageManager: StorageManager;
  textController: TextController;
  imageController: ImageController;
  pdfBackgroundManager: PdfBackgroundManager;
  isCorrupted: boolean = false;
  rawCorruptedData: string = "";
  corruptionError: string = "";
  saveStatusResetTimer: number | null = null;
  inkingController: InkingController;
  selectionController: SelectionController;
  historyManager: HistoryManager;

  rootContainerEl!: HTMLElement;
  mainAreaEl!: HTMLElement;
  scrollerEl!: HTMLElement;
  pagesContainerEl!: HTMLElement;
  statusAreaEl!: HTMLElement;
  statusPageInfoEl!: HTMLElement;
  statusZoomInfoEl!: HTMLElement;
  statusToolInfoEl!: HTMLElement;
  statusSaveInfoEl!: HTMLElement;

  currentPageNumber: number = 1;
  pageElements: Map<number, HTMLElement> = new Map();
  committedCanvasMap: Map<string, HTMLCanvasElement> = new Map();
  activeCanvasMap: Map<string, HTMLCanvasElement> = new Map();
  templateCanvasMap: Map<string, HTMLCanvasElement> = new Map();
  pageIntersectionObserver: IntersectionObserver | null = null;
  performanceMonitor: PerformanceMonitor = new PerformanceMonitor();
  pageVirtualizer!: PageVirtualizer;

  clipboard: { strokes: StrokeObject[]; shapes: ShapeObject[] } | null = null;

  isPanning: boolean = false;
  panStartX: number = 0;
  panStartY: number = 0;
  panScrollLeft: number = 0;
  panScrollTop: number = 0;
  isSpacePressed: boolean = false;
  currentTextOptions: {
    fontSize: number;
    fontWeight: string;
    italic: boolean;
    underline: boolean;
    textAlign: "left" | "center" | "right";
    color: string;
  } = {
    fontSize: 16,
    fontWeight: "normal",
    italic: false,
    underline: false,
    textAlign: "left",
    color: "#1e293b"
  };

  zoomLevel: number = 1.0;
  isSidebarCollapsed: boolean = false;

  dragOverlayEl!: HTMLElement;
  dragOverlayCanvas!: HTMLCanvasElement;
  isDraggingSelection: boolean = false;
  dragStartClientX: number = 0;
  dragStartClientY: number = 0;
  dragInitialOverlayX: number = 0;
  dragInitialOverlayY: number = 0;
  dragOverlayPadding: number = 16;
  dragBoxWidth: number = 0;
  dragBoxHeight: number = 0;

  isDraggingTextRect: boolean = false;
  dragTextPage: PageData | null = null;
  dragTextPageFrame: HTMLElement | null = null;
  dragTextCanvas: HTMLCanvasElement | null = null;
  dragTextStartX: number = 0;
  dragTextStartY: number = 0;
  dragTextCurrentX: number = 0;
  dragTextCurrentY: number = 0;

  currentStickyColor: string = "#fef08a";

  currentShapeType: ShapeType = "rectangle";
  shapeFillEnabled: boolean = false;

  isDraggingShape: boolean = false;
  dragShapePage: PageData | null = null;
  dragShapeCanvas: HTMLCanvasElement | null = null;
  dragShapeStartX: number = 0;
  dragShapeStartY: number = 0;
  dragShapeCurrentX: number = 0;
  dragShapeCurrentY: number = 0;

  isDraggingConnector: boolean = false;
  dragConnectorPage: PageData | null = null;
  dragConnectorCanvas: HTMLCanvasElement | null = null;
  dragConnectorStartX: number = 0;
  dragConnectorStartY: number = 0;
  dragConnectorCurrentX: number = 0;
  dragConnectorCurrentY: number = 0;

  constructor(leaf: WorkspaceLeaf, plugin: NotePagesPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.storageManager = new StorageManager(this.app.vault);

    const originalRequestSave = this.requestSave.bind(this);
    this.requestSave = () => {
      if (this.isCorrupted) {
        return;
      }
      if (this.document) {
        this.document.metadata.updatedAt = Date.now();
      }
      if (this.statusSaveInfoEl) {
        this.statusSaveInfoEl.setText("Saving...");
      }
      originalRequestSave();
      if (this.saveStatusResetTimer !== null) {
        window.clearTimeout(this.saveStatusResetTimer);
      }
      this.saveStatusResetTimer = window.setTimeout(() => {
        if (this.statusSaveInfoEl && !this.isCorrupted) {
          this.statusSaveInfoEl.setText("All changes saved");
        }
      }, 800);
    };

    this.historyManager = new HistoryManager(80, (canUndo, canRedo) => {
      this.updateHistoryButtons(canUndo, canRedo);
    });

    this.textController = new TextController(
      {
        onTextCommitted: (page, text, isNew) => {
          if (isNew) {
            this.historyManager.execute(
              new AddTextCommand(page, text, () => {
                this.handleMutation(page);
                const frameEl = this.getPageFrame(page.pageNumber);
                if (frameEl) {
                  this.textController.renderPageTexts(page, frameEl);
                }
              })
            );
          } else {
            const prev = page.texts.find(t => t.id === text.id) || text;
            this.historyManager.execute(
              new ModifyTextCommand(page, prev, text, () => {
                this.handleMutation(page);
                const frameEl = this.getPageFrame(page.pageNumber);
                if (frameEl) {
                  this.textController.renderPageTexts(page, frameEl);
                }
              })
            );
          }
        },
        onTextDeleted: (page) => {
          this.handleMutation(page);
          const frameEl = this.getPageFrame(page.pageNumber);
          if (frameEl) {
            this.textController.renderPageTexts(page, frameEl);
          }
        },
        onWikilinkClick: (linkTarget, event) => {
          this.app.workspace.openLinkText(
            linkTarget,
            this.file?.path || "",
            event.ctrlKey || event.metaKey
          );
        },
        onWikilinkHover: (linkTarget, targetEl, event) => {
          this.app.workspace.trigger("hover-link", {
            event,
            source: "notepages",
            hoverParent: this.rootContainerEl,
            targetEl,
            linktext: linkTarget,
            sourcePath: this.file?.path || ""
          });
        },
        onActiveFormattingChanged: (formatting) => {
          this.syncTextToolbar(formatting);
        },
        onEditingStarted: () => {
          const activeText = this.textController.getActiveText();
          const targetTool: ToolType = activeText?.isSticky ? "sticky" : "text";
          if (this.inkingController.activeTool !== targetTool) {
            this.setActiveTool(targetTool, false);
          }
        },
        getActiveTool: () => this.inkingController.activeTool
      },
      renderMath,
      finishRenderMath
    );

    this.imageController = new ImageController(this.app, {
      onImageAdded: (page, image) => {
        this.historyManager.execute(
          new AddImageCommand(page, image, () => {
            this.handleMutation(page);
            const frameEl = this.getPageFrame(page.pageNumber);
            if (frameEl) {
              this.imageController.renderPageImages(page, frameEl, (p) => this.resolveResourcePath(p));
            }
          })
        );
      },
      onImageModified: (page, prevImage, nextImage) => {
        this.historyManager.execute(
          new ModifyImageCommand(page, prevImage, nextImage, () => {
            this.handleMutation(page);
            const frameEl = this.getPageFrame(page.pageNumber);
            if (frameEl) {
              this.imageController.renderPageImages(page, frameEl, (p) => this.resolveResourcePath(p));
            }
          })
        );
      },
      onImageDeleted: (page, imageId) => {
        const deletedImg = page.images.find((img) => img.id === imageId);
        if (deletedImg) {
          this.historyManager.execute(
            new DeleteElementsCommand(
              page,
              [],
              [],
              () => {
                this.handleMutation(page);
                const frameEl = this.getPageFrame(page.pageNumber);
                if (frameEl) {
                  this.imageController.renderPageImages(page, frameEl, (p) => this.resolveResourcePath(p));
                }
              },
              [],
              [deletedImg]
            )
          );
        }
      },
      getActiveTool: () => this.inkingController.activeTool
    });

    this.pdfBackgroundManager = new PdfBackgroundManager(this.app);

    this.inkingController = new InkingController({
      onStrokeCommitted: (pageId: string, stroke: StrokeObject) => {
        if (!this.pageManager || !this.document) {
          return;
        }
        const page = this.pageManager.getPage(pageId);
        if (page) {
          this.historyManager.execute(
            new AddStrokeCommand(page, stroke, () => {
              this.handleMutation(page);
            })
          );
        }
      },
      onShapeCommitted: (pageId: string, shape: ShapeObject, rawStroke: StrokeObject) => {
        if (!this.pageManager || !this.document) {
          return;
        }
        const page = this.pageManager.getPage(pageId);
        if (page) {
          this.historyManager.execute(
            new ConvertShapeCommand(page, rawStroke, shape, () => {
              this.handleMutation(page);
            })
          );
        }
      },
      onStrokesErased: (pageId: string, remainingStrokes: StrokeObject[]) => {
        if (!this.pageManager || !this.document) {
          return;
        }
        const page = this.pageManager.getPage(pageId);
        if (page) {
          const prevStrokes = [...page.strokes];
          this.historyManager.execute(
            new EraseStrokesCommand(page, prevStrokes, remainingStrokes, () => {
              this.handleMutation(page);
            })
          );
        }
      }
    });

    this.selectionController = new SelectionController({
      onSelectionChanged: (hasSelection: boolean) => {
        this.updateSelectionUi(hasSelection);
      },
      onTransformCommitted: (
        pageId: string,
        prevStrokes: StrokeObject[],
        nextStrokes: StrokeObject[],
        prevShapes: ShapeObject[],
        nextShapes: ShapeObject[],
        prevImages: ImageObject[] = [],
        nextImages: ImageObject[] = [],
        prevTexts: TextObject[] = [],
        nextTexts: TextObject[] = []
      ) => {
        if (!this.pageManager) {
          return;
        }
        const page = this.pageManager.getPage(pageId);
        if (page) {
          this.historyManager.execute(
            new TransformElementsCommand(
              page,
              prevStrokes,
              nextStrokes,
              prevShapes,
              nextShapes,
              () => {
                this.handleMutation(page);
                const frameEl = this.getPageFrame(page.pageNumber);
                if (frameEl) {
                  this.textController.renderPageTexts(page, frameEl);
                  this.imageController.renderPageImages(page, frameEl, (p) => this.resolveResourcePath(p));
                }
              },
              prevImages,
              nextImages,
              prevTexts,
              nextTexts
            )
          );
        }
      },
      onElementsDeleted: (
        pageId: string,
        strokes: StrokeObject[],
        shapes: ShapeObject[],
        texts: TextObject[] = [],
        images: ImageObject[] = []
      ) => {
        if (!this.pageManager) {
          return;
        }
        const page = this.pageManager.getPage(pageId);
        if (page) {
          this.historyManager.execute(
            new DeleteElementsCommand(
              page,
              strokes,
              shapes,
              () => {
                this.handleMutation(page);
                const frameEl = this.getPageFrame(page.pageNumber);
                if (frameEl) {
                  this.textController.renderPageTexts(page, frameEl);
                  this.imageController.renderPageImages(page, frameEl, p => this.resolveResourcePath(p));
                }
              },
              texts,
              images
            )
          );
        }
      },
      onRequestRedraw: (pageId: string) => {
        this.redrawCommittedCanvas(pageId);
        const activeCanvas = this.activeCanvasMap.get(pageId);
        if (activeCanvas && this.selectionController.getActivePageId() !== pageId) {
          const ctx = activeCanvas.getContext("2d");
          ctx?.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
        }
      },
      onElementsMovedAcrossPages: (
        sourcePageId: string,
        targetPageId: string,
        sourceStrokes: StrokeObject[],
        targetStrokes: StrokeObject[],
        sourceShapes: ShapeObject[],
        targetShapes: ShapeObject[],
        sourceImages: ImageObject[] = [],
        targetImages: ImageObject[] = [],
        sourceTexts: TextObject[] = [],
        targetTexts: TextObject[] = []
      ) => {
        if (!this.pageManager || !this.document) {
          return;
        }
        const sourcePage = this.pageManager.getPage(sourcePageId);
        const targetPage = this.pageManager.getPage(targetPageId);
        if (!sourcePage || !targetPage) {
          return;
        }

        this.historyManager.execute(
          new MoveElementsAcrossPagesCommand(
            sourcePage,
            targetPage,
            sourceStrokes,
            targetStrokes,
            sourceShapes,
            targetShapes,
            (src, tgt) => {
              this.redrawCommittedCanvas(src.id);
              this.redrawCommittedCanvas(tgt.id);
              const srcFrame = this.getPageFrame(src.pageNumber);
              if (srcFrame) {
                this.textController.renderPageTexts(src, srcFrame);
                this.imageController.renderPageImages(src, srcFrame, (p) => this.resolveResourcePath(p));
              }
              const tgtFrame = this.getPageFrame(tgt.pageNumber);
              if (tgtFrame) {
                this.textController.renderPageTexts(tgt, tgtFrame);
                this.imageController.renderPageImages(tgt, tgtFrame, (p) => this.resolveResourcePath(p));
              }
              this.updateThumbnailStrokes(src);
              this.updateThumbnailStrokes(tgt);
              if (this.document) {
                this.document.metadata.updatedAt = Date.now();
              }
              this.requestSave();
            },
            sourceImages,
            targetImages,
            sourceTexts,
            targetTexts
          )
        );

        this.updateActivePage(targetPage.pageNumber);
      },
      onMoveStart: (sourcePageId: string, bounds: StrokeBoundingBox) => {
        this.startSelectionDrag(sourcePageId, bounds);
      }
    });

    this.importHandler = new NotePagesImportHandler(this);
    this.sidebar = new NotePagesSidebar(this);
    this.toolbar = new NotePagesToolbar(this);

    this.pageVirtualizer = new PageVirtualizer({
      getTotalPages: () => this.pageManager?.getPages().length ?? 0,
      mountPageCanvases: (pageNumber: number) => {
        this.mountPageCanvases(pageNumber);
      },
      unmountPageCanvases: (pageNumber: number) => {
        this.unmountPageCanvases(pageNumber);
      },
      isPageDrawing: (pageNumber: number) => {
        const page = this.pageManager?.getPageByNumber(pageNumber);
        return page ? this.inkingController.isCurrentlyDrawing(page.id) : false;
      }
    });

    this.inkingController.setPerformanceMonitor(this.performanceMonitor);
  }

  getFile(): TFile | null {
    return this.file;
  }

  getDocument(): NotebookDocument | null {
    return this.document;
  }

  getPageManager(): PageManager | null {
    return this.pageManager;
  }

  getCurrentPageNumber(): number {
    return this.currentPageNumber;
  }

  getPdfBackgroundManager(): PdfBackgroundManager {
    return this.pdfBackgroundManager;
  }

  getImageController(): ImageController {
    return this.imageController;
  }

  getHistoryManager(): HistoryManager {
    return this.historyManager;
  }

  getThumbnailActionsEl(pageId: string): HTMLElement | null {
    return this.sidebar.getThumbnailActionsEl(pageId);
  }

  getViewType(): string {
    return NOTE_PAGES_VIEW_TYPE;
  }

  canAcceptExtension(extension: string): boolean {
    return extension === "gnote" || extension === "notepages";
  }

  async onLoadFile(file: TFile): Promise<void> {
    if (!this.plugin.isNotePagesDocument(file)) {
      if (this.pagesContainerEl) {
        this.pagesContainerEl.empty();
      }
      setTimeout(() => {
        this.leaf.setViewState({
          type: "markdown",
          state: { file: file.path }
        });
      }, 0);
      return;
    }
    await super.onLoadFile(file);
  }

  getDisplayText(): string {
    if (this.file instanceof TFile) {
      return this.file.basename.replace(/\.gnote$/, "");
    }
    if (this.document?.metadata?.title) {
      return this.document.metadata.title;
    }
    return "Obsinotes Notebook";
  }

  getIcon(): string {
    return "notebook-pen";
  }

  async onOpen(): Promise<void> {
    try {
      await loadMathJax();
    } catch {}

    this.contentEl.empty();

    this.rootContainerEl = this.contentEl.createDiv({
      cls: "notepages-view-container"
    });

    this.toolbar.build(this.rootContainerEl);
    this.buildMainArea();
    this.buildStatusArea();
    this.registerKeyboardShortcuts();
  }

  private registerKeyboardShortcuts(): void {
    if (!this.scope) {
      this.scope = new Scope(this.app.scope);
    }

    this.scope.register(["Mod"], "z", (e) => {
      e.preventDefault();
      this.clearActiveSelectionCanvas();
      this.historyManager.undo();
      return false;
    });

    this.scope.register(["Mod", "Shift"], "z", (e) => {
      e.preventDefault();
      this.clearActiveSelectionCanvas();
      this.historyManager.redo();
      return false;
    });

    this.scope.register(["Mod"], "y", (e) => {
      e.preventDefault();
      this.clearActiveSelectionCanvas();
      this.historyManager.redo();
      return false;
    });

    this.scope.register(["Mod"], "d", (e) => {
      if (this.selectionController.hasSelection()) {
        e.preventDefault();
        this.duplicateActiveSelection();
        return false;
      }
      return true;
    });

    this.scope.register(["Mod"], "c", (e) => {
      if (this.selectionController.hasSelection()) {
        e.preventDefault();
        this.copySelection();
        return false;
      }
      return true;
    });

    this.scope.register(["Mod"], "v", (e) => {
      if (this.clipboard) {
        e.preventDefault();
        this.pasteSelection();
        return false;
      }
      return true;
    });

    this.scope.register([], "Delete", (e) => {
      if (this.selectionController.hasSelection()) {
        e.preventDefault();
        this.deleteActiveSelection();
        return false;
      }
      const selectedImgId = this.imageController.getSelectedImageId();
      if (selectedImgId && this.pageManager) {
        const page = this.pageManager.getPageByNumber(this.currentPageNumber);
        if (page) {
          e.preventDefault();
          this.imageController.deselectImage();
          this.imageController.callbacks.onImageDeleted(page, selectedImgId);
          return false;
        }
      }
      return true;
    });

    this.scope.register([], "Backspace", (e) => {
      if (this.textController.isEditing()) {
        return true;
      }
      if (this.selectionController.hasSelection()) {
        e.preventDefault();
        this.deleteActiveSelection();
        return false;
      }
      const selectedImgId = this.imageController.getSelectedImageId();
      if (selectedImgId && this.pageManager) {
        const page = this.pageManager.getPageByNumber(this.currentPageNumber);
        if (page) {
          e.preventDefault();
          this.imageController.deselectImage();
          this.imageController.callbacks.onImageDeleted(page, selectedImgId);
          return false;
        }
      }
      return true;
    });

    const toolHotkeys: { key: string; tool: ToolType }[] = [
      { key: "v", tool: "select" },
      { key: "p", tool: "pressure" },
      { key: "h", tool: "highlighter" },
      { key: "e", tool: "eraser" },
      { key: "s", tool: "shape" },
      { key: "l", tool: "connector" },
      { key: "n", tool: "sticky" },
      { key: "t", tool: "text" },
      { key: "q", tool: "lasso" }
    ];

    for (const mapping of toolHotkeys) {
      this.scope.register([], mapping.key, (e) => {
        if (this.textController.isEditing()) {
          return true;
        }
        e.preventDefault();
        this.setActiveTool(mapping.tool);
        return false;
      });
    }

    this.scope.register([], "i", (e) => {
      if (this.textController.isEditing()) {
        return true;
      }
      e.preventDefault();
      this.openImagePicker();
      return false;
    });

    this.scope.register([], "b", (e) => {
      if (this.textController.isEditing()) {
        return true;
      }
      e.preventDefault();
      this.toggleSidebar();
      return false;
    });

    this.scope.register([], "r", (e) => {
      if (this.textController.isEditing()) {
        return true;
      }
      e.preventDefault();
      if (this.pageManager) {
        const curr = this.pageManager.getNotebookOrientation();
        const next: PageOrientation = curr === "portrait" ? "landscape" : "portrait";
        this.pageManager.updateAllPagesOrientation(next);
        this.updateOrientationButtonDisplay(next);
        this.renderDocument();
        this.requestSave();
        new Notice(`Updated orientation to ${next.toUpperCase()} for all pages`);
      }
      return false;
    });

    this.scope.register([], "a", (e) => {
      if (this.textController.isEditing()) {
        return true;
      }
      e.preventDefault();
      this.addNewPage();
      return false;
    });

    this.scope.register([], "=", (e) => {
      if (this.textController.isEditing()) {
        return true;
      }
      e.preventDefault();
      this.changeZoom(0.1);
      return false;
    });

    this.scope.register([], "+", (e) => {
      if (this.textController.isEditing()) {
        return true;
      }
      e.preventDefault();
      this.changeZoom(0.1);
      return false;
    });

    this.scope.register([], "-", (e) => {
      if (this.textController.isEditing()) {
        return true;
      }
      e.preventDefault();
      this.changeZoom(-0.1);
      return false;
    });

    this.scope.register([], "0", (e) => {
      if (this.textController.isEditing()) {
        return true;
      }
      e.preventDefault();
      this.resetZoom();
      return false;
    });

    this.scope.register([], "Escape", (e) => {
      if (this.selectionController.hasSelection()) {
        e.preventDefault();
        this.clearActiveSelectionCanvas();
        return false;
      }
      const selectedImgId = this.imageController.getSelectedImageId();
      if (selectedImgId && this.pageManager) {
        this.imageController.deselectImage();
        const page = this.pageManager.getPageByNumber(this.currentPageNumber);
        const frameEl = page ? this.getPageFrame(page.pageNumber) : null;
        if (page && frameEl) {
          this.imageController.renderPageImages(page, frameEl, (p) => this.resolveResourcePath(p));
        }
        return false;
      }
      return true;
    });
  }

  async onClose(): Promise<void> {
    if (this.saveStatusResetTimer !== null) {
      window.clearTimeout(this.saveStatusResetTimer);
      this.saveStatusResetTimer = null;
    }
    this.pageIntersectionObserver?.disconnect();
    this.pageIntersectionObserver = null;
    this.pageVirtualizer.destroy();
    this.sidebar.destroy();
    this.pdfBackgroundManager.destroy();
    this.document = null;
    this.pageManager = null;
    this.committedCanvasMap.clear();
    this.activeCanvasMap.clear();
    this.templateCanvasMap.clear();
    this.contentEl.empty();
  }

  clear(): void {
    this.pageIntersectionObserver?.disconnect();
    this.pageVirtualizer.destroy();
    this.sidebar.clear();
    this.pdfBackgroundManager.destroy();
    this.document = null;
    this.pageManager = null;
    this.pageElements.clear();
    this.committedCanvasMap.clear();
    this.activeCanvasMap.clear();
    this.templateCanvasMap.clear();

    if (this.pagesContainerEl) {
      this.pagesContainerEl.empty();
      const loadingEl = this.pagesContainerEl.createDiv({
        cls: "notepages-loading-container"
      });
      loadingEl.createDiv({
        cls: "notepages-loading-spinner"
      });
      loadingEl.createSpan({
        cls: "notepages-loading-text",
        text: "Loading notebook..."
      });
    }
    this.updateStatusDisplay();
  }

  getViewData(): string {
    if (this.isCorrupted) {
      return this.rawCorruptedData;
    }
    if (!this.document) {
      this.document = this.createDefaultDocument();
      this.pageManager = new PageManager(this.document);
    }
    return DocumentSerializer.serializeDocument(this.document);
  }

  setViewData(data: string, clear: boolean): void {
    if (this.file && !this.plugin.isNotePagesDocument(this.file)) {
      if (this.pagesContainerEl) {
        this.pagesContainerEl.empty();
      }
      setTimeout(() => {
        this.leaf.setViewState({
          type: "markdown",
          state: { file: this.file?.path }
        });
      }, 0);
      return;
    }

    if (clear) {
      this.clear();
    }

    const trimmed = data.trim();
    if (trimmed.length === 0) {
      this.isCorrupted = false;
      this.rawCorruptedData = "";
      this.corruptionError = "";
      if (this.file) {
        this.storageManager.clearCorrupted(this.file.path);
      }
      this.document = this.createDefaultDocument();
      this.pageManager = new PageManager(this.document);
      this.renderDocument();
      return;
    }

    const result = DocumentSerializer.deserializeDocument(data);
    if (!result.success) {
      this.isCorrupted = true;
      this.rawCorruptedData = data;
      this.corruptionError = result.error;
      if (this.file) {
        this.storageManager.markCorrupted(this.file.path);
      }
      this.renderCorruptedView(result.error);
      return;
    }

    this.isCorrupted = false;
    this.rawCorruptedData = "";
    this.corruptionError = "";
    if (this.file) {
      this.storageManager.clearCorrupted(this.file.path);
    }
    this.document = result.document;
    this.pageManager = new PageManager(this.document);
    this.renderDocument();
  }

  private renderCorruptedView(errorMessage: string): void {
    this.pagesContainerEl.empty();
    this.sidebar.clear();
    if (this.statusSaveInfoEl) {
      this.statusSaveInfoEl.setText("Protected (Read-only)");
      this.statusSaveInfoEl.addClass("notepages-status-error");
    }

    const banner = this.pagesContainerEl.createDiv({
      cls: "notepages-corrupted-banner"
    });

    banner.createEl("h3", {
      text: "Obsinotes Safe Mode: Data Protection Activated"
    });

    banner.createEl("p", {
      text: "The document structure could not be parsed safely. To prevent data loss or irreversible file damage, automatic saving has been locked."
    });

    const errorDetails = banner.createDiv({
      cls: "notepages-corrupted-error-details"
    });
    errorDetails.createEl("strong", { text: "Error: " });
    errorDetails.createSpan({ text: errorMessage });

    const actions = banner.createDiv({
      cls: "notepages-corrupted-actions"
    });

    const rawBtn = actions.createEl("button", {
      text: "Open as Raw Markdown",
      cls: "mod-cta"
    });
    this.registerDomEvent(rawBtn, "click", async () => {
      if (this.file) {
        await this.leaf.setViewState({
          type: "markdown",
          state: { file: this.file.path }
        });
      }
    });

    const emergencyBackupBtn = actions.createEl("button", {
      text: "Create Emergency Backup Copy"
    });
    this.registerDomEvent(emergencyBackupBtn, "click", async () => {
      if (this.file) {
        const backupInfo = await this.storageManager.createEmergencyBackup(this.file, this.rawCorruptedData);
        new Notice(`Emergency backup saved to: ${backupInfo.backupPath}`);
      }
    });

    const overwriteBtn = actions.createEl("button", {
      text: "Discard and Reset to New Notebook",
      cls: "mod-warning"
    });
    this.registerDomEvent(overwriteBtn, "click", () => {
      if (confirm("Are you sure you want to discard the corrupted document and reset? This cannot be undone.")) {
        this.isCorrupted = false;
        if (this.file) {
          this.storageManager.clearCorrupted(this.file.path);
        }
        if (this.statusSaveInfoEl) {
          this.statusSaveInfoEl.removeClass("notepages-status-error");
        }
        this.document = this.createDefaultDocument();
        this.pageManager = new PageManager(this.document);
        this.renderDocument();
        this.requestSave();
      }
    });
  }

  onToggleSidebar(): void {
    this.toggleSidebar();
  }

  onUndo(): void {
    this.clearActiveSelectionCanvas();
    this.historyManager.undo();
  }

  onRedo(): void {
    this.clearActiveSelectionCanvas();
    this.historyManager.redo();
  }

  onSelectTool(tool: ToolType): void {
    this.setActiveTool(tool);
  }

  onSelectColor(color: string): void {
    this.setActiveColor(color);
  }

  onSelectWidth(width: number): void {
    this.setActiveWidth(width);
  }

  onSelectEraserMode(mode: EraserMode): void {
    this.setEraserMode(mode);
  }

  onDuplicateSelection(): void {
    this.duplicateActiveSelection();
  }

  onDeleteSelection(): void {
    this.deleteActiveSelection();
  }

  onSelectPaperTemplate(type: PaperTemplateType): void {
    if (this.pageManager) {
      const tpl = this.pageManager.getNotebookTemplate();
      this.pageManager.updateAllPagesTemplate({
        ...tpl,
        type
      });
      this.toolbar.updatePaperTemplateButtons(type);
      this.renderDocument();
      this.requestSave();
      new Notice(`Applied ${type} paper to all pages`);
    }
  }

  onToggleOrientation(): void {
    if (this.pageManager) {
      const curr = this.pageManager.getNotebookOrientation();
      const next: PageOrientation = curr === "portrait" ? "landscape" : "portrait";
      this.pageManager.updateAllPagesOrientation(next);
      this.toolbar.updateOrientationButtonDisplay(next);
      this.renderDocument();
      this.requestSave();
      new Notice(`Updated orientation to ${next.toUpperCase()} for all pages`);
    }
  }

  onChangeZoom(delta: number): void {
    this.changeZoom(delta);
  }

  onResetZoom(): void {
    this.resetZoom();
  }

  onOpenPdfPicker(): void {
    this.openPdfPicker();
  }

  onExportNotebook(): void {
    this.openExportModal();
  }

  onAddNewPage(): void {
    this.addNewPage();
  }

  onDuplicateCurrentPage(): void {
    this.duplicateCurrentPage();
  }

  onDeleteCurrentPage(): void {
    this.deleteCurrentPage();
  }

  onTextSizeChanged(size: number): void {
    this.currentTextOptions.fontSize = size;
    if (this.textController.isEditing()) {
      this.textController.updateActiveFormatting({ fontSize: size });
    }
  }

  onTextBoldToggled(): void {
    const isBold = this.currentTextOptions.fontWeight === "bold";
    this.currentTextOptions.fontWeight = isBold ? "normal" : "bold";
    if (this.textController.isEditing()) {
      this.textController.updateActiveFormatting({ fontWeight: this.currentTextOptions.fontWeight });
    }
  }

  onTextItalicToggled(): void {
    this.currentTextOptions.italic = !this.currentTextOptions.italic;
    if (this.textController.isEditing()) {
      this.textController.updateActiveFormatting({ italic: this.currentTextOptions.italic });
    }
  }

  onTextUnderlineToggled(): void {
    this.currentTextOptions.underline = !this.currentTextOptions.underline;
    if (this.textController.isEditing()) {
      this.textController.updateActiveFormatting({ underline: this.currentTextOptions.underline });
    }
  }

  onTextAlignChanged(align: "left" | "center" | "right"): void {
    this.currentTextOptions.textAlign = align;
    if (this.textController.isEditing()) {
      this.textController.updateActiveFormatting({ textAlign: align });
    }
  }

  onTextDone(): void {
    if (this.textController.isEditing()) {
      this.textController.commitActiveEdit();
    }
  }

  onSelectShapeType(shape: ShapeType): void {
    this.currentShapeType = shape;
  }

  onToggleShapeFill(): boolean {
    this.shapeFillEnabled = !this.shapeFillEnabled;
    return this.shapeFillEnabled;
  }

  onSelectStickyColor(color: string): void {
    this.currentStickyColor = color;
    if (this.textController.isEditing()) {
      this.textController.updateActiveFormatting({ backgroundColor: color });
    } else if (this.selectionController.hasSelection() && this.pageManager) {
      const pageId = this.selectionController.getActivePageId();
      if (pageId) {
        const page = this.pageManager.getPage(pageId);
        const activeCanvas = this.activeCanvasMap.get(pageId);
        if (page && activeCanvas) {
          this.selectionController.changeColor(color, page, activeCanvas);
        }
      }
    }
  }

  getNotebookTemplate(): { type: PaperTemplateType } {
    return this.pageManager ? this.pageManager.getNotebookTemplate() : { type: "ruled" as PaperTemplateType };
  }

  getNotebookOrientation(): PageOrientation {
    return this.pageManager ? this.pageManager.getNotebookOrientation() : "portrait";
  }

  getZoomLevel(): number {
    return this.zoomLevel;
  }

  getActiveTool(): ToolType {
    return this.inkingController.activeTool;
  }

  getActiveColor(): string {
    return this.inkingController.currentColor;
  }

  getActiveWidth(): number {
    return this.inkingController.currentWidth;
  }

  getCurrentShapeType(): ShapeType {
    return this.currentShapeType;
  }

  isShapeFillEnabled(): boolean {
    return this.shapeFillEnabled;
  }

  getCurrentStickyColor(): string {
    return this.currentStickyColor;
  }

  getTextOptions(): {
    fontSize: number;
    fontWeight: string;
    italic: boolean;
    underline: boolean;
    textAlign: "left" | "center" | "right";
  } {
    return this.currentTextOptions;
  }

  private buildMainArea(): void {
    this.mainAreaEl = this.rootContainerEl.createDiv({
      cls: "notepages-main-area"
    });

    this.sidebar.build(this.mainAreaEl);

    this.scrollerEl = this.mainAreaEl.createDiv({
      cls: "notepages-scroller"
    });
    this.registerDomEvent(this.scrollerEl, "scroll", () => {
      this.handleScroll();
    });

    this.registerDomEvent(this.scrollerEl, "pointerdown", (e: PointerEvent) => {
      if (this.isPanTrigger(e) || e.target === this.scrollerEl || e.target === this.pagesContainerEl) {
        if (this.textController.isEditing()) {
          this.textController.commitActiveEdit();
        }
        if (this.isPanTrigger(e) || (this.inkingController.activeTool === "select" && e.button === 0)) {
          this.startPan(e.clientX, e.clientY, this.scrollerEl, e.pointerId);
          e.preventDefault();
        }
      }
    });

    this.registerDomEvent(this.scrollerEl, "contextmenu", (e: MouseEvent) => {
      if (this.isPanning) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      const menu = new Menu();

      const hasSelection = this.selectionController.hasSelection();
      if (hasSelection) {
        menu.addItem((item) => {
          item
            .setTitle("Delete selected")
            .setIcon("trash")
            .onClick(() => {
              this.deleteActiveSelection();
            });
        });
        menu.addItem((item) => {
          item
            .setTitle("Clear selection")
            .setIcon("x")
            .onClick(() => {
              this.selectionController.clearSelection();
            });
        });
        menu.addSeparator();
      }

      menu.addItem((item) => {
        item
          .setTitle("Add text box")
          .setIcon("type")
          .onClick(() => {
            this.insertTextBox();
          });
      });

      menu.addItem((item) => {
        item
          .setTitle("Add sticky note")
          .setIcon("sticky-note")
          .onClick(() => {
            this.insertStickyNote();
          });
      });

      menu.addItem((item) => {
        item
          .setTitle("Insert image...")
          .setIcon("image")
          .onClick(() => {
            this.openImagePicker();
          });
      });

      menu.addItem((item) => {
        item
          .setTitle("Import PDF / SVG...")
          .setIcon("file-text")
          .onClick(() => {
            this.openPdfPicker(false);
          });
      });

      menu.addSeparator();

      menu.addItem((item) => {
        item
          .setTitle("Add page below")
          .setIcon("plus")
          .onClick(() => {
            this.addNewPage();
          });
      });

      menu.addItem((item) => {
        item
          .setTitle("Duplicate current page")
          .setIcon("copy")
          .onClick(() => {
            this.duplicateCurrentPage();
          });
      });

      menu.addSeparator();

      menu.addItem((item) => {
        item
          .setTitle("Export notebook...")
          .setIcon("file-down")
          .onClick(() => {
            this.openExportModal();
          });
      });

      menu.showAtMouseEvent(e);
    });

    this.registerDomEvent(this.scrollerEl, "wheel", (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        this.changeZoom(delta);
      }
    }, { passive: false });

    this.registerDomEvent(this.scrollerEl, "dragover", (e: DragEvent) => {
      if (e.dataTransfer && e.dataTransfer.types.includes("Files")) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }
    });

    this.registerDomEvent(this.scrollerEl, "drop", async (e: DragEvent) => {
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
          e.preventDefault();
          e.stopPropagation();
          await this.promptAndImportLocalPdf(file, false, this.currentPageNumber);
        }
      } else {
        const textData = e.dataTransfer?.getData("text/plain") || "";
        const match = textData.match(/^\[\[(.*?)\]\]$/) || textData.match(/^(.*\.pdf)$/i);
        if (match) {
          const cleanPath = match[1].replace(/\|.*$/, "");
          const linkedFile = this.app.metadataCache.getFirstLinkpathDest(cleanPath, this.file?.path || "");
          if (linkedFile && linkedFile.extension.toLowerCase() === "pdf") {
            e.preventDefault();
            e.stopPropagation();
            await this.promptAndImportVaultPdf(linkedFile, false, this.currentPageNumber);
          }
        }
      }
    });

    this.pagesContainerEl = this.scrollerEl.createDiv({
      cls: "notepages-pages-container"
    });

    this.pageVirtualizer.initialize(this.scrollerEl);

    if (typeof IntersectionObserver !== "undefined") {
      this.pageIntersectionObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const target = entry.target as HTMLElement;
            const pageNumber = Number(target.dataset.pageNumber);
            const page = this.pageManager?.getPageByNumber(pageNumber);
            if (!page || !page.pdfSource || Boolean(page.pdfSource.svgPath)) {
              continue;
            }
            const frameEl = target.querySelector(".notepages-page-frame") as HTMLElement | null;
            if (!frameEl) {
              continue;
            }
            if (entry.isIntersecting) {
              this.pdfBackgroundManager.renderPdfBackground(page, frameEl, () => {
                this.updateThumbnailStrokes(page);
              });
            } else {
              this.pdfBackgroundManager.unrenderPdfBackground(page, frameEl);
            }
          }
        },
        {
          root: this.scrollerEl,
          rootMargin: "800px 0px"
        }
      );
    }

    this.ensureDragOverlay();

    this.registerDomEvent(window, "pointermove", (e: PointerEvent) => {
      if (this.isPanning) {
        this.updatePan(e.clientX, e.clientY);
        return;
      }
      if (this.isDraggingSelection) {
        this.updateSelectionDrag(e.clientX, e.clientY);
      }
    });

    this.registerDomEvent(window, "pointerup", (e: PointerEvent) => {
      if (this.isPanning) {
        this.finishPan();
        return;
      }
      if (this.isDraggingSelection) {
        this.finishSelectionDrag(e.clientX, e.clientY);
      }
    });

    this.registerDomEvent(window, "pointercancel", () => {
      if (this.isPanning) {
        this.finishPan();
        return;
      }
      if (this.isDraggingSelection) {
        this.cancelSelectionDrag();
      }
    });

    this.registerDomEvent(window, "keydown", (e: KeyboardEvent) => {
      if (e.code === "Space") {
        if (this.textController.isEditing()) {
          return;
        }
        const targetTag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
        if (targetTag === "input" || targetTag === "textarea" || targetTag === "select") {
          return;
        }
        if (!this.isSpacePressed) {
          this.isSpacePressed = true;
          this.rootContainerEl.addClass("is-space-panning");
          e.preventDefault();
        }
      }
    });

    this.registerDomEvent(window, "keyup", (e: KeyboardEvent) => {
      if (e.code === "Space") {
        this.isSpacePressed = false;
        this.rootContainerEl.removeClass("is-space-panning");
        if (this.inkingController.activeTool !== "select") {
          this.finishPan();
        }
      }
    });

    this.registerDomEvent(this.rootContainerEl, "paste", async (e: ClipboardEvent) => {
      if (this.textController.isEditing()) {
        return;
      }
      const items = e.clipboardData?.items;
      if (!items) {
        return;
      }
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file && this.pageManager) {
            e.preventDefault();
            const currentPage = this.pageManager.getPageByNumber(this.currentPageNumber);
            if (currentPage) {
              const savedPath = await this.imageController.saveBlobToVault(
                file,
                "pasted_image",
                this.file?.path || ""
              );
              const resourceUrl = this.resolveResourcePath(savedPath);
              const naturalDims = await ImageController.getImageNaturalDimensions(resourceUrl);
              const fittedDims = ImageController.calculateFittedDimensions(
                naturalDims.width,
                naturalDims.height,
                Math.min(450, currentPage.dimensions.width - 80),
                Math.min(450, currentPage.dimensions.height - 80)
              );
              const posX = Math.max(20, Math.round((currentPage.dimensions.width - fittedDims.width) / 2));
              const posY = Math.max(50, Math.round((currentPage.dimensions.height - fittedDims.height) / 2));
              const imgObj = this.imageController.createImageObject(
                savedPath,
                posX,
                posY,
                fittedDims.width,
                fittedDims.height
              );
              this.historyManager.execute(
                new AddImageCommand(currentPage, imgObj, () => {
                  this.handleMutation(currentPage);
                  const frameEl = this.getPageFrame(currentPage.pageNumber);
                  if (frameEl) {
                    this.imageController.renderPageImages(currentPage, frameEl, p => this.resolveResourcePath(p));
                  }
                })
              );
              new Notice("Pasted image into notebook");
            }
          }
          break;
        } else if (item.type === "application/pdf") {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            await this.promptAndImportLocalPdf(file);
            break;
          }
        }
      }
    });
  }

  private buildStatusArea(): void {
    this.statusAreaEl = this.rootContainerEl.createDiv({
      cls: "notepages-status-area"
    });

    this.statusPageInfoEl = this.statusAreaEl.createDiv({
      cls: "notepages-status-item"
    });

    this.statusToolInfoEl = this.statusAreaEl.createDiv({
      cls: "notepages-status-item"
    });

    this.statusZoomInfoEl = this.statusAreaEl.createDiv({
      cls: "notepages-status-item"
    });

    this.statusSaveInfoEl = this.statusAreaEl.createDiv({
      cls: "notepages-status-item"
    });

    this.updateStatusDisplay();
  }

  private setActiveTool(tool: ToolType, commitPendingText: boolean = true): void {
    if (commitPendingText && this.textController.isEditing()) {
      this.textController.commitActiveEdit();
    }

    this.imageController.deselectImage();

    if (tool === "image") {
      this.openImagePicker();
      return;
    }

    if (this.inkingController.activeTool === "lasso" && tool !== "lasso") {
      this.clearActiveSelectionCanvas();
    }

    this.inkingController.setTool(tool);

    if (this.document && this.pageManager) {
      this.document.pages.forEach((p) => {
        const frameEl = this.getPageFrame(p.pageNumber);
        if (frameEl) {
          this.imageController.renderPageImages(p, frameEl, (path) => this.resolveResourcePath(path));
          this.textController.renderPageTexts(p, frameEl);
        }
      });
    }

    this.rootContainerEl.toggleClass("is-tool-select", tool === "select");
    this.toolbar.setActiveTool(tool, this.currentShapeType, this.selectionController.hasSelection());
    this.updateStatusDisplay();
  }

  private setActiveColor(color: string): void {
    this.inkingController.setColor(color);
    this.currentTextOptions.color = color;
    this.toolbar.setActiveColor(color);

    if (this.textController.isEditing()) {
      this.textController.updateActiveFormatting({ color });
    }

    if (this.selectionController.hasSelection() && this.pageManager) {
      const pageId = this.selectionController.getActivePageId();
      if (pageId) {
        const page = this.pageManager.getPage(pageId);
        const activeCanvas = this.activeCanvasMap.get(pageId);
        if (page && activeCanvas) {
          this.selectionController.changeColor(color, page, activeCanvas);
        }
      }
    }
  }

  private syncTextToolbar(formatting: {
    fontSize: number;
    fontWeight: string;
    italic: boolean;
    underline: boolean;
    textAlign: "left" | "center" | "right";
    color: string;
  }): void {
    this.currentTextOptions = { ...formatting };
    this.toolbar.syncTextToolbar(formatting);
  }

  private setActiveWidth(width: number): void {
    this.inkingController.setWidth(width);
    this.toolbar.setActiveWidth(width);

    if (this.selectionController.hasSelection() && this.pageManager) {
      const pageId = this.selectionController.getActivePageId();
      if (pageId) {
        const page = this.pageManager.getPage(pageId);
        const activeCanvas = this.activeCanvasMap.get(pageId);
        if (page && activeCanvas) {
          this.selectionController.changeWidth(width, page, activeCanvas);
        }
      }
    }
  }

  private updateHistoryButtons(canUndo: boolean, canRedo: boolean): void {
    this.toolbar.updateHistoryButtons(canUndo, canRedo);
  }

  private updateSelectionUi(hasSelection: boolean): void {
    this.toolbar.updateSelectionUi(hasSelection);
  }

  private clearActiveSelectionCanvas(): void {
    if (this.selectionController.hasSelection()) {
      const pageId = this.selectionController.getActivePageId();
      if (pageId) {
        const activeCanvas = this.activeCanvasMap.get(pageId);
        if (activeCanvas) {
          this.selectionController.clearSelection(activeCanvas);
          return;
        }
      }
      this.selectionController.clearSelection();
    }
  }

  private redrawCommittedCanvas(pageId: string): void {
    if (!this.pageManager) {
      return;
    }
    const page = this.pageManager.getPage(pageId);
    if (!page) {
      return;
    }
    const canvas = this.committedCanvasMap.get(pageId);
    if (!canvas) {
      return;
    }

    const isCurrentPageSelected = this.selectionController.getActivePageId() === pageId;
    const selectedStrokeIds = new Set(
      isCurrentPageSelected
        ? this.selectionController.getSelectedStrokes().map((s) => s.id)
        : []
    );
    const selectedShapeIds = new Set(
      isCurrentPageSelected
        ? this.selectionController.getSelectedShapes().map((sh) => sh.id)
        : []
    );

    const visibleStrokes = page.strokes.filter((s) => !selectedStrokeIds.has(s.id));
    const visibleShapes = page.shapes.filter((sh) => !selectedShapeIds.has(sh.id));

    this.inkingController.redrawCommittedStrokes(
      canvas,
      page.dimensions,
      visibleStrokes,
      visibleShapes
    );
  }

  handleMutation(page: PageData): void {
    if (this.document) {
      this.document.metadata.updatedAt = Date.now();
    }
    this.redrawCommittedCanvas(page.id);
    this.updateThumbnailStrokes(page);
    this.requestSave();
  }

  private getTargetPageForClientPoint(clientX: number, clientY: number): {
    page: PageData;
    activeCanvas: HTMLCanvasElement;
    pointOnPage: { x: number; y: number };
  } | null {
    if (!this.pageManager) {
      return null;
    }
    const pages = this.pageManager.getPages();
    if (pages.length === 0) {
      return null;
    }

    let closestPage: PageData = pages[0];
    let closestCanvas: HTMLCanvasElement | null = this.activeCanvasMap.get(pages[0].id) || null;
    let minDistance = Number.POSITIVE_INFINITY;

    for (const page of pages) {
      const canvas = this.activeCanvasMap.get(page.id);
      if (!canvas) {
        continue;
      }
      const rect = canvas.getBoundingClientRect();

      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        const scaleX = page.dimensions.width / rect.width;
        const scaleY = page.dimensions.height / rect.height;
        return {
          page,
          activeCanvas: canvas,
          pointOnPage: {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
          }
        };
      }

      const clampedX = Math.max(rect.left, Math.min(clientX, rect.right));
      const clampedY = Math.max(rect.top, Math.min(clientY, rect.bottom));
      const dx = clientX - clampedX;
      const dy = clientY - clampedY;
      const dist = dx * dx + dy * dy;

      if (dist < minDistance) {
        minDistance = dist;
        closestPage = page;
        closestCanvas = canvas;
      }
    }

    if (!closestCanvas) {
      return null;
    }
    const rect = closestCanvas.getBoundingClientRect();
    const scaleX = closestPage.dimensions.width / rect.width;
    const scaleY = closestPage.dimensions.height / rect.height;

    return {
      page: closestPage,
      activeCanvas: closestCanvas,
      pointOnPage: {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      }
    };
  }

  ensureDragOverlay(): void {
    if (!this.pagesContainerEl) {
      return;
    }
    if (!this.dragOverlayEl || this.dragOverlayEl.parentElement !== this.pagesContainerEl) {
      if (this.dragOverlayEl && this.dragOverlayEl.parentElement) {
        this.dragOverlayEl.remove();
      }
      this.dragOverlayEl = this.pagesContainerEl.createDiv({
        cls: "notepages-drag-overlay"
      });
      this.dragOverlayEl.style.display = "none";
      this.dragOverlayCanvas = this.dragOverlayEl.createEl("canvas", {
        cls: "notepages-drag-canvas"
      });
    }
  }

  private startSelectionDrag(sourcePageId: string, bounds: StrokeBoundingBox): void {
    this.ensureDragOverlay();
    if (!this.pageManager || !this.dragOverlayEl || !this.dragOverlayCanvas) {
      return;
    }
    const sourcePage = this.pageManager.getPage(sourcePageId);
    if (!sourcePage) {
      return;
    }

    const containerRect = this.pagesContainerEl.getBoundingClientRect();
    const canvas = this.activeCanvasMap.get(sourcePage.id);
    const pageWrapper = this.pageElements.get(sourcePage.pageNumber);
    if (!canvas && !pageWrapper) {
      return;
    }
    const pageRect = canvas ? canvas.getBoundingClientRect() : pageWrapper!.getBoundingClientRect();
    const pageLeft = (pageRect.left - containerRect.left) / this.zoomLevel;
    const pageTop = (pageRect.top - containerRect.top) / this.zoomLevel;

    const boxWidth = Math.max(1, bounds.maxX - bounds.minX);
    const boxHeight = Math.max(1, bounds.maxY - bounds.minY);
    const padding = 16;
    const canvasWidth = Math.ceil(boxWidth + padding * 2);
    const canvasHeight = Math.ceil(boxHeight + padding * 2);

    this.dragOverlayCanvas.width = canvasWidth;
    this.dragOverlayCanvas.height = canvasHeight;
    this.dragOverlayCanvas.style.width = `${canvasWidth}px`;
    this.dragOverlayCanvas.style.height = `${canvasHeight}px`;

    const ctx = this.dragOverlayCanvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      ctx.save();
      ctx.translate(padding - bounds.minX, padding - bounds.minY);

      for (const stroke of this.selectionController.getSelectedStrokes()) {
        StrokeGeometry.renderStroke(ctx, stroke);
      }
      for (const shape of this.selectionController.getSelectedShapes()) {
        ShapeRecognizer.renderShape(ctx, shape);
      }
      this.selectionController.renderSelectionDashedBox(ctx, bounds);

      ctx.restore();
    }

    const initialOverlayX = pageLeft + bounds.minX - padding;
    const initialOverlayY = pageTop + bounds.minY - padding;

    this.dragOverlayEl.style.transform = `translate3d(${initialOverlayX}px, ${initialOverlayY}px, 0)`;
    this.dragOverlayEl.style.display = "block";

    const sourceCanvas = this.activeCanvasMap.get(sourcePageId);
    if (sourceCanvas) {
      const srcCtx = sourceCanvas.getContext("2d");
      srcCtx?.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    }

    this.isDraggingSelection = true;
    this.dragInitialOverlayX = initialOverlayX;
    this.dragInitialOverlayY = initialOverlayY;
    this.dragOverlayPadding = padding;
    this.dragBoxWidth = boxWidth;
    this.dragBoxHeight = boxHeight;
  }

  private updateSelectionDrag(clientX: number, clientY: number): void {
    if (!this.isDraggingSelection || !this.dragOverlayEl) {
      return;
    }
    const dx = (clientX - this.dragStartClientX) / this.zoomLevel;
    const dy = (clientY - this.dragStartClientY) / this.zoomLevel;
    const currentX = this.dragInitialOverlayX + dx;
    const currentY = this.dragInitialOverlayY + dy;
    this.dragOverlayEl.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
  }

  private finishSelectionDrag(clientX: number, clientY: number): void {
    if (!this.isDraggingSelection || !this.dragOverlayEl) {
      return;
    }
    this.isDraggingSelection = false;
    this.dragOverlayEl.style.display = "none";

    const dx = (clientX - this.dragStartClientX) / this.zoomLevel;
    const dy = (clientY - this.dragStartClientY) / this.zoomLevel;

    const finalContainerBoxMinX = this.dragInitialOverlayX + dx + this.dragOverlayPadding;
    const finalContainerBoxMinY = this.dragInitialOverlayY + dy + this.dragOverlayPadding;
    const finalContainerBoxCenterX = finalContainerBoxMinX + this.dragBoxWidth / 2;
    const finalContainerBoxCenterY = finalContainerBoxMinY + this.dragBoxHeight / 2;

    const targetInfo = this.findPageAtContainerPoint(
      finalContainerBoxCenterX,
      finalContainerBoxCenterY
    );
    if (!targetInfo) {
      return;
    }

    const { page: targetPage, pageLeft, pageTop } = targetInfo;
    const targetPageMinX = finalContainerBoxMinX - pageLeft;
    const targetPageMinY = finalContainerBoxMinY - pageTop;

    const margin = 10;
    let clampedMinX = Math.max(margin, Math.min(targetPageMinX, targetPage.dimensions.width - this.dragBoxWidth - margin));
    let clampedMinY = Math.max(margin, Math.min(targetPageMinY, targetPage.dimensions.height - this.dragBoxHeight - margin));
    if (this.dragBoxWidth > targetPage.dimensions.width - margin * 2) clampedMinX = margin;
    if (this.dragBoxHeight > targetPage.dimensions.height - margin * 2) clampedMinY = margin;

    const targetBox: StrokeBoundingBox = {
      minX: clampedMinX,
      minY: clampedMinY,
      maxX: clampedMinX + this.dragBoxWidth,
      maxY: clampedMinY + this.dragBoxHeight
    };

    const targetCanvas = this.activeCanvasMap.get(targetPage.id);
    if (targetCanvas) {
      this.selectionController.commitMove(targetPage, targetBox, targetCanvas);
    }
  }

  private cancelSelectionDrag(): void {
    if (!this.isDraggingSelection || !this.dragOverlayEl) {
      return;
    }
    this.isDraggingSelection = false;
    this.dragOverlayEl.style.display = "none";
    const activePageId = this.selectionController.getActivePageId();
    if (activePageId) {
      const canvas = this.activeCanvasMap.get(activePageId);
      const bounds = this.selectionController.getCombinedBounds();
      if (canvas && bounds) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          this.selectionController.renderSelectionOverlay(ctx, canvas, bounds);
        }
      }
    }
  }

  private findPageAtContainerPoint(
    _containerX: number,
    containerY: number
  ): { page: PageData; pageLeft: number; pageTop: number } | null {
    if (!this.pageManager) {
      return null;
    }
    const pages = this.pageManager.getPages();
    if (pages.length === 0) {
      return null;
    }

    const containerRect = this.pagesContainerEl.getBoundingClientRect();
    let closestPage = pages[0];
    let closestLeft = 0;
    let closestTop = 0;
    let minDistance = Number.POSITIVE_INFINITY;

    for (const page of pages) {
      const canvas = this.activeCanvasMap.get(page.id);
      if (!canvas) {
        continue;
      }
      const canvasRect = canvas.getBoundingClientRect();
      const pageLeft = (canvasRect.left - containerRect.left) / this.zoomLevel;
      const pageTop = (canvasRect.top - containerRect.top) / this.zoomLevel;
      const pageBottom = pageTop + page.dimensions.height;

      if (containerY >= pageTop && containerY <= pageBottom) {
        return { page, pageLeft, pageTop };
      }

      const pageCenterY = pageTop + page.dimensions.height / 2;
      const distY = Math.abs(containerY - pageCenterY);
      if (distY < minDistance) {
        minDistance = distY;
        closestPage = page;
        closestLeft = pageLeft;
        closestTop = pageTop;
      }
    }

    return { page: closestPage, pageLeft: closestLeft, pageTop: closestTop };
  }

  private duplicateActiveSelection(): void {
    if (!this.selectionController.hasSelection() || !this.pageManager || !this.document) {
      return;
    }

    const pageId = this.selectionController.getActivePageId();
    if (!pageId) return;
    const page = this.pageManager.getPage(pageId);
    if (!page) return;

    const offset = 20;
    const clonedStrokes: StrokeObject[] = this.selectionController.getSelectedStrokes().map((s) => {
      const newPoints = s.points.map((p) => ({
        ...p,
        x: p.x + offset,
        y: p.y + offset
      }));
      return {
        ...s,
        id: `stroke_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        points: newPoints,
        bounds: StrokeGeometry.computeBoundingBox(newPoints, s.width)
      };
    });

    const clonedShapes: ShapeObject[] = this.selectionController.getSelectedShapes().map((sh) => {
      const newGeom = { ...sh.geometryData };
      if (
        sh.type === "rectangle" ||
        sh.type === "rounded-rectangle" ||
        sh.type === "diamond" ||
        sh.type === "star" ||
        sh.type === "callout"
      ) {
        newGeom.x = (newGeom.x || 0) + offset;
        newGeom.y = (newGeom.y || 0) + offset;
      } else if (sh.type === "circle" || sh.type === "ellipse") {
        newGeom.cx = (newGeom.cx || 0) + offset;
        newGeom.cy = (newGeom.cy || 0) + offset;
      } else if (sh.type === "line" || sh.type === "arrow") {
        newGeom.x1 = (newGeom.x1 || 0) + offset;
        newGeom.y1 = (newGeom.y1 || 0) + offset;
        newGeom.x2 = (newGeom.x2 || 0) + offset;
        newGeom.y2 = (newGeom.y2 || 0) + offset;
      } else if (sh.type === "triangle") {
        newGeom.x1 = (newGeom.x1 || 0) + offset;
        newGeom.y1 = (newGeom.y1 || 0) + offset;
        newGeom.x2 = (newGeom.x2 || 0) + offset;
        newGeom.y2 = (newGeom.y2 || 0) + offset;
        newGeom.x3 = (newGeom.x3 || 0) + offset;
        newGeom.y3 = (newGeom.y3 || 0) + offset;
      }

      return {
        ...sh,
        id: `shape_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        bounds: {
          minX: sh.bounds.minX + offset,
          minY: sh.bounds.minY + offset,
          maxX: sh.bounds.maxX + offset,
          maxY: sh.bounds.maxY + offset
        },
        geometryData: newGeom
      };
    });

    const activeCanvas = this.activeCanvasMap.get(page.id);

    this.selectionController.setSelection(
      page.id,
      clonedStrokes,
      clonedShapes,
      activeCanvas
    );

    this.historyManager.execute(
      new AddElementsCommand(page, clonedStrokes, clonedShapes, () => {
        this.handleMutation(page);
      })
    );
    new Notice("Duplicated selection");
  }

  private deleteActiveSelection(): void {
    if (!this.selectionController.hasSelection() || !this.pageManager) {
      return;
    }
    const pageId = this.selectionController.getActivePageId();
    if (!pageId) return;
    const page = this.pageManager.getPage(pageId);
    if (!page) return;
    const activeCanvas = this.activeCanvasMap.get(page.id);
    if (!activeCanvas) return;

    this.selectionController.deleteSelection(page, activeCanvas);
  }

  private copySelection(): void {
    if (!this.selectionController.hasSelection()) {
      return;
    }
    this.clipboard = {
      strokes: this.selectionController.getSelectedStrokes().map((s) => ({
        ...s,
        points: s.points.map((p) => ({ ...p }))
      })),
      shapes: this.selectionController.getSelectedShapes().map((sh) => ({
        ...sh,
        geometryData: { ...sh.geometryData }
      }))
    };
    new Notice("Selection copied");
  }

  private pasteSelection(): void {
    if (!this.clipboard || !this.pageManager || !this.document) {
      return;
    }
    const page = this.pageManager.getPageByNumber(this.currentPageNumber);
    if (!page) return;

    const offset = 25;
    const pastedStrokes: StrokeObject[] = this.clipboard.strokes.map((s) => {
      const newPoints = s.points.map((p) => ({
        ...p,
        x: p.x + offset,
        y: p.y + offset
      }));
      return {
        ...s,
        id: `stroke_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        points: newPoints,
        bounds: StrokeGeometry.computeBoundingBox(newPoints, s.width)
      };
    });

    const pastedShapes: ShapeObject[] = this.clipboard.shapes.map((sh) => {
      const newGeom = { ...sh.geometryData };
      if (
        sh.type === "rectangle" ||
        sh.type === "rounded-rectangle" ||
        sh.type === "diamond" ||
        sh.type === "star" ||
        sh.type === "callout"
      ) {
        newGeom.x = (newGeom.x || 0) + offset;
        newGeom.y = (newGeom.y || 0) + offset;
      } else if (sh.type === "circle" || sh.type === "ellipse") {
        newGeom.cx = (newGeom.cx || 0) + offset;
        newGeom.cy = (newGeom.cy || 0) + offset;
      } else if (sh.type === "line" || sh.type === "arrow") {
        newGeom.x1 = (newGeom.x1 || 0) + offset;
        newGeom.y1 = (newGeom.y1 || 0) + offset;
        newGeom.x2 = (newGeom.x2 || 0) + offset;
        newGeom.y2 = (newGeom.y2 || 0) + offset;
      } else if (sh.type === "triangle") {
        newGeom.x1 = (newGeom.x1 || 0) + offset;
        newGeom.y1 = (newGeom.y1 || 0) + offset;
        newGeom.x2 = (newGeom.x2 || 0) + offset;
        newGeom.y2 = (newGeom.y2 || 0) + offset;
        newGeom.x3 = (newGeom.x3 || 0) + offset;
        newGeom.y3 = (newGeom.y3 || 0) + offset;
      }

      return {
        ...sh,
        id: `shape_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        bounds: {
          minX: sh.bounds.minX + offset,
          minY: sh.bounds.minY + offset,
          maxX: sh.bounds.maxX + offset,
          maxY: sh.bounds.maxY + offset
        },
        geometryData: newGeom
      };
    });

    const activeCanvas = this.activeCanvasMap.get(page.id);

    this.selectionController.setSelection(
      page.id,
      pastedStrokes,
      pastedShapes,
      activeCanvas
    );

    this.historyManager.execute(
      new AddElementsCommand(page, pastedStrokes, pastedShapes, () => {
        this.handleMutation(page);
      })
    );
    new Notice("Pasted elements");
  }

  private setEraserMode(mode: EraserMode): void {
    this.inkingController.setEraserMode(mode);
    this.toolbar.setEraserMode(mode);
  }

  private toggleSidebar(): void {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
    this.sidebar.toggle();
  }

  private changeZoom(delta: number): void {
    const nextZoom = Math.min(Math.max(this.zoomLevel + delta, 0.4), 3.0);
    this.zoomLevel = Math.round(nextZoom * 10) / 10;
    this.applyZoom();
  }

  private resetZoom(): void {
    this.zoomLevel = 1.0;
    this.applyZoom();
  }

  getCanvasScale(): number {
    const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;
    const zoom = Math.max(1, this.zoomLevel);
    return Math.min(4.0, Math.max(1, Math.round(dpr * zoom * 10) / 10));
  }

  private updateCanvasResolutions(): void {
    if (!this.pageManager) {
      return;
    }
    const scale = this.getCanvasScale();
    const pages = this.pageManager.getPages();
    for (const page of pages) {
      const targetW = Math.round(page.dimensions.width * scale);
      const targetH = Math.round(page.dimensions.height * scale);

      const tplCanvas = this.templateCanvasMap.get(page.id);
      if (tplCanvas && (tplCanvas.width !== targetW || tplCanvas.height !== targetH)) {
        tplCanvas.width = targetW;
        tplCanvas.height = targetH;
        TemplateRenderer.renderTemplate(tplCanvas, page.dimensions, page.template);
      }

      const comCanvas = this.committedCanvasMap.get(page.id);
      if (comCanvas && (comCanvas.width !== targetW || comCanvas.height !== targetH)) {
        comCanvas.width = targetW;
        comCanvas.height = targetH;
        this.redrawCommittedCanvas(page.id);
      }

      const actCanvas = this.activeCanvasMap.get(page.id);
      if (actCanvas && (actCanvas.width !== targetW || actCanvas.height !== targetH)) {
        actCanvas.width = targetW;
        actCanvas.height = targetH;
        const ctx = actCanvas.getContext("2d");
        if (ctx && typeof ctx.setTransform === "function") {
          ctx.setTransform(scale, 0, 0, scale, 0, 0);
        }
      }
    }
  }

  private applyZoom(): void {
    if (this.pagesContainerEl) {
      this.pagesContainerEl.style.transform = `scale(${this.zoomLevel})`;
      this.pagesContainerEl.style.transformOrigin = "top center";
      if (this.zoomLevel > 1) {
        const extraHeight = Math.ceil(this.pagesContainerEl.offsetHeight * (this.zoomLevel - 1));
        this.pagesContainerEl.style.marginBottom = `${extraHeight + 80}px`;
        const extraWidth = Math.ceil(this.pagesContainerEl.offsetWidth * (this.zoomLevel - 1));
        this.pagesContainerEl.style.marginRight = `${Math.ceil(extraWidth / 2) + 60}px`;
        this.pagesContainerEl.style.marginLeft = `${Math.ceil(extraWidth / 2) + 60}px`;
      } else {
        this.pagesContainerEl.style.marginBottom = "0px";
        this.pagesContainerEl.style.marginRight = "0px";
        this.pagesContainerEl.style.marginLeft = "0px";
      }
    }
    this.updateCanvasResolutions();
    this.toolbar.updateZoomDisplay(this.zoomLevel);
    this.updateStatusDisplay();
  }

  private isPanTrigger(e: PointerEvent): boolean {
    if (e.button === 1 || e.button === 2) {
      return true;
    }
    if (this.isSpacePressed) {
      return true;
    }
    if (this.inkingController.activeTool === "select") {
      return true;
    }
    return false;
  }

  private startPan(clientX: number, clientY: number, target?: Element, pointerId?: number): void {
    this.isPanning = true;
    this.panStartX = clientX;
    this.panStartY = clientY;
    this.panScrollLeft = this.scrollerEl.scrollLeft;
    this.panScrollTop = this.scrollerEl.scrollTop;
    this.rootContainerEl.addClass("is-panning");
    this.scrollerEl.addClass("is-panning");
    if (target && pointerId !== undefined) {
      try {
        target.setPointerCapture(pointerId);
      } catch {}
    }
  }

  private updatePan(clientX: number, clientY: number): void {
    if (!this.isPanning) {
      return;
    }
    const dx = clientX - this.panStartX;
    const dy = clientY - this.panStartY;
    this.scrollerEl.scrollLeft = this.panScrollLeft - dx;
    this.scrollerEl.scrollTop = this.panScrollTop - dy;
  }

  private finishPan(): void {
    if (!this.isPanning) {
      return;
    }
    this.isPanning = false;
    this.rootContainerEl.removeClass("is-panning");
    this.scrollerEl.removeClass("is-panning");
  }

  private updateStatusDisplay(): void {
    const pageCount = this.pageManager ? this.pageManager.getPageCount() : (this.document ? this.document.pages.length : 0);
    const currentPage = this.pageManager?.getPageByNumber(this.currentPageNumber) ?? this.pageManager?.getPages()[0];
    const width = currentPage ? Math.round(currentPage.dimensions.width) : 595;
    const height = currentPage ? Math.round(currentPage.dimensions.height) : 842;
    const orientation = (currentPage?.orientation ?? "portrait").toUpperCase();

    if (this.statusPageInfoEl) {
      if (pageCount === 0) {
        this.statusPageInfoEl.setText("Loading notebook...");
      } else {
        this.statusPageInfoEl.setText(`Page: ${this.currentPageNumber} / ${pageCount} • ${width} x ${height} pt • ${orientation}`);
      }
    }
    if (this.statusToolInfoEl) {
      const tool = this.inkingController.activeTool;
      let toolName = tool.toUpperCase();
      if (tool === "pen" || tool === "pressure" || tool === "fountain") toolName = "PEN";
      else if (tool === "select") toolName = "SELECT / PAN";
      else if (tool === "sticky") toolName = "STICKY NOTE";
      else if (tool === "connector") toolName = "LINE / CONNECTOR";
      else if (tool === "shape") toolName = `SHAPE (${this.currentShapeType.toUpperCase()})`;
      this.statusToolInfoEl.setText(`Tool: ${toolName}`);
    }
    if (this.statusZoomInfoEl) {
      this.statusZoomInfoEl.setText(`Zoom: ${Math.round(this.zoomLevel * 100)}%`);
    }
    if (this.statusSaveInfoEl) {
      if (pageCount === 0) {
        this.statusSaveInfoEl.setText("Loading...");
      } else {
        this.statusSaveInfoEl.setText("Ready");
      }
    }
  }

  getPageFrame(pageNumber: number): HTMLElement | null {
    const pageWrapper = this.pageElements.get(pageNumber);
    if (!pageWrapper) {
      return null;
    }
    return (pageWrapper.querySelector(".notepages-page-frame") as HTMLElement | null) ?? pageWrapper;
  }

  renderDocument(): void {
    if (!this.document || !this.pageManager) {
      return;
    }

    this.clearActiveSelectionCanvas();

    this.committedCanvasMap.forEach((c) => {
      c.width = 1;
      c.height = 1;
    });
    this.activeCanvasMap.forEach((c) => {
      c.width = 1;
      c.height = 1;
    });
    this.templateCanvasMap.forEach((c) => {
      c.width = 1;
      c.height = 1;
    });

    this.sidebar.clear();
    this.pagesContainerEl.empty();
    this.pageElements.clear();
    this.committedCanvasMap.clear();
    this.activeCanvasMap.clear();
    this.templateCanvasMap.clear();
    this.pageVirtualizer.clear();
    this.pageIntersectionObserver?.disconnect();

    const pages = this.pageManager.getPages();
    for (let index = 0; index < pages.length; index++) {
      const page = pages[index];
      this.renderPage(page);
      this.renderThumbnail(page, index);
    }

    this.ensureDragOverlay();

    if (this.pageManager) {
      const activeType = this.pageManager.getNotebookTemplate().type;
      this.toolbar.updatePaperTemplateButtons(activeType);
      const orient = this.pageManager.getNotebookOrientation();
      this.updateOrientationButtonDisplay(orient);
    }

    this.updateActivePage(this.currentPageNumber);
  }

  private updateOrientationButtonDisplay(orient: PageOrientation): void {
    this.toolbar.updateOrientationButtonDisplay(orient);
  }

  renderPage(page: PageData): void {
    const pageWrapper = this.pagesContainerEl.createDiv({
      cls: "notepages-page-wrapper"
    });
    pageWrapper.dataset.pageNumber = String(page.pageNumber);
    pageWrapper.dataset.pageId = page.id;
    this.pageElements.set(page.pageNumber, pageWrapper);

    const pageFrame = pageWrapper.createDiv({
      cls: "notepages-page-frame"
    });

    pageFrame.style.width = `${page.dimensions.width}px`;
    pageFrame.style.height = `${page.dimensions.height}px`;
    pageFrame.style.backgroundColor = page.template.backgroundColor;

    const scale = this.getCanvasScale();
    const targetW = Math.round(page.dimensions.width * scale);
    const targetH = Math.round(page.dimensions.height * scale);

    const totalPages = this.pageManager ? this.pageManager.getPages().length : 1;
    const shouldInitialMount = totalPages <= 4 || page.pageNumber <= 3;
    const initialW = shouldInitialMount ? targetW : 1;
    const initialH = shouldInitialMount ? targetH : 1;

    if (!page.pdfSource) {
      const templateCanvas = pageFrame.createEl("canvas", {
        cls: "notepages-page-layer notepages-template-layer"
      });
      templateCanvas.dataset.pageWidth = String(page.dimensions.width);
      templateCanvas.dataset.pageHeight = String(page.dimensions.height);
      templateCanvas.width = initialW;
      templateCanvas.height = initialH;
      this.templateCanvasMap.set(page.id, templateCanvas);
      if (shouldInitialMount) {
        TemplateRenderer.renderTemplate(templateCanvas, page.dimensions, page.template);
      }
    }

    const committedCanvas = pageFrame.createEl("canvas", {
      cls: "notepages-page-layer notepages-committed-layer"
    });
    committedCanvas.dataset.pageWidth = String(page.dimensions.width);
    committedCanvas.dataset.pageHeight = String(page.dimensions.height);
    committedCanvas.width = initialW;
    committedCanvas.height = initialH;
    this.committedCanvasMap.set(page.id, committedCanvas);
    if (shouldInitialMount) {
      this.redrawCommittedCanvas(page.id);
    }

    const activeCanvas = pageFrame.createEl("canvas", {
      cls: "notepages-page-layer notepages-active-layer is-interactive"
    });
    activeCanvas.dataset.pageWidth = String(page.dimensions.width);
    activeCanvas.dataset.pageHeight = String(page.dimensions.height);
    activeCanvas.width = initialW;
    activeCanvas.height = initialH;
    activeCanvas.style.touchAction = "none";
    this.activeCanvasMap.set(page.id, activeCanvas);

    this.pageVirtualizer.observePage(page.pageNumber, pageWrapper);

    const pageNumberWatermark = pageFrame.createDiv({
      cls: "notepages-page-number-watermark",
      text: String(page.pageNumber)
    });
    const isDarkPaper = this.isDarkColor(page.template.backgroundColor);
    pageNumberWatermark.style.color = isDarkPaper ? "rgba(255, 255, 255, 0.35)" : "rgba(0, 0, 0, 0.3)";

    if (page.pdfSource) {
      if (page.pdfSource.svgPath) {
        const svgFile = this.app.vault.getAbstractFileByPath(page.pdfSource.svgPath);
        if (svgFile instanceof TFile) {
          const bgImg = pageFrame.createEl("img", {
            cls: "notepages-pdf-svg-background"
          });
          bgImg.src = this.resolveResourcePath(svgFile.path);
          bgImg.draggable = false;
        }
      } else {
        if (this.pageIntersectionObserver) {
          this.pageIntersectionObserver.observe(pageWrapper);
        } else {
          this.pdfBackgroundManager.renderPdfBackground(page, pageFrame, () => {
            this.updateThumbnailStrokes(page);
          });
        }
      }
    }
    this.imageController.renderPageImages(page, pageFrame, (path) => this.resolveResourcePath(path));
    this.textController.renderPageTexts(page, pageFrame);

    this.registerDomEvent(pageFrame, "dragover", (e: DragEvent) => {
      if (e.dataTransfer && e.dataTransfer.types.includes("Files")) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }
    });

    this.registerDomEvent(pageFrame, "drop", async (e: DragEvent) => {
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.type.startsWith("image/")) {
          e.preventDefault();
          e.stopPropagation();
          const rect = pageFrame.getBoundingClientRect();
          const scaleX = page.dimensions.width / rect.width;
          const scaleY = page.dimensions.height / rect.height;
          const dropX = (e.clientX - rect.left) * scaleX;
          const dropY = (e.clientY - rect.top) * scaleY;

          const savedPath = await this.imageController.saveBlobToVault(
            file,
            "dropped_image",
            this.file?.path || ""
          );
          const resourceUrl = this.resolveResourcePath(savedPath);
          const naturalDims = await ImageController.getImageNaturalDimensions(resourceUrl);
          const fittedDims = ImageController.calculateFittedDimensions(
            naturalDims.width,
            naturalDims.height,
            Math.min(450, page.dimensions.width - 40),
            Math.min(450, page.dimensions.height - 40)
          );
          const finalX = Math.max(0, Math.min(dropX, page.dimensions.width - fittedDims.width));
          const finalY = Math.max(0, Math.min(dropY, page.dimensions.height - fittedDims.height));
          const imgObj = this.imageController.createImageObject(
            savedPath,
            finalX,
            finalY,
            fittedDims.width,
            fittedDims.height
          );
          this.historyManager.execute(
            new AddImageCommand(page, imgObj, () => {
              this.handleMutation(page);
              this.imageController.renderPageImages(page, pageFrame, (p) => this.resolveResourcePath(p));
            })
          );
          new Notice("Inserted dropped image into notebook");
        } else if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
          e.preventDefault();
          e.stopPropagation();
          await this.promptAndImportLocalPdf(file, false, page.pageNumber);
        }
      } else {
        const textData = e.dataTransfer?.getData("text/plain") || "";
        const match = textData.match(/^\[\[(.*?)\]\]$/) || textData.match(/^(.*\.pdf)$/i);
        if (match) {
          const cleanPath = match[1].replace(/\|.*$/, "");
          const linkedFile = this.app.metadataCache.getFirstLinkpathDest(cleanPath, this.file?.path || "");
          if (linkedFile && linkedFile.extension.toLowerCase() === "pdf") {
            e.preventDefault();
            e.stopPropagation();
            await this.promptAndImportVaultPdf(linkedFile, false, page.pageNumber);
          }
        }
      }
    });

    this.registerDomEvent(activeCanvas, "pointerdown", (e: PointerEvent) => {
      if (this.isPanTrigger(e)) {
        if (this.textController.isEditing()) {
          this.textController.commitActiveEdit();
        }
        this.startPan(e.clientX, e.clientY, activeCanvas, e.pointerId);
        e.stopPropagation();
        return;
      }

      if (this.imageController.getSelectedImageId()) {
        this.imageController.deselectImage();
        this.imageController.renderPageImages(page, pageFrame, (p) => this.resolveResourcePath(p));
      }

      if (e.pointerType === "touch" && !this.plugin.settings.drawWithFinger) {
        return;
      }

      this.dragStartClientX = e.clientX;
      this.dragStartClientY = e.clientY;

      const rect = activeCanvas.getBoundingClientRect();
      const scaleX = page.dimensions.width / rect.width;
      const scaleY = page.dimensions.height / rect.height;
      const pageX = (e.clientX - rect.left) * scaleX;
      const pageY = (e.clientY - rect.top) * scaleY;

      if (this.textController.isEditing()) {
        this.textController.commitActiveEdit();
        e.stopPropagation();
        return;
      }

      if (this.inkingController.activeTool === "text" || this.inkingController.activeTool === "sticky") {
        const isSticky = this.inkingController.activeTool === "sticky";
        const hit = SelectionEngine.hitTestSingleElement(
          [],
          [],
          pageX,
          pageY,
          8,
          page.texts,
          []
        );
        if (hit?.text) {
          if ((isSticky && hit.text.isSticky) || (!isSticky && !hit.text.isSticky)) {
            this.textController.startEditing(page, pageFrame, hit.text);
            e.stopPropagation();
            return;
          }
        }

        this.isDraggingTextRect = true;
        this.dragTextPage = page;
        this.dragTextPageFrame = pageFrame;
        this.dragTextCanvas = activeCanvas;
        const margin = 10;
        const clampedX = Math.max(margin, Math.min(page.dimensions.width - margin, pageX));
        const clampedY = Math.max(margin, Math.min(page.dimensions.height - margin, pageY));
        this.dragTextStartX = clampedX;
        this.dragTextStartY = clampedY;
        this.dragTextCurrentX = clampedX;
        this.dragTextCurrentY = clampedY;
        try {
          activeCanvas.setPointerCapture(e.pointerId);
        } catch {}
        e.stopPropagation();
        return;
      }

      if (this.inkingController.activeTool === "shape") {
        this.isDraggingShape = true;
        this.dragShapePage = page;
        this.dragShapeCanvas = activeCanvas;
        const margin = 10;
        const clampedX = Math.max(margin, Math.min(page.dimensions.width - margin, pageX));
        const clampedY = Math.max(margin, Math.min(page.dimensions.height - margin, pageY));
        this.dragShapeStartX = clampedX;
        this.dragShapeStartY = clampedY;
        this.dragShapeCurrentX = clampedX;
        this.dragShapeCurrentY = clampedY;
        try {
          activeCanvas.setPointerCapture(e.pointerId);
        } catch {}
        e.stopPropagation();
        return;
      }

      if (this.inkingController.activeTool === "connector") {
        this.isDraggingConnector = true;
        this.dragConnectorPage = page;
        this.dragConnectorCanvas = activeCanvas;
        const margin = 10;
        const clampedX = Math.max(margin, Math.min(page.dimensions.width - margin, pageX));
        const clampedY = Math.max(margin, Math.min(page.dimensions.height - margin, pageY));
        this.dragConnectorStartX = clampedX;
        this.dragConnectorStartY = clampedY;
        this.dragConnectorCurrentX = clampedX;
        this.dragConnectorCurrentY = clampedY;
        try {
          activeCanvas.setPointerCapture(e.pointerId);
        } catch {}
        e.stopPropagation();
        return;
      }

      if (this.inkingController.activeTool === "lasso") {
        this.selectionController.handlePointerDown(e, page, activeCanvas, {
          x: pageX,
          y: pageY
        });
      } else {
        this.inkingController.handlePointerDown(
          e,
          page.id,
          activeCanvas,
          committedCanvas,
          { x: pageX, y: pageY },
          page.strokes
        );
      }
    });

    this.registerDomEvent(activeCanvas, "pointermove", (e: PointerEvent) => {
      if (this.isPanning) {
        this.updatePan(e.clientX, e.clientY);
        return;
      }

      if (e.pointerType === "touch" && !this.plugin.settings.drawWithFinger) {
        return;
      }

      if (this.isDraggingSelection) {
        this.updateSelectionDrag(e.clientX, e.clientY);
        return;
      }

      const rect = activeCanvas.getBoundingClientRect();
      const scaleX = page.dimensions.width / rect.width;
      const scaleY = page.dimensions.height / rect.height;

      if (this.isDraggingTextRect && this.dragTextCanvas === activeCanvas) {
        const pageX = (e.clientX - rect.left) * scaleX;
        const pageY = (e.clientY - rect.top) * scaleY;
        const margin = 10;
        this.dragTextCurrentX = Math.max(margin, Math.min(page.dimensions.width - margin, pageX));
        this.dragTextCurrentY = Math.max(margin, Math.min(page.dimensions.height - margin, pageY));
        this.renderTextDragPreview(
          activeCanvas,
          this.dragTextStartX,
          this.dragTextStartY,
          this.dragTextCurrentX,
          this.dragTextCurrentY,
          this.inkingController.activeTool === "sticky"
        );
        return;
      }

      if (this.isDraggingShape && this.dragShapeCanvas === activeCanvas) {
        const pageX = (e.clientX - rect.left) * scaleX;
        const pageY = (e.clientY - rect.top) * scaleY;
        const margin = 10;
        this.dragShapeCurrentX = Math.max(margin, Math.min(page.dimensions.width - margin, pageX));
        this.dragShapeCurrentY = Math.max(margin, Math.min(page.dimensions.height - margin, pageY));
        this.renderShapeDragPreview(
          activeCanvas,
          this.dragShapeStartX,
          this.dragShapeStartY,
          this.dragShapeCurrentX,
          this.dragShapeCurrentY
        );
        return;
      }

      if (this.isDraggingConnector && this.dragConnectorCanvas === activeCanvas) {
        const pageX = (e.clientX - rect.left) * scaleX;
        const pageY = (e.clientY - rect.top) * scaleY;
        const margin = 10;
        this.dragConnectorCurrentX = Math.max(margin, Math.min(page.dimensions.width - margin, pageX));
        this.dragConnectorCurrentY = Math.max(margin, Math.min(page.dimensions.height - margin, pageY));
        this.renderConnectorDragPreview(
          activeCanvas,
          this.dragConnectorStartX,
          this.dragConnectorStartY,
          this.dragConnectorCurrentX,
          this.dragConnectorCurrentY
        );
        return;
      }

      if (this.inkingController.activeTool === "lasso") {
        const pageX = (e.clientX - rect.left) * scaleX;
        const pageY = (e.clientY - rect.top) * scaleY;
        const targetInfo = this.getTargetPageForClientPoint(e.clientX, e.clientY);
        this.selectionController.handlePointerMove(
          activeCanvas,
          { x: pageX, y: pageY },
          targetInfo?.page,
          targetInfo?.activeCanvas,
          targetInfo?.pointOnPage
        );
      } else {
        const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
        const coordsList = events.map((ev) => ({
          x: (ev.clientX - rect.left) * scaleX,
          y: (ev.clientY - rect.top) * scaleY
        }));
        this.inkingController.handlePointerMove(e, coordsList, page.strokes);
      }
    });

    this.registerDomEvent(activeCanvas, "pointerup", (e: PointerEvent) => {
      if (this.isPanning) {
        this.finishPan();
        return;
      }

      if (this.isDraggingSelection) {
        this.finishSelectionDrag(e.clientX, e.clientY);
        return;
      }

      if (this.isDraggingTextRect && this.dragTextCanvas === activeCanvas) {
        this.isDraggingTextRect = false;
        try {
          activeCanvas.releasePointerCapture(e.pointerId);
        } catch {}

        const ctx = activeCanvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
        }

        const rect = activeCanvas.getBoundingClientRect();
        const scaleX = page.dimensions.width / rect.width;
        const scaleY = page.dimensions.height / rect.height;
        const pageX = (e.clientX - rect.left) * scaleX;
        const pageY = (e.clientY - rect.top) * scaleY;
        const margin = 10;
        this.dragTextCurrentX = Math.max(margin, Math.min(page.dimensions.width - margin, pageX));
        this.dragTextCurrentY = Math.max(margin, Math.min(page.dimensions.height - margin, pageY));

        const rawW = Math.abs(this.dragTextCurrentX - this.dragTextStartX);
        const rawH = Math.abs(this.dragTextCurrentY - this.dragTextStartY);
        const x = Math.min(this.dragTextStartX, this.dragTextCurrentX);
        const y = Math.min(this.dragTextStartY, this.dragTextCurrentY);

        this.dragTextPage = null;
        this.dragTextPageFrame = null;
        this.dragTextCanvas = null;

        const maxAvailableW = Math.max(40, page.dimensions.width - margin - x);
        const maxAvailableH = Math.max(30, page.dimensions.height - margin - y);

        const isSticky = this.inkingController.activeTool === "sticky";
        const fallbackW = isSticky ? 140 : 220;
        const fallbackH = isSticky ? 140 : 60;

        const options: TextFormattingOptions = isSticky
          ? {
              isSticky: true,
              backgroundColor: this.currentStickyColor,
              color: "#1e293b",
              fontSize: 16,
              fontWeight: "normal",
              italic: false,
              underline: false,
              textAlign: "left"
            }
          : this.currentTextOptions;

        if (rawW > 20 || rawH > 20) {
          const initialWidth = Math.min(maxAvailableW, Math.max(60, Math.round(rawW)));
          const initialHeight = Math.min(maxAvailableH, Math.max(30, Math.round(rawH)));
          this.textController.startEditing(page, pageFrame, undefined, x, y, initialWidth, initialHeight, options);
        } else {
          const defaultW = Math.min(fallbackW, maxAvailableW);
          const defaultH = Math.min(fallbackH, maxAvailableH);
          const adjustedX = Math.max(margin, Math.min(x, page.dimensions.width - margin - defaultW));
          const adjustedY = Math.max(margin, Math.min(y, page.dimensions.height - margin - defaultH));
          this.textController.startEditing(page, pageFrame, undefined, adjustedX, adjustedY, defaultW, defaultH, options);
        }
        return;
      }

      if (this.isDraggingShape && this.dragShapeCanvas === activeCanvas) {
        this.isDraggingShape = false;
        try {
          activeCanvas.releasePointerCapture(e.pointerId);
        } catch {}

        const ctx = activeCanvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
        }

        const margin = 10;
        const rect = activeCanvas.getBoundingClientRect();
        const scaleX = page.dimensions.width / rect.width;
        const scaleY = page.dimensions.height / rect.height;
        const pageX = (e.clientX - rect.left) * scaleX;
        const pageY = (e.clientY - rect.top) * scaleY;
        this.dragShapeCurrentX = Math.max(margin, Math.min(page.dimensions.width - margin, pageX));
        this.dragShapeCurrentY = Math.max(margin, Math.min(page.dimensions.height - margin, pageY));

        let rawW = Math.abs(this.dragShapeCurrentX - this.dragShapeStartX);
        let rawH = Math.abs(this.dragShapeCurrentY - this.dragShapeStartY);
        let x = Math.min(this.dragShapeStartX, this.dragShapeCurrentX);
        let y = Math.min(this.dragShapeStartY, this.dragShapeCurrentY);

        this.dragShapePage = null;
        this.dragShapeCanvas = null;

        if (rawW < 12 && rawH < 12) {
          rawW = 120;
          rawH = 80;
          x = Math.max(margin, Math.min(x - rawW / 2, page.dimensions.width - margin - rawW));
          y = Math.max(margin, Math.min(y - rawH / 2, page.dimensions.height - margin - rawH));
        }

        const w = Math.round(rawW);
        const h = Math.round(rawH);
        const geometryData: Record<string, number> = {};

        switch (this.currentShapeType) {
          case "rectangle":
          case "diamond":
          case "star":
          case "callout":
            geometryData.x = x;
            geometryData.y = y;
            geometryData.width = w;
            geometryData.height = h;
            break;
          case "rounded-rectangle":
            geometryData.x = x;
            geometryData.y = y;
            geometryData.width = w;
            geometryData.height = h;
            geometryData.radius = 10;
            break;
          case "circle":
            geometryData.cx = x + w / 2;
            geometryData.cy = y + h / 2;
            geometryData.r = Math.min(w, h) / 2;
            break;
          case "triangle":
            geometryData.x1 = x + w / 2;
            geometryData.y1 = y;
            geometryData.x2 = x;
            geometryData.y2 = y + h;
            geometryData.x3 = x + w;
            geometryData.y3 = y + h;
            break;
          default:
            geometryData.x = x;
            geometryData.y = y;
            geometryData.width = w;
            geometryData.height = h;
            break;
        }

        const shapeObj: ShapeObject = {
          id: `shape_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          elementType: "shape",
          type: this.currentShapeType,
          color: this.inkingController.currentColor,
          strokeWidth: this.inkingController.currentWidth,
          fillColor: this.shapeFillEnabled ? this.getShapeFillColor() : undefined,
          bounds: {
            minX: x,
            minY: y,
            maxX: x + w,
            maxY: y + h
          },
          geometryData
        };

        this.historyManager.execute(
          new AddShapeCommand(page, shapeObj, () => {
            this.handleMutation(page);
          })
        );
        return;
      }

      if (this.isDraggingConnector && this.dragConnectorCanvas === activeCanvas) {
        this.isDraggingConnector = false;
        try {
          activeCanvas.releasePointerCapture(e.pointerId);
        } catch {}

        const ctx = activeCanvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
        }

        const margin = 10;
        const rect = activeCanvas.getBoundingClientRect();
        const scaleX = page.dimensions.width / rect.width;
        const scaleY = page.dimensions.height / rect.height;
        const pageX = (e.clientX - rect.left) * scaleX;
        const pageY = (e.clientY - rect.top) * scaleY;
        this.dragConnectorCurrentX = Math.max(margin, Math.min(page.dimensions.width - margin, pageX));
        this.dragConnectorCurrentY = Math.max(margin, Math.min(page.dimensions.height - margin, pageY));

        const startX = this.dragConnectorStartX;
        const startY = this.dragConnectorStartY;
        let endX = this.dragConnectorCurrentX;
        let endY = this.dragConnectorCurrentY;

        this.dragConnectorPage = null;
        this.dragConnectorCanvas = null;

        const dist = Math.hypot(endX - startX, endY - startY);
        if (dist < 10) {
          endX = Math.min(page.dimensions.width - margin, startX + 80);
          endY = startY;
        }

        const padding = 12;
        const shapeObj: ShapeObject = {
          id: `shape_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          elementType: "shape",
          type: "arrow",
          color: this.inkingController.currentColor,
          strokeWidth: this.inkingController.currentWidth,
          bounds: {
            minX: Math.min(startX, endX) - padding,
            minY: Math.min(startY, endY) - padding,
            maxX: Math.max(startX, endX) + padding,
            maxY: Math.max(startY, endY) + padding
          },
          geometryData: {
            x1: startX,
            y1: startY,
            x2: endX,
            y2: endY
          }
        };

        this.historyManager.execute(
          new AddShapeCommand(page, shapeObj, () => {
            this.handleMutation(page);
          })
        );
        return;
      }

      if (this.inkingController.activeTool === "lasso") {
        const targetInfo = this.getTargetPageForClientPoint(e.clientX, e.clientY);
        this.selectionController.handlePointerUp(
          e,
          page,
          activeCanvas,
          targetInfo?.page,
          targetInfo?.activeCanvas
        );
      } else {
        this.inkingController.handlePointerUp(e);
      }
    });

    this.registerDomEvent(activeCanvas, "pointercancel", (e: PointerEvent) => {
      if (this.isPanning) {
        this.finishPan();
        return;
      }

      if (this.isDraggingSelection) {
        this.cancelSelectionDrag();
        return;
      }

      if (this.isDraggingTextRect && this.dragTextCanvas === activeCanvas) {
        this.isDraggingTextRect = false;
        try {
          activeCanvas.releasePointerCapture(e.pointerId);
        } catch {}
        this.dragTextPage = null;
        this.dragTextPageFrame = null;
        this.dragTextCanvas = null;
        const ctx = activeCanvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
        }
        return;
      }

      if (this.isDraggingShape && this.dragShapeCanvas === activeCanvas) {
        this.isDraggingShape = false;
        try {
          activeCanvas.releasePointerCapture(e.pointerId);
        } catch {}
        this.dragShapePage = null;
        this.dragShapeCanvas = null;
        const ctx = activeCanvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
        }
        return;
      }

      if (this.isDraggingConnector && this.dragConnectorCanvas === activeCanvas) {
        this.isDraggingConnector = false;
        try {
          activeCanvas.releasePointerCapture(e.pointerId);
        } catch {}
        this.dragConnectorPage = null;
        this.dragConnectorCanvas = null;
        const ctx = activeCanvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
        }
        return;
      }

      if (this.inkingController.activeTool === "lasso") {
        this.selectionController.clearSelection(activeCanvas);
      } else {
        this.inkingController.handlePointerCancel(e);
      }
    });

    this.registerDomEvent(activeCanvas, "dblclick", (e: MouseEvent) => {
      const rect = activeCanvas.getBoundingClientRect();
      const scaleX = page.dimensions.width / rect.width;
      const scaleY = page.dimensions.height / rect.height;
      const pageX = (e.clientX - rect.left) * scaleX;
      const pageY = (e.clientY - rect.top) * scaleY;
      const hit = SelectionEngine.hitTestSingleElement(
        [],
        [],
        pageX,
        pageY,
        8,
        page.texts,
        []
      );
      if (hit?.text) {
        this.textController.startEditing(page, pageFrame, hit.text);
      }
    });
  }

  private renderTextDragPreview(
    canvas: HTMLCanvasElement,
    startX: number,
    startY: number,
    currX: number,
    currY: number,
    isSticky: boolean = false
  ): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.save();
    if (typeof ctx.setTransform === "function") {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    const scale = canvas.width / (Number(canvas.dataset?.pageWidth) || canvas.clientWidth || canvas.width);
    if (typeof ctx.setTransform === "function") {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    }

    const x = Math.min(startX, currX);
    const y = Math.min(startY, currY);
    const w = Math.abs(currX - startX);
    const h = Math.abs(currY - startY);

    if (w < 4 && h < 4) {
      return;
    }

    ctx.save();
    if (isSticky) {
      ctx.fillStyle = this.currentStickyColor || "#fef08a";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(x, y, w, h);
      const label = `Sticky • ${Math.round(w)} × ${Math.round(h)} pt`;
      ctx.font = "11px sans-serif";
      ctx.fillStyle = "#1e293b";
      ctx.fillText(label, x + 4, Math.max(14, y - 4));
    } else {
      ctx.strokeStyle = "rgba(59, 130, 246, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.fillStyle = "rgba(59, 130, 246, 0.08)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);

      const label = `${Math.round(w)} × ${Math.round(h)} pt`;
      ctx.font = "11px sans-serif";
      ctx.fillStyle = "rgba(59, 130, 246, 0.9)";
      ctx.fillText(label, x + 4, Math.max(14, y - 4));
    }
    ctx.restore();
  }

  private renderShapeDragPreview(
    canvas: HTMLCanvasElement,
    startX: number,
    startY: number,
    currX: number,
    currY: number
  ): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.save();
    if (typeof ctx.setTransform === "function") {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    const scale = canvas.width / (Number(canvas.dataset?.pageWidth) || canvas.clientWidth || canvas.width);
    if (typeof ctx.setTransform === "function") {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    }

    const x = Math.min(startX, currX);
    const y = Math.min(startY, currY);
    const w = Math.abs(currX - startX);
    const h = Math.abs(currY - startY);

    if (w < 4 && h < 4) {
      return;
    }

    const geometryData: Record<string, number> = {};
    switch (this.currentShapeType) {
      case "rectangle":
      case "diamond":
      case "star":
      case "callout":
        geometryData.x = x;
        geometryData.y = y;
        geometryData.width = w;
        geometryData.height = h;
        break;
      case "rounded-rectangle":
        geometryData.x = x;
        geometryData.y = y;
        geometryData.width = w;
        geometryData.height = h;
        geometryData.radius = 10;
        break;
      case "circle":
        geometryData.cx = x + w / 2;
        geometryData.cy = y + h / 2;
        geometryData.r = Math.min(w, h) / 2;
        break;
      case "triangle":
        geometryData.x1 = x + w / 2;
        geometryData.y1 = y;
        geometryData.x2 = x;
        geometryData.y2 = y + h;
        geometryData.x3 = x + w;
        geometryData.y3 = y + h;
        break;
      default:
        geometryData.x = x;
        geometryData.y = y;
        geometryData.width = w;
        geometryData.height = h;
        break;
    }

    const previewShape: ShapeObject = {
      id: "preview_shape",
      elementType: "shape",
      type: this.currentShapeType,
      color: this.inkingController.currentColor,
      strokeWidth: this.inkingController.currentWidth,
      fillColor: this.shapeFillEnabled ? this.getShapeFillColor() : undefined,
      bounds: { minX: x, minY: y, maxX: x + w, maxY: y + h },
      geometryData
    };

    ShapeRecognizer.renderShape(ctx, previewShape);

    ctx.save();
    ctx.strokeStyle = "rgba(59, 130, 246, 0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(x, y, w, h);
    const label = `${this.currentShapeType} • ${Math.round(w)} × ${Math.round(h)} pt`;
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "rgba(59, 130, 246, 0.9)";
    ctx.fillText(label, x + 4, Math.max(14, y - 4));
    ctx.restore();
  }

  private renderConnectorDragPreview(
    canvas: HTMLCanvasElement,
    startX: number,
    startY: number,
    currX: number,
    currY: number
  ): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.save();
    if (typeof ctx.setTransform === "function") {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    const scale = canvas.width / (Number(canvas.dataset?.pageWidth) || canvas.clientWidth || canvas.width);
    if (typeof ctx.setTransform === "function") {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    }

    const dist = Math.hypot(currX - startX, currY - startY);
    if (dist < 4) {
      return;
    }

    const previewArrow: ShapeObject = {
      id: "preview_arrow",
      elementType: "shape",
      type: "arrow",
      color: this.inkingController.currentColor,
      strokeWidth: this.inkingController.currentWidth,
      bounds: {
        minX: Math.min(startX, currX),
        minY: Math.min(startY, currY),
        maxX: Math.max(startX, currX),
        maxY: Math.max(startY, currY)
      },
      geometryData: {
        x1: startX,
        y1: startY,
        x2: currX,
        y2: currY
      }
    };

    ShapeRecognizer.renderShape(ctx, previewArrow);

    ctx.save();
    const label = `Arrow • ${Math.round(dist)} pt`;
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "rgba(59, 130, 246, 0.9)";
    ctx.fillText(label, (startX + currX) / 2 + 6, (startY + currY) / 2 - 6);
    ctx.restore();
  }

  private getShapeFillColor(): string {
    const strokeColor = this.inkingController.currentColor;
    if (strokeColor.startsWith("#")) {
      const hex = strokeColor.replace("#", "");
      if (hex.length === 6) {
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, 0.22)`;
      }
    }
    return "rgba(59, 130, 246, 0.2)";
  }

  renderThumbnail(page: PageData, index: number): void {
    this.sidebar.renderThumbnail(page, index);
  }

  appendDeleteButtonToThumbnail(actionsEl: HTMLElement, pageId: string): void {
    this.sidebar.appendDeleteButtonToThumbnail(actionsEl, pageId);
  }

  updateThumbnailStrokes(page: PageData): void {
    this.sidebar.updateThumbnailStrokes(page);
  }

  scrollToPage(pageNumber: number): void {
    if (this.currentPageNumber !== pageNumber) {
      this.clearActiveSelectionCanvas();
    }
    this.currentPageNumber = pageNumber;
    const targetEl = this.pageElements.get(pageNumber);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    this.updateActivePage(pageNumber);
  }

  private updateActivePage(pageNumber: number): void {
    this.currentPageNumber = pageNumber;
    this.sidebar.updateActivePage(pageNumber);
    this.updateStatusDisplay();
  }

  private handleScroll(): void {
    if (!this.scrollerEl || this.pageElements.size === 0) {
      return;
    }

    const scrollerRect = this.scrollerEl.getBoundingClientRect();
    let closestPage = this.currentPageNumber;
    let minDistance = Infinity;

    this.pageElements.forEach((el, num) => {
      const rect = el.getBoundingClientRect();
      const distance = Math.abs(rect.top - scrollerRect.top - 40);
      if (distance < minDistance) {
        minDistance = distance;
        closestPage = num;
      }
    });

    if (closestPage !== this.currentPageNumber) {
      this.updateActivePage(closestPage);
    }
  }

  private addNewPage(): void {
    if (!this.pageManager) {
      return;
    }

    const template = this.pageManager.getNotebookTemplate();
    const orientation = this.pageManager.getNotebookOrientation();
    const newPage = this.pageManager.addPage({
      orientation,
      template: { ...template }
    });

    const newIndex = this.pageManager.getPageCount() - 1;
    this.renderPage(newPage);
    this.renderThumbnail(newPage, newIndex);
    this.ensureDragOverlay();

    if (this.pageManager.getPageCount() === 2) {
      const firstPage = this.pageManager.getPages()[0];
      const actionsEl = this.sidebar.getThumbnailActionsEl(firstPage.id);
      if (actionsEl) {
        this.appendDeleteButtonToThumbnail(actionsEl, firstPage.id);
      }
    }

    this.requestSave();
    this.scrollToPage(newPage.pageNumber);
  }

  private duplicateCurrentPage(): void {
    if (!this.pageManager) {
      return;
    }
    const currentPage = this.pageManager.getPageByNumber(this.currentPageNumber);
    if (!currentPage) {
      return;
    }
    const duplicated = this.pageManager.duplicatePage(currentPage.id);
    if (duplicated) {
      this.renderDocument();
      this.requestSave();
      this.scrollToPage(duplicated.pageNumber);
      new Notice(`Duplicated to Page ${duplicated.pageNumber}`);
    }
  }

  private deleteCurrentPage(): void {
    if (!this.pageManager) {
      return;
    }
    if (this.pageManager.getPageCount() <= 1) {
      new Notice("Cannot delete the only page");
      return;
    }
    const currentPage = this.pageManager.getPageByNumber(this.currentPageNumber);
    if (!currentPage) {
      return;
    }
    this.deletePageAndSyncDom(currentPage.id);
  }

  deletePageAndSyncDom(pageId: string): void {
    if (!this.pageManager) {
      return;
    }
    if (this.pageManager.getPageCount() <= 1) {
      new Notice("Cannot delete the only page");
      return;
    }

    const pageToDelete = this.pageManager.getPage(pageId);
    if (!pageToDelete) {
      return;
    }
    const deletedPageNumber = pageToDelete.pageNumber;
    const targetNum = Math.max(1, deletedPageNumber - 1);

    if (this.textController.isEditing()) {
      this.textController.commitActiveEdit();
    }
    this.imageController.deselectImage();
    this.clearActiveSelectionCanvas();

    const pageWrapper = this.pagesContainerEl.querySelector(`[data-page-id="${pageId}"]`) as HTMLElement | null;

    this.pageVirtualizer.unobservePage(deletedPageNumber);

    if (pageWrapper && this.pageIntersectionObserver) {
      this.pageIntersectionObserver.unobserve(pageWrapper);
    }

    const committedCanvas = this.committedCanvasMap.get(pageId);
    if (committedCanvas) {
      committedCanvas.width = 1;
      committedCanvas.height = 1;
      this.committedCanvasMap.delete(pageId);
    }

    const activeCanvas = this.activeCanvasMap.get(pageId);
    if (activeCanvas) {
      activeCanvas.width = 1;
      activeCanvas.height = 1;
      this.activeCanvasMap.delete(pageId);
    }

    const templateCanvas = this.templateCanvasMap.get(pageId);
    if (templateCanvas) {
      templateCanvas.width = 1;
      templateCanvas.height = 1;
      this.templateCanvasMap.delete(pageId);
    }

    if (pageWrapper) {
      const extraCanvases = pageWrapper.querySelectorAll("canvas");
      extraCanvases.forEach((c) => {
        c.width = 1;
        c.height = 1;
      });
      pageWrapper.remove();
    }

    this.sidebar.removeThumbnail(pageId);

    this.pageManager.deletePage(pageId);

    const pages = this.pageManager.getPages();
    this.pageElements.clear();

    for (let index = 0; index < pages.length; index++) {
      const p = pages[index];
      const wrapper = this.pagesContainerEl.querySelector(`[data-page-id="${p.id}"]`) as HTMLElement | null;
      if (wrapper) {
        wrapper.dataset.pageNumber = String(p.pageNumber);
        const watermark = wrapper.querySelector(".notepages-page-number-watermark");
        if (watermark) {
          watermark.textContent = String(p.pageNumber);
        }
        this.pageElements.set(p.pageNumber, wrapper);
      }
    }

    this.sidebar.renumberThumbnails(pages);

    this.requestSave();
    this.scrollToPage(targetNum);
    this.updateStatusDisplay();
    new Notice(`Deleted Page ${deletedPageNumber}`);
  }

  private isDarkColor(hexColor: string): boolean {
    if (!hexColor || !hexColor.startsWith("#")) {
      return false;
    }
    const clean = hexColor.replace("#", "");
    let r = 255;
    let g = 255;
    let b = 255;
    if (clean.length === 3) {
      r = parseInt(clean[0] + clean[0], 16) || 0;
      g = parseInt(clean[1] + clean[1], 16) || 0;
      b = parseInt(clean[2] + clean[2], 16) || 0;
    } else if (clean.length === 6) {
      r = parseInt(clean.substring(0, 2), 16) || 0;
      g = parseInt(clean.substring(2, 4), 16) || 0;
      b = parseInt(clean.substring(4, 6), 16) || 0;
    }
    return (r * 0.299 + g * 0.587 + b * 0.114) < 128;
  }

  private createDefaultDocument(): NotebookDocument {
    const title = this.file instanceof TFile ? this.file.basename : "Untitled Notebook";
    const now = Date.now();
    const initialPage: PageData = {
      id: "page-" + Math.random().toString(36).substring(2, 10),
      pageNumber: 1,
      dimensions: { ...PAGE_DIMENSION_PRESETS.A4 },
      orientation: this.plugin.settings.defaultOrientation,
      template: {
        type: this.plugin.settings.defaultTemplate,
        backgroundColor: this.plugin.settings.defaultPaperBackground,
        lineColor: this.plugin.settings.defaultLineColor,
        spacing: this.plugin.settings.defaultLineSpacing,
        opacity: 0.8
      },
      strokes: [],
      shapes: [],
      texts: [],
      images: []
    };

    return {
      metadata: {
        title,
        createdAt: now,
        updatedAt: now,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        defaultPageSize: this.plugin.settings.defaultPageSize,
        defaultOrientation: this.plugin.settings.defaultOrientation
      },
      pages: [initialPage]
    };
  }

  resolveResourcePath(vaultPath: string): string {
    const file = this.app.vault.getAbstractFileByPath(vaultPath);
    if (file && file instanceof TFile) {
      return this.app.vault.getResourcePath(file);
    }
    return vaultPath;
  }

  openExportModal(): void {
    if (!this.document) {
      new Notice("No notebook document loaded to export");
      return;
    }
    const modal = new ExportModal(
      this.app,
      this.document.pages.length,
      this.currentPageNumber,
      async (options) => {
        if (!this.document) {
          return;
        }
        await ExportEngine.exportNotebook(
          this.app,
          this.document,
          options,
          this.file,
          this.currentPageNumber
        );
      }
    );
    modal.open();
  }

  openImagePicker(targetPageId?: string): void {
    this.importHandler.openImagePicker(targetPageId);
  }

  openPdfPicker(forceNewNotebook: boolean = false, targetPageNumber?: number): void {
    this.importHandler.openPdfPicker(forceNewNotebook, targetPageNumber);
  }

  async promptAndImportVaultPdf(
    pdfFile: TFile,
    forceNewNotebook: boolean = false,
    targetPageNumber?: number
  ): Promise<void> {
    return this.importHandler.promptAndImportVaultPdf(pdfFile, forceNewNotebook, targetPageNumber);
  }

  async promptAndImportLocalPdf(
    file: File,
    forceNewNotebook: boolean = false,
    targetPageNumber?: number
  ): Promise<void> {
    return this.importHandler.promptAndImportLocalPdf(file, forceNewNotebook, targetPageNumber);
  }

  async importPdfFile(
    pdfFile: TFile,
    destinationFolder?: string,
    forceNewNotebook: boolean = false,
    targetPageNumber?: number
  ): Promise<void> {
    return this.importHandler.importPdfFile(pdfFile, destinationFolder, forceNewNotebook, targetPageNumber);
  }

  insertTextBox(targetPageId?: string): void {
    const targetPage = targetPageId
      ? this.pageManager?.getPage(targetPageId)
      : this.pageManager?.getPageByNumber(this.currentPageNumber);
    if (!targetPage) {
      return;
    }
    this.setActiveTool("text");
    const frameEl = this.getPageFrame(targetPage.pageNumber);
    if (frameEl) {
      this.textController.startEditing(targetPage, frameEl, undefined, 60, 100, undefined, undefined, this.currentTextOptions);
    }
  }

  insertStickyNote(targetPageId?: string): void {
    const targetPage = targetPageId
      ? this.pageManager?.getPage(targetPageId)
      : this.pageManager?.getPageByNumber(this.currentPageNumber);
    if (!targetPage) {
      return;
    }
    this.setActiveTool("sticky");
    const frameEl = this.getPageFrame(targetPage.pageNumber);
    if (frameEl) {
      this.textController.startEditing(targetPage, frameEl, undefined, 60, 100, 140, 140, {
        isSticky: true,
        backgroundColor: this.currentStickyColor
      });
    }
  }

  mountPageCanvases(pageNumber: number): void {
    const page = this.pageManager?.getPageByNumber(pageNumber);
    if (!page) {
      return;
    }

    const scale = this.getCanvasScale();
    const targetW = Math.round(page.dimensions.width * scale);
    const targetH = Math.round(page.dimensions.height * scale);

    const committedCanvas = this.committedCanvasMap.get(page.id);
    if (committedCanvas && committedCanvas.width <= 1) {
      committedCanvas.width = targetW;
      committedCanvas.height = targetH;
      this.redrawCommittedCanvas(page.id);
    }

    const templateCanvas = this.templateCanvasMap.get(page.id);
    if (templateCanvas && templateCanvas.width <= 1) {
      templateCanvas.width = targetW;
      templateCanvas.height = targetH;
      TemplateRenderer.renderTemplate(templateCanvas, page.dimensions, page.template);
    }

    const activeCanvas = this.activeCanvasMap.get(page.id);
    if (activeCanvas && activeCanvas.width <= 1) {
      activeCanvas.width = targetW;
      activeCanvas.height = targetH;
    }

    const pageEl = this.pageElements.get(pageNumber);
    if (pageEl && page.pdfSource && !page.pdfSource.svgPath) {
      const frameEl = pageEl.querySelector(".notepages-page-frame") as HTMLElement | null;
      if (frameEl) {
        this.pdfBackgroundManager.renderPdfBackground(page, frameEl, () => {
          this.updateThumbnailStrokes(page);
        });
      }
    }

    this.performanceMonitor.updatePageCounts(
      this.pageVirtualizer.getMountedPages().length,
      this.pageVirtualizer.getCulledPages().length
    );
  }

  unmountPageCanvases(pageNumber: number): void {
    const page = this.pageManager?.getPageByNumber(pageNumber);
    if (!page) {
      return;
    }
    if (this.inkingController.isCurrentlyDrawing(page.id)) {
      return;
    }

    const committedCanvas = this.committedCanvasMap.get(page.id);
    if (committedCanvas && committedCanvas.width > 1) {
      committedCanvas.width = 1;
      committedCanvas.height = 1;
    }

    const templateCanvas = this.templateCanvasMap.get(page.id);
    if (templateCanvas && templateCanvas.width > 1) {
      templateCanvas.width = 1;
      templateCanvas.height = 1;
    }

    const activeCanvas = this.activeCanvasMap.get(page.id);
    if (activeCanvas && activeCanvas.width > 1) {
      activeCanvas.width = 1;
      activeCanvas.height = 1;
    }

    const pageEl = this.pageElements.get(pageNumber);
    if (pageEl && page.pdfSource && !page.pdfSource.svgPath) {
      const frameEl = pageEl.querySelector(".notepages-page-frame") as HTMLElement | null;
      if (frameEl) {
        this.pdfBackgroundManager.unrenderPdfBackground(page, frameEl);
      }
    }

    this.performanceMonitor.updatePageCounts(
      this.pageVirtualizer.getMountedPages().length,
      this.pageVirtualizer.getCulledPages().length
    );
  }

  getPerformanceMonitor(): PerformanceMonitor {
    return this.performanceMonitor;
  }

  getPageVirtualizer(): PageVirtualizer {
    return this.pageVirtualizer;
  }
}
