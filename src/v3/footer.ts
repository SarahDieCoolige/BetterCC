// ─── v3 footer — pills, Font Awesome, connection status (spec §4.3 / T9) ──
//
// Builds footer pills (reload, autoscroll, help, settings stub, exit) calling
// upstream functions directly — NO DOM scavenging from the hidden table.
// Ported from old redesignFooter (src/ui.ts:305) but builds fresh buttons.

import { cclog, printHelp } from "../utils";
import { subscribe, type BccEvent } from "./store";

// R3: chatout_setstatus colors EVERY reload button. v3 has two reload buttons
// (header + footer); the old single-reloadBtn field only colored the footer
// one. Track both so a status change is visible in both places.
const reloadButtons: HTMLElement[] = [];

/** Register a reload button so setstatus colors it. Call at build time. */
function trackReloadButton(btn: HTMLElement): HTMLElement {
  reloadButtons.push(btn);
  return btn;
}

// ─── Button factories ──────────────────────────────────────────────────────

function pillButton(icon: string, title: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "bcc-pill";
  btn.title = title;
  btn.setAttribute("aria-label", title); // title alone isn't an a11y name (R4)
  btn.innerHTML = '<i class="fas ' + icon + '" aria-hidden="true"></i>';
  btn.addEventListener("click", onClick);
  return btn;
}

/** A text-or-icon link button that calls an upstream fn directly. */
function linkButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "bcc-pill bcc-link";
  btn.title = title;
  btn.setAttribute("aria-label", title);
  btn.textContent = label;
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

// ─── Account / status links (R2) — fresh buttons calling the same upstream
//   fns as the old scavenged .bN anchors (verified against the fixture):
//   away → /away, awayoff → /awayoff (both via hold.OUT1 + delout, b2/b3),
//   message on/off → com_set('/messageon'|'/messageoff') (b5/b6),
//   forum → window.open('//www.chatcity.de/f101/') (b15),
//   id → window.open('//www.chatcity.de/de/id/<nick>.html') (b16).

/** Run an upstream "set OUT1 + delout" command (/away, /awayoff, /bye…). */
function sendSlashCommand(cmd: string): void {
  const docHold = (document as any).hold;
  if (!docHold) return;
  docHold.OUT1.value = cmd;
  // delout() reads hold.OUT1 → inf.OUT → inf.submit(). Upstream sets a 1s
  // timeout around it in the real onclicks; calling delout directly works
  // because v3 already routed submit through the patched handler.
  const w = unsafeWindow as any;
  if (typeof w.delout === "function") w.delout();
}

function buildAwayToggleBtn(): HTMLButtonElement {
  return linkButton("Away", "Away-Status umschalten (/away)", () => sendSlashCommand("/away"));
}

function buildAwayOffBtn(): HTMLButtonElement {
  return linkButton("Zurück", "Als zurück markiert (/awayoff)", () =>
    sendSlashCommand("/awayoff")
  );
}

function buildMessageOnBtn(): HTMLButtonElement {
  return linkButton("Sysan", "Systemmeldungen ein (/messageon)", () => {
    const w = unsafeWindow as any;
    if (typeof w.com_set === "function") w.com_set("/messageon");
  });
}

function buildMessageOffBtn(): HTMLButtonElement {
  return linkButton("Sysaus", "Systemmeldungen aus (/messageoff)", () => {
    const w = unsafeWindow as any;
    if (typeof w.com_set === "function") w.com_set("/messageoff");
  });
}

function buildForumBtn(): HTMLButtonElement {
  return linkButton("Forum", "Forum öffnen", () => {
    window.open("//www.chatcity.de/f101/", "_blank");
  });
}

function buildIdBtn(): HTMLButtonElement {
  return linkButton("ID", "Eigene ID anzeigen", () => {
    const nick = String((unsafeWindow as any).chat_nick ?? "");
    if (nick) window.open("//www.chatcity.de/de/id/" + nick + ".html", "IDCARD");
  });
}

function buildUpHelpBtn(): HTMLButtonElement {
  return linkButton("?", "Chat-Hilfe (extern)", () => {
    window.open("//www.chatcity.de/de/hilfe-allgemeines.html#cmd", "_blank");
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
    // R3: color every tracked reload button (header + footer), not just one.
    for (const btn of reloadButtons) {
      btn.style.color = color || "#888";
      btn.title = "Chat neu laden — " + text;
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
  const reloadBtn = trackReloadButton(buildReloadBtn()); // R3: tracked
  const autoscrollBtn = buildAutoscrollBtn();
  const helpBtn = buildHelpBtn();
  const settingsBtn = buildSettingsBtn();
  const exitBtn = buildExitBtn();

  // R3: also track the header reload button so setstatus colors it too.
  const headerReload = document.querySelector(".bcc-reload") as HTMLElement | null;
  if (headerReload) trackReloadButton(headerReload);

  // Layout groups.
  const left = document.createElement("div");
  left.className = "bcc-footer-left";
  left.appendChild(onlineCount);
  left.appendChild(autoscrollBtn);

  const center = document.createElement("div");
  center.className = "bcc-footer-center";
  center.appendChild(reloadBtn);
  center.appendChild(helpBtn);
  center.appendChild(settingsBtn);

  // R2: account/status/links group (was missing — only reload/help/settings/exit shipped).
  const links = document.createElement("div");
  links.className = "bcc-footer-links";
  links.append(
    buildAwayToggleBtn(),
    buildAwayOffBtn(),
    buildMessageOnBtn(),
    buildMessageOffBtn(),
    buildForumBtn(),
    buildIdBtn(),
    buildUpHelpBtn()
  );

  const right = document.createElement("div");
  right.className = "bcc-footer-right";
  right.appendChild(exitBtn);

  footerEl.innerHTML = "";
  footerEl.appendChild(left);
  footerEl.appendChild(center);
  footerEl.appendChild(links);
  footerEl.appendChild(right);

  // Connection-status → reload button color (all tracked buttons now)
  patchSetStatus();

  cclog("footer mounted — pills + links + FA + setstatus patch", "v3");
}
