// ==UserScript==
// @name     BetterCC Beta
// @version  0.5.1
//
// @include  https://www.chatcity.de/de/cpop.html?&RURL=//www.chatcity.de/
// @include  https://www.chatcity.de/de/cpop.html?&RURL=//www.chatcity.de/*
//
// @require  http://code.jquery.com/jquery-2.2.4.min.js
// @require  https://cdn.jsdelivr.net/gh/CoeJoder/GM_wrench@v1.1/dist/GM_wrench.min.js
//
// @resource  main_css      https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/main/css/main.css?r=0.5.1
// @resource  dark_mode_css https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/main/css/dark-blue-gray.css?r=0.5.1
// @resource  dark_mode_iframe_css https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/main/css/darkmode_chatframe.css?r=0.5.1
//// @resource  main_css      http://127.0.0.1:8080/css/main.css?r=0.5.1
//// @resource  dark_mode_css http://127.0.0.1:8080/css/dark-blue-gray.css?r=0.5.1
//// @resource  dark_mode_iframe_css http://127.0.0.1:8080/css/darkmode_chatframe.css?r=0.5.1
//
// @grant    GM_addStyle
// @grant    GM.setValue
// @grant    GM.getValue
// @grant    GM_addValueChangeListener
// @grant    GM_getResourceText
// @grant    GM_log
//
// @downloadURL https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/main/bettercc.user.js
// @updateURL https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/main/bettercc.user.js
//// @downloadURL http://0.0.0.0:8080/bettercc.user.js
//// @updateURL http://0.0.0.0:8080/bettercc.user.js
// @supportURL https://github.com/SarahDieCoolige/BetterCC/issues
// @homepageURL https://github.com/SarahDieCoolige/BetterCC
// @run-at   document-idle
// ==/UserScript==

/* globals jQuery, $, GM_wrench */

"use strict";

function cclog(str, tag = "BetterCC") {
  GM_log(tag + " - " + str);
}

cclog("Version: " + GM_info.script.version + " - " + window.location.href);

// window functions
var bettercc = (unsafeWindow.bettercc = {});

const superwhisper = 1;
const replaceInputField = 1;
const hideHeader = 1;
const hideAds = 1;
const hideOtherStuff = 1;
const darkMode = 1;
const noChatBackgrounds = 1;

//MAIN CHAT
if (/cpop.html/.test(window.location.href)) {
  let gast = unsafeWindow.chat_ui === "h" ? 1 : 0;
  let userStore = gast ? "gast" : unsafeWindow.chat_nick.toLowerCase();

  if (noChatBackgrounds) {
    var src = $("#chatframe").attr("src");
    src = src.replace("SBG=0", "SBG=1");
    $("#chatframe").attr("src", src);
  }

  $("#u_stats a.unc").hide();

  if (hideOtherStuff) {
    $(".ww_chat_divide").hide();
    $(".chat_i1").hide();
  }

  if (hideAds) {
    $("#adv720").hide();
    $("#right_ad").hide();
  }

  if (hideHeader) {
    $("#popup-chat > table > tbody > tr:nth-child(1)").hide();
    $("#ul").addClass("headless");
  }

  // replace input field with textarea
  if (replaceInputField) {
    $('form[name="hold"]')
      .children('input[type="text"]')
      .replaceWith(
        '<textarea placeholder="Du chattest mit allen..." id="custom_input_text" maxlength="1024" name="OUT1" type="text" oninput="" onpaste=""  rows="3" wrap="soft" ></textarea>'
      );

    // shift+enter = send
    $("#custom_input_text").keypress(function (e) {
      if (e.which == 13 && !e.shiftKey) {
        $('form[name="hold"]').submit();
        e.preventDefault();
      }
    });
  } else {
    $('form[name="hold"]')
      .children('input[type="text"]')
      .attr("id", "custom_input_text")
      .attr("placeholder", "Du chattest mit allen...");
  }

  // replace long submit function in input form
  let onSubmitOrig = new Function($('form[name="hold').attr("onsubmit"));

  let openMsgCmdRegex = /^\/open\s|^\/o\s/;
  let openMsgReplaceRegex = /^\/open\s+|^\/o\s+/gi;
  let superwhisperMsgCmdRegex = /^\/superwhisper\s|^\/sw\s/;
  let superwhisperMsgReplaceRegex = /^\/superwhisper\s+|^\/sw\s+/gi;

  bettercc.onSubmit = function (whispernick) {
    let mymsg = document.hold.OUT1.value.trim();

    if (superwhisper) {
      // IS "/open"
      if (mymsg.toLowerCase() === "/open") {
        bettercc.superwhisper("");
        mymsg = "";
        document.hold.OUT1.value = mymsg;
        return false;
      }

      //starts with "/open " or "/o "
      else if (openMsgCmdRegex.test(mymsg.toLowerCase())) {
        mymsg = mymsg.replace(openMsgReplaceRegex, "");
      }

      //starts with "/superwhisper " or "/sw "
      else if (superwhisperMsgCmdRegex.test(mymsg.toLowerCase())) {
        mymsg = mymsg.replace(superwhisperMsgReplaceRegex, "").split(" ")[0];
        bettercc.superwhisper(mymsg);
        mymsg = "";
        document.hold.OUT1.value = mymsg;
        return false;
      }

      // if whispernick arg
      else if (whispernick !== undefined) {
        //starts with "/"
        if (!mymsg.startsWith("/")) {
          mymsg = "/w " + whispernick + " " + mymsg;
        }
      }
    }

    document.hold.OUT1.value = mymsg;

    onSubmitOrig();
  };

  $('form[name="hold"]').attr("onsubmit", "bettercc.onSubmit();");
  $('form[name="hold"]').on("submit", function (e) {
    e.preventDefault();
  });

  if (superwhisper && !gast) {
    $("#fuu :nth-child(4)").after(
      '<a href="javascript://" class="button superwhisper" id="superwhisper" onclick="bettercc.superwhisper(last_id);">» Superwhisper</a>'
    );
  }

  // remove timeout from exit button
  $(".b7").attr("onclick", "bye()");

  // add gast class to userlist
  if (gast) {
    $("#ul").addClass("gast");
  }

  var main_css = GM_getResourceText("main_css");
  GM_wrench.addCss(main_css);

  if (darkMode) {
    let userStoreTheme = "theme_" + userStore;
    let userStoreColor = "color_" + userStore;

    const bgDef = "c8dae0";
    const fgDef = "000000";

    function getContrastYIQ(hexcolor) {
      var r = parseInt(hexcolor.substr(0, 2), 16);
      var g = parseInt(hexcolor.substr(2, 2), 16);
      var b = parseInt(hexcolor.substr(4, 2), 16);
      var yiq = (r * 299 + g * 587 + b * 114) / 1000;
      return yiq >= 128 ? "black" : "c8dae0";
    }

    $('form[name="OF"]').wrap("<div id='stuff'></div>");
    $('<div id="color"></div>').appendTo("#stuff");
    $('form[name="OF"]').detach().appendTo("#stuff").css("display", "");

    $(
      '<label id="darkmodechecklabel"><input type="checkbox" id="darkmodecheck" name="darkmodecheck" unchecked>Licht aus</label>'
    ).appendTo("#stuff");
    $("#darkmodecheck").css("margin", "5px").css("display", "inline");
    $("#darkmodecheck").change(function () {
      GM.setValue(userStoreTheme, Number(this.checked));
      $("#bgcolorpicker").prop("disabled", this.checked);
    });

    $(
      '<input type="color" id="bgcolorpicker" name="bgcolorpicker" value="#ff0000">'
    ).appendTo("#stuff");
    $("#bgcolorpicker").css("margin", "5px");
    $("#bgcolorpicker").change(function () {
      var bg = $("#bgcolorpicker").val().substring(1);
      var fg = getContrastYIQ(bg);

      (async () => {
        await GM.setValue(userStoreColor, bg);
      })();

      bettercc.setColors(bg, fg, 0);
    });
    $('<input id="resetbutton" type="button" value="R"  />').appendTo("#stuff");
    $("#resetbutton").click(function () {
      (async () => {
        await GM.setValue(userStoreColor, bgDef);
        await GM.setValue(userStoreTheme, 0);
      })();
      setTheme(0);
      //bettercc.setColors(bgDef, fgDef, 0);
      $("#bgcolorpicker").prop("disabled", this.checked);
    });

    async function getTheme() {
      let theme = await GM.getValue(userStoreTheme, 0);
      await GM.setValue(userStoreTheme, theme);
      setTheme(theme);
    }

    setTimeout(getTheme, 1000);
    var iframe = null;
    var iContentWindow = null;
    var iframeWindow = null;

    function setTheme(theme) {
      iframe = document.getElementById("chatframe");
      iContentWindow = iframe.contentWindow;
      iframeWindow = iContentWindow.document;

      if (theme) {
        var dark_mode_css = GM_getResourceText("dark_mode_css");
        var dark_mode_iframe_css = GM_getResourceText("dark_mode_iframe_css");

        if (!$("#darkmode").length) {
          $("head").append(
            '<style id="darkmode">' + dark_mode_css + "</style>"
          );
        }
        $(iframeWindow)
          .find("head")
          .append('<style id="darkmode">' + dark_mode_iframe_css + "</style>");
        setColors("0a1822", "c8dae0", theme);
      } else {
        $("head #darkmode").remove();
        $(iframeWindow).find("head #darkmode").remove();
        $("#darkmodecheck").prop("checked", false);
        (async () => {
          let bg = await GM.getValue(userStoreColor, bgDef);
          await GM.setValue(userStoreColor, bg);

          setColors(bg, fgDef, theme);
        })();
      }
    }

    const colorShade = (col, amt) => {
      col = col.replace(/^#/, "");
      if (col.length === 3) {
        col = col[0] + col[0] + col[1] + col[1] + col[2] + col[2];
      }
      let [r, g, b] = col.match(/.{2}/g);
      [r, g, b] = [
        parseInt(r, 16) + amt,
        parseInt(g, 16) + amt,
        parseInt(b, 16) + amt,
      ];

      r = Math.max(Math.min(255, r), 0).toString(16);
      g = Math.max(Math.min(255, g), 0).toString(16);
      b = Math.max(Math.min(255, b), 0).toString(16);

      const rr = (r.length < 2 ? "0" : "") + r;
      const gg = (g.length < 2 ? "0" : "") + g;
      const bb = (b.length < 2 ? "0" : "") + b;

      return `${rr}${gg}${bb}`;
    };

    var bgInterval = 0;

    function setColors(bg, fg, theme) {
      if (noChatBackgrounds) {
        iframeWindow.body.style.backgroundColor = bg;
        iframeWindow.body.style.color = fg;
      }
      // if (!noChatBackgrounds) {
      //   if (bgInterval) clearInterval(bgInterval);
      //   iframe.contentWindow.setbgcol(bg, fg);
      //   bgInterval = setInterval(function () {
      //     iframe.contentWindow.setbgcol(bg, fg);
      //   }, 100);
      // }

      $("#bgcolorpicker").val("#" + bg);

      if (theme == 0) {
        var ulistcolor = colorShade(bg, 30);
        var inputcolor = colorShade(bg, 80);
        var ulistcolorContrast = getContrastYIQ(ulistcolor);
        var placeholderContrast = getContrastYIQ(inputcolor);
        ulistcolor = "#" + ulistcolor;
        inputcolor = "#" + inputcolor;

        $(".userlist").css("background", ulistcolor);
        $("#custom_input_text").css("background", inputcolor);

        if (ulistcolorContrast == "black") {
          $("#ul").addClass("light").removeClass("dark");
        } else {
          $("#ul").addClass("dark").removeClass("light");
        }

        if (placeholderContrast == "black") {
          $("#custom_input_text").addClass("light").removeClass("dark");
        } else {
          $("#custom_input_text").addClass("dark").removeClass("light");
        }
      } else {
        $(".userlist").css("background", "inherit");
        $("#custom_input_text").removeAttr("style");
        $("#custom_input_text").removeClass("light").removeClass("dark");
        $("#ul").removeClass("dark").removeClass("light");
      }
    }
    bettercc.setColors = setColors;

    let themeListener = GM_addValueChangeListener(userStoreTheme, getTheme);
  }

  if (superwhisper && !gast) {
    let userStoreWhisper = "whisper_" + userStore;
    let openMsgCmdRegex = /^\/open\s|^\/o\s/;
    let openMsgReplaceRegex = /^\/open\s+|^\/o\s+/gi;

    (async function () {
      try {
        var whisperUser = await GM.getValue(userStoreWhisper);
      } catch {
        whisperUser = "";
      }

      await GM.setValue(userStoreWhisper, whisperUser);
      bettercc.superwhisper(whisperUser);
    })();

    bettercc.superwhisper = async function (whispernick) {
      var input = $("#custom_input_text");
      var placeholder = input.attr("placeholder");

      if (
        placeholder.includes(whispernick) ||
        whispernick === "" ||
        whispernick === undefined
      ) {
        $('form[name="hold').attr("onsubmit", "bettercc.onSubmit();");
        $("#custom_input_text").removeClass("superwhisper");
        await GM.setValue(userStoreWhisper, "");
        placeholder = "Du chattest mit allen...";
      } else {
        $('form[name="hold').attr(
          "onsubmit",
          'bettercc.onSubmit("' + whispernick + '");'
        );
        $("#custom_input_text").addClass("superwhisper");
        await GM.setValue(userStoreWhisper, whispernick);
        placeholder =
          "Du flüsterst mit " +
          whispernick +
          '...\tTipps: "/open", "/open Hi All :)"';
      }
      input.attr("placeholder", placeholder);
      $(".ulist-popup").hide();
    };
  }
} //MAIN CHAT
