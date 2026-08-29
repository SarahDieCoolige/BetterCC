// Tests for the pure core of the Anwesende modal (src/aw-modal.ts). The core
// turns a globalUserlist snapshot + diff into a sectioned model and a filtered
// view; DOM wiring lives in the impure half of the module and is covered in
// the dev replica, not here.

import { describe, it, expect } from "vitest";
import { buildAwModel, applyFilter, formatStand } from "../src/aw-modal";
import type { User, UserWithChannel } from "../src/store";
import type { GlobalDiff } from "../src/global-userlist";

// Helper factories — placeholder names only, never real usernames.
const mkUser = (name: string, extra: Partial<User> = {}): User => ({
  name,
  key: name.toLowerCase(),
  registered: false,
  guest: false,
  sep: false,
  away: false,
  ...extra,
});

const mkDiffEntry = (name: string, channel: string): UserWithChannel => ({
  user: mkUser(name),
  channel,
});

const channelsOf = (...entries: [string, User[]][]): Map<string, User[]> => new Map(entries);

const EMPTY_DIFF: GlobalDiff = { added: [], removed: [] };

// ─── buildAwModel ────────────────────────────────────────────────────────────

describe("buildAwModel — snapshot + diff → sectioned model", () => {
  it("sections follow Map insertion order, rows keep user order, total sums live rows", () => {
    const channels = channelsOf(
      ["Erotik", [mkUser("Alpha"), mkUser("Beta")]],
      ["MOD", [mkUser("Gamma")]],
    );
    const model = buildAwModel(channels, EMPTY_DIFF, {});
    expect(model.sections.map((s) => s.channel)).toEqual(["Erotik", "MOD"]);
    expect(model.sections[0].rows.map((r) => r.name)).toEqual(["Alpha", "Beta"]);
    expect(model.sections[1].rows.map((r) => r.name)).toEqual(["Gamma"]);
    expect(model.total).toBe(3);
  });

  it("flags diff.added rows as joined in their channel's section", () => {
    const channels = channelsOf(["Erotik", [mkUser("Alpha")]], ["MOD", [mkUser("Beta")]]);
    const diff: GlobalDiff = { added: [mkDiffEntry("Beta", "MOD")], removed: [] };
    const model = buildAwModel(channels, diff, {});
    const erotik = model.sections.find((s) => s.channel === "Erotik")!;
    const mod = model.sections.find((s) => s.channel === "MOD")!;
    expect(mod.rows[0].transient).toBe("joined");
    expect(erotik.rows[0].transient).toBeNull();
  });

  it("diff.removed users become ghosts after the live rows of their old channel; totals ignore them", () => {
    const channels = channelsOf(["Erotik", [mkUser("Alpha")]]);
    const diff: GlobalDiff = { added: [], removed: [mkDiffEntry("Beta", "Erotik")] };
    const model = buildAwModel(channels, diff, {});
    const s = model.sections[0];
    expect(s.rows.map((r) => r.name)).toEqual(["Alpha"]);
    expect(s.ghosts).toEqual([{ name: "Beta", key: "beta", transient: null, ghost: true }]);
    expect(s.total).toBe(1);
    expect(model.total).toBe(1);
  });

  it("a removed user from a vanished channel gets a trailing section holding just the ghost", () => {
    const channels = channelsOf(["MOD", [mkUser("Gamma")]]);
    const diff: GlobalDiff = { added: [], removed: [mkDiffEntry("Beta", "Erotik")] };
    const model = buildAwModel(channels, diff, {});
    expect(model.sections.map((s) => s.channel)).toEqual(["MOD", "Erotik"]);
    const ghostSection = model.sections[1];
    expect(ghostSection.rows).toEqual([]);
    expect(ghostSection.ghosts).toEqual([
      { name: "Beta", key: "beta", transient: null, ghost: true },
    ]);
    expect(ghostSection.total).toBe(0);
    expect(model.total).toBe(1);
  });

  it("a channel mover shows as a ghost in the old channel and a joined row in the new one", () => {
    const channels = channelsOf(["Erotik", []], ["MOD", [mkUser("Alpha")]]);
    const diff: GlobalDiff = {
      added: [mkDiffEntry("Alpha", "MOD")],
      removed: [mkDiffEntry("Alpha", "Erotik")],
    };
    const model = buildAwModel(channels, diff, {});
    const erotik = model.sections.find((s) => s.channel === "Erotik")!;
    const mod = model.sections.find((s) => s.channel === "MOD")!;
    expect(erotik.rows).toEqual([]);
    expect(erotik.ghosts).toEqual([{ name: "Alpha", key: "alpha", transient: null, ghost: true }]);
    expect(mod.rows).toEqual([{ name: "Alpha", key: "alpha", transient: "joined", ghost: false }]);
    expect(model.total).toBe(1);
  });

  it("mountRender suppresses ghosts and joined flags: a cold open must not flash green", () => {
    const channels = channelsOf(["Erotik", [mkUser("Alpha")]], ["MOD", [mkUser("Beta")]]);
    const diff: GlobalDiff = {
      added: [mkDiffEntry("Alpha", "Erotik")],
      removed: [mkDiffEntry("Beta", "MOD")],
    };
    const model = buildAwModel(channels, diff, { mountRender: true });
    expect(model.total).toBe(2);
    for (const s of model.sections) {
      expect(s.ghosts).toEqual([]);
      for (const r of s.rows) expect(r.transient).toBeNull();
    }
  });

  it("prevEmpty suppresses ghosts and joined flags the same way", () => {
    const channels = channelsOf(["Erotik", [mkUser("Alpha")]], ["MOD", [mkUser("Beta")]]);
    const diff: GlobalDiff = {
      added: [mkDiffEntry("Alpha", "Erotik")],
      removed: [mkDiffEntry("Beta", "MOD")],
    };
    const model = buildAwModel(channels, diff, { prevEmpty: true });
    expect(model.total).toBe(2);
    for (const s of model.sections) {
      expect(s.ghosts).toEqual([]);
      for (const r of s.rows) expect(r.transient).toBeNull();
    }
  });

  it("diff null behaves like a mount render: no ghosts, no flags", () => {
    const channels = channelsOf(["Erotik", [mkUser("Alpha"), mkUser("Beta")]]);
    const model = buildAwModel(channels, null, {});
    expect(model.total).toBe(2);
    for (const s of model.sections) {
      expect(s.ghosts).toEqual([]);
      for (const r of s.rows) expect(r.transient).toBeNull();
    }
  });

  it("an empty diff produces no ghosts and no flags", () => {
    const channels = channelsOf(["Erotik", [mkUser("Alpha"), mkUser("Beta")]]);
    const model = buildAwModel(channels, EMPTY_DIFF, {});
    expect(model.total).toBe(2);
    for (const s of model.sections) {
      expect(s.ghosts).toEqual([]);
      for (const r of s.rows) expect(r.transient).toBeNull();
    }
  });
});

// ─── applyFilter ─────────────────────────────────────────────────────────────

describe("applyFilter — nick substring → filtered view", () => {
  // Erotik: Tester95 + Bob live, OldTester just left (ghost); MOD: Chris live.
  const buildTestModel = (): ReturnType<typeof buildAwModel> =>
    buildAwModel(
      channelsOf(["Erotik", [mkUser("Tester95"), mkUser("Bob")]], ["MOD", [mkUser("Chris")]]),
      { added: [], removed: [mkDiffEntry("OldTester", "Erotik")] },
      {},
    );

  it("empty and whitespace-only queries return the full view with matched === total", () => {
    const model = buildTestModel();
    for (const query of ["", "   "]) {
      const view = applyFilter(model, query);
      expect(view.sections).toHaveLength(2);
      expect(view.matched).toBe(model.total);
      expect(view.total).toBe(model.total);
    }
  });

  it("matches case-insensitively as a substring of the display nick", () => {
    const model = buildTestModel();
    const view = applyFilter(model, "test");
    expect(view.sections).toHaveLength(1);
    expect(view.sections[0].rows.map((r) => r.name)).toEqual(["Tester95"]);
    expect(view.matched).toBe(1);
  });

  it("drops a section whose live rows all filter out, even when a ghost matches", () => {
    // The ghost's nick matches "test", but ghosts never keep a section alive.
    const model = buildAwModel(
      channelsOf(["Erotik", [mkUser("Bob")]], ["MOD", [mkUser("Tester95")]]),
      { added: [], removed: [mkDiffEntry("TesterOld", "Erotik")] },
      {},
    );
    const view = applyFilter(model, "test");
    expect(view.sections.map((s) => s.channel)).toEqual(["MOD"]);
    expect(view.matched).toBe(1);
  });

  it("ghosts filter by nick like rows but never count into matched", () => {
    const model = buildAwModel(
      channelsOf(["Erotik", [mkUser("Tester95")]]),
      { added: [], removed: [mkDiffEntry("OldTester", "Erotik")] },
      {},
    );
    const view = applyFilter(model, "tester");
    expect(view.sections).toHaveLength(1);
    expect(view.sections[0].rows.map((r) => r.name)).toEqual(["Tester95"]);
    expect(view.sections[0].ghosts.map((g) => g.name)).toEqual(["OldTester"]);
    expect(view.matched).toBe(1);
    expect(view.total).toBe(1);
  });

  it("matched counts visible live rows across sections while total stays the model total; sections keep only visible rows", () => {
    const model = buildAwModel(
      channelsOf(["Erotik", [mkUser("Tester95"), mkUser("Bob")]], ["MOD", [mkUser("Berta")]]),
      { added: [], removed: [mkDiffEntry("Bobby", "Erotik")] },
      {},
    );
    const view = applyFilter(model, "b");
    // Bobby is a ghost: visible in the Erotik section but not counted.
    expect(view.matched).toBe(2); // Bob + Berta
    expect(view.total).toBe(3); // Tester95 + Bob + Berta
    expect(view.sections.map((s) => s.channel)).toEqual(["Erotik", "MOD"]);
    expect(view.sections[0].rows.map((r) => r.name)).toEqual(["Bob"]);
    expect(view.sections[0].ghosts.map((g) => g.name)).toEqual(["Bobby"]);
  });
});

// ─── formatStand ─────────────────────────────────────────────────────────────

describe("formatStand — timestamp footer", () => {
  it('renders "Stand: HH:MM" zero-padded in 24h format', () => {
    expect(formatStand(new Date(2026, 7, 29, 9, 5))).toBe("Stand: 09:05");
    expect(formatStand(new Date(2026, 7, 29, 14, 30))).toBe("Stand: 14:30");
  });
});
