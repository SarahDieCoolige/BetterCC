// Tests for the dev-server bcc-injection resolver (T5) and query-aware ID
// fixture route (UI-5).
//
// The dev server injects BetterCC's userscript + v3.css into the fixture HTML
// based on the ?bcc= param. v3 is the only code path now (the v2 UI + main.css
// were removed); both ?bcc=1 and ?bcc=new select it ("1" kept as a bookmark
// alias).
//
// The resolver is the pure decision (query value → what to inject); the actual
// HTML string mutation + file reads stay in the server.

import { describe, it, expect } from "vitest";
import { resolveBccInjection, buildIdFixtureResponse } from "../dev/server.mjs";

// ─── bcc injection resolver ─────────────────────────────────────────────

describe("resolveBccInjection — ?bcc= query value → injection plan", () => {
  it("no param → userscript NOT injected, no stylesheet (dev default = OFF)", () => {
    expect(resolveBccInjection(null)).toEqual({ injectScript: false, stylesheet: null });
    expect(resolveBccInjection(undefined)).toEqual({ injectScript: false, stylesheet: null });
    expect(resolveBccInjection("")).toEqual({ injectScript: false, stylesheet: null });
  });

  it("?bcc=new → userscript injected + v3.css (v3 path)", () => {
    expect(resolveBccInjection("new")).toEqual({ injectScript: true, stylesheet: "v3" });
  });

  it("?bcc=1 → alias for v3 (kept for old bookmarks, post-v2-removal)", () => {
    expect(resolveBccInjection("1")).toEqual({ injectScript: true, stylesheet: "v3" });
  });

  it("unknown ?bcc= value → treated as off (no injection)", () => {
    // Only the exact values "1" and "new" select the UI; anything else is off,
    // matching the conservative default (no behavior change unless explicit).
    expect(resolveBccInjection("2")).toEqual({ injectScript: false, stylesheet: null });
    expect(resolveBccInjection("true")).toEqual({ injectScript: false, stylesheet: null });
    expect(resolveBccInjection("newish")).toEqual({ injectScript: false, stylesheet: null });
  });
});

// ─── query-aware ID fixture route (UI-5) ─────────────────────────────────

describe("buildIdFixtureResponse — query-aware ID search mock", () => {
  // Synthetic nicks (NOT real users) — cover the 3 encoding cases:
  // underscore→:5F:, plain ASCII, hyphen→:2D:.
  const knownUsers = new Map<string, string>([
    ["testascii", "testascii"],
    ["testuser_one", "testuser:5F:one"],
    ["test-hyphen", "test:2D:hyphen"],
  ]);

  it("returns HTML with userfiles img for a known user", () => {
    const html = buildIdFixtureResponse("testuser_one", knownUsers);
    expect(html).toContain('src="userfiles/');
    expect(html).toContain("_3.jpg");
    expect(html).toContain("testuser_one");
    expect(html).toContain("testuser:5F:one");
  });

  it("returns HTML with /id/ link for a known user", () => {
    const html = buildIdFixtureResponse("testascii", knownUsers);
    expect(html).toContain("/id/testascii.html");
  });

  it("returns substring matches for partial nick", () => {
    // "test" matches all 3 knownUsers (testascii, testuser_one, test-hyphen)
    const html = buildIdFixtureResponse("test", knownUsers);
    expect(html).toContain("testascii");
    expect(html).toContain("testuser_one");
    expect(html).toContain("test-hyphen");
    // All three are returned as separate obj_uimg/obj_uname pairs
    const uimgCount = (html.match(/obj_uimg wrapper/g) || []).length;
    expect(uimgCount).toBe(3);
  });

  it("returns substring match for partial nick (single result)", () => {
    // "user" only matches testuser_one
    const html = buildIdFixtureResponse("user", knownUsers);
    expect(html).toContain("testuser_one");
    expect(html).not.toContain("testascii");
    expect(html).not.toContain("test-hyphen");
  });

  it("falls back to deterministic synthetic when no match at all", () => {
    // "abc" matches nothing → a(97)+b(98)+c(99)=294 (even) → synthetic row;
    // 294 % 3 === 0 → the no-photo subset, so the row carries default_3.jpg
    const html = buildIdFixtureResponse("abc", knownUsers);
    expect(html).toContain("userfiles/");
    expect(html).toContain("/id/abc.html");
  });

  it("emits upstream's default placeholder img for the no-photo subset", () => {
    // testascii: char-sum 969, 969 % 3 === 0 → no-photo row shape
    const html = buildIdFixtureResponse("testascii", knownUsers);
    expect(html).toContain("default_3.jpg");
    expect(html).not.toContain("mocktestascii_3.jpg");
  });

  it("emits a mock thumbnail for photo users", () => {
    // testuser_one: char-sum 1312, 1312 % 3 === 1 → real thumbnail row
    const html = buildIdFixtureResponse("testuser_one", knownUsers);
    expect(html).toContain("mocktestuser:5F:one_3.jpg");
    expect(html).not.toContain("default_3.jpg");
  });

  it("returns empty result (0 User gefunden) for blank/empty nick", () => {
    const html = buildIdFixtureResponse("", knownUsers);
    expect(html).toContain("0");
    expect(html).toContain("User gefunden.");
    expect(html).not.toContain("userfiles/");
    expect(html).not.toContain("/id/");
  });

  it("handles plain ASCII nick without encoding characters", () => {
    const html = buildIdFixtureResponse("testascii", knownUsers);
    expect(html).toContain("/id/testascii.html");
    expect(html).toContain('title="testascii"');
  });

  it("matches case-insensitively via substring search", () => {
    // "Testuser_one" (uppercase T) is not an exact key match, but the
    // case-insensitive substring search finds "testuser_one".
    const html = buildIdFixtureResponse("Testuser_one", knownUsers);
    expect(html).toContain("testuser:5F:one"); // uses the knownUsers encoded form
    expect(html).toContain('title="testuser_one"');
  });
});
