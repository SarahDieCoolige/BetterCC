// Tests for the v3 data-layer event bus (spec §2.2).
//
// The store is a module-level singleton pub/sub (~30 lines). It is pure
// in-memory state with no DOM/WS/GM dependencies, so it is fully unit-testable.
// UI components subscribe() and re-render on emit(); this pins the bus contract.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  subscribe,
  emit,
  type BccEvent,
} from "../src/v3/store";

// A couple of concrete event shapes the bus must carry (spec §2.2). The union
// is open in the impl, but these are the ones the data layer emits.
const userlistEvent: BccEvent = {
  type: "userlist",
  users: [],
  added: ["Alpha"],
  removed: [],
};
const configEvent: BccEvent = { type: "config", key: "color_testuser" };

describe("event bus — subscribe / emit", () => {
  beforeEach(() => {
    // The store is a module singleton; tests must not leak listeners between
    // cases. Re-importing per test would isolate it, but unsubscribe is the
    // documented cleanup path, so we exercise that here instead.
  });

  it("delivers an emitted event to a subscribed listener", () => {
    const fn = vi.fn();
    const off = subscribe(fn);
    emit(userlistEvent);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(userlistEvent);
    off();
  });

  it("delivers to multiple independent listeners", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribe(a);
    const offB = subscribe(b);
    emit(configEvent);
    expect(a).toHaveBeenCalledWith(configEvent);
    expect(b).toHaveBeenCalledWith(configEvent);
    offA();
    offB();
  });

  it("subscribing the same listener twice is idempotent (Set semantics — spec §2.2)", () => {
    // The bus uses a Set<Listener>, so a double-subscribe of the same function
    // reference does NOT double-deliver. This is the safer default: it guards
    // against accidental double-registration causing duplicate renders.
    const fn = vi.fn();
    const off1 = subscribe(fn);
    const off2 = subscribe(fn);
    emit(userlistEvent);
    expect(fn).toHaveBeenCalledTimes(1);
    off1();
    // off2 is a no-op here (same ref already removed), but must be callable.
    off2();
  });
});

describe("event bus — unsubscribe", () => {
  it("the returned unsubscribe stops further delivery to that listener", () => {
    const fn = vi.fn();
    const off = subscribe(fn);
    off();
    emit(userlistEvent);
    expect(fn).not.toHaveBeenCalled();
  });

  it("unsubscribing one listener leaves the others intact", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribe(a);
    const offB = subscribe(b);
    offA();
    emit(configEvent);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledWith(configEvent);
    offB();
  });

  it("unsubscribe is idempotent — calling twice is a no-op", () => {
    const fn = vi.fn();
    const off = subscribe(fn);
    off();
    off();
    emit(userlistEvent);
    expect(fn).not.toHaveBeenCalled();
  });
});
