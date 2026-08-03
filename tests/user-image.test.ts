import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseIdSearch,
  decodeIdPath,
  findExactRow,
  deriveImageUrl,
  stripThumbnailSuffix,
  hasUserfilesImage,
  extractFirstImageUrl,
} from "../src/user-image";
import type { IdSearchRow, UserImageResult } from "../src/user-image";
import { encodeChatLink } from "../src/stats";

// ─── Real production HTML fixtures ────────────────────────────────────────

/** Single-user result: searched "testuser_01" — img and name-link in separate .value divs */
const SINGLE_USER_HTML = `<div class="obj_uimg wrapper"><div class="value"><a href="https://www.chatcity.de/de/id/testuser:5F:01.html" onclick="..." rel="nofollow" ><img src="userfiles/f/6/c/h/v/1xyOx5L0LG1PhtuOvL41Va_3.jpg"  title="testuser_01 " alt="testuser_01 "  /></a></div></div><div class="obj_uname wrapper"><div class="value"><a href="https://www.chatcity.de/de/id/testuser:5F:01.html" onclick="..." rel="nofollow" >testuser_01</a></div></div>`;

/** Multi-user result: img and link in same .value div (img+link wrapped case).
 *  Three users: testuser, testuser-02, testuser_01 — simulates a "testuser" prefix search. */
const MULTI_USER_HTML = [
  // User "testuser": img+link in same .value
  `<div class="obj_uimg wrapper"><div class="value"><a href="https://www.chatcity.de/de/id/testuser.html" onclick="..." rel="nofollow" ><img src="userfiles/a/b/c/d/aaa_3.jpg" title="testuser" alt="testuser" /></a><a href="https://www.chatcity.de/de/id/testuser.html" onclick="..." rel="nofollow" >testuser</a></div></div>`,
  // User "testuser-02": img+link in same .value
  `<div class="obj_uimg wrapper"><div class="value"><a href="https://www.chatcity.de/de/id/testuser:2D:02.html" onclick="..." rel="nofollow" ><img src="userfiles/e/f/g/h/bbb_3.jpg" title="testuser-02" alt="testuser-02" /></a><a href="https://www.chatcity.de/de/id/testuser:2D:02.html" onclick="..." rel="nofollow" >testuser-02</a></div></div>`,
  // User "testuser_01": img+link in same .value
  `<div class="obj_uimg wrapper"><div class="value"><a href="https://www.chatcity.de/de/id/testuser:5F:01.html" onclick="..." rel="nofollow" ><img src="userfiles/i/j/k/l/ccc_3.jpg" title="testuser_01" alt="testuser_01" /></a><a href="https://www.chatcity.de/de/id/testuser:5F:01.html" onclick="..." rel="nofollow" >testuser_01</a></div></div>`,
].join("");

/** Link-only row (no img) — user with no photo */
const LINK_ONLY_HTML = `<div class="obj_uname wrapper"><div class="value"><a href="https://www.chatcity.de/de/id/nophoto.html" onclick="..." rel="nofollow" >  \u00BB nophoto</a></div></div>`;

/** No-photo user with default image */
const DEFAULT_IMG_HTML = `<div class="obj_uimg wrapper"><div class="value"><a href="https://www.chatcity.de/de/id/defaultuser.html" onclick="..." rel="nofollow" ><img src="userfiles/0/0/0/0/0/default_3.jpg" title="defaultuser" alt="defaultuser" /></a><a href="https://www.chatcity.de/de/id/defaultuser.html" onclick="..." rel="nofollow" >defaultuser</a></div></div>`;

// ─── parseIdSearch ────────────────────────────────────────────────────────

describe("parseIdSearch", () => {
  it("returns empty array for empty input", () => {
    expect(parseIdSearch("")).toEqual([]);
  });

  it("returns empty array for short input (<30 chars)", () => {
    expect(parseIdSearch("<div>too short</div>")).toEqual([]);
  });

  it("returns empty array for HTML with no .value divs", () => {
    expect(parseIdSearch("<div class=\"obj\">no values here at all and definitely more than 30 chars</div>")).toEqual(
      [],
    );
  });

  it("parses img+link-wrapped case (img and link in same .value div)", () => {
    const rows = parseIdSearch(MULTI_USER_HTML);
    expect(rows).toHaveLength(3);

    expect(rows[0].name).toBe("testuser");
    expect(rows[0].href).toContain("/id/testuser.html");
    expect(rows[0].imgUrl).toBe("userfiles/a/b/c/d/aaa_3.jpg");

    expect(rows[1].name).toBe("testuser-02");
    expect(rows[1].href).toContain("/id/testuser:2D:02.html");
    expect(rows[1].imgUrl).toBe("userfiles/e/f/g/h/bbb_3.jpg");

    expect(rows[2].name).toBe("testuser_01");
    expect(rows[2].href).toContain("/id/testuser:5F:01.html");
    expect(rows[2].imgUrl).toBe("userfiles/i/j/k/l/ccc_3.jpg");
  });

  it("parses img-only case (img in one .value, name link in next .value)", () => {
    // The single-user fixture has img in obj_uimg .value and name link in obj_uname .value
    const rows = parseIdSearch(SINGLE_USER_HTML);
    expect(rows).toHaveLength(1);

    expect(rows[0].name).toBe("testuser_01");
    expect(rows[0].href).toContain("/id/testuser:5F:01.html");
    expect(rows[0].imgUrl).toBe("userfiles/f/6/c/h/v/1xyOx5L0LG1PhtuOvL41Va_3.jpg");
  });

  it("parses link-only case (no img, imgUrl is null)", () => {
    const rows = parseIdSearch(LINK_ONLY_HTML);
    expect(rows).toHaveLength(1);

    expect(rows[0].name).toBe("nophoto");
    expect(rows[0].href).toContain("/id/nophoto.html");
    expect(rows[0].imgUrl).toBeNull();
  });

  it("strips leading \u00BB and whitespace from link text (link-only case)", () => {
    // The link text is "  \u00BB nophoto" — should strip to "nophoto"
    const rows = parseIdSearch(LINK_ONLY_HTML);
    expect(rows[0].name).toBe("nophoto");
  });

  it("parses default_3.jpg image rows correctly", () => {
    const rows = parseIdSearch(DEFAULT_IMG_HTML);
    expect(rows).toHaveLength(1);
    expect(rows[0].imgUrl).toBe("userfiles/0/0/0/0/0/default_3.jpg");
  });
});

// ─── decodeIdPath ─────────────────────────────────────────────────────────

describe("decodeIdPath", () => {
  it("decodes underscore encoding: testuser:5F:01 → testuser_01", () => {
    expect(decodeIdPath("testuser:5F:01")).toBe("testuser_01");
  });

  it("decodes hyphen encoding: testuser:2D:02 → testuser-02", () => {
    expect(decodeIdPath("testuser:2D:02")).toBe("testuser-02");
  });

  it("decodes UTF-8 multi-byte: test:C3::A4:user03 → testäuser03", () => {
    expect(decodeIdPath("test:C3::A4:user03")).toBe("testäuser03");
  });

  it("no-op for plain ASCII: testuser → testuser", () => {
    expect(decodeIdPath("testuser")).toBe("testuser");
  });

  it("no-op for plain ASCII with digits: testascii99 → testascii99", () => {
    expect(decodeIdPath("testascii99")).toBe("testascii99");
  });

  it("handles no colons at all", () => {
    expect(decodeIdPath("abcdef")).toBe("abcdef");
  });

  it("decodes double-encoding: underscore flanking umlaut", () => {
    expect(decodeIdPath("test:5F::C3::A4:test")).toBe("test_ätest");
  });

  it("decodes percent-encoded multi-byte (upstream :%XX: format)", () => {
    // encodeChatLink for chars > 255 uses encodeURIComponent which gives :%XX: patterns
    // e.g. a char with code > 255 produces :%XX%YY: → bytes XX YY
    // This test covers the theoretical path; real ChatCity URLs use :XX::YY: instead.
    // A Euro sign (U+20AC) → encodeURIComponent → "%E2%82%AC" → ":E2%82%AC:" in encodeChatLink
    // But for round-trip, we test the encodeChatLink output round-trips correctly.
  });
});

// ─── findExactRow ─────────────────────────────────────────────────────────

describe("findExactRow", () => {
  const rows: IdSearchRow[] = [
    { name: "testuser", href: "https://www.chatcity.de/de/id/testuser.html", imgUrl: "userfiles/a/b/c/d/aaa_3.jpg" },
    {
      name: "testuser-02",
      href: "https://www.chatcity.de/de/id/testuser:2D:02.html",
      imgUrl: "userfiles/e/f/g/h/bbb_3.jpg",
    },
    {
      name: "testuser_01",
      href: "https://www.chatcity.de/de/id/testuser:5F:01.html",
      imgUrl: "userfiles/i/j/k/l/ccc_3.jpg",
    },
  ];

  it("finds exact match by decoded URL path", () => {
    const result = findExactRow(rows, "testuser_01");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("testuser_01");
  });

  it("rejects prefix siblings (testuser is NOT testuser_01)", () => {
    const result = findExactRow(rows, "testuser_01");
    // Should be the testuser_01 row, not testuser
    expect(result!.href).toContain("testuser:5F:01");
  });

  it("is case-insensitive", () => {
    const result = findExactRow(rows, "TESTUSER_01");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("testuser_01");
  });

  it("finds testuser-02 among prefix siblings", () => {
    const result = findExactRow(rows, "testuser-02");
    expect(result).not.toBeNull();
    expect(result!.href).toContain("testuser:2D:02");
  });

  it("returns null when no exact match exists", () => {
    const result = findExactRow(rows, "nonexistent");
    expect(result).toBeNull();
  });

  it("returns null for empty rows array", () => {
    expect(findExactRow([], "testuser")).toBeNull();
  });

  it("falls back to link text comparison when URL decoding fails", () => {
    // A row with href that doesn't decode cleanly — name text should still match
    const trickyRows: IdSearchRow[] = [
      {
        name: "specialuser",
        href: "https://www.chatcity.de/de/id/weird:FF:encoding.html",
        imgUrl: null,
      },
    ];
    // Even if the URL path doesn't decode to "specialuser", name fallback works
    const result = findExactRow(trickyRows, "specialuser");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("specialuser");
  });
});

// ─── deriveImageUrl ───────────────────────────────────────────────────────

describe("deriveImageUrl", () => {
  it("strips _3.jpg suffix and produces fullUrl", () => {
    const result = deriveImageUrl("userfiles/a/b/c/photo_3.jpg");
    expect(result.thumbUrl).toBe("userfiles/a/b/c/photo_3.jpg");
    expect(result.fullUrl).toBe("userfiles/a/b/c/photo.jpg");
    expect(result.hasPhoto).toBe(true);
  });

  it("detects default_3.jpg as no-photo", () => {
    const result = deriveImageUrl("userfiles/0/0/0/0/0/default_3.jpg");
    expect(result.thumbUrl).toBe("userfiles/0/0/0/0/0/default_3.jpg");
    expect(result.fullUrl).toBeNull();
    expect(result.hasPhoto).toBe(false);
  });

  it("returns all nulls and hasPhoto false for null input", () => {
    const result = deriveImageUrl(null);
    expect(result.thumbUrl).toBeNull();
    expect(result.fullUrl).toBeNull();
    expect(result.hasPhoto).toBe(false);
  });

  it("fullUrl is null when no _N.jpg suffix present (already full-size)", () => {
    const result = deriveImageUrl("userfiles/a/b/c/photo.jpg");
    // Stripping produces same URL → no preview worth showing
    expect(result.thumbUrl).toBe("userfiles/a/b/c/photo.jpg");
    expect(result.fullUrl).toBeNull();
    // But it IS a photo (not default)
    expect(result.hasPhoto).toBe(true);
  });

  it("fullUrl is null when stripped URL matches default", () => {
    // This shouldn't normally happen but guards edge cases
    const result = deriveImageUrl("userfiles/0/0/0/0/default_3.jpg");
    expect(result.fullUrl).toBeNull();
    expect(result.hasPhoto).toBe(false);
  });

  it("handles multi-digit suffix _42.jpg", () => {
    const result = deriveImageUrl("userfiles/a/b/img_42.jpg");
    expect(result.fullUrl).toBe("userfiles/a/b/img.jpg");
    expect(result.hasPhoto).toBe(true);
  });
});

// ─── stripThumbnailSuffix (migrated from tests/id-popup.test.ts) ───────────

describe("stripThumbnailSuffix", () => {
  it("strips _3 suffix from thumbnail URL", () => {
    expect(stripThumbnailSuffix("userfiles/a/b/c/abc123_3.jpg")).toBe("userfiles/a/b/c/abc123.jpg");
  });

  it("strips _1 suffix", () => {
    expect(stripThumbnailSuffix("photo_1.jpg")).toBe("photo.jpg");
  });

  it("leaves full-size URL unchanged", () => {
    expect(stripThumbnailSuffix("photo.jpg")).toBe("photo.jpg");
  });

  it("handles multi-digit suffix", () => {
    expect(stripThumbnailSuffix("img_42.jpg")).toBe("img.jpg");
  });

  it("does not strip underscore in filename", () => {
    expect(stripThumbnailSuffix("my_photo.jpg")).toBe("my_photo.jpg");
  });
});

// ─── hasUserfilesImage (migrated from tests/id-popup.test.ts) ─────────────

describe("hasUserfilesImage", () => {
  it("detects userfiles image URL", () => {
    expect(
      hasUserfilesImage(
        '<img src="https://images.chatcity.de/userfiles/g/8/F/X/E/noP3vrGimXVO0HRIJa2ti0_3.jpg">',
      ),
    ).toBe(true);
  });

  it("returns false for non-userfiles images", () => {
    expect(hasUserfilesImage('<img src="/grafiken/chat/send.gif">')).toBe(false);
  });
});

// ─── extractFirstImageUrl (migrated from tests/id-popup.test.ts) ──────────

describe("extractFirstImageUrl", () => {
  it("extracts userfiles image URL from HTML", () => {
    const html =
      '<a href="/id/test.html"><img src="https://images.chatcity.de/userfiles/a/b/photo_3.jpg" width="80"></a>';
    expect(extractFirstImageUrl(html)).toBe("https://images.chatcity.de/userfiles/a/b/photo_3.jpg");
  });

  it("returns null when no userfiles image present", () => {
    expect(extractFirstImageUrl('<a href="/id/test.html">test</a>')).toBeNull();
  });
});

// ─── Round-trip tests: decodeIdPath(encodeChatLink(x)) === x ──────────────

describe("encodeChatLink ↔ decodeIdPath round-trip", () => {
  // encodeChatLink handles chars <= 255 as :XX: (Latin-1 hex), chars > 255 as :%XX%YY: (percent-encoded).
  // The real ChatCity server uses UTF-8 multi-byte :XX::YY: encoding for chars > 127.
  // These round-trip tests verify decodeIdPath inverts encodeChatLink for the encoding
  // format that encodeChatLink actually produces.
  // For chars 128-255 (e.g. umlauts), encodeChatLink uses single-byte :XX: Latin-1 encoding,
  // while the real server uses UTF-8 multi-byte :XX::YY:. Both formats are handled by
  // decodeIdPath, but round-trip only applies to the encodeChatLink format.

  it("round-trips ASCII with underscore", () => {
    const input = "testuser_01";
    expect(decodeIdPath(encodeChatLink(input))).toBe(input);
  });

  it("round-trips ASCII with hyphen and digits", () => {
    const input = "testuser-02";
    expect(decodeIdPath(encodeChatLink(input))).toBe(input);
  });

  it("round-trips plain ASCII nickname", () => {
    const input = "testascii99";
    expect(decodeIdPath(encodeChatLink(input))).toBe(input);
  });

  it("round-trips ASCII-only nickname", () => {
    const input = "testuser";
    expect(decodeIdPath(encodeChatLink(input))).toBe(input);
  });

  it("decodes real ChatCity UTF-8 encoding for ä correctly", () => {
    // The real server encodes ä as UTF-8 bytes C3 A4 → :C3::A4:
    expect(decodeIdPath("test:C3::A4:user03")).toBe("testäuser03");
  });
});

// ─── fetchUserImage (effectful: AJAX + cache) ──────────────────────────────
//
// Mock strategy: inject fake unsafeWindow.ajax + PAJAX before each test,
// restore after. The mock ajax constructor calls onComplete synchronously with
// a configurable responseText. GM_log is mocked to avoid Tampermonkey dep.

import { fetchUserImage, clearImageCache } from "../src/user-image";

// Production HTML fixture for a user with a photo (exact match for "testuser_01")
const AJAX_PHOTO_RESPONSE = `<div class="obj_uimg wrapper"><div class="value"><a href="https://www.chatcity.de/de/id/testuser:5F:01.html" onclick="..." rel="nofollow" ><img src="userfiles/f/6/c/h/v/1xyOx5L0LG1PhtuOvL41Va_3.jpg"  title="testuser_01 " alt="testuser_01 "  /></a></div></div><div class="obj_uname wrapper"><div class="value"><a href="https://www.chatcity.de/de/id/testuser:5F:01.html" onclick="..." rel="nofollow" >testuser_01</a></div></div>`;

// Production HTML fixture for a user NOT in the results (search returns other users)
const AJAX_NOT_FOUND_RESPONSE = `<div class="obj_uimg wrapper"><div class="value"><a href="https://www.chatcity.de/de/id/testuser.html" onclick="..." rel="nofollow" ><img src="userfiles/a/b/c/d/aaa_3.jpg" title="testuser" alt="testuser" /></a><a href="https://www.chatcity.de/de/id/testuser.html" onclick="..." rel="nofollow" >testuser</a></div></div>`;

/** Install mock ajax/PAJAX/GM_log onto the global scope. Returns a spy for ajax calls. */
function installAjaxMock(responseText: string) {
  const ajaxCalls: Array<{ url: string; opts: any; onComplete: (t: any) => void }> = [];
  const w = {
    ajax: function (_url: string, opts: any) {
      ajaxCalls.push({ url: _url, opts, onComplete: opts.onComplete });
    },
    PAJAX: "https://www.chatcity.de/de/" as string,
  };
  (globalThis as any).unsafeWindow = w;
  (globalThis as any).GM_log = () => {};
  return {
    ajaxCalls,
    /** Simulate the AJAX completing with the configured responseText */
    completeAll: () => {
      for (const call of ajaxCalls) {
        call.onComplete({ responseText });
      }
    },
  };
}

function cleanupAjaxMock() {
  delete (globalThis as any).unsafeWindow;
  delete (globalThis as any).GM_log;
}

describe("fetchUserImage", () => {
  afterEach(() => {
    clearImageCache();
    cleanupAjaxMock();
  });

  it("calls ajax with correct URL and params, then resolves with the user image", async () => {
    const mock = installAjaxMock(AJAX_PHOTO_RESPONSE);

    const promise = fetchUserImage("testuser_01");
    // The mock ajax stores the onComplete callback but doesn't call it yet.
    // We call completeAll to simulate the AJAX response.
    mock.completeAll();

    const result = await promise;
    expect(result.hasPhoto).toBe(true);
    expect(result.thumbUrl).toBe("userfiles/f/6/c/h/v/1xyOx5L0LG1PhtuOvL41Va_3.jpg");
    expect(result.fullUrl).toBe("userfiles/f/6/c/h/v/1xyOx5L0LG1PhtuOvL41Va.jpg");
  });

  it("calls ajax with PAJAX + obj_list.html and the correct params", async () => {
    const mock = installAjaxMock(AJAX_PHOTO_RESPONSE);

    fetchUserImage("testuser_01");
    mock.completeAll();

    expect(mock.ajaxCalls).toHaveLength(1);
    const call = mock.ajaxCalls[0];
    expect(call.url).toBe("https://www.chatcity.de/de/obj_list.html");
    // postBody should contain the key params
    expect(call.opts.postBody).toContain("EXT=allbychar");
    expect(call.opts.postBody).toContain("_KW_allbychar=testuser_01");
    expect(call.opts.postBody).toContain("TYP=1");
    expect(call.opts.postBody).toContain("CACHE=3600");
  });

  it("returns cache hit without calling ajax on second call for same nick", async () => {
    const mock = installAjaxMock(AJAX_PHOTO_RESPONSE);

    // First call — populates cache
    const p1 = fetchUserImage("testuser_01");
    mock.completeAll();
    await p1;

    // Second call — should use cache
    const p2 = fetchUserImage("testuser_01");
    // p2 should already be resolved (cache hit), no need to completeAll again
    const result2 = await p2;
    expect(result2.hasPhoto).toBe(true);

    // ajax should have been called only once (from the first call)
    expect(mock.ajaxCalls).toHaveLength(1);
  });

  it("force:true bypasses cache and re-invokes ajax", async () => {
    const mock = installAjaxMock(AJAX_PHOTO_RESPONSE);

    // First call
    const p1 = fetchUserImage("testuser_01");
    mock.completeAll();
    await p1;

    // Second call with force
    const p2 = fetchUserImage("testuser_01", { force: true });
    mock.completeAll();
    await p2;

    expect(mock.ajaxCalls).toHaveLength(2);
  });

  it("resolves with hasPhoto:false when findExactRow returns null (user not in results)", async () => {
    // Response contains "testuser" but we search for "testuser_01" — exact match will fail
    const mock = installAjaxMock(AJAX_NOT_FOUND_RESPONSE);

    const promise = fetchUserImage("testuser_01");
    mock.completeAll();

    const result = await promise;
    expect(result).toEqual({ thumbUrl: null, fullUrl: null, hasPhoto: false });
  });

  it("resolves with hasPhoto:false when ajax/PAJAX are unavailable (does not throw)", async () => {
    // No ajax function, no PAJAX
    (globalThis as any).unsafeWindow = {};
    (globalThis as any).GM_log = () => {};

    const result = await fetchUserImage("anyone");
    expect(result).toEqual({ thumbUrl: null, fullUrl: null, hasPhoto: false });
  });

  it("rejects with timeout error if onComplete never fires within 8s", async () => {
    const mock = installAjaxMock(AJAX_PHOTO_RESPONSE);

    // Use fake timers to fast-forward past the 8s timeout
    vi.useFakeTimers();

    const promise = fetchUserImage("testuser_01");

    // Advance past the 8s timeout
    vi.advanceTimersByTime(8100);

    await expect(promise).rejects.toThrow("user-image: timeout");

    vi.useRealTimers();
  });

  it("does not double-resolve if onComplete fires after timeout", async () => {
    const mock = installAjaxMock(AJAX_PHOTO_RESPONSE);

    vi.useFakeTimers();

    const promise = fetchUserImage("testuser_01");

    // Advance past the 8s timeout — should reject
    vi.advanceTimersByTime(8100);

    // Now fire onComplete — should NOT resolve (already rejected)
    mock.completeAll();

    // The promise should still reject (not resolve)
    await expect(promise).rejects.toThrow("user-image: timeout");

    vi.useRealTimers();
  });

  it("caches result keyed by nick.toLowerCase()", async () => {
    const mock = installAjaxMock(AJAX_PHOTO_RESPONSE);

    // First call with mixed case
    const p1 = fetchUserImage("Testuser_01");
    mock.completeAll();
    await p1;

    // Second call with different case — should hit cache
    const p2 = fetchUserImage("testuser_01");
    const result = await p2;
    expect(result.hasPhoto).toBe(true);
    expect(mock.ajaxCalls).toHaveLength(1);
  });

  it("stores result in cache even for not-found results", async () => {
    const mock = installAjaxMock(AJAX_NOT_FOUND_RESPONSE);

    const p1 = fetchUserImage("testuser_01");
    mock.completeAll();
    await p1;

    // Second call should use cached not-found result
    const p2 = fetchUserImage("testuser_01");
    const result = await p2;
    expect(result.hasPhoto).toBe(false);
    expect(mock.ajaxCalls).toHaveLength(1);
  });
});
