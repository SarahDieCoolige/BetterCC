import { describe, it, expect } from "vitest";
import { clampPreviewPosition } from "../src/popup";

// ─── clampPreviewPosition: pure viewport-clamping math ──────────────────

describe("clampPreviewPosition", () => {
  const VIEWPORT = { width: 1920, height: 1080 };
  const IMG = { width: 320, height: 400 };

  it("places preview to the right of cursor by default", () => {
    const result = clampPreviewPosition(
      500, 500, // cursor in the middle
      IMG.width, IMG.height,
      VIEWPORT.width, VIEWPORT.height,
    );
    expect(result.left).toBe(516); // 500 + 16
    expect(result.top).toBe(425);  // 500 - 75
  });

  it("flips preview to the LEFT when cursor is near right edge", () => {
    // cursor at 1880, image is 320 wide
    // right side: 1880 + 16 + 320 = 2216 > 1912 (1920-8) -> flip
    const result = clampPreviewPosition(
      1880, 500,
      IMG.width, IMG.height,
      VIEWPORT.width, VIEWPORT.height,
    );
    expect(result.left).toBe(1544); // 1880 - 320 - 16
    expect(result.top).toBe(425);    // 500 - 75 (unaffected)
  });

  it("clamps to minimum left when cursor AND flipped position are off-screen left", () => {
    // cursor at 100, image is 500 wide (very wide)
    // right: 100 + 16 + 500 = 616 > 1912? No -> stays right
    // But let's test a narrow viewport where right overflows AND left flip fails
    const result = clampPreviewPosition(
      100, 500,
      500, 400,
      400, 800, // narrow viewport
    );
    // right: 100 + 16 + 500 = 616 > 392 (400-8) -> flip
    // flip left: 100 - 500 - 16 = -416 < 8 -> clamp to 8
    expect(result.left).toBe(8);
    expect(result.top).toBe(392); // 800 - 400 - 8 (bottom-clamped)
  });

  it("clamps to minimum top when cursor is near top edge", () => {
    const result = clampPreviewPosition(
      500, 50, // cursor near top
      IMG.width, IMG.height,
      VIEWPORT.width, VIEWPORT.height,
    );
    expect(result.left).toBe(516); // unaffected
    expect(result.top).toBe(8);     // 50 - 75 = -25 < 8 -> clamp to 8
  });

  it("clamps to maximum top when cursor is near bottom edge", () => {
    // top = 1000 - 75 = 925; bottom = 925 + 400 = 1325 > 1072 (1080-8) -> clamp
    const result = clampPreviewPosition(
      500, 1000,
      IMG.width, IMG.height,
      VIEWPORT.width, VIEWPORT.height,
    );
    expect(result.left).toBe(516);
    expect(result.top).toBe(672); // 1080 - 400 - 8
  });

  it("uses fallback dimensions when width/height are 0", () => {
    const result = clampPreviewPosition(
      1900, 1060,
      0, 0, // not yet laid out
      VIEWPORT.width, VIEWPORT.height,
    );
    // right: 1900 + 16 + 320 = 2236 > 1912 -> flip
    // flip left: 1900 - 320 - 16 = 1564
    expect(result.left).toBe(1564);
    // bottom: (1060-75) + 400 = 1385 > 1072 -> clamp
    expect(result.top).toBe(672); // 1080 - 400 - 8
  });

  it("handles small viewport where everything overflows", () => {
    const result = clampPreviewPosition(
      50, 50,
      800, 900,
      200, 200, // tiny viewport
    );
    expect(result.left).toBe(8);
    expect(result.top).toBe(8);
  });
});
