// Tests for the v3 feature-flag selection logic.
//
// The IIFE wiring in src/index.ts isn't unit-testable (it runs in the
// userscript/DOM/GM context), but the *decision* of which init path to take
// is pure: (stored flag value, current URL) → boolean. We test that helper.

import { describe, it, expect } from "vitest";
import { shouldUseV3 } from "../src/v3/flag";

describe("shouldUseV3", () => {
  it("returns false by default — old path is the safe default", () => {
    expect(shouldUseV3(undefined, "https://www.chatcity.de/de/cpop.html?x=1")).toBe(false);
    expect(shouldUseV3(null, "https://www.chatcity.de/de/cpop.html?x=1")).toBe(false);
    expect(shouldUseV3(false, "https://www.chatcity.de/de/cpop.html?x=1")).toBe(false);
  });

  it("returns true when the GM-stored flag is truthy", () => {
    expect(shouldUseV3(true, "https://www.chatcity.de/de/cpop.html?x=1")).toBe(true);
    expect(shouldUseV3(1, "https://www.chatcity.de/de/cpop.html?x=1")).toBe(true);
    expect(shouldUseV3("1", "https://www.chatcity.de/de/cpop.html?x=1")).toBe(true);
  });

  it("returns true when the dev-server URL override ?bcc=new is present", () => {
    expect(shouldUseV3(undefined, "http://localhost:8765/cpop.html?bcc=new")).toBe(true);
    expect(shouldUseV3(false, "http://localhost:8765/cpop.html?foo=bar&bcc=new")).toBe(true);
  });

  it("ignores ?bcc=1 — that is the old UI, not the v3 override", () => {
    expect(shouldUseV3(undefined, "http://localhost:8765/cpop.html?bcc=1")).toBe(false);
    expect(shouldUseV3(false, "http://localhost:8765/cpop.html?bcc=1&other=2")).toBe(false);
  });

  it("the URL override wins even if the stored flag is off", () => {
    expect(shouldUseV3(false, "http://localhost:8765/cpop.html?bcc=new")).toBe(true);
  });

  it("the URL override and stored flag are independent — either enables v3", () => {
    expect(shouldUseV3(true, "http://localhost:8765/cpop.html?bcc=1")).toBe(true);
    expect(shouldUseV3(false, "http://localhost:8765/cpop.html?bcc=new")).toBe(true);
  });

  it("does not misread ?bcc=newvalue or ?newbcc= as the override", () => {
    expect(shouldUseV3(undefined, "http://localhost:8765/cpop.html?bcc=newvalue")).toBe(false);
    expect(shouldUseV3(undefined, "http://localhost:8765/cpop.html?newbcc=new")).toBe(false);
    expect(shouldUseV3(undefined, "http://localhost:8765/cpop.html?bcc=newer")).toBe(false);
  });
});
