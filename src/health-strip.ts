// ─── Notification strip: the single non-critical message line ──────────────
//
// One row directly above the chatbar, in-flow: when it appears the layout
// makes room instead of covering chat content, and while everything is fine
// it is display:none. Shows exactly one line, chosen by priority:
// transient upstream notices (setstatus texts) > stuck > injection > offline.

import { react, get } from "./store";
import { reloadChat } from "./shell";
import {
  BANNER_STUCK_TEXT,
  BANNER_OPTICS_TEXT,
  ACTION_RELOAD,
  INPUT_OFFLINE_HINT,
} from "./health-strings";
import type { ConnState } from "./health-core";
import { STUCK_MS } from "./health-core";

/** How long a transient notice stays up before the strip falls back. */
const NOTICE_MS = 8_000;

export interface StripNotice {
  text: string;
  color: string | null; // upstream setstatus sends a color; shown verbatim
  until: number; // epoch after which the notice is gone
}

export interface StripView {
  text: string;
  color: string | null;
  reload: boolean; // offer the [Neu laden] action
}

/** The one line to show right now, or null when everything is fine. */
export function stripView(
  conn: ConnState,
  injectionDegraded: boolean,
  now: number,
  notice: StripNotice | null,
): StripView | null {
  if (notice && now < notice.until) {
    return { text: notice.text, color: notice.color, reload: false };
  }
  if (conn.phase === "connecting" && conn.since > 0 && now - conn.since > STUCK_MS) {
    return { text: BANNER_STUCK_TEXT, color: null, reload: true };
  }
  if (injectionDegraded) {
    return { text: BANNER_OPTICS_TEXT, color: null, reload: true };
  }
  if (conn.phase !== "connected") {
    return { text: INPUT_OFFLINE_HINT, color: null, reload: false };
  }
  return null;
}

// ─── Transient slot ──────────────────────────────────────────────────────────

// Module state on purpose: an 8-second display message is view state, not a
// store fact. The setstatus wrap calls showStripNotice from health.ts.
let notice: StripNotice | null = null;
let noticeTimer: number | null = null;
let strip: HTMLElement | null = null;

/** Show a transient line (upstream status text, verbatim). One at a time;
 * a newer notice replaces the old one. */
export function showStripNotice(text: string, color: string | null): void {
  notice = { text, color, until: Date.now() + NOTICE_MS };
  if (noticeTimer !== null) clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    noticeTimer = null;
    notice = null;
    render();
  }, NOTICE_MS);
  render();
}

// ─── Render ──────────────────────────────────────────────────────────────────

function render(): void {
  if (!strip) return;
  const view = stripView(
    get("conn") as ConnState,
    get("bccHealth").injectionDegraded,
    Date.now(),
    notice,
  );
  if (view === null) {
    strip.classList.remove("bcc-strip-visible");
    strip.replaceChildren();
    delete strip.dataset.key;
    return;
  }
  // Same line already up: no DOM churn (conn stamps refire renders constantly).
  const key = view.text + "|" + (view.color ?? "");
  if (strip.dataset.key === key) return;
  strip.dataset.key = key;
  strip.classList.add("bcc-strip-visible");
  strip.replaceChildren();

  const line = document.createElement("span");
  line.textContent = view.text;
  if (view.color) line.style.color = view.color;
  strip.appendChild(line);

  if (view.reload) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bcc-strip-reload";
    btn.textContent = ACTION_RELOAD;
    btn.addEventListener("click", reloadChat);
    strip.appendChild(btn);
  }
}

// Stuck check needs a timer: conn writes alone can't fire at a future time.
let stuckTimer: number | null = null;

export function mountHealthStrip(): void {
  const chatbar = document.querySelector(".bcc-chatbar");
  if (!chatbar) return;

  strip = document.createElement("div");
  strip.className = "bcc-health-strip";
  chatbar.parentElement?.insertBefore(strip, chatbar);

  react("conn", (conn) => {
    if (stuckTimer !== null) {
      clearTimeout(stuckTimer);
      stuckTimer = null;
    }
    const c = conn as ConnState;
    if (c.phase === "connecting" && c.since > 0) {
      const wait = Math.max(0, STUCK_MS - (Date.now() - c.since));
      stuckTimer = window.setTimeout(() => {
        stuckTimer = null;
        render();
      }, wait);
    }
    render();
  });
  react("bccHealth", () => render());
  render();
}
