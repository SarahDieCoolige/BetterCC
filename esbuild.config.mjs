import * as esbuild from "esbuild";

const USERSCRIPT_HEADER = `// ==UserScript==
// @name  BetterCC
// @description  BetterCC is better
// @author  Sarah
// @version      1.48
// @icon  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/websocket/BetterCC.png
//
// @match  https://www.chatcity.de/de/cpop.html?*RURL=*
// @match  https://ccc.chatcity.de/de/cpop.html?*RURL=*
// @match  https://www.chatcity.de/de/nc/index.html
// @match  https://images.chatcity.de/*
//
// @require  https://code.jquery.com/jquery-3.5.1.min.js
// @require  https://code.jquery.com/ui/1.12.1/jquery-ui.min.js
// @require  https://raw.githubusercontent.com/bgrins/TinyColor/master/tinycolor.js
// @require  https://cdn.jsdelivr.net/gh/CoeJoder/GM_wrench@v1.5/dist/GM_wrench.min.js
//
// @resource  main_css  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/websocket/css/main.css?r=1.48
// @resource  iframe_css  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/websocket/css/iframe.css?r=1.48
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
// @downloadURL  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/websocket/bettercc.user.js
// @updateURL  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/websocket/bettercc.user.js
//
// @supportURL  https://github.com/SarahDieCoolige/BetterCC/issues
// @homepageURL  https://github.com/SarahDieCoolige/BetterCC

// ==/UserScript==
/* globals jQuery, $, GM_wrench, ajax, tinycolor */
`;

await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  outfile: "bettercc.user.js",
  banner: { js: USERSCRIPT_HEADER },
  format: "iife",
  target: "es2020",
  platform: "browser",
  // External: these are provided by Tampermonkey @require
  external: ["jquery", "tinycolor", "GM_wrench"],
});
