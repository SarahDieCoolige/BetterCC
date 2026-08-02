import * as esbuild from "esbuild";
import { readFileSync } from "fs";

const PKG = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));
const V = PKG.version;

const USERSCRIPT_HEADER = `// ==UserScript==
// @name  BetterCC (alpha)
// @description  BetterCC v3 alpha
// @author  Sarah
// @version      ${V}
// @icon  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/v3/BetterCC.png
//
// @match  https://www.chatcity.de/de/cpop.html
// @match  https://www.chatcity.de/de/cpop.html?*
// @match  https://ccc.chatcity.de/de/cpop.html
// @match  https://ccc.chatcity.de/de/cpop.html?*
// @match  https://www.chatcity.de/de/nc/index.html
// @match  https://images.chatcity.de/*
//
// @require  https://cdn.jsdelivr.net/npm/tinycolor2@1.6.0/dist/tinycolor-min.js
//
// @resource  iframe_css  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/v3/css/iframe.css?r=${V}
// @resource  v3_css  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/v3/css/v3.css?r=${V}
//
// @grant  GM_addStyle
// @grant  GM.setValue
// @grant  GM.getValue
// @grant  GM_setValue
// @grant  GM_getValue
// @grant  GM.listValues
// @grant  GM_addValueChangeListener
// @grant  GM_getResourceText
// @grant  GM_xmlhttpRequest
// @grant  GM_log
// @grant  GM.notification
// @grant  GM_notification
// @grant  GM_addElement
//
// @sandbox  JavaScript
// @run-at document-idle
//
// @downloadURL  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/v3/bettercc.user.js
// @updateURL  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/v3/bettercc.user.js
//
// @supportURL  https://github.com/SarahDieCoolige/BetterCC/issues
// @homepageURL  https://github.com/SarahDieCoolige/BetterCC

	// ==/UserScript==
/* globals ajax */
`;

const DORMANT_CHATLOG = `
  // ═══════════════════════════════════════════════════════════════════════
  // DORMANT — Chatlog save/restore
  //
  // This code was originally used by reloadChat() (mimimi) to preserve chat
  // content across iframe reloads. In v1.43+, the WebSocket reconnect
  // preserves content natively (the chatframe_doc_opened flag prevents the
  // document wipe on reconnect), so explicit save/restore is no longer
  // needed.
  //
  // TODO: Re-evaluate if we ever need explicit chatlog export (e.g., for
  // debugging or saving a conversation before /exit). If so, this is the
  // starting point.
  // ═══════════════════════════════════════════════════════════════════════
`;

const buildConfig = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  outfile: "bettercc.user.js",
  banner: { js: USERSCRIPT_HEADER },
  footer: { js: DORMANT_CHATLOG },
  format: "iife",
  target: "es2020",
  platform: "browser",
  external: ["tinycolor2"], // CDN via @require, not bundled — keeps the userscript small
};

const isWatch = process.argv.includes("--watch");

if (isWatch) {
  const ctx = await esbuild.context(buildConfig);
  await ctx.watch();
  console.log("[esbuild] Watching src/ for changes...");
} else {
  await esbuild.build(buildConfig);
}
