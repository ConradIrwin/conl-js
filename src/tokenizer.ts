type TokenKind =
  | { kind: "indent" }
  | { kind: "outdent" }
  | { kind: "item" }
  | { kind: "key"; content: string }
  | { kind: "scalar"; content: string }
  | { kind: "null" };

export type Token = { lno: number } & TokenKind;

function decodeLiteral(lno: number, input: string): string {
  if (!input.startsWith('"')) {
    return input;
  }
  if (!input.endsWith('"')) {
    throw new Error(lno + 1 + ": unclosed quotes");
  }

  return input
    .substring(1, input.length - 1)
    .replace(/\\\{([^}]*)\}|\\(.)|(")/g, (match, hex, c, q) => {
      if (q) {
        throw new Error(lno + 1 + `: characters after quotes`);
      }
      switch (c) {
        case "n":
          return "\n";
        case "r":
          return "\r";
        case "t":
          return "\t";
        case '"':
          return '"';
        case "\\":
          return "\\";
      }

      const codePoint = parseInt(hex, 16);
      if (
        hex?.length > 8 ||
        isNaN(codePoint) ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ) {
        throw new Error(lno + 1 + `: invalid escape code: ${match}`);
      }

      return String.fromCodePoint(codePoint);
    });
}

const SPLIT_LINE = new RegExp(
  `^(` +
    String.raw`(?:"(?:[^"\\]|\\.)*")?` + // Quoted key
    `(?:[^=; \t]|[ \t][^=; \t])*` + // Unquoted key
    `)` +
    `(?:[ \t]*=[ \t]*(` +
    String.raw`(?:"(?:[^"\\]|\\.)*")?` + // Quoted value
    `(?:[^; \t]|[ \t][^; \t])*` + // Unquoted value
    `))?` +
    `[ \t]*(?:;|$)`,
);

/**
 * Tokenize a CONL input string into raw tokens
 */
export function* tokens(input: string): Generator<Token> {
  const stack: { indent: string; kind?: "item" | "key" }[] = [{ indent: "" }];

  let lines = input.split(/[ \t]*(?:\r\n|\r|\n)/).map((line) => {
    let [_, indent, content] = line.match(/^([ \t]*)(.*)$/)!;
    return { indent, content };
  });

  // outdent? indent? (key | list), (scalar) ?

  let lno = 0;
  let lastLno = -1;
  while (lno < lines.length) {
    let { indent, content } = lines[lno];
    for (const token of tokenizeLine(indent, content)) {
      if (token.kind == "outdent" && lastLno > -1) {
        yield { lno: lastLno, kind: "null" };
        lastLno = -1;
      } else if (token.kind == "indent") {
        if (lastLno == -1) {
          throw new Error(lno + 1 + ": unexpected indent");
        }
        lastLno = -1;
      } else if (token.kind == "item" || token.kind == "key") {
        if (!stack.at(-1)!.kind) {
          stack.at(-1)!.kind = token.kind;
        } else if (stack.at(-1)!.kind == "item" && token.kind == "key") {
          throw new Error(lno + 1 + ": unexpected map key");
        } else if (stack.at(-1)!.kind == "key" && token.kind == "item") {
          throw new Error(lno + 1 + ": unexpected list item");
        }
        if (lastLno > -1) {
          yield { lno: lastLno, kind: "null" };
        }
        lastLno = lno;
      } else if (token.kind == "scalar" || token.kind == "multiline") {
        lastLno = -1;
      }
      if (token.kind == "multiline") {
        yield { lno: lno, ...consumeMultiline(indent) };
      } else {
        yield { lno: lno, ...token };
      }
    }

    lno += 1;
  }

  if (lastLno > -1) {
    yield { lno: lastLno, kind: "null" };
  }
  while (stack.length > 1) {
    stack.pop();
    yield { lno, kind: "outdent" };
  }

  function* tokenizeLine(
    indent: string,
    line: string,
  ): Generator<TokenKind | { kind: "multiline" }> {
    if (line === "" || line.startsWith(";")) {
      return;
    }

    while (!indent.startsWith(stack.at(-1)!.indent)) {
      stack.pop();
      yield { kind: "outdent" };
    }

    if (indent !== stack[stack.length - 1].indent) {
      stack.push({ indent });
      yield { kind: "indent" };
    }
    let [_, key, tail] = line.match(SPLIT_LINE)!;

    if (key) {
      yield { kind: "key", content: decodeLiteral(lno, key) };
    } else {
      yield { kind: "item" };
    }

    if (tail?.match(/^"""(?![ \t]*")/)) {
      yield { kind: "multiline" };
    } else if (tail) {
      yield { kind: "scalar", content: decodeLiteral(lno, tail) };
    }
  }

  function consumeMultiline(indent: string): TokenKind {
    while (lno + 1 < lines.length && lines[lno + 1].content == "") {
      lno++;
    }
    if (
      lno + 1 == lines.length ||
      !lines[lno + 1].indent.startsWith(indent) ||
      lines[lno + 1].indent == indent
    ) {
      throw new Error(lno + 1 + ": missing multiline value");
    }

    let { indent: prefix, content: result } = lines[++lno];
    while (
      lno + 1 < lines.length &&
      (lines[lno + 1].indent.startsWith(prefix) || lines[lno + 1].content == "")
    ) {
      let { indent, content } = lines[++lno];
      result += "\n" + indent.replace(prefix, "") + content;
    }
    return { kind: "scalar", content: result.replace(/\n+$/, "") };
  }
}
