// Tests for the dev-server bcc-injection resolver (T5).
//
// The dev server (dev/server.mjs — a separate, co-located repo) injects
// BetterCC's userscript + a stylesheet into the fixture HTML based on the
// ?bcc= query param. T5 adds a third mode: ?bcc=new injects v3.css (instead
// of the old main.css) so the v3 entry can be exercised.
//
// The resolver is the pure decision (query value → what to inject); the actual
// HTML string mutation + file reads stay in the server. This mirrors how T1's
// shouldUseV3 is the pure runtime decision and the IIFE wiring is untested.

import { describe, it, expect } from "vitest";
import { resolveBccInjection } from "../dev/server.mjs";

describe("resolveBccInjection — ?bcc= query value → injection plan", () => {
  it("no param → userscript NOT injected, no stylesheet (old dev default)", () => {
    expect(resolveBccInjection(null)).toEqual({ injectScript: false, stylesheet: null });
    expect(resolveBccInjection(undefined)).toEqual({ injectScript: false, stylesheet: null });
    expect(resolveBccInjection("")).toEqual({ injectScript: false, stylesheet: null });
  });

  it("?bcc=1 → userscript injected + main.css (old UI path, unchanged)", () => {
    expect(resolveBccInjection("1")).toEqual({ injectScript: true, stylesheet: "main" });
  });

  it("?bcc=new → userscript injected + v3.css (new v3 path)", () => {
    expect(resolveBccInjection("new")).toEqual({ injectScript: true, stylesheet: "v3" });
  });

  it("unknown ?bcc= value → treated as off (no injection)", () => {
    // Only the exact values "1" and "new" select a UI; anything else is off,
    // matching the conservative default (no behavior change unless explicit).
    expect(resolveBccInjection("2")).toEqual({ injectScript: false, stylesheet: null });
    expect(resolveBccInjection("true")).toEqual({ injectScript: false, stylesheet: null });
    expect(resolveBccInjection("newish")).toEqual({ injectScript: false, stylesheet: null });
  });
});
