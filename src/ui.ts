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
  try {
    var $form = $('form[name="hold"]');
    if ($form.length === 0) {
      throw new Error('Form with name "hold" not found.');
    }

    var $inputText = $form.children('input[type="text"]');
    if ($inputText.length === 0) {
      throw new Error('Input of type "text" not found in the form.');
    }

    var originalInput: any = null;

    if (replace) {
      var newTextarea = $("<textarea>", {
        id: "custom_input_text",
        placeholder: "Du chattest mit allen...",
        maxlength: 1024,
        name: "OUT1",
        rows: 3,
        wrap: "soft",
      });

      originalInput = $inputText.clone();

      $inputText.replaceWith(newTextarea);

      $("#custom_input_text").keypress(function (e: any) {
        if (e.which == 13 && !e.shiftKey) {
          $form.submit();
          e.preventDefault();
        }
      });
    } else {
      $inputText
        .attr("id", "custom_input_text")
        .attr("placeholder", "Du chattest mit allen...");
    }
  } catch (error: any) {
    console.error("An error occurred in betterInput:", error.message);

    if (replace && originalInput) {
      $form.children("#custom_input_text").replaceWith(originalInput);
    }
  }
}

export function redesignFooter(): void {
  var $footerTable = $(".ww_chat_footer_table");
  if (!$footerTable.length) return;

  var $rows = $footerTable.find("> tbody > tr");
  if ($rows.length < 2) return;

  var $firstRow = $rows.eq(0);
  var $secondRow = $rows.eq(1);

  var $actionCell = $firstRow.find("td.chat_i3");
  var $exitCell = $firstRow.find("td.chat_i4");
  var $colorCell = $secondRow.find("td.chat_i4");
  if (!$actionCell.length || !$colorCell.length) return;

  // ─── Collect elements ───
  var $holdForm = $("form[name='hold']");
  var $autoscrollForm = $("form[name='OF']");
  var $statusSpan = $("#chatout_status");
  var $debugTools = $("#chatout_debug_tools");
  var $asCheckbox = $autoscrollForm.find('input[name="AS"]');

  var $colorWrap   = $(".bcc-color-picker-wrap");
  var $reloadBtn   = $("#reloadbutton");
  var $helpBtn     = $("#helpbutton");
  var $settingsBtn = $("#settingsbutton");

  var $anmelden   = $actionCell.find("a.b3");
  var $abmelden   = $actionCell.find("a.b2");
  var $sysMsgsOn  = $actionCell.find("a.b5");
  var $sysMsgsOff = $actionCell.find("a.b6");
  var $forumLink  = $actionCell.find("a.b15");
  var $idLink     = $actionCell.find("a.b16");
  var $upHelpLink = $actionCell.find("a.b1");

  var $colors = $colorCell.find("a");
  var $exit   = $exitCell.find("a");

  // Hide autoscroll form (keep functional for setmove())
  $autoscrollForm.hide();

  // ─── Build autoscroll toggle button ───
  var $autoscrollBtn = $("<button>", {
    id: "bcc-autoscroll",
    type: "button",
    class: "bcc-icon-btn" + ($asCheckbox.prop("checked") ? " bcc-active" : ""),
    title: "Autoscroll ein/aus",
    html: '<i class="fas fa-angle-double-down"></i>',
  }).on("click", function () {
    $asCheckbox[0].click();
    $(this).toggleClass("bcc-active", $asCheckbox.prop("checked"));
  });

  // ─── Monkey-patch chatout_setstatus: color reload button ───
  $statusSpan.hide();
  if (typeof unsafeWindow.chatout_setstatus === "function") {
    var origSetStatus = unsafeWindow.chatout_setstatus;
    unsafeWindow.chatout_setstatus = function (text: string, color: string, bold: boolean) {
      var el = document.getElementById("chatout_status");
      if (el) el.title = text;
      var reloadBtn = document.getElementById("reloadbutton");
      if (reloadBtn) {
        reloadBtn.style.color = color || "#888";
        reloadBtn.title = "Chat neu laden — " + text;
      }
      origSetStatus.call(this, text, color, bold);
    };
  }

  // ─── Build pill containers ───
  $anmelden.add($abmelden).add($sysMsgsOn).add($sysMsgsOff)
    .add($forumLink).add($idLink).add($upHelpLink)
    .addClass("bcc-icon-btn");

  var $accountAlertsPill = $('<div class="bcc-pill bcc-pill-2"></div>');
  $accountAlertsPill.append($anmelden, $sysMsgsOn, $abmelden, $sysMsgsOff);

  var $chatActionsPill = $('<div class="bcc-pill bcc-pill-2 bcc-chat-actions"></div>');
  $chatActionsPill.append($autoscrollBtn, $reloadBtn, $colorWrap);

  var $betterccPill = $('<div class="bcc-pill"></div>');
  $betterccPill.append($helpBtn, $settingsBtn);

  var $colorPill = $('<div class="bcc-pill bcc-pill-3"></div>');
  $colors.addClass("bcc-color-btn").appendTo($colorPill);

  var $linksPill = $('<div class="bcc-pill bcc-pill-2 bcc-links"></div>');
  $linksPill.append($idLink, $forumLink, $upHelpLink);

  $exit.addClass("bcc-icon-btn bcc-danger");

  // ─── Clean up empty wrapper ───
  $("#betteroptions").remove();

  // ─── Build main footer ───
  var $inputArea = $('<div class="bcc-input-area"></div>');
  $inputArea.append($holdForm, $debugTools, $statusSpan);

  var $footer = $('<div class="bcc-footer"></div>');
  $footer.append($inputArea, $accountAlertsPill, $chatActionsPill, $betterccPill, $colorPill, $linksPill, $exit);

  // ─── Replace table ───
  $footerTable.replaceWith($footer);
}
