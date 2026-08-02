// ─── BetterCC entry point ───
//
// v3-only init. The pre-v3 (v2) parent-page rewrite — ui.ts, theme.ts,
// commands.ts, superban.ts, main.css — has been removed; v3 is the single
// code path. The old code is preserved on the `modernize` branch if ever
// needed. See docs/redesign-spec.md and tasks/plan.md for the v3 design.
//
// What remains load-bearing from the pre-v3 shared layer:
//   - utils.ts (cclog, getUserKey, setUserStore, printHelp, iframe helpers)
//   - ws-hook.ts (chatout_connect hook + injectIntoChatframe — reused as-is)
//   - chat.ts (autoscroll banner — used by ws-hook)
//   - scheme.ts (pure color-scheme engine — used by v3/theme)

import { cclog, setUserStore } from "./utils";
import { initV3 } from "./init";

(function () {
  "use strict";

  cclog("Version: " + GM_info.script.version + " - " + window.location.href);

  // ─── window functions ───
  unsafeWindow.bettercc = {} as any;

  // ─── MAIN CHAT ───
  if (/cpop.html/.test(window.location.href)) {
    window.onunload = null;
    window.onbeforeunload = null;

    let gast = unsafeWindow.chat_ui === "h" ? 1 : 0;
    setUserStore(unsafeWindow.chat_nick, !!gast);

    initV3();
  } // MAIN CHAT
})();
