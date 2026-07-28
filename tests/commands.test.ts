import { describe, it, expect } from "vitest";

// Test the regex patterns used in command parsing
// These are the exact regexes from replaceOnSubmit in commands.ts

const openMsgCmdRegex = /^\/open\s|^\/o\s/;
const openMsgReplaceRegex = /^\/open\s+|^\/o\s+/gi;
const superbanMsgCmdRegex = /^\/superban\s|^\/sb\s/;
const superbanMsgReplaceRegex = /^\/superban\s+|^\/sb\s+/gi;
const superwhisperMsgCmdRegex = /^\/superwhisper\s|^\/sw\s/;
const superwhisperMsgReplaceRegex = /^\/superwhisper\s+|^\/sw\s+/gi;

describe("command regexes", () => {
  describe("open message", () => {
    it("matches /open with message", () => {
      expect(openMsgCmdRegex.test("/open Hello")).toBe(true);
      expect(openMsgCmdRegex.test("/o Hi")).toBe(true);
    });

    it("does not match bare /open", () => {
      expect(openMsgCmdRegex.test("/open")).toBe(false);
    });

    it("strips /open prefix", () => {
      expect("/open Hello world".replace(openMsgReplaceRegex, "")).toBe("Hello world");
      expect("/o Hi all".replace(openMsgReplaceRegex, "")).toBe("Hi all");
    });
  });

  describe("superban", () => {
    it("matches /sb and /superban with nick", () => {
      expect(superbanMsgCmdRegex.test("/sb wendigo")).toBe(true);
      expect(superbanMsgCmdRegex.test("/superban testuser")).toBe(true);
    });

    it("does not match bare /sb or /superban", () => {
      expect(superbanMsgCmdRegex.test("/sb")).toBe(false);
      expect(superbanMsgCmdRegex.test("/superban")).toBe(false);
    });

    it("extracts nick after command", () => {
      const msg = "/sb wendigo extra".replace(superbanMsgReplaceRegex, "").split(" ")[0];
      expect(msg).toBe("wendigo");
    });
  });

  describe("superwhisper", () => {
    it("matches /sw and /superwhisper with nick", () => {
      expect(superwhisperMsgCmdRegex.test("/sw sariam")).toBe(true);
      expect(superwhisperMsgCmdRegex.test("/superwhisper test")).toBe(true);
    });

    it("does not match bare /sw or /superwhisper", () => {
      expect(superwhisperMsgCmdRegex.test("/sw")).toBe(false);
    });

    it("extracts nick after command", () => {
      const msg = "/sw sariam extra".replace(superwhisperMsgReplaceRegex, "").split(" ")[0];
      expect(msg).toBe("sariam");
    });
  });

  describe("command boundaries", () => {
    it("case insensitive via toLowerCase on input", () => {
      // The calling code lowercases input before testing regex
      expect(superbanMsgCmdRegex.test("/SB Test".toLowerCase())).toBe(true);
      expect(superwhisperMsgCmdRegex.test("/SW Test".toLowerCase())).toBe(true);
      expect(openMsgCmdRegex.test("/O Test".toLowerCase())).toBe(true);
    });

    it("exact commands without args don't match cmd regex", () => {
      // These should NOT match the "with args" regexes
      expect(superbanMsgCmdRegex.test("/superban")).toBe(false);
      expect(superwhisperMsgCmdRegex.test("/superwhisper")).toBe(false);
    });
  });
});
