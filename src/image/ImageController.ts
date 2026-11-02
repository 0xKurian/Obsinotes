import type { App } from "obsidian";
import { ImageObject, PageData } from "../types";

export interface ImageControllerCallbacks {
  onImageAdded: (page: PageData, image: ImageObject) => void;
  onImageModified: (page: PageData, prevImage: ImageObject, nextImage: ImageObject) => void;
  onImageDeleted: (page: PageData, imageId: string) => void;
  getActiveTool?: () => string;
}

export class ImageController {
  callbacks: ImageControllerCallbacks;
  private app: App;
  private selectedImageId: string | null = null;

  constructor(app: App, callbacks: ImageControllerCallbacks) {
    this.app = app;
    this.callbacks = callbacks;
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
    let layer = pageEl.querySelector(".notepages-image-layer") as HTMLElement | null;
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "notepages-image-layer";
      layer.style.position = "absolute";
      layer.style.top = "0";
      layer.style.left = "0";
      layer.style.width = "100%";
      layer.style.height = "100%";
      layer.style.pointerEvents = "none";
      layer.style.zIndex = "3";
      pageEl.appendChild(layer);
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
    const isDrawingTool =
      activeTool === "pen" ||
      activeTool === "pressure" ||
      activeTool === "fountain" ||
      activeTool === "highlighter" ||
      activeTool === "eraser";

    page.images.forEach((img) => {
      const isSelected = this.selectedImageId === img.id;
      const frame = document.createElement("div");
      frame.className = isSelected
        ? "notepages-image-frame is-selected"
        : "notepages-image-frame";
      frame.dataset.imageId = img.id;
      frame.style.position = "absolute";
      frame.style.left = `${img.x}px`;
      frame.style.top = `${img.y}px`;
      frame.style.width = `${img.width}px`;
      frame.style.height = `${img.height}px`;
      frame.style.pointerEvents = isDrawingTool ? "none" : "auto";
      frame.style.userSelect = "none";
      if (img.rotation) {
        frame.style.transform = `rotate(${img.rotation}deg)`;
      }
      if (typeof img.opacity === "number") {
        frame.style.opacity = String(img.opacity);
      }

      const imgEl = document.createElement("img");
      imgEl.className = "notepages-image-content";
      imgEl.style.width = "100%";
      imgEl.style.height = "100%";
      imgEl.style.objectFit = "contain";
      imgEl.style.pointerEvents = "none";
      imgEl.draggable = false;
      imgEl.src = getResourcePath(img.vaultPath);

      frame.appendChild(imgEl);

      if (isSelected && !isDrawingTool) {
        const handles: ("nw" | "ne" | "se" | "sw")[] = ["nw", "ne", "se", "sw"];
        handles.forEach((pos) => {
          const handle = document.createElement("div");
          handle.className = `notepages-image-handle notepages-image-handle-${pos}`;
          handle.dataset.handle = pos;
          frame.appendChild(handle);
        });

        const delBtn = document.createElement("button");
        delBtn.className = "notepages-image-delete-btn";
        delBtn.textContent = "✕";
        delBtn.setAttribute("title", "Delete image");
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
          } catch {}

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

          const onPointerMove = (moveEv: PointerEvent) => {
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

          const onPointerUp = (upEv: PointerEvent) => {
            try {
              target.releasePointerCapture(upEv.pointerId);
            } catch {}
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);

            if (
              currentW !== initW ||
              currentH !== initH ||
              currentX !== initX ||
              currentY !== initY
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

          window.addEventListener("pointermove", onPointerMove);
          window.addEventListener("pointerup", onPointerUp);
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
        } catch {}

        const startClientX = e.clientX;
        const startClientY = e.clientY;
        const initX = img.x;
        const initY = img.y;

        const rect = pageEl.getBoundingClientRect();
        const scaleX = page.dimensions.width / rect.width;
        const scaleY = page.dimensions.height / rect.height;

        let currentX = initX;
        let currentY = initY;

        const onDragMove = (moveEv: PointerEvent) => {
          const dx = (moveEv.clientX - startClientX) * scaleX;
          const dy = (moveEv.clientY - startClientY) * scaleY;
          currentX = Math.max(0, Math.min(initX + dx, page.dimensions.width - img.width));
          currentY = Math.max(0, Math.min(initY + dy, page.dimensions.height - img.height));
          frame.style.left = `${currentX}px`;
          frame.style.top = `${currentY}px`;
        };

        const onDragUp = (upEv: PointerEvent) => {
          try {
            frame.releasePointerCapture(upEv.pointerId);
          } catch {}
          window.removeEventListener("pointermove", onDragMove);
          window.removeEventListener("pointerup", onDragUp);

          if (currentX !== initX || currentY !== initY) {
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

        window.addEventListener("pointermove", onDragMove);
        window.addEventListener("pointerup", onDragUp);
      });

      layer!.appendChild(frame);
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

  async saveBlobToVault(blob: Blob, baseName: string, sourcePath: string): Promise<string> {
    const buffer = await blob.arrayBuffer();
    const folder = "attachments";
    if (this.app.fileManager && this.app.fileManager.getAvailablePathForAttachment) {
      try {
        const availablePath = await this.app.fileManager.getAvailablePathForAttachment(
          `${baseName}.${blob.type.includes("png") ? "png" : "jpg"}`,
          sourcePath
        );
        await this.app.vault.createBinary(availablePath, buffer);
        return availablePath;
      } catch {}
    }

    const adapter = this.app.vault.adapter;
    if (adapter && !(await adapter.exists(folder))) {
      if (adapter.mkdir) {
        await adapter.mkdir(folder);
      }
    }

    const ext = blob.type.includes("png") ? "png" : "jpg";
    const targetPath = `${folder}/${baseName}_${Date.now()}.${ext}`;
    await this.app.vault.createBinary(targetPath, buffer);
    return targetPath;
  }
}
