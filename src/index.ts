// ─── BetterCC entry point ───

import {
  cclog, ccnotify, printHelp,
  getChatDoc, getChatWin, applyThemeToIframe,
  setUserStore, getUserKey, getUserStore,
  superbanEnable, replaceInputFieldEnable,
  noChatBackgroundsEnable, NotificationsEnable,
  betterUserListEnable,
} from "./utils";

import { addAutoscrollBanner } from "./chat";
import { doColorStuff } from "./theme";
import {
  showSettingsModal, forceNoChatBackgrounds,
  addCustomCss, cleanup, betterUserList,
  betterInput, redesignFooter,
} from "./ui";
import { replaceOnSubmit } from "./commands";
import { enableSuperban } from "./superban";
import {
  injectIntoChatframe, betterccOnWsMessage,
  betterccOnWsClose, attachWsListeners,
  hookChatoutConnect,
} from "./ws-hook";

(function () {
  "use strict";

  cclog("Version: " + GM_info.script.version + " - " + window.location.href);

  // ─── window functions ───
  var bettercc = (unsafeWindow.bettercc = {} as any);

  // ─── MAIN CHAT ───
  if (/cpop.html/.test(window.location.href)) {
    window.onunload = null;
    window.onbeforeunload = null;

    // ─── TEMPORARY WORKAROUND (commented out, preserved for history) ───
    // window.addEventListener("message", (event) => { ... });

    let gast = unsafeWindow.chat_ui === "h" ? 1 : 0;
    let userStore = gast ? "gast" : unsafeWindow.chat_nick.toLowerCase();
    setUserStore(unsafeWindow.chat_nick, !!gast);

    // ─── Show settings modal (commented out, preserved) ───
    // showSettingsModal(userStore);
    // document.addEventListener('keydown', (e) => { ... });

    if (noChatBackgroundsEnable) forceNoChatBackgrounds();
    addCustomCss();
    cleanup();
    if (betterUserListEnable) betterUserList(userStore);
    betterInput(!!replaceInputFieldEnable);
    doColorStuff(
      "color_" + userStore,
      "colorscheme_" + userStore,
      "6AAED8",
      "000000",
      printHelp,
      () => showSettingsModal(userStore),
      cclog
    );
    replaceOnSubmit(userStore);
    // add gast class to userlist
    if (gast) {
      const ulEl = document.querySelector("#ul");
      if (ulEl) ulEl.classList.add("gast");
    }
    if (superbanEnable) enableSuperban(userStore);
    redesignFooter();

    // ═══════════════════════════════════════════════════════════════════════
    // v1.43: WebSocket + same-origin iframe integration
    // ═══════════════════════════════════════════════════════════════════════

    hookChatoutConnect();
    //GM_notification({title: 'BetterCC', text: 'BetterCC loaded!'});

    // ═══════════════════════════════════════════════════════════════════════
    // DORMANT — Chatlog save/restore
    //
    // This code was originally used by reloadChat() (mimimi) to preserve chat
    // content across iframe reloads. In v1.43+, the WebSocket reconnect
    // preserves content natively (the chatframe_doc_opened flag prevents the
    // document wipe on reconnect), so explicit save/restore is no longer
    // needed.
    //
    // TODO: Re-evaluate if we ever need explicit chatlog export (e.g., for
    // debugging or saving a conversation before /exit). If so, this is the
    // starting point — wire saveChatlog() into reloadChat() before close(),
    // and restoreChatlog() into betterccOnWsMessage after first message.
    // Storage keys: userStoreChatlog = "chatlog_" + userStore
    //               userStoreRestore = "restore_" + userStore
    // ═══════════════════════════════════════════════════════════════════════
    /*
    function saveChatlog() {
      const doc = getChatDoc();
      if (!doc) return;
      let children = doc.body.children;
      let chatlog = "";
      for (let i = 6; i < children.length; i++) {
        if (
          (children[i].outerHTML.startsWith('<font size="-1">') &&
            !children[i].outerHTML.startsWith('<font size="-1"><br>\n</font>')) ||
          children[i].outerHTML.includes("BetterCC:")
        ) {
          chatlog += children[i].outerHTML;
        }
      }
      (async function () {
        await GM.setValue("chatlog_" + userStore, chatlog);
        await GM.setValue("restore_" + userStore, true);
      })();
    }

    function restoreChatlog() {
      const doc = getChatDoc();
      if (!doc) return;
      (async function () {
        let chatlog = await GM.getValue("chatlog_" + userStore);
        let restore = await GM.getValue("restore_" + userStore);
        if (restore) {
          cclog("Restore Chatlog: " + restore);
          if (!!chatlog) {
            doc.body.lastChild.insertAdjacentHTML("beforebegin", chatlog);
          }
          doc.body.lastChild.insertAdjacentHTML(
            "beforebegin",
            "<span><br><i>BetterCC: mimimi..</i></span>"
          );
          await GM.setValue("restore_" + userStore, false);
        }
      })();
    }
    */

  } // MAIN CHAT
})();
