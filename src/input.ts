// ─── v3 input area — textarea, send contract, superwhisper (spec §3.2 / T8) ─
//
// Builds a <textarea> that submits on Enter (Shift+Enter = newline), routes
// through the reused upstream onsubmit handler for message normalization +
// away-timer reset, and handles BetterCC commands + superwhisper.

import { cclog, printHelp, printToChat } from "./utils";
import { classifyMessage, rewriteForWhisper } from "./commands";
import { generateScheme } from "./scheme";
import { buildPatchedHandler } from "./patched-handler";
import { buildIdPopup } from "./id-popup";
import { openSettings } from "./settings";
import { get, set, react } from "./store";

let textarea: HTMLTextAreaElement | null = null;
let onSubmitOrig: ((...args: any[]) => any) | null = null;
let currentWhisperNick = "";

// Placeholder strings — shared trailing hint block (defined once so the
// "no whisper" and "whispering to X" variants can't drift apart).
const HINTS_ALL = "Superwhisper: /sw Sariam  |  Ban: /sb Wendigo  |  Hilfe: /help";
const HINTS_WHISPER = "Superwhisper aus: /open  |  /o Hi All :)  |  Hilfe: /help";
const PLACEHOLDER_ALL = "Du chattest mit allen...\n\n" + HINTS_ALL;
function placeholderFor(nick: string): string {
  return "Du flüsterst mit " + nick + "...\n\n" + HINTS_WHISPER;
}

// Compact-mode placeholder — single line for the 2-line textarea.
const PLACEHOLDER_COMPACT_ALL = "Nachricht...  |  /sw Name  |  /o Hi all  |  /help";
function placeholderCompactFor(nick: string): string {
  return "Flüstern zu " + nick + "...  |  /open  |  /o Hi all  |  /help";
}

// ─── The send-path decision (pure — extracted from doSubmit, tested) ───────
//
// Given the raw textarea message and the active whisper nick, decide what to
// do: send a (possibly rewritten) message, or let a command consume it. This
// is the layer that ties classifyMessage + rewriteForWhisper together — it
// was untested originally, which is how the /o-under-superwhisper bug (C1)
// slipped through. doSubmit is now a thin wrapper over this.

export type SendDecision = { action: "send"; message: string } | { action: "handled"; clear: true };

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
      case "pinned-list":
      case "color-info":
      case "scheme-info":
      case "settings":
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

/**
 * The Enter send rule (invert-the-modifier). Enter is always the "default
 * action", Shift+Enter the "non-default"; the flag picks which means send.
 * sendOnEnter=true (default) preserves the original Enter-sends behavior.
 */
export function shouldSendOnEnter(sendOnEnterFlag: boolean, shiftKey: boolean): boolean {
  return sendOnEnterFlag ? !shiftKey : shiftKey;
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
          buildIdPopup(cmd.name || "");
          break;
        case "pinned-list": {
          const list = get("pinned") as string[];
          printToChat(
            list.length ? "Angepinnt: " + list.join(", ") : "Keine angepinnten Benutzer.",
          );
          break;
        }
        case "color-info": {
          const hex = String(get("color")).replace(/^#/, "");
          const swatch =
            '<span style="display:inline-block;width:24px;height:24px;background:#' +
            hex +
            ';border-radius:4px;vertical-align:middle;margin:0 4px 0 2px;box-shadow:0 2px 4px rgba(0,0,0,0.25)"></span>';
          printToChat("Thema-Farbe: " + swatch + "#" + hex);
          break;
        }
        case "scheme-info": {
          const v2 = get("scheme_v2");
          const scheme = generateScheme(get("color"));
          const rows: string[] = [];
          for (const [k, v] of Object.entries(scheme as unknown as Record<string, unknown>)) {
            const hex = String(v).replace(/^#/, "");
            const swatch =
              '<span style="display:inline-block;width:24px;height:24px;background:#' +
              hex +
              ';border-radius:4px;vertical-align:middle;box-shadow:0 2px 4px rgba(0,0,0,0.25)"></span>';
            rows.push(
              '<tr><td style="padding:2px 8px 2px 0">' +
                swatch +
                '</td><td style="padding-right:6px">' +
                k +
                "</td><td>#" +
                hex +
                "</td></tr>",
            );
          }
          rows.push(
            '<tr><td colspan="3" style="padding-top:6px;opacity:0.6">Generator: ' +
              (v2 ? "v2 (experimentell)" : "v1") +
              "</td></tr>",
          );
          printToChat(
            '<table style="border-collapse:collapse;font:inherit;color:inherit">' +
              rows.join("") +
              "</table>",
          );
          break;
        }
        case "settings":
          openSettings();
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

/** One-shot whisper: clear the textarea, set it to "/w <nick> ", and focus.
 *  Does NOT arm superwhisper (no persistent rewrite) — the user sends once,
 *  the prefix they see is the actual message that goes out. Used by the
 *  popup's "Flüstern (1×)" action. Clears any existing text first so the
 *  prefix isn't appended to a half-typed message. */
function prefillWhisper(nick: string): void {
  if (!textarea) return;
  textarea.value = "/w " + nick + " ";
  textarea.focus();
  // Caret at the end so the user can keep typing the message body.
  const end = textarea.value.length;
  textarea.setSelectionRange(end, end);
}

async function superwhisper(whispernick: string, toggle = true): Promise<void> {
  const cur = get("whisper");
  const same = toggle && whispernick && cur.toLowerCase() === whispernick.toLowerCase();
  await set("whisper", same || !whispernick ? "" : whispernick);
}

// ─── Mount ──────────────────────────────────────────────────────────────────

export function mountInput(): void {
  const chatbar = document.querySelector(".bcc-chatbar");
  if (!chatbar) return;

  // Build the input area — a flex:1 ROW: whisper indicator (left, fixed) +
  // textarea (fills the rest). The pill groups mountFooter() adds sit to the
  // chatbar's right (flex-shrink:0). The placeholder is replaced.
  const inputArea = document.createElement("div");
  inputArea.className = "bcc-input-area";
  chatbar.innerHTML = "";
  chatbar.appendChild(inputArea);

  // ── Textarea — fills the bar's height ────────────────────────────────
  textarea = document.createElement("textarea");
  textarea.name = "bcc-chat";
  textarea.className = "bcc-input-field";
  textarea.setAttribute("aria-label", "Chat-Nachricht eingeben");
  textarea.placeholder = PLACEHOLDER_ALL;
  textarea.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" && shouldSendOnEnter(get("send_on_enter"), e.shiftKey)) {
      e.preventDefault();
      doSubmit();
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
  (unsafeWindow.bettercc as any).prefillWhisper = prefillWhisper;
  // Expose placeholder update for the compact toggle
  (unsafeWindow.bettercc as any).updatePlaceholder = updatePlaceholder;

  // Restore + live reaction: store react replaces the old getConfig boot-restore
  // and the bus subscribe block. React's initial render handles both.
  react("whisper", (nick) => {
    currentWhisperNick = nick;
    textarea?.classList.toggle("bcc-superwhisper", Boolean(nick));
    updatePlaceholder();
  });

  // Auto-focus the textarea so users can type immediately
  if (textarea) textarea.focus();

  // Set initial placeholder — compact state is restored async in mountFooter,
  // but call here so it's correct once the class lands.
  updatePlaceholder();

  cclog("input mounted — textarea + whisper indicator + send contract", "v3");
}

/** Update the placeholder based on compact mode. Called by the toggle button. */
export function updatePlaceholder(): void {
  if (!textarea) return;
  const chatbar = document.querySelector(".bcc-chatbar");
  const compact = chatbar?.classList.contains("bcc-compact");
  if (currentWhisperNick) {
    textarea.placeholder = compact
      ? placeholderCompactFor(currentWhisperNick)
      : placeholderFor(currentWhisperNick);
  } else {
    textarea.placeholder = compact ? PLACEHOLDER_COMPACT_ALL : PLACEHOLDER_ALL;
  }
}
