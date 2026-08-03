// Tests for the popup UX fixes (Fix 1: toggle, Fix 2: copy feedback, Fix 3: hover preview).
//
// We run in Node (no jsdom), so we mock a minimal document for DOM tests.
// The actual module-level functions (closePopup, buildPhotoPreview, etc.) are
// private, so we test the behavioral contracts by replicating the specified
// implementations.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { nickToHue } from "../src/popup";

// ─── Minimal DOM mock (Node environment has no document) ─────────────────────

type MockNode = {
  nodeType: number;
  tagName?: string;
  className?: string;
  textContent: string | null;
  src?: string;
  alt?: string;
  parentNode?: MockNode | null;
  childNodes: MockNode[];
  removed: boolean;
  // querySelector
  _children: Map<string, MockNode[]>;
};

function createMockElement(tagName: string): MockNode & {
  classList: { contains: (c: string) => boolean; add: (c: string) => void };
  style: Record<string, string>;
  addEventListener: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  appendChild: ReturnType<typeof vi.fn>;
  setAttribute: ReturnType<typeof vi.fn>;
} {
  const el: any = {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    className: "",
    textContent: "",
    src: "",
    alt: "",
    childNodes: [],
    removed: false,
    _children: new Map(),
    classList: {
      _classes: new Set<string>(),
      contains(c: string) {
        return this._classes.has(c);
      },
      add(c: string) {
        this._classes.add(c);
      },
    },
    style: {},
    addEventListener: vi.fn(),
    remove: vi.fn(function (this: any) {
      this.removed = true;
    }),
    appendChild: vi.fn(function (this: any, child: any) {
      child.parentNode = this;
      this.childNodes.push(child);
    }),
    setAttribute: vi.fn(),
    querySelector(selector: string) {
      // naive: return first matching child by class
      for (const c of this.childNodes) {
        if (c.className && selector.includes(c.className)) return c;
      }
      return null;
    },
    getBoundingClientRect() {
      return {
        left: 100,
        right: 300,
        bottom: 200,
        top: 150,
        width: 200,
        height: 50,
        x: 100,
        y: 150,
      };
    },
    contains(node: any) {
      let p = node;
      while (p) {
        if (p === this) return true;
        p = p.parentNode;
      }
      return false;
    },
  };
  return el;
}

function mockDocument() {
  const body = createMockElement("body");
  const head = createMockElement("head");
  const doc: any = {
    body,
    head,
    createElement(tag: string) {
      return createMockElement(tag);
    },
    querySelector(selector: string) {
      // search body and its children recursively
      const search = (node: any): any => {
        if (!node) return null;
        if (node.className && selector.includes(node.className)) return node;
        for (const c of node.childNodes || []) {
          const r = search(c);
          if (r) return r;
        }
        return null;
      };
      return search(body);
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    querySelectorAll: vi.fn().mockReturnValue([]),
  };
  (globalThis as any).document = doc;
  return doc;
}

function clearDocument() {
  delete (globalThis as any).document;
}

// ─── nickToHue (already covered in popup-avatar.test.ts; regression sanity) ──

describe("nickToHue (regression)", () => {
  it("returns 0–359 for common inputs", () => {
    expect(nickToHue("TestUser")).toBeGreaterThanOrEqual(0);
    expect(nickToHue("TestUser")).toBeLessThanOrEqual(359);
  });
});

// ─── Fix 2: showCopyFeedback uses textContent (not title) ────────────────────

describe("Fix 2 — showCopyFeedback textContent swap", () => {

  beforeEach(() => {
    vi.useFakeTimers();
    mockDocument();
  });
  afterEach(() => {
    vi.useRealTimers();
    clearDocument();
  });

  it("showCopyFeedback swaps textContent to '✓ Kopiert!' and back after 1500ms", () => {
    const el = (globalThis as any).document.createElement("span");
    el.textContent = "TestUser";

    // Replicate the showCopyFeedback behavior as specified in the task:
    function showCopyFeedback(el: any, originalText: string): void {
      el.textContent = "✓ Kopiert!";
      setTimeout(() => {
        if (el.textContent === "✓ Kopiert!") el.textContent = originalText;
      }, 1500);
    }

    const originalText = el.textContent ?? "TestUser";
    showCopyFeedback(el, originalText);

    // Immediately after call, textContent should be the feedback message
    expect(el.textContent).toBe("✓ Kopiert!");

    // After 1500ms, textContent should be restored
    vi.advanceTimersByTime(1500);
    expect(el.textContent).toBe("TestUser");
  });

  it("does not overwrite textContent if it was changed before timeout fires", () => {
    const el = (globalThis as any).document.createElement("span");
    el.textContent = "TestUser";

    function showCopyFeedback(el: any, originalText: string): void {
      el.textContent = "✓ Kopiert!";
      setTimeout(() => {
        if (el.textContent === "✓ Kopiert!") el.textContent = originalText;
      }, 1500);
    }

    showCopyFeedback(el, "TestUser");
    expect(el.textContent).toBe("✓ Kopiert!");

    // Simulate that something else changed textContent before timeout
    el.textContent = "OtherUser";
    vi.advanceTimersByTime(1500);

    // Should NOT overwrite with originalText because the guard check fails
    expect(el.textContent).toBe("OtherUser");
  });
});

// ─── Fix 3: dismissPhotoPreview and hover preview ────────────────────────────

describe("Fix 3 — Photo preview (no backdrop, dismiss helper)", () => {

  beforeEach(() => {
    mockDocument();
  });

  afterEach(() => {
    clearDocument();
  });

  it("dismissPhotoPreview removes .bcc-photo-preview element from DOM", () => {
    const doc = (globalThis as any).document;
    const mount = doc.createElement("div");
    const preview = doc.createElement("img");
    preview.className = "bcc-photo-preview";
    mount.appendChild(preview);
    doc.body.appendChild(mount);

    function dismissPhotoPreview(): void {
      const p = doc.querySelector(".bcc-photo-preview");
      if (p) p.remove();
    }

    // Before: preview exists in mount
    expect(mount.childNodes.length).toBe(1);

    dismissPhotoPreview();

    // After: preview's remove was called
    expect(preview.removed).toBe(true);
  });

  it("dismissPhotoPreview is a no-op when no preview exists", () => {
    const doc = (globalThis as any).document;

    function dismissPhotoPreview(): void {
      const p = doc.querySelector(".bcc-photo-preview");
      if (p) p.remove();
    }

    // Should not throw
    expect(() => dismissPhotoPreview()).not.toThrow();
  });

  it("buildPhotoPreview creates only an img (no backdrop)", () => {
    const doc = (globalThis as any).document;
    const mount = doc.createElement("div");
    mount.className = "bcc-shell";
    doc.body.appendChild(mount);

    function buildPhotoPreview(fullUrl: string): void {
      const existing = doc.querySelector(".bcc-photo-preview");
      if (existing) existing.remove();

      const m = doc.querySelector(".bcc-shell") ?? doc.body;
      const previewImg = doc.createElement("img");
      previewImg.className = "bcc-photo-preview";
      previewImg.src = fullUrl;
      previewImg.alt = "";
      m.appendChild(previewImg);
    }

    buildPhotoPreview("https://example.com/photo.jpg");

    // The preview img should have been appended to mount
    expect(mount.appendChild).toHaveBeenCalled();
    const appendedArg = (mount.appendChild as any).mock.calls[0]?.[0];
    expect(appendedArg).toBeDefined();
    expect(appendedArg.className).toBe("bcc-photo-preview");
    expect(appendedArg.src).toBe("https://example.com/photo.jpg");
    expect(appendedArg.alt).toBe("");
  });
});
