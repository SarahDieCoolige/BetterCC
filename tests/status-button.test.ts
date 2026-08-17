// Tests for status-button.ts: pure ButtonView derivation + health-strings.
//
// No DOM, no document, no jsdom. buttonView() is a pure function over ConnState.
// Strings are pinned verbatim so no consumer invents wording.

import { describe, it, expect } from "vitest";
import { buttonView } from "../src/status-button";
import {
  STATUS_BUTTON_TITLE,
  STATUS_TEXT,
  statusButtonTitle,
  retryText,
} from "../src/health-strings";
import type { ConnState } from "../src/health-core";

// ─── Helpers ────────────────────────────────────────────────────────────────

function conn(partial: Partial<ConnState>): ConnState {
  return {
    phase: "connecting",
    attempt: 0,
    since: 0,
    lastMessageAt: 0,
    notice: "",
    ...partial,
  };
}

// ─── buttonView derivation ─────────────────────────────────────────────────

describe("buttonView", () => {
  it("connected: static fa-sync, spinning false, badge null, 'verbunden'", () => {
    const view = buttonView(conn({ phase: "connected" }));
    expect(view).toEqual({
      icon: "fa-sync",
      spinning: false,
      badge: null,
      stateText: "verbunden",
    });
  });

  it("connecting attempt 0: spinning, badge null, 'verbinde...'", () => {
    const view = buttonView(conn({ phase: "connecting", attempt: 0 }));
    expect(view).toEqual({
      icon: "fa-sync",
      spinning: true,
      badge: null,
      stateText: "verbinde\u2026",
    });
  });

  it("connecting attempt 1: identical view to attempt 0 (no badge on first retry)", () => {
    const v0 = buttonView(conn({ phase: "connecting", attempt: 0 }));
    const v1 = buttonView(conn({ phase: "connecting", attempt: 1 }));
    expect(v1).toEqual(v0);
  });

  it("connecting attempt 2: badge 2, 'Versuch 2'", () => {
    const view = buttonView(conn({ phase: "connecting", attempt: 2 }));
    expect(view).toEqual({
      icon: "fa-sync",
      spinning: true,
      badge: 2,
      stateText: "Versuch 2",
    });
  });

  it("connecting attempt 5: badge 5, 'Versuch 5'", () => {
    const view = buttonView(conn({ phase: "connecting", attempt: 5 }));
    expect(view).toEqual({
      icon: "fa-sync",
      spinning: true,
      badge: 5,
      stateText: "Versuch 5",
    });
  });

  it("authdead: fa-triangle-exclamation, no spin, badge null, 'Session abgelaufen'", () => {
    const view = buttonView(conn({ phase: "authdead", attempt: 3 }));
    expect(view).toEqual({
      icon: "fa-triangle-exclamation",
      spinning: false,
      badge: null,
      stateText: "Session abgelaufen",
    });
  });

  it("recovery: retry 4 then connected -> badge gone, healthy view", () => {
    const retry = buttonView(conn({ phase: "connecting", attempt: 4 }));
    const healthy = buttonView(conn({ phase: "connected", attempt: 0 }));
    expect(retry.badge).toBe(4);
    expect(healthy.badge).toBe(null);
    expect(healthy.spinning).toBe(false);
    expect(healthy.stateText).toBe("verbunden");
  });

  it("no-flicker guard: lastMessageAt differences produce equal views", () => {
    const a = buttonView(conn({ phase: "connected", lastMessageAt: 100, since: 50 }));
    const b = buttonView(conn({ phase: "connected", lastMessageAt: 999, since: 200 }));
    expect(a).toEqual(b);
  });

  it("no-flicker guard: since differences during connecting produce equal views", () => {
    const a = buttonView(conn({ phase: "connecting", attempt: 0, since: 100 }));
    const b = buttonView(conn({ phase: "connecting", attempt: 0, since: 200 }));
    expect(a).toEqual(b);
  });
});

// ─── health-strings conformance ────────────────────────────────────────────

describe("health-strings", () => {
  it("STATUS_BUTTON_TITLE contains the em-dash template", () => {
    expect(STATUS_BUTTON_TITLE).toBe("Chat neu laden \u2014 {state}");
  });

  it("statusButtonTitle substitutes correctly", () => {
    expect(statusButtonTitle("verbunden")).toBe("Chat neu laden \u2014 verbunden");
  });

  it("each STATUS_TEXT value is verbatim", () => {
    expect(STATUS_TEXT.connected).toBe("verbunden");
    expect(STATUS_TEXT.connecting).toBe("verbinde\u2026");
    expect(STATUS_TEXT.retry).toBe("Versuch {n}");
    expect(STATUS_TEXT.authdead).toBe("Session abgelaufen");
    expect(STATUS_TEXT.zombie).toBe("reagiert nicht");
  });

  it("retryText produces correct German string", () => {
    expect(retryText(2)).toBe("Versuch 2");
    expect(retryText(1)).toBe("Versuch 1");
    expect(retryText(10)).toBe("Versuch 10");
  });
});
