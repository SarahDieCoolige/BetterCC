// ==UserScript==
// @name  BetterCC (alpha)
// @description  BetterCC v3 alpha
// @author  Sarah
// @version      3.7.0
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
// @resource  iframe_css  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/v3/css/iframe.css?r=7a7d02e8
// @resource  v3_css  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/v3/css/v3.css?r=cd95a85e
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
  // src/utils.ts
  function cclog(str, tag = "BetterCC") {
    GM_log(tag + " - " + str);
  }
  function printHelp() {
    printToChat(
      "/w Nick        \u2013 einmalig fl\xFCstern\n/sw Nick       \u2013 dauerhaft fl\xFCstern\n/open          \u2013 superwhisper beenden\n/ignore Nick    \u2013 benutzer ignorieren\n/id Nick        \u2013 ID-Karte \xF6ffnen\n/pinned         \u2013 angeheftete Benutzer anzeigen\n/color          \u2013 Thema-Farbe anzeigen\n/scheme         \u2013 Scheme-Version anzeigen\n/settings       \u2013 alle Einstellungen anzeigen\n/reload         \u2013 Chat neu laden\n/help           \u2013 diese Hilfe"
    );
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

  // src/chat.ts
  function addAutoscrollBanner(iframeDoc, iframeWin) {
    if (!iframeDoc || !iframeWin) return;
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

  // src/ws-hook.ts
  var upstreamChatoutConnect = null;
  var upstreamOnMessage = null;
  var injected = false;
  var INJECTION_RETRY_MS = 50;
  var MAX_INJECTION_RETRIES = 50;
  var injectionRetries = 0;
  var _iframeMousedownBody = null;
  function injectIntoChatframe() {
    const doc = getChatDoc();
    const win = getChatWin();
    if (!doc || !win || !doc.body) {
      if (injectionRetries++ < MAX_INJECTION_RETRIES) {
        setTimeout(injectIntoChatframe, INJECTION_RETRY_MS);
      }
      return;
    }
    injectionRetries = 0;
    const iframeCss = GM_getResourceText("iframe_css");
    if (iframeCss) {
      const style = doc.createElement("style");
      style.textContent = iframeCss;
      if (doc.head) {
        doc.head.appendChild(style);
      } else {
        const head = doc.createElement("head");
        head.appendChild(style);
        doc.documentElement.insertBefore(head, doc.body);
      }
    }
    if (typeof unsafeWindow.bettercc?.setTheme === "function") {
      unsafeWindow.bettercc.setTheme();
    }
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
    cclog("injectIntoChatframe: injection complete");
  }
  function betterccOnWsMessage(ev) {
    if (typeof upstreamOnMessage === "function") {
      try {
        upstreamOnMessage.call(unsafeWindow.chatout_ws, ev);
      } catch (e) {
        cclog("betterccOnWsMessage: upstream onmessage threw \u2014 " + e.message, "ws-hook");
      }
    }
    if (!injected) {
      injectIntoChatframe();
      injected = true;
    }
    const doc = getChatDoc();
    if (doc && doc.body) {
      doc.body.style.setProperty("background-color", "var(--chatBackground)");
      doc.body.style.setProperty("color", "var(--chatText)");
    }
  }
  function betterccOnWsClose() {
  }
  function attachWsListeners() {
    if (unsafeWindow.chatout_ws) {
      upstreamOnMessage = unsafeWindow.chatout_ws.onmessage;
      unsafeWindow.chatout_ws.onmessage = betterccOnWsMessage;
      unsafeWindow.chatout_ws.addEventListener("close", betterccOnWsClose);
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
    }
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
  function getChatId() {
    return String(unsafeWindow.chat_id ?? "");
  }
  function getChatSid() {
    return String(unsafeWindow.chat_sid ?? "");
  }
  function getPChat() {
    return String(unsafeWindow.PCHAT ?? "");
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
  function leaveChat() {
    sendCommand("/bye");
    setTimeout(() => window.close(), 1e3);
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
  function isV2Scheme() {
    return _v2;
  }
  var generateScheme3 = (base, opts) => _v2 ? generateScheme2(base, opts) : generateScheme(base, opts);

  // src/config.ts
  var DEFAULTS = {
    color: "6AAED8",
    colorscheme: null,
    // regenerated from color on load (theme bridge T3)
    ban: [],
    pinned: [],
    whisper: "",
    // "" = no superwhisper target
    scheme_v2: false,
    compact: ""
    // "" = chatbar expanded; "1" = compact mode
  };
  async function getConfig(key, fallback) {
    const def = fallback ?? DEFAULTS[key];
    return await GM.getValue(getUserKey(key), def);
  }
  async function setConfig(key, value) {
    await GM.setValue(getUserKey(key), value);
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
  function schemeToStorage(scheme) {
    return { ...scheme };
  }
  function matchesStoredBase(stored, baseHex) {
    if (!stored || typeof stored.bgHex !== "string") return false;
    return stored.bgHex.toUpperCase() === baseHex.toUpperCase();
  }
  function applyScheme(scheme) {
    const target = document.querySelector(".bcc-shell");
    const root = target ?? document.documentElement;
    for (const [varName, value] of Object.entries(schemeToCssVars(scheme))) {
      root.style.setProperty(varName, value);
    }
    applyThemeToIframe("#" + scheme.surface, "#" + scheme.text);
  }
  async function saveColor(baseHex, colorKey, schemeKey) {
    await GM.setValue(colorKey, baseHex);
    const scheme = generateScheme3(baseHex);
    await GM.setValue(schemeKey, schemeToStorage(scheme));
    applyScheme(scheme);
    return scheme;
  }
  async function loadTheme(colorKey, schemeKey, defaultBase = "6AAED8") {
    const base = await GM.getValue(colorKey, defaultBase);
    await GM.setValue(colorKey, base);
    const stored = await GM.getValue(schemeKey, null);
    if (matchesStoredBase(stored, base) && stored) {
      applyScheme(stored);
      return stored;
    }
    const scheme = generateScheme3(base);
    await GM.setValue(schemeKey, schemeToStorage(scheme));
    applyScheme(scheme);
    return scheme;
  }
  async function toggleSchemeVersion() {
    const currentV2 = await getConfig("scheme_v2", false);
    const nextV2 = !currentV2;
    await setConfig("scheme_v2", nextV2);
    if (nextV2) enableV2Scheme();
    else disableV2Scheme();
    const base = await getConfig("color", "6AAED8");
    const scheme = generateScheme3(base);
    const schemeKey = getUserKey("colorscheme");
    await GM.setValue(schemeKey, schemeToStorage(scheme));
    applyScheme(scheme);
  }
  function getSchemeVersion() {
    return isV2Scheme();
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

  // src/store.ts
  var listeners = /* @__PURE__ */ new Set();
  function subscribe(fn) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }
  function emit(e) {
    for (const fn of listeners) fn(e);
  }

  // src/ulist-poll.ts
  var chatId = "";
  var chatSid = "";
  var pchatBase = "";
  var prevList = [];
  var timerId;
  var running = false;
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
  var JITTER_PCT = 0.2;
  async function pollOnce() {
    try {
      const url = pchatBase + "/ulist?AKTION=j&ID=" + chatId + "&SID=" + chatSid + "&x=" + Math.random();
      const resp = await fetch(url);
      const text = await resp.text();
      const chaMy = parseUlistResponse(text);
      if (chaMy.length === 0 && prevList.length > 0) return;
      const { newList, added, removed } = processUserlist(chaMy, prevList);
      prevList = newList;
      emit({ type: "userlist", users: newList, added, removed });
    } catch {
    }
  }
  function scheduleNext(intervalMs) {
    const jitter = (Math.random() - 0.5) * 2 * intervalMs * JITTER_PCT;
    timerId = setTimeout(() => {
      pollOnce().finally(() => {
        if (running) scheduleNext(intervalMs);
      });
    }, intervalMs + jitter);
  }
  function startUlistPoll(intervalMs = 2e4) {
    chatId = getChatId();
    chatSid = getChatSid();
    pchatBase = getPChat();
    if (running) return;
    running = true;
    pollOnce().finally(() => {
      if (running) scheduleNext(intervalMs);
    });
    cclog("ulist-poll gestartet \u2014 alle ~" + intervalMs + " ms", "v3");
  }
  function stopUlistPoll() {
    if (timerId !== void 0) clearTimeout(timerId);
    timerId = void 0;
    running = false;
  }
  function refreshUlistNow(intervalMs = 2e4) {
    if (timerId !== void 0) clearTimeout(timerId);
    pollOnce().finally(() => {
      if (running) scheduleNext(intervalMs);
    });
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
  var JITTER_PCT2 = 0.2;
  async function pollOnce2() {
    try {
      const raw = await fetchAw();
      const next = parseAw(raw);
      if (next.size === 0 && lastSnapshot.size > 0) return;
      const { added, removed } = diffGlobal(lastSnapshot, next);
      lastSnapshot = next;
      emit({ type: "globalUserlist", channels: next, added, removed });
    } catch {
    }
  }
  function scheduleNext2(intervalMs) {
    const jitter = (Math.random() - 0.5) * 2 * intervalMs * JITTER_PCT2;
    timerId2 = setTimeout(() => {
      pollOnce2().finally(() => {
        if (running2) scheduleNext2(intervalMs);
      });
    }, intervalMs + jitter);
  }
  function startPolling(intervalMs) {
    if (running2) return;
    running2 = true;
    pollOnce2().finally(() => {
      if (running2) scheduleNext2(intervalMs);
    });
    cclog("Globaler Userlist-Poll gestartet \u2014 aw.js alle ~" + intervalMs + " ms", "v3");
  }
  function stopPolling() {
    if (timerId2 !== void 0) clearTimeout(timerId2);
    timerId2 = void 0;
    running2 = false;
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
  function nickToHue(nick) {
    let sum = 0;
    for (let i = 0; i < nick.length; i++) {
      sum += nick.charCodeAt(i);
    }
    return sum % 360;
  }
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
    const avatar = document.createElement("div");
    avatar.className = "bcc-popup-avatar";
    avatar.textContent = userName[0]?.toUpperCase() ?? "?";
    avatar.style.background = "hsl(" + nickToHue(userName) + ", 45%, 55%)";
    container.appendChild(avatar);
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
    unsubscribeStore = subscribe((e) => {
      if (e.type === "config" && e.key === "pinned") {
        getConfig("pinned", []).then((pinned) => {
          if (!openPopup) return;
          const nowPinned = pinned.includes(user.key);
          updatePinButton(pinBtn, nowPinned);
        }).catch(() => {
        });
      }
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
  var session;
  var timer = null;
  function initSession() {
    if (timer) clearInterval(timer);
    session = {
      nick: getChatNick(),
      registered: getChatUi().includes("R"),
      guest: getChatUi().includes("h") && !getChatUi().includes("R"),
      userId: getChatId(),
      sessionId: getChatSid(),
      channel: getChannel(),
      authDead: isAuthDead()
    };
    emit({ type: "session", session: { ...session } });
    let prevChannel = session.channel;
    let prevAuthDead = session.authDead;
    timer = setInterval(() => {
      const newChannel = getChannel();
      const newAuthDead = isAuthDead();
      if (newChannel !== prevChannel || newAuthDead !== prevAuthDead) {
        prevChannel = session.channel = newChannel;
        prevAuthDead = session.authDead = newAuthDead;
        emit({ type: "session", session: { ...session } });
      }
    }, 2e3);
    cclog("session: init done \u2014 nick=" + session.nick + " channel=" + session.channel, "v3");
  }
  function getSession() {
    return session;
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
    subscribe((e) => {
      if (e.type === "session" && e.session.channel) {
        const lower = e.session.channel.toLowerCase();
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
  async function refreshPinned() {
    const list = await getConfig("pinned", []);
    pinnedCache = new Set(list);
  }
  async function togglePin(user) {
    const list = await getConfig("pinned", []);
    const idx = list.indexOf(user.key);
    if (idx === -1) {
      list.push(user.key);
    } else {
      list.splice(idx, 1);
    }
    await setConfig("pinned", list);
    emit({ type: "config", key: "pinned" });
    pinnedCache = new Set(list);
    renderFromState();
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
    subscribe((e) => {
      if (e.type === "session" && e.session.channel && channelFace.isConnected) {
        channelFace.textContent = e.session.channel;
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
    refreshPinned().catch(() => {
      cclog("mountSidebar: failed to read pinned config", "v3");
    });
    subscribe((e) => {
      if (e.type === "userlist") {
        lastChannelUsers = e.users;
        renderFromState();
      } else if (e.type === "globalUserlist") {
        lastGlobalChannels = e.channels;
        let total = 0;
        for (const users of e.channels.values()) total += users.length;
        globalTotal = total;
        renderFromState();
      }
    });
    cclog("sidebar mounted \u2014 subscribed to userlist + globalUserlist events", "v3");
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
  var POLL_INTERVAL_MS = 1e4;
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
            renderStats(parseStats(transport?.responseText ?? ""));
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
    pollTimer = window.setInterval(pollOnce3, POLL_INTERVAL_MS);
    window.addEventListener("beforeunload", () => {
      if (pollTimer !== null) window.clearInterval(pollTimer);
    });
  }

  // src/commands.ts
  var openMsgCmdRegex = /^\/open\s|^\/o\s/;
  var openMsgReplaceRegex = /^\/open\s+|^\/o\s+/gi;
  var superbanMsgCmdRegex = /^\/superban\s|^\/sb\s/;
  var superbanMsgReplaceRegex = /^\/superban\s+|^\/sb\s+/gi;
  var superwhisperMsgCmdRegex = /^\/superwhisper\s|^\/sw\s/;
  var superwhisperMsgReplaceRegex = /^\/superwhisper\s+|^\/sw\s+/gi;
  var idMsgCmdRegex = /^\/id\b/i;
  var idMsgArgRegex = /^\/id\s+/i;
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
  function renderState(el, state) {
    el.innerHTML = "";
    const div = document.createElement("div");
    div.className = "bcc-id-" + state;
    if (state === "loading") div.textContent = "Wird geladen...";
    else if (state === "error") div.textContent = "Fehler beim Laden.";
    else if (state === "empty") div.textContent = "Kein Ergebnis gefunden.";
    el.appendChild(div);
  }
  function renderResults(el, rows, searchTerm) {
    el.innerHTML = "";
    for (const row of rows) {
      const rowEl = document.createElement("div");
      rowEl.className = "bcc-id-row";
      if (row.imgUrl) {
        const fullUrl = stripThumbnailSuffix(row.imgUrl);
        const hasPhoto = !/default/i.test(fullUrl);
        const showPreview = hasPhoto && fullUrl !== row.imgUrl;
        const thumb = document.createElement("img");
        thumb.src = row.imgUrl;
        thumb.className = "bcc-id-thumb";
        thumb.setAttribute("alt", "");
        if (showPreview) {
          thumb.addEventListener("mouseenter", () => {
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

  // src/input.ts
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
          case "id":
            buildIdPopup(cmd.name || "");
            break;
          case "pinned-list":
            getConfig("pinned", []).then(
              (list) => printToChat(
                list.length ? "Angepinnt: " + list.join(", ") : "Keine angepinnten Benutzer."
              )
            );
            break;
          case "color-info":
            getConfig("color", "").then((c) => {
              const hex = String(c).replace(/^#/, "");
              const swatch = '<span style="display:inline-block;width:24px;height:24px;background:#' + hex + ';border-radius:4px;vertical-align:middle;margin:0 4px 0 2px;box-shadow:0 2px 4px rgba(0,0,0,0.25)"></span>';
              printToChat("Thema-Farbe: " + swatch + "#" + hex);
            });
            break;
          case "scheme-info":
            Promise.all([getConfig("scheme_v2", false), getConfig("colorscheme", null)]).then(
              ([v2, scheme]) => {
                const rows = [];
                if (scheme) {
                  for (const [k, v] of Object.entries(scheme)) {
                    const hex = String(v).replace(/^#/, "");
                    const swatch = '<span style="display:inline-block;width:24px;height:24px;background:#' + hex + ';border-radius:4px;vertical-align:middle;box-shadow:0 2px 4px rgba(0,0,0,0.25)"></span>';
                    rows.push(
                      '<tr><td style="padding:2px 8px 2px 0">' + swatch + '</td><td style="padding-right:6px">' + k + "</td><td>#" + hex + "</td></tr>"
                    );
                  }
                }
                rows.push(
                  '<tr><td colspan="3" style="padding-top:6px;opacity:0.6">Generator: ' + (v2 ? "v2 (experimentell)" : "v1") + "</td></tr>"
                );
                printToChat(
                  '<table style="border-collapse:collapse;font:inherit;color:inherit">' + rows.join("") + "</table>"
                );
              }
            );
            break;
          case "settings":
            Promise.all([
              getConfig("pinned", []),
              getConfig("color", ""),
              getConfig("scheme_v2", false)
            ]).then(([pinned, color, v2]) => {
              const pinnedLine = pinned.length ? "Angepinnt: " + pinned.join(", ") : "Keine angepinnten Benutzer.";
              const cHex = String(color).replace(/^#/, "");
              const swatch = '<span style="display:inline-block;width:24px;height:24px;background:#' + cHex + ';border-radius:4px;vertical-align:middle;margin:0 4px 0 2px;box-shadow:0 2px 4px rgba(0,0,0,0.25)"></span>';
              const colorLine = "Thema-Farbe: " + swatch + "#" + cHex;
              const schemeLine = "Scheme-Generator: " + (v2 ? "v2 (experimentell)" : "v1");
              printToChat(pinnedLine + "\n" + colorLine + "\n" + schemeLine);
            });
            break;
        }
      }
      clearInput(docHold);
      return;
    }
    if (onSubmitOrig && decision.message) {
      docHold.OUT1.value = decision.message;
      onSubmitOrig();
    }
    if (textarea) textarea.value = "";
  }
  function clearInput(docHold) {
    docHold.OUT1.value = "";
    if (textarea) textarea.value = "";
  }
  function prefillWhisper(nick) {
    if (!textarea) return;
    textarea.value = "/w " + nick + " ";
    textarea.focus();
    const end = textarea.value.length;
    textarea.setSelectionRange(end, end);
  }
  async function superwhisper(whispernick, toggle = true) {
    const prevNick = await getConfig("whisper", "");
    if (toggle && whispernick && prevNick.toLowerCase() === whispernick.toLowerCase() || !whispernick) {
      await setConfig("whisper", "");
      currentWhisperNick = "";
      if (textarea) {
        textarea.classList.remove("bcc-superwhisper");
        updatePlaceholder();
      }
    } else {
      await setConfig("whisper", whispernick);
      currentWhisperNick = whispernick;
      if (textarea) {
        textarea.classList.add("bcc-superwhisper");
        updatePlaceholder();
      }
    }
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
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        doSubmit();
      }
    });
    inputArea.appendChild(textarea);
    const holdForm = document.querySelector('form[name="hold"]');
    try {
      onSubmitOrig = buildPatchedHandler(holdForm);
    } catch (e) {
      cclog("mountInput: " + e.message, "v3");
    }
    unsafeWindow.bettercc.onSubmit = doSubmit;
    unsafeWindow.bettercc.superwhisper = superwhisper;
    unsafeWindow.bettercc.prefillWhisper = prefillWhisper;
    unsafeWindow.bettercc.updatePlaceholder = updatePlaceholder;
    getConfig("whisper", "").then((nick) => {
      const n = nick || "";
      if (n) superwhisper(n, false);
    });
    if (textarea) textarea.focus();
    updatePlaceholder();
    cclog("input mounted \u2014 textarea + whisper indicator + send contract", "v3");
  }
  function updatePlaceholder() {
    if (!textarea) return;
    const chatbar = document.querySelector(".bcc-chatbar");
    const compact = chatbar?.classList.contains("bcc-compact");
    if (currentWhisperNick) {
      textarea.placeholder = compact ? placeholderCompactFor(currentWhisperNick) : placeholderFor(currentWhisperNick);
    } else {
      textarea.placeholder = compact ? PLACEHOLDER_COMPACT_ALL : PLACEHOLDER_ALL;
    }
  }

  // src/footer.ts
  var reloadButtons = [];
  function trackReloadButton(btn) {
    reloadButtons.push(btn);
    return btn;
  }
  function iconBtn(iconClass, title, onClick) {
    const btn = actionButton({ iconClass, title, onClick });
    const isBnClass = /^b\d+$/.test(iconClass);
    btn.className = isBnClass ? "bcc-icon-btn " + iconClass : "bcc-icon-btn";
    return btn;
  }
  function pill(columns, extraClass, ...children) {
    const p = document.createElement("div");
    p.className = columns > 0 ? "bcc-pill bcc-pill-" + columns : "bcc-pill";
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
    return iconBtn("fa-sync", "Chat neu laden", () => {
      unsafeWindow.bettercc.reloadChat();
    });
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
      saveColor(hex, getUserKey("color"), getUserKey("colorscheme")).catch((e) => {
        cclog("color swatch: saveColor failed \u2014 " + e.message, "v3");
      });
    });
    getConfig("color", "6AAED8").then((hex) => {
      const input = picker.querySelector("input");
      input.value = "#" + String(hex).replace(/^#/, "");
      picker.style.setProperty("--swatch-color", input.value);
    });
    return picker;
  }
  function buildChatPill() {
    const awayBtn = iconBtn("b2", "Away (/away)", () => sendCommand("/away"));
    const backBtn = iconBtn("b3", "Zur\xFCck (/awayoff)", () => sendCommand("/awayoff"));
    const autoscrollBtn = buildAutoscrollBtn();
    const reloadBtn = trackReloadButton(buildReloadBtn());
    awayBtn.classList.add("bcc-keep");
    backBtn.classList.add("bcc-keep");
    autoscrollBtn.classList.add("bcc-keep");
    reloadBtn.classList.add("bcc-keep");
    return pill(
      4,
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
      const v2 = getSchemeVersion();
      schemeToggle.title = v2 ? "Scheme v2 \u2014 klick f\xFCr v1" : "Scheme v1 \u2014 klick f\xFCr v2";
      schemeToggle.setAttribute("aria-label", schemeToggle.title);
      schemeToggle.innerHTML = '<span style="font-size:10px;font-weight:700">' + (v2 ? "v2" : "v1") + "</span>";
    };
    updateToggle();
    schemeToggle.addEventListener("click", async (e) => {
      e.stopPropagation();
      schemeToggle.style.pointerEvents = "none";
      await toggleSchemeVersion();
      updateToggle();
      schemeToggle.style.pointerEvents = "";
    });
    return pill(
      2,
      "bcc-bettercc",
      buildColorSwatch(),
      iconBtn("fa-cog", "Einstellungen", () => {
        cclog("settings clicked \u2014 stub (T10)", "v3");
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
    return pill(2, "bcc-links", id, forum, nickColor, help);
  }
  function buildExitBtn() {
    const btn = iconBtn("b7", "Verlassen", () => leaveChat());
    btn.classList.add("bcc-danger");
    return btn;
  }
  function patchSetStatus() {
    const w = unsafeWindow;
    if (typeof w.chatout_setstatus !== "function") return;
    const orig = w.chatout_setstatus;
    w.chatout_setstatus = function(text, color, bold) {
      for (const btn of reloadButtons) {
        btn.style.color = color || "#888";
        btn.title = "Chat neu laden \u2014 " + text;
      }
      orig.call(this, text, color, bold);
    };
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
  function buildCompactToggle() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bcc-compact-toggle";
    btn.title = "Chatbar komprimieren";
    btn.setAttribute("aria-label", "Chatbar komprimieren");
    btn.innerHTML = '<i class="fas fa-chevron-down"></i>';
    btn.addEventListener("click", async () => {
      const chatbar = document.querySelector(".bcc-chatbar");
      if (!chatbar) return;
      const compact = chatbar.classList.toggle("bcc-compact");
      setToggleState(btn, compact);
      updatePlaceholder();
      await setConfig("compact", compact ? "1" : "");
    });
    return btn;
  }
  function mountFooter() {
    const chatbar = document.querySelector(".bcc-chatbar");
    if (!chatbar) return;
    injectFontAwesome();
    const firstPill = chatbar.querySelector(".bcc-chat");
    if (firstPill) {
      chatbar.insertBefore(buildCompactToggle(), firstPill);
    } else {
      chatbar.append(buildCompactToggle());
    }
    chatbar.append(buildChatPill(), buildBetterccPill(), buildLinksPill(), buildExitBtn());
    const headerReload = document.querySelector(".bcc-reload");
    if (headerReload) trackReloadButton(headerReload);
    patchSetStatus();
    cclog("footer mounted \u2014 pill groups + FA + setstatus patch", "v3");
    getConfig("compact", "").then((v) => {
      if (v) {
        chatbar.classList.add("bcc-compact");
        const toggle = chatbar.querySelector(".bcc-compact-toggle");
        if (toggle) setToggleState(toggle, true);
        updatePlaceholder();
      }
    });
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
  function initV3() {
    cclog("v3 init (parent-page rewrite, iteration 1)");
    const v3Css = GM_getResourceText("v3_css");
    if (v3Css) GM_addStyle(v3Css);
    neuterResizeFix();
    initSession();
    unsafeWindow.bettercc.reloadChat = reloadChat;
    buildShell();
    const schemePromise = getConfig("scheme_v2").then((v2) => {
      if (v2) enableV2Scheme();
      return loadTheme(getUserKey("color"), getUserKey("colorscheme"));
    });
    unsafeWindow.bettercc.setTheme = function setTheme() {
      schemePromise.then((scheme) => applyScheme(scheme));
    };
    hookChatoutConnect();
    mountSidebar();
    startUlistPoll(2e4);
    neuterGetInfo();
    {
      let lastChannel = getSession().channel;
      subscribe((e) => {
        if (e.type !== "session") return;
        if (e.session.authDead) {
          stopUlistPoll();
        } else if (e.session.channel !== lastChannel) {
          lastChannel = e.session.channel;
          refreshUlistNow();
        }
      });
    }
    unsafeWindow.bettercc.refreshUlistNow = refreshUlistNow;
    startPolling(5e3);
    subscribe((e) => {
      if (e.type === "session" && e.session.authDead) stopPolling();
    });
    mountStatsBar(document.querySelector(".bcc-sidebar"));
    mountInput();
    mountFooter();
  }

  // src/index.ts
  (function() {
    "use strict";
    cclog("Version: " + GM_info.script.version + " - " + window.location.href);
    unsafeWindow.bettercc = {};
    if (/cpop.html/.test(window.location.href)) {
      window.onunload = null;
      window.onbeforeunload = null;
      let gast = unsafeWindow.chat_ui === "h" ? 1 : 0;
      setUserStore(unsafeWindow.chat_nick, !!gast);
      initV3();
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

