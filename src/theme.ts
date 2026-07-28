// ─── Color engine: setColors, applyStoredColors, setTheme, color observer ───

import { getChatDoc, applyThemeToIframe } from "./utils";

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
  $("#r_off1 table").attr("border", "0");

  $("#u_stats").hide();
  GM_wrench.waitForKeyElements(
    "#u_stats a.unc .value",
    function () {
      $("#u_stats span.name").remove();
      $("#u_stats")
        .clone(true)
        .attr("id", "u_stats_clone")
        .show()
        .insertAfter("#u_stats");

      $("#u_stats_clone .value").remove();

      $(
        '<span id="uonl_span" class="fa-stack fa-2x has-badge value no" data-count="0">  <i class="fa fa-id-card fa-stack-1x"></i></span>'
      ).appendTo("#u_stats_clone a.uonl");

      $(
        '<span id="ufri_span" class="fa-stack fa-2x has-badge value no" data-count="0">  <i class="fa fa-user-plus fa-stack-1x"></i></span>'
      ).appendTo("#u_stats_clone a.ufri");

      $(
        '<span id="unc_span" class="fa-stack fa-2x has-badge value no" data-count="0">  <i class="fa fa-envelope fa-stack-1x"></i></span>'
      ).appendTo("#u_stats_clone a.unc");

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

    var friendsOnline = $("#u_stats a.uonl .value").text();
    var frendRequests = $("#u_stats a.ufri .value").text();
    var mailCount = $("#u_stats a.unc .value").text();

    $("#uonl_span")
      .attr("data-count", friendsOnline)
      .toggleClass("no", friendsOnline < 1);
    $("#ufri_span")
      .attr("data-count", frendRequests)
      .toggleClass("no", frendRequests < 1);
    $("#unc_span")
      .attr("data-count", mailCount)
      .toggleClass("no", mailCount < 1);
  }

  $('form[name="OF"]').wrap('<div id="options"></div>');

  $('<div id="betteroptions"></div>').appendTo("#options");

  var $colorWrap = $('<label for="bgcolorpicker" class="bcc-color-btn bcc-color-picker-wrap"></label>');
  $colorWrap.css("--swatch-color", "#ff0000");
  $('<input type="color" id="bgcolorpicker">')
    .val("#ff0000")
    .addClass("bcc-color-swatch-hidden")
    .on("input", function (this: HTMLInputElement, e: any) {
      var bg = this.value.substring(1);
      var fg = fgDef;
      $colorWrap.css("--swatch-color", this.value);
      (async () => {
        await GM.setValue(userStoreColor, bg);
      })();
      (unsafeWindow.bettercc as any).setColors(bg, fg, 0);
    })
    .change(function (this: HTMLInputElement) {
      var bg = this.value.substring(1);
      (async () => {
        await GM.setValue(userStoreColor, bg);
      })();
    })
    .appendTo($colorWrap);
  $colorWrap.appendTo("#betteroptions");

  $("<button>", {
    id: "reloadbutton",
    type: "button",
    class: "bcc-icon-btn",
    title: "Chat neu laden (mimimi)",
    html: '<i class="fas fa-sync-alt"></i>',
  })
    .on("click", function () {
      (unsafeWindow.bettercc as any).reloadChat();
    })
    .appendTo("#betteroptions");

  $("<button>", {
    id: "helpbutton",
    type: "button",
    class: "bcc-icon-btn",
    title: "BetterCC Hilfe",
    html: '<i class="fas fa-question-circle"></i>',
  })
    .on("click", function () {
      printHelpFn();
    })
    .appendTo("#betteroptions");

  $("<button>", {
    id: "settingsbutton",
    type: "button",
    class: "bcc-icon-btn",
    title: "BetterCC Settings",
    html: '<i class="fas fa-cog"></i>',
  })
    .on("click", function () {
      showSettingsModalFn();
    })
    .appendTo("#betteroptions");

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
