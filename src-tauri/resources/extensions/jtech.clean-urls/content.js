(function(){
'use strict';
if(window.top!==window)return;

var PARAMS=[
  'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
  'utm_id','utm_reader','utm_place','utm_userid',
  'fbclid','gclid','dclid','ocid','twclid','li_fat_id',
  'mc_cid','mc_eid','ml_subscriber','ml_subscriber_hash',
  'ref','referrer','referer','source','campaign_id','ad_id','adset_id',
  'yclid','pk_campaign','pk_kwd','piwik_campaign','piwik_kwd',
  'wickedid','hsa_cam','hsa_grp','hsa_mt','hsa_src','hsa_ad','hsa_acc','hsa_net','hsa_kw'
];

function clean(url){
  try{
    var u=new URL(url,location.href);
    var changed=false;
    PARAMS.forEach(function(p){
      if(u.searchParams.has(p)){u.searchParams.delete(p);changed=true;}
    });
    if(!changed)return null;
    return u.toString();
  }catch(e){return null;}
}

function cleanLocation(){
  var c=clean(location.href);
  if(c&&c!==location.href){
    history.replaceState(history.state,'',c);
  }
}

function cleanLink(el){
  var href=el.getAttribute('href');
  if(!href)return;
  var c=clean(href);
  if(c&&c!==href) el.setAttribute('href',c);
}

function onClick(e){
  var a=e.target.closest?e.target.closest('a[href]'):null;
  if(!a)return;
  var c=clean(a.href);
  if(c&&c!==a.href){
    e.preventDefault();
    e.stopImmediatePropagation();
    location.href=c;
  }
}

function cleanAll(){
  document.querySelectorAll('a[href]').forEach(cleanLink);
}

cleanLocation();
document.addEventListener('click',onClick,true);
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',cleanAll);
}else{
  cleanAll();
}

var obs;
function startObserver(){
  if(obs)return;
  obs=new MutationObserver(function(muts){
    var changed=false;
    muts.forEach(function(m){
      for(var i=0;i<m.addedNodes.length;i++){
        var n=m.addedNodes[i];
        if(n.nodeType===1){
          if(n.tagName==='A'&&n.href){cleanLink(n);changed=true;}
          else if(n.querySelectorAll){
            var as=n.querySelectorAll('a[href]');
            for(var j=0;j<as.length;j++){cleanLink(as[j]);changed=true;}
          }
        }
      }
    });
  });
  obs.observe(document.documentElement||document.body,{childList:true,subtree:true});
}
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',startObserver);
}else{
  startObserver();
}
})();
