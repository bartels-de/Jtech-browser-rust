(function(){
'use strict';
if(window.top!==window)return;

document.documentElement.classList.add('jtech-twitter-cleanup');

function hidePromoted(){
  var articles=document.querySelectorAll('article');
  for(var i=0;i<articles.length;i++){
    var a=articles[i];
    if(a.querySelector('[data-testid="videoPlayer"]') && a.innerText.indexOf('Promoted')!==-1){
      a.style.display='none';
      continue;
    }
    var spans=a.querySelectorAll('span');
    for(var j=0;j<spans.length;j++){
      var t=spans[j].textContent||'';
      if(/Promoted|Gesponsert|Sponsored|Ad\s*$/i.test(t)){
        a.style.display='none';
        break;
      }
    }
  }
}

function clean(){
  hidePromoted();
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',clean);
}else{
  clean();
}

var obs=new MutationObserver(function(){clean();});
if(document.documentElement) obs.observe(document.documentElement,{childList:true,subtree:true});
else document.addEventListener('DOMContentLoaded',function(){obs.observe(document.documentElement,{childList:true,subtree:true});});
})();
