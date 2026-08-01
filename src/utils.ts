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

/** Wrap GM_notification. */
export function ccnotify(message: string, title = "", tag = "", timeout = 3000): void {
  GM_notification({
    title: "BetterCC " + title,
    text: message,
    tag: tag,
    timeout: timeout,
    onclick: () => {
      (window.event as Event)?.preventDefault();
      cclog("Notification clicked.");
      window.focus();
    },
  });
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
