// Sync cache for hot-path config flags.
//
// The keydown send handler (input.ts) and the hover call sites (later task)
// need a synchronous answer; GM.getValue is async. This reads the values once
// at init, then refreshes from the store's {type:"config"} event so a settings
// Save takes effect live without a reload.

import { getConfig } from "./config";
import { subscribe, type BccEvent } from "./store";

let _sendOnEnter = true; // default true = Enter sends (today's behavior)
let _hoverPreview = true; // default true = hover preview on (today's behavior)

/** Read current values from GM storage. Call once at init. */
export async function initConfigCache(): Promise<void> {
  _sendOnEnter = (await getConfig("send_on_enter", true)) as boolean;
  _hoverPreview = (await getConfig("hover_preview", true)) as boolean;
}

/** Sync getter: does Enter send (Shift+Enter = newline)? */
export function sendOnEnter(): boolean {
  return _sendOnEnter;
}

/** Sync getter: is hover preview enabled? */
export function hoverPreview(): boolean {
  return _hoverPreview;
}

// Refresh on settings Save. Settings writes the value before emitting, so by
// the time this fires the new value is already in GM storage. The key we care
// about is in the event; other keys are ignored.
subscribe((e: BccEvent) => {
  if (e.type !== "config") return;
  if (e.key === "send_on_enter") {
    void getConfig("send_on_enter", true).then((v) => {
      _sendOnEnter = v as boolean;
    });
  } else if (e.key === "hover_preview") {
    void getConfig("hover_preview", true).then((v) => {
      _hoverPreview = v as boolean;
    });
  }
});
