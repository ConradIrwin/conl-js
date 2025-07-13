import { Token, tokens } from "./";

export type Conl = string | null | ConlMap | ConlList;
export interface ConlMap {
  [property: string]: Conl;
}
export interface ConlList extends Array<Conl> {}

/**
 * Parse CONL content into JavaScript values
 */
export function parse(input: string): ConlMap | ConlList {
  const tokenIterator = tokens(input);
  return sectionToValue(tokenIterator) ?? {};
}

/**
 * Convert a section of tokens to a JavaScript value
 */
function sectionToValue(
  tokenIterator: Generator<Token>,
): ConlMap | ConlList | null {
  let result: ConlMap | ConlList | null = null;
  let currentKey: string | undefined;

  while (true) {
    const { value: token, done } = tokenIterator.next();
    if (done) break;

    switch (token.kind) {
      case "item":
        result ??= [];
        break;

      case "key":
        result ??= {};
        currentKey = token.content;
        break;

      case "scalar":
      case "null":
        let value = "content" in token ? token.content : null;
        if (Array.isArray(result)) {
          result.push(value);
        } else if (result && currentKey !== undefined) {
          result[currentKey] = value;
          currentKey = undefined;
        }
        break;

      case "indent":
        const nestedValue = sectionToValue(tokenIterator);
        if (Array.isArray(result)) {
          result.push(nestedValue);
        } else if (result && currentKey !== undefined) {
          result[currentKey] = nestedValue;
          currentKey = undefined;
        }
        break;

      case "outdent":
        return result;
    }
  }

  return result;
}
