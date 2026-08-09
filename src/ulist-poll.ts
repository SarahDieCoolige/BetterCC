// ─── v3-owned ulist poll — replaces get_info()'s loadjscssfile dance (migration Phase 1) ─
//
// The current-channel userlist arrives via cc_chat/ulist?AKTION=j, which upstream
// delivers by injecting a <script> that sets cha_my[] and calls set_uinfo1(). v3
// owns the fetch directly now — same endpoint, same data, parsed in-process and
// emitted as a "userlist" store event. Mirrors stats.ts and global-userlist.ts.
//
// The set_uinfo1 override (formerly userlist-wire.ts) is gone — this module is
// the sole driver of the current-channel userlist. processUserlist() moved here
// from userlist-wire.ts. refreshUlistNow() is the public trigger seam: Phase 1
// wires it to the /j channel-change event; future triggers (Phase 2's WS
// classifier, etc.) import and call it without the poll module knowing.

/**
 * Extract the cha_my array from the ulist response by evaluating just the
 * `var cha_my = new Array(...)` declaration in a Function sandbox. The trailing
 * set_uinfo1() call in the response is excluded from the function body, so it
 * cannot execute as a side effect — we parse the data without running the
 * page's delivery script.
 *
 * Pure and unit-testable: string in, array out. Returns [] on malformed input
 * (missing declaration or eval failure) so a transient bad response doesn't
 * blank the sidebar — the store keeps the last good snapshot.
 */
export function parseUlistResponse(text: string): string[] {
  const decl = text.match(/var\s+cha_my\s*=\s*new\s+Array\([\s\S]*?\)\s*;/);
  if (!decl) return [];
  try {
    const fn = new Function(`${decl[0]} return cha_my;`) as () => string[];
    return fn();
  } catch {
    return [];
  }
}
