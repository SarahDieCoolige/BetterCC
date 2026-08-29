// ─── Anwesende modal: pure core ───────────────────────────────────────────
//
// Site-wide "Anwesende" overview: every user online, grouped by channel,
// built from the globalUserlist snapshot (aw.js, channels Map). The last poll
// diff drives the transient layer: freshly joined users get a "joined" flag,
// leavers survive one render as ghost rows in their old channel.
// This half is pure: no DOM, no store reads. The impure half (mount, render,
// filter wiring) lives below the divider.
// Spec: specs/aw-overview.md

import { get, react, type Ephemeral, type User } from "./store";
import { refreshAwNow, type GlobalDiff } from "./global-userlist";
import { isIdPopupOpen } from "./id-popup";
import { openUserPopup } from "./popup";
import { togglePin } from "./sidebar";
import { isSettingsOpen } from "./settings";
import { iconElement } from "./dom";
import { cclog } from "./utils";

// ═══════════════════════════════════════════════════════════════════════════
// Pure core (unit-tested)
// ═══════════════════════════════════════════════════════════════════════════

/** One line in a section: a live user or a ghost. */
export interface AwRow {
  /** Display nick (guest ^id stripped upstream by parseAw). */
  name: string;
  /** User.key */
  key: string;
  transient: "joined" | null;
  ghost: boolean;
}

/** One channel block. */
export interface AwSection {
  channel: string;
  /** Live users, aw.js order; ghosts NOT included. */
  rows: AwRow[];
  /** Leavers from diff.removed, old channel. */
  ghosts: AwRow[];
  /** Live users in the channel; ghosts never count. In a filtered view the
   *  rows shrink to the matches while total keeps the channel's full live
   *  count (section heads render matched/total). */
  total: number;
}

export interface AwModel {
  /** Channels in aw.js (Map) order. */
  sections: AwSection[];
  /** All live rows across sections. */
  total: number;
}

export interface AwView {
  /** Only sections with >= 1 visible live row, filtered rows/ghosts. */
  sections: AwSection[];
  /** Visible live rows; ghosts never count. */
  matched: number;
  /** AwModel.total */
  total: number;
}

/**
 * Build the sectioned model from a snapshot + the last poll diff. Sections
 * follow the channels Map (aw.js) order; ghosts land after the live rows of
 * their old channel, and a leaver from a vanished channel still gets a
 * section, appended at the end.
 *
 * Cold open: on a mount render, or when the previous snapshot was empty, the
 * diff is "everyone joined / everyone left" and carries no news. Suppressing
 * it keeps the first paint from flashing green and ghost-red.
 */
export function buildAwModel(
  channels: Map<string, User[]>,
  diff: GlobalDiff | null,
  opts: { mountRender?: boolean; prevEmpty?: boolean },
): AwModel {
  const cold = diff === null || opts.mountRender === true || opts.prevEmpty === true;

  // Per-channel set of freshly joined keys, for the "joined" flag.
  const joined = new Map<string, Set<string>>();
  if (!cold) {
    for (const { user, channel } of diff.added) {
      let keys = joined.get(channel);
      if (!keys) {
        keys = new Set();
        joined.set(channel, keys);
      }
      keys.add(user.key);
    }
  }

  const sections: AwSection[] = [];
  const byChannel = new Map<string, AwSection>();
  // Existing section, or a new one appended at the end (vanished channels).
  const sectionFor = (channel: string): AwSection => {
    let s = byChannel.get(channel);
    if (!s) {
      s = { channel, rows: [], ghosts: [], total: 0 };
      byChannel.set(channel, s);
      sections.push(s);
    }
    return s;
  };

  for (const [channel, users] of channels) {
    const s = sectionFor(channel);
    const keys = joined.get(channel);
    for (const user of users) {
      s.rows.push({
        name: user.name,
        key: user.key,
        transient: keys !== undefined && keys.has(user.key) ? "joined" : null,
        ghost: false,
      });
    }
    s.total = s.rows.length;
  }

  if (!cold) {
    for (const { user, channel } of diff.removed) {
      sectionFor(channel).ghosts.push({
        name: user.name,
        key: user.key,
        transient: null,
        ghost: true,
      });
    }
  }

  const total = sections.reduce((sum, s) => sum + s.total, 0);
  return { sections, total };
}

/**
 * Filter the model by a nick substring (case-insensitive). Live rows decide
 * whether a section survives: a channel whose rows all filter out is dropped
 * whole, ghosts never keep one alive. Ghosts filter like rows but never count
 * into matched, and total stays the model's full live total.
 */
export function applyFilter(model: AwModel, query: string): AwView {
  const q = query.trim().toLowerCase();
  if (!q) {
    return { sections: model.sections, matched: model.total, total: model.total };
  }

  const sections: AwSection[] = [];
  let matched = 0;
  for (const s of model.sections) {
    const rows = s.rows.filter((r) => r.name.toLowerCase().includes(q));
    if (rows.length === 0) continue;
    matched += rows.length;
    const ghosts = s.ghosts.filter((g) => g.name.toLowerCase().includes(q));
    // total keeps the channel's full live count for the n/m section heads.
    sections.push({ channel: s.channel, rows, ghosts, total: s.total });
  }
  return { sections, matched, total: model.total };
}

/** "Stand: HH:MM" footer stamp, zero-padded 24h. */
export function formatStand(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `Stand: ${hh}:${mm}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Modal (impure wiring, verified in the dev replica)
// ═══════════════════════════════════════════════════════════════════════════

// UI copy (German). The error line answers the three questions: what broke,
// what still works, what to do.
const LOADING_TEXT = "Lade Anwesende…";
const EMPTY_TEXT = "Keine Anwesenden gefunden.";
const ERROR_TEXT =
  "Anwesende konnten nicht geladen werden. Der Chat funktioniert weiter. Klicke erneut auf die Aktualisieren-Schaltfläche.";

// Per-open ephemeral state, reset on every open (matches id-popup.ts).
let overlayEl: HTMLElement | null = null;
let documentKeydown: ((e: KeyboardEvent) => void) | null = null;
let unreact: (() => void) | null = null;
let filterQuery = "";
let firstRender = true; // the react() immediate call is the mount render
let prevEmpty = true; // was the previously rendered model empty (cold-open guard)
let pendingOwnFetches = 0; // latch: fetches THIS modal triggered
let live = false; // live mode renders every non-empty diff; per-open, never stored
// Ghost keys (channel + NUL + key) whose fade already ran: renderBody skips
// them so a filter re-render cannot resurrect an expired ghost. Cleared on
// every event rebuild, where the fresh diff legitimately brings new ghosts.
let expiredGhosts = new Set<string>();

/** Expiry-set key for a ghost: the NUL keeps channel/key splits unambiguous. */
const ghostKey = (channel: string, key: string): string => channel + "\u0000" + key;

// Refs held across renders; rebuilt per open, nulled on close.
let bodyEl: HTMLElement | null = null;
let countSpan: HTMLElement | null = null;
let standSpan: HTMLElement | null = null;
let stateEl: HTMLElement | null = null;
// The model the modal last rendered from. Kept here instead of re-reading the
// store in renderBody: with static gating the filter must re-filter OUR
// snapshot, not whatever the background poll pushed last.
let model: AwModel | null = null;
// Full User objects of the RENDERED snapshot, keyed by user key: the rows
// carry only name/key, but the user popup wants the whole User. Refreshed
// only on rendered paths, so it tracks what is on screen, not the store.
let usersByKey = new Map<string, User>();

/** Show or clear the inline state line ("" hides it via CSS :empty). */
function setState(text: string): void {
  if (stateEl) stateEl.textContent = text;
}

/**
 * Re-filter + rebuild the list body, count and Stand stamp. The filter input
 * itself is never rebuilt, so focus and caret survive every render.
 */
function renderBody(): void {
  if (!model || !bodyEl || !countSpan || !standSpan || !stateEl) return;
  const filtering = filterQuery.trim() !== "";
  const view = applyFilter(model, filterQuery);

  // Smoke probe for the live-mode skip: every actual rebuild bumps this,
  // a skipped event must not.
  bodyEl.dataset.bccAwRender = String((Number(bodyEl.dataset.bccAwRender) || 0) + 1);

  bodyEl.replaceChildren();
  for (const section of view.sections) bodyEl.appendChild(buildSectionEl(section, filtering));

  countSpan.textContent = filtering ? `${view.matched}/${view.total}` : String(view.total);
  standSpan.textContent = formatStand(new Date());

  setState(view.sections.length === 0 ? EMPTY_TEXT : "");
}

/** One channel block: head with the n/m count, inline nick spans, ghosts. */
function buildSectionEl(section: AwSection, filtering: boolean): HTMLElement {
  const sectionEl = document.createElement("div");
  sectionEl.className = "bcc-aw-section";

  const head = document.createElement("div");
  head.className = "bcc-aw-section-head";
  // Like the overall count: matched/total while filtering, plain otherwise.
  const count = filtering ? `${section.rows.length}/${section.total}` : `${section.total}`;
  head.textContent = `${section.channel} (${count})`;
  sectionEl.appendChild(head);

  // Nicks flow inline and wrap, several per line (like upstream's own
  // Anwesende lists), not one full-width row per user.
  const rowsEl = document.createElement("div");
  rowsEl.className = "bcc-aw-rows";

  for (const row of section.rows) {
    const rowEl = document.createElement("span");
    rowEl.className = "bcc-aw-row";
    rowEl.textContent = row.name;
    rowEl.dataset.key = row.key;
    // Drives the joined fade (bcc-aw-joined-fade); the animationend
    // listener strips it again once the fade ran.
    if (row.transient === "joined") rowEl.classList.add("bcc-joined");
    rowsEl.appendChild(rowEl);
  }
  for (const ghost of section.ghosts) {
    // An already-faded ghost stays gone: the model still contains it (so a
    // filter re-render would rebuild it), the expiry set filters it here.
    if (expiredGhosts.has(ghostKey(section.channel, ghost.key))) continue;
    // Ghosts carry no bcc-aw-row class, so the delegated click never
    // matches one; the dataset is expiry bookkeeping only.
    const ghostEl = document.createElement("span");
    ghostEl.className = "bcc-aw-ghost";
    ghostEl.textContent = ghost.name;
    ghostEl.dataset.key = ghost.key;
    ghostEl.dataset.channel = section.channel;
    rowsEl.appendChild(ghostEl);
  }
  sectionEl.appendChild(rowsEl);
  return sectionEl;
}

/**
 * The toolbar: filter input, Stand stamp, one-shot refresh, live toggle.
 * Returns the input alongside so the caller can focus it once mounted
 * (focusing a detached input is a no-op).
 */
function buildToolbar(): { toolbar: HTMLElement; filterInput: HTMLInputElement } {
  const toolbar = document.createElement("div");
  toolbar.className = "bcc-aw-toolbar";

  const filterInput = document.createElement("input");
  filterInput.type = "text";
  filterInput.placeholder = "Nick filtern…";
  // Re-filter only: no refetch, and the input is never rebuilt.
  filterInput.addEventListener("input", () => {
    filterQuery = filterInput.value;
    renderBody();
  });
  toolbar.appendChild(filterInput);

  standSpan = document.createElement("span");
  standSpan.className = "bcc-aw-stand";
  toolbar.appendChild(standSpan);

  const refreshBtn = document.createElement("button");
  // Same canonical .bcc-icon-btn shape as the /id search button; bcc-aw-sync
  // is the hook the live mode hides it by.
  refreshBtn.type = "button";
  refreshBtn.className = "bcc-icon-btn bcc-aw-sync";
  refreshBtn.setAttribute("aria-label", "Jetzt aktualisieren");
  refreshBtn.title = "Jetzt aktualisieren";
  refreshBtn.appendChild(iconElement("fa-sync"));
  refreshBtn.addEventListener("click", () => {
    if (overlayEl) void fetchAndRender(overlayEl);
  });
  toolbar.appendChild(refreshBtn);

  // Live toggle (per-open, never stored): while live, Stand + sync hide via
  // the bcc-aw-live class on the overlay; pausing restores them.
  const liveBtn = document.createElement("button");
  liveBtn.type = "button";
  liveBtn.className = "bcc-icon-btn";
  const applyLiveUi = (): void => {
    overlayEl?.classList.toggle("bcc-aw-live", live);
    liveBtn.replaceChildren(iconElement(live ? "fa-pause" : "fa-play"));
    const label = live ? "Automatische Aktualisierung pausieren" : "Automatisch aktualisieren";
    liveBtn.title = label;
    liveBtn.setAttribute("aria-label", label);
  };
  liveBtn.addEventListener("click", () => {
    live = !live;
    applyLiveUi();
  });
  applyLiveUi();
  toolbar.appendChild(liveBtn);

  return { toolbar, filterInput };
}

/**
 * Rebuild triggers per mode. The mount render always draws. Live mode draws
 * every event except a fully idle one: the store notifies every 5s even with
 * an empty diff, and an idle list must not twitch. Static mode draws only the
 * modal's own fetches, empty diff included; background events are ignored.
 */
function renderList(payload: Ephemeral["globalUserlist"]): void {
  if (firstRender) {
    model = buildAwModel(payload.channels, null, { mountRender: true });
    firstRender = false;
  } else {
    if (live) {
      if (payload.added.length === 0 && payload.removed.length === 0) return;
    } else if (pendingOwnFetches === 0) {
      return;
    }
    model = buildAwModel(
      payload.channels,
      { added: payload.added, removed: payload.removed },
      { prevEmpty },
    );
    // The model rebuilt from a new event: fresh ghosts are legitimate again.
    expiredGhosts.clear();
  }
  prevEmpty = model.total === 0;
  usersByKey = new Map();
  for (const users of payload.channels.values()) {
    for (const u of users) usersByKey.set(u.key, u);
  }
  renderBody();
}

/**
 * One latched fetch: while it runs, poll events render (the emit lands inside
 * the await); afterwards an empty store means the response was garbage, so the
 * inline error shows. `overlay` guards against writing into an instance that
 * was closed or reopened mid-flight.
 */
async function fetchAndRender(overlay: HTMLElement): Promise<void> {
  if (get("globalUserlist").channels.size === 0) setState(LOADING_TEXT);
  pendingOwnFetches++;
  try {
    await refreshAwNow();
    if (overlayEl === overlay && get("globalUserlist").channels.size === 0) {
      setState(ERROR_TEXT);
    }
  } finally {
    // Only the open instance's own fetches may decrement: a fetch can outlive
    // a close/reopen, and a stale settle zeroing the fresh instance's latch
    // would swallow its open-fetch render.
    if (overlayEl === overlay) pendingOwnFetches--;
  }
}

/** Close the modal if open. Safe to call when no modal exists. */
export function closeAwModal(): void {
  if (documentKeydown) {
    document.removeEventListener("keydown", documentKeydown);
    documentKeydown = null;
  }
  if (unreact) {
    unreact();
    unreact = null;
  }
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
  bodyEl = null;
  countSpan = null;
  standSpan = null;
  stateEl = null;
  model = null;
  usersByKey = new Map();
  expiredGhosts = new Set();
}

/** Open the Anwesende overview: snapshot first, then one forced fresh fetch. */
export function openAwModal(): void {
  closeAwModal();

  const shell = document.querySelector(".bcc-shell");
  if (!shell) return;

  // Per-open reset: static mode always starts cold, live never persists.
  filterQuery = "";
  firstRender = true;
  prevEmpty = true;
  pendingOwnFetches = 0;
  live = false;
  model = null;
  usersByKey = new Map();
  expiredGhosts = new Set();

  // ── Overlay ──
  overlayEl = document.createElement("div");
  overlayEl.className = "bcc-aw-overlay";

  // ── Card ──
  const card = document.createElement("div");
  card.className = "bcc-aw-card";

  // ── Header ──
  const header = document.createElement("div");
  header.className = "bcc-aw-header";

  const title = document.createElement("span");
  title.textContent = "Anwesende";
  header.appendChild(title);

  countSpan = document.createElement("span");
  countSpan.className = "bcc-aw-count";
  header.appendChild(countSpan);

  const closeBtn = document.createElement("button");
  closeBtn.className = "bcc-aw-close";
  closeBtn.setAttribute("aria-label", "Schließen");
  closeBtn.appendChild(iconElement("fa-xmark"));
  closeBtn.addEventListener("click", closeAwModal);
  header.appendChild(closeBtn);

  card.appendChild(header);

  // ── Toolbar ──
  const { toolbar, filterInput } = buildToolbar();
  card.appendChild(toolbar);

  card.appendChild(toolbar);

  // ── List body (rebuilt on every render) ──
  bodyEl = document.createElement("div");
  bodyEl.className = "bcc-aw-body";
  // Delegated clicks: a nick opens the standard user popup anchored on it
  // (same surface as userlist rows); the overview stays open underneath.
  bodyEl.addEventListener("click", (e: MouseEvent) => {
    const row = (e.target as HTMLElement).closest(".bcc-aw-row") as HTMLElement | null;
    if (!row) return;
    // stopPropagation keeps popup.ts's document-level outside-click from
    // closing the popup this same click just opened (sidebar rows do the same).
    e.stopPropagation();
    const user = usersByKey.get(row.dataset.key ?? "");
    if (!user) return;
    openUserPopup(row, user, get("pinned").includes(user.key), (u) => {
      togglePin(u).catch(() => {
        cclog("aw modal: pin toggle failed for " + u.name, "v3");
      });
    });
  });
  card.appendChild(bodyEl);

  // One delegated animationend for every fade (it bubbles): ghosts expire
  // and remove themselves (no timers, no per-element listeners); joined rows
  // drop the class, else the forwards fill keeps painting the faded
  // background and kills the hover tint forever.
  bodyEl.addEventListener("animationend", (e: AnimationEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains("bcc-aw-ghost")) {
      expiredGhosts.add(ghostKey(target.dataset.channel ?? "", target.dataset.key ?? ""));
      target.remove();
    } else if (target.classList.contains("bcc-joined")) {
      target.classList.remove("bcc-joined");
    }
  });

  // ── Inline state line (loading / error / empty) ──
  stateEl = document.createElement("div");
  stateEl.className = "bcc-aw-state";
  card.appendChild(stateEl);

  // ── Assemble ──
  overlayEl.appendChild(card);
  shell.appendChild(overlayEl);

  // ── Event bindings ──
  documentKeydown = (e: KeyboardEvent) => {
    // /id and settings sit above this modal; Esc closes only the topmost.
    if (e.key === "Escape" && !isIdPopupOpen() && !isSettingsOpen()) closeAwModal();
  };
  document.addEventListener("keydown", documentKeydown);

  overlayEl.addEventListener("click", (e: MouseEvent) => {
    if (e.target === overlayEl) closeAwModal();
  });

  // Subscribe; the immediate call is the mount render.
  unreact = react("globalUserlist", renderList);

  filterInput.focus();

  // Open flow: force one fresh fetch (static mode renders only own fetches).
  void fetchAndRender(overlayEl);
}
