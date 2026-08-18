// Tests for the health wiring module: attachConnListeners, stampConnMessage, initHealth.
// Impure (WS listeners, store reads/writes), tested at the boundary with a fake WS
// and the module-registry pattern from ulist-poll.test.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

// afterEach calls vi.resetModules(), so from the second test on statically
// imported modules are STALE instances. Resolve store/utils through the
// registry so init and the module under test share ONE instance.
async function initTestStore() {
  const store = await import("../src/store");
  store._resetStoreForTesting();
  installGmFake();
  const { setUserStore } = await import("../src/utils");
  setUserStore("TestUser", false);
  await store.initStore();
  return store;
}

// Minimal WS fake: no real networking, just event dispatch.
class FakeWS {
  readyState = 0; // CONNECTING
  private listeners = new Map<string, Array<() => void>>();

  addEventListener(type: string, fn: () => void) {
    let arr = this.listeners.get(type);
    if (!arr) {
      arr = [];
      this.listeners.set(type, arr);
    }
    arr.push(fn);
  }

  emit(type: string) {
    const arr = this.listeners.get(type);
    if (arr) arr.forEach((fn) => fn());
  }
}

describe("health wiring", () => {
  beforeEach(async () => {
    await initTestStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("open event sets phase connected, attempt 0, since > 0", async () => {
    const health = await import("../src/health");
    const store = await import("../src/store");

    const ws = new FakeWS();
    health.attachConnListeners(ws as unknown as WebSocket);
    ws.emit("open");

    const conn = store.get("conn");
    expect(conn.phase).toBe("connected");
    expect(conn.attempt).toBe(0);
    expect(conn.since).toBeGreaterThan(0);
  });

  it("close after open sets attempt 1; second close without open sets attempt 2", async () => {
    const health = await import("../src/health");
    const store = await import("../src/store");

    const ws = new FakeWS();
    health.attachConnListeners(ws as unknown as WebSocket);
    ws.emit("open");
    ws.emit("close");

    let conn = store.get("conn");
    expect(conn.phase).toBe("connecting");
    expect(conn.attempt).toBe(1);

    // Another close without an intervening open (failed reconnect attempt)
    ws.emit("close");
    conn = store.get("conn");
    expect(conn.attempt).toBe(2);
  });

  it("attach guard: same ws attached twice, one close emit → attempt exactly 1", async () => {
    const health = await import("../src/health");
    const store = await import("../src/store");

    const ws = new FakeWS();
    health.attachConnListeners(ws as unknown as WebSocket);
    health.attachConnListeners(ws as unknown as WebSocket); // should be no-op
    ws.emit("close");

    const conn = store.get("conn");
    expect(conn.attempt).toBe(1); // only one close listener registered
  });

  it("readyState tiebreaker: ws already open at attach → connected immediately", async () => {
    const health = await import("../src/health");
    const store = await import("../src/store");

    const ws = new FakeWS();
    ws.readyState = 1; // OPEN; the open event already fired before we attached
    health.attachConnListeners(ws as unknown as WebSocket);

    const conn = store.get("conn");
    expect(conn.phase).toBe("connected");
    expect(conn.attempt).toBe(0);
    expect(conn.since).toBeGreaterThan(0);
  });

  it("authdead latch: initHealth then session.authDead=true → latched, open does nothing", async () => {
    const store = await import("../src/store");

    // Set a baseline session snapshot
    await store.set("session", {
      nick: "TestUser",
      registered: true,
      guest: false,
      userId: "42",
      sessionId: "s1",
      channel: "Chatcity",
      authDead: false,
    });

    const health = await import("../src/health");
    health.initHealth();

    // Trigger authDead via store
    await store.set("session", {
      nick: "TestUser",
      registered: true,
      guest: false,
      userId: "42",
      sessionId: "s1",
      channel: "Chatcity",
      authDead: true,
    });

    let conn = store.get("conn");
    expect(conn.phase).toBe("authdead");

    // Open event should not un-latch
    const ws = new FakeWS();
    health.attachConnListeners(ws as unknown as WebSocket);
    ws.emit("open");

    conn = store.get("conn");
    expect(conn.phase).toBe("authdead"); // latch holds
  });

  it("authDead already true at init: latches immediately without waiting for session change", async () => {
    const store = await import("../src/store");

    // Set session with authDead true BEFORE initHealth; simulates
    // initSession's initial set firing before the subscription exists.
    await store.set("session", {
      nick: "TestUser",
      registered: true,
      guest: false,
      userId: "42",
      sessionId: "s1",
      channel: "Chatcity",
      authDead: true,
    });

    const health = await import("../src/health");
    health.initHealth();

    const conn = store.get("conn");
    expect(conn.phase).toBe("authdead"); // init-time check caught it
  });

  it("message stamp: after open, stampConnMessage → lastMessageAt > 0", async () => {
    const health = await import("../src/health");
    const store = await import("../src/store");

    const ws = new FakeWS();
    health.attachConnListeners(ws as unknown as WebSocket);
    ws.emit("open");

    health.stampConnMessage();

    const conn = store.get("conn");
    expect(conn.lastMessageAt).toBeGreaterThan(0);
    expect(conn.phase).toBe("connected");
    expect(conn.attempt).toBe(0);
  });
});

// ─── setstatus wrap (T9) ─────────────────────────────────────────────────────

describe("setstatus wrap", () => {
  beforeEach(async () => {
    await initTestStore();
    (globalThis as any).unsafeWindow = {};
  });

  afterEach(() => {
    delete (globalThis as any).unsafeWindow;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("forwards setstatus texts verbatim to the strip, then calls the original", async () => {
    const health = await import("../src/health");
    const strip = await import("../src/health-strip");
    const orig = vi.fn();
    (globalThis as any).unsafeWindow.chatout_setstatus = orig;

    health.initSetStatusWrap();
    (globalThis as any).unsafeWindow.chatout_setstatus(
      "Bild ist zu gross (max. 5 MB).",
      "#cc0000",
      false,
    );

    expect(strip.currentStripNotice()?.text).toBe("Bild ist zu gross (max. 5 MB).");
    expect(strip.currentStripNotice()?.color).toBe("#cc0000");
    expect(orig).toHaveBeenCalledWith("Bild ist zu gross (max. 5 MB).", "#cc0000", false);
  });

  it("passes a null color through as null", async () => {
    const health = await import("../src/health");
    const strip = await import("../src/health-strip");
    (globalThis as any).unsafeWindow.chatout_setstatus = vi.fn();

    health.initSetStatusWrap();
    (globalThis as any).unsafeWindow.chatout_setstatus("irgendein Text", "", false);

    expect(strip.currentStripNotice()?.color).toBeNull();
  });

  it("missing chatout_setstatus upstream: no-op, no crash", async () => {
    const health = await import("../src/health");
    const strip = await import("../src/health-strip");
    delete (globalThis as any).unsafeWindow.chatout_setstatus;

    expect(() => health.initSetStatusWrap()).not.toThrow();
    expect(strip.currentStripNotice()).toBeNull();
  });
});
