// Tests for src/settings.ts — pure helpers for the settings modal (T10, Task 1).
//
// These helpers are side-effect-free: no DOM, no GM_*, no unsafeWindow.
// They cover validation, dirty detection, deduplication, and export/import
// round-trip logic. Coverage target: ~100% lines/branches.

import { describe, it, expect } from "vitest";
import {
  type SettingsDraft,
  type ExportBlob,
  type DiagnosticsFields,
  validateColor,
  isDraftValid,
  isDirty,
  dedupPinned,
  addPinned,
  removePinned,
  serializeExport,
  parseImport,
  exportFileName,
  defaultDraft,
  draftFromConfig,
  schemeForPreview,
  ageOrNever,
  connInfoRows,
  healthInfoRows,
  buildDiagnosticsText,
} from "../src/settings-helpers";
import type { BccHealthState, ConnState, FreshnessState } from "../src/health-core";
import { isV2Scheme } from "../src/scheme";

// ═══════════════════════════════════════════════════════════════════════════
// validateColor
// ═══════════════════════════════════════════════════════════════════════════

describe("validateColor", () => {
  it("accepts a valid 6-digit hex without #", () => {
    expect(validateColor("6AAED8")).toBeNull();
  });

  it("accepts a valid 6-digit hex with # prefix", () => {
    expect(validateColor("#6AAED8")).toBeNull();
  });

  it("accepts lowercase hex", () => {
    expect(validateColor("6aaed8")).toBeNull();
  });

  it("accepts mixed case hex", () => {
    expect(validateColor("6aAeD8")).toBeNull();
  });

  it("rejects empty string", () => {
    expect(validateColor("")).not.toBeNull();
  });

  it("rejects 3-digit hex shorthand", () => {
    expect(validateColor("ABC")).not.toBeNull();
  });

  it("rejects 8-digit hex (with alpha)", () => {
    expect(validateColor("6AAED8FF")).not.toBeNull();
  });

  it("rejects non-hex characters", () => {
    expect(validateColor("ZZZZZZ")).not.toBeNull();
  });

  it("rejects hex with spaces", () => {
    expect(validateColor("6AA ED8")).not.toBeNull();
  });

  it("rejects only a # sign", () => {
    expect(validateColor("#")).not.toBeNull();
  });

  it("rejects non-string-like input (number-like)", () => {
    expect(validateColor("1234567")).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// isDraftValid
// ═══════════════════════════════════════════════════════════════════════════

describe("isDraftValid", () => {
  const valid: SettingsDraft = {
    color: "6AAED8",
    schemeV2: false,
    pinned: ["Alice"],
    whisper: "",
    sendOnEnter: true,
    hoverPreview: true,
  };

  it("returns true for a valid draft", () => {
    expect(isDraftValid(valid)).toBe(true);
  });

  it("returns true for the default draft", () => {
    expect(isDraftValid(defaultDraft())).toBe(true);
  });

  it("returns false for invalid color", () => {
    const draft = { ...valid, color: "ZZZZZZ" };
    expect(isDraftValid(draft)).toBe(false);
  });

  it("returns false for empty color", () => {
    const draft = { ...valid, color: "" };
    expect(isDraftValid(draft)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// isDirty
// ═══════════════════════════════════════════════════════════════════════════

describe("isDirty", () => {
  const loaded: SettingsDraft = defaultDraft();

  it("returns false when loaded and draft are identical", () => {
    expect(isDirty(loaded, { ...loaded })).toBe(false);
  });

  it("returns true when color differs", () => {
    expect(isDirty(loaded, { ...loaded, color: "FF0000" })).toBe(true);
  });

  it("returns true when schemeV2 differs", () => {
    expect(isDirty(loaded, { ...loaded, schemeV2: true })).toBe(true);
  });

  it("returns true when pinned differs (different entries)", () => {
    expect(isDirty(loaded, { ...loaded, pinned: ["Alice"] })).toBe(true);
  });

  it("returns true when pinned differs (same entries, different order)", () => {
    const loadedWithPinned: SettingsDraft = { ...loaded, pinned: ["Alice", "Bob"] };
    expect(isDirty(loadedWithPinned, { ...loadedWithPinned, pinned: ["Bob", "Alice"] })).toBe(true);
  });

  it("returns true when whisper differs", () => {
    expect(isDirty(loaded, { ...loaded, whisper: "TargetNick" })).toBe(true);
  });

  it("returns true when sendOnEnter differs", () => {
    expect(isDirty(loaded, { ...loaded, sendOnEnter: false })).toBe(true);
  });

  it("returns true when hoverPreview differs", () => {
    expect(isDirty(loaded, { ...loaded, hoverPreview: false })).toBe(true);
  });

  it("returns true when compact differs", () => {
    expect(isDirty(loaded, { ...loaded, compact: true })).toBe(true);
  });

  it("returns true when ban differs", () => {
    expect(isDirty(loaded, { ...loaded, ban: ["Spammer"] })).toBe(true);
  });

  it("returns false when pinned arrays have same entries and same order", () => {
    const draft: SettingsDraft = { ...loaded, pinned: ["Alice", "Bob"] };
    expect(isDirty(draft, { ...draft, pinned: ["Alice", "Bob"] })).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// dedupPinned
// ═══════════════════════════════════════════════════════════════════════════

describe("dedupPinned", () => {
  it("removes case-insensitive duplicates, keeping first occurrence", () => {
    expect(dedupPinned(["Alice", "alice", "ALICE"])).toEqual(["Alice"]);
  });

  it("preserves order of first occurrences", () => {
    expect(dedupPinned(["Bob", "Alice", "bob", "Charlie"])).toEqual(["Bob", "Alice", "Charlie"]);
  });

  it("returns empty array for empty input", () => {
    expect(dedupPinned([])).toEqual([]);
  });

  it("returns single element for single-element input", () => {
    expect(dedupPinned(["Alice"])).toEqual(["Alice"]);
  });

  it("handles all-unique list unchanged", () => {
    expect(dedupPinned(["Alice", "Bob", "Charlie"])).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("filters empty strings", () => {
    expect(dedupPinned(["Alice", "", "Bob"])).toEqual(["Alice", "Bob"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// serializeExport
// ═══════════════════════════════════════════════════════════════════════════

describe("serializeExport", () => {
  it("produces a valid ExportBlob with all fields", () => {
    const draft: SettingsDraft = {
      color: "FF0000",
      schemeV2: true,
      pinned: ["Alice", "Bob"],
      whisper: "TargetNick",
      sendOnEnter: false,
      hoverPreview: true,
      compact: true,
      ban: ["Spammer"],
    };
    const blob = serializeExport(draft, "TestUser");

    expect(blob._format).toBe("bettercc-settings");
    expect(blob.version).toBe(1);
    expect(blob.user).toBe("TestUser");
    expect(blob.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO timestamp
    expect(blob.settings).toEqual({
      color: "FF0000",
      scheme_v2: true,
      pinned: ["Alice", "Bob"],
      whisper: "TargetNick",
      send_on_enter: false,
      hover_preview: true,
      compact: true,
      ban: ["Spammer"],
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// parseImport
// ═══════════════════════════════════════════════════════════════════════════

describe("parseImport", () => {
  // ── Success cases ────────────────────────────────────────────────────────

  it("parses a valid export blob", () => {
    const blob: ExportBlob = {
      _format: "bettercc-settings",
      version: 1,
      exportedAt: "2026-08-13T12:00:00.000Z",
      user: "TestUser",
      settings: {
        color: "FF0000",
        scheme_v2: true,
        pinned: ["Alice", "Bob"],
        whisper: "TargetNick",
        send_on_enter: false,
        hover_preview: true,
        compact: true,
        ban: ["Spammer"],
      },
    };
    const result = parseImport(JSON.stringify(blob));
    expect(result.ok).toBe(true);
    if (!result.ok) return; // type guard
    expect(result.draft.color).toBe("FF0000");
    expect(result.draft.schemeV2).toBe(true);
    expect(result.draft.pinned).toEqual(["Alice", "Bob"]);
    expect(result.draft.whisper).toBe("TargetNick");
    expect(result.draft.sendOnEnter).toBe(false);
    expect(result.draft.hoverPreview).toBe(true);
    expect(result.draft.compact).toBe(true);
    expect(result.draft.ban).toEqual(["Spammer"]);
  });

  // ── Failure cases ───────────────────────────────────────────────────────

  it("rejects malformed JSON", () => {
    const result = parseImport("not valid json{{{");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeTruthy();
  });

  it("rejects missing _format field", () => {
    const blob = { version: 1, exportedAt: "2026-08-13T12:00:00.000Z", user: "U", settings: {} };
    const result = parseImport(JSON.stringify(blob));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeTruthy();
  });

  it("rejects wrong _format value", () => {
    const blob = {
      _format: "wrong-format",
      version: 1,
      exportedAt: "2026-08-13T12:00:00.000Z",
      user: "U",
      settings: {},
    };
    const result = parseImport(JSON.stringify(blob));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeTruthy();
  });

  it("rejects wrong version", () => {
    const blob = {
      _format: "bettercc-settings",
      version: 2,
      exportedAt: "2026-08-13T12:00:00.000Z",
      user: "U",
      settings: {},
    };
    const result = parseImport(JSON.stringify(blob));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeTruthy();
  });

  it("rejects missing version field", () => {
    const blob = {
      _format: "bettercc-settings",
      exportedAt: "2026-08-13T12:00:00.000Z",
      user: "U",
      settings: {},
    };
    const result = parseImport(JSON.stringify(blob));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeTruthy();
  });

  // ── Coercion / dropping / defaulting ────────────────────────────────────

  it("drops unknown keys in settings", () => {
    const blob = {
      _format: "bettercc-settings",
      version: 1,
      exportedAt: "2026-08-13T12:00:00.000Z",
      user: "U",
      settings: { color: "FF0000", unknown_key: "drop me" },
    };
    const result = parseImport(JSON.stringify(blob));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.color).toBe("FF0000");
    // All other fields should be defaults
    expect(result.draft.schemeV2).toBe(false);
    expect(result.draft.pinned).toEqual([]);
    expect(result.draft.whisper).toBe("");
    expect(result.draft.sendOnEnter).toBe(true);
    expect(result.draft.hoverPreview).toBe(true);
  });

  it("fills missing keys with defaults", () => {
    const blob = {
      _format: "bettercc-settings",
      version: 1,
      exportedAt: "2026-08-13T12:00:00.000Z",
      user: "U",
      settings: { color: "FF0000" },
    };
    const result = parseImport(JSON.stringify(blob));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.color).toBe("FF0000");
    expect(result.draft.schemeV2).toBe(false); // default
    expect(result.draft.pinned).toEqual([]); // default
    expect(result.draft.whisper).toBe(""); // default
    expect(result.draft.sendOnEnter).toBe(true); // default
    expect(result.draft.hoverPreview).toBe(true); // default
  });

  it("handles empty settings object (all defaults)", () => {
    const blob = {
      _format: "bettercc-settings",
      version: 1,
      exportedAt: "2026-08-13T12:00:00.000Z",
      user: "U",
      settings: {},
    };
    const result = parseImport(JSON.stringify(blob));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft).toEqual(defaultDraft());
  });

  it("coerces wrong-type color to default", () => {
    const blob = {
      _format: "bettercc-settings",
      version: 1,
      exportedAt: "2026-08-13T12:00:00.000Z",
      user: "U",
      settings: { color: 12345 },
    };
    const result = parseImport(JSON.stringify(blob));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.color).toBe("6AAED8"); // default
  });

  it("coerces wrong-type scheme_v2 to default", () => {
    const blob = {
      _format: "bettercc-settings",
      version: 1,
      exportedAt: "2026-08-13T12:00:00.000Z",
      user: "U",
      settings: { scheme_v2: "true" },
    };
    const result = parseImport(JSON.stringify(blob));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.schemeV2).toBe(false); // default
  });

  it("coerces wrong-type pinned to default", () => {
    const blob = {
      _format: "bettercc-settings",
      version: 1,
      exportedAt: "2026-08-13T12:00:00.000Z",
      user: "U",
      settings: { pinned: "not-an-array" },
    };
    const result = parseImport(JSON.stringify(blob));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.pinned).toEqual([]); // default
  });

  it("coerces wrong-type whisper to default", () => {
    const blob = {
      _format: "bettercc-settings",
      version: 1,
      exportedAt: "2026-08-13T12:00:00.000Z",
      user: "U",
      settings: { whisper: 42 },
    };
    const result = parseImport(JSON.stringify(blob));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.whisper).toBe(""); // default
  });

  it("coerces wrong-type send_on_enter to default", () => {
    const blob = {
      _format: "bettercc-settings",
      version: 1,
      exportedAt: "2026-08-13T12:00:00.000Z",
      user: "U",
      settings: { send_on_enter: "yes" },
    };
    const result = parseImport(JSON.stringify(blob));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.sendOnEnter).toBe(true); // default
  });

  it("coerces wrong-type hover_preview to default", () => {
    const blob = {
      _format: "bettercc-settings",
      version: 1,
      exportedAt: "2026-08-13T12:00:00.000Z",
      user: "U",
      settings: { hover_preview: 0 },
    };
    const result = parseImport(JSON.stringify(blob));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.hoverPreview).toBe(true); // default
  });

  it("coerces wrong-type compact to default", () => {
    const blob = {
      _format: "bettercc-settings",
      version: 1,
      exportedAt: "2026-08-13T12:00:00.000Z",
      user: "U",
      settings: { compact: "1" },
    };
    const result = parseImport(JSON.stringify(blob));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.compact).toBe(false); // default
  });

  it("coerces wrong-type ban to default", () => {
    const blob = {
      _format: "bettercc-settings",
      version: 1,
      exportedAt: "2026-08-13T12:00:00.000Z",
      user: "U",
      settings: { ban: ["ok", 42] },
    };
    const result = parseImport(JSON.stringify(blob));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.ban).toEqual([]); // default
  });

  // ── Independence (full replace semantics) ────────────────────────────────

  it("is independent of any current draft (full replace)", () => {
    // Parse twice from the same JSON — must produce identical drafts
    const blob: ExportBlob = {
      _format: "bettercc-settings",
      version: 1,
      exportedAt: "2026-08-13T12:00:00.000Z",
      user: "U",
      settings: { color: "FF0000", pinned: ["X"] },
    };
    const json = JSON.stringify(blob);
    const r1 = parseImport(json);
    const r2 = parseImport(json);
    expect(r1).toEqual(r2);
  });

  // ── Round-trip ───────────────────────────────────────────────────────────

  it("export→import round-trip preserves all 8 fields", () => {
    const draft: SettingsDraft = {
      color: "FF0000",
      schemeV2: true,
      pinned: ["Alice", "Bob"],
      whisper: "TargetNick",
      sendOnEnter: false,
      hoverPreview: true,
      compact: true,
      ban: ["Spammer"],
    };
    const blob = serializeExport(draft, "TestUser");
    const result = parseImport(JSON.stringify(blob));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft).toEqual(draft);
  });

  it("pre-compact export (6 keys) imports with compact/ban defaults", () => {
    // Backward compat: every export written before the draft covered all
    // persisted keys lacks compact + ban. Those files must keep importing.
    const blob = {
      _format: "bettercc-settings",
      version: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      user: "U",
      settings: {
        color: "FF0000",
        scheme_v2: true,
        pinned: ["Alice"],
        whisper: "TargetNick",
        send_on_enter: false,
        hover_preview: true,
      },
    };
    const result = parseImport(JSON.stringify(blob));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.compact).toBe(false);
    expect(result.draft.ban).toEqual([]);
    expect(result.draft.color).toBe("FF0000");
  });

  it("round-trip preserves defaults too", () => {
    const draft = defaultDraft();
    const blob = serializeExport(draft, "TestUser");
    const result = parseImport(JSON.stringify(blob));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft).toEqual(draft);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// defaultDraft
// ═══════════════════════════════════════════════════════════════════════════

describe("defaultDraft", () => {
  it("returns a draft with all default values", () => {
    const draft = defaultDraft();
    expect(draft).toEqual({
      color: "6AAED8",
      schemeV2: false,
      pinned: [],
      whisper: "",
      sendOnEnter: true,
      hoverPreview: true,
      compact: false,
      ban: [],
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// draftFromConfig
// ═══════════════════════════════════════════════════════════════════════════

describe("draftFromConfig", () => {
  it("maps all raw config values to a SettingsDraft", () => {
    const raw = {
      color: "FF0000",
      scheme_v2: true,
      pinned: ["Alice", "Bob"],
      whisper: "Charlie",
      send_on_enter: false,
      hover_preview: false,
      compact: true,
      ban: ["Spammer"],
    };
    expect(draftFromConfig(raw)).toEqual({
      color: "FF0000",
      schemeV2: true,
      pinned: ["Alice", "Bob"],
      whisper: "Charlie",
      sendOnEnter: false,
      hoverPreview: false,
      compact: true,
      ban: ["Spammer"],
    });
  });

  it("strips # prefix from color", () => {
    expect(draftFromConfig({ color: "#ABCDEF" }).color).toBe("ABCDEF");
  });

  it("copies pinned array (independent)", () => {
    const pinned = ["Alice"];
    const draft = draftFromConfig({ pinned });
    expect(draft.pinned).toEqual(["Alice"]);
    expect(draft.pinned).not.toBe(pinned);
  });

  it("falls back to defaults for missing/invalid fields", () => {
    const draft = draftFromConfig({});
    expect(draft.color).toBe("6AAED8");
    expect(draft.schemeV2).toBe(false);
    expect(draft.pinned).toEqual([]);
    expect(draft.whisper).toBe("");
    expect(draft.sendOnEnter).toBe(true);
    expect(draft.hoverPreview).toBe(true);
  });

  it("falls back to defaults for wrong types", () => {
    const draft = draftFromConfig({
      color: 12345,
      scheme_v2: "true",
      pinned: "not-array",
      whisper: 42,
      send_on_enter: "yes",
      hover_preview: 0,
    });
    expect(draft.color).toBe("6AAED8");
    expect(draft.schemeV2).toBe(false);
    expect(draft.pinned).toEqual([]);
    expect(draft.whisper).toBe("");
    expect(draft.sendOnEnter).toBe(true);
    expect(draft.hoverPreview).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// schemeForPreview
// ═══════════════════════════════════════════════════════════════════════════

describe("schemeForPreview", () => {
  it("round-trips the base color as uppercased bgHex", () => {
    const result = schemeForPreview("6AAED8", false);
    expect(result.bgHex).toBe("6AAED8");
  });

  it("produces different schemes for v1 vs v2 (at least one role differs)", () => {
    const v1Result = schemeForPreview("6AAED8", false);
    const v2Result = schemeForPreview("6AAED8", true);
    // Check a few key roles; at least one must differ for the toggle to be meaningful
    const roles: (keyof typeof v1Result)[] = [
      "surface",
      "surfaceRaised",
      "surfaceFooter",
      "surfaceSidebar",
      "surfaceInput",
      "text",
      "textMuted",
      "border",
    ];
    const differs = roles.some((r) => v1Result[r] !== v2Result[r]);
    expect(differs).toBe(true);
  });

  it("does not flip the global scheme flag", () => {
    const before = isV2Scheme();
    // Call with the opposite of whatever is currently active
    schemeForPreview("6AAED8", !before);
    const after = isV2Scheme();
    expect(after).toBe(before);
  });

  it("accepts lowercase input and uppercases bgHex", () => {
    const result = schemeForPreview("6aaed8", false);
    expect(result.bgHex).toBe("6AAED8");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// addPinned
// ═══════════════════════════════════════════════════════════════════════════

describe("addPinned", () => {
  it("lowercases the name to the key form the sidebar matches", () => {
    expect(addPinned([], "Alice")).toEqual(["alice"]);
  });

  it("appends a new name, preserving order", () => {
    expect(addPinned(["alice"], "Bob")).toEqual(["alice", "bob"]);
  });

  it("ignores an exact duplicate (case-insensitive)", () => {
    expect(addPinned(["alice"], "ALICE")).toEqual(["alice"]);
  });

  it("trims whitespace", () => {
    expect(addPinned([], "  Bob  ")).toEqual(["bob"]);
  });

  it("ignores empty/whitespace-only input", () => {
    expect(addPinned(["alice"], "   ")).toEqual(["alice"]);
  });

  // Regression: a proper-case nick must pin. The sidebar looks up pinned
  // entries by user.key (lowercase), so the typed name is normalized to that
  // key form; "Newbie99" stored verbatim never matched user key "newbie99".
  it("stores a proper-case nick as its lowercased key", () => {
    expect(addPinned([], "Newbie99")).toEqual(["newbie99"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// removePinned
// ═══════════════════════════════════════════════════════════════════════════

describe("removePinned", () => {
  it("removes a case-insensitive match", () => {
    expect(removePinned(["Alice", "Bob"], "ALICE")).toEqual(["Bob"]);
  });

  it("returns a new array (does not mutate input)", () => {
    const input = ["Alice", "Bob"];
    const lenBefore = input.length;
    removePinned(input, "Alice");
    expect(input.length).toBe(lenBefore);
    expect(input).toEqual(["Alice", "Bob"]);
  });

  it("removing an absent name leaves the list unchanged", () => {
    expect(removePinned(["Alice"], "Bob")).toEqual(["Alice"]);
  });

  it("removing from an empty list returns empty", () => {
    expect(removePinned([], "Alice")).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// exportFileName
// ═══════════════════════════════════════════════════════════════════════════

describe("exportFileName", () => {
  it("builds the documented filename with user and date", () => {
    expect(exportFileName("testuser", "2026-08-13")).toBe(
      "bettercc-backup-testuser-2026-08-13.json",
    );
  });

  it("falls back to gast for empty user", () => {
    expect(exportFileName("", "2026-08-13")).toBe("bettercc-backup-gast-2026-08-13.json");
  });

  it("accepts gast explicitly", () => {
    expect(exportFileName("gast", "2026-08-13")).toBe("bettercc-backup-gast-2026-08-13.json");
  });

  it("passes through different dates", () => {
    expect(exportFileName("Alice", "2025-12-31")).toBe("bettercc-backup-Alice-2025-12-31.json");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Info tab: ageOrNever / connInfoRows / healthInfoRows / buildDiagnosticsText
// ═══════════════════════════════════════════════════════════════════════════

const NOW = 1_000_000;

function connFixture(): ConnState {
  return { phase: "connected", attempt: 0, since: NOW - 60_000, lastMessageAt: NOW - 5_000 };
}

function freshnessFixture(): FreshnessState {
  return { ulistAt: NOW - 12_000, awAt: NOW - 120_000, statsAt: 0 };
}

function healthFixture(): BccHealthState {
  return {
    bootError: null,
    sendPathBroken: null,
    injectionDegraded: false,
    invalidSettings: [],
    persistFailed: false,
  };
}

describe("ageOrNever", () => {
  it("returns 'nie' for stamp 0 (never delivered)", () => {
    expect(ageOrNever(0, NOW)).toBe("nie");
  });

  it("formats seconds under a minute", () => {
    expect(ageOrNever(NOW - 12_000, NOW)).toBe("vor 12 s");
  });

  it("formats minutes at a minute and above", () => {
    expect(ageOrNever(NOW - 120_000, NOW)).toBe("vor 2 min");
  });

  it("clamps clock skew (now before stamp) to 0 s", () => {
    expect(ageOrNever(NOW + 5_000, NOW)).toBe("vor 0 s");
  });
});

describe("connInfoRows", () => {
  it("renders status, last message and all three source ages", () => {
    const rows = connInfoRows(connFixture(), freshnessFixture(), NOW);
    expect(rows).toEqual([
      { key: "Status", val: "verbunden", bad: false },
      { key: "Letzte Chat-Nachricht", val: "vor 5 s" },
      { key: "Nutzerliste", val: "vor 12 s" },
      { key: "Globale Nutzerliste", val: "vor 2 min" },
      { key: "Statistiken", val: "nie" },
    ]);
  });

  it("shows the retry count while reconnecting and marks it bad", () => {
    const conn = { ...connFixture(), phase: "connecting", attempt: 2 };
    const rows = connInfoRows(conn, freshnessFixture(), NOW);
    expect(rows[0]).toEqual({ key: "Status", val: "Versuch 2", bad: true });
  });

  it("marks authdead bad", () => {
    const conn = { ...connFixture(), phase: "authdead" as const };
    const rows = connInfoRows(conn, freshnessFixture(), NOW);
    expect(rows[0].val).toBe("Session abgelaufen");
    expect(rows[0].bad).toBe(true);
  });
});

describe("healthInfoRows", () => {
  it("renders all checks ok on a clean state", () => {
    const rows = healthInfoRows(healthFixture());
    expect(rows).toEqual([
      { key: "Start", val: "ok", bad: false },
      { key: "Sendepfad", val: "ok", bad: false },
      { key: "Chatframe-Injektion", val: "ok", bad: false },
      { key: "Einstellungen", val: "gültig", bad: false },
      { key: "Speichern", val: "ok", bad: false },
    ]);
  });

  it("boot code maps to the German reason text", () => {
    const health = { ...healthFixture(), bootError: "structure-changed" as const };
    const rows = healthInfoRows(health);
    expect(rows[0].val).toBe(
      "Unerwartete Seitenstruktur — vermutlich hat ChatCity etwas geändert.",
    );
    expect(rows[0].bad).toBe(true);
  });

  it("generic boot code falls back to the raw code (its text is lost)", () => {
    const health = { ...healthFixture(), bootError: "error" as const };
    const rows = healthInfoRows(health);
    expect(rows[0].val).toBe("error");
  });

  it("sendPathBroken shows the raw message", () => {
    const health = { ...healthFixture(), sendPathBroken: "needle not found" };
    const rows = healthInfoRows(health);
    expect(rows[1]).toEqual({ key: "Sendepfad", val: "needle not found", bad: true });
  });

  it("degraded injection shows 'eingeschränkt'", () => {
    const health = { ...healthFixture(), injectionDegraded: true };
    const rows = healthInfoRows(health);
    expect(rows[2]).toEqual({ key: "Chatframe-Injektion", val: "eingeschränkt", bad: true });
  });

  it("invalid settings name the raw keys and values", () => {
    const health = {
      ...healthFixture(),
      invalidSettings: [{ key: "color", value: "C9A227Q" }],
    };
    const rows = healthInfoRows(health);
    expect(rows[3].val).toBe('Ungültige Einstellung — color: "C9A227Q"');
    expect(rows[3].bad).toBe(true);
  });

  it("persist failure shows the persist text", () => {
    const health = { ...healthFixture(), persistFailed: true };
    const rows = healthInfoRows(health);
    expect(rows[4].val).toBe("Speichern fehlgeschlagen — gilt nur bis zum Neuladen.");
    expect(rows[4].bad).toBe(true);
  });
});

describe("buildDiagnosticsText", () => {
  it("renders one English fact per line with JSON state last", () => {
    const f: DiagnosticsFields = {
      version: "3.16.0",
      manager: "Violentmonkey 2.24.1",
      user: "TestUser",
      channel: "Chatcity",
      storageKey: "color_testuser",
      url: "https://www.chatcity.de/de/cpop.html",
      userAgent: "Mozilla/5.0 test",
      time: "2026-08-30T08:00:00.000Z",
      conn: connFixture(),
      bccHealth: healthFixture(),
      freshness: freshnessFixture(),
    };
    const text = buildDiagnosticsText(f);
    const lines = text.split("\n");
    expect(lines).toHaveLength(11);
    expect(lines[0]).toBe("BetterCC v3.16.0");
    expect(lines[1]).toBe("manager: Violentmonkey 2.24.1");
    expect(lines[4]).toBe("storage-key: color_testuser");
    expect(lines[8]).toBe("conn: " + JSON.stringify(f.conn));
    expect(lines[9]).toBe("bccHealth: " + JSON.stringify(f.bccHealth));
    expect(lines[10]).toBe("freshness: " + JSON.stringify(f.freshness));
  });
});
