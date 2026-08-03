// Tests for the set_uinfo1 override's pure core: parse + diff in one function.
// The override itself (mutating unsafeWindow) is an untestable DOM boundary,
// but processUserlist() wraps parseUserlist + diffUserlists into one call and
// is fully testable with the existing pure-logic suite.
//
// The sidebar rendering (Map-based diff-and-patch) is DOM code and untestable
// here (no jsdom); verified manually per the task's Playwright verify step.

import { describe, it, expect } from "vitest";
import { parseUserlist, type User } from "../src/userlist";
import { processUserlist } from "../src/userlist-wire";

describe("processUserlist — parse + diff, the set_uinfo1 core", () => {
  it("on first call (empty prevList), reports every user as added", () => {
    const chaMy = ["Alpha", "hR", "Beta", "hR", ""];
    const result = processUserlist(chaMy, []);
    expect(result.newList).toHaveLength(2);
    expect(result.newList[0].name).toBe("Alpha");
    expect(result.newList[1].name).toBe("Beta");
    expect(result.added).toEqual(["Alpha", "Beta"]);
    expect(result.removed).toEqual([]);
  });

  it("on subsequent call with same users, reports no changes", () => {
    const chaMy = ["Alpha", "hR", "Beta", "hR", ""];
    const first = processUserlist(chaMy, []);
    const second = processUserlist(chaMy, first.newList);
    expect(second.newList).toHaveLength(2);
    expect(second.added).toEqual([]);
    expect(second.removed).toEqual([]);
  });

  it("detects a join: new user appears (Alice leaves, Charlie joins)", () => {
    const first = parseUserlist(["Alice", "hR", "Bob", "hR", ""]);
    const result = processUserlist(["Bob", "hR", "Charlie", "hR", ""], first);
    expect(result.newList).toHaveLength(2);
    expect(result.added).toEqual(["Charlie"]);
    expect(result.removed).toEqual(["Alice"]);
  });

  it("detects a leave: user is gone", () => {
    const prev = parseUserlist(["Alice", "hR", "Bob", "hR", "Charlie", "hR", ""]);
    const result = processUserlist(["Alice", "hR", "Charlie", "hR", ""], prev);
    expect(result.newList).toHaveLength(2);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual(["Bob"]);
  });

  it("status change (away ↔ present) is NOT reported as add or remove", () => {
    const online: User[] = [{ name: "X", key: "x", registered: true, guest: false, sep: false, away: false }];
    const result = processUserlist(["X", "hRA", ""], online);
    // User "X" went away — diffUserlists keys by name, so no add/remove.
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.newList[0].away).toBe(true); // status IS updated
  });

  it("handles empty list (no users in channel)", () => {
    const prev = parseUserlist(["Alice", "hR", ""]);
    const result = processUserlist([], prev);
    expect(result.newList).toEqual([]);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual(["Alice"]);
  });
});
