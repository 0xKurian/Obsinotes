import { describe, it } from "node:test";
import assert from "node:assert";
import { tokenizeText } from "../src/text/TextTokenizer";

describe("TextTokenizer", () => {
  it("parses empty string into empty token array", () => {
    const tokens = tokenizeText("");
    assert.strictEqual(tokens.length, 0);
  });

  it("parses plain text without tokens", () => {
    const tokens = tokenizeText("Hello world this is plain text");
    assert.strictEqual(tokens.length, 1);
    assert.strictEqual(tokens[0].type, "text");
    assert.strictEqual(tokens[0].value, "Hello world this is plain text");
  });

  it("parses inline LaTeX math formulas", () => {
    const tokens = tokenizeText("Energy formula is $E = mc^2$ in physics");
    assert.strictEqual(tokens.length, 3);
    assert.strictEqual(tokens[0].type, "text");
    assert.strictEqual(tokens[0].value, "Energy formula is ");
    assert.strictEqual(tokens[1].type, "math-inline");
    assert.strictEqual(tokens[1].value, "E = mc^2");
    assert.strictEqual(tokens[2].type, "text");
    assert.strictEqual(tokens[2].value, " in physics");
  });

  it("parses display LaTeX math blocks", () => {
    const tokens = tokenizeText("Before $$\n\\int_0^1 x^2 dx = \\frac{1}{3}\n$$ After");
    assert.strictEqual(tokens.length, 3);
    assert.strictEqual(tokens[0].type, "text");
    assert.strictEqual(tokens[1].type, "math-display");
    assert.strictEqual(tokens[1].value, "\\int_0^1 x^2 dx = \\frac{1}{3}");
    assert.strictEqual(tokens[2].type, "text");
  });

  it("respects escaped dollar signs without creating math tokens", () => {
    const tokens = tokenizeText("Price is \\$100 and tax is \\$10.");
    assert.strictEqual(tokens.length, 1);
    assert.strictEqual(tokens[0].type, "text");
    assert.strictEqual(tokens[0].value, "Price is $100 and tax is $10.");
  });

  it("parses standard Wikilinks without alias", () => {
    const tokens = tokenizeText("Refer to [[Linear Algebra]] for matrices");
    assert.strictEqual(tokens.length, 3);
    assert.strictEqual(tokens[0].type, "text");
    assert.strictEqual(tokens[1].type, "wikilink");
    assert.strictEqual(tokens[1].target, "Linear Algebra");
    assert.strictEqual(tokens[1].value, "Linear Algebra");
    assert.strictEqual(tokens[1].alias, undefined);
    assert.strictEqual(tokens[2].type, "text");
  });

  it("parses aliased Wikilinks", () => {
    const tokens = tokenizeText("See [[Calculus 101|Introductory Calculus]] here");
    assert.strictEqual(tokens.length, 3);
    assert.strictEqual(tokens[1].type, "wikilink");
    assert.strictEqual(tokens[1].target, "Calculus 101");
    assert.strictEqual(tokens[1].alias, "Introductory Calculus");
    assert.strictEqual(tokens[1].value, "Introductory Calculus");
  });

  it("parses complex mixture of text, math, and wikilinks", () => {
    const input = "Study [[Mechanics]] with formula $F = ma$ and review [[Quantum|Physics]] with $$\\psi$$ done";
    const tokens = tokenizeText(input);
    assert.strictEqual(tokens.length, 9);
    assert.strictEqual(tokens[0].value, "Study ");
    assert.strictEqual(tokens[1].type, "wikilink");
    assert.strictEqual(tokens[1].target, "Mechanics");
    assert.strictEqual(tokens[2].value, " with formula ");
    assert.strictEqual(tokens[3].type, "math-inline");
    assert.strictEqual(tokens[3].value, "F = ma");
    assert.strictEqual(tokens[4].value, " and review ");
    assert.strictEqual(tokens[5].type, "wikilink");
    assert.strictEqual(tokens[5].target, "Quantum");
    assert.strictEqual(tokens[5].alias, "Physics");
    assert.strictEqual(tokens[6].value, " with ");
    assert.strictEqual(tokens[7].type, "math-display");
    assert.strictEqual(tokens[7].value, "\\psi");
    assert.strictEqual(tokens[8].value, " done");
  });
});
