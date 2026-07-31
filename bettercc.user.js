// ==UserScript==
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
// @resource  v3_css  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/modernize/css/v3.css?r=2.0.4
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

"use strict";
(() => {
  // src/utils.ts
  var superbanEnable = 1;
  var replaceInputFieldEnable = 1;
  var noChatBackgroundsEnable = 1;
  var NotificationsEnable = 1;
  var betterUserListEnable = 0;
  function cclog(str, tag = "BetterCC") {
    GM_log(tag + " - " + str);
  }
  function ccnotify(message, title = "", tag = "", timeout = 3e3) {
    if (NotificationsEnable) {
      GM_notification({
        title: "BetterCC " + title,
        text: message,
        tag,
        timeout,
        silent: true,
        onclick: () => {
          window.event?.preventDefault();
          cclog("Notification clicked.");
          window.focus();
        }
      });
    }
  }
  var helptxtNotify = [
    "/sw sariam - sw an",
    "/o hi all :) - ins open",
    "/open - sw aus",
    "/sb wendigo - superignore an/aus",
    "/superban - banliste",
    "/reload - chat neu laden",
    "/settings - einstellungen",
    "/help - hilfe"
  ].join("\n");
  function printHelp() {
    ccnotify(helptxtNotify, "Hilfe", "help");
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
  function applyThemeToIframe(bgColor, fgColor) {
    const doc = getChatDoc();
    if (!doc) return;
    const root = doc.documentElement;
    root.style.setProperty("--chatBackground", bgColor);
    root.style.setProperty("--chatText", fgColor);
    doc.body.style.backgroundColor = "var(--chatBackground)";
    doc.body.style.color = "var(--chatText)";
  }
  var userStore = "";
  function getUserKey(key) {
    return `${key}_${userStore}`;
  }
  function setUserStore(nick, isGast) {
    userStore = isGast ? "gast" : nick.toLowerCase();
  }
  function waitForElements(selector, callback, once, intervalMs) {
    const existing = document.querySelectorAll(selector);
    existing.forEach((el) => callback(el));
    if (once && existing.length > 0) return;
    const observer = new MutationObserver(() => {
      const matches = document.querySelectorAll(selector);
      if (matches.length > 0) {
        for (let i = 0; i < matches.length; i++) {
          callback(matches[i]);
        }
        if (once) {
          observer.disconnect();
        }
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    if (!once && intervalMs > 0) {
      setInterval(() => {
        const matches = document.querySelectorAll(selector);
        for (let i = 0; i < matches.length; i++) {
          callback(matches[i]);
        }
      }, intervalMs);
    }
  }

  // src/v3/flag.ts
  function shouldUseV3(storedFlag, url) {
    if (isTruthy(storedFlag)) return true;
    try {
      const parsed = new URL(url, "http://localhost");
      return parsed.searchParams.get("bcc") === "new";
    } catch {
      return false;
    }
  }
  function isTruthy(v) {
    return v === true || v === 1 || v === "1";
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
  var chatframeReady = false;
  var upstreamChatoutConnect = null;
  function injectIntoChatframe() {
    const doc = getChatDoc();
    const win = getChatWin();
    if (!doc || !win) {
      cclog("injectIntoChatframe: iframe not ready, will retry on next message");
      chatframeReady = false;
      return;
    }
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
    if (doc.body) {
      doc.body.style.setProperty("background-color", "var(--chatBackground)");
      doc.body.style.setProperty("color", "var(--chatText)");
    }
    addAutoscrollBanner(doc, win);
    chatframeReady = true;
    cclog("injectIntoChatframe: injection complete");
  }
  function betterccOnWsMessage(ev) {
    if (!chatframeReady) {
      injectIntoChatframe();
    }
  }
  function betterccOnBccInit(_ev) {
    if (!chatframeReady) {
      injectIntoChatframe();
    }
  }
  function betterccOnWsClose() {
  }
  function attachWsListeners() {
    if (unsafeWindow.chatout_ws) {
      unsafeWindow.chatout_ws.addEventListener(
        "message",
        betterccOnWsMessage
      );
      unsafeWindow.chatout_ws.addEventListener(
        "bcc-init",
        betterccOnBccInit
      );
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

  // src/v3/store.ts
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

  // src/v3/shell.ts
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
    const header = document.createElement("header");
    header.className = "bcc-header";
    header.appendChild(buildChannelLabel());
    header.appendChild(buildReloadButton());
    const sidebar = document.createElement("aside");
    sidebar.className = "bcc-sidebar";
    sidebar.innerHTML = '<div class="bcc-sidebar-placeholder">Userlist (T7)</div>';
    const main = document.createElement("main");
    main.className = "bcc-main";
    main.appendChild(chatframe);
    const inputArea = document.createElement("div");
    inputArea.className = "bcc-input";
    inputArea.innerHTML = '<div class="bcc-input-placeholder">Input (T8)</div>';
    const footer = document.createElement("footer");
    footer.className = "bcc-footer";
    footer.innerHTML = '<div class="bcc-footer-placeholder">Footer (T9)</div>';
    shell.append(header, sidebar, main, inputArea, footer);
    document.body.appendChild(shell);
    table.style.display = "none";
    cclog("v3 shell built \u2014 chatframe moved, table hidden", "v3");
    return true;
  }
  function buildChannelLabel() {
    const label = document.createElement("span");
    label.className = "bcc-channel";
    const channel = unsafeWindow.chat_channel;
    label.textContent = channel ? String(channel) : "Chatcity";
    label.title = "Channel";
    subscribe((e) => {
      if (e.type === "session") {
        label.textContent = e.session.channel || "Chatcity";
      }
    });
    return label;
  }
  function buildReloadButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bcc-reload";
    btn.title = "Chat neu laden (mimimi)";
    btn.textContent = "\u21BB";
    btn.addEventListener("click", () => {
      unsafeWindow.bettercc.reloadChat();
    });
    return btn;
  }
  function reloadChat() {
    if (unsafeWindow.chatout_auth_dead) {
      cclog("reloadChat: auth_dead, doing full page reload", "v3");
      location.reload();
      return;
    }
    const ws = unsafeWindow.chatout_ws;
    if (ws) {
      cclog("reloadChat: closing WS to trigger reconnect", "v3");
      ws.close();
    } else {
      cclog("reloadChat: no WS \u2014 nothing to reconnect", "v3");
    }
  }

  // node_modules/tinycolor2/esm/tinycolor.js
  function _typeof(obj) {
    "@babel/helpers - typeof";
    return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(obj2) {
      return typeof obj2;
    } : function(obj2) {
      return obj2 && "function" == typeof Symbol && obj2.constructor === Symbol && obj2 !== Symbol.prototype ? "symbol" : typeof obj2;
    }, _typeof(obj);
  }
  var trimLeft = /^\s+/;
  var trimRight = /\s+$/;
  function tinycolor2(color, opts) {
    color = color ? color : "";
    opts = opts || {};
    if (color instanceof tinycolor2) {
      return color;
    }
    if (!(this instanceof tinycolor2)) {
      return new tinycolor2(color, opts);
    }
    var rgb = inputToRGB(color);
    this._originalInput = color, this._r = rgb.r, this._g = rgb.g, this._b = rgb.b, this._a = rgb.a, this._roundA = Math.round(100 * this._a) / 100, this._format = opts.format || rgb.format;
    this._gradientType = opts.gradientType;
    if (this._r < 1) this._r = Math.round(this._r);
    if (this._g < 1) this._g = Math.round(this._g);
    if (this._b < 1) this._b = Math.round(this._b);
    this._ok = rgb.ok;
  }
  tinycolor2.prototype = {
    isDark: function isDark() {
      return this.getBrightness() < 128;
    },
    isLight: function isLight() {
      return !this.isDark();
    },
    isValid: function isValid() {
      return this._ok;
    },
    getOriginalInput: function getOriginalInput() {
      return this._originalInput;
    },
    getFormat: function getFormat() {
      return this._format;
    },
    getAlpha: function getAlpha() {
      return this._a;
    },
    getBrightness: function getBrightness() {
      var rgb = this.toRgb();
      return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1e3;
    },
    getLuminance: function getLuminance() {
      var rgb = this.toRgb();
      var RsRGB, GsRGB, BsRGB, R, G, B;
      RsRGB = rgb.r / 255;
      GsRGB = rgb.g / 255;
      BsRGB = rgb.b / 255;
      if (RsRGB <= 0.03928) R = RsRGB / 12.92;
      else R = Math.pow((RsRGB + 0.055) / 1.055, 2.4);
      if (GsRGB <= 0.03928) G = GsRGB / 12.92;
      else G = Math.pow((GsRGB + 0.055) / 1.055, 2.4);
      if (BsRGB <= 0.03928) B = BsRGB / 12.92;
      else B = Math.pow((BsRGB + 0.055) / 1.055, 2.4);
      return 0.2126 * R + 0.7152 * G + 0.0722 * B;
    },
    setAlpha: function setAlpha(value) {
      this._a = boundAlpha(value);
      this._roundA = Math.round(100 * this._a) / 100;
      return this;
    },
    toHsv: function toHsv() {
      var hsv = rgbToHsv(this._r, this._g, this._b);
      return {
        h: hsv.h * 360,
        s: hsv.s,
        v: hsv.v,
        a: this._a
      };
    },
    toHsvString: function toHsvString() {
      var hsv = rgbToHsv(this._r, this._g, this._b);
      var h = Math.round(hsv.h * 360), s = Math.round(hsv.s * 100), v = Math.round(hsv.v * 100);
      return this._a == 1 ? "hsv(" + h + ", " + s + "%, " + v + "%)" : "hsva(" + h + ", " + s + "%, " + v + "%, " + this._roundA + ")";
    },
    toHsl: function toHsl() {
      var hsl = rgbToHsl(this._r, this._g, this._b);
      return {
        h: hsl.h * 360,
        s: hsl.s,
        l: hsl.l,
        a: this._a
      };
    },
    toHslString: function toHslString() {
      var hsl = rgbToHsl(this._r, this._g, this._b);
      var h = Math.round(hsl.h * 360), s = Math.round(hsl.s * 100), l = Math.round(hsl.l * 100);
      return this._a == 1 ? "hsl(" + h + ", " + s + "%, " + l + "%)" : "hsla(" + h + ", " + s + "%, " + l + "%, " + this._roundA + ")";
    },
    toHex: function toHex(allow3Char) {
      return rgbToHex(this._r, this._g, this._b, allow3Char);
    },
    toHexString: function toHexString(allow3Char) {
      return "#" + this.toHex(allow3Char);
    },
    toHex8: function toHex8(allow4Char) {
      return rgbaToHex(this._r, this._g, this._b, this._a, allow4Char);
    },
    toHex8String: function toHex8String(allow4Char) {
      return "#" + this.toHex8(allow4Char);
    },
    toRgb: function toRgb() {
      return {
        r: Math.round(this._r),
        g: Math.round(this._g),
        b: Math.round(this._b),
        a: this._a
      };
    },
    toRgbString: function toRgbString() {
      return this._a == 1 ? "rgb(" + Math.round(this._r) + ", " + Math.round(this._g) + ", " + Math.round(this._b) + ")" : "rgba(" + Math.round(this._r) + ", " + Math.round(this._g) + ", " + Math.round(this._b) + ", " + this._roundA + ")";
    },
    toPercentageRgb: function toPercentageRgb() {
      return {
        r: Math.round(bound01(this._r, 255) * 100) + "%",
        g: Math.round(bound01(this._g, 255) * 100) + "%",
        b: Math.round(bound01(this._b, 255) * 100) + "%",
        a: this._a
      };
    },
    toPercentageRgbString: function toPercentageRgbString() {
      return this._a == 1 ? "rgb(" + Math.round(bound01(this._r, 255) * 100) + "%, " + Math.round(bound01(this._g, 255) * 100) + "%, " + Math.round(bound01(this._b, 255) * 100) + "%)" : "rgba(" + Math.round(bound01(this._r, 255) * 100) + "%, " + Math.round(bound01(this._g, 255) * 100) + "%, " + Math.round(bound01(this._b, 255) * 100) + "%, " + this._roundA + ")";
    },
    toName: function toName() {
      if (this._a === 0) {
        return "transparent";
      }
      if (this._a < 1) {
        return false;
      }
      return hexNames[rgbToHex(this._r, this._g, this._b, true)] || false;
    },
    toFilter: function toFilter(secondColor) {
      var hex8String = "#" + rgbaToArgbHex(this._r, this._g, this._b, this._a);
      var secondHex8String = hex8String;
      var gradientType = this._gradientType ? "GradientType = 1, " : "";
      if (secondColor) {
        var s = tinycolor2(secondColor);
        secondHex8String = "#" + rgbaToArgbHex(s._r, s._g, s._b, s._a);
      }
      return "progid:DXImageTransform.Microsoft.gradient(" + gradientType + "startColorstr=" + hex8String + ",endColorstr=" + secondHex8String + ")";
    },
    toString: function toString(format) {
      var formatSet = !!format;
      format = format || this._format;
      var formattedString = false;
      var hasAlpha = this._a < 1 && this._a >= 0;
      var needsAlphaFormat = !formatSet && hasAlpha && (format === "hex" || format === "hex6" || format === "hex3" || format === "hex4" || format === "hex8" || format === "name");
      if (needsAlphaFormat) {
        if (format === "name" && this._a === 0) {
          return this.toName();
        }
        return this.toRgbString();
      }
      if (format === "rgb") {
        formattedString = this.toRgbString();
      }
      if (format === "prgb") {
        formattedString = this.toPercentageRgbString();
      }
      if (format === "hex" || format === "hex6") {
        formattedString = this.toHexString();
      }
      if (format === "hex3") {
        formattedString = this.toHexString(true);
      }
      if (format === "hex4") {
        formattedString = this.toHex8String(true);
      }
      if (format === "hex8") {
        formattedString = this.toHex8String();
      }
      if (format === "name") {
        formattedString = this.toName();
      }
      if (format === "hsl") {
        formattedString = this.toHslString();
      }
      if (format === "hsv") {
        formattedString = this.toHsvString();
      }
      return formattedString || this.toHexString();
    },
    clone: function clone() {
      return tinycolor2(this.toString());
    },
    _applyModification: function _applyModification(fn, args) {
      var color = fn.apply(null, [this].concat([].slice.call(args)));
      this._r = color._r;
      this._g = color._g;
      this._b = color._b;
      this.setAlpha(color._a);
      return this;
    },
    lighten: function lighten() {
      return this._applyModification(_lighten, arguments);
    },
    brighten: function brighten() {
      return this._applyModification(_brighten, arguments);
    },
    darken: function darken() {
      return this._applyModification(_darken, arguments);
    },
    desaturate: function desaturate() {
      return this._applyModification(_desaturate, arguments);
    },
    saturate: function saturate() {
      return this._applyModification(_saturate, arguments);
    },
    greyscale: function greyscale() {
      return this._applyModification(_greyscale, arguments);
    },
    spin: function spin() {
      return this._applyModification(_spin, arguments);
    },
    _applyCombination: function _applyCombination(fn, args) {
      return fn.apply(null, [this].concat([].slice.call(args)));
    },
    analogous: function analogous() {
      return this._applyCombination(_analogous, arguments);
    },
    complement: function complement() {
      return this._applyCombination(_complement, arguments);
    },
    monochromatic: function monochromatic() {
      return this._applyCombination(_monochromatic, arguments);
    },
    splitcomplement: function splitcomplement() {
      return this._applyCombination(_splitcomplement, arguments);
    },
    // Disabled until https://github.com/bgrins/TinyColor/issues/254
    // polyad: function (number) {
    //   return this._applyCombination(polyad, [number]);
    // },
    triad: function triad() {
      return this._applyCombination(polyad, [3]);
    },
    tetrad: function tetrad() {
      return this._applyCombination(polyad, [4]);
    }
  };
  tinycolor2.fromRatio = function(color, opts) {
    if (_typeof(color) == "object") {
      var newColor = {};
      for (var i in color) {
        if (color.hasOwnProperty(i)) {
          if (i === "a") {
            newColor[i] = color[i];
          } else {
            newColor[i] = convertToPercentage(color[i]);
          }
        }
      }
      color = newColor;
    }
    return tinycolor2(color, opts);
  };
  function inputToRGB(color) {
    var rgb = {
      r: 0,
      g: 0,
      b: 0
    };
    var a = 1;
    var s = null;
    var v = null;
    var l = null;
    var ok = false;
    var format = false;
    if (typeof color == "string") {
      color = stringInputToObject(color);
    }
    if (_typeof(color) == "object") {
      if (isValidCSSUnit(color.r) && isValidCSSUnit(color.g) && isValidCSSUnit(color.b)) {
        rgb = rgbToRgb(color.r, color.g, color.b);
        ok = true;
        format = String(color.r).substr(-1) === "%" ? "prgb" : "rgb";
      } else if (isValidCSSUnit(color.h) && isValidCSSUnit(color.s) && isValidCSSUnit(color.v)) {
        s = convertToPercentage(color.s);
        v = convertToPercentage(color.v);
        rgb = hsvToRgb(color.h, s, v);
        ok = true;
        format = "hsv";
      } else if (isValidCSSUnit(color.h) && isValidCSSUnit(color.s) && isValidCSSUnit(color.l)) {
        s = convertToPercentage(color.s);
        l = convertToPercentage(color.l);
        rgb = hslToRgb(color.h, s, l);
        ok = true;
        format = "hsl";
      }
      if (color.hasOwnProperty("a")) {
        a = color.a;
      }
    }
    a = boundAlpha(a);
    return {
      ok,
      format: color.format || format,
      r: Math.min(255, Math.max(rgb.r, 0)),
      g: Math.min(255, Math.max(rgb.g, 0)),
      b: Math.min(255, Math.max(rgb.b, 0)),
      a
    };
  }
  function rgbToRgb(r, g, b) {
    return {
      r: bound01(r, 255) * 255,
      g: bound01(g, 255) * 255,
      b: bound01(b, 255) * 255
    };
  }
  function rgbToHsl(r, g, b) {
    r = bound01(r, 255);
    g = bound01(g, 255);
    b = bound01(b, 255);
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;
    if (max == min) {
      h = s = 0;
    } else {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
      }
      h /= 6;
    }
    return {
      h,
      s,
      l
    };
  }
  function hslToRgb(h, s, l) {
    var r, g, b;
    h = bound01(h, 360);
    s = bound01(s, 100);
    l = bound01(l, 100);
    function hue2rgb(p2, q2, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p2 + (q2 - p2) * 6 * t;
      if (t < 1 / 2) return q2;
      if (t < 2 / 3) return p2 + (q2 - p2) * (2 / 3 - t) * 6;
      return p2;
    }
    if (s === 0) {
      r = g = b = l;
    } else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return {
      r: r * 255,
      g: g * 255,
      b: b * 255
    };
  }
  function rgbToHsv(r, g, b) {
    r = bound01(r, 255);
    g = bound01(g, 255);
    b = bound01(b, 255);
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, v = max;
    var d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max == min) {
      h = 0;
    } else {
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
      }
      h /= 6;
    }
    return {
      h,
      s,
      v
    };
  }
  function hsvToRgb(h, s, v) {
    h = bound01(h, 360) * 6;
    s = bound01(s, 100);
    v = bound01(v, 100);
    var i = Math.floor(h), f = h - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s), mod = i % 6, r = [v, q, p, p, t, v][mod], g = [t, v, v, q, p, p][mod], b = [p, p, t, v, v, q][mod];
    return {
      r: r * 255,
      g: g * 255,
      b: b * 255
    };
  }
  function rgbToHex(r, g, b, allow3Char) {
    var hex = [pad2(Math.round(r).toString(16)), pad2(Math.round(g).toString(16)), pad2(Math.round(b).toString(16))];
    if (allow3Char && hex[0].charAt(0) == hex[0].charAt(1) && hex[1].charAt(0) == hex[1].charAt(1) && hex[2].charAt(0) == hex[2].charAt(1)) {
      return hex[0].charAt(0) + hex[1].charAt(0) + hex[2].charAt(0);
    }
    return hex.join("");
  }
  function rgbaToHex(r, g, b, a, allow4Char) {
    var hex = [pad2(Math.round(r).toString(16)), pad2(Math.round(g).toString(16)), pad2(Math.round(b).toString(16)), pad2(convertDecimalToHex(a))];
    if (allow4Char && hex[0].charAt(0) == hex[0].charAt(1) && hex[1].charAt(0) == hex[1].charAt(1) && hex[2].charAt(0) == hex[2].charAt(1) && hex[3].charAt(0) == hex[3].charAt(1)) {
      return hex[0].charAt(0) + hex[1].charAt(0) + hex[2].charAt(0) + hex[3].charAt(0);
    }
    return hex.join("");
  }
  function rgbaToArgbHex(r, g, b, a) {
    var hex = [pad2(convertDecimalToHex(a)), pad2(Math.round(r).toString(16)), pad2(Math.round(g).toString(16)), pad2(Math.round(b).toString(16))];
    return hex.join("");
  }
  tinycolor2.equals = function(color1, color2) {
    if (!color1 || !color2) return false;
    return tinycolor2(color1).toRgbString() == tinycolor2(color2).toRgbString();
  };
  tinycolor2.random = function() {
    return tinycolor2.fromRatio({
      r: Math.random(),
      g: Math.random(),
      b: Math.random()
    });
  };
  function _desaturate(color, amount) {
    amount = amount === 0 ? 0 : amount || 10;
    var hsl = tinycolor2(color).toHsl();
    hsl.s -= amount / 100;
    hsl.s = clamp01(hsl.s);
    return tinycolor2(hsl);
  }
  function _saturate(color, amount) {
    amount = amount === 0 ? 0 : amount || 10;
    var hsl = tinycolor2(color).toHsl();
    hsl.s += amount / 100;
    hsl.s = clamp01(hsl.s);
    return tinycolor2(hsl);
  }
  function _greyscale(color) {
    return tinycolor2(color).desaturate(100);
  }
  function _lighten(color, amount) {
    amount = amount === 0 ? 0 : amount || 10;
    var hsl = tinycolor2(color).toHsl();
    hsl.l += amount / 100;
    hsl.l = clamp01(hsl.l);
    return tinycolor2(hsl);
  }
  function _brighten(color, amount) {
    amount = amount === 0 ? 0 : amount || 10;
    var rgb = tinycolor2(color).toRgb();
    rgb.r = Math.max(0, Math.min(255, rgb.r - Math.round(255 * -(amount / 100))));
    rgb.g = Math.max(0, Math.min(255, rgb.g - Math.round(255 * -(amount / 100))));
    rgb.b = Math.max(0, Math.min(255, rgb.b - Math.round(255 * -(amount / 100))));
    return tinycolor2(rgb);
  }
  function _darken(color, amount) {
    amount = amount === 0 ? 0 : amount || 10;
    var hsl = tinycolor2(color).toHsl();
    hsl.l -= amount / 100;
    hsl.l = clamp01(hsl.l);
    return tinycolor2(hsl);
  }
  function _spin(color, amount) {
    var hsl = tinycolor2(color).toHsl();
    var hue = (hsl.h + amount) % 360;
    hsl.h = hue < 0 ? 360 + hue : hue;
    return tinycolor2(hsl);
  }
  function _complement(color) {
    var hsl = tinycolor2(color).toHsl();
    hsl.h = (hsl.h + 180) % 360;
    return tinycolor2(hsl);
  }
  function polyad(color, number) {
    if (isNaN(number) || number <= 0) {
      throw new Error("Argument to polyad must be a positive number");
    }
    var hsl = tinycolor2(color).toHsl();
    var result = [tinycolor2(color)];
    var step = 360 / number;
    for (var i = 1; i < number; i++) {
      result.push(tinycolor2({
        h: (hsl.h + i * step) % 360,
        s: hsl.s,
        l: hsl.l
      }));
    }
    return result;
  }
  function _splitcomplement(color) {
    var hsl = tinycolor2(color).toHsl();
    var h = hsl.h;
    return [tinycolor2(color), tinycolor2({
      h: (h + 72) % 360,
      s: hsl.s,
      l: hsl.l
    }), tinycolor2({
      h: (h + 216) % 360,
      s: hsl.s,
      l: hsl.l
    })];
  }
  function _analogous(color, results, slices) {
    results = results || 6;
    slices = slices || 30;
    var hsl = tinycolor2(color).toHsl();
    var part = 360 / slices;
    var ret = [tinycolor2(color)];
    for (hsl.h = (hsl.h - (part * results >> 1) + 720) % 360; --results; ) {
      hsl.h = (hsl.h + part) % 360;
      ret.push(tinycolor2(hsl));
    }
    return ret;
  }
  function _monochromatic(color, results) {
    results = results || 6;
    var hsv = tinycolor2(color).toHsv();
    var h = hsv.h, s = hsv.s, v = hsv.v;
    var ret = [];
    var modification = 1 / results;
    while (results--) {
      ret.push(tinycolor2({
        h,
        s,
        v
      }));
      v = (v + modification) % 1;
    }
    return ret;
  }
  tinycolor2.mix = function(color1, color2, amount) {
    amount = amount === 0 ? 0 : amount || 50;
    var rgb1 = tinycolor2(color1).toRgb();
    var rgb2 = tinycolor2(color2).toRgb();
    var p = amount / 100;
    var rgba = {
      r: (rgb2.r - rgb1.r) * p + rgb1.r,
      g: (rgb2.g - rgb1.g) * p + rgb1.g,
      b: (rgb2.b - rgb1.b) * p + rgb1.b,
      a: (rgb2.a - rgb1.a) * p + rgb1.a
    };
    return tinycolor2(rgba);
  };
  tinycolor2.readability = function(color1, color2) {
    var c1 = tinycolor2(color1);
    var c2 = tinycolor2(color2);
    return (Math.max(c1.getLuminance(), c2.getLuminance()) + 0.05) / (Math.min(c1.getLuminance(), c2.getLuminance()) + 0.05);
  };
  tinycolor2.isReadable = function(color1, color2, wcag2) {
    var readability = tinycolor2.readability(color1, color2);
    var wcag2Parms, out;
    out = false;
    wcag2Parms = validateWCAG2Parms(wcag2);
    switch (wcag2Parms.level + wcag2Parms.size) {
      case "AAsmall":
      case "AAAlarge":
        out = readability >= 4.5;
        break;
      case "AAlarge":
        out = readability >= 3;
        break;
      case "AAAsmall":
        out = readability >= 7;
        break;
    }
    return out;
  };
  tinycolor2.mostReadable = function(baseColor, colorList, args) {
    var bestColor = null;
    var bestScore = 0;
    var readability;
    var includeFallbackColors, level, size;
    args = args || {};
    includeFallbackColors = args.includeFallbackColors;
    level = args.level;
    size = args.size;
    for (var i = 0; i < colorList.length; i++) {
      readability = tinycolor2.readability(baseColor, colorList[i]);
      if (readability > bestScore) {
        bestScore = readability;
        bestColor = tinycolor2(colorList[i]);
      }
    }
    if (tinycolor2.isReadable(baseColor, bestColor, {
      level,
      size
    }) || !includeFallbackColors) {
      return bestColor;
    } else {
      args.includeFallbackColors = false;
      return tinycolor2.mostReadable(baseColor, ["#fff", "#000"], args);
    }
  };
  var names = tinycolor2.names = {
    aliceblue: "f0f8ff",
    antiquewhite: "faebd7",
    aqua: "0ff",
    aquamarine: "7fffd4",
    azure: "f0ffff",
    beige: "f5f5dc",
    bisque: "ffe4c4",
    black: "000",
    blanchedalmond: "ffebcd",
    blue: "00f",
    blueviolet: "8a2be2",
    brown: "a52a2a",
    burlywood: "deb887",
    burntsienna: "ea7e5d",
    cadetblue: "5f9ea0",
    chartreuse: "7fff00",
    chocolate: "d2691e",
    coral: "ff7f50",
    cornflowerblue: "6495ed",
    cornsilk: "fff8dc",
    crimson: "dc143c",
    cyan: "0ff",
    darkblue: "00008b",
    darkcyan: "008b8b",
    darkgoldenrod: "b8860b",
    darkgray: "a9a9a9",
    darkgreen: "006400",
    darkgrey: "a9a9a9",
    darkkhaki: "bdb76b",
    darkmagenta: "8b008b",
    darkolivegreen: "556b2f",
    darkorange: "ff8c00",
    darkorchid: "9932cc",
    darkred: "8b0000",
    darksalmon: "e9967a",
    darkseagreen: "8fbc8f",
    darkslateblue: "483d8b",
    darkslategray: "2f4f4f",
    darkslategrey: "2f4f4f",
    darkturquoise: "00ced1",
    darkviolet: "9400d3",
    deeppink: "ff1493",
    deepskyblue: "00bfff",
    dimgray: "696969",
    dimgrey: "696969",
    dodgerblue: "1e90ff",
    firebrick: "b22222",
    floralwhite: "fffaf0",
    forestgreen: "228b22",
    fuchsia: "f0f",
    gainsboro: "dcdcdc",
    ghostwhite: "f8f8ff",
    gold: "ffd700",
    goldenrod: "daa520",
    gray: "808080",
    green: "008000",
    greenyellow: "adff2f",
    grey: "808080",
    honeydew: "f0fff0",
    hotpink: "ff69b4",
    indianred: "cd5c5c",
    indigo: "4b0082",
    ivory: "fffff0",
    khaki: "f0e68c",
    lavender: "e6e6fa",
    lavenderblush: "fff0f5",
    lawngreen: "7cfc00",
    lemonchiffon: "fffacd",
    lightblue: "add8e6",
    lightcoral: "f08080",
    lightcyan: "e0ffff",
    lightgoldenrodyellow: "fafad2",
    lightgray: "d3d3d3",
    lightgreen: "90ee90",
    lightgrey: "d3d3d3",
    lightpink: "ffb6c1",
    lightsalmon: "ffa07a",
    lightseagreen: "20b2aa",
    lightskyblue: "87cefa",
    lightslategray: "789",
    lightslategrey: "789",
    lightsteelblue: "b0c4de",
    lightyellow: "ffffe0",
    lime: "0f0",
    limegreen: "32cd32",
    linen: "faf0e6",
    magenta: "f0f",
    maroon: "800000",
    mediumaquamarine: "66cdaa",
    mediumblue: "0000cd",
    mediumorchid: "ba55d3",
    mediumpurple: "9370db",
    mediumseagreen: "3cb371",
    mediumslateblue: "7b68ee",
    mediumspringgreen: "00fa9a",
    mediumturquoise: "48d1cc",
    mediumvioletred: "c71585",
    midnightblue: "191970",
    mintcream: "f5fffa",
    mistyrose: "ffe4e1",
    moccasin: "ffe4b5",
    navajowhite: "ffdead",
    navy: "000080",
    oldlace: "fdf5e6",
    olive: "808000",
    olivedrab: "6b8e23",
    orange: "ffa500",
    orangered: "ff4500",
    orchid: "da70d6",
    palegoldenrod: "eee8aa",
    palegreen: "98fb98",
    paleturquoise: "afeeee",
    palevioletred: "db7093",
    papayawhip: "ffefd5",
    peachpuff: "ffdab9",
    peru: "cd853f",
    pink: "ffc0cb",
    plum: "dda0dd",
    powderblue: "b0e0e6",
    purple: "800080",
    rebeccapurple: "663399",
    red: "f00",
    rosybrown: "bc8f8f",
    royalblue: "4169e1",
    saddlebrown: "8b4513",
    salmon: "fa8072",
    sandybrown: "f4a460",
    seagreen: "2e8b57",
    seashell: "fff5ee",
    sienna: "a0522d",
    silver: "c0c0c0",
    skyblue: "87ceeb",
    slateblue: "6a5acd",
    slategray: "708090",
    slategrey: "708090",
    snow: "fffafa",
    springgreen: "00ff7f",
    steelblue: "4682b4",
    tan: "d2b48c",
    teal: "008080",
    thistle: "d8bfd8",
    tomato: "ff6347",
    turquoise: "40e0d0",
    violet: "ee82ee",
    wheat: "f5deb3",
    white: "fff",
    whitesmoke: "f5f5f5",
    yellow: "ff0",
    yellowgreen: "9acd32"
  };
  var hexNames = tinycolor2.hexNames = flip(names);
  function flip(o) {
    var flipped = {};
    for (var i in o) {
      if (o.hasOwnProperty(i)) {
        flipped[o[i]] = i;
      }
    }
    return flipped;
  }
  function boundAlpha(a) {
    a = parseFloat(a);
    if (isNaN(a) || a < 0 || a > 1) {
      a = 1;
    }
    return a;
  }
  function bound01(n, max) {
    if (isOnePointZero(n)) n = "100%";
    var processPercent = isPercentage(n);
    n = Math.min(max, Math.max(0, parseFloat(n)));
    if (processPercent) {
      n = parseInt(n * max, 10) / 100;
    }
    if (Math.abs(n - max) < 1e-6) {
      return 1;
    }
    return n % max / parseFloat(max);
  }
  function clamp01(val) {
    return Math.min(1, Math.max(0, val));
  }
  function parseIntFromHex(val) {
    return parseInt(val, 16);
  }
  function isOnePointZero(n) {
    return typeof n == "string" && n.indexOf(".") != -1 && parseFloat(n) === 1;
  }
  function isPercentage(n) {
    return typeof n === "string" && n.indexOf("%") != -1;
  }
  function pad2(c) {
    return c.length == 1 ? "0" + c : "" + c;
  }
  function convertToPercentage(n) {
    if (n <= 1) {
      n = n * 100 + "%";
    }
    return n;
  }
  function convertDecimalToHex(d) {
    return Math.round(parseFloat(d) * 255).toString(16);
  }
  function convertHexToDecimal(h) {
    return parseIntFromHex(h) / 255;
  }
  var matchers = (function() {
    var CSS_INTEGER = "[-\\+]?\\d+%?";
    var CSS_NUMBER = "[-\\+]?\\d*\\.\\d+%?";
    var CSS_UNIT = "(?:" + CSS_NUMBER + ")|(?:" + CSS_INTEGER + ")";
    var PERMISSIVE_MATCH3 = "[\\s|\\(]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")\\s*\\)?";
    var PERMISSIVE_MATCH4 = "[\\s|\\(]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")\\s*\\)?";
    return {
      CSS_UNIT: new RegExp(CSS_UNIT),
      rgb: new RegExp("rgb" + PERMISSIVE_MATCH3),
      rgba: new RegExp("rgba" + PERMISSIVE_MATCH4),
      hsl: new RegExp("hsl" + PERMISSIVE_MATCH3),
      hsla: new RegExp("hsla" + PERMISSIVE_MATCH4),
      hsv: new RegExp("hsv" + PERMISSIVE_MATCH3),
      hsva: new RegExp("hsva" + PERMISSIVE_MATCH4),
      hex3: /^#?([0-9a-fA-F]{1})([0-9a-fA-F]{1})([0-9a-fA-F]{1})$/,
      hex6: /^#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/,
      hex4: /^#?([0-9a-fA-F]{1})([0-9a-fA-F]{1})([0-9a-fA-F]{1})([0-9a-fA-F]{1})$/,
      hex8: /^#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/
    };
  })();
  function isValidCSSUnit(color) {
    return !!matchers.CSS_UNIT.exec(color);
  }
  function stringInputToObject(color) {
    color = color.replace(trimLeft, "").replace(trimRight, "").toLowerCase();
    var named = false;
    if (names[color]) {
      color = names[color];
      named = true;
    } else if (color == "transparent") {
      return {
        r: 0,
        g: 0,
        b: 0,
        a: 0,
        format: "name"
      };
    }
    var match;
    if (match = matchers.rgb.exec(color)) {
      return {
        r: match[1],
        g: match[2],
        b: match[3]
      };
    }
    if (match = matchers.rgba.exec(color)) {
      return {
        r: match[1],
        g: match[2],
        b: match[3],
        a: match[4]
      };
    }
    if (match = matchers.hsl.exec(color)) {
      return {
        h: match[1],
        s: match[2],
        l: match[3]
      };
    }
    if (match = matchers.hsla.exec(color)) {
      return {
        h: match[1],
        s: match[2],
        l: match[3],
        a: match[4]
      };
    }
    if (match = matchers.hsv.exec(color)) {
      return {
        h: match[1],
        s: match[2],
        v: match[3]
      };
    }
    if (match = matchers.hsva.exec(color)) {
      return {
        h: match[1],
        s: match[2],
        v: match[3],
        a: match[4]
      };
    }
    if (match = matchers.hex8.exec(color)) {
      return {
        r: parseIntFromHex(match[1]),
        g: parseIntFromHex(match[2]),
        b: parseIntFromHex(match[3]),
        a: convertHexToDecimal(match[4]),
        format: named ? "name" : "hex8"
      };
    }
    if (match = matchers.hex6.exec(color)) {
      return {
        r: parseIntFromHex(match[1]),
        g: parseIntFromHex(match[2]),
        b: parseIntFromHex(match[3]),
        format: named ? "name" : "hex"
      };
    }
    if (match = matchers.hex4.exec(color)) {
      return {
        r: parseIntFromHex(match[1] + "" + match[1]),
        g: parseIntFromHex(match[2] + "" + match[2]),
        b: parseIntFromHex(match[3] + "" + match[3]),
        a: convertHexToDecimal(match[4] + "" + match[4]),
        format: named ? "name" : "hex8"
      };
    }
    if (match = matchers.hex3.exec(color)) {
      return {
        r: parseIntFromHex(match[1] + "" + match[1]),
        g: parseIntFromHex(match[2] + "" + match[2]),
        b: parseIntFromHex(match[3] + "" + match[3]),
        format: named ? "name" : "hex"
      };
    }
    return false;
  }
  function validateWCAG2Parms(parms) {
    var level, size;
    parms = parms || {
      level: "AA",
      size: "small"
    };
    level = (parms.level || "AA").toUpperCase();
    size = (parms.size || "small").toLowerCase();
    if (level !== "AA" && level !== "AAA") {
      level = "AA";
    }
    if (size !== "small" && size !== "large") {
      size = "small";
    }
    return {
      level,
      size
    };
  }

  // src/scheme.ts
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
  function toHex6(color) {
    return color.toHexString().slice(1).toUpperCase();
  }
  function pickReadable(bg, candidates, large = false) {
    const chosen = tinycolor2.mostReadable(bg, candidates, {
      includeFallbackColors: true,
      level: "AA",
      size: large ? "large" : "small"
    });
    return chosen;
  }
  function nudge(color, amount) {
    return color.isLight() ? color.clone().darken(amount) : color.clone().lighten(amount);
  }
  function liftAccent(bg, accent) {
    const minContrast = 3;
    if (tinycolor2.readability(bg, accent) >= minContrast) return accent.clone();
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
      if (tinycolor2.readability(bg, cand) >= minContrast) return cand;
    }
    return accent.clone();
  }
  function generateScheme(baseColor, options) {
    const surface = tinycolor2(baseColor);
    const darkMode = options?.darkMode ?? !surface.isLight();
    const text = pickReadable(
      surface,
      surface.monochromatic().concat(surface.analogous())
    );
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
    const textMuted = pickReadable(
      footer,
      surface.monochromatic().concat(surface.analogous())
    );
    const textPlaceholder = textInput.clone();
    const icon = pickReadable(sidebar, surface.monochromatic(), true);
    const triad2 = surface.triad();
    const accentWhisper = liftAccent(surface, triad2[1]);
    const accentBan = liftAccent(surface, triad2[2]);
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
      border: toHex6(border),
      surfaceHover: toHex6(surfaceHover),
      surfaceActive: toHex6(surfaceActive),
      bgHex: toHex6(surface)
    };
  }

  // src/v3/theme.ts
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
    const root = document.documentElement;
    for (const [varName, value] of Object.entries(schemeToCssVars(scheme))) {
      root.style.setProperty(varName, value);
    }
    applyThemeToIframe("#" + scheme.surface, "#" + scheme.text);
  }
  async function loadTheme(colorKey, schemeKey, defaultBase = "6AAED8") {
    const base = await GM.getValue(colorKey, defaultBase);
    await GM.setValue(colorKey, base);
    const stored = await GM.getValue(schemeKey, null);
    if (matchesStoredBase(stored, base) && stored) {
      applyScheme(stored);
      return stored;
    }
    const scheme = generateScheme(base);
    await GM.setValue(schemeKey, schemeToStorage(scheme));
    applyScheme(scheme);
    return scheme;
  }

  // src/v3/userlist.ts
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
      const pa = pinned.has(a.name) ? 0 : 1;
      const pb = pinned.has(b.name) ? 0 : 1;
      return pa - pb || cmp.compare(a.name, b.name);
    });
  }

  // src/v3/userlist-wire.ts
  var prevList = [];
  function processUserlist(chaMy, prev) {
    const newList = parseUserlist(chaMy);
    const { added, removed } = diffUserlists(prev, newList);
    return { newList, added, removed };
  }
  function overrideSetUinfo1() {
    const upstream = unsafeWindow.set_uinfo1;
    unsafeWindow.set_uinfo1 = function() {
      const chaMy2 = unsafeWindow.cha_my ?? [];
      const { newList, added, removed } = processUserlist(chaMy2, prevList);
      prevList = newList;
      emit({ type: "userlist", users: newList, added, removed });
    };
    cclog("set_uinfo1 overridden \u2014 userlist events now feed the store", "v3");
    const chaMy = unsafeWindow.cha_my ?? [];
    if (chaMy.length > 0) unsafeWindow.set_uinfo1();
  }

  // src/v3/config.ts
  var DEFAULTS = {
    color: "6AAED8",
    colorscheme: null,
    // regenerated from color on load (theme bridge T3)
    ban: [],
    pinned: [],
    whisper: "",
    // "" = no superwhisper target
    bcc_v3: false
  };
  async function getConfig(key, fallback) {
    const def = fallback ?? DEFAULTS[key];
    return await GM.getValue(getUserKey(key), def);
  }
  async function setConfig(key, value) {
    await GM.setValue(getUserKey(key), value);
  }

  // src/v3/sidebar.ts
  function getStatusText(user) {
    if (user.sep) return "[S] ";
    if (user.away) return "[A] ";
    return "";
  }
  function getStatusClasses(user) {
    const classes = ["bcc-userrow"];
    if (user.away) classes.push("bcc-away");
    if (user.sep) classes.push("bcc-sep");
    return classes.join(" ");
  }
  function buildRow(user) {
    const li = document.createElement("li");
    li.className = getStatusClasses(user);
    li.dataset.name = user.name;
    const nameSpan = document.createElement("span");
    nameSpan.className = "bcc-userrow-name";
    nameSpan.textContent = getStatusText(user) + user.name;
    li.appendChild(nameSpan);
    li.addEventListener("click", () => handleRowClick(user));
    return li;
  }
  var pinnedCache = /* @__PURE__ */ new Set();
  async function refreshPinned() {
    const list = await getConfig("pinned", []);
    pinnedCache = new Set(list);
  }
  async function togglePin(user) {
    const list = await getConfig("pinned", []);
    const idx = list.indexOf(user.name);
    if (idx === -1) {
      list.push(user.name);
    } else {
      list.splice(idx, 1);
    }
    await setConfig("pinned", list);
    pinnedCache = new Set(list);
    renderSidebar(lastUserlistEvent ?? []);
  }
  function handleRowClick(user) {
    togglePin(user).catch(() => {
      cclog("pin toggle failed for " + user.name, "v3");
    });
    cclog("userlist row click: " + user.name + " (pin toggled, popup stub)", "v3");
  }
  var lastUserlistEvent = null;
  var rowMap = /* @__PURE__ */ new Map();
  function renderSidebar(users) {
    const sidebar = document.querySelector(".bcc-sidebar");
    if (!sidebar) return;
    const sorted = sortUsers(users, pinnedCache);
    const scrollTop = sidebar.scrollTop;
    sidebar.innerHTML = "";
    const pinnedUl = document.createElement("ul");
    pinnedUl.className = "bcc-userlist-pinned";
    const regularUl = document.createElement("ul");
    regularUl.className = "bcc-userlist-regular";
    const divider = document.createElement("div");
    divider.className = "bcc-userlist-divider";
    const newMap = /* @__PURE__ */ new Map();
    let hasPinned = false;
    let hasRegular = false;
    for (const user of sorted) {
      const isPinned = pinnedCache.has(user.name);
      if (isPinned) hasPinned = true;
      else hasRegular = true;
      let row = rowMap.get(user.name);
      if (row) {
        row.className = getStatusClasses(user);
        const nameSpan = row.querySelector(".bcc-userrow-name");
        if (nameSpan) nameSpan.textContent = getStatusText(user) + user.name;
      } else {
        row = buildRow(user);
      }
      (isPinned ? pinnedUl : regularUl).appendChild(row);
      newMap.set(user.name, row);
    }
    if (hasPinned) sidebar.appendChild(pinnedUl);
    if (hasPinned && hasRegular) sidebar.appendChild(divider);
    if (hasRegular) sidebar.appendChild(regularUl);
    sidebar.scrollTop = Math.min(scrollTop, sidebar.scrollHeight);
    rowMap = newMap;
    lastUserlistEvent = users;
  }
  function mountSidebar() {
    refreshPinned().catch(() => {
      cclog("mountSidebar: failed to read pinned config", "v3");
    });
    subscribe((e) => {
      if (e.type === "userlist") {
        renderSidebar(e.users);
      }
    });
    cclog("sidebar mounted \u2014 subscribed to userlist events", "v3");
  }

  // src/v3/session.ts
  var session;
  var timer = null;
  function initSession() {
    if (timer) clearInterval(timer);
    const w = unsafeWindow;
    session = {
      nick: String(w.chat_nick ?? ""),
      registered: String(w.chat_ui ?? "").includes("R"),
      guest: String(w.chat_ui ?? "").includes("h") && !String(w.chat_ui ?? "").includes("R"),
      userId: String(w.chat_id ?? ""),
      sessionId: String(w.chat_sid ?? ""),
      channel: String(w.chat_channel ?? ""),
      authDead: !!w.chatout_auth_dead
    };
    emit({ type: "session", session: { ...session } });
    let prevChannel = session.channel;
    let prevAuthDead = session.authDead;
    timer = setInterval(() => {
      const newChannel = String(unsafeWindow.chat_channel ?? "");
      const newAuthDead = !!unsafeWindow.chatout_auth_dead;
      if (newChannel !== prevChannel || newAuthDead !== prevAuthDead) {
        prevChannel = session.channel = newChannel;
        prevAuthDead = session.authDead = newAuthDead;
        emit({ type: "session", session: { ...session } });
      }
    }, 2e3);
    cclog("session: init done \u2014 nick=" + session.nick + " channel=" + session.channel, "v3");
  }

  // src/v3/commands.ts
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

  // src/v3/input.ts
  var textarea = null;
  var onSubmitOrig = null;
  var currentWhisperNick = "";
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
            cclog("/id stubbed (T13): " + (cmd.name || "self"), "v3");
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
  async function superwhisper(whispernick, toggle = true) {
    const prevNick = await getConfig("whisper", "");
    if (toggle && whispernick && prevNick.toLowerCase() === whispernick.toLowerCase() || !whispernick) {
      await setConfig("whisper", "");
      currentWhisperNick = "";
      if (textarea) {
        textarea.classList.remove("bcc-superwhisper");
        textarea.placeholder = "Du chattest mit allen...\n\nSuperwhisper: /sw Sariam  |  Ban: /sb Wendigo  |  Hilfe: /help";
      }
    } else {
      await setConfig("whisper", whispernick);
      currentWhisperNick = whispernick;
      if (textarea) {
        textarea.classList.add("bcc-superwhisper");
        textarea.placeholder = "Du fl\xFCsterst mit " + whispernick + "...\n\nSuperwhisper aus: /open  |  /o Hi All :)  |  Hilfe: /help";
      }
    }
  }
  function mountInput() {
    const inputArea = document.querySelector(".bcc-input");
    if (!inputArea) return;
    inputArea.innerHTML = "";
    textarea = document.createElement("textarea");
    textarea.className = "bcc-input-field";
    textarea.rows = 3;
    textarea.placeholder = "Du chattest mit allen...\n\nSuperwhisper: /sw Sariam  |  Ban: /sb Wendigo  |  Hilfe: /help";
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        doSubmit();
      }
    });
    inputArea.appendChild(textarea);
    const holdForm = document.querySelector('form[name="hold"]');
    let onSubmitOrigStr = holdForm?.getAttribute("onsubmit") || "";
    if (onSubmitOrigStr) {
      onSubmitOrigStr = onSubmitOrigStr.replace(
        'if((msg.indexOf("/")!=0||msg.indexOf("/me ")==0)){',
        'if((msg.indexOf("/")!=0||msg.indexOf("/me ")==0||msg.indexOf("/w ")==0)){'
      );
      onSubmitOrig = new Function(onSubmitOrigStr);
    }
    unsafeWindow.bettercc.onSubmit = doSubmit;
    unsafeWindow.bettercc.superwhisper = superwhisper;
    getConfig("whisper", "").then((nick) => {
      const n = nick || "";
      if (n) superwhisper(n, false);
    });
    cclog("input mounted \u2014 textarea + send contract + superwhisper", "v3");
  }

  // src/v3/footer.ts
  var reloadBtn = null;
  function pillButton(icon, title, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bcc-pill";
    btn.title = title;
    btn.innerHTML = '<i class="fas ' + icon + '"></i>';
    btn.addEventListener("click", onClick);
    return btn;
  }
  function buildReloadBtn() {
    return pillButton("fa-sync", "Chat neu laden", () => {
      unsafeWindow.bettercc.reloadChat();
    });
  }
  function buildAutoscrollBtn() {
    const btn = pillButton("fa-angle-double-down", "Autoscroll ein/aus", () => {
      const cb2 = document.querySelector('form[name="OF"] input[name="AS"]');
      if (cb2) cb2.click();
      btn.classList.toggle("bcc-active", cb2?.checked ?? false);
    });
    const cb = document.querySelector('form[name="OF"] input[name="AS"]');
    if (cb?.checked) btn.classList.add("bcc-active");
    return btn;
  }
  function buildHelpBtn() {
    return pillButton("fa-question", "Hilfe", () => {
      printHelp();
    });
  }
  function buildSettingsBtn() {
    return pillButton("fa-cog", "Einstellungen", () => {
      cclog("settings clicked \u2014 stub (T10)", "v3");
    });
  }
  function buildExitBtn() {
    return pillButton("fa-sign-out-alt", "Verlassen", () => {
      const w = unsafeWindow;
      if (typeof w.bye === "function") w.bye();
    });
  }
  function buildOnlineCount() {
    const span = document.createElement("span");
    span.className = "bcc-online-count";
    const render = (n) => {
      span.textContent = String(n) + " online";
    };
    render(Math.floor((unsafeWindow.cha_my?.length ?? 0) / 2));
    subscribe((e) => {
      if (e.type === "userlist") render(e.users.length);
    });
    return span;
  }
  function patchSetStatus() {
    const w = unsafeWindow;
    if (typeof w.chatout_setstatus !== "function") return;
    const orig = w.chatout_setstatus;
    w.chatout_setstatus = function(text, color, bold) {
      if (reloadBtn) {
        reloadBtn.style.color = color || "#888";
        reloadBtn.title = "Chat neu laden \u2014 " + text;
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
  function mountFooter() {
    const footerEl = document.querySelector(".bcc-footer");
    if (!footerEl) return;
    injectFontAwesome();
    const onlineCount = buildOnlineCount();
    reloadBtn = buildReloadBtn();
    const autoscrollBtn = buildAutoscrollBtn();
    const helpBtn = buildHelpBtn();
    const settingsBtn = buildSettingsBtn();
    const exitBtn = buildExitBtn();
    const left = document.createElement("div");
    left.className = "bcc-footer-left";
    left.appendChild(onlineCount);
    left.appendChild(autoscrollBtn);
    const center = document.createElement("div");
    center.className = "bcc-footer-center";
    center.appendChild(reloadBtn);
    center.appendChild(helpBtn);
    center.appendChild(settingsBtn);
    const right = document.createElement("div");
    right.className = "bcc-footer-right";
    right.appendChild(exitBtn);
    footerEl.innerHTML = "";
    footerEl.appendChild(left);
    footerEl.appendChild(center);
    footerEl.appendChild(right);
    patchSetStatus();
    cclog("footer mounted \u2014 pills + FA + setstatus patch", "v3");
  }

  // src/v3/index.ts
  function neuterResizeFix() {
    unsafeWindow.resize_fix = function resize_fix() {
      return true;
    };
    clearTimeout(unsafeWindow.size_timeout);
    clearInterval(unsafeWindow.size_interval);
  }
  function initV3() {
    cclog("v3 init (parent-page rewrite, iteration 1)");
    const v3Css = GM_getResourceText("v3_css");
    if (v3Css) GM_addStyle(v3Css);
    neuterResizeFix();
    initSession();
    const schemeRef = { current: null };
    loadTheme(getUserKey("color"), getUserKey("colorscheme")).then((scheme) => {
      schemeRef.current = scheme;
    });
    unsafeWindow.bettercc.setTheme = function setTheme() {
      if (schemeRef.current) applyScheme(schemeRef.current);
    };
    overrideSetUinfo1();
    unsafeWindow.bettercc.reloadChat = reloadChat;
    buildShell();
    hookChatoutConnect();
    mountSidebar();
    mountInput();
    mountFooter();
  }

  // src/theme.ts
  function doColorStuff(userStoreColor, userStoreColorScheme, bgDef, fgDef, printHelpFn, showSettingsModalFn, cclogFn) {
    const rOffTable = document.querySelector("#r_off1 table");
    if (rOffTable) rOffTable.setAttribute("border", "0");
    const uStats = document.querySelector("#u_stats");
    if (uStats) uStats.style.display = "none";
    waitForElements(
      "#u_stats a.unc .value",
      function(_el) {
        const nameSpans = document.querySelectorAll("#u_stats span.name");
        nameSpans.forEach((s) => s.remove());
        const uStatsClone = document.querySelector("#u_stats").cloneNode(true);
        uStatsClone.id = "u_stats_clone";
        uStatsClone.style.display = "";
        document.querySelector("#u_stats").after(uStatsClone);
        const cloneValues = uStatsClone.querySelectorAll(".value");
        cloneValues.forEach((v) => v.remove());
        const uonlA = uStatsClone.querySelector("a.uonl");
        if (uonlA) uonlA.insertAdjacentHTML("beforeend", '<span id="uonl_span" class="fa-stack fa-2x has-badge value no" data-count="0">  <i class="fa fa-id-card fa-stack-1x"></i></span>');
        const ufriA = uStatsClone.querySelector("a.ufri");
        if (ufriA) ufriA.insertAdjacentHTML("beforeend", '<span id="ufri_span" class="fa-stack fa-2x has-badge value no" data-count="0">  <i class="fa fa-user-plus fa-stack-1x"></i></span>');
        const uncA = uStatsClone.querySelector("a.unc");
        if (uncA) uncA.insertAdjacentHTML("beforeend", '<span id="unc_span" class="fa-stack fa-2x has-badge value no" data-count="0">  <i class="fa fa-envelope fa-stack-1x"></i></span>');
        updateStats();
        setInterval(updateStats, 1e4);
      },
      true,
      100
    );
    function updateStats() {
      var test = new (unsafeWindow.ajax || window.ajax)(unsafeWindow.PAJAX + "chat_info_friends_nc.html", {
        update: "u_stats"
      });
      var uStatsEl = document.querySelector("#u_stats");
      var friendsOnline = uStatsEl?.querySelector("a.uonl .value")?.textContent || "0";
      var frendRequests = uStatsEl?.querySelector("a.ufri .value")?.textContent || "0";
      var mailCount = uStatsEl?.querySelector("a.unc .value")?.textContent || "0";
      const uonlSpan = document.querySelector("#uonl_span");
      if (uonlSpan) {
        uonlSpan.setAttribute("data-count", friendsOnline);
        uonlSpan.classList.toggle("no", Number(friendsOnline) < 1);
      }
      const ufriSpan = document.querySelector("#ufri_span");
      if (ufriSpan) {
        ufriSpan.setAttribute("data-count", frendRequests);
        ufriSpan.classList.toggle("no", Number(frendRequests) < 1);
      }
      const uncSpan = document.querySelector("#unc_span");
      if (uncSpan) {
        uncSpan.setAttribute("data-count", mailCount);
        uncSpan.classList.toggle("no", Number(mailCount) < 1);
      }
    }
    const ofForm = document.querySelector('form[name="OF"]');
    if (ofForm) {
      const wrapper = document.createElement("div");
      wrapper.id = "options";
      ofForm.parentNode?.insertBefore(wrapper, ofForm);
      wrapper.appendChild(ofForm);
    }
    const betterOpts = document.createElement("div");
    betterOpts.id = "betteroptions";
    document.querySelector("#options")?.appendChild(betterOpts);
    var colorWrap = document.createElement("label");
    colorWrap.htmlFor = "bgcolorpicker";
    colorWrap.className = "bcc-color-btn bcc-color-picker-wrap";
    colorWrap.style.setProperty("--swatch-color", "#ff0000");
    const bgPicker = document.createElement("input");
    bgPicker.type = "color";
    bgPicker.id = "bgcolorpicker";
    bgPicker.value = "#ff0000";
    bgPicker.className = "bcc-color-swatch-hidden";
    bgPicker.addEventListener("input", function() {
      var bg = this.value.substring(1);
      var fg = fgDef;
      colorWrap.style.setProperty("--swatch-color", this.value);
      (async () => {
        await GM.setValue(userStoreColor, bg);
      })();
      unsafeWindow.bettercc.setColors(bg, fg, 0);
    });
    bgPicker.addEventListener("change", function() {
      var bg = this.value.substring(1);
      (async () => {
        await GM.setValue(userStoreColor, bg);
      })();
    });
    colorWrap.appendChild(bgPicker);
    betterOpts.appendChild(colorWrap);
    const reloadBtn2 = document.createElement("button");
    reloadBtn2.id = "reloadbutton";
    reloadBtn2.type = "button";
    reloadBtn2.className = "bcc-icon-btn";
    reloadBtn2.title = "Chat neu laden (mimimi)";
    reloadBtn2.innerHTML = '<i class="fas fa-sync-alt"></i>';
    reloadBtn2.addEventListener("click", function() {
      unsafeWindow.bettercc.reloadChat();
    });
    betterOpts.appendChild(reloadBtn2);
    const helpBtn = document.createElement("button");
    helpBtn.id = "helpbutton";
    helpBtn.type = "button";
    helpBtn.className = "bcc-icon-btn";
    helpBtn.title = "BetterCC Hilfe";
    helpBtn.innerHTML = '<i class="fas fa-question-circle"></i>';
    helpBtn.addEventListener("click", function() {
      printHelpFn();
    });
    betterOpts.appendChild(helpBtn);
    const settingsBtn = document.createElement("button");
    settingsBtn.id = "settingsbutton";
    settingsBtn.type = "button";
    settingsBtn.className = "bcc-icon-btn";
    settingsBtn.title = "BetterCC Settings";
    settingsBtn.innerHTML = '<i class="fas fa-cog"></i>';
    settingsBtn.addEventListener("click", function() {
      showSettingsModalFn();
    });
    betterOpts.appendChild(settingsBtn);
    setTimeout(setTheme, 1e3);
    unsafeWindow.bettercc.reloadChat = function reloadChat2() {
      if (unsafeWindow.chatout_auth_dead) {
        cclogFn("reloadChat: auth_dead, doing full page reload");
        location.reload();
        return;
      }
      if (unsafeWindow.chatout_ws) {
        unsafeWindow.chatout_ws.close();
      }
      setTimeout(setTheme, 1e3);
    };
    function setTheme() {
      (async () => {
        let bg = await GM.getValue(userStoreColor, bgDef);
        await GM.setValue(userStoreColor, bg);
        let storedScheme = await GM.getValue(userStoreColorScheme, null);
        if (storedScheme && storedScheme.bgColor === bg) {
          applyStoredColors(storedScheme);
        } else {
          setColors(bg, fgDef);
        }
      })();
    }
    function applyStoredColors(colorScheme) {
      const root = document.documentElement;
      root.style.setProperty("--chatBackground", colorScheme.chatBg);
      root.style.setProperty("--chatText", colorScheme.chatFg);
      root.style.setProperty("--buttonColor", colorScheme.buttoncolor);
      root.style.setProperty("--buttonText", colorScheme.buttontextcolor);
      root.style.setProperty("--inputBackground", colorScheme.inputcolor);
      root.style.setProperty("--inputText", colorScheme.inputtextcolor);
      root.style.setProperty("--ulistColor", colorScheme.ulistcolor);
      root.style.setProperty("--ulistText", colorScheme.ulisttextcolor);
      root.style.setProperty("--optionsText", colorScheme.optionstextcolor);
      root.style.setProperty("--footerBackground", colorScheme.footercolor);
      root.style.setProperty("--placeholderColor", colorScheme.placeholdercolor);
      root.style.setProperty("--iconColor", colorScheme.iconcolor);
      root.style.setProperty("--superwhispercolor", colorScheme.superwhispercolor);
      root.style.setProperty("--superbancolor", colorScheme.superbancolor);
      applyThemeToIframe(colorScheme.chatBg, colorScheme.chatFg);
      const bgPicker2 = document.getElementById("bgcolorpicker");
      if (bgPicker2) bgPicker2.value = "#" + colorScheme.bgColor;
      const colorWrap2 = document.querySelector(".bcc-color-picker-wrap");
      if (colorWrap2) colorWrap2.style.setProperty("--swatch-color", "#" + colorScheme.bgColor);
      const ul = document.getElementById("ul");
      if (ul) {
        if (tinycolor.isReadable(colorScheme.ulistcolor, colorScheme.ulisttextcolor, {})) {
          ul.classList.add("light");
          ul.classList.remove("dark");
        } else {
          ul.classList.add("dark");
          ul.classList.remove("light");
        }
      }
    }
    function setColors(bg, fg) {
      let chatBg = tinycolor(bg);
      let chatFg = tinycolor(bg);
      chatFg = tinycolor(bg);
      if (chatBg.isLight()) {
        chatFg = chatFg.darken(40);
      } else {
        chatFg = chatFg.lighten(20);
        chatFg = chatFg.brighten(40);
      }
      let anaChatBg = chatBg.analogous();
      let monoChatBg = chatBg.monochromatic();
      let triadChatBg = chatBg.triad();
      let anaChatFg = chatFg.analogous();
      let monoChatFg = chatFg.monochromatic();
      let triadChatFg = chatFg.triad();
      chatFg = tinycolor.mostReadable(chatBg, anaChatFg.concat(monoChatFg), {
        includeFallbackColors: false
      });
      const bgPicker2 = document.getElementById("bgcolorpicker");
      if (bgPicker2) bgPicker2.value = "#" + bg;
      let ulistcolor, footercolor, inputcolor, inputtextcolor, optionstextcolor, placeholdercolor, ulisttextcolor, buttoncolor, buttontextcolor, iconcolor, superwhispercolor, superbancolor;
      if (chatBg.toHsl().l > 0.8 || chatBg.toHsl().s >= 0.97 && chatBg.toHsl().l >= 0.45) {
        footercolor = chatBg.clone().darken(15).brighten(5);
      } else {
        footercolor = chatBg.clone().lighten(5).brighten(5);
      }
      ulistcolor = footercolor.clone().lighten(5);
      if (footercolor.toHsl().l < 0.2) {
        inputcolor = footercolor.clone().darken(10).desaturate(0);
      } else {
        inputcolor = footercolor.clone().brighten(30).desaturate(0);
      }
      inputtextcolor = tinycolor.mostReadable(
        inputcolor,
        inputcolor.monochromatic(),
        { includeFallbackColors: false }
      );
      optionstextcolor = tinycolor.mostReadable(
        footercolor,
        monoChatBg.concat(anaChatBg),
        { includeFallbackColors: false }
      );
      placeholdercolor = tinycolor.mostReadable(
        inputcolor,
        inputcolor.monochromatic(),
        { includeFallbackColors: false }
      );
      let shades = [];
      for (var i = 10; i <= 50; i += 10) {
        shades.push(ulistcolor.clone().darken(i));
        shades.push(ulistcolor.clone().darken(-i));
      }
      ulisttextcolor = tinycolor.mostReadable(
        ulistcolor,
        monoChatBg.concat(shades),
        { includeFallbackColors: false }
      );
      buttoncolor = inputcolor;
      buttontextcolor = tinycolor.mostReadable(buttoncolor, monoChatBg, {
        includeFallbackColors: false
      });
      iconcolor = tinycolor.mostReadable(ulistcolor, monoChatBg, {
        includeFallbackColors: false
      });
      superwhispercolor = triadChatBg[1];
      superbancolor = triadChatBg[2];
      let colorScheme = {
        bgColor: bg,
        chatBg: chatBg.toHslString(),
        chatFg: chatFg.toHslString(),
        buttoncolor: buttoncolor.toHslString(),
        buttontextcolor: buttontextcolor.toHslString(),
        inputcolor: inputcolor.toHslString(),
        inputtextcolor: inputtextcolor.toHslString(),
        ulistcolor: ulistcolor.toHslString(),
        ulisttextcolor: ulisttextcolor.toHslString(),
        optionstextcolor: optionstextcolor.toHslString(),
        footercolor: footercolor.toHslString(),
        placeholdercolor: placeholdercolor.toHslString(),
        iconcolor: iconcolor.toHslString(),
        superwhispercolor: superwhispercolor.toHslString(),
        superbancolor: superbancolor.toHslString()
      };
      (async () => {
        await GM.setValue(userStoreColorScheme, colorScheme);
      })();
      applyStoredColors(colorScheme);
    }
    if (!window.betterccColorObserver) {
      const root = document.documentElement;
      let isApplyingColors = false;
      window.betterccColorObserver = new MutationObserver(async (mutations) => {
        if (isApplyingColors) return;
        for (const mutation of mutations) {
          if (mutation.type === "attributes" && mutation.attributeName === "style") {
            try {
              isApplyingColors = true;
              let bg = await GM.getValue(userStoreColor, bgDef);
              let storedScheme = await GM.getValue(userStoreColorScheme, null);
              cclogFn("Color mutation detected");
              if (storedScheme && storedScheme.bgColor === bg) {
                cclogFn("Reapplying stored colors for " + bg);
                applyStoredColors(storedScheme);
              } else {
                setTheme();
              }
            } finally {
              isApplyingColors = false;
            }
            break;
          }
        }
      });
      window.betterccColorObserver.observe(root, { attributes: true, attributeFilter: ["style"] });
    }
    unsafeWindow.bettercc.setColors = setColors;
    unsafeWindow.bettercc.setTheme = setTheme;
  }

  // src/ui.ts
  function showSettingsModal(userStore2) {
    const modalOverlay = document.createElement("div");
    modalOverlay.style.position = "fixed";
    modalOverlay.style.top = "0";
    modalOverlay.style.left = "0";
    modalOverlay.style.width = "100%";
    modalOverlay.style.height = "100%";
    modalOverlay.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    modalOverlay.style.zIndex = "1000";
    const modal = document.createElement("div");
    modal.style.position = "fixed";
    modal.style.top = "50%";
    modal.style.left = "50%";
    modal.style.transform = "translate(-50%, -50%)";
    modal.style.width = "400px";
    modal.style.padding = "20px";
    modal.style.color = "var(--inputText)";
    modal.style.backgroundColor = "var(--inputBackground)";
    modal.style.boxShadow = "0 0 10px rgba(0, 0, 0, 0.2)";
    modal.style.zIndex = "1001";
    const modalTitle = document.createElement("h2");
    modalTitle.textContent = `Settings for ${userStore2}`;
    modal.appendChild(modalTitle);
    const settingsContainer = document.createElement("div");
    modal.appendChild(settingsContainer);
    const closeButton = document.createElement("button");
    closeButton.textContent = "Close";
    closeButton.style.marginTop = "10px";
    closeButton.addEventListener("click", () => {
      document.body.removeChild(modalOverlay);
    });
    modal.appendChild(closeButton);
    modalOverlay.appendChild(modal);
    document.body.appendChild(modalOverlay);
    GM.listValues().then((keys) => {
      const userKeys = keys.filter((key) => key.endsWith("_" + userStore2));
      userKeys.forEach((key) => {
        GM.getValue(key).then((value) => {
          const settingRow = document.createElement("div");
          settingRow.style.marginBottom = "10px";
          const keyLabel = document.createElement("label");
          keyLabel.textContent = key.replace(userStore2 + "_", "");
          keyLabel.style.display = "block";
          settingRow.appendChild(keyLabel);
          const valueInput = document.createElement("textarea");
          valueInput.style.width = "100%";
          valueInput.style.minHeight = "40px";
          valueInput.style.fontFamily = "monospace";
          valueInput.style.fontSize = "12px";
          if (typeof value === "object" && value !== null) {
            valueInput.value = JSON.stringify(value, null, 2);
            valueInput.style.height = "120px";
          } else {
            valueInput.value = value;
            valueInput.style.height = "40px";
          }
          settingRow.appendChild(valueInput);
          settingsContainer.appendChild(settingRow);
        });
      });
    });
  }
  function forceNoChatBackgrounds() {
  }
  function addCustomCss() {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://use.fontawesome.com/releases/v6.5.1/css/all.css";
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
    var main_css = GM_getResourceText("main_css");
    if (main_css) GM_addStyle(main_css);
  }
  function cleanup() {
    waitForElements(
      "script[src^='https://www.chatcity.de/cc_chat/ulist?AKTION']",
      function(el) {
        const allScripts = document.head.querySelectorAll(
          "script[src^='https://www.chatcity.de/cc_chat/ulist?AKTION']"
        );
        for (let i = 0; i < allScripts.length - 1; i++) {
          allScripts[i].remove();
        }
      },
      false,
      3e4
    );
    const popup = document.querySelector("#popup-chat");
    if (popup) {
      popup.removeAttribute("ondragstart");
      popup.removeAttribute("ondrop");
    }
    const gaScript = document.head.querySelector("script[src='https://ssl.google-analytics.com/ga.js']");
    if (gaScript) gaScript.remove();
    document.querySelector("#adv720")?.remove();
    document.querySelector("#right_ad")?.remove();
    const adFrame = document.querySelector('#r_off1 table iframe[src="https://www.chatcity.de/cc_chat/html?PAGE=300x250.html"]');
    if (adFrame) {
      const tr = adFrame.closest("tr");
      if (tr) tr.remove();
    }
    document.querySelector("#popup-chat > table > tbody > tr:nth-child(1)")?.remove();
    document.querySelector("#ulscrollhelper")?.remove();
    document.querySelector("#ul")?.classList.add("headless");
    document.querySelectorAll(".chat_i1").forEach((el) => el.remove());
    const exitBtn = document.querySelector(".b7");
    if (exitBtn) exitBtn.setAttribute("onclick", "bye()");
    unsafeWindow.resize_fix = function resize_fix() {
      return true;
    };
    clearTimeout(unsafeWindow.size_timeout);
    clearInterval(unsafeWindow.size_interval);
  }
  function betterUserList(userStore2) {
    const fuu2 = document.querySelector("#fuu");
    if (fuu2) fuu2.insertAdjacentHTML(
      "beforeend",
      '<a href="javascript://" class="button pinuser" id="pinUser" onclick="bettercc.addPinnedUser(last_id)">\xBB Pin</a>'
    );
    let userStorePinnedUsers = "pinned_" + userStore2;
    unsafeWindow.bettercc.addPinnedUser = async function(username) {
      username = username.toLowerCase();
      let pinnedUsers = GM_getValue(userStorePinnedUsers, []);
      if (!pinnedUsers.includes(username)) {
        pinnedUsers.push(username);
      } else {
        pinnedUsers = pinnedUsers.filter(function(item) {
          return String(item) !== username;
        });
      }
      GM_setValue(userStorePinnedUsers, pinnedUsers);
      unsafeWindow.set_uinfo1();
      const popup3 = document.querySelector(".ulist-popup");
      if (popup3) popup3.style.display = "none";
    };
    function getPinnedUsers() {
      return Array.from(GM_getValue(userStorePinnedUsers, [])).map((v) => v.toLowerCase()).sort();
    }
    function waitForSetUinfo1Function() {
      if (typeof unsafeWindow.set_uinfo1 === "function") {
        redefineSetUinfo1Function();
      } else {
        setTimeout(waitForSetUinfo1Function, 100);
      }
    }
    function redefineSetUinfo1Function() {
      function createUserDisplayElement(username, value, isCurrentUser) {
        let classes = [];
        let indicators = [];
        if (value.includes("S")) {
          classes.push("u_sep");
          indicators.push("S");
        }
        if (value.includes("A")) {
          classes.push("u_away");
          indicators.push("A");
        }
        const classAttr = classes.length > 0 ? `class="${classes.join(" ")}"` : "";
        const indicatorHtml = indicators.length > 0 ? `<span class="user_status_indicator">[${indicators.join(
          "]["
        )}]</span>` : "";
        if (isCurrentUser) {
          return `<span ${classAttr}>\xBB ${username} ${indicatorHtml}</span><br>`;
        } else {
          return `<a href="javascript://" onclick="open_utn('fuu',this,-25,-50,'${username}',event,'${value}');" id="${username}" ${classAttr} target="leer">\xBB ${username} ${indicatorHtml}</a><br>`;
        }
      }
      unsafeWindow.set_uinfo1 = function() {
        unsafeWindow.chat_channel = unsafeWindow.cha_channel;
        let num = 0;
        const pinnedUsersNames = getPinnedUsers();
        let pinnedUsers = [];
        let regularUsers = [];
        for (let g = 0; g < unsafeWindow.cha_my.length; g += 2) {
          const username = unsafeWindow.cha_my[g];
          const value = unsafeWindow.cha_my[g + 1];
          if (username) {
            const isCurrentUser = username === unsafeWindow.chat_nick;
            const userElement = createUserDisplayElement(
              username,
              value,
              isCurrentUser
            );
            if (pinnedUsersNames.includes(username.toLowerCase())) {
              pinnedUsers.push(userElement);
            } else {
              regularUsers.push(userElement);
            }
            num++;
          }
        }
        let uli = pinnedUsers.join("");
        if (pinnedUsers.length > 0 && regularUsers.length > 0) {
          uli += '<div class="pinnedusergap"></div>';
        }
        uli += regularUsers.join("");
        unsafeWindow.setInnerHTML("ul", uli);
        unsafeWindow.setInnerHTML("uinfo", num);
      };
    }
    waitForSetUinfo1Function();
  }
  function betterInput(replace) {
    var form = null;
    var originalInput = null;
    try {
      form = document.querySelector('form[name="hold"]');
      if (!form) {
        throw new Error('Form with name "hold" not found.');
      }
      const inputText = form.querySelector('input[type="text"]');
      if (!inputText) {
        throw new Error('Input of type "text" not found in the form.');
      }
      if (replace) {
        const newTextarea = document.createElement("textarea");
        newTextarea.id = "custom_input_text";
        newTextarea.placeholder = "Du chattest mit allen...";
        newTextarea.maxLength = 1024;
        newTextarea.name = "OUT1";
        newTextarea.rows = 3;
        newTextarea.wrap = "soft";
        originalInput = inputText.cloneNode(true);
        inputText.replaceWith(newTextarea);
        newTextarea.addEventListener("keypress", function(e) {
          if (e.key === "Enter" && !e.shiftKey) {
            form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
            e.preventDefault();
          }
        });
      } else {
        inputText.id = "custom_input_text";
        inputText.placeholder = "Du chattest mit allen...";
      }
    } catch (error) {
      cclog("betterInput error: " + error.message);
      if (replace && originalInput && form) {
        const customInput = form.querySelector("#custom_input_text");
        if (customInput) customInput.replaceWith(originalInput);
      }
    }
  }
  function redesignFooter() {
    var footerTable = document.querySelector(".ww_chat_footer_table");
    if (!footerTable) return;
    var rows = footerTable.querySelectorAll(":scope > tbody > tr");
    if (rows.length < 2) return;
    var firstRow = rows[0];
    var secondRow = rows[1];
    var actionCell = firstRow.querySelector("td.chat_i3");
    var exitCell = firstRow.querySelector("td.chat_i4");
    var colorCell = secondRow.querySelector("td.chat_i4");
    if (!actionCell || !colorCell) return;
    var holdForm = document.querySelector("form[name='hold']");
    var autoscrollForm = document.querySelector("form[name='OF']");
    var statusSpan = document.querySelector("#chatout_status");
    var debugTools = document.querySelector("#chatout_debug_tools");
    var asCheckbox = autoscrollForm?.querySelector('input[name="AS"]');
    var colorWrap = document.querySelector(".bcc-color-picker-wrap");
    var reloadBtn2 = document.querySelector("#reloadbutton");
    var helpBtn = document.querySelector("#helpbutton");
    var settingsBtn = document.querySelector("#settingsbutton");
    var anmelden = actionCell.querySelector("a.b3");
    var abmelden = actionCell.querySelector("a.b2");
    var sysMsgsOn = actionCell.querySelector("a.b5");
    var sysMsgsOff = actionCell.querySelector("a.b6");
    var forumLink = actionCell.querySelector("a.b15");
    var idLink = actionCell.querySelector("a.b16");
    var upHelpLink = actionCell.querySelector("a.b1");
    var colorLinks = colorCell.querySelectorAll("a");
    var exitLink = exitCell?.querySelector("a");
    if (autoscrollForm) autoscrollForm.style.display = "none";
    var autoscrollBtn = document.createElement("button");
    autoscrollBtn.id = "bcc-autoscroll";
    autoscrollBtn.type = "button";
    autoscrollBtn.className = "bcc-icon-btn" + (asCheckbox?.checked ? " bcc-active" : "");
    autoscrollBtn.title = "Autoscroll ein/aus";
    autoscrollBtn.innerHTML = '<i class="fas fa-angle-double-down"></i>';
    autoscrollBtn.addEventListener("click", function() {
      if (asCheckbox) asCheckbox.click();
      autoscrollBtn.classList.toggle("bcc-active", asCheckbox?.checked || false);
    });
    if (statusSpan) statusSpan.style.display = "none";
    if (typeof unsafeWindow.chatout_setstatus === "function") {
      var origSetStatus = unsafeWindow.chatout_setstatus;
      unsafeWindow.chatout_setstatus = function(text, color, bold) {
        var el = document.getElementById("chatout_status");
        if (el) el.title = text;
        var reloadBtnEl = document.getElementById("reloadbutton");
        if (reloadBtnEl) {
          reloadBtnEl.style.color = color || "#888";
          reloadBtnEl.title = "Chat neu laden \u2014 " + text;
        }
        origSetStatus.call(this, text, color, bold);
      };
    }
    [anmelden, abmelden, sysMsgsOn, sysMsgsOff, forumLink, idLink, upHelpLink].forEach(function(el) {
      if (el) el.classList.add("bcc-icon-btn");
    });
    var accountAlertsPill = document.createElement("div");
    accountAlertsPill.className = "bcc-pill bcc-pill-2";
    [anmelden, sysMsgsOn, abmelden, sysMsgsOff].forEach(function(el) {
      if (el) accountAlertsPill.appendChild(el);
    });
    var chatActionsPill = document.createElement("div");
    chatActionsPill.className = "bcc-pill bcc-pill-2 bcc-chat-actions";
    [autoscrollBtn, reloadBtn2, colorWrap].forEach(function(el) {
      if (el) chatActionsPill.appendChild(el);
    });
    var betterccPill = document.createElement("div");
    betterccPill.className = "bcc-pill";
    [helpBtn, settingsBtn].forEach(function(el) {
      if (el) betterccPill.appendChild(el);
    });
    var colorPill = document.createElement("div");
    colorPill.className = "bcc-pill bcc-pill-3";
    colorLinks.forEach(function(link) {
      link.classList.add("bcc-color-btn");
      colorPill.appendChild(link);
    });
    var linksPill = document.createElement("div");
    linksPill.className = "bcc-pill bcc-pill-2 bcc-links";
    [idLink, forumLink, upHelpLink].forEach(function(el) {
      if (el) linksPill.appendChild(el);
    });
    if (exitLink) exitLink.classList.add("bcc-icon-btn", "bcc-danger");
    var betterOpts = document.querySelector("#betteroptions");
    if (betterOpts) betterOpts.remove();
    var inputArea = document.createElement("div");
    inputArea.className = "bcc-input-area";
    [holdForm, debugTools, statusSpan].forEach(function(el) {
      if (el) inputArea.appendChild(el);
    });
    var footer = document.createElement("div");
    footer.className = "bcc-footer";
    [inputArea, accountAlertsPill, chatActionsPill, betterccPill, colorPill, linksPill, exitLink].forEach(function(el) {
      if (el) footer.appendChild(el);
    });
    footerTable.replaceWith(footer);
  }
  function showIdPopup(prename) {
    const existing = document.querySelector(".bcc-id-overlay");
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.className = "bcc-id-overlay";
    const card = document.createElement("div");
    card.className = "bcc-id-card";
    const header = document.createElement("div");
    header.className = "bcc-id-header";
    const title = document.createElement("span");
    title.className = "bcc-id-title";
    title.textContent = "ID Suche";
    header.appendChild(title);
    const closeBtn = document.createElement("button");
    closeBtn.className = "bcc-id-close";
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    header.appendChild(closeBtn);
    const searchArea = document.createElement("div");
    searchArea.className = "bcc-id-search";
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Username...";
    searchInput.value = prename;
    const searchBtn = document.createElement("button");
    searchBtn.textContent = "Suchen";
    searchArea.appendChild(searchInput);
    searchArea.appendChild(searchBtn);
    const results = document.createElement("div");
    results.className = "bcc-id-results";
    const loadingEl = document.createElement("div");
    loadingEl.className = "bcc-id-loading";
    loadingEl.textContent = "Wird geladen...";
    let activeRequest = false;
    function stripThumbnailSuffix(url) {
      return url.replace(/_(\d+)\.jpg$/i, ".jpg");
    }
    function renderError(msg) {
      results.innerHTML = "";
      const err = document.createElement("div");
      err.className = "bcc-id-error";
      err.textContent = msg;
      results.appendChild(err);
    }
    let previewEl;
    function renderResults(html) {
      results.innerHTML = "";
      if (!html || html.length < 30) {
        renderError("Kein Ergebnis gefunden.");
        return;
      }
      const tmp = document.createElement("div");
      tmp.innerHTML = html;
      const valueDivs = tmp.querySelectorAll(".value");
      const rows = [];
      for (let i = 0; i < valueDivs.length; i++) {
        const div = valueDivs[i];
        const img = div.querySelector("img[src*='userfiles']");
        const link = div.querySelector("a[href*='/id/']");
        if (img && !link) {
          const nextDiv = valueDivs[i + 1];
          if (nextDiv) {
            const nameLink = nextDiv.querySelector("a[href*='/id/']");
            if (nameLink) {
              const name = (nameLink.textContent || "").trim().replace(/^»\s*/, "");
              rows.push({ name: name || "Unbekannt", href: nameLink.href, imgUrl: img.src });
              i++;
            }
          }
        } else if (link && !img) {
          const name = (link.textContent || "").trim().replace(/^»\s*/, "");
          if (name) rows.push({ name, href: link.href, imgUrl: null });
        } else if (img && link) {
          const name = (link.textContent || "").trim().replace(/^»\s*/, "");
          if (!name) {
            const nextDiv = valueDivs[i + 1];
            if (nextDiv) {
              const nameLink = nextDiv.querySelector("a[href*='/id/']");
              if (nameLink) {
                const realName = (nameLink.textContent || "").trim().replace(/^»\s*/, "");
                rows.push({ name: realName || "Unbekannt", href: nameLink.href, imgUrl: img.src });
                i++;
                continue;
              }
            }
          }
          rows.push({ name: name || "Unbekannt", href: link.href, imgUrl: img.src });
        }
      }
      if (rows.length === 0) {
        renderError("Kein Ergebnis gefunden.");
        return;
      }
      rows.forEach(function(row) {
        const rowEl = document.createElement("div");
        rowEl.className = "bcc-id-row";
        if (row.imgUrl) {
          const thumb = document.createElement("img");
          thumb.src = row.imgUrl;
          thumb.className = "bcc-id-thumb";
          const fullUrl = stripThumbnailSuffix(row.imgUrl);
          if (fullUrl !== row.imgUrl && !/default/i.test(fullUrl)) {
            thumb.classList.add("bcc-id-thumb-clickable");
            thumb.title = "Bild in voller Gr\xF6\xDFe \xF6ffnen";
            thumb.addEventListener("click", function(e) {
              e.stopPropagation();
              window.open(fullUrl, "_blank");
            });
            thumb.addEventListener("mouseenter", function(e) {
              previewEl.src = fullUrl;
              previewEl.style.display = "block";
              previewEl.style.left = e.clientX + 16 + "px";
              previewEl.style.top = e.clientY - 75 + "px";
            });
            thumb.addEventListener("mousemove", function(e) {
              if (previewEl.style.display === "block") {
                previewEl.style.left = e.clientX + 16 + "px";
                previewEl.style.top = e.clientY - 75 + "px";
              }
            });
            thumb.addEventListener("mouseleave", function() {
              previewEl.style.display = "none";
            });
          }
          thumb.addEventListener("error", function() {
            thumb.style.display = "none";
          });
          rowEl.appendChild(thumb);
        }
        const nameLink = document.createElement("a");
        nameLink.textContent = row.name;
        nameLink.href = row.href;
        nameLink.target = "_blank";
        nameLink.className = "bcc-id-name";
        nameLink.title = "ID-Card \xF6ffnen";
        rowEl.appendChild(nameLink);
        results.appendChild(rowEl);
      });
    }
    function doSearch(name) {
      if (!name) return;
      results.innerHTML = "";
      results.appendChild(loadingEl);
      activeRequest = true;
      const pajax = unsafeWindow.PAJAX || "https://www.chatcity.de/de/";
      const url = pajax + "obj_list.html";
      const AjaxLib = unsafeWindow.ajax || window.ajax;
      const params = [
        "TYP=1",
        "_EN_OBJ_ORDER_SORT_SHOW=",
        "ORD=0",
        "SORT=1",
        "START=0",
        "_LIST_WRAPPER_ID=bccid",
        "EXT=allbychar",
        "_KW_allbychar=" + encodeURIComponent(name),
        "LOADDEF=3",
        "LOADDEF_EXTRA_USER=",
        "LOADDEF_EXTRA=",
        "_LIST_LINK_ALL=",
        "STYP=",
        "LOADDEF_CUSTOM=allbychar",
        "CACHE=3600",
        "OPENW=1",
        "ISCHAT=1"
      ].join("&");
      const failTimer = setTimeout(function() {
        if (!activeRequest) return;
        activeRequest = false;
        renderError("Zeit\xFCberschreitung \u2014 ID-Card kann trotzdem ge\xF6ffnet werden.");
      }, 8e3);
      new AjaxLib(url, {
        postBody: params,
        onComplete: function(transport) {
          clearTimeout(failTimer);
          if (!activeRequest) return;
          activeRequest = false;
          try {
            const html = transport.responseText || "";
            if (html && html.length > 30) {
              renderResults(html);
            } else {
              renderError("Kein Ergebnis gefunden.");
            }
          } catch (e) {
            renderError("Fehler beim Verarbeiten der Antwort.");
          }
        }
      });
    }
    card.appendChild(header);
    card.appendChild(searchArea);
    card.appendChild(results);
    overlay.appendChild(card);
    previewEl = document.createElement("img");
    previewEl.id = "bcc-id-thumb-preview";
    previewEl.className = "bcc-id-thumb-preview";
    overlay.appendChild(previewEl);
    document.body.appendChild(overlay);
    if (!prename) searchInput.focus();
    function closePopup() {
      activeRequest = false;
      dragging = false;
      overlay.remove();
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }
    function onKeyDown(e) {
      if (e.key === "Escape") closePopup();
    }
    closeBtn.addEventListener("click", closePopup);
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) closePopup();
    });
    document.addEventListener("keydown", onKeyDown);
    card.addEventListener("click", function(e) {
      e.stopPropagation();
    });
    let dragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let cardStartLeft = 0;
    let cardStartTop = 0;
    header.addEventListener("mousedown", function(e) {
      if (e.target.closest(".bcc-id-close")) return;
      dragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const rect = card.getBoundingClientRect();
      cardStartLeft = rect.left;
      cardStartTop = rect.top;
      card.style.translate = "0 0";
      card.style.left = cardStartLeft + "px";
      card.style.top = cardStartTop + "px";
      e.preventDefault();
    });
    function onMouseMove(e) {
      if (!dragging) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      let left = cardStartLeft + dx;
      let top = cardStartTop + dy;
      left = Math.max(0, Math.min(left, window.innerWidth - card.offsetWidth));
      top = Math.max(0, Math.min(top, window.innerHeight - card.offsetHeight));
      card.style.left = left + "px";
      card.style.top = top + "px";
    }
    function onMouseUp() {
      dragging = false;
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    searchInput.addEventListener("keydown", function(e) {
      if (e.key === "Enter") doSearch(searchInput.value.trim());
    });
    searchBtn.addEventListener("click", function() {
      doSearch(searchInput.value.trim());
    });
    if (prename) doSearch(prename);
  }

  // src/commands.ts
  function replaceOnSubmit(userStore2) {
    let userStoreWhisper = "whisper_" + userStore2;
    const holdForm = document.querySelector('form[name="hold"]');
    let onSubmitOrigStr = holdForm?.getAttribute("onsubmit") || "";
    onSubmitOrigStr = onSubmitOrigStr.replace(
      'if((msg.indexOf("/")!=0||msg.indexOf("/me ")==0)){',
      'if((msg.indexOf("/")!=0||msg.indexOf("/me ")==0||msg.indexOf("/w ")==0)){'
    );
    let onSubmitOrig2 = new Function(onSubmitOrigStr);
    unsafeWindow.bettercc.onSubmit = async function(whispernick) {
      let openMsgCmdRegex2 = /^\/open\s|^\/o\s/;
      let openMsgReplaceRegex2 = /^\/open\s+|^\/o\s+/gi;
      let superbanMsgCmdRegex2 = /^\/superban\s|^\/sb\s/;
      let superbanMsgReplaceRegex2 = /^\/superban\s+|^\/sb\s+/gi;
      let superwhisperMsgCmdRegex2 = /^\/superwhisper\s|^\/sw\s/;
      let superwhisperMsgReplaceRegex2 = /^\/superwhisper\s+|^\/sw\s+/gi;
      let docHold = document.hold;
      let mymsg = docHold.OUT1.value.trim();
      if (mymsg.toLowerCase() === "/bettercc" || mymsg.toLowerCase() === "/help") {
        printHelp();
        mymsg = "";
        docHold.OUT1.value = mymsg;
        return false;
      }
      if (superbanEnable) {
        if (mymsg.toLowerCase() === "/superban" || mymsg.toLowerCase() === "/sb") {
          let banlist = (await unsafeWindow.bettercc.getSuperbans()).join(", ").toString();
          let banlistNotify = (await unsafeWindow.bettercc.getSuperbans()).join("\n").toString();
          ccnotify(banlistNotify, "Better Ignore", "banlist", 3e4);
          mymsg = "";
          docHold.OUT1.value = mymsg;
          return false;
        }
        if (superbanMsgCmdRegex2.test(mymsg.toLowerCase())) {
          mymsg = mymsg.replace(superbanMsgReplaceRegex2, "").split(" ")[0];
          unsafeWindow.bettercc.superban(mymsg);
          cclog("Superban:" + mymsg);
          mymsg = "";
          docHold.OUT1.value = mymsg;
          return false;
        }
      }
      let idMsgCmdRegex2 = /^\/id\b/i;
      let idMsgArgRegex2 = /^\/id\s+/i;
      if (idMsgCmdRegex2.test(mymsg.toLowerCase())) {
        let name = mymsg.replace(idMsgArgRegex2, "").replace(/^\/id$/i, "").trim();
        unsafeWindow.bettercc.showIdPopup(name);
        mymsg = "";
        docHold.OUT1.value = mymsg;
        return false;
      }
      if (mymsg.toLowerCase() === "/open") {
        unsafeWindow.bettercc.superwhisper("");
        mymsg = "";
        docHold.OUT1.value = mymsg;
        return false;
      }
      if (mymsg.toLowerCase() === "/reload") {
        unsafeWindow.bettercc.reloadChat();
        mymsg = "";
        docHold.OUT1.value = mymsg;
        return false;
      }
      if (superwhisperMsgCmdRegex2.test(mymsg.toLowerCase())) {
        mymsg = mymsg.replace(superwhisperMsgReplaceRegex2, "").split(" ")[0];
        unsafeWindow.bettercc.superwhisper(mymsg, false);
        mymsg = "";
        docHold.OUT1.value = mymsg;
        return false;
      }
      if (openMsgCmdRegex2.test(mymsg.toLowerCase())) {
        mymsg = mymsg.replace(openMsgReplaceRegex2, "");
      } else if (whispernick !== void 0) {
        if (!mymsg.startsWith("/")) {
          mymsg = "/w " + whispernick + " " + mymsg;
        }
      }
      docHold.OUT1.value = mymsg;
      onSubmitOrig2();
    };
    if (holdForm) {
      holdForm.setAttribute("onsubmit", "bettercc.onSubmit();");
      holdForm.addEventListener("submit", function(e) {
        e.preventDefault();
      });
    }
    const fuuFourth = document.querySelector("#fuu > :nth-child(4)");
    if (fuuFourth) {
      fuuFourth.insertAdjacentHTML(
        "afterend",
        '<a href="javascript://" class="button superwhisper" id="superwhisper" onclick="bettercc.superwhisper(last_id);">\xBB Superwhisper</a>'
      );
    }
    (async function() {
      try {
        var whisperUser = await GM.getValue(userStoreWhisper);
      } catch {
        whisperUser = "";
      }
      await GM.setValue(userStoreWhisper, whisperUser);
      unsafeWindow.bettercc.superwhisper(whisperUser, false);
    })();
    unsafeWindow.bettercc.superwhisper = async function(whispernick, toggle = true) {
      let form = document.querySelector('form[name="hold"]');
      let input = document.getElementById("custom_input_text");
      let submitStr = null;
      let placeholderStr = null;
      let currentWhisperNick2 = await GM.getValue(userStoreWhisper);
      if (toggle && currentWhisperNick2.toLowerCase() === whispernick.toLowerCase() || whispernick === "" || whispernick === void 0) {
        submitStr = "bettercc.onSubmit();";
        placeholderStr = "Du chattest mit allen...\n\nSuperwhisper: /sw Sariam  |  Ban: /sb Wendigo  |  Hilfe: /help";
        if (input) input.classList.remove("superwhisper");
        await GM.setValue(userStoreWhisper, "");
      } else {
        submitStr = 'bettercc.onSubmit("' + whispernick + '");';
        placeholderStr = "Du fl\xFCsterst mit " + whispernick + "...\n\nSuperwhisper aus: /open  |  /o Hi All :)  |  Hilfe: /help";
        if (input) input.classList.add("superwhisper");
        await GM.setValue(userStoreWhisper, whispernick);
      }
      if (form) form.setAttribute("onsubmit", submitStr);
      if (input) input.placeholder = placeholderStr;
      const popup = document.querySelector(".ulist-popup");
      if (popup) popup.style.display = "none";
    };
  }

  // src/superban.ts
  function enableSuperban(userStore2) {
    const fuu = document.querySelector("#fuu");
    if (fuu) fuu.insertAdjacentHTML(
      "beforeend",
      '<a href="javascript://" class="button superban" id="superban" onclick="bettercc.superban(last_id);">\xBB Better Ignore</a>'
    );
    const awScript = document.createElement("script");
    awScript.src = "//images.chatcity.de/script/aw.js?r=" + Math.round((/* @__PURE__ */ new Date()).getTime() / 1e3);
    awScript.type = "text/javascript";
    document.head.appendChild(awScript);
    var alreadyBanned = [];
    let userStoreBan = "ban_" + userStore2;
    let listenerId = GM_addValueChangeListener(
      userStoreBan,
      unsafeWindow.bettercc.getSuperbans
    );
    unsafeWindow.bettercc.getSuperbans = async function() {
      var superbans = [];
      try {
        superbans = Array.from(await GM.getValue(userStoreBan)).map((v) => v.toLowerCase()).sort();
      } catch {
        superbans = [];
      }
      await GM.setValue(userStoreBan, superbans);
      return superbans;
    };
    var refreshUsersInterval = setInterval(refreshUserList, 4e3);
    unsafeWindow.bettercc.superban = async function(nickToBan) {
      nickToBan = nickToBan.toLowerCase();
      let superbans = await unsafeWindow.bettercc.getSuperbans();
      var confirmStr = "";
      if (!superbans.includes(nickToBan)) {
        confirmStr = "M\xF6chtest du " + nickToBan.toUpperCase() + " wirklich dauerhaft ignorieren?";
        if (window.confirm(confirmStr)) {
          superbans.push(nickToBan);
          ccnotify(
            nickToBan + " wird ab jetzt geblockt!",
            "Better Ignore",
            "banned"
          );
        }
      } else {
        confirmStr = "M\xF6chtest du " + nickToBan.toUpperCase() + " wirklich aus deiner Ignoreliste entfernen?";
        if (window.confirm(confirmStr)) {
          superbans = superbans.filter(function(item) {
            return String(item) !== nickToBan;
          });
          ccnotify(
            nickToBan + " wird nicht mehr geblockt!",
            "Better Ignore",
            "unbanned"
          );
          new (unsafeWindow.ajax || window.ajax)(
            unsafeWindow.PCHAT + "/chatin?SID=" + unsafeWindow.chat_sid + "&ID=" + unsafeWindow.chat_id + "&OUT=" + encodeURIComponent("/ignore " + nickToBan) + "&x=" + Math.random(),
            { method: "get" }
          );
        }
      }
      GM.setValue(userStoreBan, superbans.sort());
      ccnotify(
        "Schreib <b>/superban</b> oder <b>/sb</b> um deine <b>Bannliste</b> zu sehen",
        "Better Ignore",
        "help"
      );
      const popup2 = document.querySelector(".ulist-popup");
      if (popup2) popup2.style.display = "none";
    };
    async function refreshUserList() {
      var time = Math.round((/* @__PURE__ */ new Date()).getTime() / 1e3);
      var url = "//images.chatcity.de/script/aw.js?r=";
      var src = url + time;
      const existing = document.querySelector("#userlistjs");
      if (existing) existing.remove();
      const userlistScript = document.createElement("script");
      userlistScript.id = "userlistjs";
      userlistScript.src = src;
      userlistScript.type = "text/javascript";
      document.head.appendChild(userlistScript);
      var superbans = await unsafeWindow.bettercc.getSuperbans();
      var users = getUsers();
      var usersToBeBanned = getUsersToBeBanned(users, superbans);
      if (usersToBeBanned.length) {
        cclog("Users to be banned:\n	" + usersToBeBanned);
        clearInterval(refreshUsersInterval);
        await banUsers(usersToBeBanned);
        refreshUsersInterval = setInterval(refreshUserList, 4e3);
      }
      unsafeWindow.superbans = superbans;
    }
    function getUsers() {
      var users_gloabal = [];
      for (var i = 2; i < unsafeWindow.cha.length; i += 3) {
        users_gloabal = users_gloabal.concat(
          unsafeWindow.cha[i].toLowerCase().split(" ").filter(Boolean)
        );
      }
      var users_channel = [];
      if (unsafeWindow.cha_my) {
        for (var j = 0; j < unsafeWindow.cha_my.length; j += 2) {
          users_channel = users_channel.concat(
            unsafeWindow.cha_my[j].toLowerCase().split(" ").filter(Boolean)
          );
        }
      }
      var users_tmp = users_gloabal.concat(users_channel);
      var users = users_tmp.filter(
        (item, pos) => users_tmp.indexOf(item) === pos
      );
      return users;
    }
    function getUsersToBeBanned(users, superbans) {
      var usersToBeBanned = [];
      for (const banUser2 of superbans) {
        if (!usersToBeBanned.includes(banUser2) && !alreadyBanned.includes(banUser2) && users.includes(banUser2)) {
          usersToBeBanned.push(banUser2);
        }
      }
      return usersToBeBanned;
    }
    const sleepNow = (delay) => new Promise((resolve) => setTimeout(resolve, delay));
    async function banUsers(users) {
      for (const user of users) {
        await banUser(user);
        users = users.filter((val) => val !== user);
        await sleepNow(1150);
      }
    }
    async function banUser(user) {
      new (unsafeWindow.ajax || window.ajax)(
        unsafeWindow.PCHAT + "/chatin?SID=" + unsafeWindow.chat_sid + "&ID=" + unsafeWindow.chat_id + "&OUT=" + encodeURIComponent("/ignore " + user) + "&x=" + Math.random(),
        { method: "get" }
      );
      alreadyBanned.push(user);
      cclog("Banned " + user);
      ccnotify(
        user + " kann dir nicht mehr schreiben",
        "Better Ignore",
        "banned"
      );
      unsafeWindow.alreadyBanned = alreadyBanned;
    }
  }

  // src/index.ts
  (function() {
    "use strict";
    cclog("Version: " + GM_info.script.version + " - " + window.location.href);
    var bettercc = unsafeWindow.bettercc = {};
    bettercc.showIdPopup = showIdPopup;
    if (/cpop.html/.test(window.location.href)) {
      window.onunload = null;
      window.onbeforeunload = null;
      let gast = unsafeWindow.chat_ui === "h" ? 1 : 0;
      let userStore2 = gast ? "gast" : unsafeWindow.chat_nick.toLowerCase();
      setUserStore(unsafeWindow.chat_nick, !!gast);
      const v3Flag = GM_getValue(getUserKey("bcc_v3"), false);
      if (shouldUseV3(v3Flag, window.location.href)) {
        initV3();
        return;
      }
      if (noChatBackgroundsEnable) forceNoChatBackgrounds();
      addCustomCss();
      cleanup();
      if (betterUserListEnable) betterUserList(userStore2);
      betterInput(!!replaceInputFieldEnable);
      doColorStuff(
        "color_" + userStore2,
        "colorscheme_" + userStore2,
        "6AAED8",
        "000000",
        printHelp,
        () => showSettingsModal(userStore2),
        cclog
      );
      replaceOnSubmit(userStore2);
      if (gast) {
        const ulEl = document.querySelector("#ul");
        if (ulEl) ulEl.classList.add("gast");
      }
      if (superbanEnable) enableSuperban(userStore2);
      redesignFooter();
      hookChatoutConnect();
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

