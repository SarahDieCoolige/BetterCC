import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const OUTPUT_FILE = resolve(import.meta.dirname, "../bettercc.user.js");

describe("build output", () => {
  it("produces a valid v3-only userscript file", () => {
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
    expect(content).toContain("})();");

    // ── v3 public API (property assignments survive bundling) ──────────────
    // The v2-only API (bettercc.superban / getSuperbans / setColors / showIdPopup)
    // was removed with the v2 UI. v3 exposes these four instead.
    expect(content).toContain("bettercc.reloadChat");
    expect(content).toContain("bettercc.onSubmit");
    expect(content).toContain("bettercc.superwhisper");
    expect(content).toContain("bettercc.setTheme");

    // ── v3 must NOT ship the removed v2 API ─────────────────────────────────
    expect(content).not.toContain("bettercc.superban");
    expect(content).not.toContain("bettercc.getSuperbans");
    expect(content).not.toContain("bettercc.setColors");
    expect(content).not.toContain("showIdPopup");

    // ── Key feature string markers (string literals survive bundling) ───────
    expect(content).toContain("autoscroll-banner"); // autoscroll banner element
    expect(content).toContain("Superwhisper"); // superwhisper feature
    expect(content).toContain("Du chattest mit allen"); // input placeholder
    expect(content).toContain("chatout_connect"); // WebSocket hook
    expect(content).toContain("injectIntoChatframe"); // function name in log strings
    expect(content).toContain("chatout_auth_dead"); // upstream global usage

    // ── tinycolor2 is loaded via CDN @require, NOT bundled ────────────────
    // scheme-v1/v2 reference the bare `tinycolor` global (the CDN's UMD
    // wrapper assigns it). esbuild has `external: ["tinycolor2"]`, so the
    // npm package is NOT inlined — the userscript stays small. This guard
    // pins that decision: a future change that bundles tinycolor (drops the
    // @require, adds `import tinycolor from "tinycolor2"`) MUST update this
    // assertion or the build fails loudly, not silently.
    expect(content).toContain(
      "@require  https://cdn.jsdelivr.net/npm/tinycolor2@1.6.0/dist/tinycolor-min.js",
    );
    // The bundled-factory marker must NOT appear — tinycolor2's internal UMD
    // assignment line. Presence means the source got inlined despite the
    // @require, which would double-load the library.
    expect(content).not.toContain("tinycolor = factory");

    // ── main.css @resource removed with the v2 UI ──────────────────────────
    expect(content).not.toContain("@resource  main_css");

    // ── Theme vars live on .bcc-shell, NOT :root (theme-reset bug guard) ────
    // The live page periodically clears :root's inline style; when our --bcc-*
    // vars lived there, the UI reset to the blue CSS defaults. applyScheme now
    // writes to .bcc-shell. This asserts the bundle targets .bcc-shell for the
    // theme write — if someone reverts it to documentElement, this fails.
    expect(content).toContain(".bcc-shell");
    expect(content).not.toContain("document.documentElement.style.setProperty");

    // ── jQuery removal regression guards (still hold under v3) ──────────────
    expect(content).not.toContain("GM_wrench");
    expect(content).not.toContain("jquery-3.5.1");
    expect(content).not.toContain("jquery-ui");

    // ── Settings modal (T10): persisted config keys in the store codec table ──────
    // send_on_enter and hover_preview must be present in the store's codec table.
    // We assert against the source file directly since the keys are not string
    // literals that survive bundling in a searchable way.
    const storeSource = readFileSync(resolve(import.meta.dirname, "../src/store.ts"), "utf-8");
    expect(storeSource).toContain("send_on_enter");
    expect(storeSource).toContain("hover_preview");

    // ── user-image module ships its key exports (UI-1/UI-2) ────────────────
    // parseIdSearch + decodeIdPath + findExactRow + fetchIdRows + getUserPhoto are the
    // pure + effectful API of src/user-image.ts. If a future refactor drops or
    // renames them, these guards fail loudly. (Tree-shaking may mangle
    // internals, but exported function names survive in the IIFE bundle.)
    expect(content).toContain("parseIdSearch");
    expect(content).toContain("decodeIdPath");
    expect(content).toContain("findExactRow");
    expect(content).toContain("fetchIdRows");
    expect(content).toContain("getUserPhoto");
  });

  // ── ID-card redesign foundations (IC-5): header pins ─────────────────────
  // The @match expansion covers the ID-family pages (nc query, id,
  // settings, friends) per specs/idcard-redesign.md Decision 1. src/index.ts
  // branches on /cpop.html/, so these lines are inert until the ID branch
  // lands. The idcard_css resource gets hash busting like the other CSS
  // resources; only the stable prefix is pinned because the hash is
  // content-derived.
  it("declares the ID-family @match lines and the idcard_css resource", () => {
    const content = readFileSync(OUTPUT_FILE, "utf-8");

    const newMatches = [
      "https://www.chatcity.de/de/nc/index.html?*",
      "https://ccc.chatcity.de/de/nc/index.html?*",
      "https://www.chatcity.de/de/id/*.html",
      "https://www.chatcity.de/de/id/*.html?*",
      "https://ccc.chatcity.de/de/id/*.html",
      "https://ccc.chatcity.de/de/id/*.html?*",
      "https://www.chatcity.de/de/settings/*.html",
      "https://www.chatcity.de/de/settings/*.html?*",
      "https://ccc.chatcity.de/de/settings/*.html",
      "https://ccc.chatcity.de/de/settings/*.html?*",
      "https://www.chatcity.de/de/friends/*.html",
      "https://www.chatcity.de/de/friends/*.html?*",
      "https://ccc.chatcity.de/de/friends/*.html",
      "https://ccc.chatcity.de/de/friends/*.html?*",
    ];
    for (const url of newMatches) {
      expect(content).toContain(`// @match  ${url}`);
    }

    expect(content).toContain(
      "// @resource  idcard_css  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/v3/css/idcard.css?r=",
    );
  });

  // The idcard.css stub carries the same fallback --bcc-* values v3.css gives
  // .bcc-shell, so ID-family pages paint a coherent default even when the
  // scheme injection fails. Asserted against the source (same style as the
  // v3.css sidebar test above) since the file ships as an @resource.
  it("ships the idcard.css fallback stub", () => {
    const idcardCss = resolve(import.meta.dirname, "../css/idcard.css");
    expect(existsSync(idcardCss), "css/idcard.css must exist").toBe(true);
    const css = readFileSync(idcardCss, "utf-8");
    expect(css).toContain("body.bcc-idcard");
    expect(css).toContain("--bcc-surface: #c8dae4;");
  });

  // ── Sidebar sits to the RIGHT of the chatframe (layout-polish Task A) ─────
  // v3.css is an external @resource (not inlined by esbuild), so the layout
  // invariant is asserted against the CSS source directly. The conventional
  // chat layout + old ChatCity layout put the userlist on the right; a silent
  // revert to the left-side "sidebar main" layout fails here.
  it("places the sidebar to the right of the chatframe in v3.css", () => {
    const css = readFileSync(resolve(import.meta.dirname, "../css/v3.css"), "utf-8");
    // grid-template-areas middle row: main (left), sidebar (right)
    expect(css).toContain('"main     sidebar"');
    expect(css).not.toContain('"sidebar  main"');
    // Sidebar border on its left edge (it's the right column now)
    expect(css).toContain("border-left: 1px solid var(--bcc-border)");
    expect(css).not.toContain("border-right: 1px solid var(--bcc-border)");
  });
});
