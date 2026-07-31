// ─── v3 UI shell — Grid layout, chatframe move, table removal (T6) ─────────
//
// The first task where v3 looks like a UI. Builds a CSS Grid shell
// (header / sidebar / main / input / footer), MOVES #chatframe into .bcc-main
// (not recreated — appendChild preserves the WS pipeline + iframe state), and
// hides the upstream table.
//
// EXTRACTION SEQUENCE (spec §3.1, corrected against the real fixture DOM):
// The spec assumed form[name="OF"] is a <body> child; in the fixture it is
// INSIDE the table. Both hold + OF are load-bearing for the send/autoscroll
// path (delout() reads document.hold.OUT1; setmove() reads document.OF.AS), so
// they must be relocated to <body> BEFORE the table is hidden, or the send
// path breaks. They stay visually hidden — v3 builds its own input in T8.
//
// reloadChat is NOT inherited: the old path attaches it to bettercc inside
// doColorStuff (theme.ts), which the v3 branch skips. v3 owns its own reload
// here (close WS to reconnect, or full reload if auth_dead).

import { cclog } from "../utils";

/**
 * Build the v3 shell: Grid container, moved chatframe, hidden table, header
 * with channel name + reload. Idempotent — guards against double-init.
 *
 * @returns true if the shell was built, false if the prerequisites (chatframe,
 *          table) aren't present (e.g. wrong page).
 */
export function buildShell(): boolean {
  const chatframe = document.getElementById("chatframe");
  const table = document.querySelector("table.c_tab");
  if (!chatframe || !table) {
    cclog("v3 shell: chatframe or table not found — aborting", "v3");
    return false;
  }
  // Guard against double-init (initV3 could fire twice in edge cases).
  if (document.querySelector(".bcc-shell")) return true;

  // ── 1. Relocate load-bearing forms OUT of the table before hiding it ──
  // hold: the real send path (delout reads document.hold.OUT1.value).
  // OF:   the autoscroll checkbox (setmove reads document.OF.AS.checked).
  // Both live inside the table in the real fixture DOM. Move to <body>, keep
  // them in the DOM but out of sight — v3 builds its own input (T8) but the
  // send contract still flows through these until then.
  const hold = document.querySelector('form[name="hold"]');
  const of = document.querySelector('form[name="OF"]');
  if (hold) {
    document.body.appendChild(hold);
    (hold as HTMLElement).style.display = "none";
  }
  if (of) {
    document.body.appendChild(of);
    (of as HTMLElement).style.display = "none";
  }

  // ── 2. Build the Grid shell ──────────────────────────────────────────
  const shell = document.createElement("div");
  shell.className = "bcc-shell";

  const header = document.createElement("header");
  header.className = "bcc-header";
  header.appendChild(buildChannelLabel());
  header.appendChild(buildReloadButton());

  const sidebar = document.createElement("aside");
  sidebar.className = "bcc-sidebar";
  sidebar.innerHTML = '<div class="bcc-sidebar-placeholder">Userlist (T7)</div>';

  const main = document.createElement("main");
  main.className = "bcc-main";
  // appendChild MOVES chatframe (preserves WS listeners + iframe state).
  main.appendChild(chatframe);

  const inputArea = document.createElement("div");
  inputArea.className = "bcc-input";
  inputArea.innerHTML = '<div class="bcc-input-placeholder">Input (T8)</div>';

  const footer = document.createElement("footer");
  footer.className = "bcc-footer";
  footer.innerHTML = '<div class="bcc-footer-placeholder">Footer (T9)</div>';

  shell.append(header, sidebar, main, inputArea, footer);
  document.body.appendChild(shell);

  // ── 3. Hide the upstream table ──────────────────────────────────────
  // display:none (not removal) per spec §9 Q1: safer, reversible, keeps any
  // listener the watchdog might have. §9 Q3 confirms the watchdog is
  // stream-based (watches /de/cpop.html), not DOM-based.
  (table as HTMLElement).style.display = "none";

  cclog("v3 shell built — chatframe moved, table hidden", "v3");
  return true;
}

/** Header channel label, read once from the upstream global. */
function buildChannelLabel(): HTMLElement {
  // TODO(T4b): re-render this label on a `session` event when the channel
  // changes (/j). Today it's static — correct at init, stale after a jump.
  const label = document.createElement("span");
  label.className = "bcc-channel";
  const channel = (unsafeWindow as any).chat_channel;
  label.textContent = channel ? String(channel) : "Chatcity";
  label.title = "Channel";
  return label;
}

/** Reload button — defines bettercc.reloadChat (WS close → reconnect). */
function buildReloadButton(): HTMLElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "bcc-reload";
  btn.title = "Chat neu laden (mimimi)";
  btn.textContent = "↻";
  btn.addEventListener("click", () => {
    (unsafeWindow.bettercc as any).reloadChat();
  });
  return btn;
}

/**
 * Reload the chat: if the session is auth-dead (terminal), do a full page
 * reload; otherwise close the WebSocket to trigger a reconnect. Mirrors the
 * old reloadChat (theme.ts) but v3-owned (the old path doesn't run under v3).
 */
export function reloadChat(): void {
  if ((unsafeWindow as any).chatout_auth_dead) {
    cclog("reloadChat: auth_dead, doing full page reload", "v3");
    location.reload();
    return;
  }
  const ws = (unsafeWindow as any).chatout_ws;
  if (ws) {
    cclog("reloadChat: closing WS to trigger reconnect", "v3");
    ws.close();
  } else {
    cclog("reloadChat: no WS — nothing to reconnect", "v3");
  }
}
