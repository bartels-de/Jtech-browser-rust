(function(){
'use strict';
if(window.top!==window)return;

var API='https://sponsor.ajay.app/api/skipSegments';
var CATEGORIES=['sponsor','intro','outro','interaction','selfpromo','music_offtopic','preview','filler'];
var TOLERANCE=0.3;

var videoId=null;
var segments=[];
var videoEl=null;
var tried=false;
var checkedVideos=new WeakSet();

function getVideoId(){
  var m=location.href.match(/[?&]v=([^&]+)/);
  if(m)return m[1];
  if(/^\/shorts\//.test(location.pathname)) return location.pathname.split('/')[2];
  if(location.pathname.startsWith('/watch/')) return location.pathname.split('/')[2];
  return null;
}

function fetchSegments(id){
  if(tried)return;
  tried=true;
  var url=API+'?videoID='+encodeURIComponent(id)+'&categories='+encodeURIComponent(JSON.stringify(CATEGORIES));
  fetch(url)
    .then(function(r){if(!r.ok)throw new Error('status '+r.status);return r.json();})
    .then(function(data){
      segments=(data||[]).map(function(s){return{start:s.segment[0],end:s.segment[1],category:s.category};}).sort(function(a,b){return a.start-b.start;});
      console.log('[SponsorBlock] loaded '+segments.length+' segments');
    })
    .catch(function(e){console.log('[SponsorBlock] '+e.message);});
}

function skip(){
  if(!videoEl||!segments.length||videoEl.paused)return;
  var t=videoEl.currentTime;
  for(var i=0;i<segments.length;i++){
    var s=segments[i];
    if(t>=s.start && t<s.end && t>s.start+TOLERANCE){
      videoEl.currentTime=s.end;
      console.log('[SponsorBlock] skipped '+s.category+' '+s.start+'-'+s.end);
      break;
    }
  }
}

function bindVideo(el){
  if(!el || checkedVideos.has(el))return;
  checkedVideos.add(el);
  videoEl=el;
  el.addEventListener('timeupdate',skip);
  el.addEventListener('play',skip);
}

function findVideo(){
  var v=document.querySelector('video');
  if(v)bindVideo(v);
}

function onNav(){
  var id=getVideoId();
  if(id && id!==videoId){
    videoId=id;
    segments=[];
    tried=false;
    fetchSegments(id);
    findVideo();
  }
}

onNav();
setInterval(findVideo,1000);

var obs=new MutationObserver(function(){
  onNav();
  findVideo();
});
if(document.documentElement) obs.observe(document.documentElement,{childList:true,subtree:true});

window.addEventListener('yt-navigate-finish',onNav);
})();
