// ─── Status button: connection-health display for the chat pill ──────────────
//
// Pure derivation (buttonView) + DOM builder (buildStatusButton). The builder
// subscribes to the store's "conn" key and updates icon / spin / badge /
// title purely from the derived view. No unsafeWindow, no setstatus coupling.

import { actionButton } from "./dom";
import { react } from "./store";
import { reloadChat } from "./shell";
import { STATUS_TEXT, statusButtonTitle, retryText } from "./health-strings";
import { ECHO_TIMEOUT_MS, type ConnState } from "./health-core";

// ─── View model ──────────────────────────────────────────────────────────────

export interface ButtonView {
  icon: string; // fa class without the "fas " prefix
  spinning: boolean;
  badge: number | null; // attempt number from 2 onward, else null
  stateText: string; // German state word for title/aria
}

// ─── Pure derivation ────────────────────────────────────────────────────────

export function buttonView(conn: ConnState, now: number = Date.now()): ButtonView {
  if (conn.phase === "authdead") {
    return {
      icon: "fa-triangle-exclamation",
      spinning: false,
      badge: null,
      stateText: STATUS_TEXT.authdead,
    };
  }
  if (conn.phase === "connected") {
    if (conn.pendingSendAt > 0 && now - conn.pendingSendAt > ECHO_TIMEOUT_MS) {
      return {
        icon: "fa-triangle-exclamation",
        spinning: false,
        badge: null,
        stateText: STATUS_TEXT.zombie,
      };
    }
    return {
      icon: "fa-sync",
      spinning: false,
      badge: null,
      stateText: STATUS_TEXT.connected,
    };
  }
  // connecting
  if (conn.attempt >= 2) {
    return {
      icon: "fa-sync",
      spinning: true,
      badge: conn.attempt,
      stateText: retryText(conn.attempt),
    };
  }
  return {
    icon: "fa-sync",
    spinning: true,
    badge: null,
    stateText: STATUS_TEXT.connecting,
  };
}

// ─── DOM builder ─────────────────────────────────────────────────────────────

export function buildStatusButton(): HTMLButtonElement {
  const btn = actionButton({ iconClass: "fa-sync", title: "Chat neu laden", onClick: reloadChat });
  // Same chrome as every pill button (transparent, borderless, 32x32); state
  // colors live on the icon, never on the button.
  btn.className = "bcc-icon-btn bcc-health-btn";

  const badge = document.createElement("span");
  badge.className = "bcc-health-badge";
  badge.hidden = true;
  btn.appendChild(badge);

  let prev: ButtonView | null = null;

  // conn updates on every WS message stamp; the equality guard keeps those
  // sub-display changes from re-touching the DOM (no flicker).
  react("conn", (conn: ConnState) => {
    const view = buttonView(conn);
    if (
      prev &&
      view.icon === prev.icon &&
      view.spinning === prev.spinning &&
      view.badge === prev.badge &&
      view.stateText === prev.stateText
    ) {
      return;
    }
    prev = view;

    const icon = btn.querySelector("i")!;
    icon.className = "fas " + view.icon;
    icon.classList.toggle("bcc-health-spin", view.spinning);
    icon.classList.toggle("bcc-health-down", view.icon === "fa-triangle-exclamation");

    if (view.badge === null) {
      badge.hidden = true;
    } else {
      badge.hidden = false;
      badge.textContent = String(view.badge);
    }

    const title = statusButtonTitle(view.stateText);
    btn.title = title;
    btn.setAttribute("aria-label", title);
  });

  return btn;
}
