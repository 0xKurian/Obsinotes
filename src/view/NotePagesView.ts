import {
  TextFileView,
  WorkspaceLeaf,
  TFile,
  Notice,
  Scope,
  KeymapEventHandler,
  Modifier,
  Modal,
  App,
  normalizePath,
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
  PageDimensions,
  PageSizePreset,
  ToolbarLayoutConfig,
  ToolbarPlacement,
  getEffectivePageDimensions,
  ToolType,
  PaperTemplateType,
  PageOrientation,
  PenPreset,
  StrokeObject,
  ShapeObject,
  ShapeType,
  StrokePattern,
  SelectionSubMode,
  TextObject,
  ImageObject,
  StrokeBoundingBox,
  EraserMode,
  HotkeyActionId
} from "../types";
import {
  HOTKEY_ACTION_METADATA,
  areHotkeyBindingsEqual,
  formatHotkeyBinding,
  resolveHotkeyBinding
} from "../settings/HotkeyHelper";
import { PageManager } from "../model/PageManager";
import { TemplateRenderer } from "../renderer/TemplateRenderer";
import { InkingController } from "../ink/InkingController";
import { RulerOverlayController } from "../ink/RulerOverlayController";
import { SelectionController } from "../selection/SelectionController";
import {
  HistoryManager,
  AddStrokeCommand,
  ConvertShapeCommand,
  EraseStrokesCommand,
  TransformElementsCommand,
  DeleteElementsCommand,
  MoveElementsAcrossPagesCommand,
  AddTextCommand,
  ModifyTextCommand,
  AddImageCommand,
  ModifyImageCommand,
  DeletePageCommand,
  ResizePageCommand,
  SetPageBookmarkCommand,
  SetPageTitleCommand
} from "../history/HistoryManager";
import { createDefaultPenPresets } from "../settings/NotePagesSettings";
import { DocumentSerializer } from "../storage/DocumentSerializer";
import { StorageManager } from "../storage/StorageManager";
import { TextController, TextFormattingOptions } from "../text/TextController";
import { ImageController } from "../image/ImageController";
import { PdfBackgroundManager } from "../pdf/PdfBackgroundManager";
import { NotePagesImportHandler, NotePagesImportDelegate } from "./NotePagesImportHandler";
import { NotePagesSidebar, NotePagesSidebarDelegate } from "./NotePagesSidebar";
import { NotePagesToolbar, NotePagesToolbarDelegate } from "./NotePagesToolbar";
import { NotePagesMinimap, NotePagesMinimapDelegate } from "./NotePagesMinimap";
import { PageSizeModal, PageSizeModalResult } from "../modal/PageSizeModal";
import { ExportModal } from "../modal/ExportModal";
import { QuickRenameModal } from "../modal/QuickRenameModal";
import { PageGridOverviewModal } from "../modal/PageGridOverviewModal";
import { ExportEngine } from "../export/ExportEngine";
import { PerformanceMonitor } from "../performance/PerformanceMonitor";
import { PageVirtualizer } from "../performance/PageVirtualizer";
import { PageSpatialIndexRegistry } from "../geometry/PageSpatialIndex";
import { ViewportZoomController } from "./ViewportZoomController";
import { SelectionDragCoordinator } from "./SelectionDragCoordinator";
import { PageCanvasHost } from "./PageCanvasHost";
import { GestureInputRouter } from "./GestureInputRouter";

class ConfirmResetModal extends Modal {
  private message: string;
  private onConfirm: () => void;

  constructor(app: App, message: string, onConfirm: () => void) {
    super(app);
    this.message = message;
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("p", { text: this.message });
    const footer = contentEl.createDiv({ cls: "notepages-folder-picker-footer" });
    const cancelBtn = footer.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => {
      this.close();
    });
    const confirmBtn = footer.createEl("button", { cls: "mod-warning", text: "Confirm" });
    confirmBtn.addEventListener("click", () => {
      this.close();
      this.onConfirm();
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

export class NotePagesView
  extends TextFileView
  implements NotePagesImportDelegate, NotePagesSidebarDelegate, NotePagesToolbarDelegate, NotePagesMinimapDelegate
{
  plugin: NotePagesPlugin;
  importHandler: NotePagesImportHandler;
  sidebar: NotePagesSidebar;
  toolbar: NotePagesToolbar;
  minimap!: NotePagesMinimap;
  toolbarPlacement: ToolbarPlacement = "top";
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
  selectionSubMode: SelectionSubMode = "lasso";
  historyManager: HistoryManager;

  rootContainerEl!: HTMLElement;
  mainAreaEl!: HTMLElement;
  canvasStageEl!: HTMLElement;
  scrollerEl!: HTMLElement;
  pagesContainerEl!: HTMLElement;
  statusAreaEl!: HTMLElement;
  statusPageInfoEl!: HTMLElement;
  statusZoomInfoEl!: HTMLElement;
  statusToolInfoEl!: HTMLElement;
  statusSaveInfoEl!: HTMLElement;

  currentPageNumber: number = 1;
  pageIntersectionObserver: IntersectionObserver | null = null;
  private toolbarResizeObserver: ResizeObserver | null = null;
  performanceMonitor: PerformanceMonitor = new PerformanceMonitor();
  pageVirtualizer!: PageVirtualizer;

  private zoomController!: ViewportZoomController;
  private canvasHost!: PageCanvasHost;
  private dragCoordinator!: SelectionDragCoordinator;
  private gestureRouter!: GestureInputRouter;
  private rulerController!: RulerOverlayController;

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

  private registeredKeyHandlers: KeymapEventHandler[] = [];
  private eraserCursorEl!: HTMLElement;
  private penCursorEl!: HTMLElement;
  private thumbnailDebounceTimers: Map<string, number> = new Map();
  penWidth: number = 2.5;
  highlighterWidth: number = 14.0;
  isSidebarCollapsed: boolean = false;
  currentStickyColor: string = "#fef08a";
  currentShapeType: ShapeType = "rectangle";
  shapeFillEnabled: boolean = false;

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
            const prev = page.texts.find((t) => t.id === text.id) || text;
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
          void this.app.workspace.openLinkText(
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
            new AddStrokeCommand(page, stroke, (isInitial) => {
              this.handleMutation(page, { redrawCanvas: !isInitial, debounceThumbnail: true });
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
      onStrokesErased: (pageId: string, remainingStrokes: StrokeObject[], remainingShapes?: ShapeObject[]) => {
        if (!this.pageManager || !this.document) {
          return;
        }
        const page = this.pageManager.getPage(pageId);
        if (page) {
          const prevStrokes = [...page.strokes];
          const prevShapes = [...page.shapes];
          const nextShapes = remainingShapes ?? prevShapes;
          this.historyManager.execute(
            new EraseStrokesCommand(
              page,
              prevStrokes,
              remainingStrokes,
              () => {
                this.handleMutation(page, { redrawCanvas: true, debounceThumbnail: true });
              },
              prevShapes,
              nextShapes
            )
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
                  this.imageController.renderPageImages(page, frameEl, (p) => this.resolveResourcePath(p));
                }
              },
              texts,
              images
            )
          );
        }
      },
      onRequestRedraw: (pageId: string) => {
        this.canvasHost.redrawCommittedCanvas(pageId);
        const activeCanvas = this.canvasHost.getActiveCanvas(pageId);
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
              this.canvasHost.redrawCommittedCanvas(src.id);
              this.canvasHost.redrawCommittedCanvas(tgt.id);
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
      onMoveStart: (sourcePageId: string, bounds: StrokeBoundingBox, clientX?: number, clientY?: number) => {
        this.dragCoordinator.startSelectionDrag(sourcePageId, bounds, clientX, clientY);
      }
    });

    this.importHandler = new NotePagesImportHandler(this);
    this.sidebar = new NotePagesSidebar(this);
    this.toolbar = new NotePagesToolbar(this);

    this.pageVirtualizer = new PageVirtualizer(
      {
        getTotalPages: () => this.pageManager?.getPages().length ?? 0,
        mountPageCanvases: (pageNumber: number) => {
          this.canvasHost.mountPageCanvases(pageNumber);
        },
        unmountPageCanvases: (pageNumber: number) => {
          this.canvasHost.unmountPageCanvases(pageNumber);
        },
        isPageDrawing: (pageNumber: number) => {
          const page = this.pageManager?.getPageByNumber(pageNumber);
          return page ? this.inkingController.isCurrentlyDrawing(page.id) : false;
        }
      },
      {
        virtualizationThreshold: 4,
        bufferPages: 2
      }
    );

    this.canvasHost = new PageCanvasHost({
      getPage: (pageId) => this.pageManager?.getPage(pageId),
      getPageByNumber: (pageNumber) => this.pageManager?.getPageByNumber(pageNumber),
      getCurrentPageNumber: () => this.currentPageNumber,
      getCanvasScale: () => this.zoomController.getCanvasScale(),
      getInkingController: () => this.inkingController,
      getSelectionController: () => this.selectionController,
      getPdfBackgroundManager: () => this.pdfBackgroundManager,
      getPageVirtualizer: () => this.pageVirtualizer,
      getPerformanceMonitor: () => this.performanceMonitor,
      isTextEditing: () => this.textController.isEditing(),
      updateThumbnailStrokes: (page) => this.updateThumbnailStrokes(page)
    });

    this.zoomController = new ViewportZoomController({
      getScrollerEl: () => this.scrollerEl,
      getPagesContainerEl: () => this.pagesContainerEl,
      getPages: () => this.pageManager?.getPages() ?? [],
      getMountedPageNumbers: () => {
        const mountedList = this.pageVirtualizer?.getMountedPages?.() || [];
        return mountedList.length > 0
          ? new Set(mountedList)
          : new Set([this.currentPageNumber, 1, 2, 3]);
      },
      getTemplateCanvas: (pageId) => this.canvasHost.getTemplateCanvas(pageId),
      getCommittedCanvas: (pageId) => this.canvasHost.getCommittedCanvas(pageId),
      getActiveCanvas: (pageId) => this.canvasHost.getActiveCanvas(pageId),
      redrawCommittedCanvas: (pageId) => this.canvasHost.redrawCommittedCanvas(pageId),
      onZoomUpdated: (zoom) => {
        this.toolbar.updateZoomDisplay(zoom);
        this.updateStatusDisplay();
        if (this.minimap) {
          this.minimap.onZoomChanged(zoom);
        }
        this.gestureRouter.updateEraserCursorSize();
        this.rulerController?.syncDom();
      }
    });

    this.dragCoordinator = new SelectionDragCoordinator({
      getPagesContainerEl: () => this.pagesContainerEl,
      getPages: () => this.pageManager?.getPages() ?? [],
      getPage: (pageId) => this.pageManager?.getPage(pageId),
      getPageByNumber: (pageNumber) => this.pageManager?.getPageByNumber(pageNumber),
      getCurrentPageNumber: () => this.currentPageNumber,
      getZoomLevel: () => this.zoomController.getZoomLevel(),
      getPageElement: (pageNumber) => this.canvasHost.getPageElement(pageNumber),
      getPageFrame: (pageNumber) => this.getPageFrame(pageNumber),
      getActiveCanvas: (pageId) => this.canvasHost.getActiveCanvas(pageId),
      mountPageCanvases: (pageNumber) => this.canvasHost.mountPageCanvases(pageNumber),
      getSelectionController: () => this.selectionController,
      getHistoryManager: () => this.historyManager,
      handleMutation: (page) => this.handleMutation(page),
      renderPageTexts: (page, frameEl) => this.textController.renderPageTexts(page, frameEl),
      renderPageImages: (page, frameEl) =>
        this.imageController.renderPageImages(page, frameEl, (p) => this.resolveResourcePath(p))
    });

    this.rulerController = new RulerOverlayController({
      getPagesContainerEl: () => this.pagesContainerEl,
      getScrollerEl: () => this.scrollerEl,
      getZoomLevel: () => this.zoomController.getZoomLevel(),
      getPageElement: (pageNumber) => this.canvasHost.getPageElement(pageNumber),
      getCurrentPageNumber: () => this.currentPageNumber,
      onVisibilityChanged: (visible) => {
        this.toolbar?.setRulerActive(visible);
      },
      registerDomEvent: (el, type, callback, options) => {
        this.registerDomEvent(el as HTMLElement, type, callback as (ev: Event) => unknown, options);
      }
    });

    this.gestureRouter = new GestureInputRouter({
      app: this.app,
      getRootContainerEl: () => this.rootContainerEl,
      getScrollerEl: () => this.scrollerEl,
      getPagesContainerEl: () => this.pagesContainerEl,
      getEraserCursorEl: () => this.eraserCursorEl,
      getPenCursorEl: () => this.penCursorEl,
      shouldShowPenCursor: () => this.plugin.settings.showPenHoverCursor !== false,
      getFilePath: () => this.file?.path || "",
      getCurrentPageNumber: () => this.currentPageNumber,
      getPageByNumber: (pageNumber) => this.pageManager?.getPageByNumber(pageNumber),
      getAllPages: () => this.pageManager?.getPages() ?? [],
      getInkingController: () => this.inkingController,
      getSelectionController: () => this.selectionController,
      getTextController: () => this.textController,
      getImageController: () => this.imageController,
      getHistoryManager: () => this.historyManager,
      getCanvasHost: () => this.canvasHost,
      getZoomController: () => this.zoomController,
      getDragCoordinator: () => this.dragCoordinator,
      getRulerController: () => this.rulerController,
      getSelectionSubMode: () => this.selectionSubMode,
      getCurrentShapeType: () => this.currentShapeType,
      isShapeFillEnabled: () => this.shapeFillEnabled,
      getShapeFillColor: () => this.getShapeFillColor(),
      getCurrentStickyColor: () => this.currentStickyColor,
      getCurrentTextOptions: () => this.currentTextOptions,
      getDrawWithFinger: () => Boolean(this.plugin.settings.drawWithFinger),
      getTwoFingerTapUndoRedo: () => this.plugin.settings.twoFingerTapUndoRedo !== false,
      getStylusButtonAction: () => this.plugin.settings.stylusButtonAction ?? "hold",
      isDarkColor: (hex) => this.isDarkColor(hex),
      resolveResourcePath: (path) => this.resolveResourcePath(path),
      blurFocusedToolbarControl: () => this.blurFocusedToolbarControl(),
      setToolbarDrawingActive: (active) => this.toolbar.setDrawingActive(active),
      setToolbarActiveTool: (tool) => this.toolbar.setActiveTool(tool, this.currentShapeType, false),
      setActiveTool: (tool, commitPendingText) => this.setActiveTool(tool, commitPendingText),
      onUndo: () => this.onUndo(),
      onRedo: () => this.onRedo(),
      handleMutation: (page) => this.handleMutation(page),
      insertTextBox: (targetPageId, clientX, clientY) => this.insertTextBox(targetPageId, clientX, clientY),
      insertStickyNote: (targetPageId, clientX, clientY) => this.insertStickyNote(targetPageId, clientX, clientY),
      openImagePicker: () => this.openImagePicker(),
      openPdfPicker: (forceNew) => this.openPdfPicker(forceNew),
      addNewPage: () => this.addNewPage(),
      duplicateCurrentPage: () => this.duplicateCurrentPage(),
      openQuickRenameModal: () => this.openQuickRenameModal(),
      openExportModal: () => this.openExportModal(),
      promptAndImportLocalPdf: (file, forceNew, targetPage) =>
        this.promptAndImportLocalPdf(file, forceNew, targetPage),
      promptAndImportVaultPdf: (file, forceNew, targetPage) =>
        this.promptAndImportVaultPdf(file, forceNew, targetPage),
      registerDomEvent: (el, type, callback, options) => {
        this.registerDomEvent(el, type, callback as (ev: Event) => unknown, options);
      },
      registerWindowDomEvent: (type, callback, options) => {
        this.registerDomEvent(window, type, callback as (ev: Event) => unknown, options);
      }
    });

    this.inkingController.setPerformanceMonitor(this.performanceMonitor);
    this.applyInitialDrawingSettings();
  }

  private applyInitialDrawingSettings(): void {
    const s = this.plugin?.settings;
    if (!s) {
      return;
    }
    this.penWidth = Math.max(0.5, Math.min(15, s.defaultPenWidth ?? 2.5));
    this.highlighterWidth = Math.max(4, Math.min(36, s.defaultHighlighterWidth ?? 14));
    const initialTool = s.defaultTool ?? "pressure";
    if (initialTool === "select") {
      this.inkingController.setTool("lasso");
      this.selectionSubMode = "pan";
    } else {
      this.inkingController.setTool(initialTool);
      if (initialTool === "lasso") {
        this.selectionSubMode = "lasso";
      }
    }
    const color = s.defaultPenColor || "#1e293b";
    this.inkingController.setColor(color);
    this.currentTextOptions.color = color;
    this.inkingController.setWidth(initialTool === "highlighter" ? this.highlighterWidth : this.penWidth);
    this.inkingController.setEraserMode(s.defaultEraserMode ?? "stroke");
    this.inkingController.setEraserRadius(s.defaultEraserRadius ?? 12);
    this.inkingController.setShapeRecognition(s.shapeRecognitionEnabled ?? true);
    this.inkingController.setPalmRejectionDelay(s.palmRejectionDelayMs ?? 350);
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
    return extension.toLowerCase() === "gnote" || extension.toLowerCase() === "md";
  }

  async onLoadFile(file: TFile): Promise<void> {
    if (!this.plugin.isNotePagesDocument(file)) {
      if (this.pagesContainerEl) {
        this.pagesContainerEl.empty();
      }
      await this.leaf.setViewState({
        type: "markdown",
        state: { file: file.path }
      });
      return;
    }

    await super.onLoadFile(file);
    this.updateStatusDisplay();
    this.toolbar.updateTitle(this.getNotebookTitle());
  }

  async onRename(file: TFile): Promise<void> {
    await super.onRename(file);
    if (this.document && this.document.metadata) {
      this.document.metadata.title = file.basename;
    }
    this.toolbar?.updateTitle(this.getNotebookTitle());
    this.updateStatusDisplay();
  }

  getNotebookTitle(): string {
    if (this.file instanceof TFile) {
      return this.file.basename;
    }
    if (this.document?.metadata?.title) {
      return this.document.metadata.title;
    }
    return "Untitled Notebook";
  }

  getDisplayText(): string {
    if (this.file instanceof TFile) {
      return this.file.basename;
    }
    if (this.document?.metadata?.title) {
      return this.document.metadata.title;
    }
    return "Notebook";
  }

  getIcon(): string {
    return "book-open";
  }

  async onOpen(): Promise<void> {
    try {
      await loadMathJax();
    } catch (err) {
      void err;
    }

    this.contentEl.empty();

    this.rootContainerEl = this.contentEl.createDiv({
      cls: "notepages-view-container"
    });

    this.registerDomEvent(
      this.rootContainerEl,
      "contextmenu",
      (e: MouseEvent) => {
        if (
          this.gestureRouter.stylusButtonState.shouldSuppressContextMenu(
            (e as PointerEvent).pointerType,
            this.gestureRouter.isPanning
          )
        ) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true
    );

    this.eraserCursorEl = this.rootContainerEl.createDiv({
      cls: "notepages-eraser-cursor is-hidden"
    });
    this.penCursorEl = this.rootContainerEl.createDiv({
      cls: "notepages-pen-cursor is-hidden"
    });

    this.buildMainArea();
    this.toolbar.build(this.canvasStageEl);
    this.toolbar.setSelectionSubMode(this.selectionSubMode);
    this.toolbar.setActiveColor(this.inkingController.currentColor);
    this.toolbar.setActiveWidth(this.inkingController.currentWidth);
    this.toolbar.setEraserMode(this.inkingController.eraserMode);
    this.toolbar.setEraserRadius(this.inkingController.eraserRadius);
    this.rootContainerEl.toggleClass(
      "is-tool-select",
      this.inkingController.activeTool === "lasso" && this.selectionSubMode === "pan"
    );
    this.minimap = new NotePagesMinimap(this);
    this.minimap.build(this.canvasStageEl);
    this.setupToolbarResizeObserver();
    this.syncScrollerTopPadding();
    this.buildStatusArea();
    this.registerKeyboardShortcuts();
  }

  private registerKeyboardShortcuts(): void {
    if (!this.scope) {
      this.scope = new Scope(this.app.scope);
    }
    this.refreshKeyboardShortcuts();
  }

  refreshKeyboardShortcuts(): void {
    if (!this.scope) {
      return;
    }

    for (const handler of this.registeredKeyHandlers) {
      this.scope.unregister(handler);
    }
    this.registeredKeyHandlers = [];

    const customHotkeys = this.plugin?.settings?.customHotkeys;
    const actionHandlers: Record<HotkeyActionId, (e: KeyboardEvent) => boolean | void> = {
      toolPen: () => this.setActiveTool("pressure"),
      toolPencil: () => this.setActiveTool("pencil"),
      toolHighlighter: () => this.setActiveTool("highlighter"),
      toolEraser: () => this.setActiveTool("eraser"),
      toolLasso: () => {
        this.selectionSubMode = "lasso";
        this.toolbar?.setSelectionSubMode?.("lasso");
        this.setActiveTool("lasso");
      },
      toolPan: () => this.setActiveTool("select"),
      toolShape: () => this.setActiveTool("shape"),
      toolConnector: () => this.setActiveTool("connector"),
      toolSticky: () => this.setActiveTool("sticky"),
      toolText: () => this.setActiveTool("text"),
      toolImage: () => this.openImagePicker(),
      toggleRuler: () => {
        this.onToggleRuler();
      },
      toggleFocusMode: () => {
        this.onToggleFocusMode();
      },
      undo: () => {
        this.clearActiveSelectionCanvas();
        this.historyManager.undo();
      },
      redo: () => {
        this.clearActiveSelectionCanvas();
        this.historyManager.redo();
      },
      redoAlt: () => {
        this.clearActiveSelectionCanvas();
        this.historyManager.redo();
      },
      duplicateSelection: () => {
        if (!this.selectionController.hasSelection()) {
          return true;
        }
        this.dragCoordinator.duplicateActiveSelection();
        return false;
      },
      copySelection: () => {
        if (!this.selectionController.hasSelection()) {
          return true;
        }
        this.dragCoordinator.copySelection();
        return false;
      },
      pasteSelection: () => {
        if (!this.dragCoordinator.hasClipboard()) {
          return true;
        }
        this.dragCoordinator.pasteSelection();
        return false;
      },
      deleteSelection: () => this.handleDeleteShortcut(),
      decreaseWidth: () => {
        const current = this.inkingController.currentWidth;
        const next = Math.max(0.5, Math.round((current - 0.5) * 10) / 10);
        this.setActiveWidth(next);
      },
      increaseWidth: () => {
        const current = this.inkingController.currentWidth;
        const next = Math.min(30, Math.round((current + 0.5) * 10) / 10);
        this.setActiveWidth(next);
      },
      zoomIn: () => this.zoomController.changeZoom(0.1),
      zoomOut: () => this.zoomController.changeZoom(-0.1),
      zoomReset: () => this.zoomController.resetZoom(),
      toggleSidebar: () => this.toggleSidebar(),
      addPage: () => this.addNewPage(),
      toggleOrientation: () => this.onToggleOrientation(),
      quickRename: () => this.openQuickRenameModal(),
      clearSelection: () => this.handleEscapeShortcut()
    };

    const registerBinding = (
      modifiers: Modifier[],
      key: string,
      handlerFn: (e: KeyboardEvent) => boolean | void
    ) => {
      if (!this.scope) {
        return;
      }
      const keyHandler = this.scope.register(modifiers, key, (e) => {
        if (this.textController.isEditing()) {
          return true;
        }
        const outcome = handlerFn(e);
        if (outcome === true) {
          return true;
        }
        e.preventDefault();
        return false;
      });
      this.registeredKeyHandlers.push(keyHandler);
    };

    const resolvedBindings = HOTKEY_ACTION_METADATA.map((meta) => ({
      id: meta.id,
      binding: resolveHotkeyBinding(meta.id, customHotkeys)
    }));

    const hasExactBinding = (modifiers: Modifier[], key: string): boolean => {
      return resolvedBindings.some(
        (entry) => entry.binding !== null && areHotkeyBindingsEqual(entry.binding, { modifiers, key })
      );
    };

    for (const entry of resolvedBindings) {
      if (!entry.binding) {
        continue;
      }
      registerBinding(entry.binding.modifiers, entry.binding.key, actionHandlers[entry.id]);
      if (
        entry.id === "zoomIn" &&
        areHotkeyBindingsEqual(entry.binding, { modifiers: [], key: "=" }) &&
        !hasExactBinding([], "+")
      ) {
        registerBinding([], "+", actionHandlers.zoomIn);
      }
      if (
        entry.id === "deleteSelection" &&
        areHotkeyBindingsEqual(entry.binding, { modifiers: [], key: "Delete" }) &&
        !hasExactBinding([], "Backspace")
      ) {
        registerBinding([], "Backspace", actionHandlers.deleteSelection);
      }
    }

    this.toolbar?.updateHotkeyTooltips((actionId) => {
      const binding = resolveHotkeyBinding(actionId, customHotkeys);
      return binding ? formatHotkeyBinding(binding) : null;
    });
  }

  private handleDeleteShortcut(): boolean | void {
    if (this.selectionController.hasSelection()) {
      this.dragCoordinator.deleteActiveSelection();
      return false;
    }
    const selectedImgId = this.imageController.getSelectedImageId();
    if (selectedImgId && this.pageManager) {
      const page = this.pageManager.getPageByNumber(this.currentPageNumber);
      if (page) {
        this.imageController.deselectImage();
        this.imageController.callbacks.onImageDeleted(page, selectedImgId);
        return false;
      }
    }
    return true;
  }

  private handleEscapeShortcut(): boolean | void {
    if (this.selectionController.hasSelection()) {
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
  }

  async onClose(): Promise<void> {
    if (this.textController?.isEditing()) {
      this.textController.commitActiveEdit();
    }
    this.zoomController.destroy();
    this.rulerController.destroy();
    this.clearThumbnailDebounceTimers();
    this.gestureRouter.resetState();
    this.dragCoordinator.clearOverlayRef();
    if (this.saveStatusResetTimer !== null) {
      window.clearTimeout(this.saveStatusResetTimer);
      this.saveStatusResetTimer = null;
    }
    this.pageIntersectionObserver?.disconnect();
    this.pageIntersectionObserver = null;
    this.toolbarResizeObserver?.disconnect();
    this.toolbarResizeObserver = null;
    this.pageVirtualizer.destroy();
    this.sidebar.destroy();
    this.minimap?.destroy();
    this.selectionController?.destroy();
    this.pdfBackgroundManager.destroy();
    this.document = null;
    this.pageManager = null;
    this.canvasHost.clearAll();
    this.contentEl.empty();
  }

  clear(): void {
    if (this.textController?.isEditing()) {
      this.textController.commitActiveEdit();
    }
    this.zoomController.destroy();
    this.rulerController.destroy();
    this.clearThumbnailDebounceTimers();
    this.gestureRouter.resetState();
    this.dragCoordinator.clearOverlayRef();
    this.pageIntersectionObserver?.disconnect();
    this.pageVirtualizer.destroy();
    this.selectionController?.destroy();
    this.sidebar.clear();
    this.minimap?.clear();
    this.pdfBackgroundManager.destroy();
    this.document = null;
    this.pageManager = null;
    this.canvasHost.clearAll();

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
    if (this.textController?.isEditing()) {
      this.textController.commitActiveEdit();
    }
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
      window.setTimeout(() => {
        void this.leaf.setViewState({
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
      this.statusSaveInfoEl.setText("Protected (read-only)");
      this.statusSaveInfoEl.addClass("notepages-status-error");
    }

    const banner = this.pagesContainerEl.createDiv({
      cls: "notepages-corrupted-banner"
    });

    banner.createEl("h3", {
      text: "Notepages safe mode: data protection activated"
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
      text: "Open as raw Markdown",
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
      text: "Create emergency backup copy"
    });
    this.registerDomEvent(emergencyBackupBtn, "click", async () => {
      if (this.file) {
        const backupInfo = await this.storageManager.createEmergencyBackup(this.file, this.rawCorruptedData);
        new Notice(`Emergency backup saved to: ${backupInfo.backupPath}`);
      }
    });

    const overwriteBtn = actions.createEl("button", {
      text: "Discard and reset to new notebook",
      cls: "mod-warning"
    });
    this.registerDomEvent(overwriteBtn, "click", () => {
      new ConfirmResetModal(
        this.app,
        "Are you sure you want to discard the corrupted document and reset? This cannot be undone.",
        () => {
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
      ).open();
    });
  }

  onToggleSidebar(): void {
    this.toggleSidebar();
  }

  onQuickRename(): void {
    this.openQuickRenameModal();
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
    this.gestureRouter.stylusButtonState.clearToggleHistory();
    this.setActiveTool(tool);
  }

  onSelectColor(color: string): void {
    this.setActiveColor(color);
  }

  onSelectWidth(width: number): void {
    this.setActiveWidth(width);
  }

  onSelectStrokePattern(pattern: StrokePattern): void {
    this.inkingController.setStrokePattern(pattern);
    this.toolbar?.setStrokePattern(pattern);
  }

  getStrokePattern(): StrokePattern {
    return this.inkingController.currentStrokePattern;
  }

  onToggleRuler(): boolean {
    const visible = this.rulerController.toggle();
    this.toolbar?.setRulerActive(visible);
    return visible;
  }

  isRulerVisible(): boolean {
    return this.rulerController?.isVisible() ?? false;
  }

  onToggleFocusMode(): boolean {
    this.toolbar?.toggleCollapse();
    return this.toolbar?.isCollapsed ?? false;
  }

  getPenPresets(): PenPreset[] {
    if (!this.plugin.settings.penPresets || this.plugin.settings.penPresets.length === 0) {
      this.plugin.settings.penPresets = createDefaultPenPresets();
    }
    return this.plugin.settings.penPresets;
  }

  onSelectPenPreset(preset: PenPreset): void {
    this.setActiveTool(preset.tool);
    this.setActiveColor(preset.color);
    this.setActiveWidth(preset.width);
    this.onSelectStrokePattern(preset.strokePattern ?? "solid");
    this.toolbar?.refreshPenPresets();
  }

  onSavePenPreset(index: number): void {
    const presets = this.getPenPresets();
    if (index < 0 || index >= presets.length) {
      return;
    }
    const currentTool = this.inkingController.activeTool;
    const isInk =
      currentTool === "pen" ||
      currentTool === "pressure" ||
      currentTool === "fountain" ||
      currentTool === "pencil" ||
      currentTool === "highlighter";
    if (!isInk) {
      return;
    }
    const nextPresets = presets.map((item) => ({ ...item }));
    const color = this.inkingController.currentColor;
    const width = Math.round(this.inkingController.currentWidth * 10) / 10;
    const pattern = this.inkingController.currentStrokePattern ?? "solid";
    const toolName = currentTool === "pencil" ? "Pencil" : currentTool === "highlighter" ? "Highlight" : "Pen";
    nextPresets[index] = {
      ...nextPresets[index],
      label: `${toolName} ${width} pt`,
      tool: currentTool,
      color,
      width,
      strokePattern: pattern
    };
    this.plugin.settings.penPresets = nextPresets;
    void this.plugin.saveSettings();
    this.toolbar?.refreshPenPresets();
    new Notice(`Saved pen preset ${index + 1}`);
  }

  onOpenGridOverview(): void {
    this.openPageGridOverview();
  }

  openPageGridOverview(): void {
    if (!this.pageManager) {
      return;
    }
    const modal = new PageGridOverviewModal(this.app, {
      getPages: () => this.pageManager?.getPages() ?? [],
      getCurrentPageNumber: () => this.currentPageNumber,
      onJumpToPage: (pageNumber) => this.scrollToPage(pageNumber),
      onAddPage: () => this.onAddNewPage(),
      onReorderPage: (fromIndex, toIndex) => {
        if (!this.pageManager) return false;
        const ok = this.pageManager.reorderPages(fromIndex, toIndex);
        if (ok) {
          this.renderDocument();
          this.requestSave();
          this.scrollToPage(toIndex + 1);
        }
        return ok;
      },
      onDuplicatePages: (pageIds) => {
        if (!this.pageManager) return;
        let lastDup: PageData | null = null;
        for (const pageId of pageIds) {
          const dup = this.pageManager.duplicatePage(pageId);
          if (dup) {
            lastDup = dup;
          }
        }
        if (lastDup) {
          this.renderDocument();
          this.requestSave();
          this.updateStatusDisplay();
        }
      },
      onDeletePages: (pageIds) => {
        if (!this.pageManager || !this.document) return;
        const pageSet = new Set(pageIds);
        if (pageSet.size >= this.document.pages.length) {
          new Notice("Cannot delete every page in a notebook");
          return;
        }
        const remaining = this.document.pages.filter((p) => !pageSet.has(p.id));
        if (remaining.length === 0) return;
        for (let i = 0; i < remaining.length; i++) {
          remaining[i].pageNumber = i + 1;
        }
        this.document.pages = remaining;
        this.pageManager = new PageManager(this.document);
        this.currentPageNumber = Math.max(1, Math.min(this.currentPageNumber, remaining.length));
        this.renderDocument();
        this.requestSave();
        this.updateStatusDisplay();
      },
      onBookmarkPages: (pageIds, bookmarked) => {
        if (!this.pageManager) return;
        for (const pageId of pageIds) {
          const page = this.pageManager.getPage(pageId);
          if (page && Boolean(page.bookmarked) !== bookmarked) {
            this.executePageBookmarkMutation(page, bookmarked);
          }
        }
      },
      onRenamePage: (pageId, nextTitle) => {
        this.onRenamePage(pageId, nextTitle);
      }
    });
    modal.open();
  }

  onTogglePageBookmark(pageId: string): void {
    const page = this.pageManager?.getPage(pageId);
    if (!page) {
      return;
    }
    this.executePageBookmarkMutation(page, !page.bookmarked);
  }

  onRenamePage(pageId: string, nextTitle: string): void {
    const page = this.pageManager?.getPage(pageId);
    if (!page) {
      return;
    }
    const normalized = nextTitle.trim();
    const current = (page.title ?? "").trim();
    if (normalized === current) {
      this.sidebar?.refreshPageCardMeta(page);
      return;
    }
    this.historyManager.execute(
      new SetPageTitleCommand(page, normalized, (mutated) => {
        this.sidebar?.refreshPageCardMeta(mutated);
        if (this.document) {
          this.document.metadata.updatedAt = Date.now();
        }
        this.requestSave();
      })
    );
  }

  private executePageBookmarkMutation(page: PageData, bookmarked: boolean): void {
    this.historyManager.execute(
      new SetPageBookmarkCommand(page, bookmarked, (mutated) => {
        this.sidebar?.refreshPageCardMeta(mutated);
        if (this.document) {
          this.document.metadata.updatedAt = Date.now();
        }
        this.requestSave();
      })
    );
  }

  onSelectEraserMode(mode: EraserMode): void {
    this.inkingController.setEraserMode(mode);
    this.toolbar.setEraserMode(mode);
  }

  onSelectEraserRadius(radius: number): void {
    this.inkingController.setEraserRadius(radius);
    this.toolbar.setEraserRadius(radius);
    this.gestureRouter.updateEraserCursorSize();
  }

  getActiveEraserRadius(): number {
    return this.inkingController.eraserRadius;
  }

  onSetSelectionSubMode(mode: SelectionSubMode): void {
    this.selectionSubMode = mode;
    this.rootContainerEl.toggleClass("is-tool-select", mode === "pan");
    this.updateStatusDisplay();
  }

  getActiveSelectionSubMode(): SelectionSubMode {
    return this.selectionSubMode;
  }

  onDuplicateSelection(): void {
    this.dragCoordinator.duplicateActiveSelection();
  }

  onDeleteSelection(): void {
    this.dragCoordinator.deleteActiveSelection();
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
    this.zoomController.changeZoom(delta);
  }

  onResetZoom(): void {
    this.zoomController.resetZoom();
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

  onOpenPageSizeModal(): void {
    if (!this.pageManager) {
      return;
    }
    const currentPage = this.pageManager.getPageByNumber(this.currentPageNumber);
    if (!currentPage) {
      return;
    }

    const modal = new PageSizeModal(
      this.app,
      this.currentPageNumber,
      this.pageManager.getDocument().metadata.defaultPageSize,
      currentPage.dimensions,
      currentPage.orientation,
      (result) => {
        this.applyPageSizeChange(result);
      }
    );
    modal.open();
  }

  onSelectPagePreset(preset: PageSizePreset): void {
    if (!this.pageManager) {
      return;
    }
    const currentPage = this.pageManager.getPageByNumber(this.currentPageNumber);
    if (!currentPage) {
      return;
    }

    const newDimensions = getEffectivePageDimensions(preset, currentPage.orientation);
    this.applyPageSizeChange({
      preset,
      dimensions: newDimensions,
      orientation: currentPage.orientation,
      applyToAll: false
    });
  }

  onSelectPaperColor(color: string): void {
    if (!this.pageManager) {
      return;
    }
    const tpl = this.pageManager.getNotebookTemplate();
    this.pageManager.updateAllPagesTemplate({
      ...tpl,
      backgroundColor: color
    });
    this.renderDocument();
    this.requestSave();
    if (this.minimap) {
      this.minimap.update(true);
    }
    new Notice("Updated paper color");
  }

  onSelectLineColor(color: string): void {
    if (!this.pageManager) {
      return;
    }
    const tpl = this.pageManager.getNotebookTemplate();
    this.pageManager.updateAllPagesTemplate({
      ...tpl,
      lineColor: color
    });
    this.renderDocument();
    this.requestSave();
    new Notice("Updated line color");
  }

  getNotebookPaperColor(): string | undefined {
    return this.pageManager?.getNotebookTemplate().backgroundColor;
  }

  getNotebookLineColor(): string | undefined {
    return this.pageManager?.getNotebookTemplate().lineColor;
  }

  getNotebookPageSize(): PageSizePreset {
    return this.pageManager?.getDocument().metadata.defaultPageSize ?? "A4";
  }

  onSetToolbarPlacement(placement: ToolbarPlacement): void {
    this.toolbarPlacement = placement;
    if (this.plugin?.settings) {
      this.plugin.settings.toolbarPlacement = placement;
      void this.plugin.saveSettings();
    }
    this.syncScrollerTopPadding();
  }

  getToolbarPlacement(): ToolbarPlacement {
    const isPlacement = (value: unknown): value is ToolbarPlacement =>
      value === "top" || value === "bottom" || value === "left" || value === "right";
    const settingPlacement = this.plugin?.settings?.toolbarPlacement;
    if (isPlacement(settingPlacement)) {
      return settingPlacement;
    }
    return isPlacement(this.toolbarPlacement) ? this.toolbarPlacement : "top";
  }

  getToolbarLayoutConfig(): ToolbarLayoutConfig {
    const s = this.plugin?.settings;
    return {
      scale: 1.0,
      maxWidth: null,
      wrap: false,
      showTitle: s?.toolbarShowTitle ?? true,
      showZoomControls: s?.toolbarShowZoomControls ?? true
    };
  }

  onUpdateToolbarLayoutConfig(partial: Partial<ToolbarLayoutConfig>): void {
    const s = this.plugin?.settings;
    if (!s) {
      return;
    }
    s.toolbarScale = 1.0;
    s.toolbarMaxWidth = null;
    s.toolbarWrap = false;
    if (partial.showTitle !== undefined) {
      s.toolbarShowTitle = partial.showTitle;
    }
    if (partial.showZoomControls !== undefined) {
      s.toolbarShowZoomControls = partial.showZoomControls;
    }
    void this.plugin.saveSettings();
    this.syncScrollerTopPadding();
  }

  getToolbarFloatingPos(): { left: number; top: number } | null {
    return this.plugin?.settings?.toolbarFloatingPos ?? null;
  }

  onSetToolbarFloatingPos(pos: { left: number; top: number } | null): void {
    if (this.plugin?.settings) {
      this.plugin.settings.toolbarFloatingPos = pos;
      void this.plugin.saveSettings();
    }
  }

  shouldDimToolbarWhileDrawing(): boolean {
    return this.plugin?.settings?.toolbarDimWhileDrawing ?? true;
  }

  shouldSuppressToolbarContextMenu(e: MouseEvent): boolean {
    return this.gestureRouter.stylusButtonState.shouldSuppressContextMenu(
      (e as PointerEvent).pointerType,
      this.gestureRouter.isPanning
    );
  }

  refreshToolbarLayout(): void {
    if (!this.toolbar) {
      return;
    }
    this.toolbar.applyLayoutConfig(this.getToolbarLayoutConfig());
    const placement = this.getToolbarPlacement();
    if (placement !== this.toolbar.currentPlacement) {
      this.toolbar.setPlacement(placement, false);
    }
    this.syncScrollerTopPadding();
  }

  applyLiveSettings(): void {
    const s = this.plugin?.settings;
    if (s) {
      this.inkingController.setShapeRecognition(s.shapeRecognitionEnabled ?? true);
      this.inkingController.setPalmRejectionDelay(s.palmRejectionDelayMs ?? 350);
      if (s.showPenHoverCursor === false) {
        this.gestureRouter?.hidePenCursor();
      }
    }
    this.toolbar?.refreshPenPresets();
    this.refreshToolbarLayout();
    this.refreshKeyboardShortcuts();
  }

  private setupToolbarResizeObserver(): void {
    this.toolbarResizeObserver?.disconnect();
    if (typeof ResizeObserver === "undefined" || !this.toolbar?.toolbarWrapperEl) {
      return;
    }
    this.toolbarResizeObserver = new ResizeObserver(() => {
      this.syncScrollerTopPadding();
    });
    if (this.canvasStageEl) {
      this.toolbarResizeObserver.observe(this.canvasStageEl);
    }
    this.toolbarResizeObserver.observe(this.toolbar.toolbarWrapperEl);
    if (this.toolbar.toolbarEl) {
      this.toolbarResizeObserver.observe(this.toolbar.toolbarEl);
    }
    if (this.toolbar.subToolbarEl) {
      this.toolbarResizeObserver.observe(this.toolbar.subToolbarEl);
    }
  }

  syncScrollerTopPadding(): void {
    if (!this.scrollerEl || !this.toolbar?.toolbarWrapperEl) {
      return;
    }
    if (this.toolbar.currentPlacement === "top") {
      const wrapperRect = this.toolbar.toolbarWrapperEl.getBoundingClientRect();
      const height = wrapperRect.height;
      const topPad = height > 0 ? Math.max(68, Math.ceil(height) + 22) : 96;
      this.scrollerEl.setCssProps({
        "--np-scroller-padding-top": `${topPad}px`
      });
    } else {
      this.scrollerEl.setCssProps({
        "--np-scroller-padding-top": "32px"
      });
    }
  }

  private applyPageSizeChange(result: PageSizeModalResult): void {
    if (!this.pageManager) {
      return;
    }

    if (result.applyToAll) {
      this.pageManager.resizeAllPages(
        result.preset,
        result.preset === "Custom" ? result.dimensions : undefined,
        result.orientation
      );
      this.renderDocument();
      this.requestSave();
      if (this.minimap) {
        this.minimap.update(true);
      }
      new Notice(`Applied ${result.preset} size to all pages`);
    } else {
      const currentPage = this.pageManager.getPageByNumber(this.currentPageNumber);
      if (!currentPage) {
        return;
      }

      const prevDim = { ...currentPage.dimensions };
      const prevOrient = currentPage.orientation;

      const cmd = new ResizePageCommand(
        currentPage,
        prevDim,
        result.dimensions,
        (_page) => {
          this.renderDocument();
          this.requestSave();
          if (this.minimap) {
            this.minimap.update(true);
          }
        },
        prevOrient,
        result.orientation
      );
      this.historyManager.execute(cmd);
      new Notice(`Resized page ${this.currentPageNumber} to ${result.preset}`);
    }
  }

  getCurrentPageDimensions(): PageDimensions | undefined {
    return this.pageManager?.getPageByNumber(this.currentPageNumber)?.dimensions;
  }

  getCurrentPageBackgroundColor(): string | undefined {
    return this.pageManager?.getPageByNumber(this.currentPageNumber)?.template.backgroundColor;
  }

  getPageElement(pageNumber: number): HTMLElement | undefined {
    return this.canvasHost.getPageElement(pageNumber);
  }

  getCommittedCanvas(pageId: string): HTMLCanvasElement | undefined {
    return this.canvasHost.getCommittedCanvas(pageId);
  }

  getCurrentPageId(): string | undefined {
    return this.pageManager?.getPageByNumber(this.currentPageNumber)?.id;
  }

  getScrollerEl(): HTMLElement | undefined {
    return this.scrollerEl;
  }

  scrollBy(deltaX: number, deltaY: number): void {
    if (this.scrollerEl) {
      this.scrollerEl.scrollLeft += deltaX;
      this.scrollerEl.scrollTop += deltaY;
    }
  }

  scrollToPagePoint(pageNumber: number, xRatio: number, yRatio: number): void {
    const pageFrame = this.canvasHost.getPageElement(pageNumber);
    if (!pageFrame || !this.scrollerEl) {
      return;
    }

    const pageRect = pageFrame.getBoundingClientRect();
    const scrollerRect = this.scrollerEl.getBoundingClientRect();

    const targetScreenX = pageRect.left + xRatio * pageRect.width;
    const targetScreenY = pageRect.top + yRatio * pageRect.height;

    const currentCenterScreenX = scrollerRect.left + scrollerRect.width / 2;
    const currentCenterScreenY = scrollerRect.top + scrollerRect.height / 2;

    const diffX = targetScreenX - currentCenterScreenX;
    const diffY = targetScreenY - currentCenterScreenY;

    if (Number.isFinite(diffX) && Number.isFinite(diffY)) {
      this.scrollerEl.scrollLeft += diffX;
      this.scrollerEl.scrollTop += diffY;
    }
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
    this.updateStatusDisplay();
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
        const activeCanvas = this.canvasHost.getActiveCanvas(pageId);
        if (page && activeCanvas) {
          this.selectionController.changeColor(color, page, activeCanvas);
        }
      }
    }
  }

  getNotebookTemplate(): { type: PaperTemplateType } {
    return this.pageManager ? this.pageManager.getNotebookTemplate() : { type: "ruled" };
  }

  getNotebookOrientation(): PageOrientation {
    return this.pageManager ? this.pageManager.getNotebookOrientation() : "portrait";
  }

  getZoomLevel(): number {
    return this.zoomController.getZoomLevel();
  }

  setZoomLevel(targetZoom: number, anchorClientX?: number, anchorClientY?: number, isContinuous: boolean = false): void {
    this.zoomController.setZoomLevel(targetZoom, anchorClientX, anchorClientY, isContinuous);
  }

  zoomByFactor(factor: number, anchorClientX?: number, anchorClientY?: number): void {
    this.zoomController.zoomByFactor(factor, anchorClientX, anchorClientY);
  }

  getCanvasScale(): number {
    return this.zoomController.getCanvasScale();
  }

  applyZoom(): void {
    this.zoomController.setZoomLevel(this.zoomController.getZoomLevel());
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

    this.canvasStageEl = this.mainAreaEl.createDiv({
      cls: "notepages-canvas-stage"
    });

    this.scrollerEl = this.canvasStageEl.createDiv({
      cls: "notepages-scroller"
    });
    this.registerDomEvent(this.scrollerEl, "scroll", () => {
      this.handleScroll();
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
            const frameEl = target.querySelector<HTMLElement>(".notepages-page-frame");
            if (!frameEl) {
              continue;
            }
            if (entry.isIntersecting) {
              void this.pdfBackgroundManager.renderPdfBackground(page, frameEl, () => {
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

    this.dragCoordinator.ensureDragOverlay();
    if (this.rulerController?.isVisible()) {
      this.rulerController.show();
    }
    this.gestureRouter.bindScrollerAndGlobalEvents(
      this.scrollerEl,
      this.pagesContainerEl,
      this.rootContainerEl,
      this.toolbar?.toolbarWrapperEl
    );
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

    if (tool === "select") {
      tool = "lasso";
      this.selectionSubMode = "pan";
      if (this.toolbar && this.toolbar.setSelectionSubMode) {
        this.toolbar.setSelectionSubMode("pan");
      }
    }

    if (this.inkingController.activeTool === "lasso" && tool !== "lasso") {
      this.clearActiveSelectionCanvas();
    }

    this.inkingController.setTool(tool);

    if (tool === "highlighter") {
      this.inkingController.setWidth(this.highlighterWidth);
      this.toolbar.setActiveWidth(this.highlighterWidth);
    } else if (tool === "pen" || tool === "pressure" || tool === "fountain" || tool === "pencil") {
      this.inkingController.setWidth(this.penWidth);
      this.toolbar.setActiveWidth(this.penWidth);
    } else if (tool === "shape" || tool === "connector") {
      this.inkingController.setWidth(this.penWidth);
      this.toolbar.setActiveWidth(this.penWidth);
    }

    if (this.document && this.pageManager) {
      this.document.pages.forEach((p) => {
        const frameEl = this.getPageFrame(p.pageNumber);
        if (frameEl) {
          this.imageController.renderPageImages(p, frameEl, (path) => this.resolveResourcePath(path));
          this.textController.renderPageTexts(p, frameEl);
        }
      });
    }

    this.rootContainerEl.toggleClass("is-tool-select", tool === "lasso" && this.selectionSubMode === "pan");
    this.rootContainerEl.toggleClass("is-tool-text", tool === "text");
    this.rootContainerEl.toggleClass("is-tool-sticky", tool === "sticky");
    this.rootContainerEl.toggleClass("is-tool-eraser", tool === "eraser");
    this.toolbar.setActiveTool(tool, this.currentShapeType, this.selectionController.hasSelection());
    this.updateStatusDisplay();
    if (tool !== "eraser" && this.gestureRouter.stylusButtonState.temporaryEraserTool === null) {
      this.gestureRouter.hideEraserCursor();
    }
    if (tool !== "pen" && tool !== "pressure" && tool !== "fountain" && tool !== "pencil" && tool !== "highlighter") {
      this.gestureRouter.hidePenCursor();
    }
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
        const activeCanvas = this.canvasHost.getActiveCanvas(pageId);
        if (page && activeCanvas) {
          this.selectionController.changeColor(color, page, activeCanvas);
        }
      }
    }
  }

  private syncTextToolbar(formatting: TextFormattingOptions & {
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
    if (this.inkingController.activeTool === "highlighter") {
      this.highlighterWidth = width;
    } else if (
      this.inkingController.activeTool === "pen" ||
      this.inkingController.activeTool === "pressure" ||
      this.inkingController.activeTool === "fountain" ||
      this.inkingController.activeTool === "pencil"
    ) {
      this.penWidth = width;
    }

    this.inkingController.setWidth(width);
    this.toolbar.setActiveWidth(width);

    if (this.selectionController.hasSelection() && this.pageManager) {
      const pageId = this.selectionController.getActivePageId();
      if (pageId) {
        const page = this.pageManager.getPage(pageId);
        const activeCanvas = this.canvasHost.getActiveCanvas(pageId);
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
        const activeCanvas = this.canvasHost.getActiveCanvas(pageId);
        if (activeCanvas) {
          this.selectionController.clearSelection(activeCanvas);
          return;
        }
      }
      this.selectionController.clearSelection();
    }
  }

  handleMutation(
    page: PageData,
    options?: { redrawCanvas?: boolean; debounceThumbnail?: boolean; skipThumbnail?: boolean }
  ): void {
    PageSpatialIndexRegistry.invalidate(page);
    if (this.document) {
      this.document.metadata.updatedAt = Date.now();
    }
    const shouldRedraw = options?.redrawCanvas !== false;
    if (shouldRedraw) {
      this.canvasHost.redrawCommittedCanvas(page.id);
    }
    if (!options?.skipThumbnail) {
      if (options?.debounceThumbnail) {
        this.debouncedUpdateThumbnail(page);
      } else {
        this.updateThumbnailStrokes(page);
      }
    }
    this.requestSave();
  }

  private blurFocusedToolbarControl(): void {
    if (typeof document === "undefined" || !this.toolbar?.toolbarWrapperEl) {
      return;
    }
    const activeEl = document.activeElement;
    if (!(activeEl instanceof HTMLElement)) {
      return;
    }
    if (!this.toolbar.toolbarWrapperEl.contains(activeEl) && !this.toolbar.toolbarPopoverEl?.contains(activeEl)) {
      return;
    }
    const tagName = activeEl.tagName.toLowerCase();
    if (tagName === "input" || tagName === "textarea" || tagName === "select") {
      return;
    }
    activeEl.blur();
  }

  private toggleSidebar(): void {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
    this.sidebar.toggle();
  }

  private updateStatusDisplay(): void {
    const pageCount = this.pageManager ? this.pageManager.getPageCount() : this.document ? this.document.pages.length : 0;
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
      else if (tool === "pencil") toolName = "PENCIL";
      else if (tool === "select") toolName = "SELECT / PAN";
      else if (tool === "lasso") toolName = this.selectionSubMode === "pan" ? "HAND / PAN" : "LASSO SELECT";
      else if (tool === "sticky") toolName = "STICKY NOTE";
      else if (tool === "connector") toolName = "LINE / CONNECTOR";
      else if (tool === "shape") toolName = `SHAPE (${this.currentShapeType.toUpperCase()})`;
      this.statusToolInfoEl.setText(`Tool: ${toolName}`);
    }
    if (this.statusZoomInfoEl) {
      this.statusZoomInfoEl.setText(`Zoom: ${Math.round(this.zoomController.getZoomLevel() * 100)}%`);
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
    const pageWrapper = this.canvasHost.getPageElement(pageNumber);
    if (!pageWrapper) {
      return null;
    }
    return pageWrapper.querySelector<HTMLElement>(".notepages-page-frame") ?? pageWrapper;
  }

  renderDocument(): void {
    if (!this.document || !this.pageManager) {
      return;
    }

    this.clearActiveSelectionCanvas();

    this.canvasHost.committedCanvasMap.forEach((c) => {
      c.width = 1;
      c.height = 1;
    });
    this.canvasHost.activeCanvasMap.forEach((c) => {
      c.width = 1;
      c.height = 1;
    });
    this.canvasHost.templateCanvasMap.forEach((c) => {
      c.width = 1;
      c.height = 1;
    });

    this.sidebar.clear();
    this.pagesContainerEl.empty();
    this.canvasHost.clearAll();
    this.pageVirtualizer.clear();
    this.pageIntersectionObserver?.disconnect();

    const pages = this.pageManager.getPages();
    for (let index = 0; index < pages.length; index++) {
      const page = pages[index];
      this.renderPage(page);
      this.renderThumbnail(page, index);
    }

    this.dragCoordinator.ensureDragOverlay();
    if (this.rulerController?.isVisible()) {
      this.rulerController.show();
    }

    if (this.pageManager) {
      const activeType = this.pageManager.getNotebookTemplate().type;
      this.toolbar.updatePaperTemplateButtons(activeType);
      const orient = this.pageManager.getNotebookOrientation();
      this.toolbar.updateOrientationButtonDisplay(orient);
      this.toolbar.updateTitle(this.getNotebookTitle());
    }

    this.updateActivePage(this.currentPageNumber);
  }

  renderPage(page: PageData): void {
    const pageWrapper = this.pagesContainerEl.createDiv({
      cls: "notepages-page-wrapper"
    });
    pageWrapper.dataset.pageNumber = String(page.pageNumber);
    pageWrapper.dataset.pageId = page.id;
    this.canvasHost.pageElements.set(page.pageNumber, pageWrapper);

    const pageFrame = pageWrapper.createDiv({
      cls: "notepages-page-frame"
    });

    pageFrame.style.width = `${page.dimensions.width}px`;
    pageFrame.style.height = `${page.dimensions.height}px`;
    pageFrame.style.backgroundColor = page.template.backgroundColor;

    const scale = this.zoomController.getCanvasScale();
    const targetW = Math.round(page.dimensions.width * scale);
    const targetH = Math.round(page.dimensions.height * scale);

    const totalPages = this.pageManager ? this.pageManager.getPages().length : 1;
    const shouldInitialMount = totalPages <= 4 || page.pageNumber <= 3 || page.pageNumber === this.currentPageNumber;
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
      this.canvasHost.templateCanvasMap.set(page.id, templateCanvas);
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
    this.canvasHost.committedCanvasMap.set(page.id, committedCanvas);
    if (shouldInitialMount) {
      this.canvasHost.redrawCommittedCanvas(page.id);
    }

    const activeCanvas = pageFrame.createEl("canvas", {
      cls: "notepages-page-layer notepages-active-layer is-interactive"
    });
    activeCanvas.dataset.pageWidth = String(page.dimensions.width);
    activeCanvas.dataset.pageHeight = String(page.dimensions.height);
    activeCanvas.width = initialW;
    activeCanvas.height = initialH;
    if (shouldInitialMount) {
      const actCtx = activeCanvas.getContext("2d");
      if (actCtx && typeof actCtx.setTransform === "function") {
        actCtx.setTransform(scale, 0, 0, scale, 0, 0);
      }
    }
    this.canvasHost.activeCanvasMap.set(page.id, activeCanvas);

    this.pageVirtualizer.observePage(page.pageNumber, pageWrapper, shouldInitialMount);

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
          if (pageFrame.firstChild && pageFrame.firstChild !== bgImg) {
            pageFrame.insertBefore(bgImg, pageFrame.firstChild);
          }
        }
      } else {
        if (this.pageIntersectionObserver) {
          this.pageIntersectionObserver.observe(pageWrapper);
        } else {
          void this.pdfBackgroundManager.renderPdfBackground(page, pageFrame, () => {
            this.updateThumbnailStrokes(page);
          });
        }
      }
    }
    this.imageController.renderPageImages(page, pageFrame, (path) => this.resolveResourcePath(path));
    this.textController.renderPageTexts(page, pageFrame);

    this.gestureRouter.bindPageInteractionEvents(
      page,
      pageFrame,
      activeCanvas,
      committedCanvas,
      this.toolbar?.toolbarWrapperEl
    );
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

  debouncedUpdateThumbnail(page: PageData, delayMs: number = 600): void {
    const existing = this.thumbnailDebounceTimers.get(page.id);
    if (existing !== undefined) {
      window.clearTimeout(existing);
    }
    const timer = window.setTimeout(() => {
      this.thumbnailDebounceTimers.delete(page.id);
      this.updateThumbnailStrokes(page);
    }, delayMs);
    this.thumbnailDebounceTimers.set(page.id, timer);
  }

  private clearThumbnailDebounceTimers(): void {
    for (const timer of this.thumbnailDebounceTimers.values()) {
      window.clearTimeout(timer);
    }
    this.thumbnailDebounceTimers.clear();
  }

  updateThumbnailStrokes(page: PageData): void {
    const existing = this.thumbnailDebounceTimers.get(page.id);
    if (existing !== undefined) {
      window.clearTimeout(existing);
      this.thumbnailDebounceTimers.delete(page.id);
    }
    this.sidebar.updateThumbnailStrokes(page);
  }

  scrollToPage(pageNumber: number): void {
    if (this.currentPageNumber !== pageNumber) {
      this.clearActiveSelectionCanvas();
    }
    this.currentPageNumber = pageNumber;
    this.canvasHost.ensurePageCanvasesMounted(pageNumber);
    if (pageNumber > 1) {
      this.canvasHost.ensurePageCanvasesMounted(pageNumber - 1);
    }
    if (this.pageManager && pageNumber < this.pageManager.getPageCount()) {
      this.canvasHost.ensurePageCanvasesMounted(pageNumber + 1);
    }
    const targetEl = this.canvasHost.getPageElement(pageNumber);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    this.updateActivePage(pageNumber);
  }

  private updateActivePage(pageNumber: number): void {
    this.currentPageNumber = pageNumber;
    this.canvasHost.ensurePageCanvasesMounted(pageNumber);
    this.sidebar.updateActivePage(pageNumber);
    this.updateStatusDisplay();
    if (this.minimap) {
      this.minimap.update(true);
    }
  }

  private handleScroll(): void {
    if (!this.scrollerEl || this.canvasHost.pageElements.size === 0) {
      return;
    }

    if (this.minimap) {
      this.minimap.scheduleViewfinderUpdate();
    }

    const scrollerRect = this.scrollerEl.getBoundingClientRect();
    let closestPage = this.currentPageNumber;
    let minDistance = Infinity;

    this.canvasHost.pageElements.forEach((el, num) => {
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
    this.canvasHost.ensurePageCanvasesMounted(newPage.pageNumber);
    this.renderThumbnail(newPage, newIndex);
    this.dragCoordinator.ensureDragOverlay();
    if (this.rulerController?.isVisible()) {
      this.rulerController.show();
    }

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
    if (!this.pageManager || !this.document) {
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
    const deletedIndex = this.document.pages.findIndex((p) => p.id === pageId);
    if (deletedIndex === -1) {
      return;
    }

    const performDomDelete = (deletedPage: PageData): void => {
      const deletedPageNumber = deletedPage.pageNumber;
      const targetNum = Math.max(1, deletedPageNumber - 1);

      if (this.textController.isEditing()) {
        this.textController.commitActiveEdit();
      }
      this.imageController.deselectImage();
      this.clearActiveSelectionCanvas();

      const pageWrapper = this.pagesContainerEl.querySelector<HTMLElement>(`[data-page-id="${deletedPage.id}"]`);

      this.pageVirtualizer.unobservePage(deletedPageNumber);

      if (pageWrapper && this.pageIntersectionObserver) {
        this.pageIntersectionObserver.unobserve(pageWrapper);
      }

      this.canvasHost.cleanupPageCanvases(deletedPage.id, pageWrapper);
      this.sidebar.removeThumbnail(deletedPage.id);

      const pages = this.pageManager ? this.pageManager.getPages() : [];
      this.canvasHost.pageElements.clear();

      for (let index = 0; index < pages.length; index++) {
        const p = pages[index];
        const wrapper = this.pagesContainerEl.querySelector<HTMLElement>(`[data-page-id="${p.id}"]`);
        if (wrapper) {
          wrapper.dataset.pageNumber = String(p.pageNumber);
          const watermark = wrapper.querySelector(".notepages-page-number-watermark");
          if (watermark) {
            watermark.textContent = String(p.pageNumber);
          }
          this.canvasHost.pageElements.set(p.pageNumber, wrapper);
        }
      }

      this.sidebar.renumberThumbnails(pages);

      this.requestSave();
      this.scrollToPage(targetNum);
      this.updateStatusDisplay();
      new Notice(`Deleted Page ${deletedPageNumber}`);
    };

    const performDomRestore = (restoredPage: PageData): void => {
      this.renderDocument();
      this.requestSave();
      this.scrollToPage(restoredPage.pageNumber);
      this.updateStatusDisplay();
      new Notice(`Restored Page ${restoredPage.pageNumber}`);
    };

    this.historyManager.execute(
      new DeletePageCommand(
        this.document.pages,
        pageToDelete,
        deletedIndex,
        performDomDelete,
        performDomRestore
      )
    );
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
    return r * 0.299 + g * 0.587 + b * 0.114 < 128;
  }

  private createDefaultDocument(): NotebookDocument {
    const title = this.file instanceof TFile ? this.file.basename : "Untitled Notebook";
    const now = Date.now();
    const initialPage: PageData = {
      id: "page-" + Math.random().toString(36).substring(2, 10),
      pageNumber: 1,
      dimensions: getEffectivePageDimensions(
        this.plugin.settings.defaultPageSize,
        this.plugin.settings.defaultOrientation
      ),
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

  openQuickRenameModal(): void {
    if (!(this.file instanceof TFile)) {
      new Notice("Cannot rename: not a valid file");
      return;
    }

    const currentTitle = this.getNotebookTitle();
    const siblingNames = this.getFolderSiblingNotebookNames();

    new QuickRenameModal(
      this.app,
      currentTitle,
      siblingNames,
      async (newTitle: string) => {
        return await this.executeRenameNotebook(newTitle);
      }
    ).open();
  }

  getFolderSiblingNotebookNames(): string[] {
    if (!(this.file instanceof TFile)) {
      return [];
    }
    const parentFolder = this.file.parent;
    if (!parentFolder || !parentFolder.children) {
      return [];
    }
    const names: string[] = [];
    for (const child of parentFolder.children) {
      if (child instanceof TFile && child.path !== this.file.path) {
        names.push(child.basename);
      }
    }
    return names;
  }

  async executeRenameNotebook(newTitle: string): Promise<boolean> {
    if (!(this.file instanceof TFile)) {
      new Notice("Cannot rename: not a valid file");
      return false;
    }

    const trimmed = newTitle.trim();
    const currentTitle = this.getNotebookTitle();
    if (trimmed === currentTitle) {
      return true;
    }

    const currentFile = this.file;
    const parentPath = currentFile.parent ? (currentFile.parent.path === "/" ? "" : currentFile.parent.path) : "";
    const extension = currentFile.extension;
    const newFileName = `${trimmed}.${extension}`;
    const newFilePath = normalizePath(parentPath ? `${parentPath}/${newFileName}` : newFileName);

    try {
      if (this.document && this.document.metadata) {
        this.document.metadata.title = trimmed;
        this.document.metadata.updatedAt = Date.now();
      }

      await this.save();
      await this.app.fileManager.renameFile(currentFile, newFilePath);

      this.toolbar.updateTitle(trimmed);
      this.updateStatusDisplay();
      new Notice(`Renamed notebook to "${trimmed}"`);
      return true;
    } catch (err) {
      console.error("[NotePages] Error renaming notebook:", err);
      new Notice(`Failed to rename notebook: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
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

  insertTextBox(targetPageId?: string, clientX?: number, clientY?: number): void {
    let targetPage = targetPageId ? this.pageManager?.getPage(targetPageId) : null;
    let targetFrame = targetPage ? this.getPageFrame(targetPage.pageNumber) : null;
    let insertX = 60;
    let insertY = 100;

    if (clientX !== undefined && clientY !== undefined) {
      const targetInfo = this.gestureRouter.getTargetPageForClientPoint(clientX, clientY);
      if (targetInfo) {
        targetPage = targetInfo.page;
        targetFrame = this.getPageFrame(targetInfo.page.pageNumber);
        insertX = targetInfo.pointOnPage.x;
        insertY = targetInfo.pointOnPage.y;
      }
    }

    if (!targetPage) {
      targetPage = this.pageManager?.getPageByNumber(this.currentPageNumber);
    }
    if (!targetPage) {
      return;
    }
    if (!targetFrame) {
      targetFrame = this.getPageFrame(targetPage.pageNumber);
    }
    if (!targetFrame) {
      return;
    }

    if (clientX === undefined || clientY === undefined) {
      const scrollerRect = this.scrollerEl.getBoundingClientRect();
      const frameRect = targetFrame.getBoundingClientRect();
      if (frameRect.bottom > scrollerRect.top && frameRect.top < scrollerRect.bottom) {
        const visibleTop = Math.max(frameRect.top, scrollerRect.top);
        const visibleBottom = Math.min(frameRect.bottom, scrollerRect.bottom);
        const centerY = (visibleTop + visibleBottom) / 2;
        const scaleY = targetPage.dimensions.height / frameRect.height;
        insertY = Math.round((centerY - frameRect.top) * scaleY);
      }
    }

    this.setActiveTool("text");

    const defaultW = 220;
    const defaultH = 60;
    const margin = 10;
    const adjustedX = Math.max(margin, Math.min(insertX, targetPage.dimensions.width - margin - defaultW));
    const adjustedY = Math.max(margin, Math.min(insertY, targetPage.dimensions.height - margin - defaultH));

    const isDarkPaper = this.isDarkColor(targetPage.template.backgroundColor);
    const resolvedTextColor =
      this.currentTextOptions.color === "#1e293b" && isDarkPaper ? "#f8fafc" : this.currentTextOptions.color;

    this.textController.startEditing(
      targetPage,
      targetFrame,
      undefined,
      adjustedX,
      adjustedY,
      defaultW,
      defaultH,
      {
        ...this.currentTextOptions,
        color: resolvedTextColor
      }
    );
  }

  insertStickyNote(targetPageId?: string, clientX?: number, clientY?: number): void {
    let targetPage = targetPageId ? this.pageManager?.getPage(targetPageId) : null;
    let targetFrame = targetPage ? this.getPageFrame(targetPage.pageNumber) : null;
    let insertX = 60;
    let insertY = 100;

    if (clientX !== undefined && clientY !== undefined) {
      const targetInfo = this.gestureRouter.getTargetPageForClientPoint(clientX, clientY);
      if (targetInfo) {
        targetPage = targetInfo.page;
        targetFrame = this.getPageFrame(targetInfo.page.pageNumber);
        insertX = targetInfo.pointOnPage.x;
        insertY = targetInfo.pointOnPage.y;
      }
    }

    if (!targetPage) {
      targetPage = this.pageManager?.getPageByNumber(this.currentPageNumber);
    }
    if (!targetPage) {
      return;
    }
    if (!targetFrame) {
      targetFrame = this.getPageFrame(targetPage.pageNumber);
    }
    if (!targetFrame) {
      return;
    }

    if (clientX === undefined || clientY === undefined) {
      const scrollerRect = this.scrollerEl.getBoundingClientRect();
      const frameRect = targetFrame.getBoundingClientRect();
      if (frameRect.bottom > scrollerRect.top && frameRect.top < scrollerRect.bottom) {
        const visibleTop = Math.max(frameRect.top, scrollerRect.top);
        const visibleBottom = Math.min(frameRect.bottom, scrollerRect.bottom);
        const centerY = (visibleTop + visibleBottom) / 2;
        const scaleY = targetPage.dimensions.height / frameRect.height;
        insertY = Math.round((centerY - frameRect.top) * scaleY);
      }
    }

    this.setActiveTool("sticky");

    const defaultW = 140;
    const defaultH = 140;
    const margin = 10;
    const adjustedX = Math.max(margin, Math.min(insertX, targetPage.dimensions.width - margin - defaultW));
    const adjustedY = Math.max(margin, Math.min(insertY, targetPage.dimensions.height - margin - defaultH));

    this.textController.startEditing(
      targetPage,
      targetFrame,
      undefined,
      adjustedX,
      adjustedY,
      defaultW,
      defaultH,
      {
        isSticky: true,
        backgroundColor: this.currentStickyColor
      }
    );
  }

  ensureDragOverlay(): void {
    this.dragCoordinator.ensureDragOverlay();
    if (this.rulerController?.isVisible()) {
      this.rulerController.show();
    }
  }

  ensurePageCanvasesMounted(pageNumber: number): void {
    this.canvasHost.ensurePageCanvasesMounted(pageNumber);
  }

  mountPageCanvases(pageNumber: number): void {
    this.canvasHost.mountPageCanvases(pageNumber);
  }

  unmountPageCanvases(pageNumber: number): void {
    this.canvasHost.unmountPageCanvases(pageNumber);
  }

  getPerformanceMonitor(): PerformanceMonitor {
    return this.performanceMonitor;
  }

  getPageVirtualizer(): PageVirtualizer {
    return this.pageVirtualizer;
  }
}
