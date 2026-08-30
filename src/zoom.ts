// ─── Page-wide text zoom, slider backing (spec: font-size-slider) ────────
//
// One store key, two mechanisms: the shell's text scales through the rem
// base (html[data-bcc-zoom] step rules in v3.css, html AND body, the host
// pins body separately), the chatframe magnifies through outer zoom +
// inverse dims on #chatframe (never zoom inside the frame, scroll units
// break). The react also preserves the frame's reading position across a
// change so the autoscroll banner never trips on geometry (chat.ts carries
// the matching reflow-resync and the zoom pause guard).

import { react } from "./store";
import { getChatDoc, getChatWin, chatScrollMax } from "./utils";
import { pauseBanner } from "./chat";

/** Reading position as a 0…1 fraction of the scrollable range; 1 when the
 * doc doesn't scroll (bottom is the only position). Pure, tested. */
export function scrollFraction(st: number, max: number): number {
  if (max <= 0) return 1;
  return Math.min(1, Math.max(0, st / max));
}

export function initZoom(): void {
  react("zoom", (z) => {
    const step = z.toFixed(2);
    const win = getChatWin();
    const doc = getChatDoc();
    // Reading position to restore after the geometry change; null when
    // the frame has no content yet (first render at boot).
    const anchor =
      win && doc
        ? {
            win,
            doc,
            fraction: scrollFraction(win.scrollY, chatScrollMax(doc, win)),
          }
        : null;

    // Arm the banner guard BEFORE the geometry change: Chromium re-anchors
    // the scroll offset a few ms after the viewport settles, and that
    // event must not read as a scroll-up.
    pauseBanner(300);
    document.documentElement.dataset.bccZoom = step;
    const shell = document.querySelector(".bcc-shell") as HTMLElement | null;
    shell?.style.setProperty("--bcc-chat-zoom", step);
    if (anchor) {
      setTimeout(() => {
        const max = chatScrollMax(anchor.doc, anchor.win);
        // instant: the frame doc inherits smooth scrolling, a smooth
        // anchor would crawl for hundreds of ms
        anchor.win.scrollTo({ top: Math.round(anchor.fraction * max), behavior: "instant" });
      }, 60);
    }
  });
}
