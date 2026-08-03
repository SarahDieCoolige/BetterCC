import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getUserKey, setUserStore, printToChat } from "../src/utils";

describe("getUserKey", () => {
  beforeEach(() => {
    setUserStore("testuser", false);
  });

  it("suffixes the key with the lowercase nick: {key}_{user}", () => {
    // Matches the old path's hand-rolled keys ("color_" + userStore) so v3
    // reads existing users' saved data with no migration (spec §6.5, A6).
    expect(getUserKey("ban")).toBe("ban_testuser");
  });

  it("handles empty key", () => {
    expect(getUserKey("")).toBe("_testuser");
  });

  it("uses 'gast' as the user suffix when the user is a guest", () => {
    setUserStore("Anything", true);
    expect(getUserKey("color")).toBe("color_gast");
  });
});

describe("setUserStore", () => {
  it("stores lowercase nick for registered user (readable via getUserKey)", () => {
    setUserStore("Sariam", false);
    expect(getUserKey("whisper")).toBe("whisper_sariam");
  });

  it("stores 'gast' for guest users regardless of nick", () => {
    setUserStore("Guest123", true);
    expect(getUserKey("color")).toBe("color_gast");
  });
});

describe("printToChat", () => {
  // printToChat calls getChatDoc/getChatWin which access the real `document`.
  // The project tests in pure Node, so we install a minimal fake document.
  // The pattern matches the duck-typed fakes used throughout the suite.

  let fakeDoc: any;
  let fakeBody: any;
  let fakeWin: any;
  let fakeIframe: any;
  const originalDocument = globalThis.document;

  beforeEach(() => {
    fakeBody = {
      _children: [] as any[],
      appendChild(el: any) {
        this._children.push(el);
      },
      get children() {
        return this._children;
      },
      querySelectorAll(_sel: string) {
        return this._children.filter(
          (c: any) => c._className === "bcc-chat-msg",
        );
      },
      scrollHeight: 500,
      style: {} as Record<string, string>,
    };

    fakeDoc = {
      body: fakeBody,
      createElement(_tag: string) {
        return {
          _className: "",
          _innerHTML: "",
          set className(v: string) {
            this._className = v;
          },
          get className() {
            return this._className;
          },
          set innerHTML(v: string) {
            this._innerHTML = v;
          },
          get innerHTML() {
            return this._innerHTML;
          },
          get textContent() {
            return this._innerHTML.replace(/<br>/g, "");
          },
        };
      },
    };

    fakeWin = {
      _scrollY: 0,
      get scrollY() {
        return this._scrollY;
      },
      scrollTo(_x: number, y: number) {
        this._scrollY = y;
      },
    };

    fakeIframe = {
      contentDocument: fakeDoc,
      contentWindow: fakeWin,
    };

    (globalThis as any).document = {
      getElementById(id: string) {
        if (id === "chatframe") return fakeIframe;
        return null;
      },
    };
  });

  afterEach(() => {
    (globalThis as any).document = originalDocument;
  });

  it('appends a div with "BetterCC: " prefix and the message text', () => {
    printToChat("Hilfe");

    const divs = fakeBody.querySelectorAll("div.bcc-chat-msg");
    expect(divs.length).toBe(1);
    expect(divs[0].innerHTML).toContain("BetterCC: Hilfe");
  });

  it("converts newlines to <br> elements so multi-line messages render correctly", () => {
    printToChat("Zeile 1\nZeile 2");

    const divs = fakeBody.querySelectorAll("div.bcc-chat-msg");
    expect(divs.length).toBe(1);
    expect(divs[0].innerHTML).toContain("Zeile 1<br>Zeile 2");
    expect(divs[0].innerHTML).toContain("BetterCC: ");
  });

  it("is a no-op when the iframe is not present (does not throw)", () => {
    // Remove the chatframe from the fake document
    (globalThis as any).document = {
      getElementById(_id: string) {
        return null;
      },
    };

    expect(() => printToChat("anything")).not.toThrow();
  });

  it("is a no-op when getChatDoc returns a doc with no body", () => {
    fakeDoc.body = null;

    expect(() => printToChat("anything")).not.toThrow();
    expect(fakeBody._children.length).toBe(0);
  });

  it("scrolls to the bottom of the iframe after appending the message", () => {
    fakeBody.scrollHeight = 2000;
    fakeWin._scrollY = 0;

    printToChat("Hilfe");

    expect(fakeWin._scrollY).toBe(2000);
  });
});
