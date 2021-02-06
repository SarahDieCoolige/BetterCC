// ==UserScript==
// @name     BetterCC Beta
// @version  0.5.6
//
// @include  https://www.chatcity.de/de/cpop.html?&RURL=//www.chatcity.de/
// @include  https://www.chatcity.de/de/cpop.html?&RURL=//www.chatcity.de/*
//
// @require  https://code.jquery.com/jquery-3.5.1.min.js
// @require  https://code.jquery.com/ui/1.12.1/jquery-ui.min.js
// @require  https://raw.githubusercontent.com/bgrins/TinyColor/master/tinycolor.js
// @require  https://cdn.jsdelivr.net/gh/CoeJoder/GM_wrench@v1.1/dist/GM_wrench.min.js
//
// @resource  main_css      https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/main/css/main.css?r=0.5.6
// @resource  dark_mode_css https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/main/css/dark-blue-gray.css?r=0.5.6
// @resource  dark_mode_iframe_css https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/main/css/darkmode_chatframe.css?r=0.5.6
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
//
// @supportURL https://github.com/SarahDieCoolige/BetterCC/issues
// @homepageURL https://github.com/SarahDieCoolige/BetterCC
// @run-at   document-idle
// ==/UserScript==

/* globals jQuery, $, GM_wrench, ajax, tinycolor*/

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
        bettercc.superwhisper(mymsg, false);
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

    $('form[name="OF"]')
      .wrap("<div id='optionsdiv'></div>")
      .css("display", "block");
    //$('form[name="OF"]').detach().appendTo("#optionsdiv").css("display", "");

    $(
      '<label id="darkmodechecklabel"><input type="checkbox" id="darkmodecheck" name="darkmodecheck" unchecked>Licht aus</label>'
    ).appendTo("#optionsdiv");
    $("#darkmodecheck").css("margin", "5px").css("display", "inline");
    $("#darkmodecheck").change(function () {
      GM.setValue(userStoreTheme, Number(this.checked));
      $("#bgcolorpicker").prop("disabled", this.checked);
    });

    $('<input type="color" id="bgcolorpicker" >')
      .val("#ff0000")
      .css("border-style", "solid")
      .css("margin", "5px")
      .change(function () {
        var bg = $("#bgcolorpicker").val().substring(1);
        var fg = fgDef;

        (async () => {
          await GM.setValue(userStoreColor, bg);
        })();

        bettercc.setColors(bg, fg, 0);
      })
      .appendTo("#optionsdiv");

    $('<input type="button" id="resetbutton" />')
      .css("border-style", "solid")
      .val("R")
      .click(function () {
        (async () => {
          await GM.setValue(userStoreColor, bgDef);
          await GM.setValue(userStoreTheme, 0);
        })();
        setTheme(0);
        //bettercc.setColors(bgDef, fgDef, 0);
        $("#bgcolorpicker").prop("disabled", this.checked);
      })
      .appendTo("#optionsdiv");

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

    function setColors(bg, fg, theme) {
      var tiny = tinycolor(bg);
      var ana = tiny.analogous();
      var mono = tiny.monochromatic();
      var triad = tiny.triad();

      fg = tinycolor
        .mostReadable(bg, ana.concat(mono), {
          includeFallbackColors: true,
        })
        .toHexString();

      if (noChatBackgrounds) {
        iframeWindow.body.style.backgroundColor = bg;
        iframeWindow.body.style.color = fg;
      }

      $("#bgcolorpicker").val("#" + bg);

      if (theme == 0) {
        var ulistcolor = tiny.clone().darken(5);
        var inputcolor = tiny.clone().lighten(15).desaturate(5).toHexString();
        //footercolor = mono[5];
        //footercolor = tiny.spin(45);

        var footercolor = null;

        if (tiny.isLight()) {
          cclog("isLight => darken");
          footercolor = tiny.clone().brighten(0).darken(20);
        } else {
          cclog("isDark => lighten");
          footercolor = tiny.clone().brighten().lighten(5);
        }

        if (footercolor.getBrightness() < 190) {
          inputcolor = footercolor
            .clone()
            .brighten(20)
            .lighten(20)
            .desaturate(0)
            .toHexString();
        } else {
          inputcolor = footercolor
            .clone()
            .brighten(30)
            .darken(10)
            .desaturate(0)
            .toHexString();
        }

        //    footercolor = mono[2];
        //    if (footercolor.getBrightness() < 30 )  footercolor = mono[2];

        //cclog("brightness:" + footercolor.getBrightness());
        var inputtextcolor = tinycolor
          .mostReadable(inputcolor, ["white", "black"], {
            includeFallbackColors: true,
          })
          .toHexString();

        var optionstextcolor = tinycolor
          .mostReadable(footercolor, ["white", "black"], {
            includeFallbackColors: true,
          })
          .toHexString();

        var placeholdercolor = tinycolor
          .mostReadable(inputcolor, ana.concat(mono), {
            includeFallbackColors: false,
          })
          .toHexString();

        var ulisttextcolor = tinycolor
          .mostReadable(ulistcolor, ana.concat(mono).concat(triad), {
            includeFallbackColors: true,
          })
          .toHexString();

        var buttoncolor = footercolor;
        var buttoncolortextcolor = tinycolor
          .mostReadable(buttoncolor, ana.concat(mono).concat(triad), {
            includeFallbackColors: true,
          })
          .toHexString();

        $("#bgcolorpicker, #resetbutton")
          .css("background", buttoncolor)
          .css("color", buttoncolortextcolor)
          .css("border-color", inputcolor);

        $("#custom_input_text").css("color", inputtextcolor);
        $("td.chat_i2").css("color", optionstextcolor);

        $(".userlist").css({ background: ulistcolor.toHexString() });
        //$(".userlist, .u_reg .chan_text").css({ background: ulistcolor.toHexString() });
        //$("#u_stats .value.no").css({ color: ulistcolor.toHexString() });
        //$(".u_reg .chan_text").css({ background: ulistcolor.toHexString() });
        $("#custom_input_text").css("background", inputcolor);
        $(".ww_chat_footer").css("background", footercolor.toHexString());

        let ulistcolorstr =
          '<style id="ulisttext-color">.ulinner a{color:' +
          ulisttextcolor +
          "} .u_reg .ulinner{color:" +
          ulisttextcolor +
          "}</style>";

        if ($("#ulisttext-color").length) {
          $("#ulisttext-color").replaceWith(ulistcolorstr);
        } else {
          $("head").append(ulistcolorstr);
        }

        if (tinycolor.isReadable(bg, ulisttextcolor, {})) {
          $("#ul").addClass("light").removeClass("dark");
        } else {
          $("#ul").addClass("dark").removeClass("light");
        }

        let placeholdecolorstr =
          '<style id="placeholder-color">#custom_input_text::placeholder{color:' +
          placeholdercolor +
          "}</style>";

        if ($("#placeholder-color").length) {
          $("#placeholder-color").replaceWith(placeholdecolorstr);
        } else {
          $("head").append(placeholdecolorstr);
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

    (async function () {
      try {
        var whisperUser = await GM.getValue(userStoreWhisper);
      } catch {
        whisperUser = "";
      }
      await GM.setValue(userStoreWhisper, whisperUser);
      bettercc.superwhisper(whisperUser, false);
    })();

    bettercc.superwhisper = async function (whispernick, toggle = true) {
      let form = $('form[name="hold');
      let input = $("#custom_input_text");
      let submitStr = null;
      let placeholderStr = null;
      let currentWhisperNick = await GM.getValue(userStoreWhisper);

      if (
        (toggle &&
          currentWhisperNick.toLowerCase() === whispernick.toLowerCase()) ||
        whispernick === "" ||
        whispernick === undefined
      ) {
        submitStr = "bettercc.onSubmit();";
        placeholderStr = "Du chattest mit allen...";
        input.removeClass("superwhisper");
        await GM.setValue(userStoreWhisper, "");
      } else {
        submitStr = 'bettercc.onSubmit("' + whispernick + '");';
        placeholderStr =
          "Du flüsterst mit " +
          whispernick +
          '...\tTipps: "/open", "/open Hi All :)"';
        input.addClass("superwhisper");
        await GM.setValue(userStoreWhisper, whispernick);
      }
      form.attr("onsubmit", submitStr);
      input.attr("placeholder", placeholderStr);
      $(".ulist-popup").hide();
    };
  }
} //MAIN CHAT
