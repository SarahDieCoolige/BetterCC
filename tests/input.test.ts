// Tests for the input send-path decision logic (spec §3.2 / T8 review I2).
//
// doSubmit() in input.ts ties classifyMessage + rewriteForWhisper + the send
// contract together. That integration was untested — which is how C1 (the
// /o-under-superwhisper bug) slipped through. prepareMessage() is the pure
// decision extracted from doSubmit: given the raw message and the active
// whisper nick, it returns whether to send, what to send, or whether a
// command consumed the message (with no send).

import { describe, it, expect } from "vitest";
import { prepareMessage, shouldSendOnEnter, sendBlocked } from "../src/input";
import type { ConnState } from "../src/health-core";

describe("prepareMessage — plain messages", () => {
  it("sends a non-command message as-is when no whisper is active", () => {
    expect(prepareMessage("hallo welt", "")).toEqual({
      action: "send",
      message: "hallo welt",
    });
  });

  it("rewrites a non-command message to /w when a whisper nick is active", () => {
    expect(prepareMessage("hallo", "Sariam")).toEqual({
      action: "send",
      message: "/w Sariam hallo",
    });
  });
});

describe("prepareMessage — commands that clear the input (no send)", () => {
  it("/help → handled, no send", () => {
    expect(prepareMessage("/help", "")).toEqual({ action: "handled", clear: true });
    expect(prepareMessage("/help", "Sariam")).toEqual({ action: "handled", clear: true });
  });

  it("/reload → handled, no send", () => {
    expect(prepareMessage("/reload", "")).toEqual({ action: "handled", clear: true });
  });

  it("/open alone → handled (clears superwhisper), no send", () => {
    expect(prepareMessage("/open", "Sariam")).toEqual({ action: "handled", clear: true });
  });

  it("/sw nick → handled (sets superwhisper), no send", () => {
    expect(prepareMessage("/sw Sariam", "SomeoneElse")).toEqual({
      action: "handled",
      clear: true,
    });
  });

  it("/sb nick → handled (stubbed T12), no send", () => {
    expect(prepareMessage("/sb Wendigo", "")).toEqual({ action: "handled", clear: true });
  });

  it("/id → handled (stubbed T13), no send", () => {
    expect(prepareMessage("/id", "")).toEqual({ action: "handled", clear: true });
    expect(prepareMessage("/id johndoe", "")).toEqual({ action: "handled", clear: true });
  });
});

describe("prepareMessage — /o (send-to-all) is the whisper escape hatch", () => {
  // C1 regression: /o must NOT be whisper-rewritten even when superwhisper is
  // active. The whole point of /o is "send this to everyone, ignoring whisper."
  it("/o msg sends the stripped message to ALL, ignoring active whisper", () => {
    expect(prepareMessage("/o Hi everyone", "Sariam")).toEqual({
      action: "send",
      message: "Hi everyone",
    });
  });

  it("/open msg sends the stripped message to ALL, ignoring active whisper", () => {
    expect(prepareMessage("/open Hi all", "Sariam")).toEqual({
      action: "send",
      message: "Hi all",
    });
  });

  it("/o with no whisper active also works (strips prefix, sends)", () => {
    expect(prepareMessage("/o Hello", "")).toEqual({
      action: "send",
      message: "Hello",
    });
  });
});

describe("shouldSendOnEnter — invert-the-modifier rule", () => {
  // The flag picks which key combination means "send". Enter is always the
  // default action; Shift+Enter is the non-default. The flag just chooses
  // which maps to send vs. newline.
  it("flag=true, no shift → true (default: Enter sends)", () => {
    expect(shouldSendOnEnter(true, false)).toBe(true);
  });

  it("flag=true, shift → false (default: Shift+Enter = newline)", () => {
    expect(shouldSendOnEnter(true, true)).toBe(false);
  });

  it("flag=false, shift → true (inverted: Shift+Enter sends)", () => {
    expect(shouldSendOnEnter(false, true)).toBe(true);
  });

  it("flag=false, no shift → false (inverted: Enter = newline)", () => {
    expect(shouldSendOnEnter(false, false)).toBe(false);
  });
});

describe("prepareMessage — explicit whisper pass-through", () => {
  it("an explicit /w message is sent as-is even with superwhisper active", () => {
    // The user typed a manual /w — respect it, don't double-wrap.
    expect(prepareMessage("/w OtherUser hi", "Sariam")).toEqual({
      action: "send",
      message: "/w OtherUser hi",
    });
  });

  it("an explicit /me is sent as-is (away-timer reset handled by upstream)", () => {
    expect(prepareMessage("/me waves", "Sariam")).toEqual({
      action: "send",
      message: "/me waves",
    });
  });
});

// ─── sendBlocked (T8 pt4): hard gate while conn is not established ────────

describe("sendBlocked", () => {
  it("connecting blocks sending", () => {
    const conn: ConnState = {
      phase: "connecting",
      attempt: 1,
      since: 1,
      lastMessageAt: 0,
    };
    expect(sendBlocked(conn)).toBe(true);
  });

  it("authdead blocks sending", () => {
    const conn: ConnState = {
      phase: "authdead",
      attempt: 0,
      since: 1,
      lastMessageAt: 0,
    };
    expect(sendBlocked(conn)).toBe(true);
  });

  it("connected allows sending", () => {
    const conn: ConnState = {
      phase: "connected",
      attempt: 0,
      since: 1,
      lastMessageAt: 1,
    };
    expect(sendBlocked(conn)).toBe(false);
  });
});
