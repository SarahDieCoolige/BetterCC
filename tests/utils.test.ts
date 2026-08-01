import { describe, it, expect, beforeEach } from "vitest";
import { getUserKey, setUserStore } from "../src/utils";

describe("getUserKey", () => {
  beforeEach(() => {
    setUserStore("testuser", false);
  });

  it("suffixes the key with the lowercase nick: {key}_{user}", () => {
    // Matches the old path's hand-rolled keys ("color_" + userStore) so v3
    // reads existing users' saved data with no migration (spec §6.5, A6).
    expect(getUserKey("ban")).toBe("ban_testuser");
  });

  it("handles empty key", () => {
    expect(getUserKey("")).toBe("_testuser");
  });

  it("uses 'gast' as the user suffix when the user is a guest", () => {
    setUserStore("Anything", true);
    expect(getUserKey("color")).toBe("color_gast");
  });
});

describe("setUserStore", () => {
  it("stores lowercase nick for registered user (readable via getUserKey)", () => {
    setUserStore("Sariam", false);
    expect(getUserKey("whisper")).toBe("whisper_sariam");
  });

  it("stores 'gast' for guest users regardless of nick", () => {
    setUserStore("Guest123", true);
    expect(getUserKey("color")).toBe("color_gast");
  });
});
