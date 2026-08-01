// ─── v3 entry (iteration 1: parent-page rewrite) ─────────────────────────
//
// This module is the parallel v3 init path. It runs INSTEAD of the old init
// in src/index.ts when the v3 feature flag is on (see ./flag.ts).
//
// Iteration 1 scope: parent-page UI only. The chat iframe and WebSocket
// message handling stay upstream-owned (rebuilt in later iterations).
//
// CONTRACT (spec §5.1):
//   - Import only from ../utils, ../ws-hook, and ./v3/* — NEVER from the old
//     ui.ts/theme.ts/commands.ts/superban.ts. Those four are the "frozen behind
//     the flag, then deleted" set; v3 must not couple to them or they can't be
//     removed once v3 is verified. ws-hook.ts is in a DIFFERENT bucket —
//     "untouched in iter 1, reused" (spec §3.3 requires its injectIntoChatframe
//     to keep running under v3) — so importing it is correct.
//   - Keep the iframe + WS pipeline untouched.
//
// The early return in src/index.ts means v3 must re-wire the pieces of the old
// init that are load-bearing AND in the reusable bucket:
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
//   - loadTheme() — apply the saved color scheme to :root (tier-0, spec §5.3).
//     The old path did this inside doColorStuff (deletable bucket); v3 calls
//     the pure theme bridge (./theme, T3) instead. A v3 setTheme is exposed so
//     ws-hook.ts's injectIntoChatframe re-applies the --bcc-* scheme (not the
//     old --chatX engine) on reconnect.

  import { cclog, getUserKey } from "../utils";
import { hookChatoutConnect } from "../ws-hook";
import { buildShell, reloadChat } from "./shell";
import { loadTheme, applyScheme } from "./theme";
import type { BccColorScheme } from "../scheme";
import { overrideSetUinfo1 } from "./userlist-wire";
import { mountSidebar } from "./sidebar";
import { initSession } from "./session";
import { mountInput } from "./input";
import { mountFooter } from "./footer";

/**
 * Neuter the upstream resize_fix path. The old cleanup() (ui.ts) did this plus
 * table-DOM surgery; only this subset is load-bearing under v3 (the rest is
 * either cosmetic or targets the hidden table). Inlined here — not imported —
 * because ui.ts is in the "frozen then deleted" bucket (spec §5.1).
 */
function neuterResizeFix(): void {
  (unsafeWindow as any).resize_fix = function resize_fix(): boolean {
    return true;
  };
  clearTimeout((unsafeWindow as any).size_timeout);
  clearInterval((unsafeWindow as any).size_interval);
}

/**
 * Initialize the v3 parent-page UI.
 *
 * Called from src/index.ts after the same userStore setup the old path uses,
 * so both paths share the GM-storage key namespace via getUserKey().
 */
export function initV3(): void {
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

  // Apply the saved theme (tier-0 per spec §5.3): read color_{user}, regenerate
  // or reuse the cached scheme, write --bcc-* to :root. The old path did this
  // inside doColorStuff (skipped under v3); v3 calls the pure theme bridge T3
  // built. Also expose a v3 setTheme so injectIntoChatframe's call to
  // bettercc.setTheme() (ws-hook.ts) re-applies the --bcc-* scheme under v3
  // instead of the old --chatX engine.
  //
  // O4: hold the *promise*, not the resolved scheme, so a setTheme() call that
  // races the initial load (e.g. a fast WS reconnect firing
  // injectIntoChatframe → bettercc.setTheme before loadTheme resolves) awaits
  // the pending scheme instead of silently no-op'ing on a null ref.
  const schemePromise = loadTheme(getUserKey("color"), getUserKey("colorscheme"));
  (unsafeWindow.bettercc as any).setTheme = function setTheme(): void {
    schemePromise.then((scheme: BccColorScheme) => applyScheme(scheme));
  };

  // Intercept the upstream set_uinfo1 BEFORE buildShell so the hook is
  // in place before the dev mock's 20ms setTimeout fires. Userlist polls
  // now emit "userlist" store events instead of writing to the hidden #ul.
  overrideSetUinfo1();

  // Build the Grid shell (moves #chatframe, hides the table, adds header).
  // Expose reloadChat on the bettercc API — the old path's reloadChat (defined
  // inside doColorStuff) never runs under v3, so v3 owns its own.
  (unsafeWindow.bettercc as any).reloadChat = reloadChat;
  buildShell();

  // Attach the WS hook so iframe.css + theme mirror + autoscroll banner inject
  // on the first message (spec §3.3). The hook only attaches listeners to
  // chatout_ws — it doesn't touch the iframe until a message arrives — so it's
  // safe to call after buildShell moved #chatframe.
  hookChatoutConnect();

  // Mount the userlist sidebar — subscribes to "userlist" store events and
  // does diff-and-patch rendering (reuses DOM nodes, never innerHTML).
  // Must be after buildShell() so .bcc-sidebar exists.
  mountSidebar();

  // Mount the input area — textarea, send contract (reuses hold form's
  // onsubmit handler via the patched-handler approach), superwhisper,
  // and BetterCC command dispatch (/sw /open /reload /help).
  mountInput();

  // Mount the footer — pills (reload, autoscroll, help, settings stub, exit),
  // Font Awesome CDN, online count, and chatout_setstatus → reload button color.
  mountFooter();
}
