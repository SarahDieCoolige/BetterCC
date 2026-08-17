// ─── Health wiring: drives the conn store key from real WebSocket events ───
//
// Impure counterpart to health-core. Sets facts, never renders. No DOM, no
// unsafeWindow; the ws arrives as a parameter from ws-hook.

import { get, set, on } from "./store";
import { cclog } from "./utils";
import { nextConn, ECHO_TIMEOUT_MS, type BootReasonCode, type ConnEvent } from "./health-core";

// Track the last ws we attached listeners to, so we skip dupes.
let lastWs: WebSocket | null = null;

function applyConnEvent(ev: ConnEvent): void {
  const prev = get("conn");
  set("conn", nextConn(prev, ev));
}

/** Wire open/close on this ws into the conn store key. Idempotent per ws reference. */
export function attachConnListeners(ws: WebSocket): void {
  if (ws === lastWs) return;
  lastWs = ws;

  ws.addEventListener("open", () => {
    applyConnEvent({ type: "open", at: Date.now() });
  });

  ws.addEventListener("close", () => {
    applyConnEvent({ type: "close", at: Date.now() });
  });

  // Tiebreaker: if the socket was already open when we attached (the open
  // event fired pre-attach), apply the open state immediately.
  if (ws.readyState === WebSocket.OPEN) {
    applyConnEvent({ type: "open", at: Date.now() });
  }
}

export function stampConnMessage(): void {
  clearEchoTimer();
  applyConnEvent({ type: "message", at: Date.now() });
}

/**
 * Watch session for authDead. The init-time read matters: initSession's
 * initial set fires before this subscription exists.
 */
export function initHealth(): void {
  const cur = get("session");
  if (cur.authDead) {
    applyConnEvent({ type: "authdead", at: Date.now() });
  }

  on("session", (s) => {
    if (s.authDead) {
      applyConnEvent({ type: "authdead", at: Date.now() });
    }
  });

  cclog("health wiring: init done", "health");
}

/** Latch a boot failure. Tolerates an uninitialized store: initStore itself may be what threw. */
export function reportBootError(code: BootReasonCode): void {
  try {
    set("bccHealth", { ...get("bccHealth"), bootError: code });
  } catch (e) {
    cclog("reportBootError: store not up (" + (e as Error).message + ")", "health");
  }
}

/** Latch a broken send path (patchAwayTimer needle changed upstream). */
export function reportSendPathBroken(message: string): void {
  set("bccHealth", { ...get("bccHealth"), sendPathBroken: message });
}

/** Set/clear the injection-degraded flag. No-op when unchanged: every WS
 * message runs the success path, an unconditional set would spam notifies. */
export function reportInjectionDegraded(degraded: boolean): void {
  if (get("bccHealth").injectionDegraded === degraded) return;
  set("bccHealth", { ...get("bccHealth"), injectionDegraded: degraded });
}

// Send-echo watchdog (A5). Armed only by a real send; any inbound WS message
// disarms it. On fire we re-write conn (same facts) so every reactive surface
// re-derives past the threshold -- the store has no "time passed" event.
let echoTimer: ReturnType<typeof setTimeout> | null = null;

function clearEchoTimer(): void {
  if (echoTimer !== null) {
    clearTimeout(echoTimer);
    echoTimer = null;
  }
}

export function armSendEcho(): void {
  // A send is already awaiting its echo: keep that deadline. Re-arming here
  // would push the fire time back and blink the zombie banner away for
  // another quiet window (the state stays zombie, nothing needs a timer).
  if (get("conn").pendingSendAt > 0) return;
  applyConnEvent({ type: "send", at: Date.now() });
  clearEchoTimer();
  echoTimer = setTimeout(() => {
    echoTimer = null;
    set("conn", { ...get("conn") });
  }, ECHO_TIMEOUT_MS);
}
