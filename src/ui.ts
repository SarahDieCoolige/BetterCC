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
  const existing = document.querySelector(".bcc-id-overlay") as HTMLElement | null;
  if (existing) existing.remove();

  // ─── Overlay ───
  const overlay = document.createElement("div");
  overlay.className = "bcc-id-overlay";

  // ─── Card ───
  const card = document.createElement("div");
  card.className = "bcc-id-card";

  // ─── Header ───
  const header = document.createElement("div");
  header.className = "bcc-id-header";

  const title = document.createElement("span");
  title.className = "bcc-id-title";
  title.textContent = "ID Suche";
  header.appendChild(title);

  const closeBtn = document.createElement("button");
  closeBtn.className = "bcc-id-close";
  closeBtn.innerHTML = '<i class="fas fa-times"></i>';
  header.appendChild(closeBtn);

  // ─── Search area ───
  const searchArea = document.createElement("div");
  searchArea.className = "bcc-id-search";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Username...";
  searchInput.value = prename;

  const searchBtn = document.createElement("button");
  searchBtn.textContent = "Suchen";

  searchArea.appendChild(searchInput);
  searchArea.appendChild(searchBtn);

  // ─── Results container ───
  const results = document.createElement("div");
  results.className = "bcc-id-results";

  const loadingEl = document.createElement("div");
  loadingEl.className = "bcc-id-loading";
  loadingEl.textContent = "Wird geladen...";

  // ─── Fetch & render ───
  let activeRequest = false;

  function stripThumbnailSuffix(url: string): string {
    return url.replace(/_(\d+)\.jpg$/i, ".jpg");
  }

  function renderError(msg: string): void {
    results.innerHTML = "";
    const err = document.createElement("div");
    err.className = "bcc-id-error";
    err.textContent = msg;
    results.appendChild(err);
  }

  let previewEl: HTMLImageElement;

  function renderResults(html: string): void {
    results.innerHTML = "";
    if (!html || html.length < 30) {
      renderError("Kein Ergebnis gefunden.");
      return;
    }

    const tmp = document.createElement("div");
    tmp.innerHTML = html;

    const valueDivs = tmp.querySelectorAll(".value");
    const rows: { name: string; href: string; imgUrl: string | null }[] = [];

    for (let i = 0; i < valueDivs.length; i++) {
      const div = valueDivs[i];
      const img = div.querySelector("img[src*='userfiles']") as HTMLImageElement | null;
      const link = div.querySelector("a[href*='/id/']") as HTMLAnchorElement | null;

      if (img && !link) {
        const nextDiv = valueDivs[i + 1];
        if (nextDiv) {
          const nameLink = nextDiv.querySelector("a[href*='/id/']") as HTMLAnchorElement | null;
          if (nameLink) {
            const name = (nameLink.textContent || "").trim().replace(/^»\s*/, "");
            rows.push({ name: name || "Unbekannt", href: nameLink.href, imgUrl: img.src });
            i++;
          }
        }
      } else if (link && !img) {
        const name = (link.textContent || "").trim().replace(/^»\s*/, "");
        if (name) rows.push({ name, href: link.href, imgUrl: null });
      } else if (img && link) {
        // Image wrapped in a link — text is usually empty (just an <img> child).
        // Peek at next div for actual name, then skip it.
        const name = (link.textContent || "").trim().replace(/^»\s*/, "");
        if (!name) {
          const nextDiv = valueDivs[i + 1];
          if (nextDiv) {
            const nameLink = nextDiv.querySelector("a[href*='/id/']") as HTMLAnchorElement | null;
            if (nameLink) {
              const realName = (nameLink.textContent || "").trim().replace(/^»\s*/, "");
              rows.push({ name: realName || "Unbekannt", href: nameLink.href, imgUrl: img.src });
              i++;
              continue;
            }
          }
        }
        rows.push({ name: name || "Unbekannt", href: link.href, imgUrl: img.src });
      }
    }

    if (rows.length === 0) {
      renderError("Kein Ergebnis gefunden.");
      return;
    }

    rows.forEach(function (row) {
      const rowEl = document.createElement("div");
      rowEl.className = "bcc-id-row";

      if (row.imgUrl) {
        const thumb = document.createElement("img");
        thumb.src = row.imgUrl;
        thumb.className = "bcc-id-thumb";
        const fullUrl = stripThumbnailSuffix(row.imgUrl);
        if (fullUrl !== row.imgUrl && !/default/i.test(fullUrl)) {
          thumb.classList.add("bcc-id-thumb-clickable");
          thumb.title = "Bild in voller Größe öffnen";
          thumb.addEventListener("click", function (e: Event) {
            e.stopPropagation();
            window.open(fullUrl, "_blank");
          });
          // Hover preview
          thumb.addEventListener("mouseenter", function (e: MouseEvent) {
            previewEl.src = fullUrl;
            previewEl.style.display = "block";
            previewEl.style.left = (e.clientX + 16) + "px";
            previewEl.style.top = (e.clientY - 75) + "px";
          });
          thumb.addEventListener("mousemove", function (e: MouseEvent) {
            if (previewEl.style.display === "block") {
              previewEl.style.left = (e.clientX + 16) + "px";
              previewEl.style.top = (e.clientY - 75) + "px";
            }
          });
          thumb.addEventListener("mouseleave", function () {
            previewEl.style.display = "none";
          });
        }
        thumb.addEventListener("error", function () {
          thumb.style.display = "none";
        });
        rowEl.appendChild(thumb);
      }

      const nameLink = document.createElement("a");
      nameLink.textContent = row.name;
      nameLink.href = row.href;
      nameLink.target = "_blank";
      nameLink.className = "bcc-id-name";
      nameLink.title = "ID-Card öffnen";
      rowEl.appendChild(nameLink);
      results.appendChild(rowEl);
    });
  }

  function doSearch(name: string): void {
    if (!name) return;
    results.innerHTML = "";
    results.appendChild(loadingEl);
    activeRequest = true;

    const pajax = (unsafeWindow as any).PAJAX || "https://www.chatcity.de/de/";
    const url = pajax + "obj_list.html";
    const AjaxLib = (unsafeWindow as any).ajax || (window as any).ajax;

    const params = [
      "TYP=1",
      "_EN_OBJ_ORDER_SORT_SHOW=",
      "ORD=0",
      "SORT=1",
      "START=0",
      "_LIST_WRAPPER_ID=bccid",
      "EXT=allbychar",
      "_KW_allbychar=" + encodeURIComponent(name),
      "LOADDEF=3",
      "LOADDEF_EXTRA_USER=",
      "LOADDEF_EXTRA=",
      "_LIST_LINK_ALL=",
      "STYP=",
      "LOADDEF_CUSTOM=allbychar",
      "CACHE=3600",
      "OPENW=1",
      "ISCHAT=1",
    ].join("&");

    const failTimer = setTimeout(function () {
      if (!activeRequest) return;
      activeRequest = false;
      renderError("Zeit\u00fcberschreitung \u2014 ID-Card kann trotzdem ge\u00f6ffnet werden.");
    }, 8000);

    new AjaxLib(url, {
      postBody: params,
      onComplete: function (transport: any) {
        clearTimeout(failTimer);
        if (!activeRequest) return;
        activeRequest = false;
        try {
          const html = transport.responseText || "";
          if (html && html.length > 30) {
            renderResults(html);
          } else {
            renderError("Kein Ergebnis gefunden.");
          }
        } catch (e) {
          renderError("Fehler beim Verarbeiten der Antwort.");
        }
      },
    });
  }

  // ─── Assemble ───
  card.appendChild(header);
  card.appendChild(searchArea);
  card.appendChild(results);
  overlay.appendChild(card);

  // Hover preview for user images
  previewEl = document.createElement("img");
  previewEl.id = "bcc-id-thumb-preview";
  previewEl.className = "bcc-id-thumb-preview";
  overlay.appendChild(previewEl);
  document.body.appendChild(overlay);

  // Focus input if empty
  if (!prename) searchInput.focus();

  // ─── Close helpers ───
  function closePopup(): void {
    activeRequest = false;
    dragging = false;
    overlay.remove();
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") closePopup();
  }

  closeBtn.addEventListener("click", closePopup);
  overlay.addEventListener("click", function (e: MouseEvent) {
    if (e.target === overlay) closePopup();
  });
  document.addEventListener("keydown", onKeyDown);

  card.addEventListener("click", function (e: MouseEvent) {
    e.stopPropagation();
  });

  // ─── Drag-to-move ───
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let cardStartLeft = 0;
  let cardStartTop = 0;

  header.addEventListener("mousedown", function (e: MouseEvent) {
    if ((e.target as HTMLElement).closest(".bcc-id-close")) return;
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    // Read actual rendered position (CSS centers via translate: -50% -50%)
    const rect = card.getBoundingClientRect();
    cardStartLeft = rect.left;
    cardStartTop = rect.top;
    card.style.translate = "0 0";
    card.style.left = cardStartLeft + "px";
    card.style.top = cardStartTop + "px";
    e.preventDefault();
  });

  function onMouseMove(e: MouseEvent): void {
    if (!dragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    let left = cardStartLeft + dx;
    let top = cardStartTop + dy;
    left = Math.max(0, Math.min(left, window.innerWidth - card.offsetWidth));
    top = Math.max(0, Math.min(top, window.innerHeight - card.offsetHeight));
    card.style.left = left + "px";
    card.style.top = top + "px";
  }

  function onMouseUp(): void {
    dragging = false;
  }

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);

  // ─── Search handlers ───
  searchInput.addEventListener("keydown", function (e: KeyboardEvent) {
    if (e.key === "Enter") doSearch(searchInput.value.trim());
  });

  searchBtn.addEventListener("click", function () {
    doSearch(searchInput.value.trim());
  });

  // Auto-search if name provided
  if (prename) doSearch(prename);
}
