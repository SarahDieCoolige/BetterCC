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

import { subscribe, emit, type BccEvent, type User } from "./store";
import { sortUsers } from "./userlist";
import { getConfig, setConfig } from "./config";
import { openUserPopup } from "./popup";
import { cclog } from "./utils";
import { buildChannelSelect } from "./channel-select";

// ─── Pure helpers (exported for testing) ────────────────────────────────────

export function getStatusClasses(user: User): string {
  const classes = ["bcc-userrow"];
  if (user.sep) classes.push("bcc-sep");
  return classes.join(" ");
}

/** Apply a user's state to an existing row's child elements (name span, tags).
 *  Use after buildRow or to patch an in-place status change. */
function applyUserState(row: HTMLLIElement, user: User): void {
  row.className = getStatusClasses(user);
  row.classList.toggle("bcc-name-away", user.away || user.sep);
  const nameSpan = row.querySelector(".bcc-userrow-name");
  if (nameSpan) {
    nameSpan.textContent = user.name;
  }
  // Remove old tags, rebuild
  row.querySelectorAll(".bcc-user-tag").forEach((t) => t.remove());
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

function buildRow(user: User): HTMLLIElement {
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
  if (user.away) {
    const tag = document.createElement("span");
    tag.className = "bcc-user-tag";
    tag.textContent = "[A]";
    li.appendChild(tag);
  }
  if (user.sep) {
    const tag = document.createElement("span");
    tag.className = "bcc-user-tag";
    tag.textContent = "[S]";
    li.appendChild(tag);
  }
  // Apply user state to the row (classes, name text, tags).
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
  const idx = list.indexOf(user.key);
  if (idx === -1) {
    list.push(user.key);
  } else {
    list.splice(idx, 1);
  }
  await setConfig("pinned", list);
  emit({ type: "config", key: "pinned" }); // notify subscribers
  pinnedCache = new Set(list);
  // Re-render from the last known userlist with a trivial diff (everything is
  // "unchanged" — sortUsers + section placement handle the move between
  // pinned/regular; no rows are added or removed by a pin toggle).
  if (lastUserlistEvent) renderSidebar(lastUserlistEvent, [], []);
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

  pinnedUl = document.createElement("ul");
  pinnedUl.className = "bcc-userlist-pinned";
  pinnedUl.setAttribute("role", "list");
  regularUl = document.createElement("ul");
  regularUl.className = "bcc-userlist-regular";
  regularUl.setAttribute("role", "list");
  scrollContainer = document.createElement("div");
  scrollContainer.className = "bcc-userlist-scroll";
  scrollContainer.appendChild(regularUl);
  sidebar.append(pinnedUl, scrollContainer);
}

function refreshSectionVisibility(): void {
  const hasPinned = pinnedUl ? pinnedUl.children.length > 0 : false;
  if (pinnedUl) pinnedUl.style.display = hasPinned ? "" : "none";
}

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
    const isPinned = pinnedCache.has(user.key);
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
