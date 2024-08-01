// ==UserScript==
// @name  BetterCC Chat
// @description  BetterCC is better
// @author  Sarah
// @version  1.36
// @icon  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/main/BetterCC.png
//
// @match  https://www.chatcity.de/cc_chat/chatout?*
// @match  https://chat.chatcity.de/cc_chat/chatout?*
//
// @require  https://code.jquery.com/jquery-3.5.1.min.js
// @require  https://code.jquery.com/ui/1.12.1/jquery-ui.min.js
// @require  https://raw.githubusercontent.com/bgrins/TinyColor/master/tinycolor.js
// @require  https://cdn.jsdelivr.net/gh/CoeJoder/GM_wrench@v1.5/dist/GM_wrench.min.js
//
// @resource  iframe_css  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/main/css/iframe.css?r=1.36
//
// @grant  GM_addStyle
// @grant  GM.setValue
// @grant  GM.getValue
// @grant  GM_addValueChangeListener
// @grant  GM_getResourceText
// @grant  GM_xmlhttpRequest
// @grant  GM_log
// @grant  GM_notification
// @grant  GM_addElement
//
// @sandbox  JavaScript
// @run-at document-start
//
// @downloadURL  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/main/bettercc_chat.user.js
// @updateURL  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/main/bettercc_chat.user.js
//
// @supportURL  https://github.com/SarahDieCoolige/BetterCC/issues
// @homepageURL  https://github.com/SarahDieCoolige/BetterCC

// ==/UserScript==

/* globals jQuery, $, GM_wrench, ajax, tinycolor*/

(function () {
  "use strict";

  if (/cc_chat\/chatout/.test(window.location.pathname)) {
    function cclog(str, tag = "BetterCC_CHAT") {
      GM_log(tag + " - " + str);
    }

    function ccnotify(message, title = "", tag = "", timeout = 3000) {
      if (enableNotifications) {
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
      //$("body").children().last().append(content);
      document.body.lastChild.insertAdjacentHTML(position, content);

      //let current = document.body.lastChild.innerHTML;
      //document.body.lastChild.innerHTML+=content;
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

    const helpStrings = [
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

    const helptxt = [
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

    const helptxtNotify = [
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
      ccnotify(helptxtNotify, "Hilfe");
    }

    // window functions
    let bettercc = (unsafeWindow.bettercc = {});

    const superban = 0;
    const enableNotifications = 1;

    cclog(window.location.pathname);

    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    const activeNick = urlParams.get("NICKNAME").toLowerCase();

    const userStoreChatlog = "chatlog_" + activeNick;
    const userStoreRestore = "restore_" + activeNick;
    const userStoreColorBg = "colorBg_" + activeNick;
    const userStoreColorFg = "colorFg_" + activeNick;

    const iframe_css = GM_getResourceText("iframe_css");
    GM_wrench.addCss(iframe_css);
    // GM_addStyle("* { transition: color 0.4s ease-out, background 0.4s ease-out, background-color 0.4s ease-out;}");

    GM_wrench.waitForKeyElements("body", restoreChat, true, 100);

    function removeColorAttr(element) {
      if (element.textContent.includes("backgroundColor")) {
        cclog(element.textContent);
        element.remove();
      }
    }
    GM_wrench.waitForKeyElements("body > script", removeColorAttr, true, 100);

    window.addEventListener(
      "message",
      (event) => {
        GM_log(
          "Bettercc IFRAME" +
            " - " +
            "Message Received from " +
            event.origin +
            " " +
            event.data
        );
        if (event.origin === "https://www.chatcity.de") {
          const message = event.data;
          switch (message.type) {
            case "setColors":
              setColors(message.bgColor, message.fgColor, message.hlColor);
              break;
            case "mimimi":
              reloadChat();
              break;
            case "restoreChat":
              restoreChat();
              break;
            case "setSuperwhisper":
              // TODO
              break;
            case "printInChat":
              // TODO
              break;
            // ... (add more cases for other messages)
          }
        }
      },
      false
    );

    function autoscrolling() {
      // Create banner div
      const scrollbanner = document.createElement("div");
      scrollbanner.id = "autoscroll-banner";
      scrollbanner.textContent = "Zurück nach unten";
      document.body.appendChild(scrollbanner);

      // Add event listener to enable auto-scrolling on click
      scrollbanner.addEventListener("click", function () {
        unsafeWindow.scrolling = true;
        //window.scrollTo(0, document.body.scrollHeight);
        scrollbanner.style.display = "none";
      });

      // Handle scroll events to toggle auto-scrolling
      let lastScrollTop = window.scrollY || document.documentElement.scrollTop;

      window.addEventListener("scroll", function () {
        const scrollPosition =
          document.documentElement.scrollTop || document.body.scrollTop;
        const maxScroll = document.body.scrollHeight - window.innerHeight;

        // Determine the direction of the scroll
        if (scrollPosition < lastScrollTop) {
          // Check if the user is scrolling up
          if (unsafeWindow.scrolling && scrollPosition < maxScroll - 5) {
            unsafeWindow.scrolling = false;
            scrollbanner.style.display = "block";
          }
        }

        // Hide banner when the user scrolls to the bottom
        if (scrollPosition >= maxScroll - 5) {
          scrollbanner.style.display = "none";
          unsafeWindow.scrolling = true;
        }

        // Update the last scroll position
        lastScrollTop = scrollPosition <= 0 ? 0 : scrollPosition;
      });
    }

    function setColors(bg, fg, hl) {
      document.documentElement.style.setProperty("--chatBackground", bg);
      document.documentElement.style.setProperty("--chatText", fg);
      document.body.style.backgroundColor = "var(--chatBackground)";
      document.body.style.color = "var(--chatText)";
      //document.documentElement.style.setProperty("--highlightText", hl);

      (async function () {
        await GM.setValue(userStoreColorBg, bg);
        await GM.setValue(userStoreColorFg, fg);
      })();
    }

    // TODO
    function reloadChat() {
      let children = document.body.children;
      let chatlog = "";

      // start with 13 since everything prior we don't need
      //for (let i = 13; i < children.length; i++) {
      for (let i = 6; i < children.length; i++) {
        if (
          (children[i].outerHTML.startsWith('<font size="-1">') &&
            !children[i].outerHTML.startsWith(
              '<font size="-1"><br>\n</font>'
            )) ||
          children[i].outerHTML.includes("BetterCC:")
        ) {
          chatlog += children[i].outerHTML;
        }
      }

      (async function () {
        await GM.setValue(userStoreChatlog, chatlog);
        await GM.setValue(userStoreRestore, true);
      })();

      document.location.reload();
    }

    function restoreChat() {
      document.body.removeAttribute("bgcolor");
      document.body.removeAttribute("text");

      (async function () {
        let chatlog = await GM.getValue(userStoreChatlog);
        let restore = await GM.getValue(userStoreRestore);
        let colorBg = await GM.getValue(userStoreColorBg);
        let colorFg = await GM.getValue(userStoreColorFg);

        if (colorBg && colorFg) {
          // document.body.setAttribute("bgcolor", colorBg);
          // document.body.setAttribute("text", colorFg);
          setColors(colorBg, colorFg, null);
        }
        if (restore) {
          cclog("Restore Chatlog: " + restore);
          //cclog("Chatlog: " + chatlog);
          if (!!chatlog) {
            printInChat("beforebegin", chatlog);
          } else {
            cclog("Kein Chatlog");
          }
          printInChat(
            "beforebegin",
            "<span><br><i>BetterCC: mimimi..</i></span>"
          );

          await GM.setValue(userStoreRestore, false);

          autoscrolling();
        }
      })();
    }
  }
})();
