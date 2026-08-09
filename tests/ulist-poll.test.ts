import { describe, it, expect } from "vitest";
import { parseUlistResponse } from "../src/ulist-poll";

describe("parseUlistResponse", () => {
  const DUMP =
    'var cha_channel = "Chatcity";\n\nvar cha_my = new Array(\n"maja01_","hR",\n"");\nset_uinfo1();';
  it("parses the dump response (single user)", () => {
    expect(parseUlistResponse(DUMP)).toEqual(["maja01_", "hR", ""]);
  });

  const MULTI = 'var cha_my = new Array(\n"Alpha","hR",\n"Beta","h",\n"");';
  it("parses a multi-user response", () => {
    expect(parseUlistResponse(MULTI)).toEqual(["Alpha", "hR", "Beta", "h", ""]);
  });

  it("returns [] on empty input", () => {
    expect(parseUlistResponse("")).toEqual([]);
  });

  it("returns [] when cha_my declaration is absent", () => {
    expect(parseUlistResponse("set_uinfo1();")).toEqual([]);
  });

  it("returns [] on a truncated declaration", () => {
    expect(parseUlistResponse('var cha_my = new Array("Alpha","hR"')).toEqual([]);
  });

  const SPACED = 'var   cha_my   =   new   Array(\n\n  "X"  ,  "hR"  ,\n\n  ""  )  ;';
  it("tolerates extra whitespace and newlines", () => {
    expect(parseUlistResponse(SPACED)).toEqual(["X", "hR", ""]);
  });

  const ESCAPED = 'var cha_my = new Array(\n"O\\"Brien","hR",\n"");';
  it("handles escaped quotes in usernames", () => {
    expect(parseUlistResponse(ESCAPED)).toEqual(['O"Brien', "hR", ""]);
  });
});
