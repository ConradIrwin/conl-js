type TokenKind =
  | { kind: "indent" }
  | { kind: "outdent" }
  | { kind: "item" }
  | { kind: "key"; content: string }
  | { kind: "scalar"; content: string }
  | { kind: "null" };

export type Token = { lno: number } & TokenKind;

/**
 * Decode a quoted (or unqouted) literal.
 */
export function decodeLiteral(lno: number, input: string): string {
  if (!input.startsWith('"')) {
    return input;
  }
  if (!input.endsWith('"')) {
    throw new Error(lno + ": unclosed quotes");
  }

  return input
    .substring(1, input.length - 1)
    .replace(/\\\{([0-9a-fA-F]){1,8}\}|\\(.)/g, (match, hex, c) => {
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
        isNaN(codePoint) ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ) {
        throw new Error(`invalid escape code: ${match}`);
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
function* tokenize(input: string): Generator<Token> {
  const stack: string[] = [""];
  let multilineIndent: string | undefined;
  let multilineValue = "";
  let multilineLno = 0;

  let lno = 0;

  function* tokenizeLine(indent: string, line: string): Generator<TokenKind> {
    if (multilineIndent) {
      if (indent.startsWith(multilineIndent) || line === "") {
        multilineValue += "\n" + indent.replace(multilineIndent, "") + line;
        return;
      }
      yield { kind: "scalar", content: multilineValue };
      multilineIndent = undefined;
      multilineValue = "";
    } else if (multilineIndent === "") {
      if (line == "") {
        return;
      } else if (indent.startsWith(stack.at(-1)!) && indent !== stack.at(-1)) {
        multilineIndent = indent;
        multilineValue = line;
        multilineLno = lno;
        return;
      }
      throw new Error(lno + ": missing multiline value");
    }

    if (line === "" || line.startsWith(";")) {
      return;
    }

    while (!indent.startsWith(stack.at(-1)!)) {
      stack.pop();
      yield { kind: "outdent" };
    }

    if (indent !== stack[stack.length - 1]) {
      stack.push(indent);
      yield { kind: "indent" };
    }
    let [_, key, tail] = line.match(SPLIT_LINE)!;

    if (key) {
      yield { kind: "key", content: decodeLiteral(lno, key) };
    } else {
      yield { kind: "item" };
    }

    if (!tail) {
      return;
    }

    if (tail.match(/^"""(?![ \t]*")/)) {
      multilineIndent = "";
      return;
    }

    yield { kind: "scalar", content: decodeLiteral(lno, tail) };
  }

  for (let line of input.split(/[ \t]*(?:\r\n|\r|\n)/)) {
    lno += 1;
    let [_line, indent, content] = line.match(/^([ \t]*)(.*)$/)!;
    for (const token of tokenizeLine(indent, content)) {
      yield { lno, ...token };
    }
  }

  if (multilineIndent == "") {
    throw new Error("missing multiline value");
  }
  if (multilineIndent) {
    yield {
      lno: multilineLno,
      kind: "scalar",
      content: multilineValue,
    };
  }
}

/**
 * Tokens iterates over tokens in the input string.
 *
 * The raw tokens are post-processed to maintain the invariants that:
 *   - The first token (if present) is either "item" or "key"
 *   - After an "item" or "key", you will get either "scalar", "null", or "indent"
 *   - After an "indent", you will get either "item" or "key"
 *   - After "scalar" or "null", you will get either "item" or "key" (or "outdent")
 *   - At a given indentation level, you will only find either "item"s, or "keys", not both
 *   - Each "indent" is paired with an "outdent".
 *
 * An error will be thrown on invalid CONL,
 */
export function* tokens(
  input: Buffer | string,
): Generator<Token, void, unknown> {
  const states: {
    kind?: "item" | "key";
    hasKey?: boolean;
  }[] = [{}];
  let lastLno = 0;
  const inputStr = typeof input === "string" ? input : input.toString("utf8");

  for (const token of tokenize(inputStr)) {
    const state = states.at(-1)!;
    lastLno = token.lno;

    switch (token.kind) {
      case "indent":
        if (!state.hasKey) {
          throw new Error(token.lno + ": unexpected indent");
        }
        state.hasKey = false;
        states.push({});
        break;

      case "outdent":
        states.pop();
        if (state.hasKey) {
          yield {
            lno: token.lno,
            kind: "null",
          };
        }
        break;

      case "item":
      case "key":
        if (!state.kind) {
          state.kind = token.kind;
        }
        if (state.hasKey) {
          yield {
            lno: token.lno,
            kind: "null",
          };
        }
        state.hasKey = true;

        if (state.kind === "key" && token.kind === "item") {
          throw new Error(token.lno + ": unexpected list item");
        }
        if (state.kind === "item" && token.kind === "key") {
          throw new Error(token.lno + ": unexpected map key");
        }
        break;

      case "scalar":
        state.hasKey = false;
        break;
    }

    yield token;
  }

  while (states.length > 0) {
    const state = states.at(-1)!;
    if (state.hasKey) {
      yield {
        lno: lastLno,
        kind: "null",
      };
    }
    if (states.length > 1) {
      yield {
        lno: lastLno,
        kind: "outdent",
      };
    }
    states.pop();
  }
}
