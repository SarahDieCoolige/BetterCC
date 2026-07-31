// ─── v3 input area — textarea, send contract, superwhisper (spec §3.2 / T8) ─
//
// Builds a <textarea> that submits on Enter (Shift+Enter = newline), routes
// through the reused upstream onsubmit handler for message normalization +
// away-timer reset, and handles BetterCC commands + superwhisper.

import { cclog, printHelp } from "../utils";
import { getConfig, setConfig } from "./config";
import { classifyMessage, rewriteForWhisper } from "./commands";

let textarea: HTMLTextAreaElement | null = null;
let onSubmitOrig: Function | null = null;
let currentWhisperNick = "";

// ─── The submit handler ────────────────────────────────────────────────────

async function doSubmit(whispernick?: string): Promise<void> {
  const docHold = (document as any).hold as HTMLFormElement | null;
  if (!docHold) return;

  // v3's textarea is separate from the hidden hold form. Read the message
  // from the textarea, then copy it into the hold form for the send contract.
  let mymsg = (textarea?.value ?? "").trim();

  // 1. Command dispatch (pure — tested)
  const cmd = classifyMessage(mymsg);
  if (cmd.handled) {
    switch (cmd.type) {
      case "help":
        printHelp();
        clearInput(docHold);
        return;
      case "reload":
        (unsafeWindow.bettercc as any).reloadChat();
        clearInput(docHold);
        return;
      case "open-whisper":
        await superwhisper("");
        clearInput(docHold);
        return;
      case "superwhisper":
        await superwhisper(cmd.nick, false);
        clearInput(docHold);
        return;
      case "open-msg":
        mymsg = cmd.message;
        break;
      case "superban":
        // Stub for T12 — the real implementation wires superban from src/superban.ts.
        // Temporarily do nothing.
        clearInput(docHold);
        return;
      case "id":
        // Stub for T13 — the real showIdPopup is wired there.
        cclog("/id stubbed (T13): " + (cmd.name || "self"), "v3");
        clearInput(docHold);
        return;
    }
  }

  // 2. Superwhisper rewrite (if active and not a command)
  const finalNick = whispernick ?? currentWhisperNick;
  if (finalNick) {
    mymsg = rewriteForWhisper(mymsg, finalNick);
  }

  // 3. Send through the patched-handler (normalize, away-timer, delout)
  if (onSubmitOrig && mymsg) {
    (docHold.OUT1 as HTMLInputElement).value = mymsg;
    onSubmitOrig();
  }

  // 4. Clear the textarea
  if (textarea) textarea.value = "";
}

function clearInput(docHold: HTMLFormElement): void {
  (docHold.OUT1 as HTMLInputElement).value = "";
  if (textarea) textarea.value = "";
}

// ─── Superwhisper (spec §3.2.4) ─────────────────────────────────────────────

async function superwhisper(whispernick: string, toggle = true): Promise<void> {
  const prevNick = (await getConfig("whisper", "")) as string;

  // Determine the new state: if toggling the same nick, or clearing, or empty.
  if (
    (toggle && whispernick && prevNick.toLowerCase() === whispernick.toLowerCase()) ||
    !whispernick
  ) {
    // Clear whisper
    await setConfig("whisper", "");
    currentWhisperNick = "";

    if (textarea) {
      textarea.classList.remove("bcc-superwhisper");
      textarea.placeholder =
        "Du chattest mit allen..." +
        "\n\n" +
        "Superwhisper: /sw Sariam" +
        "  |  " +
        "Ban: /sb Wendigo" +
        "  |  " +
        "Hilfe: /help";
    }
  } else {
    // Set whisper
    await setConfig("whisper", whispernick);
    currentWhisperNick = whispernick;

    if (textarea) {
      textarea.classList.add("bcc-superwhisper");
      textarea.placeholder =
        "Du flüsterst mit " +
        whispernick +
        "..." +
        "\n\n" +
        "Superwhisper aus: /open" +
        "  |  " +
        "/o Hi All :)" +
        "  |  " +
        "Hilfe: /help";
    }
  }
}

// ─── Mount ──────────────────────────────────────────────────────────────────

export function mountInput(): void {
  const inputArea = document.querySelector(".bcc-input");
  if (!inputArea) return;

  // Clear the placeholder
  inputArea.innerHTML = "";

  // Build textarea
  textarea = document.createElement("textarea");
  textarea.className = "bcc-input-field";
  textarea.rows = 3;
  textarea.placeholder =
    "Du chattest mit allen..." +
    "\n\n" +
    "Superwhisper: /sw Sariam" +
    "  |  " +
    "Ban: /sb Wendigo" +
    "  |  " +
    "Hilfe: /help";
  textarea.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSubmit(); // eslint-disable-line @typescript-eslint/no-floating-promises
    }
  });
  inputArea.appendChild(textarea);

  // Set up the send contract — reuse the hold form's onsubmit, regex-patch
  // the away-timer line, and call it on submit (never native form.submit()).
  const holdForm = document.querySelector('form[name="hold"]') as HTMLFormElement | null;
  let onSubmitOrigStr = holdForm?.getAttribute("onsubmit") || "";
  if (onSubmitOrigStr) {
    onSubmitOrigStr = onSubmitOrigStr.replace(
      'if((msg.indexOf("/")!=0||msg.indexOf("/me ")==0)){',
      'if((msg.indexOf("/")!=0||msg.indexOf("/me ")==0||msg.indexOf("/w ")==0)){'
    );
    onSubmitOrig = new Function(onSubmitOrigStr);
  }

  // Expose BetterCC API (same signatures as the old path)
  (unsafeWindow.bettercc as any).onSubmit = doSubmit;
  (unsafeWindow.bettercc as any).superwhisper = superwhisper;

  // Restore any previously-set superwhisper
  getConfig("whisper", "").then((nick) => {
    const n = (nick as string) || "";
    if (n) superwhisper(n, false);
  });

  cclog("input mounted — textarea + send contract + superwhisper", "v3");
}
