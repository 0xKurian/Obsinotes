import { test, describe } from "node:test";
import assert from "node:assert";
import { validateNotebookTitle } from "../src/modal/QuickRenameModal";

describe("Quick Rename Validation", () => {
  test("accepts a normal valid notebook title", () => {
    const res = validateNotebookTitle("My Study Notes");
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.sanitizedTitle, "My Study Notes");
    assert.strictEqual(res.error, undefined);
  });

  test("accepts unicode characters in notebook title", () => {
    const res = validateNotebookTitle("Sổ tay học tập tiếng Việt 2026");
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.sanitizedTitle, "Sổ tay học tập tiếng Việt 2026");
  });

  test("rejects empty or whitespace-only title", () => {
    const emptyRes = validateNotebookTitle("");
    assert.strictEqual(emptyRes.valid, false);
    assert.ok(emptyRes.error?.includes("empty"));

    const spaceRes = validateNotebookTitle("    ");
    assert.strictEqual(spaceRes.valid, false);
    assert.ok(spaceRes.error?.includes("empty"));
  });

  test("rejects title starting with a dot", () => {
    const res = validateNotebookTitle(".hidden-notes");
    assert.strictEqual(res.valid, false);
    assert.ok(res.error?.includes("dot"));
  });

  test("rejects titles with filesystem illegal characters", () => {
    const illegalChars = ["/", "\\", ":", "*", "?", '"', "<", ">", "|"];
    for (const char of illegalChars) {
      const res = validateNotebookTitle(`Invalid${char}Note`);
      assert.strictEqual(res.valid, false, `Character ${char} must be rejected`);
      assert.ok(res.error?.includes("illegal characters"));
    }
  });

  test("rejects title exceeding 250 characters", () => {
    const longName = "A".repeat(251);
    const res = validateNotebookTitle(longName);
    assert.strictEqual(res.valid, false);
    assert.ok(res.error?.includes("250"));
  });

  test("strips .gnote extension if accidentally entered by user", () => {
    const res = validateNotebookTitle("Physics Exam Prep.gnote");
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.sanitizedTitle, "Physics Exam Prep");
  });

  test("detects duplicate file names in the same folder", () => {
    const siblings = ["Lecture 1", "Lecture 2", "Calculus"];
    const dupRes = validateNotebookTitle("lecture 2", siblings, "Lecture 1");
    assert.strictEqual(dupRes.valid, false);
    assert.ok(dupRes.error?.includes("already exists"));

    const uniqueRes = validateNotebookTitle("Lecture 3", siblings, "Lecture 1");
    assert.strictEqual(uniqueRes.valid, true);
  });

  test("allows keeping the same title unchanged", () => {
    const siblings = ["Lecture 1", "Lecture 2"];
    const sameRes = validateNotebookTitle("Lecture 1", siblings, "Lecture 1");
    assert.strictEqual(sameRes.valid, true);
  });
});
