// ─── DOM: showSettingsModal, forceNoChatBackgrounds, addCustomCss, cleanup,
//           betterUserList, betterInput, redesignFooter ───

import { setUserStore, cclog, waitForElements } from "./utils";

export function showSettingsModal(userStore: string): void {
  const modalOverlay = document.createElement("div");
  modalOverlay.style.position = "fixed";
  modalOverlay.style.top = "0";
  modalOverlay.style.left = "0";
  modalOverlay.style.width = "100%";
  modalOverlay.style.height = "100%";
  modalOverlay.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
  modalOverlay.style.zIndex = "1000";

  const modal = document.createElement("div");
  modal.style.position = "fixed";
  modal.style.top = "50%";
  modal.style.left = "50%";
  modal.style.transform = "translate(-50%, -50%)";
  modal.style.width = "400px";
  modal.style.padding = "20px";
  modal.style.color = "var(--inputText)";
  modal.style.backgroundColor = "var(--inputBackground)";
  modal.style.boxShadow = "0 0 10px rgba(0, 0, 0, 0.2)";
  modal.style.zIndex = "1001";

  const modalTitle = document.createElement("h2");
  modalTitle.textContent = `Settings for ${userStore}`;
  modal.appendChild(modalTitle);

  const settingsContainer = document.createElement("div");
  modal.appendChild(settingsContainer);

  const closeButton = document.createElement("button");
  closeButton.textContent = "Close";
  closeButton.style.marginTop = "10px";
  closeButton.addEventListener("click", () => {
    document.body.removeChild(modalOverlay);
  });
  modal.appendChild(closeButton);

  modalOverlay.appendChild(modal);
  document.body.appendChild(modalOverlay);

  GM.listValues().then((keys: string[]) => {
    const userKeys = keys.filter((key: string) => key.endsWith("_" + userStore));
    userKeys.forEach((key: string) => {
      GM.getValue(key).then((value: any) => {
        const settingRow = document.createElement("div");
        settingRow.style.marginBottom = "10px";

        const keyLabel = document.createElement("label");
        keyLabel.textContent = key.replace(userStore + "_", "");
        keyLabel.style.display = "block";
        settingRow.appendChild(keyLabel);

        const valueInput = document.createElement("textarea");
        valueInput.style.width = "100%";
        valueInput.style.minHeight = "40px";
        valueInput.style.fontFamily = "monospace";
        valueInput.style.fontSize = "12px";

        if (typeof value === 'object' && value !== null) {
          valueInput.value = JSON.stringify(value, null, 2);
          valueInput.style.height = "120px";
        } else {
          valueInput.value = value;
          valueInput.style.height = "40px";
        }

        settingRow.appendChild(valueInput);
        settingsContainer.appendChild(settingRow);
      });
    });
  });
}

export function forceNoChatBackgrounds(): void {
  // v1.43: No-op. Upstream's WebSocket-shim loads the iframe from
  // cpop_tJuf.html (no query string), so setbgcol()'s getQueryVariable('SBG')
  // gate is always false — chat backgrounds are auto-disabled by upstream.
}

export function addCustomCss(): void {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://use.fontawesome.com/releases/v6.5.1/css/all.css";
  link.crossOrigin = "anonymous";
  document.head.appendChild(link);

  var main_css = GM_getResourceText("main_css");
  if (main_css) GM_addStyle(main_css);
}

export function cleanup(): void {
  // remove all but last ulist regularly since cc is just appending these instead of replacing
  waitForElements(
    "script[src^='https://www.chatcity.de/cc_chat/ulist?AKTION']",
    function (el: Element) {
      const allScripts = document.head.querySelectorAll(
        "script[src^='https://www.chatcity.de/cc_chat/ulist?AKTION']"
      );
      for (let i = 0; i < allScripts.length - 1; i++) {
        allScripts[i].remove();
      }
    },
    false,
    30000
  );
  const popup = document.querySelector("#popup-chat");
  if (popup) { popup.removeAttribute("ondragstart"); popup.removeAttribute("ondrop"); }
  const gaScript = document.head.querySelector("script[src='https://ssl.google-analytics.com/ga.js']");
  if (gaScript) gaScript.remove();
  document.querySelector("#adv720")?.remove();
  document.querySelector("#right_ad")?.remove();
  const adFrame = document.querySelector('#r_off1 table iframe[src="https://www.chatcity.de/cc_chat/html?PAGE=300x250.html"]');
  if (adFrame) { const tr = adFrame.closest("tr"); if (tr) tr.remove(); }
  document.querySelector("#popup-chat > table > tbody > tr:nth-child(1)")?.remove();
  document.querySelector("#ulscrollhelper")?.remove();
  document.querySelector("#ul")?.classList.add("headless");
  document.querySelectorAll(".chat_i1").forEach(el => el.remove());

  // remove timeout from exit button
  const exitBtn = document.querySelector(".b7");
  if (exitBtn) exitBtn.setAttribute("onclick", "bye()");

  // disable resize_fix function. throws error
  unsafeWindow.resize_fix = function resize_fix() {
    return true;
  };
  clearTimeout(unsafeWindow.size_timeout);
  clearInterval(unsafeWindow.size_interval);
}

export function betterUserList(userStore: string): void {
  // add superwhisper to userlist popup
  const fuu2 = document.querySelector("#fuu");
  if (fuu2) fuu2.insertAdjacentHTML("beforeend",
    '<a href="javascript://" class="button pinuser" id="pinUser" onclick="bettercc.addPinnedUser(last_id)">» Pin</a>'
  );

  let userStorePinnedUsers = "pinned_" + userStore;

  // Function to add a user to the pinned users list
  (unsafeWindow.bettercc as any).addPinnedUser = async function (username: string) {
    username = username.toLowerCase();

    let pinnedUsers: string[] = GM_getValue(userStorePinnedUsers, []);

    if (!pinnedUsers.includes(username)) {
      pinnedUsers.push(username);
    } else {
      pinnedUsers = pinnedUsers.filter(function (item: any) {
        return String(item) !== username;
      });
    }

    GM_setValue(userStorePinnedUsers, pinnedUsers);
    (unsafeWindow as any).set_uinfo1();
    const popup3 = document.querySelector(".ulist-popup") as HTMLElement | null;
    if (popup3) popup3.style.display = "none";
  };

  // Function to get the list of pinned users
  function getPinnedUsers() {
    return Array.from(GM_getValue(userStorePinnedUsers, []))
      .map((v: any) => v.toLowerCase())
      .sort();
  }

  function waitForSetUinfo1Function() {
    if (typeof (unsafeWindow as any).set_uinfo1 === "function") {
      redefineSetUinfo1Function();
    } else {
      setTimeout(waitForSetUinfo1Function, 100);
    }
  }

  function redefineSetUinfo1Function() {
    function createUserDisplayElement(username: string, value: string, isCurrentUser: boolean) {
      let classes: string[] = [];
      let indicators: string[] = [];

      if (value.includes("S")) {
        classes.push("u_sep");
        indicators.push("S");
      }
      if (value.includes("A")) {
        classes.push("u_away");
        indicators.push("A");
      }

      const classAttr =
        classes.length > 0 ? `class="${classes.join(" ")}"` : "";
      const indicatorHtml =
        indicators.length > 0
          ? `<span class="user_status_indicator">[${indicators.join(
              "]["
            )}]</span>`
          : "";

      if (isCurrentUser) {
        return `<span ${classAttr}>» ${username} ${indicatorHtml}</span><br>`;
      } else {
        return `<a href="javascript://" onclick="open_utn('fuu',this,-25,-50,'${username}',event,'${value}');" id="${username}" ${classAttr} target="leer">» ${username} ${indicatorHtml}</a><br>`;
      }
    }

    (unsafeWindow as any).set_uinfo1 = function () {
      unsafeWindow.chat_channel = unsafeWindow.cha_channel;
      let num = 0;

      const pinnedUsersNames = getPinnedUsers();
      let pinnedUsers: string[] = [];
      let regularUsers: string[] = [];

      for (let g = 0; g < unsafeWindow.cha_my.length; g += 2) {
        const username = unsafeWindow.cha_my[g];
        const value = unsafeWindow.cha_my[g + 1];

        if (username) {
          const isCurrentUser = username === unsafeWindow.chat_nick;
          const userElement = createUserDisplayElement(
            username,
            value,
            isCurrentUser
          );

          if (pinnedUsersNames.includes(username.toLowerCase())) {
            pinnedUsers.push(userElement);
          } else {
            regularUsers.push(userElement);
          }

          num++;
        }
      }

      let uli = pinnedUsers.join("");
      if (pinnedUsers.length > 0 && regularUsers.length > 0) {
        uli += '<div class="pinnedusergap"></div>';
      }
      uli += regularUsers.join("");

      (unsafeWindow as any).setInnerHTML("ul", uli);
      (unsafeWindow as any).setInnerHTML("uinfo", num);
    };

    // cclog("set_uinfo1 function redefined successfully.");
  }

  waitForSetUinfo1Function();
}

export function betterInput(replace: boolean): void {
  var form: HTMLFormElement | null = null;
  var originalInput: Element | null = null;
  try {
    form = document.querySelector('form[name="hold"]') as HTMLFormElement | null;
    if (!form) {
      throw new Error('Form with name "hold" not found.');
    }

    const inputText = form.querySelector('input[type="text"]') as HTMLInputElement | null;
    if (!inputText) {
      throw new Error('Input of type "text" not found in the form.');
    }

    if (replace) {
      const newTextarea = document.createElement("textarea");
      newTextarea.id = "custom_input_text";
      newTextarea.placeholder = "Du chattest mit allen...";
      newTextarea.maxLength = 1024;
      newTextarea.name = "OUT1";
      newTextarea.rows = 3;
      newTextarea.wrap = "soft";

      originalInput = inputText.cloneNode(true) as Element;

      inputText.replaceWith(newTextarea);

      newTextarea.addEventListener("keypress", function (e: KeyboardEvent) {
        if (e.key === "Enter" && !e.shiftKey) {
          // Dispatch submit event to trigger handlers without native form submission.
          // jQuery's $form.submit() only fired handlers; native submit() navigates.
          form!.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
          e.preventDefault();
        }
      });
    } else {
      inputText.id = "custom_input_text";
      inputText.placeholder = "Du chattest mit allen...";
    }
  } catch (error: any) {
    cclog("betterInput error: " + error.message);

    if (replace && originalInput && form) {
      const customInput = form.querySelector("#custom_input_text");
      if (customInput) customInput.replaceWith(originalInput);
    }
  }
}

export function redesignFooter(): void {
  var footerTable = document.querySelector(".ww_chat_footer_table");
  if (!footerTable) return;

  var rows = footerTable.querySelectorAll(":scope > tbody > tr");
  if (rows.length < 2) return;

  var firstRow = rows[0] as HTMLElement;
  var secondRow = rows[1] as HTMLElement;

  var actionCell = firstRow.querySelector("td.chat_i3");
  var exitCell = firstRow.querySelector("td.chat_i4");
  var colorCell = secondRow.querySelector("td.chat_i4");
  if (!actionCell || !colorCell) return;

  // ─── Collect elements ───
  var holdForm = document.querySelector("form[name='hold']") as HTMLElement | null;
  var autoscrollForm = document.querySelector("form[name='OF']") as HTMLElement | null;
  var statusSpan = document.querySelector("#chatout_status") as HTMLElement | null;
  var debugTools = document.querySelector("#chatout_debug_tools") as HTMLElement | null;
  var asCheckbox = autoscrollForm?.querySelector('input[name="AS"]') as HTMLInputElement | null;

  var colorWrap   = document.querySelector(".bcc-color-picker-wrap") as HTMLElement | null;
  var reloadBtn   = document.querySelector("#reloadbutton") as HTMLElement | null;
  var helpBtn     = document.querySelector("#helpbutton") as HTMLElement | null;
  var settingsBtn = document.querySelector("#settingsbutton") as HTMLElement | null;

  var anmelden   = actionCell.querySelector("a.b3") as HTMLElement | null;
  var abmelden   = actionCell.querySelector("a.b2") as HTMLElement | null;
  var sysMsgsOn  = actionCell.querySelector("a.b5") as HTMLElement | null;
  var sysMsgsOff = actionCell.querySelector("a.b6") as HTMLElement | null;
  var forumLink  = actionCell.querySelector("a.b15") as HTMLElement | null;
  var idLink     = actionCell.querySelector("a.b16") as HTMLElement | null;
  var upHelpLink = actionCell.querySelector("a.b1") as HTMLElement | null;

  var colorLinks = colorCell.querySelectorAll("a");
  var exitLink   = exitCell?.querySelector("a") as HTMLElement | null;

  // Hide autoscroll form (keep functional for setmove())
  if (autoscrollForm) autoscrollForm.style.display = "none";

  // ─── Build autoscroll toggle button ───
  var autoscrollBtn = document.createElement("button");
  autoscrollBtn.id = "bcc-autoscroll";
  autoscrollBtn.type = "button";
  autoscrollBtn.className = "bcc-icon-btn" + (asCheckbox?.checked ? " bcc-active" : "");
  autoscrollBtn.title = "Autoscroll ein/aus";
  autoscrollBtn.innerHTML = '<i class="fas fa-angle-double-down"></i>';
  autoscrollBtn.addEventListener("click", function () {
    if (asCheckbox) asCheckbox.click();
    autoscrollBtn.classList.toggle("bcc-active", asCheckbox?.checked || false);
  });

  // ─── Monkey-patch chatout_setstatus: color reload button ───
  if (statusSpan) statusSpan.style.display = "none";
  if (typeof unsafeWindow.chatout_setstatus === "function") {
    var origSetStatus = unsafeWindow.chatout_setstatus;
    unsafeWindow.chatout_setstatus = function (text: string, color: string, bold: boolean) {
      var el = document.getElementById("chatout_status");
      if (el) el.title = text;
      var reloadBtnEl = document.getElementById("reloadbutton");
      if (reloadBtnEl) {
        reloadBtnEl.style.color = color || "#888";
        reloadBtnEl.title = "Chat neu laden — " + text;
      }
      origSetStatus.call(this, text, color, bold);
    };
  }

  // ─── Build pill containers ───
  [anmelden, abmelden, sysMsgsOn, sysMsgsOff, forumLink, idLink, upHelpLink].forEach(function (el) {
    if (el) el.classList.add("bcc-icon-btn");
  });

  var accountAlertsPill = document.createElement("div");
  accountAlertsPill.className = "bcc-pill bcc-pill-2";
  [anmelden, sysMsgsOn, abmelden, sysMsgsOff].forEach(function (el) {
    if (el) accountAlertsPill.appendChild(el);
  });

  var chatActionsPill = document.createElement("div");
  chatActionsPill.className = "bcc-pill bcc-pill-2 bcc-chat-actions";
  [autoscrollBtn, reloadBtn, colorWrap].forEach(function (el) {
    if (el) chatActionsPill.appendChild(el);
  });

  var betterccPill = document.createElement("div");
  betterccPill.className = "bcc-pill";
  [helpBtn, settingsBtn].forEach(function (el) {
    if (el) betterccPill.appendChild(el);
  });

  var colorPill = document.createElement("div");
  colorPill.className = "bcc-pill bcc-pill-3";
  colorLinks.forEach(function (link) {
    link.classList.add("bcc-color-btn");
    colorPill.appendChild(link);
  });

  var linksPill = document.createElement("div");
  linksPill.className = "bcc-pill bcc-pill-2 bcc-links";
  [idLink, forumLink, upHelpLink].forEach(function (el) {
    if (el) linksPill.appendChild(el);
  });

  if (exitLink) exitLink.classList.add("bcc-icon-btn", "bcc-danger");

  // ─── Clean up empty wrapper ───
  var betterOpts = document.querySelector("#betteroptions");
  if (betterOpts) betterOpts.remove();

  // ─── Build main footer ───
  var inputArea = document.createElement("div");
  inputArea.className = "bcc-input-area";
  [holdForm, debugTools, statusSpan].forEach(function (el) {
    if (el) inputArea.appendChild(el);
  });

  var footer = document.createElement("div");
  footer.className = "bcc-footer";
  [inputArea, accountAlertsPill, chatActionsPill, betterccPill, colorPill, linksPill, exitLink].forEach(function (el) {
    if (el) footer.appendChild(el);
  });

  // ─── Replace table ───
  footerTable.replaceWith(footer);
}

// ═══════════════════════════════════════════════════════════════════════
// /id command — modern mini-ID popup
// ═══════════════════════════════════════════════════════════════════════

function encodeIdUrl(name: string): string {
  try {
    const linkEncode = (unsafeWindow as any).link_encode;
    if (typeof linkEncode === "function") {
      return linkEncode(name);
    }
  } catch { /* fall through */ }
  // Fallback: basic encoding
  let encoded = "";
  for (let i = 0; i < name.length; i++) {
    const ch = name.charAt(i);
    const code = ch.charCodeAt(0);
    if ((code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
      encoded += ch;
    } else if (ch === " ") {
      encoded += "+";
    } else if (code <= 255) {
      encoded += ":" + code.toString(16).toUpperCase().padStart(2, "0") + ":";
    } else {
      encoded += "+";
    }
  }
  return encoded;
}

export function showIdPopup(prename: string): void {
  // Remove any existing popup
  const existing = document.querySelector("#bcc-id-overlay") as HTMLElement | null;
  if (existing) existing.remove();

  // ─── Overlay ───
  const overlay = document.createElement("div");
  overlay.id = "bcc-id-overlay";
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:1000;" +
    "display:flex;align-items:center;justify-content:center;";

  // ─── Card ───
  const card = document.createElement("div");
  card.style.cssText =
    "background:var(--inputBackground);color:var(--inputText);" +
    "width:350px;max-height:70vh;border-radius:8px;" +
    "box-shadow:0 0 12px rgba(0,0,0,0.25);z-index:1001;" +
    "display:flex;flex-direction:column;overflow:hidden;";

  // ─── Header ───
  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;justify-content:space-between;align-items:center;" +
    "padding:12px 16px;border-bottom:1px solid var(--footerBackground);";

  const title = document.createElement("span");
  title.textContent = "ID Suche";
  title.style.cssText = "font-weight:600;font-size:14px;";
  header.appendChild(title);

  const closeBtn = document.createElement("button");
  closeBtn.innerHTML = '<i class="fas fa-times"></i>';
  closeBtn.style.cssText =
    "background:none;border:none;color:var(--iconColor);" +
    "cursor:pointer;font-size:14px;padding:4px 8px;";
  header.appendChild(closeBtn);

  // ─── Search area ───
  const searchArea = document.createElement("div");
  searchArea.style.cssText = "padding:12px 16px;display:flex;gap:8px;";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Username...";
  searchInput.value = prename;
  searchInput.style.cssText =
    "flex:1;padding:6px 10px;border:1px solid var(--footerBackground);" +
    "border-radius:4px;background:var(--inputBackground);color:var(--inputText);" +
    "font-size:14px;outline:none;";

  const searchBtn = document.createElement("button");
  searchBtn.textContent = "Suchen";
  searchBtn.style.cssText =
    "background:var(--buttonColor);color:var(--buttonText);" +
    "border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:13px;";

  // ─── ID link area ───
  const linkArea = document.createElement("div");
  linkArea.style.cssText = "padding:0 16px 8px;";

  function updateIdLink(name: string): void {
    linkArea.innerHTML = "";
    if (!name) return;
    const encoded = encodeIdUrl(name);
    const link = document.createElement("a");
    link.textContent = name;
    link.href = "//www.chatcity.de/de/id/" + encoded + ".html";
    link.target = "_blank";
    link.style.cssText =
      "color:var(--buttonColor);text-decoration:none;font-size:13px;";
    link.title = "ID-Card öffnen";
    const arrow = document.createElement("span");
    arrow.textContent = " →";
    arrow.style.fontSize = "11px";
    link.appendChild(arrow);
    linkArea.appendChild(link);
  }

  updateIdLink(prename);

  // ─── Results container ───
  const results = document.createElement("div");
  results.style.cssText =
    "padding:0 16px 12px;overflow-y:auto;flex:1;min-height:0;";

  const loadingEl = document.createElement("div");
  loadingEl.textContent = "Wird geladen...";
  loadingEl.style.cssText = "text-align:center;color:var(--placeholderColor);font-size:13px;";

  // ─── Fetch & render ───
  let activeRequest = false;

  function stripThumbnailSuffix(url: string): string {
    return url.replace(/_(\d+)\.jpg$/i, ".jpg");
  }

  function renderError(msg: string): void {
    results.innerHTML = "";
    const err = document.createElement("div");
    err.textContent = msg;
    err.style.cssText = "text-align:center;color:var(--superbancolor);font-size:13px;padding:16px 0;";
    results.appendChild(err);
  }

  function renderResults(html: string): void {
    results.innerHTML = "";
    if (!html || html.length < 20) {
      renderError("Kein Ergebnis gefunden.");
      return;
    }
    // Parse user entries from HTML: extract <a> tags with user links and <img> tags
    const entries = html.split(/<br\s*\/?>/i).filter(function (part: string) {
      return part.indexOf('href') !== -1 && part.length > 20;
    });

    if (entries.length === 0) {
      // No structured entries found — render the raw HTML as fallback
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html;
      // Make links open in new tab
      wrapper.querySelectorAll("a").forEach(function (a: HTMLAnchorElement) {
        a.target = "_blank";
        a.style.color = "var(--buttonColor)";
      });
      results.appendChild(wrapper);
      return;
    }

    entries.forEach(function (entry: string) {
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:center;gap:10px;padding:8px 0;" +
        "border-bottom:1px solid var(--footerBackground);";

      // Extract image
      const imgMatch = entry.match(/src="([^"]*userfiles\/[^"]*\.jpg[^"]*)"/i);
      if (imgMatch) {
        const thumbUrl = imgMatch[1];
        const fullUrl = stripThumbnailSuffix(thumbUrl);
        const img = document.createElement("img");
        img.src = thumbUrl;
        img.style.cssText =
          "width:40px;height:40px;border-radius:50%;object-fit:cover;cursor:pointer;flex-shrink:0;";
        img.title = "Bild in voller Größe öffnen";
        img.addEventListener("click", function () {
          window.open(fullUrl, "_blank");
        });
        row.appendChild(img);
      }

      // Extract name and link
      const linkMatch = entry.match(/href="([^"]*\/id\/[^"]*\.html[^"]*)"/i);
      const nameMatch = entry.match(/>([^<]+)<\/a>/i);
      const displayName = nameMatch ? nameMatch[1].replace(/^»\s*/, "") : "Unbekannt";

      const nameLink = document.createElement("a");
      nameLink.textContent = displayName;
      nameLink.href = linkMatch ? linkMatch[1].replace(/&amp;/g, "&") : "#";
      nameLink.target = "_blank";
      nameLink.style.cssText =
        "color:var(--buttonColor);text-decoration:none;font-size:13px;flex:1;";
      nameLink.title = "ID-Card öffnen";

      const arrow = document.createElement("span");
      arrow.textContent = " →";
      arrow.style.cssText = "font-size:11px;color:var(--placeholderColor);";
      nameLink.appendChild(arrow);

      row.appendChild(nameLink);
      results.appendChild(row);
    });
  }

  function doSearch(name: string): void {
    if (!name) return;
    results.innerHTML = "";
    results.appendChild(loadingEl);
    activeRequest = true;

    const pajax = (unsafeWindow as any).PAJAX || "https://www.chatcity.de/de/";
    const url = pajax + "chat_id.html";
    const body = "NAME=" + encodeURIComponent(name);
    const w = unsafeWindow as any;
    const AjaxLib = w.ajax || (window as any).ajax;

    w.return_chat_id_obj = null;
    new AjaxLib(url, {
      postBody: body,
      evalObj: "return_chat_id_obj",
      onComplete: function () {
        if (!activeRequest) return;
        activeRequest = false;
        try {
          const obj = w.return_chat_id_obj;
          if (obj && obj._MO_OBJ_STATUS === "OK" && obj._MO_OBJ_ETXT) {
            renderResults(obj._MO_OBJ_ETXT);
          } else if (obj && obj._MO_OBJ_ETXT) {
            renderError(obj._MO_OBJ_ETXT);
          } else {
            renderError("Kein Ergebnis gefunden.");
          }
        } catch (e) {
          renderError("Fehler beim Verarbeiten der Antwort.");
        }
      },
      onError: function () {
        if (!activeRequest) return;
        activeRequest = false;
        renderError("Netzwerkfehler — ID-Card kann trotzdem geöffnet werden.");
      },
    });
  }

  // ─── Assemble ───
  searchArea.appendChild(searchInput);
  searchArea.appendChild(searchBtn);
  card.appendChild(header);
  card.appendChild(searchArea);
  card.appendChild(linkArea);
  card.appendChild(results);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // Focus input if empty
  if (!prename) searchInput.focus();

  // ─── Close helpers ───
  function closePopup(): void {
    activeRequest = false;
    overlay.remove();
    document.removeEventListener("keydown", onKeyDown);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") closePopup();
  }

  closeBtn.addEventListener("click", closePopup);
  overlay.addEventListener("click", function (e: MouseEvent) {
    if (e.target === overlay) closePopup();
  });
  document.addEventListener("keydown", onKeyDown);

  // Prevent card clicks from closing
  card.addEventListener("click", function (e: MouseEvent) {
    e.stopPropagation();
  });

  // ─── Search handlers ───
  searchInput.addEventListener("keydown", function (e: KeyboardEvent) {
    if (e.key === "Enter") {
      const name = searchInput.value.trim();
      updateIdLink(name);
      doSearch(name);
    }
  });

  searchBtn.addEventListener("click", function () {
    const name = searchInput.value.trim();
    updateIdLink(name);
    doSearch(name);
  });

  // Auto-search if name provided
  if (prename) doSearch(prename);
}
