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

    // Must end with the closing IIFE
    expect(content.trimEnd().endsWith("})();")).toBe(true);
  });
});
