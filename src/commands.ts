// ─── Chat commands: replaceOnSubmit, superwhisper ───

import { cclog, ccnotify } from "./utils";

export function replaceOnSubmit(userStore: string): void {
  let userStoreWhisper = "whisper_" + userStore;

  // replace long submit function in input form
  let onSubmitOrigStr = $('form[name="hold').attr("onsubmit");

  // reset away timer with "/w ", "/me " and open chat
  onSubmitOrigStr = onSubmitOrigStr.replace(
    'if((msg.indexOf("/")!=0||msg.indexOf("/me ")==0)){',
    'if((msg.indexOf("/")!=0||msg.indexOf("/me ")==0||msg.indexOf("/w ")==0)){'
  );

  let onSubmitOrig = new Function(onSubmitOrigStr);

  (unsafeWindow.bettercc as any).onSubmit = async function (whispernick?: string) {
    let openMsgCmdRegex = /^\/open\s|^\/o\s/;
    let openMsgReplaceRegex = /^\/open\s+|^\/o\s+/gi;
    let superbanMsgCmdRegex = /^\/superban\s|^\/sb\s/;
    let superbanMsgReplaceRegex = /^\/superban\s+|^\/sb\s+/gi;
    let superwhisperMsgCmdRegex = /^\/superwhisper\s|^\/sw\s/;
    let superwhisperMsgReplaceRegex = /^\/superwhisper\s+|^\/sw\s+/gi;

    let mymsg = document.hold.OUT1.value.trim();

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
      if (
        mymsg.toLowerCase() === "/superban" ||
        mymsg.toLowerCase() === "/sb"
      ) {
        let banlist = (await (unsafeWindow.bettercc as any).getSuperbans()).join(", ").toString();
        let banlistNotify = (await (unsafeWindow.bettercc as any).getSuperbans())
          .join("\n")
          .toString();
        ccnotify(banlistNotify, "Better Ignore", "banlist", 30000);

        mymsg = "";
        document.hold.OUT1.value = mymsg;
        return false;
      }
      if (superbanMsgCmdRegex.test(mymsg.toLowerCase())) {
        mymsg = mymsg.replace(superbanMsgReplaceRegex, "").split(" ")[0];
        (unsafeWindow.bettercc as any).superban(mymsg);
        cclog("Superban:" + mymsg);
        mymsg = "";
        document.hold.OUT1.value = mymsg;
        return false;
      }
    }

    // IS "/open"
    if (mymsg.toLowerCase() === "/open") {
      (unsafeWindow.bettercc as any).superwhisper("");
      mymsg = "";
      document.hold.OUT1.value = mymsg;
      return false;
    }

    // IS "/reload"
    if (mymsg.toLowerCase() === "/reload") {
      (unsafeWindow.bettercc as any).reloadChat();
      mymsg = "";
      document.hold.OUT1.value = mymsg;
      return false;
    }

    // starts with "/superwhisper " or "/sw "
    if (superwhisperMsgCmdRegex.test(mymsg.toLowerCase())) {
      mymsg = mymsg.replace(superwhisperMsgReplaceRegex, "").split(" ")[0];
      (unsafeWindow.bettercc as any).superwhisper(mymsg, false);
      mymsg = "";
      document.hold.OUT1.value = mymsg;
      return false;
    }

    // starts with "/open " or "/o "
    if (openMsgCmdRegex.test(mymsg.toLowerCase())) {
      mymsg = mymsg.replace(openMsgReplaceRegex, "");
    }

    // if whispernick arg
    else if (whispernick !== undefined) {
      if (!mymsg.startsWith("/")) {
        mymsg = "/w " + whispernick + " " + mymsg;
      }
    }

    document.hold.OUT1.value = mymsg;

    onSubmitOrig();
  };

  // replace onSubmit function of textarea/input field
  $('form[name="hold"]').attr("onsubmit", "bettercc.onSubmit();");
  $('form[name="hold"]').on("submit", function (e: any) {
    e.preventDefault();
  });

  // add superwhisper to userlist popup
  $("#fuu :nth-child(4)").after(
    '<a href="javascript://" class="button superwhisper" id="superwhisper" onclick="bettercc.superwhisper(last_id);">» Superwhisper</a>'
  );

  (async function () {
    try {
      var whisperUser = await GM.getValue(userStoreWhisper);
    } catch {
      whisperUser = "";
    }
    await GM.setValue(userStoreWhisper, whisperUser);
    (unsafeWindow.bettercc as any).superwhisper(whisperUser, false);
  })();

  (unsafeWindow.bettercc as any).superwhisper = async function (whispernick: string, toggle: boolean = true) {
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

// References from other modules
import { printHelp, superbanEnable } from "./utils";
