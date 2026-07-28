import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const OUTPUT_FILE = resolve(import.meta.dirname, "../bettercc.user.js");

describe("build output", () => {
  it("produces a valid userscript file", () => {
    expect(existsSync(OUTPUT_FILE), "bettercc.user.js must exist after build").toBe(true);

    const content = readFileSync(OUTPUT_FILE, "utf-8");

    // Must start with userscript header
    expect(content.startsWith("// ==UserScript==")).toBe(true);

    // Must contain all required @grant declarations
    expect(content).toContain("// @grant  GM_addStyle");
    expect(content).toContain("// @grant  GM.setValue");
    expect(content).toContain("// @grant  GM.getValue");
    expect(content).toContain("// @grant  GM_log");

    // Must contain the IIFE wrapper
    expect(content).toContain('"use strict"');

    // Must contain the closing IIFE
    expect(content).toContain("})();");

    // Must contain BetterCC public API methods (property assignments survive bundling)
    expect(content).toContain("bettercc.reloadChat");
    expect(content).toContain("bettercc.onSubmit");
    expect(content).toContain("bettercc.superwhisper");
    expect(content).toContain("bettercc.superban");
    expect(content).toContain("bettercc.getSuperbans");
    expect(content).toContain("bettercc.setColors");
    expect(content).toContain("bettercc.setTheme");

    // Must contain key feature string markers (string literals survive bundling)
    expect(content).toContain("autoscroll-banner");         // autoscroll banner element
    expect(content).toContain("Superwhisper");             // superwhisper feature
    expect(content).toContain("Better Ignore");            // superban feature
    expect(content).toContain("Du chattest mit allen");    // input placeholder
    expect(content).toContain("color_");                   // GM storage key pattern
    expect(content).toContain("chatout_connect");          // WebSocket hook

    // Must contain the WebSocket hook
    expect(content).toContain("injectIntoChatframe");      // function name in log strings
    expect(content).toContain("chatout_auth_dead");        // upstream global usage

    // GM_wrench is being phased out — no waitForKeyElements references
    expect(content).not.toContain("GM_wrench.waitForKeyElements");
  });
});
