import { describe, it, expect } from "vitest";
import { patchAwayTimer, buildPatchedHandler } from "../src/v3/patched-handler";

// Minimal fake of <form name="hold"> — buildPatchedHandler only calls
// getAttribute("onsubmit"), so a duck-typed stand-in exercises the real
// integration path without jsdom (the suite is pure-Node by convention).
interface FakeHoldForm {
  onsubmit: string | null;
  getAttribute(name: "onsubmit"): string | null;
}
function fakeHoldForm(onsubmit: string | null): FakeHoldForm {
  return {
    onsubmit,
    getAttribute: () => onsubmit,
  };
}

describe("patchAwayTimer (O1)", () => {
  const needle = 'if((msg.indexOf("/")!=0||msg.indexOf("/me ")==0)){';

  it("adds the /w clause to the away-timer condition", () => {
    const src =
      "function f(){var msg=document.hold.OUT1.value;" + needle + "resetAway();}else{}delout();}";
    const out = patchAwayTimer(src);
    expect(out).toContain('msg.indexOf("/w ")==0');
    // Original structure preserved — only the condition gains the || clause.
    expect(out).toContain("resetAway();}else{}delout();");
  });

  it("replaces exactly once — there is only one away-timer gate", () => {
    const src = "var x=1;" + needle + "y();" + needle + "z();";
    const out = patchAwayTimer(src);
    const replacements = out.split('msg.indexOf("/w ")==0').length - 1;
    expect(replacements).toBe(1);
  });

  it("throws if the upstream needle changed (surfaces silent /w regression)", () => {
    const changed = 'if(!msg.startsWith("/")||msg.startsWith("/me ")){resetAway();}';
    expect(() => patchAwayTimer(changed)).toThrow(/needle not found/i);
  });

  it("throws when the needle is absent", () => {
    expect(() => patchAwayTimer("function f(){}")).toThrow();
  });
});

describe("buildPatchedHandler integration (O1)", () => {
  // The O1 guard must fire through the REAL entry point that input.ts calls
  // at mount — not only via a direct patchAwayTimer() call. The previous
  // buildPatchedHandler wrapped the patch in `needle present ? patch : raw`,
  // so a changed needle took the `: raw` branch and the throw was swallowed:
  // production silently used the unpatched handler, and the regression the
  // guard exists to catch stayed invisible. This test seals the integration
  // path so that can't recur.

  const NEEDLE = 'if((msg.indexOf("/")!=0||msg.indexOf("/me ")==0)){';

  it("throws when the upstream onsubmit needle changed (surfaces /w regression)", () => {
    const changedUpstream =
      "function f(){var msg=document.hold.OUT1.value;" +
      'if(!msg.startsWith("/")||msg.startsWith("/me ")){resetAway();}}';
    const form = fakeHoldForm(changedUpstream) as unknown as HTMLFormElement;
    expect(() => buildPatchedHandler(form)).toThrow(/needle not found/i);
  });

  it("patches the /w clause through the real entry point", () => {
    // Well-formed JS so new Function() compiles it: the needle inside a body
    // with balanced braces. Verifies buildPatchedHandler applies the patch
    // (no throw) and returns a callable.
    const src = "function f(){var msg='hi';" + NEEDLE + "resetAway();}else{}}";
    const form = fakeHoldForm(src) as unknown as HTMLFormElement;
    const fn = buildPatchedHandler(form);
    expect(typeof fn).toBe("function");
  });

  it("returns null when the hold form has no onsubmit", () => {
    const form = fakeHoldForm(null) as unknown as HTMLFormElement;
    expect(buildPatchedHandler(form)).toBeNull();
  });
});
