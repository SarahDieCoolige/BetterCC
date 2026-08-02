// Vitest global setup — runs before all test files.
//
// Production loads tinycolor2 via CDN @require (the UMD wrapper assigns the
// factory to window.tinycolor). Source files (scheme-v1.ts, scheme-v2.ts)
// reference the bare `tinycolor` global. In Node/Vitest there's no CDN, so we
// assign the npm package to globalThis here — one place, all tests.
import tinycolorFactory from "tinycolor2";
(globalThis as any).tinycolor = tinycolorFactory;
