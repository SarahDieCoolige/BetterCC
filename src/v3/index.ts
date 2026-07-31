// ─── v3 entry (iteration 1: parent-page rewrite) ─────────────────────────
//
// This module is the parallel v3 init path. It runs INSTEAD of the old init
// in src/index.ts when the v3 feature flag is on (see ./flag.ts).
//
// Iteration 1 scope: parent-page UI only. The chat iframe and WebSocket
// message handling stay upstream-owned (rebuilt in later iterations).
//
// CONTRACT (spec §5 / tasks/plan.md A5):
//   - Import only from ../utils (shared helpers) and ./v3/* — NEVER from the
//     old ui.ts/theme.ts/commands.ts/superban.ts. That isolation is what lets
//     the old code be deleted once v3 is verified.
//   - Keep the iframe + WS pipeline untouched.

import { cclog } from "../utils";
import { buildShell, reloadChat } from "./shell";

/**
 * Initialize the v3 parent-page UI.
 *
 * Called from src/index.ts after the same userStore setup the old path uses,
 * so both paths share the GM-storage key namespace via getUserKey().
 */
export function initV3(): void {
  cclog("v3 init (parent-page rewrite, iteration 1)");

  // T6: build the Grid shell (moves #chatframe, hides the table, adds header).
  // Expose reloadChat on the bettercc API — the old path's reloadChat (defined
  // inside doColorStuff) never runs under v3, so v3 owns its own.
  (unsafeWindow.bettercc as any).reloadChat = reloadChat;
  buildShell();

  // TODO(T7): userlist sidebar (diff-and-patch).
  // TODO(T8): better input + send contract + superwhisper/commands.
  // TODO(T9): footer pills.
}
