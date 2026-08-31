// ─── ID-family reskin entry (specs/idcard-redesign.md) ────────────────────
//
// Entry point for the second branch in index.ts: /de/id, /de/settings,
// /de/friends and /de/nc get the chat's v3 look, nothing else. No chat
// subsystems, no chrome, no error surfaces here.
//
// Gate semantics: the reskin styles only viewers who have actually entered
// the chat with this account. The gate reads GM storage (via store.ts) but
// the ID branch never writes it, so visiting these pages cannot self-arm
// the gate. A multi-account browser is the normal case: the nick is
// resolved from the page (never picked from stored users), and only that
// account's rows count.
//
// Degradation (D6): every failure path leaves the page upstream-styled with
// one cclog line. Reads and scheme computation happen before the paint
// batch, so a failure never leaves a broken half-paint.

import { cclog, setUserStore, decodeChatLink } from "./utils";
import { getMyIdName } from "./upstream";
import { initStore, userHasStoredState } from "./store";
import { currentScheme, schemeToCssVars } from "./theme";
import type { BccColorScheme } from "./scheme";
import { injectFontAwesome } from "./footer";
import { iconElement } from "./dom";

/** Path classifier for the entry branch (spec D1). True on the three
 *  nick-addressed page families and nc. */
export function isIdFamilyPath(pathname: string): boolean {
  return /\/de\/(id|settings|friends)\/.+\.html|\/de\/nc\/index\.html/.test(pathname);
}

/** Extract the viewer nick from a nav settings href
 *  (/de/settings/{encodedNick}.html). Pure: the DOM query stays thin. */
export function nickFromSettingsHref(href: string): string {
  const m = href.match(/\/de\/settings\/([^/?#]+)\.html/);
  return m ? decodeChatLink(m[1]) : "";
}

/** The one-shot vars rule (spec D3). A stylesheet rule survives inline-style
 *  wipes, and there is no shell to write to on these pages. */
export function buildVarsRule(scheme: BccColorScheme): string {
  const decls = Object.entries(schemeToCssVars(scheme))
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");
  return `body.bcc-idcard {\n${decls}\n}`;
}

function getNickFromNav(): string {
  const link = document.querySelector<HTMLAnchorElement>('#id_nav a[href*="/de/settings/"]');
  return link ? nickFromSettingsHref(link.getAttribute("href") ?? "") : "";
}

/** Section label → FA icon, matched as a contains-check on the uppercased
 *  h5 text. Longer needles first: "BLOGS" would otherwise never see "BLOG".
 *  Later touch-up tasks extend this table, nothing else. */
const H5_ICONS: ReadonlyArray<readonly [string, string]> = [
  ["REGDAT", "fa-id-card"],
  ["NUTZERTEXT", "fa-user-pen"],
  ["BILDER", "fa-images"],
  ["FOTOS", "fa-images"],
  ["VIDEOS", "fa-video"],
  ["PINWAND", "fa-thumbtack"],
  ["BLOGS", "fa-rss"],
  ["BLOG", "fa-rss"],
  ["FREUNDE", "fa-users"],
];

/** Wrap/move touch-up pass (spec D5). Additive only: icons are prepended to
 *  section headers, the h5 itself never moves or loses children. A throw
 *  lands in initIdcard's catch, so the page stays painted. */
function applyTouchups(): void {
  try {
    document
      .querySelectorAll<HTMLHeadingElement>(
        "#ww_site_container .cont_el h5, #ww_site_container .cont_el_2 h5",
      )
      .forEach((h5) => {
        // Marker class keeps the pass idempotent (boot can re-run it).
        if (h5.classList.contains("bcc-h5-icon")) return;
        const label = (h5.textContent ?? "")
          .replace(/\u00a0/g, " ")
          .trim()
          .toUpperCase();
        const hit = H5_ICONS.find(([needle]) => label.includes(needle));
        if (!hit) return;
        h5.insertBefore(iconElement(hit[1]), h5.firstChild);
        h5.classList.add("bcc-h5-icon");
      });
  } catch (e) {
    cclog(`idcard: h5 icon pass failed (${(e as Error).message})`);
  }
}

/** ID-family entry. Never rejects: every failure path leaves the page
 *  upstream-styled with one cclog line (spec D6). */
export async function initIdcard(): Promise<void> {
  try {
    const nick = getMyIdName() || getNickFromNav();
    if (!nick) return cclog("idcard: no viewer nick, leaving unstyled");
    if (!(await userHasStoredState(nick))) {
      return cclog(`idcard: no BCC state for ${nick}, leaving unstyled`);
    }
    // Compute everything, then paint in one batch (D6: no broken half-paint).
    setUserStore(nick, false); // these pages require login, never gast
    await initStore(); // read-only at boot: the ID branch never writes GM
    const varsRule = buildVarsRule(currentScheme());
    const v3Css = GM_getResourceText("v3_css");
    const idcardCss = GM_getResourceText("idcard_css");
    document.body.classList.add("bcc-idcard");
    GM_addStyle(varsRule);
    if (v3Css) GM_addStyle(v3Css);
    if (idcardCss) GM_addStyle(idcardCss);
    injectFontAwesome();
    applyTouchups();
  } catch (e) {
    cclog(`idcard: boot failed, leaving unstyled (${(e as Error).message})`);
  }
}
