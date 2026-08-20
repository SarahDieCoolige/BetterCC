// ─── v3 entry (parent-page rewrite) ──────────────────────────────────────
//
// This module is the v3 init path — the ONLY init path. The pre-v3 (v2)
// parent-page code was deleted; src/index.ts calls initV3() directly with no
// flag branching (the bcc_v3_{user} gate was abandoned when old code was
// removed).
//
// Iteration 1 scope: parent-page UI only. The chat iframe and WebSocket
// message handling stay upstream-owned (rebuilt in later iterations).
//
// CONTRACT (spec §5.1):
//   - Import only from ./utils, ./ws-hook, ./scheme, and ./ siblings. The old
//     ui.ts/theme.ts/commands.ts/superban.ts are gone; v3 owns all parent-page
//     concerns. ws-hook.ts is reused as-is (spec §3.3 requires its
//     injectIntoChatframe to keep running under v3).
//   - Keep the iframe + WS pipeline untouched.
//
// initV3() re-wires the pieces the old init owned that are load-bearing:
//   - hookChatoutConnect() (ws-hook.ts) — attaches the WS listener that injects
//     iframe.css, the theme mirror, and the autoscroll banner on first message
//     (spec §3.3). Without it the chat renders unstyled.
//   - v3_css @resource — the Grid stylesheet. Prod loads it via
//     GM_getResourceText (§4.7); the dev server inlines it into <head> for
//     ?bcc=new, so the call is a harmless no-op there.
//   - resize_fix neutering + size-interval clears — the upstream resize_fix
//     throws (AGENTS.md gotcha #6); the old path neutered it in cleanup().
//     cleanup() lives in ui.ts (deletable bucket), so v3 inlines only this
//     load-bearing subset rather than importing it (see neuterResizeFix).
//   - initTheme() — apply the saved color scheme via the sync store (tier-0,
//     spec §5.3). Registers store reacts so color/scheme_v2 changes re-apply
//     automatically. The store is seeded sync at boot, so no promise is needed.
//     applyCurrentScheme is exposed on the bettercc API so
//     injectIntoChatframe re-applies on reconnect.

import { cclog } from "./utils";
import { hookChatoutConnect } from "./ws-hook";
import { buildShell, reloadChat } from "./shell";
import { initTheme, applyCurrentScheme } from "./theme";
import { startUlistPoll, stopUlistPoll, refreshUlistNow } from "./ulist-poll";
import { startPolling, stopPolling } from "./global-userlist";
import { mountSidebar } from "./sidebar";
import { mountStatsBar } from "./stats";
import { initSession, getSession } from "./session";
import { initHealth, initSetStatusWrap } from "./health";
import { mountInput } from "./input";
import { mountFooter } from "./footer";
import { mountHealthUi } from "./health-ui";
import { mountHealthStrip } from "./health-strip";
import { initStore, on, snapshot } from "./store";

/**
 * Neuter the upstream resize_fix path. The old cleanup() (deleted with ui.ts)
 * did this plus table-DOM surgery; only this subset is load-bearing under v3
 * (the rest targeted the now-hidden table). Inlined here — there's no old
 * module to import it from.
 */
function neuterResizeFix(): void {
  (unsafeWindow as any).resize_fix = function resize_fix(): boolean {
    return true;
  };
  clearTimeout((unsafeWindow as any).size_timeout);
  clearInterval((unsafeWindow as any).size_interval);
}

/**
 * Neuter the upstream get_info() timer loop. get_info() is a self-rescheduling
 * timer (it re-arms info_timer1 at the end of each call), so a single
 * clearTimeout can't kill it. v3 now owns both halves: stats.ts owns the
 * friends-stats fetch, and ulist-poll.ts owns the userlist fetch. Replace the
 * function with a no-op so it never fires and never re-arms.
 */
function neuterGetInfo(): void {
  clearTimeout((unsafeWindow as any).info_timer1);
  (unsafeWindow as any).get_info = function get_info(): void {};
}

/**
 * Initialize the v3 parent-page UI.
 *
 * Called from src/index.ts after the same userStore setup the old path uses,
 * so both paths share the GM-storage key namespace via getUserKey().
 */
export async function initV3(): Promise<void> {
  // Boot the sync store before anything else (spec §4).
  // Must run after setUserStore() (derives user-scoped GM keys).
  await initStore();

  cclog("v3 init (parent-page rewrite, iteration 1)");

  // Load the v3 stylesheet first so the shell paints with Grid layout from the
  // start. Dev server already inlines it for ?bcc=new → GM_getResourceText
  // returns "" → no-op. Production fetches it via the @resource (spec §4.7).
  const v3Css = GM_getResourceText("v3_css");
  if (v3Css) GM_addStyle(v3Css);

  // Neuter resize_fix before anything triggers it (it throws upstream).
  neuterResizeFix();

  // Seed session state (reads chat_nick/chat_channel/etc. once, then polls
  // auth-dead + channel every 2s). Must run before buildShell so the header
  // label can read chat_channel for its initial value.
  initSession();

  // Conn wiring (ws events + session authDead). After initSession so the
  // initial snapshot exists; before hookChatoutConnect so the first ws
  // attach already carries conn listeners.
  initHealth();

  // Build the Grid shell FIRST (moves #chatframe, hides the table, adds
  // header). Must exist before initTheme() below — applyScheme writes --bcc-*
  // to .bcc-shell (not :root), so the shell has to be in the DOM or the first
  // theme apply would land on the wrong element. Expose reloadChat on the
  // bettercc API here too — v3 owns its own (the old path's was inside the
  // deleted doColorStuff).
  (unsafeWindow.bettercc as any).reloadChat = reloadChat;
  (unsafeWindow.bettercc as any).state = snapshot;
  buildShell();

  // Apply the saved theme (tier-0 per spec §5.3): the store is seeded at
  // initStore(), so initTheme() reads color + scheme_v2 synchronously,
  // selects the generator, generates, and applies. No promise, no cache.
  // ws-hook re-applies via its own applyCurrentScheme import; the setTheme
  // exposure is public-API only.
  initTheme();
  (unsafeWindow.bettercc as any).setTheme = applyCurrentScheme;

  // Attach the WS hook so iframe.css + theme mirror + autoscroll banner inject
  // on the first message (spec §3.3). The hook only attaches listeners to
  // chatout_ws — it doesn't touch the iframe until a message arrives — so it's
  // safe to call after buildShell moved #chatframe.
  hookChatoutConnect();

  // Mount the userlist sidebar — reacts to the userlist/globalUserlist store
  // keys with diff-and-patch rendering (reuses DOM nodes, never innerHTML).
  // Must be after buildShell() so .bcc-sidebar exists.
  mountSidebar();

  // v3 owns the ulist poll: fetch ulist directly, parse, write the
  // "userlist" store key. /j (channel change) triggers an immediate refresh
  // via refreshUlistNow(); auth-dead stops the poll. info_timer1 (upstream's
  // 20s get_info timer) is cleared — v3's poll replaces it.
  // Must be AFTER mountSidebar so the sidebar is subscribed before the
  // first "userlist" event fires.
  startUlistPoll();
  neuterGetInfo();
  {
    let lastChannel = getSession().channel;
    on("session", (s) => {
      if (s.authDead) {
        stopUlistPoll();
      } else if (s.channel !== lastChannel) {
        lastChannel = s.channel;
        refreshUlistNow();
      }
    });
  }
  // Expose refreshUlistNow on the bettercc API so the dev panel's user
  // controls (and future callers) can trigger an immediate refresh.
  (unsafeWindow.bettercc as any).refreshUlistNow = refreshUlistNow;

  // Start the global userlist poll (aw.js, cadence from cadences.ts). Must be
  // AFTER mountSidebar so the sidebar is subscribed before the first
  // "globalUserlist" event fires.
  // Stop polling when the session is dead — no point fetching aw.js.
  startPolling();
  on("session", (s) => {
    if (s.authDead) stopPolling();
  });

  // Mount the stats bar (Freunde Online / Anfragen / Nachrichten badges) at the
  // TOP of the sidebar, above the online-count heading. Polled from
  // chat_info_friends_nc.html via the upstream ajax class's onComplete. After
  // mountSidebar so the sidebar element exists (mountStatsBar prepends to it).
  mountStatsBar(document.querySelector(".bcc-sidebar") as HTMLElement);

  // Mount the input area — textarea, send contract (reuses hold form's
  // onsubmit handler via the patched-handler approach), superwhisper,
  // and BetterCC command dispatch (/sw /open /reload /help).
  // send_on_enter is read from the store (seeded at initStore above).
  mountInput();

  // Mount the footer — pills (reload, autoscroll, help, settings stub, exit),
  // Font Awesome CDN, online count, and chatout_setstatus → reload button color.
  mountFooter();

  // Critical surfaces react to conn; needs the shell DOM.
  mountHealthUi();
  mountHealthStrip(reloadChat);
  initSetStatusWrap();
}
