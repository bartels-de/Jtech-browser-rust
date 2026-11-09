//! JavaScript runtime for procedural cosmetic filters and scriptlet injection.
//!
//! adblock-rust parses scriptlet (`+js(...)`) and procedural cosmetic filter rules,
//! but it only *compiles* them. This module turns the compiled output from
//! `UrlSpecificResources` (`injected_script` and `procedural_actions`) into a single
//! safe-to-inject content script that runs in the main world of every content tab.
//!
//! Security:
//!  - The script is an IIFE and does not touch `window.chrome.webview`.
//!  - Filter arguments are embedded as JSON; no string interpolation of raw filter text.
//!  - The runtime never executes arbitrary code; only the scriptlets produced by
//!    adblock-rust (which come from the trusted filter lists) are injected verbatim.

use serde_json::Value;
use std::collections::HashSet;

use crate::filters::Cosmetic;

const RUNTIME_JS: &str = r#"(function(){
'use strict';
if(window.top!==window)return;
var RUN_ID='__jtech-cosmetic-'+Math.random().toString(36).slice(2);
if(document.documentElement&&document.documentElement.getAttribute('data-jtech-cosmetic'))return;
document.documentElement&&document.documentElement.setAttribute('data-jtech-cosmetic',RUN_ID);
var OPT=__JTECH_COSMETIC_OPT__;

// ---------- helpers ----------
function log(){if(OPT.debug)try{console.log.apply(console,['[JTechCos]'].concat(Array.prototype.slice.call(arguments)));}catch(e){}}
function qsa(sel,root){try{return (root||document).querySelectorAll(sel);}catch(e){return [];}}
function matchesCss(el,prop,val){try{return getComputedStyle(el).getPropertyValue(prop).trim()===val.trim();}catch(e){return false;}}
function matchesCssBefore(el,prop,val){try{return getComputedStyle(el,'::before').getPropertyValue(prop).trim()===val.trim();}catch(e){return false;}}
function matchesCssAfter(el,prop,val){try{return getComputedStyle(el,'::after').getPropertyValue(prop).trim()===val.trim();}catch(e){return false;}}
function splitCssArg(arg){var i=arg.indexOf(':');if(i===-1)return['',arg];return[arg.slice(0,i),arg.slice(i+1)];}
function textOf(el){return el.innerText||el.textContent||'';}
function escapeRe(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}

// ---------- procedural operators ----------
function upward(el,arg){
  if(/^\d+$/.test(arg)){for(var i=parseInt(arg,10);i>0&&el;i--)el=el.parentElement;return el;}
  while(el){if(el.matches&&el.matches(arg))return el;el=el.parentElement;}
  return null;
}
function hasText(el,arg){
  if(arg.length>1&&arg[0]==='/'&&arg[arg.length-1]==='/'){try{return new RegExp(arg.slice(1,-1),'i').test(textOf(el));}catch(e){return false;}}
  return textOf(el).indexOf(arg)!==-1;
}
function matchesAttr(el,arg){
  // arg format from adblock-rust: "name=value" or regex patterns; support simple equality.
  var eq=arg.indexOf('=');if(eq===-1)return el.hasAttribute(arg);
  var name=arg.slice(0,eq),val=arg.slice(eq+1).replace(/^["']|["']$/g,'');
  return el.getAttribute(name)===val;
}
function minTextLength(el,arg){return textOf(el).length>=parseInt(arg,10);}
function matchesPath(el,arg){try{return new RegExp(arg,'i').test(location.pathname+location.search);}catch(e){return false;}}
function xpath(el,arg){try{var r=document.evaluate(arg,el||document,null,XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,null),out=[];for(var i=0;i<r.snapshotLength;i++)out.push(r.snapshotItem(i));return out;}catch(e){return [];}}

function evalOperator(els,op){
  var out=[];
  for(var i=0;i<els.length;i++){
    var el=els[i],ok=false;
    switch(op.t){
      case 'css-selector': ok=el.matches&&el.matches(op.a); break;
      case 'has-text': ok=hasText(el,op.a); break;
      case 'matches-attr': ok=matchesAttr(el,op.a); break;
      case 'matches-css': {var cp=splitCssArg(op.a);ok=matchesCss(el,cp[0],cp[1]);break;}
      case 'matches-css-before': {var cpb=splitCssArg(op.a);ok=matchesCssBefore(el,cpb[0],cpb[1]);break;}
      case 'matches-css-after': {var cpa=splitCssArg(op.a);ok=matchesCssAfter(el,cpa[0],cpa[1]);break;}
      case 'matches-path': ok=matchesPath(el,op.a); break;
      case 'min-text-length': ok=minTextLength(el,op.a); break;
      case 'upward': {var u=upward(el,op.a); if(u){out.push(u);} continue;}
      case 'xpath': {var xs=xpath(el,op.a); for(var k=0;k<xs.length;k++)out.push(xs[k]); continue;}
      default: continue;
    }
    if(ok)out.push(el);
  }
  return out;
}

function applyAction(el,action){
  if(!action){el.style.setProperty('display','none','important');return;}
  switch(action.t){
    case 'remove': el.remove(); break;
    case 'style': el.style.cssText+=';'+action.a; break;
    case 'remove-attr': el.removeAttribute(action.a); break;
    case 'remove-class': el.classList.remove(action.a); break;
    default: el.style.setProperty('display','none','important');
  }
}

var applied=new WeakSet();
function applyFilter(filter){
  var steps=filter.s;if(!steps||!steps.length)return;
  var baseSel=steps[0].t==='css-selector'?steps[0].a:null;
  if(!baseSel)return;
  var nodes=qsa(baseSel);
  if(!nodes.length)return;
  var els=Array.prototype.slice.call(nodes);
  for(var i=1;i<steps.length;i++){
    els=evalOperator(els,steps[i]);
    if(!els.length)break;
  }
  for(var j=0;j<els.length;j++){
    var el=els[j];
    if(applied.has(el))continue;
    applied.add(el);
    applyAction(el,filter.a);
  }
}

function applyAll(){
  if(!OPT.p||!OPT.p.length)return;
  for(var i=0;i<OPT.p.length;i++)try{applyFilter(OPT.p[i]);}catch(e){log('filter error',e);}
}

// ---------- scriptlets ----------
function runScriptlets(){
  if(!OPT.s)return;
  try{
    var s=document.createElement('script');s.textContent=OPT.s;(document.head||document.documentElement).appendChild(s);s.remove();
  }catch(e){log('scriptlet error',e);}
}

// ---------- dynamic re-check ----------
var pending=false,obs=null;
function schedule(){if(pending)return;pending=true;requestAnimationFrame(function(){pending=false;applyAll();});}
function startObserver(){
  if(!window.MutationObserver||obs)return;
  obs=new MutationObserver(function(muts){if(!OPT.p||!OPT.p.length)return; for(var i=0;i<muts.length;i++){var add=muts[i].addedNodes;for(var j=0;j<add.length;j++){if(add[j].nodeType===1){schedule();return;}}}});
  obs.observe(document.documentElement||document.body,{childList:true,subtree:true});
}

// ---------- run ----------
runScriptlets();
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',function(){applyAll();startObserver();});
}else{
  applyAll();startObserver();
}
setInterval(applyAll,3000);
})();"#;

/// Parse one procedural action JSON and turn it into a compact JS object representation.
fn compile_procedural(json: &str) -> Option<String> {
    let v: Value = serde_json::from_str(json).ok()?;
    let selector = v.get("selector")?.as_array()?;
    let mut steps = Vec::new();
    for step in selector {
        let t = step.get("type")?.as_str()?;
        let arg = step.get("arg").and_then(|a| a.as_str()).unwrap_or("");
        // Map kebab-case type to a single-char tag to keep the generated JS small.
        let tag = match t {
            "css-selector" => "css-selector", // keep for clarity
            "has-text" => "has-text",
            "matches-attr" => "matches-attr",
            "matches-css" => "matches-css",
            "matches-css-before" => "matches-css-before",
            "matches-css-after" => "matches-css-after",
            "matches-path" => "matches-path",
            "min-text-length" => "min-text-length",
            "upward" => "upward",
            "xpath" => "xpath",
            _ => continue,
        };
        steps.push(format!(
            "{{t:{},a:{}}}",
            serde_json::to_string(tag).ok()?,
            serde_json::to_string(arg).ok()?
        ));
    }
    if steps.is_empty() {
        return None;
    }
    let action = v.get("action").and_then(|a| {
        let t = a.get("type")?.as_str()?;
        let arg = a.get("arg").and_then(|x| x.as_str()).unwrap_or("");
        let tag = match t {
            "remove" => "remove",
            "style" => "style",
            "remove-attr" => "remove-attr",
            "remove-class" => "remove-class",
            _ => return None,
        };
        Some(format!(
            "{{t:{},a:{}}}",
            serde_json::to_string(tag).ok()?,
            serde_json::to_string(arg).ok()?
        ))
    });
    Some(format!(
        "{{s:[{}],a:{}}}",
        steps.join(","),
        action.unwrap_or_else(|| "null".into())
    ))
}

/// Build the full content script for a page.
/// `url` is only used for debug logging inside the generated script.
pub fn build(cosmetic: &Cosmetic, _url: &str, debug: bool) -> String {
    let mut parts: Vec<String> = Vec::new();
    for p in &cosmetic.procedural {
        if let Some(compiled) = compile_procedural(p) {
            parts.push(compiled);
        }
    }

    let opt = format!(
        "{{s:{},p:[{}],debug:{}}}",
        serde_json::to_string(&cosmetic.script).unwrap_or_else(|_| "\"\"".into()),
        parts.join(","),
        debug
    );

    RUNTIME_JS.replacen("__JTECH_COSMETIC_OPT__", &opt, 1)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::filters::Cosmetic;
    use std::collections::HashSet;

    #[test]
    fn compile_has_text_filter() {
        let json = r#"{"selector":[{"type":"css-selector","arg":".ad"},{"type":"has-text","arg":"Sponsored"}],"action":null}"#;
        let compiled = compile_procedural(json).unwrap();
        assert!(compiled.contains("has-text"));
        assert!(compiled.contains("Sponsored"));
        assert!(compiled.contains("css-selector"));
        assert!(compiled.contains("\"a\":null"));
    }

    #[test]
    fn compile_style_action() {
        let json = r#"{"selector":[{"type":"css-selector","arg":".cookie"}],"action":{"type":"style","arg":"display: none"}}"#;
        let compiled = compile_procedural(json).unwrap();
        assert!(compiled.contains("style"));
        assert!(compiled.contains("display: none"));
    }

    #[test]
    fn extra_css_emits_hide_and_style() {
        let cosmetic = Cosmetic {
            css: String::new(),
            generichide: false,
            exceptions: HashSet::new(),
            script: String::new(),
            procedural: vec![
                r#"{"selector":[{"type":"css-selector","arg":".ad"}],"action":null}"#.into(),
                r#"{"selector":[{"type":"css-selector","arg":".banner"}],"action":{"type":"style","arg":"color: red"}}"#.into(),
                r#"{"selector":[{"type":"has-text","arg":"x"}],"action":null}"#.into(), // skipped
            ],
        };
        let css = extra_css(&cosmetic, &HashSet::new());
        assert!(css.contains(".ad{display:none!important}"));
        assert!(css.contains(".banner{color: red}"));
        assert!(!css.contains("has-text"));
    }

    #[test]
    fn build_includes_scriptlets_and_filters() {
        let cosmetic = Cosmetic {
            css: String::new(),
            generichide: false,
            exceptions: HashSet::new(),
            script: "console.log('scriptlet')".into(),
            procedural: vec![r#"{"selector":[{"type":"css-selector","arg":".ad"}],"action":null}"#.into()],
        };
        let script = build(&cosmetic, "https://example.com", false);
        assert!(script.contains("console.log('scriptlet')"));
        assert!(script.contains("has-text") || script.contains("css-selector"));
        assert!(script.contains("MutationObserver"));
    }
}

/// Extract any CSS selectors from procedural filters that can be expressed as plain CSS.
/// This lets us keep applying them through the existing fast CSS path in addition to the JS path.
pub fn extra_css(cosmetic: &Cosmetic, _exceptions: &HashSet<String>) -> String {
    let mut out = String::new();
    for p in &cosmetic.procedural {
        let Ok(v): Result<Value, _> = serde_json::from_str(p) else { continue };
        // Only pure CSS selectors without action, or with style action, can be emitted as CSS.
        let selector = v.get("selector").and_then(|s| s.as_array());
        let Some(sel) = selector else { continue };
        if sel.len() != 1 {
            continue;
        }
        let first = sel.first().and_then(|x| x.as_object());
        let Some(first) = first else { continue };
        if first.get("type").and_then(|t| t.as_str()) != Some("css-selector") {
            continue;
        }
        let css = first.get("arg").and_then(|a| a.as_str()).unwrap_or("");
        if css.is_empty() {
            continue;
        }
        match v.get("action").and_then(|a| a.get("type")).and_then(|t| t.as_str()) {
            None | Some("remove") => {
                out.push_str(css);
                out.push_str("{display:none!important}\n");
            }
            Some("style") => {
                if let Some(style) = v.get("action").and_then(|a| a.get("arg")).and_then(|a| a.as_str()) {
                    out.push_str(css);
                    out.push('{');
                    out.push_str(style);
                    out.push_str("}\n");
                }
            }
            _ => {}
        }
    }
    out
}
