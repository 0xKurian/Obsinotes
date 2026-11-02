export interface TextToken {
  type: "text" | "wikilink" | "math-inline" | "math-display";
  raw: string;
  value: string;
  target?: string;
  alias?: string;
}

export function tokenizeText(input: string): TextToken[] {
  const tokens: TextToken[] = [];
  if (!input) {
    return tokens;
  }

  let index = 0;
  const len = input.length;
  let textBuffer = "";

  function flushText(): void {
    if (textBuffer.length > 0) {
      tokens.push({
        type: "text",
        raw: textBuffer,
        value: textBuffer
      });
      textBuffer = "";
    }
  }

  while (index < len) {
    if (input[index] === "\\" && index + 1 < len && input[index + 1] === "$") {
      textBuffer += "$";
      index += 2;
      continue;
    }

    if (input.startsWith("$$", index)) {
      const closingIndex = input.indexOf("$$", index + 2);
      if (closingIndex !== -1) {
        flushText();
        const formula = input.substring(index + 2, closingIndex);
        tokens.push({
          type: "math-display",
          raw: input.substring(index, closingIndex + 2),
          value: formula.trim()
        });
        index = closingIndex + 2;
        continue;
      }
    }

    if (input[index] === "$" && (index === 0 || input[index - 1] !== "\\")) {
      const nextDollar = input.indexOf("$", index + 1);
      if (nextDollar !== -1 && !input.substring(index + 1, nextDollar).includes("\n")) {
        flushText();
        const formula = input.substring(index + 1, nextDollar);
        tokens.push({
          type: "math-inline",
          raw: input.substring(index, nextDollar + 1),
          value: formula.trim()
        });
        index = nextDollar + 1;
        continue;
      }
    }

    if (input.startsWith("[[", index)) {
      const closingIndex = input.indexOf("]]", index + 2);
      if (closingIndex !== -1) {
        flushText();
        const rawLink = input.substring(index, closingIndex + 2);
        const inner = input.substring(index + 2, closingIndex).trim();
        let target = inner;
        let alias: string | undefined = undefined;

        const pipePos = inner.indexOf("|");
        if (pipePos !== -1) {
          target = inner.substring(0, pipePos).trim();
          alias = inner.substring(pipePos + 1).trim();
        }

        tokens.push({
          type: "wikilink",
          raw: rawLink,
          value: alias || target,
          target,
          alias
        });
        index = closingIndex + 2;
        continue;
      }
    }

    textBuffer += input[index];
    index++;
  }

  flushText();
  return tokens;
}
