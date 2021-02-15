// ==UserScript==
// @name     BetterCC DEV
// @version  0.40
//
// @include  https://www.chatcity.de/de/cpop.html?&RURL=//www.chatcity.de/
// @include  https://www.chatcity.de/de/cpop.html?&RURL=//www.chatcity.de/*
// @include  https://www.chatcity.de/de/nc/index.html
//// @include  https://www.chatcity.de/cc_chat/chatout?CCSS=//images.chatcity.de/*
//
// @require  https://code.jquery.com/jquery-3.5.1.min.js
// @require  https://code.jquery.com/ui/1.12.1/jquery-ui.min.js
// @require  https://raw.githubusercontent.com/bgrins/TinyColor/master/tinycolor.js
// @require  https://cdn.jsdelivr.net/gh/CoeJoder/GM_wrench@v1.1/dist/GM_wrench.min.js
//
// @resource  main_css              https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/dev/css/main.css?r=0.40
// @resource  iframe_css            https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/dev/css/iframe.css?r=0.40
//
// @resource  dark_mode_css         https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/dev/css/darker.css?r=0.40
// @resource  dark_mode_iframe_css  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/dev/css/darkmode_chatframe.css?r=0.40
//
// @grant    GM_addStyle
// @grant    GM.setValue
// @grant    GM.getValue
// @grant    GM_addValueChangeListener
// @grant    GM_getResourceText
// @grant    GM_log
//
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

const superban = 1;
const replaceInputField = 1;
const noChatBackgrounds = 1;

//MAIN CHAT
if (/cpop.html/.test(window.location.href)) {
  let gast = unsafeWindow.chat_ui === "h" ? 1 : 0;
  let userStore = gast ? "gast" : unsafeWindow.chat_nick.toLowerCase();

  if (noChatBackgrounds) forceNoChatBackgrounds();
  addCustomCss();
  cleanup();
  betterInput(replaceInputField);
  doColorStuff();
  if (!gast) replaceOnSubmit();
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
      },
      true,
      100
    );

    GM_wrench.waitForKeyElements("#u_stats div", updateStats, false, 20000);

    function updateStats() {
      var uonl_value = $("#u_stats a.uonl .value").text();
      var ufri_value = $("#u_stats a.ufri .value").text();
      var unc_value = $("#u_stats a.unc .value").text();

      $("#uonl_span")
        .attr("data-count", uonl_value)
        .toggleClass("no", uonl_value < 1);
      $("#ufri_span")
        .attr("data-count", ufri_value)
        .toggleClass("no", ufri_value < 1);
      $("#unc_span")
        .attr("data-count", unc_value)
        .toggleClass("no", unc_value < 1);
    }

    let userStoreTheme = "theme_" + userStore;
    let userStoreColor = "color_" + userStore;

    const bgDef = "6AAED8";
    const fgDef = "000000";

    $('form[name="OF"]').wrap('<div id="options"></div>');

    $('<div id="betteroptions"></div>').appendTo("#options");

    $('<input type="color" id="bgcolorpicker" >')
      .val("#ff0000")
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

    $(
      '<label id="darkmodechecklabel"><input type="checkbox" id="darkmodecheck" name="darkmodecheck" unchecked></label>'
    ).appendTo("#betteroptions");

    $("#darkmodecheck").change(function () {
      GM.setValue(userStoreTheme, Number(this.checked));
      $("#bgcolorpicker").prop("disabled", this.checked);
    });

    $('<input type="button" id="resetbutton" />')
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
      .appendTo("#betteroptions");

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

        if (!$(iframeWindow).find("head").find("#darkmode").length) {
          $(iframeWindow)
            .find("head")
            .append(
              '<style id="darkmode">' + dark_mode_iframe_css + "</style>"
            );
        }
        setColors("0a1822", "c8dae0", theme);
      } else {
        var iframe_css = GM_getResourceText("iframe_css");

        if (!$(iframeWindow).find("head").find("#iframe_css").length) {
          $(iframeWindow)
            .find("head")
            .append('<style id="iframe_css">' + iframe_css + "</style>");
        }

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
      var chatBg = tinycolor(bg);
      var chatFg = tinycolor(fg);
      var anaChatBg = chatBg.analogous();
      var monoChatBg = chatBg.monochromatic();
      var triadChatBg = chatBg.triad();

      fg = tinycolor.mostReadable(chatBg, anaChatBg.concat(monoChatBg), {
        includeFallbackColors: false,
      });

      if (noChatBackgrounds) {
        iframeWindow.body.style.backgroundColor = chatBg.toHexString();
        iframeWindow.body.style.color = fg.toHexString();
      }

      $("#bgcolorpicker").val("#" + bg);

      if (theme == 0) {
        let ulistcolor,
          footercolor,
          inputcolor,
          inputtextcolor,
          optionstextcolor,
          placeholdercolor,
          ulisttextcolor,
          buttoncolor,
          buttontextcolor,
          iconcolor;

        cclog(chatBg.toHslString());
        //if (
        //  chatBg.toHsl().l > 0.83 ||
        //  (chatBg.toHsl().s >= 0.99 &&
        //    chatBg.toHsl().l >= 0.5 &&
        //    chatBg.toHsl().l <= 0.6)
        //) {
        if (
          chatBg.toHsl().l > 0.8 ||
          (chatBg.toHsl().s >= 0.97 && chatBg.toHsl().l >= 0.45)
        ) {
          footercolor = chatBg.clone().darken(15).brighten(5);
        } else {
          footercolor = chatBg.clone().lighten(5).brighten(5);
        }
        ulistcolor = footercolor.clone();

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

        $(":root").css("--chatBackground", chatBg.toHexString());
        $(":root").css("--chatText", chatFg.toHexString());
        $(":root").css("--buttonColor", buttoncolor.toHexString());
        $(":root").css("--buttonText", buttontextcolor.toHexString());
        $(":root").css("--inputBackground", inputcolor.toHexString());
        $(":root").css("--inputText", inputtextcolor.toHexString());
        $(":root").css("--ulistColor", ulistcolor.toHexString());
        $(":root").css("--ulistText", ulisttextcolor.toHexString());
        $(":root").css("--optionsText", optionstextcolor.toHexString());
        $(":root").css("--footerBackground", footercolor.toHexString());
        $(":root").css("--placeholderColor", placeholdercolor.toHexString());
        $(":root").css("--iconColor", iconcolor.toHexString());

        // if (tinycolor.isReadable(ulistcolor, ulisttextcolor, {})) {
        //   $("#ul").addClass("light").removeClass("dark");
        // } else {
        //   $("#ul").addClass("dark").removeClass("light");
        // }

        //$("#ul").addClass("dark").removeClass("light");
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

    bettercc.onSubmit = function (whispernick) {
      let openMsgCmdRegex = /^\/open\s|^\/o\s/;
      let openMsgReplaceRegex = /^\/open\s+|^\/o\s+/gi;
      let superbanMsgCmdRegex = /^\/superban\s|^\/sb\s/;
      let superbanMsgReplaceRegex = /^\/superban\s+|^\/sb\s+/gi;
      let superwhisperMsgCmdRegex = /^\/superwhisper\s|^\/sw\s/;
      let superwhisperMsgReplaceRegex = /^\/superwhisper\s+|^\/sw\s+/gi;

      let mymsg = document.hold.OUT1.value.trim();

      if (superban) {
        //starts with "/superban " or "/sb "
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
    let listenerId = GM_addValueChangeListener(userStoreBan, getSuperbans);

    async function getSuperbans() {
      var superbans = [];
      try {
        superbans = Array.from(await GM.getValue(userStoreBan)).map((v) =>
          v.toLowerCase()
        );
      } catch {
        superbans = [];
      }
      await GM.setValue(userStoreBan, superbans);
      return superbans;
    }

    // start banning
    var interval = setInterval(refreshUserList, 4000);
    //clearInterval(interval);

    bettercc.superban = async function (nickToBan) {
      nickToBan = nickToBan.toLowerCase();
      let superbans = await getSuperbans();
      var confirmStr = "";
      if (!superbans.includes(nickToBan)) {
        // user to superban array
        confirmStr =
          "Möchtest du " + nickToBan + " wirklich dauerhaft ignorieren?";
        if (window.confirm(confirmStr)) {
          // add to banned array
          superbans.push(nickToBan);
        }
        //$('#cu_n').parent(':contains(""'nickToBan')').sibling('.button.superban').text("» Banned");
      } else {
        confirmStr =
          "Möchtest du " +
          nickToBan +
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
      GM.setValue(userStoreBan, superbans);

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

      var superbans = await getSuperbans();

      //cclog("Superbans: " + superbans);
      var users = getUsers();
      //cclog("Users: " + users);
      var usersToBeBanned = getUsersToBeBanned(users, superbans);
      if (usersToBeBanned.length) {
        cclog("Users to be banned:\n\t" + usersToBeBanned);
        clearInterval(interval);
        await banUsers(usersToBeBanned);
        // stop execution and restart in banUsers();
        interval = setInterval(refreshUserList, 4000);
      }
      unsafeWindow.superbans = superbans;
    }

    function getUsers() {
      var users = [];

      for (var i = 2; i < unsafeWindow.cha.length; i += 3) {
        users = users.concat(
          unsafeWindow.cha[i].toLowerCase().split(" ").filter(Boolean)
        );
      }
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
        await banUser(user);
        cclog("Waiting to be banned:\n\t" + users);

        users = users.filter((val) => val !== user); //remove user from array
        await sleepNow(1150);
      }
      cclog("All assholes banned for now:\n\t" + alreadyBanned);
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
      cclog("Got rid of " + user);
      unsafeWindow.alreadyBanned = alreadyBanned;
    }
  }
} //MAIN CHAT

//iframe
if (/chatout/.test(window.location.href)) {
}

//MAILS
if (/nc\/index.html$/.test(window.location.href)) {
  /** AUTODELETE MAILS **/
  //https://images.chatcity.de/script/nc.js
  //del_msg(id, 2);
  // lastget in ajax request is last clicked ID ("139xxxxxxx")
  //new ajax(PAJAX+'nc_delm.html', {postBody: 'MID='+lastget, onComplete:function(){window.location.reload();}});
  /** Message HTML **/
  /*
  <div id="139xxxxxxx" class="clickl unread">
      <div class="ncrow c1" id="st39xxxxxxx">Gelesen</div>
      <div class="ncrow c2">22.01.2021&nbsp;um&nbsp;12:27&nbsp;Uhr</div>
      <div class="ncrow c3">von USERNAME</div>
    <div class="ncrow c4">ID-Card Nachricht</div>
  </div>
  */
  //var test = $('#msgform  div  div:[class="clickl"]').attr("id");
  /*
  var test1 = $("#msgform")
    .children("div")
    .children('div[class="clickl unread"]')
    .attr("id");
  var test2 = $("#msgform")
    .children("div")
    .children('div[class="clickl"]')
    .attr("id");
  var test3 = $("#msgform")
    .children("div")
    .children('div[class="clickl"]')
    .children('div[class="ncrow c3"]')
    .text();
  var test4 = $("#msgform div.div.ncrow c3").text();
  var test5 = $("#msgform div.clickl[id]").attr("id");
*/
  // create iframe and hide
  // https://stackoverflow.com/questions/41111556/tampermonkey-message-between-scripts-on-different-subdomains
  // cross window communication
  //const iframe = document.body.appendChild(document.createElement('iframe'));
  //iframe.style.display = 'none';
  //iframe.src = 'https://www.chatcity.de/de/nc/index.html';element.class
  // DELETE EVERY NEW MESSAGE!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!  VORSICHT!!!!!!!!!!!!!!!!
  //$('#msgform div.unread').each(function(i,el){
  //var t = $(el).attr("id");
  //var newm = "";
  //var mymsg = t.substr(1);
  //alert('ids: ' +  t + " " + mymsg);
  //div = '<div id="' + t + '"></div>';
  //$("#ww_idcard").prepend(div);
  //delete message without reading (sender will see unread message)
  //new ajax(PAJAX+'nc_delm.html', {postBody: 'MID='+mymsg, onComplete:function(){window.location.reload();}});
  // read messages
  //var aja = new ajax(PAJAX+'nc_getm.html', {postBody: 'MID='+mymsg, onComplete:function(){nodeToString(nboxobj);}, update: t});
  //var aja = new ajax(PAJAX+'nc_getm.html', {postBody: 'MID='+mymsg}, update:'test' );
  //});
} //MAILS
