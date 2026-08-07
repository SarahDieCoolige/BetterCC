// ═══════════════════════════════════════════════════════════════════════════
// Multi-user photo previews — hover = temporary, click = pin/unpin
//
// Handles drag-to-pan, scroll-to-zoom, and position persistence via
// localStorage. The document-level click handler dismisses a pinned preview
// when its container is clicked (unless the user is dragging).
//
// Exports:
//   dismissPreview(userName)  — save position and remove a pinned preview
//   dismissAllPreviews()      — remove hover + all pinned previews
//   dismissHover()            — remove hover preview (only if not pinned)
//   buildPreviewBox(fullUrl, userName, anchor?) — create a preview box + track
//     as hover. anchor = the hovered element's rect; when provided (and no
//     saved position exists) the preview is placed beside it instead of at
//     screen center, so it doesn't intercept the trigger's pointer events.
//   previewByUser             — Map of pinned preview elements by username

/** Open previews keyed by username — supports multiple concurrent pinned previews. */
export const previewByUser: Map<string, HTMLElement> = new Map();
/** Saved position + size per username (localStorage key: "bcc_previews"). */
let previewSave: Record<string, { left: number; top: number; boxW: number; boxH: number }> = {};

try {
  previewSave = JSON.parse(localStorage.getItem("bcc_previews") || "{}");
} catch {
  previewSave = {};
}

function savePreviews(): void {
  try {
    localStorage.setItem("bcc_previews", JSON.stringify(previewSave));
  } catch {
    /* quota */
  }
}

// ─── Hover state ──────────────────────────────────────────────────────────

let hoverPreview: HTMLElement | null = null;

export function dismissHover(): void {
  if (!hoverPreview) return;
  // Don't remove from DOM if this box is also pinned — the click-to-pin path
  // calls dismissHover() first, then buildPreviewBox() (which sets hover),
  // then the box is added to previewByUser. The subsequent mouseleave
  // dismissHover() must not remove a pinned box.
  let isPinned = false;
  for (const el of previewByUser.values()) {
    if (el === hoverPreview) {
      isPinned = true;
      break;
    }
  }
  if (!isPinned) {
    hoverPreview.remove();
  }
  hoverPreview = null;
}

export function dismissPreview(userName: string): void {
  const box = previewByUser.get(userName);
  if (!box) return;
  previewSave[userName] = {
    left: parseFloat(box.style.left) || 0,
    top: parseFloat(box.style.top) || 0,
    boxW: box.offsetWidth,
    boxH: box.offsetHeight,
  };
  savePreviews();
  box.remove();
  previewByUser.delete(userName);
}

export function dismissAllPreviews(): void {
  dismissHover();
  for (const name of previewByUser.keys()) dismissPreview(name);
}

/** Build and return a preview box (unpinned — caller decides whether to pin).
 *
 *  `anchor` (optional): the bounding rect of the element that triggered the
 *  preview (e.g. a thumbnail). When provided AND no saved position exists for
 *  this user, the preview is placed adjacent to the anchor rather than at
 *  screen center — so it doesn't land on top of the hovered element and steal
 *  its pointer events (which would cause a mouseenter/mouseleave loop). When
 *  omitted or when a saved position exists, behavior is unchanged (centered /
 *  restored). Backward-compatible: existing 2-arg callers keep working. */
export function buildPreviewBox(
  fullUrl: string,
  userName: string,
  anchor?: { left: number; top: number; right: number; bottom: number; width: number; height: number },
): HTMLElement {
  const mount = (document.querySelector(".bcc-shell") as HTMLElement | null) ?? document.body;

  const box = document.createElement("div");
  box.className = "bcc-photo-preview";
  const initialSize = Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.55);
  let boxW = initialSize;
  let boxH = initialSize;

  const img = document.createElement("img");
  img.className = "bcc-photo-preview-img";
  img.src = fullUrl;
  img.alt = "";
  img.decoding = "async";
  box.appendChild(img);

  // Default = screen center. Saved position overrides. Anchor offsets adjacent
  // to the hovered element (only when no saved position exists) so the preview
  // doesn't cover its trigger and cause a pointer-event intercept loop.
  let cx = window.innerWidth / 2;
  let cy = window.innerHeight / 2;
  const saved = previewSave[userName];
  if (saved) {
    cx = saved.left || cx;
    cy = saved.top || cy;
    if (saved.boxW) {
      boxW = saved.boxW;
      boxH = saved.boxH;
    }
  } else if (anchor) {
    // Place the preview beside the anchor. Prefer the LEFT side (the /id card
    // is centered on screen, so left keeps the preview clear of the card and
    // away from the right viewport edge); fall back to the right only if there
    // isn't room on the left. Clamp vertically to keep it on screen. The
    // preview is centered on the anchor's vertical midpoint.
    const gap = 12;
    const centerTop = anchor.top + anchor.height / 2;
    const fitsLeft = anchor.left - gap - boxW >= 0;
    cx = fitsLeft
      ? anchor.left - gap - boxW / 2
      : Math.min(window.innerWidth - boxW / 2 - gap, anchor.right + gap + boxW / 2);
    cy = Math.max(boxH / 2 + 8, Math.min(window.innerHeight - boxH / 2 - 8, centerTop));
  }

  const updateBox = () => {
    box.style.left = cx + "px";
    box.style.top = cy + "px";
    box.style.width = boxW + "px";
    box.style.height = boxH + "px";
    box.style.transform = "translate(-50%, -50%)";
  };
  updateBox();
  mount.appendChild(box);

  let panning = false;
  let panned = false;
  let panStartX = 0;
  let panStartY = 0;
  let panOrigCX = 0;
  let panOrigCY = 0;

  box.addEventListener(
    "wheel",
    (e) => {
      if (panning) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1.1 : 0.9;
      boxW = Math.round(boxW * delta);
      boxH = Math.round(boxH * delta);
      const max = Math.max(window.innerWidth, window.innerHeight) * 3;
      boxW = Math.max(80, Math.min(max, boxW));
      boxH = Math.max(80, Math.min(max, boxH));
      updateBox();
    },
    { passive: false },
  );

  box.addEventListener("mousedown", (e) => {
    panning = true;
    panned = false;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panOrigCX = cx;
    panOrigCY = cy;
    box.style.cursor = "grabbing";
    e.preventDefault();
  });
  const onMove = (e: MouseEvent) => {
    if (!panning) return;
    cx = panOrigCX + (e.clientX - panStartX);
    cy = panOrigCY + (e.clientY - panStartY);
    const margin = 60;
    cx = Math.max(boxW / 2 - margin, Math.min(window.innerWidth - boxW / 2 + margin, cx));
    cy = Math.max(boxH / 2 - margin, Math.min(window.innerHeight - boxH / 2 + margin, cy));
    if (Math.abs(e.clientX - panStartX) > 2 || Math.abs(e.clientY - panStartY) > 2) panned = true;
    updateBox();
  };
  const onUp = () => {
    if (!panning) return;
    panning = false;
    box.style.cursor = "";
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  box.addEventListener("click", (e) => {
    if (panned) {
      e.stopPropagation();
      e.preventDefault();
    }
  });
  box.addEventListener("dblclick", () => {
    cx = window.innerWidth / 2;
    cy = window.innerHeight / 2;
    updateBox();
  });

  // Track as hover preview — dismissHover() will skip removal if the box is
  // also pinned (added to previewByUser before the next mouseleave fires).
  hoverPreview = box;

  return box;
}

// Single document-level click handler: dismiss a preview when its container is clicked
if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const box = target.closest(".bcc-photo-preview") as HTMLElement | null;
    if (!box) return;
    // Find which user this box belongs to
    for (const [name, el] of previewByUser) {
      if (el === box) {
        dismissPreview(name);
        return;
      }
    }
  });
}
