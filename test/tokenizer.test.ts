import { tokens, Token, TokenKind } from "../src";

describe("CONL Tokenizer", () => {
  function collectTokens(input: string): Token[] {
    return Array.from(tokens(input));
  }

  function tokenSummary(token: Token): string {
    const error = token.error ? ` (error: ${token.error.message})` : "";
    return `${token.kind}:${token.content}${error}`;
  }

  describe("Basic tokenization", () => {
    it("should tokenize empty document", () => {
      const result = collectTokens("");
      expect(result).toEqual([]);
    });

    it("should tokenize simple key-value", () => {
      const result = collectTokens("key = value");
      expect(result.map(tokenSummary)).toEqual(["MapKey:key", "Scalar:value"]);
    });

    it("should tokenize multiple key-value pairs", () => {
      const result = collectTokens("key1 = value1\nkey2 = value2");
      expect(result.map(tokenSummary)).toEqual([
        "MapKey:key1",
        "Scalar:value1",
        "MapKey:key2",
        "Scalar:value2",
      ]);
    });

    it("should handle comments", () => {
      const result = collectTokens("key = value ; this is a comment");
      expect(result.map(tokenSummary)).toEqual([
        "MapKey:key",
        "Scalar:value",
        "Comment: this is a comment",
      ]);
    });

    it("should handle line comments", () => {
      const result = collectTokens("; full line comment\nkey = value");
      expect(result.map(tokenSummary)).toEqual([
        "Comment: full line comment",
        "MapKey:key",
        "Scalar:value",
      ]);
    });
  });

  describe("Lists", () => {
    it("should tokenize simple list", () => {
      const result = collectTokens("= item1\n= item2");
      expect(result.map(tokenSummary)).toEqual([
        "ListItem:",
        "Scalar:item1",
        "ListItem:",
        "Scalar:item2",
      ]);
    });

    it("should handle list with no values", () => {
      const result = collectTokens("=\n= value");
      expect(result.map(tokenSummary)).toEqual([
        "ListItem:",
        "NoValue:",
        "ListItem:",
        "Scalar:value",
      ]);
    });
  });

  describe("Indentation", () => {
    it("should handle nested maps", () => {
      const result = collectTokens("parent\n  child = value");
      expect(result.map(tokenSummary)).toEqual([
        "MapKey:parent",
        "Indent:  ",
        "MapKey:child",
        "Scalar:value",
        "Outdent:",
      ]);
    });

    it("should handle multiple indent levels", () => {
      const result = collectTokens("a\n  b\n    c = value");
      expect(result.map(tokenSummary)).toEqual([
        "MapKey:a",
        "Indent:  ",
        "MapKey:b",
        "Indent:    ",
        "MapKey:c",
        "Scalar:value",
        "Outdent:",
        "Outdent:",
      ]);
    });

    it("should handle outdent to previous level", () => {
      const result = collectTokens("a\n  b = 1\n  c = 2\nd = 3");
      expect(result.map(tokenSummary)).toEqual([
        "MapKey:a",
        "Indent:  ",
        "MapKey:b",
        "Scalar:1",
        "MapKey:c",
        "Scalar:2",
        "Outdent:",
        "MapKey:d",
        "Scalar:3",
      ]);
    });
  });

  describe("Quoted strings", () => {
    it("should handle basic quoted string", () => {
      const result = collectTokens('key = "quoted value"');
      expect(result.map(tokenSummary)).toEqual([
        "MapKey:key",
        "Scalar:quoted value",
      ]);
    });

    it("should handle escape sequences", () => {
      const result = collectTokens('key = "line1\\nline2\\ttab"');
      expect(result.map(tokenSummary)).toEqual([
        "MapKey:key",
        "Scalar:line1\nline2\ttab",
      ]);
    });

    it("should handle unicode escapes", () => {
      const result = collectTokens('key = "\\{1F600}"');
      expect(result.map(tokenSummary)).toEqual(["MapKey:key", "Scalar:😀"]);
    });

    it("should handle quoted map keys", () => {
      const result = collectTokens('"key with spaces" = value');
      expect(result.map(tokenSummary)).toEqual([
        "MapKey:key with spaces",
        "Scalar:value",
      ]);
    });

    it("should report error for unclosed quotes", () => {
      const result = collectTokens('key = "unclosed');
      const valueToken = result.find(
        (t) => t.kind === TokenKind.Scalar || t.error,
      );
      expect(valueToken?.error?.message).toContain("unclosed quotes");
    });
  });

  describe("Multiline strings", () => {
    it("should handle basic multiline string", () => {
      const result = collectTokens('key = """\n  line1\n  line2');
      expect(result.map(tokenSummary)).toEqual([
        "MapKey:key",
        "MultilineHint:",
        "MultilineScalar:line1\nline2",
      ]);
    });

    it("should handle multiline with hint", () => {
      const result = collectTokens('key = """javascript\n  function() {}');
      expect(result.map(tokenSummary)).toEqual([
        "MapKey:key",
        "MultilineHint:javascript",
        "MultilineScalar:function() {}",
      ]);
    });

    it("should preserve indentation in multiline", () => {
      const result = collectTokens('key = """\n  line1\n    indented\n  line2');
      expect(result.map(tokenSummary)).toEqual([
        "MapKey:key",
        "MultilineHint:",
        "MultilineScalar:line1\n  indented\nline2",
      ]);
    });

    it("should trim trailing whitespace from multiline", () => {
      const result = collectTokens('key = """\n  content  \n  ');
      expect(result.map(tokenSummary)).toEqual([
        "MapKey:key",
        "MultilineHint:",
        "MultilineScalar:content",
      ]);
    });
  });

  describe("Error handling", () => {
    it("should report unexpected indent", () => {
      const result = collectTokens("  indented");
      const errors = result.filter((t) => t.error);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].error?.message).toContain("unexpected indent");
    });

    it("should report mixed list and map", () => {
      const result = collectTokens("key = value\n= list item");
      const errors = result.filter((t) => t.error);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].error?.message).toContain("unexpected list item");
    });

    it("should report invalid escape sequence", () => {
      const result = collectTokens('key = "\\q"');
      const valueToken = result.find((t) => t.kind === TokenKind.Scalar);
      expect(valueToken?.error?.message).toContain("invalid escape code");
    });

    it("should handle missing multiline value", () => {
      const result = collectTokens('key = """\nkey2 = value');
      const multilineToken = result.find(
        (t) => t.kind === TokenKind.MultilineScalar,
      );
      expect(multilineToken?.error?.message).toContain(
        "missing multiline value",
      );
    });
  });

  describe("Edge cases", () => {
    it("should handle empty lines", () => {
      const result = collectTokens("key1 = value1\n\nkey2 = value2");
      expect(result.map(tokenSummary)).toEqual([
        "MapKey:key1",
        "Scalar:value1",
        "MapKey:key2",
        "Scalar:value2",
      ]);
    });

    it("should handle values that look like syntax", () => {
      const result = collectTokens('equals = = = =\nquotes = """');
      expect(result.map(tokenSummary)).toEqual([
        "MapKey:equals",
        "Scalar:= = =",
        "MapKey:quotes",
        "MultilineHint:",
        "MultilineScalar:",
      ]);
    });

    it("should handle keys with no values", () => {
      const result = collectTokens("key1\nkey2 =\nkey3");
      expect(result.map(tokenSummary)).toEqual([
        "MapKey:key1",
        "NoValue:",
        "MapKey:key2",
        "NoValue:",
        "MapKey:key3",
        "NoValue:",
      ]);
    });

    it("should handle tab indentation", () => {
      const result = collectTokens("parent\n\tchild = value");
      expect(result.map(tokenSummary)).toEqual([
        "MapKey:parent",
        "Indent:\t",
        "MapKey:child",
        "Scalar:value",
        "Outdent:",
      ]);
    });

    it("should handle Buffer input", () => {
      const buffer = Buffer.from("key = value", "utf8");
      const result = collectTokens(buffer as any);
      expect(result.map(tokenSummary)).toEqual(["MapKey:key", "Scalar:value"]);
    });
  });

  describe("Complex examples", () => {
    it("should tokenize nested structure with lists", () => {
      const input = `
project
  name = "CONL Parser"
  dependencies =
    = name = typescript
      version = "^5.0.0"
    = name = jest
      version = "^29.0.0"`;

      const result = collectTokens(input);
      const summary = result.map(tokenSummary);

      expect(summary).toContain("MapKey:project");
      expect(summary).toContain("MapKey:name");
      expect(summary).toContain("Scalar:CONL Parser");
      expect(summary).toContain("MapKey:dependencies");
      expect(summary).toContain("ListItem:");
      expect(summary).toContain("MapKey:version");
      expect(summary).toContain("Scalar:^5.0.0");
    });

    it("should handle comment preservation", () => {
      const input = `
; Header comment
key = value ; inline comment
  ; indented comment
  nested = value2`;

      const result = collectTokens(input);
      const comments = result.filter((t) => t.kind === TokenKind.Comment);

      expect(comments.length).toBe(3);
      expect(comments[0].content).toBe(" Header comment");
      expect(comments[1].content).toBe(" inline comment");
      expect(comments[2].content).toBe(" indented comment");
    });
  });
});
