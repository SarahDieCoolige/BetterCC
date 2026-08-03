// ─── WebSocket lifecycle hooks ───

import { cclog, getChatDoc, getChatWin } from "./utils";
import { addAutoscrollBanner } from "./chat";

export let upstreamChatoutConnect: any = null;

// Stored upstream onmessage — called first inside our handler to preserve
// all upstream behavior (contentDocument.write + SHIM_AUTH_DEAD detection).
let upstreamOnMessage: ((ev: MessageEvent) => void) | null = null;
// Tracks one-time first injection (replaces the chatframeReady latch).
let injected = false;

// ─── First injection ───────────────────────────────────────────────────
// contentDocument.write() creates the body synchronously, but getChatDoc()
// can't see it until the current task yields. We retry on a short timer
// until the body exists. Triggered by the first WS message (via
// betterccOnWsMessage) — NOT by a blind poll, to avoid injecting into a
// body that a subsequent contentDocument.open() will wipe.
const INJECTION_RETRY_MS = 50;
const MAX_INJECTION_RETRIES = 50;
let injectionRetries = 0;

// Runs ONCE after the first WebSocket message populates the iframe.
export function injectIntoChatframe(): void {
  const doc = getChatDoc();
  const win = getChatWin();
  if (!doc || !win || !doc.body) {
    // Body not parsed yet after upstream's contentDocument.write(). Retry
    // on a short timer — the parser builds <body> within a few ms.
    if (injectionRetries++ < MAX_INJECTION_RETRIES) {
      setTimeout(injectIntoChatframe, INJECTION_RETRY_MS);
    }
    return;
  }
  injectionRetries = 0;

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
  doc.body.style.setProperty("background-color", "var(--chatBackground)");
  doc.body.style.setProperty("color", "var(--chatText)");

  // 3) Add autoscroll banner
  addAutoscrollBanner(doc, win);

  // 4) Inject iframe-interaction listener so parent-page UI (popup, input)
  //    can react to clicks inside the chatframe.
  doc.body.addEventListener("mousedown", () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.dispatchEvent(new CustomEvent("bcc-iframe-interaction"));
  });

  cclog("injectIntoChatframe: injection complete");
}

export function betterccOnWsMessage(ev: MessageEvent): void {
  // 1. Call upstream's handler first — preserves contentDocument.write(ev.data)
  //    (which renders the message + executes inline scripts) and the
  //    SHIM_AUTH_DEAD detection. We must NOT skip this.
  //
  //    Guarded so an upstream throw (a page bug — e.g. a ReferenceError in their
  //    injected script) can't escape and skip the post-processing below. The
  //    theme re-apply in step 3 is load-bearing ("THE FIX" for inline-script
  //    style clobbers); it must run on every message regardless of upstream
  //    health. The error is logged via cclog so it stays attributable rather
  //    than silently swallowed.
  if (typeof upstreamOnMessage === "function") {
    try {
      upstreamOnMessage.call(unsafeWindow.chatout_ws, ev);
    } catch (e) {
      cclog("betterccOnWsMessage: upstream onmessage threw — " + (e as Error).message, "ws-hook");
    }
  }

  // 2. First-time injection (iframe.css + theme + autoscroll banner).
  // injectIntoChatframe retries internally until the body is parsed.
  if (!injected) {
    injectIntoChatframe();
    injected = true;
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
