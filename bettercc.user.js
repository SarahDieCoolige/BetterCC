// ==UserScript==
// @name  BetterCC (dev)
// @description  BetterCC
// @author  Sarah
// @version      3.14.0
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
// @resource  iframe_css  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/v3/css/iframe.css?r=04ae35a7
// @resource  v3_css  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/v3/css/v3.css?r=2fba1bbe
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

"use strict";
(() => {
  // src/commands.ts
  var openMsgCmdRegex = /^\/open\s|^\/o\s/;
  var openMsgReplaceRegex = /^\/open\s+|^\/o\s+/gi;
  var superbanMsgCmdRegex = /^\/superban\s|^\/sb\s/;
  var superbanMsgReplaceRegex = /^\/superban\s+|^\/sb\s+/gi;
  var superwhisperMsgCmdRegex = /^\/superwhisper\s|^\/sw\s/;
  var superwhisperMsgReplaceRegex = /^\/superwhisper\s+|^\/sw\s+/gi;
  var idMsgCmdRegex = /^\/id\b/i;
  var idMsgArgRegex = /^\/id\s+/i;
  var COMMANDS = [
    { cmd: "/w Nick", desc: "einmalig fl\xFCstern" },
    { cmd: "/sw Nick", desc: "dauerhaft fl\xFCstern" },
    { cmd: "/open", desc: "superwhisper beenden" },
    { cmd: "/ignore Nick", desc: "benutzer ignorieren" },
    { cmd: "/id Nick", desc: "ID-Karte \xF6ffnen" },
    { cmd: "/pinned", desc: "angeheftete Benutzer anzeigen" },
    { cmd: "/aw", desc: "Anwesende-\xDCbersicht \xF6ffnen" },
    { cmd: "/color", desc: "Thema-Farbe anzeigen" },
    { cmd: "/scheme", desc: "Scheme-Version anzeigen" },
    { cmd: "/settings", desc: "Einstellungen \xF6ffnen" },
    { cmd: "/reload", desc: "Chat neu laden" },
    { cmd: "/help", desc: "diese Hilfe" }
  ];
  function classifyMessage(mymsg) {
    const lower = mymsg.toLowerCase();
    if (lower === "/help" || lower === "/bettercc") {
      return { handled: true, type: "help" };
    }
    if (lower === "/sb" || lower === "/superban") {
      return { handled: true, type: "superban", nick: "" };
    }
    if (superbanMsgCmdRegex.test(lower)) {
      const nick = mymsg.replace(superbanMsgReplaceRegex, "").split(" ")[0];
      return { handled: true, type: "superban", nick };
    }
    if (idMsgCmdRegex.test(lower)) {
      let name = mymsg.replace(idMsgArgRegex, "").replace(/^\/id$/i, "").trim();
      return { handled: true, type: "id", name };
    }
    if (lower === "/open") {
      return { handled: true, type: "open-whisper" };
    }
    if (lower === "/reload") {
      return { handled: true, type: "reload" };
    }
    if (lower === "/pinned") {
      return { handled: true, type: "pinned-list" };
    }
    if (lower === "/color") {
      return { handled: true, type: "color-info" };
    }
    if (lower === "/scheme") {
      return { handled: true, type: "scheme-info" };
    }
    if (lower === "/settings") {
      return { handled: true, type: "settings" };
    }
    if (lower === "/aw") {
      return { handled: true, type: "aw" };
    }
    if (superwhisperMsgCmdRegex.test(lower)) {
      const nick = mymsg.replace(superwhisperMsgReplaceRegex, "").split(" ")[0];
      return { handled: true, type: "superwhisper", nick };
    }
    if (openMsgCmdRegex.test(lower)) {
      const message = mymsg.replace(openMsgReplaceRegex, "");
      return { handled: true, type: "open-msg", message };
    }
    return { handled: false, message: mymsg };
  }
  function rewriteForWhisper(msg, nick) {
    if (!nick || msg.startsWith("/")) return msg;
    return "/w " + nick + " " + msg;
  }

  // src/utils.ts
  function cclog(str, tag = "BetterCC") {
    GM_log(tag + " - " + str);
  }
  function printHelp() {
    const width = Math.max(...COMMANDS.map((c) => c.cmd.length));
    const text = COMMANDS.map((c) => c.cmd.padEnd(width) + " \u2013 " + c.desc).join("\n");
    printToChat(text);
  }
  function getChatDoc() {
    const f = document.getElementById("chatframe");
    if (!f) return null;
    const doc = f.contentDocument;
    if (!doc || !doc.body) return null;
    return doc;
  }
  function getChatWin() {
    const f = document.getElementById("chatframe");
    return f ? f.contentWindow : null;
  }
  function printToChat(message) {
    const doc = getChatDoc();
    if (!doc?.body) return;
    const hasNewline = message.includes("\n");
    let html;
    if (hasNewline) {
      html = '<div class="bcc-chat-msg"><strong style="color:#ff5577">BetterCC:</strong><br>' + message.replace(/^/gm, "&emsp;").replace(/\n/g, "<br>") + "</div>";
    } else {
      html = '<div class="bcc-chat-msg"><strong style="color:#ff5577">BetterCC:</strong> ' + message + "</div>";
    }
    doc.writeln(html);
    const win = getChatWin();
    if (win) win.scrollTo(0, doc.body.scrollHeight);
  }
  function applyThemeToIframe(bgColor, fgColor) {
    const doc = getChatDoc();
    if (!doc) return;
    const root = doc.documentElement;
    root.style.setProperty("--chatBackground", bgColor);
    root.style.setProperty("--chatText", fgColor);
    doc.body.style.backgroundColor = "var(--chatBackground)";
    doc.body.style.color = "var(--chatText)";
  }
  function encodeChatLink(name) {
    const SAFE = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    const HEX = "0123456789ABCDEF";
    let encoded = "";
    for (let i = 0; i < name.length; i++) {
      const ch = name.charAt(i);
      if (ch === " ") {
        encoded += "-";
      } else if (SAFE.indexOf(ch) !== -1) {
        encoded += ch;
      } else {
        const code = ch.charCodeAt(0);
        if (code > 255) {
          const escaped = encodeURIComponent(ch);
          encoded += ":" + escaped.substring(1, 99) + ":";
        } else {
          encoded += ":";
          encoded += HEX.charAt(code >> 4 & 15);
          encoded += HEX.charAt(code & 15);
          encoded += ":";
        }
      }
    }
    return encoded;
  }
  var userStore = "";
  function getUserKey(key) {
    return `${key}_${userStore}`;
  }
  function setUserStore(nick, isGast) {
    userStore = isGast ? "gast" : nick.toLowerCase();
  }

  // src/upstream.ts
  function getChatNick() {
    return String(unsafeWindow.chat_nick ?? "");
  }
  function getChannel() {
    return String(unsafeWindow.chat_channel ?? "");
  }
  function isAuthDead() {
    return !!unsafeWindow.chatout_auth_dead;
  }
  function getChatoutWs() {
    return unsafeWindow.chatout_ws ?? null;
  }
  function getBettercc() {
    return unsafeWindow.bettercc;
  }
  function getChatUi() {
    return String(unsafeWindow.chat_ui ?? "");
  }
  function isGuest() {
    return !getChatUi().includes("R");
  }
  function getChatId() {
    return String(unsafeWindow.chat_id ?? "");
  }
  function getChatSid() {
    return String(unsafeWindow.chat_sid ?? "");
  }
  function getPChat() {
    return String(unsafeWindow.PCHAT ?? "");
  }
  function getChaMy() {
    const v = unsafeWindow.cha_my;
    return Array.isArray(v) ? v : [];
  }
  function getPAjax() {
    return String(unsafeWindow.PAJAX ?? "");
  }
  function getAjax() {
    return unsafeWindow.ajax;
  }
  function getChannelCategories() {
    return unsafeWindow.ccc ?? [];
  }
  function getChannelGroups() {
    return unsafeWindow.ccg ?? [];
  }
  function fetchAw() {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: "https://images.chatcity.de/script/aw.js?x=" + Date.now(),
        onload: (resp) => resolve(resp.responseText),
        onerror: (err) => reject(err)
      });
    });
  }
  function sendCommand(cmd) {
    const w = unsafeWindow;
    if (typeof w.com_set === "function") {
      w.com_set(cmd);
    } else {
      cclog("sendCommand: com_set unavailable \u2014 dropped: " + cmd, "v3");
    }
  }
  function wrapSetStatus(cb) {
    const w = unsafeWindow;
    if (typeof w.chatout_setstatus !== "function") return false;
    const orig = w.chatout_setstatus;
    w.chatout_setstatus = function(text, color, bold) {
      cb(String(text), color || null);
      orig.call(this, text, color, bold);
    };
    return true;
  }
  function leaveChat() {
    sendCommand("/bye");
    setTimeout(() => window.close(), 1e3);
  }

  // src/chat.ts
  function addAutoscrollBanner(iframeDoc, iframeWin) {
    if (!iframeDoc || !iframeWin) return;
    if (iframeDoc.getElementById("autoscroll-banner")) return;
    const scrollbanner = iframeDoc.createElement("div");
    scrollbanner.id = "autoscroll-banner";
    scrollbanner.textContent = "Zur\xFCck nach unten";
    iframeDoc.body.appendChild(scrollbanner);
    scrollbanner.addEventListener("click", function() {
      iframeWin.scrolling = true;
      scrollbanner.style.display = "none";
    });
    let lastScrollTop = iframeWin.scrollY || iframeDoc.documentElement.scrollTop;
    iframeWin.addEventListener("scroll", function() {
      const scrollPosition = iframeDoc.documentElement.scrollTop || iframeDoc.body.scrollTop;
      const maxScroll = iframeDoc.body.scrollHeight - iframeWin.innerHeight;
      if (scrollPosition < lastScrollTop) {
        if (iframeWin.scrolling && scrollPosition < maxScroll - 1) {
          iframeWin.scrolling = false;
          scrollbanner.style.display = "block";
        }
      }
      if (scrollPosition >= maxScroll - 1) {
        scrollbanner.style.display = "none";
        iframeWin.scrolling = true;
      }
      lastScrollTop = scrollPosition <= 0 ? 0 : scrollPosition;
    });
  }

  // src/scheme-helpers.ts
  function toHex6(color) {
    return color.toHexString().slice(1).toUpperCase();
  }
  function pickReadable(bg, candidates, large = false) {
    return tinycolor.mostReadable(bg, candidates, {
      includeFallbackColors: true,
      level: "AA",
      size: large ? "large" : "small"
    });
  }
  function nudge(color, amount) {
    return color.isLight() ? color.clone().darken(amount) : color.clone().lighten(amount);
  }
  function liftAccent(bg, accent) {
    const minContrast = 3;
    if (tinycolor.readability(bg, accent) >= minContrast) return accent.clone();
    const ops = [
      (c) => c.lighten(20),
      (c) => c.darken(20),
      (c) => c.saturate(30).lighten(15),
      (c) => c.saturate(30).darken(15),
      (c) => c.lighten(40),
      (c) => c.darken(40)
    ];
    for (const op of ops) {
      const cand = op(accent.clone());
      if (tinycolor.readability(bg, cand) >= minContrast) return cand;
    }
    return accent.clone();
  }

  // src/scheme-v1.ts
  var STEP = {
    /** Footer/sidebar sit one tier below the main surface. */
    footerDarken: 15,
    // was: chatBg.darken(15) when light
    footerLighten: 5,
    // was: chatBg.lighten(5) when dark
    footerBrighten: 5,
    sidebarShift: 5,
    // ulistcolor = footercolor ± 5
    /** Input/raised fields are desaturated for legibility. */
    inputDarken: 10,
    // was: darken(10) on dark footers
    inputBrighten: 30,
    // was: brighten(30) on light footers
    /** Hover/active feedback layers. */
    hoverShift: 8,
    activeShift: 14,
    /** Border opacity-equivalent: a faint darkening of the surface. */
    borderDarken: 18,
    /** Accent candidates: saturation/luminance window for visibility. */
    accentMinLight: 35,
    accentMaxLight: 65
  };
  function generateScheme(baseColor, options) {
    const surface = tinycolor(baseColor);
    const darkMode = options?.darkMode ?? !surface.isLight();
    const text = pickReadable(surface, surface.monochromatic().concat(surface.analogous()));
    const footer = darkMode ? surface.clone().lighten(STEP.footerLighten).brighten(STEP.footerBrighten) : surface.clone().darken(STEP.footerDarken).brighten(STEP.footerBrighten);
    const sidebar = nudge(footer, STEP.sidebarShift);
    const inputBase = darkMode ? footer.clone().darken(STEP.inputDarken) : footer.clone().brighten(STEP.inputBrighten);
    const input = inputBase;
    const raised = inputBase;
    const textRaised = pickReadable(raised, raised.monochromatic(), true);
    const textInput = pickReadable(input, input.monochromatic());
    const textSidebar = pickReadable(
      sidebar,
      sidebar.monochromatic().concat(surface.monochromatic())
    );
    const textMuted = pickReadable(footer, surface.monochromatic().concat(surface.analogous()));
    const textPlaceholder = textInput.clone();
    const icon = pickReadable(sidebar, surface.monochromatic(), true);
    const triad = surface.triad();
    const accentWhisper = liftAccent(surface, triad[1]);
    const accentBan = liftAccent(surface, triad[2]);
    const textAway = pickReadable(sidebar, [textSidebar.clone().desaturate(60), textMuted.clone()]);
    const surfaceHover = nudge(surface, STEP.hoverShift);
    const surfaceActive = nudge(surface, STEP.activeShift);
    const border = surface.clone().darken(STEP.borderDarken);
    return {
      surface: toHex6(surface),
      text: toHex6(text),
      surfaceRaised: toHex6(raised),
      textRaised: toHex6(textRaised),
      surfaceInput: toHex6(input),
      textInput: toHex6(textInput),
      surfaceFooter: toHex6(footer),
      surfaceSidebar: toHex6(sidebar),
      textSidebar: toHex6(textSidebar),
      textMuted: toHex6(textMuted),
      textPlaceholder: toHex6(textPlaceholder),
      icon: toHex6(icon),
      accentWhisper: toHex6(accentWhisper),
      accentBan: toHex6(accentBan),
      textAway: toHex6(textAway),
      border: toHex6(border),
      surfaceHover: toHex6(surfaceHover),
      surfaceActive: toHex6(surfaceActive),
      bgHex: toHex6(surface)
    };
  }

  // src/scheme-v2.ts
  var STEP2 = {
    // ── Surface luminance deltas (HSL lightness units) ───────────────────
    /** surface-1: subtle elevation (footer / sidebar) — 8 units from base. */
    surface1Step: 4,
    /** surface-2: raised (popups / overlays) — 16 units from base. */
    surface2Step: 16,
    /** surface-3: sunken (inputs) — 8 units, opposite direction. */
    surface3Step: 8,
    // ── Desaturation ─────────────────────────────────────────────────────
    /** How much of the base saturation to strip per derived tier.
     *  0 = keep full saturation, 1 = fully greyscale. */
    desatFactor: 0.1,
    // ── Luminance bounds (WCAG relative luminance, 0‑1) ──────────────────
    /** Minimum WCAG luminance gap between adjacent surface tiers. */
    minLuminanceGap: 0.015,
    // ── Border offsets (from surface‑1, HSL lightness units) ─────────────
    /** border-0: barely-there sibling separators. */
    borderSubtleShift: 4,
    /** border-1: region separators (chatbar top, stats bar). */
    borderMediumShift: 10,
    /** border-2: outlines, popup edges. */
    borderStrongShift: 20,
    // ── Interaction nudge amounts ────────────────────────────────────────
    hoverShift: 6,
    activeShift: 12
  };
  function wcagLum(color) {
    return color.getLuminance();
  }
  function pickTinted(bg, candidates, targetContrast = 4.5, minContrast = 3) {
    let best = candidates[0];
    let bestDiff = Infinity;
    for (const c of candidates) {
      const cr = tinycolor.readability(bg, c);
      if (cr < minContrast) continue;
      const diff = Math.abs(cr - targetContrast);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = c;
      }
    }
    return best;
  }
  function tierStep(color, amount, darkMode) {
    return darkMode ? color.clone().lighten(amount) : color.clone().darken(amount);
  }
  function generateScheme2(baseColor, options) {
    const raw = tinycolor(baseColor);
    const darkMode = options?.darkMode ?? !raw.isLight();
    const base = raw.clone();
    const s0 = base.clone();
    const s1 = tierStep(s0, STEP2.surface1Step, darkMode);
    const s2 = tierStep(s0, STEP2.surface2Step, darkMode);
    const s3 = tierStep(s0, STEP2.surface3Step, !darkMode);
    const baseSat = base.toHsl().s;
    for (const [surf, tier] of [
      [s1, 1],
      [s2, 2],
      [s3, 1]
    ]) {
      if (baseSat > 0.4) {
        const desatAmount = Math.round(baseSat * STEP2.desatFactor * tier * 100);
        if (desatAmount > 0) surf.desaturate(desatAmount);
      }
    }
    const tiers = [s0, s1, s2, s3];
    for (let i = 1; i < tiers.length; i++) {
      const prev = tiers[i - 1];
      const curr = tiers[i];
      const gap = Math.abs(wcagLum(curr) - wcagLum(prev));
      if (gap < STEP2.minLuminanceGap) {
        const pushAmount = 6;
        if (darkMode) {
          if (i === 3) curr.darken(pushAmount);
          else curr.lighten(pushAmount);
        } else {
          if (i === 3) curr.lighten(pushAmount);
          else curr.darken(pushAmount);
        }
      }
    }
    const text0 = pickReadable(s0, s0.monochromatic().concat(s0.analogous()));
    const text1 = pickReadable(s1, s0.monochromatic().concat(s0.analogous()));
    const textRaisedVal = pickReadable(s2, s2.monochromatic(), true);
    const textInputVal = pickReadable(s3, s3.monochromatic());
    const textSidebarVal = pickTinted(
      s1,
      s1.monochromatic().concat(s0.monochromatic()),
      4.5,
      // target body-text AA
      3
      // minimum large-text AA (sidebar uses 14px/600)
    );
    const textMutedVal = text1;
    const textPlaceholderVal = text1;
    const iconVal = pickTinted(s1, s1.monochromatic(), 3.5, 3);
    const border1 = nudge(s1, STEP2.borderMediumShift);
    const surfaceHoverVal = nudge(s0, STEP2.hoverShift);
    const surfaceActiveVal = nudge(s0, STEP2.activeShift);
    const triad = s0.triad();
    const accentWhisperVal = liftAccent(s0, triad[1]);
    const accentBanVal = liftAccent(s0, triad[2]);
    const textAwayVal = pickReadable(s1, [
      textSidebarVal.clone().desaturate(60),
      textMutedVal.clone()
    ]);
    return {
      // ── Old element-named fields (drop-in compat) ───────────────────
      surface: toHex6(s0),
      text: toHex6(text0),
      surfaceRaised: toHex6(s2),
      textRaised: toHex6(textRaisedVal),
      surfaceInput: toHex6(s3),
      textInput: toHex6(textInputVal),
      surfaceFooter: toHex6(s1),
      surfaceSidebar: toHex6(s1),
      textSidebar: toHex6(textSidebarVal),
      textMuted: toHex6(textMutedVal),
      textPlaceholder: toHex6(textPlaceholderVal),
      icon: toHex6(iconVal),
      accentWhisper: toHex6(accentWhisperVal),
      accentBan: toHex6(accentBanVal),
      textAway: toHex6(textAwayVal),
      border: toHex6(border1),
      surfaceHover: toHex6(surfaceHoverVal),
      surfaceActive: toHex6(surfaceActiveVal),
      bgHex: toHex6(raw)
    };
  }

  // src/scheme.ts
  var _v2 = typeof location !== "undefined" && new URLSearchParams(location.search).has("schemev2");
  function enableV2Scheme() {
    _v2 = true;
  }
  function disableV2Scheme() {
    _v2 = false;
  }
  var generateScheme3 = (base, opts) => _v2 ? generateScheme2(base, opts) : generateScheme(base, opts);

  // src/store.ts
  var isString = (v) => typeof v === "string";
  var isBoolean = (v) => typeof v === "boolean";
  var isStringArray = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
  var isHexColor = (v) => typeof v === "string" && /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);
  var emptySession = {
    nick: "",
    registered: false,
    guest: false,
    userId: "",
    sessionId: "",
    channel: "",
    authDead: false
  };
  var codecs = {
    color: {
      encode: (v) => v,
      decode: (r) => r,
      default: "6AAED8",
      persisted: true,
      valid: isHexColor
    },
    scheme_v2: {
      encode: (v) => v,
      decode: (r) => r,
      default: false,
      persisted: true,
      valid: isBoolean
    },
    pinned: {
      encode: (v) => v,
      decode: (r) => r,
      default: [],
      persisted: true,
      valid: isStringArray
    },
    whisper: {
      encode: (v) => v,
      decode: (r) => r,
      default: "",
      persisted: true,
      valid: isString
    },
    compact: {
      encode: (v) => v ? "1" : "",
      decode: (r) => r === "1",
      default: false,
      persisted: true,
      valid: isBoolean
    },
    send_on_enter: {
      encode: (v) => v,
      decode: (r) => r,
      default: true,
      persisted: true,
      valid: isBoolean
    },
    hover_preview: {
      encode: (v) => v,
      decode: (r) => r,
      default: true,
      persisted: true,
      valid: isBoolean
    },
    ban: {
      encode: (v) => v,
      decode: (r) => r,
      default: [],
      persisted: true,
      valid: isStringArray
    },
    session: {
      encode: (v) => v,
      decode: () => emptySession,
      default: emptySession,
      persisted: false
    },
    userlist: {
      encode: (v) => v,
      decode: () => ({ users: [], added: [], removed: [] }),
      default: { users: [], added: [], removed: [] },
      persisted: false
    },
    globalUserlist: {
      encode: (v) => v,
      decode: () => ({ channels: /* @__PURE__ */ new Map(), added: [], removed: [] }),
      default: { channels: /* @__PURE__ */ new Map(), added: [], removed: [] },
      persisted: false
    },
    conn: {
      encode: (v) => v,
      decode: () => ({ phase: "connecting", attempt: 0, since: 0, lastMessageAt: 0 }),
      default: { phase: "connecting", attempt: 0, since: 0, lastMessageAt: 0 },
      persisted: false
    },
    bccHealth: {
      encode: (v) => v,
      decode: () => ({
        bootError: null,
        sendPathBroken: null,
        injectionDegraded: false,
        invalidSettings: [],
        persistFailed: false
      }),
      default: {
        bootError: null,
        sendPathBroken: null,
        injectionDegraded: false,
        invalidSettings: [],
        persistFailed: false
      },
      persisted: false
    },
    freshness: {
      encode: (v) => v,
      decode: () => ({ ulistAt: 0, awAt: 0, statsAt: 0 }),
      default: { ulistAt: 0, awAt: 0, statsAt: 0 },
      persisted: false
    }
  };
  var initialized = false;
  var mirror = {};
  var subscribers = /* @__PURE__ */ new Map();
  function sameValue(a, b) {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length === b.length && a.every((v, i) => v === b[i]);
    }
    return false;
  }
  function assertInit() {
    if (!initialized) throw new Error("store not initialized");
  }
  function notify(k, v) {
    const set2 = subscribers.get(k);
    if (!set2) return;
    for (const fn of set2) {
      try {
        fn(v);
      } catch (e) {
        cclog(`render for "${k}" threw: ${e.message}`, "store");
      }
    }
  }
  async function initStore() {
    if (initialized) throw new Error("initStore already called");
    initialized = true;
    const invalidKeys = [];
    for (const [key, codec] of Object.entries(codecs)) {
      if (!codec.persisted) {
        mirror[key] = codec.default;
        continue;
      }
      try {
        const raw = await GM.getValue(getUserKey(key));
        if (raw === void 0) {
          mirror[key] = codec.default;
          continue;
        }
        const decoded = codec.decode(raw);
        if (codec.valid && !codec.valid(decoded)) {
          cclog(`initStore: corrupt stored ${key}, using default`, "store");
          mirror[key] = codec.default;
          invalidKeys.push({ key, value: raw });
        } else {
          mirror[key] = decoded;
        }
      } catch {
        cclog(`initStore: failed to read ${key}, using default`, "store");
        mirror[key] = codec.default;
      }
    }
    if (invalidKeys.length > 0) {
      mirror.bccHealth = { ...mirror.bccHealth, invalidSettings: invalidKeys };
    }
    if (typeof GM_addValueChangeListener === "function") {
      cclog("GM_addValueChangeListener available, registering reconciliation listeners", "store");
      for (const [key, codec] of Object.entries(codecs)) {
        if (!codec.persisted) continue;
        const scopedKey = getUserKey(key);
        GM_addValueChangeListener(scopedKey, () => {
          GM.getValue(scopedKey).then((raw) => {
            let decoded = raw !== void 0 ? codec.decode(raw) : codec.default;
            if (codec.valid && !codec.valid(decoded)) {
              cclog(`reconciliation: invalid stored ${key}, using default`, "store");
              decoded = codec.default;
            }
            if (sameValue(decoded, mirror[key])) return;
            mirror[key] = decoded;
            notify(key, decoded);
          }).catch(() => {
            cclog(`reconciliation: failed to re-read ${key}`, "store");
          });
        });
      }
    } else {
      cclog("GM_addValueChangeListener not available, cross-tab sync disabled", "store");
    }
  }
  function get(k) {
    assertInit();
    return mirror[k];
  }
  async function set(k, v) {
    assertInit();
    const codec = codecs[k];
    if (codec.persisted && codec.valid && !codec.valid(v)) {
      cclog(`set: rejected invalid value for ${k}`, "store");
      return;
    }
    mirror[k] = v;
    notify(k, v);
    if (codec.persisted) {
      try {
        await GM.setValue(getUserKey(k), codec.encode(v));
      } catch {
        cclog(`set: failed to persist ${k}`, "store");
        if (!mirror.bccHealth.persistFailed) {
          mirror.bccHealth = { ...mirror.bccHealth, persistFailed: true };
          notify("bccHealth", mirror.bccHealth);
        }
      }
    }
  }
  function on(k, fn) {
    assertInit();
    if (!subscribers.has(k)) subscribers.set(k, /* @__PURE__ */ new Set());
    const set2 = subscribers.get(k);
    set2.add(fn);
    return () => {
      set2.delete(fn);
    };
  }
  function react(k, render2) {
    render2(get(k));
    return on(k, render2);
  }
  function snapshot() {
    assertInit();
    const result = {};
    for (const key of Object.keys(codecs)) {
      const v = mirror[key];
      if (Array.isArray(v)) {
        result[key] = [...v];
        continue;
      }
      if (key === "globalUserlist" && v && typeof v === "object" && "channels" in v && v.channels instanceof Map) {
        const gu = v;
        result[key] = {
          channels: Object.fromEntries(gu.channels),
          added: [...gu.added],
          removed: [...gu.removed]
        };
        continue;
      }
      result[key] = v;
    }
    return result;
  }

  // src/theme.ts
  var BCC_ROLE_VARS = [
    ["surface", "--bcc-surface"],
    ["text", "--bcc-text"],
    ["surfaceRaised", "--bcc-surface-raised"],
    ["textRaised", "--bcc-text-raised"],
    ["surfaceInput", "--bcc-surface-input"],
    ["textInput", "--bcc-text-input"],
    ["surfaceFooter", "--bcc-surface-footer"],
    ["surfaceSidebar", "--bcc-surface-sidebar"],
    ["textSidebar", "--bcc-text-sidebar"],
    ["textMuted", "--bcc-text-muted"],
    ["textPlaceholder", "--bcc-text-placeholder"],
    ["icon", "--bcc-icon"],
    ["accentWhisper", "--bcc-accent-whisper"],
    ["accentBan", "--bcc-accent-ban"],
    ["textAway", "--bcc-text-away"],
    ["border", "--bcc-border"],
    ["surfaceHover", "--bcc-surface-hover"],
    ["surfaceActive", "--bcc-surface-active"]
  ];
  var BCC_CSS_VARS = BCC_ROLE_VARS.map(([, v]) => v);
  function schemeToCssVars(scheme) {
    const out = {};
    for (const [role, varName] of BCC_ROLE_VARS) {
      out[varName] = "#" + scheme[role];
    }
    return out;
  }
  function applyScheme(scheme) {
    const target = document.querySelector(".bcc-shell");
    const root = target ?? document.documentElement;
    for (const [varName, value] of Object.entries(schemeToCssVars(scheme))) {
      root.style.setProperty(varName, value);
    }
    applyThemeToIframe("#" + scheme.surface, "#" + scheme.text);
  }
  function applyCurrentScheme() {
    if (get("scheme_v2")) enableV2Scheme();
    else disableV2Scheme();
    const scheme = generateScheme3(get("color"));
    applyScheme(scheme);
  }
  function initTheme() {
    react("color", applyCurrentScheme);
    react("scheme_v2", applyCurrentScheme);
  }
  async function setColor(hex) {
    await set("color", hex);
  }
  function toggleSchemeVersion() {
    return setSchemeVersion(!get("scheme_v2"));
  }
  async function setSchemeVersion(v2) {
    await set("scheme_v2", v2);
  }

  // src/cadences.ts
  var POLL_CADENCES = {
    /** Current-channel userlist (ulist-poll.ts), replaces upstream's 20s get_info timer. */
    ulist: 2e4,
    /** Global userlist aw.js fetch (global-userlist.ts). */
    aw: 5e3,
    /** Freunde stats fetch (stats.ts), matches upstream cadence. */
    stats: 1e4
  };

  // src/health-core.ts
  var STALE_FACTOR = 3;
  var STALE_MIN_MS = 3e4;
  function nextConn(prev, ev) {
    if (prev.phase === "authdead") return prev;
    switch (ev.type) {
      case "open":
        return { ...prev, phase: "connected", attempt: 0, since: ev.at };
      case "close":
        return { ...prev, phase: "connecting", attempt: prev.attempt + 1, since: ev.at };
      case "authdead":
        return { ...prev, phase: "authdead", since: ev.at };
      case "message":
        return { ...prev, lastMessageAt: ev.at };
    }
  }
  function staleThreshold(interval) {
    return Math.max(interval * STALE_FACTOR, STALE_MIN_MS);
  }
  function staleMarkers(freshness, now) {
    const staleAge = (stamp, interval) => stamp > 0 && now - stamp > staleThreshold(interval) ? now - stamp : null;
    return {
      ulist: staleAge(freshness.ulistAt, POLL_CADENCES.ulist),
      aw: staleAge(freshness.awAt, POLL_CADENCES.aw),
      stats: staleAge(freshness.statsAt, POLL_CADENCES.stats)
    };
  }
  function nextStaleChange(freshness, now) {
    let next = null;
    const consider = (t) => {
      if (t > now && (next === null || t < next)) next = t;
    };
    const sources = [
      [freshness.ulistAt, POLL_CADENCES.ulist],
      [freshness.awAt, POLL_CADENCES.aw],
      [freshness.statsAt, POLL_CADENCES.stats]
    ];
    for (const [stamp, interval] of sources) {
      if (stamp === 0) continue;
      consider(stamp + staleThreshold(interval));
      const elapsed = now - stamp;
      const elapsedMinutes = Math.floor(elapsed / 6e4);
      consider(stamp + (elapsedMinutes + 1) * 6e4);
      const elapsedSeconds = Math.floor(elapsed / 1e3);
      if (elapsed > staleThreshold(interval) && elapsedSeconds < 60) {
        consider(stamp + (elapsedSeconds + 1) * 1e3);
      }
    }
    return next;
  }

  // src/health-strings.ts
  var STATUS_BUTTON_TITLE = "Chat neu laden \u2014 {state}";
  var STATUS_TEXT = {
    connected: "verbunden",
    connecting: "verbinde\u2026",
    retry: "Versuch {n}",
    authdead: "Session abgelaufen"
  };
  function statusButtonTitle(state2) {
    return STATUS_BUTTON_TITLE.replace("{state}", state2);
  }
  function retryText(n) {
    return STATUS_TEXT.retry.replace("{n}", String(n));
  }
  var CARD_AUTHDEAD_TITLE = "Session abgelaufen";
  var CARD_AUTHDEAD_TEXT = "L\xE4sst sich nicht automatisch erneuern. Seite neu laden meldet dich direkt wieder an \u2014 dein Text bleibt erhalten.";
  var ACTION_PAGE_RELOAD = "Seite neu laden";
  var ACTION_LATER = "Sp\xE4ter";
  var CARD_BOOT_TITLE = "BetterCC konnte nicht starten";
  var BOOT_REASON_STRUCTURE = "Unerwartete Seitenstruktur \u2014 vermutlich hat ChatCity etwas ge\xE4ndert.";
  var BOOT_REASON_WS = "Chat-WebSocket konnte nicht \xFCbernommen werden.";
  var CARD_BOOT_RUNS_ON = "Der Chat l\xE4uft weiter \u2014 nur ohne BetterCC.";
  var ACTION_COPY_DETAILS = "Details kopieren";
  var ACTION_CONTINUE_CHAT = "Weiter chatten";
  var CARD_SEND_BROKEN_TITLE = "Senden defekt";
  var CARD_SEND_BROKEN_TEXT = "ChatCity hat den Sendeweg ge\xE4ndert. Hilft nur ein BetterCC-Update.";
  var ACTION_COPY_ERROR = "Fehler kopieren";
  var BANNER_OPTICS_TEXT = "Chat ohne BetterCC-Design \u2014 Senden l\xE4uft normal, Neu laden behebt es";
  var ACTION_RELOAD = "Neu laden";
  var STALE_LABEL_ULIST = "Nutzerliste";
  var STALE_LABEL_AW = "Globale Nutzerliste";
  var STALE_LABEL_STATS = "Statistiken";
  function staleText(label, ageMs) {
    const secs = Math.floor(ageMs / 1e3);
    const ago = secs < 60 ? secs + " s" : Math.floor(secs / 60) + " min";
    return label + " \u2014 zuletzt aktualisiert vor " + ago;
  }
  function invalidSettingsText(entries) {
    const parts = entries.map((e) => e.key + ": " + formatStoredValue(e.value));
    const noun = entries.length === 1 ? "Ung\xFCltige Einstellung" : "Ung\xFCltige Einstellungen";
    return noun + " \u2014 " + parts.join(", ");
  }
  function formatStoredValue(value) {
    const s = JSON.stringify(value) ?? String(value);
    return s.length > 40 ? s.slice(0, 39) + "\u2026" : s;
  }
  var PERSIST_FAILED_TEXT = "Speichern fehlgeschlagen \u2014 gilt nur bis zum Neuladen.";

  // src/health-strip.ts
  var NOTICE_MS = 8e3;
  function stripView(injectionDegraded, now, notice2) {
    if (notice2 && now < notice2.until) {
      return { text: notice2.text, color: notice2.color, reload: false };
    }
    if (injectionDegraded) {
      return { text: BANNER_OPTICS_TEXT, color: null, reload: true };
    }
    return null;
  }
  var notice = null;
  var noticeTimer = null;
  var strip = null;
  function showStripNotice(text, color) {
    notice = { text, color, until: Date.now() + NOTICE_MS };
    if (noticeTimer !== null) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      noticeTimer = null;
      notice = null;
      render();
    }, NOTICE_MS);
    render();
  }
  function render() {
    if (!strip) return;
    const view = stripView(get("bccHealth").injectionDegraded, Date.now(), notice);
    if (view === null) {
      strip.classList.remove("bcc-strip-visible");
      strip.replaceChildren();
      delete strip.dataset.key;
      return;
    }
    const key = view.text + "|" + (view.color ?? "");
    if (strip.dataset.key === key) return;
    strip.dataset.key = key;
    strip.classList.add("bcc-strip-visible");
    strip.replaceChildren();
    const line = document.createElement("span");
    line.textContent = view.text;
    if (view.color) line.style.color = view.color;
    strip.appendChild(line);
    if (view.reload) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bcc-strip-reload";
      btn.textContent = ACTION_RELOAD;
      btn.addEventListener("click", reloadAction);
      strip.appendChild(btn);
    }
  }
  var reloadAction = () => {
  };
  function mountHealthStrip(onReload) {
    reloadAction = onReload;
    const main = document.querySelector(".bcc-main");
    if (!main) return;
    strip = document.createElement("div");
    strip.className = "bcc-health-strip";
    main.prepend(strip);
    react("bccHealth", () => render());
    render();
  }

  // src/health.ts
  var lastWs = null;
  function applyConnEvent(ev) {
    const prev = get("conn");
    set("conn", nextConn(prev, ev));
  }
  function attachConnListeners(ws) {
    if (ws === lastWs) return;
    lastWs = ws;
    ws.addEventListener("open", () => {
      applyConnEvent({ type: "open", at: Date.now() });
    });
    ws.addEventListener("close", () => {
      applyConnEvent({ type: "close", at: Date.now() });
    });
    if (ws.readyState === WebSocket.OPEN) {
      applyConnEvent({ type: "open", at: Date.now() });
    }
  }
  function stampFreshness(source) {
    set("freshness", { ...get("freshness"), [source]: Date.now() });
  }
  function stampConnMessage() {
    applyConnEvent({ type: "message", at: Date.now() });
  }
  function initHealth() {
    const applyAuthDead = () => {
      if (get("session").authDead) {
        applyConnEvent({ type: "authdead", at: Date.now() });
      }
    };
    applyAuthDead();
    on("session", applyAuthDead);
    cclog("health wiring: init done", "health");
  }
  function reportBootError(code) {
    try {
      set("bccHealth", { ...get("bccHealth"), bootError: code });
    } catch (e) {
      cclog("reportBootError: store not up (" + e.message + ")", "health");
    }
  }
  function reportSendPathBroken(message) {
    set("bccHealth", { ...get("bccHealth"), sendPathBroken: message });
  }
  function reportInjectionDegraded(degraded) {
    if (get("bccHealth").injectionDegraded === degraded) return;
    set("bccHealth", { ...get("bccHealth"), injectionDegraded: degraded });
  }
  function isConnectionStatus(text) {
    return text.startsWith("Verbinde") || // "Verbinde..."
    text.startsWith("Verbindung") || // "Verbindung verloren / unterbrochen"
    text === "Verbunden";
  }
  function initSetStatusWrap() {
    const ok = wrapSetStatus((text, color) => {
      if (!isConnectionStatus(text)) showStripNotice(text, color);
    });
    if (!ok) cclog("initSetStatusWrap: chatout_setstatus missing upstream", "health");
  }
  var invalidNoticeShown = false;
  var persistNoticeShown = false;
  function initSettingsNotices() {
    react("bccHealth", (h) => {
      if (h.invalidSettings.length > 0 && !invalidNoticeShown) {
        invalidNoticeShown = true;
        showStripNotice(invalidSettingsText(h.invalidSettings), null);
      }
      if (h.persistFailed && !persistNoticeShown) {
        persistNoticeShown = true;
        showStripNotice(PERSIST_FAILED_TEXT, null);
      }
    });
  }

  // src/ws-hook.ts
  var upstreamChatoutConnect = null;
  var upstreamOnMessage = null;
  var INJECTION_RETRY_MS = 50;
  var MAX_INJECTION_RETRIES = 50;
  var injectionRetries = 0;
  var injectionScheduled = false;
  var _iframeMousedownBody = null;
  function injectIntoChatframe() {
    const doc = getChatDoc();
    const win = getChatWin();
    if (!doc || !win || !doc.body) {
      if (injectionScheduled) return;
      if (injectionRetries++ >= MAX_INJECTION_RETRIES) {
        injectionRetries = 0;
        reportInjectionDegraded(true);
        return;
      }
      injectionScheduled = true;
      setTimeout(() => {
        injectionScheduled = false;
        injectIntoChatframe();
      }, INJECTION_RETRY_MS);
      return;
    }
    injectionRetries = 0;
    const iframeCss = GM_getResourceText("iframe_css");
    if (iframeCss) {
      const style = doc.createElement("style");
      style.textContent = iframeCss;
      style.setAttribute("data-bcc-iframe", "");
      if (doc.head) {
        doc.head.appendChild(style);
      } else {
        const head = doc.createElement("head");
        head.appendChild(style);
        doc.documentElement.insertBefore(head, doc.body);
      }
    }
    applyCurrentScheme();
    doc.body.style.setProperty("background-color", "var(--chatBackground)");
    doc.body.style.setProperty("color", "var(--chatText)");
    addAutoscrollBanner(doc, win);
    if (doc.body !== _iframeMousedownBody) {
      _iframeMousedownBody = doc.body;
      doc.body.addEventListener("mousedown", () => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        window.dispatchEvent(new CustomEvent("bcc-iframe-interaction"));
      });
    }
    reportInjectionDegraded(false);
    cclog("injectIntoChatframe: injection complete");
  }
  function betterccOnWsMessage(ev) {
    stampConnMessage();
    if (typeof upstreamOnMessage === "function") {
      try {
        upstreamOnMessage.call(unsafeWindow.chatout_ws, ev);
      } catch (e) {
        cclog("betterccOnWsMessage: upstream onmessage threw \u2014 " + e.message, "ws-hook");
      }
    }
    const doc = getChatDoc();
    if (doc && doc.querySelector("style[data-bcc-iframe]")) {
      doc.body.style.setProperty("background-color", "var(--chatBackground)");
      doc.body.style.setProperty("color", "var(--chatText)");
    } else {
      injectIntoChatframe();
    }
  }
  function attachWsListeners() {
    if (unsafeWindow.chatout_ws) {
      upstreamOnMessage = unsafeWindow.chatout_ws.onmessage;
      unsafeWindow.chatout_ws.onmessage = betterccOnWsMessage;
      attachConnListeners(unsafeWindow.chatout_ws);
    }
  }
  function hookChatoutConnect() {
    if (typeof unsafeWindow.chatout_connect === "function") {
      upstreamChatoutConnect = unsafeWindow.chatout_connect;
      unsafeWindow.chatout_connect = function() {
        upstreamChatoutConnect.apply(this, arguments);
        attachWsListeners();
      };
      attachWsListeners();
    } else {
      cclog("WARNING: chatout_connect not found \u2014 WebSocket hook failed");
      reportBootError("ws-takeover");
    }
  }

  // src/shell.ts
  function buildShell() {
    const chatframe = document.getElementById("chatframe");
    const table = document.querySelector("table.c_tab");
    if (!chatframe || !table) {
      cclog("v3 shell: chatframe or table not found \u2014 aborting", "v3");
      return false;
    }
    if (document.querySelector(".bcc-shell")) return true;
    const hold = document.querySelector('form[name="hold"]');
    const of = document.querySelector('form[name="OF"]');
    if (hold) {
      document.body.appendChild(hold);
      hold.style.display = "none";
    }
    if (of) {
      document.body.appendChild(of);
      of.style.display = "none";
    }
    const shell = document.createElement("div");
    shell.className = "bcc-shell";
    const sidebar = document.createElement("aside");
    sidebar.className = "bcc-sidebar";
    sidebar.innerHTML = '<div class="bcc-sidebar-placeholder">Userlist (T7)</div>';
    const main = document.createElement("main");
    main.className = "bcc-main";
    main.appendChild(chatframe);
    const inputArea = document.createElement("div");
    inputArea.className = "bcc-chatbar";
    inputArea.innerHTML = '<div class="bcc-chatbar-placeholder">Chatbar (T8/T9)</div>';
    shell.append(sidebar, main, inputArea);
    document.body.appendChild(shell);
    table.style.display = "none";
    cclog("v3 shell built \u2014 chatframe moved, table hidden", "v3");
    return true;
  }
  function reloadChat() {
    if (isAuthDead()) {
      cclog("reloadChat: auth_dead, doing full page reload", "v3");
      location.reload();
      return;
    }
    const ws = getChatoutWs();
    if (ws) {
      cclog("reloadChat: closing WS to trigger reconnect", "v3");
      ws.close();
    } else {
      cclog("reloadChat: no WS \u2014 nothing to reconnect", "v3");
    }
  }

  // src/userlist.ts
  function parseUserlist(chaMy) {
    const users = [];
    for (let i = 0; i + 1 < chaMy.length; i += 2) {
      const name = chaMy[i];
      if (name === "") break;
      const status = chaMy[i + 1] ?? "";
      users.push(decodeStatus(name, status));
    }
    return users;
  }
  function decodeStatus(name, status) {
    const registered = status.includes("R");
    const guest = status.includes("h") && !registered;
    return {
      name,
      key: name.toLowerCase(),
      registered,
      guest,
      sep: status.includes("S"),
      away: status.includes("A")
    };
  }
  function diffUserlists(oldList, newList) {
    const oldNames = new Set(oldList.map((u) => u.name));
    const newNames = new Set(newList.map((u) => u.name));
    const added = [];
    const removed = [];
    for (const u of newList) if (!oldNames.has(u.name)) added.push(u.name);
    for (const u of oldList) if (!newNames.has(u.name)) removed.push(u.name);
    return { added, removed };
  }
  var LOCALE = "de";
  var SORT_OPTS = {
    sensitivity: "base",
    collation: "phonebk"
  };
  function sortUsers(users, pinned) {
    const cmp = new Intl.Collator(LOCALE, SORT_OPTS);
    return [...users].sort((a, b) => {
      const pa = pinned.has(a.key) ? 0 : 1;
      const pb = pinned.has(b.key) ? 0 : 1;
      return pa - pb || cmp.compare(a.name, b.name);
    });
  }
  var STRING_LITERAL = /"((?:[^"\\]|\\.)*)"/g;
  function parseAw(raw) {
    const channels = /* @__PURE__ */ new Map();
    const arrayStart = raw.indexOf("new Array(");
    if (arrayStart === -1) return channels;
    const body = raw.slice(arrayStart);
    const literals = body.match(STRING_LITERAL);
    if (!literals) return channels;
    for (let i = 0; i + 2 < literals.length; i += 3) {
      const channel = literals[i].slice(1, -1);
      if (channel === "") break;
      channels.set(channel, parseAwUsers(literals[i + 2].slice(1, -1)));
    }
    return channels;
  }
  function parseAwUsers(raw) {
    const users = [];
    for (const entry of raw.split(" ")) {
      if (entry === "") continue;
      users.push(decodeAwEntry(entry));
    }
    return users;
  }
  function decodeAwEntry(entry) {
    const guestMatch = entry.match(/\^(\d+)$/);
    const name = guestMatch ? entry.slice(0, guestMatch.index) : entry;
    return {
      name,
      key: name.toLowerCase(),
      registered: false,
      guest: guestMatch !== null,
      sep: false,
      away: false
    };
  }
  function channelAbbrev(name, index) {
    const hadHyphens = name.includes("-");
    const stripped = name.replace(/-/g, "");
    switch (stripped.toLowerCase()) {
      case "mod":
        return "MOD";
      case "zauberwald":
        return "Zaub";
      case "bizarretalk":
        return "BizT";
      case "herzklopfen":
        return "HerzK";
      case "knuddelecke":
        return "KnudE";
      case "hexensabbat":
        return "HexS";
      case "bluemchensex":
        return "Bluem";
      case "manstreet":
        return "ManS";
      case "fortysomething":
        return "Forty";
      case "trauminsel":
        return "Traum";
      case "streikchannel":
        return "Streik";
      case "goldenfifty":
        return "Golden";
      case "herzschmerz":
        return "HerzS";
      case "nerdkultur":
        return "NerdK";
      case "query":
        return "Query";
      case "gaycruising":
        return "Gay";
      case "womencorner":
        return "WoCo";
      case "erorsp":
        return "EroR";
      case "erotik":
        return "Ero";
      case "erotik2":
        return "Ero2";
      case "erotik3":
        return "Ero3";
      case "erotik4":
        return "Ero4";
      case "registriert":
        return "Reg";
      case "chatcity":
        return "CC";
      case "international":
        return "Intl";
      case "baklava":
        return "Bak";
    }
    if (stripped.length <= 3) return stripped;
    let abbrev;
    if (!hadHyphens) {
      const internalCaps = stripped.slice(1).replace(/[^A-Z]/g, "");
      if (internalCaps.length > 0) {
        abbrev = stripped[0].toUpperCase() + stripped[1].toLowerCase() + internalCaps;
      } else {
        abbrev = stripped[0].toUpperCase() + stripped.slice(1, 3).toLowerCase();
      }
    } else {
      abbrev = stripped[0].toUpperCase() + stripped.slice(1, 3).toLowerCase();
    }
    const digitMatch = stripped.match(/(\d+)$/);
    if (digitMatch) {
      abbrev = stripped[0].toUpperCase() + stripped.slice(1, 2).toLowerCase() + digitMatch[1];
    }
    if (index > 0 && index < stripped.length - 2) {
      abbrev = stripped[0].toUpperCase() + stripped.slice(1, 3 + index).toLowerCase();
    }
    return abbrev;
  }

  // src/ulist-poll.ts
  var chatId = "";
  var chatSid = "";
  var pchatBase = "";
  var prevList = [];
  var timerId;
  var running = false;
  var stale = true;
  function parseUlistResponse(text) {
    const decl = text.match(/var\s+cha_my\s*=\s*new\s+Array\([\s\S]*?\)\s*;/);
    if (!decl) return [];
    try {
      const fn = new Function(`${decl[0]} return cha_my;`);
      return fn();
    } catch {
      return [];
    }
  }
  function processUserlist(chaMy, prev) {
    const newList = parseUserlist(chaMy);
    const { added, removed } = diffUserlists(prev, newList);
    return { newList, added, removed };
  }
  async function pollOnce() {
    try {
      const url = pchatBase + "/ulist?AKTION=j&ID=" + chatId + "&SID=" + chatSid + "&x=" + Math.random();
      const resp = await fetch(url);
      const text = await resp.text();
      const chaMy = parseUlistResponse(text);
      if (!chaMy.some((s) => s !== "")) return;
      stale = false;
      const { newList, added, removed } = processUserlist(chaMy, prevList);
      prevList = newList;
      await set("userlist", { users: newList, added, removed });
      stampFreshness("ulistAt");
    } catch (e) {
      cclog("ulist-poll: poll error \u2014 " + e.message, "v3");
    }
  }
  var STALE_RETRY_MS = 2e3;
  function pollAndReschedule(intervalMs) {
    pollOnce().finally(() => {
      if (running) scheduleNext(intervalMs);
    });
  }
  function scheduleNext(intervalMs) {
    const effectiveInterval = stale ? STALE_RETRY_MS : intervalMs;
    timerId = setTimeout(() => pollAndReschedule(intervalMs), effectiveInterval);
  }
  function startUlistPoll(intervalMs = POLL_CADENCES.ulist) {
    chatId = getChatId();
    chatSid = getChatSid();
    pchatBase = getPChat();
    if (running) return;
    running = true;
    const seed = getChaMy();
    if (seed.length > 0) {
      const { newList, added, removed } = processUserlist(seed, prevList);
      prevList = newList;
      void set("userlist", { users: newList, added, removed });
      stampFreshness("ulistAt");
    }
    pollAndReschedule(intervalMs);
    cclog("ulist-poll started \u2014 every ~" + intervalMs + " ms", "v3");
  }
  function stopUlistPoll() {
    if (timerId !== void 0) clearTimeout(timerId);
    timerId = void 0;
    running = false;
  }
  function refreshUlistNow(intervalMs = POLL_CADENCES.ulist) {
    if (timerId !== void 0) clearTimeout(timerId);
    pollAndReschedule(intervalMs);
  }

  // src/global-userlist.ts
  var lastSnapshot = /* @__PURE__ */ new Map();
  var timerId2;
  var running2 = false;
  function diffGlobal(prev, next) {
    const added = [];
    const removed = [];
    for (const [channel, users] of next) {
      const prevKeys = new Set((prev.get(channel) ?? []).map((u) => u.key));
      for (const user of users) {
        if (!prevKeys.has(user.key)) added.push({ user, channel });
      }
    }
    for (const [channel, users] of prev) {
      const nextKeys = new Set((next.get(channel) ?? []).map((u) => u.key));
      for (const user of users) {
        if (!nextKeys.has(user.key)) removed.push({ user, channel });
      }
    }
    return { added, removed };
  }
  async function pollOnce2() {
    try {
      const raw = await fetchAw();
      const next = parseAw(raw);
      if (next.size === 0) return;
      const { added, removed } = diffGlobal(lastSnapshot, next);
      lastSnapshot = next;
      await set("globalUserlist", { channels: next, added, removed });
      stampFreshness("awAt");
    } catch (e) {
      cclog("global-userlist: poll error \u2014 " + e.message, "v3");
    }
  }
  function pollAndReschedule2(intervalMs) {
    return pollOnce2().finally(() => {
      if (running2) scheduleNext2(intervalMs);
    });
  }
  function scheduleNext2(intervalMs) {
    timerId2 = setTimeout(() => pollAndReschedule2(intervalMs), intervalMs);
  }
  function startPolling(intervalMs = POLL_CADENCES.aw) {
    if (running2) return;
    running2 = true;
    pollAndReschedule2(intervalMs);
    cclog("global userlist poll started \u2014 aw.js every ~" + intervalMs + " ms", "v3");
  }
  function stopPolling() {
    if (timerId2 !== void 0) clearTimeout(timerId2);
    timerId2 = void 0;
    running2 = false;
  }
  function refreshAwNow(intervalMs = POLL_CADENCES.aw) {
    if (timerId2 !== void 0) clearTimeout(timerId2);
    timerId2 = void 0;
    return pollAndReschedule2(intervalMs);
  }

  // src/dom.ts
  function iconElement(cls) {
    const i = document.createElement("i");
    i.className = "fas " + cls;
    i.setAttribute("aria-hidden", "true");
    return i;
  }
  function actionButton(opts) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = opts.title;
    btn.setAttribute("aria-label", opts.title);
    if (opts.iconClass) btn.appendChild(iconElement(opts.iconClass));
    if (opts.label) {
      const text = document.createElement("span");
      text.className = "bcc-action-label";
      text.textContent = opts.label;
      btn.appendChild(text);
    }
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      opts.onClick();
    });
    return btn;
  }
  function nickToHue(nick) {
    let sum = 0;
    for (let i = 0; i < nick.length; i++) {
      sum += nick.charCodeAt(i);
    }
    return sum % 360;
  }
  function buildAvatar(nick) {
    const avatar = document.createElement("div");
    avatar.className = "bcc-popup-avatar";
    avatar.textContent = nick[0]?.toUpperCase() ?? "?";
    avatar.style.background = "hsl(" + nickToHue(nick) + ", 45%, 55%)";
    return avatar;
  }

  // src/user-image.ts
  function stripThumbnailSuffix(url) {
    return url.replace(/_(\d+)\.jpg$/i, ".jpg");
  }
  function parseIdSearch(html) {
    if (typeof html !== "string" || html.length < 30) return [];
    const rows = [];
    const valueDivs = html.match(/<div\s+class="value"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi);
    if (!valueDivs) return [];
    const skipIndices = /* @__PURE__ */ new Set();
    for (let i = 0; i < valueDivs.length; i++) {
      if (skipIndices.has(i)) continue;
      const block = valueDivs[i];
      const imgUrl = extractImgSrc(block);
      const nameLink = extractNameLink(block);
      const hasImg = imgUrl !== null;
      const hasNameLink = nameLink !== null;
      if (hasImg && !hasNameLink) {
        let row = null;
        if (i + 1 < valueDivs.length) {
          const nextLink = extractNameLink(valueDivs[i + 1]);
          if (nextLink) {
            row = {
              name: cleanLinkText(nextLink.text),
              href: nextLink.href,
              imgUrl
            };
            skipIndices.add(i + 1);
          }
        }
        if (row) {
          rows.push(row);
        }
      } else if (!hasImg && hasNameLink) {
        rows.push({
          name: cleanLinkText(nameLink.text),
          href: nameLink.href,
          imgUrl: null
        });
      } else if (hasImg && hasNameLink) {
        rows.push({
          name: cleanLinkText(nameLink.text),
          href: nameLink.href,
          imgUrl
        });
      }
    }
    return rows;
  }
  function extractImgSrc(block) {
    const match = block.match(/<img\s[^>]*src="([^"]*userfiles\/[^"]*)"[^>]*\/?>/i);
    return match ? match[1] : null;
  }
  function extractNameLink(block) {
    const linkRe = /<a\s[^>]*href="([^"]*\/id\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkRe.exec(block)) !== null) {
      const text = match[2];
      if (/<img\s/i.test(text)) continue;
      return { href: match[1], text };
    }
    return null;
  }
  function cleanLinkText(raw) {
    return raw.replace(/^\s*»\s*/, "").trim();
  }
  function decodeIdPath(segment) {
    const out = [];
    let byteRun = [];
    let i = 0;
    function flushBytes() {
      if (byteRun.length > 0) {
        out.push(new TextDecoder().decode(new Uint8Array(byteRun)));
        byteRun = [];
      }
    }
    while (i < segment.length) {
      if (segment[i] === ":" && /^:[0-9A-Fa-f]{2}:/.test(segment.slice(i))) {
        byteRun.push(parseInt(segment.slice(i + 1, i + 3), 16));
        i += 4;
      } else {
        flushBytes();
        out.push(segment[i]);
        i++;
      }
    }
    flushBytes();
    return out.join("");
  }
  function findExactRow(rows, nick) {
    const target = nick.toLowerCase();
    for (const row of rows) {
      const idSegment = extractIdSegment(row.href);
      if (idSegment !== null) {
        const decoded = decodeIdPath(idSegment);
        if (decoded.toLowerCase() === target) {
          return row;
        }
      }
    }
    for (const row of rows) {
      if (row.name.toLowerCase() === target) {
        return row;
      }
    }
    return null;
  }
  function extractIdSegment(href) {
    const match = href.match(/\/id\/([^]*?)\.html/i);
    return match ? match[1] : null;
  }
  function deriveImageUrl(thumbUrl) {
    if (thumbUrl === null) {
      return { thumbUrl: null, fullUrl: null, hasPhoto: false };
    }
    const stripped = stripThumbnailSuffix(thumbUrl);
    const isDefault = /default/i.test(stripped);
    const fullUrl = !isDefault && stripped !== thumbUrl ? stripped : null;
    return {
      thumbUrl,
      fullUrl,
      hasPhoto: !isDefault
    };
  }
  var ROW_CACHE = /* @__PURE__ */ new Map();
  var TTL_MS = 5 * 60 * 1e3;
  function evictImageCache(term) {
    ROW_CACHE.delete(term.toLowerCase());
  }
  var AJAX_PARAMS = [
    "TYP=1",
    "_EN_OBJ_ORDER_SORT_SHOW=",
    "ORD=0",
    "SORT=1",
    "START=0",
    "_LIST_WRAPPER_ID=bccid",
    "EXT=allbychar",
    "_KW_allbychar=",
    // index 7 — the nick is appended to this param
    "LOADDEF=3",
    "LOADDEF_EXTRA_USER=",
    "LOADDEF_EXTRA=",
    "_LIST_LINK_ALL=",
    "STYP=",
    "LOADDEF_CUSTOM=allbychar",
    "CACHE=3600",
    "OPENW=1",
    "ISCHAT=1"
  ];
  var KW_PARAM_INDEX = 7;
  var TIMEOUT_MS = 8e3;
  var EMPTY_RESULT = { thumbUrl: null, fullUrl: null, hasPhoto: false };
  function fetchIdRows(term) {
    const key = term.toLowerCase();
    const entry = ROW_CACHE.get(key);
    if (entry) {
      if (Date.now() - entry.fetchedAt <= TTL_MS) {
        return Promise.resolve(entry.rows);
      }
      refreshInBackground(key, term);
      return Promise.resolve(entry.rows);
    }
    return fetchAndStore(key, term);
  }
  function fetchAndStore(key, term) {
    return new Promise((resolve, reject) => {
      try {
        const ajax = getAjax();
        const pajax = getPAjax();
        if (typeof ajax !== "function" || typeof pajax !== "string") {
          cclog("user-image: upstream ajax/PAJAX unavailable \u2014 rejecting", "user-image");
          reject(new Error("user-image: upstream ajax/PAJAX unavailable"));
          return;
        }
        let settled = false;
        const timer2 = setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(new Error("user-image: timeout"));
          }
        }, TIMEOUT_MS);
        const params = AJAX_PARAMS.map(
          (p, i) => i === KW_PARAM_INDEX ? p + encodeURIComponent(term) : p
        ).join("&");
        new ajax(pajax + "obj_list.html", {
          postBody: params,
          onComplete: (transport) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer2);
            try {
              const html = transport?.responseText ?? "";
              const rows = parseIdSearch(html);
              ROW_CACHE.set(key, { rows, fetchedAt: Date.now() });
              resolve(rows);
            } catch (e) {
              cclog("user-image: parse failed \u2014 " + e.message, "user-image");
              reject(new Error("user-image: parse failed"));
            }
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }
  function refreshInBackground(key, term) {
    fetchAndStore(key, term).catch((e) => {
      cclog("user-image: background refresh failed \u2014 " + e.message, "user-image");
    });
  }
  async function getUserPhoto(nick) {
    try {
      const rows = await fetchIdRows(nick);
      const row = findExactRow(rows, nick);
      return deriveImageUrl(row?.imgUrl ?? null);
    } catch (e) {
      if (e.message.includes("unavailable")) {
        return EMPTY_RESULT;
      }
      throw e;
    }
  }

  // src/photo-preview.ts
  var previewByUser = /* @__PURE__ */ new Map();
  var previewSave = {};
  try {
    previewSave = JSON.parse(localStorage.getItem("bcc_previews") || "{}");
  } catch {
    previewSave = {};
  }
  function savePreviews() {
    try {
      localStorage.setItem("bcc_previews", JSON.stringify(previewSave));
    } catch {
    }
  }
  var hoverPreview = null;
  function dismissHover() {
    if (!hoverPreview) return;
    let isPinned = false;
    for (const el of previewByUser.values()) {
      if (el === hoverPreview) {
        isPinned = true;
        break;
      }
    }
    if (!isPinned) {
      hoverPreview.remove();
    }
    hoverPreview = null;
  }
  function dismissPreview(userName) {
    const box = previewByUser.get(userName);
    if (!box) return;
    previewSave[userName] = {
      left: parseFloat(box.style.left) || 0,
      top: parseFloat(box.style.top) || 0,
      boxW: box.offsetWidth,
      boxH: box.offsetHeight
    };
    savePreviews();
    box.remove();
    previewByUser.delete(userName);
  }
  function dismissAllPreviews() {
    dismissHover();
    for (const name of previewByUser.keys()) dismissPreview(name);
  }
  function buildPreviewBox(fullUrl, userName, anchor, searchTerm) {
    const mount = document.querySelector(".bcc-shell") ?? document.body;
    const box = document.createElement("div");
    box.className = "bcc-photo-preview";
    const initialSize = Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.55);
    let boxW = initialSize;
    let boxH = initialSize;
    const img = document.createElement("img");
    img.className = "bcc-photo-preview-img";
    img.src = fullUrl;
    img.alt = "";
    img.decoding = "async";
    box.appendChild(img);
    img.addEventListener("error", () => {
      if (searchTerm) evictImageCache(searchTerm);
    });
    let cx = window.innerWidth / 2;
    let cy = window.innerHeight / 2;
    const saved = previewSave[userName];
    if (saved) {
      cx = saved.left || cx;
      cy = saved.top || cy;
      if (saved.boxW) {
        boxW = saved.boxW;
        boxH = saved.boxH;
      }
    } else if (anchor) {
      const gap = 12;
      const centerTop = anchor.top + anchor.height / 2;
      const fitsLeft = anchor.left - gap - boxW >= 0;
      cx = fitsLeft ? anchor.left - gap - boxW / 2 : Math.min(window.innerWidth - boxW / 2 - gap, anchor.right + gap + boxW / 2);
      cy = Math.max(boxH / 2 + 8, Math.min(window.innerHeight - boxH / 2 - 8, centerTop));
    }
    const updateBox = () => {
      box.style.left = cx + "px";
      box.style.top = cy + "px";
      box.style.width = boxW + "px";
      box.style.height = boxH + "px";
      box.style.transform = "translate(-50%, -50%)";
    };
    updateBox();
    mount.appendChild(box);
    let panning = false;
    let panned = false;
    let panStartX = 0;
    let panStartY = 0;
    let panOrigCX = 0;
    let panOrigCY = 0;
    box.addEventListener(
      "wheel",
      (e) => {
        if (panning) return;
        e.preventDefault();
        const delta = e.deltaY < 0 ? 1.1 : 0.9;
        boxW = Math.round(boxW * delta);
        boxH = Math.round(boxH * delta);
        const max = Math.max(window.innerWidth, window.innerHeight) * 3;
        boxW = Math.max(80, Math.min(max, boxW));
        boxH = Math.max(80, Math.min(max, boxH));
        updateBox();
      },
      { passive: false }
    );
    box.addEventListener("mousedown", (e) => {
      panning = true;
      panned = false;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panOrigCX = cx;
      panOrigCY = cy;
      box.style.cursor = "grabbing";
      e.preventDefault();
    });
    const onMove = (e) => {
      if (!panning) return;
      cx = panOrigCX + (e.clientX - panStartX);
      cy = panOrigCY + (e.clientY - panStartY);
      const margin = 60;
      cx = Math.max(boxW / 2 - margin, Math.min(window.innerWidth - boxW / 2 + margin, cx));
      cy = Math.max(boxH / 2 - margin, Math.min(window.innerHeight - boxH / 2 + margin, cy));
      if (Math.abs(e.clientX - panStartX) > 2 || Math.abs(e.clientY - panStartY) > 2) panned = true;
      updateBox();
    };
    const onUp = () => {
      if (!panning) return;
      panning = false;
      box.style.cursor = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    box.addEventListener("click", (e) => {
      if (panned) {
        e.stopPropagation();
        e.preventDefault();
      }
    });
    box.addEventListener("dblclick", () => {
      cx = window.innerWidth / 2;
      cy = window.innerHeight / 2;
      updateBox();
    });
    hoverPreview = box;
    return box;
  }
  if (typeof document !== "undefined") {
    document.addEventListener("click", (e) => {
      const target = e.target;
      const box = target.closest(".bcc-photo-preview");
      if (!box) return;
      for (const [name, el] of previewByUser) {
        if (el === box) {
          dismissPreview(name);
          return;
        }
      }
    });
  }

  // src/popup.ts
  var openPopup = null;
  var onOutsideClick = null;
  var currentUser = null;
  var unsubscribeStore = null;
  var popupAnchor = null;
  var onResize = null;
  function closePopup() {
    if (!openPopup) return;
    openPopup.remove();
    openPopup = null;
    currentUser = null;
    popupAnchor = null;
    document.removeEventListener("keydown", onKeydown, true);
    window.removeEventListener("bcc-iframe-interaction", onIframeInteraction);
    if (onOutsideClick) {
      document.removeEventListener("click", onOutsideClick);
      onOutsideClick = null;
    }
    if (unsubscribeStore) {
      unsubscribeStore();
      unsubscribeStore = null;
    }
    if (onResize) {
      window.removeEventListener("resize", onResize);
      onResize = null;
    }
  }
  function onKeydown(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      closePopup();
      dismissAllPreviews();
    }
  }
  function onIframeInteraction() {
    if (openPopup) closePopup();
  }
  function copyToClipboard(el, text) {
    const originalText = el.textContent ?? text;
    try {
      navigator.clipboard.writeText(text).then(() => {
        showCopyFeedback(el, originalText);
      }).catch(() => {
      });
    } catch {
    }
  }
  function showCopyFeedback(el, originalText) {
    el.textContent = "\u2713 Kopiert!";
    setTimeout(() => {
      if (el.textContent === "\u2713 Kopiert!") el.textContent = originalText;
    }, 1500);
  }
  function buildPhotoContainer(userName) {
    const container = document.createElement("div");
    container.className = "bcc-popup-photo";
    container.appendChild(buildAvatar(userName));
    const img = document.createElement("img");
    img.alt = "";
    container.appendChild(img);
    return container;
  }
  function loadPhoto(container, userName) {
    const img = container.querySelector("img");
    const avatar = container.querySelector(".bcc-popup-avatar");
    if (!img || !avatar) return;
    getUserPhoto(userName).then((result) => {
      if (!result.hasPhoto || !result.thumbUrl) return;
      if (!openPopup?.contains(container)) return;
      img.src = result.thumbUrl;
      img.dataset.fullUrl = result.fullUrl || result.thumbUrl;
      img.addEventListener(
        "load",
        () => {
          img.classList.add("bcc-photo-loaded");
          avatar.style.display = "none";
        },
        { once: true }
      );
      img.addEventListener(
        "error",
        () => {
          evictImageCache(userName);
        },
        { once: true }
      );
    }).catch(() => {
    });
  }
  function buildPin(isPinned, onToggle) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bcc-popup-pin";
    btn.title = isPinned ? "Angeheftet entfernen" : "Anheften";
    btn.setAttribute("aria-label", btn.title);
    const icon = iconElement("fa-thumbtack");
    if (!isPinned) icon.style.transform = "rotate(45deg)";
    btn.appendChild(icon);
    if (isPinned) btn.classList.add("pinned");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onToggle();
    });
    return btn;
  }
  function updatePinButton(btn, isPinned) {
    const icon = btn.querySelector("i");
    if (icon) {
      icon.style.transform = isPinned ? "" : "rotate(45deg)";
    }
    btn.classList.toggle("pinned", isPinned);
    btn.title = isPinned ? "Angeheftet entfernen" : "Anheften";
    btn.setAttribute("aria-label", btn.title);
  }
  function buildToolbarCell(iconClass, shortcut, title, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bcc-popup-toolbar-cell";
    btn.title = title;
    btn.setAttribute("aria-label", title);
    const icon = document.createElement("i");
    icon.className = "fas " + iconClass + " bcc-toolbar-icon";
    icon.setAttribute("aria-hidden", "true");
    btn.appendChild(icon);
    const label = document.createElement("span");
    label.className = "bcc-toolbar-shortcut";
    label.textContent = shortcut;
    btn.appendChild(label);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }
  function openUserPopup(anchor, user, isPinned, onTogglePin) {
    if (currentUser === user.name) {
      closePopup();
      return;
    }
    closePopup();
    currentUser = user.name;
    const popup = document.createElement("div");
    popup.className = "bcc-user-popup";
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-modal", "false");
    popup.setAttribute("aria-label", "Aktionen f\xFCr " + user.name);
    const pinBtn = buildPin(isPinned, () => onTogglePin(user));
    popup.appendChild(pinBtn);
    unsubscribeStore = on("pinned", (pinned) => {
      if (!openPopup) return;
      updatePinButton(pinBtn, pinned.includes(user.key));
    });
    const photoContainer = buildPhotoContainer(user.name);
    popup.appendChild(photoContainer);
    const nameRow = document.createElement("div");
    nameRow.className = "bcc-popup-name-row";
    const nameSpan = document.createElement("span");
    nameSpan.className = "bcc-popup-username";
    nameSpan.textContent = user.name;
    nameSpan.title = "Klicken zum Kopieren";
    nameSpan.addEventListener("click", (e) => {
      e.stopPropagation();
      copyToClipboard(nameSpan, user.name);
    });
    nameRow.appendChild(nameSpan);
    const idBtn = document.createElement("button");
    idBtn.type = "button";
    idBtn.className = "bcc-popup-id-btn";
    idBtn.title = "ID von " + user.name + " anzeigen";
    idBtn.setAttribute("aria-label", idBtn.title);
    idBtn.appendChild(iconElement("fa-id-card"));
    idBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const url = "//www.chatcity.de/de/id/" + encodeChatLink(user.name) + ".html";
      window.open(url, "IDCARD", "width=810,height=800,scrollbars=yes");
      closePopup();
    });
    nameRow.appendChild(idBtn);
    popup.appendChild(nameRow);
    const toolbar = document.createElement("div");
    toolbar.className = "bcc-popup-toolbar";
    toolbar.appendChild(
      buildToolbarCell("fa-paper-plane", "/w", "Einmal an " + user.name + " fl\xFCstern", () => {
        const api = getBettercc();
        if (typeof api?.prefillWhisper === "function") api.prefillWhisper(user.name);
        closePopup();
      })
    );
    toolbar.appendChild(
      buildToolbarCell("fa-comment-dots", "/sw", "Dauerhaft an " + user.name + " fl\xFCstern", () => {
        const api = getBettercc();
        if (typeof api?.superwhisper === "function") api.superwhisper(user.name, false);
        closePopup();
      })
    );
    toolbar.appendChild(
      buildToolbarCell("fa-ban", "/ig", "Benutzer ignorieren", () => {
        const btn = toolbar.lastElementChild;
        if (!btn) return;
        if (btn.classList.contains("bcc-confirm")) {
          sendCommand("/ignore " + user.name);
          btn.classList.remove("bcc-confirm");
          btn.classList.add("bcc-confirmed");
          const icon = btn.querySelector("i");
          if (icon) {
            icon.className = "fas fa-check-double bcc-toolbar-icon";
          }
          const label = btn.querySelector(".bcc-toolbar-shortcut");
          if (label) label.textContent = "ignoriert";
          setTimeout(() => {
            btn.classList.remove("bcc-confirmed");
            if (icon) {
              icon.className = "fas fa-ban bcc-toolbar-icon";
            }
            if (label) label.textContent = "/ig";
          }, 1200);
        } else if (!btn.classList.contains("bcc-confirmed")) {
          btn.classList.add("bcc-confirm");
          const icon = btn.querySelector("i");
          if (icon) {
            icon.className = "fas fa-check bcc-toolbar-icon";
          }
          const label = btn.querySelector(".bcc-toolbar-shortcut");
          if (label) label.textContent = "sicher?";
          const reset = (e) => {
            if (!btn.contains(e.target)) {
              btn.classList.remove("bcc-confirm");
              if (icon) {
                icon.className = "fas fa-ban bcc-toolbar-icon";
              }
              if (label) label.textContent = "/ig";
              document.removeEventListener("click", reset);
            }
          };
          setTimeout(() => document.addEventListener("click", reset), 0);
        }
      })
    );
    popup.appendChild(toolbar);
    const mount = document.querySelector(".bcc-shell") ?? document.body;
    mount.appendChild(popup);
    popupAnchor = anchor;
    const photoEl = popup.querySelector(".bcc-popup-photo");
    const reposition = () => {
      if (!popupAnchor) return;
      const rect = popupAnchor.getBoundingClientRect();
      const popupH = popup.offsetHeight || 200;
      const popupW = popup.offsetWidth || 200;
      const gap = 4;
      const photoCenterOffset = photoEl ? photoEl.offsetTop + photoEl.offsetHeight / 2 : 40;
      const sidebar = document.querySelector(".bcc-sidebar");
      const edgeLeft = sidebar ? sidebar.getBoundingClientRect().left : rect.left;
      popup.style.left = Math.max(8, edgeLeft - popupW - gap) + "px";
      const chatbar = document.querySelector(".bcc-chatbar");
      const maxBottom = chatbar ? chatbar.getBoundingClientRect().top - gap : window.innerHeight - 8;
      const idealTop = rect.top + rect.height / 2 - photoCenterOffset;
      popup.style.top = Math.max(8, Math.min(maxBottom - popupH, idealTop)) + "px";
    };
    reposition();
    onResize = reposition;
    window.addEventListener("resize", onResize);
    photoContainer.addEventListener("mouseenter", () => {
      if (!get("hover_preview")) return;
      if (previewByUser.has(user.name)) return;
      const img = photoContainer.querySelector("img");
      if (img?.classList.contains("bcc-photo-loaded") && img.dataset.fullUrl) {
        dismissHover();
        buildPreviewBox(img.dataset.fullUrl, user.name, void 0, user.name);
      }
    });
    photoContainer.addEventListener("mouseleave", () => {
      dismissHover();
    });
    photoContainer.addEventListener("click", (e) => {
      e.stopPropagation();
      if (previewByUser.has(user.name)) {
        dismissPreview(user.name);
        return;
      }
      const img = photoContainer.querySelector("img");
      if (img?.classList.contains("bcc-photo-loaded") && img.dataset.fullUrl) {
        dismissHover();
        const box = buildPreviewBox(img.dataset.fullUrl, user.name, void 0, user.name);
        previewByUser.set(user.name, box);
      }
    });
    loadPhoto(photoContainer, user.name);
    openPopup = popup;
    window.addEventListener("bcc-iframe-interaction", onIframeInteraction);
    document.addEventListener("keydown", onKeydown, true);
    onOutsideClick = (e) => {
      if (openPopup && !openPopup.contains(e.target)) closePopup();
    };
    document.addEventListener("click", onOutsideClick);
  }

  // src/session.ts
  var timer = null;
  function readSnapshot() {
    const guest = isGuest();
    return {
      nick: getChatNick(),
      registered: !guest,
      guest,
      userId: getChatId(),
      sessionId: getChatSid(),
      channel: getChannel(),
      authDead: isAuthDead()
    };
  }
  function initSession() {
    if (timer) clearInterval(timer);
    const snapshot2 = readSnapshot();
    set("session", snapshot2);
    let prevChannel = snapshot2.channel;
    let prevAuthDead = snapshot2.authDead;
    timer = setInterval(() => {
      const next = readSnapshot();
      if (next.channel !== prevChannel || next.authDead !== prevAuthDead) {
        prevChannel = next.channel;
        prevAuthDead = next.authDead;
        set("session", next);
      }
    }, 2e3);
    cclog("session: init done \u2014 nick=" + snapshot2.nick + " channel=" + snapshot2.channel, "v3");
  }
  function getSession() {
    return get("session");
  }

  // src/channel-select.ts
  function parseChannels(ccc, ccg) {
    if (!Array.isArray(ccg) || !Array.isArray(ccc)) return [];
    const groups = [];
    const byId = /* @__PURE__ */ new Map();
    for (let i = 0; i + 1 < ccg.length; i += 2) {
      const id = Number(ccg[i]);
      const label = String(ccg[i + 1] ?? "");
      if (!Number.isFinite(id)) continue;
      byId.set(id, groups.length);
      groups.push({ id, label, channels: [] });
    }
    for (let i = 0; i + 3 < ccc.length; i += 4) {
      const name = ccc[i];
      const groupId = Number(ccc[i + 2]);
      if (typeof name !== "string" || name.length === 0) continue;
      const idx = byId.get(groupId);
      if (idx === void 0) continue;
      groups[idx].channels.push(name);
    }
    return groups;
  }
  function buildChannelSelect() {
    const ccc = getChannelCategories();
    const ccg = getChannelGroups();
    const groups = parseChannels(ccc, ccg);
    const active = getSession().channel;
    if (groups.length === 0) {
      cclog("buildChannelSelect: ccc/ccg absent \u2014 falling back to static label", "v3");
      const span = document.createElement("span");
      span.className = "bcc-channel";
      span.textContent = active || "Chatcity";
      span.title = "Channel";
      return span;
    }
    const select = document.createElement("select");
    select.name = "bcc-channel";
    select.className = "bcc-channel-select";
    select.title = "Channel wechseln";
    select.setAttribute("aria-label", "Channel wechseln");
    for (const group of groups) {
      const optgroup = document.createElement("optgroup");
      optgroup.label = group.label;
      for (const name of group.channels) {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        if (name.toLowerCase() === active.toLowerCase()) option.selected = true;
        optgroup.appendChild(option);
      }
      select.appendChild(optgroup);
    }
    select.addEventListener("change", () => {
      sendCommand("/j " + select.value);
    });
    react("session", (s) => {
      if (s.channel) {
        const lower = s.channel.toLowerCase();
        for (const opt of Array.from(select.options)) {
          if (opt.value.toLowerCase() === lower) {
            if (!opt.selected) opt.selected = true;
            return;
          }
        }
      }
    });
    return select;
  }

  // src/sidebar.ts
  function getStatusClasses(user) {
    const classes = ["bcc-userrow"];
    if (user.sep) classes.push("bcc-sep");
    return classes.join(" ");
  }
  function mergeUserlists(current, globalChannels, pinned) {
    const merged = current.map((u) => ({ user: u, channel: null }));
    const present = new Set(current.map((u) => u.key));
    for (const [channel, users] of globalChannels) {
      for (const user of users) {
        if (pinned.has(user.key) && !present.has(user.key)) {
          merged.push({ user, channel });
          present.add(user.key);
        }
      }
    }
    return merged;
  }
  function abbrevChannels(channels) {
    const used = /* @__PURE__ */ new Map();
    const badges = /* @__PURE__ */ new Map();
    for (const channel of [...new Set(channels)].sort()) {
      const base = channelAbbrev(channel, 0);
      const index = used.get(base) ?? 0;
      used.set(base, index + 1);
      badges.set(channel, channelAbbrev(channel, index));
    }
    return badges;
  }
  function applyUserState(row, merged, badges) {
    const user = merged.user;
    row.className = getStatusClasses(user);
    row.classList.toggle("bcc-name-away", user.away || user.sep);
    const nameSpan = row.querySelector(".bcc-userrow-name");
    if (nameSpan) {
      nameSpan.textContent = user.name;
    }
    const oldBadge = row.querySelector(".bcc-user-tag[data-bcc-badge]");
    if (merged.channel) {
      const text = badges.get(merged.channel) ?? channelAbbrev(merged.channel, 0);
      if (oldBadge) {
        if (oldBadge.textContent !== text) oldBadge.textContent = text;
      } else {
        const badge = document.createElement("span");
        badge.className = "bcc-user-tag";
        badge.dataset.bccBadge = "1";
        badge.textContent = text;
        row.insertBefore(badge, nameSpan ? nameSpan.nextSibling : row.firstChild);
      }
    } else if (oldBadge) {
      oldBadge.remove();
    }
    row.querySelectorAll(".bcc-user-tag:not([data-bcc-badge])").forEach((t) => t.remove());
    if (user.away) {
      const tag = document.createElement("span");
      tag.className = "bcc-user-tag";
      tag.textContent = "[A]";
      row.appendChild(tag);
    }
    if (user.sep) {
      const tag = document.createElement("span");
      tag.className = "bcc-user-tag";
      tag.textContent = "[S]";
      row.appendChild(tag);
    }
  }
  function buildRow(merged, badges) {
    const user = merged.user;
    const li = document.createElement("li");
    li.dataset.name = user.name;
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.setAttribute("aria-label", "Aktionen f\xFCr " + user.name);
    const nameSpan = document.createElement("span");
    nameSpan.className = "bcc-userrow-name";
    li.appendChild(nameSpan);
    applyUserState(li, merged, badges);
    const open = (e) => {
      e?.stopPropagation();
      handleRowClick(user, li);
    };
    li.addEventListener("click", open);
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        handleRowClick(user, li);
      }
    });
    return li;
  }
  var pinnedCache = /* @__PURE__ */ new Set();
  async function togglePin(user) {
    const list = [...get("pinned")];
    const idx = list.indexOf(user.key);
    if (idx === -1) {
      list.push(user.key);
    } else {
      list.splice(idx, 1);
    }
    await set("pinned", list);
  }
  function handleRowClick(user, anchor) {
    openUserPopup(anchor, user, pinnedCache.has(user.key), (u) => {
      togglePin(u).catch(() => {
        cclog("pin toggle failed for " + u.name, "v3");
      });
    });
  }
  var lastChannelUsers = null;
  var lastGlobalChannels = null;
  var globalTotal = 0;
  var NO_GLOBAL = /* @__PURE__ */ new Map();
  var rowMap = /* @__PURE__ */ new Map();
  var pinnedUl = null;
  var regularUl = null;
  var scrollContainer = null;
  var onlineCount = null;
  function ensureContainers(sidebar) {
    if (pinnedUl && pinnedUl.isConnected) return;
    sidebar.innerHTML = "";
    const toggle = document.createElement("button");
    toggle.className = "bcc-sidebar-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-label", "Userlist ein-/ausklappen");
    toggle.title = "Userlist ein-/ausklappen";
    toggle.appendChild(iconElement("fa-chevron-right"));
    toggle.appendChild(iconElement("fa-chevron-left"));
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      sidebar.classList.toggle("bcc-collapsed");
      const collapsed2 = sidebar.classList.contains("bcc-collapsed");
      toggle.setAttribute("aria-expanded", String(!collapsed2));
      window.dispatchEvent(new Event("resize"));
    });
    sidebar.appendChild(toggle);
    const onlineRow = document.createElement("div");
    onlineRow.className = "bcc-online-row";
    onlineCount = document.createElement("div");
    onlineCount.className = "bcc-online-count";
    onlineCount.setAttribute("role", "status");
    onlineCount.setAttribute("aria-live", "polite");
    onlineCount.innerHTML = '<span class="bcc-online-num">0</span> online';
    onlineRow.appendChild(onlineCount);
    const channelWrap = document.createElement("label");
    channelWrap.className = "bcc-channel-select-wrap";
    const channelSelect = buildChannelSelect();
    channelSelect.className = (channelSelect.className || "") + " bcc-channel-select-native";
    const channelFace = document.createElement("span");
    channelFace.className = "bcc-channel-select-face";
    channelFace.textContent = channelSelect.value || channelSelect.options[0]?.textContent || "";
    channelSelect.addEventListener("change", () => {
      channelFace.textContent = channelSelect.value || "";
    });
    react("session", (s) => {
      if (s.channel && channelFace.isConnected) {
        channelFace.textContent = s.channel;
      }
    });
    channelWrap.appendChild(channelFace);
    channelWrap.appendChild(channelSelect);
    onlineRow.appendChild(channelWrap);
    sidebar.appendChild(onlineRow);
    const content = document.createElement("div");
    content.className = "bcc-sidebar-content";
    pinnedUl = document.createElement("ul");
    pinnedUl.className = "bcc-userlist-pinned";
    pinnedUl.setAttribute("role", "list");
    regularUl = document.createElement("ul");
    regularUl.className = "bcc-userlist-regular";
    regularUl.setAttribute("role", "list");
    scrollContainer = document.createElement("div");
    scrollContainer.className = "bcc-userlist-scroll";
    scrollContainer.appendChild(regularUl);
    content.append(pinnedUl, scrollContainer);
    sidebar.appendChild(content);
    if (window.innerWidth < 600) sidebar.classList.add("bcc-collapsed");
    const collapsed = sidebar.classList.contains("bcc-collapsed");
    toggle.setAttribute("aria-expanded", String(!collapsed));
  }
  function refreshSectionVisibility() {
    const hasPinned = pinnedUl ? pinnedUl.children.length > 0 : false;
    if (pinnedUl) pinnedUl.style.display = hasPinned ? "" : "none";
  }
  function renderSidebar(merged) {
    const sidebar = document.querySelector(".bcc-sidebar");
    if (!sidebar || !pinnedUl || !regularUl) return;
    const liveNames = new Set(merged.map((m) => m.user.name));
    for (const [name, row] of rowMap) {
      if (!liveNames.has(name)) {
        row.remove();
        rowMap.delete(name);
      }
    }
    const scrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
    const byKey = new Map(merged.map((m) => [m.user.key, m]));
    const sorted = sortUsers(
      merged.map((m) => m.user),
      pinnedCache
    ).map((u) => byKey.get(u.key));
    const badges = abbrevChannels(
      sorted.filter((m) => m.channel !== null).map((m) => m.channel)
    );
    for (const m of sorted) {
      const isPinned = pinnedCache.has(m.user.key);
      const target = isPinned ? pinnedUl : regularUl;
      let row = rowMap.get(m.user.name);
      if (row) {
        applyUserState(row, m, badges);
      } else {
        row = buildRow(m, badges);
        rowMap.set(m.user.name, row);
      }
      target.appendChild(row);
    }
    if (scrollContainer)
      scrollContainer.scrollTop = Math.min(scrollTop, scrollContainer.scrollHeight);
    refreshSectionVisibility();
    updateOnlineCount();
  }
  function updateOnlineCount() {
    if (!onlineCount) return;
    const n = lastChannelUsers ? lastChannelUsers.length : 0;
    onlineCount.innerHTML = globalTotal > 0 ? '<span class="bcc-online-num">' + n + "/" + globalTotal + "</span> online" : '<span class="bcc-online-num">' + n + "</span> online";
  }
  function renderFromState() {
    const merged = mergeUserlists(
      lastChannelUsers ?? [],
      lastGlobalChannels ?? NO_GLOBAL,
      pinnedCache
    );
    renderSidebar(merged);
  }
  function mountSidebar() {
    const sidebar = document.querySelector(".bcc-sidebar");
    if (!sidebar) return;
    ensureContainers(sidebar);
    react("pinned", (list) => {
      pinnedCache = new Set(list);
      renderFromState();
    });
    react("userlist", (u) => {
      lastChannelUsers = u.users;
      renderFromState();
    });
    react("globalUserlist", (g) => {
      lastGlobalChannels = g.channels;
      let total = 0;
      for (const users of g.channels.values()) total += users.length;
      globalTotal = total;
      renderFromState();
    });
    cclog("sidebar mounted \u2014 reacts to userlist + globalUserlist store keys", "v3");
  }

  // src/stats.ts
  function parseStats(html) {
    if (typeof html !== "string" || html.length === 0) return null;
    const read = (cls) => {
      const anchorRe = new RegExp('class="[^"]*\\b' + cls + '\\b[^"]*"[^]*?</a>', "i");
      const anchorMatch = html.match(anchorRe);
      if (!anchorMatch) return null;
      const block = anchorMatch[0];
      const valueRe = /<span\s+class="value(?:\s+[^"]*)?"\s*>\s*(\d+)\s*<\/span>/i;
      const valueMatch = block.match(valueRe);
      const n = valueMatch ? Number(valueMatch[1]) : 0;
      return Number.isFinite(n) ? n : 0;
    };
    const friendsOnline = read("uonl");
    const requests = read("ufri");
    const messages = read("unc");
    if (friendsOnline === null && requests === null && messages === null) return null;
    return {
      friendsOnline: friendsOnline ?? 0,
      requests: requests ?? 0,
      messages: messages ?? 0
    };
  }
  var BADGES = [
    {
      statKey: "friendsOnline",
      iconClass: "fa-users",
      title: "Freunde Online",
      // ID card: PPATH + 'id/' + Encode_Link(name) + '.html' (chat_pop_kylr.js:193)
      url: (encNick) => "//www.chatcity.de/de/id/" + encNick + ".html"
    },
    {
      statKey: "requests",
      iconClass: "fa-user-plus",
      title: "Neue Freundesanfragen",
      // Upstream: /de/friends/<id-card-url> (e.g. /de/friends/https://.../id/username01:5F:.html)
      url: (encNick) => "//www.chatcity.de/de/friends/https://www.chatcity.de/de/id/" + encNick + ".html"
    },
    {
      statKey: "messages",
      iconClass: "fa-envelope",
      title: "Neue Nachrichten",
      url: () => "//www.chatcity.de/de/nc/index.html"
    }
  ];
  var statsBar = null;
  var pollTimer = null;
  function buildStatsBar(nick) {
    const bar = document.createElement("div");
    bar.className = "bcc-stats";
    const encNick = encodeChatLink(nick);
    for (const spec of BADGES) {
      const link = document.createElement("a");
      link.className = "bcc-stat bcc-stat-" + spec.statKey;
      link.href = "#";
      link.title = spec.title;
      link.setAttribute("role", "button");
      link.setAttribute("aria-label", spec.title);
      link.addEventListener("click", (e) => {
        e.preventDefault();
        window.open(spec.url(encNick), "IDCARD", "width=810,height=800,scrollbars=yes");
      });
      const icon = document.createElement("i");
      icon.className = "fas " + spec.iconClass;
      icon.setAttribute("aria-hidden", "true");
      link.appendChild(icon);
      const count = document.createElement("span");
      count.className = "bcc-stat-count bcc-stat-no";
      count.textContent = "0";
      link.appendChild(count);
      bar.appendChild(link);
    }
    statsBar = bar;
    return bar;
  }
  function renderStats(stats) {
    if (!statsBar || stats === null) return;
    for (const spec of BADGES) {
      const link = statsBar.querySelector(".bcc-stat-" + spec.statKey);
      if (!link) continue;
      const count = link.querySelector(".bcc-stat-count");
      if (!count) continue;
      const value = stats[spec.statKey];
      count.textContent = String(value);
      count.classList.toggle("bcc-stat-no", value < 1);
    }
  }
  function pollOnce3() {
    try {
      const ajax = getAjax();
      const pajax = getPAjax();
      if (typeof ajax !== "function" || typeof pajax !== "string") {
        cclog("stats: upstream ajax/PAJAX unavailable \u2014 skipping poll", "v3");
        return;
      }
      new ajax(pajax + "chat_info_friends_nc.html", {
        onComplete: (transport) => {
          try {
            const parsed = parseStats(transport?.responseText ?? "");
            if (parsed !== null) {
              renderStats(parsed);
              stampFreshness("statsAt");
            }
          } catch (e) {
            cclog("stats: parse failed \u2014 " + e.message, "v3");
          }
        }
      });
    } catch (e) {
      cclog("stats: poll error \u2014 " + e.message, "v3");
    }
  }
  function mountStatsBar(parent) {
    if (statsBar && statsBar.isConnected) return;
    const nick = getChatNick();
    parent.insertBefore(buildStatsBar(nick), parent.firstChild);
    pollOnce3();
    pollTimer = window.setInterval(pollOnce3, POLL_CADENCES.stats);
    window.addEventListener("beforeunload", () => {
      if (pollTimer !== null) window.clearInterval(pollTimer);
    });
  }

  // src/id-popup.ts
  function dedupRows(rows) {
    const seen = /* @__PURE__ */ new Set();
    return rows.filter((row) => {
      if (seen.has(row.href)) return false;
      seen.add(row.href);
      return true;
    });
  }
  function formatIdCardUrl(name) {
    return "//www.chatcity.de/de/id/" + encodeChatLink(name) + ".html";
  }
  var overlayEl = null;
  var documentKeydown = null;
  function renderState(el, state2) {
    el.innerHTML = "";
    const div = document.createElement("div");
    div.className = "bcc-id-" + state2;
    if (state2 === "loading") div.textContent = "Wird geladen...";
    else if (state2 === "error") div.textContent = "Fehler beim Laden.";
    else if (state2 === "empty") div.textContent = "Kein Ergebnis gefunden.";
    el.appendChild(div);
  }
  function renderResults(el, rows, searchTerm) {
    el.innerHTML = "";
    for (const row of rows) {
      const rowEl = document.createElement("div");
      rowEl.className = "bcc-id-row";
      const { thumbUrl, fullUrl, hasPhoto } = deriveImageUrl(row.imgUrl);
      if (hasPhoto && thumbUrl) {
        const thumb = document.createElement("img");
        thumb.src = thumbUrl;
        thumb.className = "bcc-id-thumb";
        thumb.setAttribute("alt", "");
        if (fullUrl) {
          thumb.addEventListener("mouseenter", () => {
            if (!get("hover_preview")) return;
            const rect = thumb.getBoundingClientRect();
            buildPreviewBox(fullUrl, row.name, rect, searchTerm);
          });
          thumb.addEventListener("mouseleave", () => {
            dismissHover();
          });
        }
        thumb.addEventListener("error", () => {
          thumb.style.display = "none";
          evictImageCache(searchTerm);
        });
        rowEl.appendChild(thumb);
      } else {
        const avatar = buildAvatar(row.name);
        avatar.classList.add("bcc-id-avatar");
        rowEl.appendChild(avatar);
      }
      const nameLink = document.createElement("a");
      nameLink.textContent = row.name;
      nameLink.href = formatIdCardUrl(row.name);
      nameLink.target = "_blank";
      nameLink.className = "bcc-id-name";
      nameLink.title = "ID-Card \xF6ffnen";
      rowEl.appendChild(nameLink);
      el.appendChild(rowEl);
    }
  }
  async function doSearch(name, resultsEl) {
    if (!name) return;
    renderState(resultsEl, "loading");
    try {
      const rows = await fetchIdRows(name);
      const deduped = dedupRows(rows);
      if (deduped.length === 0) {
        renderState(resultsEl, "empty");
      } else {
        renderResults(resultsEl, deduped, name);
      }
    } catch {
      renderState(resultsEl, "error");
    }
  }
  function isIdPopupOpen() {
    return overlayEl !== null;
  }
  function closeIdPopup() {
    if (documentKeydown) {
      document.removeEventListener("keydown", documentKeydown);
      documentKeydown = null;
    }
    dismissAllPreviews();
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
  }
  function buildIdPopup(initialName) {
    closeIdPopup();
    const shell = document.querySelector(".bcc-shell");
    if (!shell) return;
    overlayEl = document.createElement("div");
    overlayEl.className = "bcc-id-overlay";
    const card = document.createElement("div");
    card.className = "bcc-id-card";
    const header = document.createElement("div");
    header.className = "bcc-id-header";
    const title = document.createElement("span");
    title.textContent = "ID Suche";
    header.appendChild(title);
    const closeBtn = document.createElement("button");
    closeBtn.className = "bcc-id-close";
    closeBtn.setAttribute("aria-label", "Schlie\xDFen");
    closeBtn.appendChild(iconElement("fa-xmark"));
    closeBtn.addEventListener("click", closeIdPopup);
    header.appendChild(closeBtn);
    card.appendChild(header);
    const searchArea = document.createElement("div");
    searchArea.className = "bcc-id-search";
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Username...";
    searchInput.value = initialName;
    const searchBtn = document.createElement("button");
    searchBtn.type = "button";
    searchBtn.className = "bcc-icon-btn";
    searchBtn.setAttribute("aria-label", "Suchen");
    searchBtn.title = "Suchen";
    searchBtn.appendChild(iconElement("fa-magnifying-glass"));
    searchArea.appendChild(searchInput);
    searchArea.appendChild(searchBtn);
    card.appendChild(searchArea);
    const resultsEl = document.createElement("div");
    resultsEl.className = "bcc-id-results";
    card.appendChild(resultsEl);
    overlayEl.appendChild(card);
    shell.appendChild(overlayEl);
    documentKeydown = (e) => {
      if (e.key === "Escape") closeIdPopup();
    };
    document.addEventListener("keydown", documentKeydown);
    overlayEl.addEventListener("click", (e) => {
      if (e.target === overlayEl) closeIdPopup();
    });
    const trigger = () => doSearch(searchInput.value.trim(), resultsEl);
    searchBtn.addEventListener("click", trigger);
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") trigger();
    });
    if (initialName) {
      doSearch(initialName, resultsEl);
    } else {
      searchInput.focus();
    }
  }

  // src/settings-helpers.ts
  function defaultDraft() {
    return {
      color: "6AAED8",
      schemeV2: false,
      pinned: [],
      whisper: "",
      sendOnEnter: true,
      hoverPreview: true
    };
  }
  function schemeForPreview(base, useV2) {
    return useV2 ? generateScheme2(base) : generateScheme(base);
  }
  function validateColor(hex) {
    return /^[0-9A-Fa-f]{6}$/.test(hex.replace(/^#/, "")) ? null : "Kein g\xFCltiger Hex-Wert";
  }
  function isDirty(loaded2, draft2) {
    return loaded2.color !== draft2.color || loaded2.schemeV2 !== draft2.schemeV2 || loaded2.whisper !== draft2.whisper || loaded2.sendOnEnter !== draft2.sendOnEnter || loaded2.hoverPreview !== draft2.hoverPreview || !pinnedEqual(loaded2.pinned, draft2.pinned);
  }
  function dedupPinned(names) {
    const seen = /* @__PURE__ */ new Set();
    const result = [];
    for (const name of names) {
      const lower = name.toLowerCase();
      if (name === "" || seen.has(lower)) continue;
      seen.add(lower);
      result.push(name);
    }
    return result;
  }
  function addPinned(list, name) {
    const trimmed = name.trim();
    if (!trimmed) return list;
    return dedupPinned([...list, trimmed.toLowerCase()]);
  }
  function removePinned(list, name) {
    const lower = name.toLowerCase();
    return list.filter((n) => n.toLowerCase() !== lower);
  }
  function pinnedEqual(a, b) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  function draftFromConfig(raw) {
    return {
      color: typeof raw.color === "string" ? raw.color.replace(/^#/, "") : defaultDraft().color,
      schemeV2: typeof raw.scheme_v2 === "boolean" ? raw.scheme_v2 : defaultDraft().schemeV2,
      pinned: Array.isArray(raw.pinned) && raw.pinned.every((v) => typeof v === "string") ? [...raw.pinned] : [],
      whisper: typeof raw.whisper === "string" ? raw.whisper : defaultDraft().whisper,
      sendOnEnter: typeof raw.send_on_enter === "boolean" ? raw.send_on_enter : defaultDraft().sendOnEnter,
      hoverPreview: typeof raw.hover_preview === "boolean" ? raw.hover_preview : defaultDraft().hoverPreview
    };
  }
  var DRAFT_TO_CONFIG = {
    color: "color",
    schemeV2: "scheme_v2",
    pinned: "pinned",
    whisper: "whisper",
    sendOnEnter: "send_on_enter",
    hoverPreview: "hover_preview"
  };
  var CONFIG_TO_DRAFT = Object.fromEntries(
    Object.entries(DRAFT_TO_CONFIG).map(([d, c]) => [c, d])
  );
  function serializeExport(draft2, user) {
    const settings = {};
    for (const [draftKey, configKey] of Object.entries(DRAFT_TO_CONFIG)) {
      settings[configKey] = draft2[draftKey];
    }
    return {
      _format: "bettercc-settings",
      version: 1,
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      user,
      settings
    };
  }
  function exportFileName(user, dateStr) {
    return "bettercc-backup-" + (user || "gast") + "-" + dateStr + ".json";
  }
  function parseImport(json) {
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      return { ok: false, error: "Ung\xFCltiges JSON" };
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { ok: false, error: "Kein g\xFCltiges Objekt" };
    }
    const obj = parsed;
    if (obj._format !== "bettercc-settings") {
      return { ok: false, error: 'Falsches Format: erwartet "bettercc-settings"' };
    }
    if (obj.version !== 1) {
      return { ok: false, error: "Nicht unterst\xFCtzte Version (erwartet 1)" };
    }
    const defaults = defaultDraft();
    const rawSettings = obj.settings;
    if (typeof rawSettings !== "object" || rawSettings === null || Array.isArray(rawSettings)) {
      return { ok: false, error: 'Fehlendes oder ung\xFCltiges "settings"-Objekt' };
    }
    const settings = rawSettings;
    const draft2 = { ...defaults };
    for (const [configKey, draftKey] of Object.entries(CONFIG_TO_DRAFT)) {
      if (!(configKey in settings)) continue;
      const value = settings[configKey];
      if (coerceField(draftKey, value, draft2)) continue;
    }
    return { ok: true, draft: draft2 };
  }
  function coerceField(key, value, draft2) {
    switch (key) {
      case "color":
        if (typeof value === "string" && validateColor(value) === null) {
          draft2.color = value.replace(/^#/, "");
          return true;
        }
        return false;
      case "schemeV2":
        if (typeof value === "boolean") {
          draft2.schemeV2 = value;
          return true;
        }
        return false;
      case "pinned":
        if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
          draft2.pinned = value;
          return true;
        }
        return false;
      case "whisper":
        if (typeof value === "string") {
          draft2.whisper = value;
          return true;
        }
        return false;
      case "sendOnEnter":
        if (typeof value === "boolean") {
          draft2.sendOnEnter = value;
          return true;
        }
        return false;
      case "hoverPreview":
        if (typeof value === "boolean") {
          draft2.hoverPreview = value;
          return true;
        }
        return false;
    }
  }

  // src/settings.ts
  var COLOR_PRESETS = [
    "6AAED8",
    "2E86AB",
    "06A77D",
    "C9A227",
    "D7263D",
    "A23BB6",
    "3B3B58",
    "E7E2D3"
  ];
  function applyColor(hex) {
    if (!draft) return;
    draft.color = hex;
    void setColor(hex);
  }
  function applyScheme2(v2) {
    if (!draft) return;
    draft.schemeV2 = v2;
    void setSchemeVersion(v2);
  }
  async function applyDiff(current, next) {
    if (current.color !== next.color) await setColor(next.color);
    if (current.schemeV2 !== next.schemeV2) await setSchemeVersion(next.schemeV2);
    if (current.sendOnEnter !== next.sendOnEnter) await set("send_on_enter", next.sendOnEnter);
    if (current.hoverPreview !== next.hoverPreview)
      await set("hover_preview", next.hoverPreview);
    if (!pinnedEqual(current.pinned, next.pinned)) await set("pinned", next.pinned);
    if (current.whisper !== next.whisper) await set("whisper", next.whisper);
  }
  var TABS = ["Erscheinungsbild", "Chat", "Verwaltung", "Daten", "Info", "Befehle"];
  var overlayEl2 = null;
  var documentKeydown2 = null;
  var openerEl = null;
  var loaded = null;
  var draft = null;
  var activeTab = 0;
  var tabButtons = [];
  var tabPanels = [];
  var revertBtn = null;
  var previewChips = null;
  var swatchButtons = [];
  function isSettingsOpen() {
    return overlayEl2 !== null;
  }
  function closeSettings() {
    if (documentKeydown2) {
      document.removeEventListener("keydown", documentKeydown2);
      documentKeydown2 = null;
    }
    if (overlayEl2) {
      overlayEl2.remove();
      overlayEl2 = null;
    }
    if (openerEl && "focus" in openerEl) {
      openerEl.focus();
    }
    openerEl = null;
    loaded = null;
    draft = null;
    activeTab = 0;
    tabButtons.length = 0;
    tabPanels.length = 0;
    revertBtn = null;
    previewChips = null;
    swatchButtons.length = 0;
  }
  async function openSettings() {
    closeSettings();
    const shell = document.querySelector(".bcc-shell");
    if (!shell) return;
    openerEl = document.activeElement;
    const raw = {
      color: get("color"),
      scheme_v2: get("scheme_v2"),
      pinned: get("pinned"),
      whisper: get("whisper"),
      send_on_enter: get("send_on_enter"),
      hover_preview: get("hover_preview")
    };
    loaded = draftFromConfig(raw);
    draft = draftFromConfig(raw);
    overlayEl2 = document.createElement("div");
    overlayEl2.className = "bcc-settings-overlay";
    const card = document.createElement("div");
    card.className = "bcc-settings-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-labelledby", "bcc-settings-title");
    const header = document.createElement("div");
    header.className = "bcc-settings-header";
    const title = document.createElement("span");
    title.id = "bcc-settings-title";
    title.textContent = "Einstellungen";
    header.appendChild(title);
    const closeBtn = document.createElement("button");
    closeBtn.className = "bcc-settings-close";
    closeBtn.setAttribute("aria-label", "Schlie\xDFen");
    closeBtn.appendChild(iconElement("fa-xmark"));
    closeBtn.addEventListener("click", closeSettings);
    header.appendChild(closeBtn);
    card.appendChild(header);
    const tabList = document.createElement("div");
    tabList.className = "bcc-settings-tabs";
    tabList.setAttribute("role", "tablist");
    const panelsContainer = document.createElement("div");
    panelsContainer.className = "bcc-settings-panels";
    for (let i = 0; i < TABS.length; i++) {
      const tab = document.createElement("button");
      tab.className = "bcc-settings-tab";
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", i === 0 ? "true" : "false");
      tab.setAttribute("aria-controls", "bcc-settings-panel-" + i);
      tab.id = "bcc-settings-tab-" + i;
      tab.textContent = TABS[i];
      tab.addEventListener("click", () => selectTab(i));
      tabButtons.push(tab);
      tabList.appendChild(tab);
      const panel = document.createElement("div");
      panel.className = "bcc-settings-panel";
      panel.id = "bcc-settings-panel-" + i;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", "bcc-settings-tab-" + i);
      panel.setAttribute("aria-hidden", i === 0 ? "false" : "true");
      tabPanels.push(panel);
      panelsContainer.appendChild(panel);
    }
    if (tabPanels.length > 0) {
      buildAppearancePanel(tabPanels[0]);
    }
    if (tabPanels.length > 1) {
      buildChatPanel(tabPanels[1]);
    }
    if (tabPanels.length > 2) {
      buildManagementPanel(tabPanels[2]);
    }
    if (tabPanels.length > 3) {
      buildDatenPanel(tabPanels[3]);
    }
    if (tabPanels.length > 4) {
      buildInfoPanel(tabPanels[4]);
    }
    if (tabPanels.length > 5) {
      buildBefehlePanel(tabPanels[5]);
    }
    card.appendChild(tabList);
    card.appendChild(panelsContainer);
    const bar = document.createElement("div");
    bar.className = "bcc-settings-bar";
    const doneBtn = document.createElement("button");
    doneBtn.className = "bcc-settings-btn";
    doneBtn.textContent = "Fertig";
    doneBtn.addEventListener("click", closeSettings);
    bar.appendChild(doneBtn);
    revertBtn = document.createElement("button");
    revertBtn.className = "bcc-settings-btn";
    revertBtn.textContent = "R\xFCckg\xE4ngig";
    revertBtn.title = "Auf den Stand beim \xD6ffnen zur\xFCcksetzen";
    revertBtn.disabled = true;
    revertBtn.addEventListener("click", handleRevert);
    bar.appendChild(revertBtn);
    card.appendChild(bar);
    overlayEl2.appendChild(card);
    shell.appendChild(overlayEl2);
    documentKeydown2 = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeSettings();
        return;
      }
      handleTabArrow(e);
      handleFocusTrap(e);
    };
    document.addEventListener("keydown", documentKeydown2);
    overlayEl2.addEventListener("click", (e) => {
      if (e.target === overlayEl2) closeSettings();
    });
    activeTab = 0;
    if (tabButtons.length > 0) {
      tabButtons[0].focus();
    }
  }
  function syncPresetActive() {
    if (!draft) return;
    const upper = draft.color.toUpperCase();
    for (const btn of swatchButtons) {
      const match = btn.getAttribute("data-color")?.toUpperCase() === upper;
      btn.classList.toggle("bcc-swatch-active", match);
      btn.setAttribute("aria-pressed", match ? "true" : "false");
    }
  }
  function refreshPreview() {
    if (!draft || !previewChips) return;
    const scheme = schemeForPreview(draft.color, draft.schemeV2);
    const surfaceChip = previewChips.get("surface");
    if (surfaceChip) {
      surfaceChip.style.background = "#" + scheme.surface;
      const sample = surfaceChip.querySelector(".bcc-appearance-sample");
      if (sample) sample.style.color = "#" + scheme.text;
    }
    const setBg = (role) => {
      const chip = previewChips?.get(role);
      if (chip) chip.style.background = "#" + scheme[role];
    };
    setBg("accentWhisper");
    setBg("accentBan");
    setBg("surfaceRaised");
  }
  function buildAppearancePanel(panel) {
    const colorSection = document.createElement("section");
    colorSection.className = "bcc-appearance-section";
    const colorHeading = document.createElement("h3");
    colorHeading.className = "bcc-appearance-heading";
    colorHeading.textContent = "Farbe";
    colorSection.appendChild(colorHeading);
    const presetsRow = document.createElement("div");
    presetsRow.className = "bcc-presets";
    for (const hex of COLOR_PRESETS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bcc-swatch";
      btn.style.background = "#" + hex;
      btn.setAttribute("aria-label", "Farbe " + hex);
      btn.setAttribute("data-color", hex);
      btn.addEventListener("click", () => {
        if (!draft) return;
        draft.color = hex;
        if (hexInput) hexInput.value = hex;
        if (colorPicker) colorPicker.value = "#" + hex;
        clearError();
        syncPresetActive();
        refreshPreview();
        applyColor(hex);
        updateRevertButton();
      });
      swatchButtons.push(btn);
      presetsRow.appendChild(btn);
    }
    colorSection.appendChild(presetsRow);
    const inputRow = document.createElement("div");
    inputRow.className = "bcc-appearance-row";
    const colorPicker = document.createElement("input");
    colorPicker.type = "color";
    colorPicker.className = "bcc-appearance-picker";
    colorPicker.value = "#" + (draft?.color ?? "6AAED8");
    colorPicker.setAttribute("aria-label", "Farbe w\xE4hlen");
    const hexInput = document.createElement("input");
    hexInput.type = "text";
    hexInput.className = "bcc-appearance-hex";
    hexInput.maxLength = 7;
    hexInput.inputMode = "text";
    hexInput.value = draft?.color ?? "6AAED8";
    hexInput.placeholder = "6AAED8";
    const errorSpan = document.createElement("span");
    errorSpan.className = "bcc-appearance-error";
    errorSpan.setAttribute("aria-live", "polite");
    function clearError() {
      errorSpan.textContent = "";
    }
    function syncPickerFromDraft() {
      if (draft && colorPicker) colorPicker.value = "#" + draft.color;
    }
    colorPicker.addEventListener("input", () => {
      if (!draft) return;
      const stripped = colorPicker.value.replace(/^#/, "");
      draft.color = stripped;
      hexInput.value = stripped;
      clearError();
      syncPresetActive();
      refreshPreview();
      applyColor(stripped);
      updateRevertButton();
    });
    hexInput.addEventListener("input", () => {
      if (!draft) return;
      const val = hexInput.value;
      const stripped = val.replace(/^#/, "");
      const err = validateColor(stripped);
      if (err) {
        errorSpan.textContent = err;
        updateRevertButton();
        return;
      }
      clearError();
      draft.color = stripped;
      syncPickerFromDraft();
      syncPresetActive();
      refreshPreview();
      applyColor(stripped);
      updateRevertButton();
    });
    inputRow.appendChild(colorPicker);
    inputRow.appendChild(hexInput);
    colorSection.appendChild(inputRow);
    colorSection.appendChild(errorSpan);
    panel.appendChild(colorSection);
    const previewSection = document.createElement("section");
    previewSection.className = "bcc-appearance-section";
    const previewHeading = document.createElement("h3");
    previewHeading.className = "bcc-appearance-heading";
    previewHeading.textContent = "Vorschau";
    previewSection.appendChild(previewHeading);
    const previewRow = document.createElement("div");
    previewRow.className = "bcc-appearance-preview";
    const chipDefs = [
      { role: "surface", label: "Hintergrund" },
      { role: "accentWhisper", label: "Akzent" },
      { role: "accentBan", label: "Hinweis" },
      { role: "surfaceRaised", label: "Hervorgehoben" }
    ];
    previewChips = /* @__PURE__ */ new Map();
    for (const { role, label } of chipDefs) {
      const chip = document.createElement("div");
      chip.className = "bcc-appearance-chip";
      chip.setAttribute("data-role", role);
      chip.dataset.role = role;
      previewChips.set(role, chip);
      if (role === "surface") {
        const sample = document.createElement("span");
        sample.className = "bcc-appearance-sample";
        sample.textContent = "Aa";
        chip.appendChild(sample);
      }
      const chipLabel = document.createElement("span");
      chipLabel.className = "bcc-appearance-chip-label";
      chipLabel.textContent = label;
      chip.appendChild(chipLabel);
      previewRow.appendChild(chip);
    }
    previewSection.appendChild(previewRow);
    panel.appendChild(previewSection);
    const toggleSection = document.createElement("section");
    toggleSection.className = "bcc-appearance-section";
    const toggleLabel = document.createElement("label");
    toggleLabel.className = "bcc-switch";
    const toggleInput = document.createElement("input");
    toggleInput.type = "checkbox";
    toggleInput.checked = draft?.schemeV2 ?? false;
    const toggleTrack = document.createElement("span");
    toggleTrack.className = "bcc-switch-track";
    const toggleText = document.createElement("span");
    toggleText.textContent = "Experimentelles Scheme (v2)";
    toggleLabel.appendChild(toggleInput);
    toggleLabel.appendChild(toggleTrack);
    toggleLabel.appendChild(toggleText);
    toggleInput.addEventListener("change", () => {
      if (!draft) return;
      draft.schemeV2 = toggleInput.checked;
      refreshPreview();
      applyScheme2(toggleInput.checked);
      updateRevertButton();
    });
    toggleSection.appendChild(toggleLabel);
    panel.appendChild(toggleSection);
    syncPresetActive();
    refreshPreview();
  }
  function buildChatPanel(panel) {
    const field = document.createElement("div");
    field.className = "bcc-settings-field";
    const label = document.createElement("label");
    label.className = "bcc-switch";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = draft?.sendOnEnter ?? true;
    const track = document.createElement("span");
    track.className = "bcc-switch-track";
    const labelText = document.createElement("span");
    labelText.textContent = "Enter sendet (Shift+Enter f\xFCr Zeilenumbruch)";
    label.appendChild(checkbox);
    label.appendChild(track);
    label.appendChild(labelText);
    checkbox.addEventListener("change", () => {
      if (!draft) return;
      draft.sendOnEnter = checkbox.checked;
      void set("send_on_enter", checkbox.checked);
      updateRevertButton();
    });
    field.appendChild(label);
    const hint = document.createElement("p");
    hint.className = "bcc-settings-hint";
    hint.textContent = "Ausgeschaltet: Shift+Enter sendet, Enter macht einen Zeilenumbruch.";
    field.appendChild(hint);
    panel.appendChild(field);
    const hoverField = document.createElement("div");
    hoverField.className = "bcc-settings-field";
    const hoverLabel = document.createElement("label");
    hoverLabel.className = "bcc-switch";
    const hoverCheckbox = document.createElement("input");
    hoverCheckbox.type = "checkbox";
    hoverCheckbox.checked = draft?.hoverPreview ?? true;
    const hoverTrack = document.createElement("span");
    hoverTrack.className = "bcc-switch-track";
    const hoverLabelText = document.createElement("span");
    hoverLabelText.textContent = "Hover-Vorschau f\xFCr Fotos";
    hoverLabel.appendChild(hoverCheckbox);
    hoverLabel.appendChild(hoverTrack);
    hoverLabel.appendChild(hoverLabelText);
    hoverCheckbox.addEventListener("change", () => {
      if (!draft) return;
      draft.hoverPreview = hoverCheckbox.checked;
      void set("hover_preview", hoverCheckbox.checked);
      updateRevertButton();
    });
    hoverField.appendChild(hoverLabel);
    const hoverHint = document.createElement("p");
    hoverHint.className = "bcc-settings-hint";
    hoverHint.textContent = "Ausgeschaltet: Vorschaubilder erscheinen nur beim Klicken (Anheften), nicht beim Hovern.";
    hoverField.appendChild(hoverHint);
    panel.appendChild(hoverField);
  }
  function buildManagementPanel(panel) {
    const pinnedSection = document.createElement("section");
    pinnedSection.className = "bcc-appearance-section";
    const pinnedHeading = document.createElement("h3");
    pinnedHeading.className = "bcc-appearance-heading";
    pinnedHeading.textContent = "Angeheftete Benutzer";
    pinnedSection.appendChild(pinnedHeading);
    const pinnedWrap = document.createElement("div");
    pinnedWrap.className = "bcc-manage-section";
    const listUl = document.createElement("ul");
    listUl.className = "bcc-manage-list";
    function renderList2() {
      if (!draft) return;
      listUl.innerHTML = "";
      for (const name of draft.pinned) {
        const li = document.createElement("li");
        li.className = "bcc-manage-row";
        const nameSpan = document.createElement("span");
        nameSpan.className = "bcc-manage-name";
        nameSpan.textContent = name;
        li.appendChild(nameSpan);
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "bcc-manage-remove";
        removeBtn.setAttribute("aria-label", name + " entfernen");
        removeBtn.appendChild(iconElement("fa-trash"));
        removeBtn.addEventListener("click", () => {
          if (!draft) return;
          draft.pinned = removePinned(draft.pinned, name);
          renderList2();
          void set("pinned", draft.pinned);
          updateRevertButton();
        });
        li.appendChild(removeBtn);
        listUl.appendChild(li);
      }
    }
    renderList2();
    pinnedWrap.appendChild(listUl);
    const addRow = document.createElement("div");
    addRow.className = "bcc-manage-add";
    const addInput = document.createElement("input");
    addInput.type = "text";
    addInput.className = "bcc-manage-input";
    addInput.placeholder = "Benutzername";
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "bcc-settings-btn";
    addBtn.textContent = "Hinzuf\xFCgen";
    addBtn.addEventListener("click", () => {
      if (!draft) return;
      draft.pinned = addPinned(draft.pinned, addInput.value);
      addInput.value = "";
      renderList2();
      void set("pinned", draft.pinned);
      updateRevertButton();
    });
    addInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addBtn.click();
      }
    });
    addRow.appendChild(addInput);
    addRow.appendChild(addBtn);
    pinnedWrap.appendChild(addRow);
    pinnedSection.appendChild(pinnedWrap);
    panel.appendChild(pinnedSection);
    const whisperSection = document.createElement("section");
    whisperSection.className = "bcc-appearance-section";
    const whisperHeading = document.createElement("h3");
    whisperHeading.className = "bcc-appearance-heading";
    whisperHeading.textContent = "Fl\xFCsterziel (Superwhisper)";
    whisperSection.appendChild(whisperHeading);
    const whisperWrap = document.createElement("div");
    whisperWrap.className = "bcc-manage-section bcc-manage-whisper";
    const currentLine = document.createElement("div");
    currentLine.className = "bcc-manage-current";
    const currentLabel = document.createElement("span");
    currentLabel.textContent = "Aktuell: ";
    currentLine.appendChild(currentLabel);
    const currentStrong = document.createElement("strong");
    currentStrong.textContent = draft?.whisper || "Keines";
    currentLine.appendChild(currentStrong);
    whisperWrap.appendChild(currentLine);
    function refreshWhisperDisplay() {
      currentStrong.textContent = draft?.whisper || "Keines";
    }
    const whisperAddRow = document.createElement("div");
    whisperAddRow.className = "bcc-manage-add";
    const whisperInput = document.createElement("input");
    whisperInput.type = "text";
    whisperInput.className = "bcc-manage-input";
    whisperInput.placeholder = "Benutzername";
    const setBtn = document.createElement("button");
    setBtn.type = "button";
    setBtn.className = "bcc-settings-btn";
    setBtn.textContent = "Festlegen";
    setBtn.addEventListener("click", () => {
      if (!draft) return;
      draft.whisper = whisperInput.value.trim();
      whisperInput.value = "";
      refreshWhisperDisplay();
      void set("whisper", draft.whisper);
      updateRevertButton();
    });
    whisperInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        setBtn.click();
      }
    });
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "bcc-settings-btn";
    clearBtn.textContent = "Leeren";
    clearBtn.addEventListener("click", () => {
      if (!draft) return;
      draft.whisper = "";
      refreshWhisperDisplay();
      void set("whisper", draft.whisper);
      updateRevertButton();
    });
    whisperAddRow.appendChild(whisperInput);
    whisperAddRow.appendChild(setBtn);
    whisperAddRow.appendChild(clearBtn);
    whisperWrap.appendChild(whisperAddRow);
    whisperSection.appendChild(whisperWrap);
    panel.appendChild(whisperSection);
  }
  function rebuildDraftPanels() {
    previewChips = null;
    swatchButtons.length = 0;
    for (const i of [0, 1, 2]) {
      tabPanels[i]?.replaceChildren();
    }
    if (tabPanels[0]) buildAppearancePanel(tabPanels[0]);
    if (tabPanels[1]) buildChatPanel(tabPanels[1]);
    if (tabPanels[2]) buildManagementPanel(tabPanels[2]);
  }
  function handleExport() {
    if (!draft) return;
    const user = getChatNick() || "gast";
    const blob = serializeExport(draft, user);
    const json = JSON.stringify(blob, null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFileName(user, (/* @__PURE__ */ new Date()).toISOString().slice(0, 10));
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  function buildDatenPanel(panel) {
    const section = document.createElement("section");
    section.className = "bcc-appearance-section";
    const heading = document.createElement("h3");
    heading.className = "bcc-appearance-heading";
    heading.textContent = "Daten";
    section.appendChild(heading);
    const hint = document.createElement("p");
    hint.className = "bcc-settings-hint";
    hint.textContent = "Backup als Datei speichern, wiederherstellen oder zur\xFCcksetzen.";
    section.appendChild(hint);
    const row = document.createElement("div");
    row.className = "bcc-data-row";
    const exportBtn = document.createElement("button");
    exportBtn.type = "button";
    exportBtn.className = "bcc-settings-btn";
    exportBtn.textContent = "Exportieren";
    exportBtn.addEventListener("click", handleExport);
    row.appendChild(exportBtn);
    const importLabel = document.createElement("label");
    importLabel.className = "bcc-settings-btn";
    const importInput = document.createElement("input");
    importInput.type = "file";
    importInput.accept = "application/json,.json";
    importInput.style.display = "none";
    const importText = document.createTextNode("Importieren");
    importLabel.appendChild(importInput);
    importLabel.appendChild(importText);
    row.appendChild(importLabel);
    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "bcc-settings-btn";
    resetBtn.textContent = "Auf Standard zur\xFCcksetzen";
    row.appendChild(resetBtn);
    section.appendChild(row);
    const errorSpan = document.createElement("span");
    errorSpan.className = "bcc-data-error";
    errorSpan.setAttribute("aria-live", "polite");
    section.appendChild(errorSpan);
    panel.appendChild(section);
    function showError(msg) {
      errorSpan.textContent = msg;
    }
    importInput.addEventListener("change", () => {
      const file = importInput.files?.[0];
      if (!file) return;
      file.text().then(async (text) => {
        const result = parseImport(text);
        if (!result.ok) {
          showError(result.error);
          importInput.value = "";
          return;
        }
        if (!window.confirm("Alle Einstellungen durch den Import ersetzen?")) {
          importInput.value = "";
          return;
        }
        const prev = draft;
        draft = result.draft;
        try {
          if (prev) await applyDiff(prev, result.draft);
        } catch (e) {
          cclog("settings import apply failed: " + e.message, "v3");
        }
        rebuildDraftPanels();
        updateRevertButton();
        showError("");
        importInput.value = "";
      });
    });
    resetBtn.addEventListener("click", async () => {
      if (!window.confirm("Alle Einstellungen auf Standard zur\xFCcksetzen?")) return;
      const prev = draft;
      draft = defaultDraft();
      try {
        if (prev) await applyDiff(prev, draft);
      } catch (e) {
        cclog("settings reset apply failed: " + e.message, "v3");
      }
      rebuildDraftPanels();
      updateRevertButton();
    });
  }
  function buildInfoPanel(panel) {
    const list = document.createElement("div");
    list.className = "bcc-info-list";
    const rows = [
      { key: "Version", val: GM_info.script.version },
      { key: "Benutzer", val: getChatNick() || "\u2013" },
      { key: "Kanal", val: getChannel() || "\u2013" },
      { key: "Speicher-Schl\xFCssel (Bsp.)", val: getUserKey("color") }
    ];
    for (const { key, val } of rows) {
      const row = document.createElement("div");
      row.className = "bcc-info-row";
      const keyEl = document.createElement("span");
      keyEl.className = "bcc-info-key";
      keyEl.textContent = key;
      const valEl = document.createElement("span");
      valEl.className = "bcc-info-val";
      valEl.textContent = val;
      row.appendChild(keyEl);
      row.appendChild(valEl);
      list.appendChild(row);
    }
    panel.appendChild(list);
  }
  function buildBefehlePanel(panel) {
    const heading = document.createElement("h3");
    heading.className = "bcc-appearance-heading";
    heading.textContent = "Befehle";
    panel.appendChild(heading);
    const table = document.createElement("table");
    table.className = "bcc-cmds-table";
    for (const { cmd, desc } of COMMANDS) {
      const tr = document.createElement("tr");
      const tdCmd = document.createElement("td");
      tdCmd.className = "bcc-cmds-cmd";
      tdCmd.textContent = cmd;
      const tdDesc = document.createElement("td");
      tdDesc.className = "bcc-cmds-desc";
      tdDesc.textContent = desc;
      tr.appendChild(tdCmd);
      tr.appendChild(tdDesc);
      table.appendChild(tr);
    }
    panel.appendChild(table);
  }
  function selectTab(index) {
    if (index < 0 || index >= TABS.length) return;
    activeTab = index;
    for (let i = 0; i < tabButtons.length; i++) {
      const isSelected = i === index;
      tabButtons[i].setAttribute("aria-selected", isSelected ? "true" : "false");
      tabPanels[i].setAttribute("aria-hidden", isSelected ? "false" : "true");
    }
  }
  function handleTabArrow(e) {
    if (tabButtons.length === 0) return;
    const target = e.target;
    if (!tabButtons.includes(target)) return;
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      next = (activeTab + 1) % tabButtons.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      next = (activeTab - 1 + tabButtons.length) % tabButtons.length;
    }
    if (next >= 0) {
      selectTab(next);
      tabButtons[next].focus();
    }
  }
  function handleFocusTrap(e) {
    if (e.key !== "Tab") return;
    if (!overlayEl2) return;
    const focusable = overlayEl2.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
  async function handleRevert() {
    if (!loaded || !draft) return;
    try {
      await applyDiff(draft, loaded);
    } catch (e) {
      cclog("settings undo failed: " + e.message, "v3");
    }
    draft = { ...loaded };
    rebuildDraftPanels();
    updateRevertButton();
  }
  function updateRevertButton() {
    if (revertBtn && loaded && draft) {
      revertBtn.disabled = !isDirty(loaded, draft);
    }
  }

  // src/aw-modal.ts
  function buildAwModel(channels, diff, opts) {
    const cold = diff === null || opts.mountRender === true || opts.prevEmpty === true;
    const joined = /* @__PURE__ */ new Map();
    if (!cold) {
      for (const { user, channel } of diff.added) {
        let keys = joined.get(channel);
        if (!keys) {
          keys = /* @__PURE__ */ new Set();
          joined.set(channel, keys);
        }
        keys.add(user.key);
      }
    }
    const sections = [];
    const byChannel = /* @__PURE__ */ new Map();
    const sectionFor = (channel) => {
      let s = byChannel.get(channel);
      if (!s) {
        s = { channel, rows: [], ghosts: [], total: 0 };
        byChannel.set(channel, s);
        sections.push(s);
      }
      return s;
    };
    for (const [channel, users] of channels) {
      const s = sectionFor(channel);
      const keys = joined.get(channel);
      for (const user of users) {
        s.rows.push({
          name: user.name,
          key: user.key,
          transient: keys !== void 0 && keys.has(user.key) ? "joined" : null,
          ghost: false
        });
      }
      s.total = s.rows.length;
    }
    if (!cold) {
      for (const { user, channel } of diff.removed) {
        sectionFor(channel).ghosts.push({
          name: user.name,
          key: user.key,
          transient: null,
          ghost: true
        });
      }
    }
    const total = sections.reduce((sum, s) => sum + s.total, 0);
    return { sections, total };
  }
  function applyFilter(model2, query) {
    const q = query.trim().toLowerCase();
    if (!q) {
      return { sections: model2.sections, matched: model2.total, total: model2.total };
    }
    const sections = [];
    let matched = 0;
    for (const s of model2.sections) {
      const rows = s.rows.filter((r) => r.name.toLowerCase().includes(q));
      if (rows.length === 0) continue;
      matched += rows.length;
      const ghosts = s.ghosts.filter((g) => g.name.toLowerCase().includes(q));
      sections.push({ channel: s.channel, rows, ghosts, total: rows.length });
    }
    return { sections, matched, total: model2.total };
  }
  function formatStand(date) {
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `Stand: ${hh}:${mm}`;
  }
  var LOADING_TEXT = "Lade Anwesende\u2026";
  var EMPTY_TEXT = "Keine Anwesenden gefunden.";
  var ERROR_TEXT = "Anwesende konnten nicht geladen werden. Der Chat funktioniert weiter. Klicke erneut auf die Aktualisieren-Schaltfl\xE4che.";
  var overlayEl3 = null;
  var documentKeydown3 = null;
  var unreact = null;
  var filterQuery = "";
  var firstRender = true;
  var prevEmpty = true;
  var pendingOwnFetches = 0;
  var bodyEl = null;
  var countSpan = null;
  var standSpan = null;
  var stateEl = null;
  var model = null;
  var usersByKey = /* @__PURE__ */ new Map();
  function setState(text) {
    if (stateEl) stateEl.textContent = text;
  }
  function renderBody() {
    if (!model || !bodyEl || !countSpan || !standSpan || !stateEl) return;
    const view = applyFilter(model, filterQuery);
    bodyEl.replaceChildren();
    for (const section of view.sections) {
      const sectionEl = document.createElement("div");
      sectionEl.className = "bcc-aw-section";
      const head = document.createElement("div");
      head.className = "bcc-aw-section-head";
      head.textContent = `${section.channel} (${section.rows.length})`;
      sectionEl.appendChild(head);
      const rowsEl = document.createElement("div");
      rowsEl.className = "bcc-aw-rows";
      for (const row of section.rows) {
        const rowEl = document.createElement("span");
        rowEl.className = "bcc-aw-row";
        rowEl.textContent = row.name;
        rowEl.dataset.key = row.key;
        rowsEl.appendChild(rowEl);
      }
      for (const ghost of section.ghosts) {
        const ghostEl = document.createElement("span");
        ghostEl.className = "bcc-aw-ghost";
        ghostEl.textContent = ghost.name;
        rowsEl.appendChild(ghostEl);
      }
      sectionEl.appendChild(rowsEl);
      bodyEl.appendChild(sectionEl);
    }
    countSpan.textContent = filterQuery.trim() !== "" ? `${view.matched}/${view.total}` : String(view.total);
    standSpan.textContent = formatStand(/* @__PURE__ */ new Date());
    setState(view.sections.length === 0 ? EMPTY_TEXT : "");
  }
  function renderList(payload) {
    if (firstRender) {
      model = buildAwModel(payload.channels, null, { mountRender: true });
      firstRender = false;
    } else {
      if (pendingOwnFetches === 0) return;
      model = buildAwModel(
        payload.channels,
        { added: payload.added, removed: payload.removed },
        { prevEmpty }
      );
    }
    prevEmpty = model.total === 0;
    usersByKey = /* @__PURE__ */ new Map();
    for (const users of payload.channels.values()) {
      for (const u of users) usersByKey.set(u.key, u);
    }
    renderBody();
  }
  async function fetchAndRender(overlay) {
    if (get("globalUserlist").channels.size === 0) setState(LOADING_TEXT);
    pendingOwnFetches++;
    try {
      await refreshAwNow();
      if (overlayEl3 === overlay && get("globalUserlist").channels.size === 0) {
        setState(ERROR_TEXT);
      }
    } finally {
      if (overlayEl3 === overlay) pendingOwnFetches--;
    }
  }
  function closeAwModal() {
    if (documentKeydown3) {
      document.removeEventListener("keydown", documentKeydown3);
      documentKeydown3 = null;
    }
    if (unreact) {
      unreact();
      unreact = null;
    }
    if (overlayEl3) {
      overlayEl3.remove();
      overlayEl3 = null;
    }
    bodyEl = null;
    countSpan = null;
    standSpan = null;
    stateEl = null;
    model = null;
    usersByKey = /* @__PURE__ */ new Map();
  }
  function openAwModal() {
    closeAwModal();
    const shell = document.querySelector(".bcc-shell");
    if (!shell) return;
    filterQuery = "";
    firstRender = true;
    prevEmpty = true;
    pendingOwnFetches = 0;
    model = null;
    usersByKey = /* @__PURE__ */ new Map();
    overlayEl3 = document.createElement("div");
    overlayEl3.className = "bcc-aw-overlay";
    const card = document.createElement("div");
    card.className = "bcc-aw-card";
    const header = document.createElement("div");
    header.className = "bcc-aw-header";
    const title = document.createElement("span");
    title.textContent = "Anwesende";
    header.appendChild(title);
    countSpan = document.createElement("span");
    countSpan.className = "bcc-aw-count";
    header.appendChild(countSpan);
    const closeBtn = document.createElement("button");
    closeBtn.className = "bcc-aw-close";
    closeBtn.setAttribute("aria-label", "Schlie\xDFen");
    closeBtn.appendChild(iconElement("fa-xmark"));
    closeBtn.addEventListener("click", closeAwModal);
    header.appendChild(closeBtn);
    card.appendChild(header);
    const toolbar = document.createElement("div");
    toolbar.className = "bcc-aw-toolbar";
    const filterInput = document.createElement("input");
    filterInput.type = "text";
    filterInput.placeholder = "Nick filtern\u2026";
    filterInput.addEventListener("input", () => {
      filterQuery = filterInput.value;
      renderBody();
    });
    toolbar.appendChild(filterInput);
    standSpan = document.createElement("span");
    standSpan.className = "bcc-aw-stand";
    toolbar.appendChild(standSpan);
    const refreshBtn = document.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.className = "bcc-icon-btn";
    refreshBtn.setAttribute("aria-label", "Jetzt aktualisieren");
    refreshBtn.title = "Jetzt aktualisieren";
    refreshBtn.appendChild(iconElement("fa-sync"));
    refreshBtn.addEventListener("click", () => {
      if (overlayEl3) void fetchAndRender(overlayEl3);
    });
    toolbar.appendChild(refreshBtn);
    card.appendChild(toolbar);
    bodyEl = document.createElement("div");
    bodyEl.className = "bcc-aw-body";
    bodyEl.addEventListener("click", (e) => {
      const row = e.target.closest(".bcc-aw-row");
      if (!row) return;
      e.stopPropagation();
      const user = usersByKey.get(row.dataset.key ?? "");
      if (!user) return;
      openUserPopup(row, user, get("pinned").includes(user.key), (u) => {
        togglePin(u).catch(() => {
          cclog("aw modal: pin toggle failed for " + u.name, "v3");
        });
      });
    });
    card.appendChild(bodyEl);
    stateEl = document.createElement("div");
    stateEl.className = "bcc-aw-state";
    card.appendChild(stateEl);
    overlayEl3.appendChild(card);
    shell.appendChild(overlayEl3);
    documentKeydown3 = (e) => {
      if (e.key === "Escape" && !isIdPopupOpen() && !isSettingsOpen()) closeAwModal();
    };
    document.addEventListener("keydown", documentKeydown3);
    overlayEl3.addEventListener("click", (e) => {
      if (e.target === overlayEl3) closeAwModal();
    });
    unreact = react("globalUserlist", renderList);
    filterInput.focus();
    void fetchAndRender(overlayEl3);
  }

  // src/patched-handler.ts
  var AWAY_TIMER_NEEDLE = 'if((msg.indexOf("/")!=0||msg.indexOf("/me ")==0)){';
  var AWAY_TIMER_REPLACEMENT = 'if((msg.indexOf("/")!=0||msg.indexOf("/me ")==0||msg.indexOf("/w ")==0)){';
  function patchAwayTimer(onSubmitOrigStr) {
    if (!onSubmitOrigStr.includes(AWAY_TIMER_NEEDLE)) {
      throw new Error(
        `patchAwayTimer: upstream onsubmit needle not found \u2014 the away-timer condition changed upstream; "/w" messages will no longer reset the away timer. Inspect the hold form's onsubmit and update AWAY_TIMER_NEEDLE.`
      );
    }
    return onSubmitOrigStr.replace(AWAY_TIMER_NEEDLE, AWAY_TIMER_REPLACEMENT);
  }
  function buildPatchedHandler(holdForm) {
    const raw = holdForm?.getAttribute("onsubmit") || "";
    if (!raw) return null;
    return new Function(patchAwayTimer(raw));
  }

  // src/input-history.ts
  var HISTORY_MAX = 50;
  var DRAFT_DEBOUNCE_MS = 500;
  var STRUCTURE_KEY_BASE = "bcc_input_history";
  var LEGACY_DRAFT_KEY = "bcc_draft";
  function recallUp(s, boxText) {
    if (s.entries.length === 0) return s;
    if (s.position === 0) return { ...s, position: 1, draft: boxText };
    if (s.position >= s.entries.length) return s;
    return { ...s, position: s.position + 1 };
  }
  function recallDown(s) {
    if (s.position <= 0) return s;
    return { ...s, position: s.position - 1 };
  }
  function recallEscape(s) {
    if (s.position === 0) return s;
    return { ...s, position: 0 };
  }
  function currentText(s) {
    return s.position === 0 ? s.draft : s.entries[s.position - 1] ?? s.draft;
  }
  function pushEntry(entries, text) {
    const t = text.trim();
    if (t === "" || entries.includes(t)) return entries;
    return [t, ...entries].slice(0, HISTORY_MAX);
  }
  function parseStructure(raw) {
    if (raw === null) return { ok: false };
    let v;
    try {
      v = JSON.parse(raw);
    } catch {
      return { ok: false };
    }
    if (typeof v !== "object" || v === null) return { ok: false };
    const rec = v;
    if (typeof rec.draft !== "string" || !Array.isArray(rec.entries)) return { ok: false };
    const entries = [];
    for (const e of rec.entries) {
      if (typeof e !== "string") return { ok: false };
      entries.push(e);
    }
    return { ok: true, draft: rec.draft, entries: entries.slice(0, HISTORY_MAX) };
  }
  function serializeStructure(draft2, entries) {
    return JSON.stringify({ draft: draft2, entries: entries.slice(0, HISTORY_MAX) });
  }
  function restoreState(storage, structureKey2) {
    const raw = storage.getItem(structureKey2);
    const parsed = parseStructure(raw);
    if (parsed.ok) return { position: 0, draft: parsed.draft, entries: parsed.entries };
    if (raw !== null) {
      cclog("input-history: structure corrupt, starting empty", "v3");
      return { position: 0, draft: "", entries: [] };
    }
    const legacy = storage.getItem(LEGACY_DRAFT_KEY);
    if (legacy !== null) {
      storage.removeItem(LEGACY_DRAFT_KEY);
      return { position: 0, draft: legacy, entries: [] };
    }
    return { position: 0, draft: "", entries: [] };
  }
  var state = { position: 0, draft: "", entries: [] };
  var structureKey = "";
  var draftTimer = null;
  function persist() {
    sessionStorage.setItem(structureKey, serializeStructure(state.draft, state.entries));
  }
  function cancelDraftTimer() {
    if (draftTimer !== null) {
      clearTimeout(draftTimer);
      draftTimer = null;
    }
  }
  function initInputHistory(getBox) {
    structureKey = getUserKey(STRUCTURE_KEY_BASE);
    state = restoreState(sessionStorage, structureKey);
    window.addEventListener("pagehide", () => {
      if (state.position !== 0) return;
      cancelDraftTimer();
      state.draft = getBox();
      persist();
    });
    return state.draft;
  }
  function handleRecallKey(e, boxText) {
    if (e.isComposing) return null;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === "ArrowUp") {
      const leavingDraft = state.position === 0;
      const next = recallUp(state, boxText);
      if (next === state) return null;
      state = next;
      if (leavingDraft) {
        cancelDraftTimer();
        persist();
      }
      return currentText(state);
    }
    if (mod && e.key === "ArrowDown") {
      const next = recallDown(state);
      if (next === state) return null;
      state = next;
      return currentText(state);
    }
    if (e.key === "Escape") {
      const next = recallEscape(state);
      if (next === state) return null;
      state = next;
      return currentText(state);
    }
    return null;
  }
  function onDraftInput(boxText) {
    if (state.position !== 0) return;
    cancelDraftTimer();
    draftTimer = setTimeout(() => {
      draftTimer = null;
      state.draft = boxText;
      persist();
    }, DRAFT_DEBOUNCE_MS);
  }
  function recordSubmit(rawMsg) {
    const wasRecalling = state.position > 0;
    cancelDraftTimer();
    state.entries = pushEntry(state.entries, rawMsg);
    state.position = 0;
    if (!wasRecalling) state.draft = "";
    persist();
    return wasRecalling ? state.draft : "";
  }
  function resetRecall() {
    state.position = 0;
  }

  // src/input.ts
  function sendBlocked(conn) {
    return conn.phase !== "connected";
  }
  var textarea = null;
  var onSubmitOrig = null;
  var currentWhisperNick = "";
  var HINTS_ALL = "Superwhisper: /sw Sariam  |  Ban: /sb Wendigo  |  Hilfe: /help";
  var HINTS_WHISPER = "Superwhisper aus: /open  |  /o Hi All :)  |  Hilfe: /help";
  var PLACEHOLDER_ALL = "Du chattest mit allen...\n\n" + HINTS_ALL;
  function placeholderFor(nick) {
    return "Du fl\xFCsterst mit " + nick + "...\n\n" + HINTS_WHISPER;
  }
  var PLACEHOLDER_COMPACT_ALL = "Nachricht...  |  /sw Name  |  /o Hi all  |  /help";
  function placeholderCompactFor(nick) {
    return "Fl\xFCstern zu " + nick + "...  |  /open  |  /o Hi all  |  /help";
  }
  function prepareMessage(rawMsg, whisperNick) {
    const cmd = classifyMessage(rawMsg);
    if (cmd.handled) {
      switch (cmd.type) {
        case "aw":
        case "help":
        case "reload":
        case "open-whisper":
        case "superwhisper":
        case "superban":
        case "id":
        case "pinned-list":
        case "color-info":
        case "scheme-info":
        case "settings":
          return { action: "handled", clear: true };
        case "open-msg":
          return { action: "send", message: cmd.message };
      }
    }
    return { action: "send", message: rewriteForWhisper(rawMsg, whisperNick) };
  }
  function shouldSendOnEnter(sendOnEnterFlag, shiftKey) {
    return sendOnEnterFlag ? !shiftKey : shiftKey;
  }
  async function doSubmit(whispernick) {
    const docHold = document.hold;
    if (!docHold) return;
    const rawMsg = (textarea?.value ?? "").trim();
    const finalNick = whispernick ?? currentWhisperNick;
    const decision = prepareMessage(rawMsg, finalNick);
    if (decision.action === "handled") {
      const cmd = classifyMessage(rawMsg);
      if (cmd.handled) {
        switch (cmd.type) {
          case "help":
            printHelp();
            break;
          case "reload":
            unsafeWindow.bettercc.reloadChat();
            break;
          case "open-whisper":
            await superwhisper("");
            break;
          case "superwhisper":
            await superwhisper(cmd.nick, false);
            break;
          case "superban":
            break;
          // Stub for T12.
          case "aw":
            openAwModal();
            break;
          case "id":
            buildIdPopup(cmd.name || "");
            break;
          case "pinned-list": {
            const list = get("pinned");
            printToChat(
              list.length ? "Angepinnt: " + list.join(", ") : "Keine angepinnten Benutzer."
            );
            break;
          }
          case "color-info": {
            const hex = String(get("color")).replace(/^#/, "");
            const swatch = '<span style="display:inline-block;width:24px;height:24px;background:#' + hex + ';border-radius:4px;vertical-align:middle;margin:0 4px 0 2px;box-shadow:0 2px 4px rgba(0,0,0,0.25)"></span>';
            printToChat("Thema-Farbe: " + swatch + "#" + hex);
            break;
          }
          case "scheme-info": {
            const v2 = get("scheme_v2");
            const scheme = generateScheme3(get("color"));
            const rows = [];
            for (const [k, v] of Object.entries(scheme)) {
              const hex = String(v).replace(/^#/, "");
              const swatch = '<span style="display:inline-block;width:24px;height:24px;background:#' + hex + ';border-radius:4px;vertical-align:middle;box-shadow:0 2px 4px rgba(0,0,0,0.25)"></span>';
              rows.push(
                '<tr><td style="padding:2px 8px 2px 0">' + swatch + '</td><td style="padding-right:6px">' + k + "</td><td>#" + hex + "</td></tr>"
              );
            }
            rows.push(
              '<tr><td colspan="3" style="padding-top:6px;opacity:0.6">Generator: ' + (v2 ? "v2 (experimentell)" : "v1") + "</td></tr>"
            );
            printToChat(
              '<table style="border-collapse:collapse;font:inherit;color:inherit">' + rows.join("") + "</table>"
            );
            break;
          }
          case "settings":
            openSettings();
            break;
        }
      }
      docHold.OUT1.value = "";
      if (textarea) textarea.value = recordSubmit(rawMsg);
      return;
    }
    if (sendBlocked(get("conn"))) return;
    if (onSubmitOrig && decision.message) {
      docHold.OUT1.value = decision.message;
      onSubmitOrig();
    }
    if (textarea) textarea.value = recordSubmit(rawMsg);
  }
  function prefillWhisper(nick) {
    if (!textarea) return;
    resetRecall();
    textarea.value = "/w " + nick + " ";
    textarea.focus();
    const end = textarea.value.length;
    textarea.setSelectionRange(end, end);
  }
  async function superwhisper(whispernick, toggle = true) {
    const cur = get("whisper");
    const same = toggle && whispernick && cur.toLowerCase() === whispernick.toLowerCase();
    await set("whisper", same || !whispernick ? "" : whispernick);
  }
  function mountInput() {
    const chatbar = document.querySelector(".bcc-chatbar");
    if (!chatbar) return;
    const inputArea = document.createElement("div");
    inputArea.className = "bcc-input-area";
    chatbar.innerHTML = "";
    chatbar.appendChild(inputArea);
    textarea = document.createElement("textarea");
    textarea.name = "bcc-chat";
    textarea.className = "bcc-input-field";
    textarea.setAttribute("aria-label", "Chat-Nachricht eingeben");
    textarea.placeholder = PLACEHOLDER_ALL;
    const box = textarea;
    box.addEventListener("keydown", (e) => {
      const recalled = handleRecallKey(e, box.value);
      if (recalled !== null) {
        e.preventDefault();
        box.value = recalled;
        return;
      }
      if (e.key === "Enter" && shouldSendOnEnter(get("send_on_enter"), e.shiftKey)) {
        e.preventDefault();
        doSubmit();
      }
    });
    box.addEventListener("input", () => onDraftInput(box.value));
    inputArea.appendChild(box);
    box.value = initInputHistory(() => box.value);
    const holdForm = document.querySelector('form[name="hold"]');
    try {
      onSubmitOrig = buildPatchedHandler(holdForm);
    } catch (e) {
      cclog("mountInput: " + e.message, "v3");
      reportSendPathBroken(e.message);
    }
    unsafeWindow.bettercc.onSubmit = doSubmit;
    unsafeWindow.bettercc.superwhisper = superwhisper;
    unsafeWindow.bettercc.prefillWhisper = prefillWhisper;
    react("whisper", (nick) => {
      currentWhisperNick = nick;
      textarea?.classList.toggle("bcc-superwhisper", Boolean(nick));
      updatePlaceholder();
    });
    react("compact", () => updatePlaceholder());
    if (textarea) textarea.focus();
    cclog("input mounted \u2014 textarea + whisper indicator + send contract", "v3");
  }
  function updatePlaceholder() {
    if (!textarea) return;
    const compact = get("compact");
    if (currentWhisperNick) {
      textarea.placeholder = compact ? placeholderCompactFor(currentWhisperNick) : placeholderFor(currentWhisperNick);
    } else {
      textarea.placeholder = compact ? PLACEHOLDER_COMPACT_ALL : PLACEHOLDER_ALL;
    }
  }

  // src/status-button.ts
  function buttonView(conn) {
    if (conn.phase === "authdead") {
      return {
        icon: "fa-triangle-exclamation",
        spinning: false,
        badge: null,
        stateText: STATUS_TEXT.authdead
      };
    }
    if (conn.phase === "connected") {
      return {
        icon: "fa-sync",
        spinning: false,
        badge: null,
        stateText: STATUS_TEXT.connected
      };
    }
    if (conn.attempt >= 2) {
      return {
        icon: "fa-sync",
        spinning: true,
        badge: conn.attempt,
        stateText: retryText(conn.attempt)
      };
    }
    return {
      icon: "fa-sync",
      spinning: true,
      badge: null,
      stateText: STATUS_TEXT.connecting
    };
  }
  function buildStatusButton() {
    const btn = actionButton({ iconClass: "fa-sync", title: "Chat neu laden", onClick: reloadChat });
    btn.className = "bcc-icon-btn bcc-health-btn";
    const badge = document.createElement("span");
    badge.className = "bcc-health-badge";
    badge.hidden = true;
    btn.appendChild(badge);
    let prev = null;
    react("conn", (conn) => {
      const view = buttonView(conn);
      if (prev && view.icon === prev.icon && view.spinning === prev.spinning && view.badge === prev.badge && view.stateText === prev.stateText) {
        return;
      }
      prev = view;
      const icon = btn.querySelector("i");
      icon.className = "fas " + view.icon;
      icon.classList.toggle("bcc-health-spin", view.spinning);
      icon.classList.toggle("bcc-health-down", view.icon === "fa-triangle-exclamation");
      if (view.badge === null) {
        badge.hidden = true;
      } else {
        badge.hidden = false;
        badge.textContent = String(view.badge);
      }
      const title = statusButtonTitle(view.stateText);
      btn.title = title;
      btn.setAttribute("aria-label", title);
    });
    return btn;
  }

  // src/footer.ts
  function iconBtn(iconClass, title, onClick) {
    const btn = actionButton({ iconClass, title, onClick });
    const isBnClass = /^b\d+$/.test(iconClass);
    btn.className = isBnClass ? "bcc-icon-btn " + iconClass : "bcc-icon-btn";
    return btn;
  }
  function pill(extraClass, ...children) {
    const p = document.createElement("div");
    p.className = "bcc-pill";
    if (extraClass) p.classList.add(extraClass);
    for (const c of children) p.appendChild(c);
    return p;
  }
  function buildAutoscrollBtn() {
    const btn = iconBtn("fa-angle-double-down", "Autoscroll ein/aus", () => {
      const cb2 = document.querySelector(
        'form[name="OF"] input[name="AS"]'
      );
      if (cb2) cb2.click();
      btn.classList.toggle("bcc-active", cb2?.checked ?? false);
    });
    const cb = document.querySelector('form[name="OF"] input[name="AS"]');
    if (cb?.checked) btn.classList.add("bcc-active");
    return btn;
  }
  function buildReloadBtn() {
    return buildStatusButton();
  }
  function buildColorPicker(title, name, defaultColor, onInput) {
    const wrap = document.createElement("label");
    wrap.className = "bcc-color-btn bcc-color-picker-wrap";
    wrap.title = title;
    wrap.setAttribute("aria-label", title);
    const input = document.createElement("input");
    input.type = "color";
    input.name = name;
    input.className = "bcc-color-input";
    input.value = defaultColor;
    input.addEventListener("input", () => {
      const hex = input.value.replace(/^#/, "").toUpperCase();
      wrap.style.setProperty("--swatch-color", input.value);
      onInput(hex);
    });
    wrap.appendChild(input);
    return wrap;
  }
  function buildColorSwatch() {
    const picker = buildColorPicker("Thema-Farbe w\xE4hlen", "bcc-color", "#6aaed8", (hex) => {
      void setColor(hex);
    });
    const input = picker.querySelector("input");
    react("color", (hex) => {
      input.value = "#" + String(hex).replace(/^#/, "");
      picker.style.setProperty("--swatch-color", input.value);
    });
    return picker;
  }
  function buildChatPill() {
    const awayBtn = iconBtn("b2", "Away (/away)", () => sendCommand("/away"));
    const backBtn = iconBtn("b3", "Zur\xFCck (/awayoff)", () => sendCommand("/awayoff"));
    const autoscrollBtn = buildAutoscrollBtn();
    const reloadBtn = buildReloadBtn();
    awayBtn.classList.add("bcc-keep");
    backBtn.classList.add("bcc-keep");
    autoscrollBtn.classList.add("bcc-keep");
    reloadBtn.classList.add("bcc-keep");
    return pill(
      "bcc-chat",
      awayBtn,
      backBtn,
      iconBtn("b5", "Systemmeldungen an", () => sendCommand("/messageon")),
      iconBtn("b6", "Systemmeldungen aus", () => sendCommand("/messageoff")),
      autoscrollBtn,
      reloadBtn
    );
  }
  function buildBetterccPill() {
    const schemeToggle = document.createElement("button");
    schemeToggle.type = "button";
    schemeToggle.className = "bcc-icon-btn";
    const updateToggle = () => {
      const v2 = get("scheme_v2");
      schemeToggle.title = v2 ? "Scheme v2 \u2014 klick f\xFCr v1" : "Scheme v1 \u2014 klick f\xFCr v2";
      schemeToggle.setAttribute("aria-label", schemeToggle.title);
      schemeToggle.innerHTML = '<span style="font-size:10px;font-weight:700">' + (v2 ? "v2" : "v1") + "</span>";
    };
    react("scheme_v2", updateToggle);
    schemeToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      void toggleSchemeVersion();
    });
    const swatch = buildColorSwatch();
    swatch.classList.add("bcc-keep");
    const awBtn = iconBtn("fa-users", "Anwesende", () => {
      openAwModal();
    });
    awBtn.classList.add("bcc-keep");
    return pill(
      "bcc-bettercc",
      swatch,
      awBtn,
      iconBtn("fa-cog", "Einstellungen", () => {
        openSettings();
      }),
      schemeToggle,
      iconBtn("fa-circle-info", "Hilfe", () => printHelp())
    );
  }
  function buildLinksPill() {
    const id = iconBtn("b16", "Eigene ID", () => {
      const nick = getChatNick();
      if (nick) window.open("//www.chatcity.de/de/id/" + nick + ".html", "IDCARD");
    });
    const forum = iconBtn("b15", "Forum", () => {
      window.open("//www.chatcity.de/f101/", "_blank");
    });
    const help = iconBtn("b1", "Chat-Hilfe (extern)", () => {
      window.open("//www.chatcity.de/de/hilfe-allgemeines.html#cmd", "_blank");
    });
    const nickColor = buildColorPicker("Nick-Farbe w\xE4hlen", "bcc-nick-color", "#aa0000", (hex) => {
      sendCommand("/color " + hex);
    });
    return pill("bcc-links", id, forum, nickColor, help);
  }
  function buildExitBtn() {
    const btn = iconBtn("b7", "Verlassen", () => leaveChat());
    btn.classList.add("bcc-danger");
    return btn;
  }
  function injectFontAwesome() {
    if (document.querySelector('link[href*="fontawesome"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://use.fontawesome.com/releases/v6.5.1/css/all.css";
    document.head.appendChild(link);
  }
  function setToggleState(btn, compact) {
    btn.title = compact ? "Chatbar erweitern" : "Chatbar komprimieren";
    btn.setAttribute("aria-label", btn.title);
    btn.querySelector("i").className = compact ? "fas fa-chevron-up" : "fas fa-chevron-down";
  }
  function buildCompactToggle(chatbar) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bcc-compact-toggle";
    btn.title = "Chatbar komprimieren";
    btn.setAttribute("aria-label", "Chatbar komprimieren");
    btn.innerHTML = '<i class="fas fa-chevron-down"></i>';
    btn.addEventListener("click", async () => {
      void set("compact", !get("compact"));
    });
    react("compact", (on2) => {
      chatbar.classList.toggle("bcc-compact", on2);
      setToggleState(btn, on2);
    });
    return btn;
  }
  function mountFooter() {
    const chatbar = document.querySelector(".bcc-chatbar");
    if (!chatbar) return;
    injectFontAwesome();
    const firstPill = chatbar.querySelector(".bcc-chat");
    if (firstPill) {
      chatbar.insertBefore(buildCompactToggle(chatbar), firstPill);
    } else {
      chatbar.append(buildCompactToggle(chatbar));
    }
    const controls = document.createElement("div");
    controls.className = "bcc-controls";
    controls.append(buildChatPill(), buildBetterccPill(), buildLinksPill(), buildExitBtn());
    chatbar.append(controls);
    cclog("footer mounted \u2014 pill groups + FA", "v3");
  }

  // src/health-ui.ts
  function shouldShowCritical(conn, dismissed) {
    return conn.phase === "authdead" && !dismissed;
  }
  function bootErrorCode(err) {
    return err instanceof TypeError ? "structure-changed" : "error";
  }
  function bootDisplayFor(code) {
    if (code === "structure-changed") return BOOT_REASON_STRUCTURE;
    if (code === "ws-takeover") return BOOT_REASON_WS;
    return null;
  }
  function buildErrorReport(f) {
    const lines = ["BetterCC v" + f.version, "context: " + f.context, "reason: " + f.reason];
    if (f.error !== null) lines.push("error: " + f.error);
    if (f.stack !== null) lines.push("stack: " + f.stack);
    lines.push("url: " + f.url, "ua: " + f.userAgent, "time: " + f.time);
    if (f.state === null) {
      lines.push("state: unavailable");
    } else {
      lines.push(
        "conn: " + JSON.stringify(f.state.conn),
        "bccHealth: " + JSON.stringify(f.state.bccHealth),
        "freshness: " + JSON.stringify(f.state.freshness)
      );
    }
    return lines.join("\n");
  }
  function reportFields(context, reason, error, stack) {
    let state2;
    try {
      const s = snapshot();
      state2 = { conn: s.conn, bccHealth: s.bccHealth, freshness: s.freshness };
    } catch {
      state2 = null;
    }
    return {
      version: GM_info.script.version,
      context,
      reason,
      error,
      stack,
      url: location.href,
      userAgent: navigator.userAgent,
      time: (/* @__PURE__ */ new Date()).toISOString(),
      state: state2
    };
  }
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      let ok;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      ta.remove();
      return ok;
    }
  }
  function buildCardEl(title, text, actions) {
    const card = document.createElement("div");
    Object.assign(card.style, {
      pointerEvents: "auto",
      maxWidth: "360px",
      margin: "0 16px",
      padding: "18px 20px",
      background: "#26262b",
      color: "#eee",
      border: "1px solid rgba(255,255,255,0.25)",
      borderRadius: "10px",
      boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
      fontFamily: "system-ui, sans-serif"
    });
    card.setAttribute("role", "alert");
    card.setAttribute("aria-label", title);
    const titleEl = document.createElement("div");
    Object.assign(titleEl.style, {
      fontSize: "15px",
      fontWeight: "600",
      marginBottom: "8px"
    });
    titleEl.textContent = title;
    const textEl = document.createElement("div");
    Object.assign(textEl.style, {
      fontSize: "13px",
      lineHeight: "1.5",
      whiteSpace: "pre-line",
      marginBottom: "14px",
      color: "#ccc"
    });
    textEl.textContent = text;
    const actionsEl = document.createElement("div");
    Object.assign(actionsEl.style, {
      display: "flex",
      gap: "8px",
      justifyContent: "flex-end"
    });
    for (const a of actions) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = a.label;
      Object.assign(btn.style, {
        background: "transparent",
        color: "#eee",
        border: "1px solid rgba(255,255,255,0.35)",
        borderRadius: "6px",
        padding: "6px 12px",
        fontSize: "13px",
        cursor: "pointer"
      });
      btn.addEventListener("click", a.onClick);
      actionsEl.appendChild(btn);
    }
    card.append(titleEl, textEl, actionsEl);
    return card;
  }
  function cardOverlay(card) {
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "6000",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      pointerEvents: "none",
      background: "rgba(0,0,0,0.45)"
    });
    overlay.appendChild(card);
    return overlay;
  }
  function copyReport(fields) {
    void copyText(buildErrorReport(fields)).then((ok) => {
      if (!ok) cclog("copy failed", "health");
    });
  }
  var bootCardShown = false;
  var bootCardDismissed = false;
  function showBootCard(code, display, error, stack) {
    if (bootCardShown || bootCardDismissed) return;
    bootCardShown = true;
    const text = display + "\n\n" + CARD_BOOT_RUNS_ON;
    const overlay = cardOverlay(
      buildCardEl(CARD_BOOT_TITLE, text, [
        {
          label: ACTION_COPY_DETAILS,
          onClick: () => copyReport(reportFields("boot", code, error, stack))
        },
        {
          label: ACTION_CONTINUE_CHAT,
          onClick: () => {
            bootCardDismissed = true;
            overlay.remove();
          }
        }
      ])
    );
    document.body.appendChild(overlay);
  }
  function handleBootFailure(err) {
    const code = bootErrorCode(err);
    const display = bootDisplayFor(code) ?? (err instanceof Error ? err.message : String(err));
    cclog("boot failure: " + code + " (" + display + ")", "health");
    const error = err instanceof Error ? err.name + ": " + err.message : String(err);
    const stack = err instanceof Error ? err.stack || null : null;
    showBootCard(code, display, error, stack);
    reportBootError(code);
  }
  function mountHealthUi() {
    let dismissed = false;
    let veil = null;
    react("conn", (conn) => {
      if (!shouldShowCritical(conn, dismissed) || veil) return;
      const dismiss = () => {
        dismissed = true;
        veil?.remove();
        veil = null;
      };
      veil = document.createElement("div");
      veil.className = "bcc-health-veil";
      veil.appendChild(
        buildCardEl(CARD_AUTHDEAD_TITLE, CARD_AUTHDEAD_TEXT, [
          { label: ACTION_PAGE_RELOAD, onClick: reloadChat },
          { label: ACTION_LATER, onClick: dismiss }
        ])
      );
      const main = document.querySelector(".bcc-main");
      if (main) {
        main.appendChild(veil);
      }
    });
    let sendBrokenShown = false;
    let sendBrokenDismissed = false;
    react("bccHealth", (h) => {
      const health = h;
      if (health.bootError) {
        const display = bootDisplayFor(health.bootError);
        if (display) showBootCard(health.bootError, display, null, null);
      }
      if (!health.sendPathBroken || sendBrokenShown || sendBrokenDismissed) return;
      sendBrokenShown = true;
      const overlay = cardOverlay(
        buildCardEl(CARD_SEND_BROKEN_TITLE, CARD_SEND_BROKEN_TEXT, [
          {
            label: ACTION_COPY_ERROR,
            onClick: () => copyReport(reportFields("send-path", "send-path-broken", health.sendPathBroken, null))
          },
          {
            label: ACTION_LATER,
            onClick: () => {
              sendBrokenDismissed = true;
              overlay.remove();
            }
          }
        ])
      );
      document.body.appendChild(overlay);
    });
  }
  function buildStaleMarker() {
    const span = document.createElement("span");
    span.className = "bcc-stale-marker";
    const icon = document.createElement("i");
    icon.className = "fas fa-clock";
    icon.setAttribute("aria-hidden", "true");
    span.appendChild(icon);
    return span;
  }
  function renderStaleMarkers(ulistEl, awEl, statsEl, f) {
    const m = staleMarkers(f, Date.now());
    setMarker(ulistEl, m.ulist, STALE_LABEL_ULIST);
    setMarker(awEl, m.aw, STALE_LABEL_AW);
    setMarker(statsEl, m.stats, STALE_LABEL_STATS);
    armRefresh(ulistEl, awEl, statsEl, f);
  }
  function setMarker(el, ageMs, label) {
    const stale2 = ageMs !== null;
    const title = stale2 ? staleText(label, ageMs) : null;
    if (el.classList.contains("bcc-stale-visible") === stale2 && el.title === (title ?? "")) {
      return;
    }
    el.classList.toggle("bcc-stale-visible", stale2);
    if (title === null) {
      el.removeAttribute("title");
      el.removeAttribute("aria-label");
    } else {
      el.title = title;
      el.setAttribute("aria-label", title);
    }
  }
  var refreshTimer = null;
  function armRefresh(ulistEl, awEl, statsEl, f) {
    if (refreshTimer !== null) clearTimeout(refreshTimer);
    refreshTimer = null;
    const at = nextStaleChange(f, Date.now());
    if (at === null) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      renderStaleMarkers(ulistEl, awEl, statsEl, f);
    }, at - Date.now());
  }
  function mountStaleMarkers() {
    const onlineRow = document.querySelector(".bcc-online-row");
    const statsBar2 = document.querySelector(".bcc-stats");
    const ulistMarker = buildStaleMarker();
    const awMarker = buildStaleMarker();
    const statsMarker = buildStaleMarker();
    onlineRow?.append(ulistMarker, awMarker);
    statsBar2?.appendChild(statsMarker);
    react(
      "freshness",
      (f) => renderStaleMarkers(ulistMarker, awMarker, statsMarker, f)
    );
    renderStaleMarkers(ulistMarker, awMarker, statsMarker, get("freshness"));
  }

  // src/init.ts
  function neuterResizeFix() {
    unsafeWindow.resize_fix = function resize_fix() {
      return true;
    };
    clearTimeout(unsafeWindow.size_timeout);
    clearInterval(unsafeWindow.size_interval);
  }
  function neuterGetInfo() {
    clearTimeout(unsafeWindow.info_timer1);
    unsafeWindow.get_info = function get_info() {
    };
  }
  var booted = false;
  async function initV3() {
    if (booted) return;
    booted = true;
    await initStore();
    cclog("v3 init (parent-page rewrite, iteration 1)");
    const v3Css = GM_getResourceText("v3_css");
    if (v3Css) GM_addStyle(v3Css);
    neuterResizeFix();
    initSession();
    initHealth();
    unsafeWindow.bettercc.reloadChat = reloadChat;
    unsafeWindow.bettercc.state = snapshot;
    buildShell();
    initTheme();
    unsafeWindow.bettercc.setTheme = applyCurrentScheme;
    hookChatoutConnect();
    mountSidebar();
    startUlistPoll();
    neuterGetInfo();
    {
      let lastChannel = getSession().channel;
      on("session", (s) => {
        if (s.authDead) {
          stopUlistPoll();
        } else if (s.channel !== lastChannel) {
          lastChannel = s.channel;
          refreshUlistNow();
        }
      });
    }
    unsafeWindow.bettercc.refreshUlistNow = refreshUlistNow;
    startPolling();
    on("session", (s) => {
      if (s.authDead) stopPolling();
    });
    mountStatsBar(document.querySelector(".bcc-sidebar"));
    mountInput();
    mountFooter();
    mountHealthUi();
    mountHealthStrip(reloadChat);
    initSettingsNotices();
    initSetStatusWrap();
    mountStaleMarkers();
  }

  // src/index.ts
  (function() {
    "use strict";
    cclog("Version: " + GM_info.script.version + " - " + window.location.href);
    unsafeWindow.bettercc = {};
    if (/cpop.html/.test(window.location.href)) {
      window.onunload = null;
      window.onbeforeunload = null;
      setUserStore(getChatNick(), isGuest());
      initV3().catch(handleBootFailure);
    }
  })();
})();

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

