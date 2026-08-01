import { describe, it, expect } from "vitest";

// Pure logic helpers extracted for testability

function stripThumbnailSuffix(url: string): string {
  // Convert _N.jpg → .jpg (thumbnail to full-size)
  return url.replace(/_(\d+)\.jpg$/i, ".jpg");
}

function hasUserfilesImage(html: string): boolean {
  return /userfiles\/.*\.jpg/i.test(html);
}

function extractFirstImageUrl(html: string): string | null {
  const match = html.match(/src="([^"]*userfiles\/[^"]*\.jpg[^"]*)"/i);
  return match ? match[1] : null;
}

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
