// ─── Input history — arrow-key recall + unified draft (spec: input-history) ─
//
// Owns all input content state: the draft (slot 0) plus a ring buffer of
// everything submitted, persisted as ONE structure in sessionStorage under a
// user-scoped key. Tab-session lifetime by design — recall is a
// within-sitting behavior; GM/localStorage were weighed and rejected in the
// spec discussion (async-write complexity / permanent plaintext whispers).
//
// Three invariants — breaking one breaks the feature's promise:
// 1. The draft is sacred. Slot 0 changes only by typing at position 0,
//    sending the draft, or the park-flush. Recall can never destroy it.
// 2. The position-0 write-through gate. While position > 0 the box shows a
//    recall view — borrowed scratch. Keystrokes there never touch slot 0;
//    the edit's only exits are send, move (discarded), or reload (lost).
// 3. History is immutable. The ring prepends or collapses duplicates; it
//    never edits entries or reorders them.

import { cclog, getUserKey } from "./utils";

// ─── Constants ──────────────────────────────────────────────────────────────

export const HISTORY_MAX = 50;
export const DRAFT_DEBOUNCE_MS = 500;

const STRUCTURE_KEY_BASE = "bcc_input_history";
/** Key of the pre-IH (T5) draft mechanism, adopted once at boot. */
export const LEGACY_DRAFT_KEY = "bcc_draft";

/** Storage boundary, injected so the suite tests against a fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// ─── Pure core — recall state machine ──────────────────────────────────────
//
// No-op transitions return the SAME state reference — handleRecallKey uses
// that as its "key not consumed" signal (pinned by the same-ref tests).

export interface HistoryState {
  /** 0 = draft slot, 1..entries.length = history (1 = newest). */
  position: number;
  draft: string;
  entries: string[];
}

/** ArrowUp. boxText is the live box: parked at position 0, ignored above it. */
export function recallUp(s: HistoryState, boxText: string): HistoryState {
  if (s.entries.length === 0) return s;
  if (s.position === 0) return { ...s, position: 1, draft: boxText };
  if (s.position >= s.entries.length) return s;
  return { ...s, position: s.position + 1 };
}

/** ArrowDown. No-op at position 0 (the draft is already showing). */
export function recallDown(s: HistoryState): HistoryState {
  if (s.position <= 0) return s;
  return { ...s, position: s.position - 1 };
}

/** Escape — snap back to the parked draft from any position. */
export function recallEscape(s: HistoryState): HistoryState {
  if (s.position === 0) return s;
  return { ...s, position: 0 };
}

/** What the box should display for the current position. */
export function currentText(s: HistoryState): string {
  return s.position === 0 ? s.draft : (s.entries[s.position - 1] ?? s.draft);
}

/**
 * Record a submitted text VERBATIM — the ring doubles as the recovery path
 * for daemon-swallowed over-length sends, so entries are never truncated;
 * only the count is bounded. Prepend unless the text is already in the
 * ring: duplicates collapse in place, nothing bubbles to the front.
 */
export function pushEntry(entries: string[], text: string): string[] {
  const t = text.trim();
  if (t === "" || entries.includes(t)) return entries;
  return [t, ...entries].slice(0, HISTORY_MAX);
}

// ─── Storage boundary — structure codec + boot read ────────────────────────

export type ParsedStructure = { ok: true; draft: string; entries: string[] } | { ok: false };

export function parseStructure(raw: string | null): ParsedStructure {
  if (raw === null) return { ok: false };
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return { ok: false };
  }
  if (typeof v !== "object" || v === null) return { ok: false };
  const rec = v as Record<string, unknown>;
  if (typeof rec.draft !== "string" || !Array.isArray(rec.entries)) return { ok: false };
  const entries: string[] = [];
  for (const e of rec.entries) {
    if (typeof e !== "string") return { ok: false };
    entries.push(e);
  }
  return { ok: true, draft: rec.draft, entries: entries.slice(0, HISTORY_MAX) };
}

export function serializeStructure(draft: string, entries: string[]): string {
  return JSON.stringify({ draft, entries: entries.slice(0, HISTORY_MAX) });
}

/**
 * Boot read: structure, corrupt-reset (silent — disposable session data),
 * or one-time adoption of the legacy T5 draft key. Corrupt structures do
 * NOT trigger legacy adoption (the structure key exists; it is just bad).
 */
export function restoreState(storage: StorageLike, structureKey: string): HistoryState {
  const raw = storage.getItem(structureKey);
  const parsed = parseStructure(raw);
  if (parsed.ok) return { position: 0, draft: parsed.draft, entries: parsed.entries };
  if (raw !== null) {
    cclog("input-history: structure corrupt, starting empty", "v3");
    return { position: 0, draft: "", entries: [] };
  }
  const legacy = storage.getItem(LEGACY_DRAFT_KEY);
  if (legacy !== null) {
    storage.removeItem(LEGACY_DRAFT_KEY);
    return { position: 0, draft: legacy, entries: [] };
  }
  return { position: 0, draft: "", entries: [] };
}

// ─── Session wiring — mounted once from mountInput ─────────────────────────

let state: HistoryState = { position: 0, draft: "", entries: [] };
let structureKey = "";
let draftTimer: ReturnType<typeof setTimeout> | null = null;

function persist(): void {
  sessionStorage.setItem(structureKey, serializeStructure(state.draft, state.entries));
}

function cancelDraftTimer(): void {
  if (draftTimer !== null) {
    clearTimeout(draftTimer);
    draftTimer = null;
  }
}

/**
 * Boot the module: resolve the user-scoped key, restore state, register the
 * pagehide flush (makes F5 exact — a sync sessionStorage write mid-teardown
 * is safe, unlike an async GM write). Returns the draft for the textarea.
 */
export function initInputHistory(getBox: () => string): string {
  structureKey = getUserKey(STRUCTURE_KEY_BASE);
  state = restoreState(sessionStorage, structureKey);
  window.addEventListener("pagehide", () => {
    if (state.position !== 0) return; // recall views never persist (inv. 2)
    cancelDraftTimer();
    state.draft = getBox();
    persist();
  });
  return state.draft;
}

/**
 * Ctrl/Cmd+ArrowUp/Down and Esc. Returns the new box text, or null when the
 * key isn't ours (caller does nothing) — including IME composition and the
 * no-op positions (arrows at their clamps, Esc on the draft).
 */
export function handleRecallKey(e: KeyboardEvent, boxText: string): string | null {
  if (e.isComposing) return null;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key === "ArrowUp") {
    const leavingDraft = state.position === 0;
    const next = recallUp(state, boxText);
    if (next === state) return null;
    state = next;
    if (leavingDraft) {
      // Park-flush: the draft left through slot 0 immediately (inv. 1),
      // superseding any pending debounce write of older text.
      cancelDraftTimer();
      persist();
    }
    return currentText(state);
  }
  if (mod && e.key === "ArrowDown") {
    const next = recallDown(state);
    if (next === state) return null;
    state = next;
    return currentText(state);
  }
  if (e.key === "Escape") {
    const next = recallEscape(state);
    if (next === state) return null;
    state = next;
    return currentText(state);
  }
  return null;
}

/** Debounced draft write — only position 0 writes through (inv. 2). */
export function onDraftInput(boxText: string): void {
  if (state.position !== 0) return;
  cancelDraftTimer();
  draftTimer = setTimeout(() => {
    draftTimer = null;
    state.draft = boxText;
    persist();
  }, DRAFT_DEBOUNCE_MS);
}

/**
 * Record a submission from doSubmit (AFTER the offline gate). Cancels any
 * pending draft debounce first (a stale timer firing after a submit would
 * resurrect a sent draft), pushes, resets the position, clears slot 0 only
 * when the draft itself was sent, and returns what the box should show: the
 * parked draft when the submission came from a recall view, else "".
 */
export function recordSubmit(rawMsg: string): string {
  const wasRecalling = state.position > 0;
  cancelDraftTimer();
  state.entries = pushEntry(state.entries, rawMsg);
  state.position = 0;
  if (!wasRecalling) state.draft = "";
  persist();
  return wasRecalling ? state.draft : "";
}

/** Drop out of a recall view without touching storage — for programmatic
 *  box replacement (prefillWhisper overwrites the textarea). */
export function resetRecall(): void {
  state.position = 0;
}
