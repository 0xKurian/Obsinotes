import { describe, it } from "node:test";
import assert from "node:assert";
import { DocumentSerializer } from "../src/storage/DocumentSerializer";
import { NotebookDocument, PageData, StrokeObject, ShapeObject } from "../src/types";

describe("DocumentSerializer", () => {
  function createSampleDocument(): NotebookDocument {
    const stroke: StrokeObject = {
      id: "stroke_1",
      tool: "pen",
      color: "#1e293b",
      width: 2.5,
      opacity: 1,
      createdAt: 1730000000,
      bounds: { minX: 10, minY: 20, maxX: 100, maxY: 120 },
      points: [
        { x: 10, y: 20, pressure: 0.5, timestamp: 1730000000 },
        { x: 50, y: 70, pressure: 0.8, timestamp: 1730000016 },
        { x: 100, y: 120, pressure: 0.4, timestamp: 1730000032 }
      ]
    };

    const shape: ShapeObject = {
      id: "shape_1",
      type: "rectangle",
      color: "#2563eb",
      strokeWidth: 2,
      bounds: { minX: 150, minY: 200, maxX: 300, maxY: 350 },
      geometryData: { x: 150, y: 200, width: 150, height: 150 }
    };

    const page1: PageData = {
      id: "page_1",
      pageNumber: 1,
      dimensions: { width: 595.28, height: 841.89, unit: "pt" },
      orientation: "portrait",
      template: {
        type: "ruled",
        backgroundColor: "#ffffff",
        lineColor: "#e2e8f0",
        spacing: 24,
        opacity: 0.8
      },
      strokes: [stroke],
      shapes: [shape],
      texts: [
        {
          id: "text_1",
          x: 40,
          y: 40,
          width: 200,
          height: 30,
          content: "Chapter 1 [[Mathematics]] and [[Physics]]",
          fontSize: 16,
          fontFamily: "Inter",
          fontWeight: "normal",
          color: "#000000",
          textAlign: "left"
        }
      ],
      images: []
    };

    const page2: PageData = {
      id: "page_2",
      pageNumber: 2,
      dimensions: { width: 595.28, height: 841.89, unit: "pt" },
      orientation: "portrait",
      template: {
        type: "grid",
        backgroundColor: "#f8fafc",
        lineColor: "#cbd5e1",
        spacing: 20,
        opacity: 0.7
      },
      strokes: [],
      shapes: [],
      texts: [],
      images: []
    };

    return {
      metadata: {
        title: "Test Serialization Notebook",
        createdAt: 1730000000,
        updatedAt: 1730005000,
        schemaVersion: 1,
        defaultPageSize: "A4",
        defaultOrientation: "portrait",
        defaultTemplate: "ruled",
        defaultPaperBackground: "#ffffff",
        defaultLineColor: "#e2e8f0",
        defaultLineSpacing: 24
      },
      pages: [page1, page2]
    };
  }

  it("performs full round-trip serialization and deserialization", () => {
    const doc = createSampleDocument();
    const serialized = DocumentSerializer.serializeDocument(doc);

    assert.ok(serialized.includes("notepages-plugin: true"));
    assert.ok(serialized.includes("Test Serialization Notebook"));
    assert.ok(serialized.includes("```notepages-data"));
    assert.ok(serialized.includes("[[Mathematics]]"));
    assert.ok(serialized.includes("[[Physics]]"));

    const result = DocumentSerializer.deserializeDocument(serialized);
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.document.metadata.title, doc.metadata.title);
      assert.strictEqual(result.document.pages.length, 2);
      assert.strictEqual(result.document.pages[0].strokes.length, 1);
      assert.strictEqual(result.document.pages[0].strokes[0].points.length, 3);
      assert.strictEqual(result.document.pages[0].shapes.length, 1);
      assert.strictEqual(result.document.pages[0].shapes[0].type, "rectangle");
      assert.strictEqual(result.document.pages[1].template.type, "grid");
    }
  });

  it("validates document successfully on well-formed payload", () => {
    const doc = createSampleDocument();
    const validation = DocumentSerializer.validateDocument(doc);
    assert.strictEqual(validation.valid, true);
    assert.strictEqual(validation.errors.length, 0);
  });

  it("detects invalid metadata and malformed pages in validateDocument", () => {
    const invalidDoc = {
      metadata: {
        title: 123,
        createdAt: "invalid",
        schemaVersion: "1",
        defaultPageSize: "UnknownSize",
        defaultOrientation: "upside-down"
      },
      pages: [
        {
          id: "",
          pageNumber: -1,
          dimensions: { width: -10, height: 0, unit: "px" },
          orientation: "diagonal",
          template: { type: "wooden", backgroundColor: 123, spacing: -5, opacity: 2.5 },
          strokes: [
            {
              id: "",
              color: 123,
              width: -1,
              opacity: 2,
              points: "not-array",
              bounds: null
            }
          ],
          shapes: [
            {
              id: "",
              type: "octagon",
              strokeWidth: -2
            }
          ]
        }
      ]
    };

    const validation = DocumentSerializer.validateDocument(invalidDoc);
    assert.strictEqual(validation.valid, false);
    assert.ok(validation.errors.length >= 10);
  });

  it("migrates legacy unversioned or version 0 document cleanly", () => {
    const legacyObj: Record<string, unknown> = {
      title: "Legacy Math Notes",
      pages: [
        {
          id: "legacy_page_1",
          strokes: []
        }
      ]
    };

    const migrated = DocumentSerializer.migrateDocument(legacyObj);
    assert.strictEqual(migrated.metadata.schemaVersion, 1);
    assert.strictEqual(migrated.metadata.title, "Legacy Math Notes");
    assert.strictEqual(migrated.pages.length, 1);
    assert.strictEqual(migrated.pages[0].dimensions.unit, "pt");
    assert.strictEqual(migrated.pages[0].template.type, "ruled");
    assert.deepStrictEqual(migrated.pages[0].strokes, []);
  });

  it("rejects document created with higher unsupported schema version", () => {
    const futureDoc = {
      metadata: {
        title: "Future Notebook",
        createdAt: 1730000000,
        updatedAt: 1730000000,
        schemaVersion: 99,
        defaultPageSize: "A4",
        defaultOrientation: "portrait"
      },
      pages: []
    };

    const serialized = `---
notepages-plugin: true
notepages-version: 99
---

\`\`\`notepages-data
${JSON.stringify(futureDoc)}
\`\`\`
`;

    const result = DocumentSerializer.deserializeDocument(serialized);
    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.strictEqual(result.isCorrupted, false);
      assert.ok(result.error.includes("version 99 is newer"));
    }
  });

  it("detects missing opening delimiter", () => {
    const raw = "Just normal markdown text without notepages-data block";
    const result = DocumentSerializer.deserializeDocument(raw);
    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.strictEqual(result.isCorrupted, true);
      assert.ok(result.error.includes("Missing ```notepages-data opening delimiter"));
    }
  });

  it("detects unclosed delimiter", () => {
    const raw = "```notepages-data\n{\"metadata\":{}}";
    const result = DocumentSerializer.deserializeDocument(raw);
    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.strictEqual(result.isCorrupted, true);
      assert.ok(result.error.includes("Missing ``` closing delimiter"));
    }
  });

  it("detects malformed JSON syntax", () => {
    const raw = "```notepages-data\n{ invalid json content here !!!\n```";
    const result = DocumentSerializer.deserializeDocument(raw);
    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.strictEqual(result.isCorrupted, true);
      assert.ok(result.error.includes("JSON parse error"));
    }
  });

  it("serializes and deserializes a large document with 1000 strokes efficiently", () => {
    const doc = createSampleDocument();
    const largePage: PageData = { ...doc.pages[0], strokes: [] };
    for (let i = 0; i < 1000; i++) {
      largePage.strokes.push({
        id: `stroke_${i}`,
        tool: "pen",
        color: "#000000",
        width: 2,
        opacity: 1,
        createdAt: 1730000000 + i,
        bounds: { minX: i % 500, minY: (i * 2) % 700, maxX: (i % 500) + 20, maxY: ((i * 2) % 700) + 20 },
        points: [
          { x: i % 500, y: (i * 2) % 700, pressure: 0.5, timestamp: 1730000000 + i },
          { x: (i % 500) + 20, y: ((i * 2) % 700) + 20, pressure: 0.5, timestamp: 1730000000 + i + 10 }
        ]
      });
    }
    doc.pages = [largePage];

    const startTime = Date.now();
    const serialized = DocumentSerializer.serializeDocument(doc);
    const serializeDuration = Date.now() - startTime;

    assert.ok(serializeDuration < 300);

    const deserializeStartTime = Date.now();
    const result = DocumentSerializer.deserializeDocument(serialized);
    const deserializeDuration = Date.now() - deserializeStartTime;

    assert.ok(deserializeDuration < 300);
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.document.pages[0].strokes.length, 1000);
    }
  });
});
