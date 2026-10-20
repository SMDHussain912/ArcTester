import { describe, expect, it } from "vitest";
import { parseCsv } from "../src/csv.js";

describe("parseCsv", () => {
  it("handles quotes, commas, and escaped quotes", () => {
    const table = parseCsv('a,b\n"hello, world","say ""hi"""\nplain,ok');
    expect(table.headers).toEqual(["a", "b"]);
    expect(table.rows).toEqual([
      ["hello, world", 'say "hi"'],
      ["plain", "ok"],
    ]);
  });
});
