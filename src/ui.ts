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
  $("#fuu").append(
    '<a href="javascript://" class="button pinuser" id="pinUser" onclick="bettercc.addPinnedUser(last_id)">» Pin</a>'
  );

  let userStorePinnedUsers = "pinned_" + userStore;

  // Function to add a user to the pinned users list
  (unsafeWindow.bettercc as any).addPinnedUser = async function (username: string) {
    username = username.toLowerCase();

    let pinnedUsers = GM_getValue(userStorePinnedUsers, []);

    if (!pinnedUsers.includes(username)) {
      pinnedUsers.push(username);
    } else {
      pinnedUsers = pinnedUsers.filter(function (item: any) {
        return String(item) !== username;
      });
    }

    GM_setValue(userStorePinnedUsers, pinnedUsers);
    (unsafeWindow as any).set_uinfo1();
    $(".ulist-popup").hide();
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
  try {
    form = document.querySelector('form[name="hold"]') as HTMLFormElement | null;
    if (!form) {
      throw new Error('Form with name "hold" not found.');
    }

    const inputText = form.querySelector('input[type="text"]') as HTMLInputElement | null;
    if (!inputText) {
      throw new Error('Input of type "text" not found in the form.');
    }

    var originalInput: Element | null = null;

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
          form.submit();
          e.preventDefault();
        }
      });
    } else {
      inputText.id = "custom_input_text";
      inputText.placeholder = "Du chattest mit allen...";
    }
  } catch (error: any) {
    console.error("An error occurred in betterInput:", error.message);

    if (replace && originalInput) {
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
