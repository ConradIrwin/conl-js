import { Token, tokens } from "./";

export type Conl = string | null | ConlMap | ConlList;
export interface ConlMap {
  [property: string]: Conl;
}
export interface ConlList extends Array<Conl> {}

export function parse(input: string): ConlMap | ConlList;
export function parse<T>(
  input: string,
  reviver: (key: string, value: any) => T,
): T;
export function parse(
  input: string,
  reviver?: (key: string, value: any) => any,
): any {
  reviver ??= (_, value) => value;
  const tokenIterator = tokens(input);
  const result = sectionToValue(tokenIterator, reviver) ?? {};

  return reviver("", result);
}

/**
 * Convert a section of tokens to a JavaScript value
 */
function sectionToValue(
  tokenIterator: Generator<Token>,
  reviver: (key: string, value: any) => any,
): any {
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
        const value: any = "content" in token ? token.content : null;
        if (Array.isArray(result)) {
          result.push(reviver.call(result, String(result.length), value));
        } else if (result && currentKey !== undefined) {
          result[currentKey] = reviver.call(result, currentKey, value);
          currentKey = undefined;
        }
        break;

      case "indent":
        const nestedValue: any = sectionToValue(tokenIterator, reviver);
        if (Array.isArray(result)) {
          result.push(reviver.call(result, String(result.length), nestedValue));
        } else if (result && currentKey !== undefined) {
          result[currentKey] = reviver.call(result, currentKey, nestedValue);
          currentKey = undefined;
        }
        break;

      case "outdent":
        return result;
    }
  }

  return result;
}
