import { ToolbarLayoutConfig, ToolbarPlacement } from "../../types";

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

  constructor(host: ToolbarDragResizeHost) {
    this.host = host;
  }

  setupToolbarDrag(handleEl: HTMLElement): void {
    this.host.registerDomEvent(handleEl, "pointerdown", (e: PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const wrapperEl = this.host.getWrapperEl();
      const dockEl = this.host.getToolbarEl();
      this.isDraggingDock = true;
      this.dragDockMoved = false;
      this.dragDockStartX = e.clientX;
      this.dragDockStartY = e.clientY;
      const rect =
        typeof dockEl.getBoundingClientRect === "function"
          ? dockEl.getBoundingClientRect()
          : { left: wrapperEl.offsetLeft || 0, top: wrapperEl.offsetTop || 0 };
      const parentRect =
        typeof wrapperEl.parentElement?.getBoundingClientRect === "function"
          ? wrapperEl.parentElement.getBoundingClientRect()
          : { left: 0, top: 0 };
      this.dragDockInitLeft = rect.left - parentRect.left;
      this.dragDockInitTop = rect.top - parentRect.top;

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
        this.host.getWrapperEl().addClass("is-dock-dragging");
      }
      if (!this.dragDockMoved) {
        return;
      }

      const wrapperEl = this.host.getWrapperEl();
      const dockEl = this.host.getToolbarEl();
      const dockRect =
        typeof dockEl.getBoundingClientRect === "function"
          ? dockEl.getBoundingClientRect()
          : { width: 0, height: 0 };
      const parentRect =
        typeof wrapperEl.parentElement?.getBoundingClientRect === "function"
          ? wrapperEl.parentElement.getBoundingClientRect()
          : undefined;
      const maxLeft = parentRect ? Math.max(0, parentRect.width - dockRect.width) : Infinity;
      const maxTop = parentRect ? Math.max(0, parentRect.height - dockRect.height) : Infinity;
      const newLeft = Math.max(0, Math.min(maxLeft, this.dragDockInitLeft + dx));
      const newTop = Math.max(0, Math.min(maxTop, this.dragDockInitTop + dy));

      wrapperEl.setCssStyles({
        left: `${newLeft}px`,
        top: `${newTop}px`,
        right: "auto",
        bottom: "auto",
        transform: "none"
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
        : (typeof window !== "undefined" ? window.innerHeight : 800) - rect.bottom;
      const leftDist = parentRect ? rect.left - parentRect.left : rect.left;
      const rightDist = parentRect
        ? parentRect.right - rect.right
        : (typeof window !== "undefined" ? window.innerWidth : 1000) - rect.right;

      const edgeSnaps: ReadonlyArray<{ dist: number; placement: ToolbarPlacement }> = [
        { dist: topDist, placement: "top" },
        { dist: bottomDist, placement: "bottom" },
        { dist: leftDist, placement: "left" },
        { dist: rightDist, placement: "right" }
      ];
      let closest = edgeSnaps[0];
      for (const snap of edgeSnaps) {
        if (snap.dist < closest.dist) {
          closest = snap;
        }
      }
      this.host.setPlacement(closest.placement);
      this.host.onSetToolbarFloatingPos?.(null);
    };

    const onPointerCancel = (e: PointerEvent) => {
      if (!this.isDraggingDock) {
        return;
      }
      const wasMoved = this.dragDockMoved;
      this.isDraggingDock = false;
      this.dragDockMoved = false;
      this.host.getWrapperEl().removeClass("is-dock-dragging");
      this.releasePointer(handleEl, e.pointerId);
      if (wasMoved) {
        this.host.setPlacement(this.host.getPlacement(), false);
      }
    };

    this.host.registerDomEvent(handleEl, "pointerup", onPointerUp);
    this.host.registerDomEvent(handleEl, "pointercancel", onPointerCancel);
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
