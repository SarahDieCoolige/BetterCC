// Tests for the notification strip: stripView priority + transient slot
// semantics. Pure logic only; the DOM render is covered by live verification.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripView, type StripNotice } from "../src/health-strip";
import type { ConnState } from "../src/health-core";

const connected: ConnState = {
  phase: "connected",
  attempt: 0,
  since: 1,
  lastMessageAt: 1,
};

const connecting: ConnState = {
  phase: "connecting",
  attempt: 1,
  since: 1,
  lastMessageAt: 0,
};

describe("stripView — healthy state", () => {
  it("returns null when connected and nothing else is wrong", () => {
    expect(stripView(connected, false, Date.now(), null)).toBeNull();
  });
});

describe("stripView — priority order", () => {
  it("transient notice wins over everything while unexpired", () => {
    const now = Date.now();
    const stuckConn = { ...connecting, since: now - 31_000 };
    const notice: StripNotice = { text: "Bild ist zu gross", color: "#cc0000", until: now + 1000 };
    const view = stripView(stuckConn, true, now, notice);
    expect(view?.text).toBe("Bild ist zu gross");
    expect(view?.color).toBe("#cc0000");
    expect(view?.reload).toBe(false);
  });

  it("expired transient falls through to the persistent lines", () => {
    const now = Date.now();
    const notice: StripNotice = { text: "Bild ist zu gross", color: "#cc0000", until: now - 1 };
    expect(stripView(connected, false, now, notice)).toBeNull();
  });

  it("stuck outranks injection degraded", () => {
    const now = Date.now();
    const conn = { ...connecting, since: now - 31_000 };
    const view = stripView(conn, true, now, null);
    expect(view?.text).toContain("h\u00e4ngt");
    expect(view?.reload).toBe(true);
  });

  it("injection degraded shows with reload while connected", () => {
    const view = stripView(connected, true, Date.now(), null);
    expect(view?.text).toContain("BetterCC-Design");
    expect(view?.reload).toBe(true);
  });

  it("connecting below the stuck threshold shows the offline line, no reload", () => {
    const now = Date.now();
    const conn = { ...connecting, since: now - 5_000 };
    const view = stripView(conn, false, now, null);
    expect(view?.text).toBe("Offline \u2014 Nachrichten gehen evtl. verloren");
    expect(view?.reload).toBe(false);
  });

  it("authdead shows the offline line too (the card owns the real message)", () => {
    const conn: ConnState = { ...connected, phase: "authdead" as const };
    const view = stripView(conn, false, Date.now(), null);
    expect(view?.text).toContain("Offline");
  });
});

describe("strip CSS", () => {
  const css = readFileSync(resolve(import.meta.dirname, "../css/v3.css"), "utf-8");

  it("hidden by default (zero chrome when healthy)", () => {
    const match = css.match(/\.bcc-health-strip\s*\{([^}]*)\}/s);
    expect(match).not.toBeNull();
    expect(match![1]).toContain("display: none");
  });

  it("visible modifier switches to flex", () => {
    expect(css).toContain(".bcc-health-strip.bcc-strip-visible");
  });
});
