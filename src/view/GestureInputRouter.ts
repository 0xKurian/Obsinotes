import { App, Menu, Notice } from "obsidian";
import {
  PageData,
  SelectionSubMode,
  ShapeObject,
  ShapeType,
  StylusButtonAction,
  ToolType
} from "../types";
import { InkingController } from "../ink/InkingController";
import { SelectionController } from "../selection/SelectionController";
import { SelectionEngine } from "../selection/SelectionEngine";
import { TextController, TextFormattingOptions } from "../text/TextController";
import { ImageController } from "../image/ImageController";
import { StylusButtonState, StylusPointerSnapshot } from "../ink/StylusButtonHelper";
import { AddImageCommand, AddShapeCommand, HistoryManager } from "../history/HistoryManager";
import { PageCanvasHost } from "./PageCanvasHost";
import { ViewportZoomController } from "./ViewportZoomController";
import { SelectionDragCoordinator } from "./SelectionDragCoordinator";
import { RulerOverlayController } from "../ink/RulerOverlayController";

export interface GestureInputDelegate {
  app: App;
  getRootContainerEl(): HTMLElement | undefined;
  isViewActive?(): boolean;
  getScrollerEl(): HTMLElement | undefined;
  getPagesContainerEl(): HTMLElement | undefined;
  getEraserCursorEl(): HTMLElement | undefined;
  getPenCursorEl?(): HTMLElement | undefined;
  shouldShowPenCursor?(): boolean;
  getFilePath(): string;
  getCurrentPageNumber(): number;
  getPageByNumber(pageNumber: number): PageData | undefined;
  getAllPages(): PageData[];
  getInkingController(): InkingController;
  getSelectionController(): SelectionController;
  getTextController(): TextController;
  getImageController(): ImageController;
  getHistoryManager(): HistoryManager;
  getCanvasHost(): PageCanvasHost;
  getZoomController(): ViewportZoomController;
  getDragCoordinator(): SelectionDragCoordinator;
  getRulerController?(): RulerOverlayController;
  getSelectionSubMode(): SelectionSubMode;
  getCurrentShapeType(): ShapeType;
  isShapeFillEnabled(): boolean;
  getShapeFillColor(): string;
  getCurrentStickyColor(): string;
  getCurrentTextOptions(): TextFormattingOptions;
  getDrawWithFinger(): boolean;
  getTwoFingerTapUndoRedo(): boolean;
  getStylusButtonAction(): StylusButtonAction;
  isDarkColor(hexColor: string): boolean;
  resolveResourcePath(vaultPath: string): string;
  blurFocusedToolbarControl(): void;
  setToolbarDrawingActive(active: boolean): void;
  setToolbarActiveTool(tool: ToolType): void;
  setActiveTool(tool: ToolType, commitPendingText?: boolean): void;
  onUndo(): void;
  onRedo(): void;
  handleMutation(page: PageData): void;
  insertTextBox(targetPageId?: string, clientX?: number, clientY?: number): void;
  insertStickyNote(targetPageId?: string, clientX?: number, clientY?: number): void;
  openImagePicker(): void;
  openPdfPicker(forceNewNotebook?: boolean): void;
  addNewPage(): void;
  duplicateCurrentPage(): void;
  openQuickRenameModal(): void;
  openExportModal(): void;
  promptAndImportLocalPdf(file: File, forceNewNotebook?: boolean, targetPageNumber?: number): Promise<void>;
  promptAndImportVaultPdf(file: import("obsidian").TFile, forceNewNotebook?: boolean, targetPageNumber?: number): Promise<void>;
  registerDomEvent<K extends keyof HTMLElementEventMap>(
    el: HTMLElement,
    type: K,
    callback: (ev: HTMLElementEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions
  ): void;
  registerWindowDomEvent<K extends keyof WindowEventMap>(
    type: K,
    callback: (ev: WindowEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions
  ): void;
}

export class GestureInputRouter {
  private delegate: GestureInputDelegate;
  readonly stylusButtonState: StylusButtonState = new StylusButtonState();

  isPanning: boolean = false;
  private panStartX: number = 0;
  private panStartY: number = 0;
  private panScrollLeft: number = 0;
  private panScrollTop: number = 0;
  private panPointerId: number | null = null;
  private panCaptureTarget: HTMLElement | null = null;
  private isSpacePressed: boolean = false;
  private lastTouchTimestamp: number = 0;

  private touchPointers: Map<number, { clientX: number; clientY: number }> = new Map();
  private touchStartCoords: Map<number, { x: number; y: number }> = new Map();
  private touchTapCandidate: { maxCount: number; startTime: number; maxDistance: number } | null = null;
  private touchPinchDistance: number = 0;
  private touchPinchStartZoom: number = 1.0;
  private isTouchPinching: boolean = false;

  private isDraggingTextRect: boolean = false;
  private dragTextCanvas: HTMLCanvasElement | null = null;
  private dragTextStartX: number = 0;
  private dragTextStartY: number = 0;
  private dragTextCurrentX: number = 0;
  private dragTextCurrentY: number = 0;

  private isDraggingShape: boolean = false;
  private dragShapeCanvas: HTMLCanvasElement | null = null;
  private dragShapeStartX: number = 0;
  private dragShapeStartY: number = 0;
  private dragShapeCurrentX: number = 0;
  private dragShapeCurrentY: number = 0;

  private isDraggingConnector: boolean = false;
  private dragConnectorCanvas: HTMLCanvasElement | null = null;
  private dragConnectorStartX: number = 0;
  private dragConnectorStartY: number = 0;
  private dragConnectorCurrentX: number = 0;
  private dragConnectorCurrentY: number = 0;
  private dragCreatePointerId: number | null = null;
  private dragCreatePage: PageData | null = null;
  private dragCreatePageFrame: HTMLElement | null = null;
  private recoveredEraserPointerId: number | null = null;
  private pageAbortControllers: Map<string, AbortController> = new Map();

  constructor(delegate: GestureInputDelegate) {
    this.delegate = delegate;
  }

  resetState(): void {
    this.isPanning = false;
    this.isSpacePressed = false;
    this.touchPointers.clear();
    this.touchStartCoords.clear();
    this.touchTapCandidate = null;
    this.isTouchPinching = false;
    this.cancelActiveElementDrag();
    this.recoveredEraserPointerId = null;
    this.stylusButtonState.reset();
    this.cleanupAllPageListeners();
  }

  private hasActiveElementDrag(): boolean {
    return this.isDraggingTextRect || this.isDraggingShape || this.isDraggingConnector;
  }

  private isMatchingDragCreatePointer(pointerId?: number): boolean {
    return (
      pointerId === undefined ||
      this.dragCreatePointerId === null ||
      pointerId === this.dragCreatePointerId
    );
  }

  private cancelActiveElementDrag(pointerId?: number): void {
    if (!this.hasActiveElementDrag()) {
      return;
    }
    if (!this.isMatchingDragCreatePointer(pointerId)) {
      return;
    }
    const releaseId = pointerId ?? this.dragCreatePointerId;
    if (this.isDraggingTextRect) {
      this.isDraggingTextRect = false;
      if (this.dragTextCanvas) {
        if (releaseId !== null) {
          this.tryReleasePointerCapture(this.dragTextCanvas, releaseId);
        }
        this.clearCanvasRect(this.dragTextCanvas);
        this.dragTextCanvas = null;
      }
    }
    if (this.isDraggingShape) {
      this.isDraggingShape = false;
      if (this.dragShapeCanvas) {
        if (releaseId !== null) {
          this.tryReleasePointerCapture(this.dragShapeCanvas, releaseId);
        }
        this.clearCanvasRect(this.dragShapeCanvas);
        this.dragShapeCanvas = null;
      }
    }
    if (this.isDraggingConnector) {
      this.isDraggingConnector = false;
      if (this.dragConnectorCanvas) {
        if (releaseId !== null) {
          this.tryReleasePointerCapture(this.dragConnectorCanvas, releaseId);
        }
        this.clearCanvasRect(this.dragConnectorCanvas);
        this.dragConnectorCanvas = null;
      }
    }
    this.dragCreatePointerId = null;
    this.dragCreatePage = null;
    this.dragCreatePageFrame = null;
  }

  cleanupPageListeners(pageId: string): void {
    const existing = this.pageAbortControllers.get(pageId);
    if (existing) {
      existing.abort();
      this.pageAbortControllers.delete(pageId);
    }
  }

  cleanupAllPageListeners(): void {
    for (const ac of this.pageAbortControllers.values()) {
      ac.abort();
    }
    this.pageAbortControllers.clear();
  }

  bindScrollerAndGlobalEvents(
    scrollerEl: HTMLElement,
    pagesContainerEl: HTMLElement,
    rootContainerEl: HTMLElement,
    toolbarWrapperEl?: HTMLElement
  ): void {
    this.delegate.registerDomEvent(scrollerEl, "pointermove", (e: PointerEvent) => {
      this.stylusButtonState.recordPointerEvent(e.pointerType);
      this.tryFinishRecoveredEraserOnHover(e);
      this.handleStylusHoverButton(e, toolbarWrapperEl);
      this.updateHoverCursors(e, toolbarWrapperEl);
    });

    this.delegate.registerDomEvent(scrollerEl, "pointerleave", (e: PointerEvent) => {
      this.hideEraserCursor();
      this.hidePenCursor();
      if (
        e.pointerType === "pen" &&
        this.stylusButtonState.temporaryEraserTool !== null &&
        !this.delegate.getInkingController().isCurrentlyDrawing()
      ) {
        this.revertTemporaryStylusEraser(null);
      }
    });

    this.delegate.registerDomEvent(scrollerEl, "pointerdown", (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        this.touchPointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
        this.touchStartCoords.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (!this.touchTapCandidate) {
          this.touchTapCandidate = { maxCount: 1, startTime: Date.now(), maxDistance: 0 };
        } else {
          this.touchTapCandidate.maxCount = Math.max(this.touchTapCandidate.maxCount, this.touchPointers.size);
        }
        if (this.touchPointers.size === 2) {
          if (this.isPanning) {
            this.finishPan();
          }
          const [p1, p2] = Array.from(this.touchPointers.values());
          this.touchPinchDistance = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
          this.touchPinchStartZoom = this.delegate.getZoomController().getZoomLevel();
          this.isTouchPinching = true;
          return;
        }
      }
      if (this.isPanTrigger(e) || e.target === scrollerEl || e.target === pagesContainerEl) {
        const textController = this.delegate.getTextController();
        if (textController.isEditing()) {
          textController.commitActiveEdit();
        }
        const inking = this.delegate.getInkingController();
        if (
          this.isPanTrigger(e) ||
          (inking.activeTool === "select" && e.button === 0) ||
          (inking.activeTool === "lasso" && this.delegate.getSelectionSubMode() === "pan" && e.button === 0)
        ) {
          this.startPan(e.clientX, e.clientY, scrollerEl, e.pointerId);
          e.preventDefault();
        }
      }
    });

    this.delegate.registerDomEvent(scrollerEl, "contextmenu", (e: MouseEvent) => {
      if (this.stylusButtonState.shouldSuppressContextMenu((e as PointerEvent).pointerType, this.isPanning)) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      this.showCanvasContextMenu(e);
    });

    this.delegate.registerDomEvent(
      scrollerEl,
      "wheel",
      (e: WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (this.delegate.getInkingController().isCurrentlyDrawing()) {
            return;
          }

          let dy = e.deltaY;
          if (e.deltaMode === 1) {
            dy *= 30;
          } else if (e.deltaMode === 2) {
            dy *= 400;
          }

          if (Math.abs(dy) < 0.1) {
            return;
          }

          const MAX_ZOOM_IN_FACTOR = 1.15;
          const MAX_ZOOM_OUT_FACTOR = 1 / MAX_ZOOM_IN_FACTOR;
          const rawFactor = Math.exp(-dy * 0.005);
          const factor = Math.min(MAX_ZOOM_IN_FACTOR, Math.max(MAX_ZOOM_OUT_FACTOR, rawFactor));

          this.delegate.getZoomController().zoomByFactor(factor, e.clientX, e.clientY);
        }
      },
      { passive: false }
    );

    this.delegate.registerDomEvent(scrollerEl, "dragover", (e: DragEvent) => {
      if (
        e.dataTransfer &&
        (e.dataTransfer.types.includes("Files") || e.dataTransfer.types.includes("text/plain"))
      ) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }
    });

    this.delegate.registerDomEvent(scrollerEl, "drop", async (e: DragEvent) => {
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
          e.preventDefault();
          e.stopPropagation();
          await this.delegate.promptAndImportLocalPdf(file, false, this.delegate.getCurrentPageNumber());
        }
      } else {
        const textData = e.dataTransfer?.getData("text/plain") || "";
        const match = textData.match(/^\[\[(.*?)\]\]$/) || textData.match(/^(.*\.pdf)$/i);
        if (match) {
          const cleanPath = match[1].replace(/\|.*$/, "");
          const linkedFile = this.delegate.app.metadataCache.getFirstLinkpathDest(
            cleanPath,
            this.delegate.getFilePath()
          );
          if (linkedFile && linkedFile.extension.toLowerCase() === "pdf") {
            e.preventDefault();
            e.stopPropagation();
            await this.delegate.promptAndImportVaultPdf(linkedFile, false, this.delegate.getCurrentPageNumber());
          }
        }
      }
    });

    this.delegate.registerWindowDomEvent("pointermove", (e: PointerEvent) => {
      this.stylusButtonState.recordPointerEvent(e.pointerType);
      if (e.pointerType === "touch" && this.touchPointers.has(e.pointerId)) {
        this.touchPointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
        const start = this.touchStartCoords.get(e.pointerId);
        if (start && this.touchTapCandidate) {
          const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
          if (dist > this.touchTapCandidate.maxDistance) {
            this.touchTapCandidate.maxDistance = dist;
          }
        }
        if (this.touchPointers.size === 2 && this.touchPinchDistance > 10) {
          const [p1, p2] = Array.from(this.touchPointers.values());
          const currentDist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
          if (!this.isTouchPinching) {
            if (Math.abs(currentDist - this.touchPinchDistance) < 12) {
              return;
            }
            this.isTouchPinching = true;
          }
          this.touchTapCandidate = null;
          const factor = currentDist / this.touchPinchDistance;
          const targetZoom = this.touchPinchStartZoom * factor;
          const midX = (p1.clientX + p2.clientX) / 2;
          const midY = (p1.clientY + p2.clientY) / 2;
          this.delegate.getZoomController().setZoomLevel(
            Math.round(targetZoom * 1000) / 1000,
            midX,
            midY,
            true
          );
          return;
        }
      }

      if (this.tryFinishRecoveredEraserOnHover(e)) {
        this.handleStylusHoverButton(e, toolbarWrapperEl);
      }

      if (this.isPanning) {
        if (this.panPointerId === null || e.pointerId === this.panPointerId) {
          this.updatePan(e.clientX, e.clientY);
        }
        return;
      }
      const dragCoord = this.delegate.getDragCoordinator();
      if (dragCoord.isDraggingSelection()) {
        dragCoord.updateSelectionDrag(e.clientX, e.clientY);
      }
      this.updateHoverCursors(e, toolbarWrapperEl);
    });

    this.delegate.registerWindowDomEvent("pointerup", (e: PointerEvent) => {
      if (e) {
        this.stylusButtonState.recordPointerEvent(e.pointerType);
        if (this.recoveredEraserPointerId !== null && e.pointerId === this.recoveredEraserPointerId) {
          this.recoveredEraserPointerId = null;
        }
        const inking = this.delegate.getInkingController();
        if (inking.isCurrentlyDrawing()) {
          inking.handlePointerUp(e);
        }
      }
      this.delegate.setToolbarDrawingActive(false);
      this.revertTemporaryStylusEraser(e);
      if (e && e.pointerType === "touch") {
        if (this.touchTapCandidate && !this.isTouchPinching) {
          if (this.delegate.getTwoFingerTapUndoRedo()) {
            const duration = Date.now() - this.touchTapCandidate.startTime;
            if (duration < 280 && this.touchTapCandidate.maxDistance < 20) {
              if (this.touchTapCandidate.maxCount === 2) {
                this.delegate.onUndo();
              } else if (this.touchTapCandidate.maxCount === 3) {
                this.delegate.onRedo();
              }
            }
          }
          this.touchTapCandidate = null;
        }
        this.touchPointers.delete(e.pointerId);
        this.touchStartCoords.delete(e.pointerId);
        if (this.touchPointers.size === 2) {
          const [p1, p2] = Array.from(this.touchPointers.values());
          this.touchPinchDistance = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
          this.touchPinchStartZoom = this.delegate.getZoomController().getZoomLevel();
        } else if (this.touchPointers.size < 2 && this.isTouchPinching) {
          this.isTouchPinching = false;
          this.touchPinchDistance = 0;
          this.delegate.getZoomController().scheduleCanvasResolutionUpdate(180);
        }
      }
      if (this.isDraggingTextRect && this.dragTextCanvas && this.dragCreatePage && this.dragCreatePageFrame) {
        if (this.isMatchingDragCreatePointer(e?.pointerId)) {
          this.finishTextDrag(e, this.dragCreatePage, this.dragCreatePageFrame, this.dragTextCanvas);
        }
        return;
      }
      if (this.isDraggingShape && this.dragShapeCanvas && this.dragCreatePage) {
        if (this.isMatchingDragCreatePointer(e?.pointerId)) {
          this.finishShapeDrag(e, this.dragCreatePage, this.dragShapeCanvas);
        }
        return;
      }
      if (this.isDraggingConnector && this.dragConnectorCanvas && this.dragCreatePage) {
        if (this.isMatchingDragCreatePointer(e?.pointerId)) {
          this.finishConnectorDrag(e, this.dragCreatePage, this.dragConnectorCanvas);
        }
        return;
      }
      this.cancelActiveElementDrag(e?.pointerId);
      if (this.isPanning) {
        if (!e || this.panPointerId === null || e.pointerId === this.panPointerId) {
          this.finishPan();
        }
        return;
      }
      const dragCoord = this.delegate.getDragCoordinator();
      if (dragCoord.isDraggingSelection()) {
        dragCoord.finishSelectionDrag(e.clientX, e.clientY);
      }
    });

    this.delegate.registerWindowDomEvent("pointercancel", (e: PointerEvent) => {
      if (e) {
        this.stylusButtonState.recordPointerEvent(e.pointerType);
        if (this.recoveredEraserPointerId !== null && e.pointerId === this.recoveredEraserPointerId) {
          this.recoveredEraserPointerId = null;
        }
        const inking = this.delegate.getInkingController();
        if (inking.isCurrentlyDrawing()) {
          inking.handlePointerCancel(e);
        }
      }
      this.delegate.setToolbarDrawingActive(false);
      this.revertTemporaryStylusEraser(e, true);
      if (e && e.pointerType === "touch") {
        this.touchTapCandidate = null;
        this.touchPointers.delete(e.pointerId);
        this.touchStartCoords.delete(e.pointerId);
        if (this.touchPointers.size === 2) {
          const [p1, p2] = Array.from(this.touchPointers.values());
          this.touchPinchDistance = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
          this.touchPinchStartZoom = this.delegate.getZoomController().getZoomLevel();
        } else if (this.touchPointers.size < 2 && this.isTouchPinching) {
          this.isTouchPinching = false;
          this.touchPinchDistance = 0;
          this.delegate.getZoomController().scheduleCanvasResolutionUpdate(180);
        }
      }
      this.cancelActiveElementDrag(e?.pointerId);
      if (this.isPanning) {
        if (!e || this.panPointerId === null || e.pointerId === this.panPointerId) {
          this.finishPan();
        }
        return;
      }
      const dragCoord = this.delegate.getDragCoordinator();
      if (dragCoord.isDraggingSelection()) {
        dragCoord.cancelSelectionDrag();
      }
    });

    this.delegate.registerWindowDomEvent("pointerleave", () => {
      this.hideEraserCursor();
      if (
        this.stylusButtonState.temporaryEraserTool !== null &&
        !this.delegate.getInkingController().isCurrentlyDrawing()
      ) {
        this.revertTemporaryStylusEraser(null);
      }
    });

    this.delegate.registerWindowDomEvent("keydown", (e: KeyboardEvent) => {
      if (e.code === "Space") {
        if (this.delegate.getTextController().isEditing()) {
          return;
        }
        const targetEl = e.target as HTMLElement | null;
        const targetTag = targetEl?.tagName?.toLowerCase();
        if (
          targetTag === "input" ||
          targetTag === "textarea" ||
          targetTag === "select" ||
          targetEl?.isContentEditable ||
          targetEl?.closest?.(".modal-container, .prompt, .suggestion-container")
        ) {
          return;
        }
        const insideView = targetEl ? rootContainerEl.contains(targetEl) : false;
        const isViewActive = this.delegate.isViewActive ? this.delegate.isViewActive() : insideView;
        if (!insideView && !isViewActive) {
          return;
        }
        if (!this.isSpacePressed) {
          this.isSpacePressed = true;
          rootContainerEl.addClass("is-space-panning");
          e.preventDefault();
        }
      }
    });

    this.delegate.registerWindowDomEvent("keyup", (e: KeyboardEvent) => {
      if (e.code === "Space") {
        this.isSpacePressed = false;
        rootContainerEl.removeClass("is-space-panning");
        if (this.delegate.getInkingController().activeTool !== "select") {
          this.finishPan();
        }
      }
    });

    const resetTransientInputState = () => {
      if (this.isSpacePressed) {
        this.isSpacePressed = false;
        rootContainerEl.removeClass("is-space-panning");
      }
      this.cancelActiveElementDrag();
      this.finishPan();
      this.touchPointers.clear();
      this.touchStartCoords.clear();
      this.isTouchPinching = false;
      this.touchTapCandidate = null;
    };

    this.delegate.registerWindowDomEvent("blur", resetTransientInputState);
    if (typeof document !== "undefined") {
      this.delegate.registerDomEvent(
        document as unknown as HTMLElement,
        "visibilitychange" as keyof HTMLElementEventMap,
        () => {
          if (document.hidden) {
            resetTransientInputState();
          }
        }
      );
    }

    this.delegate.registerDomEvent(rootContainerEl, "paste", async (e: ClipboardEvent) => {
      if (this.delegate.getTextController().isEditing()) {
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
          const currentPage = this.delegate.getPageByNumber(this.delegate.getCurrentPageNumber());
          if (file && currentPage) {
            e.preventDefault();
            const imageController = this.delegate.getImageController();
            const savedPath = await imageController.saveBlobToVault(
              file,
              "pasted_image",
              this.delegate.getFilePath()
            );
            const resourceUrl = this.delegate.resolveResourcePath(savedPath);
            const naturalDims = await ImageController.getImageNaturalDimensions(resourceUrl);
            const fittedDims = ImageController.calculateFittedDimensions(
              naturalDims.width,
              naturalDims.height,
              Math.min(450, currentPage.dimensions.width - 80),
              Math.min(450, currentPage.dimensions.height - 80)
            );
            const posX = Math.max(20, Math.round((currentPage.dimensions.width - fittedDims.width) / 2));
            const posY = Math.max(50, Math.round((currentPage.dimensions.height - fittedDims.height) / 2));
            const imgObj = imageController.createImageObject(
              savedPath,
              posX,
              posY,
              fittedDims.width,
              fittedDims.height
            );
            this.delegate.getHistoryManager().execute(
              new AddImageCommand(currentPage, imgObj, () => {
                this.delegate.handleMutation(currentPage);
                const frameEl = this.delegate.getCanvasHost().getPageFrame(currentPage.pageNumber);
                if (frameEl) {
                  imageController.renderPageImages(currentPage, frameEl, (p) => this.delegate.resolveResourcePath(p));
                }
              })
            );
            new Notice("Pasted image into notebook");
          }
          break;
        } else if (item.type === "application/pdf") {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            await this.delegate.promptAndImportLocalPdf(file);
            break;
          }
        }
      }
    });
  }

  bindPageInteractionEvents(
    page: PageData,
    pageFrame: HTMLElement,
    activeCanvas: HTMLCanvasElement,
    committedCanvas: HTMLCanvasElement,
    toolbarWrapperEl?: HTMLElement
  ): void {
    this.cleanupPageListeners(page.id);
    const pageAc = typeof AbortController !== "undefined" ? new AbortController() : null;
    if (pageAc) {
      this.pageAbortControllers.set(page.id, pageAc);
    }

    const onPageEl = <K extends keyof HTMLElementEventMap>(
      el: HTMLElement,
      type: K,
      callback: (ev: HTMLElementEventMap[K]) => void | Promise<void>,
      options?: boolean | AddEventListenerOptions
    ) => {
      if (pageAc && typeof el.addEventListener === "function") {
        const opts: AddEventListenerOptions =
          typeof options === "object" && options !== null
            ? { ...options, signal: pageAc.signal }
            : { capture: Boolean(options), signal: pageAc.signal };
        el.addEventListener(type, callback as EventListener, opts);
      } else {
        this.delegate.registerDomEvent(el, type, callback, options);
      }
    };

    onPageEl(pageFrame, "dragover", (e: DragEvent) => {
      if (
        e.dataTransfer &&
        (e.dataTransfer.types.includes("Files") || e.dataTransfer.types.includes("text/plain"))
      ) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }
    });

    onPageEl(pageFrame, "drop", async (e: DragEvent) => {
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.type.startsWith("image/")) {
          e.preventDefault();
          e.stopPropagation();
          const rect = pageFrame.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) {
            return;
          }
          const scaleX = page.dimensions.width / rect.width;
          const scaleY = page.dimensions.height / rect.height;
          const dropX = (e.clientX - rect.left) * scaleX;
          const dropY = (e.clientY - rect.top) * scaleY;

          const imageController = this.delegate.getImageController();
          const savedPath = await imageController.saveBlobToVault(
            file,
            "dropped_image",
            this.delegate.getFilePath()
          );
          const resourceUrl = this.delegate.resolveResourcePath(savedPath);
          const naturalDims = await ImageController.getImageNaturalDimensions(resourceUrl);
          const fittedDims = ImageController.calculateFittedDimensions(
            naturalDims.width,
            naturalDims.height,
            Math.min(450, page.dimensions.width - 40),
            Math.min(450, page.dimensions.height - 40)
          );
          const finalX = Math.max(0, Math.min(dropX, page.dimensions.width - fittedDims.width));
          const finalY = Math.max(0, Math.min(dropY, page.dimensions.height - fittedDims.height));
          const imgObj = imageController.createImageObject(
            savedPath,
            finalX,
            finalY,
            fittedDims.width,
            fittedDims.height
          );
          this.delegate.getHistoryManager().execute(
            new AddImageCommand(page, imgObj, () => {
              this.delegate.handleMutation(page);
              imageController.renderPageImages(page, pageFrame, (p) => this.delegate.resolveResourcePath(p));
            })
          );
          new Notice("Inserted dropped image into notebook");
        } else if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
          e.preventDefault();
          e.stopPropagation();
          await this.delegate.promptAndImportLocalPdf(file, false, page.pageNumber);
        }
      } else {
        const textData = e.dataTransfer?.getData("text/plain") || "";
        const match = textData.match(/^\[\[(.*?)\]\]$/) || textData.match(/^(.*\.pdf)$/i);
        if (match) {
          const cleanPath = match[1].replace(/\|.*$/, "");
          const linkedFile = this.delegate.app.metadataCache.getFirstLinkpathDest(
            cleanPath,
            this.delegate.getFilePath()
          );
          if (linkedFile && linkedFile.extension.toLowerCase() === "pdf") {
            e.preventDefault();
            e.stopPropagation();
            await this.delegate.promptAndImportVaultPdf(linkedFile, false, page.pageNumber);
          }
        }
      }
    });

    onPageEl(
      activeCanvas,
      "touchstart",
      (e: TouchEvent) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i] as Touch & { touchType?: string };
          if (touch.touchType === "stylus") {
            e.preventDefault();
            break;
          }
        }
      },
      { passive: false }
    );

    onPageEl(activeCanvas, "mousedown", (e: MouseEvent) => {
      if (
        e.button !== 0 ||
        this.stylusButtonState.temporaryEraserTool !== null ||
        this.stylusButtonState.isRecentPenActivity(400)
      ) {
        e.preventDefault();
      }
    });

    onPageEl(activeCanvas, "auxclick", (e: MouseEvent) => {
      if (
        this.stylusButtonState.temporaryEraserTool !== null ||
        this.stylusButtonState.isRecentPenActivity(400)
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    onPageEl(activeCanvas, "pointerdown", (e: PointerEvent) => {
      this.delegate.blurFocusedToolbarControl();
      this.stylusButtonState.recordPointerEvent(e.pointerType);
      this.recoveredEraserPointerId = null;
      this.delegate.getZoomController().flushCanvasResolutionUpdate();
      this.delegate.getCanvasHost().ensurePageCanvasesMounted(page.pageNumber);

      const inking = this.delegate.getInkingController();
      const scrollerEl = this.delegate.getScrollerEl();

      if (e.pointerType === "touch") {
        this.lastTouchTimestamp = Date.now();
        const palmDelay = inking.palmRejectionDelayMs || 350;
        const isPenBlocked =
          inking.isCurrentlyDrawing() || this.stylusButtonState.isRecentPenActivity(palmDelay);
        if (isPenBlocked) {
          return;
        }
        this.touchPointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
        this.touchStartCoords.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (!this.touchTapCandidate) {
          this.touchTapCandidate = { maxCount: 1, startTime: Date.now(), maxDistance: 0 };
        } else {
          this.touchTapCandidate.maxCount = Math.max(this.touchTapCandidate.maxCount, this.touchPointers.size);
        }
        if (this.touchPointers.size === 2) {
          if (inking.isCurrentlyDrawing()) {
            inking.handlePointerCancel(e);
          }
          if (this.hasActiveElementDrag()) {
            this.cancelActiveElementDrag();
          }
          if (this.isPanning) {
            this.finishPan();
          }
          const [p1, p2] = Array.from(this.touchPointers.values());
          this.touchPinchDistance = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
          this.touchPinchStartZoom = this.delegate.getZoomController().getZoomLevel();
          e.stopPropagation();
          return;
        }
      }

      const stylusAction = this.delegate.getStylusButtonAction();
      const stylusSnapshot = this.buildStylusSnapshot(e, stylusAction);
      const nextStylusTool = this.stylusButtonState.handlePointerDown(
        stylusSnapshot,
        stylusAction,
        inking.activeTool
      );
      if (nextStylusTool !== null) {
        this.applyStylusToolTransition(nextStylusTool, stylusAction === "toggle");
        this.updateHoverCursors(e, toolbarWrapperEl);
      }

      const textController = this.delegate.getTextController();
      if (this.isPanTrigger(e) && scrollerEl) {
        if (textController.isEditing()) {
          textController.commitActiveEdit();
        }
        this.startPan(e.clientX, e.clientY, scrollerEl, e.pointerId);
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const imageController = this.delegate.getImageController();
      if (imageController.getSelectedImageId()) {
        imageController.deselectImage();
        imageController.renderPageImages(page, pageFrame, (p) => this.delegate.resolveResourcePath(p));
      }

      if (e.pointerType === "touch" && !this.delegate.getDrawWithFinger()) {
        const palmDelay = inking.palmRejectionDelayMs || 350;
        if (
          this.touchPointers.size === 1 &&
          !this.isTouchPinching &&
          !inking.isCurrentlyDrawing() &&
          !this.stylusButtonState.isRecentPenActivity(palmDelay) &&
          scrollerEl
        ) {
          if (textController.isEditing()) {
            textController.commitActiveEdit();
          }
          this.startPan(e.clientX, e.clientY, scrollerEl, e.pointerId);
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      this.delegate.setToolbarDrawingActive(true);
      this.delegate.getDragCoordinator().setDragStartClient(e.clientX, e.clientY);

      const rect = activeCanvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        this.delegate.setToolbarDrawingActive(false);
        return;
      }
      const scaleX = page.dimensions.width / rect.width;
      const scaleY = page.dimensions.height / rect.height;
      const pageX = (e.clientX - rect.left) * scaleX;
      const pageY = (e.clientY - rect.top) * scaleY;

      if (textController.isEditing()) {
        textController.commitActiveEdit();
        if (inking.activeTool !== "text" && inking.activeTool !== "sticky") {
          e.stopPropagation();
          return;
        }
      }

      if (inking.activeTool === "text" || inking.activeTool === "sticky") {
        if (this.hasActiveElementDrag() || (e.pointerType === "mouse" && e.button !== 0)) {
          return;
        }
        const isSticky = inking.activeTool === "sticky";
        const hit = SelectionEngine.hitTestSingleElement([], [], pageX, pageY, 8, page.texts, []);
        if (hit?.text) {
          if ((isSticky && hit.text.isSticky) || (!isSticky && !hit.text.isSticky)) {
            textController.startEditing(page, pageFrame, hit.text);
            e.stopPropagation();
            return;
          }
        }

        this.isDraggingTextRect = true;
        this.dragTextCanvas = activeCanvas;
        this.dragCreatePointerId = e.pointerId;
        this.dragCreatePage = page;
        this.dragCreatePageFrame = pageFrame;
        const margin = 10;
        const clampedX = Math.max(margin, Math.min(page.dimensions.width - margin, pageX));
        const clampedY = Math.max(margin, Math.min(page.dimensions.height - margin, pageY));
        this.dragTextStartX = clampedX;
        this.dragTextStartY = clampedY;
        this.dragTextCurrentX = clampedX;
        this.dragTextCurrentY = clampedY;
        this.trySetPointerCapture(activeCanvas, e.pointerId);
        e.stopPropagation();
        return;
      }

      if (inking.activeTool === "shape") {
        if (this.hasActiveElementDrag() || (e.pointerType === "mouse" && e.button !== 0)) {
          return;
        }
        this.isDraggingShape = true;
        this.dragShapeCanvas = activeCanvas;
        this.dragCreatePointerId = e.pointerId;
        this.dragCreatePage = page;
        this.dragCreatePageFrame = pageFrame;
        const margin = 10;
        const clampedX = Math.max(margin, Math.min(page.dimensions.width - margin, pageX));
        const clampedY = Math.max(margin, Math.min(page.dimensions.height - margin, pageY));
        this.dragShapeStartX = clampedX;
        this.dragShapeStartY = clampedY;
        this.dragShapeCurrentX = clampedX;
        this.dragShapeCurrentY = clampedY;
        this.trySetPointerCapture(activeCanvas, e.pointerId);
        e.stopPropagation();
        return;
      }

      if (inking.activeTool === "connector") {
        if (this.hasActiveElementDrag() || (e.pointerType === "mouse" && e.button !== 0)) {
          return;
        }
        this.isDraggingConnector = true;
        this.dragConnectorCanvas = activeCanvas;
        this.dragCreatePointerId = e.pointerId;
        this.dragCreatePage = page;
        this.dragCreatePageFrame = pageFrame;
        const margin = 10;
        const clampedX = Math.max(margin, Math.min(page.dimensions.width - margin, pageX));
        const clampedY = Math.max(margin, Math.min(page.dimensions.height - margin, pageY));
        this.dragConnectorStartX = clampedX;
        this.dragConnectorStartY = clampedY;
        this.dragConnectorCurrentX = clampedX;
        this.dragConnectorCurrentY = clampedY;
        this.trySetPointerCapture(activeCanvas, e.pointerId);
        e.stopPropagation();
        return;
      }

      if (inking.activeTool === "lasso") {
        this.delegate.getSelectionController().handlePointerDown(e, page, activeCanvas, {
          x: pageX,
          y: pageY
        });
      } else {
        e.preventDefault();
        const ruler = this.delegate.getRulerController?.();
        const snappedStart = ruler
          ? ruler.beginStrokeSnap(page.id, page.pageNumber, pageX, pageY, inking.activeTool)
          : { x: pageX, y: pageY };
        inking.handlePointerDown(
          e,
          page.id,
          activeCanvas,
          committedCanvas,
          snappedStart,
          page.strokes,
          page.shapes,
          page.dimensions
        );
      }
    });

    onPageEl(activeCanvas, "pointermove", (e: PointerEvent) => {
      this.stylusButtonState.recordPointerEvent(e.pointerType);
      this.tryFinishRecoveredEraserOnHover(e);
      const inking = this.delegate.getInkingController();
      if (
        !inking.isCurrentlyDrawing() &&
        !this.isPanning &&
        !this.delegate.getDragCoordinator().isDraggingSelection() &&
        !this.isDraggingTextRect &&
        !this.isDraggingShape &&
        !this.isDraggingConnector
      ) {
        const recovered = this.tryRecoverStylusEraserOnMove(
          e,
          page,
          activeCanvas,
          committedCanvas,
          toolbarWrapperEl
        );
        if (recovered) {
          return;
        }
      }
      if (e.pointerType === "pen" && !inking.isCurrentlyDrawing()) {
        this.handleStylusHoverButton(e, toolbarWrapperEl);
      }
      this.updateHoverCursors(e, toolbarWrapperEl);
      if (this.isPanning) {
        this.updatePan(e.clientX, e.clientY);
        return;
      }

      if (e.pointerType === "touch" && !this.delegate.getDrawWithFinger()) {
        return;
      }

      const dragCoord = this.delegate.getDragCoordinator();
      if (dragCoord.isDraggingSelection()) {
        dragCoord.updateSelectionDrag(e.clientX, e.clientY);
        return;
      }

      const rect = activeCanvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }
      const scaleX = page.dimensions.width / rect.width;
      const scaleY = page.dimensions.height / rect.height;
      const canvasHost = this.delegate.getCanvasHost();

      if (this.isDraggingTextRect && this.dragTextCanvas === activeCanvas) {
        if (!this.isMatchingDragCreatePointer(e.pointerId)) {
          return;
        }
        const pageX = (e.clientX - rect.left) * scaleX;
        const pageY = (e.clientY - rect.top) * scaleY;
        const margin = 10;
        this.dragTextCurrentX = Math.max(margin, Math.min(page.dimensions.width - margin, pageX));
        this.dragTextCurrentY = Math.max(margin, Math.min(page.dimensions.height - margin, pageY));
        canvasHost.renderTextDragPreview(
          activeCanvas,
          this.dragTextStartX,
          this.dragTextStartY,
          this.dragTextCurrentX,
          this.dragTextCurrentY,
          inking.activeTool === "sticky",
          this.delegate.getCurrentStickyColor()
        );
        return;
      }

      if (this.isDraggingShape && this.dragShapeCanvas === activeCanvas) {
        if (!this.isMatchingDragCreatePointer(e.pointerId)) {
          return;
        }
        const pageX = (e.clientX - rect.left) * scaleX;
        const pageY = (e.clientY - rect.top) * scaleY;
        const margin = 10;
        this.dragShapeCurrentX = Math.max(margin, Math.min(page.dimensions.width - margin, pageX));
        this.dragShapeCurrentY = Math.max(margin, Math.min(page.dimensions.height - margin, pageY));
        canvasHost.renderShapeDragPreview(
          activeCanvas,
          this.dragShapeStartX,
          this.dragShapeStartY,
          this.dragShapeCurrentX,
          this.dragShapeCurrentY,
          this.delegate.getCurrentShapeType(),
          inking.currentColor,
          inking.currentWidth,
          this.delegate.isShapeFillEnabled() ? this.delegate.getShapeFillColor() : undefined,
          inking.currentStrokePattern
        );
        return;
      }

      if (this.isDraggingConnector && this.dragConnectorCanvas === activeCanvas) {
        if (!this.isMatchingDragCreatePointer(e.pointerId)) {
          return;
        }
        const pageX = (e.clientX - rect.left) * scaleX;
        const pageY = (e.clientY - rect.top) * scaleY;
        const margin = 10;
        this.dragConnectorCurrentX = Math.max(margin, Math.min(page.dimensions.width - margin, pageX));
        this.dragConnectorCurrentY = Math.max(margin, Math.min(page.dimensions.height - margin, pageY));
        canvasHost.renderConnectorDragPreview(
          activeCanvas,
          this.dragConnectorStartX,
          this.dragConnectorStartY,
          this.dragConnectorCurrentX,
          this.dragConnectorCurrentY,
          inking.currentColor,
          inking.currentWidth,
          inking.currentStrokePattern
        );
        return;
      }

      if (inking.activeTool === "lasso") {
        const pageX = (e.clientX - rect.left) * scaleX;
        const pageY = (e.clientY - rect.top) * scaleY;
        const targetInfo = this.getTargetPageForClientPoint(e.clientX, e.clientY);
        this.delegate.getSelectionController().handlePointerMove(
          activeCanvas,
          { x: pageX, y: pageY },
          targetInfo?.page,
          targetInfo?.activeCanvas,
          targetInfo?.pointOnPage
        );
      } else {
        if (
          e.pointerType === "pen" &&
          inking.isCurrentlyDrawing(page.id) &&
          inking.activeTool !== "eraser"
        ) {
          const stylusAction = this.delegate.getStylusButtonAction();
          const meta = inking.getActiveStrokeMeta();
          const takeoverTool = this.stylusButtonState.handleActiveStrokeMove(
            e,
            stylusAction,
            inking.activeTool,
            meta.elapsedMs,
            meta.pointCount
          );
          if (takeoverTool === "eraser") {
            const pageX = (e.clientX - rect.left) * scaleX;
            const pageY = (e.clientY - rect.top) * scaleY;
            inking.discardActiveStroke();
            this.applyStylusToolTransition("eraser", stylusAction === "toggle");
            inking.handlePointerDown(
              e,
              page.id,
              activeCanvas,
              committedCanvas,
              { x: pageX, y: pageY },
              page.strokes,
              page.shapes,
              page.dimensions
            );
            this.updateEraserCursorPosition(e.clientX, e.clientY, toolbarWrapperEl);
            return;
          }
        }
        const coalesced = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
        const events = coalesced.length > 0 ? coalesced : [e];
        const ruler = this.delegate.getRulerController?.();
        const coordsList = events.map((ev) => {
          const rawX = (ev.clientX - rect.left) * scaleX;
          const rawY = (ev.clientY - rect.top) * scaleY;
          const projected = ruler ? ruler.projectStrokePoint(page.id, rawX, rawY) : { x: rawX, y: rawY };
          return {
            x: projected.x,
            y: projected.y,
            pressure: ev.pressure,
            tiltX: ev.tiltX,
            tiltY: ev.tiltY,
            timestamp: ev.timeStamp
          };
        });
        inking.handlePointerMove(e, coordsList, page.strokes, page.shapes);
      }
    });

    onPageEl(activeCanvas, "pointerup", (e: PointerEvent) => {
      this.delegate.setToolbarDrawingActive(false);
      if (this.recoveredEraserPointerId !== null && e.pointerId === this.recoveredEraserPointerId) {
        this.recoveredEraserPointerId = null;
      }
      if (this.isPanning) {
        if (!e || this.panPointerId === null || e.pointerId === this.panPointerId) {
          this.finishPan();
        }
        return;
      }

      const dragCoord = this.delegate.getDragCoordinator();
      if (dragCoord.isDraggingSelection()) {
        this.tryReleasePointerCapture(activeCanvas, e.pointerId);
        dragCoord.finishSelectionDrag(e.clientX, e.clientY);
        return;
      }

      const inking = this.delegate.getInkingController();

      if (this.isDraggingTextRect && this.dragTextCanvas === activeCanvas) {
        if (this.isMatchingDragCreatePointer(e.pointerId)) {
          this.finishTextDrag(e, page, pageFrame, activeCanvas);
        }
        return;
      }

      if (this.isDraggingShape && this.dragShapeCanvas === activeCanvas) {
        if (this.isMatchingDragCreatePointer(e.pointerId)) {
          this.finishShapeDrag(e, page, activeCanvas);
        }
        return;
      }

      if (this.isDraggingConnector && this.dragConnectorCanvas === activeCanvas) {
        if (this.isMatchingDragCreatePointer(e.pointerId)) {
          this.finishConnectorDrag(e, page, activeCanvas);
        }
        return;
      }

      if (inking.activeTool === "lasso") {
        const targetInfo = this.getTargetPageForClientPoint(e.clientX, e.clientY);
        this.delegate.getSelectionController().handlePointerUp(
          e,
          page,
          activeCanvas,
          targetInfo?.page,
          targetInfo?.activeCanvas
        );
      } else {
        inking.handlePointerUp(e);
        this.delegate.getRulerController?.().endStrokeSnap(page.id);
      }

      this.stylusButtonState.recordPointerEvent(e.pointerType);
      this.revertTemporaryStylusEraser(e);
    });

    onPageEl(activeCanvas, "pointercancel", (e: PointerEvent) => {
      this.delegate.setToolbarDrawingActive(false);
      if (this.recoveredEraserPointerId !== null && e.pointerId === this.recoveredEraserPointerId) {
        this.recoveredEraserPointerId = null;
      }
      if (this.isPanning) {
        if (!e || this.panPointerId === null || e.pointerId === this.panPointerId) {
          this.finishPan();
        }
        return;
      }

      const dragCoord = this.delegate.getDragCoordinator();
      if (dragCoord.isDraggingSelection()) {
        dragCoord.cancelSelectionDrag();
        return;
      }

      if (this.hasActiveElementDrag()) {
        this.cancelActiveElementDrag(e.pointerId);
        return;
      }

      const inking = this.delegate.getInkingController();
      if (inking.activeTool === "lasso") {
        this.delegate.getSelectionController().clearSelection(activeCanvas);
      } else {
        inking.handlePointerCancel(e);
        this.delegate.getRulerController?.().endStrokeSnap(page.id);
      }

      this.stylusButtonState.recordPointerEvent(e.pointerType);
      this.revertTemporaryStylusEraser(e, true);
    });

    onPageEl(activeCanvas, "dblclick", (e: MouseEvent) => {
      const tool = this.delegate.getInkingController().activeTool;
      if (tool !== "select" && tool !== "lasso" && tool !== "text" && tool !== "sticky") {
        return;
      }

      const pointerEvent = e as unknown as PointerEvent;
      const isRecentTouch =
        pointerEvent.pointerType === "touch" || Date.now() - this.lastTouchTimestamp < 600;
      if (isRecentTouch && !this.delegate.getDrawWithFinger()) {
        return;
      }

      const rect = activeCanvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }
      const scaleX = page.dimensions.width / rect.width;
      const scaleY = page.dimensions.height / rect.height;
      const pageX = (e.clientX - rect.left) * scaleX;
      const pageY = (e.clientY - rect.top) * scaleY;
      const hit = SelectionEngine.hitTestSingleElement([], [], pageX, pageY, 8, page.texts, []);
      const textController = this.delegate.getTextController();

      if (hit?.text) {
        if (
          tool === "select" ||
          tool === "lasso" ||
          (tool === "text" && !hit.text.isSticky) ||
          (tool === "sticky" && hit.text.isSticky)
        ) {
          textController.startEditing(page, pageFrame, hit.text);
        }
      } else if (tool === "sticky") {
        const defaultW = 140;
        const defaultH = 140;
        const margin = 10;
        const adjustedX = Math.max(margin, Math.min(pageX, page.dimensions.width - margin - defaultW));
        const adjustedY = Math.max(margin, Math.min(pageY, page.dimensions.height - margin - defaultH));
        textController.startEditing(
          page,
          pageFrame,
          undefined,
          adjustedX,
          adjustedY,
          defaultW,
          defaultH,
          {
            isSticky: true,
            backgroundColor: this.delegate.getCurrentStickyColor()
          }
        );
      } else {
        const defaultW = 220;
        const defaultH = 60;
        const margin = 10;
        const adjustedX = Math.max(margin, Math.min(pageX, page.dimensions.width - margin - defaultW));
        const adjustedY = Math.max(margin, Math.min(pageY, page.dimensions.height - margin - defaultH));
        const currentTextOptions = this.delegate.getCurrentTextOptions();
        const isDarkPaper = this.delegate.isDarkColor(page.template.backgroundColor);
        const resolvedTextColor =
          currentTextOptions.color === "#1e293b" && isDarkPaper
            ? "#f8fafc"
            : currentTextOptions.color;
        textController.startEditing(
          page,
          pageFrame,
          undefined,
          adjustedX,
          adjustedY,
          defaultW,
          defaultH,
          {
            ...currentTextOptions,
            color: resolvedTextColor
          }
        );
      }
    });
  }

  private finishTextDrag(
    e: PointerEvent,
    page: PageData,
    pageFrame: HTMLElement,
    activeCanvas: HTMLCanvasElement
  ): void {
    this.isDraggingTextRect = false;
    this.dragTextCanvas = null;
    this.dragCreatePointerId = null;
    this.dragCreatePage = null;
    this.dragCreatePageFrame = null;
    this.tryReleasePointerCapture(activeCanvas, e.pointerId);
    this.clearCanvasRect(activeCanvas);

    const rect = activeCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
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

    const maxAvailableW = Math.max(40, page.dimensions.width - margin - x);
    const maxAvailableH = Math.max(30, page.dimensions.height - margin - y);

    const isSticky = this.delegate.getInkingController().activeTool === "sticky";
    const fallbackW = isSticky ? 140 : 220;
    const fallbackH = isSticky ? 140 : 60;

    const currentTextOptions = this.delegate.getCurrentTextOptions();
    const isDarkPaper = this.delegate.isDarkColor(page.template.backgroundColor);
    const resolvedTextColor =
      currentTextOptions.color === "#1e293b" && isDarkPaper
        ? "#f8fafc"
        : currentTextOptions.color;

    const options: TextFormattingOptions = isSticky
      ? {
          isSticky: true,
          backgroundColor: this.delegate.getCurrentStickyColor(),
          color: "#1e293b",
          fontSize: 16,
          fontWeight: "normal",
          italic: false,
          underline: false,
          textAlign: "left"
        }
      : {
          ...currentTextOptions,
          color: resolvedTextColor
        };

    const textController = this.delegate.getTextController();
    if (rawW > 20 || rawH > 20) {
      const initialWidth = Math.min(maxAvailableW, Math.max(60, Math.round(rawW)));
      const initialHeight = Math.min(maxAvailableH, Math.max(30, Math.round(rawH)));
      textController.startEditing(page, pageFrame, undefined, x, y, initialWidth, initialHeight, options);
    } else {
      const defaultW = Math.min(fallbackW, maxAvailableW);
      const defaultH = Math.min(fallbackH, maxAvailableH);
      const adjustedX = Math.max(margin, Math.min(x, page.dimensions.width - margin - defaultW));
      const adjustedY = Math.max(margin, Math.min(y, page.dimensions.height - margin - defaultH));
      textController.startEditing(page, pageFrame, undefined, adjustedX, adjustedY, defaultW, defaultH, options);
    }
    e.stopPropagation();
    e.preventDefault();
  }

  private finishShapeDrag(e: PointerEvent, page: PageData, activeCanvas: HTMLCanvasElement): void {
    this.isDraggingShape = false;
    this.dragShapeCanvas = null;
    this.dragCreatePointerId = null;
    this.dragCreatePage = null;
    this.dragCreatePageFrame = null;
    this.tryReleasePointerCapture(activeCanvas, e.pointerId);
    this.clearCanvasRect(activeCanvas);

    const margin = 10;
    const rect = activeCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
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

    if (rawW < 12 && rawH < 12) {
      rawW = 120;
      rawH = 80;
      x = Math.max(margin, Math.min(x - rawW / 2, page.dimensions.width - margin - rawW));
      y = Math.max(margin, Math.min(y - rawH / 2, page.dimensions.height - margin - rawH));
    }

    const w = Math.round(rawW);
    const h = Math.round(rawH);
    const shapeType = this.delegate.getCurrentShapeType();
    const geometryData = PageCanvasHost.buildShapeGeometryData(shapeType, x, y, w, h);
    const inking = this.delegate.getInkingController();

    const shapeObj: ShapeObject = {
      id: `shape_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      elementType: "shape",
      type: shapeType,
      color: inking.currentColor,
      strokeWidth: inking.currentWidth,
      fillColor: this.delegate.isShapeFillEnabled() ? this.delegate.getShapeFillColor() : undefined,
      strokePattern: inking.currentStrokePattern !== "solid" ? inking.currentStrokePattern : undefined,
      bounds: {
        minX: x,
        minY: y,
        maxX: x + w,
        maxY: y + h
      },
      geometryData
    };

    this.delegate.getHistoryManager().execute(
      new AddShapeCommand(page, shapeObj, () => {
        this.delegate.handleMutation(page);
      })
    );
  }

  private finishConnectorDrag(e: PointerEvent, page: PageData, activeCanvas: HTMLCanvasElement): void {
    this.isDraggingConnector = false;
    this.dragConnectorCanvas = null;
    this.dragCreatePointerId = null;
    this.dragCreatePage = null;
    this.dragCreatePageFrame = null;
    this.tryReleasePointerCapture(activeCanvas, e.pointerId);
    this.clearCanvasRect(activeCanvas);

    const margin = 10;
    const rect = activeCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
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

    const dist = Math.hypot(endX - startX, endY - startY);
    if (dist < 10) {
      endX = Math.min(page.dimensions.width - margin, startX + 80);
      endY = startY;
    }

    const padding = 12;
    const inking = this.delegate.getInkingController();
    const shapeObj: ShapeObject = {
      id: `shape_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      elementType: "shape",
      type: "arrow",
      color: inking.currentColor,
      strokeWidth: inking.currentWidth,
      strokePattern: inking.currentStrokePattern !== "solid" ? inking.currentStrokePattern : undefined,
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

    this.delegate.getHistoryManager().execute(
      new AddShapeCommand(page, shapeObj, () => {
        this.delegate.handleMutation(page);
      })
    );
  }

  private showCanvasContextMenu(e: MouseEvent): void {
    const clientX = e.clientX;
    const clientY = e.clientY;
    const menu = new Menu();

    const selectionController = this.delegate.getSelectionController();
    if (selectionController.hasSelection()) {
      menu.addItem((item) => {
        item
          .setTitle("Delete selected")
          .setIcon("trash")
          .onClick(() => {
            this.delegate.getDragCoordinator().deleteActiveSelection();
          });
      });
      menu.addItem((item) => {
        item
          .setTitle("Clear selection")
          .setIcon("x")
          .onClick(() => {
            selectionController.clearSelection();
          });
      });
      menu.addSeparator();
    }

    menu.addItem((item) => {
      item
        .setTitle("Add text box")
        .setIcon("type")
        .onClick(() => {
          this.delegate.insertTextBox(undefined, clientX, clientY);
        });
    });

    menu.addItem((item) => {
      item
        .setTitle("Add sticky note")
        .setIcon("sticky-note")
        .onClick(() => {
          this.delegate.insertStickyNote(undefined, clientX, clientY);
        });
    });

    menu.addItem((item) => {
      item
        .setTitle("Insert image...")
        .setIcon("image")
        .onClick(() => {
          this.delegate.openImagePicker();
        });
    });

    menu.addItem((item) => {
      item
        .setTitle("Import PDF / SVG...")
        .setIcon("file-text")
        .onClick(() => {
          this.delegate.openPdfPicker(false);
        });
    });

    menu.addSeparator();

    menu.addItem((item) => {
      item
        .setTitle("Add page below")
        .setIcon("plus")
        .onClick(() => {
          this.delegate.addNewPage();
        });
    });

    menu.addItem((item) => {
      item
        .setTitle("Duplicate current page")
        .setIcon("copy")
        .onClick(() => {
          this.delegate.duplicateCurrentPage();
        });
    });

    menu.addSeparator();

    menu.addItem((item) => {
      item
        .setTitle("Quick rename notebook...")
        .setIcon("pencil")
        .onClick(() => {
          this.delegate.openQuickRenameModal();
        });
    });

    menu.addItem((item) => {
      item
        .setTitle("Export notebook...")
        .setIcon("file-down")
        .onClick(() => {
          this.delegate.openExportModal();
        });
    });

    menu.showAtMouseEvent(e);
  }

  getTargetPageForClientPoint(
    clientX: number,
    clientY: number
  ): { page: PageData; activeCanvas: HTMLCanvasElement; pointOnPage: { x: number; y: number } } | null {
    const pages = this.delegate.getAllPages();
    if (pages.length === 0) {
      return null;
    }

    const canvasHost = this.delegate.getCanvasHost();
    let closestPage = pages[0];
    let closestCanvas: HTMLCanvasElement | undefined;
    let minDistance = Number.POSITIVE_INFINITY;

    for (const page of pages) {
      const canvas = canvasHost.getActiveCanvas(page.id);
      if (!canvas) {
        continue;
      }
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        continue;
      }

      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
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

  isPanTrigger(e: PointerEvent): boolean {
    if (
      this.stylusButtonState.isMouseEmulatedPointerActive(e.pointerId) ||
      this.stylusButtonState.isMouseEmulatedStylusDown(e, this.delegate.getStylusButtonAction())
    ) {
      return false;
    }
    if (this.isSpacePressed) {
      return true;
    }
    const inking = this.delegate.getInkingController();
    if (
      inking.activeTool === "select" ||
      (inking.activeTool === "lasso" && this.delegate.getSelectionSubMode() === "pan")
    ) {
      if (e.button === 0) {
        return true;
      }
    }
    if (e.pointerType === "mouse" && (e.button === 1 || e.button === 2)) {
      return true;
    }
    return false;
  }

  private startPan(clientX: number, clientY: number, target?: Element, pointerId?: number): void {
    const scrollerEl = this.delegate.getScrollerEl();
    if (!scrollerEl) {
      return;
    }
    this.isPanning = true;
    this.panStartX = clientX;
    this.panStartY = clientY;
    this.panScrollLeft = scrollerEl.scrollLeft;
    this.panScrollTop = scrollerEl.scrollTop;
    this.panPointerId = pointerId ?? null;
    this.panCaptureTarget = (target as HTMLElement) ?? null;
    this.delegate.getRootContainerEl()?.addClass("is-panning");
    scrollerEl.addClass("is-panning");
    if (target && pointerId !== undefined && typeof (target as HTMLElement).setPointerCapture === "function") {
      try {
        (target as HTMLElement).setPointerCapture(pointerId);
      } catch (err) {
        void err;
      }
    }
  }

  private updatePan(clientX: number, clientY: number): void {
    const scrollerEl = this.delegate.getScrollerEl();
    if (!this.isPanning || !scrollerEl) {
      return;
    }
    const dx = clientX - this.panStartX;
    const dy = clientY - this.panStartY;
    scrollerEl.scrollLeft = this.panScrollLeft - dx;
    scrollerEl.scrollTop = this.panScrollTop - dy;
  }

  private finishPan(): void {
    if (!this.isPanning) {
      return;
    }
    if (
      this.panCaptureTarget &&
      this.panPointerId !== null &&
      typeof this.panCaptureTarget.releasePointerCapture === "function"
    ) {
      try {
        this.panCaptureTarget.releasePointerCapture(this.panPointerId);
      } catch (err) {
        void err;
      }
    }
    this.isPanning = false;
    this.panPointerId = null;
    this.panCaptureTarget = null;
    this.delegate.getRootContainerEl()?.removeClass("is-panning");
    this.delegate.getScrollerEl()?.removeClass("is-panning");
  }

  private getEraserScreenRadius(): number {
    return this.delegate.getInkingController().eraserRadius;
  }

  updateEraserCursorSize(): void {
    const eraserCursorEl = this.delegate.getEraserCursorEl();
    if (!eraserCursorEl) {
      return;
    }
    const screenRadius = this.getEraserScreenRadius();
    const diameter = Math.round(screenRadius * 2);
    eraserCursorEl.setCssStyles({
      width: `${diameter}px`,
      height: `${diameter}px`
    });
  }

  private getRelativeOverlayPoint(
    clientX: number,
    clientY: number,
    toolbarWrapperEl?: HTMLElement
  ): { x: number; y: number } | null {
    const rootContainerEl = this.delegate.getRootContainerEl();
    if (!rootContainerEl) {
      return null;
    }
    const rootRect = rootContainerEl.getBoundingClientRect ? rootContainerEl.getBoundingClientRect() : null;
    if (
      rootRect &&
      (clientX < rootRect.left || clientX > rootRect.right || clientY < rootRect.top || clientY > rootRect.bottom)
    ) {
      return null;
    }
    if (toolbarWrapperEl && toolbarWrapperEl.getBoundingClientRect) {
      const tbRect = toolbarWrapperEl.getBoundingClientRect();
      if (
        clientX >= tbRect.left &&
        clientX <= tbRect.right &&
        clientY >= tbRect.top &&
        clientY <= tbRect.bottom
      ) {
        return null;
      }
    }
    return {
      x: rootRect ? clientX - rootRect.left : clientX,
      y: rootRect ? clientY - rootRect.top : clientY
    };
  }

  private updateHoverCursors(e: PointerEvent, toolbarWrapperEl?: HTMLElement): void {
    const inking = this.delegate.getInkingController();
    const isEraser = inking.activeTool === "eraser" || this.stylusButtonState.temporaryEraserTool !== null;
    if (isEraser) {
      this.hidePenCursor();
      this.updateEraserCursorPosition(e.clientX, e.clientY, toolbarWrapperEl);
      return;
    }
    this.hideEraserCursor();
    this.updatePenCursorPosition(e.clientX, e.clientY, e.pointerType, toolbarWrapperEl);
  }

  updatePenCursorPosition(
    clientX: number,
    clientY: number,
    pointerType: string,
    toolbarWrapperEl?: HTMLElement
  ): void {
    const penCursorEl = this.delegate.getPenCursorEl?.();
    if (!penCursorEl) {
      return;
    }
    if (pointerType === "touch" || (this.delegate.shouldShowPenCursor && !this.delegate.shouldShowPenCursor())) {
      penCursorEl.addClass("is-hidden");
      return;
    }
    const inking = this.delegate.getInkingController();
    const tool = inking.activeTool;
    const isInkTool =
      tool === "pen" ||
      tool === "pressure" ||
      tool === "fountain" ||
      tool === "pencil" ||
      tool === "highlighter";
    if (!isInkTool || this.stylusButtonState.temporaryEraserTool !== null) {
      penCursorEl.addClass("is-hidden");
      return;
    }

    const pos = this.getRelativeOverlayPoint(clientX, clientY, toolbarWrapperEl);
    if (!pos) {
      penCursorEl.addClass("is-hidden");
      return;
    }

    const zoomLevel = this.delegate.getZoomController().getZoomLevel();
    const rawWidth = inking.currentWidth * zoomLevel;
    const diameter = Math.max(4, Math.min(48, Math.round(rawWidth)));
    const half = diameter / 2;

    penCursorEl.toggleClass("is-pencil", tool === "pencil");
    penCursorEl.toggleClass("is-highlighter", tool === "highlighter");
    penCursorEl.setCssStyles({
      width: `${diameter}px`,
      height: `${diameter}px`,
      borderColor: inking.currentColor,
      backgroundColor: tool === "highlighter" ? inking.currentColor : "transparent",
      transform: `translate3d(${Math.round(pos.x - half)}px, ${Math.round(pos.y - half)}px, 0)`
    });
    penCursorEl.removeClass("is-hidden");
  }

  hidePenCursor(): void {
    const penCursorEl = this.delegate.getPenCursorEl?.();
    if (penCursorEl) {
      penCursorEl.addClass("is-hidden");
    }
  }

  updateEraserCursorPosition(clientX: number, clientY: number, toolbarWrapperEl?: HTMLElement): void {
    const eraserCursorEl = this.delegate.getEraserCursorEl();
    if (!eraserCursorEl) {
      return;
    }
    const inking = this.delegate.getInkingController();
    const isEraser = inking.activeTool === "eraser" || this.stylusButtonState.temporaryEraserTool !== null;
    if (!isEraser) {
      eraserCursorEl.addClass("is-hidden");
      return;
    }

    const pos = this.getRelativeOverlayPoint(clientX, clientY, toolbarWrapperEl);
    if (!pos) {
      eraserCursorEl.addClass("is-hidden");
      return;
    }

    const screenRadius = this.getEraserScreenRadius();
    const diameter = Math.round(screenRadius * 2);

    eraserCursorEl.setCssStyles({
      width: `${diameter}px`,
      height: `${diameter}px`,
      transform: `translate3d(${Math.round(pos.x - screenRadius)}px, ${Math.round(pos.y - screenRadius)}px, 0)`
    });
    eraserCursorEl.removeClass("is-hidden");
  }

  hideEraserCursor(): void {
    const eraserCursorEl = this.delegate.getEraserCursorEl();
    if (eraserCursorEl) {
      eraserCursorEl.addClass("is-hidden");
    }
  }

  handleStylusHoverButton(e: PointerEvent, toolbarWrapperEl?: HTMLElement): void {
    const stylusAction = this.delegate.getStylusButtonAction();
    const inking = this.delegate.getInkingController();
    const isActivelyInteracting =
      inking.isCurrentlyDrawing() ||
      this.isPanning ||
      this.delegate.getDragCoordinator().isDraggingSelection() ||
      this.isDraggingTextRect ||
      this.isDraggingShape ||
      this.isDraggingConnector;
    const nextTool = this.stylusButtonState.handleHoverMove(
      e,
      stylusAction,
      inking.activeTool,
      isActivelyInteracting
    );
    if (nextTool !== null) {
      this.applyStylusToolTransition(nextTool, stylusAction === "toggle");
      if (nextTool === "eraser") {
        this.updateEraserCursorPosition(e.clientX, e.clientY, toolbarWrapperEl);
      }
    }
  }

  applyStylusToolTransition(nextTool: ToolType, isPersistentToggle: boolean): void {
    if (isPersistentToggle) {
      this.delegate.setActiveTool(nextTool, false);
      return;
    }
    this.delegate.getInkingController().setTool(nextTool);
    this.delegate.getRootContainerEl()?.toggleClass("is-tool-eraser", nextTool === "eraser");
    this.delegate.setToolbarActiveTool(nextTool);
    if (nextTool !== "eraser") {
      this.hideEraserCursor();
    }
  }

  revertTemporaryStylusEraser(e: PointerEvent | null, isCancel: boolean = false): void {
    const stylusAction = this.delegate.getStylusButtonAction();
    const revertTool = this.stylusButtonState.handlePointerUpOrCancel(e, stylusAction, isCancel);
    if (revertTool !== null) {
      this.applyStylusToolTransition(revertTool, false);
    }
  }

  private buildStylusSnapshot(e: PointerEvent, stylusAction: StylusButtonAction): StylusPointerSnapshot {
    const isMouseEmulatedStylus =
      this.stylusButtonState.isMouseEmulatedPointerActive(e.pointerId) ||
      this.stylusButtonState.isMouseEmulatedStylusDown(e, stylusAction);
    if (isMouseEmulatedStylus) {
      this.stylusButtonState.markMouseEmulatedPointer(e.pointerId);
      return {
        pointerType: "pen",
        button: e.button,
        buttons: e.buttons,
        pressure: e.pressure,
        pointerId: e.pointerId
      };
    }
    return e;
  }

  private tryFinishRecoveredEraserOnHover(e: PointerEvent): boolean {
    if (this.recoveredEraserPointerId === null || e.pointerId !== this.recoveredEraserPointerId) {
      return false;
    }
    const isHoverLift = (e.pressure === undefined || e.pressure === 0) && (e.buttons & 1) === 0;
    if (!isHoverLift) {
      return false;
    }
    this.recoveredEraserPointerId = null;
    this.delegate.setToolbarDrawingActive(false);
    const inking = this.delegate.getInkingController();
    if (inking.isCurrentlyDrawing()) {
      inking.handlePointerUp(e);
    }
    this.revertTemporaryStylusEraser(e);
    return true;
  }

  private tryRecoverStylusEraserOnMove(
    e: PointerEvent,
    page: PageData,
    activeCanvas: HTMLCanvasElement,
    committedCanvas: HTMLCanvasElement,
    toolbarWrapperEl?: HTMLElement
  ): boolean {
    if (e.pointerType === "touch") {
      return false;
    }
    const stylusAction = this.delegate.getStylusButtonAction();
    if (stylusAction === "off") {
      return false;
    }
    const snapshot = this.buildStylusSnapshot(e, stylusAction);
    if (snapshot.pointerType !== "pen") {
      return false;
    }
    const inking = this.delegate.getInkingController();
    const result = this.stylusButtonState.handleActiveButtonContactMove(
      snapshot,
      stylusAction,
      inking.activeTool
    );
    if (result.transitionTool !== null) {
      this.applyStylusToolTransition(result.transitionTool, stylusAction === "toggle");
    }
    if (!result.startEraserSession) {
      return false;
    }

    const rect = activeCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    this.delegate.getZoomController().flushCanvasResolutionUpdate();
    this.delegate.getCanvasHost().ensurePageCanvasesMounted(page.pageNumber);
    this.delegate.setToolbarDrawingActive(true);
    this.recoveredEraserPointerId = e.pointerId;

    const scaleX = page.dimensions.width / rect.width;
    const scaleY = page.dimensions.height / rect.height;
    const pageX = (e.clientX - rect.left) * scaleX;
    const pageY = (e.clientY - rect.top) * scaleY;

    inking.handlePointerDown(
      e,
      page.id,
      activeCanvas,
      committedCanvas,
      { x: pageX, y: pageY },
      page.strokes,
      page.shapes,
      page.dimensions
    );
    this.updateHoverCursors(e, toolbarWrapperEl);
    return true;
  }

  private trySetPointerCapture(el: HTMLElement, pointerId: number): void {
    try {
      el.setPointerCapture(pointerId);
    } catch (err) {
      void err;
    }
  }

  private tryReleasePointerCapture(el: HTMLElement, pointerId: number): void {
    try {
      el.releasePointerCapture(pointerId);
    } catch (err) {
      void err;
    }
  }

  private clearCanvasRect(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
}
