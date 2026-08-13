// ─── v3 chatbar footer — pill groups by origin ─────────────────────────────
//
// Builds the pill groups that sit to the RIGHT of the textarea in .bcc-chatbar
// (mountInput builds the textarea on the left). Pills are organized by origin:
//
// Groups (left → right after the textarea):
//   1. Chat pill      — upstream interaction: away / back / sysmsg on/off /
//                       autoscroll / reload (4-col, 6 items)
//   2. BetterCC pill  — our added features: theme color / scheme toggle /
//                       help / settings (2-col, 4 items)
//   3. Links pill     — upstream external: ID / forum / nick-color / help (2-col, 4 items)
//   4. Exit           — red sign-out icon button (standalone, always last)

import { cclog, getUserKey, printHelp } from "./utils";
import { saveColor, toggleSchemeVersion, getSchemeVersion } from "./theme";
import { getConfig, setConfig } from "./config";
import { getChatNick, sendCommand, leaveChat } from "./upstream";
import { actionButton } from "./dom";
import { updatePlaceholder } from "./input";
import { openSettings } from "./settings";
import { subscribe, type BccEvent } from "./store";

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
  const btn = actionButton({ iconClass, title, onClick });
  const isBnClass = /^b\d+$/.test(iconClass);
  // bN classes need the class ON the button (glyph is a ::before in v3.css);
  // the factory built the <i>, but for bN the icon is the button itself.
  btn.className = isBnClass ? "bcc-icon-btn " + iconClass : "bcc-icon-btn";
  return btn;
}

/**
 * A pill container — a translucent rounded grid wrapping a group of buttons.
 *
 * `columns`: 0 = bare .bcc-pill (vertical stack), 2/3/4 = N-column grid.
 * `extraClass` adds a modifier (e.g. "bcc-chat") for targeting in CSS.
 */
function pill(columns: number, extraClass: string, ...children: HTMLElement[]): HTMLElement {
  const p = document.createElement("div");
  p.className = columns > 0 ? "bcc-pill bcc-pill-" + columns : "bcc-pill";
  if (extraClass) p.classList.add(extraClass);
  for (const c of children) p.appendChild(c);

  return p;
}

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
 * Build a color-picker swatch — <label> wrapping an invisible <input type="color">.
 * `onInput` receives the uppercase hex string (no # prefix).
 */
function buildColorPicker(
  title: string,
  name: string,
  defaultColor: string,
  onInput: (hex: string) => void,
): HTMLElement {
  const wrap = document.createElement("label");
  wrap.className = "bcc-color-btn bcc-color-picker-wrap";
  wrap.title = title;
  wrap.setAttribute("aria-label", title);

  const input = document.createElement("input");
  input.type = "color";
  input.name = name;
  input.className = "bcc-color-input";
  input.value = defaultColor;

  input.addEventListener("input", () => {
    const hex = input.value.replace(/^#/, "").toUpperCase();
    wrap.style.setProperty("--swatch-color", input.value);
    onInput(hex);
  });

  wrap.appendChild(input);
  return wrap;
}

/**
 * Local theme color picker. oninput regenerates the scheme via saveColor
 * (writes --bcc-* to .bcc-shell + mirrors into the iframe).
 * Seeds from the stored base color.
 */
function buildColorSwatch(): HTMLElement {
  const picker = buildColorPicker("Thema-Farbe wählen", "bcc-color", "#6aaed8", (hex) => {
    saveColor(hex, getUserKey("color"), getUserKey("colorscheme")).catch((e) => {
      cclog("color swatch: saveColor failed — " + (e as Error).message, "v3");
    });
  });

  const input = picker.querySelector("input")!;

  // Sync the swatch from the stored color: once at mount, and again whenever
  // the color changes elsewhere (settings modal) via the config bus.
  const syncColor = () => {
    getConfig("color", "6AAED8").then((hex) => {
      input.value = "#" + String(hex).replace(/^#/, "");
      picker.style.setProperty("--swatch-color", input.value);
    });
  };
  syncColor();
  subscribe((e: BccEvent) => {
    if (e.type === "config" && e.key === "color") syncColor();
  });

  return picker;
}

// ─── Chat pill — upstream chat-interaction controls (4-col, 6 items) ───────
// Groups all upstream ChatCity controls that were previously spread across
// the Account pill, Chat-actions pill, and standalone nick-color picker.

function buildChatPill(): HTMLElement {
  const awayBtn = iconBtn("b2", "Away (/away)", () => sendCommand("/away"));
  const backBtn = iconBtn("b3", "Zurück (/awayoff)", () => sendCommand("/awayoff"));
  const autoscrollBtn = buildAutoscrollBtn();
  const reloadBtn = trackReloadButton(buildReloadBtn());
  awayBtn.classList.add("bcc-keep");
  backBtn.classList.add("bcc-keep");
  autoscrollBtn.classList.add("bcc-keep");
  reloadBtn.classList.add("bcc-keep");

  return pill(
    4,
    "bcc-chat",
    awayBtn,
    backBtn,
    iconBtn("b5", "Systemmeldungen an", () => sendCommand("/messageon")),
    iconBtn("b6", "Systemmeldungen aus", () => sendCommand("/messageoff")),
    autoscrollBtn,
    reloadBtn,
  );
}

// ─── BetterCC pill — our added features (2-col, 4 items) ───────────────────
// Theme color picker + scheme toggle moved here from the old Chat-actions pill
// because they are BetterCC features, not upstream controls.

function buildBetterccPill(): HTMLElement {
  // Scheme-version toggle (v1 ↔ v2, live, no reload)
  const schemeToggle = document.createElement("button");
  schemeToggle.type = "button";
  schemeToggle.className = "bcc-icon-btn";
  const updateToggle = () => {
    const v2 = getSchemeVersion();
    schemeToggle.title = v2 ? "Scheme v2 — klick für v1" : "Scheme v1 — klick für v2";
    schemeToggle.setAttribute("aria-label", schemeToggle.title);
    schemeToggle.innerHTML =
      '<span style="font-size:10px;font-weight:700">' + (v2 ? "v2" : "v1") + "</span>";
  };
  updateToggle();
  // Re-render when the scheme version changes elsewhere (settings modal).
  subscribe((e: BccEvent) => {
    if (e.type === "config" && e.key === "scheme_v2") updateToggle();
  });
  schemeToggle.addEventListener("click", async (e) => {
    e.stopPropagation();
    schemeToggle.style.pointerEvents = "none";
    await toggleSchemeVersion();
    updateToggle();
    schemeToggle.style.pointerEvents = "";
  });

  return pill(
    2,
    "bcc-bettercc",
    buildColorSwatch(),
    iconBtn("fa-cog", "Einstellungen", () => {
      openSettings();
    }),
    schemeToggle,
    iconBtn("fa-circle-info", "Hilfe", () => printHelp()),
  );
}

// ─── Group 3: Links (ID + forum + external help) ───────────────────────────

function buildLinksPill(): HTMLElement {
  const id = iconBtn("b16", "Eigene ID", () => {
    const nick = getChatNick();
    if (nick) window.open("//www.chatcity.de/de/id/" + nick + ".html", "IDCARD");
  });
  const forum = iconBtn("b15", "Forum", () => {
    window.open("//www.chatcity.de/f101/", "_blank");
  });
  const help = iconBtn("b1", "Chat-Hilfe (extern)", () => {
    window.open("//www.chatcity.de/de/hilfe-allgemeines.html#cmd", "_blank");
  });

  // Nick-color picker — calls upstream color_set on change.
  const nickColor = buildColorPicker("Nick-Farbe wählen", "bcc-nick-color", "#aa0000", (hex) => {
    sendCommand("/color " + hex);
  });

  return pill(2, "bcc-links", id, forum, nickColor, help);
}

// ─── Group 4: Exit (red, standalone) ───────────────────────────────────────

function buildExitBtn(): HTMLElement {
  const btn = iconBtn("b7", "Verlassen", () => leaveChat());
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

// ─── Compact-mode toggle ──────────────────────────────────────────────────
// Small chevron at the left edge of the chatbar (before the textarea).
// ▼ = collapse bar down (compact), ▲ = expand bar up.
// Toggles .bcc-compact on the chatbar. State persisted to GM storage
// (key compact_{user}) so it survives page refresh.

function setToggleState(btn: HTMLElement, compact: boolean): void {
  btn.title = compact ? "Chatbar erweitern" : "Chatbar komprimieren";
  btn.setAttribute("aria-label", btn.title);
  btn.querySelector("i")!.className = compact ? "fas fa-chevron-up" : "fas fa-chevron-down";
}

function buildCompactToggle(): HTMLElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "bcc-compact-toggle";
  btn.title = "Chatbar komprimieren";
  btn.setAttribute("aria-label", "Chatbar komprimieren");
  btn.innerHTML = '<i class="fas fa-chevron-down"></i>';

  btn.addEventListener("click", async () => {
    const chatbar = document.querySelector(".bcc-chatbar");
    if (!chatbar) return;
    const compact = chatbar.classList.toggle("bcc-compact");
    setToggleState(btn, compact);
    updatePlaceholder();
    await setConfig("compact", compact ? "1" : "");
  });

  return btn;
}

// ─── Mount ─────────────────────────────────────────────────────────────────

export function mountFooter(): void {
  const chatbar = document.querySelector(".bcc-chatbar");
  if (!chatbar) return;

  injectFontAwesome();

  // Insert compact toggle between textarea and first pill.
  const firstPill = chatbar.querySelector(".bcc-chat") as HTMLElement | null;
  if (firstPill) {
    chatbar.insertBefore(buildCompactToggle(), firstPill);
  } else {
    chatbar.append(buildCompactToggle());
  }

  // Append the pill groups AFTER the textarea (mountInput already put
  // .bcc-input-area first; it's flex:1 so these sit to its right).
  chatbar.append(buildChatPill(), buildBetterccPill(), buildLinksPill(), buildExitBtn());

  // R3: also track the header reload button so setstatus colors it too.
  const headerReload = document.querySelector(".bcc-reload") as HTMLElement | null;
  if (headerReload) trackReloadButton(headerReload);

  patchSetStatus();

  cclog("footer mounted — pill groups + FA + setstatus patch", "v3");

  // Restore persisted compact state
  getConfig("compact", "").then((v) => {
    if (v) {
      chatbar.classList.add("bcc-compact");
      const toggle = chatbar.querySelector(".bcc-compact-toggle") as HTMLElement | null;
      if (toggle) setToggleState(toggle, true);
      updatePlaceholder();
    }
  });
}
