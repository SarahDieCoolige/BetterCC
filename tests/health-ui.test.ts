// Tests for T5: veil + card + auth-dead + draft preservation.
// Pure-function + file-content assertions only; no DOM/jsdom.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ConnState } from "../src/health-core";
import {
  shouldShowCritical,
  bootErrorCode,
  bootDisplayFor,
  buildErrorReport,
  bannerView,
  type ReportFields,
} from "../src/health-ui";
import { offlineHintVisible } from "../src/input";
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
  BANNER_STUCK_TEXT,
  BANNER_OPTICS_TEXT,
  ACTION_RELOAD,
  INPUT_OFFLINE_HINT,
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

// ─── 8. boot error codes (store carries codes, not German strings) ──────────

describe("bootErrorCode", () => {
  it("maps TypeError to structure-changed", () => {
    expect(bootErrorCode(new TypeError("null is not an object"))).toBe("structure-changed");
  });

  it("maps a generic Error to error", () => {
    expect(bootErrorCode(new Error("boom"))).toBe("error");
  });

  it("maps a thrown string to error", () => {
    expect(bootErrorCode("oops")).toBe("error");
  });
});

describe("bootDisplayFor", () => {
  it("maps structure-changed to the German card text", () => {
    expect(bootDisplayFor("structure-changed")).toBe(BOOT_REASON_STRUCTURE);
  });

  it("maps ws-takeover to the German card text", () => {
    expect(bootDisplayFor("ws-takeover")).toBe(BOOT_REASON_WS);
  });

  it("returns null for the generic error code (card comes from the live error)", () => {
    expect(bootDisplayFor("error")).toBeNull();
  });
});

// ─── 9. Diagnostics payload (reworked: English, structured, sliced state) ────

describe("buildErrorReport", () => {
  const full: ReportFields = {
    version: "3.11.0",
    context: "boot",
    reason: "structure-changed",
    error: "TypeError: cannot read properties of null",
    stack: "line1\nline2",
    url: "https://www.chatcity.de/cpop.html",
    userAgent: "Mozilla/5.0 test",
    time: "2026-08-17T15:00:00.000Z",
    state: {
      conn: { phase: "connecting" },
      bccHealth: { bootError: "x" },
      freshness: { ulistAt: 1 },
    },
  };

  it("emits key:value lines in a fixed order", () => {
    const lines = buildErrorReport(full).split("\n");
    expect(lines[0]).toBe("BetterCC v3.11.0");
    expect(lines.slice(1)).toEqual([
      "context: boot",
      "reason: structure-changed",
      "error: TypeError: cannot read properties of null",
      "stack: line1",
      "line2",
      "url: https://www.chatcity.de/cpop.html",
      "ua: Mozilla/5.0 test",
      "time: 2026-08-17T15:00:00.000Z",
      'conn: {"phase":"connecting"}',
      'bccHealth: {"bootError":"x"}',
      'freshness: {"ulistAt":1}',
    ]);
  });

  it("omits the error and stack lines when null", () => {
    const report = buildErrorReport({ ...full, error: null, stack: null });
    expect(report).not.toContain("error:");
    expect(report).not.toContain("stack:");
    expect(report).toContain("reason: structure-changed");
  });

  it("writes one compact JSON line per state key", () => {
    const report = buildErrorReport(full);
    expect(report).toContain('\nconn: {"phase":"connecting"}');
    expect(report.split("\n").filter((l) => l.startsWith("conn:"))).toHaveLength(1);
  });

  it("falls back to a single unavailable line when the store never initialized", () => {
    const report = buildErrorReport({ ...full, state: null });
    expect(report).toContain("state: unavailable");
    expect(report).not.toContain("conn:");
    expect(report).not.toContain("bccHealth:");
    expect(report).not.toContain("freshness:");
  });

  it("contains no German words from the UI copy", () => {
    const report = buildErrorReport({ ...full, reason: "unknown" });
    expect(report).not.toMatch(/Zustand|könnte nicht starten|Seitenstruktur/);
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

// ─── 12. bannerView (T7) ──────────────────────────────────────────────────

describe("bannerView", () => {
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

  it("returns null when connected", () => {
    expect(bannerView(connected, false, Date.now())).toBeNull();
  });

  it("returns null when connecting for 29s (below stuck threshold)", () => {
    const now = Date.now();
    const conn: ConnState = { ...connecting, since: now - 29_000 };
    expect(bannerView(conn, false, now)).toBeNull();
  });

  it("returns stuck text when connecting for 31s (above stuck threshold)", () => {
    const now = Date.now();
    const conn: ConnState = { ...connecting, since: now - 31_000 };
    expect(bannerView(conn, false, now)).toBe(BANNER_STUCK_TEXT);
  });

  it("returns null when connecting but since = 0", () => {
    const conn: ConnState = { ...connecting, since: 0 };
    expect(bannerView(conn, false, Date.now())).toBeNull();
  });

  it("returns optics text when injectionDegraded (even while connected)", () => {
    expect(bannerView(connected, true, Date.now())).toBe(BANNER_OPTICS_TEXT);
  });

  it("optics wins when both stuck and injectionDegraded hold", () => {
    const now = Date.now();
    const conn: ConnState = { ...connecting, since: now - 31_000 };
    expect(bannerView(conn, true, now)).toBe(BANNER_OPTICS_TEXT);
  });
});

// ─── 13. offlineHintVisible (T7) ──────────────────────────────────────────

describe("offlineHintVisible", () => {
  it("returns false for connected", () => {
    const conn: ConnState = {
      phase: "connected",
      attempt: 0,
      since: 1,
      lastMessageAt: 1,
      notice: "",
    };
    expect(offlineHintVisible(conn)).toBe(false);
  });

  it("returns true for connecting", () => {
    const conn: ConnState = {
      phase: "connecting",
      attempt: 1,
      since: 1,
      lastMessageAt: 0,
      notice: "",
    };
    expect(offlineHintVisible(conn)).toBe(true);
  });

  it("returns true for authdead", () => {
    const conn: ConnState = {
      phase: "authdead",
      attempt: 0,
      since: 1,
      lastMessageAt: 0,
      notice: "",
    };
    expect(offlineHintVisible(conn)).toBe(true);
  });
});

// ─── 14. T7 string conformance ─────────────────────────────────────────────

describe("T7 health-strings conformance", () => {
  it("BANNER_STUCK_TEXT matches verbatim (incl. em-dash escape)", () => {
    expect(BANNER_STUCK_TEXT).toBe("Verbindung h\u00e4ngt \u2014 seit \u00fcber 30 Sekunden");
  });

  it("BANNER_OPTICS_TEXT matches verbatim (incl. em-dash escape)", () => {
    expect(BANNER_OPTICS_TEXT).toBe("BetterCC-Optik fehlt \u2014 Chat l\u00e4uft normal");
  });

  it("ACTION_RELOAD matches verbatim", () => {
    expect(ACTION_RELOAD).toBe("Neu laden");
  });

  it("INPUT_OFFLINE_HINT matches verbatim (incl. em-dash escape)", () => {
    expect(INPUT_OFFLINE_HINT).toBe("Offline \u2014 Nachrichten gehen evtl. verloren");
  });
});

// ─── 15. T7 CSS file assertions ───────────────────────────────────────────

describe("T7 banner + offline hint CSS", () => {
  const css = readFileSync(resolve(import.meta.dirname, "../css/v3.css"), "utf-8");

  it("banner has position: absolute and var(--bcc-warn)", () => {
    const match = css.match(/\.bcc-health-banner\s*\{([^}]*)\}/s);
    expect(match).not.toBeNull();
    expect(match![1]).toContain("position: absolute");
    expect(match![1]).toContain("var(--bcc-warn)");
  });

  it("offline hint has pointer-events: none and display: none", () => {
    const match = css.match(/\.bcc-offline-hint\s*\{([^}]*)\}/s);
    expect(match).not.toBeNull();
    expect(match![1]).toContain("pointer-events: none");
    expect(match![1]).toContain("display: none");
  });

  it("bcc-offline-hint.bcc-offline-visible rule exists", () => {
    expect(css).toContain(".bcc-offline-hint.bcc-offline-visible");
  });
});

// ─── 16. T7 source wiring assertions ──────────────────────────────────────

describe("T7 source wiring", () => {
  const srcDir = resolve(import.meta.dirname, "../src");

  it("ws-hook.ts contains reportInjectionDegraded(true)", () => {
    const src = readFileSync(resolve(srcDir, "ws-hook.ts"), "utf-8");
    expect(src).toContain("reportInjectionDegraded(true)");
  });

  it("ws-hook.ts contains reportInjectionDegraded(false)", () => {
    const src = readFileSync(resolve(srcDir, "ws-hook.ts"), "utf-8");
    expect(src).toContain("reportInjectionDegraded(false)");
  });

  it("ws-hook.ts latches the ws-takeover code", () => {
    const src = readFileSync(resolve(srcDir, "ws-hook.ts"), "utf-8");
    expect(src).toContain('reportBootError("ws-takeover")');
  });

  it("input.ts contains INPUT_OFFLINE_HINT", () => {
    const src = readFileSync(resolve(srcDir, "input.ts"), "utf-8");
    expect(src).toContain("INPUT_OFFLINE_HINT");
  });

  it("health-ui.ts contains renderBanner()", () => {
    const src = readFileSync(resolve(srcDir, "health-ui.ts"), "utf-8");
    expect(src).toContain("renderBanner()");
  });

  it("health-ui.ts contains STUCK_MS", () => {
    const src = readFileSync(resolve(srcDir, "health-ui.ts"), "utf-8");
    expect(src).toContain("STUCK_MS");
  });
});
