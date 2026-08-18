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

import { cclog, printHelp } from "./utils";
import { setColor, toggleSchemeVersion } from "./theme";
import { getChatNick, sendCommand, leaveChat } from "./upstream";
import { actionButton } from "./dom";
import { openSettings } from "./settings";
import { get, set, react } from "./store";
import { buildStatusButton } from "./status-button";

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
  // The status button owns its own appearance via the conn react.
  return buildStatusButton();
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
 * Local theme color picker. oninput writes the color to the store;
 * the store react (in initTheme) regenerates the scheme and applies it.
 * Seeds from the stored base color.
 */
function buildColorSwatch(): HTMLElement {
  const picker = buildColorPicker("Thema-Farbe wählen", "bcc-color", "#6aaed8", (hex) => {
    void setColor(hex);
  });

  const input = picker.querySelector("input")!;

  // Sync the swatch from the store: once at mount (react's initial render),
  // and again whenever the color changes elsewhere (settings modal).
  react("color", (hex) => {
    input.value = "#" + String(hex).replace(/^#/, "");
    picker.style.setProperty("--swatch-color", input.value);
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
  const reloadBtn = buildReloadBtn();
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
    const v2 = get("scheme_v2");
    schemeToggle.title = v2 ? "Scheme v2 — klick für v1" : "Scheme v1 — klick für v2";
    schemeToggle.setAttribute("aria-label", schemeToggle.title);
    schemeToggle.innerHTML =
      '<span style="font-size:10px;font-weight:700">' + (v2 ? "v2" : "v1") + "</span>";
  };
  // Sync from store: initial render + re-render when scheme version changes.
  react("scheme_v2", updateToggle);
  schemeToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    void toggleSchemeVersion();
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
// Toggles .bcc-compact on the chatbar via the store; react keeps the class,
// chevron icon, and placeholder in sync.

function setToggleState(btn: HTMLElement, compact: boolean): void {
  btn.title = compact ? "Chatbar erweitern" : "Chatbar komprimieren";
  btn.setAttribute("aria-label", btn.title);
  btn.querySelector("i")!.className = compact ? "fas fa-chevron-up" : "fas fa-chevron-down";
}

function buildCompactToggle(chatbar: Element): HTMLElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "bcc-compact-toggle";
  btn.title = "Chatbar komprimieren";
  btn.setAttribute("aria-label", "Chatbar komprimieren");
  btn.innerHTML = '<i class="fas fa-chevron-down"></i>';

  btn.addEventListener("click", async () => {
    void set("compact", !get("compact"));
  });

  // Sync class + chevron from store. Initial render handles boot restore.
  react("compact", (on) => {
    chatbar.classList.toggle("bcc-compact", on);
    setToggleState(btn, on);
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
    chatbar.insertBefore(buildCompactToggle(chatbar), firstPill);
  } else {
    chatbar.append(buildCompactToggle(chatbar));
  }

  // Append the pill groups AFTER the textarea (mountInput already put
  // .bcc-input-area first; it's flex:1 so these sit to its right).
  chatbar.append(buildChatPill(), buildBetterccPill(), buildLinksPill(), buildExitBtn());

  cclog("footer mounted — pill groups + FA", "v3");
}
