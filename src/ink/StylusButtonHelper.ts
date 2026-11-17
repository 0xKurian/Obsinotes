import { StylusButtonAction, ToolType } from "../types";

export interface StylusPointerSnapshot {
  pointerType: string;
  button: number;
  buttons: number;
}

const PEN_PRIMARY_TIP_MASK = 1;
const PEN_BARREL_SECONDARY_MASK = 2;
const PEN_AUX_MASK = 4;
const PEN_ERASER_MASK = 32;
const PEN_STYLUS_SECONDARY_MASK = 64;
const PEN_BUTTON_MASK =
  PEN_BARREL_SECONDARY_MASK | PEN_AUX_MASK | PEN_ERASER_MASK | PEN_STYLUS_SECONDARY_MASK;
const PEN_CONTEXTMENU_GUARD_MS = 1000;
const LATE_STROKE_TAKEOVER_MS = 150;
const LATE_STROKE_MAX_POINTS = 5;

export function isStylusEraserButtonPressed(e: StylusPointerSnapshot): boolean {
  if (e.pointerType !== "pen") {
    return false;
  }
  return e.button === 1 || e.button === 2 || e.button === 5 || (e.buttons & PEN_BUTTON_MASK) !== 0;
}

export function isStylusSecondaryMaskActive(e: StylusPointerSnapshot): boolean {
  if (e.pointerType !== "pen") {
    return false;
  }
  return (e.buttons & PEN_BUTTON_MASK) !== 0;
}

export class StylusButtonState {
  temporaryEraserTool: ToolType | null = null;
  togglePreviousTool: ToolType | null = null;
  private wasButtonPressed: boolean = false;
  private lastPenEventTimestamp: number = 0;

  recordPointerEvent(pointerType: string, timestamp: number = Date.now()): void {
    if (pointerType === "pen") {
      this.lastPenEventTimestamp = timestamp;
    }
  }

  isRecentPenActivity(withinMs: number = 400, timestamp: number = Date.now()): boolean {
    return this.lastPenEventTimestamp > 0 && timestamp - this.lastPenEventTimestamp < withinMs;
  }

  shouldSuppressContextMenu(
    pointerType: string | undefined,
    isPanning: boolean,
    timestamp: number = Date.now()
  ): boolean {
    if (isPanning || pointerType === "pen" || this.temporaryEraserTool !== null || this.wasButtonPressed) {
      return true;
    }
    return this.isRecentPenActivity(PEN_CONTEXTMENU_GUARD_MS, timestamp);
  }

  clearToggleHistory(): void {
    this.togglePreviousTool = null;
  }

  handleHoverMove(
    e: StylusPointerSnapshot,
    mode: StylusButtonAction,
    currentTool: ToolType,
    isDrawing: boolean
  ): ToolType | null {
    if (e.pointerType !== "pen") {
      return null;
    }
    const buttonPressed = isStylusSecondaryMaskActive(e);
    const tipDown = (e.buttons & PEN_PRIMARY_TIP_MASK) !== 0;
    const risingEdge = buttonPressed && !this.wasButtonPressed;
    this.wasButtonPressed = buttonPressed;

    if (mode === "off" || isDrawing || tipDown) {
      return null;
    }

    if (mode === "hold") {
      if (buttonPressed) {
        if (this.temporaryEraserTool === null && currentTool !== "eraser") {
          this.temporaryEraserTool = currentTool;
          return "eraser";
        }
        return null;
      }
      if (this.temporaryEraserTool !== null) {
        const revertTool = this.temporaryEraserTool;
        this.temporaryEraserTool = null;
        return revertTool;
      }
      return null;
    }

    if (risingEdge) {
      return this.toggleEraser(currentTool);
    }

    return null;
  }

  private toggleEraser(currentTool: ToolType): ToolType {
    if (currentTool !== "eraser") {
      this.togglePreviousTool = currentTool;
      return "eraser";
    }
    const revertTool = this.togglePreviousTool ?? "pressure";
    this.togglePreviousTool = null;
    return revertTool;
  }

  handlePointerDown(
    e: StylusPointerSnapshot,
    mode: StylusButtonAction,
    currentTool: ToolType
  ): ToolType | null {
    if (e.pointerType !== "pen") {
      return null;
    }
    const buttonPressed = isStylusEraserButtonPressed(e);
    const maskActive = isStylusSecondaryMaskActive(e);
    const risingEdge = (buttonPressed || maskActive) && !this.wasButtonPressed;
    this.wasButtonPressed = maskActive || buttonPressed;

    if (mode === "off") {
      return null;
    }

    if (mode === "hold") {
      if (buttonPressed && this.temporaryEraserTool === null && currentTool !== "eraser") {
        this.temporaryEraserTool = currentTool;
        return "eraser";
      }
      return null;
    }

    if (risingEdge) {
      return this.toggleEraser(currentTool);
    }

    return null;
  }

  handleActiveStrokeMove(
    e: StylusPointerSnapshot,
    mode: StylusButtonAction,
    currentTool: ToolType,
    strokeElapsedMs: number,
    pointCount: number
  ): ToolType | null {
    if (e.pointerType !== "pen" || mode === "off" || currentTool === "eraser") {
      return null;
    }
    const buttonPressed = isStylusSecondaryMaskActive(e);
    const risingEdge = buttonPressed && !this.wasButtonPressed;
    this.wasButtonPressed = buttonPressed;
    if (!risingEdge || strokeElapsedMs > LATE_STROKE_TAKEOVER_MS || pointCount > LATE_STROKE_MAX_POINTS) {
      return null;
    }
    if (mode === "hold") {
      if (this.temporaryEraserTool === null) {
        this.temporaryEraserTool = currentTool;
        return "eraser";
      }
      return null;
    }
    return this.toggleEraser(currentTool);
  }

  handlePointerUpOrCancel(
    e: StylusPointerSnapshot | null,
    mode: StylusButtonAction,
    isCancel: boolean = false
  ): ToolType | null {
    const isPenEvent = Boolean(e && e.pointerType === "pen");
    const buttonStillPressed = isPenEvent && e ? isStylusSecondaryMaskActive(e) : false;

    if (isPenEvent) {
      this.wasButtonPressed = isCancel ? false : buttonStillPressed;
    } else if (!e) {
      this.wasButtonPressed = false;
    }

    if (this.temporaryEraserTool !== null) {
      if (!isCancel && mode === "hold" && buttonStillPressed) {
        return null;
      }
      const revertTool = this.temporaryEraserTool;
      this.temporaryEraserTool = null;
      return revertTool;
    }

    return null;
  }

  reset(): void {
    this.temporaryEraserTool = null;
    this.togglePreviousTool = null;
    this.wasButtonPressed = false;
    this.lastPenEventTimestamp = 0;
  }
}
