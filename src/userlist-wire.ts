// ─── v3 set_uinfo1 override — feeds the store, not the #ul table (spec §2.4) ─
//
// Upstream calls set_uinfo1() on every ulist poll (~20s) and at startup. The
// old betterUserList() (deleted with ui.ts) overrode this to inject pinned
// users. v3 overrides it to parse + diff + emit a "userlist" store event — the
// sidebar subscribes and renders from the store, and the #ul/#uinfo table
// stays hidden.
//
// This module does NOT call the upstream set_uinfo1; the hidden userlist table
// is never updated. The sidebar replaces it.

import { parseUserlist, diffUserlists } from "./userlist";
import { emit, type User } from "./store";
import { cclog } from "./utils";
import { getChaMy } from "./upstream";

let prevList: User[] = [];

/**
 * Pure core (tested): parse the flat cha_my array and diff against the
 * previous snapshot, returning everything the store event needs.
 */
export function processUserlist(chaMy: string[], prev: User[]) {
  const newList = parseUserlist(chaMy);
  const { added, removed } = diffUserlists(prev, newList);
  return { newList, added, removed };
}

/**
 * Override the upstream set_uinfo1 so userlist polls feed the store instead of
 * writing to the hidden #ul / #uinfo. Does NOT fire immediately — the existing
 * setTimeout (dev mock, 20ms) or __dev__.setUsers() triggers the first event
 * after mountSidebar has subscribed.
 */
export function overrideSetUinfo1(): void {
  (unsafeWindow as any).set_uinfo1 = function () {
    const chaMy: string[] = getChaMy();
    const { newList, added, removed } = processUserlist(chaMy, prevList);
    prevList = newList;
    emit({ type: "userlist", users: newList, added, removed });
  };
  cclog("set_uinfo1 overridden — userlist events now feed the store", "v3");
  // Replay the current cha_my now. The mock pre-schedules a set_uinfo1 call
  // (globals.mjs:60) with a 20ms timer that can fire BEFORE this override is
  // installed — in which case the initial userlist data hits the original mock
  // handler and the sidebar never sees it. Replaying here unconditionally
  // fires the override, so the sidebar is seeded regardless of whether the
  // timer or this call wins. NB: this makes the mock's 20ms timer redundant
  // for seeding — both go through the override now, and prevList diffing
  // turns the second fire into a no-op for the sidebar.
  const chaMy: string[] = getChaMy();
  if (chaMy.length > 0) (unsafeWindow as any).set_uinfo1();
}
