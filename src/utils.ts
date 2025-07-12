/**
 * Utility functions for CONL string processing
 */

/**
 * Split a string into lines, handling different line endings
 */
export function* lines(
  input: string,
): Generator<[number, string], void, unknown> {
  const lineRegexp = /\r\n|\r|\n/g;
  let lno = 1;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = lineRegexp.exec(input)) !== null) {
    yield [lno, input.substring(lastIndex, match.index)];
    lastIndex = match.index + match[0].length;
    lno++;
  }

  // Yield the last line
  if (lastIndex < input.length || input.length === 0) {
    yield [lno, input.substring(lastIndex)];
  }
}

/**
 * Split a literal string, handling quoted and unquoted cases
 */
export function splitLiteral(input: string, key: boolean): [string, string] {
  if (input.startsWith('"')) {
    let wasEscape = false;
    for (let i = 1; i < input.length; i++) {
      const c = input[i];
      if (c === '"' && !wasEscape) {
        const [before, after] = splitUnquoted(input.substring(i + 1), key);
        if (before !== "") {
          return [input.substring(0, i + 1) + before, after];
        } else {
          return [input.substring(0, i + 1), after];
        }
      }
      wasEscape = c === "\\" && !wasEscape;
    }
    return [input, ""];
  }

  return splitUnquoted(input, key);
}

/**
 * Split an unquoted string
 */
export function splitUnquoted(input: string, key: boolean): [string, string] {
  if (key) {
    const equalsIndex = input.indexOf("=");
    if (equalsIndex >= 0) {
      const before = input.substring(0, equalsIndex);
      const semicolonIndex = before.indexOf(";");
      if (semicolonIndex >= 0) {
        return [
          before.substring(0, semicolonIndex).trimEnd(),
          input.substring(semicolonIndex),
        ];
      }
      return [before.trimEnd(), input.substring(equalsIndex)];
    }
  }

  const semicolonIndex = input.indexOf(";");
  if (semicolonIndex >= 0) {
    return [
      input.substring(0, semicolonIndex).trimEnd(),
      input.substring(semicolonIndex),
    ];
  }
  return [input.trimEnd(), ""];
}

/**
 * Decode a multiline string
 */
export function decodeMultiline(input: string): [string, string] {
  // In TypeScript, strings are always valid UTF-16, so we don't need UTF-8 validation
  return [input, ""];
}

/**
 * Decode a literal string, handling escape sequences
 */
export function decodeLiteral(input: string): [string, Error | null] {
  if (!input.startsWith('"')) {
    return [input, null];
  }

  const literalRegex = /^"((?:\\.|[^\\"])*)"$/;
  const match = input.match(literalRegex);

  if (!match) {
    if (!input.endsWith('"')) {
      return ["", new Error("unclosed quotes")];
    }
    return ["", new Error("characters after quotes")];
  }

  const content = match[1];
  let result = "";
  let badEscape = "";
  let i = 0;

  while (i < content.length) {
    if (content[i] === "\\" && i + 1 < content.length) {
      const nextChar = content[i + 1];

      switch (nextChar) {
        case "n":
          result += "\n";
          i += 2;
          break;
        case "r":
          result += "\r";
          i += 2;
          break;
        case "t":
          result += "\t";
          i += 2;
          break;
        case '"':
          result += '"';
          i += 2;
          break;
        case "\\":
          result += "\\";
          i += 2;
          break;
        case "{":
          // Handle Unicode escape
          const closeIndex = content.indexOf("}", i + 2);
          if (
            closeIndex === -1 ||
            closeIndex === i + 2 ||
            closeIndex - i > 10
          ) {
            if (!badEscape) {
              badEscape = content.substring(
                i,
                Math.min(i + 12, content.length),
              );
            }
            result += content.substring(i, i + 2);
            i += 2;
            break;
          }

          const hexCode = content.substring(i + 2, closeIndex);
          const codePoint = parseInt(hexCode, 16);

          if (
            isNaN(codePoint) ||
            codePoint > 0x10ffff ||
            (codePoint >= 0xd800 && codePoint <= 0xdfff)
          ) {
            if (!badEscape) {
              badEscape = content.substring(i, closeIndex + 1);
            }
            result += content.substring(i, closeIndex + 1);
            i = closeIndex + 1;
            break;
          }

          result += String.fromCodePoint(codePoint);
          i = closeIndex + 1;
          break;
        default:
          if (!badEscape) {
            badEscape = "\\" + nextChar;
          }
          result += content.substring(i, i + 2);
          i += 2;
      }
    } else {
      result += content[i];
      i++;
    }
  }

  if (badEscape) {
    return ["", new Error(`invalid escape code: ${badEscape}`)];
  }

  return [result, null];
}

/**
 * Check if a string is valid UTF-8 (in TypeScript this is always true for valid strings)
 */
export function checkUtf8(_content: string): Error | null {
  // JavaScript strings are UTF-16, so we don't need UTF-8 validation
  return null;
}

/**
 * Trim whitespace from the start of a string and return both parts
 */
export function trimLeft(str: string): [string, string] {
  const match = str.match(/^([ \t]*)(.*)/);
  if (match) {
    return [match[1], match[2]];
  }
  return ["", str];
}

/**
 * Cut a prefix from a string if it exists
 */
export function cutPrefix(str: string, prefix: string): [string, boolean] {
  if (str.startsWith(prefix)) {
    return [str.substring(prefix.length), true];
  }
  return [str, false];
}

/**
 * Trim specific characters from the end of a string
 */
export function trimRight(str: string, chars: string): string {
  let end = str.length;
  while (end > 0 && chars.includes(str[end - 1])) {
    end--;
  }
  return str.substring(0, end);
}
