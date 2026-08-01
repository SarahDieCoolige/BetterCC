// Tests for the dev-server bcc-injection resolver (T5).
//
// The dev server injects BetterCC's userscript + v3.css into the fixture HTML
// based on the ?bcc= param. v3 is the only code path now (the v2 UI + main.css
// were removed); both ?bcc=1 and ?bcc=new select it ("1" kept as a bookmark
// alias).
//
// The resolver is the pure decision (query value → what to inject); the actual
// HTML string mutation + file reads stay in the server.

import { describe, it, expect } from "vitest";
import { resolveBccInjection } from "../dev/server.mjs";

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
