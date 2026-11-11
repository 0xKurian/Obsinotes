import {
  PageDimensions,
  PaperTemplateConfig
} from "../types";

export class TemplateRenderer {
  static renderTemplate(
    canvas: HTMLCanvasElement,
    dimensions: PageDimensions,
    template: PaperTemplateConfig
  ): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const { width, height } = dimensions;
    const scale = canvas.width / width;
    if (typeof ctx.setTransform === "function") {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = template.backgroundColor;
    ctx.fillRect(0, 0, width, height);

    if (template.type === "blank") {
      return;
    }

    const effectiveLineColor =
      template.lineColor === "#e2e8f0" || template.lineColor === "#e5e7eb"
        ? (this.isDarkColor(template.backgroundColor) ? "#475569" : "#94a3b8")
        : template.lineColor;

    const effectiveOpacity = Math.max(0.7, Math.min(1, template.opacity ?? 1));

    ctx.save();
    ctx.strokeStyle = effectiveLineColor;
    ctx.fillStyle = effectiveLineColor;
    ctx.globalAlpha = effectiveOpacity;

    switch (template.type) {
      case "ruled":
        this.renderRuled(ctx, width, height, template, effectiveLineColor);
        break;
      case "grid":
        this.renderGrid(ctx, width, height, template);
        break;
      case "dotted":
        this.renderDotted(ctx, width, height, template);
        break;
      case "cornell":
        this.renderCornell(ctx, width, height, template);
        break;
    }

    ctx.restore();
  }

  private static isDarkColor(color: string): boolean {
    if (!color) return false;
    let hex = color.replace("#", "");
    if (hex.length === 3) {
      hex = hex.split("").map((c) => c + c).join("");
    }
    const r = parseInt(hex.substring(0, 2), 16) || 0;
    const g = parseInt(hex.substring(2, 4), 16) || 0;
    const b = parseInt(hex.substring(4, 6), 16) || 0;
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128;
  }

  private static renderRuled(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    template: PaperTemplateConfig,
    effectiveLineColor: string
  ): void {
    ctx.lineWidth = 1;
    const spacing = Math.max(12, template.spacing);
    const topMargin = spacing * 2.5;

    ctx.save();
    ctx.strokeStyle = effectiveLineColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const roundedTop = Math.floor(topMargin) + 0.5;
    ctx.moveTo(0, roundedTop);
    ctx.lineTo(width, roundedTop);
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    for (let y = topMargin + spacing; y < height; y += spacing) {
      const lineY = Math.floor(y) + 0.5;
      ctx.moveTo(0, lineY);
      ctx.lineTo(width, lineY);
    }
    ctx.stroke();

    ctx.save();
    ctx.lineWidth = 1;
    ctx.beginPath();
    const marginLineX = Math.floor(60) + 0.5;
    ctx.moveTo(marginLineX, Math.floor(topMargin));
    ctx.lineTo(marginLineX, height);
    ctx.stroke();
    ctx.restore();
  }

  private static renderGrid(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    template: PaperTemplateConfig
  ): void {
    ctx.lineWidth = 1;
    const spacing = Math.max(8, template.spacing);

    ctx.beginPath();
    for (let x = 0; x <= width; x += spacing) {
      const lineX = Math.floor(x) + 0.5;
      ctx.moveTo(lineX, 0);
      ctx.lineTo(lineX, height);
    }
    for (let y = 0; y <= height; y += spacing) {
      const lineY = Math.floor(y) + 0.5;
      ctx.moveTo(0, lineY);
      ctx.lineTo(width, lineY);
    }
    ctx.stroke();
  }

  private static renderDotted(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    template: PaperTemplateConfig
  ): void {
    const spacing = Math.max(8, template.spacing);
    const dotRadius = 1.2;

    ctx.beginPath();
    for (let x = spacing; x < width; x += spacing) {
      const cx = Math.floor(x) + 0.5;
      for (let y = spacing; y < height; y += spacing) {
        const cy = Math.floor(y) + 0.5;
        ctx.moveTo(cx + dotRadius, cy);
        ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  }

  private static renderCornell(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    template: PaperTemplateConfig
  ): void {
    const headerHeight = template.cornell?.headerHeight ?? 60;
    const summaryHeight = template.cornell?.summaryHeight ?? 120;
    const cueWidthPercent = template.cornell?.cueWidthPercent ?? 30;
    const cueWidth = (cueWidthPercent / 100) * (width - 60);

    const marginX = 30;
    const contentTop = Math.floor(headerHeight) + 0.5;
    const contentBottom = Math.floor(height - summaryHeight) + 0.5;
    const cueDividerX = Math.floor(marginX + cueWidth) + 0.5;

    ctx.save();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(marginX, contentTop);
    ctx.lineTo(width - marginX, contentTop);

    ctx.moveTo(marginX, contentBottom);
    ctx.lineTo(width - marginX, contentBottom);

    ctx.moveTo(cueDividerX, contentTop);
    ctx.lineTo(cueDividerX, contentBottom);

    const borderTop = 30.5;
    const borderBottom = Math.floor(height - 30) + 0.5;
    const borderLeft = 30.5;
    const borderRight = Math.floor(width - 30) + 0.5;

    ctx.moveTo(borderLeft, borderTop);
    ctx.lineTo(borderLeft, borderBottom);
    ctx.moveTo(borderRight, borderTop);
    ctx.lineTo(borderRight, borderBottom);
    ctx.moveTo(borderLeft, borderTop);
    ctx.lineTo(borderRight, borderTop);
    ctx.moveTo(borderLeft, borderBottom);
    ctx.lineTo(borderRight, borderBottom);
    ctx.stroke();
    ctx.restore();

    ctx.lineWidth = 1;
    const spacing = Math.max(16, template.spacing);

    ctx.beginPath();
    for (let y = headerHeight + spacing; y < height - summaryHeight - 5; y += spacing) {
      const lineY = Math.floor(y) + 0.5;
      ctx.moveTo(cueDividerX, lineY);
      ctx.lineTo(width - marginX, lineY);
    }

    for (let y = height - summaryHeight + spacing; y < height - 35; y += spacing) {
      const lineY = Math.floor(y) + 0.5;
      ctx.moveTo(marginX, lineY);
      ctx.lineTo(width - marginX, lineY);
    }
    ctx.stroke();
  }
}
