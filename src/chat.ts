// ─── Chat iframe: autoscroll banner ───

import { chatScrollMax } from "./utils";

/** Classify one scroll event: did the user move, or did the layout
 * reflow? A geometry change (zoom, window resize) shifts scrollTop and
 * scrollHeight together, and reading that as a scroll-up would trip the
 * banner without any user intent. Pure so the suite can pin it. */
export function scrollEventDecision(
  st: number,
  lastSt: number,
  maxScroll: number,
  lastMaxScroll: number,
): "resync" | "up" | "down" {
  if (Math.abs(maxScroll - lastMaxScroll) > 1) return "resync";
  return st < lastSt ? "up" : "down";
}

/** Pause the banner logic for a time window. Chromium re-anchors the
 * frame's scroll offset by the zoom factor AFTER the viewport settles,
 * with maxScroll already updated: that event looks exactly like a user
 * scroll-up to the geometry check, so the only honest signal is "a zoom
 * change just happened". The zoom react arms this before touching
 * anything. */
let bannerPauseUntil = 0;
export function pauseBanner(ms: number): void {
  bannerPauseUntil = Date.now() + ms;
}

export function addAutoscrollBanner(iframeDoc: Document, iframeWin: Window): void {
  if (!iframeDoc || !iframeWin) return;
  // Already present — re-injection after a full rewrite must not stack
  // banners or scroll listeners.
  if (iframeDoc.getElementById("autoscroll-banner")) return;

  const scrollbanner = iframeDoc.createElement("div");
  scrollbanner.id = "autoscroll-banner";
  scrollbanner.textContent = "Zurück nach unten";
  iframeDoc.body.appendChild(scrollbanner);

  scrollbanner.addEventListener("click", function () {
    (iframeWin as any).scrolling = true;
    scrollbanner.style.display = "none";
  });

  let lastScrollTop = iframeWin.scrollY || iframeDoc.documentElement.scrollTop;
  let lastMaxScroll = chatScrollMax(iframeDoc, iframeWin);

  iframeWin.addEventListener("scroll", function () {
    const scrollPosition = iframeDoc.documentElement.scrollTop || iframeDoc.body.scrollTop;
    const maxScroll = chatScrollMax(iframeDoc, iframeWin);
    const top = scrollPosition <= 0 ? 0 : scrollPosition;

    // Zoom-paused or a geometry reflow: not a user scroll. Keep the
    // lasts fresh so the NEXT real scroll classifies cleanly, and decide
    // nothing.
    if (
      Date.now() < bannerPauseUntil ||
      scrollEventDecision(scrollPosition, lastScrollTop, maxScroll, lastMaxScroll) === "resync"
    ) {
      lastScrollTop = top;
      lastMaxScroll = maxScroll;
      return;
    }

    if (scrollPosition < lastScrollTop) {
      if ((iframeWin as any).scrolling && scrollPosition < maxScroll - 1) {
        (iframeWin as any).scrolling = false;
        scrollbanner.style.display = "block";
      }
    }

    if (scrollPosition >= maxScroll - 1) {
      scrollbanner.style.display = "none";
      (iframeWin as any).scrolling = true;
    }

    lastScrollTop = top;
    lastMaxScroll = maxScroll;
  });
}
