// ─── Anwesende modal: pure core ───────────────────────────────────────────
//
// Site-wide "Anwesende" overview: every user online, grouped by channel,
// built from the globalUserlist snapshot (aw.js, channels Map). The last poll
// diff drives the transient layer: freshly joined users get a "joined" flag,
// leavers survive one render as ghost rows in their old channel.
// This half is pure: no DOM, no store reads. The impure half (mount, render,
// search wiring) is appended below the divider by the UI task.
// Spec: specs/aw-overview.md

import type { User } from "./store";
import type { GlobalDiff } from "./global-userlist";

// ═══════════════════════════════════════════════════════════════════════════
// Pure core (unit-tested)
// ═══════════════════════════════════════════════════════════════════════════

/** One line in a section: a live user or a ghost. */
export interface AwRow {
  /** Display nick (guest ^id stripped upstream by parseAw). */
  name: string;
  /** User.key */
  key: string;
  transient: "joined" | null;
  ghost: boolean;
}

/** One channel block. */
export interface AwSection {
  channel: string;
  /** Live users, aw.js order; ghosts NOT included. */
  rows: AwRow[];
  /** Leavers from diff.removed, old channel. */
  ghosts: AwRow[];
  /** rows.length; ghosts never count. */
  total: number;
}

export interface AwModel {
  /** Channels in aw.js (Map) order. */
  sections: AwSection[];
  /** All live rows across sections. */
  total: number;
}

export interface AwView {
  /** Only sections with >= 1 visible live row, filtered rows/ghosts. */
  sections: AwSection[];
  /** Visible live rows; ghosts never count. */
  matched: number;
  /** AwModel.total */
  total: number;
}

/**
 * Build the sectioned model from a snapshot + the last poll diff. Sections
 * follow the channels Map (aw.js) order; ghosts land after the live rows of
 * their old channel, and a leaver from a vanished channel still gets a
 * section, appended at the end.
 *
 * Cold open: on a mount render, or when the previous snapshot was empty, the
 * diff is "everyone joined / everyone left" and carries no news. Suppressing
 * it keeps the first paint from flashing green and ghost-red.
 */
export function buildAwModel(
  channels: Map<string, User[]>,
  diff: GlobalDiff | null,
  opts: { mountRender?: boolean; prevEmpty?: boolean },
): AwModel {
  const cold = diff === null || opts.mountRender === true || opts.prevEmpty === true;

  // Per-channel set of freshly joined keys, for the "joined" flag.
  const joined = new Map<string, Set<string>>();
  if (!cold) {
    for (const { user, channel } of diff.added) {
      let keys = joined.get(channel);
      if (!keys) {
        keys = new Set();
        joined.set(channel, keys);
      }
      keys.add(user.key);
    }
  }

  const sections: AwSection[] = [];
  const byChannel = new Map<string, AwSection>();
  // Existing section, or a new one appended at the end (vanished channels).
  const sectionFor = (channel: string): AwSection => {
    let s = byChannel.get(channel);
    if (!s) {
      s = { channel, rows: [], ghosts: [], total: 0 };
      byChannel.set(channel, s);
      sections.push(s);
    }
    return s;
  };

  for (const [channel, users] of channels) {
    const s = sectionFor(channel);
    const keys = joined.get(channel);
    for (const user of users) {
      s.rows.push({
        name: user.name,
        key: user.key,
        transient: keys !== undefined && keys.has(user.key) ? "joined" : null,
        ghost: false,
      });
    }
    s.total = s.rows.length;
  }

  if (!cold) {
    for (const { user, channel } of diff.removed) {
      sectionFor(channel).ghosts.push({
        name: user.name,
        key: user.key,
        transient: null,
        ghost: true,
      });
    }
  }

  const total = sections.reduce((sum, s) => sum + s.total, 0);
  return { sections, total };
}

/**
 * Filter the model by a nick substring (case-insensitive). Live rows decide
 * whether a section survives: a channel whose rows all filter out is dropped
 * whole, ghosts never keep one alive. Ghosts filter like rows but never count
 * into matched, and total stays the model's full live total.
 */
export function applyFilter(model: AwModel, query: string): AwView {
  const q = query.trim().toLowerCase();
  if (!q) {
    return { sections: model.sections, matched: model.total, total: model.total };
  }

  const sections: AwSection[] = [];
  let matched = 0;
  for (const s of model.sections) {
    const rows = s.rows.filter((r) => r.name.toLowerCase().includes(q));
    if (rows.length === 0) continue;
    matched += rows.length;
    const ghosts = s.ghosts.filter((g) => g.name.toLowerCase().includes(q));
    sections.push({ channel: s.channel, rows, ghosts, total: rows.length });
  }
  return { sections, matched, total: model.total };
}

/** "Stand: HH:MM" footer stamp, zero-padded 24h. */
export function formatStand(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `Stand: ${hh}:${mm}`;
}
