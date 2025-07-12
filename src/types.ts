/**
 * TokenKind represents the possible kinds of token in a CONL document.
 */
export enum TokenKind {
  Comment = "Comment",
  Indent = "Indent",
  Outdent = "Outdent",
  MapKey = "MapKey",
  ListItem = "ListItem",
  Scalar = "Scalar",
  NoValue = "NoValue",
  MultilineScalar = "MultilineScalar",
  MultilineHint = "MultilineHint",
}

/**
 * Token represents a single token in a CONL document
 */
export interface Token {
  lno: number;
  kind: TokenKind;
  content: string;
  error?: Error;
}

/**
 * Internal parse state
 */
export interface ParseState {
  kind: TokenKind;
  hasKey: boolean;
}
