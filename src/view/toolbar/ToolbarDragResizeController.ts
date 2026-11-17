import { ToolbarLayoutConfig, ToolbarPlacement } from "../../types";

export const TOOLBAR_MIN_SCALE = 0.7;
export const TOOLBAR_MAX_SCALE = 1.5;
export const TOOLBAR_MIN_WIDTH = 180;
export const TOOLBAR_MAX_WIDTH = 1600;
const SNAP_EDGE_THRESHOLD_PX = 42;
const DRAG_MOVE_THRESHOLD_PX = 4;

export interface ToolbarDragResizeHost {
  getWrapperEl(): HTMLElement;
  getToolbarEl(): HTMLElement;
  getPlacement(): ToolbarPlacement;
  getLayoutConfig(): ToolbarLayoutConfig;
  setPlacement(placement: ToolbarPlacement, notify?: boolean): void;
  applyLayoutConfig(config: ToolbarLayoutConfig): void;
  updateLayoutConfig(partial: Partial<ToolbarLayoutConfig>): void;
  toggleToolbarPopover(): void;
  onSetToolbarFloatingPos?(pos: { left: number; top: number } | null): void;
  registerDomEvent<K extends keyof HTMLElementEventMap>(
    el: HTMLElement | Window,
    type: K,
    callback: (ev: HTMLElementEventMap[K]) => void
  ): void;
}

export class ToolbarDragResizeController {
  private host: ToolbarDragResizeHost;
  private isDraggingDock: boolean = false;
  private dragDockMoved: boolean = false;
  private dragDockStartX: number = 0;
  private dragDockStartY: number = 0;
  private dragDockInitLeft: number = 0;
  private dragDockInitTop: number = 0;

  private isResizingDock: boolean = false;
  private resizeStartX: number = 0;
  private resizeStartWidth: number = 0;
  private resizeStartScale: number = 1.0;
  private resizeDragWidth: number | null = null;
  private resizeDragScale: number | null = null;

  constructor(host: ToolbarDragResizeHost) {
    this.host = host;
  }

  setupToolbarDrag(handleEl: HTMLElement): void {
    this.host.registerDomEvent(handleEl, "pointerdown", (e: PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const wrapperEl = this.host.getWrapperEl();
      this.isDraggingDock = true;
      this.dragDockMoved = false;
      this.dragDockStartX = e.clientX;
      this.dragDockStartY = e.clientY;
      const rect = wrapperEl.getBoundingClientRect();
      const parentRect = wrapperEl.parentElement?.getBoundingClientRect() ?? { left: 0, top: 0 };
      this.dragDockInitLeft = rect.left - parentRect.left;
      this.dragDockInitTop = rect.top - parentRect.top;

      wrapperEl.addClass("is-dock-dragging");
      this.capturePointer(handleEl, e.pointerId);
    });

    this.host.registerDomEvent(handleEl, "pointermove", (e: PointerEvent) => {
      if (!this.isDraggingDock) {
        return;
      }
      e.stopPropagation();
      e.preventDefault();

      const dx = e.clientX - this.dragDockStartX;
      const dy = e.clientY - this.dragDockStartY;
      if (!this.dragDockMoved && Math.hypot(dx, dy) > DRAG_MOVE_THRESHOLD_PX) {
        this.dragDockMoved = true;
      }
      if (!this.dragDockMoved) {
        return;
      }

      const newLeft = Math.max(0, this.dragDockInitLeft + dx);
      const newTop = Math.max(0, this.dragDockInitTop + dy);

      this.host.setPlacement("floating", false);
      this.host.getWrapperEl().setCssStyles({
        left: `${newLeft}px`,
        top: `${newTop}px`
      });
    });

    const onPointerUp = (e: PointerEvent) => {
      if (!this.isDraggingDock) {
        return;
      }
      const wrapperEl = this.host.getWrapperEl();
      const wasMoved = this.dragDockMoved;
      this.isDraggingDock = false;
      this.dragDockMoved = false;
      wrapperEl.removeClass("is-dock-dragging");
      this.releasePointer(handleEl, e.pointerId);

      if (!wasMoved) {
        this.host.toggleToolbarPopover();
        return;
      }

      const rect = wrapperEl.getBoundingClientRect();
      const parentRect = wrapperEl.parentElement?.getBoundingClientRect();
      const topDist = parentRect ? rect.top - parentRect.top : rect.top;
      const bottomDist = parentRect
        ? parentRect.bottom - rect.bottom
        : typeof window !== "undefined"
          ? window.innerHeight - rect.bottom
          : 800;
      const leftDist = parentRect ? rect.left - parentRect.left : rect.left;
      const rightDist = parentRect
        ? parentRect.right - rect.right
        : typeof window !== "undefined"
          ? window.innerWidth - rect.right
          : 1000;

      const edgeSnaps = [
        { dist: topDist, placement: "top" },
        { dist: bottomDist, placement: "bottom" },
        { dist: leftDist, placement: "left" },
        { dist: rightDist, placement: "right" }
      ] as const;
      const matchedSnap = edgeSnaps.find((snap) => snap.dist < SNAP_EDGE_THRESHOLD_PX);
      if (matchedSnap) {
        this.host.setPlacement(matchedSnap.placement);
        this.host.onSetToolbarFloatingPos?.(null);
      } else {
        this.host.setPlacement("floating");
        this.host.onSetToolbarFloatingPos?.({
          left: Math.max(0, Math.round(leftDist)),
          top: Math.max(0, Math.round(topDist))
        });
      }
    };

    const onPointerCancel = (e: PointerEvent) => {
      if (!this.isDraggingDock) {
        return;
      }
      this.isDraggingDock = false;
      this.dragDockMoved = false;
      this.host.getWrapperEl().removeClass("is-dock-dragging");
      this.releasePointer(handleEl, e.pointerId);
    };

    this.host.registerDomEvent(handleEl, "pointerup", onPointerUp);
    this.host.registerDomEvent(handleEl, "pointercancel", onPointerCancel);
  }

  setupToolbarResize(handleEl: HTMLElement): void {
    this.host.registerDomEvent(handleEl, "dblclick", (e: MouseEvent) => {
      e.stopPropagation();
      this.host.updateLayoutConfig({ maxWidth: null, wrap: false });
    });

    this.host.registerDomEvent(handleEl, "pointerdown", (e: PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      this.isResizingDock = true;
      this.resizeStartX = e.clientX;
      this.resizeStartWidth = this.host.getToolbarEl().getBoundingClientRect().width;
      this.resizeStartScale = this.host.getLayoutConfig().scale;
      this.resizeDragWidth = null;
      this.resizeDragScale = null;
      this.host.getWrapperEl().addClass("is-dock-resizing");
      this.capturePointer(handleEl, e.pointerId);
    });

    const minResizeWidth = 220;
    const minMaxAllowedWidth = 240;
    const parentHorizontalPadding = 32;
    const defaultParentWidth = 1000;
    const scaleDragSpanPx = 180;
    const scaleRoundSteps = 20;

    this.host.registerDomEvent(handleEl, "pointermove", (e: PointerEvent) => {
      if (!this.isResizingDock) {
        return;
      }
      e.stopPropagation();
      e.preventDefault();

      const layoutConfig = this.host.getLayoutConfig();
      if (e.shiftKey) {
        const dx = e.clientX - this.resizeStartX;
        const nextScale =
          Math.round(
            Math.min(TOOLBAR_MAX_SCALE, Math.max(TOOLBAR_MIN_SCALE, this.resizeStartScale + dx / scaleDragSpanPx)) *
              scaleRoundSteps
          ) / scaleRoundSteps;
        this.resizeDragScale = nextScale;
        this.host.applyLayoutConfig({
          ...layoutConfig,
          scale: nextScale
        });
        handleEl.setAttribute("data-resize-width", `${Math.round(nextScale * 100)}%`);
        return;
      }

      const wrapperEl = this.host.getWrapperEl();
      const wrapperRect = wrapperEl.getBoundingClientRect();
      const parentWidth = wrapperEl.parentElement?.getBoundingClientRect().width ?? defaultParentWidth;
      const maxAllowed = Math.max(minMaxAllowedWidth, Math.round(parentWidth - parentHorizontalPadding));
      const placement = this.host.getPlacement();
      const isCentered = placement === "top" || placement === "bottom";

      let nextWidth: number;
      if (isCentered && wrapperRect.width > 0) {
        const centerX = (wrapperRect.left + wrapperRect.right) / 2;
        nextWidth = Math.round(Math.max(minResizeWidth, Math.min(maxAllowed, Math.abs(e.clientX - centerX) * 2)));
      } else {
        const dx = e.clientX - this.resizeStartX;
        const isRightSide = placement === "right";
        const deltaFactor = isRightSide ? -1 : 1;
        nextWidth = Math.round(Math.max(minResizeWidth, Math.min(maxAllowed, this.resizeStartWidth + dx * deltaFactor)));
      }

      this.resizeDragWidth = nextWidth;
      this.host.applyLayoutConfig({
        ...layoutConfig,
        maxWidth: nextWidth,
        wrap: true
      });
      handleEl.setAttribute("data-resize-width", `${nextWidth}px`);
    });

    const onResizeEnd = (e: PointerEvent) => {
      if (!this.isResizingDock) {
        return;
      }
      this.isResizingDock = false;
      this.host.getWrapperEl().removeClass("is-dock-resizing");
      handleEl.removeAttribute("data-resize-width");
      this.releasePointer(handleEl, e.pointerId);

      if (this.resizeDragScale !== null) {
        const committedScale = this.resizeDragScale;
        this.resizeDragScale = null;
        this.host.updateLayoutConfig({ scale: committedScale });
      }
      if (this.resizeDragWidth !== null) {
        const committedWidth = Math.round(this.resizeDragWidth);
        this.resizeDragWidth = null;
        this.host.updateLayoutConfig({ maxWidth: committedWidth, wrap: true });
      }
    };

    this.host.registerDomEvent(handleEl, "pointerup", onResizeEnd);
    this.host.registerDomEvent(handleEl, "pointercancel", onResizeEnd);
  }

  private capturePointer(el: HTMLElement, pointerId: number): void {
    if (typeof el.setPointerCapture !== "function") {
      return;
    }
    try {
      el.setPointerCapture(pointerId);
    } catch (err) {
      console.warn("Failed to capture toolbar pointer", err);
    }
  }

  private releasePointer(el: HTMLElement, pointerId: number): void {
    if (typeof el.releasePointerCapture !== "function") {
      return;
    }
    if (typeof el.hasPointerCapture === "function" && !el.hasPointerCapture(pointerId)) {
      return;
    }
    try {
      el.releasePointerCapture(pointerId);
    } catch (err) {
      console.warn("Failed to release toolbar pointer", err);
    }
  }
}
