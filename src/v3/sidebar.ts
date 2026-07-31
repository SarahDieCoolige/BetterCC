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
  const nameSpan = document.createElement("span");
  nameSpan.className = "bcc-userrow-name";
  nameSpan.textContent = getStatusText(user) + user.name;
  li.appendChild(nameSpan);
  li.addEventListener("click", () => handleRowClick(user));
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
  renderSidebar(lastUserlistEvent ?? []);
}

function handleRowClick(user: User): void {
  togglePin(user).catch(() => {
    cclog("pin toggle failed for " + user.name, "v3");
  });
  cclog("userlist row click: " + user.name + " (pin toggled, popup stub)", "v3");
}

// ─── Rendering ──────────────────────────────────────────────────────────────

let lastUserlistEvent: User[] | null = null;
let rowMap: Map<string, HTMLLIElement> = new Map();

function renderSidebar(users: User[]): void {
  const sidebar = document.querySelector(".bcc-sidebar");
  if (!sidebar) return;

  const sorted = sortUsers(users, pinnedCache);
  const scrollTop = sidebar.scrollTop;

  // Build the two UL sections + divider.
  sidebar.innerHTML = "";
  const pinnedUl = document.createElement("ul");
  pinnedUl.className = "bcc-userlist-pinned";
  const regularUl = document.createElement("ul");
  regularUl.className = "bcc-userlist-regular";
  const divider = document.createElement("div");
  divider.className = "bcc-userlist-divider";

  const newMap = new Map<string, HTMLLIElement>();
  let hasPinned = false;
  let hasRegular = false;

  for (const user of sorted) {
    const isPinned = pinnedCache.has(user.name);
    if (isPinned) hasPinned = true;
    else hasRegular = true;

    let row = rowMap.get(user.name);
    if (row) {
      // Reuse existing node — just update status classes.
      row.className = getStatusClasses(user);
      const nameSpan = row.querySelector(".bcc-userrow-name");
      if (nameSpan) nameSpan.textContent = getStatusText(user) + user.name;
    } else {
      row = buildRow(user);
    }
    (isPinned ? pinnedUl : regularUl).appendChild(row);
    newMap.set(user.name, row);
  }

  if (hasPinned) sidebar.appendChild(pinnedUl);
  if (hasPinned && hasRegular) sidebar.appendChild(divider);
  if (hasRegular) sidebar.appendChild(regularUl);

  sidebar.scrollTop = Math.min(scrollTop, sidebar.scrollHeight);
  rowMap = newMap;
  lastUserlistEvent = users;
}

// ─── Mount ──────────────────────────────────────────────────────────────────

export function mountSidebar(): void {
  refreshPinned().catch(() => {
    cclog("mountSidebar: failed to read pinned config", "v3");
  });

  subscribe((e: BccEvent) => {
    if (e.type === "userlist") {
      renderSidebar(e.users);
    }
  });

  cclog("sidebar mounted — subscribed to userlist events", "v3");
}
