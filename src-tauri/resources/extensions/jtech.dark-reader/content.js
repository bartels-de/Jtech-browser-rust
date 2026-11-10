(function(){
'use strict';
if(window.top!==window)return;

function apply(){
  if(!document.documentElement)return;
  document.documentElement.classList.add('jtech-dark-reader');
}

function shouldInvert(){
  // Respect sites with their own dark mode by checking for common dark-mode markers.
  var styles=getComputedStyle(document.documentElement);
  var bg=styles.backgroundColor||'';
  var isDark=/rgba?\(\s*(1[0-9]|2[0-9]|3[0-9])\s*,/.test(bg);
  return !isDark;
}

function init(){
  if(shouldInvert()) apply();
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',init);
}else{
  init();
}
apply();
})();
