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
  function notification(details: {
    title?: string;
    text: string;
    tag?: string;
    timeout?: number;
    onclick?: () => void;
  }): void;
  function addStyle(css: string): void;
}

declare function GM_getResourceText(name: string): string | undefined;

declare var GM_info: {
  script: {
    version: string;
  };
};

declare var unsafeWindow: any;

// Upstream page globals (from ChatCity.de)
interface Document {
  hold?: any;
}

interface ChildNode {
  insertAdjacentHTML(position: string, text: string): void;
}
