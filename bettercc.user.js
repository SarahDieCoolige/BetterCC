// ==UserScript==
// @name     BetterCC DEV
// @version  0.27
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
// @resource  main_css      https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/dev/css/main.css?r=v0.27
// @resource  dark_mode_css https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/dev/css/dark-blue-gray.css?r=v0.27
// @resource  dark_mode_iframe_css https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/dev/css/darkmode_chatframe.css?r=v0.27
//
//// @resource  main_css      http://127.0.0.1:8080/css/main.css?r=v0.27
//// @resource  dark_mode_css http://127.0.0.1:8080/css/dark-blue-gray.css?r=v0.27
//// @resource  dark_mode_iframe_css http://127.0.0.1:8080/css/darkmode_chatframe.css?r=v0.27
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

      $('script[src^="' + url).remove();
      $("<script>")
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
