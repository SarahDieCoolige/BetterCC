// Tests for the ulist poll module: parseUlistResponse, processUserlist, and the poll loop.
// processUserlist tests moved from userlist-wire.test.ts (UP-2).
// The poll loop is impure (fetch, timers, module-scoped state) — tested at the
// boundary by mocking fetch, upstream getters, and setTimeout.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseUserlist, type User } from "../src/userlist";
import { parseUlistResponse, processUserlist } from "../src/ulist-poll";

// ─── parseUlistResponse tests (from UP-1) ────────────────────────────────────

describe("parseUlistResponse", () => {
  const DUMP =
    'var cha_channel = "Chatcity";\n\nvar cha_my = new Array(\n"maja01_","hR",\n"");\nset_uinfo1();';
  it("parses the dump response (single user)", () => {
    expect(parseUlistResponse(DUMP)).toEqual(["maja01_", "hR", ""]);
  });

  const MULTI = 'var cha_my = new Array(\n"Alpha","hR",\n"Beta","h",\n"");';
  it("parses a multi-user response", () => {
    expect(parseUlistResponse(MULTI)).toEqual(["Alpha", "hR", "Beta", "h", ""]);
  });

  it("returns [] on empty input", () => {
    expect(parseUlistResponse("")).toEqual([]);
  });

  it("returns [] when cha_my declaration is absent", () => {
    expect(parseUlistResponse("set_uinfo1();")).toEqual([]);
  });

  it("returns [] on a truncated declaration", () => {
    expect(parseUlistResponse('var cha_my = new Array("Alpha","hR"')).toEqual([]);
  });

  const SPACED = 'var   cha_my   =   new   Array(\n\n  "X"  ,  "hR"  ,\n\n  ""  )  ;';
  it("tolerates extra whitespace and newlines", () => {
    expect(parseUlistResponse(SPACED)).toEqual(["X", "hR", ""]);
  });

  const ESCAPED = 'var cha_my = new Array(\n"O\\"Brien","hR",\n"");';
  it("handles escaped quotes in usernames", () => {
    expect(parseUlistResponse(ESCAPED)).toEqual(['O"Brien', "hR", ""]);
  });
});

// ─── processUserlist tests (moved from userlist-wire.test.ts) ────────────────

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
    const online: User[] = [
      { name: "X", key: "x", registered: true, guest: false, sep: false, away: false },
    ];
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

// ─── Poll loop tests ────────────────────────────────────────────────────────
// The poll loop is impure (fetch, setTimeout, module-scoped state). These
// tests mock at the boundary: fetch returns controlled responses, upstream
// globals are pre-set, and vi.resetModules() gives fresh module state.
//
// Pattern: each test sets up mocks, calls startUlistPoll, then immediately
// calls stopUlistPoll to break the infinite timer chain BEFORE flushing
// timers. This way the immediate poll runs but scheduleNext's timer is
// cancelled.

describe("ulist-poll loop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("unsafeWindow", {
      chat_id: "42",
      chat_sid: "sess_abc",
      PCHAT: "/cc_chat",
    });
    vi.stubGlobal("GM_log", () => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("startUlistPoll reads session data and fetches immediately", async () => {
    const RESPONSE_BODY = 'var cha_my = new Array("Alice","hR","");';
    const mockFetch = vi.fn().mockResolvedValue({
      text: () => Promise.resolve(RESPONSE_BODY),
    });
    vi.stubGlobal("fetch", mockFetch);

    const mod = await import("../src/ulist-poll");

    // start, then immediately stop to prevent the scheduled chain
    mod.startUlistPoll(10000);
    mod.stopUlistPoll();

    // Flush microtasks — the immediate pollOnce resolves
    await vi.runAllTimersAsync();

    // Verify fetch was called with the correct URL shape
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toMatch(/^\/cc_chat\/ulist\?AKTION=j&ID=42&SID=sess_abc&x=/);
  });

  it("stopUlistPoll cancels the pending timer", async () => {
    let fetchCount = 0;
    vi.stubGlobal("fetch", () => {
      fetchCount++;
      return Promise.resolve({ text: () => Promise.resolve("") });
    });

    const mod = await import("../src/ulist-poll");
    mod.startUlistPoll(5000);
    mod.stopUlistPoll(); // cancel the scheduled timer immediately

    await vi.runAllTimersAsync();

    // Only 1 fetch (the immediate poll), no scheduled ones
    expect(fetchCount).toBe(1);
  });

  it("refreshUlistNow triggers an immediate fetch after start", async () => {
    let fetchCount = 0;
    vi.stubGlobal("fetch", () => {
      fetchCount++;
      return Promise.resolve({ text: () => Promise.resolve("") });
    });

    const mod = await import("../src/ulist-poll");
    mod.startUlistPoll(5000);
    // Don't stop yet — refresh replaces the scheduled timer
    mod.refreshUlistNow(5000);
    mod.stopUlistPoll(); // prevent further scheduling

    await vi.runAllTimersAsync();

    // 2 fetches: start's immediate + refresh's immediate
    expect(fetchCount).toBe(2);
  });

  it("empty-response guard: skip emit when response has no real users", async () => {
    // A valid response always contains at least our own nick, so an empty
    // response (bare terminator or parse failure) is never legitimate — skip
    // + retry, regardless of prior state. Verified twice below: once when
    // prevList is populated (after a good poll), once when it's empty (no seed).
    const RESPONSES = [
      'var cha_my = new Array("Alice","hR","");', // first: has users
      "no cha_my here", // second: empty parse
      'var cha_my = new Array("");', // third: bare terminator, zero users
    ];
    let callIdx = 0;
    vi.stubGlobal("fetch", () => {
      return Promise.resolve({ text: () => Promise.resolve(RESPONSES[callIdx++] ?? "") });
    });

    const mod = await import("../src/ulist-poll");
    mod.startUlistPoll(10000);
    mod.refreshUlistNow(10000); // second fetch (empty parse) — must skip
    mod.refreshUlistNow(10000); // third fetch (bare terminator) — must skip
    mod.stopUlistPoll();
    await vi.runAllTimersAsync();

    expect(callIdx).toBe(3); // start immediate + 2 refreshes
  });

  it("empty-response guard: skips empty even with no prior data (no seed)", async () => {
    // No seed → prevList stays empty. First fetch returns a bare terminator
    // (daemon not ready). The guard must still skip it — an empty response is
    // never legitimate. Without the guard fix, this would fall through and
    // emit a bogus empty userlist.
    vi.stubGlobal("fetch", () =>
      Promise.resolve({ text: () => Promise.resolve('var cha_my = new Array("");') }),
    );

    // Subscribe before importing the poll module so any emit is observed.
    const userlistEvents: unknown[] = [];
    const { subscribe } = await import("../src/bus");
    const unsub = subscribe((e) => {
      if ((e as { type: string }).type === "userlist") userlistEvents.push(e);
    });

    const mod = await import("../src/ulist-poll");
    mod.startUlistPoll(10000);
    mod.stopUlistPoll();
    await vi.runAllTimersAsync();

    expect(userlistEvents).toHaveLength(0); // guard skipped the empty response
    unsub();
  });

  it("double startUlistPoll is a no-op (running guard)", async () => {
    let fetchCount = 0;
    vi.stubGlobal("fetch", () => {
      fetchCount++;
      return Promise.resolve({ text: () => Promise.resolve("") });
    });

    const mod = await import("../src/ulist-poll");
    mod.startUlistPoll(5000);
    mod.startUlistPoll(5000); // should be no-op
    mod.stopUlistPoll();

    await vi.runAllTimersAsync();

    // Only 1 fetch — the second start was a no-op
    expect(fetchCount).toBe(1);
  });
});
