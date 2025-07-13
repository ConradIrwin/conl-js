import { parse } from "../src/parser";
import { readFileSync } from "fs";
import { join } from "path";

describe("CONL", () => {
  it("should parse a simple object", () => {
    const input = "a = b";
    expect(parse(input)).toEqual({ a: "b" });
  });
  it("should parse a simple array", () => {
    const input = "= b\n= c";
    expect(parse(input)).toEqual(["b", "c"]);
  });
  it("should parse multiline strings", () => {
    const input = `= """\n c\n =`;
    expect(parse(input)).toEqual(["c\n="]);
  });

  describe("CONL examples from file", () => {
    it("should parse examples from examples.txt correctly", () => {
      const examplesPath = join(__dirname, "examples.txt");
      const content = readFileSync(examplesPath, "utf-8");

      // Split by === to get individual examples
      const examples = content
        .replace(/␊/g, "\r")
        .split("\n===\n")
        .filter((ex) => ex.trim());

      let failed = 0;

      examples.forEach((example) => {
        const [conlPart, jsonPart] = example.split("\n---\n");
        const expected = JSON.parse(jsonPart.trim());
        const actual = parse(conlPart);

        try {
          expect(actual).toEqual(expected);
        } catch (error) {
          failed += 1;
          console.log("input = ", JSON.stringify(conlPart));
          console.log("expected = ", jsonPart);
          console.log("actual = ", JSON.stringify(actual));
        }
      });

      expect(failed).toBe(0);
    });
  });
});
