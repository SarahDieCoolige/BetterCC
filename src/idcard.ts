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

/** Wrap/move touch-up pass (spec D5). Empty until the styling tasks land. */
function applyTouchups(): void {
  // intentionally empty
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
