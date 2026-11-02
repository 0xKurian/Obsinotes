import {
  CURRENT_SCHEMA_VERSION,
  DeserializationResult,
  NotebookDocument,
  NotebookMetadata,
  PageData,
  ShapeObject,
  StrokeObject,
  ValidationResult,
  NOTE_PAGES_FRONTMATTER_KEY
} from "../types";

export class DocumentSerializer {
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
      if (meta.defaultPageSize !== "A4" && meta.defaultPageSize !== "Letter" && meta.defaultPageSize !== "Custom") {
        errors.push("metadata.defaultPageSize must be 'A4', 'Letter', or 'Custom'");
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
    if (typeof p.pageNumber !== "number" || p.pageNumber < 1) {
      errors.push(`${prefix}.pageNumber must be a positive integer`);
    }

    if (!p.dimensions || typeof p.dimensions !== "object") {
      errors.push(`${prefix}.dimensions must be an object`);
    } else {
      const dim = p.dimensions as Record<string, unknown>;
      if (typeof dim.width !== "number" || dim.width <= 0) {
        errors.push(`${prefix}.dimensions.width must be a positive number`);
      }
      if (typeof dim.height !== "number" || dim.height <= 0) {
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
      if (typeof tmpl.spacing !== "number" || tmpl.spacing <= 0) {
        errors.push(`${prefix}.template.spacing must be a positive number`);
      }
      if (typeof tmpl.opacity !== "number" || tmpl.opacity < 0 || tmpl.opacity > 1) {
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
    if (typeof s.width !== "number" || s.width <= 0) {
      errors.push(`${prefix}.width must be a positive number`);
    }
    if (typeof s.opacity !== "number" || s.opacity < 0 || s.opacity > 1) {
      errors.push(`${prefix}.opacity must be a number between 0 and 1`);
    }
    if (!Array.isArray(s.points)) {
      errors.push(`${prefix}.points must be an array`);
    } else {
      for (let i = 0; i < s.points.length; i++) {
        const pt = s.points[i];
        if (!pt || typeof pt !== "object" || typeof pt.x !== "number" || typeof pt.y !== "number") {
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
    if (typeof sh.strokeWidth !== "number" || sh.strokeWidth <= 0) {
      errors.push(`${prefix}.strokeWidth must be a positive number`);
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
    if (typeof t.width !== "number" || t.width < 0) {
      errors.push(`${prefix}.width must be a non-negative number`);
    }
    if (typeof t.height !== "number" || t.height < 0) {
      errors.push(`${prefix}.height must be a non-negative number`);
    }
    if (typeof t.fontSize !== "number" || t.fontSize <= 0) {
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
    if (typeof img.width !== "number" || img.width <= 0) {
      errors.push(`${prefix}.width must be a positive number`);
    }
    if (typeof img.height !== "number" || img.height <= 0) {
      errors.push(`${prefix}.height must be a positive number`);
    }

    return errors;
  }

  static migrateDocument(rawObj: Record<string, unknown>): NotebookDocument {
    const now = Date.now();
    const existingMeta = (rawObj.metadata && typeof rawObj.metadata === "object"
      ? (rawObj.metadata as Record<string, unknown>)
      : {}) as Record<string, unknown>;

    const metadata: NotebookMetadata = {
      title: typeof existingMeta.title === "string"
        ? existingMeta.title
        : typeof rawObj.title === "string"
        ? (rawObj.title as string)
        : "Untitled Notebook",
      createdAt: typeof existingMeta.createdAt === "number" ? existingMeta.createdAt : now,
      updatedAt: typeof existingMeta.updatedAt === "number" ? existingMeta.updatedAt : now,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      defaultPageSize: existingMeta.defaultPageSize === "Letter" ? "Letter" : "A4",
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
          pageNumber: idx + 1,
          dimensions: {
            width: typeof dim.width === "number" && dim.width > 0 ? dim.width : 595.28,
            height: typeof dim.height === "number" && dim.height > 0 ? dim.height : 841.89,
            unit: "pt"
          },
          orientation: rp.orientation === "landscape" ? "landscape" : "portrait",
          template: {
            type: typeof tmpl.type === "string" ? (tmpl.type as PageData["template"]["type"]) : "ruled",
            backgroundColor: typeof tmpl.backgroundColor === "string" ? tmpl.backgroundColor : "#ffffff",
            lineColor: typeof tmpl.lineColor === "string" ? tmpl.lineColor : "#e2e8f0",
            spacing: typeof tmpl.spacing === "number" && tmpl.spacing > 0 ? tmpl.spacing : 24,
            opacity: typeof tmpl.opacity === "number" ? tmpl.opacity : 0.8
          },
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

  static serializeDocument(doc: NotebookDocument): string {
    const pageCount = doc.pages.length;
    const title = doc.metadata.title;
    const updatedDate = new Date(doc.metadata.updatedAt).toISOString();
    const jsonBlock = JSON.stringify(doc, null, 2);

    const wikilinks = new Set<string>();
    for (const page of doc.pages) {
      if (Array.isArray(page.texts)) {
        for (const textObj of page.texts) {
          if (textObj.content) {
            const matches = textObj.content.match(/\[\[([^\]]+)\]\]/g);
            if (matches) {
              matches.forEach(m => wikilinks.add(m));
            }
          }
        }
      }
    }

    const linksLine = wikilinks.size > 0 ? `\n> Links: ${Array.from(wikilinks).join(", ")}` : "";

    return `---
${NOTE_PAGES_FRONTMATTER_KEY}: true
notepages-version: ${doc.metadata.schemaVersion || CURRENT_SCHEMA_VERSION}
title: "${title.replace(/"/g, '\\"')}"
page-count: ${pageCount}
updated: "${updatedDate}"
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
    const startTag = "```notepages-data";
    const startIndex = raw.indexOf(startTag);
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

    const endIndex = raw.indexOf("```", newlineAfterStart);
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
