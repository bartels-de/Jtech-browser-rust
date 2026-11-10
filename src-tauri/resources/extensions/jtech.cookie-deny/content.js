(function(){
'use strict';
if(window.top!==window)return;

var TRIED=[];

function click(sel){
  var el=document.querySelector(sel);
  if(el && !TRIED.includes(sel)){el.click();TRIED.push(sel);return true;}
  return false;
}

function clickText(patterns){
  var all=document.querySelectorAll('button,a,span,div,input[type="button"]');
  for(var i=0;i<all.length;i++){
    var el=all[i];
    var t=(el.textContent||el.value||'').trim().toLowerCase();
    if(!t)continue;
    for(var j=0;j<patterns.length;j++){
      if(t.indexOf(patterns[j])!==-1 && !TRIED.includes(el)){
        el.click();TRIED.push(el);return true;
      }
    }
  }
  return false;
}

function tryDeny(){
  // OneTrust
  if(click('#onetrust-reject-all-handler')) return;
  if(click('button[id*="reject"][class*="onetrust"]')) return;
  // Cookiebot
  if(click('#CybotCookiebotDialogBodyButtonDecline')) return;
  // Usercentrics
  if(click('button[data-testid="uc-deny-all-button"]')) return;
  if(click('button[class*="usercentrics-deny"]')) return;
  // Complianz / Borlabs / generic
  if(clickText(['ablehnen','reject all','decline','nur notwendig','necessary only','essential only','nur essenziell','nur erforderlich','disagree','do not agree','only necessary'])) return;
  // IAB TCF v2 buttons
  if(click('button[aria-label*="Reject"]')) return;
  if(click('button[title*="Reject"]')) return;
}

function hideOverlays(){
  var sels=[
    '#onetrust-banner-sdk','#CybotCookiebotDialog','#usercentrics-root','#cmpbox','#cmpbox2',
    '#CookieConsent','#gdpr-consent-tool-wrapper','#klaro','.cookiefirst-root','#cc--main',
    '#axeptio_overlay','#tarteaucitronRoot','#sd-cmp','#truste-consent-track','#consent_blackbar',
    '#cookie-law-info-bar','#moove_gdpr_cookie_info_bar','#cookie-alert','#sp-cc','#tracking-consent',
    '#BorlabsCookieBox','#cmplz-cookiebanner-container','#complianz','#appconsent','#cookiesBanner',
    '#cookie-consent','#CybotCookiebotDialog'
  ];
  sels.forEach(function(sel){
    var els=document.querySelectorAll(sel);
    for(var i=0;i<els.length;i++) els[i].style.display='none';
  });
  document.documentElement.classList.remove('onetrust-no-scroll','usercentrics-no-scroll','cookiebot-no-scroll');
  document.body.classList.remove('onetrust-no-scroll','cookiebot-no-scroll');
  document.body.style.overflow='';
  document.documentElement.style.overflow='';
}

function run(){
  tryDeny();
  hideOverlays();
}

run();
setTimeout(run,500);
setTimeout(run,1500);
setTimeout(run,3000);

var obs=new MutationObserver(function(){run();});
if(document.documentElement) obs.observe(document.documentElement,{childList:true,subtree:true});
})();
