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
import { getConfig, setConfig } from "./config";
import { cclog } from "../utils";

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

function actionBtn(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "bcc-popup-action";
  btn.textContent = label;
  btn.title = title;
  btn.setAttribute("aria-label", title);
  btn.addEventListener("click", (e) => {
    e.stopPropagation(); // don't let the action click bubble to outside-click
    onClick();
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
  onTogglePin: (user: User) => void
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
    actionBtn(isPinned ? "📌 Angeheftet entfernen" : "📌 Anheften", "Benutzer anheften", () => {
      onTogglePin(user);
    })
  );

  // Superwhisper (persistent) — toggles via the exposed API
  popup.appendChild(
    actionBtn("💬 Superwhisper", "Dauerhaft an " + user.name + " flüstern", () => {
      const api = (unsafeWindow as any).bettercc;
      if (typeof api?.superwhisper === "function") api.superwhisper(user.name, false);
    })
  );

  // One-shot whisper — same GM key but we mark it transient via a flag the
  // input path already understands: setting whisper target then clearing on
  // next send is a future refinement; for now it behaves like superwhisper-on.
  popup.appendChild(
    actionBtn("📨 Flüstern (1×)", "Einmal an " + user.name + " flüstern", async () => {
      await setConfig("whisper", user.name);
      const api = (unsafeWindow as any).bettercc;
      if (typeof api?.superwhisper === "function") api.superwhisper(user.name, false);
    })
  );

  // Ignore (superban) — T12
  popup.appendChild(
    actionBtn("🚫 Ignorieren", "Benutzer ignorieren (T12)", () => {
      cclog("user popup: ignore stubbed (T12) — " + user.name, "v3");
    })
  );

  // ID — T13
  popup.appendChild(
    actionBtn("🪪 ID", "ID von " + user.name + " anzeigen (T13)", () => {
      cclog("user popup: /id stubbed (T13) — " + user.name, "v3");
    })
  );

  // Position below the anchor row.
  document.body.appendChild(popup);
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

/** True if a popup is currently open (used by tests / callers). */
export function isPopupOpen(): boolean {
  return openPopup !== null;
}

// Re-export config read so callers can seed pin state without a second import.
export { getConfig };
