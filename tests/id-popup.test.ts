import { describe, it, expect } from "vitest";
import { dedupRows, formatIdCardUrl, classifySearchState } from "../src/id-popup";

describe("dedupRows", () => {
  const rowA = { name: "a", href: "/id/a.html", imgUrl: null };
  const rowADup = { name: "a2", href: "/id/a.html", imgUrl: "/x.jpg" };
  const rowB = { name: "b", href: "/id/b.html", imgUrl: null };

  it("removes duplicate hrefs keeping first occurrence", () => {
    expect(dedupRows([rowA, rowADup, rowB])).toEqual([rowA, rowB]);
  });

  it("returns same array when no duplicates", () => {
    expect(dedupRows([rowA, rowB])).toEqual([rowA, rowB]);
  });

  it("returns empty for empty input", () => {
    expect(dedupRows([])).toEqual([]);
  });

  it("handles single element", () => {
    expect(dedupRows([rowA])).toEqual([rowA]);
  });
});

describe("formatIdCardUrl", () => {
  it("returns a URL containing the encoded name", () => {
    const url = formatIdCardUrl("TestUser");
    expect(url).toBe("//www.chatcity.de/de/id/TestUser.html");
  });

  it("encodes underscore as :5F:", () => {
    const url = formatIdCardUrl("maja01_");
    expect(url).toContain(":5F:");
  });
});

describe("classifySearchState", () => {
  const row = { name: "x", href: "/id/x", imgUrl: null };

  it('returns "loading" when loading is true (highest priority)', () => {
    expect(classifySearchState([], true, false)).toBe("loading");
    expect(classifySearchState([row], true, false)).toBe("loading");
    expect(classifySearchState(null, true, true)).toBe("loading");
  });

  it('returns "error" when not loading but error is true', () => {
    expect(classifySearchState([], false, true)).toBe("error");
    expect(classifySearchState([row], false, true)).toBe("error");
  });

  it('returns "empty" when not loading, not error, and rows is null', () => {
    expect(classifySearchState(null, false, false)).toBe("empty");
  });

  it('returns "empty" when not loading, not error, and rows is empty array', () => {
    expect(classifySearchState([], false, false)).toBe("empty");
  });

  it('returns "results" when rows are present and no loading/error', () => {
    expect(classifySearchState([row], false, false)).toBe("results");
  });
});
