// ─── v3 input area — textarea, send contract, superwhisper (spec §3.2 / T8) ─
//
// Builds a <textarea> that submits on Enter (Shift+Enter = newline), routes
// through the reused upstream onsubmit handler for message normalization +
// away-timer reset, and handles BetterCC commands + superwhisper.

import { cclog, printHelp } from "../utils";
import { getConfig, setConfig } from "./config";
import { classifyMessage, rewriteForWhisper } from "./commands";
import { buildPatchedHandler } from "./patched-handler";

let textarea: HTMLTextAreaElement | null = null;
let onSubmitOrig: ((...args: any[]) => any) | null = null;
let currentWhisperNick = "";
let whisperIndicator: HTMLElement | null = null;

// Placeholder strings — shared trailing hint block (defined once so the
// "no whisper" and "whispering to X" variants can't drift apart).
const HINTS_ALL = "Superwhisper: /sw Sariam  |  Ban: /sb Wendigo  |  Hilfe: /help";
const HINTS_WHISPER = "Superwhisper aus: /open  |  /o Hi All :)  |  Hilfe: /help";
const PLACEHOLDER_ALL = "Du chattest mit allen...\n\n" + HINTS_ALL;
function placeholderFor(nick: string): string {
  return "Du flüsterst mit " + nick + "...\n\n" + HINTS_WHISPER;
}

// ─── The send-path decision (pure — extracted from doSubmit, tested) ───────
//
// Given the raw textarea message and the active whisper nick, decide what to
// do: send a (possibly rewritten) message, or let a command consume it. This
// is the layer that ties classifyMessage + rewriteForWhisper together — it
// was untested originally, which is how the /o-under-superwhisper bug (C1)
// slipped through. doSubmit is now a thin wrapper over this.

export type SendDecision =
  | { action: "send"; message: string }
  | { action: "handled"; clear: true };

export function prepareMessage(rawMsg: string, whisperNick: string): SendDecision {
  const cmd = classifyMessage(rawMsg);
  if (cmd.handled) {
    switch (cmd.type) {
      case "help":
      case "reload":
      case "open-whisper":
      case "superwhisper":
      case "superban":
      case "id":
        // These commands consume the message — the caller runs their side
        // effects (printHelp, reloadChat, superwhisper toggle, …) and clears
        // the input. Nothing is sent.
        return { action: "handled", clear: true };
      case "open-msg":
        // /o (send-to-all) strips its prefix and sends to EVERYONE — it must
        // NOT be whisper-rewritten even when superwhisper is active. Returning
        // here skips the rewrite below. (C1 regression test covers this.)
        return { action: "send", message: cmd.message };
    }
  }
  // Plain message, or an explicit /w / /me the user typed manually.
  // rewriteForWhisper skips messages starting with "/", so explicit commands
  // pass through unchanged; only plain messages get the /w prefix.
  return { action: "send", message: rewriteForWhisper(rawMsg, whisperNick) };
}

// ─── The submit handler (thin wrapper over prepareMessage) ─────────────────

async function doSubmit(whispernick?: string): Promise<void> {
  const docHold = (document as any).hold as HTMLFormElement | null;
  if (!docHold) return;

  const rawMsg = (textarea?.value ?? "").trim();
  const finalNick = whispernick ?? currentWhisperNick;
  const decision = prepareMessage(rawMsg, finalNick);

  if (decision.action === "handled") {
    // Run the command's side effect. classifyMessage is pure + cheap; calling
    // it again here (instead of threading cmd through prepareMessage) keeps
    // the SendDecision type simple and the test assertions clean.
    const cmd = classifyMessage(rawMsg);
    if (cmd.handled) {
      switch (cmd.type) {
        case "help":
          printHelp();
          break;
        case "reload":
          (unsafeWindow.bettercc as any).reloadChat();
          break;
        case "open-whisper":
          await superwhisper("");
          break;
        case "superwhisper":
          await superwhisper(cmd.nick, false);
          break;
        case "superban":
          break; // Stub for T12.
        case "id":
          cclog("/id stubbed (T13): " + (cmd.name || "self"), "v3");
          break;
      }
    }
    clearInput(docHold);
    return;
  }

  // action === "send": route through the patched upstream handler
  // (normalize, away-timer reset, delout → inf form).
  if (onSubmitOrig && decision.message) {
    (docHold.OUT1 as HTMLInputElement).value = decision.message;
    onSubmitOrig();
  }
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
      textarea.placeholder = PLACEHOLDER_ALL;
    }
    updateWhisperIndicator(null);
  } else {
    // Set whisper
    await setConfig("whisper", whispernick);
    currentWhisperNick = whispernick;

    if (textarea) {
      textarea.classList.add("bcc-superwhisper");
      textarea.placeholder = placeholderFor(whispernick);
    }
    updateWhisperIndicator(whispernick);
  }
}

/** Show/hide the whisper-target indicator pill above the textarea (C2). */
function updateWhisperIndicator(nick: string | null): void {
  if (!whisperIndicator) return;
  if (nick) {
    whisperIndicator.textContent = "👤 Flüstern an: " + nick;
    whisperIndicator.style.display = "";
  } else {
    whisperIndicator.style.display = "none";
  }
}

// ─── Mount ──────────────────────────────────────────────────────────────────

export function mountInput(): void {
  const chatbar = document.querySelector(".bcc-chatbar");
  if (!chatbar) return;

  // Build the input area — a flex:1 column (whisper indicator + textarea)
  // that fills the LEFT of the chatbar. The pill groups mountFooter() adds
  // sit to its right (flex-shrink:0). The placeholder is replaced.
  const inputArea = document.createElement("div");
  inputArea.className = "bcc-input-area";
  chatbar.innerHTML = "";
  chatbar.appendChild(inputArea);

  // ── Whisper indicator (above the textarea) — C2 ──────────────────────
  // A small pill that stays visible while superwhisper is armed, so the user
  // always knows their next message goes to one person (not just the
  // placeholder text, which vanishes the moment they type).
  whisperIndicator = document.createElement("div");
  whisperIndicator.className = "bcc-whisper-indicator";
  whisperIndicator.style.display = "none";
  inputArea.appendChild(whisperIndicator);

  // ── Textarea — fills the bar's height ────────────────────────────────
  textarea = document.createElement("textarea");
  textarea.className = "bcc-input-field";
  textarea.setAttribute("aria-label", "Chat-Nachricht eingeben");
  textarea.placeholder = PLACEHOLDER_ALL;
  textarea.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSubmit(); // eslint-disable-line @typescript-eslint/no-floating-promises
    }
  });
  inputArea.appendChild(textarea);

  // ── Send contract — reuse the hold form's patched onsubmit (O1) ──────
  // buildPatchedHandler surfaces an upstream needle change as a thrown error
  // instead of silently dropping the /w away-timer reset (review O1).
  const holdForm = document.querySelector('form[name="hold"]') as HTMLFormElement | null;
  try {
    onSubmitOrig = buildPatchedHandler(holdForm);
  } catch (e) {
    cclog("mountInput: " + (e as Error).message, "v3");
  }

  // Expose BetterCC API (same signatures as the old path)
  (unsafeWindow.bettercc as any).onSubmit = doSubmit;
  (unsafeWindow.bettercc as any).superwhisper = superwhisper;

  // Restore any previously-set superwhisper
  getConfig("whisper", "").then((nick) => {
    const n = (nick as string) || "";
    if (n) superwhisper(n, false);
  });

  cclog("input mounted — textarea + whisper indicator + send contract", "v3");
}
