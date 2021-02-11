// ==UserScript==
// @name     BetterCC DEV
// @version  0.36
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
// @resource  iconfont_css          https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.2/css/all.min.css
//
// @resource  main_css              https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/dev/css/main.css?r=0.36
// @resource  iframe_css            https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/dev/css/iframe.css?r=0.36
//
// @resource  dark_mode_css         https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/dev/css/darker.css?r=0.36
// @resource  dark_mode_iframe_css  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/dev/css/darkmode_chatframe.css?r=0.36
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
const superwhisper = 1;
const replaceInputField = 1;
const hideColorButtons = 0;
const hideAutoScroll = 0;
const hideCommandButtons = 0;
const hideExitButton = 0;
const hideHeader = 1;
const hideAds = 1;
const hideOtherStuff = 1;
const darkMode = 1;
const noChatBackgrounds = 1;

//MAIN CHAT
if (/cpop.html/.test(window.location.href)) {
  var iconfont_css = GM_getResourceText("iconfont_css");
  GM_wrench.addCss(iconfont_css);

  var main_css = GM_getResourceText("main_css");
  GM_wrench.addCss(main_css);

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

  if (hideAutoScroll) {
    $(".chat_i2").hide();
  }

  if (hideCommandButtons) {
    $("td.chat_i3.chat_ibg").hide();
  }

  if (hideColorButtons) {
    $(".ww_chat_footer_table tr:nth-child(2) td").hide();
  }

  //hide exit button
  if (hideExitButton) {
    $(".chat_i4.chat_ibg").hide();
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

  //append superban
  if (superban) {
    $("#fuu").append(
      '<a href="javascript://" class="button superban" id="superban" onclick="bettercc.superban(last_id);">» Superban</a>'
    );
    $("<script>")
      .attr(
        "src",
        "//images.chatcity.de/script/aw.js?r=" +
          Math.round(new Date().getTime() / 1000)
      )
      .attr("type", "text/javascript")
      .appendTo("head");
  }

  // replace long submit function in input form
  let onSubmitOrig = new Function($('form[name="hold').attr("onsubmit"));

  let openMsgCmdRegex = /^\/open\s|^\/o\s/;
  let openMsgReplaceRegex = /^\/open\s+|^\/o\s+/gi;
  let superbanMsgCmdRegex = /^\/superban\s|^\/sb\s/;
  let superbanMsgReplaceRegex = /^\/superban\s+|^\/sb\s+/gi;
  let superwhisperMsgCmdRegex = /^\/superwhisper\s|^\/sw\s/;
  let superwhisperMsgReplaceRegex = /^\/superwhisper\s+|^\/sw\s+/gi;

  bettercc.onSubmit = function (whispernick) {
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

  if (darkMode) {
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

    //const bgDef = "c8dae0";
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
          await GM.setValue(userStoreTheme, 0);
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
      var ana = chatBg.analogous();
      var mono = chatBg.monochromatic();
      var triad = chatBg.triad();

      fg = tinycolor
        .mostReadable(chatBg, ana.concat(mono), {
          includeFallbackColors: true,
        })
        .toHexString();

      if (noChatBackgrounds) {
        iframeWindow.body.style.backgroundColor = chatBg;
        iframeWindow.body.style.color = fg;
      }

      $("#bgcolorpicker").val("#" + bg);

      if (theme == 0) {
        var ulistcolor = chatBg.clone().darken(5);
        var inputcolor = chatBg.clone().lighten(15).desaturate(5).toHexString();
        //footercolor = mono[5];
        //footercolor = tiny.spin(45);

        var footercolor = null;

        if (chatBg.isLight()) {
          cclog("isLight => darken");
          footercolor = chatBg.clone().brighten(0).darken(20);
        } else {
          cclog("isDark => lighten");
          footercolor = chatBg.clone().brighten().lighten(5);
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
            includeFallbackColors: false,
          })
          .toHexString();

        var buttoncolor = inputcolor;
        var buttontextcolor = tinycolor
          .mostReadable(buttoncolor, ana.concat(mono).concat(triad), {
            includeFallbackColors: true,
          })
          .toHexString();

        var iconcolor = tinycolor
          .mostReadable(ulistcolor, ["white", "black"], {
            includeFallbackColors: false,
          })
          .toHexString();

        $(":root").css("--chatBackground", bg);
        $(":root").css("--chatText", fg);

        $(":root").css("--buttonColor", buttoncolor);
        $(":root").css("--buttonText", buttontextcolor);
        $(":root").css("--inputBackground", inputcolor);
        $(":root").css("--inputText", inputtextcolor);

        //$(".userlist").css({ background: ulistcolor.toHexString() });
        //$(".userlist, .u_reg .chan_text").css({ background: ulistcolor.toHexString() });
        //$("#u_stats .value.no").css({ color: ulistcolor.toHexString() });
        //$(".u_reg .chan_text").css({ background: ulistcolor.toHexString() });

        $(":root").css("--ulistColor", ulistcolor);
        $(":root").css("--ulistText", ulisttextcolor);

        if (tinycolor.isReadable(ulistcolor, ulisttextcolor, {})) {
          $("#ul").addClass("light").removeClass("dark");
        } else {
          $("#ul").addClass("dark").removeClass("light");
        }

        $(":root").css("--optionsText", optionstextcolor);

        $(":root").css("--footerBackground", footercolor);
        $(":root").css("--inputBackground", inputcolor);
        $(":root").css("--placeholderColor", placeholdercolor);
        $(":root").css("--iconColor", iconcolor);
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

  if (superban) {
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
