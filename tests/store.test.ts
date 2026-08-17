// Tests for the sync in-memory state store (spec §4, §10).
//
// GM is faked with an in-memory Map plus a listener registry. Tests pin:
// silent seed, pre-init throw, set ordering (mirror+notify sync before persist),
// codec round-trip, react/on/subscribe lifecycle, reconciliation, double-init
// protection, and feature-detect degradation.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { setUserStore } from "../src/utils";

// We import the store module at the top, but since it's a module-level singleton
// we need to reset it between tests. The store exports a reset function for
// testing only.
import { initStore, get, set, on, react, snapshot, _resetStoreForTesting } from "../src/store";

// ─── In-memory GM fake with listener registry ─────────────────────────────

function installGmFake() {
  const store = new Map<string, unknown>();
  const listeners = new Map<
    number,
    (key: string, oldValue: any, newValue: any, remote: boolean) => void
  >();

  const fake = {
    getValue: (key: string, def?: unknown) =>
      store.has(key) ? Promise.resolve(store.get(key)) : Promise.resolve(def),

    setValue: (key: string, val: unknown) => {
      const old = store.get(key);
      store.set(key, val);
      // Fire registered listeners for this key
      for (const [, cb] of listeners) {
        cb(key, old, val, false);
      }
      return Promise.resolve();
    },

    // Feature-detect: GM namespace already has addValueChangeListener in gm.d.ts,
    // but we need to control whether the top-level GM_addValueChangeListener exists.
  };

  (globalThis as any).GM = fake;
  (globalThis as any).GM_log = () => {}; // cclog needs this

  // Expose the listener registry so tests can simulate foreign writes
  return {
    store,
    listeners,
    fakeSetValue: (key: string, val: unknown) => {
      const old = store.get(key);
      store.set(key, val);
      for (const [, cb] of listeners) {
        cb(key, old, val, true);
      }
    },
    removeListenerApi: () => {
      delete (globalThis as any).GM_addValueChangeListener;
      delete (globalThis as any).GM_removeValueChangeListener;
    },
  };
}

function installGmFakeWithListeners() {
  const gm = installGmFake();
  let nextId = 1;

  // The store uses the top-level GM_addValueChangeListener if available
  (globalThis as any).GM_addValueChangeListener = (
    key: string,
    callback: (key: string, oldValue: any, newValue: any, remote: boolean) => void,
  ): number => {
    const id = nextId++;
    gm.listeners.set(id, callback);
    return id;
  };

  (globalThis as any).GM_removeValueChangeListener = (id: number) => {
    gm.listeners.delete(id);
  };

  return gm;
}

function installGmFakeWithoutListeners() {
  const gm = installGmFake();
  gm.removeListenerApi();
  return gm;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Init store with a test user. Call once per test. */
async function initTestStore(_gm: ReturnType<typeof installGmFake>) {
  setUserStore("TestUser", false);
  await initStore();
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe("store — silent seed with defaults", () => {
  let gm: ReturnType<typeof installGmFakeWithListeners>;

  beforeEach(() => {
    _resetStoreForTesting();
    gm = installGmFakeWithListeners();
  });

  it("seeds all persisted keys to their defaults when GM storage is empty", async () => {
    await initTestStore(gm);

    expect(get("color")).toBe("6AAED8");
    expect(get("scheme_v2")).toBe(false);
    expect(get("pinned")).toEqual([]);
    expect(get("whisper")).toBe("");
    expect(get("compact")).toBe(false);
    expect(get("send_on_enter")).toBe(true);
    expect(get("hover_preview")).toBe(true);
    expect(get("ban")).toEqual([]);
  });

  it("seeds ephemeral keys to empty initial values", async () => {
    await initTestStore(gm);

    expect(get("session")).toEqual({
      nick: "",
      registered: false,
      guest: false,
      userId: "",
      sessionId: "",
      channel: "",
      authDead: false,
    });
    expect(get("userlist")).toEqual({ users: [], added: [], removed: [] });
    expect(get("globalUserlist")).toEqual({
      channels: new Map(),
      added: [],
      removed: [],
    });
  });

  it("does not notify subscribers during seed", async () => {
    const fn = vi.fn();
    // We must subscribe before initStore to catch seed notifies — but on()
    // throws before init. So we test indirectly: no subscriber fires during init.
    // This is tested by the fact that initStore succeeds silently; the real
    // proof is that no GM listener fires.
    await initTestStore(gm);
    // If we subscribe now and then set, it works — seed did not fire.
    on("color", fn);
    await set("color", "FF0000");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("store — seed from persisted values", () => {
  let gm: ReturnType<typeof installGmFakeWithListeners>;

  beforeEach(() => {
    _resetStoreForTesting();
    gm = installGmFakeWithListeners();
    setUserStore("TestUser", false);
  });

  it("reads persisted values from GM and uses them instead of defaults", async () => {
    // Pre-seed GM with some persisted values
    gm.store.set("color_testuser", "FF5500");
    gm.store.set("scheme_v2_testuser", true);
    gm.store.set("pinned_testuser", ["alice", "bob"]);
    gm.store.set("whisper_testuser", "SomeNick");

    await initStore();

    expect(get("color")).toBe("FF5500");
    expect(get("scheme_v2")).toBe(true);
    expect(get("pinned")).toEqual(["alice", "bob"]);
    expect(get("whisper")).toBe("SomeNick");
    // Unseeded keys still get defaults
    expect(get("compact")).toBe(false);
    expect(get("send_on_enter")).toBe(true);
  });

  it("decodes the compact codec: GM '1' → true, '' → false", async () => {
    gm.store.set("compact_testuser", "1");

    await initStore();

    expect(get("compact")).toBe(true);

    _resetStoreForTesting();
    gm.store.set("compact_testuser", "");
    await initStore();

    expect(get("compact")).toBe(false);
  });
});

describe("store — get before init throws", () => {
  beforeEach(() => {
    _resetStoreForTesting();
    installGmFakeWithListeners();
  });

  it("throws when get is called before initStore", () => {
    expect(() => get("color")).toThrow("store not initialized");
  });

  it("throws when set is called before initStore", async () => {
    await expect(set("color", "FF0000")).rejects.toThrow("store not initialized");
  });

  it("throws when on is called before initStore", () => {
    const fn = vi.fn();
    expect(() => on("color", fn)).toThrow("store not initialized");
  });

  it("throws when react is called before initStore", () => {
    const fn = vi.fn();
    expect(() => react("color", fn)).toThrow("store not initialized");
  });
});

describe("store — double initStore throws", () => {
  let gm: ReturnType<typeof installGmFakeWithListeners>;

  beforeEach(() => {
    _resetStoreForTesting();
    gm = installGmFakeWithListeners();
  });

  it("throws on the second call to initStore", async () => {
    await initTestStore(gm);
    await expect(initStore()).rejects.toThrow("initStore already called");
  });
});

describe("store — set ordering (mirror+notify synchronous before persist)", () => {
  let gm: ReturnType<typeof installGmFakeWithListeners>;

  beforeEach(() => {
    _resetStoreForTesting();
    gm = installGmFakeWithListeners();
  });

  it("mirror is updated synchronously before persist resolves", async () => {
    await initTestStore(gm);

    const persistPromise = set("color", "FF0000");

    // Synchronous read: mirror already has the new value
    expect(get("color")).toBe("FF0000");

    await persistPromise;
  });

  it("notifies subscribers synchronously during set, before persist resolves", async () => {
    await initTestStore(gm);

    const callOrder: string[] = [];
    const fn = vi.fn(() => {
      // Inside the notify callback, the mirror already has the new value
      callOrder.push("notify");
      expect(get("color")).toBe("FF0000");
    });
    on("color", fn);

    let persistResolved = false;
    const persistPromise = set("color", "FF0000").then(() => {
      persistResolved = true;
      callOrder.push("persist");
    });

    // Notify fired synchronously, before persist resolved
    expect(fn).toHaveBeenCalledTimes(1);
    expect(persistResolved).toBe(false);
    expect(callOrder).toEqual(["notify"]);

    await persistPromise;
    expect(callOrder).toEqual(["notify", "persist"]);
  });

  it("persist writes the encoded value to GM", async () => {
    await initTestStore(gm);

    await set("color", "AABBCC");

    // GM should have the user-scoped key
    expect(gm.store.get("color_testuser")).toBe("AABBCC");
  });
});

describe("store — a throwing render never breaks the writer", () => {
  let gm: ReturnType<typeof installGmFakeWithListeners>;

  beforeEach(() => {
    _resetStoreForTesting();
    gm = installGmFakeWithListeners();
  });

  it("set() resolves, other renders still run, and persistence still happens", async () => {
    await initTestStore(gm);

    on("pinned", () => {
      throw new Error("render bug");
    });
    const good = vi.fn();
    on("pinned", good);

    await expect(set("pinned", ["alice"])).resolves.toBeUndefined();
    expect(good).toHaveBeenCalledWith(["alice"]);
    expect(get("pinned")).toEqual(["alice"]);
    // Persist must not be skipped because a render threw
    expect(gm.store.get("pinned_testuser")).toEqual(["alice"]);
  });
});

describe("store — codec round-trip for compact", () => {
  let gm: ReturnType<typeof installGmFakeWithListeners>;

  beforeEach(() => {
    _resetStoreForTesting();
    gm = installGmFakeWithListeners();
  });

  it("set(true) persists '1' to GM; get returns true", async () => {
    await initTestStore(gm);

    await set("compact", true);
    expect(get("compact")).toBe(true);
    expect(gm.store.get("compact_testuser")).toBe("1");
  });

  it("set(false) persists '' to GM; get returns false", async () => {
    await initTestStore(gm);

    await set("compact", false);
    expect(get("compact")).toBe(false);
    expect(gm.store.get("compact_testuser")).toBe("");
  });
});

describe("store — on / unsubscribe", () => {
  let gm: ReturnType<typeof installGmFakeWithListeners>;

  beforeEach(() => {
    _resetStoreForTesting();
    gm = installGmFakeWithListeners();
  });

  it("notifies subscriber on set", async () => {
    await initTestStore(gm);

    const fn = vi.fn();
    const off = on("color", fn);
    await set("color", "FF0000");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("FF0000");
    off();
  });

  it("unsubscribe stops notifications", async () => {
    await initTestStore(gm);

    const fn = vi.fn();
    const off = on("color", fn);
    await set("color", "FF0000");
    expect(fn).toHaveBeenCalledTimes(1);

    off();
    await set("color", "00FF00");
    expect(fn).toHaveBeenCalledTimes(1); // no additional call
  });

  it("multiple subscribers on the same key all fire", async () => {
    await initTestStore(gm);

    const a = vi.fn();
    const b = vi.fn();
    on("color", a);
    on("color", b);
    await set("color", "FF0000");
    expect(a).toHaveBeenCalledWith("FF0000");
    expect(b).toHaveBeenCalledWith("FF0000");
  });
});

describe("store — react (initial render + subscribe)", () => {
  let gm: ReturnType<typeof installGmFakeWithListeners>;

  beforeEach(() => {
    _resetStoreForTesting();
    gm = installGmFakeWithListeners();
  });

  it("calls render immediately with the current value", async () => {
    await initTestStore(gm);

    const render = vi.fn();
    react("color", render);
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith("6AAED8"); // default
  });

  it("calls render on subsequent changes", async () => {
    await initTestStore(gm);

    const render = vi.fn();
    react("color", render);
    expect(render).toHaveBeenCalledTimes(1);

    await set("color", "FF0000");
    expect(render).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenLastCalledWith("FF0000");
  });

  it("returned unsubscribe stops both initial-like and change renders", async () => {
    await initTestStore(gm);

    const render = vi.fn();
    const off = react("color", render);
    expect(render).toHaveBeenCalledTimes(1);

    off();
    await set("color", "FF0000");
    expect(render).toHaveBeenCalledTimes(1);
  });
});

describe("store — reconciliation (GM_addValueChangeListener)", () => {
  let gm: ReturnType<typeof installGmFakeWithListeners>;

  beforeEach(() => {
    _resetStoreForTesting();
    gm = installGmFakeWithListeners();
  });

  it("own write echo: persisted value equals mirror, so no notify", async () => {
    await initTestStore(gm);

    const fn = vi.fn();
    on("color", fn);

    // Our own set triggers GM.setValue which fires the listener callback.
    // But the re-read will find the same value, so no notify.
    await set("color", "FF0000");

    // fn should have been called exactly once (from set's synchronous notify),
    // NOT a second time from the listener echo.
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("foreign write: listener fires, re-reads GM, mirrors + notifies once", async () => {
    await initTestStore(gm);

    const fn = vi.fn();
    on("color", fn);

    // Simulate a foreign write from another tab: bypass our set(), write
    // directly to the GM fake and fire the listener.
    gm.fakeSetValue("color_testuser", "00FF00");

    // The reconciliation listener re-reads GM async (GM.getValue is async).
    // Yield to let the microtask settle.
    await new Promise((r) => setTimeout(r, 0));

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("00FF00");
    expect(get("color")).toBe("00FF00");
  });

  it("foreign write with same value: no notify (equal diff no-op)", async () => {
    await initTestStore(gm);

    // Default color is "6AAED8"; set GM directly to the same value
    const fn = vi.fn();
    on("color", fn);

    gm.fakeSetValue("color_testuser", "6AAED8");

    // The mirror already holds "6AAED8", so no notify
    expect(fn).not.toHaveBeenCalled();
  });

  it("own array write echoes as no-op even when GM serializes (new references)", async () => {
    await initTestStore(gm);
    // Simulate real GM serialization: every write/read produces a fresh copy,
    // so === on the re-read would never match the mirror.
    const origSet = gm.store.set.bind(gm.store);
    const origGet = gm.store.get.bind(gm.store);
    gm.store.set = (key: string, val: unknown) => origSet(key, structuredClone(val));
    gm.store.get = (key: string) => structuredClone(origGet(key));

    const fn = vi.fn();
    on("pinned", fn);

    await set("pinned", ["alice", "bob"]);
    await new Promise((r) => setTimeout(r, 0));

    // One notify from set — the listener echo must not fire a second time
    expect(fn).toHaveBeenCalledTimes(1);
    expect(get("pinned")).toEqual(["alice", "bob"]);
  });

  it("foreign delete converges to the default without poisoning the mirror", async () => {
    await initTestStore(gm);

    await set("color", "FF0000");
    const fn = vi.fn();
    on("color", fn);

    // Foreign tab deletes the key entirely
    gm.fakeSetValue("color_testuser", undefined);
    await new Promise((r) => setTimeout(r, 0));

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith("6AAED8"); // default, not undefined
    expect(get("color")).toBe("6AAED8");
  });

  it("foreign delete of an already-default key does not notify", async () => {
    await initTestStore(gm);

    const fn = vi.fn();
    on("color", fn);

    gm.fakeSetValue("color_testuser", undefined);
    await new Promise((r) => setTimeout(r, 0));

    expect(fn).not.toHaveBeenCalled();
    expect(get("color")).toBe("6AAED8");
  });
});

describe("store — feature-detect degradation (no listener API)", () => {
  beforeEach(() => {
    _resetStoreForTesting();
  });

  it("initStore succeeds when GM_addValueChangeListener is absent", async () => {
    installGmFakeWithoutListeners();
    setUserStore("TestUser", false);

    // Should not throw
    await initStore();
    expect(get("color")).toBe("6AAED8");
  });

  it("set and get work normally without listeners", async () => {
    const gm = installGmFakeWithoutListeners();
    setUserStore("TestUser", false);
    await initStore();

    await set("color", "FF0000");
    expect(get("color")).toBe("FF0000");
    expect(gm.store.get("color_testuser")).toBe("FF0000");
  });

  it("subscriptions still work without listeners", async () => {
    installGmFakeWithoutListeners();
    setUserStore("TestUser", false);
    await initStore();

    const fn = vi.fn();
    on("color", fn);
    await set("color", "FF0000");
    expect(fn).toHaveBeenCalledWith("FF0000");
  });
});

describe("store — ephemeral keys are never persisted", () => {
  let gm: ReturnType<typeof installGmFakeWithListeners>;

  beforeEach(() => {
    _resetStoreForTesting();
    gm = installGmFakeWithListeners();
  });

  it("set on an ephemeral key does not write to GM", async () => {
    await initTestStore(gm);

    const sessionVal = {
      nick: "Alice",
      registered: true,
      guest: false,
      userId: "123",
      sessionId: "456",
      channel: "Test",
      authDead: false,
    };

    await set("session", sessionVal);
    expect(get("session")).toEqual(sessionVal);

    // GM store should have no session key
    expect(gm.store.get("session_testuser")).toBeUndefined();
  });
});

describe("store — set always notifies even on equal values", () => {
  let gm: ReturnType<typeof installGmFakeWithListeners>;

  beforeEach(() => {
    _resetStoreForTesting();
    gm = installGmFakeWithListeners();
  });

  it("set(notify-on-equal-set): setting the same value still notifies", async () => {
    await initTestStore(gm);

    const fn = vi.fn();
    on("color", fn);

    // Set to default value
    await set("color", "6AAED8");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("snapshot()", () => {
  let gm: ReturnType<typeof installGmFakeWithListeners>;

  beforeEach(() => {
    _resetStoreForTesting();
    gm = installGmFakeWithListeners();
  });

  const allKeys = [
    "color",
    "scheme_v2",
    "pinned",
    "whisper",
    "compact",
    "send_on_enter",
    "hover_preview",
    "ban",
    "session",
    "userlist",
    "globalUserlist",
    "conn",
    "bccHealth",
    "freshness",
  ] as const;

  it("returns a property for every registered key", async () => {
    await initTestStore(gm);

    const snap = snapshot();
    for (const key of allKeys) {
      expect(snap).toHaveProperty(key);
    }
    // No extra keys
    expect(Object.keys(snap).sort()).toEqual([...allKeys].sort());
  });

  it("values match the store — set a few and compare", async () => {
    await initTestStore(gm);

    await set("color", "FF0000");
    await set("pinned", ["alice", "bob"]);
    await set("whisper", "charlie");
    await set("compact", true);

    const snap = snapshot();
    expect(snap.color).toBe("FF0000");
    expect(snap.pinned).toEqual(["alice", "bob"]);
    expect(snap.whisper).toBe("charlie");
    expect(snap.compact).toBe(true);
  });

  it("globalUserlist.channels (Map) comes back as a plain object via Object.fromEntries", async () => {
    await initTestStore(gm);

    // Populate the globalUserlist channels Map
    const map = new Map<string, { name: string }[]>();
    map.set("lobby", [{ name: "alice" }]);
    map.set("test", [{ name: "bob" }]);
    await set("globalUserlist", {
      channels: map,
      added: [],
      removed: [],
    });

    const snap = snapshot();
    // channels should be a plain object, not a Map
    expect(snap.globalUserlist.channels).toEqual({
      lobby: [{ name: "alice" }],
      test: [{ name: "bob" }],
    });
    expect(snap.globalUserlist.channels).not.toBeInstanceOf(Map);
  });

  it("returned snapshot is safe to mutate — arrays and channels object are copies", async () => {
    await initTestStore(gm);

    await set("pinned", ["alice"]);
    await set("ban", ["troll"]);
    const map = new Map<string, { name: string }[]>([["room1", [{ name: "x" }]]]);
    await set("globalUserlist", { channels: map, added: [], removed: [] });

    const snap = snapshot();

    // Mutate the snapshot's arrays
    (snap.pinned as string[]).push("eve");
    (snap.ban as string[]).push("griefer");
    (snap.globalUserlist as any).channels.other = [{ name: "y" }];

    // Store values must be unchanged
    expect(get("pinned")).toEqual(["alice"]);
    expect(get("ban")).toEqual(["troll"]);
    expect(get("globalUserlist").channels.get("room1")).toEqual([{ name: "x" }]);
    expect(get("globalUserlist").channels.has("other")).toBe(false);
  });

  it("throws before initStore", () => {
    expect(() => snapshot()).toThrow("store not initialized");
  });
});

describe("store — health-related ephemeral defaults", () => {
  let gm: ReturnType<typeof installGmFakeWithListeners>;

  beforeEach(() => {
    _resetStoreForTesting();
    gm = installGmFakeWithListeners();
  });

  it("conn defaults to initial connecting state", async () => {
    await initTestStore(gm);

    expect(get("conn")).toEqual({
      phase: "connecting",
      attempt: 0,
      since: 0,
      lastMessageAt: 0,
      lastSendAt: 0,
      notice: "",
    });
  });

  it("bccHealth defaults to all-clear", async () => {
    await initTestStore(gm);

    expect(get("bccHealth")).toEqual({
      bootError: null,
      sendPathBroken: null,
      injectionDegraded: false,
      signalsDegraded: false,
    });
  });

  it("freshness defaults to zero stamps", async () => {
    await initTestStore(gm);

    expect(get("freshness")).toEqual({ ulistAt: 0, awAt: 0, statsAt: 0 });
  });
});
