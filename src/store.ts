// ─── Sync in-memory state store (spec §4) ──────────────────────────────────
//
// ONE sync store that owns all state. GM storage is a persistence backend read
// once at boot, written back on set. After initStore(), get() is sync and never
// touches GM. Types moved here from bus.ts; bus.ts re-exports until S7 deletes it.

import { getUserKey } from "./utils";
import { cclog } from "./utils";

// ─── Types (moved from bus.ts) ────────────────────────────────────────────

/** A user as parsed from the upstream cha[]/cha_my[] arrays. */
export interface User {
  name: string;
  key: string; // name.toLowerCase()
  registered: boolean;
  guest: boolean;
  sep: boolean;
  away: boolean;
}

/** A user found in the global userlist (aw.js), with their channel. */
export interface UserWithChannel {
  user: User;
  channel: string;
}

/** Session state read from unsafeWindow globals. */
export interface SessionState {
  nick: string;
  registered: boolean;
  guest: boolean;
  userId: string;
  sessionId: string;
  channel: string;
  authDead: boolean;
}

// ─── Store shapes ─────────────────────────────────────────────────────────

// Persisted: user intent. Seeded from GM at boot, mirrored back on set.
export type Persisted = {
  color: string;
  scheme_v2: boolean;
  pinned: string[];
  whisper: string;
  compact: boolean;
  send_on_enter: boolean;
  hover_preview: boolean;
  ban: string[];
};

// Ephemeral: host-derived snapshots. Never persisted.
export type Ephemeral = {
  session: SessionState;
  userlist: { users: User[]; added: string[]; removed: string[] };
  globalUserlist: {
    channels: Map<string, User[]>;
    added: UserWithChannel[];
    removed: UserWithChannel[];
  };
};

export type StoreKey = keyof Persisted | keyof Ephemeral;

type StateValue<K extends StoreKey> = K extends keyof Persisted
  ? Persisted[K]
  : K extends keyof Ephemeral
    ? Ephemeral[K]
    : never;

// ─── Codec table ──────────────────────────────────────────────────────────
//
// Each persisted key has an encode/decode pair. Most keys store their JSON value
// natively (GM serializes). Only compact needs a legacy codec.

type Codec<V> = {
  encode: (v: V) => unknown;
  decode: (raw: unknown) => V;
  default: V;
  persisted: boolean;
};

const emptySession: SessionState = {
  nick: "",
  registered: false,
  guest: false,
  userId: "",
  sessionId: "",
  channel: "",
  authDead: false,
};

const codecs: { [K in StoreKey]: Codec<any> } = {
  color: { encode: (v) => v, decode: (r) => r as string, default: "6AAED8", persisted: true },
  scheme_v2: { encode: (v) => v, decode: (r) => r as boolean, default: false, persisted: true },
  pinned: { encode: (v) => v, decode: (r) => r as string[], default: [], persisted: true },
  whisper: { encode: (v) => v, decode: (r) => r as string, default: "", persisted: true },
  compact: {
    encode: (v: boolean) => (v ? "1" : ""),
    decode: (r) => r === "1",
    default: false,
    persisted: true,
  },
  send_on_enter: { encode: (v) => v, decode: (r) => r as boolean, default: true, persisted: true },
  hover_preview: { encode: (v) => v, decode: (r) => r as boolean, default: true, persisted: true },
  ban: { encode: (v) => v, decode: (r) => r as string[], default: [], persisted: true },
  session: {
    encode: (v) => v,
    decode: () => emptySession,
    default: emptySession,
    persisted: false,
  },
  userlist: {
    encode: (v) => v,
    decode: () => ({ users: [], added: [], removed: [] }),
    default: { users: [], added: [], removed: [] },
    persisted: false,
  },
  globalUserlist: {
    encode: (v) => v,
    decode: () => ({ channels: new Map(), added: [], removed: [] }),
    default: { channels: new Map(), added: [], removed: [] },
    persisted: false,
  },
};

// ─── Module-level state ───────────────────────────────────────────────────

let initialized = false;
const mirror: Partial<{ [K in StoreKey]: any }> = {};
const subscribers = new Map<StoreKey, Set<(v: any) => void>>();
const listenerIds: number[] = [];

// ─── Internal helpers ────────────────────────────────────────────────────

function assertInit(): void {
  if (!initialized) throw new Error("store not initialized");
}

function notify<K extends StoreKey>(k: K, v: StateValue<K>): void {
  const set = subscribers.get(k);
  if (!set) return;
  for (const fn of set) fn(v);
}

// ─── Public API ──────────────────────────────────────────────────────────

/** Read all persisted keys from GM, seed the mirror silently. Call once. */
export async function initStore(): Promise<void> {
  if (initialized) throw new Error("initStore already called");
  initialized = true;

  // Seed persisted keys from GM (silent, no notifies)
  for (const [key, codec] of Object.entries(codecs) as [StoreKey, Codec<any>][]) {
    if (!codec.persisted) {
      mirror[key] = codec.default;
      continue;
    }
    try {
      const raw = await GM.getValue(getUserKey(key));
      // raw is undefined when nothing is stored — use default
      mirror[key] = raw !== undefined ? codec.decode(raw) : codec.default;
    } catch {
      cclog(`initStore: failed to read ${key}, using default`, "store");
      mirror[key] = codec.default;
    }
  }

  // Register out-of-band reconciliation listeners (spec §6)
  if (typeof GM_addValueChangeListener === "function") {
    cclog("GM_addValueChangeListener available, registering reconciliation listeners", "store");

    for (const [key, codec] of Object.entries(codecs) as [StoreKey, Codec<any>][]) {
      if (!codec.persisted) continue;
      const scopedKey = getUserKey(key);
      const id = GM_addValueChangeListener(scopedKey, () => {
        // Never trust callback args beyond "key changed". Re-read from GM.
        GM.getValue(scopedKey)
          .then((raw: any) => {
            const decoded = codec.decode(raw);
            if (decoded === mirror[key]) return; // own write echo, or equal — no-op
            mirror[key] = decoded;
            notify(key, decoded);
          })
          .catch(() => {
            // Re-read failed; don't corrupt the mirror
            cclog(`reconciliation: failed to re-read ${key}`, "store");
          });
      });
      listenerIds.push(id);
    }
  } else {
    cclog("GM_addValueChangeListener not available, cross-tab sync disabled", "store");
  }
}

/** Synchronous mirror read. Throws before initStore(). */
export function get<K extends StoreKey>(k: K): StateValue<K> {
  assertInit();
  return mirror[k] as StateValue<K>;
}

/**
 * Mirror → notify → persist. Ordering is load-bearing.
 * Returns a promise that resolves when GM persistence settles.
 */
export async function set<K extends StoreKey>(k: K, v: StateValue<K>): Promise<void> {
  assertInit();
  const codec = codecs[k];

  // 1. mirror
  mirror[k] = v;

  // 2. notify synchronously
  notify(k, v);

  // 3. persist (if persisted key)
  if (codec.persisted) {
    try {
      await GM.setValue(getUserKey(k), codec.encode(v));
    } catch {
      cclog(`set: failed to persist ${k}`, "store");
    }
  }
}

/** Per-key subscription. Returns unsubscribe. */
export function on<K extends StoreKey>(k: K, fn: (v: StateValue<K>) => void): () => void {
  assertInit();
  if (!subscribers.has(k)) subscribers.set(k, new Set());
  const set = subscribers.get(k)!;
  set.add(fn as (v: any) => void);
  return () => {
    set.delete(fn as (v: any) => void);
  };
}

/**
 * Calls render(get(k)) immediately, then subscribes.
 * Returns unsubscribe.
 */
export function react<K extends StoreKey>(k: K, render: (v: StateValue<K>) => void): () => void {
  render(get(k));
  return on(k, render);
}

// ─── Test-only reset ────────────────────────────────────────────────────

/** Tear down the store singleton between tests. Not for production use. */
export function _resetStoreForTesting(): void {
  initialized = false;
  for (const key of Object.keys(codecs) as StoreKey[]) {
    delete mirror[key];
  }
  subscribers.clear();
  listenerIds.length = 0;
}
