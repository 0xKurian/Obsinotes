import { setIcon } from "obsidian";
import { ToolType } from "../types";

export interface RulerState {
  visible: boolean;
  centerX: number;
  centerY: number;
  angleDeg: number;
  length: number;
  height: number;
}

export interface RulerSnapLock {
  edge: "top" | "bottom";
  originX: number;
  originY: number;
  dirX: number;
  dirY: number;
}

export function normalizeAngleDeg(angleDeg: number): number {
  let a = angleDeg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}

export function snapRulerAngle(rawAngleDeg: number): number {
  const normalized = normalizeAngleDeg(rawAngleDeg);
  const cardinalAngles = [-180, -135, -90, -45, 0, 45, 90, 135, 180];
  for (const target of cardinalAngles) {
    if (Math.abs(normalized - target) <= 3.0) {
      return target === -180 ? 180 : target;
    }
  }
  const nearest15 = Math.round(normalized / 15) * 15;
  if (Math.abs(normalized - nearest15) <= 1.2) {
    return normalizeAngleDeg(nearest15);
  }
  return Math.round(normalized * 10) / 10;
}

export function detectRulerEdgeSnap(
  pointX: number,
  pointY: number,
  ruler: RulerState,
  snapThreshold: number = 18
): { lock: RulerSnapLock; projectedX: number; projectedY: number } | null {
  if (!ruler.visible) {
    return null;
  }

  const rad = (ruler.angleDeg * Math.PI) / 180;
  const dirX = Math.cos(rad);
  const dirY = Math.sin(rad);
  const normalX = -dirY;
  const normalY = dirX;

  const dx = pointX - ruler.centerX;
  const dy = pointY - ruler.centerY;
  const along = dx * dirX + dy * dirY;
  const perp = dx * normalX + dy * normalY;

  const halfLen = ruler.length / 2 + 12;
  if (Math.abs(along) > halfLen) {
    return null;
  }

  const halfH = ruler.height / 2;
  const distTop = Math.abs(perp + halfH);
  const distBottom = Math.abs(perp - halfH);

  let chosenEdge: "top" | "bottom" | null = null;
  let offsetPerp = 0;

  if (distTop <= snapThreshold && distTop <= distBottom) {
    chosenEdge = "top";
    offsetPerp = -halfH;
  } else if (distBottom <= snapThreshold) {
    chosenEdge = "bottom";
    offsetPerp = halfH;
  }

  if (!chosenEdge) {
    return null;
  }

  const originX = ruler.centerX + normalX * offsetPerp;
  const originY = ruler.centerY + normalY * offsetPerp;
  return {
    lock: {
      edge: chosenEdge,
      originX,
      originY,
      dirX,
      dirY
    },
    projectedX: originX + dirX * along,
    projectedY: originY + dirY * along
  };
}

export function projectPointOntoSnapLock(
  pointX: number,
  pointY: number,
  lock: RulerSnapLock
): { x: number; y: number } {
  const dx = pointX - lock.originX;
  const dy = pointY - lock.originY;
  const along = dx * lock.dirX + dy * lock.dirY;
  return {
    x: lock.originX + lock.dirX * along,
    y: lock.originY + lock.dirY * along
  };
}

export interface RulerOverlayHost {
  getPagesContainerEl(): HTMLElement | undefined;
  getScrollerEl(): HTMLElement | undefined;
  getZoomLevel(): number;
  getPageElement(pageNumber: number): HTMLElement | undefined;
  getCurrentPageNumber(): number;
  onVisibilityChanged?(visible: boolean): void;
  registerDomEvent<K extends keyof HTMLElementEventMap>(
    el: HTMLElement | Window,
    type: K,
    callback: (ev: HTMLElementEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions
  ): void;
}

export class RulerOverlayController {
  private host: RulerOverlayHost;
  private rulerEl: HTMLElement | null = null;
  private angleBadgeEl: HTMLElement | null = null;
  private state: RulerState = {
    visible: false,
    centerX: 300,
    centerY: 260,
    angleDeg: 0,
    length: 440,
    height: 52
  };
  private isDraggingMove: boolean = false;
  private isDraggingRotate: boolean = false;
  private rotateCenterClientX: number = 0;
  private rotateCenterClientY: number = 0;
  private windowAbortController: AbortController | null = null;
  private dragStartClientX: number = 0;
  private dragStartClientY: number = 0;
  private dragStartCenterX: number = 0;
  private dragStartCenterY: number = 0;
  private rotateStartPointerAngle: number = 0;
  private rotateStartRulerAngle: number = 0;

  private activeStrokeLocks: Map<string, RulerSnapLock> = new Map();

  constructor(host: RulerOverlayHost) {
    this.host = host;
  }

  isVisible(): boolean {
    return this.state.visible;
  }

  getState(): RulerState {
    return { ...this.state };
  }

  toggle(): boolean {
    if (this.state.visible) {
      this.hide();
    } else {
      this.show();
    }
    return this.state.visible;
  }

  show(): void {
    this.state.visible = true;
    this.positionInVisibleViewport();
    this.ensureDom();
    this.syncDom();
    this.host.onVisibilityChanged?.(true);
  }

  hide(): void {
    this.state.visible = false;
    this.activeStrokeLocks.clear();
    if (this.rulerEl) {
      this.rulerEl.addClass("is-hidden");
      this.rulerEl.toggle(false);
    }
    this.host.onVisibilityChanged?.(false);
  }

  destroy(): void {
    this.activeStrokeLocks.clear();
    this.isDraggingMove = false;
    this.isDraggingRotate = false;
    if (this.windowAbortController) {
      this.windowAbortController.abort();
      this.windowAbortController = null;
    }
    if (this.rulerEl) {
      this.rulerEl.remove();
      this.rulerEl = null;
    }
    this.angleBadgeEl = null;
  }

  static isSnappableTool(tool: ToolType): boolean {
    return (
      tool === "pen" ||
      tool === "pressure" ||
      tool === "fountain" ||
      tool === "pencil" ||
      tool === "highlighter"
    );
  }

  beginStrokeSnap(
    pageId: string,
    pageNumber: number,
    pageX: number,
    pageY: number,
    tool: ToolType
  ): { x: number; y: number } {
    this.activeStrokeLocks.delete(pageId);
    if (!this.state.visible || !RulerOverlayController.isSnappableTool(tool)) {
      return { x: pageX, y: pageY };
    }
    const pageLocalRuler = this.getRulerInPageCoords(pageNumber);
    if (!pageLocalRuler) {
      return { x: pageX, y: pageY };
    }
    const snap = detectRulerEdgeSnap(pageX, pageY, pageLocalRuler);
    if (!snap) {
      return { x: pageX, y: pageY };
    }
    this.activeStrokeLocks.set(pageId, snap.lock);
    return { x: snap.projectedX, y: snap.projectedY };
  }

  projectStrokePoint(pageId: string, pageX: number, pageY: number): { x: number; y: number } {
    const lock = this.activeStrokeLocks.get(pageId);
    if (!lock) {
      return { x: pageX, y: pageY };
    }
    return projectPointOntoSnapLock(pageX, pageY, lock);
  }

  endStrokeSnap(pageId: string): void {
    this.activeStrokeLocks.delete(pageId);
  }

  private getRulerInPageCoords(pageNumber: number): RulerState | null {
    const pagesContainer = this.host.getPagesContainerEl();
    const pageWrapper = this.host.getPageElement(pageNumber);
    const frameEl = pageWrapper?.querySelector<HTMLElement>(".notepages-page-frame");
    if (!pagesContainer || !frameEl) {
      return null;
    }
    const containerRect = pagesContainer.getBoundingClientRect();
    const frameRect = frameEl.getBoundingClientRect();
    const zoom = Math.max(0.1, this.host.getZoomLevel());
    const frameLeft = (frameRect.left - containerRect.left) / zoom;
    const frameTop = (frameRect.top - containerRect.top) / zoom;

    return {
      ...this.state,
      centerX: this.state.centerX - frameLeft,
      centerY: this.state.centerY - frameTop
    };
  }

  private positionInVisibleViewport(): void {
    const pagesContainer = this.host.getPagesContainerEl();
    const scroller = this.host.getScrollerEl();
    if (!pagesContainer || !scroller) {
      return;
    }
    const zoom = Math.max(0.1, this.host.getZoomLevel());
    const scrollerRect = scroller.getBoundingClientRect();
    const containerRect = pagesContainer.getBoundingClientRect();
    if (scrollerRect.width > 0 && scrollerRect.height > 0 && containerRect.width > 0) {
      const viewMidX = scrollerRect.left + scrollerRect.width / 2;
      const viewMidY = scrollerRect.top + scrollerRect.height / 2;
      this.state.centerX = (viewMidX - containerRect.left) / zoom;
      this.state.centerY = (viewMidY - containerRect.top) / zoom;
    }
  }

  private ensureDom(): void {
    const pagesContainer = this.host.getPagesContainerEl();
    if (!pagesContainer) {
      return;
    }
    if (this.rulerEl && this.rulerEl.parentElement === pagesContainer) {
      return;
    }
    if (this.rulerEl) {
      this.rulerEl.remove();
    }

    const rulerEl = pagesContainer.createDiv({
      cls: "notepages-ruler-overlay"
    });
    this.rulerEl = rulerEl;

    const ticksEl = rulerEl.createDiv({ cls: "notepages-ruler-ticks" });
    for (let x = 0; x <= this.state.length; x += 10) {
      const tick = ticksEl.createDiv({
        cls: x % 50 === 0 ? "notepages-ruler-tick is-major" : "notepages-ruler-tick"
      });
      tick.setCssStyles({ left: `${x}px` });
    }

    const controlsEl = rulerEl.createDiv({ cls: "notepages-ruler-controls" });
    this.angleBadgeEl = controlsEl.createSpan({
      cls: "notepages-ruler-angle-badge",
      text: "0.0°"
    });

    const rotateHandle = controlsEl.createEl("button", {
      cls: "notepages-ruler-btn notepages-ruler-rotate-btn",
      title: "Drag to rotate ruler (shift or double-click to reset to 0°)"
    });
    setIcon(rotateHandle, "rotate-cw");

    const closeBtn = controlsEl.createEl("button", {
      cls: "notepages-ruler-btn notepages-ruler-close-btn",
      title: "Hide ruler (u)"
    });
    setIcon(closeBtn, "x");

    this.host.registerDomEvent(closeBtn, "pointerdown", (e: PointerEvent) => {
      e.stopPropagation();
    });
    this.host.registerDomEvent(closeBtn, "click", (e: MouseEvent) => {
      e.stopPropagation();
      this.hide();
    });

    this.host.registerDomEvent(rotateHandle, "dblclick", (e: MouseEvent) => {
      e.stopPropagation();
      this.state.angleDeg = 0;
      this.syncDom();
    });

    this.host.registerDomEvent(rotateHandle, "pointerdown", (e: PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (e.shiftKey) {
        this.state.angleDeg = 0;
        this.syncDom();
        return;
      }
      this.isDraggingRotate = true;
      const rect = rulerEl.getBoundingClientRect();
      this.rotateCenterClientX = (rect.left + rect.right) / 2;
      this.rotateCenterClientY = (rect.top + rect.bottom) / 2;
      this.rotateStartPointerAngle =
        (Math.atan2(e.clientY - this.rotateCenterClientY, e.clientX - this.rotateCenterClientX) * 180) / Math.PI;
      this.rotateStartRulerAngle = this.state.angleDeg;
      this.tryCapture(rotateHandle, e.pointerId);
    });

    this.host.registerDomEvent(rulerEl, "pointerdown", (e: PointerEvent) => {
      if ((e.target as HTMLElement)?.closest(".notepages-ruler-btn")) {
        return;
      }
      e.stopPropagation();
      e.preventDefault();
      this.isDraggingMove = true;
      this.dragStartClientX = e.clientX;
      this.dragStartClientY = e.clientY;
      this.dragStartCenterX = this.state.centerX;
      this.dragStartCenterY = this.state.centerY;
      this.tryCapture(rulerEl, e.pointerId);
    });

    this.host.registerDomEvent(
      rulerEl,
      "wheel",
      (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY > 0 ? 1 : -1;
        this.state.angleDeg = normalizeAngleDeg(this.state.angleDeg + delta * 1.5);
        this.syncDom();
      },
      { passive: false }
    );

    if (typeof window !== "undefined") {
      if (this.windowAbortController) {
        this.windowAbortController.abort();
      }
      this.windowAbortController = typeof AbortController !== "undefined" ? new AbortController() : null;
      const winOpts = this.windowAbortController ? { signal: this.windowAbortController.signal } : undefined;

      window.addEventListener("pointermove", (e: PointerEvent) => {
        if (this.isDraggingMove) {
          const zoom = Math.max(0.1, this.host.getZoomLevel());
          this.state.centerX = this.dragStartCenterX + (e.clientX - this.dragStartClientX) / zoom;
          this.state.centerY = this.dragStartCenterY + (e.clientY - this.dragStartClientY) / zoom;
          this.syncDom();
        } else if (this.isDraggingRotate && this.rulerEl) {
          const curAngle =
            (Math.atan2(e.clientY - this.rotateCenterClientY, e.clientX - this.rotateCenterClientX) * 180) /
            Math.PI;
          const delta = curAngle - this.rotateStartPointerAngle;
          this.state.angleDeg = snapRulerAngle(this.rotateStartRulerAngle + delta);
          this.syncDom();
        }
      }, winOpts);

      const stopDrag = () => {
        this.isDraggingMove = false;
        this.isDraggingRotate = false;
      };
      window.addEventListener("pointerup", stopDrag, winOpts);
      window.addEventListener("pointercancel", stopDrag, winOpts);
      window.addEventListener("blur", stopDrag, winOpts);
    }
  }

  syncDom(): void {
    if (!this.rulerEl) {
      return;
    }
    this.rulerEl.toggleClass("is-hidden", !this.state.visible);
    this.rulerEl.toggle(this.state.visible);
    if (!this.state.visible) {
      return;
    }
    const left = this.state.centerX - this.state.length / 2;
    const top = this.state.centerY - this.state.height / 2;
    this.rulerEl.setCssStyles({
      width: `${this.state.length}px`,
      height: `${this.state.height}px`,
      left: `${left}px`,
      top: `${top}px`,
      transform: `rotate(${this.state.angleDeg}deg)`
    });
    if (this.angleBadgeEl) {
      this.angleBadgeEl.setText(`${this.state.angleDeg.toFixed(1)}°`);
    }
  }

  private tryCapture(el: HTMLElement, pointerId: number): void {
    try {
      el.setPointerCapture(pointerId);
    } catch (err) {
      void err;
    }
  }
}
