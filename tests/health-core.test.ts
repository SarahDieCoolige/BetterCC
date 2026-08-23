// Tests for health-core.ts: pure connection-state machine and UI derivation.
//
// Zero imports from the store, DOM, or upstream. Tests pin: full transition
// table for nextConn (including authdead latch), staleMarkers boundaries,
// and threshold constants.

import { describe, it, expect } from "vitest";
import {
  nextConn,
  staleMarkers,
  nextStaleChange,
  STALE_FACTOR,
  STALE_MIN_MS,
  type ConnState,
  type ConnEvent,
} from "../src/health-core";
import { POLL_CADENCES } from "../src/cadences";

// ─── Fixtures ─────────────────────────────────────────────────────────────

const INITIAL: ConnState = {
  phase: "connecting",
  attempt: 0,
  since: 0,
  lastMessageAt: 0,
};

function at(t: number): ConnEvent {
  return { type: "open", at: t };
}
function ct(t: number): ConnEvent {
  return { type: "close", at: t };
}
function authEv(t: number): ConnEvent {
  return { type: "authdead", at: t };
}
function msgEv(t: number): ConnEvent {
  return { type: "message", at: t };
}

// ─── Constants ──────────────────────────────────────────────────────────

describe("health-core — threshold constants", () => {
  it("exports expected values", () => {
    expect(STALE_FACTOR).toBe(3);
    expect(STALE_MIN_MS).toBe(30_000);
    expect(POLL_CADENCES.ulist).toBe(20_000);
    expect(POLL_CADENCES.aw).toBe(5_000);
    expect(POLL_CADENCES.stats).toBe(10_000);
  });
});

// ─── nextConn transition table ────────────────────────────────────────────

describe("nextConn — open transitions", () => {
  it("open sets phase to connected, resets attempt to 0, stamps since", () => {
    const state = nextConn({ ...INITIAL, attempt: 3, since: 100 }, at(500));
    expect(state.phase).toBe("connected");
    expect(state.attempt).toBe(0);
    expect(state.since).toBe(500);
  });

  it("open from any previous phase goes connected", () => {
    const fromAuthdead = nextConn(
      {
        phase: "authdead",
        attempt: 5,
        since: 999,
        lastMessageAt: 800,
      },
      at(1000),
    );
    // authdead is terminal, open is ignored
    expect(fromAuthdead.phase).toBe("authdead");
    expect(fromAuthdead.since).toBe(999);
  });
});

describe("nextConn — close transitions", () => {
  it("close sets phase to connecting, increments attempt, stamps since", () => {
    const state = nextConn(
      {
        phase: "connected",
        attempt: 0,
        since: 100,
        lastMessageAt: 200,
      },
      ct(300),
    );
    expect(state.phase).toBe("connecting");
    expect(state.attempt).toBe(1);
    expect(state.since).toBe(300);
    expect(state.lastMessageAt).toBe(200); // preserved
  });

  it("multiple closes increment attempt each time", () => {
    const s1 = nextConn({ ...INITIAL, since: 0 }, ct(100));
    expect(s1.attempt).toBe(1);

    const s2 = nextConn(s1, ct(200));
    expect(s2.attempt).toBe(2);

    const s3 = nextConn(s2, ct(300));
    expect(s3.attempt).toBe(3);

    // An open in between resets attempt
    const s4 = nextConn(s3, at(400));
    expect(s4.attempt).toBe(0);

    // Close after open starts from 0+1=1
    const s5 = nextConn(s4, ct(500));
    expect(s5.attempt).toBe(1);
  });
});

describe("nextConn — message transition", () => {
  it("message only stamps lastMessageAt, nothing else changes", () => {
    const prev = {
      phase: "connected" as const,
      attempt: 0,
      since: 100,
      lastMessageAt: 0,
    };
    const state = nextConn(prev, msgEv(500));
    expect(state.lastMessageAt).toBe(500);
    expect(state.phase).toBe("connected");
    expect(state.attempt).toBe(0);
    expect(state.since).toBe(100);
  });
});

describe("nextConn — authdead latch", () => {
  it("authdead sets phase to authdead and stamps since", () => {
    const prev = {
      phase: "connected" as const,
      attempt: 0,
      since: 100,
      lastMessageAt: 200,
    };
    const state = nextConn(prev, authEv(300));
    expect(state.phase).toBe("authdead");
    expect(state.since).toBe(300);
    // preserved from prev
    expect(state.attempt).toBe(0);
    expect(state.lastMessageAt).toBe(200);
  });

  it("authdead is terminal — close after authdead returns unchanged", () => {
    const locked = nextConn(
      {
        phase: "connected" as const,
        attempt: 0,
        since: 100,
        lastMessageAt: 200,
      },
      authEv(300),
    );
    const afterClose = nextConn(locked, ct(400));
    expect(afterClose).toEqual(locked);
  });

  it("authdead is terminal — open after authdead returns unchanged", () => {
    const locked = nextConn(
      {
        phase: "connected" as const,
        attempt: 0,
        since: 100,
        lastMessageAt: 200,
      },
      authEv(300),
    );
    const afterOpen = nextConn(locked, at(500));
    expect(afterOpen).toEqual(locked);
  });

  it("authdead is terminal — message after authdead returns unchanged", () => {
    const locked = nextConn(
      {
        phase: "connected" as const,
        attempt: 0,
        since: 100,
        lastMessageAt: 200,
      },
      authEv(300),
    );
    const afterMsg = nextConn(locked, msgEv(600));
    expect(afterMsg).toEqual(locked);
  });

  it("authdead is terminal — second authdead returns unchanged", () => {
    const locked = nextConn(
      {
        phase: "connected" as const,
        attempt: 0,
        since: 100,
        lastMessageAt: 200,
      },
      authEv(300),
    );
    const afterSecond = nextConn(locked, authEv(700));
    expect(afterSecond).toEqual(locked);
  });
});

// ─── staleMarkers ────────────────────────────────────────────────────────

describe("staleMarkers — boundaries", () => {
  it("stamp 0 (never succeeded) is never stale — boot exclusion", () => {
    const result = staleMarkers({ ulistAt: 0, awAt: 0, statsAt: 0 }, 100_000);
    expect(result.ulist).toBeNull();
    expect(result.aw).toBeNull();
    expect(result.stats).toBeNull();
  });

  it("ulist stale only past max(3x interval, 30s), strict >", () => {
    // ulist interval 20s → threshold 60s; elapsed exactly 60s is not stale
    expect(staleMarkers({ ulistAt: 1, awAt: 0, statsAt: 0 }, 60_001).ulist).toBeNull();
    expect(staleMarkers({ ulistAt: 1, awAt: 0, statsAt: 0 }, 60_002).ulist).toBe(60_001);
  });

  it("aw uses the 30s floor (3x 5s = 15s < 30s)", () => {
    expect(staleMarkers({ ulistAt: 0, awAt: 1, statsAt: 0 }, 30_001).aw).toBeNull();
    expect(staleMarkers({ ulistAt: 0, awAt: 1, statsAt: 0 }, 30_002).aw).toBe(30_001);
  });

  it("stats uses the floor too (3x 10s = 30s)", () => {
    expect(staleMarkers({ ulistAt: 0, awAt: 0, statsAt: 1 }, 30_001).stats).toBeNull();
    expect(staleMarkers({ ulistAt: 0, awAt: 0, statsAt: 1 }, 30_002).stats).toBe(30_001);
  });

  it("ulist and aw go stale independently — each marker shows its own age", () => {
    // ulist age 2 min, aw age 1 min: no merge, both ages in ms
    const m = staleMarkers({ ulistAt: 1, awAt: 60_001, statsAt: 0 }, 120_001);
    expect(m.ulist).toBe(120_000);
    expect(m.aw).toBe(60_000);
  });
});

// ─── nextStaleChange ─────────────────────────────────────────────────────

describe("nextStaleChange", () => {
  it("no stamps scheduled: null (boot exclusion)", () => {
    expect(nextStaleChange({ ulistAt: 0, awAt: 0, statsAt: 0 }, 100_000)).toBeNull();
  });

  it("before stale: the threshold crossing is the next change", () => {
    // ulistAt=1, threshold 60s → crossing at 60_001
    expect(nextStaleChange({ ulistAt: 1, awAt: 0, statsAt: 0 }, 10_000)).toBe(60_001);
  });

  it("crossing already passed: the next change is the age tick, not null", () => {
    // ulistAt=1 went stale at 60_001; at now=70_000 age is 1, ticks to 2 at 120_001
    expect(nextStaleChange({ ulistAt: 1, awAt: 0, statsAt: 0 }, 70_000)).toBe(120_001);
  });

  it("REGRESSION: once stale, second boundaries keep the sub-minute age moving", () => {
    // awAt=1 went stale at 30_001; at now=45_000 the tooltip reads "vor 44 s"
    // and must tick every second, not wait out the minute.
    expect(nextStaleChange({ ulistAt: 0, awAt: 1, statsAt: 0 }, 45_000)).toBe(45_001);
  });

  it("the last second boundary is the minute flip at stamp+60s", () => {
    // at 59.5s the next tick lands on 60s: "59 s" → "1 min", same instant for
    // both the second and the minute schedule
    expect(nextStaleChange({ ulistAt: 0, awAt: 1, statsAt: 0 }, 59_500)).toBe(60_001);
  });

  it("minute tick lands on the NEXT boundary, not the one just passed", () => {
    // aw stale since 30_001; at now=61_000 the age is already 1, next tick 2
    // is at stamp+120_000 — no more second ticks once the age reads in minutes
    expect(nextStaleChange({ ulistAt: 0, awAt: 1, statsAt: 0 }, 61_000)).toBe(120_001);
  });

  it("earliest event wins across sources", () => {
    // ulist crossing at 60_001, stats crossing at 30_001
    expect(nextStaleChange({ ulistAt: 1, awAt: 0, statsAt: 1 }, 10_000)).toBe(30_001);
  });
});
