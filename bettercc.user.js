// ==UserScript==
// @name     BetterCC Beta
// @version  0.2.0
//
// @include  https://www.chatcity.de/de/cpop.html?&RURL=//www.chatcity.de/
// @include  https://www.chatcity.de/de/cpop.html?&RURL=//www.chatcity.de/*
//
// @require  http://code.jquery.com/jquery-2.2.4.min.js
// @require  https://cdn.jsdelivr.net/gh/CoeJoder/GM_wrench@v1.1/dist/GM_wrench.min.js
//
// @resource  main_css      https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/main/css/main.css?r=0.2.0
// @resource  dark_mode_css https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/main/css/dark-blue-gray.css?r=0.2.0
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
// @supportURL https://github.com/SarahDieCoolige/BetterCC/issues
// @homepageURL https://github.com/SarahDieCoolige/BetterCC
// @run-at   document-idle
// ==/UserScript==
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

//MAIN CHAT
if (/cpop.html/.test(window.location.href)) {
  let gast = chat_ui === "h" ? 1 : 0;
  let userStore = gast ? "gast" : chat_nick.toLowerCase();

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

  if (superwhisper) {
    $("#fuu :nth-child(4)").after(
      '<a href="javascript://" class="button superwhisper" id="superwhisper" onclick="bettercc.superwhisper(last_id);">» Superwhisper</a>'
    );
    // $('<a href="javascript://" class="button superwhisper" id="superwhisper" onclick="bettercc.superwhisper(last_id);">» Superwhisper</a>' ).insertAfter("#fuu .headline");
    //
    // replace long submit function in input form
    let onSubmit = new Function($('form[name="hold').attr("onsubmit"));
    bettercc.onSubmit = onSubmit;
    $('form[name="hold"]').attr("onsubmit", "bettercc.onSubmit();");
    $('form[name="hold"]').on("submit", function (e) {
      e.preventDefault();
    });
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
    $(".b15").attr("onclick", "bettercc.toggleTheme()");
    let userStoreTheme = "theme_" + userStore;

    bettercc.toggleTheme = async function () {
      let theme = await GM.getValue(userStoreTheme, 1);
      //alert(theme);

      theme = ++theme % 3;
      //alert(theme);
      await GM.setValue(userStoreTheme, theme);
    };

    async function getTheme() {
      let theme = await GM.getValue(userStoreTheme, 2);
      await GM.setValue(userStoreTheme, theme);
      setTheme(theme);
    }

    setTimeout(getTheme(), 500);

    var bgInterval = 0;
    async function setTheme(theme) {
      clearInterval(bgInterval);

      var iframe = document.getElementById("chatframe");
      var iContentWindow = iframe.contentWindow;
      var iframeWindow = iContentWindow.document;

      if (theme) {
        var dark_mode_css = GM_getResourceText("dark_mode_css");
        //GM_wrench.addCss(dark_mode_css);
        $("head").append('<style id="darkmode">' + dark_mode_css + "</style>");

        if (theme >= 1) {
          $("head").append(
            '<style id="darkmode">' + dark_mode_css + "</style>"
          );
          setTimeout(function () {
            $(iframeWindow).find("head #darkmode").remove();
            if (bgInterval) clearInterval(bgInterval);
            //bgInterval = setInterval(function () { $(iframeWindow).find("body").css('background-color', 'eba096').css('color', 'black'); }, 500);
            bgInterval = setInterval(function () {
              iframe.contentWindow.setbgcol("c8dae0", "black");
            }, 300);
          }, 1000);
        }
        if (theme == 2) {
          setTimeout(function () {
            $(iframeWindow).find("#darkmode").remove();
            $(iframeWindow)
              .find("head")
              .append('<style id="darkmode">' + dark_mode_css + "</style>");
            if (bgInterval) clearInterval(bgInterval);
            bgInterval = setInterval(function () {
              iframe.contentWindow.setbgcol("0a1822", "c8dae0");
            }, 300);
          }, 1000);
        }
      } else {
        $("head #darkmode").remove();
        setTimeout(function () {
          $(iframeWindow).find("head #darkmode").remove();
          if (bgInterval) clearInterval(bgInterval);
          bgInterval = setInterval(function () {
            iframe.contentWindow.setbgcol("c8dae0", "black");
          }, 300);
        }, 1000);
      }
    }
    let themeListener = GM_addValueChangeListener(userStoreTheme, getTheme);
  }

  if (superwhisper) {
    let userStoreWhisper = "whisper_" + userStore;
    let openMsgCmdRegex = /^\/open\s|^\/o\s/;
    let openMsgReplaceRegex = /^\/open\s+|^\/o\s+/gi;

    (async function () {
      try {
        var whisperUser = await GM.getValue(userStoreWhisper);
      } catch {
        var whisperUser = "";
      }

      await GM.setValue(userStoreWhisper, whisperUser);
      bettercc.superwhisper(whisperUser);
    })();

    bettercc.onSubmitSuperwhisper = function (whispernick) {
      var mymsg = document.hold.OUT1.value.trim();

      if (mymsg.toLowerCase() === "/open") {
        bettercc.superwhisper("");
        mymsg = "";
        document.hold.OUT1.value = mymsg;
        return false;
      }
      //else if starts with "/open " or "/o "
      else if (openMsgCmdRegex.test(mymsg.toLowerCase())) {
        mymsg = mymsg.replace(openMsgReplaceRegex, "");
      } else if (!mymsg.startsWith("/")) {
        mymsg = "/w " + whispernick + " " + mymsg;
      }

      document.hold.OUT1.value = mymsg;
      bettercc.onSubmit();
    };

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
          'bettercc.onSubmitSuperwhisper("' + whispernick + '");'
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
