// ─── Health UI: veil + card for critical states (T5) ─────────────────────────
//
// When the connection enters a terminal state (authdead), a dim veil covers
// the chat area and a dismissible card offers the user a way to reload.
// The veil is pointer-events:none so the chat underneath stays interactive;
// only the card re-enables pointer events. Dismissing removes the veil but
// NOT the latched conn state; the status button stays red until a real reload.

import { react } from "./store";
import { reloadChat } from "./shell";
import { iconElement } from "./dom";
import {
  CARD_AUTHDEAD_TITLE,
  CARD_AUTHDEAD_TEXT,
  ACTION_PAGE_RELOAD,
  ACTION_LATER,
} from "./health-strings";
import type { ConnState } from "./health-core";

// ─── Pure decision (testable without DOM) ────────────────────────────────────

/** Terminal states that warrant the veil + card. Dismissal is view state, never a store write. */
export function shouldShowCritical(conn: ConnState, dismissed: boolean): boolean {
  return conn.phase === "authdead" && !dismissed;
}

// ─── Card builder ────────────────────────────────────────────────────────────

interface CardAction {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

function buildCard(title: string, text: string, actions: CardAction[]): HTMLElement {
  const card = document.createElement("div");
  card.className = "bcc-health-card";
  card.setAttribute("role", "alert");
  card.setAttribute("aria-label", title);

  // Head row: icon + title
  const head = document.createElement("div");
  head.className = "bcc-health-card-head";
  const icon = iconElement("fa-triangle-exclamation");
  icon.classList.add("bcc-health-card-icon");
  const titleEl = document.createElement("div");
  titleEl.className = "bcc-health-card-title";
  titleEl.textContent = title;
  head.append(icon, titleEl);

  // Body text
  const textEl = document.createElement("div");
  textEl.className = "bcc-health-card-text";
  textEl.textContent = text;

  // Actions
  const actionsEl = document.createElement("div");
  actionsEl.className = "bcc-health-card-actions";
  for (const a of actions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bcc-health-card-btn";
    if (a.primary) btn.classList.add("bcc-health-card-primary");
    btn.textContent = a.label;
    btn.addEventListener("click", a.onClick);
    actionsEl.appendChild(btn);
  }

  card.append(head, textEl, actionsEl);
  return card;
}

// ─── Mount ───────────────────────────────────────────────────────────────────

export function mountHealthUi(): void {
  let dismissed = false;
  let veil: HTMLElement | null = null;

  react("conn", (conn) => {
    if (!shouldShowCritical(conn as ConnState, dismissed) || veil) return;

    const dismiss = () => {
      dismissed = true;
      veil?.remove();
      veil = null;
    };

    veil = document.createElement("div");
    veil.className = "bcc-health-veil";
    veil.appendChild(
      buildCard(CARD_AUTHDEAD_TITLE, CARD_AUTHDEAD_TEXT, [
        { label: ACTION_PAGE_RELOAD, primary: true, onClick: reloadChat },
        { label: ACTION_LATER, onClick: dismiss },
      ]),
    );

    const main = document.querySelector(".bcc-main");
    if (main) {
      main.appendChild(veil);
    }
  });
}
