// ─── Utilities: logging, iframe access, chat output, help text ───

export const superbanEnable = 1;
export const replaceInputFieldEnable = 1;
export const noChatBackgroundsEnable = 1;
export const NotificationsEnable = 1;
export const betterUserListEnable = 0;

export function cclog(str: string, tag = "BetterCC"): void {
  GM_log(tag + " - " + str);
}

export function ccnotify(message: string, title = "", tag = "", timeout = 3000): void {
  if (NotificationsEnable) {
    GM_notification({
      title: "BetterCC " + title,
      text: message,
      tag: tag,
      timeout: timeout,
      silent: true,
      onclick: () => {
        event.preventDefault();
        cclog("Notification clicked.");
        window.focus();
      },
    });
  }
}

export function printInChat(position: string = "beforeend", content: string): void {
  const doc = getChatDoc();
  if (!doc || !doc.body || !doc.body.lastChild) {
    cclog("printInChat: iframe body not ready, dropping message");
    return;
  }
  doc.body.lastChild.insertAdjacentHTML(position, content);
}

export function cclogChat(message: string, name: string = "BetterCC", newLineAfterName: boolean = true): void {
  message =
    '<pre id="bccmessage" class="bccmessage" style="white-space: pre-wrap; font-size: 1.2em; width: 70%; display: inline">' +
    message +
    "</pre><br>";

  if (name.trim() !== "") {
    name += ": ";
    name = '<font color="red"><b>' + name + "</b></font>";
    if (newLineAfterName) name += "<br>";
    message = name + message;
  }
  printInChat("beforeend", message);
}

export const helpStrings: string[][] = [
  ["/sw Sariam", "Superwhisper mit Sariam"],
  ["/o Hi All :)", "Im Open schreiben"],
  ["/open", "Superwhisper aus"],
  [
    "/sb Wendigo",
    "Einen Arsch für immer ignorieren (noch mal zum entbannen)",
  ],
  ["/superban", "Arschliste anzeigen"],
  ["/reload", "Chat neu laden (mimimi)"],
  ["/settings", "Einstellungen öffnen (irgendwann mal vielleicht^^)"],
  ["/help", "So zeigst du diese Hilfe hier an"],
];

export const helptxt: string = [
  "/sw Sariam" + "\t" + "Superwhisper mit Sariam",
  "/o Hi All :)" + "\t" + "Im Open schreiben",
  "/open" + " \t\t" + "Superwhisper aus",
  "/sb Wendigo" +
    "\t" +
    "Einen Arsch für immer ignorieren (noch mal zum entbannen)",
  "/superban" + "\t" + "Arschliste anzeigen",
  "/reload" + "\t\t" + "Chat neu laden (mimimi)",
  "/settings" + "\t" + "Einstellungen öffnen (irgendwann mal vielleicht^^)",
  "/help" + "\t\t" + "So zeigst du diese Hilfe hier an",
].join("\n");

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

export function printHelp(): void {
  ccnotify(helptxtNotify, "Hilfe", "help");
}

// ─── Iframe access ───

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

export function getUserKey(key: string): string {
  return `${userStore}_${key}`;
}

export function setUserStore(nick: string, isGast: boolean): void {
  userStore = isGast ? "gast" : nick.toLowerCase();
}

export function getUserStore(): string {
  return userStore;
}

// ─── DOM utility: MutationObserver-based element watcher ───
// Replaces GM_wrench.waitForKeyElements

export function waitForElements(
  selector: string,
  callback: (el: Element) => void,
  once: boolean,
  intervalMs: number
): void {
  // Run against already-present elements
  const existing = document.querySelectorAll(selector);
  existing.forEach((el) => callback(el));

  if (once && existing.length > 0) return;

  // Watch for future additions
  const observer = new MutationObserver(() => {
    const matches = document.querySelectorAll(selector);
    if (matches.length > 0) {
      for (let i = 0; i < matches.length; i++) {
        callback(matches[i]);
      }
      if (once) {
        observer.disconnect();
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // For non-once mode, also set up periodic re-check as fallback
  if (!once && intervalMs > 0) {
    setInterval(() => {
      const matches = document.querySelectorAll(selector);
      for (let i = 0; i < matches.length; i++) {
        callback(matches[i]);
      }
    }, intervalMs);
  }
}
