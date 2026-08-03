// ─── User popup — identity-card layout (popup-redesign spec) ──────────────
//
// Replaces upstream open_utn(). Opens on userlist row click; closes on Esc,
// outside-click, or any action. The popup is positioned below the row.
//
// Layout:
//   ┌─────────────────────────────┐
//   │                          📌 │  pin toggle, top-right
//   │        ┌───────────┐         │
//   │        │  photo /  │         │  56×56, rounded
//   │        │  avatar   │         │  initial: letter avatar
//   │        └───────────┘         │
//   │                              │
//   │        username          🪪  │  name (click→copy) + ID icon
//   │                              │
//   │     ✈️      💬      🚫       │
//   │    /w      /sw     /ig       │  3-icon toolbar + shortcuts
//   │                              │
//   └─────────────────────────────┘
//
// Action maturity:
//   - Pin / Unpin       → wired (GM pinned_{user}, persists)
//   - Superwhisper      → wired (bettercc.superwhisper, GM whisper_{user})
//   - Flüstern (1×)     → wired (sets a one-shot whisper target via bettercc.superwhisper)
//   - Ignorieren (/ig)  → wired (two-tap confirm, upstream com_set /ignore)
//   - Bild              → photo container in center (fetchUserImage + hover/pin preview)
//   - ID (/id)          → wired (opens ID page in new window)

import { type User, subscribe, type BccEvent } from "./store";
import { encodeChatLink } from "./utils";
import { getBettercc } from "./upstream";
import { iconElement } from "./dom";
import { fetchUserImage, type UserImageResult } from "./user-image";
import { getConfig } from "./config";
import { dismissPreview, dismissAllPreviews, dismissHover, buildPreviewBox, previewByUser } from "./photo-preview";

/**
 * Stabiler HSL-Farbton (0–359) aus einem Benutzernamen, für den
 * Initial-Buchstaben-Avatar im User-Popup.
 *
 * Algorithm: sum of all charCodeAt(i) values, then mod 360.
 * Deterministic — same input always returns the same output.
 */
export function nickToHue(nick: string): number {
  let sum = 0;
  for (let i = 0; i < nick.length; i++) {
    sum += nick.charCodeAt(i);
  }
  return sum % 360;
}

// ─── Popup state ───────────────────────────────────────────────────────────

let openPopup: HTMLElement | null = null;

let onOutsideClick: ((e: MouseEvent) => void) | null = null;

let currentUser: string | null = null;

let unsubscribeStore: (() => void) | null = null;

function closePopup(): void {
  if (!openPopup) return;
  openPopup.remove();
  openPopup = null;
  currentUser = null;
  document.removeEventListener("keydown", onKeydown, true);
  window.removeEventListener("bcc-iframe-interaction", onIframeInteraction);
  if (onOutsideClick) {
    document.removeEventListener("click", onOutsideClick);
    onOutsideClick = null;
  }
  if (unsubscribeStore) {
    unsubscribeStore();
    unsubscribeStore = null;
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    e.stopPropagation();
    closePopup();
    dismissAllPreviews();
  }
}

function onIframeInteraction(): void {
  if (openPopup) closePopup();
}

// ─── Click-to-copy username ────────────────────────────────────────────────

/** Copy text to clipboard, with brief visual feedback on the element. */
function copyToClipboard(el: HTMLElement, text: string): void {
  const originalText = el.textContent ?? text;
  try {
    navigator.clipboard.writeText(text).then(() => {
      showCopyFeedback(el, originalText);
    }).catch(() => {});
  } catch {}
}

/** Show brief "✓ Kopiert!" feedback by swapping textContent, then restore. */
function showCopyFeedback(el: HTMLElement, originalText: string): void {
  el.textContent = "✓ Kopiert!";
  setTimeout(() => {
    if (el.textContent === "✓ Kopiert!") el.textContent = originalText;
  }, 1500);
}

// ─── Photo container (identity-card center) ────────────────────────────────

/**
 * Build the photo/avatar container for the identity card.
 *
 * Returns the container div.bcc-popup-photo. Caller can access the avatar div
 * and img element via querySelector on the returned container.
 */
function buildPhotoContainer(userName: string): HTMLElement {
  const container = document.createElement("div");
  container.className = "bcc-popup-photo";

  // Avatar: initial letter with a deterministic background hue
  const avatar = document.createElement("div");
  avatar.className = "bcc-popup-avatar";
  avatar.textContent = userName[0]?.toUpperCase() ?? "?";
  avatar.style.background = "hsl(" + nickToHue(userName) + ", 45%, 55%)";
  container.appendChild(avatar);

  // Hidden img (revealed when photo loads)
  const img = document.createElement("img");
  img.alt = "";
  // opacity: 0 initially; .bcc-photo-loaded sets opacity: 1
  container.appendChild(img);

  return container;
}

/**
 * Fetch the user's photo and, on success, reveal it in the container.
 *
 * On success with a photo: sets img.src; when onload fires, adds
 * bcc-photo-loaded class to the img and hides the avatar div.
 * On img error or fetch failure: leaves the avatar visible (no-op).
 */
function loadPhoto(container: HTMLElement, userName: string): void {
  const img = container.querySelector("img") as HTMLImageElement | null;
  const avatar = container.querySelector(".bcc-popup-avatar") as HTMLElement | null;
  if (!img || !avatar) return;

  fetchUserImage(userName)
    .then((result: UserImageResult) => {
      if (!result.hasPhoto || !result.thumbUrl) return; // avatar stays
      // Only update if the popup is still open
      if (!openPopup?.contains(container)) return;

	      img.src = result.thumbUrl;
	      // Store full-size URL for the preview — fall back to thumb if no fullUrl
	      img.dataset.fullUrl = result.fullUrl || result.thumbUrl;
      img.addEventListener("load", () => {
        img.classList.add("bcc-photo-loaded");
        avatar.style.display = "none";
      }, { once: true });
      img.addEventListener("error", () => {
        // Leave avatar visible — photo failed to load
      }, { once: true });
    })
    .catch(() => {
      // Fetch failed — avatar stays (no-op)
    });
}

// ─── Pin toggle ────────────────────────────────────────────────────────────

/**
 * Build the pin toggle button (top-right of the identity card).
 * Pinned → .pinned class (CSS boosts color) + straight thumbtack.
 * Not pinned → rotated thumbtack, no .pinned.
 */
function buildPin(isPinned: boolean, onToggle: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "bcc-popup-pin";
  btn.title = isPinned ? "Angeheftet entfernen" : "Anheften";
  btn.setAttribute("aria-label", btn.title);

  const icon = iconElement("fa-thumbtack");
  if (!isPinned) icon.style.transform = "rotate(45deg)";
  btn.appendChild(icon);

  if (isPinned) btn.classList.add("pinned");

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onToggle();
  });

  return btn;
}

/**
 * Update the pin button's DOM to reflect current pin state.
 * Syncs the icon rotation, .pinned class, title, and aria-label.
 */
function updatePinButton(btn: HTMLButtonElement, isPinned: boolean): void {
  const icon = btn.querySelector("i");
  if (icon) {
    icon.style.transform = isPinned ? "" : "rotate(45deg)";
  }
  btn.classList.toggle("pinned", isPinned);
  btn.title = isPinned ? "Angeheftet entfernen" : "Anheften";
  btn.setAttribute("aria-label", btn.title);
}

// ─── Toolbar cell ──────────────────────────────────────────────────────────

/**
 * Build a single toolbar cell: icon above shortcut label, with title + aria-label.
 * Click calls onClick after stopPropagation.
 */
function buildToolbarCell(
  iconClass: string,
  shortcut: string,
  title: string,
  onClick: () => void,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "bcc-popup-toolbar-cell";
  btn.title = title;
  btn.setAttribute("aria-label", title);

  const icon = document.createElement("i");
  icon.className = "fas " + iconClass + " bcc-toolbar-icon";
  icon.setAttribute("aria-hidden", "true");
  btn.appendChild(icon);

  const label = document.createElement("span");
  label.className = "bcc-toolbar-shortcut";
  label.textContent = shortcut;
  btn.appendChild(label);

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });

  return btn;
}

// ─── Public entry point ────────────────────────────────────────────────────

/**
 * Open the user popup anchored below the row for `user`.
 *
 * @param anchor  the clicked <li> (used for positioning + reading pinned state)
 * @param user    the user it represents
 * @param isPinned current pin state (drives the Pin/Unpin label)
 * @param onTogglePin  called when the user clicks Pin/Unpin
 */
export function openUserPopup(
  anchor: HTMLElement,
  user: User,
  isPinned: boolean,
  onTogglePin: (user: User) => void,
): void {
  // Toggle: if the same user's popup is already open, close it instead
  if (currentUser === user.name) {
    closePopup();
    return;
  }
  closePopup(); // only one at a time
  currentUser = user.name;

  const popup = document.createElement("div");
  popup.className = "bcc-user-popup";
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-modal", "false");
  popup.setAttribute("aria-label", "Aktionen für " + user.name);

  // Pin (top-right, absolute)
  const pinBtn = buildPin(isPinned, () => onTogglePin(user));
  popup.appendChild(pinBtn);

  // Subscribe to store so the pin button stays in sync when
  // togglePin in sidebar writes to GM (which emits "config").
  unsubscribeStore = subscribe((e: BccEvent) => {
    if (e.type === "config" && e.key === "pinned") {
      // Re-read pinned list from source of truth and update pin button
      getConfig("pinned", []).then((pinned: string[]) => {
        if (!openPopup) return;
        const nowPinned = pinned.some((n: string) => n.toLowerCase() === user.name.toLowerCase());
        updatePinButton(pinBtn, nowPinned);
      }).catch(() => {});
    }
  });

  // Photo container (centered, 56×56)
  const photoContainer = buildPhotoContainer(user.name);
  popup.appendChild(photoContainer);

  // Name row: username + ID icon
  const nameRow = document.createElement("div");
  nameRow.className = "bcc-popup-name-row";

  const nameSpan = document.createElement("span");
  nameSpan.className = "bcc-popup-username";
  nameSpan.textContent = user.name;
  nameSpan.title = "Klicken zum Kopieren";
  nameSpan.addEventListener("click", (e) => {
    e.stopPropagation();
    copyToClipboard(nameSpan, user.name);
  });
  nameRow.appendChild(nameSpan);

  // ID button (stub, T13)
  const idBtn = document.createElement("button");
  idBtn.type = "button";
  idBtn.className = "bcc-popup-id-btn";
  idBtn.title = "ID von " + user.name + " anzeigen";
  idBtn.setAttribute("aria-label", idBtn.title);
  idBtn.appendChild(iconElement("fa-id-card"));
  idBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const url = "//www.chatcity.de/de/id/" + encodeChatLink(user.name) + ".html";
    window.open(url, "IDCARD", "width=810,height=800,scrollbars=yes");
    closePopup();
  });
  nameRow.appendChild(idBtn);
  popup.appendChild(nameRow);

  // Toolbar (3 cells)
  const toolbar = document.createElement("div");
  toolbar.className = "bcc-popup-toolbar";

  toolbar.appendChild(buildToolbarCell("fa-paper-plane", "/w", "Einmal an " + user.name + " flüstern", () => {
    const api = getBettercc();
    if (typeof api?.prefillWhisper === "function") api.prefillWhisper(user.name);
    closePopup();
  }));

  toolbar.appendChild(buildToolbarCell("fa-comment-dots", "/sw", "Dauerhaft an " + user.name + " flüstern", () => {
    const api = getBettercc();
    if (typeof api?.superwhisper === "function") api.superwhisper(user.name, false);
    closePopup();
  }));

  toolbar.appendChild(buildToolbarCell("fa-ban", "/ig", "Benutzer ignorieren", () => {
    const btn = toolbar.lastElementChild as HTMLButtonElement;
    if (!btn) return;
    if (btn.classList.contains("bcc-confirm")) {
      // Second click — execute ignore, show confirmed state
      unsafeWindow.com_set?.("/ignore " + user.name);
      btn.classList.remove("bcc-confirm");
      btn.classList.add("bcc-confirmed");
      const icon = btn.querySelector("i");
      if (icon) { icon.className = "fas fa-check-double bcc-toolbar-icon"; }
      const label = btn.querySelector(".bcc-toolbar-shortcut");
      if (label) label.textContent = "ignoriert";
      setTimeout(() => {
        btn.classList.remove("bcc-confirmed");
        if (icon) { icon.className = "fas fa-ban bcc-toolbar-icon"; }
        if (label) label.textContent = "/ig";
      }, 1200);
    } else if (!btn.classList.contains("bcc-confirmed")) {
      // First click — ask for confirmation
      btn.classList.add("bcc-confirm");
      const icon = btn.querySelector("i");
      if (icon) { icon.className = "fas fa-check bcc-toolbar-icon"; }
      const label = btn.querySelector(".bcc-toolbar-shortcut");
      if (label) label.textContent = "sicher?";
      const reset = (e: MouseEvent) => {
        if (!btn.contains(e.target as Node)) {
          btn.classList.remove("bcc-confirm");
          if (icon) { icon.className = "fas fa-ban bcc-toolbar-icon"; }
          if (label) label.textContent = "/ig";
          document.removeEventListener("click", reset);
        }
      };
      setTimeout(() => document.addEventListener("click", reset), 0);
    }
  }));

  popup.appendChild(toolbar);

  // Mount inside .bcc-shell (NOT document.body) so the popup inherits the
  // --bcc-* theme vars, which now live on .bcc-shell rather than :root (see
  // theme.ts applyScheme).
  const mount = (document.querySelector(".bcc-shell") as HTMLElement | null) ?? document.body;
  mount.appendChild(popup);

  // Position below anchor
  const rect = anchor.getBoundingClientRect();
  popup.style.position = "fixed";
  popup.style.left = Math.min(rect.left, window.innerWidth - 200 - 8) + "px";
  popup.style.top = rect.bottom + 4 + "px";

  // Photo: hover = centered preview, click = toggle pin (stays open on mouseleave).
  // Hover: temporary preview. Click: pin/unpin.
  photoContainer.addEventListener("mouseenter", () => {
    if (previewByUser.has(user.name)) return;
    const img = photoContainer.querySelector("img") as HTMLImageElement;
    if (img?.classList.contains("bcc-photo-loaded") && img.dataset.fullUrl) {
      dismissHover();
      buildPreviewBox(img.dataset.fullUrl, user.name);
    }
  });
  photoContainer.addEventListener("mouseleave", () => {
    dismissHover();
  });
  photoContainer.addEventListener("click", (e) => {
    e.stopPropagation();
    if (previewByUser.has(user.name)) {
      dismissPreview(user.name);
      return;
    }
    const img = photoContainer.querySelector("img") as HTMLImageElement;
    if (img?.classList.contains("bcc-photo-loaded") && img.dataset.fullUrl) {
      dismissHover();
      const box = buildPreviewBox(img.dataset.fullUrl, user.name);
      previewByUser.set(user.name, box);
    }
  });

  // Auto-fetch photo
  loadPhoto(photoContainer, user.name);

  openPopup = popup;
  window.addEventListener("bcc-iframe-interaction", onIframeInteraction);
  document.addEventListener("keydown", onKeydown, true);

  // Outside-click closes the popup. Managed explicitly (not {once:true}) so
  // closePopup() can remove it — a once-listener would linger after a no-op
  // close and swallow the next row click (the "click twice then stuck" bug).
  onOutsideClick = (e: MouseEvent) => {
    if (openPopup && !openPopup.contains(e.target as Node)) closePopup();
  };
  document.addEventListener("click", onOutsideClick);
}
