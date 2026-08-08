// Tests for the stats-bar pure parser (src/stats.ts).
//
// parseStats reads the chat_info_friends_nc.html response (three <a> tags with
// .uonl/.ufri/.unc classes, each holding a .value span with the count) and
// returns the three numeric counts — or null when the response is unparseable
// (no anchors found), so the caller can keep the last good render instead of
// flashing zeros on a transient bad fetch. A valid all-zero response (three
// anchors present, values all 0) still returns {0,0,0} and renders immediately.

import { describe, it, expect } from "vitest";
import { parseStats } from "../src/stats";
import { encodeChatLink } from "../src/utils";

// The exact response the dev mock returns (dev/server.mjs chat_info_friends_nc
// route): 3 friends online, 1 friend request, 0 messages (the messages value
// carries the upstream "no" class marking a zero count).
const MOCK_HTML = `<a href="#" class="uonl" title="Freunde Online"><span class="name">Freunde Online: </span><span class="value">3</span></a>
<a href="#" class="ufri" title="Neue Freundesanfragen"><span class="name">Neue Freundesanfragen: </span><span class="value">1</span></a>
<a href="#" class="unc" title="Neue Nachrichten"><span class="name">Neue Nachrichten: </span><span class="value no">0</span></a>`;

// ─── Happy path: dev mock ──────────────────────────────────────────────────

describe("parseStats — dev mock response", () => {
  it("reads the Freunde Online count from the .uonl .value span", () => {
    expect(parseStats(MOCK_HTML).friendsOnline).toBe(3);
  });

  it("reads the Neue Freundesanfragen count from the .ufri .value span", () => {
    expect(parseStats(MOCK_HTML).requests).toBe(1);
  });

  it("reads the Neue Nachrichten count from the .unc .value span (zero case)", () => {
    expect(parseStats(MOCK_HTML).messages).toBe(0);
  });

  it("returns all three counts together", () => {
    expect(parseStats(MOCK_HTML)).toEqual({ friendsOnline: 3, requests: 1, messages: 0 });
  });
});

// ─── Fixture-parity: upstream HTML structure (with onclick + name spans) ───

describe("parseStats — upstream fixture HTML structure", () => {
  it("parses the live #u_stats response (onclick attrs + name spans present)", () => {
    // The live response includes onclick handlers and the .value.no class on
    // zeros — the parser must read .value regardless of these siblings/attrs.
    const liveHtml = `<a href="#" onclick='window.open("id.html")' class="uonl" title="Freunde Online"><span class="name">Freunde Online: </span><span class="value no">0</span></a>
<a href="#" onclick='window.open("friends.html")' class="ufri" title="Neue Freundesanfragen"><span class="name">Neue Freundesanfragen: </span><span class="value">5</span></a>
<a href="#" onclick='window.open("inbox.html")' class="unc" title="Neue Nachrichten"><span class="name">Neue Nachrichten: </span><span class="value">2</span></a>`;
    expect(parseStats(liveHtml)).toEqual({ friendsOnline: 0, requests: 5, messages: 2 });
  });
});

// ─── Tolerance: missing / empty / malformed input ──────────────────────────

describe("parseStats — tolerance", () => {
  it("returns null for an empty string (unparseable — keep last good)", () => {
    expect(parseStats("")).toBeNull();
  });

  it("returns null for input with no recognizable anchors (garbage response)", () => {
    expect(parseStats("<div>nothing here</div>")).toBeNull();
  });

  it("returns null for null-ish input (defensive)", () => {
    expect(() => parseStats(null as any)).not.toThrow();
    expect(parseStats(null as any)).toBeNull();
  });

  it("treats a missing .value span as zero (partial response still parseable)", () => {
    // Only the friends anchor present — that's still a parseable response,
    // just with the other two counts defaulting to 0.
    const partial = `<a class="uonl"><span class="value">7</span></a>`;
    expect(parseStats(partial)).toEqual({ friendsOnline: 7, requests: 0, messages: 0 });
  });

  it("treats a non-numeric .value as zero (parseable response)", () => {
    const badNum = `<a class="uonl"><span class="value">viele</span></a>
<a class="ufri"><span class="value">1</span></a>
<a class="unc"><span class="value">2</span></a>`;
    expect(parseStats(badNum)).toEqual({ friendsOnline: 0, requests: 1, messages: 2 });
  });

  it("returns {0,0,0} for a valid all-zero response (three anchors, real zeros)", () => {
    // Genuine "all counts resolved" — three anchors present, values all 0.
    // This must render immediately (hide badges), NOT be treated as garbage.
    const allZero = `<a class="uonl"><span class="value">0</span></a>
<a class="ufri"><span class="value">0</span></a>
<a class="unc"><span class="value">0</span></a>`;
    expect(parseStats(allZero)).toEqual({ friendsOnline: 0, requests: 0, messages: 0 });
  });
});

// ─── encodeChatLink — ChatCity nick-to-URL encoder ────────────────────────

describe("encodeChatLink — replicates the upstream Encode_Link", () => {
  it("passes alphanumeric characters through unchanged", () => {
    expect(encodeChatLink("TestUser")).toBe("TestUser");
    expect(encodeChatLink("abcXYZ123")).toBe("abcXYZ123");
  });

  it("replaces spaces with hyphens", () => {
    expect(encodeChatLink("Cool Nick")).toBe("Cool-Nick");
    expect(encodeChatLink("a b c")).toBe("a-b-c");
  });

  it("hex-encodes ASCII special characters as :XX:", () => {
    // Underscore (_) → :5F: (the fixture's :5F: artifact confirmed correct)
    expect(encodeChatLink("Test_User")).toBe("Test:5F:User");
    // Dot (.) → :2E:
    expect(encodeChatLink("dr.evil")).toBe("dr:2E:evil");
    // Hyphen in name (the actual hyphen, not space-encoded)
    expect(encodeChatLink("x-y")).toBe("x:2D:y");
  });

  it("handles mixed safe + special characters", () => {
    expect(encodeChatLink("Hello_World")).toBe("Hello:5F:World");
    expect(encodeChatLink("a.b-c")).toBe("a:2E:b:2D:c");
  });
});
