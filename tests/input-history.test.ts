// Pure-core + storage-boundary tests for the input history
// (spec: specs/input-history.md). No DOM, no real sessionStorage — storage
// is a fake; the wiring half (keydown/pagehide/debounce) is proven in the
// dev replica smoke (IH-4).

// GM_log is userscript-only; stub it so the corrupt-reset log path runs.
(globalThis as any).GM_log = () => {};

import { describe, expect, it } from "vitest";
import {
  ENTRY_MAX,
  HISTORY_MAX,
  LEGACY_DRAFT_KEY,
  currentText,
  parseStructure,
  pushEntry,
  recallDown,
  recallEscape,
  recallUp,
  restoreState,
  serializeStructure,
  type HistoryState,
  type StorageLike,
} from "../src/input-history";

class FakeStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

function st(draft: string, entries: string[], position = 0): HistoryState {
  return { position, draft, entries };
}

describe("input-history — recall state machine", () => {
  it("recallUp parks the box text as the draft when leaving position 0", () => {
    const next = recallUp(st("half-typed", ["newest", "oldest"]), "half-typed");
    expect(next.position).toBe(1);
    expect(next.draft).toBe("half-typed");
    expect(currentText(next)).toBe("newest");
  });

  it("recallUp ignores recall-view edits (position > 0 never writes slot 0)", () => {
    const next = recallUp(st("draft", ["a", "b", "c"], 1), "EDITED RECALL");
    expect(next.position).toBe(2);
    expect(next.draft).toBe("draft");
    expect(currentText(next)).toBe("b");
  });

  it("recallUp clamps at the oldest entry", () => {
    const atEnd = st("draft", ["a"], 1);
    expect(recallUp(atEnd, "x")).toBe(atEnd);
  });

  it("recallUp is a no-op with empty history", () => {
    const empty = st("draft", []);
    expect(recallUp(empty, "draft")).toBe(empty);
  });

  it("recallDown walks back and lands on the draft at position 0", () => {
    const s1 = recallDown(st("draft", ["a", "b"], 2));
    expect(s1.position).toBe(1);
    expect(currentText(s1)).toBe("a"); // entries[0] is the newest
    const s0 = recallDown(s1);
    expect(s0.position).toBe(0);
    expect(currentText(s0)).toBe("draft");
  });

  it("recallDown at position 0 is a no-op", () => {
    const s0 = st("draft", ["a"]);
    expect(recallDown(s0)).toBe(s0);
  });

  it("recallEscape snaps to the draft from any position", () => {
    const s = recallEscape(st("draft", ["a", "b"], 2));
    expect(s.position).toBe(0);
    expect(currentText(s)).toBe("draft");
  });

  it("recallEscape at position 0 is a no-op", () => {
    const s0 = st("draft", ["a"]);
    expect(recallEscape(s0)).toBe(s0);
  });

  it("park/restore round-trip returns the draft exactly", () => {
    let s = st("precious draft", ["one", "two"]);
    s = recallUp(s, "precious draft");
    s = recallUp(s, "one edited");
    s = recallEscape(s);
    expect(currentText(s)).toBe("precious draft");
  });
});

describe("input-history — pushEntry", () => {
  it("prepends the newest entry", () => {
    expect(pushEntry(["old"], "new")).toEqual(["new", "old"]);
  });

  it("collapses consecutive duplicates", () => {
    expect(pushEntry(["same"], "same")).toEqual(["same"]);
  });

  it("re-sending an older entry keeps it in place (no reorder, no duplicate)", () => {
    expect(pushEntry(["a", "b", "c"], "c")).toEqual(["a", "b", "c"]);
  });

  it("ignores empty and whitespace-only text", () => {
    expect(pushEntry(["a"], "")).toEqual(["a"]);
    expect(pushEntry(["a"], "   ")).toEqual(["a"]);
  });

  it("trims before storing", () => {
    expect(pushEntry([], "  hi  ")).toEqual(["hi"]);
  });

  it("truncates entries to ENTRY_MAX", () => {
    const long = "x".repeat(ENTRY_MAX + 10);
    expect(pushEntry([], long)).toEqual(["x".repeat(ENTRY_MAX)]);
  });

  it("displaces the oldest beyond HISTORY_MAX", () => {
    const entries = Array.from({ length: HISTORY_MAX }, (_, i) => "e" + i); // e0 = newest
    const next = pushEntry(entries, "fresh");
    expect(next.length).toBe(HISTORY_MAX);
    expect(next[0]).toBe("fresh");
    expect(next).not.toContain("e49"); // oldest is displaced, newest survives
    expect(next).toContain("e0");
  });

  it("pins the constants the spec names", () => {
    expect(HISTORY_MAX).toBe(50);
    expect(ENTRY_MAX).toBe(1023);
    expect(LEGACY_DRAFT_KEY).toBe("bcc_draft");
  });
});

describe("input-history — structure codec", () => {
  it("serialize → parse round-trips", () => {
    const raw = serializeStructure("dr", ["a", "b"]);
    expect(parseStructure(raw)).toEqual({ ok: true, draft: "dr", entries: ["a", "b"] });
  });

  it("parse rejects null, bad JSON, non-objects", () => {
    expect(parseStructure(null).ok).toBe(false);
    expect(parseStructure("not json{").ok).toBe(false);
    expect(parseStructure("42").ok).toBe(false);
    expect(parseStructure('"str"').ok).toBe(false);
  });

  it("parse rejects wrong shapes", () => {
    expect(parseStructure('{"entries":["a"]}').ok).toBe(false);
    expect(parseStructure('{"draft":"d"}').ok).toBe(false);
    expect(parseStructure('{"draft":1,"entries":[]}').ok).toBe(false);
    expect(parseStructure('{"draft":"d","entries":"nope"}').ok).toBe(false);
    expect(parseStructure('{"draft":"d","entries":[1]}').ok).toBe(false);
  });

  it("parse clamps oversized entry arrays instead of resetting", () => {
    const many = JSON.stringify({ draft: "d", entries: Array(HISTORY_MAX + 5).fill("x") });
    const parsed = parseStructure(many);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.entries.length).toBe(HISTORY_MAX);
  });
});

describe("input-history — restoreState (boot + legacy + per-user)", () => {
  it("restores a valid structure", () => {
    const store = new FakeStorage();
    store.setItem("k", serializeStructure("draft!", ["a"]));
    expect(restoreState(store, "k")).toEqual({
      position: 0,
      draft: "draft!",
      entries: ["a"],
    });
  });

  it("resets corrupt structures to empty (silent)", () => {
    const store = new FakeStorage();
    store.setItem("k", "{garbage");
    expect(restoreState(store, "k")).toEqual({ position: 0, draft: "", entries: [] });
  });

  it("corrupt structures do not trigger legacy adoption", () => {
    const store = new FakeStorage();
    store.setItem("k", "{garbage");
    store.setItem(LEGACY_DRAFT_KEY, "legacy");
    expect(restoreState(store, "k")).toEqual({ position: 0, draft: "", entries: [] });
    expect(store.getItem(LEGACY_DRAFT_KEY)).toBe("legacy"); // untouched
  });

  it("adopts the legacy bcc_draft once and removes the key", () => {
    const store = new FakeStorage();
    store.setItem(LEGACY_DRAFT_KEY, "old draft");
    expect(restoreState(store, "k")).toEqual({
      position: 0,
      draft: "old draft",
      entries: [],
    });
    expect(store.getItem(LEGACY_DRAFT_KEY)).toBeNull();
  });

  it("empty storage boots empty", () => {
    expect(restoreState(new FakeStorage(), "k")).toEqual({
      position: 0,
      draft: "",
      entries: [],
    });
  });

  it("per-user keying: another user's structure is invisible", () => {
    const store = new FakeStorage();
    store.setItem("bcc_input_history_testuser", serializeStructure("theirs", ["secret"]));
    expect(restoreState(store, "bcc_input_history_gast")).toEqual({
      position: 0,
      draft: "",
      entries: [],
    });
  });
});
