// Tests for the v3 global userlist module: aw.js poll → diff → set (spec
// §cross-channel). diffGlobal() is pure and tested directly. The poll
// lifecycle (startPolling/stopPolling/findUserChannel/getLastSnapshot) is
// tested with fetchAw mocked at the seam — per the spec, mock the fetchAw
// return value, not GM_xmlhttpRequest itself — and fake timers.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/upstream", () => ({
  fetchAw: vi.fn(),
}));

import { fetchAw } from "../src/upstream";
import {
  startPolling,
  stopPolling,
  diffGlobal,
  findUserChannel,
  getLastSnapshot,
} from "../src/global-userlist";
import { _resetStoreForTesting, initStore, on, type User as StoreUser } from "../src/store";
import { setUserStore } from "../src/utils";

function installGmFake() {
  const store = new Map<string, unknown>();
  (globalThis as any).GM = {
    getValue: (key: string, def?: unknown) =>
      store.has(key) ? Promise.resolve(store.get(key)) : Promise.resolve(def),
    setValue: (key: string, val: unknown) => {
      store.set(key, val);
      return Promise.resolve();
    },
  };
  (globalThis as any).GM_log = () => {};
}

async function initTestStore() {
  _resetStoreForTesting();
  installGmFake();
  setUserStore("TestUser", false);
  await initStore();
}

// Helper factories — placeholder names only, never real usernames.
const mkUser = (name: string, extra: Partial<StoreUser> = {}): StoreUser => ({
  name,
  key: name.toLowerCase(),
  registered: false,
  guest: false,
  sep: false,
  away: false,
  ...extra,
});

// Mock aw.js source: two channels, three users (Alpha + Beta in Erotik,
// Gamma in MOD).
const AW_RAW = [
  "var cha = new Array(",
  '"Erotik","2","Alpha Beta ",',
  '"MOD","1","Gamma ",',
  '"");',
].join("\n");

// Let the immediate first fetch (a promise chain) settle.
const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

// ─── diffGlobal ─────────────────────────────────────────────────────────────

describe("diffGlobal — two channel snapshots → { added, removed }", () => {
  it("reports users that newly appear in a channel as added", () => {
    const prev = new Map([["Erotik", [mkUser("Alpha")]]]);
    const next = new Map([["Erotik", [mkUser("Alpha"), mkUser("Beta")]]]);
    const d = diffGlobal(prev, next);
    expect(d.added).toEqual([{ user: mkUser("Beta"), channel: "Erotik" }]);
    expect(d.removed).toEqual([]);
  });

  it("reports users that disappear from a channel as removed", () => {
    const prev = new Map([["Erotik", [mkUser("Alpha"), mkUser("Beta")]]]);
    const next = new Map([["Erotik", [mkUser("Alpha")]]]);
    const d = diffGlobal(prev, next);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([{ user: mkUser("Beta"), channel: "Erotik" }]);
  });

  it("reports a channel move as both removed (old) and added (new)", () => {
    const prev = new Map([
      ["Erotik", [mkUser("Alpha")]],
      ["MOD", []],
    ]);
    const next = new Map([
      ["Erotik", []],
      ["MOD", [mkUser("Alpha")]],
    ]);
    const d = diffGlobal(prev, next);
    expect(d.removed).toEqual([{ user: mkUser("Alpha"), channel: "Erotik" }]);
    expect(d.added).toEqual([{ user: mkUser("Alpha"), channel: "MOD" }]);
  });

  it("identical snapshots → no changes", () => {
    const snap = new Map([
      ["Erotik", [mkUser("Alpha")]],
      ["MOD", [mkUser("Beta")]],
    ]);
    const d = diffGlobal(snap, snap);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });

  it("empty inputs → no changes", () => {
    const d = diffGlobal(new Map(), new Map());
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });

  it("empty prev → every user in next is added", () => {
    const next = new Map([["Erotik", [mkUser("Alpha")]]]);
    const d = diffGlobal(new Map(), next);
    expect(d.added).toEqual([{ user: mkUser("Alpha"), channel: "Erotik" }]);
    expect(d.removed).toEqual([]);
  });

  it("a channel that vanishes reports all its users as removed", () => {
    const prev = new Map([
      ["Erotik", [mkUser("Alpha"), mkUser("Beta")]],
      ["MOD", [mkUser("Gamma")]],
    ]);
    const d = diffGlobal(prev, new Map());
    expect(d.removed).toEqual([
      { user: mkUser("Alpha"), channel: "Erotik" },
      { user: mkUser("Beta"), channel: "Erotik" },
      { user: mkUser("Gamma"), channel: "MOD" },
    ]);
    expect(d.added).toEqual([]);
  });

  it("diffs by key: a guest-flag change is NOT an add/remove", () => {
    const prev = new Map([["Erotik", [mkUser("Alpha")]]]);
    const next = new Map([["Erotik", [mkUser("Alpha", { guest: true })]]]);
    const d = diffGlobal(prev, next);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });

  it("diffs by key: case differences are NOT an add/remove", () => {
    const prev = new Map([["Erotik", [mkUser("Alpha")]]]);
    const next = new Map([["Erotik", [{ ...mkUser("Alpha"), name: "ALPHA" }]]]);
    const d = diffGlobal(prev, next);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });
});

// ─── Poll lifecycle (startPolling/stopPolling) ──────────────────────────────

describe("startPolling/stopPolling — fetch → parse → diff → set loop", () => {
  let storeEvents: Array<{ channels: Map<string, StoreUser[]>; added: any[]; removed: any[] }>;
  let unsubscribe: () => void;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal("GM_log", vi.fn());
    vi.mocked(fetchAw).mockReset();
    await initTestStore();
    storeEvents = [];
    unsubscribe = on("globalUserlist", (v) => {
      storeEvents.push(v as { channels: Map<string, StoreUser[]>; added: any[]; removed: any[] });
    });
  });

  afterEach(() => {
    stopPolling();
    unsubscribe();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("fetches immediately on startPolling (no interval wait) and writes the first snapshot", async () => {
    vi.mocked(fetchAw).mockResolvedValue(AW_RAW);
    startPolling(5000);
    expect(fetchAw).toHaveBeenCalledTimes(1); // synchronous first fetch
    await flushMicrotasks();
    expect(storeEvents).toHaveLength(1);
    const e = storeEvents[0];
    expect(e.added).toEqual([
      { user: mkUser("Alpha"), channel: "Erotik" },
      { user: mkUser("Beta"), channel: "Erotik" },
      { user: mkUser("Gamma"), channel: "MOD" },
    ]);
    expect(e.removed).toEqual([]);
    // getLastSnapshot() reflects the parsed snapshot.
    expect(getLastSnapshot().get("Erotik")).toEqual([mkUser("Alpha"), mkUser("Beta")]);
    expect(getLastSnapshot().get("MOD")).toEqual([mkUser("Gamma")]);
  });

  it("polls again each interval tick and diffs against the last snapshot", async () => {
    vi.mocked(fetchAw).mockResolvedValue(AW_RAW);
    startPolling(5000);
    await flushMicrotasks();
    storeEvents = [];

    // Next cycle: Beta leaves Erotik, Delta joins MOD.
    const nextRaw = [
      "var cha = new Array(",
      '"Erotik","1","Alpha ",',
      '"MOD","2","Gamma Delta ",',
      '"");',
    ].join("\n");
    vi.mocked(fetchAw).mockResolvedValue(nextRaw);
    await vi.advanceTimersByTimeAsync(5000);
    await flushMicrotasks();

    expect(fetchAw).toHaveBeenCalledTimes(2);
    const e = storeEvents[0];
    expect(e.added).toEqual([{ user: mkUser("Delta"), channel: "MOD" }]);
    expect(e.removed).toEqual([{ user: mkUser("Beta"), channel: "Erotik" }]);
  });

  it("writes store on every successful cycle, even with no changes", async () => {
    vi.mocked(fetchAw).mockResolvedValue(AW_RAW);
    startPolling(5000);
    await flushMicrotasks();
    storeEvents = [];
    await vi.advanceTimersByTimeAsync(5000);
    await flushMicrotasks();
    const e = storeEvents[0];
    expect(e.added).toEqual([]);
    expect(e.removed).toEqual([]);
  });

  it("on fetch failure stays silent and retries on the next cycle", async () => {
    vi.mocked(fetchAw).mockResolvedValue(AW_RAW);
    startPolling(5000);
    await flushMicrotasks();
    storeEvents = [];

    // Fetch fails → no store write, previous snapshot preserved (no log spam).
    vi.mocked(fetchAw).mockRejectedValue(new Error("network down"));
    await vi.advanceTimersByTimeAsync(5000);
    await flushMicrotasks();
    expect(fetchAw).toHaveBeenCalledTimes(2);
    expect(storeEvents).toHaveLength(0);
    expect(getLastSnapshot().get("Erotik")).toHaveLength(2); // snapshot kept

    // Network recovers → next cycle delivers an updated snapshot.
    const nextRaw = [
      "var cha = new Array(",
      '"Erotik","1","Alpha ",',
      '"MOD","1","Gamma ",',
      '"");',
    ].join("\n");
    vi.mocked(fetchAw).mockResolvedValue(nextRaw);
    await vi.advanceTimersByTimeAsync(5000);
    await flushMicrotasks();
    expect(fetchAw).toHaveBeenCalledTimes(3);
    expect(storeEvents).toHaveLength(1);
    const e = storeEvents[0];
    expect(e.removed).toEqual([{ user: mkUser("Beta"), channel: "Erotik" }]);
  });

  it("skips an empty parse result — snapshot preserved if populated", async () => {
    vi.mocked(fetchAw).mockResolvedValue(AW_RAW);
    startPolling(5000);
    await flushMicrotasks();
    storeEvents = [];
    expect(getLastSnapshot().size).toBeGreaterThan(0); // snapshot populated

    // Server returns non-aw.js content — parseAw yields empty Map.
    vi.mocked(fetchAw).mockResolvedValue("Internal Server Error");
    await vi.advanceTimersByTimeAsync(5000);
    await flushMicrotasks();
    expect(storeEvents).toHaveLength(0); // no store write — guard skipped the update
    expect(getLastSnapshot().size).toBeGreaterThan(0); // snapshot preserved
  });

  it("skips an empty parse result even with no prior snapshot (first poll garbage)", async () => {
    // aw.js lists every user online site-wide, so an empty parse is never
    // legitimate. On the very first poll the snapshot is still empty — the
    // guard must still skip (not fall through and write a bogus empty snapshot).
    // NB: module state persists across this describe block, so we only assert
    // the skip (no store write); the no-snapshot precondition is covered
    // indirectly by the ulist-poll suite which uses vi.resetModules() for fresh state.
    vi.mocked(fetchAw).mockResolvedValue("Internal Server Error");
    startPolling(5000);
    await flushMicrotasks();
    expect(storeEvents).toHaveLength(0); // no store write — guard skipped
  });

  it("stopPolling stops the loop", async () => {
    vi.mocked(fetchAw).mockResolvedValue(AW_RAW);
    startPolling(5000);
    await flushMicrotasks();
    expect(fetchAw).toHaveBeenCalledTimes(1);
    stopPolling();
    await vi.advanceTimersByTimeAsync(20000);
    expect(fetchAw).toHaveBeenCalledTimes(1); // no further fetches
  });

  it("stopPolling is idempotent — calling twice is safe", async () => {
    vi.mocked(fetchAw).mockResolvedValue(AW_RAW);
    startPolling(5000);
    await flushMicrotasks();
    stopPolling();
    stopPolling(); // must not throw
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchAw).toHaveBeenCalledTimes(1);
  });

  it("starting twice while running does not create a second loop", async () => {
    vi.mocked(fetchAw).mockResolvedValue(AW_RAW);
    startPolling(5000);
    startPolling(2000); // ignored — already running
    await flushMicrotasks();
    expect(fetchAw).toHaveBeenCalledTimes(1); // single immediate fetch
    await vi.advanceTimersByTimeAsync(9000);
    // One 5s tick (t=5000) — a second 2s interval would have fired 4 more ×.
    expect(fetchAw).toHaveBeenCalledTimes(2);
  });
});

// ─── findUserChannel / getLastSnapshot ──────────────────────────────────────

describe("findUserChannel — queries the last snapshot by key", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal("GM_log", vi.fn());
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    vi.mocked(fetchAw).mockReset();
    vi.mocked(fetchAw).mockResolvedValue(AW_RAW);
    await initTestStore();
    startPolling(5000);
  });

  afterEach(() => {
    stopPolling();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns the channel of a user present in the snapshot", async () => {
    await flushMicrotasks();
    expect(findUserChannel("alpha")).toBe("Erotik");
    expect(findUserChannel("gamma")).toBe("MOD");
  });

  it("returns null for a user not in the snapshot", async () => {
    await flushMicrotasks();
    expect(findUserChannel("zulu")).toBeNull();
  });

  it("matches by lowercase key regardless of name casing", async () => {
    await flushMicrotasks();
    expect(findUserChannel("alpha")).toBe("Erotik"); // user name is "Alpha"
  });
});
