// ─── Health UI: veil + card for critical states (T5) ─────────────────────────
//
// When the connection enters a terminal state (authdead), a dim veil covers
// the chat area and a dismissible card offers the user a way to reload.
// The veil is pointer-events:none so the chat underneath stays interactive;
// only the card re-enables pointer events. Dismissing removes the veil but
// NOT the latched conn state; the status button stays red until a real reload.

import { react, snapshot } from "./store";
import { reloadChat } from "./shell";
import { iconElement } from "./dom";
import { cclog } from "./utils";
import { reportBootError } from "./health";
import {
  CARD_AUTHDEAD_TITLE,
  CARD_AUTHDEAD_TEXT,
  ACTION_PAGE_RELOAD,
  ACTION_LATER,
  CARD_BOOT_TITLE,
  BOOT_REASON_STRUCTURE,
  CARD_BOOT_RUNS_ON,
  ACTION_COPY_DETAILS,
  ACTION_CONTINUE_CHAT,
  CARD_SEND_BROKEN_TITLE,
  CARD_SEND_BROKEN_TEXT,
  ACTION_COPY_ERROR,
  TOAST_COPIED,
  STATE_UNAVAILABLE,
} from "./health-strings";
import type { BccHealthState, ConnState } from "./health-core";

// ─── Pure decision (testable without DOM) ────────────────────────────────────

/** Terminal states that warrant the veil + card. Dismissal is view state, never a store write. */
export function shouldShowCritical(conn: ConnState, dismissed: boolean): boolean {
  return conn.phase === "authdead" && !dismissed;
}

// ─── Boot failure classification (T6) ──────────────────────────────────────────

/** Map a boot failure to the copy-list reason. TypeErrors are almost always
 * a null querySelector result, i.e. the page no longer looks like cpop. */
export function classifyBootError(err: unknown): string {
  if (err instanceof TypeError) return BOOT_REASON_STRUCTURE;
  if (err instanceof Error) return err.message;
  return String(err);
}

// BOOT_REASON_WS stays unconsumed for now; hookChatoutConnect only logs a warning today.

// ─── Error report builder (T6) ────────────────────────────────────────────────

export function buildErrorReport(
  version: string,
  title: string,
  subject: string,
  detail: string | null,
  stateDump: string | null,
): string {
  const lines: string[] = [];
  lines.push("BetterCC v" + version);
  lines.push(title);
  lines.push(subject);
  if (detail !== null) lines.push(detail);
  if (stateDump !== null) {
    lines.push("Zustand:");
    lines.push(stateDump);
  } else {
    lines.push("Zustand: " + STATE_UNAVAILABLE);
  }
  return lines.join("\n");
}

// ─── Clipboard with fallback (T6) ────────────────────────────────────────────

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Userscript context may lack clipboard permission; execCommand still works
    // with a focused temp textarea.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let ok: boolean;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

// ─── Copied toast (T6) ───────────────────────────────────────────────────────

function showCopiedToast(): void {
  const el = document.createElement("div");
  el.textContent = TOAST_COPIED;
  Object.assign(el.style, {
    position: "fixed",
    left: "50%",
    bottom: "90px",
    transform: "translateX(-50%)",
    background: "#26262b",
    color: "#eee",
    border: "1px solid rgba(255,255,255,0.25)",
    borderRadius: "6px",
    padding: "6px 14px",
    fontFamily: "system-ui, sans-serif",
    fontSize: "13px",
    zIndex: "6001",
    pointerEvents: "none",
  });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
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

// ─── Shell-less card builder (T6) ────────────────────────────────────────────
// Inline-styled: renders even when .bcc-shell and theme vars don't exist.

function buildShellLessCard(title: string, text: string, actions: CardAction[]): HTMLElement {
  const overlay = document.createElement("div");
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "6000",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
    background: "rgba(0,0,0,0.45)",
  });

  const card = document.createElement("div");
  Object.assign(card.style, {
    pointerEvents: "auto",
    maxWidth: "360px",
    margin: "0 16px",
    padding: "18px 20px",
    background: "#26262b",
    color: "#eee",
    border: "1px solid rgba(255,255,255,0.25)",
    borderRadius: "10px",
    boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
    fontFamily: "system-ui, sans-serif",
  });
  card.setAttribute("role", "alert");
  card.setAttribute("aria-label", title);

  const titleEl = document.createElement("div");
  Object.assign(titleEl.style, {
    fontSize: "15px",
    fontWeight: "600",
    marginBottom: "8px",
  });
  titleEl.textContent = title;

  const textEl = document.createElement("div");
  Object.assign(textEl.style, {
    fontSize: "13px",
    lineHeight: "1.5",
    whiteSpace: "pre-line",
    marginBottom: "14px",
    color: "#ccc",
  });
  textEl.textContent = text;

  const actionsEl = document.createElement("div");
  Object.assign(actionsEl.style, {
    display: "flex",
    gap: "8px",
    justifyContent: "flex-end",
  });
  for (const a of actions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = a.label;
    Object.assign(btn.style, {
      background: "transparent",
      color: "#eee",
      border: "1px solid rgba(255,255,255,0.35)",
      borderRadius: "6px",
      padding: "6px 12px",
      fontSize: "13px",
      cursor: "pointer",
    });
    btn.addEventListener("click", a.onClick);
    actionsEl.appendChild(btn);
  }

  card.append(titleEl, textEl, actionsEl);
  overlay.appendChild(card);
  return overlay;
}

// ─── Boot failure entry point (T6) ───────────────────────────────────────────

export function handleBootFailure(err: unknown): void {
  const reason = classifyBootError(err);
  cclog("boot failure: " + reason, "health");
  reportBootError(reason);

  const detail = err instanceof Error ? err.stack || err.message : String(err);
  let stateDump: string | null = null;
  try {
    stateDump = JSON.stringify(snapshot(), null, 2);
  } catch {
    stateDump = null; // store may not be initialized if initStore itself threw
  }

  const overlay = buildShellLessCard(CARD_BOOT_TITLE, reason + "\n\n" + CARD_BOOT_RUNS_ON, [
    {
      label: ACTION_COPY_DETAILS,
      onClick: () => {
        void copyText(
          buildErrorReport(GM_info.script.version, CARD_BOOT_TITLE, reason, detail, stateDump),
        ).then((ok) => {
          if (ok) showCopiedToast();
          else cclog("copy failed", "health");
        });
      },
    },
    { label: ACTION_CONTINUE_CHAT, onClick: () => overlay.remove() },
  ]);

  document.body.appendChild(overlay);
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

  // B3: send-path broken card (shell-less). Shown-once latch: every bccHealth
  // write refires this react, so a later key (e.g. injectionDegraded) must not
  // stack a second card. Dismissal is view state; the store latch survives.
  let sendBrokenShown = false;
  let sendBrokenDismissed = false;
  react("bccHealth", (h) => {
    const health = h as BccHealthState;
    if (!health.sendPathBroken || sendBrokenShown || sendBrokenDismissed) return;
    sendBrokenShown = true;

    let stateDump: string | null = null;
    try {
      stateDump = JSON.stringify(snapshot(), null, 2);
    } catch {
      stateDump = null;
    }

    const overlay = buildShellLessCard(CARD_SEND_BROKEN_TITLE, CARD_SEND_BROKEN_TEXT, [
      {
        label: ACTION_COPY_ERROR,
        onClick: () => {
          void copyText(
            buildErrorReport(
              GM_info.script.version,
              CARD_SEND_BROKEN_TITLE,
              health.sendPathBroken!,
              null,
              stateDump,
            ),
          ).then((ok) => {
            if (ok) showCopiedToast();
            else cclog("copy failed", "health");
          });
        },
      },
      {
        label: ACTION_LATER,
        onClick: () => {
          sendBrokenDismissed = true;
          overlay.remove();
        },
      },
    ]);

    document.body.appendChild(overlay);
  });
}
