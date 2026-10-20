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

  it("keeps quoted commas inside one field", () => {
    const table = parseCsv('a,b,c\none,"two, with, commas",three');
    expect(table.rows).toEqual([["one", "two, with, commas", "three"]]);
  });

  it('unescapes "" to a single quote', () => {
    const table = parseCsv('a\n"say ""hi"" loudly"');
    expect(table.rows).toEqual([[`say "hi" loudly`]]);
  });

  it("skips blank lines and tolerates a trailing newline", () => {
    const table = parseCsv("a,b\none,1\n\ntwo,2\n\n");
    expect(table.rows).toEqual([
      ["one", "1"],
      ["two", "2"],
    ]);
  });

  it("accepts \\r\\n line endings", () => {
    const table = parseCsv("a,b\r\none,1\r\ntwo,2\r\n");
    expect(table.headers).toEqual(["a", "b"]);
    expect(table.rows).toEqual([
      ["one", "1"],
      ["two", "2"],
    ]);
  });

  it("keeps newlines inside quoted fields", () => {
    const table = parseCsv('a,b\n"line one\nline two",after');
    expect(table.rows).toEqual([["line one\nline two", "after"]]);
  });
});
