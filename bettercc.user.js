// ==UserScript==
// @name     BetterCC
// @description  BetterCC is better
// @author       Sarah
// @version  1.17
// @icon https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/main/BetterCC.png
//
// @match  https://www.chatcity.de/de/cpop.html?&RURL=*
// @match  https://www.chatcity.de/de/nc/index.html
// @match  DONTMATCH-https://www.chatcity.de/cc_chat/chatout?CCSS=//images.chatcity.de
//
// @require  https://code.jquery.com/jquery-3.5.1.min.js
// @require  https://code.jquery.com/ui/1.12.1/jquery-ui.min.js
// @require  https://raw.githubusercontent.com/bgrins/TinyColor/master/tinycolor.js
// @require  https://cdn.jsdelivr.net/gh/CoeJoder/GM_wrench@v1.3/dist/GM_wrench.min.js
//
// @resource  main_css              https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/main/css/main.css?r=1.17
// @resource  iframe_css            https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/main/css/iframe.css?r=1.17
//
// @grant    GM_addStyle
// @grant    GM.setValue
// @grant    GM.getValue
// @grant    GM_addValueChangeListener
// @grant    GM_getResourceText
// @grant    GM_xmlhttpRequest
// @grant    GM_log
//
// @downloadURL https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/main/bettercc.user.js
// @updateURL https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/main/bettercc.user.js
//
// @supportURL https://github.com/SarahDieCoolige/BetterCC/issues
// @homepageURL https://github.com/SarahDieCoolige/BetterCC
// @run-at   document-end
// ==/UserScript==

/* globals jQuery, $, GM_wrench, ajax, tinycolor*/

"use strict";

function cclog(str, tag = "BetterCC") {
  GM_log(tag + " - " + str);
}

cclog("Version: " + GM_info.script.version + " - " + window.location.href);

function printInChat(position = "beforeend", content) {
  //$("#chatframe").contents().find("body").children().last().append(content);

  document
    .getElementById("chatframe")
    .contentWindow.frames.document.body.lastChild.insertAdjacentHTML(
      position,
      content
    );

  //let current = document.getElementById("chatframe").contentWindow.frames.document.body.lastChild.innerHTML;
  //document.getElementById("chatframe").contentWindow.frames.document.body.lastChild.innerHTML+=content;
}

function cclogChat(message, name = "BetterCC") {
  message =
    '<pre id="bccmessage" class="bccmessage" style="white-space: pre-wrap; font-size: 1.2em; width: 70%;">' +
    message +
    "</pre><br>";

  if (name.trim() !== "") {
    name += ": ";
    name = '<font color="red"><b>' + name + "</b></font>";
    message = name + message;
  }
  printInChat("beforeend", message);
}

let helpStrings = [
  ["/sw Sariam", "Superwhisper mit Sariam"],
  ["/o Hi All :)", "Im Open schreiben"],
  ["/open", "Superwhisper aus"],
  ["/sb Wendigo", "Einen Arsch für immer ignorieren (noch mal zum entbannen)"],
  ["/superban", "Arschliste anzeigen"],
  ["/reload", "Chat neu laden (mimimi)"],
  ["/settings", "Einstellungen öffnen (irgendwann mal vielleicht^^)"],
  ["/help", "So zeigst du diese Hilfe hier an"],
];

let $help = $("<table/>");
$help.addClass("helpTable");
for (let i = 0; i < helpStrings.length; i++) {
  $help.append(
    "<tr><td>" +
      helpStrings[i][0] +
      "</td><td>" +
      helpStrings[i][1] +
      "</td></tr>"
  );
}

let helptxt = [
  "/sw Sariam" + "\t" + "Superwhisper mit Sariam",
  "/o Hi All :)" + "\t" + "Im Open schreiben",
  "/open" + " \t\t" + "Superwhisper aus",
  "/sb Wendigo" +
    "\t" +
    "Einen Arsch für immer ignorieren (noch mal zum entbannen)",
  "/superban" + "\t" + "Arschliste anzeigen",
  "/reload" + "\t\t" + "Chat neu laden (mimimi)",
  "/settings" + "\t" + "Einstellungen öffnen (irgendwann mal vielleicht^^)",
  "/help" + "\t\t" + "So zeigst du diese Hilfe hier an",
].join("\n");

function printHelp() {
  cclogChat(helptxt, "Hilfe");
  //  printInChat("beforeend", helptxt);
}

// window functions
var bettercc = (unsafeWindow.bettercc = {});

const superban = 1;
const replaceInputField = 1;
const noChatBackgrounds = 1;

function getChatframe() {
  return document.getElementById("chatframe");
}

function getChatframeDocument() {
  return (
    getChatframe().contentDocument || getChatframe().contentWindow.document
  );
}

//MAIN CHAT
if (/cpop.html/.test(window.location.href)) {
  window.onunload = null;
  window.onbeforeunload = null;

  let gast = unsafeWindow.chat_ui === "h" ? 1 : 0;
  let userStore = gast ? "gast" : unsafeWindow.chat_nick.toLowerCase();

  if (noChatBackgrounds) forceNoChatBackgrounds();
  addCustomCss();
  cleanup();
  betterInput(replaceInputField);
  doColorStuff();
  //if (!gast) replaceOnSubmit();
  replaceOnSubmit();
  // add gast class to userlist
  if (gast) $("#ul").addClass("gast");
  if (superban) enableSuperban();

  function doColorStuff() {
    //remove table border
    $("#r_off1 table").attr("border", "0");

    $("#u_stats").hide();
    GM_wrench.waitForKeyElements(
      "#u_stats a.unc .value",
      function () {
        $("#u_stats span.name").remove();
        $("#u_stats")
          .clone(true)
          .attr("id", "u_stats_clone")
          .show()
          .insertAfter("#u_stats");

        $("#u_stats_clone .value").remove();

        $(
          '<span id="uonl_span" class="fa-stack fa-2x has-badge value no" data-count="0">  <i class="fa fa-id-card fa-stack-1x"></i></span>'
        ).appendTo("#u_stats_clone a.uonl");

        $(
          '<span id="ufri_span" class="fa-stack fa-2x has-badge value no" data-count="0">  <i class="fa fa-user-plus fa-stack-1x"></i></span>'
        ).appendTo("#u_stats_clone a.ufri");

        $(
          '<span id="unc_span" class="fa-stack fa-2x has-badge value no" data-count="0">  <i class="fa fa-envelope fa-stack-1x"></i></span>'
        ).appendTo("#u_stats_clone a.unc");

        updateStats();
        setInterval(updateStats, 10000);
      },
      true,
      100
    );

    function updateStats() {
      var test = new ajax(unsafeWindow.PAJAX + "chat_info_friends_nc.html", {
        update: "u_stats",
      });

      var friendsOnline = $("#u_stats a.uonl .value").text();
      var frendRequests = $("#u_stats a.ufri .value").text();
      var mailCount = $("#u_stats a.unc .value").text();

      // cclog(
      //   "Mails: " +
      //     mailCount +
      //     ", Freunde: " +
      //     friendsOnline +
      //     ", Anfragen: " +
      //     frendRequests
      // );

      $("#uonl_span")
        .attr("data-count", friendsOnline)
        .toggleClass("no", friendsOnline < 1);
      $("#ufri_span")
        .attr("data-count", frendRequests)
        .toggleClass("no", frendRequests < 1);
      $("#unc_span")
        .attr("data-count", mailCount)
        .toggleClass("no", mailCount < 1);
    }

    let userStoreColor = "color_" + userStore;

    const bgDef = "6AAED8";
    const fgDef = "000000";

    $('form[name="OF"]').wrap('<div id="options"></div>');

    $('<div id="betteroptions"></div>').appendTo("#options");

    $('<input type="color" id="bgcolorpicker" >')
      .val("#ff0000")
      .addClass("betterccbtn")
      .on("input", function (e) {
        var bg = this.value.substring(1);
        var fg = fgDef;

        bettercc.setColors(bg, fg, 0);
      })
      .change(function () {
        var bg = this.value.substring(1);
        (async () => {
          await GM.setValue(userStoreColor, bg);
        })();
      })
      .wrap('<div id="betteroptions"></div>')
      .appendTo("#betteroptions");

    $('<input type="button" id="reloadbutton" />')
      .val("mimimi...")
      .attr("title", "Chat hängt. Bitte neuladen!!!")
      .addClass("betterccbtn")
      .on("click", function () {
        bettercc.reloadChat();
      })
      .appendTo("#betteroptions");

    $('<input type="button" id="helpbutton" />')
      .val("?")
      .attr("title", "BetterCC Hilfe")
      .addClass("betterccbtn")
      .on("click", function () {
        printHelp();
      })
      .appendTo("#betteroptions");

    setTimeout(setTheme, 1000);

    bettercc.reloadChat = function reloadChat() {
      let chatframeDoc = getChatframeDocument();
      let children = chatframeDoc.body.children;

      let chatlog = "";
      // start with 13 since everything prior we don't need
      for (let i = 13; i < children.length; i++) {
        if (children[i].outerHTML.startsWith('<font size="-1"><br>')) {
          chatlog += children[i].outerHTML;
        }
      }

      let userStoreChatlog = "chatlog_" + userStore;
      (async function () {
        await GM.setValue(userStoreChatlog, chatlog);
      })();

      getChatframe().contentWindow.location.reload();

      setTimeout(setTheme, 2000);
      setTimeout(insertChatlog, 2000);

      function insertChatlog() {
        (async function () {
          var message = await GM.getValue(userStoreChatlog);
          if (!!chatlog) {
            cclog("Chatlog: " + message);

            printInChat("beforebegin", chatlog);
            //cclogChat("Chat wieder ganz?");
            //cclog(chatlog);
            //await GM.setValue(userStoreChatlog, "");
          } else {
            cclog("Kein Chatlog");
          }
        })();
      }
    };

    function setTheme() {
      let chatframedoc = getChatframeDocument();

      var iframe_css = GM_getResourceText("iframe_css");

      if (!$(chatframedoc).find("head").find("#iframe_css").length) {
        $(chatframedoc)
          .find("head")
          .append('<style id="iframe_css">' + iframe_css + "</style>");
      }

      (async () => {
        let bg = await GM.getValue(userStoreColor, bgDef);
        await GM.setValue(userStoreColor, bg);

        setColors(bg, fgDef);
      })();
    }

    function setColors(bg, fg) {
      var chatBg = tinycolor(bg);
      var chatFg = tinycolor(fg);
      var anaChatBg = chatBg.analogous();
      var monoChatBg = chatBg.monochromatic();
      var triadChatBg = chatBg.triad();

      fg = tinycolor.mostReadable(chatBg, anaChatBg.concat(monoChatBg), {
        includeFallbackColors: false,
      });

      if (noChatBackgrounds) {
        let chatframedoc = getChatframeDocument();
        chatframedoc.body.style.backgroundColor = chatBg.toHexString();
        chatframedoc.body.style.color = fg.toHexString();
      }

      $("#bgcolorpicker").val("#" + bg);

      let ulistcolor,
        footercolor,
        inputcolor,
        inputtextcolor,
        optionstextcolor,
        placeholdercolor,
        ulisttextcolor,
        buttoncolor,
        buttontextcolor,
        iconcolor,
        superwhispercolor,
        superbancolor;

      if (
        chatBg.toHsl().l > 0.8 ||
        (chatBg.toHsl().s >= 0.97 && chatBg.toHsl().l >= 0.45)
      ) {
        footercolor = chatBg.clone().darken(15).brighten(5);
      } else {
        footercolor = chatBg.clone().lighten(5).brighten(5);
      }
      ulistcolor = footercolor.clone().lighten(5);

      if (footercolor.toHsl().l < 0.2) {
        inputcolor = footercolor
          .clone()
          .darken(10)
          //.lighten(20)
          .desaturate(0);
      } else {
        inputcolor = footercolor
          .clone()
          .brighten(30)
          //.lighten(30)
          .desaturate(0);
      }

      inputtextcolor = tinycolor.mostReadable(
        inputcolor,
        inputcolor.monochromatic(),
        {
          includeFallbackColors: false,
        }
      );

      optionstextcolor = tinycolor.mostReadable(
        footercolor,
        monoChatBg.concat(anaChatBg),
        {
          includeFallbackColors: false,
        }
      );

      placeholdercolor = tinycolor.mostReadable(
        inputcolor,
        inputcolor.monochromatic(),
        {
          includeFallbackColors: false,
        }
      );

      let shades = [];

      for (var i = 10; i <= 50; i += 10) {
        shades.push(ulistcolor.clone().darken(i));
        shades.push(ulistcolor.clone().darken(-i));
      }

      ulisttextcolor = tinycolor.mostReadable(
        ulistcolor,
        monoChatBg.concat(shades),
        {
          includeFallbackColors: false,
        }
      );

      buttoncolor = inputcolor;
      buttontextcolor = tinycolor.mostReadable(buttoncolor, monoChatBg, {
        includeFallbackColors: false,
      });

      iconcolor = tinycolor.mostReadable(ulistcolor, monoChatBg, {
        includeFallbackColors: false,
      });

      superwhispercolor = triadChatBg[1];
      superbancolor = triadChatBg[2];

      let $root = $(":root");
      $root.css("--chatBackground", chatBg.toHslString());
      $root.css("--chatText", chatFg.toHslString());
      $root.css("--buttonColor", buttoncolor.toHslString());
      $root.css("--buttonText", buttontextcolor.toHslString());
      $root.css("--inputBackground", inputcolor.toHslString());
      $root.css("--inputText", inputtextcolor.toHslString());
      $root.css("--ulistColor", ulistcolor.toHslString());
      $root.css("--ulistText", ulisttextcolor.toHslString());
      $root.css("--optionsText", optionstextcolor.toHslString());
      $root.css("--footerBackground", footercolor.toHslString());
      $root.css("--placeholderColor", placeholdercolor.toHslString());
      $root.css("--iconColor", iconcolor.toHslString());
      $root.css("--superwhispercolor", superwhispercolor.toHslString());
      $root.css("--superbancolor", superbancolor.toHslString());

      if (tinycolor.isReadable(ulistcolor, ulisttextcolor, {})) {
        $("#ul").addClass("light").removeClass("dark");
      } else {
        $("#ul").addClass("dark").removeClass("light");
      }
    }
    bettercc.setColors = setColors;
  }

  /**
   *
   * Add Css to document head
   *
   */
  function addCustomCss() {
    $(
      '<link rel="stylesheet" href="https://use.fontawesome.com/releases/v5.15.2/css/solid.css" crossorigin="anonymous">' +
        '<link rel="stylesheet" href="https://use.fontawesome.com/releases/v5.15.2/css/regular.css" crossorigin="anonymous">' +
        '<link rel="stylesheet" href="https://use.fontawesome.com/releases/v5.15.2/css/fontawesome.css" crossorigin="anonymous">'
    ).appendTo("head");

    var main_css = GM_getResourceText("main_css");
    GM_wrench.addCss(main_css);
  }

  /**
   *
   * Force no Chat Backgrounds
   *
   */
  function forceNoChatBackgrounds() {
    var src = $("#chatframe").attr("src");
    src = src.replace("SBG=0", "SBG=1");
    $("#chatframe").attr("src", src);
  }

  /**
   *
   * Remove unnecessary stuff
   *
   */
  function cleanup() {
    // remove all but last ulist regualary since cc is just appending these instead of replacing
    GM_wrench.waitForKeyElements(
      "script[src^='https://www.chatcity.de/cc_chat/ulist?AKTION']",
      function (jNode) {
        $("head")
          .find(
            "script[src^='https://www.chatcity.de/cc_chat/ulist?AKTION']:not(:last)"
          )
          .remove();
      },
      false,
      30000
    );
    $("#popup-chat").removeAttr("ondragstart").removeAttr("ondrop");
    $("head")
      .find("script[src='https://ssl.google-analytics.com/ga.js']")
      .remove();
    //$("#u_stats a.unc").hide();
    $("#adv720").remove();
    $("#right_ad").hide();
    $("#popup-chat > table > tbody > tr:nth-child(1)").hide();
    $("#ul").addClass("headless");
    //$(".ww_chat_divide").hide();
    $(".chat_i1").remove();

    // remove timeout from exit button
    $(".b7").attr("onclick", "bye()");
  }

  /**
   *
   * Reaplce input with new and bigger textarea
   *
   * param replace
   *         true  - textarea
   *         false - keep default input
   */
  function betterInput(replace) {
    if (replace) {
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
  }

  function replaceOnSubmit() {
    /**
     *
     *  Supershwisper function
     *  Extend original onSubmit function
     *
     */

    // replace long submit function in input form
    let onSubmitOrig = new Function($('form[name="hold').attr("onsubmit"));

    bettercc.onSubmit = async function (whispernick) {
      let openMsgCmdRegex = /^\/open\s|^\/o\s/;
      let openMsgReplaceRegex = /^\/open\s+|^\/o\s+/gi;
      let superbanMsgCmdRegex = /^\/superban\s|^\/sb\s/;
      let superbanMsgReplaceRegex = /^\/superban\s+|^\/sb\s+/gi;
      let superwhisperMsgCmdRegex = /^\/superwhisper\s|^\/sw\s/;
      let superwhisperMsgReplaceRegex = /^\/superwhisper\s+|^\/sw\s+/gi;

      let mymsg = document.hold.OUT1.value.trim();

      //starts with "/bettercc " or "/help "
      if (
        mymsg.toLowerCase() === "/bettercc" ||
        mymsg.toLowerCase() === "/help"
      ) {
        printHelp();
        mymsg = "";
        document.hold.OUT1.value = mymsg;
        return false;
      }

      if (superban) {
        //IS "/superban " or "/sb "
        if (
          mymsg.toLowerCase() === "/superban" ||
          mymsg.toLowerCase() === "/sb"
        ) {
          let banlist = (await bettercc.getSuperbans()).join(", ").toString();
          cclogChat(banlist, "Banliste");

          mymsg = "";
          document.hold.OUT1.value = mymsg;
          return false;
        }
        if (superbanMsgCmdRegex.test(mymsg.toLowerCase())) {
          mymsg = mymsg.replace(superbanMsgReplaceRegex, "").split(" ")[0];
          bettercc.superban(mymsg);
          cclog("Superban:" + mymsg);
          mymsg = "";
          document.hold.OUT1.value = mymsg;
          return false;
        }
      }

      // IS "/open"
      if (mymsg.toLowerCase() === "/open") {
        bettercc.superwhisper("");
        mymsg = "";
        document.hold.OUT1.value = mymsg;
        return false;
      }

      // IS "/reload"
      if (mymsg.toLowerCase() === "/reload") {
        bettercc.reloadChat();
        mymsg = "";
        document.hold.OUT1.value = mymsg;
        return false;
      }

      //starts with "/superwhisper " or "/sw "
      if (superwhisperMsgCmdRegex.test(mymsg.toLowerCase())) {
        mymsg = mymsg.replace(superwhisperMsgReplaceRegex, "").split(" ")[0];
        bettercc.superwhisper(mymsg, false);
        mymsg = "";
        document.hold.OUT1.value = mymsg;
        return false;
      }

      //starts with "/open " or "/o "
      if (openMsgCmdRegex.test(mymsg.toLowerCase())) {
        mymsg = mymsg.replace(openMsgReplaceRegex, "");
      }

      // if whispernick arg
      else if (whispernick !== undefined) {
        //starts with "/"
        if (!mymsg.startsWith("/")) {
          mymsg = "/w " + whispernick + " " + mymsg;
        }
      }

      document.hold.OUT1.value = mymsg;

      onSubmitOrig();
    };

    //replace onSubmit function of textarea/input field
    $('form[name="hold"]').attr("onsubmit", "bettercc.onSubmit();");
    $('form[name="hold"]').on("submit", function (e) {
      e.preventDefault();
    });

    // add superwhisper to userlist popup
    $("#fuu :nth-child(4)").after(
      '<a href="javascript://" class="button superwhisper" id="superwhisper" onclick="bettercc.superwhisper(last_id);">» Superwhisper</a>'
    );

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
        placeholderStr =
          "Du chattest mit allen..." +
          "\n\n" +
          "Superwhisper: /sw Sariam" +
          "  |  " +
          "Ban: /sb Wendigo" +
          "  |  " +
          "Hilfe: /help";

        input.removeClass("superwhisper");
        await GM.setValue(userStoreWhisper, "");
      } else {
        submitStr = 'bettercc.onSubmit("' + whispernick + '");';
        placeholderStr =
          "Du flüsterst mit " +
          whispernick +
          "..." +
          "\n\n" +
          "Superwhisper aus: /open" +
          "  |  " +
          "/o Hi All :)" +
          "  |  " +
          "Hilfe: /help";

        input.addClass("superwhisper");
        await GM.setValue(userStoreWhisper, whispernick);
      }
      form.attr("onsubmit", submitStr);
      input.attr("placeholder", placeholderStr);
      $(".ulist-popup").hide();
    };
  }

  function enableSuperban() {
    //add superban option to userpopup
    $("#fuu").append(
      '<a href="javascript://" class="button superban" id="superban" onclick="bettercc.superban(last_id);">» Superban</a>'
    );

    //get online users
    $("<script>")
      .attr(
        "src",
        "//images.chatcity.de/script/aw.js?r=" +
          Math.round(new Date().getTime() / 1000)
      )
      .attr("type", "text/javascript")
      .appendTo("head");

    var alreadyBanned = [];

    let userStoreBan = "ban_" + userStore;
    // listen for manual changes in gm value
    let listenerId = GM_addValueChangeListener(
      userStoreBan,
      bettercc.getSuperbans
    );

    bettercc.getSuperbans = async function () {
      var superbans = [];
      try {
        superbans = Array.from(await GM.getValue(userStoreBan))
          .map((v) => v.toLowerCase())
          .sort();
      } catch {
        superbans = [];
      }
      await GM.setValue(userStoreBan, superbans);
      return superbans;
    };

    // start banning
    var refreshUsersInterval = setInterval(refreshUserList, 4000);
    //clearInterval(refreshUsersInterval);

    bettercc.superban = async function (nickToBan) {
      nickToBan = nickToBan.toLowerCase();
      let superbans = await bettercc.getSuperbans();
      var confirmStr = "";
      if (!superbans.includes(nickToBan)) {
        // user to superban array
        confirmStr =
          "Möchtest du " +
          nickToBan.toUpperCase() +
          " wirklich dauerhaft ignorieren?";
        if (window.confirm(confirmStr)) {
          // add to banned array
          superbans.push(nickToBan);
        }
        //$('#cu_n').parent(':contains(""'nickToBan')').sibling('.button.superban').text("» Banned");
      } else {
        confirmStr =
          "Möchtest du " +
          nickToBan.toUpperCase() +
          " wirklich aus deiner Ignoreliste entfernen?";
        if (window.confirm(confirmStr)) {
          // remove name from banned array
          superbans = superbans.filter(function (item) {
            return String(item) !== nickToBan;
          });

          // unban in chat
          new ajax(
            unsafeWindow.PCHAT +
              "/chatin?SID=" +
              unsafeWindow.chat_sid +
              "&ID=" +
              unsafeWindow.chat_id +
              "&OUT=" +
              encodeURIComponent("/ignore " + nickToBan) +
              "&x=" +
              Math.random(),
            { method: "get" }
          );
          //$('#fuu > a.hasText(nickToBan).button.superban').text("» Superban");
        }
      }

      //store superbans
      GM.setValue(userStoreBan, superbans.sort());
      cclogChat("Schreib <b>/superban</b> um deine <b>Bannliste</b> zu sehen");

      //hide popup after click
      $(".ulist-popup").hide();
    };

    async function refreshUserList() {
      var time = Math.round(new Date().getTime() / 1000);
      var url = "//images.chatcity.de/script/aw.js?r=";
      var src = url + time;

      if ($("#userlistjs").length) {
        $("#userlistjs").remove();
      }
      $('<script id="userlistjs">')
        .attr("src", src)
        .attr("type", "text/javascript")
        .appendTo("head");

      var superbans = await bettercc.getSuperbans();

      //cclog("Superbans: " + superbans);
      var users = getUsers();
      //cclog("Users: " + users);
      var usersToBeBanned = getUsersToBeBanned(users, superbans);
      if (usersToBeBanned.length) {
        cclog("Users to be banned:\n\t" + usersToBeBanned);
        clearInterval(refreshUsersInterval);
        await banUsers(usersToBeBanned);
        // stop execution and restart in banUsers();
        refreshUsersInterval = setInterval(refreshUserList, 4000);
      }
      unsafeWindow.superbans = superbans;
    }

    function getUsers() {
      var users_gloabal = [];
      // get global chat users from cha[].
      for (var i = 2; i < unsafeWindow.cha.length; i += 3) {
        users_gloabal = users_gloabal.concat(
          unsafeWindow.cha[i].toLowerCase().split(" ").filter(Boolean)
        );
      }
      //cclog("users_gloabal: " + users_gloabal);

      var users_channel = [];
      // get local channel users from cha_my[].
      for (var j = 0; j < unsafeWindow.cha_my.length; j += 2) {
        users_channel = users_channel.concat(
          unsafeWindow.cha_my[j].toLowerCase().split(" ").filter(Boolean)
        );
      }
      //cclog("users_channel: " + users_channel);

      var users_tmp = users_gloabal.concat(users_channel);

      // get unique users from both arrays
      var users = users_tmp.filter(
        (item, pos) => users_tmp.indexOf(item) === pos
      );

      //cclog("users: " + users);
      return users;
    }

    function getUsersToBeBanned(users, superbans) {
      var usersToBeBanned = []; //clear array

      for (const banUser of superbans) {
        if (
          !usersToBeBanned.includes(banUser) &&
          !alreadyBanned.includes(banUser) &&
          users.includes(banUser)
        ) {
          usersToBeBanned.push(banUser);
        }
      }
      return usersToBeBanned;
    }

    const sleepNow = (delay) =>
      new Promise((resolve) => setTimeout(resolve, delay));

    async function banUsers(users) {
      for (const user of users) {
        //await banUser(user);
        //cclog("Waiting to be banned:\n\t" + users);

        users = users.filter((val) => val !== user); //remove user from array
        await sleepNow(1150);
      }
      //cclog("All assholes banned for now:\n\t" + alreadyBanned);
      //cclogChat("Tschüss " + alreadyBanned.toString());
    }

    async function banUser(user) {
      new ajax(
        unsafeWindow.PCHAT +
          "/chatin?SID=" +
          unsafeWindow.chat_sid +
          "&ID=" +
          unsafeWindow.chat_id +
          "&OUT=" +
          encodeURIComponent("/ignore " + user) +
          "&x=" +
          Math.random(),
        { method: "get" }
      );
      alreadyBanned.push(user);
      cclog("Banned " + user);
      //cclogChat("Bans: " + alreadyBanned.toString());
      unsafeWindow.alreadyBanned = alreadyBanned;
    }
  }
} //MAIN CHAT
