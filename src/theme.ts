// ─── Color engine: setColors, applyStoredColors, setTheme, color observer ───

import { getChatDoc, applyThemeToIframe, waitForElements } from "./utils";

export function doColorStuff(
  userStoreColor: string,
  userStoreColorScheme: string,
  bgDef: string,
  fgDef: string,
  printHelpFn: () => void,
  showSettingsModalFn: () => void,
  cclogFn: (str: string, tag?: string) => void
): void {
  // Remove table border
  const rOffTable = document.querySelector("#r_off1 table");
  if (rOffTable) rOffTable.setAttribute("border", "0");

  const uStats = document.querySelector("#u_stats") as HTMLElement | null;
  if (uStats) uStats.style.display = "none";

  waitForElements(
    "#u_stats a.unc .value",
    function (_el: Element) {
      const nameSpans = document.querySelectorAll("#u_stats span.name");
      nameSpans.forEach(s => s.remove());

      const uStatsClone = (document.querySelector("#u_stats") as HTMLElement).cloneNode(true) as HTMLElement;
      uStatsClone.id = "u_stats_clone";
      uStatsClone.style.display = "";
      (document.querySelector("#u_stats") as HTMLElement).after(uStatsClone);

      const cloneValues = uStatsClone.querySelectorAll(".value");
      cloneValues.forEach(v => v.remove());

      const uonlA = uStatsClone.querySelector("a.uonl");
      if (uonlA) uonlA.insertAdjacentHTML("beforeend", '<span id="uonl_span" class="fa-stack fa-2x has-badge value no" data-count="0">  <i class="fa fa-id-card fa-stack-1x"></i></span>');

      const ufriA = uStatsClone.querySelector("a.ufri");
      if (ufriA) ufriA.insertAdjacentHTML("beforeend", '<span id="ufri_span" class="fa-stack fa-2x has-badge value no" data-count="0">  <i class="fa fa-user-plus fa-stack-1x"></i></span>');

      const uncA = uStatsClone.querySelector("a.unc");
      if (uncA) uncA.insertAdjacentHTML("beforeend", '<span id="unc_span" class="fa-stack fa-2x has-badge value no" data-count="0">  <i class="fa fa-envelope fa-stack-1x"></i></span>');

      updateStats();
      setInterval(updateStats, 10000);
    },
    true,
    100
  );

  function updateStats() {
    var test = new (unsafeWindow.ajax || (window as any).ajax)(unsafeWindow.PAJAX + "chat_info_friends_nc.html", {
      update: "u_stats",
    });

    var uStatsEl = document.querySelector("#u_stats");
    var friendsOnline = uStatsEl?.querySelector("a.uonl .value")?.textContent || "0";
    var frendRequests = uStatsEl?.querySelector("a.ufri .value")?.textContent || "0";
    var mailCount = uStatsEl?.querySelector("a.unc .value")?.textContent || "0";

    const uonlSpan = document.querySelector("#uonl_span");
    if (uonlSpan) {
      uonlSpan.setAttribute("data-count", friendsOnline);
      uonlSpan.classList.toggle("no", Number(friendsOnline) < 1);
    }
    const ufriSpan = document.querySelector("#ufri_span");
    if (ufriSpan) {
      ufriSpan.setAttribute("data-count", frendRequests);
      ufriSpan.classList.toggle("no", Number(frendRequests) < 1);
    }
    const uncSpan = document.querySelector("#unc_span");
    if (uncSpan) {
      uncSpan.setAttribute("data-count", mailCount);
      uncSpan.classList.toggle("no", Number(mailCount) < 1);
    }
  }

  // Wrap form with options container
  const ofForm = document.querySelector('form[name="OF"]');
  if (ofForm) {
    const wrapper = document.createElement("div");
    wrapper.id = "options";
    ofForm.parentNode?.insertBefore(wrapper, ofForm);
    wrapper.appendChild(ofForm);
  }

  const betterOpts = document.createElement("div");
  betterOpts.id = "betteroptions";
  document.querySelector("#options")?.appendChild(betterOpts);

  // Color picker
  var colorWrap = document.createElement("label");
  colorWrap.htmlFor = "bgcolorpicker";
  colorWrap.className = "bcc-color-btn bcc-color-picker-wrap";
  colorWrap.style.setProperty("--swatch-color", "#ff0000");

  const bgPicker = document.createElement("input");
  bgPicker.type = "color";
  bgPicker.id = "bgcolorpicker";
  bgPicker.value = "#ff0000";
  bgPicker.className = "bcc-color-swatch-hidden";

  bgPicker.addEventListener("input", function (this: HTMLInputElement) {
    var bg = this.value.substring(1);
    var fg = fgDef;
    colorWrap.style.setProperty("--swatch-color", this.value);
    (async () => {
      await GM.setValue(userStoreColor, bg);
    })();
    (unsafeWindow.bettercc as any).setColors(bg, fg, 0);
  });
  bgPicker.addEventListener("change", function (this: HTMLInputElement) {
    var bg = this.value.substring(1);
    (async () => {
      await GM.setValue(userStoreColor, bg);
    })();
  });

  colorWrap.appendChild(bgPicker);
  betterOpts.appendChild(colorWrap);

  // Reload button
  const reloadBtn = document.createElement("button");
  reloadBtn.id = "reloadbutton";
  reloadBtn.type = "button";
  reloadBtn.className = "bcc-icon-btn";
  reloadBtn.title = "Chat neu laden (mimimi)";
  reloadBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
  reloadBtn.addEventListener("click", function () {
    (unsafeWindow.bettercc as any).reloadChat();
  });
  betterOpts.appendChild(reloadBtn);

  // Help button
  const helpBtn = document.createElement("button");
  helpBtn.id = "helpbutton";
  helpBtn.type = "button";
  helpBtn.className = "bcc-icon-btn";
  helpBtn.title = "BetterCC Hilfe";
  helpBtn.innerHTML = '<i class="fas fa-question-circle"></i>';
  helpBtn.addEventListener("click", function () {
    printHelpFn();
  });
  betterOpts.appendChild(helpBtn);

  // Settings button
  const settingsBtn = document.createElement("button");
  settingsBtn.id = "settingsbutton";
  settingsBtn.type = "button";
  settingsBtn.className = "bcc-icon-btn";
  settingsBtn.title = "BetterCC Settings";
  settingsBtn.innerHTML = '<i class="fas fa-cog"></i>';
  settingsBtn.addEventListener("click", function () {
    showSettingsModalFn();
  });
  betterOpts.appendChild(settingsBtn);

  setTimeout(setTheme, 1000);

  (unsafeWindow.bettercc as any).reloadChat = function reloadChat() {
    if (unsafeWindow.chatout_auth_dead) {
      cclogFn("reloadChat: auth_dead, doing full page reload");
      location.reload();
      return;
    }
    if (unsafeWindow.chatout_ws) {
      unsafeWindow.chatout_ws.close();
    }
    setTimeout(setTheme, 1000);
  };

  function setTheme() {
    (async () => {
      let bg = await GM.getValue(userStoreColor, bgDef);
      await GM.setValue(userStoreColor, bg);

      let storedScheme = await GM.getValue(userStoreColorScheme, null);

      if (storedScheme && storedScheme.bgColor === bg) {
        applyStoredColors(storedScheme);
      } else {
        setColors(bg, fgDef);
      }
    })();
  }

  function applyStoredColors(colorScheme: any) {
    let $root = $(":root");
    $root.css("--chatBackground", colorScheme.chatBg);
    $root.css("--chatText", colorScheme.chatFg);
    $root.css("--buttonColor", colorScheme.buttoncolor);
    $root.css("--buttonText", colorScheme.buttontextcolor);
    $root.css("--inputBackground", colorScheme.inputcolor);
    $root.css("--inputText", colorScheme.inputtextcolor);
    $root.css("--ulistColor", colorScheme.ulistcolor);
    $root.css("--ulistText", colorScheme.ulisttextcolor);
    $root.css("--optionsText", colorScheme.optionstextcolor);
    $root.css("--footerBackground", colorScheme.footercolor);
    $root.css("--placeholderColor", colorScheme.placeholdercolor);
    $root.css("--iconColor", colorScheme.iconcolor);
    $root.css("--superwhispercolor", colorScheme.superwhispercolor);
    $root.css("--superbancolor", colorScheme.superbancolor);

    applyThemeToIframe(colorScheme.chatBg, colorScheme.chatFg);

    $("#bgcolorpicker").val("#" + colorScheme.bgColor);
    $(".bcc-color-picker-wrap").css("--swatch-color", "#" + colorScheme.bgColor);

    if (tinycolor.isReadable(colorScheme.ulistcolor, colorScheme.ulisttextcolor, {})) {
      $("#ul").addClass("light").removeClass("dark");
    } else {
      $("#ul").addClass("dark").removeClass("light");
    }
  }

  function setColors(bg: string, fg: string) {
    let chatBg = tinycolor(bg);
    let chatFg = tinycolor(bg);

    chatFg = tinycolor(bg);

    if (chatBg.isLight()) {
      chatFg = chatFg.darken(40);
    } else {
      chatFg = chatFg.lighten(20);
      chatFg = chatFg.brighten(40);
    }

    let anaChatBg = chatBg.analogous();
    let monoChatBg = chatBg.monochromatic();
    let triadChatBg = chatBg.triad();

    let anaChatFg = chatFg.analogous();
    let monoChatFg = chatFg.monochromatic();
    let triadChatFg = chatFg.triad();
    chatFg = tinycolor.mostReadable(chatBg, anaChatFg.concat(monoChatFg), {
      includeFallbackColors: false,
    });

    $("#bgcolorpicker").val("#" + bg);

    let ulistcolor: any,
      footercolor: any,
      inputcolor: any,
      inputtextcolor: any,
      optionstextcolor: any,
      placeholdercolor: any,
      ulisttextcolor: any,
      buttoncolor: any,
      buttontextcolor: any,
      iconcolor: any,
      superwhispercolor: any,
      superbancolor: any;

    if (
      chatBg.toHsl().l > 0.8 ||
      (chatBg.toHsl().s >= 0.97 && chatBg.toHsl().l >= 0.45)
    ) {
      footercolor = chatBg.clone().darken(15).brighten(5);
    } else {
      footercolor = chatBg.clone().lighten(5).brighten(5);
    }
    ulistcolor = footercolor.clone().lighten(5);

    if (footercolor.toHsl().l < 0.2) {
      inputcolor = footercolor
        .clone()
        .darken(10)
        .desaturate(0);
    } else {
      inputcolor = footercolor
        .clone()
        .brighten(30)
        .desaturate(0);
    }

    inputtextcolor = tinycolor.mostReadable(
      inputcolor,
      inputcolor.monochromatic(),
      { includeFallbackColors: false }
    );

    optionstextcolor = tinycolor.mostReadable(
      footercolor,
      monoChatBg.concat(anaChatBg),
      { includeFallbackColors: false }
    );

    placeholdercolor = tinycolor.mostReadable(
      inputcolor,
      inputcolor.monochromatic(),
      { includeFallbackColors: false }
    );

    let shades: any[] = [];

    for (var i = 10; i <= 50; i += 10) {
      shades.push(ulistcolor.clone().darken(i));
      shades.push(ulistcolor.clone().darken(-i));
    }

    ulisttextcolor = tinycolor.mostReadable(
      ulistcolor,
      monoChatBg.concat(shades),
      { includeFallbackColors: false }
    );

    buttoncolor = inputcolor;
    buttontextcolor = tinycolor.mostReadable(buttoncolor, monoChatBg, {
      includeFallbackColors: false,
    });

    iconcolor = tinycolor.mostReadable(ulistcolor, monoChatBg, {
      includeFallbackColors: false,
    });

    superwhispercolor = triadChatBg[1];
    superbancolor = triadChatBg[2];

    let colorScheme: any = {
      bgColor: bg,
      chatBg: chatBg.toHslString(),
      chatFg: chatFg.toHslString(),
      buttoncolor: buttoncolor.toHslString(),
      buttontextcolor: buttontextcolor.toHslString(),
      inputcolor: inputcolor.toHslString(),
      inputtextcolor: inputtextcolor.toHslString(),
      ulistcolor: ulistcolor.toHslString(),
      ulisttextcolor: ulisttextcolor.toHslString(),
      optionstextcolor: optionstextcolor.toHslString(),
      footercolor: footercolor.toHslString(),
      placeholdercolor: placeholdercolor.toHslString(),
      iconcolor: iconcolor.toHslString(),
      superwhispercolor: superwhispercolor.toHslString(),
      superbancolor: superbancolor.toHslString()
    };

    (async () => {
      await GM.setValue(userStoreColorScheme, colorScheme);
    })();

    applyStoredColors(colorScheme);
  }

  // ─── Color mutation observer ───

  if (!(window as any).betterccColorObserver) {
    const root = document.documentElement;
    let isApplyingColors = false;

    (window as any).betterccColorObserver = new MutationObserver(async (mutations: MutationRecord[]) => {
      if (isApplyingColors) return;

      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.attributeName === "style") {
          try {
            isApplyingColors = true;

            let bg = await GM.getValue(userStoreColor, bgDef);
            let storedScheme = await GM.getValue(userStoreColorScheme, null);

            console.log("BetterCC: Color mutation detected");

            if (storedScheme && storedScheme.bgColor === bg) {
              console.log("BetterCC: Reapplying stored colors for", bg);
              applyStoredColors(storedScheme);
            } else {
              setTheme();
            }
          } finally {
            isApplyingColors = false;
          }
          break;
        }
      }
    });
    (window as any).betterccColorObserver.observe(root, { attributes: true, attributeFilter: ["style"] });
  }

  (unsafeWindow.bettercc as any).setColors = setColors;
  (unsafeWindow.bettercc as any).setTheme = setTheme;
}
