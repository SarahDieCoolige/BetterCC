// ==UserScript==
// @name     Better cc Beta
// @version  0.1.5
//
// @include  https://www.chatcity.de/de/cpop.html?&RURL=//www.chatcity.de/  
// @include  https://www.chatcity.de/de/cpop.html?&RURL=//www.chatcity.de/* 
// 
//  
// @require  http://code.jquery.com/jquery-2.2.4.min.js
//
// @grant    GM_addStyle
// @grant    GM.setValue
// @grant    GM.getValue
// @grant    GM_addValueChangeListener
// @grant    GM_getResourceText
// @grant    GM_log
//
// @downloadURL https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/main/userscript.js
// @updateURL https://raw.githubusercontent.com/SarahDieCoolige/BetterCC/main/userscript.js
// @supportURL https://github.com/SarahDieCoolige/BetterCC/issues
// @homepageURL https://github.com/SarahDieCoolige/BetterCC
// 
// @run-at   document-idle
// ==/UserScript==

"use strict";

function cclog(str, tag = "BetterCC") {
  GM_log(tag + " - " + str);
}

cclog("Version: " + GM_info.script.version);

var bettercc = unsafeWindow.bettercc = {};

const superwhisper = 1;
const replaceInputField = 1;
const hideHeader = 1;
const hideAds = 1;
const hideOtherStuff = 1;


//MAIN CHAT
if (/cpop.html/.test(window.location.href)) {
  
  let gast = (chat_ui === 'h') ? 1 : 0;
  let userStore = (gast) ? "gast" : chat_nick.toLowerCase();
  
  
  if (hideOtherStuff) {
    $('#ww_chat_divide').hide();
    $(".chat_i1").hide();
  }
  
  if (hideAds) {
    $('#adv720').remove();
    $('#right_ad').hide();
  }
  
  if (hideHeader) {
    $('#popup-chat > table > tbody > tr:nth-child(1)').remove();
    $('#ul').addClass('headless');
  }
  
  // replace input field with textarea 
  if (replaceInputField) {
    $('form[name="hold"]').children('input[type="text"]')
    .replaceWith('<textarea placeholder="Du chattest mit allen..." id="custom_input_text" maxlength="1024" name="OUT1" type="text" oninput="" onpaste=""  rows="3" wrap="soft" ></textarea>');
    
    // shift+enter = send 
    $("#custom_input_text").keypress(function (e) {
      if (e.which == 13 && !e.shiftKey) {
        $('form[name="hold"]').submit();
        e.preventDefault();
      }
    });
  } else {
    $('form[name="hold"]').children('input[type="text"]').attr("id", "custom_input_text").attr("placeholder", "Du chattest mit allen...");     
  }
  
  // replace long submit function in input form
  let onSubmit = new Function($('form[name="hold').attr("onsubmit"));
  bettercc.onSubmit = onSubmit;
  $('form[name="hold"]').attr("onsubmit", "bettercc.onSubmit();");
  $('form[name="hold"]').on('submit', function (e) {
    e.preventDefault();
  });
  
  if (superwhisper) {
    $("#fuu :nth-child(4)").after('<a href="javascript://" class="button superwhisper" id="superwhisper" onclick="bettercc.superwhisper(last_id);">» Superwhisper</a>');
    // $('<a href="javascript://" class="button superwhisper" id="superwhisper" onclick="bettercc.superwhisper(last_id);">» Superwhisper</a>' ).insertAfter("#fuu .headline");
  }
  
  // remove timeout from exit button
  $(".b7").attr("onclick", "bye()");
  
  // add gast class to userlist
  if (gast) {
    $('#ul').addClass('gast');
  }
  
  GM_addStyle(`
  
  .chat_ibg{
    padding: 5px 0px 0px 20px !important;
    background: transparent;
  }
  
  a.superwhisper{
    color: green !important;
  }
  
  .ulinner {
    overflow: auto !important;
    padding: 5px 25px 0px 10px;       
  }
  
  .ulinner.headless {
    top: 90px;
  }
  
  .ulinner.headless.gast {
    top: 50px ;
  }
  
  /* replace Backgound images with simple color */
  .ww_chat_header{
    background: #385F7C;
  }
  
  /* replace Backgound images with simple color */
  .ww_chat_footer{
    background: #385F7C ;
  }
  
  .chat_i #custom_input_text {
    width: 95%;
    resize: none;
    font-size: 1.2em;
    padding: 2px;
    margin: 2px;
  }

  #custom_input_text.superwhisper::placeholder { 
  color: #3bc077;
  opacity: 0.9; /* Firefox */
  }
  #custom_input_text::placeholder { 
  /* color: #e96c4c; */
  opacity: 0.7; /* Firefox */
  }
  
  .chat_i {
    padding-left: 10px;
    padding-top: 10px;
    padding-bottom: 10px;
    padding-right: 10px;
  }
  
  .chat_i2 {
    width: 1%;
    padding-top: 0;
    padding-right: 10px;
  }
  
  .chat_i3 {
    width: 20%;
  }
  
  .chat_i4 {
    width: 1%;
  }
  .table{
    border-radius: 10px;
  }
  
  html {
    overflow: hidden;
    overflow-x: hidden;
  }
  
  ::-webkit-scrollbar {
    width: 0px;  /* Remove scrollbar space */
    background: transparent;  
  }
  `);
  
  
  if (superwhisper) {
    let userStoreWhisper = 'whisper_' + userStore;
    let openMsgCmdRegex = /^\/open\s|^\/o\s/;
    let openMsgReplaceRegex = /^\/open\s+|^\/o\s+/gi;
    
    (async function () {
      try {
        var whisperUser = await GM.getValue(userStoreWhisper);
      } catch {
        var whisperUser = "";
      }
      
      await GM.setValue(userStoreWhisper, whisperUser);
      bettercc.superwhisper(whisperUser);
    })();
    
    bettercc.onSubmitSuperwhisper = function (whispernick) {
      var mymsg = document.hold.OUT1.value.trim();
      
      if (mymsg.toLowerCase() === "/open") {
        bettercc.superwhisper("");
        mymsg = ""
        document.hold.OUT1.value = mymsg;
        return false;
      }
      //else if starts with "/open " or "/o "
      else if (openMsgCmdRegex.test(mymsg.toLowerCase())) {
        mymsg = mymsg.replace(openMsgReplaceRegex, '');
      }
      else if (!mymsg.startsWith("/")) {
        mymsg = "/w " + whispernick + " " + mymsg;
      }
      
      document.hold.OUT1.value = mymsg;
      bettercc.onSubmit();
    }
    
    bettercc.superwhisper = async function (whispernick) {
      var input = $("#custom_input_text");
      var placeholder = input.attr("placeholder");
      
      if (placeholder.includes(whispernick) || whispernick === "" || whispernick === undefined) {
        $('form[name="hold').attr("onsubmit", "bettercc.onSubmit();");
        $('#custom_input_text').removeClass('superwhisper');
        await GM.setValue(userStoreWhisper, "");
        placeholder = "Du chattest mit allen..."
      } else {
        $('form[name="hold').attr("onsubmit", 'bettercc.onSubmitSuperwhisper("' + whispernick + '");');
        $('#custom_input_text').addClass('superwhisper');
        await GM.setValue(userStoreWhisper, whispernick);
        placeholder = "Du flüsterst mit " + whispernick + '...\tTipps: "/open", "/open Hi All :)"';
      }
      input.attr("placeholder", placeholder);
      $('.ulist-popup').hide();
    }
  }
  
} //MAIN CHAT
