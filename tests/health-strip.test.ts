// Tests for the notification strip: stripView priority + transient slot
// semantics. Pure logic only; the DOM render is covered by live verification.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripView, type StripNotice } from "../src/health-strip";

describe("stripView — nothing to say", () => {
  it("returns null when not degraded and no notice", () => {
    expect(stripView(false, Date.now(), null)).toBeNull();
  });
});

describe("stripView — transient notice", () => {
  it("shows the notice verbatim while unexpired, no reload", () => {
    const now = Date.now();
    const notice: StripNotice = { text: "Bild ist zu gross", color: "#cc0000", until: now + 1000 };
    const view = stripView(true, now, notice);
    expect(view?.text).toBe("Bild ist zu gross");
    expect(view?.color).toBe("#cc0000");
    expect(view?.reload).toBe(false);
  });

  it("expired notice falls through to the injection line", () => {
    const now = Date.now();
    const notice: StripNotice = { text: "Bild ist zu gross", color: null, until: now - 1 };
    const view = stripView(true, now, notice);
    expect(view?.text).toContain("BetterCC-Design");
    expect(view?.reload).toBe(true);
  });

  it("expired notice with nothing else wrong hides the strip", () => {
    const now = Date.now();
    const notice: StripNotice = { text: "Bild ist zu gross", color: null, until: now - 1 };
    expect(stripView(false, now, notice)).toBeNull();
  });
});

describe("stripView — injection degraded", () => {
  it("shows the optics text with reload", () => {
    const view = stripView(true, Date.now(), null);
    expect(view?.text).toContain("BetterCC-Design");
    expect(view?.reload).toBe(true);
  });
});

describe("strip CSS", () => {
  const css = readFileSync(resolve(import.meta.dirname, "../css/v3.css"), "utf-8");

  it("hidden by default (zero chrome when healthy)", () => {
    const match = css.match(/\.bcc-health-strip\s*\{([^}]*)\}/s);
    expect(match).not.toBeNull();
    expect(match![1]).toContain("display: none");
  });

  it("absolute and pill-shaped (floats over the chat, no layout shift)", () => {
    const match = css.match(/\.bcc-health-strip\s*\{([^}]*)\}/s);
    expect(match![1]).toContain("position: absolute");
    expect(match![1]).toContain("border-radius: 999px");
  });

  it("visible modifier switches to flex", () => {
    expect(css).toContain(".bcc-health-strip.bcc-strip-visible");
  });
});
