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
 * Decode ChatCity's colon-hex URL encoding (the inverse of `encodeChatLink`
 * in `stats.ts`, but also handles the real server's UTF-8 multi-byte format).
 *
 * Two encoding formats exist:
 * - `:XX:` (single hex byte, code <= 255) — produced by `encodeChatLink`
 * - `:%XX%YY:` (percent-encoded, code > 255) — produced by `encodeChatLink`
 *   via encodeURIComponent
 * - `:XX::YY:` (adjacent hex pairs, real server UTF-8) — produced by the
 *   actual ChatCity server for chars > 127 (e.g. ä → :C3::A4:)
 *
 * Algorithm: replace all hex byte patterns with a placeholder, collect the
 * bytes, then decode the byte sequence as UTF-8. Characters not in a hex
 * pattern pass through unchanged.
 */
export function decodeIdPath(segment: string): string {
  const bytes: number[] = [];
  // Replace hex patterns with placeholders, collecting bytes.
  // Match :XX: (raw hex) or :%XX%YY:...: (percent-encoded, encodeChatLink multi-byte).
  // Also match bare :XX: patterns that are adjacent (:: boundary handled by consuming
  // the closing : of one pair and the opening : of the next together as ::).
  const result = segment.replace(/:([0-9A-Fa-f]{2}):|(%[0-9A-Fa-f]{2})/g, (_, hexByte, pctByte) => {
    if (hexByte !== undefined) {
      bytes.push(parseInt(hexByte, 16));
    }
    if (pctByte !== undefined) {
      bytes.push(parseInt(pctByte.substring(1), 16));
    }
    return "\x00"; // placeholder for flushed byte
  });

  // Rebuild: walk the skeleton, replacing \x00 placeholders with decoded bytes.
  return rebuildWithBytes(result, bytes);
}

/** Rebuild a string by replacing \x00 placeholders with decoded bytes. */
function rebuildWithBytes(skeleton: string, bytes: number[]): string {
  let byteIdx = 0;
  let out = "";
  for (let i = 0; i < skeleton.length; i++) {
    if (skeleton.charCodeAt(i) === 0 && byteIdx < bytes.length) {
      // We can't output individual bytes yet — we need to batch consecutive
      // byte placeholders and decode them as UTF-8 as a group.
      // Count consecutive placeholders starting here.
      let count = 0;
      while (i + count < skeleton.length && skeleton.charCodeAt(i + count) === 0) {
        count++;
      }
      const group = bytes.slice(byteIdx, byteIdx + count);
      byteIdx += count;
      out += decodeByteGroup(group);
      i += count - 1; // -1 because the for loop will ++i
    } else {
      out += skeleton.charAt(i);
    }
  }
  return out;
}

/** Decode a group of bytes as UTF-8, falling back to Latin-1 for invalid sequences. */
function decodeByteGroup(bytes: number[]): string {
  if (bytes.length === 0) return "";
  try {
    const decoded = UTF8_DECODER.decode(new Uint8Array(bytes));
    // Single Latin-1 bytes (128-255) that aren't valid UTF-8 produce U+FFFD.
    // Treat them as Latin-1 codepoints instead (matches encodeChatLink behavior).
    if (decoded.includes("\uFFFD") && bytes.length === 1) {
      return String.fromCharCode(bytes[0]);
    }
    return decoded;
  } catch {
    return bytes.map((b) => String.fromCharCode(b)).join("");
  }
}

const UTF8_DECODER = new TextDecoder();

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
export function fetchUserImage(
  nick: string,
  opts?: { force?: boolean },
): Promise<UserImageResult> {
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
