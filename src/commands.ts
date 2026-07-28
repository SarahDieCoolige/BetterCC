// ─── Chat commands: replaceOnSubmit, superwhisper ───

import { cclog, ccnotify, printHelp, superbanEnable } from "./utils";

export function replaceOnSubmit(userStore: string): void {
  let userStoreWhisper = "whisper_" + userStore;

  // replace long submit function in input form
  const holdForm = document.querySelector('form[name="hold"]') as HTMLFormElement | null;
  let onSubmitOrigStr = holdForm?.getAttribute("onsubmit") || "";

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

    let docHold = (document as any).hold;
    let mymsg = docHold.OUT1.value.trim();

    if (
      mymsg.toLowerCase() === "/bettercc" ||
      mymsg.toLowerCase() === "/help"
    ) {
      printHelp();
      mymsg = "";
      docHold.OUT1.value = mymsg;
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
        docHold.OUT1.value = mymsg;
        return false;
      }
      if (superbanMsgCmdRegex.test(mymsg.toLowerCase())) {
        mymsg = mymsg.replace(superbanMsgReplaceRegex, "").split(" ")[0];
        (unsafeWindow.bettercc as any).superban(mymsg);
        cclog("Superban:" + mymsg);
        mymsg = "";
        docHold.OUT1.value = mymsg;
        return false;
      }
    }

    // IS "/open"
    if (mymsg.toLowerCase() === "/open") {
      (unsafeWindow.bettercc as any).superwhisper("");
      mymsg = "";
      docHold.OUT1.value = mymsg;
      return false;
    }

    // IS "/reload"
    if (mymsg.toLowerCase() === "/reload") {
      (unsafeWindow.bettercc as any).reloadChat();
      mymsg = "";
      docHold.OUT1.value = mymsg;
      return false;
    }

    // starts with "/superwhisper " or "/sw "
    if (superwhisperMsgCmdRegex.test(mymsg.toLowerCase())) {
      mymsg = mymsg.replace(superwhisperMsgReplaceRegex, "").split(" ")[0];
      (unsafeWindow.bettercc as any).superwhisper(mymsg, false);
      mymsg = "";
      docHold.OUT1.value = mymsg;
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

    docHold.OUT1.value = mymsg;

    onSubmitOrig();
  };

  // replace onSubmit function of textarea/input field
  if (holdForm) {
    holdForm.setAttribute("onsubmit", "bettercc.onSubmit();");
    holdForm.addEventListener("submit", function (e: Event) {
      e.preventDefault();
    });
  }

  // add superwhisper to userlist popup
  const fuuFourth = document.querySelector("#fuu > :nth-child(4)");
  if (fuuFourth) {
    fuuFourth.insertAdjacentHTML("afterend",
      '<a href="javascript://" class="button superwhisper" id="superwhisper" onclick="bettercc.superwhisper(last_id);">» Superwhisper</a>'
    );
  }

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
    let form = document.querySelector('form[name="hold"]') as HTMLFormElement | null;
    let input = document.getElementById("custom_input_text") as HTMLInputElement | null;
    let submitStr: string | null = null;
    let placeholderStr: string | null = null;
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

      if (input) input.classList.remove("superwhisper");
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

      if (input) input.classList.add("superwhisper");
      await GM.setValue(userStoreWhisper, whispernick);
    }
    if (form) form.setAttribute("onsubmit", submitStr!);
    if (input) input.placeholder = placeholderStr!;
    const popup = document.querySelector(".ulist-popup") as HTMLElement | null;
    if (popup) popup.style.display = "none";
  };
}
