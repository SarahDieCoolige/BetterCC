import * as esbuild from "esbuild";

const USERSCRIPT_HEADER = `// ==UserScript==
// @name  BetterCC
// @description  BetterCC is better
// @author  Sarah
// @version      2.0.4
// @icon  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/modernize/BetterCC.png
//
// @match  https://www.chatcity.de/de/cpop.html?*RURL=*
// @match  https://ccc.chatcity.de/de/cpop.html?*RURL=*
// @match  https://www.chatcity.de/de/nc/index.html
// @match  https://images.chatcity.de/*
//
// @require  https://raw.githubusercontent.com/bgrins/TinyColor/master/tinycolor.js
//
// @resource  main_css  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/modernize/css/main.css?r=2.0.4
// @resource  iframe_css  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/modernize/css/iframe.css?r=2.0.4
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
// @grant  GM_notification
// @grant  GM_addElement
//
// @sandbox  JavaScript
// @run-at document-idle
//
// @downloadURL  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/modernize/bettercc.user.js
// @updateURL  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/modernize/bettercc.user.js
//
// @supportURL  https://github.com/SarahDieCoolige/BetterCC/issues
// @homepageURL  https://github.com/SarahDieCoolige/BetterCC

	// ==/UserScript==
/* globals ajax, tinycolor */
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
  // tinycolor2 is bundled (imported in src/scheme.ts). Old frozen code
  // (theme.ts/ui.ts) still resolves the bare `tinycolor` global via @require.
};

const isWatch = process.argv.includes("--watch");

if (isWatch) {
  const ctx = await esbuild.context(buildConfig);
  await ctx.watch();
  console.log("[esbuild] Watching src/ for changes...");
} else {
  await esbuild.build(buildConfig);
}
