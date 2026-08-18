// ─── Health wiring: drives the conn store key from real WebSocket events ───
//
// Impure counterpart to health-core. Sets facts, never renders; upstream
// access goes through upstream.ts. The ws arrives as a parameter from ws-hook.

import { get, set, on } from "./store";
import { cclog } from "./utils";
import { nextConn, type BootReasonCode, type ConnEvent } from "./health-core";
import { showStripNotice } from "./health-strip";
import { wrapSetStatus } from "./upstream";

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

/** Connection-state setstatus texts duplicate the status button. Only action
 * errors (picshare, block, whisper) reach the strip. */
function isConnectionStatus(text: string): boolean {
  return (
    text.startsWith("Verbinde") || // "Verbinde..."
    text.startsWith("Verbindung") || // "Verbindung verloren / unterbrochen"
    text === "Verbunden"
  );
}

/** Route upstream chatout_setstatus texts into the notification strip
 * (verbatim, with the upstream color), skipping connection-state texts the
 * status button already conveys. Action errors are invisible since the v3
 * shell hides the table they used to color. */
export function initSetStatusWrap(): void {
  const ok = wrapSetStatus((text, color) => {
    if (!isConnectionStatus(text)) showStripNotice(text, color);
  });
  if (!ok) cclog("initSetStatusWrap: chatout_setstatus missing upstream", "health");
}
