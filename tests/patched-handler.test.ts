import { describe, it, expect } from "vitest";
import { patchAwayTimer } from "../src/v3/patched-handler";

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
