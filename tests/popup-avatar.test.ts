// Tests für die nickToHue Hilfsfunktion — stabiler HSL-Farbton aus dem
// Benutzernamen für den Initial-Buchstaben-Avatar im User-Popup.
import { describe, it, expect } from "vitest";
import { nickToHue } from "../src/popup";

describe("nickToHue", () => {
  // ─── Deterministisch ──────────────────────────────────────────────────

  it("returns the same hue for the same input on repeated calls", () => {
    const a = nickToHue("TestUser");
    const b = nickToHue("TestUser");
    expect(a).toBe(b);
  });

  // ─── Wertebereich 0–359 ───────────────────────────────────────────────

  it("returns values in 0–359 for ASCII input", () => {
    const hue = nickToHue("TestUser");
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThanOrEqual(359);
  });

  it("returns 0–359 for empty string (sum=0, 0%360=0)", () => {
    const hue = nickToHue("");
    expect(hue).toBe(0);
  });

  it("returns 0–359 for German umlauts (e.g. Mädchen)", () => {
    const hue = nickToHue("Mädchen");
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThanOrEqual(359);
  });

  it("returns 0–359 for CJK characters (e.g. 测试)", () => {
    const hue = nickToHue("测试");
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThanOrEqual(359);
  });

  // ─── Verschiedene Eingaben ────────────────────────────────────────────

  it("different nicks produce stable per-input hues", () => {
    const hueA1 = nickToHue("TestUser");
    const hueA2 = nickToHue("TestUser");
    const hueB1 = nickToHue("OtherUser");
    const hueB2 = nickToHue("OtherUser");

    // Same input → same output (stable)
    expect(hueA1).toBe(hueA2);
    expect(hueB1).toBe(hueB2);
  });
});
