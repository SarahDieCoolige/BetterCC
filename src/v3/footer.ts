// ─── v3 chatbar footer — pill groups matching the v2 footer design ───────
//
// Builds the pill groups that sit to the RIGHT of the textarea in .bcc-chatbar
// (mountInput builds the textarea on the left). Matches the v2 footer layout:
// grouped icon buttons in translucent rounded "pill" containers, plus a row of
// preset nick-color circles and a red exit button.
//
// Groups (left → right after the textarea):
//   1. Account pill   — away / awayoff / sysmsg on / off  (upstream fns)
//   2. Chat actions   — autoscroll + reload + local color picker
//   3. BetterCC pill  — help + settings
//   4. Preset colors  — 6 nick-color circles (upstream color_set, NOT local theme)
//   5. Links pill     — ID + forum + external help
//   6. Exit           — red sign-out icon button (standalone)
//
// The color picker (3) is the LOCAL theme (saveColor → --bcc-*); the preset
// circles (4) set the SERVER-SIDE nick color via upstream color_set — distinct.

import { cclog, getUserKey, printHelp } from "../utils";
import { saveColor } from "./theme";
import { getConfig } from "./config";

// R3: chatout_setstatus colors EVERY reload button. v3 has two reload buttons
// (header + footer); track both so a status change is visible in both places.
const reloadButtons: HTMLElement[] = [];

/** Register a reload button so setstatus colors it. Call at build time. */
function trackReloadButton(btn: HTMLElement): HTMLElement {
  reloadButtons.push(btn);
  return btn;
}

// ─── Button factories ──────────────────────────────────────────────────────

/**
 * Icon button (32×32) living inside a pill.
 *
 * iconClass is either a Font Awesome class (e.g. "fa-sync") rendered via an
 * inner <i>, OR a v2-style bN class (e.g. "b2") whose glyph is defined as a
 * ::before in v3.css. For bN classes we ALSO add the class to the button so
 * the .bcc-icon-btn.bN::before rule matches (and the > i hide rule fires so
 * the empty <i> doesn't take up the cell).
 */
function iconBtn(iconClass: string, title: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  const isBnClass = /^b\d+$/.test(iconClass);
  btn.className = isBnClass ? "bcc-icon-btn " + iconClass : "bcc-icon-btn";
  btn.title = title;
  btn.setAttribute("aria-label", title);
  btn.innerHTML = '<i class="fas ' + iconClass + '" aria-hidden="true"></i>';
  btn.addEventListener("click", (e) => {
    e.stopPropagation(); // don't bubble to the popup's outside-click listener
    onClick();
  });
  return btn;
}

/**
 * A pill container — a translucent rounded grid wrapping a group of buttons.
 *
 * `columns` mirrors the v2 design: 0 = bare .bcc-pill (single centered column,
 * children stack vertically); 2/3 = N-column grid (children flow into rows of
 * N, last partial row centered via justify-items). `extraClass` adds a modifier
 * (e.g. "bcc-chat-actions") for special-case spanning rules in v3.css.
 */
function pill(columns: number, extraClass: string, ...children: HTMLElement[]): HTMLElement {
  const p = document.createElement("div");
  p.className = columns > 0 ? "bcc-pill bcc-pill-" + columns : "bcc-pill";
  if (extraClass) p.classList.add(extraClass);
  for (const c of children) p.appendChild(c);
  return p;
}

/** Run an upstream "set OUT1 + delout" command (/away, /awayoff, /bye…). */
function sendSlashCommand(cmd: string): void {
  const docHold = (document as any).hold;
  if (!docHold) return;
  docHold.OUT1.value = cmd;
  const w = unsafeWindow as any;
  if (typeof w.delout === "function") w.delout();
}

import { toggleSchemeVersion, getSchemeVersion } from "./theme";

// ─── Group 1: Account / status ─────────────────────────────────────────────
// away / awayoff via hold.OUT1 + delout; sysmsg on/off via com_set.

function buildAccountPill(): HTMLElement {
  const away = iconBtn("b2", "Away (/away)", () => sendSlashCommand("/away"));
  const awayOff = iconBtn("b3", "Zurück (/awayoff)", () => sendSlashCommand("/awayoff"));
  const sysOn = iconBtn("b5", "Systemmeldungen an", () => {
    const w = unsafeWindow as any;
    if (typeof w.com_set === "function") w.com_set("/messageon");
  });
  const sysOff = iconBtn("b6", "Systemmeldungen aus", () => {
    const w = unsafeWindow as any;
    if (typeof w.com_set === "function") w.com_set("/messageoff");
  });
  return pill(2, "", away, sysOn, awayOff, sysOff);
}

// ─── Group 2: Chat actions (autoscroll + reload + local color picker) ──────

function buildAutoscrollBtn(): HTMLButtonElement {
  const btn = iconBtn("fa-angle-double-down", "Autoscroll ein/aus", () => {
    const cb = document.querySelector(
      'form[name="OF"] input[name="AS"]',
    ) as HTMLInputElement | null;
    if (cb) cb.click();
    btn.classList.toggle("bcc-active", cb?.checked ?? false);
  });
  const cb = document.querySelector('form[name="OF"] input[name="AS"]') as HTMLInputElement | null;
  if (cb?.checked) btn.classList.add("bcc-active");
  return btn;
}

function buildReloadBtn(): HTMLButtonElement {
  return iconBtn("fa-sync", "Chat neu laden", () => {
    (unsafeWindow.bettercc as any).reloadChat();
  });
}

/**
 * Local color picker swatch — a native <input type="color"> styled as a color
 * circle. oninput regenerates the scheme via saveColor (writes --bcc-* to
 * :root + mirrors into the iframe). Seeds from the stored base color.
 */
function buildColorSwatch(): HTMLElement {
  const wrap = document.createElement("label");
  wrap.className = "bcc-color-btn bcc-color-picker-wrap";
  wrap.title = "Thema-Farbe wählen";

  const input = document.createElement("input");
  input.type = "color";
  input.className = "bcc-color-input";
  input.setAttribute("aria-label", "Thema-Farbe wählen");
  input.value = "#6aaed8"; // default until the stored color loads

  getConfig("color", "6AAED8").then((hex) => {
    input.value = "#" + String(hex).replace(/^#/, "");
    wrap.style.setProperty("--swatch-color", input.value);
  });

  input.addEventListener("input", () => {
    const baseHex = input.value.replace(/^#/, "").toUpperCase();
    wrap.style.setProperty("--swatch-color", input.value);
    saveColor(baseHex, getUserKey("color"), getUserKey("colorscheme")).catch((e) => {
      cclog("color swatch: saveColor failed — " + (e as Error).message, "v3");
    });
  });

  wrap.appendChild(input);
  return wrap;
}

function buildChatActionsPill(): HTMLElement {
  // Scheme-version toggle (v1 ↔ v2, live, no reload) — small button next to
  // the theme colour swatch so both colour-related controls sit together.
  const schemeToggle = document.createElement("button");
  schemeToggle.type = "button";
  schemeToggle.className = "bcc-icon-btn";
  const updateToggle = () => {
    const v2 = getSchemeVersion();
    schemeToggle.title = v2 ? "Scheme v2 — klick für v1" : "Scheme v1 — klick für v2";
    schemeToggle.setAttribute("aria-label", schemeToggle.title);
    schemeToggle.innerHTML = '<span style="font-size:10px;font-weight:700">' + (v2 ? "v2" : "v1") + "</span>";
  };
  updateToggle();
  schemeToggle.addEventListener("click", async (e) => {
    e.stopPropagation();
    schemeToggle.style.pointerEvents = "none";
    await toggleSchemeVersion();
    updateToggle();
    schemeToggle.style.pointerEvents = "";
  });

  // 2-column pill (autoscroll + reload on row 1); the color swatch + scheme
  // toggle share row 2 via the .bcc-chat-actions rule in v3.css.
  return pill(
    2,
    "bcc-chat-actions",
    buildAutoscrollBtn(),
    trackReloadButton(buildReloadBtn()),
    buildColorSwatch(),
    schemeToggle,
  );
}

// ─── Group 3: BetterCC (help + settings) ───────────────────────────────────

function buildBetterccPill(): HTMLElement {
  const help = iconBtn("fa-question", "Hilfe", () => printHelp());
  const settings = iconBtn("fa-cog", "Einstellungen", () => {
    cclog("settings clicked — stub (T10)", "v3");
  });
  // Bare .bcc-pill — single centered column, help above settings (matches v2
  // "BetterCC pill" which had no grid-template-columns override).
  return pill(0, "", help, settings);
}

// ─── Group 4: Preset nick-color circles (upstream color_set) ───────────────
// These set the SERVER-SIDE nick color (what other chatters see) via
// color_set('/color HEX') → com_set → AJAX /chatin. Distinct from the local
// theme picker above.

const PRESET_COLORS: ReadonlyArray<readonly [cls: string, hex: string]> = [
  ["b10", "AA0000"], // red
  ["b13", "00AA00"], // green
  ["b14", "0000AA"], // blue
  ["b8", "AAAA00"], // yellow
  ["b12", "00AAAA"], // cyan
  ["b11", "AA00AA"], // magenta
];

function buildPresetColorPill(): HTMLElement {
  const children = PRESET_COLORS.map(([cls, hex]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bcc-color-btn " + cls;
    btn.title = "Nick-Farbe #" + hex;
    btn.setAttribute("aria-label", "Nick-Farbe auf #" + hex + " setzen");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const w = unsafeWindow as any;
      if (typeof w.color_set === "function") w.color_set(hex);
      else cclog("preset color: upstream color_set not found", "v3");
    });
    return btn;
  });
  return pill(3, "", ...children);
}

// ─── Group 5: Links (ID + forum + external help) ───────────────────────────

function buildLinksPill(): HTMLElement {
  const id = iconBtn("b16", "Eigene ID", () => {
    const nick = String((unsafeWindow as any).chat_nick ?? "");
    if (nick) window.open("//www.chatcity.de/de/id/" + nick + ".html", "IDCARD");
  });
  const forum = iconBtn("b15", "Forum", () => {
    window.open("//www.chatcity.de/f101/", "_blank");
  });
  const help = iconBtn("b1", "Chat-Hilfe (extern)", () => {
    window.open("//www.chatcity.de/de/hilfe-allgemeines.html#cmd", "_blank");
  });
  return pill(2, "bcc-links", id, forum, help);
}

// ─── Group 6: Exit (red, standalone) ───────────────────────────────────────

function buildExitBtn(): HTMLElement {
  const btn = iconBtn("b7", "Verlassen", () => {
    const w = unsafeWindow as any;
    if (typeof w.bye === "function") w.bye();
  });
  btn.classList.add("bcc-danger");
  return btn;
}

// ─── chatout_setstatus patch (connection → reload button color) ────────────

function patchSetStatus(): void {
  const w = unsafeWindow as any;
  if (typeof w.chatout_setstatus !== "function") return;
  const orig = w.chatout_setstatus;
  w.chatout_setstatus = function (text: string, color: string, bold: boolean) {
    for (const btn of reloadButtons) {
      btn.style.color = color || "#888";
      btn.title = "Chat neu laden — " + text;
    }
    orig.call(this, text, color, bold);
  };
}

// ─── Font Awesome CDN injection ────────────────────────────────────────────

function injectFontAwesome(): void {
  if (document.querySelector('link[href*="fontawesome"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://use.fontawesome.com/releases/v6.5.1/css/all.css";
  document.head.appendChild(link);
}

// ─── Mount ─────────────────────────────────────────────────────────────────

export function mountFooter(): void {
  const chatbar = document.querySelector(".bcc-chatbar");
  if (!chatbar) return;

  injectFontAwesome();

  // Append the pill groups AFTER the textarea area (mountInput already put
  // .bcc-input-area first; it's flex:1 so these sit to its right).
  chatbar.append(
    buildAccountPill(),
    buildChatActionsPill(),
    buildBetterccPill(),
    buildPresetColorPill(),
    buildLinksPill(),
    buildExitBtn(),
  );

  // R3: also track the header reload button so setstatus colors it too.
  const headerReload = document.querySelector(".bcc-reload") as HTMLElement | null;
  if (headerReload) trackReloadButton(headerReload);

  patchSetStatus();

  cclog("footer mounted — pill groups + FA + setstatus patch", "v3");
}
