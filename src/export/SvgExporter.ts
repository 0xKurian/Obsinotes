import {
  PageData,
  PaperTemplateConfig,
  ShapeObject,
  StrokeObject,
  TextObject,
  ImageObject
} from "../types";
import { StrokeGeometry } from "../ink/StrokeGeometry";

export interface SvgExportOptions {
  includeTemplate?: boolean;
  includePdfBackground?: boolean;
  resourceResolver?: (vaultPath: string) => string;
  dataUriResolver?: (vaultPath: string) => Promise<string | null>;
}

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function outlineToSvgPath(outline: number[][]): string {
  if (outline.length === 0) {
    return "";
  }
  let d = `M ${outline[0][0].toFixed(2)} ${outline[0][1].toFixed(2)}`;
  if (outline.length >= 3) {
    for (let i = 1; i < outline.length - 1; i++) {
      const xc = ((outline[i][0] + outline[i + 1][0]) / 2).toFixed(2);
      const yc = ((outline[i][1] + outline[i + 1][1]) / 2).toFixed(2);
      d += ` Q ${outline[i][0].toFixed(2)} ${outline[i][1].toFixed(2)} ${xc} ${yc}`;
    }
    const last = outline[outline.length - 1];
    d += ` L ${last[0].toFixed(2)} ${last[1].toFixed(2)}`;
  } else {
    for (let i = 1; i < outline.length; i++) {
      d += ` L ${outline[i][0].toFixed(2)} ${outline[i][1].toFixed(2)}`;
    }
  }
  return d + " Z";
}

export function renderTemplateToSvg(
  width: number,
  height: number,
  template: PaperTemplateConfig
): string {
  const safeBg = escapeXml(template.backgroundColor);
  let svg = `<rect width="${width}" height="${height}" fill="${safeBg}"/>`;

  if (template.type === "blank") {
    return svg;
  }

  const effectiveLineColor = escapeXml(
    template.lineColor === "#e2e8f0" || template.lineColor === "#e5e7eb"
      ? "#94a3b8"
      : template.lineColor
  );
  const opacity = Math.max(0.4, Math.min(1, template.opacity ?? 0.8));
  const spacing = Math.max(12, template.spacing);

  if (template.type === "ruled") {
    const topMargin = spacing * 2.5;
    svg += `<line x1="0" y1="${topMargin}" x2="${width}" y2="${topMargin}" stroke="${effectiveLineColor}" stroke-width="1.5" stroke-opacity="${opacity}"/>`;
    for (let y = topMargin + spacing; y < height; y += spacing) {
      svg += `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${effectiveLineColor}" stroke-width="1" stroke-opacity="${opacity}"/>`;
    }
  } else if (template.type === "grid") {
    for (let x = 0; x < width; x += spacing) {
      svg += `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="${effectiveLineColor}" stroke-width="0.75" stroke-opacity="${opacity}"/>`;
    }
    for (let y = 0; y < height; y += spacing) {
      svg += `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${effectiveLineColor}" stroke-width="0.75" stroke-opacity="${opacity}"/>`;
    }
  } else if (template.type === "dotted") {
    for (let x = spacing; x < width; x += spacing) {
      for (let y = spacing; y < height; y += spacing) {
        svg += `<circle cx="${x}" cy="${y}" r="1" fill="${effectiveLineColor}" fill-opacity="${opacity}"/>`;
      }
    }
  } else if (template.type === "cornell") {
    const headerHeight = template.cornell?.headerHeight ?? 80;
    const summaryHeight = template.cornell?.summaryHeight ?? 100;
    const cueWidth = (width * (template.cornell?.cueWidthPercent ?? 30)) / 100;

    svg += `<line x1="0" y1="${headerHeight}" x2="${width}" y2="${headerHeight}" stroke="${effectiveLineColor}" stroke-width="1.5" stroke-opacity="${opacity}"/>`;
    svg += `<line x1="${cueWidth}" y1="${headerHeight}" x2="${cueWidth}" y2="${height - summaryHeight}" stroke="${effectiveLineColor}" stroke-width="1.5" stroke-opacity="${opacity}"/>`;
    svg += `<line x1="0" y1="${height - summaryHeight}" x2="${width}" y2="${height - summaryHeight}" stroke="${effectiveLineColor}" stroke-width="1.5" stroke-opacity="${opacity}"/>`;

    for (let y = headerHeight + spacing; y < height - summaryHeight; y += spacing) {
      svg += `<line x1="${cueWidth}" y1="${y}" x2="${width}" y2="${y}" stroke="${effectiveLineColor}" stroke-width="0.75" stroke-opacity="${opacity}"/>`;
    }
  }

  return svg;
}

export function renderShapeToSvg(shape: ShapeObject): string {
  const stroke = escapeXml(shape.color);
  const strokeWidth = shape.strokeWidth;
  const fill = escapeXml(shape.fillColor || "none");
  const geo = shape.geometryData;
  const dashAttr =
    shape.strokePattern === "dashed" || shape.strokePattern === "dotted"
      ? ` stroke-dasharray="${StrokeGeometry.getLineDashArray(shape.strokePattern, strokeWidth).join(",")}" stroke-linecap="round"`
      : "";

  const injectDash = (svgEl: string): string => {
    if (!dashAttr) return svgEl;
    return svgEl.replace(/\/>/, `${dashAttr}/>`);
  };

  switch (shape.type) {
    case "line": {
      const x1 = geo.x1 ?? 0;
      const y1 = geo.y1 ?? 0;
      const x2 = geo.x2 ?? 0;
      const y2 = geo.y2 ?? 0;
      return injectDash(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`);
    }

    case "circle": {
      const cx = geo.cx ?? 0;
      const cy = geo.cy ?? 0;
      const r = geo.r ?? 0;
      return injectDash(`<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}"/>`);
    }

    case "ellipse": {
      const cx = geo.cx ?? 0;
      const cy = geo.cy ?? 0;
      const rx = geo.rx ?? 0;
      const ry = geo.ry ?? 0;
      return injectDash(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}"/>`);
    }

    case "rectangle": {
      const x = geo.x ?? shape.bounds.minX;
      const y = geo.y ?? shape.bounds.minY;
      const w = geo.width ?? Math.max(1, shape.bounds.maxX - shape.bounds.minX);
      const h = geo.height ?? Math.max(1, shape.bounds.maxY - shape.bounds.minY);
      return injectDash(`<rect x="${x}" y="${y}" width="${w}" height="${h}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}" stroke-linejoin="round"/>`);
    }

    case "rounded-rectangle": {
      const x = geo.x ?? shape.bounds.minX;
      const y = geo.y ?? shape.bounds.minY;
      const w = geo.width ?? Math.max(1, shape.bounds.maxX - shape.bounds.minX);
      const h = geo.height ?? Math.max(1, shape.bounds.maxY - shape.bounds.minY);
      const rad = Math.min(geo.radius || 10, w / 2, h / 2);
      return injectDash(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rad}" ry="${rad}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}" stroke-linejoin="round"/>`);
    }

    case "triangle": {
      const x1 = geo.x1 ?? shape.bounds.minX;
      const y1 = geo.y1 ?? shape.bounds.maxY;
      const x2 = geo.x2 ?? (shape.bounds.minX + shape.bounds.maxX) / 2;
      const y2 = geo.y2 ?? shape.bounds.minY;
      const x3 = geo.x3 ?? shape.bounds.maxX;
      const y3 = geo.y3 ?? shape.bounds.maxY;
      return injectDash(`<polygon points="${x1},${y1} ${x2},${y2} ${x3},${y3}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}" stroke-linejoin="round"/>`);
    }

    case "diamond": {
      const x = geo.x ?? shape.bounds.minX;
      const y = geo.y ?? shape.bounds.minY;
      const w = geo.width ?? Math.max(1, shape.bounds.maxX - shape.bounds.minX);
      const h = geo.height ?? Math.max(1, shape.bounds.maxY - shape.bounds.minY);
      const midX = x + w / 2;
      const midY = y + h / 2;
      return injectDash(`<polygon points="${midX},${y} ${x + w},${midY} ${midX},${y + h} ${x},${midY}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}" stroke-linejoin="round"/>`);
    }

    case "arrow": {
      const x1 = geo.x1 ?? shape.bounds.minX;
      const y1 = geo.y1 ?? shape.bounds.minY;
      const x2 = geo.x2 ?? shape.bounds.maxX;
      const y2 = geo.y2 ?? shape.bounds.maxY;
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLength = Math.max(10, strokeWidth * 3.5);
      const a1x = x2 - headLength * Math.cos(angle - Math.PI / 6);
      const a1y = y2 - headLength * Math.sin(angle - Math.PI / 6);
      const a2x = x2 - headLength * Math.cos(angle + Math.PI / 6);
      const a2y = y2 - headLength * Math.sin(angle + Math.PI / 6);
      return `<g><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round"${dashAttr}/><polygon points="${x2},${y2} ${a1x},${a1y} ${a2x},${a2y}" fill="${stroke}" stroke="${stroke}" stroke-width="1"/></g>`;
    }

    case "star": {
      const x = geo.x ?? shape.bounds.minX;
      const y = geo.y ?? shape.bounds.minY;
      const w = geo.width ?? Math.max(1, shape.bounds.maxX - shape.bounds.minX);
      const h = geo.height ?? Math.max(1, shape.bounds.maxY - shape.bounds.minY);
      const cx = x + w / 2;
      const cy = y + h / 2;
      const rOuter = Math.min(w, h) / 2;
      const rInner = rOuter * 0.45;
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? rOuter : rInner;
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
      }
      return injectDash(`<polygon points="${pts.join(" ")}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}" stroke-linejoin="round"/>`);
    }

    case "callout": {
      const x = geo.x ?? shape.bounds.minX;
      const y = geo.y ?? shape.bounds.minY;
      const w = geo.width ?? Math.max(1, shape.bounds.maxX - shape.bounds.minX);
      const h = geo.height ?? Math.max(1, shape.bounds.maxY - shape.bounds.minY);
      const rad = 8;
      const tailW = Math.min(24, w * 0.25);
      const tailH = Math.min(16, h * 0.25);
      const bodyH = h - tailH;
      const tailX = x + w * 0.25;

      const path = `M ${x + rad} ${y} L ${x + w - rad} ${y} Q ${x + w} ${y} ${x + w} ${y + rad} L ${x + w} ${y + bodyH - rad} Q ${x + w} ${y + bodyH} ${x + w - rad} ${y + bodyH} L ${tailX + tailW} ${y + bodyH} L ${tailX} ${y + h} L ${tailX + tailW / 2} ${y + bodyH} L ${x + rad} ${y + bodyH} Q ${x} ${y + bodyH} ${x} ${y + bodyH - rad} L ${x} ${y + rad} Q ${x} ${y} ${x + rad} ${y} Z`;
      return injectDash(`<path d="${path}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}" stroke-linejoin="round"/>`);
    }

    default:
      return "";
  }
}

export function renderStrokeToSvg(stroke: StrokeObject): string {
  if (stroke.strokePattern === "dashed" || stroke.strokePattern === "dotted") {
    if (stroke.points.length === 0) {
      return "";
    }
    const effectiveWidth =
      stroke.tool === "highlighter"
        ? StrokeGeometry.getToolSize("highlighter", stroke.width)
        : Math.max(1, stroke.width);
    const opacity =
      stroke.tool === "highlighter"
        ? 0.35
        : stroke.tool === "pencil"
          ? StrokeGeometry.computePencilOpacity(stroke)
          : stroke.opacity ?? 1;
    const blendStyle = stroke.tool === "highlighter" ? ` style="mix-blend-mode: multiply;"` : "";
    const safeColor = escapeXml(stroke.color);
    if (stroke.points.length === 1) {
      const p = stroke.points[0];
      return `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${(effectiveWidth / 2).toFixed(2)}" fill="${safeColor}" fill-opacity="${Number(opacity.toFixed(2))}"${blendStyle}/>`;
    }
    const dash = StrokeGeometry.getLineDashArray(stroke.strokePattern, effectiveWidth).join(",");
    let d = `M ${stroke.points[0].x.toFixed(2)} ${stroke.points[0].y.toFixed(2)}`;
    if (stroke.points.length >= 3) {
      for (let i = 1; i < stroke.points.length - 1; i++) {
        const xc = ((stroke.points[i].x + stroke.points[i + 1].x) / 2).toFixed(2);
        const yc = ((stroke.points[i].y + stroke.points[i + 1].y) / 2).toFixed(2);
        d += ` Q ${stroke.points[i].x.toFixed(2)} ${stroke.points[i].y.toFixed(2)} ${xc} ${yc}`;
      }
      const last = stroke.points[stroke.points.length - 1];
      d += ` L ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
    } else {
      for (let i = 1; i < stroke.points.length; i++) {
        d += ` L ${stroke.points[i].x.toFixed(2)} ${stroke.points[i].y.toFixed(2)}`;
      }
    }
    return `<path d="${d}" fill="none" stroke="${safeColor}" stroke-width="${effectiveWidth}" stroke-dasharray="${dash}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${Number(opacity.toFixed(2))}"${blendStyle}/>`;
  }

  const cached = StrokeGeometry.getCachedGeometry(stroke);
  const outline = cached ? cached.outline : StrokeGeometry.generateOutline(stroke.points, stroke.tool, stroke.width);
  if (outline.length === 0) {
    return "";
  }

  const d = outlineToSvgPath(outline);
  const color = escapeXml(stroke.color);

  if (stroke.tool === "highlighter") {
    return `<path d="${d}" fill="${color}" fill-opacity="0.35" style="mix-blend-mode: multiply;"/>`;
  }

  const opacity = stroke.tool === "pencil" ? Number(StrokeGeometry.computePencilOpacity(stroke).toFixed(2)) : stroke.opacity ?? 1;
  return `<path d="${d}" fill="${color}" fill-opacity="${opacity}"/>`;
}

export function renderTextToSvg(text: TextObject): string {
  let svg = "";
  if (text.isSticky) {
    const bg = escapeXml(text.backgroundColor || "#fef08a");
    svg += `<rect x="${text.x}" y="${text.y}" width="${text.width}" height="${text.height}" rx="4" ry="4" fill="${bg}" filter="drop-shadow(0px 2px 4px rgba(0,0,0,0.15))"/>`;
  }

  const lines = text.content.split("\n");
  const fontSize = text.fontSize || 16;
  const lineHeight = fontSize * 1.35;
  const paddingX = text.isSticky ? 12 : 4;
  const paddingTop = text.isSticky ? 12 : 2;

  let textAnchor = "start";
  let startX = text.x + paddingX;
  if (text.textAlign === "center") {
    textAnchor = "middle";
    startX = text.x + text.width / 2;
  } else if (text.textAlign === "right") {
    textAnchor = "end";
    startX = text.x + text.width - paddingX;
  }

  const fontStyle = text.italic ? 'font-style="italic"' : "";
  const textDeco = text.underline ? 'text-decoration="underline"' : "";

  svg += `<text x="${startX}" y="${text.y + paddingTop + fontSize}" font-family="${escapeXml(text.fontFamily)}" font-size="${fontSize}" font-weight="${escapeXml(text.fontWeight || "normal")}" fill="${escapeXml(text.color)}" text-anchor="${textAnchor}" ${fontStyle} ${textDeco}>`;

  lines.forEach((line, idx) => {
    const dy = idx === 0 ? "0" : `${lineHeight}`;
    svg += `<tspan x="${startX}" dy="${dy}">${escapeXml(line)}</tspan>`;
  });

  svg += `</text>`;
  return svg;
}

export function renderImageToSvg(
  image: ImageObject,
  resourceResolver?: (vaultPath: string) => string
): string {
  const src = resourceResolver ? resourceResolver(image.vaultPath) : image.vaultPath;
  const rot = image.rotation
    ? `transform="rotate(${image.rotation} ${image.x + image.width / 2} ${image.y + image.height / 2})"`
    : "";
  const op = typeof image.opacity === "number" ? `opacity="${image.opacity}"` : "";

  return `<image href="${escapeXml(src)}" x="${image.x}" y="${image.y}" width="${image.width}" height="${image.height}" preserveAspectRatio="none" ${rot} ${op}/>`;
}

export function exportPageToSvg(
  page: PageData,
  options: SvgExportOptions = {}
): string {
  const width = page.dimensions.width;
  const height = page.dimensions.height;
  const includeTemplate = options.includeTemplate !== false;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n`;

  if (includeTemplate && page.template) {
    svg += `  <g id="template-layer">\n    ${renderTemplateToSvg(width, height, page.template)}\n  </g>\n`;
  }

  if (options.includePdfBackground !== false && page.pdfSource?.svgPath) {
    const bgSrc = options.resourceResolver ? options.resourceResolver(page.pdfSource.svgPath) : page.pdfSource.svgPath;
    svg += `  <g id="pdf-background-layer">\n    <image href="${escapeXml(bgSrc)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/>\n  </g>\n`;
  }

  if (page.images && page.images.length > 0) {
    svg += `  <g id="image-layer">\n`;
    for (const img of page.images) {
      svg += `    ${renderImageToSvg(img, options.resourceResolver)}\n`;
    }
    svg += `  </g>\n`;
  }

  if (page.shapes && page.shapes.length > 0) {
    svg += `  <g id="shape-layer">\n`;
    for (const sh of page.shapes) {
      svg += `    ${renderShapeToSvg(sh)}\n`;
    }
    svg += `  </g>\n`;
  }

  if (page.texts && page.texts.length > 0) {
    svg += `  <g id="text-layer">\n`;
    for (const t of page.texts) {
      svg += `    ${renderTextToSvg(t)}\n`;
    }
    svg += `  </g>\n`;
  }

  if (page.strokes && page.strokes.length > 0) {
    svg += `  <g id="ink-layer">\n`;
    for (const s of page.strokes) {
      svg += `    ${renderStrokeToSvg(s)}\n`;
    }
    svg += `  </g>\n`;
  }

  svg += `</svg>`;
  return svg;
}

export async function exportPageToSvgAsync(
  page: PageData,
  options: SvgExportOptions = {}
): Promise<string> {
  if (!options.dataUriResolver) {
    return exportPageToSvg(page, options);
  }
  const resolvedMap = new Map<string, string>();
  const pathsToResolve: string[] = [];
  if (options.includePdfBackground !== false && page.pdfSource?.svgPath) {
    pathsToResolve.push(page.pdfSource.svgPath);
  }
  if (page.images) {
    for (const img of page.images) {
      if (img.vaultPath) {
        pathsToResolve.push(img.vaultPath);
      }
    }
  }
  for (const vaultPath of pathsToResolve) {
    if (resolvedMap.has(vaultPath)) continue;
    try {
      const dataUri = await options.dataUriResolver(vaultPath);
      if (dataUri) {
        resolvedMap.set(vaultPath, dataUri);
      }
    } catch {
      // Fall back to resourceResolver
    }
  }
  return exportPageToSvg(page, {
    ...options,
    resourceResolver: (vaultPath: string) =>
      resolvedMap.get(vaultPath) ??
      (options.resourceResolver ? options.resourceResolver(vaultPath) : vaultPath)
  });
}
