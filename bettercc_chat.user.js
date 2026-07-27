// ==UserScript==
// @name        BetterCC Chat (DEPRECATED)
// @description Merged into bettercc.user.js in v1.43 — uninstall this script.
// @author      Sarah
// @version     1.43
// @icon        https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/websocket/BetterCC.png
//
// @match       https://www.chatcity.de/cc_chat/chatout?*
// @match       https://chat.chatcity.de/cc_chat/chatout?*
// @match       https://ccc.chatcity.de/cc_chat/cc_chat/chatout?*
// @match       https://ccc.chatcity.de/cc_chat/chatout?*
//
// @run-at      document-end
//
// @downloadURL  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/websocket/bettercc_chat.user.js
// @updateURL    https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/websocket/bettercc_chat.user.js
//
// @supportURL   https://github.com/SarahDieCoolige/BetterCC/issues
// @homepageURL  https://github.com/SarahDieCoolige/BetterCC
// ==/UserScript==

// This script is no longer used. ChatCity's new WebSocket-shim architecture
// (July 2026) loads the chatframe same-origin via cpop_tJuf.html + a
// WebSocket, so this @match never fires. All functionality has been merged
// into bettercc.user.js v1.43. Safe to uninstall after updating BetterCC.

(function () {
  "use strict";
  console.log("[BetterCC Chat] DEPRECATED — merged into bettercc.user.js. You can uninstall this script.");
})();
