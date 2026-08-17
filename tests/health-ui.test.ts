// Tests for T5: veil + card + auth-dead + draft preservation.
// Pure-function + file-content assertions only; no DOM/jsdom.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ConnState } from "../src/health-core";
import { shouldShowCritical } from "../src/health-ui";
import { DRAFT_KEY, saveDraft, takeDraft, type StorageLike } from "../src/input";
import {
  CARD_AUTHDEAD_TITLE,
  CARD_AUTHDEAD_TEXT,
  ACTION_PAGE_RELOAD,
  ACTION_LATER,
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
