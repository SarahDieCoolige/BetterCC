// ─── WebSocket lifecycle hooks ───

import { cclog, getChatDoc, getChatWin, applyThemeToIframe } from "./utils";
import { addAutoscrollBanner } from "./chat";

export let chatframeReady: boolean = false;
export let upstreamChatoutConnect: any = null;

// Bounded retry for the prefill race (see injectIntoChatframe bail branch).
// The upstream onmessage handler calls contentDocument.write() synchronously
// before this listener fires; <body> isn't parsed yet at that instant, so
// getChatDoc() returns null. We retry on a short timer until the body exists.
// 50 tries × 50ms = up to 2.5s, which is far longer than the parser ever takes
// to build <body> after a write. Reset to 0 once injection succeeds, so a later
// WS reconnect can re-inject if it ever needs to.
const INJECTION_RETRY_MS = 50;
const MAX_INJECTION_ATTEMPTS = 50;
let injectionAttempts = 0;

// Runs ONCE after the first WebSocket message populates the iframe.
export function injectIntoChatframe(): void {
  const doc = getChatDoc();
  const win = getChatWin();
  if (!doc || !win) {
    cclog("injectIntoChatframe: iframe not ready, retrying");
    chatframeReady = false;
    if (injectionAttempts++ < MAX_INJECTION_ATTEMPTS) {
      setTimeout(injectIntoChatframe, INJECTION_RETRY_MS);
    }
    return;
  }
  injectionAttempts = 0;

  // 1) Inject iframe.css
  const iframeCss = GM_getResourceText("iframe_css");
  if (iframeCss) {
    const style = doc.createElement("style");
    style.textContent = iframeCss;
    if (doc.head) {
      doc.head.appendChild(style);
    } else {
      const head = doc.createElement("head");
      head.appendChild(style);
      doc.documentElement.insertBefore(head, doc.body);
    }
  }

  // 2) Apply saved theme — sets --chatBackground / --chatText on the iframe's
  // :root. Also override the body's inline white background (set by a <script>
  // in cpop_kylr.html) so the CSS variables actually paint the page.
  if (typeof (unsafeWindow.bettercc as any)?.setTheme === "function") {
    (unsafeWindow.bettercc as any).setTheme();
  }
  // Regardless of whether a user theme was loaded yet, override the upstream
  // inline white: the injected iframe.css already provides fallback
  // --chatBackground / --chatText on :root, so the body resolves those.
  if (doc.body) {
    doc.body.style.setProperty("background-color", "var(--chatBackground)");
    doc.body.style.setProperty("color", "var(--chatText)");
  }

  // 3) Add autoscroll banner
  addAutoscrollBanner(doc, win);

  // Latch ready so the WS message handler re-injects only once. Without this,
  // betterccOnWsMessage re-runs on EVERY message — iframe.css <style> tags and
  // autoscroll-banner divs accumulate with chat length (one per message).
  chatframeReady = true;

  cclog("injectIntoChatframe: injection complete");
}

export function betterccOnWsMessage(ev: Event): void {
  if (!chatframeReady) {
    injectIntoChatframe();
  }
}

export function betterccOnWsClose(): void {
  // Upstream handles reconnect automatically.
}

export function attachWsListeners(): void {
  if (unsafeWindow.chatout_ws) {
    unsafeWindow.chatout_ws.addEventListener(
      "message",
      betterccOnWsMessage
    );
    unsafeWindow.chatout_ws.addEventListener("close", betterccOnWsClose);
  }
}

export function hookChatoutConnect(): void {
  if (typeof unsafeWindow.chatout_connect === "function") {
    upstreamChatoutConnect = unsafeWindow.chatout_connect;
    unsafeWindow.chatout_connect = function () {
      upstreamChatoutConnect.apply(this, arguments);
      attachWsListeners();
    };
    attachWsListeners();
  } else {
    cclog("WARNING: chatout_connect not found — WebSocket hook failed");
  }
}
