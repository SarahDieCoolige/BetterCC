// ─── Notification strip: transient + BetterCC-internal messages only ────────
//
// A floating pill at the top of the chat area. It shows ONLY what the status
// button doesn't already convey: upstream action errors (setstatus texts,
// verbatim, transient) and injection failure (persistent). Connection state
// stays on the button. Hidden entirely when there is nothing to say.

import { react, get } from "./store";
import { reloadChat } from "./shell";
import { BANNER_OPTICS_TEXT, ACTION_RELOAD } from "./health-strings";

/** How long a transient notice stays up before the strip hides again. */
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

/** The one line to show right now, or null when there is nothing to say. */
export function stripView(
  injectionDegraded: boolean,
  now: number,
  notice: StripNotice | null,
): StripView | null {
  if (notice && now < notice.until) {
    return { text: notice.text, color: notice.color, reload: false };
  }
  if (injectionDegraded) {
    return { text: BANNER_OPTICS_TEXT, color: null, reload: true };
  }
  return null;
}

// ─── Transient slot ──────────────────────────────────────────────────────────

// Module state on purpose: an 8-second display message is view state, not a
// store fact. The setstatus wrap calls showStripNotice from health.ts.
let notice: StripNotice | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
let strip: HTMLElement | null = null;

/** Show a transient line (upstream status text, verbatim). One at a time;
 * a newer notice replaces the old one. */
export function showStripNotice(text: string, color: string | null): void {
  notice = { text, color, until: Date.now() + NOTICE_MS };
  if (noticeTimer !== null) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    noticeTimer = null;
    notice = null;
    render();
  }, NOTICE_MS);
  render();
}

/** The current transient notice, or null. Test/debug seam. */
export function currentStripNotice(): StripNotice | null {
  return notice;
}

// ─── Render ──────────────────────────────────────────────────────────────────

function render(): void {
  if (!strip) return;
  const view = stripView(get("bccHealth").injectionDegraded, Date.now(), notice);
  if (view === null) {
    strip.classList.remove("bcc-strip-visible");
    strip.replaceChildren();
    delete strip.dataset.key;
    return;
  }
  // Same line already up: no DOM churn.
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

export function mountHealthStrip(): void {
  // Anchor to the chat area: a floating pill at its top, away from the
  // input. Absolute, so it never resizes the textarea or the footer.
  const main = document.querySelector(".bcc-main");
  if (!main) return;

  strip = document.createElement("div");
  strip.className = "bcc-health-strip";
  main.prepend(strip);

  react("bccHealth", () => render());
  render();
}
