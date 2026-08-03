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
//   - Ignorieren (/sb)  → stub (T12 superban; logs)
//   - Bild              → photo container in center (fetchUserImage + centered preview)
//   - ID (/id)          → stub (T13 id-popup; icon-only in name row)

import { type User } from "./store";
import { cclog } from "./utils";
import { getBettercc } from "./upstream";
import { iconElement } from "./dom";
import { fetchUserImage, type UserImageResult } from "./user-image";

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

function closePopup(): void {
  if (!openPopup) return;
  openPopup.remove();
  openPopup = null;
  document.removeEventListener("keydown", onKeydown, true);
  if (onOutsideClick) {
    document.removeEventListener("click", onOutsideClick);
    onOutsideClick = null;
  }
  // Remove any photo preview elements
  const backdrop = document.querySelector(".bcc-photo-preview-backdrop");
  if (backdrop) backdrop.remove();
  const preview = document.querySelector(".bcc-photo-preview");
  if (preview) preview.remove();
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    e.stopPropagation();
    closePopup();
  }
}

// ─── Click-to-copy username ────────────────────────────────────────────────

/** Copy text to clipboard, with brief visual feedback on the element. */
function copyToClipboard(el: HTMLElement, text: string): void {
  try {
    navigator.clipboard.writeText(text).then(() => {
      showCopyFeedback(el);
    }).catch(() => {
      // Clipboard API denied — fail silently
    });
  } catch {
    // Clipboard API unavailable — fail silently
  }
}

/** Show brief "Kopiert!" feedback, then restore the original title. */
function showCopyFeedback(el: HTMLElement): void {
  const originalTitle = el.title;
  el.title = "Kopiert!";
  setTimeout(() => {
    if (el.title === "Kopiert!") el.title = originalTitle;
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

// ─── Centered photo preview ────────────────────────────────────────────────

/**
 * Show the full-size photo in a centered modal overlay.
 * Click on backdrop or image dismisses; Escape key also dismisses (via onKeydown).
 */
function buildPhotoPreview(fullUrl: string): void {
  // Remove any existing preview first
  const existingBackdrop = document.querySelector(".bcc-photo-preview-backdrop");
  if (existingBackdrop) existingBackdrop.remove();
  const existingPreview = document.querySelector(".bcc-photo-preview");
  if (existingPreview) existingPreview.remove();

  const mount = (document.querySelector(".bcc-shell") as HTMLElement | null) ?? document.body;

  const backdrop = document.createElement("div");
  backdrop.className = "bcc-photo-preview-backdrop";

  const previewImg = document.createElement("img");
  previewImg.className = "bcc-photo-preview";
  previewImg.src = fullUrl;
  previewImg.alt = "";

  const dismiss = () => {
    backdrop.remove();
    previewImg.remove();
  };

  backdrop.addEventListener("click", dismiss);
  previewImg.addEventListener("click", dismiss);

  mount.appendChild(backdrop);
  mount.appendChild(previewImg);
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

  const icon = iconElement(isPinned ? "fa-thumbtack" : "fa-thumbtack fa-rotate-45");
  btn.appendChild(icon);

  if (isPinned) btn.classList.add("pinned");

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onToggle();
  });

  return btn;
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
  closePopup(); // only one at a time

  const popup = document.createElement("div");
  popup.className = "bcc-user-popup";
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-modal", "false");
  popup.setAttribute("aria-label", "Aktionen für " + user.name);

  // Pin (top-right, absolute)
  popup.appendChild(buildPin(isPinned, () => onTogglePin(user)));

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
    cclog("user popup: /id stubbed (T13) — " + user.name, "v3");
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
    cclog("user popup: ignore stubbed (T12) — " + user.name, "v3");
    closePopup();
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

  // Photo: click = centered preview. Wire AFTER mount so dimensions are available.
  const photoImg = photoContainer.querySelector("img") as HTMLImageElement;
  if (photoImg) {
    photoImg.addEventListener("click", (e) => {
      e.stopPropagation();
      if (photoImg.src && photoImg.classList.contains("bcc-photo-loaded")) {
        buildPhotoPreview(photoImg.src);
      }
    });
    // Also allow clicking the avatar to preview (for when photo is loaded)
    const avatarDiv = photoContainer.querySelector(".bcc-popup-avatar") as HTMLElement;
    if (avatarDiv) {
      avatarDiv.addEventListener("click", (e) => {
        e.stopPropagation();
        if (photoImg.src && photoImg.classList.contains("bcc-photo-loaded")) {
          buildPhotoPreview(photoImg.src);
        }
      });
    }
  }

  // Auto-fetch photo
  loadPhoto(photoContainer, user.name);

  openPopup = popup;
  document.addEventListener("keydown", onKeydown, true);

  // Outside-click closes the popup. Managed explicitly (not {once:true}) so
  // closePopup() can remove it — a once-listener would linger after a no-op
  // close and swallow the next row click (the "click twice then stuck" bug).
  onOutsideClick = (e: MouseEvent) => {
    if (openPopup && !openPopup.contains(e.target as Node)) closePopup();
  };
  document.addEventListener("click", onOutsideClick);
}
