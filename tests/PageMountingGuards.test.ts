import { test, describe } from "node:test";
import assert from "node:assert";
import { PageVirtualizer, PageVirtualizerDelegate } from "../src/performance/PageVirtualizer";

describe("Page Mounting and Virtualization Guards", () => {
  test("observePage respects isMounted parameter so culled pages get mounted on scroll", () => {
    const mounted: number[] = [];
    const unmounted: number[] = [];

    const delegate: PageVirtualizerDelegate = {
      getTotalPages: () => 10,
      mountPageCanvases: (p) => mounted.push(p),
      unmountPageCanvases: (p) => unmounted.push(p)
    };

    const virtualizer = new PageVirtualizer(delegate, {
      virtualizationThreshold: 4,
      bufferPages: 1
    });

    // Simulate pages 1-3 mounted, pages 4-10 unmounted (1x1)
    for (let p = 1; p <= 10; p++) {
      const fakeEl = { dataset: { pageNumber: String(p) } } as unknown as HTMLElement;
      const isInitiallyMounted = p <= 3;
      virtualizer.observePage(p, fakeEl, isInitiallyMounted);
    }

    // Initially, only pages 1, 2, 3 are mounted
    assert.deepStrictEqual(virtualizer.getMountedPages(), [1, 2, 3]);
    assert.ok(virtualizer.getCulledPages().includes(4));
    assert.ok(virtualizer.getCulledPages().includes(5));

    // Now simulate scrolling to page 4
    const fakeEntries: IntersectionObserverEntry[] = [
      {
        target: { dataset: { pageNumber: "4" } } as unknown as Element,
        isIntersecting: true
      } as IntersectionObserverEntry
    ];

    (virtualizer as unknown as { handleIntersectionEntries: (entries: IntersectionObserverEntry[]) => void })
      .handleIntersectionEntries(fakeEntries);

    // Page 4 must have been mounted!
    assert.ok(mounted.includes(4), "Page 4 must be mounted when scrolled into view");
    assert.ok(virtualizer.isPageMounted(4), "Virtualizer state must register Page 4 as mounted");
  });

  test("markPageMounted and markPageUnmounted synchronize state cleanly", () => {
    const delegate: PageVirtualizerDelegate = {
      getTotalPages: () => 6,
      mountPageCanvases: () => {},
      unmountPageCanvases: () => {}
    };

    const virtualizer = new PageVirtualizer(delegate, { virtualizationThreshold: 4 });
    for (let p = 1; p <= 6; p++) {
      const fakeEl = { dataset: { pageNumber: String(p) } } as unknown as HTMLElement;
      virtualizer.observePage(p, fakeEl, false);
    }

    assert.strictEqual(virtualizer.getMountedPages().length, 0);

    virtualizer.markPageMounted(5);
    assert.ok(virtualizer.isPageMounted(5));
    assert.deepStrictEqual(virtualizer.getMountedPages(), [5]);

    virtualizer.markPageUnmounted(5);
    assert.ok(!virtualizer.isPageMounted(5));
    assert.strictEqual(virtualizer.getMountedPages().length, 0);
  });
});
