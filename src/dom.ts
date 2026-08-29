// ─── DOM element factories (shared) ────────────────────────────────────────
//
// Tiny builders for the button + icon patterns repeated across footer, popup,
// and sidebar, plus the initials avatar shared by the user popup and the /id
// search list. Centralizing them means the aria conventions (aria-label on
// buttons, aria-hidden on decorative icons) and the Font Awesome class prefix
// live in one place.

/**
 * Build a Font Awesome icon element: `<i class="fas {cls}" aria-hidden="true">`.
 * Decorative icons get aria-hidden so screen readers skip them (the button's
 * aria-label carries the accessible name).
 */
export function iconElement(cls: string): HTMLElement {
  const i = document.createElement("i");
  i.className = "fas " + cls;
  i.setAttribute("aria-hidden", "true");
  return i;
}

/**
 * Build a button with title + aria-label + an optional leading icon + an
 * optional text label. Clicks call `onClick` after stopPropagation (so the
 * click doesn't bubble to a popup's outside-click listener).
 *
 * Returns the button; the caller attaches it and may add extra classes/styles.
 */
export function actionButton(opts: {
  iconClass?: string;
  label?: string;
  title: string;
  onClick: () => void;
}): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.title = opts.title;
  btn.setAttribute("aria-label", opts.title);
  if (opts.iconClass) btn.appendChild(iconElement(opts.iconClass));
  if (opts.label) {
    const text = document.createElement("span");
    text.className = "bcc-action-label";
    text.textContent = opts.label;
    btn.appendChild(text);
  }
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    opts.onClick();
  });
  return btn;
}

// ─── Initials avatar ───────────────────────────────────────────────────────

/**
 * Stable HSL hue (0–359) derived from a username, for initial-letter
 * avatars.
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

/**
 * Build an initials avatar: the nick's first letter on a deterministic
 * background hue. The fallback shown whenever a user has no photo (the user
 * popup keeps it under the photo until one loads; /id rows show it instead
 * of upstream's default placeholder graphic).
 *
 * Base class is the 56px popup scale; callers at other scales add a size
 * variant class on the returned element (bcc-id-avatar for 48px rows).
 */
export function buildAvatar(nick: string): HTMLElement {
  const avatar = document.createElement("div");
  avatar.className = "bcc-popup-avatar";
  avatar.textContent = nick[0]?.toUpperCase() ?? "?";
  avatar.style.background = "hsl(" + nickToHue(nick) + ", 45%, 55%)";
  return avatar;
}
