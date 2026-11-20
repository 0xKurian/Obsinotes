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

    const fastValidation = DocumentSerializer.fastValidateDocumentForSave(doc);
    assert.strictEqual(fastValidation.valid, true);
    assert.strictEqual(fastValidation.errors.length, 0);
  });

  it("fastValidateDocumentForSave catches structural flaws without iterating points", () => {
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
          pageNumber: 0,
          dimensions: { width: -10, height: 0 },
          orientation: "diagonal",
          strokes: "not-an-array"
        }
      ]
    };

    const result = DocumentSerializer.fastValidateDocumentForSave(invalidDoc);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.length >= 6);
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

  it("validates and serializes all new page size presets (A3, A5, B5, 16:9, Square, Custom)", () => {
    const doc = createSampleDocument();
    const presets = ["A3", "A5", "B5", "16:9", "Square", "Custom"] as const;

    for (const preset of presets) {
      doc.metadata.defaultPageSize = preset;
      const valResult = DocumentSerializer.validateDocument(doc);
      assert.strictEqual(valResult.valid, true, `Validation failed for preset ${preset}: ${valResult.errors.join(", ")}`);

      const serialized = DocumentSerializer.serializeDocument(doc);
      const deserialized = DocumentSerializer.deserializeDocument(serialized);
      assert.strictEqual(deserialized.success, true);
      if (deserialized.success) {
        assert.strictEqual(deserialized.document.metadata.defaultPageSize, preset);
      }
    }
  });

  describe("frontmatter preservation (issue #2)", () => {
    it("reproduces issue #2: preserves user-added properties like tags: [class] across save cycles", () => {
      const doc = createSampleDocument();
      const initial = DocumentSerializer.serializeDocument(doc);

      // Simulate user adding `tags: [class]` to frontmatter
      const withUserProp = initial.replace(
        "\n---\n",
        "\ntags: [class]\nstatus: in-progress\n---\n"
      );

      const extracted = DocumentSerializer.extractFrontmatter(withUserProp);
      assert.ok(extracted !== null);
      assert.ok(extracted.includes("tags: [class]"));
      assert.ok(extracted.includes("status: in-progress"));

      // Simulate drawing a stroke and saving again
      doc.metadata.updatedAt = 1730009999;
      const saved = DocumentSerializer.serializeDocument(doc, {
        existingFrontmatter: extracted
      });

      const savedFm = DocumentSerializer.extractFrontmatter(saved);
      assert.ok(savedFm !== null);
      assert.ok(savedFm.includes("tags: [class]"));
      assert.ok(savedFm.includes("status: in-progress"));
      assert.ok(savedFm.includes(`updated: "${new Date(1730009999).toISOString()}"`));

      // Verify round-trip deserialization still works
      const deserialized = DocumentSerializer.deserializeDocument(saved);
      assert.strictEqual(deserialized.success, true);
    });

    it("updates plugin-owned keys in place without duplicating them", () => {
      const doc = createSampleDocument();
      const existing = [
        "tags: [math]",
        "notepages-plugin: true",
        "notepages-version: 1",
        'title: "Old Title"',
        "page-count: 1",
        'updated: "2020-01-01T00:00:00.000Z"',
        "author: Alice"
      ].join("\n");

      doc.metadata.title = "Renamed Notebook";
      doc.metadata.updatedAt = 1730010000;
      const saved = DocumentSerializer.serializeDocument(doc, {
        existingFrontmatter: existing
      });
      const fm = DocumentSerializer.extractFrontmatter(saved)!;

      const expectedLines = [
        "tags: [math]",
        "notepages-plugin: true",
        "notepages-version: 1",
        'title: "Renamed Notebook"',
        "page-count: 2",
        `updated: "${new Date(1730010000).toISOString()}"`,
        "author: Alice"
      ];
      assert.strictEqual(fm, expectedLines.join("\n"));
    });

    it("preserves multiline YAML lists (indented and unindented), block scalars, and nested objects", () => {
      const doc = createSampleDocument();
      const existing = [
        "notepages-plugin: true",
        "notepages-version: 1",
        'title: "Test Serialization Notebook"',
        "page-count: 2",
        'updated: "2020-01-01T00:00:00.000Z"',
        "tags:",
        "  - class",
        "  - semester-1",
        "aliases:",
        "- Physics Notes",
        "- Lecture 1",
        "summary: |",
        "  First paragraph.",
        "",
        "  Second paragraph with: colon.",
        "nested:",
        "  course:",
        "    code: CS101",
        "    credits: 3"
      ].join("\n");

      const saved = DocumentSerializer.serializeDocument(doc, {
        existingFrontmatter: existing
      });
      const fm = DocumentSerializer.extractFrontmatter(saved)!;

      assert.ok(fm.includes("tags:\n  - class\n  - semester-1"));
      assert.ok(fm.includes("aliases:\n- Physics Notes\n- Lecture 1"));
      assert.ok(fm.includes("summary: |\n  First paragraph.\n\n  Second paragraph with: colon."));
      assert.ok(fm.includes("nested:\n  course:\n    code: CS101\n    credits: 3"));
    });

    it("preserves key ordering, comments, and blank line separators", () => {
      const doc = createSampleDocument();
      const existing = [
        "# Plugin metadata",
        "notepages-plugin: true",
        "notepages-version: 1",
        'title: "Old"',
        "page-count: 1",
        'updated: "2020-01-01T00:00:00.000Z"',
        "",
        "# User properties",
        "status: active",
        "priority: high"
      ].join("\n");

      const saved = DocumentSerializer.serializeDocument(doc, {
        existingFrontmatter: existing
      });
      const fm = DocumentSerializer.extractFrontmatter(saved)!;

      const expected = [
        "# Plugin metadata",
        "notepages-plugin: true",
        "notepages-version: 1",
        'title: "Test Serialization Notebook"',
        "page-count: 2",
        `updated: "${new Date(doc.metadata.updatedAt).toISOString()}"`,
        "",
        "# User properties",
        "status: active",
        "priority: high"
      ].join("\n");
      assert.strictEqual(fm, expected);
    });

    it("produces identical output to the original template when existingFrontmatter is omitted", () => {
      const doc = createSampleDocument();
      const saved = DocumentSerializer.serializeDocument(doc);
      const updatedDate = new Date(doc.metadata.updatedAt).toISOString();

      const expectedHeader = [
        "---",
        "notepages-plugin: true",
        "notepages-version: 1",
        'title: "Test Serialization Notebook"',
        "page-count: 2",
        `updated: "${updatedDate}"`,
        "---"
      ].join("\n");

      assert.ok(saved.startsWith(expectedHeader + "\n\n> [!NOTE] NotePages Notebook"));
    });

    it("handles CRLF files, missing frontmatter, and empty frontmatter cleanly", () => {
      const doc = createSampleDocument();

      // CRLF frontmatter
      const crlfRaw = "---\r\nnotepages-plugin: true\r\ntags: [crlf]\r\n---\r\n\r\nbody";
      const extractedCrlf = DocumentSerializer.extractFrontmatter(crlfRaw);
      assert.strictEqual(extractedCrlf, "notepages-plugin: true\r\ntags: [crlf]");
      const savedCrlf = DocumentSerializer.serializeDocument(doc, {
        existingFrontmatter: extractedCrlf
      });
      const fmCrlf = DocumentSerializer.extractFrontmatter(savedCrlf)!;
      assert.ok(fmCrlf.includes("tags: [crlf]"));
      assert.ok(!fmCrlf.includes("\r"));

      // Missing frontmatter
      assert.strictEqual(DocumentSerializer.extractFrontmatter("Just body text"), null);
      assert.strictEqual(DocumentSerializer.getFrontmatterEndOffset("Just body text"), 0);

      // Empty frontmatter
      assert.strictEqual(DocumentSerializer.extractFrontmatter("---\n---\nbody"), "");
      const savedEmpty = DocumentSerializer.serializeDocument(doc, {
        existingFrontmatter: ""
      });
      const fmEmpty = DocumentSerializer.extractFrontmatter(savedEmpty)!;
      assert.strictEqual(fmEmpty.split("\n").length, 5);
    });

    it("replaces user-overridden, duplicate, quoted, or multiline plugin keys cleanly", () => {
      const doc = createSampleDocument();
      const existing = [
        "notepages-plugin: false",
        '"page-count": 99',
        "page-count: 100",
        "title: |",
        "  multiline",
        "  stale title",
        "tags: [keep-me]"
      ].join("\n");

      const saved = DocumentSerializer.serializeDocument(doc, {
        existingFrontmatter: existing
      });
      const fm = DocumentSerializer.extractFrontmatter(saved)!;

      assert.ok(fm.includes("notepages-plugin: true"));
      assert.ok(fm.includes("page-count: 2"));
      assert.ok(fm.includes('title: "Test Serialization Notebook"'));
      assert.ok(fm.includes("tags: [keep-me]"));
      assert.ok(!fm.includes("stale title"));
      assert.ok(!fm.includes("99"));
      assert.ok(!fm.includes("100"));

      // Verify each plugin key appears exactly once
      const lines = fm.split("\n");
      assert.strictEqual(lines.filter((l) => l.startsWith("page-count:")).length, 1);
      assert.strictEqual(lines.filter((l) => l.startsWith("title:")).length, 1);
      assert.strictEqual(lines.filter((l) => l.startsWith("notepages-plugin:")).length, 1);
    });

    it("deserializes correctly even if a frontmatter property contains the notepages-data fence string", () => {
      const doc = createSampleDocument();
      const existing = [
        "notepages-plugin: true",
        'note: "example ```notepages-data fence inside yaml"'
      ].join("\n");

      const saved = DocumentSerializer.serializeDocument(doc, {
        existingFrontmatter: existing
      });

      const result = DocumentSerializer.deserializeDocument(saved);
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.document.metadata.title, doc.metadata.title);
        assert.strictEqual(result.document.pages.length, 2);
      }
    });

    it("escapes backslashes and double quotes in title for valid YAML", () => {
      const doc = createSampleDocument();
      doc.metadata.title = 'Path C:\\Notes\\"Final"\\';
      const saved = DocumentSerializer.serializeDocument(doc);
      const fm = DocumentSerializer.extractFrontmatter(saved)!;

      assert.ok(fm.includes('title: "Path C:\\\\Notes\\\\\\"Final\\"\\\\"'));
    });

    it("safely round-trips text boxes containing triple backticks without corrupting the document", () => {
      const doc = createSampleDocument();
      doc.pages[0].texts[0].content = "Code example:\n```js\nconsole.log('hi');\n```";
      const serialized = DocumentSerializer.serializeDocument(doc);
      const result = DocumentSerializer.deserializeDocument(serialized);

      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(
          result.document.pages[0].texts[0].content,
          "Code example:\n```js\nconsole.log('hi');\n```"
        );
      }
    });

    it("recovers legacy unescaped triple backticks inside notepages-data using final closing fence", () => {
      const doc = createSampleDocument();
      doc.pages[0].texts[0].content = "Legacy ``` fence inside text";
      const legacyRaw = `---\nnotepages-plugin: true\n---\n\n\`\`\`notepages-data\n${JSON.stringify(doc)}\n\`\`\`\n`;
      const result = DocumentSerializer.deserializeDocument(legacyRaw);

      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.document.pages[0].texts[0].content, "Legacy ``` fence inside text");
      }
    });

    it("preserves pdfSource, page title, and bookmarked flag during migrateDocument", () => {
      const legacyObj: Record<string, unknown> = {
        title: "Migrated PDF Notebook",
        pages: [
          {
            id: "p1",
            title: "Chapter 1",
            bookmarked: true,
            pdfSource: { pdfPath: "docs/book.pdf", pdfPageNumber: 3, svgPath: "docs/book_svg/book_p3.svg" },
            strokes: []
          }
        ]
      };
      const migrated = DocumentSerializer.migrateDocument(legacyObj);
      assert.strictEqual(migrated.pages[0].title, "Chapter 1");
      assert.strictEqual(migrated.pages[0].bookmarked, true);
      assert.deepStrictEqual(migrated.pages[0].pdfSource, {
        pdfPath: "docs/book.pdf",
        pdfPageNumber: 3,
        svgPath: "docs/book_svg/book_p3.svg"
      });
    });

    it("rejects NaN and Infinity in validateDocument and fastValidateDocumentForSave", () => {
      const doc = createSampleDocument();
      doc.pages[0].dimensions.width = Number.NaN;
      doc.pages[0].strokes[0].width = Number.POSITIVE_INFINITY;

      const fast = DocumentSerializer.fastValidateDocumentForSave(doc);
      const full = DocumentSerializer.validateDocument(doc);
      assert.strictEqual(fast.valid, false);
      assert.strictEqual(full.valid, false);
    });
  });
});
