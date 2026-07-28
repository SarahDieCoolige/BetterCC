// ─── Superban: enableSuperban, persistent user ignore list ───

import { cclog, ccnotify } from "./utils";

export function enableSuperban(userStore: string): void {
  // add superban option to userpopup
  const fuu = document.querySelector("#fuu");
  if (fuu) fuu.insertAdjacentHTML("beforeend",
    '<a href="javascript://" class="button superban" id="superban" onclick="bettercc.superban(last_id);">» Better Ignore</a>'
  );

  // get online users
  const awScript = document.createElement("script");
  awScript.src = "//images.chatcity.de/script/aw.js?r=" + Math.round(new Date().getTime() / 1000);
  awScript.type = "text/javascript";
  document.head.appendChild(awScript);

  var alreadyBanned: string[] = [];

  let userStoreBan = "ban_" + userStore;
  // listen for manual changes in gm value
  let listenerId = GM_addValueChangeListener(
    userStoreBan,
    (unsafeWindow.bettercc as any).getSuperbans
  );

  (unsafeWindow.bettercc as any).getSuperbans = async function () {
    var superbans: string[] = [];
    try {
      superbans = Array.from(await GM.getValue(userStoreBan))
        .map((v: any) => v.toLowerCase())
        .sort();
    } catch {
      superbans = [];
    }
    await GM.setValue(userStoreBan, superbans);
    return superbans;
  };

  // start banning
  var refreshUsersInterval = setInterval(refreshUserList, 4000);

  (unsafeWindow.bettercc as any).superban = async function (nickToBan: string) {
    nickToBan = nickToBan.toLowerCase();
    let superbans = await (unsafeWindow.bettercc as any).getSuperbans();
    var confirmStr = "";
    if (!superbans.includes(nickToBan)) {
      confirmStr =
        "Möchtest du " +
        nickToBan.toUpperCase() +
        " wirklich dauerhaft ignorieren?";
      if (window.confirm(confirmStr)) {
        superbans.push(nickToBan);
        ccnotify(
          nickToBan + " wird ab jetzt geblockt!",
          "Better Ignore",
          "banned"
        );
      }
    } else {
      confirmStr =
        "Möchtest du " +
        nickToBan.toUpperCase() +
        " wirklich aus deiner Ignoreliste entfernen?";
      if (window.confirm(confirmStr)) {
	        superbans = superbans.filter(function (item: string) {
          return String(item) !== nickToBan;
        });
        ccnotify(
          nickToBan + " wird nicht mehr geblockt!",
          "Better Ignore",
          "unbanned"
        );

        // unban in chat
        new (unsafeWindow.ajax || (window as any).ajax)(
          unsafeWindow.PCHAT +
            "/chatin?SID=" +
            unsafeWindow.chat_sid +
            "&ID=" +
            unsafeWindow.chat_id +
            "&OUT=" +
            encodeURIComponent("/ignore " + nickToBan) +
            "&x=" +
            Math.random(),
          { method: "get" }
        );
        //$('#fuu > a.hasText(nickToBan).button.superban').text("» Superban");
      }
    }

    GM.setValue(userStoreBan, superbans.sort());
    ccnotify(
      "Schreib <b>/superban</b> oder <b>/sb</b> um deine <b>Bannliste</b> zu sehen",
      "Better Ignore",
      "help"
    );
    const popup2 = document.querySelector(".ulist-popup") as HTMLElement | null;
    if (popup2) popup2.style.display = "none";
  };

  async function refreshUserList() {
    var time = Math.round(new Date().getTime() / 1000);
    var url = "//images.chatcity.de/script/aw.js?r=";
    var src = url + time;

    const existing = document.querySelector("#userlistjs");
    if (existing) existing.remove();

    const userlistScript = document.createElement("script");
    userlistScript.id = "userlistjs";
    userlistScript.src = src;
    userlistScript.type = "text/javascript";
    document.head.appendChild(userlistScript);

    var superbans = await (unsafeWindow.bettercc as any).getSuperbans();

    var users = getUsers();
    var usersToBeBanned = getUsersToBeBanned(users, superbans);
    if (usersToBeBanned.length) {
      cclog("Users to be banned:\n\t" + usersToBeBanned);
      clearInterval(refreshUsersInterval);
      await banUsers(usersToBeBanned);
      refreshUsersInterval = setInterval(refreshUserList, 4000);
    }
    unsafeWindow.superbans = superbans;
  }

  function getUsers() {
    var users_gloabal: string[] = [];
    for (var i = 2; i < unsafeWindow.cha.length; i += 3) {
      users_gloabal = users_gloabal.concat(
        unsafeWindow.cha[i].toLowerCase().split(" ").filter(Boolean)
      );
    }

    var users_channel: string[] = [];
    if (unsafeWindow.cha_my) {
      for (var j = 0; j < unsafeWindow.cha_my.length; j += 2) {
        users_channel = users_channel.concat(
          unsafeWindow.cha_my[j].toLowerCase().split(" ").filter(Boolean)
        );
      }
    }

    var users_tmp = users_gloabal.concat(users_channel);
    var users = users_tmp.filter(
      (item, pos) => users_tmp.indexOf(item) === pos
    );

    return users;
  }

  function getUsersToBeBanned(users: string[], superbans: string[]) {
    var usersToBeBanned: string[] = [];

    for (const banUser of superbans) {
      if (
        !usersToBeBanned.includes(banUser) &&
        !alreadyBanned.includes(banUser) &&
        users.includes(banUser)
      ) {
        usersToBeBanned.push(banUser);
      }
    }
    return usersToBeBanned;
  }

  const sleepNow = (delay: number) =>
    new Promise((resolve) => setTimeout(resolve, delay));

  async function banUsers(users: string[]) {
    for (const user of users) {
      await banUser(user);
      users = users.filter((val) => val !== user);
      await sleepNow(1150);
    }
  }

  async function banUser(user: string) {
    new (unsafeWindow.ajax || (window as any).ajax)(
      unsafeWindow.PCHAT +
        "/chatin?SID=" +
        unsafeWindow.chat_sid +
        "&ID=" +
        unsafeWindow.chat_id +
        "&OUT=" +
        encodeURIComponent("/ignore " + user) +
        "&x=" +
        Math.random(),
      { method: "get" }
    );
    alreadyBanned.push(user);
    cclog("Banned " + user);
    ccnotify(
      user + " kann dir nicht mehr schreiben",
      "Better Ignore",
      "banned"
    );
    unsafeWindow.alreadyBanned = alreadyBanned;
  }
}
