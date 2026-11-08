// @ts-nocheck
/* Runde 5: Port aus Standardprojekt/src/shared/cursor-fx.js (unveraendert bis auf: Parameter 'length' fuer die Spur-Laenge). Wird in der UI importiert UND von Rust per include_str! in Webseiten injiziert (nur wenn in den Einstellungen aktiviert). Reines JavaScript – keine TS-Syntax verwenden! */
/*
 * JTech Browser – Cursor-Effekte
 *
 * Wird sowohl im Chrome-Interface (index.html) als auch per executeJavaScript
 * in Webseiten und auf der Startseite geladen. Die Datei ist idempotent:
 * erneutes Laden aktualisiert nur die Einstellungen.
 */
'use strict';

(() => {
  if (window.JTechCursorEffects) return;

  const EFFECTS = ['none', 'trail', 'sparks', 'comet', 'ripple', 'laser', 'bubbles'];
  const DEFAULTS = {
    effect: 'none',
    color: '#ff6b35',
    colorAlt: '#00d4aa',
    size: 16,
    intensity: 60,
    length: 50
  };

  const state = { ...DEFAULTS };

  let canvas = null;
  let ctx = null;
  let frameId = 0;
  let installed = false;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let points = [];
  let particles = [];
  let rings = [];
  let last = null;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function toRgb(color) {
    if (typeof color !== 'string') return [255, 255, 255];
    let hex = color.trim();
    if (/^#[0-9a-f]{3}$/i.test(hex)) {
      hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    }
    if (/^#[0-9a-f]{6}$/i.test(hex)) {
      return [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16)
      ];
    }
    return [255, 255, 255];
  }

  function rgba(color, alpha) {
    const [r, g, b] = toRgb(color);
    return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
  }

  function resize() {
    if (!canvas || !ctx) return;
    width = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    height = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function ensureCanvas() {
    if (canvas && canvas.isConnected && ctx) return true;

    canvas = document.createElement('canvas');
    canvas.className = 'jtech-cursor-fx';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = [
      'position:fixed',
      'inset:0',
      'width:100%',
      'height:100%',
      'pointer-events:none',
      'z-index:2147483647',
      'display:block'
    ].join(';');

    (document.body || document.documentElement).appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();

    if (!installed) {
      installed = true;
      window.addEventListener('resize', resize, { passive: true });
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('pointerdown', onPointerDown, { passive: true });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopLoop();
        else startLoop();
      });
    }

    return Boolean(ctx);
  }

  function removeCanvas() {
    stopLoop();
    if (canvas) canvas.remove();
    canvas = null;
    ctx = null;
    points = [];
    particles = [];
    rings = [];
    last = null;
  }

  function spawnSparks(x, y, count, burst = false) {
    const cap = Math.round(6 + (state.intensity / 100) * 70);
    for (let i = 0; i < count; i += 1) {
      if (particles.length >= cap) break;
      const angle = Math.random() * Math.PI * 2;
      const speed = (burst ? 1.4 : 0.45) + Math.random() * (burst ? 2.4 : 1.6);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (burst ? 0.35 : 0.05),
        birth: performance.now(),
        ttl: 380 + Math.random() * 460,
        size: Math.max(1, state.size * 0.13 * (0.6 + Math.random())),
        color: Math.random() > 0.45 ? state.color : state.colorAlt
      });
    }
  }

  function onPointerMove(event) {
    if (state.effect === 'none') return;

    const now = performance.now();
    const x = event.clientX;
    const y = event.clientY;
    const previous = last;
    last = { x, y };

    if (state.effect === 'trail' || state.effect === 'comet') {
      points.push({ x, y, t: now });
      const max = Math.round((state.effect === 'comet' ? 14 : 10) + state.length * 0.4);
      if (points.length > max) points.splice(0, points.length - max);
    } else if (state.effect === 'sparks') {
      const travel = previous ? Math.hypot(x - previous.x, y - previous.y) : 5;
      spawnSparks(x, y, Math.min(6, Math.max(1, Math.round(travel / 10))));
    } else if (state.effect === 'ripple') {
      points = [{ x, y, t: now }];
    } else if (state.effect === 'laser') {
      points.push({ x, y, t: now });
      if (points.length > 4) points.splice(0, points.length - 4);
    } else if (state.effect === 'bubbles') {
      points.push({ x, y, t: now });
      if (points.length > 8) points.splice(0, points.length - 8);
      if (previous && Math.hypot(x - previous.x, y - previous.y) > 14) {
        particles.push({
          x, y, vx: (Math.random() - 0.5) * 0.6, vy: -0.8 - Math.random() * 0.8,
          birth: now, ttl: 700 + Math.random() * 500,
          size: Math.max(1, state.size * 0.12 * (0.7 + Math.random())),
          color: Math.random() > 0.5 ? state.color : state.colorAlt
        });
      }
    }
  }

  function onPointerDown(event) {
    if (state.effect === 'none') return;

    const x = event.clientX;
    const y = event.clientY;

    if (state.effect === 'sparks') {
      spawnSparks(x, y, 14, true);
    } else {
      rings.push({
        x,
        y,
        start: performance.now(),
        life: state.effect === 'ripple' ? 760 : 480,
        size: state.size * (state.effect === 'ripple' ? 1 : 0.75)
      });
    }
  }

  function drawTrail(now, dim, comet) {
    const life = 160 + state.length * 7;
    const cutoff = now - life;
    points = points.filter((point) => point.t >= cutoff);
    if (!points.length) return;

    ctx.lineCap = 'round';

    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const strength = i / points.length;
      const fade = 1 - Math.min(1, (now - b.t) / life);

      ctx.lineWidth = Math.max(1, state.size * (comet ? 0.34 : 0.4) * strength);
      ctx.strokeStyle = rgba(i % 2 ? state.color : state.colorAlt, fade * (comet ? 0.7 : 0.5) * dim);

      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(a.x, a.y, midX, midY);
      ctx.stroke();
    }

    const head = points[points.length - 1];

    if (comet) {
      const radius = Math.max(3, state.size * 0.85);
      const gradient = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, radius * 2.6);
      gradient.addColorStop(0, rgba(state.color, 0.9 * dim));
      gradient.addColorStop(0.35, rgba(state.colorAlt, 0.4 * dim));
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(head.x, head.y, radius * 2.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = rgba('#ffffff', 0.85 * dim);
      ctx.beginPath();
      ctx.arc(head.x, head.y, Math.max(1, radius * 0.3), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = rgba(state.color, 0.5 * dim);
      ctx.beginPath();
      ctx.arc(head.x, head.y, Math.max(1.4, state.size * 0.15), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawParticles(now, dim) {
    particles = particles.filter((particle) => now - particle.birth < particle.ttl);

    for (const particle of particles) {
      const age = (now - particle.birth) / particle.ttl;
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.018;
      particle.vx *= 0.995;

      const alpha = (1 - age) * dim * 0.9;
      ctx.fillStyle = rgba(particle.color, alpha);
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, Math.max(0.5, particle.size * (1 - age * 0.5)), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawRipples(now, dim) {
    if (state.effect === 'ripple' && last) {
      const radius = Math.max(4, state.size * 0.55);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = rgba(state.color, 0.28 * dim);
      ctx.beginPath();
      ctx.arc(last.x, last.y, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = rgba(state.colorAlt, 0.5 * dim);
      ctx.beginPath();
      ctx.arc(last.x, last.y, Math.max(1, state.size * 0.1), 0, Math.PI * 2);
      ctx.fill();
    }

    rings = rings.filter((ring) => now - ring.start < ring.life);

    for (const ring of rings) {
      const age = Math.min(1, (now - ring.start) / ring.life);
      const radius = state.size * 0.6 + age * state.size * 2.6;
      ctx.lineWidth = Math.max(1, 2.4 * (1 - age));
      ctx.strokeStyle = rgba(ring.color || state.color, (1 - age) * 0.7 * dim);
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawLaser(now, dim) {
    if (!points.length) return;
    const head = points[points.length - 1];
    const fade = Math.min(1, (now - head.t) / 180);
    const alpha = (1 - fade) * dim * 0.7;

    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(state.color, alpha);
    ctx.beginPath();
    ctx.moveTo(0, head.y);
    ctx.lineTo(width, head.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(head.x, 0);
    ctx.lineTo(head.x, height);
    ctx.stroke();

    ctx.fillStyle = rgba(state.colorAlt, alpha * 0.6);
    ctx.fillRect(head.x - 4, head.y - 4, 8, 8);
    ctx.restore();
  }

  function drawBubbles(now, dim) {
    particles = particles.filter((p) => now - p.birth < p.ttl);
    for (const p of particles) {
      const age = (now - p.birth) / p.ttl;
      p.x += p.vx;
      p.y += p.vy;
      p.vy -= 0.006;
      const alpha = (1 - age) * dim * 0.7;
      ctx.fillStyle = rgba(p.color, alpha);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, p.size * (1 - age * 0.3)), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba('#ffffff', alpha * 0.4);
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }

  function frame() {
    frameId = requestAnimationFrame(frame);
    if (!ctx || document.hidden) return;

    ctx.clearRect(0, 0, width, height);

    const dim = state.intensity / 100;
    if (dim <= 0) return;

    if (state.effect === 'trail' || state.effect === 'comet') {
      drawTrail(performance.now(), dim, state.effect === 'comet');
    } else if (state.effect === 'sparks') {
      drawParticles(performance.now(), dim);
    } else if (state.effect === 'ripple') {
      drawRipples(performance.now(), dim);
    } else if (state.effect === 'laser') {
      drawLaser(performance.now(), dim);
    } else if (state.effect === 'bubbles') {
      drawBubbles(performance.now(), dim);
    }
  }

  function startLoop() {
    if (frameId || !ctx) return;
    frameId = requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (!frameId) return;
    cancelAnimationFrame(frameId);
    frameId = 0;
  }

  function apply(options) {
    const next = options && typeof options === 'object' ? options : {};

    state.effect = EFFECTS.includes(next.effect) ? next.effect : 'none';
    state.color = typeof next.color === 'string' ? next.color : DEFAULTS.color;
    state.colorAlt = typeof next.colorAlt === 'string' ? next.colorAlt : DEFAULTS.colorAlt;
    state.size = clamp(Number(next.size) || DEFAULTS.size, 2, 40);
    state.intensity = clamp(Number(next.intensity ?? DEFAULTS.intensity), 0, 100);
    state.length = clamp(Number(next.length ?? DEFAULTS.length), 0, 100);

    if (state.effect === 'none' || state.intensity <= 0) {
      removeCanvas();
      return;
    }

    if (!ensureCanvas()) return;
    startLoop();
  }

  window.JTechCursorEffects = {
    apply,
    getState: () => ({ ...state })
  };
})();
