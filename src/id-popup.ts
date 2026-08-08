// ─── /id Popup — search overlay ────────────────────────────────────────────
//
// Opens on /id [name]. Shows multi-row search results with thumbnails +
// clickable names linking to ID card pages. Hover preview via photo-preview.ts.
// Singleton pattern — one popup at a time (matches popup.ts).

import type { IdSearchRow } from "./user-image";
import { fetchIdRows, evictImageCache, stripThumbnailSuffix } from "./user-image";
import { buildPreviewBox, dismissHover, dismissAllPreviews } from "./photo-preview";
import { encodeChatLink } from "./utils";
import { iconElement } from "./dom";

// ═══════════════════════════════════════════════════════════════════════════
// Pure helpers (unit-tested)
// ═══════════════════════════════════════════════════════════════════════════

/** Deduplicate search rows by href — keeps first occurrence. */
export function dedupRows(rows: IdSearchRow[]): IdSearchRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.href)) return false;
    seen.add(row.href);
    return true;
  });
}

/** Build the full ID card URL for a username. Delegates to encodeChatLink. */
export function formatIdCardUrl(name: string): string {
  return "//www.chatcity.de/de/id/" + encodeChatLink(name) + ".html";
}

export type SearchState = "loading" | "error" | "empty" | "results";

/** Classify the current search state for rendering. */
export function classifySearchState(
  rows: IdSearchRow[] | null,
  loading: boolean,
  error: boolean,
): SearchState {
  if (loading) return "loading";
  if (error) return "error";
  if (!rows || rows.length === 0) return "empty";
  return "results";
}

// ═══════════════════════════════════════════════════════════════════════════
// Popup state (singleton)
// ═══════════════════════════════════════════════════════════════════════════

let overlayEl: HTMLElement | null = null;
let documentKeydown: ((e: KeyboardEvent) => void) | null = null;

// ═══════════════════════════════════════════════════════════════════════════
// Internal helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Clear the results element and show a single state message. */
function renderState(el: HTMLElement, state: SearchState): void {
  el.innerHTML = "";
  const div = document.createElement("div");
  div.className = "bcc-id-" + state;
  if (state === "loading") div.textContent = "Wird geladen...";
  else if (state === "error") div.textContent = "Fehler beim Laden.";
  else if (state === "empty") div.textContent = "Kein Ergebnis gefunden.";
  el.appendChild(div);
}

/** Build and append result rows for a list of search results. */
function renderResults(el: HTMLElement, rows: IdSearchRow[], searchTerm: string): void {
  el.innerHTML = "";
  for (const row of rows) {
    const rowEl = document.createElement("div");
    rowEl.className = "bcc-id-row";

    if (row.imgUrl) {
      const fullUrl = stripThumbnailSuffix(row.imgUrl);
      const hasPhoto = !/default/i.test(fullUrl);
      const showPreview = hasPhoto && fullUrl !== row.imgUrl;

      const thumb = document.createElement("img");
      thumb.src = row.imgUrl;
      thumb.className = "bcc-id-thumb";
      thumb.setAttribute("alt", "");

      if (showPreview) {
        thumb.addEventListener("mouseenter", () => {
          // Pass the thumbnail's rect so the preview positions itself beside
          // the thumbnail instead of at screen center — the /id card is itself
          // centered, so a centered preview would land on top of the thumb and
          // intercept its pointer events (mouseenter/mouseleave loop).
          const rect = thumb.getBoundingClientRect();
          buildPreviewBox(fullUrl, row.name, rect, searchTerm);
        });
        thumb.addEventListener("mouseleave", () => {
          dismissHover();
        });
      }

      thumb.addEventListener("error", () => {
        thumb.style.display = "none";
        // The URL the cache held failed to load as bytes (404 / network).
        // Evict this search term's entry so the next /id search re-fetches.
        evictImageCache(searchTerm);
      });

      rowEl.appendChild(thumb);
    }

    const nameLink = document.createElement("a");
    nameLink.textContent = row.name;
    nameLink.href = formatIdCardUrl(row.name);
    nameLink.target = "_blank";
    nameLink.className = "bcc-id-name";
    nameLink.title = "ID-Card öffnen";
    rowEl.appendChild(nameLink);

    el.appendChild(rowEl);
  }
}

/** Execute a search: fetch, parse, dedup, render results or error. */
async function doSearch(name: string, resultsEl: HTMLElement): Promise<void> {
  if (!name) return;
  renderState(resultsEl, "loading");
  try {
    const rows = await fetchIdRows(name);
    const deduped = dedupRows(rows);
    if (deduped.length === 0) {
      renderState(resultsEl, "empty");
    } else {
      renderResults(resultsEl, deduped, name);
    }
  } catch {
    renderState(resultsEl, "error");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/** Close the popup if open. Safe to call when no popup exists. */
export function closeIdPopup(): void {
  if (documentKeydown) {
    document.removeEventListener("keydown", documentKeydown);
    documentKeydown = null;
  }
  dismissAllPreviews();
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
}

/** Open the /id search popup, optionally pre-filled with a name to search. */
export function buildIdPopup(initialName: string): void {
  closeIdPopup();

  const shell = document.querySelector(".bcc-shell");
  if (!shell) return;

  // ── Overlay ──
  overlayEl = document.createElement("div");
  overlayEl.className = "bcc-id-overlay";

  // ── Card ──
  const card = document.createElement("div");
  card.className = "bcc-id-card";

  // ── Header ──
  const header = document.createElement("div");
  header.className = "bcc-id-header";

  const title = document.createElement("span");
  title.textContent = "ID Suche";
  header.appendChild(title);

  const closeBtn = document.createElement("button");
  closeBtn.className = "bcc-id-close";
  closeBtn.setAttribute("aria-label", "Schließen");
  closeBtn.appendChild(iconElement("fa-xmark"));
  closeBtn.addEventListener("click", closeIdPopup);
  header.appendChild(closeBtn);

  card.appendChild(header);

  // ── Search area ──
  const searchArea = document.createElement("div");
  searchArea.className = "bcc-id-search";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Username...";
  searchInput.value = initialName;

  const searchBtn = document.createElement("button");
  // Reuse the canonical .bcc-icon-btn (transparent, 32×32, filter:brightness
  // hover) so the search button matches every other icon button in the shell
  // (close button, popup toolbar, footer pills). The type=button prevents form
  // submission; aria-label+title carry the accessible name.
  searchBtn.type = "button";
  searchBtn.className = "bcc-icon-btn";
  searchBtn.setAttribute("aria-label", "Suchen");
  searchBtn.title = "Suchen";
  searchBtn.appendChild(iconElement("fa-magnifying-glass"));

  searchArea.appendChild(searchInput);
  searchArea.appendChild(searchBtn);

  card.appendChild(searchArea);

  // ── Results area ──
  const resultsEl = document.createElement("div");
  resultsEl.className = "bcc-id-results";
  card.appendChild(resultsEl);

  // ── Assemble ──
  overlayEl.appendChild(card);
  shell.appendChild(overlayEl);

  // ── Event bindings ──
  documentKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeIdPopup();
  };
  document.addEventListener("keydown", documentKeydown);

  overlayEl.addEventListener("click", (e: MouseEvent) => {
    if (e.target === overlayEl) closeIdPopup();
  });

  // ── Search trigger ──
  const trigger = () => doSearch(searchInput.value.trim(), resultsEl);
  searchBtn.addEventListener("click", trigger);
  searchInput.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") trigger();
  });

  // ── Initial action ──
  if (initialName) {
    doSearch(initialName, resultsEl);
  } else {
    searchInput.focus();
  }
}
