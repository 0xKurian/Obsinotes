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
    if (input[index] === "\\" && index + 1 < len && input[index + 1] === "\\") {
      textBuffer += "\\";
      index += 2;
      continue;
    }

    if (input[index] === "\\" && index + 1 < len && input[index + 1] === "$") {
      textBuffer += "$";
      index += 2;
      continue;
    }

    if (input.startsWith("$$", index)) {
      let searchPos = index + 2;
      let closingIndex = -1;
      while (searchPos < len) {
        const candidate = input.indexOf("$$", searchPos);
        if (candidate === -1) break;
        if (candidate === 0 || input[candidate - 1] !== "\\") {
          closingIndex = candidate;
          break;
        }
        searchPos = candidate + 2;
      }
      if (closingIndex !== -1) {
        const formula = input.substring(index + 2, closingIndex);
        if (formula.trim().length > 0) {
          flushText();
          tokens.push({
            type: "math-display",
            raw: input.substring(index, closingIndex + 2),
            value: formula.trim()
          });
          index = closingIndex + 2;
          continue;
        }
      }
    }

    if (input[index] === "$" && (index === 0 || input[index - 1] !== "\\")) {
      let searchPos = index + 1;
      let nextDollar = -1;
      while (searchPos < len) {
        const candidate = input.indexOf("$", searchPos);
        if (candidate === -1) break;
        let slashCount = 0;
        let k = candidate - 1;
        while (k >= index + 1 && input[k] === "\\") {
          slashCount++;
          k--;
        }
        if (slashCount % 2 === 0) {
          nextDollar = candidate;
          break;
        }
        searchPos = candidate + 1;
      }
      if (nextDollar !== -1 && nextDollar > index + 1) {
        const formula = input.substring(index + 1, nextDollar);
        const charAfterOpen = input[index + 1];
        const charBeforeClose = input[nextDollar - 1];
        const charAfterClose = nextDollar + 1 < len ? input[nextDollar + 1] : "";
        const looksLikeCurrency =
          /\s/.test(charAfterOpen) ||
          /\s/.test(charBeforeClose) ||
          /\d/.test(charAfterClose);
        if (!formula.includes("\n") && !looksLikeCurrency && formula.trim().length > 0) {
          flushText();
          tokens.push({
            type: "math-inline",
            raw: input.substring(index, nextDollar + 1),
            value: formula.trim()
          });
          index = nextDollar + 1;
          continue;
        }
      }
    }

    if (input.startsWith("[[", index)) {
      const closingIndex = input.indexOf("]]", index + 2);
      if (closingIndex !== -1) {
        const rawBetween = input.substring(index + 2, closingIndex);
        if (!rawBetween.includes("\n") && !rawBetween.includes("[[") && rawBetween.trim().length > 0) {
          flushText();
          const rawLink = input.substring(index, closingIndex + 2);
          const inner = rawBetween.trim();
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
    }

    textBuffer += input[index];
    index++;
  }

  flushText();
  return tokens;
}
