// ==UserScript==
// @name  BetterCC (alpha)
// @description  BetterCC v3 alpha
// @author  Sarah
// @version      3.0.5
// @icon  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/v3/BetterCC.png
//
// @match  https://www.chatcity.de/de/cpop.html
// @match  https://www.chatcity.de/de/cpop.html?*
// @match  https://ccc.chatcity.de/de/cpop.html
// @match  https://ccc.chatcity.de/de/cpop.html?*
// @match  https://www.chatcity.de/de/nc/index.html
// @match  https://images.chatcity.de/*
//
// @resource  iframe_css  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/v3/css/iframe.css?r=3.0.5
// @resource  v3_css  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/v3/css/v3.css?r=3.0.5
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
  function ccnotify(message, title = "", tag = "", timeout = 3e3) {
    GM_notification({
      title: "BetterCC " + title,
      text: message,
      tag,
      timeout,
      onclick: () => {
        window.event?.preventDefault();
        cclog("Notification clicked.");
        window.focus();
      }
    });
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
    cclog("injectIntoChatframe: injection complete");
  }
  function betterccOnWsMessage(ev) {
    if (typeof upstreamOnMessage === "function") {
      upstreamOnMessage.call(unsafeWindow.chatout_ws, ev);
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
  function tinycolor(color, opts) {
    color = color ? color : "";
    opts = opts || {};
    if (color instanceof tinycolor) {
      return color;
    }
    if (!(this instanceof tinycolor)) {
      return new tinycolor(color, opts);
    }
    var rgb = inputToRGB(color);
    this._originalInput = color, this._r = rgb.r, this._g = rgb.g, this._b = rgb.b, this._a = rgb.a, this._roundA = Math.round(100 * this._a) / 100, this._format = opts.format || rgb.format;
    this._gradientType = opts.gradientType;
    if (this._r < 1) this._r = Math.round(this._r);
    if (this._g < 1) this._g = Math.round(this._g);
    if (this._b < 1) this._b = Math.round(this._b);
    this._ok = rgb.ok;
  }
  tinycolor.prototype = {
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
        var s = tinycolor(secondColor);
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
      return tinycolor(this.toString());
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
  tinycolor.fromRatio = function(color, opts) {
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
    return tinycolor(color, opts);
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
  tinycolor.equals = function(color1, color2) {
    if (!color1 || !color2) return false;
    return tinycolor(color1).toRgbString() == tinycolor(color2).toRgbString();
  };
  tinycolor.random = function() {
    return tinycolor.fromRatio({
      r: Math.random(),
      g: Math.random(),
      b: Math.random()
    });
  };
  function _desaturate(color, amount) {
    amount = amount === 0 ? 0 : amount || 10;
    var hsl = tinycolor(color).toHsl();
    hsl.s -= amount / 100;
    hsl.s = clamp01(hsl.s);
    return tinycolor(hsl);
  }
  function _saturate(color, amount) {
    amount = amount === 0 ? 0 : amount || 10;
    var hsl = tinycolor(color).toHsl();
    hsl.s += amount / 100;
    hsl.s = clamp01(hsl.s);
    return tinycolor(hsl);
  }
  function _greyscale(color) {
    return tinycolor(color).desaturate(100);
  }
  function _lighten(color, amount) {
    amount = amount === 0 ? 0 : amount || 10;
    var hsl = tinycolor(color).toHsl();
    hsl.l += amount / 100;
    hsl.l = clamp01(hsl.l);
    return tinycolor(hsl);
  }
  function _brighten(color, amount) {
    amount = amount === 0 ? 0 : amount || 10;
    var rgb = tinycolor(color).toRgb();
    rgb.r = Math.max(0, Math.min(255, rgb.r - Math.round(255 * -(amount / 100))));
    rgb.g = Math.max(0, Math.min(255, rgb.g - Math.round(255 * -(amount / 100))));
    rgb.b = Math.max(0, Math.min(255, rgb.b - Math.round(255 * -(amount / 100))));
    return tinycolor(rgb);
  }
  function _darken(color, amount) {
    amount = amount === 0 ? 0 : amount || 10;
    var hsl = tinycolor(color).toHsl();
    hsl.l -= amount / 100;
    hsl.l = clamp01(hsl.l);
    return tinycolor(hsl);
  }
  function _spin(color, amount) {
    var hsl = tinycolor(color).toHsl();
    var hue = (hsl.h + amount) % 360;
    hsl.h = hue < 0 ? 360 + hue : hue;
    return tinycolor(hsl);
  }
  function _complement(color) {
    var hsl = tinycolor(color).toHsl();
    hsl.h = (hsl.h + 180) % 360;
    return tinycolor(hsl);
  }
  function polyad(color, number) {
    if (isNaN(number) || number <= 0) {
      throw new Error("Argument to polyad must be a positive number");
    }
    var hsl = tinycolor(color).toHsl();
    var result = [tinycolor(color)];
    var step = 360 / number;
    for (var i = 1; i < number; i++) {
      result.push(tinycolor({
        h: (hsl.h + i * step) % 360,
        s: hsl.s,
        l: hsl.l
      }));
    }
    return result;
  }
  function _splitcomplement(color) {
    var hsl = tinycolor(color).toHsl();
    var h = hsl.h;
    return [tinycolor(color), tinycolor({
      h: (h + 72) % 360,
      s: hsl.s,
      l: hsl.l
    }), tinycolor({
      h: (h + 216) % 360,
      s: hsl.s,
      l: hsl.l
    })];
  }
  function _analogous(color, results, slices) {
    results = results || 6;
    slices = slices || 30;
    var hsl = tinycolor(color).toHsl();
    var part = 360 / slices;
    var ret = [tinycolor(color)];
    for (hsl.h = (hsl.h - (part * results >> 1) + 720) % 360; --results; ) {
      hsl.h = (hsl.h + part) % 360;
      ret.push(tinycolor(hsl));
    }
    return ret;
  }
  function _monochromatic(color, results) {
    results = results || 6;
    var hsv = tinycolor(color).toHsv();
    var h = hsv.h, s = hsv.s, v = hsv.v;
    var ret = [];
    var modification = 1 / results;
    while (results--) {
      ret.push(tinycolor({
        h,
        s,
        v
      }));
      v = (v + modification) % 1;
    }
    return ret;
  }
  tinycolor.mix = function(color1, color2, amount) {
    amount = amount === 0 ? 0 : amount || 50;
    var rgb1 = tinycolor(color1).toRgb();
    var rgb2 = tinycolor(color2).toRgb();
    var p = amount / 100;
    var rgba = {
      r: (rgb2.r - rgb1.r) * p + rgb1.r,
      g: (rgb2.g - rgb1.g) * p + rgb1.g,
      b: (rgb2.b - rgb1.b) * p + rgb1.b,
      a: (rgb2.a - rgb1.a) * p + rgb1.a
    };
    return tinycolor(rgba);
  };
  tinycolor.readability = function(color1, color2) {
    var c1 = tinycolor(color1);
    var c2 = tinycolor(color2);
    return (Math.max(c1.getLuminance(), c2.getLuminance()) + 0.05) / (Math.min(c1.getLuminance(), c2.getLuminance()) + 0.05);
  };
  tinycolor.isReadable = function(color1, color2, wcag2) {
    var readability = tinycolor.readability(color1, color2);
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
  tinycolor.mostReadable = function(baseColor, colorList, args) {
    var bestColor = null;
    var bestScore = 0;
    var readability;
    var includeFallbackColors, level, size;
    args = args || {};
    includeFallbackColors = args.includeFallbackColors;
    level = args.level;
    size = args.size;
    for (var i = 0; i < colorList.length; i++) {
      readability = tinycolor.readability(baseColor, colorList[i]);
      if (readability > bestScore) {
        bestScore = readability;
        bestColor = tinycolor(colorList[i]);
      }
    }
    if (tinycolor.isReadable(baseColor, bestColor, {
      level,
      size
    }) || !includeFallbackColors) {
      return bestColor;
    } else {
      args.includeFallbackColors = false;
      return tinycolor.mostReadable(baseColor, ["#fff", "#000"], args);
    }
  };
  var names = tinycolor.names = {
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
  var hexNames = tinycolor.hexNames = flip(names);
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
  function toHex6(color) {
    return color.toHexString().slice(1).toUpperCase();
  }
  function pickReadable(bg, candidates, large = false) {
    const chosen = tinycolor.mostReadable(bg, candidates, {
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
    const triad2 = surface.triad();
    const accentWhisper = liftAccent(surface, triad2[1]);
    const accentBan = liftAccent(surface, triad2[2]);
    const statusOnline = liftAccent(sidebar, tinycolor("#3aa55c"));
    const statusSep = liftAccent(sidebar, tinycolor("#d08a1e"));
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
      statusOnline: toHex6(statusOnline),
      statusSep: toHex6(statusSep),
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
  function toHex62(color) {
    return color.toHexString().slice(1).toUpperCase();
  }
  function pickReadable2(bg, candidates, large = false) {
    return tinycolor.mostReadable(bg, candidates, {
      includeFallbackColors: true,
      level: "AA",
      size: large ? "large" : "small"
    });
  }
  function nudge2(color, amount) {
    return color.isLight() ? color.clone().darken(amount) : color.clone().lighten(amount);
  }
  function liftAccent2(bg, accent) {
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
    for (const [surf, tier] of [[s1, 1], [s2, 2], [s3, 1]]) {
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
    const text0 = pickReadable2(s0, s0.monochromatic().concat(s0.analogous()));
    const text1 = pickReadable2(
      s1,
      s0.monochromatic().concat(s0.analogous())
    );
    const textRaisedVal = pickReadable2(s2, s2.monochromatic(), true);
    const textInputVal = pickReadable2(s3, s3.monochromatic());
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
    const border0 = nudge2(s1, STEP2.borderSubtleShift);
    const border1 = nudge2(s1, STEP2.borderMediumShift);
    const border2 = nudge2(s1, STEP2.borderStrongShift);
    const surfaceHoverVal = nudge2(s0, STEP2.hoverShift);
    const surfaceActiveVal = nudge2(s0, STEP2.activeShift);
    const triad2 = s0.triad();
    const accentWhisperVal = liftAccent2(s0, triad2[1]);
    const accentBanVal = liftAccent2(s0, triad2[2]);
    const statusOnlineVal = liftAccent2(s1, tinycolor("#3aa55c"));
    const statusSepVal = liftAccent2(s1, tinycolor("#d08a1e"));
    const textAwayVal = pickReadable2(
      s1,
      [textSidebarVal.clone().desaturate(60), textMutedVal.clone()]
    );
    return {
      // ── Old element-named fields (drop-in compat) ───────────────────
      surface: toHex62(s0),
      text: toHex62(text0),
      surfaceRaised: toHex62(s2),
      textRaised: toHex62(textRaisedVal),
      surfaceInput: toHex62(s3),
      textInput: toHex62(textInputVal),
      surfaceFooter: toHex62(s1),
      surfaceSidebar: toHex62(s1),
      textSidebar: toHex62(textSidebarVal),
      textMuted: toHex62(textMutedVal),
      textPlaceholder: toHex62(textPlaceholderVal),
      icon: toHex62(iconVal),
      accentWhisper: toHex62(accentWhisperVal),
      accentBan: toHex62(accentBanVal),
      statusOnline: toHex62(statusOnlineVal),
      statusSep: toHex62(statusSepVal),
      textAway: toHex62(textAwayVal),
      border: toHex62(border1),
      surfaceHover: toHex62(surfaceHoverVal),
      surfaceActive: toHex62(surfaceActiveVal),
      bgHex: toHex62(raw),
      // ── New generic-purpose names (for future CSS migration) ─────────
      surface0: toHex62(s0),
      surface1: toHex62(s1),
      surface2: toHex62(s2),
      surface3: toHex62(s3),
      text0: toHex62(text0),
      text1: toHex62(text1),
      border0: toHex62(border0),
      border1: toHex62(border1),
      border2: toHex62(border2)
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

  // src/v3/config.ts
  var DEFAULTS = {
    color: "6AAED8",
    colorscheme: null,
    // regenerated from color on load (theme bridge T3)
    ban: [],
    pinned: [],
    whisper: "",
    // "" = no superwhisper target
    bcc_v3: false,
    scheme_v2: false
  };
  async function getConfig(key, fallback) {
    const def = fallback ?? DEFAULTS[key];
    return await GM.getValue(getUserKey(key), def);
  }
  async function setConfig(key, value) {
    await GM.setValue(getUserKey(key), value);
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
    ["statusOnline", "--bcc-status-online"],
    ["statusSep", "--bcc-status-sep"],
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

  // src/v3/userlist-wire.ts
  var prevList = [];
  function processUserlist(chaMy, prev) {
    const newList = parseUserlist(chaMy);
    const { added, removed } = diffUserlists(prev, newList);
    return { newList, added, removed };
  }
  function overrideSetUinfo1() {
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

  // src/v3/popup.ts
  var openPopup = null;
  var onOutsideClick = null;
  function closePopup() {
    if (!openPopup) return;
    openPopup.remove();
    openPopup = null;
    document.removeEventListener("keydown", onKeydown, true);
    if (onOutsideClick) {
      document.removeEventListener("click", onOutsideClick);
      onOutsideClick = null;
    }
  }
  function onKeydown(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      closePopup();
    }
  }
  function actionBtn(iconClass, label, title, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bcc-popup-action";
    btn.title = title;
    btn.setAttribute("aria-label", title);
    const icon = document.createElement("i");
    icon.className = "fas " + iconClass;
    icon.setAttribute("aria-hidden", "true");
    btn.appendChild(icon);
    const text = document.createElement("span");
    text.className = "bcc-popup-action-label";
    text.textContent = label;
    btn.appendChild(text);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
      closePopup();
    });
    return btn;
  }
  function openUserPopup(anchor, user, isPinned, onTogglePin) {
    closePopup();
    const popup = document.createElement("div");
    popup.className = "bcc-user-popup";
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-modal", "false");
    popup.setAttribute("aria-label", "Aktionen f\xFCr " + user.name);
    const header = document.createElement("div");
    header.className = "bcc-popup-header";
    header.textContent = user.name;
    popup.appendChild(header);
    popup.appendChild(
      actionBtn(
        isPinned ? "fa-thumbtack-slash" : "fa-thumbtack",
        isPinned ? "Angeheftet entfernen" : "Anheften",
        "Benutzer anheften",
        () => {
          onTogglePin(user);
        }
      )
    );
    popup.appendChild(
      actionBtn("fa-comment-dots", "Superwhisper", "Dauerhaft an " + user.name + " fl\xFCstern", () => {
        const api = unsafeWindow.bettercc;
        if (typeof api?.superwhisper === "function") api.superwhisper(user.name, false);
      })
    );
    popup.appendChild(
      actionBtn("fa-paper-plane", "Fl\xFCstern (1\xD7)", "Einmal an " + user.name + " fl\xFCstern", () => {
        const api = unsafeWindow.bettercc;
        if (typeof api?.prefillWhisper === "function") api.prefillWhisper(user.name);
      })
    );
    popup.appendChild(
      actionBtn("fa-ban", "Ignorieren", "Benutzer ignorieren (T12)", () => {
        cclog("user popup: ignore stubbed (T12) \u2014 " + user.name, "v3");
      })
    );
    popup.appendChild(
      actionBtn("fa-id-card", "ID", "ID von " + user.name + " anzeigen (T13)", () => {
        cclog("user popup: /id stubbed (T13) \u2014 " + user.name, "v3");
      })
    );
    const mount = document.querySelector(".bcc-shell") ?? document.body;
    mount.appendChild(popup);
    const rect = anchor.getBoundingClientRect();
    popup.style.position = "fixed";
    popup.style.left = Math.min(rect.left, window.innerWidth - popup.offsetWidth - 8) + "px";
    popup.style.top = rect.bottom + 4 + "px";
    openPopup = popup;
    document.addEventListener("keydown", onKeydown, true);
    onOutsideClick = (e) => {
      if (openPopup && !openPopup.contains(e.target)) closePopup();
    };
    document.addEventListener("click", onOutsideClick);
  }

  // src/v3/channel-select.ts
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
    const ccc = unsafeWindow.ccc;
    const ccg = unsafeWindow.ccg;
    const groups = parseChannels(ccc, ccg);
    const active = String(unsafeWindow.chat_channel ?? "");
    if (groups.length === 0) {
      cclog("buildChannelSelect: ccc/ccg absent \u2014 falling back to static label", "v3");
      const span = document.createElement("span");
      span.className = "bcc-channel";
      span.textContent = active || "Chatcity";
      span.title = "Channel";
      return span;
    }
    const select = document.createElement("select");
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
      const comSet = unsafeWindow.com_set;
      if (typeof comSet !== "function") {
        cclog("buildChannelSelect: com_set unavailable \u2014 channel switch dropped", "v3");
        return;
      }
      comSet("/j " + select.value);
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

  // src/v3/sidebar.ts
  function statusDotClass(user) {
    return user.sep ? "bcc-dot-sep" : "bcc-dot-online";
  }
  function isGuestTag(user) {
    return user.guest;
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
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.setAttribute("aria-label", "Aktionen f\xFCr " + user.name);
    const dot = document.createElement("i");
    dot.className = "bcc-status-dot fas " + statusDotClass(user) + " " + (user.sep ? "fa-circle-half-stroke" : "fa-circle");
    dot.setAttribute("aria-hidden", "true");
    li.appendChild(dot);
    const nameSpan = document.createElement("span");
    nameSpan.className = "bcc-userrow-name";
    if (user.away) nameSpan.classList.add("bcc-name-away");
    nameSpan.textContent = user.name;
    li.appendChild(nameSpan);
    if (isGuestTag(user)) {
      const gast = document.createElement("span");
      gast.className = "bcc-user-tag bcc-gast";
      gast.textContent = "gast";
      li.appendChild(gast);
    }
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
    const idx = list.indexOf(user.name);
    if (idx === -1) {
      list.push(user.name);
    } else {
      list.splice(idx, 1);
    }
    await setConfig("pinned", list);
    pinnedCache = new Set(list);
    if (lastUserlistEvent) renderSidebar(lastUserlistEvent, [], []);
  }
  function handleRowClick(user, anchor) {
    openUserPopup(anchor, user, pinnedCache.has(user.name), (u) => {
      togglePin(u).catch(() => {
        cclog("pin toggle failed for " + u.name, "v3");
      });
    });
  }
  var lastUserlistEvent = null;
  var rowMap = /* @__PURE__ */ new Map();
  var pinnedUl = null;
  var regularUl = null;
  var pinnedPanel = null;
  var scrollContainer = null;
  var onlineCount = null;
  function ensureContainers(sidebar) {
    if (pinnedUl && pinnedUl.isConnected) return;
    sidebar.innerHTML = "";
    const onlineRow = document.createElement("div");
    onlineRow.className = "bcc-online-row";
    onlineCount = document.createElement("div");
    onlineCount.className = "bcc-online-count";
    onlineCount.setAttribute("role", "status");
    onlineCount.setAttribute("aria-live", "polite");
    onlineCount.textContent = "0 online";
    onlineRow.appendChild(onlineCount);
    onlineRow.appendChild(buildChannelSelect());
    sidebar.appendChild(onlineRow);
    pinnedPanel = document.createElement("div");
    pinnedPanel.className = "bcc-pinned-panel";
    const pinnedHeader = document.createElement("div");
    pinnedHeader.className = "bcc-userlist-section";
    pinnedHeader.textContent = "Angespinnt";
    pinnedUl = document.createElement("ul");
    pinnedUl.className = "bcc-userlist-pinned";
    pinnedUl.setAttribute("role", "list");
    pinnedPanel.append(pinnedHeader, pinnedUl);
    regularUl = document.createElement("ul");
    regularUl.className = "bcc-userlist-regular";
    regularUl.setAttribute("role", "list");
    scrollContainer = document.createElement("div");
    scrollContainer.className = "bcc-userlist-scroll";
    scrollContainer.appendChild(regularUl);
    sidebar.append(pinnedPanel, scrollContainer);
  }
  function refreshSectionVisibility() {
    const hasPinned = pinnedUl ? pinnedUl.children.length > 0 : false;
    if (pinnedPanel) pinnedPanel.style.display = hasPinned ? "" : "none";
  }
  function renderSidebar(users, added, removed) {
    const sidebar = document.querySelector(".bcc-sidebar");
    if (!sidebar || !pinnedUl || !regularUl) return;
    for (const name of removed) {
      const row = rowMap.get(name);
      if (row) row.remove();
      rowMap.delete(name);
    }
    const scrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
    const sorted = sortUsers(users, pinnedCache);
    for (const user of sorted) {
      const isPinned = pinnedCache.has(user.name);
      const target = isPinned ? pinnedUl : regularUl;
      let row = rowMap.get(user.name);
      if (row) {
        row.className = getStatusClasses(user);
        const dot = row.querySelector(".bcc-status-dot");
        if (dot) {
          dot.className = "bcc-status-dot fas " + statusDotClass(user) + " " + (user.sep ? "fa-circle-half-stroke" : "fa-circle");
        }
        const nameSpan = row.querySelector(".bcc-userrow-name");
        if (nameSpan) {
          nameSpan.classList.toggle("bcc-name-away", user.away);
          nameSpan.textContent = user.name;
        }
        const existingChip = row.querySelector(".bcc-gast");
        if (isGuestTag(user) && !existingChip) {
          const gast = document.createElement("span");
          gast.className = "bcc-user-tag bcc-gast";
          gast.textContent = "gast";
          row.appendChild(gast);
        } else if (!isGuestTag(user) && existingChip) {
          existingChip.remove();
        }
      } else {
        row = buildRow(user);
        rowMap.set(user.name, row);
      }
      target.appendChild(row);
    }
    if (scrollContainer)
      scrollContainer.scrollTop = Math.min(scrollTop, scrollContainer.scrollHeight);
    refreshSectionVisibility();
    if (onlineCount) onlineCount.textContent = users.length + " online";
    lastUserlistEvent = users;
    void added;
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
        renderSidebar(e.users, e.added, e.removed);
      }
    });
    cclog("sidebar mounted \u2014 subscribed to userlist events", "v3");
  }

  // src/v3/stats.ts
  function parseStats(html) {
    const empty = { friendsOnline: 0, requests: 0, messages: 0 };
    if (typeof html !== "string" || html.length === 0) return empty;
    const read = (cls) => {
      const anchorRe = new RegExp('class="[^"]*\\b' + cls + '\\b[^"]*"[^]*?</a>', "i");
      const anchorMatch = html.match(anchorRe);
      if (!anchorMatch) return 0;
      const block = anchorMatch[0];
      const valueRe = /<span\s+class="value(?:\s+[^"]*)?"\s*>\s*(\d+)\s*<\/span>/i;
      const valueMatch = block.match(valueRe);
      const n = valueMatch ? Number(valueMatch[1]) : 0;
      return Number.isFinite(n) ? n : 0;
    };
    return {
      friendsOnline: read("uonl"),
      requests: read("ufri"),
      messages: read("unc")
    };
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
    if (!statsBar) return;
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
  function pollOnce() {
    try {
      const w = unsafeWindow;
      const ajax = w.ajax;
      const pajax = w.PAJAX;
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
    const nick = String(unsafeWindow.chat_nick ?? "");
    parent.insertBefore(buildStatsBar(nick), parent.firstChild);
    pollOnce();
    pollTimer = window.setInterval(pollOnce, POLL_INTERVAL_MS);
    window.addEventListener("unload", () => {
      if (pollTimer !== null) window.clearInterval(pollTimer);
    });
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

  // src/v3/patched-handler.ts
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
    return new Function(raw.includes(AWAY_TIMER_NEEDLE) ? patchAwayTimer(raw) : raw);
  }

  // src/v3/input.ts
  var textarea = null;
  var onSubmitOrig = null;
  var currentWhisperNick = "";
  var HINTS_ALL = "Superwhisper: /sw Sariam  |  Ban: /sb Wendigo  |  Hilfe: /help";
  var HINTS_WHISPER = "Superwhisper aus: /open  |  /o Hi All :)  |  Hilfe: /help";
  var PLACEHOLDER_ALL = "Du chattest mit allen...\n\n" + HINTS_ALL;
  function placeholderFor(nick) {
    return "Du fl\xFCsterst mit " + nick + "...\n\n" + HINTS_WHISPER;
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
        textarea.placeholder = PLACEHOLDER_ALL;
      }
    } else {
      await setConfig("whisper", whispernick);
      currentWhisperNick = whispernick;
      if (textarea) {
        textarea.classList.add("bcc-superwhisper");
        textarea.placeholder = placeholderFor(whispernick);
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
    getConfig("whisper", "").then((nick) => {
      const n = nick || "";
      if (n) superwhisper(n, false);
    });
    cclog("input mounted \u2014 textarea + whisper indicator + send contract", "v3");
  }

  // src/v3/footer.ts
  var reloadButtons = [];
  function trackReloadButton(btn) {
    reloadButtons.push(btn);
    return btn;
  }
  function iconBtn(iconClass, title, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    const isBnClass = /^b\d+$/.test(iconClass);
    btn.className = isBnClass ? "bcc-icon-btn " + iconClass : "bcc-icon-btn";
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.innerHTML = '<i class="fas ' + iconClass + '" aria-hidden="true"></i>';
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }
  function pill(columns, extraClass, ...children) {
    const p = document.createElement("div");
    p.className = columns > 0 ? "bcc-pill bcc-pill-" + columns : "bcc-pill";
    if (extraClass) p.classList.add(extraClass);
    for (const c of children) p.appendChild(c);
    return p;
  }
  function sendSlashCommand(cmd) {
    const docHold = document.hold;
    if (!docHold) return;
    docHold.OUT1.value = cmd;
    const w = unsafeWindow;
    if (typeof w.delout === "function") w.delout();
  }
  function buildAccountPill() {
    const away = iconBtn("b2", "Away (/away)", () => sendSlashCommand("/away"));
    const awayOff = iconBtn("b3", "Zur\xFCck (/awayoff)", () => sendSlashCommand("/awayoff"));
    const sysOn = iconBtn("b5", "Systemmeldungen an", () => {
      const w = unsafeWindow;
      if (typeof w.com_set === "function") w.com_set("/messageon");
    });
    const sysOff = iconBtn("b6", "Systemmeldungen aus", () => {
      const w = unsafeWindow;
      if (typeof w.com_set === "function") w.com_set("/messageoff");
    });
    return pill(2, "", away, sysOn, awayOff, sysOff);
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
  function buildColorSwatch() {
    const wrap = document.createElement("label");
    wrap.className = "bcc-color-btn bcc-color-picker-wrap";
    wrap.title = "Thema-Farbe w\xE4hlen";
    const input = document.createElement("input");
    input.type = "color";
    input.className = "bcc-color-input";
    input.setAttribute("aria-label", "Thema-Farbe w\xE4hlen");
    input.value = "#6aaed8";
    getConfig("color", "6AAED8").then((hex) => {
      input.value = "#" + String(hex).replace(/^#/, "");
      wrap.style.setProperty("--swatch-color", input.value);
    });
    input.addEventListener("input", () => {
      const baseHex = input.value.replace(/^#/, "").toUpperCase();
      wrap.style.setProperty("--swatch-color", input.value);
      saveColor(baseHex, getUserKey("color"), getUserKey("colorscheme")).catch((e) => {
        cclog("color swatch: saveColor failed \u2014 " + e.message, "v3");
      });
    });
    wrap.appendChild(input);
    return wrap;
  }
  function buildChatActionsPill() {
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
      "bcc-chat-actions",
      buildAutoscrollBtn(),
      trackReloadButton(buildReloadBtn()),
      buildColorSwatch(),
      schemeToggle
    );
  }
  function buildBetterccPill() {
    const help = iconBtn("fa-question", "Hilfe", () => printHelp());
    const settings = iconBtn("fa-cog", "Einstellungen", () => {
      cclog("settings clicked \u2014 stub (T10)", "v3");
    });
    return pill(0, "", help, settings);
  }
  var PRESET_COLORS = [
    ["b10", "AA0000"],
    // red
    ["b13", "00AA00"],
    // green
    ["b14", "0000AA"],
    // blue
    ["b8", "AAAA00"],
    // yellow
    ["b12", "00AAAA"],
    // cyan
    ["b11", "AA00AA"]
    // magenta
  ];
  function buildPresetColorPill() {
    const children = PRESET_COLORS.map(([cls, hex]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bcc-color-btn " + cls;
      btn.title = "Nick-Farbe #" + hex;
      btn.setAttribute("aria-label", "Nick-Farbe auf #" + hex + " setzen");
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const w = unsafeWindow;
        if (typeof w.color_set === "function") w.color_set(hex);
        else cclog("preset color: upstream color_set not found", "v3");
      });
      return btn;
    });
    return pill(3, "", ...children);
  }
  function buildLinksPill() {
    const id = iconBtn("b16", "Eigene ID", () => {
      const nick = String(unsafeWindow.chat_nick ?? "");
      if (nick) window.open("//www.chatcity.de/de/id/" + nick + ".html", "IDCARD");
    });
    const forum = iconBtn("b15", "Forum", () => {
      window.open("//www.chatcity.de/f101/", "_blank");
    });
    const help = iconBtn("b1", "Chat-Hilfe (extern)", () => {
      window.open("//www.chatcity.de/de/hilfe-allgemeines.html#cmd", "_blank");
    });
    return pill(2, "bcc-links", id, forum, help);
  }
  function buildExitBtn() {
    const btn = iconBtn("b7", "Verlassen", () => {
      const w = unsafeWindow;
      if (typeof w.bye === "function") w.bye();
    });
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
  function mountFooter() {
    const chatbar = document.querySelector(".bcc-chatbar");
    if (!chatbar) return;
    injectFontAwesome();
    chatbar.append(
      buildAccountPill(),
      buildChatActionsPill(),
      buildBetterccPill(),
      buildPresetColorPill(),
      buildLinksPill(),
      buildExitBtn()
    );
    const headerReload = document.querySelector(".bcc-reload");
    if (headerReload) trackReloadButton(headerReload);
    patchSetStatus();
    cclog("footer mounted \u2014 pill groups + FA + setstatus patch", "v3");
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
    unsafeWindow.bettercc.reloadChat = reloadChat;
    buildShell();
    overrideSetUinfo1();
    getConfig("scheme_v2").then((v2) => {
      if (v2) enableV2Scheme();
    });
    const schemePromise = loadTheme(getUserKey("color"), getUserKey("colorscheme"));
    unsafeWindow.bettercc.setTheme = function setTheme() {
      schemePromise.then((scheme) => applyScheme(scheme));
    };
    hookChatoutConnect();
    mountSidebar();
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

