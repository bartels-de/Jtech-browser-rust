// @ts-nocheck
/* Runde 5: Port aus Standardprojekt/src/shared/backgrounds.js (9 Szenen, unveraendert). Setzt window.JTechBackgrounds. */
/*
 * JTech Browser – animierte Hintergründe (Canvas)
 *
 * Eine Quelle für alle Hintergründe:
 *  - Browser-Interface (index.html, per <script>)
 *  - Startseite (wird von tabs.js per executeJavaScript injiziert)
 *  - Vorschau-Kacheln im Design-Studio
 *  - Main-Prozess (require: nur LIST/IDS/DEFAULT_ID für die Validierung)
 *
 * API (im Browser als window.JTechBackgrounds):
 *   attach(container, options) -> Controller   (idempotent pro Container)
 *   detach(container)
 *   LIST, IDS, DEFAULT_ID
 *
 * options: { id, accent, accentAlt, bg, intensity (0–1), speed (0–2),
 *            paused, hidden, fps, quality }
 */
(function (root, factory) {
  const api = factory();
  // This file is imported by the browser UI, where Vite may wrap modules with a
  // module.exports shim in production. Always publish the API on window; checking
  // `module.exports` here can mistakenly hide it inside Vite's private wrapper.
  if (root && !root.JTechBackgrounds) root.JTechBackgrounds = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const LIST = [
    { id: 'none', name: 'Ruhig', description: 'Weicher Farbverlauf ohne Bewegung' },
    { id: 'constellation', name: 'Netzwerk', description: 'Treibende Punkte, die sich verbinden' },
    { id: 'synthwave', name: 'Synthwave', description: 'Retro-Horizont mit Sonne und Gitter' },
    { id: 'flowfield', name: 'Strömung', description: 'Partikel folgen einem Strömungsfeld' },
    { id: 'hyperdrive', name: 'Hyperdrive', description: 'Lichtstreifen im Warp-Flug' },
    { id: 'hexgrid', name: 'Hex-Netz', description: 'Wabengitter mit Energie-Impulsen' },
    { id: 'nebula', name: 'Nebula', description: 'Weiche, leuchtende Farbwolken' },
    { id: 'ribbons', name: 'Wellenbänder', description: 'Fließende Lichtbänder' },
    { id: 'embers', name: 'Glut', description: 'Aufsteigende Funken' }
  ];
  const IDS = LIST.map((entry) => entry.id);
  const DEFAULT_ID = 'constellation';

  /* ------------------------------------------------------------ Helfer */

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const TAU = Math.PI * 2;

  function toRgb(color, fallback) {
    if (typeof color !== 'string') return fallback;
    let hex = color.trim();
    if (/^#[0-9a-f]{3}$/i.test(hex)) hex = '#' + hex.slice(1).split('').map((c) => c + c).join('');
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return fallback;
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }

  const mixRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const rgba = (rgb, alpha) => `rgba(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])}, ${clamp(alpha, 0, 1).toFixed(3)})`;
  const luminance = (rgb) => (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;

  // Deterministischer Zufall, damit Vorschau und Hintergrund gleich aussehen.
  function random(seed) {
    let state = seed >>> 0 || 1;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function fillBase(ctx, w, h, p) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = rgba(p.bg, 1);
    ctx.fillRect(0, 0, w, h);
  }

  function softGlow(ctx, x, y, radius, rgb, alpha) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, rgba(rgb, alpha));
    gradient.addColorStop(1, rgba(rgb, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  // Ruhiger Grundverlauf, auch Basis für „none“.
  function drawCalm(ctx, w, h, p) {
    fillBase(ctx, w, h, p);
    const r = Math.max(w, h);
    softGlow(ctx, w * 0.12, -h * 0.05, r * 0.7, p.a, 0.16 * p.glow);
    softGlow(ctx, w * 0.9, h * 0.05, r * 0.6, p.b, 0.14 * p.glow);
    softGlow(ctx, w * 0.5, h * 1.05, r * 0.5, mixRgb(p.a, p.b, 0.5), 0.08 * p.glow);
  }

  /* ------------------------------------------------------------ Szenen */

  const SCENES = {
    none: () => ({
      quality: 0.5,
      animated: false,
      frame(ctx, w, h, p) { drawCalm(ctx, w, h, p); }
    }),

    constellation: () => {
      let points = [];
      let unit = 1;
      return {
        quality: 1,
        init(w, h, p) {
          const rand = random(42);
          unit = Math.max(0.5, Math.min(w, h) / 800);
          const area = (w * h) / (unit * unit * 1280 * 800);
          const count = Math.round(lerp(34, 100, p.intensity) * clamp(area, 0.5, 1.6));
          points = Array.from({ length: count }, () => ({
            x: rand() * w,
            y: rand() * h,
            vx: (rand() - 0.5) * 18 * unit,
            vy: (rand() - 0.5) * 18 * unit,
            c: rand()
          }));
        },
        frame(ctx, w, h, p, dt) {
          drawCalm(ctx, w, h, p);
          const maxDist = 170 * unit;
          const maxSq = maxDist * maxDist;
          for (const pt of points) {
            pt.x += pt.vx * dt;
            pt.y += pt.vy * dt;
            if (pt.x < -20) pt.x = w + 20; else if (pt.x > w + 20) pt.x = -20;
            if (pt.y < -20) pt.y = h + 20; else if (pt.y > h + 20) pt.y = -20;
          }
          ctx.lineWidth = Math.max(0.6, unit * 0.9);
          for (let i = 0; i < points.length; i += 1) {
            const a = points[i];
            for (let j = i + 1; j < points.length; j += 1) {
              const b = points[j];
              const dx = a.x - b.x;
              const dy = a.y - b.y;
              const sq = dx * dx + dy * dy;
              if (sq > maxSq) continue;
              const alpha = (1 - Math.sqrt(sq) / maxDist) * (0.25 + p.intensity * 0.4);
              ctx.strokeStyle = rgba(mixRgb(p.a, p.b, (a.c + b.c) / 2), alpha);
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
          for (const pt of points) {
            ctx.fillStyle = rgba(mixRgb(p.a, p.b, pt.c), 0.85);
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, Math.max(1, 1.8 * unit), 0, TAU);
            ctx.fill();
          }
        }
      };
    },

    synthwave: () => {
      let offset = 0;
      let sunLayer = null;
      return {
        quality: 0.85,
        frame(ctx, w, h, p, dt) {
          offset = (offset + dt * 0.45) % 1;
          const horizon = h * 0.58;
          const sky = ctx.createLinearGradient(0, 0, 0, horizon);
          sky.addColorStop(0, rgba(p.bg, 1));
          sky.addColorStop(1, rgba(mixRgb(p.bg, p.a, 0.32 * p.glow + 0.08), 1));
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = sky;
          ctx.fillRect(0, 0, w, horizon);

          // Sonne mit Streifen (auf eigener Ebene, damit die Streifen den Himmel zeigen)
          const radius = Math.min(w, h) * 0.24;
          const cx = w / 2;
          const cy = horizon - radius * 0.32;
          softGlow(ctx, cx, cy, radius * 2.2, p.a, 0.22 * p.glow + 0.06);
          const size = Math.ceil(radius * 2) + 2;
          if (!sunLayer || sunLayer.width !== size) {
            sunLayer = document.createElement('canvas');
            sunLayer.width = size;
            sunLayer.height = size;
          }
          const sctx = sunLayer.getContext('2d');
          sctx.globalCompositeOperation = 'source-over';
          sctx.clearRect(0, 0, size, size);
          const sun = sctx.createLinearGradient(0, 0, 0, size);
          sun.addColorStop(0, rgba(p.b, 0.95));
          sun.addColorStop(1, rgba(p.a, 0.95));
          sctx.fillStyle = sun;
          sctx.beginPath();
          sctx.arc(size / 2, size / 2, radius, 0, TAU);
          sctx.fill();
          sctx.globalCompositeOperation = 'destination-out';
          for (let i = 0; i < 7; i += 1) {
            const t = i / 7;
            const y = size / 2 + radius * (0.05 + t * 0.95) + ((offset * radius * 0.14) % (radius * 0.14));
            sctx.fillRect(0, y, size, radius * (0.02 + t * 0.06));
          }
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, w, horizon);
          ctx.clip();
          ctx.drawImage(sunLayer, cx - size / 2, cy - size / 2);
          ctx.restore();

          // Boden mit Perspektiv-Gitter
          ctx.globalCompositeOperation = 'source-over';
          const ground = ctx.createLinearGradient(0, horizon, 0, h);
          ground.addColorStop(0, rgba(mixRgb(p.bg, p.a, 0.12), 1));
          ground.addColorStop(1, rgba(p.bg, 1));
          ctx.fillStyle = ground;
          ctx.fillRect(0, horizon, w, h - horizon);

          const lineAlpha = 0.35 + p.intensity * 0.45;
          ctx.lineWidth = Math.max(1, h / 600);
          const rows = 14;
          for (let i = 0; i < rows; i += 1) {
            const z = (i + offset) / rows;
            const y = horizon + (h - horizon) * z * z;
            ctx.strokeStyle = rgba(p.a, lineAlpha * z);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
          }
          const columns = 22;
          for (let i = -columns; i <= columns; i += 1) {
            const xBottom = w / 2 + (i / columns) * w * 1.6;
            ctx.strokeStyle = rgba(p.a, lineAlpha * 0.7);
            ctx.beginPath();
            ctx.moveTo(w / 2 + (i / columns) * w * 0.06, horizon);
            ctx.lineTo(xBottom, h);
            ctx.stroke();
          }
          const glowLine = ctx.createLinearGradient(0, 0, w, 0);
          glowLine.addColorStop(0, rgba(p.b, 0));
          glowLine.addColorStop(0.5, rgba(p.b, 0.9));
          glowLine.addColorStop(1, rgba(p.b, 0));
          ctx.fillStyle = glowLine;
          ctx.fillRect(0, horizon - 1, w, Math.max(2, h / 400));
        }
      };
    },

    flowfield: () => {
      let particles = [];
      let unit = 1;
      let rand = random(7);
      const spawn = (pt, w, h) => {
        pt.x = rand() * w;
        pt.y = rand() * h;
        pt.life = 2 + rand() * 6;
        pt.c = rand();
      };
      return {
        quality: 0.75,
        init(w, h, p, ctx) {
          rand = random(7);
          unit = Math.max(0.5, Math.min(w, h) / 800);
          const count = Math.round(lerp(260, 900, p.intensity) * clamp((w * h) / (1280 * 800 * unit * unit), 0.2, 1.5));
          particles = Array.from({ length: count }, () => {
            const pt = {};
            spawn(pt, w, h);
            pt.life *= rand();
            return pt;
          });
          drawCalm(ctx, w, h, p);
        },
        frame(ctx, w, h, p, dt, t) {
          // Spuren langsam ausblenden
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = rgba(p.bg, clamp(dt * 1.6, 0.02, 0.2));
          ctx.fillRect(0, 0, w, h);
          ctx.lineWidth = Math.max(0.8, unit * 1.1);
          ctx.globalCompositeOperation = p.light ? 'source-over' : 'lighter';
          const scale = 0.0032 / unit;
          const step = 70 * unit * dt;
          for (const pt of particles) {
            const angle = (Math.sin(pt.x * scale + t * 0.18) + Math.cos(pt.y * scale * 1.3 - t * 0.12)) * Math.PI;
            const nx = pt.x + Math.cos(angle) * step;
            const ny = pt.y + Math.sin(angle) * step;
            ctx.strokeStyle = rgba(mixRgb(p.a, p.b, pt.c), 0.22 + p.intensity * 0.25);
            ctx.beginPath();
            ctx.moveTo(pt.x, pt.y);
            ctx.lineTo(nx, ny);
            ctx.stroke();
            pt.x = nx;
            pt.y = ny;
            pt.life -= dt;
            if (pt.life <= 0 || nx < 0 || ny < 0 || nx > w || ny > h) spawn(pt, w, h);
          }
          ctx.globalCompositeOperation = 'source-over';
        }
      };
    },

    hyperdrive: () => {
      let stars = [];
      let rand = random(99);
      const reset = (star, far) => {
        star.x = (rand() - 0.5) * 2;
        star.y = (rand() - 0.5) * 2;
        star.z = far ? 1 : 0.05 + rand() * 0.95;
        star.pz = star.z;
        star.c = rand();
      };
      return {
        quality: 0.85,
        init(w, h, p, ctx) {
          rand = random(99);
          const count = Math.round(lerp(140, 420, p.intensity));
          stars = Array.from({ length: count }, () => {
            const star = {};
            reset(star, false);
            return star;
          });
          drawCalm(ctx, w, h, p);
        },
        frame(ctx, w, h, p, dt) {
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = rgba(p.bg, 0.45);
          ctx.fillRect(0, 0, w, h);
          const cx = w / 2;
          const cy = h / 2;
          softGlow(ctx, cx, cy, Math.max(w, h) * 0.35, mixRgb(p.a, p.b, 0.5), 0.1 * p.glow);
          const focal = Math.min(w, h) * 0.5;
          ctx.globalCompositeOperation = p.light ? 'source-over' : 'lighter';
          ctx.lineCap = 'round';
          for (const star of stars) {
            star.pz = star.z;
            star.z -= dt * 0.32;
            if (star.z <= 0.02) {
              reset(star, true);
              continue;
            }
            const x = cx + (star.x / star.z) * focal;
            const y = cy + (star.y / star.z) * focal;
            const px = cx + (star.x / star.pz) * focal;
            const py = cy + (star.y / star.pz) * focal;
            if (x < -50 || y < -50 || x > w + 50 || y > h + 50) {
              reset(star, true);
              continue;
            }
            const depth = 1 - star.z;
            ctx.strokeStyle = rgba(mixRgb(p.a, p.b, star.c), 0.15 + depth * 0.75);
            ctx.lineWidth = Math.max(0.6, depth * 2.6 * (focal / 400));
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(x, y);
            ctx.stroke();
          }
          ctx.globalCompositeOperation = 'source-over';
        }
      };
    },

    hexgrid: () => {
      let cells = [];
      let pulses = [];
      let base = null;
      let size = 24;
      let spawnTimer = 0;
      let rand = random(5);
      const hexPath = (ctx, x, y, r) => {
        ctx.beginPath();
        for (let i = 0; i < 6; i += 1) {
          const angle = Math.PI / 6 + (i * Math.PI) / 3;
          const px = x + Math.cos(angle) * r;
          const py = y + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
      };
      return {
        quality: 0.8,
        init(w, h, p) {
          rand = random(5);
          size = Math.max(10, Math.min(w, h) / 26);
          const dx = Math.sqrt(3) * size;
          const dy = 1.5 * size;
          cells = [];
          for (let row = -1; row * dy < h + size; row += 1) {
            for (let col = -1; col * dx < w + dx; col += 1) {
              cells.push({ x: col * dx + (row % 2 ? dx / 2 : 0), y: row * dy, glow: 0 });
            }
          }
          pulses = [];
          spawnTimer = 0;
          // Grundgitter einmal vorzeichnen.
          if (typeof document !== 'undefined') {
            base = document.createElement('canvas');
            base.width = w;
            base.height = h;
            const bctx = base.getContext('2d');
            drawCalm(bctx, w, h, p);
            bctx.lineWidth = Math.max(0.8, size / 22);
            bctx.strokeStyle = rgba(p.light ? p.text : p.a, 0.035 + p.intensity * 0.04);
            for (const cell of cells) {
              hexPath(bctx, cell.x, cell.y, size * 0.92);
              bctx.stroke();
            }
          }
        },
        frame(ctx, w, h, p, dt) {
          ctx.globalCompositeOperation = 'source-over';
          if (base) ctx.drawImage(base, 0, 0);
          else drawCalm(ctx, w, h, p);

          spawnTimer -= dt;
          if (spawnTimer <= 0) {
            spawnTimer = lerp(2.4, 0.7, p.intensity) * (0.6 + rand() * 0.8);
            pulses.push({ x: rand() * w, y: rand() * h, r: 0, c: rand(), max: Math.max(w, h) * (0.35 + rand() * 0.4) });
          }
          const band = size * 2.6;
          for (const pulse of pulses) pulse.r += dt * size * 6;
          pulses = pulses.filter((pulse) => pulse.r < pulse.max + band);

          ctx.lineWidth = Math.max(1.2, size / 12);
          for (const cell of cells) {
            let glow = 0;
            let color = 0;
            for (const pulse of pulses) {
              const dist = Math.hypot(cell.x - pulse.x, cell.y - pulse.y);
              const ring = Math.exp(-(((dist - pulse.r) / band) ** 2)) * (1 - pulse.r / (pulse.max + band));
              if (ring > glow) {
                glow = ring;
                color = pulse.c;
              }
            }
            if (glow < 0.04) continue;
            const rgb = mixRgb(p.a, p.b, color);
            hexPath(ctx, cell.x, cell.y, size * 0.92);
            ctx.fillStyle = rgba(rgb, glow * (0.08 + p.intensity * 0.12));
            ctx.fill();
            ctx.strokeStyle = rgba(rgb, glow * (0.45 + p.intensity * 0.45));
            ctx.stroke();
          }
        }
      };
    },

    nebula: () => {
      let blobs = [];
      return {
        quality: 0.4,
        init() {
          const rand = random(11);
          blobs = Array.from({ length: 6 }, (_, i) => ({
            ox: 0.15 + rand() * 0.7,
            oy: 0.15 + rand() * 0.7,
            ax: 0.12 + rand() * 0.22,
            ay: 0.1 + rand() * 0.2,
            sx: 0.05 + rand() * 0.08,
            sy: 0.04 + rand() * 0.07,
            phase: rand() * TAU,
            r: 0.28 + rand() * 0.22,
            c: i % 3 === 2 ? 0.5 : i % 2
          }));
        },
        frame(ctx, w, h, p, dt, t) {
          fillBase(ctx, w, h, p);
          ctx.globalCompositeOperation = p.light ? 'source-over' : 'lighter';
          const size = Math.max(w, h);
          for (const blob of blobs) {
            const x = (blob.ox + Math.sin(t * blob.sx + blob.phase) * blob.ax) * w;
            const y = (blob.oy + Math.cos(t * blob.sy + blob.phase * 1.3) * blob.ay) * h;
            softGlow(ctx, x, y, size * blob.r, mixRgb(p.a, p.b, blob.c), (0.06 + p.intensity * 0.1) * (p.light ? 0.8 : 1));
          }
          ctx.globalCompositeOperation = 'source-over';
        }
      };
    },

    ribbons: () => ({
      quality: 0.7,
      frame(ctx, w, h, p, dt, t) {
        drawCalm(ctx, w, h, p);
        ctx.globalCompositeOperation = p.light ? 'source-over' : 'lighter';
        const count = 4;
        const steps = 64;
        for (let r = 0; r < count; r += 1) {
          const k = r / (count - 1);
          const baseY = h * (0.38 + k * 0.28);
          const amp = h * (0.06 + 0.05 * Math.sin(r * 1.7));
          const thickness = h * (0.05 + p.intensity * 0.06);
          const rgb = mixRgb(p.a, p.b, k);
          const curve = (x, shift) => baseY + shift +
            Math.sin(x / w * TAU * (0.8 + r * 0.25) + t * (0.35 + r * 0.08)) * amp +
            Math.sin(x / w * TAU * (1.9 + r * 0.3) - t * (0.22 + r * 0.05)) * amp * 0.45;

          const gradient = ctx.createLinearGradient(0, baseY - amp - thickness, 0, baseY + amp + thickness);
          gradient.addColorStop(0, rgba(rgb, 0));
          gradient.addColorStop(0.5, rgba(rgb, 0.1 + p.intensity * 0.12));
          gradient.addColorStop(1, rgba(rgb, 0));
          ctx.fillStyle = gradient;
          ctx.beginPath();
          for (let i = 0; i <= steps; i += 1) {
            const x = (i / steps) * w;
            if (i === 0) ctx.moveTo(x, curve(x, -thickness)); else ctx.lineTo(x, curve(x, -thickness));
          }
          for (let i = steps; i >= 0; i -= 1) {
            const x = (i / steps) * w;
            ctx.lineTo(x, curve(x, thickness));
          }
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = rgba(rgb, 0.35 + p.intensity * 0.35);
          ctx.lineWidth = Math.max(1, h / 500);
          ctx.beginPath();
          for (let i = 0; i <= steps; i += 1) {
            const x = (i / steps) * w;
            if (i === 0) ctx.moveTo(x, curve(x, 0)); else ctx.lineTo(x, curve(x, 0));
          }
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    }),

    embers: () => {
      let sparks = [];
      let unit = 1;
      let rand = random(3);
      const spawn = (spark, w, h, anywhere) => {
        spark.x = rand() * w;
        spark.y = anywhere ? rand() * h : h + 10 * unit;
        spark.vy = (18 + rand() * 46) * unit;
        spark.wobble = rand() * TAU;
        spark.size = (0.6 + rand() * 1.8) * unit;
        spark.c = rand();
        spark.flicker = 2 + rand() * 4;
      };
      return {
        quality: 0.85,
        init(w, h, p) {
          rand = random(3);
          unit = Math.max(0.5, Math.min(w, h) / 800);
          const count = Math.round(lerp(50, 200, p.intensity) * clamp(w / (1280 * unit), 0.3, 1.6));
          sparks = Array.from({ length: count }, () => {
            const spark = {};
            spawn(spark, w, h, true);
            return spark;
          });
        },
        frame(ctx, w, h, p, dt, t) {
          fillBase(ctx, w, h, p);
          const heat = ctx.createLinearGradient(0, h, 0, h * 0.35);
          heat.addColorStop(0, rgba(p.a, 0.28 * p.glow + 0.06));
          heat.addColorStop(1, rgba(p.a, 0));
          ctx.fillStyle = heat;
          ctx.fillRect(0, h * 0.35, w, h * 0.65);
          ctx.globalCompositeOperation = p.light ? 'source-over' : 'lighter';
          for (const spark of sparks) {
            spark.y -= spark.vy * dt;
            spark.x += Math.sin(t * 1.3 + spark.wobble) * 12 * unit * dt;
            if (spark.y < -10 * unit) spawn(spark, w, h, false);
            const life = clamp(spark.y / h, 0, 1);
            const alpha = (0.35 + 0.65 * Math.abs(Math.sin(t * spark.flicker + spark.wobble))) * (0.2 + life * 0.8);
            const rgb = mixRgb(p.b, p.a, spark.c * (1 - life * 0.5));
            softGlow(ctx, spark.x, spark.y, spark.size * 4, rgb, alpha * 0.35);
            ctx.fillStyle = rgba(rgb, alpha);
            ctx.beginPath();
            ctx.arc(spark.x, spark.y, spark.size, 0, TAU);
            ctx.fill();
          }
          ctx.globalCompositeOperation = 'source-over';
        }
      };
    }
  };

  /* ------------------------------------------------------- Controller */

  const DEFAULT_OPTIONS = {
    id: DEFAULT_ID,
    accent: '#7c6cff',
    accentAlt: '#22d3ee',
    bg: '#0b0d17',
    text: '#e7e9f5',
    intensity: 0.5,
    glow: 0.5,
    speed: 1,
    paused: false,
    hidden: false,
    fps: 30,
    quality: 1
  };

  function createController(container) {
    const canvas = document.createElement('canvas');
    canvas.className = 'jtech-bg-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      display: 'block',
      pointerEvents: 'none'
    });
    container.prepend(canvas);
    const ctx = canvas.getContext('2d');

    let options = { ...DEFAULT_OPTIONS };
    let palette = null;
    let scene = null;
    let sceneKey = '';
    let width = 0;
    let height = 0;
    let frameId = 0;
    let last = 0;
    let time = 0;
    let destroyed = false;

    const reducedMotion = typeof matchMedia === 'function'
      ? matchMedia('(prefers-reduced-motion: reduce)')
      : { matches: false, addEventListener() {} };

    function buildPalette() {
      const bg = toRgb(options.bg, toRgb(DEFAULT_OPTIONS.bg));
      return {
        bg,
        a: toRgb(options.accent, toRgb(DEFAULT_OPTIONS.accent)),
        b: toRgb(options.accentAlt, toRgb(DEFAULT_OPTIONS.accentAlt)),
        text: toRgb(options.text, toRgb(DEFAULT_OPTIONS.text)),
        intensity: clamp(Number(options.intensity) || 0, 0, 1),
        glow: clamp(Number(options.glow) || 0, 0, 1) * 0.8 + 0.2,
        light: luminance(bg) > 0.55
      };
    }

    const isRunning = () => !destroyed && !options.hidden && !options.paused && scene?.animated !== false &&
      !reducedMotion.matches && Number(options.speed) > 0 &&
      !(typeof document !== 'undefined' && document.hidden);

    function resize() {
      if (destroyed) return;
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 1.5);
      const scale = dpr * (scene?.quality ?? 1) * clamp(Number(options.quality) || 1, 0.2, 1);
      const nextWidth = Math.max(1, Math.round(rect.width * scale));
      const nextHeight = Math.max(1, Math.round(rect.height * scale));
      if (nextWidth === width && nextHeight === height && scene?.ready) return;
      width = nextWidth;
      height = nextHeight;
      canvas.width = width;
      canvas.height = height;
      if (scene) {
        scene.init?.(width, height, palette, ctx);
        scene.ready = true;
      }
      draw(0);
    }

    function draw(dt) {
      if (!scene || options.hidden || width < 2 || height < 2) return;
      scene.frame(ctx, width, height, palette, dt, time);
    }

    function loop(now) {
      frameId = 0;
      if (!isRunning()) return;
      const minDelta = 1000 / clamp(Number(options.fps) || 30, 10, 60) - 1;
      if (last && now - last < minDelta) {
        frameId = requestAnimationFrame(loop);
        return;
      }
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      const scaled = dt * clamp(Number(options.speed) || 0, 0, 2);
      time += scaled;
      draw(scaled);
      frameId = requestAnimationFrame(loop);
    }

    function start() {
      if (frameId || !isRunning()) return;
      last = 0;
      frameId = requestAnimationFrame(loop);
    }

    function stop() {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
    }

    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => resize()) : null;
    observer?.observe(container);
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);
    reducedMotion.addEventListener?.('change', () => { stop(); draw(0); start(); });

    return {
      canvas,
      update(next = {}) {
        const previous = options;
        options = { ...options, ...next };
        if (!IDS.includes(options.id)) options.id = DEFAULT_ID;
        palette = buildPalette();
        canvas.style.display = options.hidden ? 'none' : 'block';

        // Neu aufbauen, wenn sich Szene oder Mengen-relevante Werte ändern.
        const key = `${options.id}|${palette.intensity.toFixed(2)}|${options.quality}`;
        if (key !== sceneKey) {
          sceneKey = key;
          scene = SCENES[options.id]();
          scene.ready = false;
          width = 0;
          height = 0;
          resize();
        } else if (previous.bg !== options.bg || previous.accent !== options.accent ||
                   previous.accentAlt !== options.accentAlt || previous.glow !== options.glow) {
          scene.init?.(width, height, palette, ctx);
          draw(0);
        }
        if (isRunning()) start(); else { stop(); draw(0); }
        return this;
      },
      setPaused(paused) {
        return this.update({ paused: Boolean(paused) });
      },
      destroy() {
        destroyed = true;
        stop();
        observer?.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        canvas.remove();
      }
    };
  }

  function attach(container, options) {
    if (!container || typeof document === 'undefined') return null;
    if (!container.__jtechBackground) container.__jtechBackground = createController(container);
    return container.__jtechBackground.update(options);
  }

  function detach(container) {
    if (!container?.__jtechBackground) return;
    container.__jtechBackground.destroy();
    delete container.__jtechBackground;
  }

  return { LIST, IDS, DEFAULT_ID, attach, detach };
});
