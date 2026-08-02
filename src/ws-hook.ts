// ─── WebSocket lifecycle hooks ───

import { cclog, getChatDoc, getChatWin } from "./utils";
import { addAutoscrollBanner } from "./chat";

export let upstreamChatoutConnect: any = null;

// Stored upstream onmessage — called first inside our handler to preserve
// all upstream behavior (contentDocument.write + SHIM_AUTH_DEAD detection).
let upstreamOnMessage: ((ev: MessageEvent) => void) | null = null;
// Tracks one-time first injection (replaces the chatframeReady latch).
let injected = false;

// Runs ONCE after the first WebSocket message populates the iframe.
export function injectIntoChatframe(): void {
  const doc = getChatDoc();
  const win = getChatWin();
  if (!doc || !win) {
    return; // body not ready — caller tries again on next message
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

  cclog("injectIntoChatframe: injection complete");
}

export function betterccOnWsMessage(ev: MessageEvent): void {
  // 1. Call upstream's handler first — preserves contentDocument.write(ev.data)
  //    (which renders the message + executes inline scripts) and the
  //    SHIM_AUTH_DEAD detection. We must NOT skip this.
  if (typeof upstreamOnMessage === "function") {
    upstreamOnMessage.call(unsafeWindow.chatout_ws, ev);
  }

  // 2. First-time injection (iframe.css + theme + autoscroll banner).
  // If the body isn't parsed yet on the very first message, skip and try
  // again on the next message (they arrive every 3-7s).
  if (!injected) {
    const doc = getChatDoc();
    if (doc && doc.body) {
      injectIntoChatframe();
      injected = true;
    }
  }

  // 3. Re-apply body styles — THE FIX. Every message, always.
  // Upstream's write may have executed inline scripts (setbgcol on channel
  // transitions, or the body-style-reset script in a re-streamed channel
  // intro) that clobber our theme. Re-applying here, synchronously in the
  // same task before the browser paints, guarantees no flash.
  const doc = getChatDoc();
  if (doc && doc.body) {
    doc.body.style.setProperty("background-color", "var(--chatBackground)");
    doc.body.style.setProperty("color", "var(--chatText)");
  }
}

export function betterccOnWsClose(): void {
  // Upstream handles reconnect automatically.
}

export function attachWsListeners(): void {
  if (unsafeWindow.chatout_ws) {
    // Store upstream's onmessage, then replace with ours.
    // We call upstream's handler first inside ours (preserves write +
    // SHIM_AUTH_DEAD detection), then re-apply iframe theme.
    upstreamOnMessage = unsafeWindow.chatout_ws.onmessage;
    unsafeWindow.chatout_ws.onmessage = betterccOnWsMessage;
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
