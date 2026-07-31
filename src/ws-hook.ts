// ─── WebSocket lifecycle hooks ───

import { cclog, getChatDoc, getChatWin, applyThemeToIframe } from "./utils";
import { addAutoscrollBanner } from "./chat";

export let chatframeReady: boolean = false;
export let upstreamChatoutConnect: any = null;

// Runs ONCE after the first WebSocket message populates the iframe.
export function injectIntoChatframe(): void {
  const doc = getChatDoc();
  const win = getChatWin();
  if (!doc || !win) {
    cclog("injectIntoChatframe: iframe not ready, will retry on next message");
    chatframeReady = false;
    return;
  }

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

  // 2) Apply saved theme
  if (typeof (unsafeWindow.bettercc as any)?.setTheme === "function") {
    (unsafeWindow.bettercc as any).setTheme();
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
