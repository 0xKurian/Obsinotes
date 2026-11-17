import { StrokeObject } from "../types";
import { StrokeGeometry } from "../ink/StrokeGeometry";

export class TessellationScheduler {
  private queue: StrokeObject[] = [];
  private scheduledIds: Set<string> = new Set();
  private idleHandle: number | null = null;
  private isUsingIdleCallback: boolean = false;
  private readonly frameBudgetMs: number = 4;

  scheduleStrokes(strokes: StrokeObject[]): void {
    let added = false;
    for (const stroke of strokes) {
      if (stroke.id === "active" || stroke.points.length === 0) {
        continue;
      }
      if (StrokeGeometry.hasCachedGeometry(stroke) || this.scheduledIds.has(stroke.id)) {
        continue;
      }
      this.scheduledIds.add(stroke.id);
      this.queue.push(stroke);
      added = true;
    }

    if (added && this.idleHandle === null) {
      this.scheduleNextBatch();
    }
  }

  cancelAll(): void {
    if (this.idleHandle !== null) {
      if (this.isUsingIdleCallback && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        (window as Window & { cancelIdleCallback(id: number): void }).cancelIdleCallback(this.idleHandle);
      } else if (typeof window !== "undefined") {
        window.clearTimeout(this.idleHandle);
      }
      this.idleHandle = null;
    }
    this.queue = [];
    this.scheduledIds.clear();
  }

  getPendingCount(): number {
    return this.queue.length;
  }

  private scheduleNextBatch(): void {
    if (typeof window === "undefined") {
      this.processBatchSync(this.queue.length);
      return;
    }

    const winWithIdle = window as Window & {
      requestIdleCallback?: (cb: (deadline: { timeRemaining: () => number }) => void, opts?: { timeout: number }) => number;
    };

    if (typeof winWithIdle.requestIdleCallback === "function") {
      this.isUsingIdleCallback = true;
      this.idleHandle = winWithIdle.requestIdleCallback(
        (deadline) => {
          this.idleHandle = null;
          this.processUntilBudget(deadline);
        },
        { timeout: 120 }
      );
    } else {
      this.isUsingIdleCallback = false;
      this.idleHandle = window.setTimeout(() => {
        this.idleHandle = null;
        this.processUntilBudget();
      }, 16);
    }
  }

  private processUntilBudget(deadline?: { timeRemaining: () => number }): void {
    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    while (this.queue.length > 0) {
      const stroke = this.queue.shift();
      if (stroke) {
        this.scheduledIds.delete(stroke.id);
        if (!StrokeGeometry.hasCachedGeometry(stroke)) {
          StrokeGeometry.getCachedGeometry(stroke);
        }
      }
      const remaining = deadline ? deadline.timeRemaining() : this.frameBudgetMs - ((typeof performance !== "undefined" ? performance.now() : Date.now()) - start);
      if (remaining <= 0.5) {
        break;
      }
    }

    if (this.queue.length > 0) {
      this.scheduleNextBatch();
    }
  }

  private processBatchSync(limit: number): void {
    let processed = 0;
    while (this.queue.length > 0 && processed < limit) {
      const stroke = this.queue.shift();
      if (stroke) {
        this.scheduledIds.delete(stroke.id);
        if (!StrokeGeometry.hasCachedGeometry(stroke)) {
          StrokeGeometry.getCachedGeometry(stroke);
        }
      }
      processed++;
    }
  }
}
