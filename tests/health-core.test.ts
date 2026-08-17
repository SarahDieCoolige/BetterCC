// Tests for health-core.ts — pure connection-state machine and UI derivation.
//
// Zero imports from the store, DOM, or upstream. Tests pin: full transition
// table for nextConn (including authdead latch), deriveUiState boundaries,
// and threshold constants.

import { describe, it, expect } from "vitest";
import {
  nextConn,
  deriveUiState,
  STUCK_MS,
  ECHO_TIMEOUT_MS,
  STALE_FACTOR,
  STALE_MIN_MS,
  POLL_INTERVALS,
  type ConnState,
  type ConnEvent,
  type FreshnessState,
} from "../src/health-core";

// ─── Fixtures ─────────────────────────────────────────────────────────────

const INITIAL: ConnState = {
  phase: "connecting",
  attempt: 0,
  since: 0,
  lastMessageAt: 0,
  notice: "",
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
function noticeEv(text: string): ConnEvent {
  return { type: "notice", text };
}

// ─── Constants ──────────────────────────────────────────────────────────

describe("health-core — threshold constants", () => {
  it("exports expected values", () => {
    expect(STUCK_MS).toBe(30_000);
    expect(ECHO_TIMEOUT_MS).toBe(10_000);
    expect(STALE_FACTOR).toBe(3);
    expect(STALE_MIN_MS).toBe(30_000);
    expect(POLL_INTERVALS.ulist).toBe(20_000);
    expect(POLL_INTERVALS.aw).toBe(5_000);
    expect(POLL_INTERVALS.stats).toBe(20_000);
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
      { phase: "authdead", attempt: 5, since: 999, lastMessageAt: 800, notice: "dead" },
      at(1000),
    );
    // authdead is terminal — open is ignored
    expect(fromAuthdead.phase).toBe("authdead");
    expect(fromAuthdead.since).toBe(999);
  });
});

describe("nextConn — close transitions", () => {
  it("close sets phase to connecting, increments attempt, stamps since", () => {
    const state = nextConn(
      { phase: "connected", attempt: 0, since: 100, lastMessageAt: 200, notice: "" },
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
      notice: "",
    };
    const state = nextConn(prev, msgEv(500));
    expect(state.lastMessageAt).toBe(500);
    expect(state.phase).toBe("connected");
    expect(state.attempt).toBe(0);
    expect(state.since).toBe(100);
    expect(state.notice).toBe("");
  });
});

describe("nextConn — notice transition", () => {
  it("notice only sets the notice text, nothing else changes", () => {
    const prev = {
      phase: "connecting" as const,
      attempt: 2,
      since: 100,
      lastMessageAt: 0,
      notice: "old",
    };
    const state = nextConn(prev, noticeEv("new notice"));
    expect(state.notice).toBe("new notice");
    expect(state.phase).toBe("connecting");
    expect(state.attempt).toBe(2);
    expect(state.since).toBe(100);
    expect(state.lastMessageAt).toBe(0);
  });
});

describe("nextConn — authdead latch", () => {
  it("authdead sets phase to authdead and stamps since", () => {
    const prev = {
      phase: "connected" as const,
      attempt: 0,
      since: 100,
      lastMessageAt: 200,
      notice: "",
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
      { phase: "connected" as const, attempt: 0, since: 100, lastMessageAt: 200, notice: "" },
      authEv(300),
    );
    const afterClose = nextConn(locked, ct(400));
    expect(afterClose).toEqual(locked);
  });

  it("authdead is terminal — open after authdead returns unchanged", () => {
    const locked = nextConn(
      { phase: "connected" as const, attempt: 0, since: 100, lastMessageAt: 200, notice: "" },
      authEv(300),
    );
    const afterOpen = nextConn(locked, at(500));
    expect(afterOpen).toEqual(locked);
  });

  it("authdead is terminal — message after authdead returns unchanged", () => {
    const locked = nextConn(
      { phase: "connected" as const, attempt: 0, since: 100, lastMessageAt: 200, notice: "" },
      authEv(300),
    );
    const afterMsg = nextConn(locked, msgEv(600));
    expect(afterMsg).toEqual(locked);
  });

  it("authdead is terminal — notice after authdead returns unchanged", () => {
    const locked = nextConn(
      { phase: "connected" as const, attempt: 0, since: 100, lastMessageAt: 200, notice: "" },
      authEv(300),
    );
    const afterNotice = nextConn(locked, noticeEv("ignored"));
    expect(afterNotice).toEqual(locked);
  });

  it("authdead is terminal — second authdead returns unchanged", () => {
    const locked = nextConn(
      { phase: "connected" as const, attempt: 0, since: 100, lastMessageAt: 200, notice: "" },
      authEv(300),
    );
    const afterSecond = nextConn(locked, authEv(700));
    expect(afterSecond).toEqual(locked);
  });
});

// ─── deriveUiState ───────────────────────────────────────────────────────

describe("deriveUiState — stuck detection", () => {
  it("not stuck when connecting for exactly STUCK_MS (boundary)", () => {
    const conn: ConnState = {
      phase: "connecting",
      attempt: 1,
      since: 0,
      lastMessageAt: 0,
      notice: "",
    };
    // now - since = STUCK_MS exactly → not stuck (strict >)
    const result = deriveUiState(conn, { ulistAt: 0, awAt: 0, statsAt: 0 }, STUCK_MS);
    expect(result.stuck).toBe(false);
  });

  it("not stuck at 29_999 ms", () => {
    const conn: ConnState = {
      phase: "connecting",
      attempt: 1,
      since: 0,
      lastMessageAt: 0,
      notice: "",
    };
    const result = deriveUiState(conn, { ulistAt: 0, awAt: 0, statsAt: 0 }, 29_999);
    expect(result.stuck).toBe(false);
  });

  it("stuck at 30_001 ms (just past STUCK_MS)", () => {
    const conn: ConnState = {
      phase: "connecting",
      attempt: 1,
      since: 1,
      lastMessageAt: 0,
      notice: "",
    };
    const result = deriveUiState(conn, { ulistAt: 0, awAt: 0, statsAt: 0 }, 30_002);
    expect(result.stuck).toBe(true);
  });

  it("not stuck when since is 0 (never started connecting)", () => {
    const conn: ConnState = {
      phase: "connecting",
      attempt: 0,
      since: 0,
      lastMessageAt: 0,
      notice: "",
    };
    const result = deriveUiState(conn, { ulistAt: 0, awAt: 0, statsAt: 0 }, 100_000);
    expect(result.stuck).toBe(false);
  });

  it("not stuck when phase is connected", () => {
    const conn: ConnState = {
      phase: "connected",
      attempt: 0,
      since: 0,
      lastMessageAt: 0,
      notice: "",
    };
    const result = deriveUiState(conn, { ulistAt: 0, awAt: 0, statsAt: 0 }, 100_000);
    expect(result.stuck).toBe(false);
  });
});

describe("deriveUiState — zombie detection", () => {
  it("zombie when connected, send armed, and elapsed > ECHO_TIMEOUT_MS", () => {
    const conn: ConnState = {
      phase: "connected",
      attempt: 0,
      since: 0,
      lastMessageAt: 0,
      notice: "",
    };
    const result = deriveUiState(conn, { ulistAt: 0, awAt: 0, statsAt: 0 }, 10_001, 0);
    expect(result.zombie).toBe(true);
  });

  it("not zombie at exactly ECHO_TIMEOUT_MS (boundary)", () => {
    const conn: ConnState = {
      phase: "connected",
      attempt: 0,
      since: 0,
      lastMessageAt: 0,
      notice: "",
    };
    const result = deriveUiState(conn, { ulistAt: 0, awAt: 0, statsAt: 0 }, ECHO_TIMEOUT_MS, 0);
    expect(result.zombie).toBe(false);
  });

  it("not zombie when sendAt is undefined (not armed)", () => {
    const conn: ConnState = {
      phase: "connected",
      attempt: 0,
      since: 0,
      lastMessageAt: 0,
      notice: "",
    };
    const result = deriveUiState(conn, { ulistAt: 0, awAt: 0, statsAt: 0 }, 100_000);
    expect(result.zombie).toBe(false);
  });

  it("not zombie when phase is connecting", () => {
    const conn: ConnState = {
      phase: "connecting",
      attempt: 1,
      since: 0,
      lastMessageAt: 0,
      notice: "",
    };
    const result = deriveUiState(conn, { ulistAt: 0, awAt: 0, statsAt: 0 }, 100_000, 0);
    expect(result.zombie).toBe(false);
  });
});

describe("deriveUiState — stale detection", () => {
  it("stamp 0 (never succeeded) is never stale — boot exclusion", () => {
    const conn: ConnState = {
      phase: "connected",
      attempt: 0,
      since: 0,
      lastMessageAt: 0,
      notice: "",
    };
    const freshness: FreshnessState = { ulistAt: 0, awAt: 0, statsAt: 0 };
    const result = deriveUiState(conn, freshness, 100_000);
    expect(result.stale.ulist).toBe(false);
    expect(result.stale.aw).toBe(false);
    expect(result.stale.stats).toBe(false);
  });

  it("stale at exactly max(interval * STALE_FACTOR, STALE_MIN_MS) + 1", () => {
    const conn: ConnState = {
      phase: "connected",
      attempt: 0,
      since: 0,
      lastMessageAt: 0,
      notice: "",
    };
    // ulist: interval=20_000, 3x=60_000, max(60_000, 30_000)=60_000
    // ulistAt is 0 → never stale, so test with a non-zero stamp
    const result2 = deriveUiState(conn, { ulistAt: 1, awAt: 1, statsAt: 1 }, 60_001);
    // now=60_001, stamp=1 → elapsed=60_000 → exactly threshold → not stale (strict >)
    expect(result2.stale.ulist).toBe(false);

    const result3 = deriveUiState(conn, { ulistAt: 1, awAt: 1, statsAt: 1 }, 60_002);
    expect(result3.stale.ulist).toBe(true);
  });

  it("aw uses STALE_MIN_MS because 5_000*3=15_000 < 30_000", () => {
    const conn: ConnState = {
      phase: "connected",
      attempt: 0,
      since: 0,
      lastMessageAt: 0,
      notice: "",
    };
    // aw: interval=5_000, 3x=15_000, max(15_000, 30_000)=30_000
    // awAt=1, now=30_001 → elapsed=30_000 → exactly threshold → not stale
    const r1 = deriveUiState(conn, { ulistAt: 0, awAt: 1, statsAt: 0 }, 30_001);
    expect(r1.stale.aw).toBe(false);

    // now=30_002 → elapsed=30_001 > 30_000 → stale
    const r2 = deriveUiState(conn, { ulistAt: 0, awAt: 1, statsAt: 0 }, 30_002);
    expect(r2.stale.aw).toBe(true);
  });

  it("stats uses same logic as ulist (20_000 interval → 60_000 threshold)", () => {
    const conn: ConnState = {
      phase: "connected",
      attempt: 0,
      since: 0,
      lastMessageAt: 0,
      notice: "",
    };
    const r1 = deriveUiState(conn, { ulistAt: 0, awAt: 0, statsAt: 1 }, 60_001);
    expect(r1.stale.stats).toBe(false);

    const r2 = deriveUiState(conn, { ulistAt: 0, awAt: 0, statsAt: 1 }, 60_002);
    expect(r2.stale.stats).toBe(true);
  });

  it("all three sources stale independently", () => {
    const conn: ConnState = {
      phase: "connected",
      attempt: 0,
      since: 0,
      lastMessageAt: 0,
      notice: "",
    };
    // ulistAt and statsAt are stale, awAt is fresh
    const freshness: FreshnessState = { ulistAt: 1, awAt: 10_000_000, statsAt: 1 };
    const result = deriveUiState(conn, freshness, 100_000);
    expect(result.stale.ulist).toBe(true);
    expect(result.stale.aw).toBe(false);
    expect(result.stale.stats).toBe(true);
  });
});
