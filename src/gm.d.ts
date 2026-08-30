// Type declarations for Greasemonkey/Tampermonkey GM_* APIs

declare function GM_log(message: string): void;
declare function GM_notification(details: {
  title?: string;
  text: string;
  tag?: string;
  timeout?: number;
  onclick?: () => void;
}): void;

declare namespace GM {
  function setValue(key: string, value: any): Promise<void>;
  function getValue(key: string, defaultValue?: any): Promise<any>;
  function listValues(): Promise<string[]>;
  function addValueChangeListener(
    key: string,
    callback: (key: string, oldValue: any, newValue: any, remote: boolean) => void,
  ): number;
}

declare function GM_addStyle(css: string): void;

declare function GM_getResourceText(name: string): string | undefined;

// Sync-grant forms for value change listeners. The GM namespace form already
// existed; these are the global-scope equivalents (used by the store's
// out-of-band reconciliation).
declare function GM_addValueChangeListener(
  key: string,
  callback: (key: string, oldValue: any, newValue: any, remote: boolean) => void,
): number;
declare function GM_removeValueChangeListener(id: number): void;

// scriptHandler/version (the userscript manager, e.g. Violentmonkey) and the
// script URLs are optional: exposure varies by manager. The Info tab renders
// fallbacks when absent.
declare var GM_info: {
  script: {
    version: string;
    homepageURL?: string;
    supportURL?: string;
  };
  scriptHandler?: string;
  version?: string;
};

declare var unsafeWindow: any;

// Upstream page globals (from ChatCity.de)
interface Document {
  hold?: any;
}

interface ChildNode {
  insertAdjacentHTML(position: string, text: string): void;
}
