import { parse } from "../src";
import { readFileSync } from "fs";
import { join } from "path";

describe("CONL", () => {
  it("should parse examples from examples.txt correctly", () => {
    const examplesPath = join(__dirname, "examples.txt");
    const content = readFileSync(examplesPath, "utf-8");

    // Split by === to get individual examples
    const examples = content
      .replace(/␊/g, "\r")
      .split("\n===\n")
      .filter((ex) => ex.trim());

    let failed = 0;

    for (let example of examples) {
      const [conlPart, jsonPart] = example.split("\n---\n");
      const expected = JSON.parse(jsonPart.trim());
      let actual;

      try {
        actual = parse(conlPart);
        expect(actual).toEqual(expected);
      } catch (error) {
        failed += 1;
        console.log("input = ", JSON.stringify(conlPart));
        console.log("expected = ", jsonPart);
        console.log("actual = ", JSON.stringify(actual));
        console.log("error = ", error);
      }
    }

    expect(failed).toBe(0);
  });

  it("should produce expected errors from errors.txt", () => {
    const errorsPath = join(__dirname, "errors.txt");
    const content = readFileSync(errorsPath, "utf-8");

    // Split by === to get individual examples
    const examples = content
      .replace(/␊/g, "\r")
      .replace(/␉/g, "\t")
      .replace(/\?/g, "\u{d800}")
      .replace(/␣/g, " ")
      .split("\n===\n")
      .filter((ex) => ex.trim());

    let failed = 0;

    for (let example of examples) {
      const [conlPart, errorPart] = example.split("\n---\n");
      const expectedError = errorPart.trim();

      try {
        parse(conlPart);
        throw new Error("no error");
      } catch (error: any) {
        // Check if the error message matches the expected format
        const errorMessage = error.message || error.toString();
        if (!errorMessage.includes(expectedError)) {
          failed += 1;
          console.log("input = ", JSON.stringify(conlPart));
          console.log("expected error = ", expectedError);
          console.log("actual error = ", errorMessage);
        }
      }
    }

    expect(failed).toBe(0);
  });

  it("should apply the reviver", () => {
    const input = `listen
  timeout = 3s`;

    const result = parse(input, (key, value: any) => {
      // Convert timeout values like "3s" to milliseconds
      if (key === "timeout" && typeof value === "string") {
        const match = value.match(/^(\d+)s$/);
        if (match) {
          return parseInt(match[1]) * 1000;
        }
      }
      return value;
    });

    console.log("Result:", JSON.stringify(result, null, 2));

    expect(result).toEqual({
      listen: {
        timeout: 3000,
      },
    });
  });
});
