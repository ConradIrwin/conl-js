import { parse } from "../src/parser";

describe("CONL", () => {
  it("should parse a simple object", () => {
    const input = "a = b";
    expect(parse(input)).toEqual({ a: "b" });
  });
  it("should parse a simple array", () => {
    const input = "= b\n= c";
    expect(parse(input)).toEqual(["b", "c"]);
  });
});
