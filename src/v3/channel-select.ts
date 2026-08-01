// ─── v3 channel selector — header <select> from upstream ccc/ccg ───────────
//
// Replaces the static channel <span> label in the header with a dropdown that
// lists all channels (grouped via <optgroup>) and switches the active channel
// via the upstream com_set('/j '+channel) mechanism — the SAME entry point the
// old inline <select id="CHN"> used. We do NOT reimplement the upstream inline
// age-gate (dead code in the fixture; the live server enforces restrictions
// server-side). Per AGENTS.md: "mock at the boundary, don't reimplement upstream
// logic."
//
// Data shape (dev/fixture/.../corder_kylr.js):
//   ccg = [id, label, id, label, ...]            // group id → human label
//   ccc = [name, flag, groupId, icon, ...]       // flat 4-tuples, stride 4
//
// Only the pure parser (parseChannels) is unit-tested; the DOM builder is
// verified via the dev-server smoke (consistent with sidebar.ts / shell.ts).

import { subscribe } from "./store";
import { cclog } from "../utils";

/** One channel group, with its upstream id, label, and member channels. */
export interface ChannelGroup {
  id: number;
  label: string;
  channels: string[];
}

/**
 * Parse the upstream flat arrays into grouped channels.
 *
 * Pure + tolerant: returns [] when either argument is missing, skips tuples
 * whose name isn't a non-empty string, and ignores a trailing partial tuple
 * (length not a multiple of 4). Groups appear in ccg order; a group with no
 * channels still emits (empty channel list) so the dropdown structure mirrors
 * ccg exactly.
 */
export function parseChannels(ccc: unknown, ccg: unknown): ChannelGroup[] {
  if (!Array.isArray(ccg) || !Array.isArray(ccc)) return [];

  // ccg: [id, label, ...] pairs → group index by id.
  const groups: ChannelGroup[] = [];
  const byId = new Map<number, number>(); // groupId → index into groups
  for (let i = 0; i + 1 < ccg.length; i += 2) {
    const id = Number(ccg[i]);
    const label = String(ccg[i + 1] ?? "");
    if (!Number.isFinite(id)) continue;
    byId.set(id, groups.length);
    groups.push({ id, label, channels: [] });
  }

  // ccc: [name, flag, groupId, icon] 4-tuples, stride 4. Guard the tail so a
  // stray partial tuple can't be misread.
  for (let i = 0; i + 3 < ccc.length; i += 4) {
    const name = ccc[i];
    const groupId = Number(ccc[i + 2]);
    if (typeof name !== "string" || name.length === 0) continue; // skip non/empty names
    const idx = byId.get(groupId);
    if (idx === undefined) continue; // channel with no matching group — drop
    groups[idx].channels.push(name);
  }

  return groups;
}

/**
 * Build the header channel <select>. Reads unsafeWindow.ccc/ccg for the options,
 * pre-selects the active channel (unsafeWindow.chat_channel), joins on change
 * via com_set, and stays in sync with /j-driven channel changes via the session
 * store subscription (same pattern as the old buildChannelLabel).
 *
 * Defensive: if ccc/ccg are absent at build time (load-order edge case), falls
 * back to a read-only label showing chat_channel so the header never breaks.
 */
export function buildChannelSelect(): HTMLElement {
  const ccc = (unsafeWindow as any).ccc;
  const ccg = (unsafeWindow as any).ccg;
  const groups = parseChannels(ccc, ccg);
  const active = String((unsafeWindow as any).chat_channel ?? "");

  // Fallback: no channel data → read-only label (mirrors the old label UX).
  if (groups.length === 0) {
    cclog("buildChannelSelect: ccc/ccg absent — falling back to static label", "v3");
    const span = document.createElement("span");
    span.className = "bcc-channel";
    span.textContent = active || "Chatcity";
    span.title = "Channel";
    return span;
  }

  const select = document.createElement("select");
  select.className = "bcc-channel-select";
  select.title = "Channel wechseln";
  select.setAttribute("aria-label", "Channel wechseln");

  for (const group of groups) {
    const optgroup = document.createElement("optgroup");
    optgroup.label = group.label;
    for (const name of group.channels) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      if (name.toLowerCase() === active.toLowerCase()) option.selected = true;
      optgroup.appendChild(option);
    }
    select.appendChild(optgroup);
  }

  // onChange → join the channel via the upstream entry point (same as old CHN).
  // If com_set is missing, log + no-op rather than throw.
  select.addEventListener("change", () => {
    const comSet = (unsafeWindow as any).com_set;
    if (typeof comSet !== "function") {
      cclog("buildChannelSelect: com_set unavailable — channel switch dropped", "v3");
      return;
    }
    comSet("/j " + select.value);
  });

  // Stay in sync: when a /j command changes chat_channel (session module emits),
  // update the select's value so it reflects the active channel.
  subscribe((e) => {
    if (e.type === "session" && e.session.channel) {
      const lower = e.session.channel.toLowerCase();
      for (const opt of Array.from(select.options)) {
        if (opt.value.toLowerCase() === lower) {
          if (!opt.selected) opt.selected = true;
          return;
        }
      }
    }
  });

  return select;
}
