// ─── Health UI: veil + card for critical states (T5) ─────────────────────────
//
// When the connection enters a terminal state (authdead), a dim veil covers
// the chat area and a dismissible card offers the user a way to reload.
// The veil is pointer-events:none so the chat underneath stays interactive;
// only the card re-enables pointer events. Dismissing removes the veil but
// NOT the latched conn state; the status button stays red until a real reload.

import { react, snapshot, get } from "./store";
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
  BOOT_REASON_WS,
  CARD_BOOT_RUNS_ON,
  ACTION_COPY_DETAILS,
  ACTION_CONTINUE_CHAT,
  CARD_SEND_BROKEN_TITLE,
  CARD_SEND_BROKEN_TEXT,
  ACTION_COPY_ERROR,
  TOAST_COPIED,
  BANNER_STUCK_TEXT,
  BANNER_OPTICS_TEXT,
  BANNER_ZOMBIE_TEXT,
  ACTION_RELOAD,
} from "./health-strings";
import type { BccHealthState, BootReasonCode, ConnState } from "./health-core";
import { STUCK_MS, ECHO_TIMEOUT_MS } from "./health-core";

// ─── Pure decision (testable without DOM) ────────────────────────────────────

/** Terminal states that warrant the veil + card. Dismissal is view state, never a store write. */
export function shouldShowCritical(conn: ConnState, dismissed: boolean): boolean {
  return conn.phase === "authdead" && !dismissed;
}

// ─── Banner decision (T7) ──────────────────────────────────────────────────

/** Which banner line to show, or null. Zombie (A5) outranks optics (B2) because
 * possible message loss beats a cosmetic note; stuck and zombie are mutually exclusive by phase. */
export function bannerView(
  conn: ConnState,
  injectionDegraded: boolean,
  now: number,
): string | null {
  if (
    conn.phase === "connected" &&
    conn.pendingSendAt > 0 &&
    now - conn.pendingSendAt > ECHO_TIMEOUT_MS
  ) {
    return BANNER_ZOMBIE_TEXT;
  }
  if (injectionDegraded) return BANNER_OPTICS_TEXT;
  if (conn.phase === "connecting" && conn.since > 0 && now - conn.since > STUCK_MS) {
    return BANNER_STUCK_TEXT;
  }
  return null;
}

// ─── Boot failure classification (codes; display text stays in the view) ────

/** Machine code for the store. TypeErrors are almost always a null
 * querySelector result, i.e. the page no longer looks like cpop. */
export function bootErrorCode(err: unknown): BootReasonCode {
  return err instanceof TypeError ? "structure-changed" : "error";
}

/** German card text for a store-latched code. The generic "error" code maps
 * to null: its card is rendered by handleBootFailure from the live error; a
 * later react can't recover that text from the code alone. */
export function bootDisplayFor(code: string): string | null {
  if (code === "structure-changed") return BOOT_REASON_STRUCTURE;
  if (code === "ws-takeover") return BOOT_REASON_WS;
  return null;
}

// ─── Diagnostics payload (reworked: English, structured, for bug reports) ────

export interface ReportFields {
  version: string;
  context: string; // "boot" | "send-path"
  reason: string;
  error: string | null; // "Name: message" of the real error, never a translation
  stack: string | null;
  url: string;
  userAgent: string;
  time: string;
  state: { conn: unknown; bccHealth: unknown; freshness: unknown } | null;
}

export function buildErrorReport(f: ReportFields): string {
  const lines = ["BetterCC v" + f.version, "context: " + f.context, "reason: " + f.reason];
  if (f.error !== null) lines.push("error: " + f.error);
  if (f.stack !== null) lines.push("stack: " + f.stack);
  lines.push("url: " + f.url, "ua: " + f.userAgent, "time: " + f.time);
  if (f.state === null) {
    lines.push("state: unavailable");
  } else {
    lines.push(
      "conn: " + JSON.stringify(f.state.conn),
      "bccHealth: " + JSON.stringify(f.state.bccHealth),
      "freshness: " + JSON.stringify(f.state.freshness),
    );
  }
  return lines.join("\n");
}

/** Gather the environment facts around an error. Store slice only: settings
 * like color or pinned users are noise in a bug report. */
function reportFields(
  context: string,
  reason: string,
  error: string | null,
  stack: string | null,
): ReportFields {
  let state: ReportFields["state"];
  try {
    const s = snapshot() as Record<string, unknown>;
    state = { conn: s.conn, bccHealth: s.bccHealth, freshness: s.freshness };
  } catch {
    state = null; // store may not be initialized if initStore itself threw
  }
  return {
    version: GM_info.script.version,
    context,
    reason,
    error,
    stack,
    url: location.href,
    userAgent: navigator.userAgent,
    time: new Date().toISOString(),
    state,
  };
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

// Boot card shown-once latch (hoisted to module scope so handleBootFailure
// and the bccHealth react share it).
let bootCardShown = false;
let bootCardDismissed = false;

function showBootCard(
  code: string,
  display: string,
  error: string | null,
  stack: string | null,
): void {
  if (bootCardShown || bootCardDismissed) return;
  bootCardShown = true;

  const text = display + "\n\n" + CARD_BOOT_RUNS_ON;

  const overlay = buildShellLessCard(CARD_BOOT_TITLE, text, [
    {
      label: ACTION_COPY_DETAILS,
      onClick: () => {
        void copyText(buildErrorReport(reportFields("boot", code, error, stack))).then((ok) => {
          if (ok) showCopiedToast();
          else cclog("copy failed", "health");
        });
      },
    },
    {
      label: ACTION_CONTINUE_CHAT,
      onClick: () => {
        bootCardDismissed = true;
        overlay.remove();
      },
    },
  ]);

  document.body.appendChild(overlay);
}

export function handleBootFailure(err: unknown): void {
  const code = bootErrorCode(err);
  const display =
    err instanceof TypeError
      ? BOOT_REASON_STRUCTURE
      : err instanceof Error
        ? err.message
        : String(err);
  cclog("boot failure: " + code + " (" + display + ")", "health");
  const error = err instanceof Error ? err.name + ": " + err.message : String(err);
  const stack = err instanceof Error ? err.stack || null : null;
  showBootCard(code, display, error, stack);
  reportBootError(code);
}

// ─── Banner builder + render (T7) ──────────────────────────────────────────

function buildBanner(text: string): HTMLElement {
  const banner = document.createElement("div");
  banner.className = "bcc-health-banner";
  banner.setAttribute("role", "status");
  const line = document.createElement("span");
  line.textContent = text;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "bcc-health-banner-btn";
  btn.textContent = ACTION_RELOAD;
  btn.addEventListener("click", reloadChat);
  banner.append(line, btn);
  return banner;
}

// ─── Mount ───────────────────────────────────────────────────────────────────

let banner: HTMLElement | null = null;
let stuckTimer: number | null = null;

function renderBanner(): void {
  const text = bannerView(get("conn") as ConnState, get("bccHealth").injectionDegraded, Date.now());
  if (!text) {
    if (banner) {
      banner.remove();
      banner = null;
    }
    return;
  }
  // Same text already up: no DOM churn (fires on every conn message stamp).
  if (banner && banner.querySelector("span")?.textContent === text) return;
  banner?.remove();
  banner = buildBanner(text);
  const main = document.querySelector(".bcc-main");
  if (main) main.prepend(banner);
}

export function mountHealthUi(): void {
  let dismissed = false;
  let veil: HTMLElement | null = null;

  react("conn", (conn) => {
    // Stuck timer: check again when the stuck threshold would be reached;
    // conn writes alone can't fire at a future time.
    if (stuckTimer !== null) {
      clearTimeout(stuckTimer);
      stuckTimer = null;
    }
    const c = conn as ConnState;
    if (c.phase === "connecting" && c.since > 0) {
      const wait = Math.max(0, STUCK_MS - (Date.now() - c.since));
      stuckTimer = window.setTimeout(() => {
        stuckTimer = null;
        renderBanner();
      }, wait);
    }
    renderBanner();

    // Authdead veil + card
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

    // Banner (injection-degraded) + B1 boot card from store latch. Generic
    // "error" codes render nothing here: their card came from the live error.
    renderBanner();
    if (health.bootError) {
      const display = bootDisplayFor(health.bootError);
      if (display) showBootCard(health.bootError, display, null, null);
    }

    if (!health.sendPathBroken || sendBrokenShown || sendBrokenDismissed) return;
    sendBrokenShown = true;

    const overlay = buildShellLessCard(CARD_SEND_BROKEN_TITLE, CARD_SEND_BROKEN_TEXT, [
      {
        label: ACTION_COPY_ERROR,
        onClick: () => {
          void copyText(
            buildErrorReport(
              reportFields("send-path", "send-path-broken", health.sendPathBroken!, null),
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
