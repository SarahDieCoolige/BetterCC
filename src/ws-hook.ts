// ─── WebSocket lifecycle hooks ───

import { cclog, getChatDoc, getChatWin } from "./utils";
import { addAutoscrollBanner } from "./chat";
import { applyCurrentScheme } from "./theme";
import { attachConnListeners, stampConnMessage } from "./health";

export let upstreamChatoutConnect: any = null;

// Stored upstream onmessage — called first inside our handler to preserve
// all upstream behavior (contentDocument.write + SHIM_AUTH_DEAD detection).
let upstreamOnMessage: ((ev: MessageEvent) => void) | null = null;

// ─── Injection ─────────────────────────────────────────────────────────
// contentDocument.write() creates the body synchronously, but getChatDoc()
// can't see it until the current task yields. We retry on a short timer
// until the body exists. Triggered from betterccOnWsMessage whenever our
// style element is missing from the iframe (first message, or a later full
// rewrite) — NOT by a blind poll, to avoid injecting into a body that a
// subsequent contentDocument.open() will wipe.
const INJECTION_RETRY_MS = 50;
const MAX_INJECTION_RETRIES = 50;
let injectionRetries = 0;
// One retry chain at a time — two concurrent chains would both see the body
// appear and double-inject (duplicate style, banner, listeners).
let injectionScheduled = false;

// Guard against duplicate mousedown listeners: track the last body element
// we wired. On the same channel, doc.body is the same reference → skip.
// A full rewrite creates a new body → the old listener died with the old
// DOM, and we re-wire the new one.
let _iframeMousedownBody: HTMLElement | null = null;

// (Re)builds the BetterCC layer inside the chatframe: iframe.css, theme vars,
// autoscroll banner, interaction listener. Safe to call repeatedly; every
// step is either idempotent or guarded.
export function injectIntoChatframe(): void {
  const doc = getChatDoc();
  const win = getChatWin();
  if (!doc || !win || !doc.body) {
    // Body not parsed yet after upstream's contentDocument.write(). Retry
    // on a short timer — the parser builds <body> within a few ms.
    if (injectionScheduled) return;
    if (injectionRetries++ >= MAX_INJECTION_RETRIES) {
      injectionRetries = 0; // give up this round; the next message re-triggers
      return;
    }
    injectionScheduled = true;
    setTimeout(() => {
      injectionScheduled = false;
      injectIntoChatframe();
    }, INJECTION_RETRY_MS);
    return;
  }
  injectionRetries = 0;

  // 1) Inject iframe.css. Tagged so betterccOnWsMessage can detect a full
  //    rewrite (doc.open() wipes it) and re-inject on the next message.
  const iframeCss = GM_getResourceText("iframe_css");
  if (iframeCss) {
    const style = doc.createElement("style");
    style.textContent = iframeCss;
    style.setAttribute("data-bcc-iframe", "");
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
  applyCurrentScheme();
  // Regardless of whether a user theme was loaded yet, override the upstream
  // inline white: the injected iframe.css already provides fallback
  // --chatBackground / --chatText on :root, so the body resolves those.
  doc.body.style.setProperty("background-color", "var(--chatBackground)");
  doc.body.style.setProperty("color", "var(--chatText)");

  // 3) Add autoscroll banner
  addAutoscrollBanner(doc, win);

  // 4) Inject iframe-interaction listener so parent-page UI (popup, input)
  //    can react to clicks inside the chatframe. Guarded by body reference:
  //    same body → skip (prevents stacking on every WS message); new body
  //    (channel transition) → old listener died with old DOM, re-inject.
  if (doc.body !== _iframeMousedownBody) {
    _iframeMousedownBody = doc.body;
    doc.body.addEventListener("mousedown", () => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      window.dispatchEvent(new CustomEvent("bcc-iframe-interaction"));
    });
  }

  cclog("injectIntoChatframe: injection complete");
}

export function betterccOnWsMessage(ev: MessageEvent): void {
  // 0. Stamp message arrival — a fact even if upstream's handler throws.
  stampConnMessage();

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

  // 2. (Re)inject when our iframe style is gone. The first message finds an
  //    untouched iframe; a later full rewrite (doc.open() + write — the
  //    restream scenario) wipes iframe.css, the :root vars, the banner and
  //    the interaction listener. The missing style element is the signal;
  //    injectIntoChatframe rebuilds everything and retries internally until
  //    the new body is parsed.
  // 3. Re-apply body styles — every message, always. Inline scripts in the
  //    stream (setbgcol on sep transitions, the intro's body-reset script)
  //    clobber them synchronously during the write above. Clobbers that
  //    land asynchronously (external scripts, timers) are covered by the
  //    !important floor in iframe.css.
  const doc = getChatDoc();
  if (doc && doc.querySelector("style[data-bcc-iframe]")) {
    doc.body.style.setProperty("background-color", "var(--chatBackground)");
    doc.body.style.setProperty("color", "var(--chatText)");
  } else {
    injectIntoChatframe();
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
    attachConnListeners(unsafeWindow.chatout_ws);
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
