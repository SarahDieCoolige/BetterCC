// ─── v3 userlist sidebar — diff-and-patch rendering (spec §4.3 / T7) ────────
//
// Subscribes to the store's "userlist" events and renders the sidebar with
// diff-and-patch: added users get new DOM nodes, removed users are dropped
// (their rows are GC'd), unchanged users keep their existing rows — just moved
// to their new sorted position and status classes updated. No innerHTML
// rebuilds: scroll position is preserved across updates.
//
// Two sections: pinned (top) and regular, separated by a .bcc-userlist-divider.
// Status indicators: [S] for sep, [A] for away, with opacity ported from
// main.css (u_away / u_sep: opacity 0.5; u_sep: font-style italic).
//
// Cross-channel pinned users (spec §Sidebar Behavior / §Merge rules): also
// subscribes to "globalUserlist" events (the aw.js snapshot polled by
// global-userlist.ts). Pinned users in OTHER channels are merged into the
// pinned section with a channel-abbreviation badge (.bcc-channel-badge).
// cha_my always wins for the current channel — aw.js data for users already
// present in the current userlist is discarded (key-based exclusion, so the
// two sources never conflict). Online count shows "N/M online" once the global
// snapshot exists: N = current-channel users, M = all users across all
// channels.

import { subscribe, type BccEvent, type User } from "./bus";
import { sortUsers, channelAbbrev } from "./userlist";
import { openUserPopup } from "./popup";
import { cclog } from "./utils";
import { buildChannelSelect } from "./channel-select";
import { iconElement } from "./dom";
import { get, set, react } from "./store";

// ─── Pure helpers (exported for testing) ────────────────────────────────────

export function getStatusClasses(user: User): string {
  const classes = ["bcc-userrow"];
  if (user.sep) classes.push("bcc-sep");
  return classes.join(" ");
}

// ─── Merge: current channel + pinned cross-channel users (spec §Merge rules) ─

/** A sidebar row's source: user + the channel they are in (null = current
 *  channel, from cha_my). Cross-channel users carry their aw.js channel. */
export interface MergedUser {
  user: User;
  channel: string | null;
}

/**
 * Merge the two userlist sources into the displayed set. cha_my (current
 * channel) ALWAYS wins: every current-channel user is included with
 * channel: null, and aw.js data for users already present in the current
 * userlist is discarded (key-based exclusion). Pinned users from the global
 * snapshot are added ONLY when NOT already present in the current channel —
 * each with their aw.js channel for the badge. Unpinned cross-channel users
 * are not displayed here (they only show in their own channel's sidebar).
 */
export function mergeUserlists(
  current: User[],
  globalChannels: Map<string, User[]>,
  pinned: Set<string>,
): MergedUser[] {
  const merged: MergedUser[] = current.map((u) => ({ user: u, channel: null }));
  const present = new Set(current.map((u) => u.key));
  for (const [channel, users] of globalChannels) {
    for (const user of users) {
      if (pinned.has(user.key) && !present.has(user.key)) {
        merged.push({ user, channel });
        present.add(user.key); // first channel wins on a (theoretical) duplicate
      }
    }
  }
  return merged;
}

/**
 * Collision-aware badge text per channel (spec §abbreviation). Channels whose
 * base abbreviation collides (e.g. "Herzklopfen" + "Herzschmerz" both → "Her")
 * get an incrementing index passed to channelAbbrev, extending the second by
 * one char ("Herz"). Indices are assigned in sorted channel order so the
 * badges are stable across renders. Channels are deduped (a user can only be
 * in one channel per snapshot, but the defensive set costs nothing).
 */
export function abbrevChannels(channels: string[]): Map<string, string> {
  const used = new Map<string, number>();
  const badges = new Map<string, string>();
  for (const channel of [...new Set(channels)].sort()) {
    const base = channelAbbrev(channel, 0);
    const index = used.get(base) ?? 0;
    used.set(base, index + 1);
    badges.set(channel, channelAbbrev(channel, index));
  }
  return badges;
}

/** Apply a user's state to an existing row's child elements (name span,
 *  channel badge, tags). Use after buildRow or to patch an in-place change —
 *  the badge is rebuilt every refresh so a user moving into the current
 *  channel loses their cross-channel badge. */
function applyUserState(row: HTMLLIElement, merged: MergedUser, badges: Map<string, string>): void {
  const user = merged.user;
  row.className = getStatusClasses(user);
  row.classList.toggle("bcc-name-away", user.away || user.sep);
  const nameSpan = row.querySelector(".bcc-userrow-name");
  if (nameSpan) {
    nameSpan.textContent = user.name;
  }
  // Channel badge — cross-channel users only. Patched in place via a
  // data-bcc-badge marker so we don't remove/recreate it on every render;
  // only the text changes when the channel abbreviation map updates.
  const oldBadge = row.querySelector(".bcc-user-tag[data-bcc-badge]") as HTMLElement | null;
  if (merged.channel) {
    const text = badges.get(merged.channel) ?? channelAbbrev(merged.channel, 0);
    if (oldBadge) {
      if (oldBadge.textContent !== text) oldBadge.textContent = text;
    } else {
      const badge = document.createElement("span");
      badge.className = "bcc-user-tag";
      badge.dataset.bccBadge = "1";
      badge.textContent = text;
      row.insertBefore(badge, nameSpan ? nameSpan.nextSibling : row.firstChild);
    }
  } else if (oldBadge) {
    oldBadge.remove();
  }
  // Status tags — removed and rebuilt each render (cheap DOM: 0-2 tags).
  row.querySelectorAll(".bcc-user-tag:not([data-bcc-badge])").forEach((t) => t.remove());
  if (user.away) {
    const tag = document.createElement("span");
    tag.className = "bcc-user-tag";
    tag.textContent = "[A]";
    row.appendChild(tag);
  }
  if (user.sep) {
    const tag = document.createElement("span");
    tag.className = "bcc-user-tag";
    tag.textContent = "[S]";
    row.appendChild(tag);
  }
}

function buildRow(merged: MergedUser, badges: Map<string, string>): HTMLLIElement {
  const user = merged.user;
  const li = document.createElement("li");
  li.dataset.name = user.name;
  // tabindex + role so the list is keyboard-navigable (spec §4.5 / R4).
  li.tabIndex = 0;
  li.setAttribute("role", "button");
  li.setAttribute("aria-label", "Aktionen für " + user.name);
  // Name — away/sep dim the name (bcc-name-away) via opacity on the NAME span
  // (not the whole row), so away+sep shows a dimmed name + both [A] and [S] tags.
  const nameSpan = document.createElement("span");
  nameSpan.className = "bcc-userrow-name";
  li.appendChild(nameSpan);
  // Apply user state to the row (classes, name text, channel badge, tags).
  // Status tags ([A]/[S]) are created here, not in buildRow — applyUserState
  // handles them conditionally so cross-channel users (never away/sep) skip
  // the create-then-remove choreography.
  applyUserState(li, merged, badges);
  // Open the popup on click OR Enter/Space (R1: discoverable; was silent log).
  // stopPropagation on click so the opening event doesn't bubble to the
  // popup's document-level outside-click listener (which would close the
  // popup immediately and, on the 2nd open, leave a dangling listener that
  // swallows the next click — the "click twice then stuck" bug).
  const open = (e?: Event) => {
    e?.stopPropagation();
    handleRowClick(user, li);
  };
  li.addEventListener("click", open);
  li.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      handleRowClick(user, li);
    }
  });
  return li;
}

// ─── Pin toggle ─────────────────────────────────────────────────────────────

let pinnedCache: Set<string> = new Set();

async function togglePin(user: User): Promise<void> {
  const list = [...(get("pinned") as string[])];
  const idx = list.indexOf(user.key);
  if (idx === -1) {
    list.push(user.key);
  } else {
    list.splice(idx, 1);
  }
  await set("pinned", list);
}

function handleRowClick(user: User, anchor: HTMLElement): void {
  openUserPopup(anchor, user, pinnedCache.has(user.key), (u) => {
    togglePin(u).catch(() => {
      cclog("pin toggle failed for " + u.name, "v3");
    });
  });
}

// ─── Rendering ──────────────────────────────────────────────────────────────
//
// True diff-and-patch (spec §2.4 / review C3). The two <ul> containers and the
// divider are created ONCE at mount and never wiped. Each event (userlist or
// globalUserlist) recomputes the merged list and re-renders: rows whose user
// is no longer in the merged list are dropped, new users get new rows, and the
// rest are re-inserted in sorted order into their section. Unchanged rows
// keep their <li> node (event listeners and state survive); only their status
// classes/text/badge get refreshed. Scroll position is preserved because the
// container is never rebuilt.

let lastChannelUsers: User[] | null = null; // last "userlist" event (cha_my)
let lastGlobalChannels: Map<string, User[]> | null = null; // last "globalUserlist" event
let globalTotal = 0; // cached sum over lastGlobalChannels — updated once per event
const NO_GLOBAL: Map<string, User[]> = new Map(); // read-only fallback, never mutated
let rowMap: Map<string, HTMLLIElement> = new Map();
let pinnedUl: HTMLUListElement | null = null;
let regularUl: HTMLUListElement | null = null;
let scrollContainer: HTMLElement | null = null; // wraps the regular UL (scrolls)
let onlineCount: HTMLElement | null = null;

/** Create the stable section containers (once). Idempotent. */
function ensureContainers(sidebar: HTMLElement): void {
  if (pinnedUl && pinnedUl.isConnected) return;
  sidebar.innerHTML = "";

  // ── Sidebar DOM plan ──
  // The sidebar has two kinds of children:
  //   chrome  — .bcc-stats (prepended later by mountStatsBar), .bcc-sidebar-header
  //             (toggle), .bcc-online-row (online count + channel select).
  //             These stay VISIBLE in both expanded and collapsed states; CSS
  //             just reorients them (horizontal row ↔ vertical stack).
  //   lists   — .bcc-sidebar-content (pinned + regular userlist). This fades
  //             out on collapse (visibility:hidden preserves the rows' rects so
  //             an open user popup keeps a valid anchor).
  // The collapsed column reads top→bottom: toggle, stats icons (vertical),
  // online count, channel select — a purpose-built mini-panel, not a bare toggle.

  // ── Toggle button (direct child of sidebar, positioned next to stats) ──
  // Expanded: sits at the top-right of the sidebar, absolutely positioned
  // alongside the stats bar (which stays centered independently). Collapsed:
  // normal flow, first in the vertical stack via order:-1.
  const toggle = document.createElement("button");
  toggle.className = "bcc-sidebar-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Userlist ein-/ausklappen");
  toggle.title = "Userlist ein-/ausklappen";
  toggle.appendChild(iconElement("fa-chevron-right"));
  toggle.appendChild(iconElement("fa-chevron-left"));
  toggle.addEventListener("click", (e: MouseEvent) => {
    e.stopPropagation();
    sidebar.classList.toggle("bcc-collapsed");
    const collapsed = sidebar.classList.contains("bcc-collapsed");
    toggle.setAttribute("aria-expanded", String(!collapsed));
    window.dispatchEvent(new Event("resize"));
  });
  sidebar.appendChild(toggle);

  // ── Online count + channel select (chrome — stays visible when collapsed) ──
  // Expanded: a horizontal row (count left, select right). Collapsed: CSS
  // stacks them vertically (count, then select) below the stats icons.
  const onlineRow = document.createElement("div");
  onlineRow.className = "bcc-online-row";
  onlineCount = document.createElement("div");
  onlineCount.className = "bcc-online-count";
  onlineCount.setAttribute("role", "status");
  onlineCount.setAttribute("aria-live", "polite");
  onlineCount.innerHTML = '<span class="bcc-online-num">0</span> online';
  onlineRow.appendChild(onlineCount);

  // Channel select — invisible native <select> overlaid with a styled button.
  // Same technique as the color picker (.bcc-color-input): the native control
  // sits on top (opacity:0, absolute, full size) and receives clicks; a visible
  // face element below it provides the styling. On change, the face's text is
  // synced to the selected option.
  const channelWrap = document.createElement("label");
  channelWrap.className = "bcc-channel-select-wrap";
  const channelSelect = buildChannelSelect() as HTMLSelectElement;
  channelSelect.className = (channelSelect.className || "") + " bcc-channel-select-native";
  // The native select already has a change listener (sends /j via sendCommand).
  // We add another to sync the visible face.
  const channelFace = document.createElement("span");
  channelFace.className = "bcc-channel-select-face";
  channelFace.textContent = channelSelect.value || channelSelect.options[0]?.textContent || "";
  channelSelect.addEventListener("change", () => {
    channelFace.textContent = channelSelect.value || "";
  });
  // The native select updates via a store subscription (not a change event) when
  // the channel is switched via /j. Sync the face here too.
  subscribe((e) => {
    if (e.type === "session" && e.session.channel && channelFace.isConnected) {
      channelFace.textContent = e.session.channel;
    }
  });
  channelWrap.appendChild(channelFace);
  channelWrap.appendChild(channelSelect);
  onlineRow.appendChild(channelWrap);

  sidebar.appendChild(onlineRow);

  // ── Content (the userlists — fades out on collapse) ──
  const content = document.createElement("div");
  content.className = "bcc-sidebar-content";
  pinnedUl = document.createElement("ul");
  pinnedUl.className = "bcc-userlist-pinned";
  pinnedUl.setAttribute("role", "list");
  regularUl = document.createElement("ul");
  regularUl.className = "bcc-userlist-regular";
  regularUl.setAttribute("role", "list");
  scrollContainer = document.createElement("div");
  scrollContainer.className = "bcc-userlist-scroll";
  scrollContainer.appendChild(regularUl);
  content.append(pinnedUl, scrollContainer);
  sidebar.appendChild(content);

  // Default-collapse below 600px (the old <600px hide behavior, now a mini-panel
  // instead of fully removed). User can expand at any width. No persistence.
  if (window.innerWidth < 600) sidebar.classList.add("bcc-collapsed");
  const collapsed = sidebar.classList.contains("bcc-collapsed");
  toggle.setAttribute("aria-expanded", String(!collapsed));
}

function refreshSectionVisibility(): void {
  const hasPinned = pinnedUl ? pinnedUl.children.length > 0 : false;
  if (pinnedUl) pinnedUl.style.display = hasPinned ? "" : "none";
}

function renderSidebar(merged: MergedUser[]): void {
  const sidebar = document.querySelector(".bcc-sidebar");
  if (!sidebar || !pinnedUl || !regularUl) return;

  // 1) Drop rows whose user is no longer in the merged list — a current-
  //    channel user leaving OR a cross-channel pinned user going offline
  //    anywhere. rowMap is keyed by name; names are unique across channels
  //    (a cross-channel pinned user is never in cha_my), so one pass
  //    reconciles both event sources (their <li>s are GC'd).
  const liveNames = new Set(merged.map((m) => m.user.name));
  for (const [name, row] of rowMap) {
    if (!liveNames.has(name)) {
      row.remove();
      rowMap.delete(name);
    }
  }

  // 2) Sort once (pinned-first, German collation), then place every (possibly
  //    reused) row in sorted order within its section. appendChild on an
  //    existing node MOVES it (preserving listeners), so this re-orders
  //    without rebuilding. Cross-channel users ride along on sortUsers — they
  //    have the same User shape; their channel is looked up by key for the
  //    badge map.
  const scrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
  const byKey = new Map(merged.map((m) => [m.user.key, m]));
  const sorted = sortUsers(
    merged.map((m) => m.user),
    pinnedCache,
  ).map((u) => byKey.get(u.key)!);
  const badges = abbrevChannels(
    sorted.filter((m) => m.channel !== null).map((m) => m.channel as string),
  );

  for (const m of sorted) {
    const isPinned = pinnedCache.has(m.user.key);
    const target = isPinned ? pinnedUl : regularUl;

    let row = rowMap.get(m.user.name);
    if (row) {
      // Unchanged user — refresh status in place (a status flip like
      // away↔present is NOT an add/remove; it reuses the node).
      applyUserState(row, m, badges);
    } else {
      row = buildRow(m, badges);
      rowMap.set(m.user.name, row);
    }
    // Always (re)place in sorted order. appendChild MOVES an existing node
    // (preserving listeners) — iterating sorted and appending each yields the
    // correct order even when adds/removes shift a row's position within its
    // section. Skipping this for rows "already in the right section" was an
    // optimization that left rows in stale order after the sorted order
    // changed (e.g. a new user "Alice" sorted to the front was appended to
    // the end instead). The DOM move is O(1); always placing is cheap.
    target.appendChild(row);
  }

  // 3) Preserve scroll — we patched, not rebuilt, so the offset is stable.
  //    Clamp in case the list shrank past the current offset.
  if (scrollContainer)
    scrollContainer.scrollTop = Math.min(scrollTop, scrollContainer.scrollHeight);
  refreshSectionVisibility();
  updateOnlineCount();
}

/** "N/M online" — N = current-channel users (cha_my), M = all users across all
 *  channels in the last global snapshot (cached when the event arrives, so
 *  this is O(1)). Before the first "globalUserlist" event M is unknown, so
 *  the simple "N online" form is kept. */
function updateOnlineCount(): void {
  if (!onlineCount) return;
  const n = lastChannelUsers ? lastChannelUsers.length : 0;
  // Wrap the number in a span so collapsed mode can show only the numeric part
  // via CSS (hiding the "online" word, bumping font-size on the span).
  onlineCount.innerHTML =
    globalTotal > 0
      ? '<span class="bcc-online-num">' + n + "/" + globalTotal + "</span> online"
      : '<span class="bcc-online-num">' + n + "</span> online";
}

/** Recompute the merged list from the last known sources and re-render. Called
 *  after either store event and after pin toggles. */
function renderFromState(): void {
  const merged = mergeUserlists(
    lastChannelUsers ?? [],
    lastGlobalChannels ?? NO_GLOBAL,
    pinnedCache,
  );
  renderSidebar(merged);
}

// ─── Mount ──────────────────────────────────────────────────────────────────

export function mountSidebar(): void {
  const sidebar = document.querySelector(".bcc-sidebar");
  if (!sidebar) return;

  ensureContainers(sidebar as HTMLElement);

  react("pinned", (list: string[]) => {
    pinnedCache = new Set(list);
    renderFromState();
  });

  subscribe((e: BccEvent) => {
    if (e.type === "userlist") {
      // cha_my snapshot — the authoritative source for the current channel.
      lastChannelUsers = e.users;
      renderFromState();
    } else if (e.type === "globalUserlist") {
      // Full aw.js snapshot — source for cross-channel pinned users.
      lastGlobalChannels = e.channels;
      // Cache the global total once per event rather than summing on every
      // render (O(channels) → O(1)).
      let total = 0;
      for (const users of e.channels.values()) total += users.length;
      globalTotal = total;
      renderFromState();
    }
  });

  cclog("sidebar mounted — subscribed to userlist + globalUserlist events", "v3");
}
