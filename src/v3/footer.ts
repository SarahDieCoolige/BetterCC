// ─── v3 footer — pills, Font Awesome, connection status (spec §4.3 / T9) ──
//
// Builds footer pills (reload, autoscroll, help, settings stub, exit) calling
// upstream functions directly — NO DOM scavenging from the hidden table.
// Ported from old redesignFooter (src/ui.ts:305) but builds fresh buttons.

import { cclog, printHelp } from "../utils";
import { subscribe, type BccEvent } from "./store";

let reloadBtn: HTMLElement | null = null;

// ─── Button factory ────────────────────────────────────────────────────────

function pillButton(icon: string, title: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "bcc-pill";
  btn.title = title;
  btn.innerHTML = '<i class="fas ' + icon + '"></i>';
  btn.addEventListener("click", onClick);
  return btn;
}

// ─── Buttons ───────────────────────────────────────────────────────────────

function buildReloadBtn(): HTMLButtonElement {
  return pillButton("fa-sync", "Chat neu laden", () => {
    (unsafeWindow.bettercc as any).reloadChat();
  });
}

function buildAutoscrollBtn(): HTMLButtonElement {
  const btn = pillButton("fa-angle-double-down", "Autoscroll ein/aus", () => {
    const cb = document.querySelector('form[name="OF"] input[name="AS"]') as HTMLInputElement | null;
    if (cb) cb.click();
    btn.classList.toggle("bcc-active", cb?.checked ?? false);
  });
  // Sync initial state with the AS checkbox (relocated to body in T6).
  const cb = document.querySelector('form[name="OF"] input[name="AS"]') as HTMLInputElement | null;
  if (cb?.checked) btn.classList.add("bcc-active");
  return btn;
}

function buildHelpBtn(): HTMLButtonElement {
  return pillButton("fa-question", "Hilfe", () => {
    printHelp();
  });
}

function buildSettingsBtn(): HTMLButtonElement {
  return pillButton("fa-cog", "Einstellungen", () => {
    // Stub — real settings modal lands in T10.
    cclog("settings clicked — stub (T10)", "v3");
  });
}

function buildExitBtn(): HTMLButtonElement {
  return pillButton("fa-sign-out-alt", "Verlassen", () => {
    const w = unsafeWindow as any;
    if (typeof w.bye === "function") w.bye();
  });
}

// ─── Online count ──────────────────────────────────────────────────────────

function buildOnlineCount(): HTMLElement {
  const span = document.createElement("span");
  span.className = "bcc-online-count";
  // Seed with the current count, then keep it live as users join/leave.
  const render = (n: number) => { span.textContent = String(n) + " online"; };
  render(Math.floor(((unsafeWindow as any).cha_my?.length ?? 0) / 2));
  subscribe((e: BccEvent) => {
    if (e.type === "userlist") render(e.users.length);
  });
  return span;
}

// ─── chatout_setstatus patch (connection → reload button color) ─────────────

function patchSetStatus(): void {
  const w = unsafeWindow as any;
  if (typeof w.chatout_setstatus !== "function") return;
  const orig = w.chatout_setstatus;
  w.chatout_setstatus = function (text: string, color: string, bold: boolean) {
    if (reloadBtn) {
      reloadBtn.style.color = color || "#888";
      reloadBtn.title = "Chat neu laden — " + text;
    }
    orig.call(this, text, color, bold);
  };
}

// ─── Font Awesome CDN injection ────────────────────────────────────────────

function injectFontAwesome(): void {
  if (document.querySelector('link[href*="fontawesome"]')) return; // already injected
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://use.fontawesome.com/releases/v6.5.1/css/all.css";
  document.head.appendChild(link);
}

// ─── Mount ─────────────────────────────────────────────────────────────────

export function mountFooter(): void {
  const footerEl = document.querySelector(".bcc-footer");
  if (!footerEl) return;

  injectFontAwesome();

  // Build pills
  const onlineCount = buildOnlineCount();
  reloadBtn = buildReloadBtn();
  const autoscrollBtn = buildAutoscrollBtn();
  const helpBtn = buildHelpBtn();
  const settingsBtn = buildSettingsBtn();
  const exitBtn = buildExitBtn();

  // Layout: left group (online + autoscroll), center group (reload + help + settings), right group (exit)
  const left = document.createElement("div");
  left.className = "bcc-footer-left";
  left.appendChild(onlineCount);
  left.appendChild(autoscrollBtn);

  const center = document.createElement("div");
  center.className = "bcc-footer-center";
  center.appendChild(reloadBtn);
  center.appendChild(helpBtn);
  center.appendChild(settingsBtn);

  const right = document.createElement("div");
  right.className = "bcc-footer-right";
  right.appendChild(exitBtn);

  footerEl.innerHTML = "";
  footerEl.appendChild(left);
  footerEl.appendChild(center);
  footerEl.appendChild(right);

  // Connection-status → reload button color
  patchSetStatus();

  cclog("footer mounted — pills + FA + setstatus patch", "v3");
}
