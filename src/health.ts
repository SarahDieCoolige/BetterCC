// ─── Health wiring: drives the conn store key from real WebSocket events ───
//
// Impure counterpart to health-core. Sets facts, never renders. No DOM, no
// unsafeWindow; the ws arrives as a parameter from ws-hook.

import { get, set, on } from "./store";
import { cclog } from "./utils";
import { nextConn, type ConnEvent } from "./health-core";

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
