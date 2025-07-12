# CONL Parser for TypeScript

A TypeScript implementation of the CONL (CONcise Language) tokenizer. This package provides low-level tokenization capabilities for CONL documents, converting raw text into a stream of tokens that can be used to build higher-level parsers.

## Installation

```bash
npm install @conl/parser
```

## Usage

### Basic Tokenization

```typescript
import { tokens, TokenKind } from '@conl/parser';

const input = `
name = "My Application"
version = 1.0.0

server
  host = localhost
  port = 8080
`;

for (const token of tokens(input)) {
  console.log(`${TokenKind[token.kind]}: ${token.content}`);
}
```

### Token Types

The tokenizer produces the following token types:

- `Comment` - Single-line comments starting with `;`
- `Indent` - Indentation increase
- `Outdent` - Indentation decrease
- `MapKey` - Key in a key-value pair
- `ListItem` - List item marker (`=`)
- `Scalar` - Simple string value
- `NoValue` - Indicates a key or list item with no associated value
- `MultilineScalar` - Multiline string value
- `MultilineHint` - Optional hint for multiline strings (e.g., language for syntax highlighting)

### Error Handling

The tokenizer is error-tolerant and reports errors through the `error` property on tokens:

```typescript
import { tokens } from '@conl/parser';

const input = '"unclosed quote';

for (const token of tokens(input)) {
  if (token.error) {
    console.error(`Error at line ${token.lno}: ${token.error.message}`);
  }
}
```

### Working with Buffers

The tokenizer can accept both strings and Buffers:

```typescript
import { tokens } from '@conl/parser';
import { readFileSync } from 'fs';

const buffer = readFileSync('config.conl');
for (const token of tokens(buffer)) {
  // Process tokens...
}
```

## Token Stream Invariants

The tokenizer maintains several important invariants:

1. **Indent/Outdent Pairing**: `Indent` and `Outdent` tokens are always correctly paired
2. **Value Tokens**: After a `ListItem` or `MapKey` token (ignoring `Comment`), you will always get one of:
   - `Scalar` - A simple value
   - `MultilineHint` - Beginning of a multiline value
   - `NoValue` - No value provided
   - `Indent` - Beginning of a nested structure
3. **Multiline Sequences**: After a `MultilineHint`, you will always get a `MultilineScalar`
4. **Section Consistency**: Within a given indentation level, you will only find either `ListItem` or `MapKey` tokens, never a mix

## Examples

### Maps (Key-Value Pairs)

```typescript
const input = `
user
  name = "John Doe"
  email = john@example.com
`;

// Produces: MapKey, Indent, MapKey, Scalar, MapKey, Scalar, Outdent
```

### Lists

```typescript
const input = `
colors =
  = red
  = green
  = blue
`;

// Produces: MapKey, Indent, ListItem, Scalar, ListItem, Scalar, ListItem, Scalar, Outdent
```

### Multiline Strings

```typescript
const input = `
description = """
  This is a multiline string.
  It preserves formatting.
`;

// Produces: MapKey, MultilineHint, MultilineScalar
```

### Quoted Strings with Escapes

```typescript
const input = `
message = "Hello\\nWorld\\t\\{1F600}"
`;

// The scalar token will contain: "Hello\nWorld\t😀"
```

## API Reference

### `tokens(input: Buffer | string): Generator<Token, void, unknown>`

Returns a generator that yields tokens from the input CONL document.

### `Token` Interface

```typescript
interface Token {
  lno: number;        // Line number (1-based)
  kind: TokenKind;    // Type of token
  content: string;    // Token content
  error?: Error;      // Parse error, if any
}
```

### `TokenKind` Enum

```typescript
enum TokenKind {
  Comment = 0,
  Indent = 1,
  Outdent = 2,
  MapKey = 3,
  ListItem = 4,
  Scalar = 5,
  NoValue = 6,
  MultilineScalar = 7,
  MultilineHint = 8,
}
```

### Utility Functions

The package also exports several utility functions used internally:

- `lines(input: string)` - Split input into lines
- `splitLiteral(input: string, key: boolean)` - Split literal values
- `decodeLiteral(input: string)` - Decode escape sequences
- `checkUtf8(content: string)` - Validate UTF-8 (always returns null in TypeScript)

## Building from Source

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run example
npx ts-node example.ts
```

## License

MIT