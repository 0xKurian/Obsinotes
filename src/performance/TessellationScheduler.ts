import { StrokeObject } from "../types";
import { StrokeGeometry } from "../ink/StrokeGeometry";

export class TessellationScheduler {
  private queue: StrokeObject[] = [];
  private queueIndex: number = 0;
  private scheduledIds: Set<string> = new Set();
  private idleHandle: number | null = null;
  private isUsingIdleCallback: boolean = false;
  private readonly frameBudgetMs: number = 4;

  scheduleStrokes(strokes: StrokeObject[]): void {
    let added = false;
    for (const stroke of strokes) {
      if (
        stroke.id === "active" ||
        stroke.points.length === 0 ||
        stroke.strokePattern === "dashed" ||
        stroke.strokePattern === "dotted"
      ) {
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
    this.queueIndex = 0;
    this.scheduledIds.clear();
  }

  getPendingCount(): number {
    return Math.max(0, this.queue.length - this.queueIndex);
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
    while (this.queueIndex < this.queue.length) {
      const stroke = this.queue[this.queueIndex++];
      if (stroke) {
        this.scheduledIds.delete(stroke.id);
        if (!StrokeGeometry.hasCachedGeometry(stroke)) {
          StrokeGeometry.getCachedGeometry(stroke);
        }
      }
      const elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - start;
      const budgetRemaining = this.frameBudgetMs - elapsed;
      const remaining = deadline ? Math.min(deadline.timeRemaining(), budgetRemaining) : budgetRemaining;
      if (remaining <= 0.5) {
        break;
      }
    }

    if (this.queueIndex >= this.queue.length) {
      this.queue = [];
      this.queueIndex = 0;
    } else if (this.queueIndex > 256) {
      this.queue = this.queue.slice(this.queueIndex);
      this.queueIndex = 0;
    }

    if (this.queueIndex < this.queue.length) {
      this.scheduleNextBatch();
    }
  }

  private processBatchSync(limit: number): void {
    let processed = 0;
    while (this.queueIndex < this.queue.length && processed < limit) {
      const stroke = this.queue[this.queueIndex++];
      if (stroke) {
        this.scheduledIds.delete(stroke.id);
        if (!StrokeGeometry.hasCachedGeometry(stroke)) {
          StrokeGeometry.getCachedGeometry(stroke);
        }
      }
      processed++;
    }
    if (this.queueIndex >= this.queue.length) {
      this.queue = [];
      this.queueIndex = 0;
    }
  }
}
