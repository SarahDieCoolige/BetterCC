import { describe, it, expect } from "vitest";

// Replicate the pure logic from superban.ts for testing
// These functions are embedded in enableSuperban, extracted for testability

function getUsersToBeBanned(users: string[], superbans: string[], alreadyBanned: string[]): string[] {
  var usersToBeBanned: string[] = [];

  for (const banUser of superbans) {
    if (
      !usersToBeBanned.includes(banUser) &&
      !alreadyBanned.includes(banUser) &&
      users.includes(banUser)
    ) {
      usersToBeBanned.push(banUser);
    }
  }
  return usersToBeBanned;
}

describe("getUsersToBeBanned", () => {
  it("returns superbanned users that are online", () => {
    const users = ["alice", "bob", "charlie"];
    const superbans = ["alice", "dave"];
    const alreadyBanned: string[] = [];

    expect(getUsersToBeBanned(users, superbans, alreadyBanned)).toEqual(["alice"]);
  });

  it("excludes already banned users", () => {
    const users = ["alice", "bob"];
    const superbans = ["alice", "bob"];
    const alreadyBanned = ["alice"];

    expect(getUsersToBeBanned(users, superbans, alreadyBanned)).toEqual(["bob"]);
  });

  it("excludes superbanned users not currently online", () => {
    const users = ["alice"];
    const superbans = ["alice", "dave"];
    const alreadyBanned: string[] = [];

    expect(getUsersToBeBanned(users, superbans, alreadyBanned)).toEqual(["alice"]);
  });

  it("returns empty when no one to ban", () => {
    const users = ["alice"];
    const superbans: string[] = [];
    const alreadyBanned: string[] = [];

    expect(getUsersToBeBanned(users, superbans, alreadyBanned)).toEqual([]);
  });

  it("returns empty when all already banned", () => {
    const users = ["alice"];
    const superbans = ["alice"];
    const alreadyBanned = ["alice"];

    expect(getUsersToBeBanned(users, superbans, alreadyBanned)).toEqual([]);
  });

  it("returns empty when no superbans are online", () => {
    const users = ["alice"];
    const superbans = ["bob"];
    const alreadyBanned: string[] = [];

    expect(getUsersToBeBanned(users, superbans, alreadyBanned)).toEqual([]);
  });

  it("handles duplicate entries in users list", () => {
    const users = ["alice", "alice", "bob"];
    const superbans = ["alice"];
    const alreadyBanned: string[] = [];

    expect(getUsersToBeBanned(users, superbans, alreadyBanned)).toEqual(["alice"]);
  });

  it("deduplicates: each user appears only once in result", () => {
    const users = ["alice", "bob"];
    const superbans = ["alice", "alice"];
    const alreadyBanned: string[] = [];

    const result = getUsersToBeBanned(users, superbans, alreadyBanned);
    expect(result).toEqual(["alice"]);
    expect(result.length).toBe(1);
  });
});
