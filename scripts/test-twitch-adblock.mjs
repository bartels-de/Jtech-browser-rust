// Node harness for jtech.twitch-adblock content.js (no browser). Usage: node test-twitch.mjs <content.js>
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const src = readFileSync(process.argv[2], "utf8");
const calls = [];
const live = (n, s) => Array.from({ length: n }, (_, i) => `#EXT-X-PROGRAM-DATE-TIME:2026-11-09T10:00:0${i}.000Z\n#EXTINF:2.000,live\nhttps://video-edge.example/${s}${i}.ts`).join("\n");
const ads = (n, s) => Array.from({ length: n }, (_, i) => `#EXTINF:2.000,Amazon|123\nhttps://video-edge.example/v1/segment/${s}${i}.ts`).join("\n");
const hdr = seq => `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:${seq}\n#EXT-X-TWITCH-ELAPSED-SECS:100.0`;
const PRE = `${hdr(10)}\n#EXT-X-DATERANGE:ID="stitched-ad-1",CLASS="twitch-stitched-ad",START-DATE="2026-11-09T10:00:00Z",X-TV-TWITCH-AD-ROLL-TYPE="PREROLL"\n${ads(2, "pre")}\n#EXT-X-DISCONTINUITY\n${live(2, "a")}\n#EXT-X-TWITCH-PREFETCH:https://video-edge.example/a9.ts`;
const MID = `${hdr(50)}\n${live(1, "m")}\n#EXT-X-DATERANGE:ID="stitched-ad-2",CLASS="twitch-stitched-ad",START-DATE="2026-11-09T10:00:00Z",X-TV-TWITCH-AD-ROLL-TYPE="MIDROLL"\n#EXT-X-DISCONTINUITY\n${ads(3, "mid")}\n#EXT-X-DISCONTINUITY\n${live(1, "n")}`;
const ONLY = `${hdr(70)}\n#EXT-X-DATERANGE:ID="stitched-ad-3",CLASS="twitch-stitched-ad",X-TV-TWITCH-AD-ROLL-TYPE="MIDROLL"\n${ads(3, "o")}`;
const CLEAN = `${hdr(80)}\n${live(3, "c")}`;
const master = tag => `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080,CODECS="avc1.64002A,mp4a.40.2",FRAME-RATE=60.000\nhttps://edge.example/${tag}/1080p60.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=852x480,CODECS="avc1.4D401F,mp4a.40.2",FRAME-RATE=30.000\nhttps://edge.example/${tag}/480p.m3u8`;

let backupAdText = PRE;
let orig = PRE, adFree = { popout: true };
const ok = b => ({ ok: true, status: 200, headers: new Headers(), text: async () => b, clone() { return ok(b); } });
async function mockFetch(input, init) {
  const url = String(input); calls.push({ url, init });
  if (url.includes("gql.twitch.tv")) {
    let b = JSON.parse(init.body); if (Array.isArray(b)) b = b[0]; const t = b.variables.playerType;
    return ok(JSON.stringify({ data: { streamPlaybackAccessToken: { value: `{"player_type":"${t}"}`, signature: "sig-" + t } } }));
  }
  if (url.includes("usher.ttvnw.net")) { const u = new URL(url); return ok(master((u.searchParams.get("sig") || "").startsWith("sig-") ? u.searchParams.get("sig") : "orig")); }
  const m = /edge\.example\/([^/]+)\//.exec(url);
  if (m) { const tag = m[1]; if (tag === "orig") return ok(orig); const t = tag.slice(4); return ok(adFree[t] ? CLEAN.replace(/\/c/g, "/" + t) : backupAdText); }
  throw new Error("unexpected " + url);
}
const win = {
  localStorage: { getItem: k => (k === "jtech-twitch-debug" ? process.env.TWDEBUG || null : null) },
  location: { href: "https://www.twitch.tv/test" },
  document: { readyState: "loading", head: null, documentElement: null, addEventListener() {}, querySelector: () => null },
  fetch: mockFetch, URL, Headers, Response, Blob, console, setTimeout, JSON, Object, Math, Date, Promise, Array, String,
};
win.window = win; win.self = win;
let T; win.__jtechTwitchExpose = t => (T = t);
vm.createContext(win);
vm.runInContext(src, win);
let reloads = 0; win.__jtechTwitchReload = () => reloads++;
const S = win.__jtechTwitchStats;
const text = r => r.text();

// 1. master via v2 usher; parent_domains removed
const usher = "https://usher.ttvnw.net/api/v2/channel/hls/TestCh.m3u8?allow_source=true&fast_bread=true&sig=s0&token=t0&parent_domains=x.com&supported_codecs=av1,h264";
await win.fetch(usher);
assert.ok(!calls.at(-1).url.includes("parent_domains"), "parent_domains removed");

// 2. preroll: embed has ads, popout ad-free -> popout playlist served
let out = await text(await win.fetch("https://edge.example/orig/1080p60.m3u8?x=1"));
assert.ok(out.includes("/popout") && !/stitched|v1\/segment/.test(out), "popout backup served");
assert.equal(S.ads, 1); assert.equal(S.swaps, 1);
const g = calls.filter(c => c.url.includes("gql")).map(c => JSON.parse(c.init.body));
assert.equal(g[0].operationName, "PlaybackAccessToken");
assert.equal(g[0].extensions.persistedQuery.sha256Hash, "ed230aa1e33e07eebb8928504583da78a5173989fadfb1ac94be06a04f3cdbe9");
assert.deepEqual(g.map(b => b.variables.playerType), ["embed", "popout"]);
assert.ok(g.every(b => b.variables.platform === "web" && b.variables.isLive === true && b.variables.isVod === false));
const bu = new URL(calls.find(c => c.url.includes("sig=sig-popout")).url);
assert.equal(bu.searchParams.get("fast_bread"), "true"); assert.equal(bu.searchParams.get("supported_codecs"), "av1,h264");
assert.ok(!bu.searchParams.has("parent_domains") && !bu.searchParams.has("platform"), "usher params kept, no platform override");

// 3. ad over -> reload requested
orig = CLEAN;
await text(await win.fetch("https://edge.example/orig/1080p60.m3u8"));
assert.equal(reloads, 1, "reload after ad");

// 4. midroll, no backup ad-free -> stripped, sequence/discontinuity consistent
adFree = {}; orig = MID;
out = await text(await win.fetch("https://edge.example/orig/480p.m3u8"));
assert.ok(!/v1\/segment|stitched|PREFETCH/.test(out), "midroll stripped: " + out);
assert.ok(out.includes("/m0.ts") || out.includes("/a0.ts") || out.includes("live"), "live kept");
assert.equal(S.ads, 2); assert.ok(S.stripped >= 2);
// stripAds on original midroll directly
assert.ok(T, "exposed");
const sm = T.stripAds(MID);
assert.ok(sm.includes("#EXT-X-MEDIA-SEQUENCE:50") && (sm.match(/#EXT-X-DISCONTINUITY/g) || []).length === 1 && !sm.includes("v1/segment"));
const sp = T.stripAds(PRE);
assert.ok(sp.includes("#EXT-X-MEDIA-SEQUENCE:12") && !sp.includes("PREFETCH") && !sp.includes("DISCONTINUITY"), sp);
assert.equal(T.stripAds(ONLY), null);
assert.equal(T.stripAds(CLEAN), CLEAN);

// 5. ad-only playlist -> last clean playlist held
orig = CLEAN; await text(await win.fetch("https://edge.example/orig/480p.m3u8"));
orig = ONLY; backupAdText = ONLY; out = await text(await win.fetch("https://edge.example/orig/480p.m3u8"));
assert.equal(out, CLEAN, "ad-only holds last clean");

// 6. page token rewrite + header capture
const rb = JSON.parse(T.rewriteTokenBody(JSON.stringify({ operationName: "PlaybackAccessToken", variables: { isLive: true, playerType: "site" }, extensions: { persistedQuery: { sha256Hash: "abc" } } })));
assert.equal(rb.variables.playerType, "popout"); assert.equal(T.H.hash, "abc");
assert.equal(T.rewriteTokenBody(JSON.stringify({ operationName: "PlaybackAccessToken", variables: { isLive: true, playerType: "picture-by-picture" } })), null);
calls.length = 0;
await win.fetch("https://gql.twitch.tv/gql", { method: "POST", headers: new Headers({ "Client-Integrity": "ci", Authorization: "OAuth x", "X-Device-Id": "dev1" }), body: JSON.stringify([{ operationName: "PlaybackAccessToken", variables: { isLive: true, playerType: "site" } }]) });
assert.equal(JSON.parse(calls[0].init.body)[0].variables.playerType, "popout", "page token forced to popout");
adFree = { embed: true }; orig = PRE; backupAdText = PRE; await win.fetch(usher); calls.length = 0;
await text(await win.fetch("https://edge.example/orig/1080p60.m3u8"));
const h = calls.find(c => c.url.includes("gql")).init.headers;
assert.equal(h["Client-Integrity"], "ci"); assert.equal(h.Authorization, "OAuth x"); assert.equal(h["X-Device-Id"], "dev1");
console.log("twitch-adblock tests ok", JSON.stringify(S));
