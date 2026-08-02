// ─── User popup — whisper / superwhisper / pin / ignore / id (spec §4.3 / R1) ─
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
//   - ID (/id)          → stub (T13 id-popup; logs)

import { type User } from "./store";
import { cclog } from "./utils";
import { getBettercc } from "./upstream";
import { actionButton } from "./dom";

let openPopup: HTMLElement | null = null;

let onOutsideClick: ((e: MouseEvent) => void) | null = null;

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
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    e.stopPropagation();
    closePopup();
  }
}

/** A popup action button: a theme-aware Font Awesome icon + a text label.
 *  The icon inherits the popup's text color (--bcc-text-raised), so it recolors
 *  with the theme — no fixed emoji that ignores the color scheme. */
function actionBtn(
  iconClass: string,
  label: string,
  title: string,
  onClick: () => void,
): HTMLButtonElement {
  const btn = actionButton({
    iconClass,
    label,
    title,
    onClick: () => {
      onClick();
      closePopup();
    },
  });
  btn.className = "bcc-popup-action";
  // Keep the popup-specific label class (matches existing code; no CSS rule
  // targets it, but the class name is part of the public DOM contract).
  const labelSpan = btn.querySelector("span");
  if (labelSpan) labelSpan.className = "bcc-popup-action-label";
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

  const header = document.createElement("div");
  header.className = "bcc-popup-header";
  header.textContent = user.name;
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

  // ID — T13
  popup.appendChild(
    actionBtn("fa-id-card", "ID", "ID von " + user.name + " anzeigen (T13)", () => {
      cclog("user popup: /id stubbed (T13) — " + user.name, "v3");
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
