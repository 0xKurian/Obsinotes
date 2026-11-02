export interface PerformanceMetrics {
  currentFps: number;
  averageFps: number;
  averageFrameTimeMs: number;
  maxFrameTimeMs: number;
  averagePointerLatencyMs: number;
  maxPointerLatencyMs: number;
  totalEventsProcessed: number;
  totalCoalescedEvents: number;
  activePagesCount: number;
  culledPagesCount: number;
}

export class PerformanceMonitor {
  private frameTimestamps: number[] = [];
  private frameDurations: number[] = [];
  private pointerLatencies: number[] = [];
  private totalEvents: number = 0;
  private totalCoalesced: number = 0;
  private activePages: number = 0;
  private culledPages: number = 0;
  private readonly maxHistorySize: number = 60;
  private lastFrameTimestamp: number = 0;

  recordFrame(durationMs?: number): void {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.frameTimestamps.push(now);

    if (durationMs !== undefined) {
      this.frameDurations.push(durationMs);
    } else if (this.lastFrameTimestamp > 0) {
      this.frameDurations.push(now - this.lastFrameTimestamp);
    }
    this.lastFrameTimestamp = now;

    if (this.frameTimestamps.length > this.maxHistorySize) {
      this.frameTimestamps.shift();
    }
    if (this.frameDurations.length > this.maxHistorySize) {
      this.frameDurations.shift();
    }
  }

  recordPointerEvent(eventTimestamp: number, coalescedCount: number = 1): void {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const latency = Math.max(0, now - eventTimestamp);
    this.pointerLatencies.push(latency);
    this.totalEvents++;
    this.totalCoalesced += Math.max(0, coalescedCount - 1);

    if (this.pointerLatencies.length > this.maxHistorySize) {
      this.pointerLatencies.shift();
    }
  }

  updatePageCounts(active: number, culled: number): void {
    this.activePages = Math.max(0, active);
    this.culledPages = Math.max(0, culled);
  }

  getMetrics(): PerformanceMetrics {
    let currentFps = 60;
    let averageFps = 60;

    if (this.frameTimestamps.length >= 2) {
      const count = this.frameTimestamps.length;
      const latestDelta = this.frameTimestamps[count - 1] - this.frameTimestamps[count - 2];
      if (latestDelta > 0) {
        currentFps = Math.min(144, Math.round(1000 / latestDelta));
      }

      const totalTimespan = this.frameTimestamps[count - 1] - this.frameTimestamps[0];
      if (totalTimespan > 0) {
        averageFps = Math.min(144, Math.round(((count - 1) * 1000) / totalTimespan));
      }
    }

    let averageFrameTimeMs = 16.67;
    let maxFrameTimeMs = 16.67;
    if (this.frameDurations.length > 0) {
      const sum = this.frameDurations.reduce((a, b) => a + b, 0);
      averageFrameTimeMs = Number((sum / this.frameDurations.length).toFixed(2));
      maxFrameTimeMs = Number(Math.max(...this.frameDurations).toFixed(2));
    }

    let averagePointerLatencyMs = 0;
    let maxPointerLatencyMs = 0;
    if (this.pointerLatencies.length > 0) {
      const sum = this.pointerLatencies.reduce((a, b) => a + b, 0);
      averagePointerLatencyMs = Number((sum / this.pointerLatencies.length).toFixed(2));
      maxPointerLatencyMs = Number(Math.max(...this.pointerLatencies).toFixed(2));
    }

    return {
      currentFps,
      averageFps,
      averageFrameTimeMs,
      maxFrameTimeMs,
      averagePointerLatencyMs,
      maxPointerLatencyMs,
      totalEventsProcessed: this.totalEvents,
      totalCoalescedEvents: this.totalCoalesced,
      activePagesCount: this.activePages,
      culledPagesCount: this.culledPages
    };
  }

  reset(): void {
    this.frameTimestamps = [];
    this.frameDurations = [];
    this.pointerLatencies = [];
    this.totalEvents = 0;
    this.totalCoalesced = 0;
    this.activePages = 0;
    this.culledPages = 0;
    this.lastFrameTimestamp = 0;
  }
}
