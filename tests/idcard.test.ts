// Tests for the ID-family entry branch pure logic (src/idcard.ts) plus the
// gate helpers it leans on: getMyIdName (src/upstream.ts) and
// userHasStoredState (src/store.ts). The DOM paint path is impure wiring and
// is proven in the dev replica (specs/idcard-redesign.md).

import { describe, it, expect } from "vitest";
import { isIdFamilyPath, nickFromSettingsHref, buildVarsRule } from "../src/idcard";
import { getMyIdName } from "../src/upstream";
import { userHasStoredState } from "../src/store";
import { generateScheme } from "../src/scheme";

// unsafeWindow is a GM API global, fake it as a plain object (upstream.test idiom).
declare const unsafeWindow: any;
if (!(globalThis as any).unsafeWindow) {
  (globalThis as any).unsafeWindow = {};
}

// In-memory GM fake: only listValues, the one call userHasStoredState makes.
function installListValuesFake(listValues: () => string[] | Promise<string[]>): void {
  (globalThis as any).GM = { listValues };
}

describe("isIdFamilyPath", () => {
  it("matches the three nick-addressed page families and nc", () => {
    const paths = [
      "/de/id/TestUser.html",
      "/de/id/maja01:5F:.html",
      "/de/id/maja01:5F:,20.html",
      "/de/settings/x.html",
      "/de/friends/x.html",
      "/de/nc/index.html",
    ];
    for (const p of paths) expect(isIdFamilyPath(p), p).toBe(true);
  });

  it("rejects foreign paths", () => {
    const paths = ["/de/cpop.html", "/de/id/x", "/de/other/x.html", "/", "/nc/index.html"];
    for (const p of paths) expect(isIdFamilyPath(p), p).toBe(false);
  });
});

describe("nickFromSettingsHref", () => {
  it("extracts a plain nick", () => {
    expect(nickFromSettingsHref("/de/settings/TestUser.html")).toBe("TestUser");
  });

  it("decodes the encoded dump form", () => {
    // decodeChatLink itself is pinned in utils.test.ts; this pins extraction.
    expect(nickFromSettingsHref("/de/settings/maja01:5F:.html")).toBe("maja01_");
  });

  it("returns empty on a non-settings href", () => {
    expect(nickFromSettingsHref("/de/id/x.html")).toBe("");
  });
});

describe("userHasStoredState", () => {
  it("is true when the resolved nick has rows, case-insensitive", async () => {
    installListValuesFake(() => Promise.resolve(["color_testuser", "scheme_v2_testuser"]));
    expect(await userHasStoredState("TestUser")).toBe(true);
  });

  it("is false for a different stored user (multi-account: only the resolved nick counts)", async () => {
    installListValuesFake(() => Promise.resolve(["color_testuser", "scheme_v2_testuser"]));
    expect(await userHasStoredState("ZweiteUser")).toBe(false);
  });

  it("is false with no rows at all", async () => {
    installListValuesFake(() => Promise.resolve([]));
    expect(await userHasStoredState("TestUser")).toBe(false);
  });

  it("never matches gast rows for a real nick", async () => {
    installListValuesFake(() => Promise.resolve(["color_gast"]));
    expect(await userHasStoredState("TestUser")).toBe(false);
  });

  it("accepts a sync listValues array (Violentmonkey returns plain arrays)", async () => {
    installListValuesFake(() => ["color_testuser"]);
    expect(await userHasStoredState("TestUser")).toBe(true);
  });
});

describe("buildVarsRule", () => {
  const rule = buildVarsRule(generateScheme("6AAED8"));

  it("wraps the declarations in one body.bcc-idcard rule", () => {
    expect(rule.startsWith("body.bcc-idcard {")).toBe(true);
    expect(rule.endsWith("}")).toBe(true);
  });

  it("declares only --bcc vars with #-prefixed hex values", () => {
    expect(rule).toContain("--bcc-surface: #");
    const decls = [...rule.matchAll(/^ {2}(--bcc-[a-z-]+): (.+);$/gm)];
    expect(decls.length).toBeGreaterThan(0);
    for (const [, name, value] of decls) {
      expect(value.startsWith("#"), `${name}: ${value}`).toBe(true);
    }
  });

  it("carries no semantic colors (those stay CSS fallbacks, not scheme roles)", () => {
    expect(rule).not.toContain("--bcc-ok");
  });
});

describe("getMyIdName", () => {
  it("reads the myiduname global", () => {
    (unsafeWindow as any).myiduname = "TestUser";
    expect(getMyIdName()).toBe("TestUser");
    delete (unsafeWindow as any).myiduname;
  });

  it("falls back to empty when absent (nc ships no identity global)", () => {
    delete (unsafeWindow as any).myiduname;
    expect(getMyIdName()).toBe("");
  });
});
