import type { App } from "obsidian";
import { ImageObject, PageData } from "../types";

export interface ImageControllerCallbacks {
  onImageAdded: (page: PageData, image: ImageObject) => void;
  onImageModified: (page: PageData, prevImage: ImageObject, nextImage: ImageObject) => void;
  onImageDeleted: (page: PageData, imageId: string) => void;
  getActiveTool?: () => string;
  canInteractWithDomObjects?: () => boolean;
}

export class ImageController {
  callbacks: ImageControllerCallbacks;
  private app: App;
  private selectedImageId: string | null = null;
  private activeSessionCleanup: (() => void) | null = null;

  constructor(app: App, callbacks: ImageControllerCallbacks) {
    this.app = app;
    this.callbacks = callbacks;
  }

  destroy(): void {
    this.activeSessionCleanup?.();
    this.activeSessionCleanup = null;
    this.selectedImageId = null;
  }

  getSelectedImageId(): string | null {
    return this.selectedImageId;
  }

  deselectImage(): void {
    this.selectedImageId = null;
  }

  selectImage(imageId: string | null): void {
    this.selectedImageId = imageId;
  }

  static async getImageNaturalDimensions(
    src: string
  ): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          width: img.naturalWidth || 300,
          height: img.naturalHeight || 200
        });
      };
      img.onerror = () => {
        resolve({ width: 300, height: 200 });
      };
      img.src = src;
    });
  }

  static calculateFittedDimensions(
    naturalWidth: number,
    naturalHeight: number,
    maxWidth = 400,
    maxHeight = 400
  ): { width: number; height: number } {
    if (naturalWidth <= 0 || naturalHeight <= 0) {
      return { width: 300, height: 200 };
    }
    const ratio = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1);
    return {
      width: Math.max(40, Math.round(naturalWidth * ratio)),
      height: Math.max(30, Math.round(naturalHeight * ratio))
    };
  }

  renderPageImages(
    page: PageData,
    pageEl: HTMLElement,
    getResourcePath: (vaultPath: string) => string
  ): void {
    this.activeSessionCleanup?.();
    this.activeSessionCleanup = null;
    let layer = pageEl.querySelector<HTMLElement>(".notepages-image-layer");
    if (!layer) {
      layer = pageEl.createDiv({ cls: "notepages-image-layer" });
    } else {
      if (typeof (layer as { empty?: () => void }).empty === "function") {
        (layer as { empty: () => void }).empty();
      } else {
        while (layer.firstChild) {
          layer.removeChild(layer.firstChild);
        }
      }
    }

    if (!Array.isArray(page.images)) {
      return;
    }

    const activeTool = this.callbacks.getActiveTool ? this.callbacks.getActiveTool() : "";
    const canInteract = this.callbacks.canInteractWithDomObjects
      ? this.callbacks.canInteractWithDomObjects()
      : activeTool === "select" || activeTool === "image";
    const isDrawingTool =
      !canInteract &&
      (activeTool === "pen" ||
        activeTool === "pressure" ||
        activeTool === "fountain" ||
        activeTool === "pencil" ||
        activeTool === "highlighter" ||
        activeTool === "eraser" ||
        activeTool === "shape" ||
        activeTool === "connector" ||
        activeTool === "text" ||
        activeTool === "sticky" ||
        activeTool === "lasso");

    page.images.forEach((img) => {
      const isSelected = this.selectedImageId === img.id;
      const frame = createDiv({
        cls: isSelected ? "notepages-image-frame is-selected" : "notepages-image-frame"
      });
      frame.dataset.imageId = img.id;
      frame.setCssStyles({
        left: `${img.x}px`,
        top: `${img.y}px`,
        width: `${img.width}px`,
        height: `${img.height}px`,
        pointerEvents: isDrawingTool ? "none" : "auto",
        transform: img.rotation ? `rotate(${img.rotation}deg)` : undefined,
        opacity: typeof img.opacity === "number" ? String(img.opacity) : undefined
      });

      const imgEl = frame.createEl("img", { cls: "notepages-image-content" });
      imgEl.draggable = false;
      imgEl.loading = "lazy";
      imgEl.decoding = "async";
      imgEl.addEventListener("error", () => {
        frame.addClass("is-broken");
        imgEl.setAttribute("alt", `Missing image: ${img.vaultPath}`);
      });
      imgEl.src = getResourcePath(img.vaultPath);

      if (isSelected && !isDrawingTool) {
        const handles: ("nw" | "ne" | "se" | "sw")[] = ["nw", "ne", "se", "sw"];
        handles.forEach((pos) => {
          const handle = frame.createDiv({
            cls: `notepages-image-handle notepages-image-handle-${pos}`
          });
          handle.dataset.handle = pos;
        });

        const delBtn = frame.createEl("button", {
          cls: "notepages-image-delete-btn",
          text: "✕",
          title: "Delete image"
        });
        delBtn.addEventListener("pointerdown", (e: PointerEvent) => {
          e.stopPropagation();
        });
        delBtn.addEventListener("click", (e: MouseEvent) => {
          e.stopPropagation();
          this.selectedImageId = null;
          this.callbacks.onImageDeleted(page, img.id);
        });
        frame.appendChild(delBtn);
      }

      frame.addEventListener("pointerdown", (e: PointerEvent) => {
        if (isDrawingTool || e.button !== 0) {
          return;
        }

        const target = e.target as HTMLElement;
        const handleType = target.dataset.handle as "nw" | "ne" | "se" | "sw" | undefined;

        if (handleType) {
          e.stopPropagation();
          try {
            target.setPointerCapture(e.pointerId);
          } catch (err) {
            void err;
          }

          const startClientX = e.clientX;
          const startClientY = e.clientY;
          const initX = img.x;
          const initY = img.y;
          const initW = img.width;
          const initH = img.height;
          const aspectRatio = initW / Math.max(1, initH);

          const rect = pageEl.getBoundingClientRect();
          const scaleX = page.dimensions.width / rect.width;
          const scaleY = page.dimensions.height / rect.height;

          let currentX = initX;
          let currentY = initY;
          let currentW = initW;
          let currentH = initH;
          const activePointerId = e.pointerId;
          let cleanedUp = false;

          const onPointerMove = (moveEv: PointerEvent) => {
            if (moveEv.pointerId !== activePointerId) {
              return;
            }
            const dx = (moveEv.clientX - startClientX) * scaleX;
            const dy = (moveEv.clientY - startClientY) * scaleY;

            if (handleType === "se") {
              const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy * aspectRatio;
              currentW = Math.max(40, initW + delta);
              currentH = Math.max(30, Math.round(currentW / aspectRatio));
              if (initX + currentW > page.dimensions.width) {
                currentW = page.dimensions.width - initX;
                currentH = Math.max(30, Math.round(currentW / aspectRatio));
              }
              if (initY + currentH > page.dimensions.height) {
                currentH = page.dimensions.height - initY;
                currentW = Math.max(40, Math.round(currentH * aspectRatio));
              }
              currentX = initX;
              currentY = initY;
            } else if (handleType === "sw") {
              const delta = Math.abs(dx) > Math.abs(dy) ? -dx : dy * aspectRatio;
              currentW = Math.max(40, initW + delta);
              currentH = Math.max(30, Math.round(currentW / aspectRatio));
              currentX = initX + (initW - currentW);
              if (currentX < 0) {
                currentX = 0;
                currentW = initX + initW;
                currentH = Math.max(30, Math.round(currentW / aspectRatio));
              }
              if (initY + currentH > page.dimensions.height) {
                currentH = page.dimensions.height - initY;
                currentW = Math.max(40, Math.round(currentH * aspectRatio));
                currentX = initX + (initW - currentW);
              }
              currentY = initY;
            } else if (handleType === "ne") {
              const delta = Math.abs(dx) > Math.abs(dy) ? dx : -dy * aspectRatio;
              currentW = Math.max(40, initW + delta);
              currentH = Math.max(30, Math.round(currentW / aspectRatio));
              currentY = initY + (initH - currentH);
              if (initX + currentW > page.dimensions.width) {
                currentW = page.dimensions.width - initX;
                currentH = Math.max(30, Math.round(currentW / aspectRatio));
                currentY = initY + (initH - currentH);
              }
              if (currentY < 0) {
                currentY = 0;
                currentH = initY + initH;
                currentW = Math.max(40, Math.round(currentH * aspectRatio));
              }
              currentX = initX;
            } else if (handleType === "nw") {
              const delta = Math.abs(dx) > Math.abs(dy) ? -dx : -dy * aspectRatio;
              currentW = Math.max(40, initW + delta);
              currentH = Math.max(30, Math.round(currentW / aspectRatio));
              currentX = initX + (initW - currentW);
              currentY = initY + (initH - currentH);
              if (currentX < 0) {
                currentX = 0;
                currentW = initX + initW;
                currentH = Math.max(30, Math.round(currentW / aspectRatio));
                currentY = initY + (initH - currentH);
              }
              if (currentY < 0) {
                currentY = 0;
                currentH = initY + initH;
                currentW = Math.max(40, Math.round(currentH * aspectRatio));
                currentX = initX + (initW - currentW);
              }
            }

            frame.style.left = `${currentX}px`;
            frame.style.top = `${currentY}px`;
            frame.style.width = `${currentW}px`;
            frame.style.height = `${currentH}px`;
          };

          const finishResize = (commit: boolean) => {
            if (cleanedUp) {
              return;
            }
            cleanedUp = true;
            try {
              target.releasePointerCapture(activePointerId);
            } catch (err) {
              void err;
            }
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
            window.removeEventListener("pointercancel", onPointerCancel);
            window.removeEventListener("blur", onBlur);
            if (this.activeSessionCleanup === abortResize) {
              this.activeSessionCleanup = null;
            }

            if (
              commit &&
              (currentW !== initW ||
                currentH !== initH ||
                currentX !== initX ||
                currentY !== initY)
            ) {
              const prevImg: ImageObject = { ...img };
              img.x = currentX;
              img.y = currentY;
              img.width = currentW;
              img.height = currentH;
              img.bounds = {
                minX: currentX,
                minY: currentY,
                maxX: currentX + currentW,
                maxY: currentY + currentH
              };
              this.callbacks.onImageModified(page, prevImg, { ...img });
            }
          };

          const onPointerUp = (upEv: PointerEvent) => {
            if (upEv.pointerId !== activePointerId) {
              return;
            }
            finishResize(true);
          };
          const onPointerCancel = (cancelEv: PointerEvent) => {
            if (cancelEv.pointerId !== activePointerId) {
              return;
            }
            finishResize(false);
          };
          const onBlur = () => finishResize(false);
          const abortResize = () => finishResize(false);

          this.activeSessionCleanup?.();
          this.activeSessionCleanup = abortResize;

          window.addEventListener("pointermove", onPointerMove);
          window.addEventListener("pointerup", onPointerUp);
          window.addEventListener("pointercancel", onPointerCancel);
          window.addEventListener("blur", onBlur);
          return;
        }

        e.stopPropagation();

        if (this.selectedImageId !== img.id) {
          this.selectedImageId = img.id;
          this.renderPageImages(page, pageEl, getResourcePath);
          return;
        }

        try {
          frame.setPointerCapture(e.pointerId);
        } catch (err) {
          void err;
        }

        const startClientX = e.clientX;
        const startClientY = e.clientY;
        const initX = img.x;
        const initY = img.y;

        const rect = pageEl.getBoundingClientRect();
        const scaleX = page.dimensions.width / rect.width;
        const scaleY = page.dimensions.height / rect.height;

        let currentX = initX;
        let currentY = initY;
        const activePointerId = e.pointerId;
        let cleanedUp = false;

        const onDragMove = (moveEv: PointerEvent) => {
          if (moveEv.pointerId !== activePointerId) {
            return;
          }
          const dx = (moveEv.clientX - startClientX) * scaleX;
          const dy = (moveEv.clientY - startClientY) * scaleY;
          currentX = Math.max(0, Math.min(initX + dx, page.dimensions.width - img.width));
          currentY = Math.max(0, Math.min(initY + dy, page.dimensions.height - img.height));
          frame.style.left = `${currentX}px`;
          frame.style.top = `${currentY}px`;
        };

        const finishDrag = (commit: boolean) => {
          if (cleanedUp) {
            return;
          }
          cleanedUp = true;
          try {
            frame.releasePointerCapture(activePointerId);
          } catch (err) {
            void err;
          }
          window.removeEventListener("pointermove", onDragMove);
          window.removeEventListener("pointerup", onDragUp);
          window.removeEventListener("pointercancel", onDragCancel);
          window.removeEventListener("blur", onDragBlur);
          if (this.activeSessionCleanup === abortDrag) {
            this.activeSessionCleanup = null;
          }

          if (commit && (currentX !== initX || currentY !== initY)) {
            const prevImg: ImageObject = { ...img };
            img.x = currentX;
            img.y = currentY;
            img.bounds = {
              minX: currentX,
              minY: currentY,
              maxX: currentX + img.width,
              maxY: currentY + img.height
            };
            this.callbacks.onImageModified(page, prevImg, { ...img });
          }
        };

        const onDragUp = (upEv: PointerEvent) => {
          if (upEv.pointerId !== activePointerId) {
            return;
          }
          finishDrag(true);
        };
        const onDragCancel = (cancelEv: PointerEvent) => {
          if (cancelEv.pointerId !== activePointerId) {
            return;
          }
          finishDrag(false);
        };
        const onDragBlur = () => finishDrag(false);
        const abortDrag = () => finishDrag(false);

        this.activeSessionCleanup?.();
        this.activeSessionCleanup = abortDrag;

        window.addEventListener("pointermove", onDragMove);
        window.addEventListener("pointerup", onDragUp);
        window.addEventListener("pointercancel", onDragCancel);
        window.addEventListener("blur", onDragBlur);
      });

      if (layer) {
        layer.appendChild(frame);
      }
    });
  }

  createImageObject(
    vaultPath: string,
    x: number,
    y: number,
    width = 300,
    height = 200
  ): ImageObject {
    const id = `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      id,
      elementType: "image",
      assetId: vaultPath,
      vaultPath,
      x,
      y,
      width,
      height,
      rotation: 0,
      opacity: 1,
      bounds: {
        minX: x,
        minY: y,
        maxX: x + width,
        maxY: y + height
      }
    };
  }

  private static getExtensionFromMime(mime: string): string {
    const lower = (mime || "").toLowerCase();
    if (lower.includes("png")) return "png";
    if (lower.includes("webp")) return "webp";
    if (lower.includes("gif")) return "gif";
    if (lower.includes("svg")) return "svg";
    if (lower.includes("bmp")) return "bmp";
    return "jpg";
  }

  async saveBlobToVault(blob: Blob, baseName: string, sourcePath: string): Promise<string> {
    const buffer = await blob.arrayBuffer();
    const folder = "attachments";
    const ext = ImageController.getExtensionFromMime(blob.type);
    if (this.app.fileManager && this.app.fileManager.getAvailablePathForAttachment) {
      try {
        const availablePath = await this.app.fileManager.getAvailablePathForAttachment(
          `${baseName}.${ext}`,
          sourcePath
        );
        await this.app.vault.createBinary(availablePath, buffer);
        return availablePath;
      } catch (err) {
        void err;
      }
    }

    const adapter = this.app.vault.adapter;
    if (adapter && !(await adapter.exists(folder))) {
      if (adapter.mkdir) {
        await adapter.mkdir(folder);
      }
    }

    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const targetPath = `${folder}/${baseName}_${uniqueSuffix}.${ext}`;
    await this.app.vault.createBinary(targetPath, buffer);
    return targetPath;
  }
}
