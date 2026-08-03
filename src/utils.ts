// ─── Utilities: logging, iframe access, help text ───
//
// The shared pre-v3 helpers survived the v2 removal. What remains is what v3
// + ws-hook actually consume: logging, the user-scoped GM-key helper, iframe
// access, theme mirroring, and the help notification. The v2-only helpers
// (printInChat/cclogChat, waitForElements, getUserStore, feature flags) were
// dropped with the v2 UI.

/** Wrap GM_log with a tag prefix. Use this, never console.log. */
export function cclog(str: string, tag = "BetterCC"): void {
  GM_log(tag + " - " + str);
}

/** Help text shown by printHelp() (/help, /bettercc). German feature list. */
export const helptxtNotify: string = [
  "/sw sariam" + " - " + "sw an",
  "/o hi all :)" + " - " + "ins open",
  "/open" + " - " + "sw aus",
  "/sb wendigo" + " - " + "superignore an/aus",
  "/superban" + " - " + "banliste",
  "/reload" + " - " + "chat neu laden",
  "/settings" + " - " + "einstellungen",
  "/help" + " - " + "hilfe",
].join("\n");

/** Show the help notification (called by /help, /bettercc, the footer help btn). */
export function printHelp(): void {
  ccnotify(helptxtNotify, "Hilfe", "help");
}

/** Wrap GM_notification. VM doesn't expose GM.notification as a callable
 * function (only GM_notification works), so we use the legacy global. */
export function ccnotify(message: string, title = "", tag = "", timeout = 3000): void {
  const opts = {
    title: "BetterCC " + title,
    text: message,
    tag: tag,
    timeout: timeout,
    onclick: () => {
      (window.event as Event)?.preventDefault();
      cclog("Notification clicked.");
      window.focus();
    },
  };

  GM_notification(opts);
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

/** Append a styled message to the chat iframe body.
 *  Splits on \n → <br>, prefixes with "BetterCC: ", and scrolls to bottom.
 *  If the iframe isn't ready this is a silent no-op. */
export function printToChat(message: string): void {
  const doc = getChatDoc();
  if (!doc?.body) return;
  const div = doc.createElement("div");
  div.className = "bcc-chat-msg";
  div.innerHTML = "BetterCC: " + message.replace(/\n/g, "<br>");
  doc.body.appendChild(div);
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
