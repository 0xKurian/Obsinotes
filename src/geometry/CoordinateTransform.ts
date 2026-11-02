export interface Point2D {
  x: number;
  y: number;
}

export interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PageLayoutInfo {
  pageId: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export class CoordinateTransform {
  static screenToViewport(screen: Point2D, viewportRect: ViewportRect): Point2D {
    return {
      x: screen.x - viewportRect.left,
      y: screen.y - viewportRect.top
    };
  }

  static viewportToScreen(viewport: Point2D, viewportRect: ViewportRect): Point2D {
    return {
      x: viewport.x + viewportRect.left,
      y: viewport.y + viewportRect.top
    };
  }

  static viewportToWorld(viewport: Point2D, zoom: number, scrollOffset: Point2D): Point2D {
    const safeZoom = zoom <= 0 ? 1 : zoom;
    return {
      x: (viewport.x / safeZoom) + scrollOffset.x,
      y: (viewport.y / safeZoom) + scrollOffset.y
    };
  }

  static worldToViewport(world: Point2D, zoom: number, scrollOffset: Point2D): Point2D {
    const safeZoom = zoom <= 0 ? 1 : zoom;
    return {
      x: (world.x - scrollOffset.x) * safeZoom,
      y: (world.y - scrollOffset.y) * safeZoom
    };
  }

  static worldToPage(world: Point2D, pageLayout: PageLayoutInfo): Point2D {
    return {
      x: world.x - pageLayout.x,
      y: world.y - pageLayout.y
    };
  }

  static pageToWorld(page: Point2D, pageLayout: PageLayoutInfo): Point2D {
    return {
      x: page.x + pageLayout.x,
      y: page.y + pageLayout.y
    };
  }

  static screenToPage(
    screen: Point2D,
    viewportRect: ViewportRect,
    zoom: number,
    scrollOffset: Point2D,
    pageLayout: PageLayoutInfo
  ): Point2D {
    const viewport = this.screenToViewport(screen, viewportRect);
    const world = this.viewportToWorld(viewport, zoom, scrollOffset);
    return this.worldToPage(world, pageLayout);
  }

  static pageToScreen(
    page: Point2D,
    pageLayout: PageLayoutInfo,
    zoom: number,
    scrollOffset: Point2D,
    viewportRect: ViewportRect
  ): Point2D {
    const world = this.pageToWorld(page, pageLayout);
    const viewport = this.worldToViewport(world, zoom, scrollOffset);
    return this.viewportToScreen(viewport, viewportRect);
  }

  static findPageAtWorldPoint(world: Point2D, pageLayouts: PageLayoutInfo[]): PageLayoutInfo | null {
    for (const layout of pageLayouts) {
      if (
        world.x >= layout.x &&
        world.x <= layout.x + layout.width &&
        world.y >= layout.y &&
        world.y <= layout.y + layout.height
      ) {
        return layout;
      }
    }
    return null;
  }

  static findClosestPage(world: Point2D, pageLayouts: PageLayoutInfo[]): PageLayoutInfo | null {
    if (pageLayouts.length === 0) {
      return null;
    }

    let closest = pageLayouts[0];
    let minDistance = Infinity;

    for (const layout of pageLayouts) {
      const centerY = layout.y + layout.height / 2;
      const distance = Math.abs(world.y - centerY);
      if (distance < minDistance) {
        minDistance = distance;
        closest = layout;
      }
    }

    return closest;
  }
}
