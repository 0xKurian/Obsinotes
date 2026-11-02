export interface PageVirtualizerDelegate {
  getTotalPages(): number;
  mountPageCanvases(pageNumber: number): void;
  unmountPageCanvases(pageNumber: number): void;
  isPageDrawing?(pageNumber: number): boolean;
}

export interface PageVirtualizerOptions {
  virtualizationThreshold?: number;
  bufferPages?: number;
  rootMargin?: string;
}

export function calculateActivePageWindow(
  visibleStartPage: number,
  visibleEndPage: number,
  totalPages: number,
  bufferPages: number = 1
): { startPage: number; endPage: number } {
  if (totalPages <= 0) {
    return { startPage: 1, endPage: 1 };
  }

  const startPage = Math.max(1, visibleStartPage - bufferPages);
  const endPage = Math.min(totalPages, visibleEndPage + bufferPages);

  return { startPage, endPage };
}

export function computeVisiblePagesFromScroll(
  scrollTop: number,
  viewportHeight: number,
  pageOffsets: { pageNumber: number; top: number; height: number }[]
): { firstVisible: number; lastVisible: number } {
  if (pageOffsets.length === 0) {
    return { firstVisible: 1, lastVisible: 1 };
  }

  const scrollBottom = scrollTop + viewportHeight;
  let firstVisible = pageOffsets[0].pageNumber;
  let lastVisible = pageOffsets[pageOffsets.length - 1].pageNumber;
  let foundFirst = false;

  for (const page of pageOffsets) {
    const pageBottom = page.top + page.height;
    const isVisible = pageBottom >= scrollTop && page.top <= scrollBottom;

    if (isVisible) {
      if (!foundFirst) {
        firstVisible = page.pageNumber;
        foundFirst = true;
      }
      lastVisible = page.pageNumber;
    }
  }

  return { firstVisible, lastVisible };
}

export class PageVirtualizer {
  private delegate: PageVirtualizerDelegate;
  private virtualizationThreshold: number;
  private bufferPages: number;
  private rootMargin: string;
  private observer: IntersectionObserver | null = null;
  private observedElements: Map<number, HTMLElement> = new Map();
  private intersectingPages: Set<number> = new Set();
  private mountedPages: Set<number> = new Set();

  constructor(
    delegate: PageVirtualizerDelegate,
    options: PageVirtualizerOptions = {}
  ) {
    this.delegate = delegate;
    this.virtualizationThreshold = options.virtualizationThreshold ?? 4;
    this.bufferPages = options.bufferPages ?? 1;
    this.rootMargin = options.rootMargin ?? "600px 0px 600px 0px";
  }

  initialize(rootElement?: HTMLElement | null): void {
    if (typeof IntersectionObserver === "undefined") {
      return;
    }

    this.destroy();

    this.observer = new IntersectionObserver(
      (entries) => {
        this.handleIntersectionEntries(entries);
      },
      {
        root: rootElement ?? null,
        rootMargin: this.rootMargin,
        threshold: 0.01
      }
    );

    for (const el of this.observedElements.values()) {
      this.observer.observe(el);
    }
  }

  observePage(pageNumber: number, element: HTMLElement): void {
    this.observedElements.set(pageNumber, element);
    this.mountedPages.add(pageNumber);

    if (this.observer) {
      this.observer.observe(element);
    }
  }

  unobservePage(pageNumber: number): void {
    const el = this.observedElements.get(pageNumber);
    if (el && this.observer) {
      this.observer.unobserve(el);
    }
    this.observedElements.delete(pageNumber);
    this.intersectingPages.delete(pageNumber);
    this.mountedPages.delete(pageNumber);
  }

  private handleIntersectionEntries(entries: IntersectionObserverEntry[]): void {
    let stateChanged = false;

    for (const entry of entries) {
      const target = entry.target as HTMLElement;
      const pageNumStr = target.dataset.pageNumber;
      if (!pageNumStr) {
        continue;
      }
      const pageNum = parseInt(pageNumStr, 10);
      if (isNaN(pageNum)) {
        continue;
      }

      if (entry.isIntersecting) {
        if (!this.intersectingPages.has(pageNum)) {
          this.intersectingPages.add(pageNum);
          stateChanged = true;
        }
      } else {
        if (this.intersectingPages.has(pageNum)) {
          this.intersectingPages.delete(pageNum);
          stateChanged = true;
        }
      }
    }

    if (stateChanged) {
      this.updateVirtualization();
    }
  }

  updateVirtualization(): void {
    const totalPages = this.delegate.getTotalPages();

    if (totalPages <= this.virtualizationThreshold) {
      for (let p = 1; p <= totalPages; p++) {
        if (!this.mountedPages.has(p)) {
          this.mountedPages.add(p);
          this.delegate.mountPageCanvases(p);
        }
      }
      return;
    }

    if (this.intersectingPages.size === 0) {
      return;
    }

    const intersectingArray = Array.from(this.intersectingPages);
    const minIntersecting = Math.min(...intersectingArray);
    const maxIntersecting = Math.max(...intersectingArray);

    const activeWindow = calculateActivePageWindow(
      minIntersecting,
      maxIntersecting,
      totalPages,
      this.bufferPages
    );

    const pagesToKeep = new Set<number>();
    for (let p = activeWindow.startPage; p <= activeWindow.endPage; p++) {
      pagesToKeep.add(p);
    }

    for (const p of pagesToKeep) {
      if (!this.mountedPages.has(p)) {
        this.mountedPages.add(p);
        this.delegate.mountPageCanvases(p);
      }
    }

    for (const p of Array.from(this.mountedPages)) {
      if (!pagesToKeep.has(p)) {
        const isDrawing = this.delegate.isPageDrawing?.(p) ?? false;
        if (!isDrawing) {
          this.mountedPages.delete(p);
          this.delegate.unmountPageCanvases(p);
        }
      }
    }
  }

  isPageMounted(pageNumber: number): boolean {
    return this.mountedPages.has(pageNumber);
  }

  getMountedPages(): number[] {
    return Array.from(this.mountedPages).sort((a, b) => a - b);
  }

  getCulledPages(): number[] {
    const totalPages = this.delegate.getTotalPages();
    const culled: number[] = [];
    for (let p = 1; p <= totalPages; p++) {
      if (!this.mountedPages.has(p)) {
        culled.push(p);
      }
    }
    return culled;
  }

  clear(): void {
    if (this.observer) {
      this.observer.disconnect();
    }
    this.observedElements.clear();
    this.intersectingPages.clear();
    this.mountedPages.clear();
  }

  destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.observedElements.clear();
    this.intersectingPages.clear();
    this.mountedPages.clear();
  }
}
