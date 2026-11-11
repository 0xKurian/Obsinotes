import { PageData, ImageObject, StrokeObject, TextObject, PageDimensions } from "../types";
import { TemplateRenderer } from "../renderer/TemplateRenderer";
import { ShapeRecognizer } from "../shape/ShapeRecognizer";
import { StrokeGeometry } from "../ink/StrokeGeometry";

export interface PngExportOptions {
  scale?: number;
  includeTemplate?: boolean;
  includePdfBackground?: boolean;
  transparentBackground?: boolean;
  resourceResolver?: (vaultPath: string) => string;
}

export class PngExporter {
  static async renderPageToCanvas(
    page: PageData,
    options: PngExportOptions = {}
  ): Promise<HTMLCanvasElement> {
    const scale = Math.max(0.5, Math.min(6, options.scale ?? 2));
    const width = page.dimensions.width;
    const height = page.dimensions.height;

    const canvas = createEl("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return canvas;
    }

    if (options.transparentBackground) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else if (options.includeTemplate !== false && page.template) {
      TemplateRenderer.renderTemplate(canvas, page.dimensions, page.template);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (typeof ctx.setTransform === "function") {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    }

    if (options.includePdfBackground !== false && page.pdfSource?.svgPath) {
      await this.renderSvgBackgroundToCanvas(ctx, page.pdfSource.svgPath, page.dimensions, options.resourceResolver);
    }

    if (page.images && page.images.length > 0) {
      for (const img of page.images) {
        await this.renderImageToCanvas(ctx, img, options.resourceResolver);
      }
    }

    if (page.shapes && page.shapes.length > 0) {
      for (const shape of page.shapes) {
        ShapeRecognizer.renderShape(ctx, shape);
      }
    }

    if (page.texts && page.texts.length > 0) {
      for (const text of page.texts) {
        this.renderTextToCanvas(ctx, text);
      }
    }

    if (page.strokes && page.strokes.length > 0) {
      for (const stroke of page.strokes) {
        this.renderStrokeToCanvas(ctx, stroke);
      }
    }

    return canvas;
  }

  static async exportPageToBlob(
    page: PageData,
    options: PngExportOptions = {}
  ): Promise<Blob> {
    const canvas = await this.renderPageToCanvas(page, options);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to generate PNG blob from canvas"));
        }
      }, "image/png");
    });
  }

  static async exportPageToUint8Array(
    page: PageData,
    options: PngExportOptions = {}
  ): Promise<Uint8Array> {
    const blob = await this.exportPageToBlob(page, options);
    const buffer = await blob.arrayBuffer();
    return new Uint8Array(buffer);
  }

  private static async renderSvgBackgroundToCanvas(
    ctx: CanvasRenderingContext2D,
    svgPath: string,
    dimensions: PageDimensions,
    resourceResolver?: (vaultPath: string) => string
  ): Promise<void> {
    return new Promise((resolve) => {
      const src = resourceResolver ? resourceResolver(svgPath) : svgPath;
      const imgEl = new Image();
      imgEl.crossOrigin = "anonymous";
      imgEl.onload = () => {
        ctx.drawImage(imgEl, 0, 0, dimensions.width, dimensions.height);
        resolve();
      };
      imgEl.onerror = () => {
        resolve();
      };
      imgEl.src = src;
    });
  }

  private static async renderImageToCanvas(
    ctx: CanvasRenderingContext2D,
    image: ImageObject,
    resourceResolver?: (vaultPath: string) => string
  ): Promise<void> {
    return new Promise((resolve) => {
      const src = resourceResolver ? resourceResolver(image.vaultPath) : image.vaultPath;
      const imgEl = new Image();
      imgEl.crossOrigin = "anonymous";
      imgEl.onload = () => {
        ctx.save();
        if (typeof image.opacity === "number") {
          ctx.globalAlpha = image.opacity;
        }
        if (image.rotation) {
          const cx = image.x + image.width / 2;
          const cy = image.y + image.height / 2;
          ctx.translate(cx, cy);
          ctx.rotate((image.rotation * Math.PI) / 180);
          ctx.drawImage(imgEl, -image.width / 2, -image.height / 2, image.width, image.height);
        } else {
          ctx.drawImage(imgEl, image.x, image.y, image.width, image.height);
        }
        ctx.restore();
        resolve();
      };
      imgEl.onerror = () => {
        resolve();
      };
      imgEl.src = src;
    });
  }

  private static renderTextToCanvas(
    ctx: CanvasRenderingContext2D,
    text: TextObject
  ): void {
    ctx.save();

    if (text.isSticky) {
      ctx.fillStyle = text.backgroundColor || "#fef08a";
      ctx.shadowColor = "rgba(0, 0, 0, 0.15)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;

      const r = 4;
      ctx.beginPath();
      ctx.moveTo(text.x + r, text.y);
      ctx.lineTo(text.x + text.width - r, text.y);
      ctx.quadraticCurveTo(text.x + text.width, text.y, text.x + text.width, text.y + r);
      ctx.lineTo(text.x + text.width, text.y + text.height - r);
      ctx.quadraticCurveTo(text.x + text.width, text.y + text.height, text.x + text.width - r, text.y + text.height);
      ctx.lineTo(text.x + r, text.y + text.height);
      ctx.quadraticCurveTo(text.x, text.y + text.height, text.x, text.y + text.height - r);
      ctx.lineTo(text.x + r, text.y + r);
      ctx.quadraticCurveTo(text.x, text.y, text.x + r, text.y);
      ctx.closePath();
      ctx.fill();

      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
    }

    const fontSize = text.fontSize || 16;
    const fontStyle = text.italic ? "italic" : "normal";
    const fontWeight = text.fontWeight || "normal";
    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${text.fontFamily || "sans-serif"}`;
    ctx.fillStyle = text.color || "#000000";

    const paddingX = text.isSticky ? 12 : 4;
    const paddingTop = text.isSticky ? 12 : 2;
    const lineHeight = fontSize * 1.35;

    let textX = text.x + paddingX;
    if (text.textAlign === "center") {
      ctx.textAlign = "center";
      textX = text.x + text.width / 2;
    } else if (text.textAlign === "right") {
      ctx.textAlign = "right";
      textX = text.x + text.width - paddingX;
    } else {
      ctx.textAlign = "left";
    }

    const lines = text.content.split("\n");
    lines.forEach((line, idx) => {
      const lineY = text.y + paddingTop + fontSize + idx * lineHeight;
      ctx.fillText(line, textX, lineY);
      if (text.underline) {
        const textMetric = ctx.measureText(line);
        let underlineStart = textX;
        if (text.textAlign === "center") {
          underlineStart = textX - textMetric.width / 2;
        } else if (text.textAlign === "right") {
          underlineStart = textX - textMetric.width;
        }
        ctx.fillRect(underlineStart, lineY + 2, textMetric.width, 1);
      }
    });

    ctx.restore();
  }

  private static renderStrokeToCanvas(
    ctx: CanvasRenderingContext2D,
    stroke: StrokeObject
  ): void {
    StrokeGeometry.renderStroke(ctx, stroke);
  }
}
