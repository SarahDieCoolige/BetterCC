// Tests for T5: veil + card + auth-dead + draft preservation.
// Pure-function + file-content assertions only; no DOM/jsdom.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ConnState } from "../src/health-core";
import { shouldShowCritical, classifyBootError, buildErrorReport } from "../src/health-ui";
import { DRAFT_KEY, saveDraft, takeDraft, type StorageLike } from "../src/input";
import {
  CARD_AUTHDEAD_TITLE,
  CARD_AUTHDEAD_TEXT,
  ACTION_PAGE_RELOAD,
  ACTION_LATER,
  CARD_BOOT_TITLE,
  BOOT_REASON_STRUCTURE,
  BOOT_REASON_WS,
  CARD_BOOT_RUNS_ON,
  ACTION_COPY_DETAILS,
  ACTION_CONTINUE_CHAT,
  CARD_SEND_BROKEN_TITLE,
  CARD_SEND_BROKEN_TEXT,
  ACTION_COPY_ERROR,
  TOAST_COPIED,
  STATE_UNAVAILABLE,
} from "../src/health-strings";

// ─── StorageLike fake (Map-backed, no real sessionStorage) ────────────────────

class FakeStorage implements StorageLike {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

// ─── 1. shouldShowCritical truth table ────────────────────────────────────────

describe("shouldShowCritical", () => {
  const authDead: ConnState = {
    phase: "authdead",
    attempt: 0,
    since: 1,
    lastMessageAt: 0,
    notice: "",
  };

  const connected: ConnState = {
    phase: "connected",
    attempt: 0,
    since: 1,
    lastMessageAt: 1,
    notice: "",
  };

  const connecting: ConnState = {
    phase: "connecting",
    attempt: 1,
    since: 1,
    lastMessageAt: 0,
    notice: "",
  };

  it("returns true for authdead + not dismissed", () => {
    expect(shouldShowCritical(authDead, false)).toBe(true);
  });

  it("returns false for authdead + dismissed", () => {
    expect(shouldShowCritical(authDead, true)).toBe(false);
  });

  it("returns false for connected", () => {
    expect(shouldShowCritical(connected, false)).toBe(false);
  });

  it("returns false for connecting", () => {
    expect(shouldShowCritical(connecting, false)).toBe(false);
  });
});

// ─── 2. Dismissal is view state only ────────────────────────────────────────

describe("dismissal is view state only", () => {
  it("flipping dismissed changes output while the conn object stays unchanged", () => {
    const conn: ConnState = {
      phase: "authdead",
      attempt: 0,
      since: 1,
      lastMessageAt: 0,
      notice: "",
    };

    expect(shouldShowCritical(conn, false)).toBe(true);

    // The conn object still reads authdead after the flag flips.
    expect(conn.phase).toBe("authdead");
    expect(shouldShowCritical(conn, true)).toBe(false);

    // The latch survives; no store write is involved.
    expect(conn.phase).toBe("authdead");
  });
});

// ─── 3. Draft roundtrip ───────────────────────────────────────────────────

describe("draft roundtrip", () => {
  it("saveDraft then takeDraft returns the value", () => {
    const s = new FakeStorage();
    saveDraft(s, "hallo");
    expect(takeDraft(s)).toBe("hallo");
  });

  it("second takeDraft returns empty (cleared on read)", () => {
    const s = new FakeStorage();
    saveDraft(s, "hallo");
    takeDraft(s); // consume
    expect(takeDraft(s)).toBe("");
  });
});

// ─── 4. Empty/whitespace draft removes stale key ──────────────────────────────

describe("empty/whitespace draft removes stale key", () => {
  it("saving empty string clears the key", () => {
    const s = new FakeStorage();
    saveDraft(s, "alt");
    saveDraft(s, "");
    expect(takeDraft(s)).toBe("");
  });

  it("saving whitespace clears the key", () => {
    const s = new FakeStorage();
    saveDraft(s, "alt");
    saveDraft(s, "  ");
    expect(takeDraft(s)).toBe("");
  });
});

// ─── 5. CSS file assertions ─────────────────────────────────────────────────

describe("veil + card CSS", () => {
  const css = readFileSync(resolve(import.meta.dirname, "../css/v3.css"), "utf-8");

  it("veil has pointer-events: none", () => {
    // Extract the .bcc-health-veil rule block and check for pointer-events: none
    const veilMatch = css.match(/\.bcc-health-veil\s*\{([^}]*)\}/s);
    expect(veilMatch).not.toBeNull();
    expect(veilMatch![1]).toContain("pointer-events: none");
  });

  it("card has pointer-events: auto", () => {
    const cardMatch = css.match(/\.bcc-health-card\s*\{([^}]*)\}/s);
    expect(cardMatch).not.toBeNull();
    expect(cardMatch![1]).toContain("pointer-events: auto");
  });
});

// ─── 6. Strings conformance ────────────────────────────────────────────────

describe("health-strings conformance", () => {
  it("has the authdead card title", () => {
    expect(CARD_AUTHDEAD_TITLE).toBe("Session abgelaufen");
  });

  it("has the authdead card text (incl. em-dash)", () => {
    expect(CARD_AUTHDEAD_TEXT).toBe(
      "L\u00e4sst sich nicht automatisch erneuern. Seite neu laden meldet dich direkt wieder an \u2014 dein Text bleibt erhalten.",
    );
  });

  it("has the page reload action label", () => {
    expect(ACTION_PAGE_RELOAD).toBe("Seite neu laden");
  });

  it("has the later action label", () => {
    expect(ACTION_LATER).toBe("Sp\u00e4ter");
  });
});

// ─── 7. Draft key constant ──────────────────────────────────────────────────

describe("DRAFT_KEY", () => {
  it("equals bcc_draft", () => {
    expect(DRAFT_KEY).toBe("bcc_draft");
  });
});

// ─── 8. classifyBootError (T6) ─────────────────────────────────────────────

describe("classifyBootError", () => {
  it("maps TypeError to BOOT_REASON_STRUCTURE", () => {
    expect(classifyBootError(new TypeError("null is not an object"))).toBe(BOOT_REASON_STRUCTURE);
  });

  it("maps a generic Error to its message", () => {
    expect(classifyBootError(new Error("boom"))).toBe("boom");
  });

  it("maps a thrown string to itself", () => {
    expect(classifyBootError("oops")).toBe("oops");
  });
});

// ─── 9. buildErrorReport (T6) ───────────────────────────────────────────────

describe("buildErrorReport", () => {
  it("contains version, title, subject, detail, and state dump", () => {
    const report = buildErrorReport("3.0.0", "Titel", "Subjekt", "line 42", '{"key":"val"}');
    expect(report).toContain("BetterCC v3.0.0");
    expect(report).toContain("Titel");
    expect(report).toContain("Subjekt");
    expect(report).toContain("line 42");
    expect(report).toContain('{"key":"val"}');
  });

  it("skips null detail", () => {
    const report = buildErrorReport("3.0.0", "Titel", "Subjekt", null, '{"key":"val"}');
    expect(report).not.toContain("null");
    expect(report).toContain("BetterCC v3.0.0");
  });

  it("uses STATE_UNAVAILABLE when stateDump is null", () => {
    const report = buildErrorReport("3.0.0", "Titel", "Subjekt", null, null);
    expect(report).toContain(STATE_UNAVAILABLE);
  });

  it("each field is on its own line (newline-separated)", () => {
    const report = buildErrorReport("1.0", "T", "S", "D", "ST");
    const lines = report.split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(4);
  });
});

// ─── 10. T6 string conformance ─────────────────────────────────────────────

describe("T6 health-strings conformance", () => {
  it("CARD_BOOT_TITLE matches verbatim", () => {
    expect(CARD_BOOT_TITLE).toBe("BetterCC konnte nicht starten");
  });

  it("BOOT_REASON_STRUCTURE includes em-dash escape", () => {
    expect(BOOT_REASON_STRUCTURE).toBe(
      "Unerwartete Seitenstruktur \u2014 vermutlich hat ChatCity etwas ge\u00e4ndert.",
    );
  });

  it("BOOT_REASON_WS matches verbatim", () => {
    expect(BOOT_REASON_WS).toBe("Chat-WebSocket konnte nicht \u00fcbernommen werden.");
  });

  it("CARD_BOOT_RUNS_ON includes em-dash escape", () => {
    expect(CARD_BOOT_RUNS_ON).toBe("Der Chat l\u00e4uft weiter \u2014 nur ohne BetterCC.");
  });

  it("ACTION_COPY_DETAILS matches verbatim", () => {
    expect(ACTION_COPY_DETAILS).toBe("Details kopieren");
  });

  it("ACTION_CONTINUE_CHAT matches verbatim", () => {
    expect(ACTION_CONTINUE_CHAT).toBe("Weiter chatten");
  });

  it("CARD_SEND_BROKEN_TITLE matches verbatim", () => {
    expect(CARD_SEND_BROKEN_TITLE).toBe("Senden defekt");
  });

  it("CARD_SEND_BROKEN_TEXT matches verbatim", () => {
    expect(CARD_SEND_BROKEN_TEXT).toBe(
      "ChatCity hat den Sendeweg ge\u00e4ndert. Hilft nur ein BetterCC-Update.",
    );
  });

  it("ACTION_COPY_ERROR matches verbatim", () => {
    expect(ACTION_COPY_ERROR).toBe("Fehler kopieren");
  });

  it("TOAST_COPIED matches verbatim", () => {
    expect(TOAST_COPIED).toBe("Kopiert.");
  });

  it("STATE_UNAVAILABLE matches verbatim", () => {
    expect(STATE_UNAVAILABLE).toBe("Zustand nicht verf\u00fcgbar");
  });
});

// ─── 11. Thin-glue source assertions (T6) ───────────────────────────────────

describe("T6 source wiring", () => {
  const srcDir = resolve(import.meta.dirname, "../src");

  it("index.ts catches boot failure via .catch(handleBootFailure)", () => {
    const src = readFileSync(resolve(srcDir, "index.ts"), "utf-8");
    expect(src).toContain("initV3().catch(handleBootFailure)");
  });

  it("input.ts routes send-path errors to reportSendPathBroken", () => {
    const src = readFileSync(resolve(srcDir, "input.ts"), "utf-8");
    expect(src).toContain("reportSendPathBroken(");
  });

  it("health-ui.ts has clipboard execCommand fallback", () => {
    const src = readFileSync(resolve(srcDir, "health-ui.ts"), "utf-8");
    expect(src).toContain('execCommand("copy")');
  });

  it("mountHealthUi reacts to bccHealth for B3 card", () => {
    const src = readFileSync(resolve(srcDir, "health-ui.ts"), "utf-8");
    expect(src).toContain('react("bccHealth"');
  });
});
