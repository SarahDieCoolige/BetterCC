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

  it("returns photo row for unknown nick (enables popup testing with any user)", () => {
    // Unknown nicks now get a synthetic photo row instead of "0 User gefunden"
    // so the popup image + hover preview can be tested with any nick.
    const html = buildIdFixtureResponse("nonexistent_nobody", knownUsers);
    expect(html).toContain("userfiles/");
    expect(html).toContain("_3.jpg");
    expect(html).toContain("nonexistent_nobody");
    expect(html).toContain("/id/nonexistent_nobody.html");
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

  it("uses raw nick as encoded form when not in the knownUsers map", () => {
    // "Testuser_one" (uppercase T) is not in the map (only "testuser_one" is).
    // It falls through to the raw nick and still gets a photo row.
    const html = buildIdFixtureResponse("Testuser_one", knownUsers);
    expect(html).toContain("Testuser_one");
    expect(html).toContain("userfiles/");
    expect(html).not.toContain("testuser_one"); // did NOT use the knownUsers entry
  });
});
