// Pins the AGENTS.md architecture rules that are greppable: import-graph
// shape and boundary ownership. Rules backed by this file are marked
// "(pinned)" in AGENTS.md. A failing assertion means one of two things:
// the code broke the rule (fix the code), or the rule legitimately changed
// (change both the code AND the pin AND the AGENTS.md line together).

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const SRC_DIR = resolve(import.meta.dirname, "../src");

const SRC_FILES = readdirSync(SRC_DIR)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
  .sort();

function sourceOf(file: string): string {
  return readFileSync(resolve(SRC_DIR, file), "utf-8");
}

/** Code lines only — prose mentions of an identifier inside comments don't
 * count as usage (userlist.ts/status-button.ts/store.ts carry such
 * comments on purpose). */
function codeLines(src: string): string[] {
  return src.split("\n").filter((line) => {
    const t = line.trim();
    return t.length > 0 && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  });
}

/** Files whose code lines match the pattern, with the matching lines. */
function offenders(pattern: RegExp): Map<string, string[]> {
  const hits = new Map<string, string[]>();
  for (const f of SRC_FILES) {
    const lines = codeLines(sourceOf(f)).filter((l) => pattern.test(l));
    if (lines.length > 0) hits.set(f, lines);
  }
  return hits;
}

/** Depth-first search over `from "./x"` imports; returns one cycle path or
 * null. ES module cycles are legal to the bundler — this pins the house
 * rule that they don't exist at all. */
function findImportCycle(): string[] | null {
  const graph = new Map<string, string[]>();
  for (const f of SRC_FILES) {
    const deps = [...sourceOf(f).matchAll(/from\s+"\.\/([a-z0-9-]+)"/g)].map((m) => m[1] + ".ts");
    graph.set(
      f,
      deps.filter((d) => SRC_FILES.includes(d)),
    );
  }
  const state = new Map<string, number>(); // 1 = on stack, 2 = done
  const stack: string[] = [];
  const visit = (node: string): string[] | null => {
    if (state.get(node) === 2) return null;
    if (state.get(node) === 1) {
      const start = stack.indexOf(node);
      return [...stack.slice(start), node];
    }
    state.set(node, 1);
    stack.push(node);
    for (const dep of graph.get(node) ?? []) {
      const cycle = visit(dep);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(node, 2);
    return null;
  };
  for (const f of SRC_FILES) {
    const cycle = visit(f);
    if (cycle) return cycle;
  }
  return null;
}

describe("architecture invariants (AGENTS.md pinned rules)", () => {
  it("src has no import cycles", () => {
    const cycle = findImportCycle();
    expect(cycle, `import cycle: ${cycle?.join(" -> ")}`).toBeNull();
  });

  it("unsafeWindow only in upstream.ts, ws-hook.ts, index.ts, init.ts; input.ts only via the bettercc surface", () => {
    const allowed = new Set(["upstream.ts", "ws-hook.ts", "index.ts", "init.ts", "input.ts"]);
    const hits = offenders(/\bunsafeWindow\b/);
    const unexpected = [...hits.keys()].filter((f) => !allowed.has(f));
    expect(unexpected, `unexpected unsafeWindow usage in: ${unexpected.join(", ")}`).toEqual([]);
    // input.ts is allowlisted for the public API surface only
    const beyondSurface = (hits.get("input.ts") ?? []).filter(
      (l) => !l.includes("unsafeWindow.bettercc"),
    );
    expect(beyondSurface, "input.ts may only touch unsafeWindow.bettercc").toEqual([]);
  });

  it("GM storage (GM.getValue/GM.setValue) is touched only by store.ts", () => {
    const hits = offenders(/GM\.getValue|GM\.setValue/);
    expect(
      [...hits.keys()],
      `GM storage touched outside store.ts: ${[...hits.keys()].join(", ")}`,
    ).toEqual(["store.ts"]);
  });

  it("iframe access (contentDocument/contentWindow) only in utils.ts — everyone else goes through getChatDoc()/getChatWin()", () => {
    const hits = offenders(/contentDocument|contentWindow/);
    expect(
      [...hits.keys()],
      `direct iframe access outside utils.ts: ${[...hits.keys()].join(", ")}`,
    ).toEqual(["utils.ts"]);
  });

  it("v3.css keeps the --bcc-* namespace: no --chat* vars, no :root scoping", () => {
    const css = readFileSync(resolve(import.meta.dirname, "../css/v3.css"), "utf-8");
    expect(css.includes("--chat"), "found a --chat* custom property in v3.css").toBe(false);
    expect(/:root\s*\{/.test(css), "found a :root selector in v3.css").toBe(false);
  });
});
