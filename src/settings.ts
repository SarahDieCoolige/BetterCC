// ─── Settings modal (T10) ──────────────────────────────────────────────────
//
// Settings apply instantly: each control writes + applies its value on change
// (no Save button). `loaded` snapshots GM state at open so the Undo button can
// revert this session's changes; it is immutable for the dialog's lifetime, so
// Undo after an import rolls back past the import. The modal floats via
// z-index (2000) above the chat overlays (/id, user popup, photo preview) and
// does not close them. Pure helpers live in settings-helpers.ts.

import { iconElement } from "./dom";
import { getConfig, setConfig, type ConfigKey } from "./config";
import { saveColor, setSchemeVersion } from "./theme";
import { emit } from "./bus";
import { cclog, getUserKey } from "./utils";
import { COMMANDS } from "./commands";
import { getChatNick, getChannel } from "./upstream";
import { type BccColorScheme } from "./scheme-v1";
import {
  type SettingsDraft,
  defaultDraft,
  schemeForPreview,
  validateColor,
  isDirty,
  addPinned,
  removePinned,
  pinnedEqual,
  draftFromConfig,
  serializeExport,
  exportFileName,
  parseImport,
} from "./settings-helpers";

// ═══════════════════════════════════════════════════════════════════════════
// Color presets (UI palette data, used by buildAppearancePanel)
// ═══════════════════════════════════════════════════════════════════════════

/** Curated preset palette for the Erscheinungsbild tab. */
const COLOR_PRESETS = [
  "6AAED8",
  "2E86AB",
  "06A77D",
  "C9A227",
  "D7263D",
  "A23BB6",
  "3B3B58",
  "E7E2D3",
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// Apply helpers — instant-write wrappers for individual controls
// ═══════════════════════════════════════════════════════════════════════════

/** Write a config key, then emit the change. Awaitable for batch applies. */
async function emitConfig(key: ConfigKey, value: unknown): Promise<void> {
  await setConfig(key, value);
  emit({ type: "config", key });
}

/** Single-control write: fire-and-forget with a logged catch, so a failed GM
 *  write surfaces in the log instead of a silent unhandled rejection. */
function writeConfig(key: ConfigKey, value: unknown): void {
  emitConfig(key, value).catch((e) =>
    cclog("settings write failed: " + (e as Error).message, "v3"),
  );
}

/** Apply a color instantly: mirror in draft, regenerate + theme + emit. */
function applyColor(hex: string): void {
  if (!draft) return;
  draft.color = hex;
  saveColor(hex, getUserKey("color"), getUserKey("colorscheme")).catch((e) =>
    cclog("settings color apply failed: " + (e as Error).message, "v3"),
  );
}

/** Apply the scheme version instantly. */
function applyScheme(v2: boolean): void {
  if (!draft) return;
  draft.schemeV2 = v2;
  setSchemeVersion(v2).catch((e) =>
    cclog("settings scheme apply failed: " + (e as Error).message, "v3"),
  );
}

/** Apply only the fields that differ between `current` (the just-applied state)
 *  and `next` (undo / import / reset target). Awaited by callers so a fast
 *  follow-up Undo can't interleave; diffing avoids re-emitting unchanged keys,
 *  which would needlessly re-sync every subscriber. */
async function applyDiff(current: SettingsDraft, next: SettingsDraft): Promise<void> {
  if (current.color !== next.color)
    await saveColor(next.color, getUserKey("color"), getUserKey("colorscheme"));
  if (current.schemeV2 !== next.schemeV2) await setSchemeVersion(next.schemeV2);
  if (current.sendOnEnter !== next.sendOnEnter) await emitConfig("send_on_enter", next.sendOnEnter);
  if (current.hoverPreview !== next.hoverPreview)
    await emitConfig("hover_preview", next.hoverPreview);
  if (!pinnedEqual(current.pinned, next.pinned)) await emitConfig("pinned", next.pinned);
  if (current.whisper !== next.whisper) await emitConfig("whisper", next.whisper);
}

// ═══════════════════════════════════════════════════════════════════════════
// Modal shell — open/close, tabs, ARIA, focus trap
// ═══════════════════════════════════════════════════════════════════════════

// Tab definitions (labels); each panel is populated by its buildXPanel below.
const TABS = ["Erscheinungsbild", "Chat", "Verwaltung", "Daten", "Info", "Befehle"] as const;

// Singleton state
let overlayEl: HTMLElement | null = null;
let documentKeydown: ((e: KeyboardEvent) => void) | null = null;
let openerEl: Element | null = null;
let loaded: SettingsDraft | null = null;
let draft: SettingsDraft | null = null;
let activeTab = 0;
const tabButtons: HTMLButtonElement[] = [];
const tabPanels: HTMLElement[] = [];
let revertBtn: HTMLButtonElement | null = null;

// Appearance panel refs (set during buildAppearancePanel, cleared in closeSettings)
let previewChips: Map<string, HTMLElement> | null = null; // data-role → chip element
let swatchButtons: HTMLButtonElement[] = [];

/**
 * Close the settings modal if open. Safe to call when no modal exists.
 * Unregisters the overlay closer and restores focus to the opener.
 */
export function closeSettings(): void {
  if (documentKeydown) {
    document.removeEventListener("keydown", documentKeydown);
    documentKeydown = null;
  }
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
  // Restore focus to the element that opened the modal
  if (openerEl && "focus" in openerEl) {
    (openerEl as HTMLElement).focus();
  }
  openerEl = null;
  loaded = null;
  draft = null;
  activeTab = 0;
  tabButtons.length = 0;
  tabPanels.length = 0;
  revertBtn = null;
  previewChips = null;
  swatchButtons.length = 0;
}

/**
 * Open the settings modal. Reads config into a fresh draft, builds the
 * overlay + card, wires ARIA + focus trap. Closes any prior settings
 * instance first (own singleton). The overlay sits at z-index 2000, above
 * the chat-experience overlays (id popup, user popup, photo preview), so it
 * floats over them without closing them.
 */
export async function openSettings(): Promise<void> {
  closeSettings();

  const shell = document.querySelector(".bcc-shell");
  if (!shell) return;

  // Record the element that had focus before opening (for restore on close)
  openerEl = document.activeElement;

  // Read the 6 managed keys into loaded + draft
  const [color, schemeV2, pinned, whisper, sendOnEnter, hoverPreview] = await Promise.all([
    getConfig("color", "6AAED8"),
    getConfig("scheme_v2", false),
    getConfig("pinned", []),
    getConfig("whisper", ""),
    getConfig("send_on_enter", true),
    getConfig("hover_preview", true),
  ]);

  const raw = {
    color,
    scheme_v2: schemeV2,
    pinned,
    whisper,
    send_on_enter: sendOnEnter,
    hover_preview: hoverPreview,
  };
  loaded = draftFromConfig(raw);
  draft = draftFromConfig(raw);

  // ── Overlay ──
  overlayEl = document.createElement("div");
  overlayEl.className = "bcc-settings-overlay";

  // ── Card ──
  const card = document.createElement("div");
  card.className = "bcc-settings-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-labelledby", "bcc-settings-title");

  // ── Header ──
  const header = document.createElement("div");
  header.className = "bcc-settings-header";

  const title = document.createElement("span");
  title.id = "bcc-settings-title";
  title.textContent = "Einstellungen";
  header.appendChild(title);

  const closeBtn = document.createElement("button");
  closeBtn.className = "bcc-settings-close";
  closeBtn.setAttribute("aria-label", "Schließen");
  closeBtn.appendChild(iconElement("fa-xmark"));
  closeBtn.addEventListener("click", closeSettings);
  header.appendChild(closeBtn);

  card.appendChild(header);

  // ── Tab strip ──
  const tabList = document.createElement("div");
  tabList.className = "bcc-settings-tabs";
  tabList.setAttribute("role", "tablist");

  const panelsContainer = document.createElement("div");
  panelsContainer.className = "bcc-settings-panels";

  for (let i = 0; i < TABS.length; i++) {
    const tab = document.createElement("button");
    tab.className = "bcc-settings-tab";
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", i === 0 ? "true" : "false");
    tab.setAttribute("aria-controls", "bcc-settings-panel-" + i);
    tab.id = "bcc-settings-tab-" + i;
    tab.textContent = TABS[i];
    tab.addEventListener("click", () => selectTab(i));
    tabButtons.push(tab);
    tabList.appendChild(tab);

    const panel = document.createElement("div");
    panel.className = "bcc-settings-panel";
    panel.id = "bcc-settings-panel-" + i;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", "bcc-settings-tab-" + i);
    panel.setAttribute("aria-hidden", i === 0 ? "false" : "true");
    // Panel content is populated by the buildXPanel calls below.
    tabPanels.push(panel);
    panelsContainer.appendChild(panel);
  }

  // Populate the Erscheinungsbild tab (panel 0)
  if (tabPanels.length > 0) {
    buildAppearancePanel(tabPanels[0]);
  }

  // Populate the Chat tab (panel 1)
  if (tabPanels.length > 1) {
    buildChatPanel(tabPanels[1]);
  }

  // Populate the Verwaltung tab (panel 2)
  if (tabPanels.length > 2) {
    buildManagementPanel(tabPanels[2]);
  }

  // Populate the Daten tab (panel 3)
  if (tabPanels.length > 3) {
    buildDatenPanel(tabPanels[3]);
  }

  // Populate the Info tab (panel 4)
  if (tabPanels.length > 4) {
    buildInfoPanel(tabPanels[4]);
  }

  // Populate the Befehle tab (panel 5)
  if (tabPanels.length > 5) {
    buildBefehlePanel(tabPanels[5]);
  }

  card.appendChild(tabList);
  card.appendChild(panelsContainer);

  // ── Undo/Close bar ──
  // Undo reverts to the open-time snapshot (loaded); disabled until something
  // changes. Close just dismisses — changes already apply instantly.
  const bar = document.createElement("div");
  bar.className = "bcc-settings-bar";

  const doneBtn = document.createElement("button");
  doneBtn.className = "bcc-settings-btn";
  doneBtn.textContent = "Fertig";
  doneBtn.addEventListener("click", closeSettings);
  bar.appendChild(doneBtn);

  revertBtn = document.createElement("button");
  revertBtn.className = "bcc-settings-btn";
  revertBtn.textContent = "Rückgängig";
  revertBtn.title = "Auf den Stand beim Öffnen zurücksetzen";
  revertBtn.disabled = true; // starts clean (draft == loaded)
  revertBtn.addEventListener("click", handleRevert);
  bar.appendChild(revertBtn);

  card.appendChild(bar);

  // ── Assemble ──
  overlayEl.appendChild(card);
  shell.appendChild(overlayEl);

  // ── Event bindings ──
  documentKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeSettings();
      return;
    }
    // Arrow keys move between tabs
    handleTabArrow(e);
    // Focus trap: intercept Tab to cycle within the modal
    handleFocusTrap(e);
  };
  document.addEventListener("keydown", documentKeydown);

  overlayEl.addEventListener("click", (e: MouseEvent) => {
    if (e.target === overlayEl) closeSettings();
  });

  // Focus the first tab on open
  activeTab = 0;
  if (tabButtons.length > 0) {
    tabButtons[0].focus();
  }
}

// ─── Erscheinungsbild (Appearance) panel ─────────────────────────────────

/** Sync the active swatch button to match the current draft.color. */
function syncPresetActive(): void {
  if (!draft) return;
  const upper = draft.color.toUpperCase();
  for (const btn of swatchButtons) {
    const match = btn.getAttribute("data-color")?.toUpperCase() === upper;
    btn.classList.toggle("bcc-swatch-active", match);
    btn.setAttribute("aria-pressed", match ? "true" : "false");
  }
}

/** Refresh the preview chips from the current draft. */
function refreshPreview(): void {
  if (!draft || !previewChips) return;
  const scheme = schemeForPreview(draft.color, draft.schemeV2);
  const surfaceChip = previewChips.get("surface");
  if (surfaceChip) {
    surfaceChip.style.background = "#" + scheme.surface;
    const sample = surfaceChip.querySelector<HTMLElement>(".bcc-appearance-sample");
    if (sample) sample.style.color = "#" + scheme.text;
  }
  const setBg = (role: string) => {
    const chip = previewChips?.get(role);
    if (chip) chip.style.background = "#" + scheme[role as keyof BccColorScheme];
  };
  setBg("accentWhisper");
  setBg("accentBan");
  setBg("surfaceRaised");
}

/**
 * Build the Erscheinungsbild panel content. Called once per openSettings,
 * fills tabPanels[0] with color presets, hex input, native picker, live
 * preview, and the v1/v2 toggle.
 */
function buildAppearancePanel(panel: HTMLElement): void {
  // ── Section: Farbe ──
  const colorSection = document.createElement("section");
  colorSection.className = "bcc-appearance-section";

  const colorHeading = document.createElement("h3");
  colorHeading.className = "bcc-appearance-heading";
  colorHeading.textContent = "Farbe";
  colorSection.appendChild(colorHeading);

  // Preset swatches
  const presetsRow = document.createElement("div");
  presetsRow.className = "bcc-presets";
  for (const hex of COLOR_PRESETS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bcc-swatch";
    btn.style.background = "#" + hex;
    btn.setAttribute("aria-label", "Farbe " + hex);
    btn.setAttribute("data-color", hex);
    btn.addEventListener("click", () => {
      if (!draft) return;
      draft.color = hex;
      if (hexInput) hexInput.value = hex;
      if (colorPicker) colorPicker.value = "#" + hex;
      clearError();
      syncPresetActive();
      refreshPreview();
      applyColor(hex);
      updateRevertButton();
    });
    swatchButtons.push(btn);
    presetsRow.appendChild(btn);
  }
  colorSection.appendChild(presetsRow);

  // Color picker + hex input row
  const inputRow = document.createElement("div");
  inputRow.className = "bcc-appearance-row";

  const colorPicker = document.createElement("input");
  colorPicker.type = "color";
  colorPicker.className = "bcc-appearance-picker";
  colorPicker.value = "#" + (draft?.color ?? "6AAED8");
  colorPicker.setAttribute("aria-label", "Farbe wählen");

  const hexInput = document.createElement("input");
  hexInput.type = "text";
  hexInput.className = "bcc-appearance-hex";
  hexInput.maxLength = 7;
  hexInput.inputMode = "text";
  hexInput.value = draft?.color ?? "6AAED8";
  hexInput.placeholder = "6AAED8";

  const errorSpan = document.createElement("span");
  errorSpan.className = "bcc-appearance-error";
  errorSpan.setAttribute("aria-live", "polite");

  function clearError(): void {
    errorSpan.textContent = "";
  }

  // Sync helpers (used by swatch clicks and picker events)
  function syncPickerFromDraft(): void {
    if (draft && colorPicker) colorPicker.value = "#" + draft.color;
  }

  colorPicker.addEventListener("input", () => {
    if (!draft) return;
    const stripped = colorPicker.value.replace(/^#/, "");
    draft.color = stripped;
    hexInput.value = stripped;
    clearError();
    syncPresetActive();
    refreshPreview();
    applyColor(stripped);
    updateRevertButton();
  });

  hexInput.addEventListener("input", () => {
    if (!draft) return;
    const val = hexInput.value;
    const stripped = val.replace(/^#/, "");
    const err = validateColor(stripped);
    if (err) {
      errorSpan.textContent = err;
      // Don't mutate draft.color on invalid input
      updateRevertButton();
      return;
    }
    clearError();
    draft.color = stripped;
    syncPickerFromDraft();
    syncPresetActive();
    refreshPreview();
    applyColor(stripped);
    updateRevertButton();
  });

  inputRow.appendChild(colorPicker);
  inputRow.appendChild(hexInput);
  colorSection.appendChild(inputRow);
  colorSection.appendChild(errorSpan);
  panel.appendChild(colorSection);

  // ── Section: Vorschau ──
  const previewSection = document.createElement("section");
  previewSection.className = "bcc-appearance-section";

  const previewHeading = document.createElement("h3");
  previewHeading.className = "bcc-appearance-heading";
  previewHeading.textContent = "Vorschau";
  previewSection.appendChild(previewHeading);

  const previewRow = document.createElement("div");
  previewRow.className = "bcc-appearance-preview";

  const chipDefs: { role: string; label: string }[] = [
    { role: "surface", label: "Hintergrund" },
    { role: "accentWhisper", label: "Akzent" },
    { role: "accentBan", label: "Hinweis" },
    { role: "surfaceRaised", label: "Hervorgehoben" },
  ];

  previewChips = new Map();
  for (const { role, label } of chipDefs) {
    const chip = document.createElement("div");
    chip.className = "bcc-appearance-chip";
    chip.setAttribute("data-role", role);
    chip.dataset.role = role;
    previewChips.set(role, chip);

    if (role === "surface") {
      const sample = document.createElement("span");
      sample.className = "bcc-appearance-sample";
      sample.textContent = "Aa";
      chip.appendChild(sample);
    }

    const chipLabel = document.createElement("span");
    chipLabel.className = "bcc-appearance-chip-label";
    chipLabel.textContent = label;
    chip.appendChild(chipLabel);

    previewRow.appendChild(chip);
  }
  previewSection.appendChild(previewRow);
  panel.appendChild(previewSection);

  // ── Section: v1/v2 toggle ──
  const toggleSection = document.createElement("section");
  toggleSection.className = "bcc-appearance-section";

  const toggleLabel = document.createElement("label");
  toggleLabel.className = "bcc-switch";

  const toggleInput = document.createElement("input");
  toggleInput.type = "checkbox";
  toggleInput.checked = draft?.schemeV2 ?? false;

  const toggleTrack = document.createElement("span");
  toggleTrack.className = "bcc-switch-track";

  const toggleText = document.createElement("span");
  toggleText.textContent = "Experimentelles Scheme (v2)";

  toggleLabel.appendChild(toggleInput);
  toggleLabel.appendChild(toggleTrack);
  toggleLabel.appendChild(toggleText);

  toggleInput.addEventListener("change", () => {
    if (!draft) return;
    draft.schemeV2 = toggleInput.checked;
    refreshPreview();
    applyScheme(toggleInput.checked);
    updateRevertButton();
  });

  toggleSection.appendChild(toggleLabel);
  panel.appendChild(toggleSection);

  // Initial render
  syncPresetActive();
  refreshPreview();
}

// ─── Chat panel ──────────────────────────────────────────────────────────

/**
 * Build the Chat panel content. Called once per openSettings,
 * fills tabPanels[1] with the Enter-to-send toggle.
 */
function buildChatPanel(panel: HTMLElement): void {
  const field = document.createElement("div");
  field.className = "bcc-settings-field";

  // Toggle switch: sendOnEnter
  const label = document.createElement("label");
  label.className = "bcc-switch";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = draft?.sendOnEnter ?? true;

  const track = document.createElement("span");
  track.className = "bcc-switch-track";

  const labelText = document.createElement("span");
  labelText.textContent = "Enter sendet (Shift+Enter für Zeilenumbruch)";

  label.appendChild(checkbox);
  label.appendChild(track);
  label.appendChild(labelText);

  checkbox.addEventListener("change", () => {
    if (!draft) return;
    draft.sendOnEnter = checkbox.checked;
    writeConfig("send_on_enter", checkbox.checked);
    updateRevertButton();
  });

  field.appendChild(label);

  // Hint paragraph
  const hint = document.createElement("p");
  hint.className = "bcc-settings-hint";
  hint.textContent = "Ausgeschaltet: Shift+Enter sendet, Enter macht einen Zeilenumbruch.";
  field.appendChild(hint);

  panel.appendChild(field);

  // ── Hover-preview toggle ──
  const hoverField = document.createElement("div");
  hoverField.className = "bcc-settings-field";

  const hoverLabel = document.createElement("label");
  hoverLabel.className = "bcc-switch";

  const hoverCheckbox = document.createElement("input");
  hoverCheckbox.type = "checkbox";
  hoverCheckbox.checked = draft?.hoverPreview ?? true;

  const hoverTrack = document.createElement("span");
  hoverTrack.className = "bcc-switch-track";

  const hoverLabelText = document.createElement("span");
  hoverLabelText.textContent = "Hover-Vorschau für Fotos";

  hoverLabel.appendChild(hoverCheckbox);
  hoverLabel.appendChild(hoverTrack);
  hoverLabel.appendChild(hoverLabelText);

  hoverCheckbox.addEventListener("change", () => {
    if (!draft) return;
    draft.hoverPreview = hoverCheckbox.checked;
    writeConfig("hover_preview", hoverCheckbox.checked);
    updateRevertButton();
  });

  hoverField.appendChild(hoverLabel);

  const hoverHint = document.createElement("p");
  hoverHint.className = "bcc-settings-hint";
  hoverHint.textContent =
    "Ausgeschaltet: Vorschaubilder erscheinen nur beim Klicken (Anheften), nicht beim Hovern.";
  hoverField.appendChild(hoverHint);

  panel.appendChild(hoverField);
}

// ─── Verwaltung (Management) panel ─────────────────────────────────────────

/**
 * Build the Verwaltung panel content. Called once per openSettings,
 * fills tabPanels[2] with pinned user management and whisper target controls.
 */
function buildManagementPanel(panel: HTMLElement): void {
  // ── Section: Angeheftete Benutzer ──
  const pinnedSection = document.createElement("section");
  pinnedSection.className = "bcc-appearance-section";

  const pinnedHeading = document.createElement("h3");
  pinnedHeading.className = "bcc-appearance-heading";
  pinnedHeading.textContent = "Angeheftete Benutzer";
  pinnedSection.appendChild(pinnedHeading);

  const pinnedWrap = document.createElement("div");
  pinnedWrap.className = "bcc-manage-section";

  const listUl = document.createElement("ul");
  listUl.className = "bcc-manage-list";

  // local renderList — rebuilds the <ul> from draft.pinned
  function renderList(): void {
    if (!draft) return;
    listUl.innerHTML = "";
    for (const name of draft.pinned) {
      const li = document.createElement("li");
      li.className = "bcc-manage-row";

      const nameSpan = document.createElement("span");
      nameSpan.className = "bcc-manage-name";
      nameSpan.textContent = name;
      li.appendChild(nameSpan);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "bcc-manage-remove";
      removeBtn.setAttribute("aria-label", name + " entfernen");
      removeBtn.appendChild(iconElement("fa-trash"));
      removeBtn.addEventListener("click", () => {
        if (!draft) return;
        draft.pinned = removePinned(draft.pinned, name);
        renderList();
        writeConfig("pinned", draft.pinned);
        updateRevertButton();
      });
      li.appendChild(removeBtn);

      listUl.appendChild(li);
    }
  }

  renderList();
  pinnedWrap.appendChild(listUl);

  // Add row
  const addRow = document.createElement("div");
  addRow.className = "bcc-manage-add";

  const addInput = document.createElement("input");
  addInput.type = "text";
  addInput.className = "bcc-manage-input";
  addInput.placeholder = "Benutzername";

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "bcc-settings-btn";
  addBtn.textContent = "Hinzufügen";
  addBtn.addEventListener("click", () => {
    if (!draft) return;
    draft.pinned = addPinned(draft.pinned, addInput.value);
    addInput.value = "";
    renderList();
    writeConfig("pinned", draft.pinned);
    updateRevertButton();
  });
  addInput.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addBtn.click();
    }
  });

  addRow.appendChild(addInput);
  addRow.appendChild(addBtn);
  pinnedWrap.appendChild(addRow);
  pinnedSection.appendChild(pinnedWrap);
  panel.appendChild(pinnedSection);

  // ── Section: Flüsterziel (Superwhisper) ──
  const whisperSection = document.createElement("section");
  whisperSection.className = "bcc-appearance-section";

  const whisperHeading = document.createElement("h3");
  whisperHeading.className = "bcc-appearance-heading";
  whisperHeading.textContent = "Flüsterziel (Superwhisper)";
  whisperSection.appendChild(whisperHeading);

  const whisperWrap = document.createElement("div");
  whisperWrap.className = "bcc-manage-section bcc-manage-whisper";

  const currentLine = document.createElement("div");
  currentLine.className = "bcc-manage-current";
  const currentLabel = document.createElement("span");
  currentLabel.textContent = "Aktuell: ";
  currentLine.appendChild(currentLabel);
  const currentStrong = document.createElement("strong");
  currentStrong.textContent = draft?.whisper || "Keines";
  currentLine.appendChild(currentStrong);
  whisperWrap.appendChild(currentLine);

  function refreshWhisperDisplay(): void {
    currentStrong.textContent = draft?.whisper || "Keines";
  }

  // Add row
  const whisperAddRow = document.createElement("div");
  whisperAddRow.className = "bcc-manage-add";

  const whisperInput = document.createElement("input");
  whisperInput.type = "text";
  whisperInput.className = "bcc-manage-input";
  whisperInput.placeholder = "Benutzername";

  const setBtn = document.createElement("button");
  setBtn.type = "button";
  setBtn.className = "bcc-settings-btn";
  setBtn.textContent = "Festlegen";
  setBtn.addEventListener("click", () => {
    if (!draft) return;
    draft.whisper = whisperInput.value.trim();
    whisperInput.value = "";
    refreshWhisperDisplay();
    writeConfig("whisper", draft.whisper);
    updateRevertButton();
  });
  whisperInput.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setBtn.click();
    }
  });

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "bcc-settings-btn";
  clearBtn.textContent = "Leeren";
  clearBtn.addEventListener("click", () => {
    if (!draft) return;
    draft.whisper = "";
    refreshWhisperDisplay();
    writeConfig("whisper", draft.whisper);
    updateRevertButton();
  });

  whisperAddRow.appendChild(whisperInput);
  whisperAddRow.appendChild(setBtn);
  whisperAddRow.appendChild(clearBtn);
  whisperWrap.appendChild(whisperAddRow);
  whisperSection.appendChild(whisperWrap);
  panel.appendChild(whisperSection);
}

// ─── Daten (Data) panel ──────────────────────────────────────────────────────

/** Rebuild the draft-reflecting panels (Erscheinungsbild, Chat, Verwaltung)
 *  from the current draft. Used after import/reset replaces the draft, so the
 *  other tabs reflect the new values. Resets the appearance refs first so the
 *  rebuilt panels don't hold stale element references. */
function rebuildDraftPanels(): void {
  previewChips = null;
  swatchButtons.length = 0;
  for (const i of [0, 1, 2]) {
    tabPanels[i]?.replaceChildren();
  }
  if (tabPanels[0]) buildAppearancePanel(tabPanels[0]);
  if (tabPanels[1]) buildChatPanel(tabPanels[1]);
  if (tabPanels[2]) buildManagementPanel(tabPanels[2]);
}

/** Export the working draft as a versioned JSON download. */
function handleExport(): void {
  if (!draft) return;
  const user = getChatNick() || "gast";
  const blob = serializeExport(draft, user);
  const json = JSON.stringify(blob, null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = exportFileName(user, new Date().toISOString().slice(0, 10));
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Build the Daten panel content. Called once per openSettings,
 *  fills tabPanels[3] with export/import/reset controls. */
function buildDatenPanel(panel: HTMLElement): void {
  const section = document.createElement("section");
  section.className = "bcc-appearance-section";

  const heading = document.createElement("h3");
  heading.className = "bcc-appearance-heading";
  heading.textContent = "Daten";
  section.appendChild(heading);

  const hint = document.createElement("p");
  hint.className = "bcc-settings-hint";
  hint.textContent = "Backup als Datei speichern, wiederherstellen oder zurücksetzen.";
  section.appendChild(hint);

  // Button row
  const row = document.createElement("div");
  row.className = "bcc-data-row";

  // Export button
  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.className = "bcc-settings-btn";
  exportBtn.textContent = "Exportieren";
  exportBtn.addEventListener("click", handleExport);
  row.appendChild(exportBtn);

  // Import button — label wrapping a hidden file input
  const importLabel = document.createElement("label");
  importLabel.className = "bcc-settings-btn";

  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = "application/json,.json";
  importInput.style.display = "none";

  const importText = document.createTextNode("Importieren");
  importLabel.appendChild(importInput);
  importLabel.appendChild(importText);
  row.appendChild(importLabel);

  // Reset button
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "bcc-settings-btn";
  resetBtn.textContent = "Auf Standard zurücksetzen";
  row.appendChild(resetBtn);

  section.appendChild(row);

  // Error span for import failures
  const errorSpan = document.createElement("span");
  errorSpan.className = "bcc-data-error";
  errorSpan.setAttribute("aria-live", "polite");
  section.appendChild(errorSpan);

  panel.appendChild(section);

  // ── Handlers (closures over errorSpan + importInput) ──
  function showError(msg: string): void {
    errorSpan.textContent = msg;
  }

  importInput.addEventListener("change", () => {
    const file = importInput.files?.[0];
    if (!file) return;
    file.text().then(async (text) => {
      const result = parseImport(text);
      if (!result.ok) {
        showError(result.error);
        importInput.value = ""; // allow re-picking the same file
        return;
      }
      // Full replace — confirm before overwriting the working draft.
      if (!window.confirm("Alle Einstellungen durch den Import ersetzen?")) {
        importInput.value = "";
        return;
      }
      const prev = draft;
      draft = result.draft;
      try {
        if (prev) await applyDiff(prev, result.draft);
      } catch (e) {
        cclog("settings import apply failed: " + (e as Error).message, "v3");
      }
      rebuildDraftPanels();
      updateRevertButton();
      showError("");
      importInput.value = "";
    });
  });

  resetBtn.addEventListener("click", async () => {
    if (!window.confirm("Alle Einstellungen auf Standard zurücksetzen?")) return;
    const prev = draft;
    draft = defaultDraft();
    try {
      if (prev) await applyDiff(prev, draft);
    } catch (e) {
      cclog("settings reset apply failed: " + (e as Error).message, "v3");
    }
    rebuildDraftPanels();
    updateRevertButton();
  });
}

// ─── Info panel ──────────────────────────────────────────────────────────────

/** Read-only diagnostics: version, user, channel, storage key example. */
function buildInfoPanel(panel: HTMLElement): void {
  const list = document.createElement("div");
  list.className = "bcc-info-list";

  const rows: { key: string; val: string }[] = [
    { key: "Version", val: GM_info.script.version },
    { key: "Benutzer", val: getChatNick() || "\u2013" },
    { key: "Kanal", val: getChannel() || "\u2013" },
    { key: "Speicher-Schlüssel (Bsp.)", val: getUserKey("color") },
  ];

  for (const { key, val } of rows) {
    const row = document.createElement("div");
    row.className = "bcc-info-row";

    const keyEl = document.createElement("span");
    keyEl.className = "bcc-info-key";
    keyEl.textContent = key;

    const valEl = document.createElement("span");
    valEl.className = "bcc-info-val";
    valEl.textContent = val;

    row.appendChild(keyEl);
    row.appendChild(valEl);
    list.appendChild(row);
  }

  panel.appendChild(list);
}

// ─── Befehle panel ──────────────────────────────────────────────────────────

/** Render COMMANDS as a two-column reference table. */
function buildBefehlePanel(panel: HTMLElement): void {
  const heading = document.createElement("h3");
  heading.className = "bcc-appearance-heading";
  heading.textContent = "Befehle";
  panel.appendChild(heading);

  const table = document.createElement("table");
  table.className = "bcc-cmds-table";

  for (const { cmd, desc } of COMMANDS) {
    const tr = document.createElement("tr");

    const tdCmd = document.createElement("td");
    tdCmd.className = "bcc-cmds-cmd";
    tdCmd.textContent = cmd;

    const tdDesc = document.createElement("td");
    tdDesc.className = "bcc-cmds-desc";
    tdDesc.textContent = desc;

    tr.appendChild(tdCmd);
    tr.appendChild(tdDesc);
    table.appendChild(tr);
  }

  panel.appendChild(table);
}

// ─── Tab selection ────────────────────────────────────────────────────────

function selectTab(index: number): void {
  if (index < 0 || index >= TABS.length) return;
  activeTab = index;
  for (let i = 0; i < tabButtons.length; i++) {
    const isSelected = i === index;
    tabButtons[i].setAttribute("aria-selected", isSelected ? "true" : "false");
    tabPanels[i].setAttribute("aria-hidden", isSelected ? "false" : "true");
  }
}

function handleTabArrow(e: KeyboardEvent): void {
  if (tabButtons.length === 0) return;
  const target = e.target as HTMLElement;
  if (!tabButtons.includes(target as HTMLButtonElement)) return;
  let next = -1;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
    e.preventDefault();
    next = (activeTab + 1) % tabButtons.length;
  } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
    e.preventDefault();
    next = (activeTab - 1 + tabButtons.length) % tabButtons.length;
  }
  if (next >= 0) {
    selectTab(next);
    tabButtons[next].focus();
  }
}

// ─── Focus trap ───────────────────────────────────────────────────────────

function handleFocusTrap(e: KeyboardEvent): void {
  if (e.key !== "Tab") return;
  if (!overlayEl) return;

  const focusable = overlayEl.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey) {
    if (document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  } else {
    if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

// ─── Revert handler ────────────────────────────────────────────────────

/** Undo: re-apply only the fields that changed since open, from the snapshot. */
async function handleRevert(): Promise<void> {
  if (!loaded || !draft) return;
  try {
    await applyDiff(draft, loaded);
  } catch (e) {
    cclog("settings undo failed: " + (e as Error).message, "v3");
  }
  draft = { ...loaded };
  rebuildDraftPanels();
  updateRevertButton();
}

/** Enable the Undo button only when the draft differs from the open snapshot. */
function updateRevertButton(): void {
  if (revertBtn && loaded && draft) {
    revertBtn.disabled = !isDirty(loaded, draft);
  }
}
