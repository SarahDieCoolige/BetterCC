// ==UserScript==
// @name  BetterCC
// @description  BetterCC is better
// @author  Sarah
// @version      2.0.2
// @icon  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/modernize/BetterCC.png
//
// @match  https://www.chatcity.de/de/cpop.html?*RURL=*
// @match  https://ccc.chatcity.de/de/cpop.html?*RURL=*
// @match  https://www.chatcity.de/de/nc/index.html
// @match  https://images.chatcity.de/*
//
// @require  https://raw.githubusercontent.com/bgrins/TinyColor/master/tinycolor.js
//
// @resource  main_css  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/modernize/css/main.css?r=2.0.2
// @resource  iframe_css  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/modernize/css/iframe.css?r=2.0.2
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
    const reloadBtn = document.createElement("button");
    reloadBtn.id = "reloadbutton";
    reloadBtn.type = "button";
    reloadBtn.className = "bcc-icon-btn";
    reloadBtn.title = "Chat neu laden (mimimi)";
    reloadBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
    reloadBtn.addEventListener("click", function() {
      unsafeWindow.bettercc.reloadChat();
    });
    betterOpts.appendChild(reloadBtn);
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
    unsafeWindow.bettercc.reloadChat = function reloadChat() {
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
    var reloadBtn = document.querySelector("#reloadbutton");
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
    [autoscrollBtn, reloadBtn, colorWrap].forEach(function(el) {
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
    let onSubmitOrig = new Function(onSubmitOrigStr);
    unsafeWindow.bettercc.onSubmit = async function(whispernick) {
      let openMsgCmdRegex = /^\/open\s|^\/o\s/;
      let openMsgReplaceRegex = /^\/open\s+|^\/o\s+/gi;
      let superbanMsgCmdRegex = /^\/superban\s|^\/sb\s/;
      let superbanMsgReplaceRegex = /^\/superban\s+|^\/sb\s+/gi;
      let superwhisperMsgCmdRegex = /^\/superwhisper\s|^\/sw\s/;
      let superwhisperMsgReplaceRegex = /^\/superwhisper\s+|^\/sw\s+/gi;
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
        if (superbanMsgCmdRegex.test(mymsg.toLowerCase())) {
          mymsg = mymsg.replace(superbanMsgReplaceRegex, "").split(" ")[0];
          unsafeWindow.bettercc.superban(mymsg);
          cclog("Superban:" + mymsg);
          mymsg = "";
          docHold.OUT1.value = mymsg;
          return false;
        }
      }
      let idMsgCmdRegex = /^\/id\b/i;
      let idMsgArgRegex = /^\/id\s+/i;
      if (idMsgCmdRegex.test(mymsg.toLowerCase())) {
        let name = mymsg.replace(idMsgArgRegex, "").replace(/^\/id$/i, "").trim();
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
      if (superwhisperMsgCmdRegex.test(mymsg.toLowerCase())) {
        mymsg = mymsg.replace(superwhisperMsgReplaceRegex, "").split(" ")[0];
        unsafeWindow.bettercc.superwhisper(mymsg, false);
        mymsg = "";
        docHold.OUT1.value = mymsg;
        return false;
      }
      if (openMsgCmdRegex.test(mymsg.toLowerCase())) {
        mymsg = mymsg.replace(openMsgReplaceRegex, "");
      } else if (whispernick !== void 0) {
        if (!mymsg.startsWith("/")) {
          mymsg = "/w " + whispernick + " " + mymsg;
        }
      }
      docHold.OUT1.value = mymsg;
      onSubmitOrig();
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
      let currentWhisperNick = await GM.getValue(userStoreWhisper);
      if (toggle && currentWhisperNick.toLowerCase() === whispernick.toLowerCase() || whispernick === "" || whispernick === void 0) {
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
    addAutoscrollBanner(doc, win);
    cclog("injectIntoChatframe: injection complete");
  }
  function betterccOnWsMessage(ev) {
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

