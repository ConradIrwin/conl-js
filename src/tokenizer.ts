import { Token, TokenKind, ParseState } from './types';
import {
  lines,
  splitLiteral,
  decodeLiteral,
  checkUtf8,
  trimLeft,
  cutPrefix,
  trimRight,
} from './utils';

/**
 * Tokenize a CONL input string into raw tokens
 */
function* tokenize(input: string): Generator<Token, void, unknown> {
  const stack: string[] = [''];
  let multiline = false;
  let multilinePrefix = '';
  let multilineValue = '';
  let multilineLno = 0;

  for (const [lno, content] of lines(input)) {
    const [indent, rest] = trimLeft(content);

    if (multiline) {
      if (multilinePrefix === '') {
        if (indent.startsWith(stack[stack.length - 1]) && indent !== stack[stack.length - 1]) {
          multilinePrefix = indent;
          multilineValue = rest;
          multilineLno = lno;
          continue;
        } else if (rest === '') {
          continue;
        } else {
          yield {
            lno: multilineLno,
            kind: TokenKind.MultilineScalar,
            content: '',
            error: new Error('missing multiline value'),
          };
          multiline = false;
        }
      } else {
        if (content.startsWith(multilinePrefix)) {
          const restContent = content.substring(multilinePrefix.length);
          multilineValue += '\n' + restContent;
          continue;
        } else if (rest === '') {
          multilineValue += '\n';
          continue;
        } else {
          const finalContent = trimRight(multilineValue, ' \t\r\n');
          const err = checkUtf8(finalContent);
          yield {
            lno: multilineLno,
            kind: TokenKind.MultilineScalar,
            content: finalContent,
            error: err || undefined,
          };
          multiline = false;
          multilinePrefix = '';
          multilineValue = '';
        }
      }
    }

    if (rest === '') {
      continue;
    }

    let [comment, found] = cutPrefix(rest, ';');
    if (found) {
      yield {
        lno,
        kind: TokenKind.Comment,
        content: comment,
        error: checkUtf8(comment) || undefined,
      };
      continue;
    }

    // Handle outdents
    while (!indent.startsWith(stack[stack.length - 1])) {
      stack.pop();
      yield {
        lno,
        kind: TokenKind.Outdent,
        content: '',
      };
    }

    // Handle indent
    if (indent !== stack[stack.length - 1]) {
      stack.push(indent);
      yield {
        lno,
        kind: TokenKind.Indent,
        content: indent,
      };
    }

    let currentRest = rest;

    // Check for list item
    let [list, isListItem] = cutPrefix(currentRest, '=');
    if (isListItem) {
      const [, trimmedList] = trimLeft(list);
      currentRest = trimmedList;
      yield {
        lno,
        kind: TokenKind.ListItem,
        content: '',
      };
    } else {
      // Map key
      const [key, afterKey] = splitLiteral(currentRest, true);
      const [decodedKey, err] = decodeLiteral(key);
      yield {
        lno,
        kind: TokenKind.MapKey,
        content: decodedKey,
        error: err || undefined,
      };
      currentRest = afterKey;
      const [, trimmedRest] = trimLeft(afterKey);
      currentRest = trimmedRest;
      const [afterEquals] = cutPrefix(currentRest, '=');
      if (currentRest !== afterEquals) {
        currentRest = afterEquals;
        const [, trimmedAfterEquals] = trimLeft(currentRest);
        currentRest = trimmedAfterEquals;
      }
    }

    // Check for comment after key/list item
    [comment, found] = cutPrefix(currentRest, ';');
    if (found) {
      yield {
        lno,
        kind: TokenKind.Comment,
        content: comment,
        error: checkUtf8(comment) || undefined,
      };
      continue;
    }

    // Check for multiline indicator
    let [indicator, hasMultiline] = cutPrefix(currentRest, '"""');
    if (hasMultiline) {
      const [hint, afterHint] = splitLiteral(indicator, false);
      multiline = true;
      multilineLno = lno;
      yield {
        lno,
        kind: TokenKind.MultilineHint,
        content: hint,
        error: checkUtf8(hint) || undefined,
      };

      [comment, found] = cutPrefix(afterHint, ';');
      if (found) {
        yield {
          lno,
          kind: TokenKind.Comment,
          content: comment,
          error: checkUtf8(comment) || undefined,
        };
      }
      continue;
    }

    // Regular scalar value
    const [value, afterValue] = splitLiteral(currentRest, false);
    if (value !== '') {
      const [decodedValue, err] = decodeLiteral(value);
      yield {
        lno,
        kind: TokenKind.Scalar,
        content: decodedValue,
        error: err || undefined,
      };
    }

    [comment, found] = cutPrefix(afterValue, ';');
    if (found) {
      yield {
        lno,
        kind: TokenKind.Comment,
        content: comment,
        error: checkUtf8(comment) || undefined,
      };
    }
  }

  // Handle any remaining multiline
  if (multiline) {
    if (multilineValue !== '') {
      const finalContent = trimRight(multilineValue, ' \t\r\n');
      yield {
        lno: multilineLno,
        kind: TokenKind.MultilineScalar,
        content: finalContent,
        error: checkUtf8(finalContent) || undefined,
      };
    } else {
      yield {
        lno: multilineLno,
        kind: TokenKind.MultilineScalar,
        content: '',
        error: new Error('missing multiline value'),
      };
    }
  }
}

/**
 * Tokens iterates over tokens in the input string.
 *
 * The raw tokens are post-processed to maintain the invariants that:
 *   - Indent and Outdent are always paired correctly
 *   - (ignoring Comment) after a ListItem or a MapKey,
 *     you will always get any of Scalar, MultilineHint, NoValue or Indent
 *   - after a MultilineHint you will always get a MultilineScalar
 *   - within a given section you will only find ListItem or MapKey, not a mix.
 *
 * Any parse errors are reported in Token.error. The parser is tolerant to errors,
 * though the resulting document may not be what the user intended, so you should
 * handle errors appropriately.
 */
export function* tokens(input: Buffer | string): Generator<Token, void, unknown> {
  const states: ParseState[] = [{ kind: TokenKind.Comment, hasKey: false }];
  let lastLine = 0;
  const inputStr = typeof input === 'string' ? input : input.toString('utf8');

  for (const token of tokenize(inputStr)) {
    const state = states[states.length - 1];

    switch (token.kind) {
      case TokenKind.Indent:
        if (state.hasKey) {
          state.hasKey = false;
        } else {
          let kind = state.kind;
          if (kind === TokenKind.Comment) {
            kind = TokenKind.MapKey;
          }
          yield {
            lno: token.lno,
            kind,
            content: '',
            error: new Error('unexpected indent'),
          };
        }
        states.push({ kind: TokenKind.Comment, hasKey: false });
        break;

      case TokenKind.Outdent:
        states.pop();
        if (state.hasKey) {
          yield {
            lno: token.lno,
            kind: TokenKind.NoValue,
            content: '',
          };
        }
        break;

      case TokenKind.ListItem:
      case TokenKind.MapKey:
        if (state.kind === TokenKind.Comment) {
          state.kind = token.kind;
        }
        if (state.hasKey) {
          yield {
            lno: token.lno,
            kind: TokenKind.NoValue,
            content: '',
          };
        }
        state.hasKey = true;

        if (state.kind === TokenKind.MapKey && token.kind === TokenKind.ListItem) {
          yield {
            lno: token.lno,
            kind: TokenKind.MapKey,
            content: '',
            error: new Error('unexpected list item'),
          };
          continue;
        }
        if (state.kind === TokenKind.ListItem && token.kind === TokenKind.MapKey) {
          yield {
            lno: token.lno,
            kind: TokenKind.ListItem,
            content: '',
            error: new Error('unexpected map key'),
          };
          continue;
        }
        break;

      case TokenKind.Scalar:
      case TokenKind.MultilineScalar:
        state.hasKey = false;
        break;

      case TokenKind.Comment:
      case TokenKind.MultilineHint:
        // pass-through
        break;

      default:
        throw new Error('Unknown token kind');
    }

    lastLine = token.lno;
    yield token;
  }

  // Handle remaining states
  while (states.length > 0) {
    const state = states[states.length - 1];
    if (state.hasKey) {
      yield {
        lno: lastLine,
        kind: TokenKind.NoValue,
        content: '',
      };
    }
    if (states.length > 1) {
      yield {
        lno: lastLine,
        kind: TokenKind.Outdent,
        content: '',
      };
    }
    states.pop();
  }
}
