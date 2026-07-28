import { describe, it, expect, beforeEach } from "vitest";
import {
  getUserKey,
  setUserStore,
  getUserStore,
  superbanEnable,
  replaceInputFieldEnable,
  noChatBackgroundsEnable,
  NotificationsEnable,
} from "../src/utils";

describe("getUserKey", () => {
  beforeEach(() => {
    setUserStore("testuser", false);
  });

  it("prefixes key with lowercase nick", () => {
    expect(getUserKey("ban_list")).toBe("testuser_ban_list");
  });

  it("handles empty key", () => {
    expect(getUserKey("")).toBe("testuser_");
  });

  it("uses 'gast' prefix when user is guest", () => {
    setUserStore("Anything", true);
    expect(getUserKey("color")).toBe("gast_color");
  });
});

describe("setUserStore / getUserStore", () => {
  it("stores lowercase nick for registered user", () => {
    setUserStore("Sariam", false);
    expect(getUserStore()).toBe("sariam");
  });

  it("stores 'gast' for guest users regardless of nick", () => {
    setUserStore("Guest123", true);
    expect(getUserStore()).toBe("gast");
  });
});

describe("feature flags", () => {
  it("are defined as numbers", () => {
    expect(typeof superbanEnable).toBe("number");
    expect(typeof replaceInputFieldEnable).toBe("number");
    expect(typeof noChatBackgroundsEnable).toBe("number");
    expect(typeof NotificationsEnable).toBe("number");
  });
});
