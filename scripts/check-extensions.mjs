// CI guard: every bundled extension folder has a valid manifest whose id matches its folder,
// is listed in extensions/index.json, and has its own explicit bundle.resources mapping
// (so the installer keeps the <id>/ subfolder instead of flattening the files).
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = "src-tauri/resources/extensions";
const fail = [];
const readJson = p => { try { return JSON.parse(readFileSync(p, "utf8").replace(/^﻿/, "")); } catch (e) { fail.push(`${p}: ${e.message}`); return null; } };

const index = readJson("extensions/index.json");
const conf = readJson("src-tauri/tauri.conf.json");
const res = conf?.bundle?.resources ?? {};
if (existsSync(join(root, "manifest.json"))) fail.push(`${root}/manifest.json: flat layout not allowed, use ${root}/<id>/`);
const dirs = readdirSync(root).filter(d => statSync(join(root, d)).isDirectory());
if (dirs.length === 0) fail.push(`${root}: no extensions found`);
for (const d of dirs) {
  const m = readJson(join(root, d, "manifest.json"));
  if (!m) continue;
  if (m.id !== d) fail.push(`${d}: manifest id '${m.id}' does not match folder`);
  const ie = index?.extensions?.find(x => x.id === m.id);
  if (!ie) fail.push(`${d}: not listed in extensions/index.json`);
  else if (ie.version !== m.version) fail.push(`${d}: version ${m.version} != index ${ie.version}`);
  const target = res[`resources/extensions/${d}/`];
  if (target !== `extensions/${d}/`) fail.push(`${d}: tauri.conf.json bundle.resources needs "resources/extensions/${d}/": "extensions/${d}/"`);
}
for (const ie of index?.extensions ?? []) if (!dirs.includes(ie.id)) console.warn(`note: ${ie.id} is in index.json but not bundled`);
if (fail.length) { console.error("Extension check failed:\n- " + fail.join("\n- ")); process.exit(1); }
console.log(`Extension check ok: ${dirs.join(", ")}`);
