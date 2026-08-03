// ─── Pure image-search functions ──────────────────────────────────────────
//
// Parse ChatCity /id/ AJAX HTML responses into image data for one specific
// user. All functions are pure (no DOM, no AJAX, no GM, no side effects)
// so they are unit-testable in vitest's default Node environment.
//
// T13's future id-popup.ts will import parseIdSearch + decodeIdPath from here.

import { cclog } from "./utils";

// ─── Interfaces ────────────────────────────────────────────────────────────

/** One row parsed from the /id/ search HTML response. */
export interface IdSearchRow {
  name: string;
  href: string;
  imgUrl: string | null;
}

/** Result of deriving thumbnail/full-size URLs from a user's image. */
export interface UserImageResult {
  thumbUrl: string | null;
  fullUrl: string | null;
  hasPhoto: boolean;
}

// ─── URL helpers (migrated from tests/id-popup.test.ts) ────────────────────

/**
 * Strip the thumbnail size suffix from a userfiles image URL.
 * Converts `_N.jpg` → `.jpg` (e.g. `photo_3.jpg` → `photo.jpg`).
 */
export function stripThumbnailSuffix(url: string): string {
  return url.replace(/_(\d+)\.jpg$/i, ".jpg");
}

/** Check whether HTML contains a userfiles image reference. */
export function hasUserfilesImage(html: string): boolean {
  return /userfiles\/.*\.jpg/i.test(html);
}

/** Extract the first userfiles image URL from HTML, or null. */
export function extractFirstImageUrl(html: string): string | null {
  const match = html.match(/src="([^"]*userfiles\/[^"]*\.jpg[^"]*)"/i);
  return match ? match[1] : null;
}

// ─── parseIdSearch ────────────────────────────────────────────────────────

/**
 * Parse the `/id/` AJAX HTML response into rows.
 *
 * Each `.value` div in the response may contain:
 * - An `<img>` tag with `src` containing `userfiles` (image)
 * - An `<a>` tag with `href` containing `/id/` (name link — text content,
 *   not the one wrapping an `<img>`)
 *
 * Three cases (ported from modernize showIdPopup):
 * 1. img && !nameLink: peek next `.value` div for the name link; if found,
 *    use it and skip the next div.
 * 2. nameLink && !img: name from link text (trimmed, leading `»` stripped);
 *    no image.
 * 3. img && nameLink: name from name link text; imgUrl from img.src.
 *
 * Uses regex-based parsing (no DOMParser) for vitest compatibility, following
 * the same pattern as `stats.ts:parseStats`.
 */
export function parseIdSearch(html: string): IdSearchRow[] {
  if (typeof html !== "string" || html.length < 30) return [];

  const rows: IdSearchRow[] = [];

  // Extract all .value div blocks (non-greedy to avoid nesting issues)
  const valueDivs = html.match(/<div\s+class="value"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi);
  if (!valueDivs) return [];

  const skipIndices = new Set<number>();

  for (let i = 0; i < valueDivs.length; i++) {
    if (skipIndices.has(i)) continue;
    const block = valueDivs[i];

    // Look for img with userfiles src
    const imgUrl = extractImgSrc(block);
    // Look for name link: <a href=".../id/...">TEXT</a> where TEXT has no nested <img>
    const nameLink = extractNameLink(block);

    const hasImg = imgUrl !== null;
    const hasNameLink = nameLink !== null;

    if (hasImg && !hasNameLink) {
      // Case 1: img only — peek next .value div for name link
      let row: IdSearchRow | null = null;
      if (i + 1 < valueDivs.length) {
        const nextLink = extractNameLink(valueDivs[i + 1]);
        if (nextLink) {
          row = {
            name: cleanLinkText(nextLink.text),
            href: nextLink.href,
            imgUrl,
          };
          skipIndices.add(i + 1);
        }
      }
      if (row) {
        rows.push(row);
      }
    } else if (!hasImg && hasNameLink) {
      // Case 2: name link only — no image
      rows.push({
        name: cleanLinkText(nameLink.text),
        href: nameLink.href,
        imgUrl: null,
      });
    } else if (hasImg && hasNameLink) {
      // Case 3: img and name link in same .value
      rows.push({
        name: cleanLinkText(nameLink.text),
        href: nameLink.href,
        imgUrl,
      });
    }
  }

  return rows;
}

/** Extract the src from an <img> tag with userfiles in the path, or null. */
function extractImgSrc(block: string): string | null {
  const match = block.match(/<img\s[^>]*src="([^"]*userfiles\/[^"]*)"[^>]*\/?>/i);
  return match ? match[1] : null;
}

/**
 * Extract a name link: an <a href=".../id/..."> whose text content does NOT
 * contain a nested <img>. Returns { href, text } or null.
 */
function extractNameLink(block: string): { href: string; text: string } | null {
  // Find all <a> tags with /id/ in href
  const linkRe = /<a\s[^>]*href="([^"]*\/id\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(block)) !== null) {
    const text = match[2];
    // Skip links whose content is an <img> tag (image wrapper links)
    if (/<img\s/i.test(text)) continue;
    return { href: match[1], text };
  }
  return null;
}

/** Trim and strip leading `»` and whitespace from link text. */
function cleanLinkText(raw: string): string {
  return raw.replace(/^\s*»\s*/, "").trim();
}

// ─── decodeIdPath ─────────────────────────────────────────────────────────

/**
 * Decode ChatCity's colon-hex URL path encoding.
 *
 * The ChatCity server encodes non-ASCII chars (and punctuation like `_` and
 * `-`) as `:XX:` hex byte pairs. Multi-byte UTF-8 sequences appear as adjacent
 * pairs (e.g. a -> `:C3::A4:`). Plain ASCII characters pass through unchanged.
 *
 * Algorithm: walk the segment character by character. When a `:XX:` hex pair
 * is detected, collect the byte; otherwise emit the character directly. At the
 * end, accumulated bytes are decoded as a single UTF-8 sequence.
 */
export function decodeIdPath(segment: string): string {
  const out: string[] = [];
  let byteRun: number[] = [];
  let i = 0;

  function flushBytes() {
    if (byteRun.length > 0) {
      out.push(new TextDecoder().decode(new Uint8Array(byteRun)));
      byteRun = [];
    }
  }

  while (i < segment.length) {
    if (segment[i] === ":" && /^:[0-9A-Fa-f]{2}:/.test(segment.slice(i))) {
      byteRun.push(parseInt(segment.slice(i + 1, i + 3), 16));
      i += 4;
    } else {
      flushBytes();
      out.push(segment[i]);
      i++;
    }
  }
  flushBytes();
  return out.join("");
}

// ─── findExactRow ─────────────────────────────────────────────────────────

/**
 * Find the row whose user IS the target (not a prefix sibling).
 *
 * Primary: decode the `/id/` path segment of `row.href` via `decodeIdPath`,
 * compare lowercased against `nick.toLowerCase()`.
 *
 * Fallback: if no URL-path match, compare the row's `name` (link text,
 * lowercased) against the nick — covers edge cases where decoding fails.
 */
export function findExactRow(rows: IdSearchRow[], nick: string): IdSearchRow | null {
  const target = nick.toLowerCase();

  // Primary: match by decoded URL path
  for (const row of rows) {
    const idSegment = extractIdSegment(row.href);
    if (idSegment !== null) {
      const decoded = decodeIdPath(idSegment);
      if (decoded.toLowerCase() === target) {
        return row;
      }
    }
  }

  // Fallback: match by link text
  for (const row of rows) {
    if (row.name.toLowerCase() === target) {
      return row;
    }
  }

  return null;
}

/**
 * Extract the path segment between `/id/` and `.html` from a href.
 * Returns null if the pattern doesn't match.
 */
function extractIdSegment(href: string): string | null {
  const match = href.match(/\/id\/([^]*?)\.html/i);
  return match ? match[1] : null;
}

// ─── deriveImageUrl ───────────────────────────────────────────────────────

/**
 * Derive thumbnail/full-size URLs and photo detection from a thumbnail URL.
 *
 * - `thumbUrl`: the original URL (or null).
 * - `fullUrl`: the stripped URL (thumbnail suffix removed), but only if it
 *   differs from thumbUrl AND doesn't match `default`.
 * - `hasPhoto`: false when thumbUrl is null OR the stripped URL matches
 *   `default` (the no-photo placeholder).
 */
export function deriveImageUrl(thumbUrl: string | null): UserImageResult {
  if (thumbUrl === null) {
    return { thumbUrl: null, fullUrl: null, hasPhoto: false };
  }

  const stripped = stripThumbnailSuffix(thumbUrl);
  const isDefault = /default/i.test(stripped);

  const fullUrl = !isDefault && stripped !== thumbUrl ? stripped : null;

  return {
    thumbUrl,
    fullUrl,
    hasPhoto: !isDefault,
  };
}

// ─── fetchUserImage (effectful: AJAX + cache) ──────────────────────────────

/** In-memory cache keyed by nick.toLowerCase(). Cleared each session. */
const cache = new Map<string, UserImageResult>();

/** Clear the image cache (test-only + manual refresh). */
export function clearImageCache(): void {
  cache.clear();
}

/** Fixed AJAX params for the ID-search endpoint (from modernize showIdPopup). */
const AJAX_PARAMS = [
  "TYP=1",
  "_EN_OBJ_ORDER_SORT_SHOW=",
  "ORD=0",
  "SORT=1",
  "START=0",
  "_LIST_WRAPPER_ID=bccid",
  "EXT=allbychar",
  "_KW_allbychar=", // index 7 — the nick is appended to this param
  "LOADDEF=3",
  "LOADDEF_EXTRA_USER=",
  "LOADDEF_EXTRA=",
  "_LIST_LINK_ALL=",
  "STYP=",
  "LOADDEF_CUSTOM=allbychar",
  "CACHE=3600",
  "OPENW=1",
  "ISCHAT=1",
];
const KW_PARAM_INDEX = 7;

const TIMEOUT_MS = 8000;

/** Empty result for no-photo / no-match / unavailable cases. */
const EMPTY_RESULT: UserImageResult = { thumbUrl: null, fullUrl: null, hasPhoto: false };

/**
 * Fetch a user's profile image via the ChatCity ID-search AJAX.
 *
 * Wraps the pure parseIdSearch → findExactRow → deriveImageUrl pipeline with
 * AJAX + in-memory cache. The popup (UI-3) calls this.
 *
 * - Cache hit (same nick, no force) → instant resolved promise.
 * - Cache miss → POST obj_list.html, parse, filter, store, resolve.
 * - Not found → resolves with `{hasPhoto:false}` (does NOT throw).
 * - Timeout (8s) or ajax constructor throw → rejects.
 */
export function fetchUserImage(nick: string, opts?: { force?: boolean }): Promise<UserImageResult> {
  const key = nick.toLowerCase();

  // Cache hit (unless force)
  if (!opts?.force && cache.has(key)) {
    return Promise.resolve(cache.get(key)!);
  }

  return new Promise<UserImageResult>((resolve, reject) => {
    try {
      const w = unsafeWindow as any;
      const ajax = w.ajax;
      const pajax = w.PAJAX;

      if (typeof ajax !== "function" || typeof pajax !== "string") {
        cclog("user-image: upstream ajax/PAJAX unavailable — returning empty result", "user-image");
        resolve(EMPTY_RESULT);
        return;
      }

      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error("user-image: timeout"));
        }
      }, TIMEOUT_MS);

      const params = AJAX_PARAMS.map((p, i) =>
        i === KW_PARAM_INDEX ? p + encodeURIComponent(nick) : p,
      ).join("&");

      new ajax(pajax + "obj_list.html", {
        postBody: params,
        onComplete: (transport: any) => {
          if (settled) return; // timeout already fired
          settled = true;
          clearTimeout(timer);
          try {
            const html = transport?.responseText ?? "";
            const rows = parseIdSearch(html);
            const row = findExactRow(rows, nick);
            const result = deriveImageUrl(row?.imgUrl ?? null);
            cache.set(key, result);
            resolve(result);
          } catch (e) {
            cclog("user-image: parse failed — " + (e as Error).message, "user-image");
            cache.set(key, EMPTY_RESULT);
            resolve(EMPTY_RESULT);
          }
        },
      });
    } catch (e) {
      // The ajax constructor itself threw (e.g. invalid args)
      reject(e);
    }
  });
}
