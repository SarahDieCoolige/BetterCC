// Tests for the sync config cache (config-cache.ts).
//
// The cache provides synchronous getters for hot-path flags (sendOnEnter,
// hoverPreview) so the keydown handler doesn't need to await GM.getValue.
// It seeds from GM storage at init and refreshes from the store's
// {type:"config"} event so a settings Save takes effect live.

import { describe, it, expect, beforeEach } from "vitest";
import { setUserStore } from "../src/utils";
import { initConfigCache, sendOnEnter, hoverPreview } from "../src/config-cache";
import { setConfig } from "../src/config";
import { emit } from "../src/store";

// ─── In-memory GM fake (same shape as tests/config.test.ts) ─────────────

function installGmFake() {
  const store = new Map<string, unknown>();
  const fake = {
    getValue: (key: string, def?: unknown) =>
      store.has(key) ? Promise.resolve(store.get(key)) : Promise.resolve(def),
    setValue: (key: string, val: unknown) => {
      store.set(key, val);
      return Promise.resolve();
    },
  };
  (globalThis as any).GM = fake;
}

beforeEach(() => {
  installGmFake();
});

// ─── Init / defaults ──────────────────────────────────────────────────

describe("config cache — init and defaults", () => {
  it("returns true for both flags when nothing is stored", async () => {
    setUserStore("CacheTest", false);
    await initConfigCache();
    expect(sendOnEnter()).toBe(true);
    expect(hoverPreview()).toBe(true);
  });

  it("reads a stored send_on_enter=false value from GM", async () => {
    setUserStore("CacheTest", false);
    await setConfig("send_on_enter", false);
    await initConfigCache();
    expect(sendOnEnter()).toBe(false);
    // hover_preview wasn't stored → stays at default
    expect(hoverPreview()).toBe(true);
  });
});

// ─── Live refresh via store event ───────────────────────────────────────

describe("config cache — live refresh", () => {
  it("refreshes sendOnEnter when a config event is emitted", async () => {
    setUserStore("CacheTest", false);
    await setConfig("send_on_enter", true);
    await initConfigCache();
    expect(sendOnEnter()).toBe(true);

    // Write the new value to GM, then emit so the subscriber re-reads
    await setConfig("send_on_enter", false);
    emit({ type: "config", key: "send_on_enter" });

    // The subscriber is async (void getConfig.then(...)), so flush microtasks
    await new Promise((r) => setTimeout(r, 0));

    expect(sendOnEnter()).toBe(false);
  });

  it("ignores an unrelated config key", async () => {
    setUserStore("CacheTest", false);
    await initConfigCache();
    // Both should be defaults after init
    expect(sendOnEnter()).toBe(true);
    expect(hoverPreview()).toBe(true);

    emit({ type: "config", key: "pinned" });
    await new Promise((r) => setTimeout(r, 0));

    expect(sendOnEnter()).toBe(true);
    expect(hoverPreview()).toBe(true);
  });
});
