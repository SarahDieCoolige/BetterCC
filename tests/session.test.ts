// Tests for the session adapter (src/session.ts).
//
// After S7a migration: session.ts is a pure store adapter. initSession() reads
// upstream globals, builds a snapshot, and set("session", ...) into the store.
// getSession() returns get("session"). No bus events emitted.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { setUserStore } from "../src/utils";
import { initStore, get, on, _resetStoreForTesting } from "../src/store";

// unsafeWindow is a GM API global — fake it as a plain object.
declare const unsafeWindow: any;
if (!(globalThis as any).unsafeWindow) {
  (globalThis as any).unsafeWindow = {};
}

// ─── In-memory GM fake ───────────────────────────────────────────────────────

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
      for (const [, cb] of listeners) cb(key, old, val, false);
      return Promise.resolve();
    },
  };
  (globalThis as any).GM = fake;
  (globalThis as any).GM_log = () => {};
}

function installGmFakeWithListeners() {
  installGmFake();
  let nextId = 1;
  (globalThis as any).GM_addValueChangeListener = (
    key: string,
    callback: (key: string, oldValue: any, newValue: any, remote: boolean) => void,
  ): number => {
    const id = nextId++;
    (globalThis as any).__gmListeners = (globalThis as any).__gmListeners || new Map();
    (globalThis as any).__gmListeners.set(id, callback);
    return id;
  };
  (globalThis as any).GM_removeValueChangeListener = (id: number) => {
    (globalThis as any).__gmListeners?.delete(id);
  };
}

// ─── Upstream global fakes ──────────────────────────────────────────────────

function setUpstreamDefaults() {
  (unsafeWindow as any).chat_nick = "TestNick";
  (unsafeWindow as any).chat_ui = "Rh";
  (unsafeWindow as any).chat_id = "uid-42";
  (unsafeWindow as any).chat_sid = "sid-99";
  (unsafeWindow as any).chat_channel = "Lobby";
  (unsafeWindow as any).chatout_auth_dead = false;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("session — initSession writes to store", () => {
  beforeEach(() => {
    _resetStoreForTesting();
    installGmFakeWithListeners();
    setUserStore("TestUser", false);
    setUpstreamDefaults();
  });

  it("initSession seeds the store with upstream globals", async () => {
    await initStore();
    const { initSession } = await import("../src/session");

    initSession();

    const s = get("session");
    expect(s.nick).toBe("TestNick");
    expect(s.registered).toBe(true); // "R" in chat_ui
    expect(s.guest).toBe(false); // has "R", so not guest
    expect(s.userId).toBe("uid-42");
    expect(s.sessionId).toBe("sid-99");
    expect(s.channel).toBe("Lobby");
    expect(s.authDead).toBe(false);
  });

  it("getSession returns the store value", async () => {
    await initStore();
    const { initSession, getSession } = await import("../src/session");

    initSession();

    expect(getSession()).toBe(get("session"));
  });

  it("initSession notifies store subscribers on initial seed", async () => {
    await initStore();
    const { initSession } = await import("../src/session");

    const fn = vi.fn();
    on("session", fn);
    initSession();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0].nick).toBe("TestNick");
  });

  it("poll detects channel change and updates store", async () => {
    await initStore();
    const { initSession } = await import("../src/session");

    vi.useFakeTimers();
    initSession();

    const fn = vi.fn();
    on("session", fn);
    const callCountBefore = fn.length; // calls so far

    // Simulate channel change
    (unsafeWindow as any).chat_channel = "Zauberwald";
    vi.advanceTimersByTime(2100); // past the 2s interval

    expect(fn.mock.calls.length).toBeGreaterThan(callCountBefore);
    const latest = fn.mock.calls[fn.mock.calls.length - 1][0];
    expect(latest.channel).toBe("Zauberwald");

    vi.useRealTimers();
  });

  it("poll detects authDead change and updates store", async () => {
    await initStore();
    const { initSession } = await import("../src/session");

    vi.useFakeTimers();
    initSession();

    const fn = vi.fn();
    on("session", fn);
    const callCountBefore = fn.mock.calls.length;

    (unsafeWindow as any).chatout_auth_dead = true;
    vi.advanceTimersByTime(2100);

    expect(fn.mock.calls.length).toBeGreaterThan(callCountBefore);
    const latest = fn.mock.calls[fn.mock.calls.length - 1][0];
    expect(latest.authDead).toBe(true);

    vi.useRealTimers();
  });

  it("poll does not set when nothing changed", async () => {
    await initStore();
    const { initSession } = await import("../src/session");

    vi.useFakeTimers();
    initSession();

    // Drain the initial set notification
    const fn = vi.fn();
    on("session", fn);
    const callsAfterInit = fn.mock.calls.length;

    // No upstream globals changed
    vi.advanceTimersByTime(2100);

    // No additional notifications
    expect(fn.mock.calls.length).toBe(callsAfterInit);

    vi.useRealTimers();
  });
});

describe("session — no bus session events emitted", () => {
  beforeEach(() => {
    _resetStoreForTesting();
    installGmFakeWithListeners();
    setUserStore("TestUser", false);
    setUpstreamDefaults();
  });

  it("initSession does not import or call emit from bus", async () => {
    await initStore();
    const { initSession } = await import("../src/session");

    const busModule = await import("../src/bus");
    const emitSpy = vi.spyOn(busModule, "emit");

    initSession();
    expect(emitSpy).not.toHaveBeenCalled();
  });
});
