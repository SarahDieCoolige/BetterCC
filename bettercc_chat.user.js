// ==UserScript==
// @name  BetterCC Chat
// @description  BetterCC is better
// @author  Sarah
// @version  1.25
// @icon  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/main/BetterCC.png
//
// @match  https://chat.chatcity.de/cc_chat/chatout?*
//
// @require  https://code.jquery.com/jquery-3.5.1.min.js
// @require  https://code.jquery.com/ui/1.12.1/jquery-ui.min.js
// @require  https://raw.githubusercontent.com/bgrins/TinyColor/master/tinycolor.js
// @require  https://cdn.jsdelivr.net/gh/CoeJoder/GM_wrench@v1.5/dist/GM_wrench.min.js
//
// @resource  iframe_css  https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/main/css/iframe.css?r=1.25
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

    function cclog(str, tag = "BetterCC_CHAT") {
        GM_log(tag + " - " + str);
    }

    function ccnotify(message, title = "") {
        if (enableNotifications) {
            GM_notification({
                title: "BetterCC " + title, text: message,
                onclick: () => {
                    cclog("Notification clicked.");
                    window.focus();
                }
            });
        }
    }

    cclog("Version: " + GM_info.script.version + " - " + window.location.href);

    function printInChat(position = "beforeend", content) {
        //$("body").children().last().append(content);
        document.body.lastChild.insertAdjacentHTML(
            position,
            content
        );

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
            if (newLineAfterName)
                name += "<br>"
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

    let helptxtNotify = [
        "/sw sariam" + " - " + "sw an",
        "/o hi all :)" + " - " + "ins open",
        "/open" + " - " + "sw aus",
        "/sb wendigo" +
        " - " +
        "superignore an/aus",
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
    var bettercc = (unsafeWindow.bettercc = {});

    const superban = 0;
    const enableNotifications = 1;

    let activeNick = "";

    if (/cc_chat\/chatout/.test(window.location.pathname)) {

        cclog(window.location.pathname);

        var iframe_css = GM_getResourceText("iframe_css");
        GM_wrench.addCss(iframe_css);

        window.addEventListener('message', (event) => {
            GM_log("Bettercc IFRAME" + " - " + "Message Received from " + event.origin + " " + event.data);
            if (event.origin === 'https://www.chatcity.de') {
                const message = event.data;
                switch (message.type) {
                    case 'setNick':
                        activeNick = message.nick;
                        cclog(activeNick);
                    case 'setColors':
                        setColors(message.bgColor, message.fgColor);
                        break;
                    case 'mimimi':
                        mimimi();
                        break;
                    case 'setSuperwhisper':
                        // TODO
                        break;
                    case 'printInChat':
                        // TODO
                        break;
                    // ... (add more cases for other messages)
                }
            }
        }, false,
        );

        function setColors(bg, fg) {
            document.body.style.backgroundColor = bg;
            document.body.style.color = fg;
        }

        function mimimi() {
            //bettercc.reloadChat();
            document.location.reload();
        }

        // TODO
        bettercc.reloadChat = function reloadChat() {
            let children = document.body.children;

            let chatlog = "";
            // start with 13 since everything prior we don't need
            //for (let i = 13; i < children.length; i++) {

            for (let i = 10; i < children.length; i++) {
                if (children[i].outerHTML.startsWith('<font size="-1"><br>')) {
                    chatlog += children[i].outerHTML;
                }
            }

            let userStoreChatlog = "chatlog_" + userStore;
            (async function () {
                await GM.setValue(userStoreChatlog, chatlog);
            })();

            document.location.reload();

            setTimeout(setTheme, 2000);
            setTimeout(insertChatlog, 2000);

            function insertChatlog() {
                (async function () {
                    var message = await GM.getValue(userStoreChatlog);
                    if (!!chatlog) {
                        //cclog("Chatlog: " + message);

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

        // let listenerId1 = GM_addValueChangeListener("abc", function (key, oldValue, newValue, remote) {
        //     // Print a message to the console when the value of the "savedTab" key changes
        //     cclog("IFRAME -  The value of the '" + key + "' key has changed from '" + oldValue + "' to '" + newValue + "'");
        // });

        // // Add a listener for changes to the "savedTab" key
        // var listenerId2 = GM_addValueChangeListener("color__janedoe_", function (key, oldValue, newValue, remote) {
        //     // Print a message to the console when the value of the "savedTab" key changes
        //     cclog("IFRAME -  The value of the '" + key + "' key has changed from '" + oldValue + "' to '" + newValue + "'");
        //     document.body.style.backgroundColor = "#" + newValue;
        // });

        // cclog(listenerId1 + listenerId2);

        // (async function () {
        //     await GM.setValue("abc", "123");
        //     let color = await GM.getValue("color__janedoe_", "defcolor");
        //     let abc = await GM.getValue("abc", "deftest");
        //     cclog(color + " " + abc);
        // })();



    }

})();