import {
  CURRENT_SCHEMA_VERSION,
  DeserializationResult,
  NotebookDocument,
  NotebookMetadata,
  PageData,
  PageSizePreset,
  ShapeObject,
  StrokeObject,
  ValidationResult,
  NOTE_PAGES_FRONTMATTER_KEY
} from "../types";

const VALID_PAGE_SIZES: ReadonlySet<string> = new Set<PageSizePreset>([
  "A4",
  "A3",
  "A5",
  "B5",
  "Letter",
  "16:9",
  "Square",
  "Custom"
]);

export const PLUGIN_OWNED_FRONTMATTER_KEYS = [
  NOTE_PAGES_FRONTMATTER_KEY,
  "notepages-version",
  "title",
  "page-count",
  "updated"
] as const;

export interface SerializeOptions {
  /** Raw YAML content (excluding enclosing `---` delimiters) from the existing file. User-defined keys are preserved. */
  existingFrontmatter?: string | null;
}

interface FrontmatterBlock {
  key: string | null;
  lines: string[];
}

export class DocumentSerializer {
  static fastValidateDocumentForSave(data: unknown): ValidationResult {
    const errors: string[] = [];

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { valid: false, errors: ["Document payload must be a non-null object"] };
    }

    const obj = data as Record<string, unknown>;

    if (!obj.metadata || typeof obj.metadata !== "object" || Array.isArray(obj.metadata)) {
      errors.push("Missing or invalid 'metadata' object");
    } else {
      const meta = obj.metadata as Record<string, unknown>;
      if (typeof meta.title !== "string") {
        errors.push("metadata.title must be a string");
      }
      if (typeof meta.createdAt !== "number" || !Number.isFinite(meta.createdAt)) {
        errors.push("metadata.createdAt must be a valid number");
      }
      if (typeof meta.updatedAt !== "number" || !Number.isFinite(meta.updatedAt)) {
        errors.push("metadata.updatedAt must be a valid number");
      }
      if (typeof meta.schemaVersion !== "number" || !Number.isFinite(meta.schemaVersion)) {
        errors.push("metadata.schemaVersion must be a valid number");
      }
      if (typeof meta.defaultPageSize !== "string" || !VALID_PAGE_SIZES.has(meta.defaultPageSize)) {
        errors.push("metadata.defaultPageSize must be a valid PageSizePreset ('A4', 'A3', 'A5', 'B5', 'Letter', '16:9', 'Square', 'Custom')");
      }
      if (meta.defaultOrientation !== "portrait" && meta.defaultOrientation !== "landscape") {
        errors.push("metadata.defaultOrientation must be 'portrait' or 'landscape'");
      }
    }

    if (!Array.isArray(obj.pages)) {
      errors.push("Document 'pages' must be an array");
    } else {
      for (let index = 0; index < obj.pages.length; index++) {
        const page = obj.pages[index] as Record<string, unknown>;
        const prefix = `Page[${index}]`;
        if (!page || typeof page !== "object" || Array.isArray(page)) {
          errors.push(`${prefix} must be a valid object`);
          continue;
        }
        if (typeof page.id !== "string" || page.id.trim() === "") {
          errors.push(`${prefix}.id must be a non-empty string`);
        }
        if (typeof page.pageNumber !== "number" || !Number.isFinite(page.pageNumber) || page.pageNumber < 1) {
          errors.push(`${prefix}.pageNumber must be a positive integer`);
        }
        if (!page.dimensions || typeof page.dimensions !== "object") {
          errors.push(`${prefix}.dimensions must be an object`);
        } else {
          const dim = page.dimensions as Record<string, unknown>;
          if (typeof dim.width !== "number" || !Number.isFinite(dim.width) || dim.width <= 0) {
            errors.push(`${prefix}.dimensions.width must be a positive number`);
          }
          if (typeof dim.height !== "number" || !Number.isFinite(dim.height) || dim.height <= 0) {
            errors.push(`${prefix}.dimensions.height must be a positive number`);
          }
        }
        if (page.orientation !== "portrait" && page.orientation !== "landscape") {
          errors.push(`${prefix}.orientation must be 'portrait' or 'landscape'`);
        }
        if (!Array.isArray(page.strokes)) {
          errors.push(`${prefix}.strokes must be an array`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateDocument(data: unknown): ValidationResult {
    const errors: string[] = [];

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { valid: false, errors: ["Document payload must be a non-null object"] };
    }

    const obj = data as Record<string, unknown>;

    if (!obj.metadata || typeof obj.metadata !== "object" || Array.isArray(obj.metadata)) {
      errors.push("Missing or invalid 'metadata' object");
    } else {
      const meta = obj.metadata as Record<string, unknown>;
      if (typeof meta.title !== "string") {
        errors.push("metadata.title must be a string");
      }
      if (typeof meta.createdAt !== "number" || !Number.isFinite(meta.createdAt)) {
        errors.push("metadata.createdAt must be a valid number");
      }
      if (typeof meta.updatedAt !== "number" || !Number.isFinite(meta.updatedAt)) {
        errors.push("metadata.updatedAt must be a valid number");
      }
      if (typeof meta.schemaVersion !== "number" || !Number.isFinite(meta.schemaVersion)) {
        errors.push("metadata.schemaVersion must be a valid number");
      }
      if (typeof meta.defaultPageSize !== "string" || !VALID_PAGE_SIZES.has(meta.defaultPageSize)) {
        errors.push("metadata.defaultPageSize must be a valid PageSizePreset ('A4', 'A3', 'A5', 'B5', 'Letter', '16:9', 'Square', 'Custom')");
      }
      if (meta.defaultOrientation !== "portrait" && meta.defaultOrientation !== "landscape") {
        errors.push("metadata.defaultOrientation must be 'portrait' or 'landscape'");
      }
    }

    if (!Array.isArray(obj.pages)) {
      errors.push("Document 'pages' must be an array");
    } else {
      obj.pages.forEach((page, index) => {
        const pageErrors = this.validatePage(page, index);
        errors.push(...pageErrors);
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private static validatePage(page: unknown, index: number): string[] {
    const errors: string[] = [];
    const prefix = `Page[${index}]`;

    if (!page || typeof page !== "object" || Array.isArray(page)) {
      return [`${prefix} must be a valid object`];
    }

    const p = page as Record<string, unknown>;

    if (typeof p.id !== "string" || p.id.trim() === "") {
      errors.push(`${prefix}.id must be a non-empty string`);
    }
    if (p.title !== undefined && typeof p.title !== "string") {
      errors.push(`${prefix}.title must be a string`);
    }
    if (p.bookmarked !== undefined && typeof p.bookmarked !== "boolean") {
      errors.push(`${prefix}.bookmarked must be a boolean`);
    }
    if (typeof p.pageNumber !== "number" || !Number.isFinite(p.pageNumber) || p.pageNumber < 1) {
      errors.push(`${prefix}.pageNumber must be a positive integer`);
    }

    if (!p.dimensions || typeof p.dimensions !== "object") {
      errors.push(`${prefix}.dimensions must be an object`);
    } else {
      const dim = p.dimensions as Record<string, unknown>;
      if (typeof dim.width !== "number" || !Number.isFinite(dim.width) || dim.width <= 0) {
        errors.push(`${prefix}.dimensions.width must be a positive number`);
      }
      if (typeof dim.height !== "number" || !Number.isFinite(dim.height) || dim.height <= 0) {
        errors.push(`${prefix}.dimensions.height must be a positive number`);
      }
      if (dim.unit !== "pt") {
        errors.push(`${prefix}.dimensions.unit must be 'pt'`);
      }
    }

    if (p.orientation !== "portrait" && p.orientation !== "landscape") {
      errors.push(`${prefix}.orientation must be 'portrait' or 'landscape'`);
    }

    if (!p.template || typeof p.template !== "object") {
      errors.push(`${prefix}.template must be an object`);
    } else {
      const tmpl = p.template as Record<string, unknown>;
      const validTypes = ["blank", "ruled", "grid", "dotted", "cornell"];
      if (!validTypes.includes(String(tmpl.type))) {
        errors.push(`${prefix}.template.type must be one of ${validTypes.join(", ")}`);
      }
      if (typeof tmpl.backgroundColor !== "string") {
        errors.push(`${prefix}.template.backgroundColor must be a string`);
      }
      if (typeof tmpl.lineColor !== "string") {
        errors.push(`${prefix}.template.lineColor must be a string`);
      }
      if (typeof tmpl.spacing !== "number" || !Number.isFinite(tmpl.spacing) || tmpl.spacing <= 0) {
        errors.push(`${prefix}.template.spacing must be a positive number`);
      }
      if (typeof tmpl.opacity !== "number" || !Number.isFinite(tmpl.opacity) || tmpl.opacity < 0 || tmpl.opacity > 1) {
        errors.push(`${prefix}.template.opacity must be a number between 0 and 1`);
      }
    }

    if (!Array.isArray(p.strokes)) {
      errors.push(`${prefix}.strokes must be an array`);
    } else {
      p.strokes.forEach((stroke, sIndex) => {
        const strokeErrors = this.validateStroke(stroke, index, sIndex);
        errors.push(...strokeErrors);
      });
    }

    if (!Array.isArray(p.shapes)) {
      errors.push(`${prefix}.shapes must be an array`);
    } else {
      p.shapes.forEach((shape, shIndex) => {
        const shapeErrors = this.validateShape(shape, index, shIndex);
        errors.push(...shapeErrors);
      });
    }

    if (!Array.isArray(p.texts)) {
      errors.push(`${prefix}.texts must be an array`);
    } else {
      p.texts.forEach((text, tIndex) => {
        const textErrors = this.validateText(text, index, tIndex);
        errors.push(...textErrors);
      });
    }

    if (!Array.isArray(p.images)) {
      errors.push(`${prefix}.images must be an array`);
    } else {
      p.images.forEach((image, imgIndex) => {
        const imageErrors = this.validateImage(image, index, imgIndex);
        errors.push(...imageErrors);
      });
    }

    return errors;
  }

  private static validateStroke(stroke: unknown, pageIndex: number, strokeIndex: number): string[] {
    const errors: string[] = [];
    const prefix = `Page[${pageIndex}].strokes[${strokeIndex}]`;

    if (!stroke || typeof stroke !== "object") {
      return [`${prefix} must be an object`];
    }

    const s = stroke as Record<string, unknown>;
    if (typeof s.id !== "string" || s.id.trim() === "") {
      errors.push(`${prefix}.id must be a non-empty string`);
    }
    if (typeof s.color !== "string") {
      errors.push(`${prefix}.color must be a string`);
    }
    if (typeof s.width !== "number" || !Number.isFinite(s.width) || s.width <= 0) {
      errors.push(`${prefix}.width must be a positive number`);
    }
    if (typeof s.opacity !== "number" || !Number.isFinite(s.opacity) || s.opacity < 0 || s.opacity > 1) {
      errors.push(`${prefix}.opacity must be a number between 0 and 1`);
    }
    if (
      s.strokePattern !== undefined &&
      s.strokePattern !== "solid" &&
      s.strokePattern !== "dashed" &&
      s.strokePattern !== "dotted"
    ) {
      errors.push(`${prefix}.strokePattern must be 'solid', 'dashed', or 'dotted'`);
    }
    const points = s.points;
    if (!Array.isArray(points)) {
      errors.push(`${prefix}.points must be an array`);
    } else {
      const rawPoints: unknown[] = points;
      for (let i = 0; i < rawPoints.length; i++) {
        const pt = rawPoints[i];
        if (
          !pt ||
          typeof pt !== "object" ||
          typeof (pt as Record<string, unknown>).x !== "number" ||
          typeof (pt as Record<string, unknown>).y !== "number"
        ) {
          errors.push(`${prefix}.points[${i}] must have valid numeric x and y coordinates`);
          break;
        }
      }
    }

    const boundsErrors = this.validateBounds(s.bounds, prefix);
    errors.push(...boundsErrors);

    return errors;
  }

  private static validateShape(shape: unknown, pageIndex: number, shapeIndex: number): string[] {
    const errors: string[] = [];
    const prefix = `Page[${pageIndex}].shapes[${shapeIndex}]`;

    if (!shape || typeof shape !== "object") {
      return [`${prefix} must be an object`];
    }

    const sh = shape as Record<string, unknown>;
    if (typeof sh.id !== "string" || sh.id.trim() === "") {
      errors.push(`${prefix}.id must be a non-empty string`);
    }
    const validShapeTypes = [
      "line",
      "circle",
      "ellipse",
      "rectangle",
      "rounded-rectangle",
      "triangle",
      "diamond",
      "arrow",
      "star",
      "callout"
    ];
    if (!validShapeTypes.includes(String(sh.type))) {
      errors.push(`${prefix}.type must be one of ${validShapeTypes.join(", ")}`);
    }
    if (typeof sh.color !== "string") {
      errors.push(`${prefix}.color must be a string`);
    }
    if (typeof sh.strokeWidth !== "number" || !Number.isFinite(sh.strokeWidth) || sh.strokeWidth <= 0) {
      errors.push(`${prefix}.strokeWidth must be a positive number`);
    }
    if (
      sh.strokePattern !== undefined &&
      sh.strokePattern !== "solid" &&
      sh.strokePattern !== "dashed" &&
      sh.strokePattern !== "dotted"
    ) {
      errors.push(`${prefix}.strokePattern must be 'solid', 'dashed', or 'dotted'`);
    }
    if (!sh.geometryData || typeof sh.geometryData !== "object") {
      errors.push(`${prefix}.geometryData must be an object`);
    }

    const boundsErrors = this.validateBounds(sh.bounds, prefix);
    errors.push(...boundsErrors);

    return errors;
  }

  private static validateBounds(bounds: unknown, prefix: string): string[] {
    if (!bounds || typeof bounds !== "object") {
      return [`${prefix}.bounds must be an object`];
    }
    const b = bounds as Record<string, unknown>;
    const errors: string[] = [];
    if (typeof b.minX !== "number" || !Number.isFinite(b.minX)) {
      errors.push(`${prefix}.bounds.minX must be a number`);
    }
    if (typeof b.minY !== "number" || !Number.isFinite(b.minY)) {
      errors.push(`${prefix}.bounds.minY must be a number`);
    }
    if (typeof b.maxX !== "number" || !Number.isFinite(b.maxX)) {
      errors.push(`${prefix}.bounds.maxX must be a number`);
    }
    if (typeof b.maxY !== "number" || !Number.isFinite(b.maxY)) {
      errors.push(`${prefix}.bounds.maxY must be a number`);
    }
    return errors;
  }

  private static validateText(text: unknown, pageIndex: number, textIndex: number): string[] {
    const errors: string[] = [];
    const prefix = `Page[${pageIndex}].texts[${textIndex}]`;

    if (!text || typeof text !== "object") {
      return [`${prefix} must be an object`];
    }

    const t = text as Record<string, unknown>;
    if (typeof t.id !== "string" || t.id.trim() === "") {
      errors.push(`${prefix}.id must be a non-empty string`);
    }
    if (typeof t.content !== "string") {
      errors.push(`${prefix}.content must be a string`);
    }
    if (typeof t.x !== "number" || !Number.isFinite(t.x)) {
      errors.push(`${prefix}.x must be a number`);
    }
    if (typeof t.y !== "number" || !Number.isFinite(t.y)) {
      errors.push(`${prefix}.y must be a number`);
    }
    if (typeof t.width !== "number" || !Number.isFinite(t.width) || t.width < 0) {
      errors.push(`${prefix}.width must be a non-negative number`);
    }
    if (typeof t.height !== "number" || !Number.isFinite(t.height) || t.height < 0) {
      errors.push(`${prefix}.height must be a non-negative number`);
    }
    if (typeof t.fontSize !== "number" || !Number.isFinite(t.fontSize) || t.fontSize <= 0) {
      errors.push(`${prefix}.fontSize must be a positive number`);
    }
    if (typeof t.color !== "string") {
      errors.push(`${prefix}.color must be a string`);
    }
    const validAligns = ["left", "center", "right"];
    if (!validAligns.includes(String(t.textAlign))) {
      errors.push(`${prefix}.textAlign must be 'left', 'center', or 'right'`);
    }

    return errors;
  }

  private static validateImage(image: unknown, pageIndex: number, imageIndex: number): string[] {
    const errors: string[] = [];
    const prefix = `Page[${pageIndex}].images[${imageIndex}]`;

    if (!image || typeof image !== "object") {
      return [`${prefix} must be an object`];
    }

    const img = image as Record<string, unknown>;
    if (typeof img.id !== "string" || img.id.trim() === "") {
      errors.push(`${prefix}.id must be a non-empty string`);
    }
    if (typeof img.vaultPath !== "string" || img.vaultPath.trim() === "") {
      errors.push(`${prefix}.vaultPath must be a non-empty string`);
    }
    if (typeof img.x !== "number" || !Number.isFinite(img.x)) {
      errors.push(`${prefix}.x must be a number`);
    }
    if (typeof img.y !== "number" || !Number.isFinite(img.y)) {
      errors.push(`${prefix}.y must be a number`);
    }
    if (typeof img.width !== "number" || !Number.isFinite(img.width) || img.width <= 0) {
      errors.push(`${prefix}.width must be a positive number`);
    }
    if (typeof img.height !== "number" || !Number.isFinite(img.height) || img.height <= 0) {
      errors.push(`${prefix}.height must be a positive number`);
    }

    return errors;
  }

  static migrateDocument(rawObj: Record<string, unknown>): NotebookDocument {
    const now = Date.now();
    const existingMeta: Record<string, unknown> = (rawObj.metadata && typeof rawObj.metadata === "object")
      ? (rawObj.metadata as Record<string, unknown>)
      : {};

    const metadata: NotebookMetadata = {
      title: typeof existingMeta.title === "string"
        ? existingMeta.title
        : typeof rawObj.title === "string"
        ? rawObj.title
        : "Untitled Notebook",
      createdAt: typeof existingMeta.createdAt === "number" ? existingMeta.createdAt : now,
      updatedAt: typeof existingMeta.updatedAt === "number" ? existingMeta.updatedAt : now,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      defaultPageSize: typeof existingMeta.defaultPageSize === "string" && VALID_PAGE_SIZES.has(existingMeta.defaultPageSize)
        ? (existingMeta.defaultPageSize as PageSizePreset)
        : "A4",
      defaultOrientation: existingMeta.defaultOrientation === "landscape" ? "landscape" : "portrait",
      defaultTemplate: typeof existingMeta.defaultTemplate === "string" ? existingMeta.defaultTemplate as NotebookMetadata["defaultTemplate"] : undefined,
      defaultPaperBackground: typeof existingMeta.defaultPaperBackground === "string" ? existingMeta.defaultPaperBackground : undefined,
      defaultLineColor: typeof existingMeta.defaultLineColor === "string" ? existingMeta.defaultLineColor : undefined,
      defaultLineSpacing: typeof existingMeta.defaultLineSpacing === "number" ? existingMeta.defaultLineSpacing : undefined
    };

    const rawPages = Array.isArray(rawObj.pages) ? rawObj.pages : [];
    const pages: PageData[] = [];

    if (rawPages.length === 0) {
      pages.push({
        id: "page_1",
        pageNumber: 1,
        dimensions: { width: 595.28, height: 841.89, unit: "pt" },
        orientation: metadata.defaultOrientation,
        template: {
          type: metadata.defaultTemplate || "ruled",
          backgroundColor: metadata.defaultPaperBackground || "#ffffff",
          lineColor: metadata.defaultLineColor || "#e2e8f0",
          spacing: metadata.defaultLineSpacing || 24,
          opacity: 0.8
        },
        strokes: [],
        shapes: [],
        texts: [],
        images: []
      });
    } else {
      rawPages.forEach((rawPage, idx) => {
        const rp = (rawPage && typeof rawPage === "object" ? rawPage : {}) as Record<string, unknown>;
        const dim = (rp.dimensions && typeof rp.dimensions === "object" ? rp.dimensions : {}) as Record<string, unknown>;
        const tmpl = (rp.template && typeof rp.template === "object" ? rp.template : {}) as Record<string, unknown>;

        pages.push({
          id: typeof rp.id === "string" && rp.id ? rp.id : `page_${idx + 1}`,
          ...(typeof rp.title === "string" ? { title: rp.title } : {}),
          ...(typeof rp.bookmarked === "boolean" ? { bookmarked: rp.bookmarked } : {}),
          pageNumber: idx + 1,
          dimensions: {
            width: typeof dim.width === "number" && Number.isFinite(dim.width) && dim.width > 0 ? dim.width : 595.28,
            height: typeof dim.height === "number" && Number.isFinite(dim.height) && dim.height > 0 ? dim.height : 841.89,
            unit: "pt"
          },
          orientation: rp.orientation === "landscape" ? "landscape" : "portrait",
          template: {
            type: typeof tmpl.type === "string" ? (tmpl.type as PageData["template"]["type"]) : "ruled",
            backgroundColor: typeof tmpl.backgroundColor === "string" ? tmpl.backgroundColor : "#ffffff",
            lineColor: typeof tmpl.lineColor === "string" ? tmpl.lineColor : "#e2e8f0",
            spacing: typeof tmpl.spacing === "number" && Number.isFinite(tmpl.spacing) && tmpl.spacing > 0 ? tmpl.spacing : 24,
            opacity: typeof tmpl.opacity === "number" && Number.isFinite(tmpl.opacity) ? tmpl.opacity : 0.8
          },
          ...(rp.pdfSource && typeof rp.pdfSource === "object"
            ? { pdfSource: rp.pdfSource as PageData["pdfSource"] }
            : {}),
          strokes: Array.isArray(rp.strokes) ? (rp.strokes as StrokeObject[]) : [],
          shapes: Array.isArray(rp.shapes) ? (rp.shapes as ShapeObject[]) : [],
          texts: Array.isArray(rp.texts) ? (rp.texts as PageData["texts"]) : [],
          images: Array.isArray(rp.images) ? (rp.images as PageData["images"]) : []
        });
      });
    }

    return {
      ...rawObj,
      metadata,
      pages
    };
  }

  private static round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private static compactStrokeForSave(stroke: StrokeObject): StrokeObject {
    const compactPoints = stroke.points.map((pt) => {
      const compactPt: StrokeObject["points"][number] = {
        x: this.round2(pt.x),
        y: this.round2(pt.y),
        pressure: this.round2(pt.pressure),
        timestamp: Math.round(pt.timestamp)
      };
      if (pt.tiltX !== undefined && pt.tiltX !== 0) {
        compactPt.tiltX = Math.round(pt.tiltX);
      }
      if (pt.tiltY !== undefined && pt.tiltY !== 0) {
        compactPt.tiltY = Math.round(pt.tiltY);
      }
      return compactPt;
    });

    return {
      ...stroke,
      points: compactPoints,
      bounds: {
        minX: this.round2(stroke.bounds.minX),
        minY: this.round2(stroke.bounds.minY),
        maxX: this.round2(stroke.bounds.maxX),
        maxY: this.round2(stroke.bounds.maxY)
      }
    };
  }

  private static findFrontmatterBounds(raw: string): {
    contentStart: number;
    contentEnd: number;
    blockEnd: number;
  } | null {
    const openMatch = /^---[ \t]*\r?\n/.exec(raw);
    if (!openMatch) {
      return null;
    }

    const contentStart = openMatch[0].length;
    let lineStart = contentStart;

    while (lineStart <= raw.length) {
      const nlIndex = raw.indexOf("\n", lineStart);
      const lineEnd = nlIndex === -1 ? raw.length : nlIndex;
      const lineWithoutCr =
        lineEnd > lineStart && raw[lineEnd - 1] === "\r"
          ? raw.slice(lineStart, lineEnd - 1)
          : raw.slice(lineStart, lineEnd);

      if (/^---[ \t]*$/.test(lineWithoutCr)) {
        const blockEnd = nlIndex === -1 ? raw.length : nlIndex + 1;
        let contentEnd = lineStart;
        if (contentEnd > contentStart && raw[contentEnd - 1] === "\n") {
          contentEnd -= 1;
          if (contentEnd > contentStart && raw[contentEnd - 1] === "\r") {
            contentEnd -= 1;
          }
        }
        return { contentStart, contentEnd, blockEnd };
      }

      if (nlIndex === -1) {
        break;
      }
      lineStart = nlIndex + 1;
    }

    return null;
  }

  /**
   * Extract the raw YAML frontmatter (excluding the enclosing `---` lines) from a markdown document,
   * or return `null` if no valid frontmatter block exists at the start of the document.
   */
  static extractFrontmatter(raw: string): string | null {
    const bounds = this.findFrontmatterBounds(raw);
    if (!bounds) {
      return null;
    }
    return raw.slice(bounds.contentStart, bounds.contentEnd);
  }

  /**
   * Return the character offset immediately after the closing `---` line of the frontmatter,
   * or `0` if no valid frontmatter block exists at the start of the document.
   */
  static getFrontmatterEndOffset(raw: string): number {
    const bounds = this.findFrontmatterBounds(raw);
    return bounds ? bounds.blockEnd : 0;
  }

  /**
   * Resolve the base frontmatter to merge plugin-owned keys into when saving.
   * - For Markdown files (`.md`), the on-disk frontmatter is the source of truth because
   *   Obsidian's native Properties sidebar or `fileManager.processFrontMatter` may have
   *   modified it since the last `setViewData` call.
   * - For non-Markdown files (`.gnote`), the in-memory `preservedFrontmatter` is authoritative
   *   because `PropertiesModal` updates it directly before triggering `save()`.
   */
  static resolveFrontmatterForSave(
    isMarkdown: boolean,
    diskContent: string | null | undefined,
    inMemoryFrontmatter: string | null
  ): string | null {
    if (isMarkdown && typeof diskContent === "string") {
      const diskFrontmatter = this.extractFrontmatter(diskContent);
      if (diskFrontmatter !== null) {
        return diskFrontmatter;
      }
    }
    return inMemoryFrontmatter;
  }

  private static parseTopLevelKey(line: string): string | null {
    if (line.length === 0 || line[0] === " " || line[0] === "\t" || line[0] === "#") {
      return null;
    }
    if (line === "-" || line.startsWith("- ") || line.startsWith("-\t")) {
      return null;
    }

    const doubleQuoted = /^"((?:\\.|[^"\\])*)"[ \t]*:(?:\s|$)/.exec(line);
    if (doubleQuoted) {
      return doubleQuoted[1].replace(/\\(.)/g, "$1");
    }

    const singleQuoted = /^'((?:''|[^'])*)'[ \t]*:(?:\s|$)/.exec(line);
    if (singleQuoted) {
      return singleQuoted[1].replace(/''/g, "'");
    }

    const unquoted = /^([^:\s][^:]*?)[ \t]*:(?:\s|$)/.exec(line);
    if (unquoted) {
      return unquoted[1].trimEnd();
    }

    return null;
  }

  /**
   * Merge plugin-owned key/value pairs into an existing raw YAML frontmatter string,
   * preserving all user-defined keys, comments, ordering, and formatting.
   */
  static mergeFrontmatter(
    existing: string | null | undefined,
    pluginEntries: ReadonlyArray<readonly [string, string]>
  ): string {
    const pluginMap = new Map<string, string>(pluginEntries);

    if (!existing) {
      return pluginEntries.map(([key, value]) => `${key}: ${value}`).join("\n");
    }

    const normalized = existing.replace(/\r\n?/g, "\n");
    if (normalized.trim().length === 0) {
      return pluginEntries.map(([key, value]) => `${key}: ${value}`).join("\n");
    }

    const lines = normalized.split("\n");
    const blocks: FrontmatterBlock[] = [];

    for (const line of lines) {
      if (line.startsWith("#")) {
        blocks.push({ key: null, lines: [line] });
        continue;
      }

      const key = this.parseTopLevelKey(line);
      if (key !== null) {
        blocks.push({ key, lines: [line] });
      } else if (blocks.length > 0) {
        blocks[blocks.length - 1].lines.push(line);
      } else {
        blocks.push({ key: null, lines: [line] });
      }
    }

    const seenPluginKeys = new Set<string>();
    const mergedLines: string[] = [];

    for (const block of blocks) {
      if (block.key !== null && pluginMap.has(block.key)) {
        if (seenPluginKeys.has(block.key)) {
          continue;
        }
        seenPluginKeys.add(block.key);
        const value = pluginMap.get(block.key)!;
        mergedLines.push(`${block.key}: ${value}`);

        let trailingBlankCount = 0;
        for (let i = block.lines.length - 1; i >= 1; i--) {
          if (block.lines[i].trim() === "") {
            trailingBlankCount++;
          } else {
            break;
          }
        }
        for (let i = 0; i < trailingBlankCount; i++) {
          mergedLines.push("");
        }
      } else {
        mergedLines.push(...block.lines);
      }
    }

    const missingPluginLines: string[] = [];
    for (const [key, value] of pluginEntries) {
      if (!seenPluginKeys.has(key)) {
        missingPluginLines.push(`${key}: ${value}`);
      }
    }

    if (missingPluginLines.length > 0) {
      return [...missingPluginLines, ...mergedLines].join("\n");
    }

    return mergedLines.join("\n");
  }

  private static parseYamlScalar(raw: string): unknown {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === "null" || trimmed === "~") {
      return "";
    }
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      const num = Number(trimmed);
      if (Number.isFinite(num)) return num;
    }
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
    ) {
      const inner = trimmed.slice(1, -1);
      return trimmed.startsWith('"') ? inner.replace(/\\(.)/g, "$1") : inner.replace(/''/g, "'");
    }
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      const inner = trimmed.slice(1, -1).trim();
      if (!inner) return [];
      return inner
        .split(",")
        .map((item) => String(this.parseYamlScalar(item)))
        .filter((s) => s.length > 0);
    }
    return trimmed;
  }

  private static formatYamlValueLines(key: string, value: unknown): string[] {
    const safeKey = /^[A-Za-z0-9_-]+$/.test(key)
      ? key
      : `"${key.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return [`${safeKey}: []`];
      }
      const lines = [`${safeKey}:`];
      for (const item of value) {
        const s = String(item);
        const needsQuote = s === "" || /[:#[\]{}&*!|>'"%@`\n\r]/.test(s) || /^\s|\s$/.test(s);
        const formatted = needsQuote ? `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : s;
        lines.push(`  - ${formatted}`);
      }
      return lines;
    }
    if (typeof value === "boolean" || typeof value === "number") {
      return [`${safeKey}: ${String(value)}`];
    }
    const str =
      value === null || value === undefined
        ? ""
        : typeof value === "string"
          ? value
          : JSON.stringify(value);
    const needsQuote =
      str === "" ||
      str === "true" ||
      str === "false" ||
      str === "null" ||
      /^-?\d+(?:\.\d+)?$/.test(str) ||
      /[:#[\]{}&*!|>'"%@`\n\r]/.test(str) ||
      /^\s|\s$/.test(str);
    const formatted = needsQuote
      ? `"${str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n")}"`
      : str;
    return [`${safeKey}: ${formatted}`];
  }

  /**
   * Parse top-level YAML frontmatter keys/values (used for non-`.md` notebooks such as `.gnote`).
   */
  static parseFrontmatterProperties(rawFrontmatter: string | null | undefined): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    if (!rawFrontmatter) {
      return result;
    }
    const lines = rawFrontmatter.replace(/\r\n/g, "\n").split("\n");
    let currentKey: string | null = null;
    let currentBlockLines: string[] = [];

    const flushKey = () => {
      if (!currentKey) return;
      const firstLine = currentBlockLines[0] ?? "";
      const colonIdx = firstLine.indexOf(":");
      const afterColon = colonIdx >= 0 ? firstLine.slice(colonIdx + 1).trim() : "";
      const listItems: string[] = [];
      for (let i = 1; i < currentBlockLines.length; i++) {
        const sub = currentBlockLines[i].trim();
        if (sub.startsWith("- ")) {
          listItems.push(String(this.parseYamlScalar(sub.slice(2))));
        } else if (sub === "-") {
          listItems.push("");
        }
      }
      if (afterColon === "" && listItems.length > 0) {
        result[currentKey] = listItems;
      } else {
        result[currentKey] = this.parseYamlScalar(afterColon);
      }
    };

    for (const line of lines) {
      const key = this.parseTopLevelKey(line);
      if (key !== null) {
        flushKey();
        currentKey = key;
        currentBlockLines = [line];
      } else if (currentKey !== null) {
        currentBlockLines.push(line);
      }
    }
    flushKey();
    return result;
  }

  /**
   * Mutate user-defined properties inside a raw YAML frontmatter block while preserving
   * comments, formatting, and untouched keys.
   */
  static updateFrontmatterProperties(
    existing: string | null | undefined,
    mutator: (fm: Record<string, unknown>) => void
  ): string {
    const parsed = this.parseFrontmatterProperties(existing);
    const snapshotBefore = new Map<string, string>();
    for (const [k, v] of Object.entries(parsed)) {
      snapshotBefore.set(k, JSON.stringify(v));
    }

    const working: Record<string, unknown> = { ...parsed };
    mutator(working);

    const lines = existing ? existing.replace(/\r\n/g, "\n").split("\n") : [];
    const outputLines: string[] = [];
    const handledKeys = new Set<string>();

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const key = this.parseTopLevelKey(line);
      if (key === null) {
        outputLines.push(line);
        i++;
        continue;
      }
      const blockEnd = (() => {
        let j = i + 1;
        while (j < lines.length) {
          const nextLine = lines[j];
          if (this.parseTopLevelKey(nextLine) !== null) break;
          if (nextLine.trim() !== "" && nextLine[0] !== " " && nextLine[0] !== "\t" && nextLine[0] !== "-") {
            break;
          }
          j++;
        }
        return j;
      })();

      if (!Object.prototype.hasOwnProperty.call(working, key)) {
        // Key was deleted
        handledKeys.add(key);
        i = blockEnd;
        continue;
      }

      const nextSerialized = JSON.stringify(working[key]);
      if (snapshotBefore.get(key) === nextSerialized) {
        // Unchanged: keep exact original formatting
        for (let k = i; k < blockEnd; k++) {
          outputLines.push(lines[k]);
        }
      } else {
        outputLines.push(...this.formatYamlValueLines(key, working[key]));
      }
      handledKeys.add(key);
      i = blockEnd;
    }

    for (const [key, val] of Object.entries(working)) {
      if (!handledKeys.has(key)) {
        outputLines.push(...this.formatYamlValueLines(key, val));
      }
    }

    return outputLines.join("\n").replace(/^\n+|\n+$/g, "");
  }

  static serializeDocument(doc: NotebookDocument, options: SerializeOptions = {}): string {
    const pageCount = doc.pages.length;
    const title = doc.metadata.title;
    const escapedTitle = title
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n");
    const updatedDate = new Date(doc.metadata.updatedAt).toISOString();
    const compactDoc: NotebookDocument = {
      ...doc,
      pages: doc.pages.map((page) => ({
        ...page,
        strokes: Array.isArray(page.strokes)
          ? page.strokes.map((stroke) => this.compactStrokeForSave(stroke))
          : []
      }))
    };
    const jsonBlock = JSON.stringify(compactDoc).replace(/```/g, "\\u0060\\u0060\\u0060");

    const wikilinks = new Set<string>();
    for (const page of doc.pages) {
      if (Array.isArray(page.texts)) {
        for (const textObj of page.texts) {
          if (textObj.content) {
            const matches = textObj.content.match(/\[\[([^\]\r\n]+)\]\]/g);
            if (matches) {
              matches.forEach(m => wikilinks.add(m));
            }
          }
        }
      }
    }

    const linksLine = wikilinks.size > 0 ? `\n> Links: ${Array.from(wikilinks).join(", ")}` : "";
    const frontmatter = this.mergeFrontmatter(options.existingFrontmatter, [
      [NOTE_PAGES_FRONTMATTER_KEY, "true"],
      ["notepages-version", String(doc.metadata.schemaVersion || CURRENT_SCHEMA_VERSION)],
      ["title", `"${escapedTitle}"`],
      ["page-count", String(pageCount)],
      ["updated", `"${updatedDate}"`]
    ]);

    return `---
${frontmatter}
---

> [!NOTE] NotePages Notebook
> Pages: ${pageCount} | Size: ${doc.metadata.defaultPageSize} ${doc.metadata.defaultOrientation}
> Last modified: ${updatedDate}${linksLine}

\`\`\`notepages-data
${jsonBlock}
\`\`\`
`;
  }

  static deserializeDocument(raw: string): DeserializationResult {
    const searchStart = this.getFrontmatterEndOffset(raw);
    const startTag = "```notepages-data";
    const startIndex = raw.indexOf(startTag, searchStart);
    if (startIndex === -1) {
      return {
        success: false,
        error: "Missing ```notepages-data opening delimiter",
        isCorrupted: true
      };
    }

    const newlineAfterStart = raw.indexOf("\n", startIndex + startTag.length);
    if (newlineAfterStart === -1) {
      return {
        success: false,
        error: "Malformed ```notepages-data delimiter line",
        isCorrupted: true
      };
    }

    const closingFenceRegex = /\r?\n[ \t]*```[ \t]*(?=\r?\n|$)/g;
    closingFenceRegex.lastIndex = newlineAfterStart;
    let endIndex = -1;
    let fenceMatch: RegExpExecArray | null;
    while ((fenceMatch = closingFenceRegex.exec(raw)) !== null) {
      endIndex = fenceMatch.index;
    }
    if (endIndex === -1) {
      const fallbackIdx = raw.lastIndexOf("```");
      if (fallbackIdx > newlineAfterStart) {
        endIndex = fallbackIdx;
      }
    }
    if (endIndex === -1) {
      return {
        success: false,
        error: "Missing ``` closing delimiter for notepages-data block",
        isCorrupted: true
      };
    }

    const jsonPayload = raw.substring(newlineAfterStart + 1, endIndex).trim();
    if (!jsonPayload) {
      return {
        success: false,
        error: "Empty payload inside notepages-data block",
        isCorrupted: true
      };
    }

    let parsedObj: unknown;
    try {
      parsedObj = JSON.parse(jsonPayload);
    } catch (err) {
      return {
        success: false,
        error: `JSON parse error: ${err instanceof Error ? err.message : String(err)}`,
        rawPayload: jsonPayload,
        isCorrupted: true
      };
    }

    if (!parsedObj || typeof parsedObj !== "object" || Array.isArray(parsedObj)) {
      return {
        success: false,
        error: "Payload does not contain a JSON object",
        rawPayload: jsonPayload,
        isCorrupted: true
      };
    }

    const candidate = parsedObj as Record<string, unknown>;
    const meta = candidate.metadata as Record<string, unknown> | undefined;
    const version = meta && typeof meta.schemaVersion === "number" ? meta.schemaVersion : 0;

    if (version > CURRENT_SCHEMA_VERSION) {
      return {
        success: false,
        error: `Document schema version ${version} is newer than supported version ${CURRENT_SCHEMA_VERSION}. Please update the plugin.`,
        rawPayload: jsonPayload,
        isCorrupted: false
      };
    }

    let targetDoc: NotebookDocument;
    if (version < CURRENT_SCHEMA_VERSION) {
      targetDoc = this.migrateDocument(candidate);
    } else {
      const validation = this.validateDocument(candidate);
      if (!validation.valid) {
        return {
          success: false,
          error: `Document validation failed: ${validation.errors.join("; ")}`,
          rawPayload: jsonPayload,
          isCorrupted: true
        };
      }
      targetDoc = candidate as unknown as NotebookDocument;
    }

    return {
      success: true,
      document: targetDoc
    };
  }
}
