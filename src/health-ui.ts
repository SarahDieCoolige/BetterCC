// ─── Health UI: veil + card for critical states (T5) ─────────────────────────
//
// When the connection enters a terminal state (authdead), a dim veil covers
// the chat area and a dismissible card offers the user a way to reload.
// The veil is pointer-events:none so the chat underneath stays interactive;
// only the card re-enables pointer events. Dismissing removes the veil but
// NOT the latched conn state; the status button stays red until a real reload.

import { react, snapshot, get } from "./store";
import { reloadChat } from "./shell";
import { cclog } from "./utils";
import { reportBootError } from "./health";
import {
  CARD_AUTHDEAD_TITLE,
  CARD_AUTHDEAD_TEXT,
  ACTION_PAGE_RELOAD,
  ACTION_LATER,
  CARD_BOOT_TITLE,
  CARD_BOOT_RUNS_ON,
  ACTION_COPY_DETAILS,
  ACTION_CONTINUE_CHAT,
  CARD_SEND_BROKEN_TITLE,
  CARD_SEND_BROKEN_TEXT,
  ACTION_COPY_ERROR,
  bootDisplayFor,
} from "./health-strings";
import type { BccHealthState, BootReasonCode, ConnState } from "./health-core";

// ─── Pure decision (testable without DOM) ────────────────────────────────────

/** Terminal states that warrant the veil + card. Dismissal is view state, never a store write. */
export function shouldShowCritical(conn: ConnState, dismissed: boolean): boolean {
  return conn.phase === "authdead" && !dismissed;
}

// ─── Boot failure classification (codes; display text stays in the view) ────

/** Machine code for the store. TypeErrors are almost always a null
 * querySelector result, i.e. the page no longer looks like cpop. */
export function bootErrorCode(err: unknown): BootReasonCode {
  return err instanceof TypeError ? "structure-changed" : "error";
}

// bootDisplayFor (code → German card text) moved to health-strings.ts, next
// to the BOOT_REASON_* constants it maps to.

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

// ─── Card builder ────────────────────────────────────────────────────────────
//
// One card look for every critical (auth-dead, boot, send-path), inline-styled:
// it must render even when .bcc-shell and theme vars don't exist (boot
// failures), so the themed variant never existed long-term.

interface CardAction {
  label: string;
  onClick: () => void;
}

function buildCardEl(title: string, text: string, actions: CardAction[]): HTMLElement {
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
  return card;
}

/** Fixed dim overlay hosting a card. Clicks pass through except on the card. */
function cardOverlay(card: HTMLElement): HTMLElement {
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
  overlay.appendChild(card);
  return overlay;
}

/** Copy a diagnostics report; failures land in the log (no toast UI). */
function copyReport(fields: ReportFields): void {
  void copyText(buildErrorReport(fields)).then((ok) => {
    if (!ok) cclog("copy failed", "health");
  });
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

  const overlay = cardOverlay(
    buildCardEl(CARD_BOOT_TITLE, text, [
      {
        label: ACTION_COPY_DETAILS,
        onClick: () => copyReport(reportFields("boot", code, error, stack)),
      },
      {
        label: ACTION_CONTINUE_CHAT,
        onClick: () => {
          bootCardDismissed = true;
          overlay.remove();
        },
      },
    ]),
  );

  document.body.appendChild(overlay);
}

export function handleBootFailure(err: unknown): void {
  const code = bootErrorCode(err);
  // Known codes carry their approved text; the generic code can only show
  // the live error, which a later react can't recover.
  const display = bootDisplayFor(code) ?? (err instanceof Error ? err.message : String(err));
  cclog("boot failure: " + code + " (" + display + ")", "health");
  const error = err instanceof Error ? err.name + ": " + err.message : String(err);
  const stack = err instanceof Error ? err.stack || null : null;
  showBootCard(code, display, error, stack);
  reportBootError(code);
}

// ─── Mount ───────────────────────────────────────────────────────────────────

export function mountHealthUi(): void {
  let dismissed = false;
  let veil: HTMLElement | null = null;

  react("conn", (conn) => {
    // Authdead veil + card (warnings live in health-strip)
    if (!shouldShowCritical(conn as ConnState, dismissed) || veil) return;

    const dismiss = () => {
      dismissed = true;
      veil?.remove();
      veil = null;
    };

    veil = document.createElement("div");
    veil.className = "bcc-health-veil";
    veil.appendChild(
      buildCardEl(CARD_AUTHDEAD_TITLE, CARD_AUTHDEAD_TEXT, [
        { label: ACTION_PAGE_RELOAD, onClick: reloadChat },
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

    // B1 boot card from the store latch. Generic "error" codes render
    // nothing here: their card came from the live error.
    if (health.bootError) {
      const display = bootDisplayFor(health.bootError);
      if (display) showBootCard(health.bootError, display, null, null);
    }

    if (!health.sendPathBroken || sendBrokenShown || sendBrokenDismissed) return;
    sendBrokenShown = true;

    const overlay = cardOverlay(
      buildCardEl(CARD_SEND_BROKEN_TITLE, CARD_SEND_BROKEN_TEXT, [
        {
          label: ACTION_COPY_ERROR,
          onClick: () =>
            copyReport(reportFields("send-path", "send-path-broken", health.sendPathBroken!, null)),
        },
        {
          label: ACTION_LATER,
          onClick: () => {
            sendBrokenDismissed = true;
            overlay.remove();
          },
        },
      ]),
    );

    document.body.appendChild(overlay);
  });
}

// ─── T10 stale markers ─────────────────────────────────────────────────────

import { staleMarkers, nextStaleChange, type FreshnessState } from "./health-core";
import { staleText, STALE_LABEL_ULIST, STALE_LABEL_AW, STALE_LABEL_STATS } from "./health-strings";

// ─── mountStaleMarkers ─────────────────────────────────────────────────────

function buildStaleMarker(): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "bcc-stale-marker";
  const icon = document.createElement("i");
  icon.className = "fas fa-clock";
  icon.setAttribute("aria-hidden", "true");
  span.appendChild(icon);
  return span;
}

function renderStaleMarkers(
  ulistEl: HTMLSpanElement,
  awEl: HTMLSpanElement,
  statsEl: HTMLSpanElement,
  f: FreshnessState,
): void {
  const m = staleMarkers(f, Date.now());
  setMarker(ulistEl, m.ulist, STALE_LABEL_ULIST);
  setMarker(awEl, m.aw, STALE_LABEL_AW);
  setMarker(statsEl, m.stats, STALE_LABEL_STATS);
  armRefresh(ulistEl, awEl, statsEl, f);
}

function setMarker(el: HTMLSpanElement, ageMs: number | null, label: string): void {
  const stale = ageMs !== null;
  const title = stale ? staleText(label, ageMs!) : null;
  if (el.classList.contains("bcc-stale-visible") === stale && el.title === (title ?? "")) {
    return; // no DOM churn
  }
  el.classList.toggle("bcc-stale-visible", stale);
  if (title === null) {
    el.removeAttribute("title");
    el.removeAttribute("aria-label");
  } else {
    el.title = title;
    el.setAttribute("aria-label", title);
  }
}

// One refresh timer covers all markers: re-renders at the next instant any
// marker's visibility or age can change. Failing polls write nothing to the
// store, so this schedule is the only thing that advances a stale display.
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function armRefresh(
  ulistEl: HTMLSpanElement,
  awEl: HTMLSpanElement,
  statsEl: HTMLSpanElement,
  f: FreshnessState,
): void {
  if (refreshTimer !== null) clearTimeout(refreshTimer);
  refreshTimer = null;
  const at = nextStaleChange(f, Date.now());
  if (at === null) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    renderStaleMarkers(ulistEl, awEl, statsEl, f);
  }, at - Date.now());
}

export function mountStaleMarkers(): void {
  const onlineRow = document.querySelector(".bcc-online-row");
  const statsBar = document.querySelector(".bcc-stats");
  const ulistMarker = buildStaleMarker();
  const awMarker = buildStaleMarker();
  const statsMarker = buildStaleMarker();
  // Both userlist markers sit in the online row: the global list has no
  // chrome of its own (pinned rows are its only visible product).
  onlineRow?.append(ulistMarker, awMarker);
  statsBar?.appendChild(statsMarker);

  react("freshness", (f) =>
    renderStaleMarkers(ulistMarker, awMarker, statsMarker, f as FreshnessState),
  );
  renderStaleMarkers(ulistMarker, awMarker, statsMarker, get("freshness"));
}
