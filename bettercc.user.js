// ==UserScript==
// @name  BetterCC
// @description  BetterCC is better
// @author  Sarah
// @version  1.37
// @icon  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/main/BetterCC.png
//
// @match  https://www.chatcity.de/de/cpop.html?&RURL=*
// @match  https://www.chatcity.de/de/nc/index.html
// @match  https://images.chatcity.de/*
//
// @require  https://code.jquery.com/jquery-3.5.1.min.js
// @require  https://code.jquery.com/ui/1.12.1/jquery-ui.min.js
// @require  https://raw.githubusercontent.com/bgrins/TinyColor/master/tinycolor.js
// @require  https://cdn.jsdelivr.net/gh/CoeJoder/GM_wrench@v1.5/dist/GM_wrench.min.js
//
// @resource  main_css  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/main/css/main.css?r=1.37
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
// @downloadURL  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/main/bettercc.user.js
// @updateURL  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/main/bettercc.user.js
//
// @supportURL  https://github.com/SarahDieCoolige/BetterCC/issues
// @homepageURL  https://github.com/SarahDieCoolige/BetterCC

// ==/UserScript==

/* globals jQuery, $, GM_wrench, ajax, tinycolor*/

(function () {
  "use strict";

  function cclog(str, tag = "BetterCC") {
    GM_log(tag + " - " + str);
  }

  function ccnotify(message, title = "", tag = "", timeout = 3000) {
    if (NotificationsEnable) {
      GM_notification({
        title: "BetterCC " + title,
        text: message,
        tag: tag,
        timeout: timeout,
        silent: true,
        onclick: () => {
          event.preventDefault();
          cclog("Notification clicked.");
          window.focus();
        },
      });
    }
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

  function cclogChat(message, name = "BetterCC", newLineAfterName = true) {
    message =
      '<pre id="bccmessage" class="bccmessage" style="white-space: pre-wrap; font-size: 1.2em; width: 70%; display: inline">' +
      message +
      "</pre><br>";

    if (name.trim() !== "") {
      name += ": ";
      name = '<font color="red"><b>' + name + "</b></font>";
      if (newLineAfterName) name += "<br>";
      message = name + message;
    }
    printInChat("beforeend", message);
  }

  let helpStrings = [
    ["/sw Sariam", "Superwhisper mit Sariam"],
    ["/o Hi All :)", "Im Open schreiben"],
    ["/open", "Superwhisper aus"],
    [
      "/sb Wendigo",
      "Einen Arsch für immer ignorieren (noch mal zum entbannen)",
    ],
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

  let helptxtNotify = [
    "/sw sariam" + " - " + "sw an",
    "/o hi all :)" + " - " + "ins open",
    "/open" + " - " + "sw aus",
    "/sb wendigo" + " - " + "superignore an/aus",
    "/superban" + " - " + "banliste",
    "/reload" + " - " + "chat neu laden",
    "/settings" + " - " + "einstellungen",
    "/help" + " - " + "hilfe",
  ].join("\n");

  function printHelp() {
    //cclogChat(helptxt, "Hilfe");
    //  printInChat("beforeend", helptxt);
    ccnotify(helptxtNotify, "Hilfe", "help");
  }

  // window functions
  var bettercc = (unsafeWindow.bettercc = {});

  const superbanEnable = 1;
  const replaceInputFieldEnable = 1;
  const noChatBackgroundsEnable = 1;
  const NotificationsEnable = 1;
  const betterUserListEnable = 0;

  function getChatframe() {
    return document.getElementById("chatframe").contentWindow;
  }

  function postMessageToIframe(message) {
    const chatWindow = getChatframe();
    //const targetOrigin = "https://chat.chatcity.de";
    const targetOrigin = "https://www.chatcity.de";
    chatWindow.postMessage(message, targetOrigin);
  }

  //MAIN CHAT
  if (/cpop.html/.test(window.location.href)) {
    window.onunload = null;
    window.onbeforeunload = null;

    let gast = unsafeWindow.chat_ui === "h" ? 1 : 0;
    let userStore = gast ? "gast" : unsafeWindow.chat_nick.toLowerCase();

    // Helper function to prefix keys with the user ID
    function getUserKey(key) {
      return `${userStore}_${key}`;
    }

    // Create and display the settings modal
    function showSettingsModal() {
      const modalOverlay = document.createElement("div");
      modalOverlay.style.position = "fixed";
      modalOverlay.style.top = 0;
      modalOverlay.style.left = 0;
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
      modalTitle.textContent = `Settings for ${userStore}`;
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
        const userKeys = keys.filter((key) => key.endsWith("_" + userStore));
        userKeys.forEach((key) => {
          GM.getValue(key).then((value) => {
            const settingRow = document.createElement("div");
            settingRow.style.marginBottom = "10px";

            const keyLabel = document.createElement("label");
            keyLabel.textContent = key.replace(userStore + "_", ""); // Remove the user prefix for display
            keyLabel.style.display = "block";
            settingRow.appendChild(keyLabel);

            const valueInput = document.createElement("input");
            valueInput.type = "text";
            valueInput.value = value;
            valueInput.style.width = "100%";
            settingRow.appendChild(valueInput);

            // const saveButton = document.createElement("button");
            // saveButton.textContent = "Save";
            // saveButton.style.marginTop = "5px";
            // saveButton.addEventListener("click", () => {
            //   GM.setValue(key, valueInput.value).then(() => {
            //     alert(`Saved value for ${keyLabel.textContent}`);
            //   });
            // });
            // settingRow.appendChild(saveButton);

            settingsContainer.appendChild(settingRow);
          });
        });
      });
    }

    // showSettingsModal();
    // // Add a keyboard shortcut to open the settings modal (e.g., Ctrl+Shift+S)
    // document.addEventListener('keydown', (e) => {
    //     if (e.ctrlKey && e.shiftKey && e.key === 'S') {
    //         showSettingsModal();
    //     }
    // });

    if (noChatBackgroundsEnable) forceNoChatBackgrounds();
    addCustomCss();
    cleanup();
    if (betterUserListEnable) betterUserList();
    betterInput(replaceInputFieldEnable);
    doColorStuff();
    //if (!gast) replaceOnSubmit();
    replaceOnSubmit();
    // add gast class to userlist
    if (gast) $("#ul").addClass("gast");
    if (superbanEnable) enableSuperban();
    //GM_notification ( {title: 'BetteCC', text: 'BetterCC loaded!'} );

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

      $('<input type="button" id="settingsbutton" />')
        .val("S")
        .attr("title", "BetterCC Settings")
        .addClass("betterccbtn")
        .on("click", function () {
          showSettingsModal();
        })
        .appendTo("#betteroptions");

      setTimeout(setTheme, 1000);

      bettercc.reloadChat = function reloadChat() {
        postMessageToIframe({
          type: "mimimi",
        });
        setTimeout(setTheme, 1000);
      };

      function setTheme() {
        (async () => {
          let bg = await GM.getValue(userStoreColor, bgDef);
          await GM.setValue(userStoreColor, bg);

          setColors(bg, fgDef);
        })();
      }

      function setColors(bg, fg) {
        let chatBg = tinycolor(bg);
        let chatFg = tinycolor(bg);

        chatFg = tinycolor(bg);

        if (chatBg.isLight()) {
          chatFg = chatFg.darken(40);
          //chatFg = chatFg.brighten(30);
          //chatFg.desaturate(5);
        } else {
          chatFg = chatFg.lighten(20);
          chatFg = chatFg.brighten(40);
          //chatFg.desaturate(5);
        }

        let anaChatBg = chatBg.analogous();
        let monoChatBg = chatBg.monochromatic();
        let triadChatBg = chatBg.triad();
        //chatFg = tinycolor.mostReadable(chatBg, anaChatBg.concat(monoChatBg), {
        //  includeFallbackColors: false,
        //});

        let anaChatFg = chatFg.analogous();
        let monoChatFg = chatFg.monochromatic();
        let triadChatFg = chatFg.triad();
        chatFg = tinycolor.mostReadable(chatBg, anaChatFg.concat(monoChatFg), {
          includeFallbackColors: false,
        });

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

        postMessageToIframe({
          type: "setColors",
          bgColor: chatBg.toHslString(),
          fgColor: chatFg.toHslString(),
        });

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
      $("#right_ad").remove();
      $(
        '#r_off1 table iframe[src="https://www.chatcity.de/cc_chat/html?PAGE=300x250.html"]'
      )
        .closest("tr")
        .remove();

      $("#popup-chat > table > tbody > tr:nth-child(1)").remove();
      $("#ulscrollhelper").remove();
      $("#ul").addClass("headless");
      //$(".ww_chat_divide").hide();
      $(".chat_i1").remove();

      // remove timeout from exit button
      $(".b7").attr("onclick", "bye()");

      // disable resize_fix function. throws error
      unsafeWindow.resize_fix = function resize_fix() {
        return true;
      };
      clearTimeout(unsafeWindow.size_timeout);
      clearInterval(unsafeWindow.size_interval);
    }

    function betterUserList() {
      // add superwhisper to userlist popup
      $("#fuu").append(
        '<a href="javascript://" class="button pinuser" id="pinUser" onclick="bettercc.addPinnedUser(last_id)">» Pin</a>'
      );

      let userStorePinnedUsers = "pinned_" + userStore;

      // Function to add a user to the pinned users list
      bettercc.addPinnedUser = async function (username) {
        username = username.toLowerCase();

        // Retrieve the current list of pinned users
        let pinnedUsers = GM_getValue(userStorePinnedUsers, []);

        // Check if the user is already in the list
        if (!pinnedUsers.includes(username)) {
          // Add the new user to the list
          pinnedUsers.push(username);
        } else {
          // remove
          pinnedUsers = pinnedUsers.filter(function (item) {
            return String(item) !== username;
          });
        }

        // Save the updated list back to the storage
        GM_setValue(userStorePinnedUsers, pinnedUsers);
        set_uinfo1();
        $(".ulist-popup").hide();
      };

      // Function to get the list of pinned users
      function getPinnedUsers() {
        // Retrieve the list of pinned users from storage
        //return GM_getValue(userStorePinnedUsers, []);

        return Array.from(GM_getValue(userStorePinnedUsers, []))
          .map((v) => v.toLowerCase())
          .sort();
      }

      function waitForSetUinfo1Function() {
        if (typeof set_uinfo1 === "function") {
          redefineSetUinfo1Function();
        } else {
          setTimeout(waitForSetUinfo1Function, 100); // Check again after 100ms
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

          const classAttr =
            classes.length > 0 ? `class="${classes.join(" ")}"` : "";
          const indicatorHtml =
            indicators.length > 0
              ? `<span class="user_status_indicator">[${indicators.join(
                  "]["
                )}]</span>`
              : "";

          if (isCurrentUser) {
            return `<span ${classAttr}>» ${username} ${indicatorHtml}</span><br>`;
          } else {
            return `<a href="javascript://" onclick="open_utn('fuu',this,-25,-50,'${username}',event,'${value}');" id="${username}" ${classAttr} target="leer">» ${username} ${indicatorHtml}</a><br>`;
          }
        }

        set_uinfo1 = function () {
          unsafeWindow.chat_channel = unsafeWindow.cha_channel;
          let num = 0;

          // Retrieve pinned usernames from storage
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

          setInnerHTML("ul", uli);
          setInnerHTML("uinfo", num);
        };

        // cclog("set_uinfo1 function redefined successfully.");
      }

      waitForSetUinfo1Function();
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
      try {
        // Pre-checks
        var $form = $('form[name="hold"]');
        if ($form.length === 0) {
          throw new Error('Form with name "hold" not found.');
        }

        var $inputText = $form.children('input[type="text"]');
        if ($inputText.length === 0) {
          throw new Error('Input of type "text" not found in the form.');
        }

        // Apply changes atomically
        if (replace) {
          // Prepare the new textarea element
          var newTextarea = $("<textarea>", {
            id: "custom_input_text",
            placeholder: "Du chattest mit allen...",
            maxlength: 1024,
            name: "OUT1",
            rows: 3,
            wrap: "soft",
          });

          // Temporarily store the original input in case we need to restore it
          var originalInput = $inputText.clone();

          // Replace input with textarea
          $inputText.replaceWith(newTextarea);

          // Attach event handler to the new textarea
          $("#custom_input_text").keypress(function (e) {
            if (e.which == 13 && !e.shiftKey) {
              $form.submit();
              e.preventDefault();
            }
          });
        } else {
          // Simply modify attributes, this is less risky
          $inputText
            .attr("id", "custom_input_text")
            .attr("placeholder", "Du chattest mit allen...");
        }
      } catch (error) {
        console.error("An error occurred in betterInput:", error.message);

        // Optionally, implement any rollback logic here
        // If replacement was attempted and failed, you could revert to the original input
        if (replace && originalInput) {
          $form.children("#custom_input_text").replaceWith(originalInput);
        }

        // Additional error handling logic (e.g., displaying a user-friendly message, logging to a server, etc.)
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
      let onSubmitOrigStr = $('form[name="hold').attr("onsubmit");

      // let onSubmitOrig = new Function($('form[name="hold').attr("onsubmit").replace(
      //   'if((msg.indexOf("/")!=0||msg.indexOf("/me ")==0)){',
      //   'if((msg.indexOf("/")!=0||msg.indexOf("/me ")==0||msg.indexOf("/w ")==0)){'
      // ));

      // reset away timer with "/w ", "/me " and open chat
      // auto /away after 30mins
      // see original onSubmit()
      onSubmitOrigStr = onSubmitOrigStr.replace(
        'if((msg.indexOf("/")!=0||msg.indexOf("/me ")==0)){',
        'if((msg.indexOf("/")!=0||msg.indexOf("/me ")==0||msg.indexOf("/w ")==0)){'
      );

      let onSubmitOrig = new Function(onSubmitOrigStr);
      //cclog(onSubmitOrig.toString());

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

        if (superbanEnable) {
          //IS "/superban " or "/sb "
          if (
            mymsg.toLowerCase() === "/superban" ||
            mymsg.toLowerCase() === "/sb"
          ) {
            let banlist = (await bettercc.getSuperbans()).join(", ").toString();
            let banlistNotify = (await bettercc.getSuperbans())
              .join("\n")
              .toString();
            //cclogChat(banlist, "Superban", false);
            ccnotify(banlistNotify, "Better Ignore", "banlist", 30000);

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
        '<a href="javascript://" class="button superban" id="superban" onclick="bettercc.superban(last_id);">» Better Ignore</a>'
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
            ccnotify(
              nickToBan + " wird ab jetzt geblockt!",
              "Better Ignore",
              "banned"
            );
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
            ccnotify(
              nickToBan + " wird nicht mehr geblockt!",
              "Better Ignore",
              "unbanned"
            );

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
        //cclogChat("Schreib <b>/superban/b> oder <b>/sb</b> um deine <b>Bannliste</b> zu sehen", "Better Ignore", false);
        ccnotify(
          "Schreib <b>/superban</b> oder <b>/sb</b> um deine <b>Bannliste</b> zu sehen",
          "Better Ignore",
          "help"
        );
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
        if (unsafeWindow.cha_my) {
          for (var j = 0; j < unsafeWindow.cha_my.length; j += 2) {
            users_channel = users_channel.concat(
              unsafeWindow.cha_my[j].toLowerCase().split(" ").filter(Boolean)
            );
          }
          //cclog("users_channel: " + users_channel);
        }

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
          await banUser(user);
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
        ccnotify(
          user + " kann dir nicht mehr schreiben",
          "Better Ignore",
          "banned"
        );
        //cclogChat("Bans: " + alreadyBanned.toString());
        unsafeWindow.alreadyBanned = alreadyBanned;
      }
    }
  } //MAIN CHAT
})();
