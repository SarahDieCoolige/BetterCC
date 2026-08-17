// ─── v3 stats bar — Freunde Online / Anfragen / Nachrichten badges ─────────
//
// A three-badge row at the TOP of the sidebar (above the online-count heading
// and the userlist), reimplementing the old #u_stats bar cleanly (no copy of
// v2 code). Polled from chat_info_friends_nc.html via the upstream ajax class's
// onComplete callback — parsed DIRECTLY (no hidden #u_stats element, unlike the
// modernize clone-and-mirror approach). Each badge opens its target in a popup
// window, matching the old layout (id-card / friends / inbox).
//
// Only the pure parser (parseStats) is unit-tested; the DOM builder + poller
// are verified via the dev-server smoke (consistent with sidebar.ts / shell.ts).

import { cclog, encodeChatLink } from "./utils";
import { getChatNick, getAjax, getPAjax } from "./upstream";
import { POLL_CADENCES } from "./cadences";

/** The three counts parsed from the chat_info_friends_nc.html response. */
export interface Stats {
  friendsOnline: number;
  requests: number;
  messages: number;
}

/**
 * Parse the chat_info_friends_nc.html response into numeric counts.
 *
 * The response is three <a> tags (.uonl/.ufri/.unc), each holding a .value
 * span with the count (zeros carry an upstream "no" class — irrelevant to the
 * parser, which reads .value text regardless). Returns null when NONE of the
 * three anchors are found — i.e., the response was empty/garbage/truncated —
 * so the caller can keep the last good render instead of flashing zeros on a
 * transient bad fetch. A valid all-zero response (three anchors present, values
 * all 0) still returns {0,0,0} and renders immediately.
 *
 * Implementation note: we extract via a small regex rather than DOMParser so
 * the function stays pure and unit-testable in vitest's default Node
 * environment (which has no DOM globals — no DOMParser/document/window). The
 * response is fixed upstream markup, not arbitrary HTML, so a targeted regex
 * keyed on the stable class structure is proportionate here.
 */
export function parseStats(html: string): Stats | null {
  if (typeof html !== "string" || html.length === 0) return null;

  // Match in two steps so a non-numeric value can't bleed into the NEXT
  // anchor's count. Step 1: scope to a single <a>…</a> block (the first one
  // carrying the class). Step 2: within that block, find the .value span and
  // capture its digits. `[^]*?` crosses newlines (the response is multi-line);
  // a non-numeric value falls through the \d+ guard to 0.
  const read = (cls: string): number | null => {
    const anchorRe = new RegExp('class="[^"]*\\b' + cls + '\\b[^"]*"[^]*?</a>', "i");
    const anchorMatch = html.match(anchorRe);
    if (!anchorMatch) return null; // anchor absent — distinguishes "garbage" from "zero"
    const block = anchorMatch[0];
    const valueRe = /<span\s+class="value(?:\s+[^"]*)?"\s*>\s*(\d+)\s*<\/span>/i;
    const valueMatch = block.match(valueRe);
    const n = valueMatch ? Number(valueMatch[1]) : 0;
    return Number.isFinite(n) ? n : 0;
  };

  const friendsOnline = read("uonl");
  const requests = read("ufri");
  const messages = read("unc");

  // No anchors found at all → unparseable response. Caller keeps last good.
  if (friendsOnline === null && requests === null && messages === null) return null;

  return {
    friendsOnline: friendsOnline ?? 0,
    requests: requests ?? 0,
    messages: messages ?? 0,
  };
}

/** The three badge specs: CSS class, Font Awesome icon, and popup URL target. */
interface BadgeSpec {
  statKey: keyof Stats;
  iconClass: string;
  /** URL to open on click, built from the encoded nick. */
  url: (encNick: string) => string;
  title: string;
}

const BADGES: BadgeSpec[] = [
  {
    statKey: "friendsOnline",
    iconClass: "fa-users",
    title: "Freunde Online",
    // ID card: PPATH + 'id/' + Encode_Link(name) + '.html' (chat_pop_kylr.js:193)
    url: (encNick) => "//www.chatcity.de/de/id/" + encNick + ".html",
  },
  {
    statKey: "requests",
    iconClass: "fa-user-plus",
    title: "Neue Freundesanfragen",
    // Upstream: /de/friends/<id-card-url> (e.g. /de/friends/https://.../id/username01:5F:.html)
    url: (encNick) =>
      "//www.chatcity.de/de/friends/https://www.chatcity.de/de/id/" + encNick + ".html",
  },
  {
    statKey: "messages",
    iconClass: "fa-envelope",
    title: "Neue Nachrichten",
    url: () => "//www.chatcity.de/de/nc/index.html",
  },
];

let statsBar: HTMLElement | null = null;
let pollTimer: number | null = null;

/**
 * Build the stats bar (three badge links). Each badge shows a Font Awesome
 * icon + a count pill; the pill hides when the count is 0 (.bcc-stat-no).
 * Clicking a badge opens its target in a popup window (old-layout parity).
 */
export function buildStatsBar(nick: string): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "bcc-stats";
  const encNick = encodeChatLink(nick);

  for (const spec of BADGES) {
    const link = document.createElement("a");
    link.className = "bcc-stat bcc-stat-" + spec.statKey;
    link.href = "#";
    link.title = spec.title;
    link.setAttribute("role", "button");
    link.setAttribute("aria-label", spec.title);
    link.addEventListener("click", (e) => {
      e.preventDefault();
      window.open(spec.url(encNick), "IDCARD", "width=810,height=800,scrollbars=yes");
    });

    const icon = document.createElement("i");
    icon.className = "fas " + spec.iconClass;
    icon.setAttribute("aria-hidden", "true");
    link.appendChild(icon);

    const count = document.createElement("span");
    count.className = "bcc-stat-count bcc-stat-no"; // hidden until a count arrives
    count.textContent = "0";
    link.appendChild(count);

    bar.appendChild(link);
  }

  statsBar = bar;
  return bar;
}

/** Render a parsed Stats into the bar: update count text + toggle the
 *  zero-hiding class. No-op on null (keeps the last good render — guards
 *  against transient bad fetches flashing the badges to zero).
 *  Safe to call before/without buildStatsBar (no-op). */
function renderStats(stats: Stats | null): void {
  if (!statsBar || stats === null) return;
  for (const spec of BADGES) {
    const link = statsBar.querySelector(".bcc-stat-" + spec.statKey);
    if (!link) continue;
    const count = link.querySelector(".bcc-stat-count");
    if (!count) continue;
    const value = stats[spec.statKey];
    count.textContent = String(value);
    count.classList.toggle("bcc-stat-no", value < 1);
  }
}

/**
 * Poll chat_info_friends_nc.html once via the upstream ajax class. Uses
 * onComplete to get responseText directly (no hidden #u_stats element). Wrapped
 * in try/catch + cclog so a malformed response never crashes the loop.
 */
function pollOnce(): void {
  try {
    const ajax = getAjax();
    const pajax = getPAjax();
    if (typeof ajax !== "function" || typeof pajax !== "string") {
      cclog("stats: upstream ajax/PAJAX unavailable — skipping poll", "v3");
      return;
    }
    new ajax(pajax + "chat_info_friends_nc.html", {
      onComplete: (transport: any) => {
        try {
          renderStats(parseStats(transport?.responseText ?? ""));
        } catch (e) {
          cclog("stats: parse failed — " + (e as Error).message, "v3");
        }
      },
    });
  } catch (e) {
    cclog("stats: poll error — " + (e as Error).message, "v3");
  }
}

/**
 * Mount the stats bar into a parent element (the sidebar top) and start the
 * 10s poll. Idempotent. Reads chat_nick once for the popup URLs.
 *
 * Call after the sidebar exists. Clears the poll interval on page unload so a
 * reconnect/reload doesn't leak overlapping polls.
 */
export function mountStatsBar(parent: HTMLElement): void {
  if (statsBar && statsBar.isConnected) return; // idempotent
  const nick = getChatNick();
  parent.insertBefore(buildStatsBar(nick), parent.firstChild);

  pollOnce(); // immediate first paint, then on the interval
  pollTimer = window.setInterval(pollOnce, POLL_CADENCES.stats);
  window.addEventListener("beforeunload", () => {
    if (pollTimer !== null) window.clearInterval(pollTimer);
  });
}
