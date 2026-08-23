// ─── Sync in-memory state store ────────────────────────────────────────────
//
// ONE sync store that owns all state. GM storage is a persistence backend read
// once at boot, written back on set. After initStore(), get() is sync and never
// touches GM.

import { getUserKey, cclog } from "./utils";
import type { ConnState, BccHealthState, FreshnessState, InvalidSetting } from "./health-core";

// ─── Types ────────────────────────────────────────────────────────────────

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
  conn: ConnState;
  bccHealth: BccHealthState;
  freshness: FreshnessState;
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
  /** Boot/reconciliation guard: a decoded value that fails it is corrupt,
   * falls back to the default (and at boot lands in bccHealth.invalidSettings). */
  valid?: (v: any) => boolean;
};

const isString = (v: unknown): v is string => typeof v === "string";
const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";
const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

/** Colors are hex, 3 or 6 digits, optional #, any case. A plain string
 * check is not enough: garbage like "C9A227Q" renders black instead of
 * tripping the invalid-settings notice. */
const isHexColor = (v: unknown): v is string =>
  typeof v === "string" && /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);

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
  color: {
    encode: (v) => v,
    decode: (r) => r as string,
    default: "6AAED8",
    persisted: true,
    valid: isHexColor,
  },
  scheme_v2: {
    encode: (v) => v,
    decode: (r) => r as boolean,
    default: false,
    persisted: true,
    valid: isBoolean,
  },
  pinned: {
    encode: (v) => v,
    decode: (r) => r as string[],
    default: [],
    persisted: true,
    valid: isStringArray,
  },
  whisper: {
    encode: (v) => v,
    decode: (r) => r as string,
    default: "",
    persisted: true,
    valid: isString,
  },
  compact: {
    encode: (v: boolean) => (v ? "1" : ""),
    decode: (r) => r === "1",
    default: false,
    persisted: true,
    valid: isBoolean,
  },
  send_on_enter: {
    encode: (v) => v,
    decode: (r) => r as boolean,
    default: true,
    persisted: true,
    valid: isBoolean,
  },
  hover_preview: {
    encode: (v) => v,
    decode: (r) => r as boolean,
    default: true,
    persisted: true,
    valid: isBoolean,
  },
  ban: {
    encode: (v) => v,
    decode: (r) => r as string[],
    default: [],
    persisted: true,
    valid: isStringArray,
  },
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
  conn: {
    encode: (v) => v,
    decode: () => ({ phase: "connecting", attempt: 0, since: 0, lastMessageAt: 0 }),
    default: { phase: "connecting", attempt: 0, since: 0, lastMessageAt: 0 },
    persisted: false,
  },
  bccHealth: {
    encode: (v) => v,
    decode: () => ({
      bootError: null,
      sendPathBroken: null,
      injectionDegraded: false,
      invalidSettings: [] as InvalidSetting[],
      persistFailed: false,
    }),
    default: {
      bootError: null,
      sendPathBroken: null,
      injectionDegraded: false,
      invalidSettings: [] as InvalidSetting[],
      persistFailed: false,
    },
    persisted: false,
  },
  freshness: {
    encode: (v) => v,
    decode: () => ({ ulistAt: 0, awAt: 0, statsAt: 0 }),
    default: { ulistAt: 0, awAt: 0, statsAt: 0 },
    persisted: false,
  },
};

// ─── Module-level state ───────────────────────────────────────────────────

let initialized = false;
const mirror: Partial<{ [K in StoreKey]: any }> = {};
const subscribers = new Map<StoreKey, Set<(v: any) => void>>();

// Persisted values are primitives or string[]; element-wise compare is enough.
// Plain === breaks the echo no-op for arrays: GM serializes, so the re-read
// after our own write returns a fresh array with equal content.
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return false;
}

// ─── Internal helpers ────────────────────────────────────────────────────

function assertInit(): void {
  if (!initialized) throw new Error("store not initialized");
}

function notify<K extends StoreKey>(k: K, v: StateValue<K>): void {
  const set = subscribers.get(k);
  if (!set) return;
  for (const fn of set) {
    // A broken render must not break the writer: other renders still run and
    // set() still persists. Mount-time react() renders are NOT wrapped — a
    // failure there belongs to the mount path and should surface there.
    try {
      fn(v);
    } catch (e) {
      cclog(`render for "${k}" threw: ${(e as Error).message}`, "store");
    }
  }
}

// ─── Public API ──────────────────────────────────────────────────────────

/** Read all persisted keys from GM, seed the mirror silently. Call once. */
export async function initStore(): Promise<void> {
  if (initialized) throw new Error("initStore already called");
  initialized = true;

  // Persisted keys whose stored value failed validation at boot; feeds the D4
  // invalid-settings notice.
  const invalidKeys: InvalidSetting[] = [];

  // Seed persisted keys from GM (silent, no notifies)
  for (const [key, codec] of Object.entries(codecs) as [StoreKey, Codec<any>][]) {
    if (!codec.persisted) {
      mirror[key] = codec.default;
      continue;
    }
    try {
      const raw = await GM.getValue(getUserKey(key));
      // raw is undefined when nothing is stored — use default
      if (raw === undefined) {
        mirror[key] = codec.default;
        continue;
      }
      const decoded = codec.decode(raw);
      // A value that decodes to the wrong shape is corrupt: fall back to the
      // default and collect the key. A rejected read (the catch below) is a
      // storage error, not corrupt data: it defaults without collecting.
      if (codec.valid && !codec.valid(decoded)) {
        cclog(`initStore: corrupt stored ${key}, using default`, "store");
        mirror[key] = codec.default;
        invalidKeys.push({ key, value: raw });
      } else {
        mirror[key] = decoded;
      }
    } catch {
      cclog(`initStore: failed to read ${key}, using default`, "store");
      mirror[key] = codec.default;
    }
  }

  // Fold boot resets into bccHealth, still silent: the strip's react reads
  // the fact at mount time, which is the D4 queueing.
  if (invalidKeys.length > 0) {
    mirror.bccHealth = { ...mirror.bccHealth, invalidSettings: invalidKeys };
  }

  // Register out-of-band reconciliation listeners (spec §6)
  if (typeof GM_addValueChangeListener === "function") {
    cclog("GM_addValueChangeListener available, registering reconciliation listeners", "store");

    for (const [key, codec] of Object.entries(codecs) as [StoreKey, Codec<any>][]) {
      if (!codec.persisted) continue;
      const scopedKey = getUserKey(key);
      GM_addValueChangeListener(scopedKey, () => {
        // Never trust callback args beyond "key changed". Re-read from GM.
        GM.getValue(scopedKey)
          .then((raw: any) => {
            // A deleted key converges to the default, same as boot seeding.
            // A cross-tab write of garbage converges too (never collected:
            // invalidSettings is a boot-only fact).
            let decoded = raw !== undefined ? codec.decode(raw) : codec.default;
            if (codec.valid && !codec.valid(decoded)) {
              cclog(`reconciliation: invalid stored ${key}, using default`, "store");
              decoded = codec.default;
            }
            if (sameValue(decoded, mirror[key])) return; // echo, or equal — no-op
            mirror[key] = decoded;
            notify(key, decoded);
          })
          .catch(() => {
            // Re-read failed; don't corrupt the mirror
            cclog(`reconciliation: failed to re-read ${key}`, "store");
          });
      });
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
 * An invalid value never enters the system: the write is rejected whole
 * (mirror keeps the old value, nothing persists). Types make this
 * near-unreachable; dynamic paths like the settings import are the real
 * guard target. Returns a promise that resolves when GM persistence settles.
 */
export async function set<K extends StoreKey>(k: K, v: StateValue<K>): Promise<void> {
  assertInit();
  const codec = codecs[k];

  if (codec.persisted && codec.valid && !codec.valid(v)) {
    cclog(`set: rejected invalid value for ${k}`, "store");
    return;
  }

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
      // Latch the D4 fact for the strip. Direct mirror + notify, not set():
      // bccHealth is ephemeral so there is no re-persist, and the latch guard
      // keeps repeat failures from notifying again.
      if (!mirror.bccHealth.persistFailed) {
        mirror.bccHealth = { ...mirror.bccHealth, persistFailed: true };
        notify("bccHealth", mirror.bccHealth);
      }
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

// ─── Debug dump (spec §7, assumption A5) ──────────────────────────────

/** Plain-object snapshot of the whole store. Safe to log/mutate — returns copies. */
export function snapshot(): Record<string, unknown> {
  assertInit();
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(codecs) as StoreKey[]) {
    const v = mirror[key];
    // Shallow-copy arrays so the caller can't mutate the store.
    if (Array.isArray(v)) {
      result[key] = [...v];
      continue;
    }
    // globalUserlist.channels is a Map — convert to a plain object for readability.
    if (
      key === "globalUserlist" &&
      v &&
      typeof v === "object" &&
      "channels" in v &&
      (v as any).channels instanceof Map
    ) {
      const gu = v as Ephemeral["globalUserlist"];
      result[key] = {
        channels: Object.fromEntries(gu.channels),
        added: [...gu.added],
        removed: [...gu.removed],
      };
      continue;
    }
    result[key] = v;
  }
  return result;
}

// ─── Test-only reset ────────────────────────────────────────────────────

/** Tear down the store singleton between tests. Not for production use. */
export function _resetStoreForTesting(): void {
  initialized = false;
  for (const key of Object.keys(codecs) as StoreKey[]) {
    delete mirror[key];
  }
  subscribers.clear();
}
