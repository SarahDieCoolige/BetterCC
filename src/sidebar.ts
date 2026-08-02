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

import { subscribe, type BccEvent, type User } from "./store";
import { sortUsers } from "./userlist";
import { getConfig, setConfig } from "./config";
import { openUserPopup } from "./popup";
import { cclog } from "./utils";
import { buildChannelSelect } from "./channel-select";

// ─── Pure helpers (exported for testing) ────────────────────────────────────

/** Status-dot color class for a user row. The dot encodes ONLY sep — amber for
 *  sep, green for everyone else. Away and guest are NOT in the dot: away dims
 *  the NAME (bcc-name-away), guest adds a " [G]" SUFFIX via userNameText. This
 *  keeps the three signals orthogonal so sep and away never compete for the
 *  dot. */
export function statusDotClass(user: User): string {
  return user.sep ? "bcc-dot-sep" : "bcc-dot-online";
}

/** Whether the row should render a 'gast' chip after the name. Guest tier is
 *  shown as a small pill element (not name text) so it reads cleanly without
 *  adding reading load to the name. */
export function isGuestTag(user: User): boolean {
  return user.guest;
}

export function getStatusClasses(user: User): string {
  const classes = ["bcc-userrow"];
  if (user.away) classes.push("bcc-away");
  if (user.sep) classes.push("bcc-sep");
  return classes.join(" ");
}

/** Apply a user's state to an existing row's child elements (dot, name span,
 *  gast chip). The row must already contain these elements; use after
 *  buildRow or to patch an in-place status change. */
function applyUserState(row: HTMLLIElement, user: User): void {
  row.className = getStatusClasses(user);
  const dot = row.querySelector(".bcc-status-dot");
  if (dot) {
    dot.className =
      "bcc-status-dot fas " +
      statusDotClass(user) +
      " " +
      (user.sep ? "fa-circle-half-stroke" : "fa-circle");
  }
  const nameSpan = row.querySelector(".bcc-userrow-name");
  if (nameSpan) {
    nameSpan.classList.toggle("bcc-name-away", user.away);
    nameSpan.textContent = user.name;
  }
  const existingChip = row.querySelector(".bcc-gast");
  if (isGuestTag(user) && !existingChip) {
    const gast = document.createElement("span");
    gast.className = "bcc-user-tag bcc-gast";
    gast.textContent = "gast";
    row.appendChild(gast);
  } else if (!isGuestTag(user) && existingChip) {
    existingChip.remove();
  }
}

function buildRow(user: User): HTMLLIElement {
  const li = document.createElement("li");
  li.dataset.name = user.name;
  // tabindex + role so the list is keyboard-navigable (spec §4.5 / R4).
  li.tabIndex = 0;
  li.setAttribute("role", "button");
  li.setAttribute("aria-label", "Aktionen für " + user.name);
  // Status icon — a Font Awesome glyph (fa-circle present / fa-circle-half-
  // stroke sep) colored via the scheme-derived --bcc-status-* var. Encodes
  // ONLY sep vs present; away/guest are not dot states (away recolors the
  // name; guest shows a 'gast' chip).
  const dot = document.createElement("i");
  dot.className = "bcc-status-dot fas";
  dot.setAttribute("aria-hidden", "true");
  li.appendChild(dot);
  // Name — away dims the name (bcc-name-away) via opacity on the NAME span
  // (not the whole row), so sep+away still reads as a full-brightness amber
  // dot + a dimmed name (not a uniformly faded row).
  const nameSpan = document.createElement("span");
  nameSpan.className = "bcc-userrow-name";
  li.appendChild(nameSpan);
  // Apply user state to the row (classes, dot color, name text, gast chip).
  applyUserState(li, user);
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

async function refreshPinned(): Promise<void> {
  const list = (await getConfig("pinned", [])) as string[];
  pinnedCache = new Set(list);
}

async function togglePin(user: User): Promise<void> {
  const list = (await getConfig("pinned", [])) as string[];
  const idx = list.indexOf(user.name);
  if (idx === -1) {
    list.push(user.name);
  } else {
    list.splice(idx, 1);
  }
  await setConfig("pinned", list);
  pinnedCache = new Set(list);
  // Re-render from the last known userlist with a trivial diff (everything is
  // "unchanged" — sortUsers + section placement handle the move between
  // pinned/regular; no rows are added or removed by a pin toggle).
  if (lastUserlistEvent) renderSidebar(lastUserlistEvent, [], []);
}

function handleRowClick(user: User, anchor: HTMLElement): void {
  openUserPopup(anchor, user, pinnedCache.has(user.name), (u) => {
    togglePin(u).catch(() => {
      cclog("pin toggle failed for " + u.name, "v3");
    });
  });
}

// ─── Rendering ──────────────────────────────────────────────────────────────
//
// True diff-and-patch (spec §2.4 / review C3). The two <ul> containers and the
// divider are created ONCE at mount and never wiped. Each userlist event carries
// {users, added, removed} from the store — we drop removed rows, add new ones,
// and re-insert the rest in sorted order into their section. Unchanged rows
// keep their <li> node (event listeners and state survive); only their status
// classes/text get refreshed. Scroll position is preserved because the
// container is never rebuilt.

let lastUserlistEvent: User[] | null = null;
let rowMap: Map<string, HTMLLIElement> = new Map();
let pinnedUl: HTMLUListElement | null = null;
let regularUl: HTMLUListElement | null = null;
let pinnedPanel: HTMLElement | null = null; // wraps the pinned header + UL
let scrollContainer: HTMLElement | null = null; // wraps the regular UL (scrolls)
let onlineCount: HTMLElement | null = null;

/** Create the stable section containers (once). Idempotent. */
function ensureContainers(sidebar: HTMLElement): void {
  if (pinnedUl && pinnedUl.isConnected) return;
  sidebar.innerHTML = "";

  // Online count + channel select row. The channel select sits to the right.
  const onlineRow = document.createElement("div");
  onlineRow.className = "bcc-online-row";
  onlineCount = document.createElement("div");
  onlineCount.className = "bcc-online-count";
  onlineCount.setAttribute("role", "status");
  onlineCount.setAttribute("aria-live", "polite");
  onlineCount.textContent = "0 online";
  onlineRow.appendChild(onlineCount);
  onlineRow.appendChild(buildChannelSelect());
  sidebar.appendChild(onlineRow);

  // Pinned panel — a tinted, rounded container wrapping the header + pinned
  // list so the pinned section reads as a distinct visual group, not a bare
  // label above an undifferentiated column (refreshSectionVisibility toggles
  // the whole panel when there are no pinned users).
  pinnedPanel = document.createElement("div");
  pinnedPanel.className = "bcc-pinned-panel";
  const pinnedHeader = document.createElement("div");
  pinnedHeader.className = "bcc-userlist-section";
  pinnedHeader.textContent = "Angespinnt";
  pinnedUl = document.createElement("ul");
  pinnedUl.className = "bcc-userlist-pinned";
  pinnedUl.setAttribute("role", "list");
  pinnedPanel.append(pinnedHeader, pinnedUl);
  regularUl = document.createElement("ul");
  regularUl.className = "bcc-userlist-regular";
  regularUl.setAttribute("role", "list");
  // Scroll container — wraps ONLY the regular UL so the header area (stats +
  // online count + pinned panel) stays fixed at the top. .bcc-sidebar is a
  // flex column; this container fills the remaining space and scrolls.
  scrollContainer = document.createElement("div");
  scrollContainer.className = "bcc-userlist-scroll";
  scrollContainer.appendChild(regularUl);
  sidebar.append(pinnedPanel, scrollContainer);
}

/** Show/hide the pinned panel depending on whether any pinned users exist.
 *  The whole panel (header + list) is the pinned section's visual unit, so it
 *  shows/hidden as one — independent of the regular list. */
function refreshSectionVisibility(): void {
  const hasPinned = pinnedUl ? pinnedUl.children.length > 0 : false;
  if (pinnedPanel) pinnedPanel.style.display = hasPinned ? "" : "none";
}

/** Patch the sidebar from a userlist store event (consumes the diff). */
function renderSidebar(users: User[], added: string[], removed: string[]): void {
  const sidebar = document.querySelector(".bcc-sidebar");
  if (!sidebar || !pinnedUl || !regularUl) return;

  // 1) Drop removed rows (their <li>s are GC'd). This is the cheap path the
  //    store pre-computed so we don't scan the whole list.
  for (const name of removed) {
    const row = rowMap.get(name);
    if (row) row.remove();
    rowMap.delete(name);
  }

  // 2) Sort once for this event, then place every (possibly reused) row in
  //    sorted order within its section. appendChild on an existing node MOVES
  //    it (preserving listeners), so this re-orders without rebuilding.
  const scrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
  const sorted = sortUsers(users, pinnedCache);

  for (const user of sorted) {
    const isPinned = pinnedCache.has(user.name);
    const target = isPinned ? pinnedUl : regularUl;

    let row = rowMap.get(user.name);
    if (row) {
      // Unchanged user — refresh status in place (a status flip like
      // away↔present is NOT an add/remove; it reuses the node).
      applyUserState(row, user);
    } else {
      row = buildRow(user);
      rowMap.set(user.name, row);
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
  if (onlineCount) onlineCount.textContent = users.length + " online";
  lastUserlistEvent = users;
  void added; // diff already consumed via removed[] + rowMap reuse above
}

// ─── Mount ──────────────────────────────────────────────────────────────────

export function mountSidebar(): void {
  const sidebar = document.querySelector(".bcc-sidebar");
  if (!sidebar) return;

  ensureContainers(sidebar as HTMLElement);

  refreshPinned().catch(() => {
    cclog("mountSidebar: failed to read pinned config", "v3");
  });

  subscribe((e: BccEvent) => {
    if (e.type === "userlist") {
      renderSidebar(e.users, e.added, e.removed);
    }
  });

  cclog("sidebar mounted — subscribed to userlist events", "v3");
}
