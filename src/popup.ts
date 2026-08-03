// ─── User popup — whisper / superwhisper / pin / ignore (spec §4.3 / R1) ──
//
// Replaces upstream open_utn(). Opens on userlist row click; closes on Esc,
// outside-click, or any action. The popup is positioned below the row.
//
// Tier-0 wiring (R1 from the mid-impl review): the previous code only logged
// to console and silently toggled pin with no visible feedback. This makes
// the row click discoverable and gives every action a button.
//
// Action maturity:
//   - Pin / Unpin       → wired (GM pinned_{user}, persists)
//   - Superwhisper      → wired (bettercc.superwhisper, GM whisper_{user})
//   - Flüstern (1×)     → wired (sets a one-shot whisper target via bettercc.superwhisper)
//   - Ignorieren (/sb)  → stub (T12 superban; logs)
//   - Bild              → thumbnail button in header (fetchUserImage + hover preview)
//   - ID (/id)          → stub (T13 id-popup; icon-only in header)

import { type User } from "./store";
import { cclog } from "./utils";
import { getBettercc } from "./upstream";
import { actionButton, iconElement } from "./dom";
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

let openPopup: HTMLElement | null = null;

let onOutsideClick: ((e: MouseEvent) => void) | null = null;

/** The hover-preview <img> element (one per popup-open, removed on close). */
let previewImg: HTMLImageElement | null = null;

function closePopup(): void {
  if (!openPopup) return;
  openPopup.remove();
  openPopup = null;
  document.removeEventListener("keydown", onKeydown, true);
  // Remove the outside-click listener explicitly — a {once:true} listener
  // would linger after a no-op close (popup already null) and swallow the
  // NEXT row click, producing the "click twice then stuck" bug.
  if (onOutsideClick) {
    document.removeEventListener("click", onOutsideClick);
    onOutsideClick = null;
  }
  // Lifecycle: remove the hover-preview element when the popup closes.
  if (previewImg) {
    previewImg.remove();
    previewImg = null;
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    e.stopPropagation();
    closePopup();
  }
}

/** A popup action button: a theme-aware Font Awesome icon + a text label.
 *  The icon inherits the popup's text color (--bcc-text-raised), so it recolors
 *  with the theme — no fixed emoji that ignores the color scheme.
 *  When `keepOpen` is true, the popup stays open after the click (default
 *  closes it — backward-compatible). */
function actionBtn(
  iconClass: string,
  label: string,
  title: string,
  onClick: () => void,
  keepOpen?: boolean,
): HTMLButtonElement {
  const btn = actionButton({
    iconClass,
    label,
    title,
    onClick: () => {
      onClick();
      if (!keepOpen) closePopup();
    },
  });
  btn.className = "bcc-popup-action";
  // Keep the popup-specific label class (matches existing code; no CSS rule
  // targets it, but the class name is part of the public DOM contract).
  const labelSpan = btn.querySelector("span");
  if (labelSpan) labelSpan.className = "bcc-popup-action-label";
  return btn;
}

// ─── Hover-preview helpers ──────────────────────────────────────────────

/** Ensure the hover-preview <img> exists and is appended to .bcc-shell. */
function ensurePreviewImg(): HTMLImageElement {
  if (previewImg) return previewImg;
  previewImg = document.createElement("img");
  previewImg.className = "bcc-image-preview";
  previewImg.setAttribute("alt", "");
  previewImg.setAttribute("aria-hidden", "true");
  const mount = (document.querySelector(".bcc-shell") as HTMLElement | null) ?? document.body;
  mount.appendChild(previewImg);
  return previewImg;
}

/**
 * Compute viewport-clamped position for the hover-preview image.
 *
 * @returns {{ left: number, top: number }} CSS-left and CSS-top in px.
 */
export function clampPreviewPosition(
  clientX: number,
  clientY: number,
  imgW: number,
  imgH: number,
  viewW: number,
  viewH: number,
): { left: number; top: number } {
  let left = clientX + 16;
  let top = clientY - 75;

  const w = imgW || 320;
  const h = imgH || 400;

  if (left + w > viewW - 8) left = clientX - w - 16;
  if (left < 8) left = 8;
  if (top + h > viewH - 8) top = viewH - h - 8;
  if (top < 8) top = 8;

  return { left, top };
}

/** Position the preview image offset from the cursor, clamped to viewport. */
function positionPreview(img: HTMLImageElement, clientX: number, clientY: number): void {
  const pos = clampPreviewPosition(
    clientX,
    clientY,
    img.offsetWidth,
    img.offsetHeight,
    window.innerWidth,
    window.innerHeight,
  );
  img.style.left = pos.left + "px";
  img.style.top = pos.top + "px";
}

// ─── Thumbnail button (in header) ───────────────────────────────────────

/**
 * Build the thumbnail button that sits in the popup header.
 * Initial state: placeholder icon (fa-image). On click: fetches the user
 * image; on success with a photo, shows the thumbnail. Hover on a loaded
 * thumbnail shows the full-size cursor-following preview.
 * Shift-click forces a cache refresh.
 */
function buildThumbButton(userName: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "bcc-popup-thumb-btn";
  btn.title = "Bild von " + userName + " laden (Umschalt+Klick = neu laden)";
  btn.setAttribute("aria-label", btn.title);

  // Placeholder icon (shown before any fetch)
  const placeholderIcon = iconElement("fa-image");
  placeholderIcon.style.pointerEvents = "none";
  btn.appendChild(placeholderIcon);

  btn.addEventListener("click", (e: MouseEvent) => {
    e.stopPropagation();
    // Shift-click forces a cache refresh; plain click is a no-op (image
    // auto-loads when the popup opens).
    if (e.shiftKey) loadThumb(btn, userName, true);
  });

  return btn;
}

/** Load the user image into the thumb button. */
function loadThumb(
  btn: HTMLButtonElement,
  userName: string,
  force: boolean,
): void {
  // Show a loading indicator: replace icon with a spinner character
  btn.textContent = "";
  const spinner = document.createElement("i");
  spinner.className = "fas fa-spinner fa-spin";
  spinner.style.pointerEvents = "none";
  spinner.setAttribute("aria-hidden", "true");
  btn.appendChild(spinner);

  fetchUserImage(userName, { force })
    .then((result) => {
      // Only update if the popup is still open
      if (!openPopup?.contains(btn)) return;
      applyThumbResult(btn, result, userName);
    })
    .catch(() => {
      if (!openPopup?.contains(btn)) return;
      restorePlaceholder(btn, "Bild nicht verfügbar");
    });
}

/** Apply the fetch result to the thumb button. */
function applyThumbResult(
  btn: HTMLButtonElement,
  result: UserImageResult,
  userName: string,
): void {
  btn.textContent = "";

  if (!result.hasPhoto || !result.thumbUrl) {
    // No photo — restore placeholder with hint
    const icon = iconElement("fa-image");
    icon.style.pointerEvents = "none";
    btn.appendChild(icon);
    btn.title = "Kein Bild";
    return;
  }

  // Has photo — show thumbnail image
  const thumb = document.createElement("img");
  thumb.src = result.thumbUrl;
  thumb.alt = "Benutzerbild";
  thumb.setAttribute("aria-hidden", "true");

  // On broken image, fall back to placeholder
  thumb.addEventListener("error", () => {
    btn.textContent = "";
    const icon = iconElement("fa-image");
    icon.style.pointerEvents = "none";
    btn.appendChild(icon);
    btn.title = "Bild nicht verfügbar";
  });

  btn.appendChild(thumb);
  btn.title = "Bild von " + userName;

  // Hover preview: show full-size image following cursor
  if (result.fullUrl && result.fullUrl !== result.thumbUrl) {
    const showPreview = (e: MouseEvent) => {
      const img = ensurePreviewImg();
      img.src = result.fullUrl!;
      img.style.display = "block";
      positionPreview(img, e.clientX, e.clientY);
    };
    const movePreview = (e: MouseEvent) => {
      const img = ensurePreviewImg();
      positionPreview(img, e.clientX, e.clientY);
    };
    const hidePreview = () => {
      if (previewImg) previewImg.style.display = "none";
    };

    btn.addEventListener("mouseenter", showPreview);
    btn.addEventListener("mousemove", movePreview);
    btn.addEventListener("mouseleave", hidePreview);
  }
}

/** Restore the placeholder icon and set a title. */
function restorePlaceholder(btn: HTMLButtonElement, title: string): void {
  btn.textContent = "";
  const icon = iconElement("fa-image");
  icon.style.pointerEvents = "none";
  btn.appendChild(icon);
  btn.title = title;
}

// ─── Click-to-copy username ──────────────────────────────────────────────

/**
 * Build the clickable username span. Clicking copies the name to clipboard
 * and briefly shows "Kopiert!" feedback.
 */
function buildUsernameSpan(userName: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "bcc-popup-username";
  span.textContent = userName;
  span.title = "Klicken zum Kopieren";

  span.addEventListener("click", (e: MouseEvent) => {
    e.stopPropagation();
    copyToClipboard(span, userName);
  });

  return span;
}

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

// ─── ID icon button (in header) ──────────────────────────────────────────

/**
 * Build the icon-only ID button that sits at the end of the popup header.
 * Stub behavior: logs to console (T13).
 */
function buildIdButton(userName: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "bcc-popup-id-btn";
  const label = "ID von " + userName + " anzeigen";
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.appendChild(iconElement("fa-id-card"));

  btn.addEventListener("click", (e: MouseEvent) => {
    e.stopPropagation();
    cclog("user popup: /id stubbed (T13) — " + userName, "v3");
    closePopup();
  });

  return btn;
}

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

  // Header row: [thumb] [username] [id-icon]
  const header = document.createElement("div");
  header.className = "bcc-popup-header";
  const thumbBtn = buildThumbButton(user.name);
  header.appendChild(thumbBtn);
  header.appendChild(buildUsernameSpan(user.name));
  header.appendChild(buildIdButton(user.name));
  popup.appendChild(header);

  // Pin / Unpin
  popup.appendChild(
    actionBtn(
      isPinned ? "fa-thumbtack-slash" : "fa-thumbtack",
      isPinned ? "Angeheftet entfernen" : "Anheften",
      "Benutzer anheften",
      () => {
        onTogglePin(user);
      },
    ),
  );

  // Superwhisper (persistent) — toggles via the exposed API
  popup.appendChild(
    actionBtn("fa-comment-dots", "Superwhisper", "Dauerhaft an " + user.name + " flüstern", () => {
      const api = getBettercc();
      if (typeof api?.superwhisper === "function") api.superwhisper(user.name, false);
    }),
  );

  // One-shot whisper — prefill the textarea with "/w <nick> " and focus it.
  // Does NOT arm superwhisper (no persistent rewrite); the user sends the one
  // prefilled message, then types normally again.
  popup.appendChild(
    actionBtn("fa-paper-plane", "Flüstern (1×)", "Einmal an " + user.name + " flüstern", () => {
      const api = getBettercc();
      if (typeof api?.prefillWhisper === "function") api.prefillWhisper(user.name);
    }),
  );

  // Ignore (superban) — T12
  popup.appendChild(
    actionBtn("fa-ban", "Ignorieren", "Benutzer ignorieren (T12)", () => {
      cclog("user popup: ignore stubbed (T12) — " + user.name, "v3");
    }),
  );

  // Mount inside .bcc-shell (NOT document.body) so the popup inherits the
  // --bcc-* theme vars, which now live on .bcc-shell rather than :root (see
  // theme.ts applyScheme). The popup is position:fixed, so it's taken out of
  // flow and doesn't disturb the shell's grid layout, and its viewport-relative
  // coords are unaffected by the parent (no transform/filter/perspective on
  // .bcc-shell or its ancestors). Falls back to body defensively in case the
  // shell isn't built yet (shouldn't happen — popups open after mount).
  const mount = (document.querySelector(".bcc-shell") as HTMLElement | null) ?? document.body;
  mount.appendChild(popup);

  // Auto-fetch the user image on popup open (cache-respecting; instant on
  // repeat opens). Shift-click on the thumb forces a refresh.
  loadThumb(thumbBtn, user.name, false);

  const rect = anchor.getBoundingClientRect();
  popup.style.position = "fixed";
  popup.style.left = Math.min(rect.left, window.innerWidth - popup.offsetWidth - 8) + "px";
  popup.style.top = rect.bottom + 4 + "px";

  openPopup = popup;
  document.addEventListener("keydown", onKeydown, true);

  // Outside-click closes the popup. Managed explicitly (not {once:true}) so
  // closePopup() can remove it — a once-listener would linger after a no-op
  // close and swallow the next row click (the "click twice then stuck" bug).
  // The opening row's click handler calls stopPropagation, so this listener is
  // only armed AFTER the opening click has finished dispatching — it never
  // sees its own opening event.
  onOutsideClick = (e: MouseEvent) => {
    if (openPopup && !openPopup.contains(e.target as Node)) closePopup();
  };
  document.addEventListener("click", onOutsideClick);
}
