// Tests for the v3 command handler's pure core: classifyMessage (dispatch)
// and rewriteForWhisper (superwhisper message prepend).
//
// The regexes themselves are covered by the OLD commands.test.ts (18 tests)
// since they're copy-pasted verbatim from src/commands.ts. We only test the
// dispatch logic and superwhisper rewriting — both are new pure functions.
//
// The onSubmit handler + DOM send contract are untestable here (no jsdom/globals).

import { describe, it, expect } from "vitest";
import { classifyMessage, rewriteForWhisper } from "../src/v3/commands";

// ─── classifyMessage: command dispatch ──────────────────────────────────────

describe("classifyMessage — command dispatch", () => {
  it("/help → handled as help command", () => {
    expect(classifyMessage("/help")).toEqual({ handled: true, type: "help" });
    expect(classifyMessage("/HELP")).toEqual({ handled: true, type: "help" });
    expect(classifyMessage("/bettercc")).toEqual({ handled: true, type: "help" });
  });

  it("/reload → handled as reload command", () => {
    expect(classifyMessage("/reload")).toEqual({ handled: true, type: "reload" });
    expect(classifyMessage("/RELOAD")).toEqual({ handled: true, type: "reload" });
  });

  it("/open alone → handled as open-whisper (clear superwhisper)", () => {
    expect(classifyMessage("/open")).toEqual({ handled: true, type: "open-whisper" });
  });

  it("/sw nick → handled as superwhisper with extracted nick", () => {
    expect(classifyMessage("/sw Sariam")).toEqual({
      handled: true,
      type: "superwhisper",
      nick: "Sariam",
    });
    expect(classifyMessage("/superwhisper TestUser")).toEqual({
      handled: true,
      type: "superwhisper",
      nick: "TestUser",
    });
    // Only first word after /sw is the nick.
    expect(classifyMessage("/sw Multi Word")).toEqual({
      handled: true,
      type: "superwhisper",
      nick: "Multi",
    });
  });

  it("/o msg → handled as open-msg with parsed message", () => {
    expect(classifyMessage("/o Hello all")).toEqual({
      handled: true,
      type: "open-msg",
      message: "Hello all",
    });
    expect(classifyMessage("/open Hi there")).toEqual({
      handled: true,
      type: "open-msg",
      message: "Hi there",
    });
  });

  it("/sb nick → handled as superban with extracted nick (stubbed — T12)", () => {
    // classifyMessage returns superban, but the caller (mountInput) is
    // responsible for wiring bettercc.superban() or stubbing it for T8.
    expect(classifyMessage("/sb Wendigo")).toEqual({
      handled: true,
      type: "superban",
      nick: "Wendigo",
    });
    expect(classifyMessage("/superban Someone")).toEqual({
      handled: true,
      type: "superban",
      nick: "Someone",
    });
  });

  it("/id → handled as id-popup (stubbed — T13)", () => {
    expect(classifyMessage("/id")).toEqual({ handled: true, type: "id", name: "" });
    expect(classifyMessage("/id johndoe")).toEqual({ handled: true, type: "id", name: "johndoe" });
    // /id alone should yield empty name (not the "/id" string).
    expect(classifyMessage("/id")).not.toEqual({ handled: true, type: "id", name: "/id" });
  });

  it("non-command messages are not handled", () => {
    expect(classifyMessage("Hello world")).toEqual({ handled: false, message: "Hello world" });
    expect(classifyMessage("Just chatting")).toEqual({ handled: false, message: "Just chatting" });
  });

  it("/idea or /someotherthing not recognized as any command", () => {
    // /id uses \b boundary, so /idea should NOT match /id.
    const r = classifyMessage("/idea");
    expect(r.handled).toBe(false);
    expect(classifyMessage("/randomcmd")).toEqual({ handled: false, message: "/randomcmd" });
  });

  it("ignores /w and /me — pass-through to send contract", () => {
    // These are handled by the upstream send handler, not BetterCC.
    expect(classifyMessage("/w TestUser hi")).toEqual({
      handled: false,
      message: "/w TestUser hi",
    });
    expect(classifyMessage("/me waves")).toEqual({ handled: false, message: "/me waves" });
  });
});

// ─── rewriteForWhisper ──────────────────────────────────────────────────────

describe("rewriteForWhisper — superwhisper message prepend", () => {
  it("prepends /w nick when whisper is active", () => {
    expect(rewriteForWhisper("hallo", "Sariam")).toBe("/w Sariam hallo");
  });

  it("does NOT rewrite when no whisper nick is set", () => {
    expect(rewriteForWhisper("hallo", "")).toBe("hallo");
  });

  it("does NOT rewrite messages that already start with / (commands)", () => {
    expect(rewriteForWhisper("/help", "Sariam")).toBe("/help");
    expect(rewriteForWhisper("/sw NewNick", "Sariam")).toBe("/sw NewNick");
    expect(rewriteForWhisper("/w OtherUser msg", "Sariam")).toBe("/w OtherUser msg");
  });
});
