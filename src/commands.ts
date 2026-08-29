// ─── v3 command handler — pure dispatch + superwhisper rewrite ─────────────
//
// Regexes are COPIED VERBATIM from src/commands.ts. The old commands.test.ts
// covers these patterns; do not change them or the test breaks.
//
// classifyMessage() is the pure dispatch core (tested). The DOM-bound
// onSubmit() wrapper (reads document.hold, calls the upstream handler) lives
// in src/input.ts.

const openMsgCmdRegex = /^\/open\s|^\/o\s/;
const openMsgReplaceRegex = /^\/open\s+|^\/o\s+/gi;
const superbanMsgCmdRegex = /^\/superban\s|^\/sb\s/;
const superbanMsgReplaceRegex = /^\/superban\s+|^\/sb\s+/gi;
const superwhisperMsgCmdRegex = /^\/superwhisper\s|^\/sw\s/;
const superwhisperMsgReplaceRegex = /^\/superwhisper\s+|^\/sw\s+/gi;
const idMsgCmdRegex = /^\/id\b/i;
const idMsgArgRegex = /^\/id\s+/i;

/** The command reference: single source of truth for /help and the Befehle tab.
 *  Descriptions are German (user-facing) and render verbatim. */
export const COMMANDS: { cmd: string; desc: string }[] = [
  { cmd: "/w Nick", desc: "einmalig flüstern" },
  { cmd: "/sw Nick", desc: "dauerhaft flüstern" },
  { cmd: "/open", desc: "superwhisper beenden" },
  { cmd: "/ignore Nick", desc: "benutzer ignorieren" },
  { cmd: "/id Nick", desc: "ID-Karte öffnen" },
  { cmd: "/pinned", desc: "angeheftete Benutzer anzeigen" },
  { cmd: "/aw", desc: "Anwesende-Übersicht öffnen" },
  { cmd: "/color", desc: "Thema-Farbe anzeigen" },
  { cmd: "/scheme", desc: "Scheme-Version anzeigen" },
  { cmd: "/settings", desc: "Einstellungen öffnen" },
  { cmd: "/reload", desc: "Chat neu laden" },
  { cmd: "/help", desc: "diese Hilfe" },
];

export type CommandResult =
  | { handled: false; message: string }
  | { handled: true; type: "help" }
  | { handled: true; type: "reload" }
  | { handled: true; type: "open-whisper" }
  | { handled: true; type: "superwhisper"; nick: string }
  | { handled: true; type: "open-msg"; message: string }
  | { handled: true; type: "superban"; nick: string }
  | { handled: true; type: "id"; name: string }
  | { handled: true; type: "pinned-list" }
  | { handled: true; type: "color-info" }
  | { handled: true; type: "scheme-info" }
  | { handled: true; type: "settings" }
  | { handled: true; type: "aw" };

/**
 * Classify a chat message: is it a BetterCC command, or a regular message?
 * Order and logic mirror the old replaceOnSubmit handler (src/commands.ts:20-100)
 * so behaviour is byte-for-byte identical.
 */
export function classifyMessage(mymsg: string): CommandResult {
  const lower = mymsg.toLowerCase();

  // /help or /bettercc — both print the help notification
  if (lower === "/help" || lower === "/bettercc") {
    return { handled: true, type: "help" };
  }

  // /sb or /superban (bare → list; with nick → add)
  if (lower === "/sb" || lower === "/superban") {
    return { handled: true, type: "superban", nick: "" }; // bare = list
  }
  if (superbanMsgCmdRegex.test(lower)) {
    const nick = mymsg.replace(superbanMsgReplaceRegex, "").split(" ")[0];
    return { handled: true, type: "superban", nick };
  }

  // /id — opens the search popup (src/id-popup.ts, shipped v3.5.3)
  if (idMsgCmdRegex.test(lower)) {
    let name = mymsg
      .replace(idMsgArgRegex, "")
      .replace(/^\/id$/i, "")
      .trim();
    return { handled: true, type: "id", name };
  }

  // /open alone → clear superwhisper
  if (lower === "/open") {
    return { handled: true, type: "open-whisper" };
  }

  // /reload
  if (lower === "/reload") {
    return { handled: true, type: "reload" };
  }

  // /pinned — list pinned users
  if (lower === "/pinned") {
    return { handled: true, type: "pinned-list" };
  }

  // /color — print theme color
  if (lower === "/color") {
    return { handled: true, type: "color-info" };
  }

  // /scheme — print scheme generator version
  if (lower === "/scheme") {
    return { handled: true, type: "scheme-info" };
  }

  // /settings — print all config
  if (lower === "/settings") {
    return { handled: true, type: "settings" };
  }

  // /aw: opens the Anwesende overview modal (src/aw-modal.ts)
  if (lower === "/aw") {
    return { handled: true, type: "aw" };
  }

  // /sw nick or /superwhisper nick
  if (superwhisperMsgCmdRegex.test(lower)) {
    const nick = mymsg.replace(superwhisperMsgReplaceRegex, "").split(" ")[0];
    return { handled: true, type: "superwhisper", nick };
  }

  // /o msg or /open msg
  if (openMsgCmdRegex.test(lower)) {
    const message = mymsg.replace(openMsgReplaceRegex, "");
    return { handled: true, type: "open-msg", message };
  }

  return { handled: false, message: mymsg };
}

/**
 * When a superwhisper target is active, prepend /w nick to non-command messages.
 * Messages already starting with "/" (other commands) are passed through unchanged.
 */
export function rewriteForWhisper(msg: string, nick: string): string {
  if (!nick || msg.startsWith("/")) return msg;
  return "/w " + nick + " " + msg;
}
