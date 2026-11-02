import { describe, it } from "node:test";
import assert from "node:assert";
import {
  extractPdfInfo,
  extractSvgDimensions,
  sortSvgFilesByPageNumber
} from "../src/pdf/PdfBackgroundManager";

describe("PdfBackgroundManager - extractPdfInfo", () => {
  it("extracts page count from /Count token in PDF binary stream", () => {
    const fakePdfText = "%PDF-1.7\n1 0 obj\n<< /Type /Pages /Count 24 /Kids [] >>\nendobj\n%%EOF";
    const encoder = new TextEncoder();
    const buffer = encoder.encode(fakePdfText).buffer;

    const info = extractPdfInfo(buffer);
    assert.strictEqual(info.pageCount, 24);
  });

  it("extracts page dimensions from /MediaBox token", () => {
    const fakePdfText = "%PDF-1.4\n<< /Type /Page /MediaBox [ 0 0 612.00 792.00 ] >>\n%%EOF";
    const encoder = new TextEncoder();
    const buffer = encoder.encode(fakePdfText).buffer;

    const info = extractPdfInfo(buffer);
    assert.ok(info.dimensions !== undefined);
    if (info.dimensions) {
      assert.strictEqual(info.dimensions.width, 612);
      assert.strictEqual(info.dimensions.height, 792);
      assert.strictEqual(info.dimensions.unit, "pt");
    }
  });

  it("counts individual /Type /Page tokens when /Count is absent or 1", () => {
    const fakePdfText = `
%PDF-1.5
1 0 obj << /Type /Page >> endobj
2 0 obj << /Type /Page >> endobj
3 0 obj << /Type /Page >> endobj
%%EOF`;
    const encoder = new TextEncoder();
    const buffer = encoder.encode(fakePdfText).buffer;

    const info = extractPdfInfo(buffer);
    assert.strictEqual(info.pageCount, 3);
  });

  it("defaults to 1 page when no page structure tokens are found", () => {
    const fakePdfText = "%PDF-1.3\nempty stream data\n%%EOF";
    const encoder = new TextEncoder();
    const buffer = encoder.encode(fakePdfText).buffer;

    const info = extractPdfInfo(buffer);
    assert.strictEqual(info.pageCount, 1);
    assert.strictEqual(info.dimensions, undefined);
  });
});

describe("PdfBackgroundManager - extractSvgDimensions", () => {
  it("extracts width and height from viewBox attribute", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1200"><rect/></svg>`;
    const dims = extractSvgDimensions(svg);
    assert.strictEqual(dims.width, 800);
    assert.strictEqual(dims.height, 1200);
  });

  it("extracts width and height from width and height attributes", () => {
    const svg = `<svg width="600px" height="900px"><rect/></svg>`;
    const dims = extractSvgDimensions(svg);
    assert.strictEqual(dims.width, 600);
    assert.strictEqual(dims.height, 900);
  });

  it("falls back to standard dimensions when viewBox and width/height are absent", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>`;
    const dims = extractSvgDimensions(svg);
    assert.strictEqual(dims.width, 595.28);
    assert.strictEqual(dims.height, 841.89);
  });
});

describe("PdfBackgroundManager - sortSvgFilesByPageNumber", () => {
  it("sorts svg files naturally by page number token", () => {
    const files = [
      { name: "doc_p10.svg" },
      { name: "doc_p2.svg" },
      { name: "doc_p1.svg" },
      { name: "doc_p20.svg" },
      { name: "doc_p3.svg" }
    ];
    const sorted = sortSvgFilesByPageNumber(files);
    assert.deepStrictEqual(sorted.map((f) => f.name), [
      "doc_p1.svg",
      "doc_p2.svg",
      "doc_p3.svg",
      "doc_p10.svg",
      "doc_p20.svg"
    ]);
  });
});
