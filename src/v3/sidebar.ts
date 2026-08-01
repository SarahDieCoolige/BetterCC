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
import { cclog } from "../utils";

// ─── Pure helpers (exported for testing) ────────────────────────────────────

export function getStatusText(user: User): string {
  if (user.sep) return "[S] ";
  if (user.away) return "[A] ";
  return "";
}

export function getStatusClasses(user: User): string {
  const classes = ["bcc-userrow"];
  if (user.away) classes.push("bcc-away");
  if (user.sep) classes.push("bcc-sep");
  return classes.join(" ");
}

function buildRow(user: User): HTMLLIElement {
  const li = document.createElement("li");
  li.className = getStatusClasses(user);
  li.dataset.name = user.name;
  // tabindex + role so the list is keyboard-navigable (spec §4.5 / R4).
  li.tabIndex = 0;
  li.setAttribute("role", "button");
  li.setAttribute("aria-label", "Aktionen für " + user.name);
  const nameSpan = document.createElement("span");
  nameSpan.className = "bcc-userrow-name";
  nameSpan.textContent = getStatusText(user) + user.name;
  li.appendChild(nameSpan);
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
let divider: HTMLElement | null = null;

/** Create the stable section containers (once). Idempotent. */
function ensureContainers(sidebar: HTMLElement): void {
  if (pinnedUl && pinnedUl.isConnected) return;
  sidebar.innerHTML = "";
  pinnedUl = document.createElement("ul");
  pinnedUl.className = "bcc-userlist-pinned";
  pinnedUl.setAttribute("role", "list");
  regularUl = document.createElement("ul");
  regularUl.className = "bcc-userlist-regular";
  regularUl.setAttribute("role", "list");
  divider = document.createElement("div");
  divider.className = "bcc-userlist-divider";
  sidebar.append(pinnedUl, divider, regularUl);
}

/** Show/hide the pinned section + divider depending on whether any pinned
 *  users exist. Keeps the divider from showing with no pinned users above it. */
function refreshSectionVisibility(): void {
  const hasPinned = pinnedUl ? pinnedUl.children.length > 0 : false;
  const hasRegular = regularUl ? regularUl.children.length > 0 : false;
  if (pinnedUl) pinnedUl.style.display = hasPinned ? "" : "none";
  if (divider) divider.style.display = hasPinned && hasRegular ? "" : "none";
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
  const scrollTop = sidebar.scrollTop;
  const sorted = sortUsers(users, pinnedCache);
  let pinnedInserted = 0;
  let regularInserted = 0;

  for (const user of sorted) {
    const isPinned = pinnedCache.has(user.name);
    const target = isPinned ? pinnedUl : regularUl;

    let row = rowMap.get(user.name);
    if (row) {
      // Unchanged user — refresh status in place (a status flip like
      // away↔present is NOT an add/remove; it reuses the node).
      row.className = getStatusClasses(user);
      const nameSpan = row.querySelector(".bcc-userrow-name");
      if (nameSpan) nameSpan.textContent = getStatusText(user) + user.name;
      // If the user moved between pinned/regular sections, the section change
      // is handled by the appendChild below (moves the node). When the section
      // is unchanged, skip the move to avoid a no-op DOM write per row.
      if (row.parentElement === target) continue;
    } else {
      row = buildRow(user);
      rowMap.set(user.name, row);
    }
    target.appendChild(row);
    if (isPinned) pinnedInserted++;
    else regularInserted++;
  }

  // 3) Preserve scroll — we patched, not rebuilt, so the offset is stable.
  //    Clamp in case the list shrank past the current offset.
  sidebar.scrollTop = Math.min(scrollTop, sidebar.scrollHeight);
  refreshSectionVisibility();
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
