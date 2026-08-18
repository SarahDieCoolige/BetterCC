// ─── Utilities: logging, iframe access, help text ───
//
// The shared pre-v3 helpers survived the v2 removal. What remains is what v3
// + ws-hook actually consume: logging, the user-scoped GM-key helper, iframe
// access, theme mirroring, and the help notification. The v2-only helpers
// (printInChat/cclogChat, waitForElements, getUserStore, feature flags) were
// dropped with the v2 UI.

import { COMMANDS } from "./commands";

/** Wrap GM_log with a tag prefix. Use this, never console.log. */
export function cclog(str: string, tag = "BetterCC"): void {
  GM_log(tag + " - " + str);
}

// ─── Help ──────────────────────────────────────────────────────────────────

/** Print the command reference directly into the chat iframe. */
export function printHelp(): void {
  const width = Math.max(...COMMANDS.map((c) => c.cmd.length));
  const text = COMMANDS.map((c) => c.cmd.padEnd(width) + " – " + c.desc).join("\n");
  printToChat(text);
}

// ─── Iframe access ───
// Always use these — they return null if the iframe isn't ready. Never access
// chatframe.contentDocument directly.

export function getChatDoc(): Document | null {
  const f = document.getElementById("chatframe") as HTMLIFrameElement | null;
  if (!f) return null;
  const doc = f.contentDocument;
  if (!doc || !doc.body) return null;
  return doc;
}

export function getChatWin(): Window | null {
  const f = document.getElementById("chatframe") as HTMLIFrameElement | null;
  return f ? f.contentWindow : null;
}

/** Write a styled message into the chat iframe's document stream.
 *  Splits on \n → <br>, prefixes with "BetterCC: ", and scrolls to bottom.
 *  If the iframe isn't ready this is a silent no-op.
 *
 *  We use doc.writeln() to write into the same document stream that upstream
 *  chat messages use (contentDocument.write). DOM manipulation (appendChild /
 *  insertBefore) bypasses the streaming parser and causes messages to stay at
 *  the absolute bottom of the content instead of scrolling with the chat. */
export function printToChat(message: string): void {
  const doc = getChatDoc();
  if (!doc?.body) return;
  const hasNewline = message.includes("\n");
  let html: string;
  if (hasNewline) {
    html =
      '<div class="bcc-chat-msg"><strong style="color:#ff5577">BetterCC:</strong><br>' +
      message.replace(/^/gm, "&emsp;").replace(/\n/g, "<br>") +
      "</div>";
  } else {
    html =
      '<div class="bcc-chat-msg"><strong style="color:#ff5577">BetterCC:</strong> ' +
      message +
      "</div>";
  }
  // Write into the upstream's open document stream so the message
  // integrates naturally with the chat content flow.
  doc.writeln(html);
  const win = getChatWin();
  if (win) win.scrollTo(0, doc.body.scrollHeight);
}

/** Mirror bg/fg into the chat iframe under its own --chat* var names. */
export function applyThemeToIframe(bgColor: string, fgColor: string): void {
  const doc = getChatDoc();
  if (!doc) return;
  const root = doc.documentElement;
  root.style.setProperty("--chatBackground", bgColor);
  root.style.setProperty("--chatText", fgColor);
  doc.body.style.backgroundColor = "var(--chatBackground)";
  doc.body.style.color = "var(--chatText)";
}

// ─── Nick-URL encoding ──────────────────────────────────────────────────

/**
 * Encode a nick for a ChatCity URL path, replicating the upstream Encode_Link
 * (dev/fixture/.../utils_kylr.js:38). Safe characters (A-Za-z0-9) pass through,
 * space → '-', unsafe ASCII → `:XX:` hex, Unicode → `:%XX:` escaped.
 */
export function encodeChatLink(name: string): string {
  const SAFE = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const HEX = "0123456789ABCDEF";
  let encoded = "";
  for (let i = 0; i < name.length; i++) {
    const ch = name.charAt(i);
    if (ch === " ") {
      encoded += "-";
    } else if (SAFE.indexOf(ch) !== -1) {
      encoded += ch;
    } else {
      const code = ch.charCodeAt(0);
      if (code > 255) {
        const escaped = encodeURIComponent(ch);
        encoded += ":" + escaped.substring(1, 99) + ":";
      } else {
        encoded += ":";
        encoded += HEX.charAt((code >> 4) & 0xf);
        encoded += HEX.charAt(code & 0xf);
        encoded += ":";
      }
    }
  }
  return encoded;
}

// ─── Storage key helper ───

let userStore: string = ""; // set during init

// Prefix format: {key}_{user} — NOT {user}_{key}. This matches the keys the
// old path hand-rolls everywhere ("color_" + userStore, "ban_" + userStore,
// etc.), so the v3 config module reads what existing users already have saved.
// No data migration (spec §6.5, A6). Guests use "gast" as the user suffix.
export function getUserKey(key: string): string {
  return `${key}_${userStore}`;
}

export function setUserStore(nick: string, isGast: boolean): void {
  userStore = isGast ? "gast" : nick.toLowerCase();
}
