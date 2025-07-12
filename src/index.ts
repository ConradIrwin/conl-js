/**
 * CONL (CONcise Language) Parser for TypeScript
 *
 * This is a TypeScript implementation of the CONL parser, providing
 * low-level tokenization capabilities for CONL documents.
 */

export { tokens } from "./tokenizer";
export { Token, TokenKind } from "./types";
export type { ParseState } from "./types";

// Re-export utility functions that might be useful for consumers
export {
  lines,
  splitLiteral,
  splitUnquoted,
  decodeLiteral,
  decodeMultiline,
  checkUtf8,
} from "./utils";
