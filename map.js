(() => {
  'use strict';

  const D = window.SWAYAM;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);
  const svgEl = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const smooth = (t) => t * t * (3 - 2 * t);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(pointer: fine)').matches;
  const TAU = Math.PI * 2;
  const DEG = 180 / Math.PI;

  // ---------------------------------------------------------------- time → radius
  const R0 = 30;          // the self marker
  const RPY = 44;         // world units per year
  const R = (year) => R0 + Math.max(0, year - D.start) * RPY;
  const R_NOW = R(D.now);
  const R_EDGE = R_NOW + 26; // the outline of the known world
  const STUB = 80;        // how far live branches run past the edge
  const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)];

  // ---------------------------------------------------------------- data
  const threads = D.threads.map((t, i) => {
    let from = t.start;
    const phases = t.phases.map((p) => {
      const ph = { state: p.state, from, to: p.to };
      from = p.to ?? D.now;
      return ph;
    });
    const last = phases[phases.length - 1];
    return { ...t, phases, end: last.to ?? D.now, ended: last.to != null, seed: i * 1.73 + 0.4 };
  });
  const byId = Object.fromEntries(threads.map((t) => [t.id, t]));

  // regions → zones (slices of the circle, sized by how much happened in them)
  const regions = D.regions.map((r, i) => ({ ...r, seed: i * 2.3 + 1, threads: threads.filter((t) => t.region === r.id) }));
  const weight = (r) => r.threads.length + 1.2;
  const totalW = regions.reduce((s, r) => s + weight(r), 0);
  let ang = -Math.PI / 2 - (weight(regions[0]) / totalW) * Math.PI;
  regions.forEach((r) => {
    const span = (weight(r) / totalW) * TAU;
    r.a0 = ang; r.a1 = ang + span; r.mid = ang + span / 2;
    ang += span;
    r.start = Math.min(...r.threads.map((t) => t.start));
    const pad = span * 0.1, n = r.threads.length;
    r.threads.forEach((t, i) => { t.angle = r.a0 + pad + (i + 0.5) * ((span - 2 * pad) / n); t.zone = r; });
    const roots = r.threads.filter((t) => !t.from);
    r.roadEnd = Math.max(...roots.map((t) => t.start));
  });

  const roadA = (r, rad) => r.mid + 0.05 * Math.sin(rad / 80 + r.seed);
  const threadA = (t, rad) => t.angle + 0.028 * Math.sin(rad / 55 + t.seed) + 0.012 * Math.sin(rad / 23 + t.seed * 2);
  const borderA = (r, rad) => r.a0 + 0.035 * Math.sin(rad / 90 + r.seed * 1.7) + 0.018 * Math.sin(rad / 31 + r.seed);

  function radialPts(r0, r1, angleAt, step = 7) {
    const n = Math.max(2, Math.ceil((r1 - r0) / step));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const rad = lerp(r0, r1, i / n);
      const a = angleAt(rad);
      pts.push([rad * Math.cos(a), rad * Math.sin(a), rad, a]);
    }
    return pts;
  }

  function buildThread(t) {
    const rs = R(t.start), re = R(t.end);
    const a0 = t.from ? threadA(byId[t.from], rs) : roadA(t.zone, rs);
    const bend = Math.max(10, Math.min(90, (re - rs) * 0.6));
    const n = Math.max(14, Math.ceil((re - rs) / 6));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const rad = lerp(rs, re, i / n);
      const s = smooth(clamp((rad - rs) / bend));
      const a = lerp(a0, threadA(t, rad), s);
      pts.push([rad * Math.cos(a), rad * Math.sin(a), rad, a]);
    }
    t.pts = pts;
    t.bendR = rs + bend;
  }
  threads.forEach(buildThread);

  function atR(pts, rad) {
    if (rad <= pts[0][2]) return pts[0];
    for (let i = 1; i < pts.length; i++) {
      if (pts[i][2] >= rad) {
        const p = pts[i - 1], q = pts[i], u = (rad - p[2]) / Math.max(1e-6, q[2] - p[2]);
        return [lerp(p[0], q[0], u), lerp(p[1], q[1], u), rad, lerp(p[3], q[3], u)];
      }
    }
    return pts[pts.length - 1];
  }
  const slice = (pts, r0, r1) => [atR(pts, r0), ...pts.filter((p) => p[2] > r0 && p[2] < r1), atR(pts, r1)];
  const toD = (pts) => 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');

  // ---------------------------------------------------------------- sizes and states
  const RATE = { glow: 140, blink: 30, flicker: 70 };
  function sizeAt(t, year) {
    let kb = 0;
    t.phases.forEach((p) => {
      const o = Math.min(year, p.to ?? D.now) - p.from;
      if (o > 0) kb += o * RATE[p.state];
    });
    return kb;
  }
  const selfSize = (year) => threads.reduce((s, t) => s + sizeAt(t, year), 0) * 0.5 + Math.max(0, year - D.start) * 14;
  const fmt = (kb) => (kb < 0.5 ? '0 KB' : kb < 1000 ? Math.round(kb) + ' KB' : (kb / 1024).toFixed(2) + ' MB');
  const stateAt = (t, year) => {
    if (year < t.start) return null;
    if (t.ended && year > t.end + 0.15) return 'saved';
    const p = t.phases.find((ph) => year < (ph.to ?? Infinity)) || t.phases[t.phases.length - 1];
    return p.state;
  };
  const yearLabel = (y) => String(Math.floor(y));
  const span = (t) => `${yearLabel(t.start)} to ${t.ended ? yearLabel(t.end) : 'now'}`;
  const STATE_WORD = { glow: 'writing', blink: 'on and off', flicker: 'uncertain', saved: 'saved' };

  // ---------------------------------------------------------------- terrain contours
  function noise2(x, y) {
    const h = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
    const xi = Math.floor(x), yi = Math.floor(y);
    let xf = x - xi, yf = y - yi;
    xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
    return lerp(lerp(h(xi, yi), h(xi + 1, yi), xf), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), xf), yf);
  }
  const fbm = (x, y) => {
    const wx = x + 0.6 * noise2(x * 0.7 + 9, y * 0.7), wy = y + 0.6 * noise2(x * 0.7, y * 0.7 + 4);
    return 0.55 * noise2(wx, wy) + 0.3 * noise2(wx * 2.1, wy * 2.1) + 0.15 * noise2(wx * 4.3, wy * 4.3);
  };
  const EDGE_PAIRS = {
    1: [[3, 2]], 2: [[2, 1]], 3: [[3, 1]], 4: [[0, 1]], 5: [[3, 0], [2, 1]], 6: [[0, 2]], 7: [[3, 0]],
    8: [[3, 0]], 9: [[0, 2]], 10: [[0, 1], [3, 2]], 11: [[0, 1]], 12: [[3, 1]], 13: [[2, 1]], 14: [[3, 2]],
  };
  function contourSegments() {
    const step = 22, ext = R_EDGE + 30;
    const x0 = -ext, y0 = -ext;
    const nx = Math.ceil((2 * ext) / step) + 1, ny = nx;
    const v = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = fbm((x0 + i * step) / 360 + 3, (y0 + j * step) / 360 + 7);
    const levels = [];
    for (let L = 0.28; L < 0.78; L += 0.05) levels.push(L);
    const cells = nx - 1, rows = ny - 1;
    const buckets = [[], []];
    for (let c = 0; c < 2; c++) for (let n = 0; n < cells * rows; n++) buckets[c].push([]);
    levels.forEach((L, li) => {
      const cls = li % 3 === 1 ? 1 : 0;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cells; i++) {
          const a = v[j * nx + i], b = v[j * nx + i + 1], c = v[(j + 1) * nx + i + 1], d = v[(j + 1) * nx + i];
          const pairs = EDGE_PAIRS[(a > L) << 3 | (b > L) << 2 | (c > L) << 1 | (d > L)];
          if (!pairs) continue;
          const x = x0 + i * step, y = y0 + j * step;
          const pt = (e) => {
            if (e === 0) return [x + step * (L - a) / (b - a), y];
            if (e === 1) return [x + step, y + step * (L - b) / (c - b)];
            if (e === 2) return [x + step * (L - d) / (c - d), y + step];
            return [x, y + step * (L - a) / (d - a)];
          };
          const out = buckets[cls][j * cells + i];
          pairs.forEach(([e1, e2]) => { const p = pt(e1), q = pt(e2); out.push(p[0], p[1], q[0], q[1]); });
        }
      }
    });
    const pack = (list) => {
      const off = new Int32Array(list.length + 1);
      list.forEach((l, n) => { off[n + 1] = off[n] + l.length; });
      const pts = new Float32Array(off[list.length]);
      list.forEach((l, n) => pts.set(l, off[n]));
      return { off, pts };
    };
    return { x0, y0, step, cells, rows, minor: pack(buckets[0]), major: pack(buckets[1]) };
  }

  const T = contourSegments();
  const tCan = $('terrain'), lCan = $('terrain-lit');
  const tCtx = tCan.getContext('2d'), lCtx = lCan.getContext('2d');
  let dpr = 1, drawn = null;
  function sizeCanvases() {
    dpr = Math.min(2, devicePixelRatio || 1);
    [tCan, lCan].forEach((c) => { c.width = Math.round(innerWidth * dpr); c.height = Math.round(innerHeight * dpr); });
    drawn = null;
  }
  sizeCanvases();
  const INK = [
    { ctx: tCtx, minor: '#37312A', major: '#463E31' },
    { ctx: lCtx, minor: '#8F7C4C', major: '#D4AF37' },
  ];
  // Only the explored circle is charted; outside it the map is blank.
  function drawTerrain(vx, vy, w, h, known) {
    const s = (innerWidth * dpr) / w;
    const bx0 = Math.max(vx, -known), bx1 = Math.min(vx + w, known);
    const by0 = Math.max(vy, -known), by1 = Math.min(vy + h, known);
    const i0 = clamp(Math.floor((bx0 - T.x0) / T.step) - 1, 0, T.cells - 1), i1 = clamp(Math.ceil((bx1 - T.x0) / T.step) + 1, 0, T.cells - 1);
    const j0 = clamp(Math.floor((by0 - T.y0) / T.step) - 1, 0, T.rows - 1), j1 = clamp(Math.ceil((by1 - T.y0) / T.step) + 1, 0, T.rows - 1);
    INK.forEach(({ ctx, minor, major }) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.setTransform(s, 0, 0, s, -vx * s, -vy * s);
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, known, 0, TAU);
      ctx.clip();
      [[T.minor, minor, 1], [T.major, major, 1.35]].forEach(([set, color, lw]) => {
        ctx.beginPath();
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            const n = j * T.cells + i;
            for (let q = set.off[n]; q < set.off[n + 1]; q += 4) {
              ctx.moveTo(set.pts[q], set.pts[q + 1]);
              ctx.lineTo(set.pts[q + 2], set.pts[q + 3]);
            }
          }
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = (lw * dpr) / s;
        ctx.stroke();
      });
      ctx.restore();
    });
  }

  // ---------------------------------------------------------------- SVG
  const svg = $('map');
  const stage = svg.parentElement;
  const defs = svgEl('defs', {}, svg);
  const revealClip = svgEl('clipPath', { id: 'reveal' }, defs);
  const revealCircle = svgEl('circle', { cx: 0, cy: 0, r: R0 }, revealClip);

  // zone borders and the main road into each zone
  const base = svgEl('g', {}, svg);
  regions.forEach((r) => {
    svgEl('path', { class: 'border', d: toD(radialPts(R0 + 18, R_EDGE, (rad) => borderA(r, rad))) }, base);
  });
  // the coastline of the known, with a few ripples outside it like an old chart
  const coastPts = (off, wob) => {
    const pts = [];
    for (let i = 0; i <= 360; i++) {
      const a = (i / 360) * TAU;
      const rr = R_EDGE + off + wob * (6 * Math.sin(a * 7 + 1.3) + 3.5 * Math.sin(a * 17 + 0.4) + 2 * Math.sin(a * 31));
      pts.push([rr * Math.cos(a), rr * Math.sin(a)]);
    }
    return 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L') + 'Z';
  };
  svgEl('path', { class: 'coastline', d: coastPts(0, 1) }, base);
  [10, 20, 32].forEach((off, i) => svgEl('path', { class: 'coast-hatch', d: coastPts(off, 1 - i * 0.25), 'stroke-opacity': (0.16 - i * 0.04).toFixed(2) }, base));
  const charted = svgEl('g', { 'clip-path': 'url(#reveal)' }, svg);
  regions.forEach((r) => {
    r.road = svgEl('path', { class: 'road', d: toD(radialPts(R0 * 0.6, R(r.roadEnd), (rad) => roadA(r, rad))) }, charted);
  });

  // threads
  const nodes = [];
  threads.forEach((t) => {
    const g = svgEl('g', { class: 'thread' }, charted);
    t.g = g;
    t.phases.forEach((p) => {
      const seg = slice(t.pts, R(p.from), R(p.to ?? D.now));
      if (p.state === 'glow') svgEl('path', { class: 'under', d: toD(seg) }, g);
      svgEl('path', { class: `ph ph-${p.state}`, d: toD(seg) }, g);
    });
    nodes.push(svgEl('circle', { class: 'node', cx: t.pts[0][0], cy: t.pts[0][1], r: 3 }, g));
    if (t.ended) {
      const e = t.pts[t.pts.length - 1];
      nodes.push(svgEl('circle', { class: 'node', cx: e[0], cy: e[1], r: 3 }, g));
    }
    t.hit = svgEl('path', { class: 'hit', d: toD(t.pts) }, g);
    t.hit.__thread = t;
  });

  // the edge of the known, its year, and the zone names around it
  const overlay = svgEl('g', { class: 'overlay' }, svg);
  regions.forEach((r) => {
    r.text = svgEl('text', { class: 'zone-label' }, overlay);
    r.text.textContent = r.label;
  });

  // live branches run past the edge and end in next.swayam
  const next = svgEl('g', { class: 'next' }, overlay);
  const live = threads.filter((t) => !t.ended);
  live.forEach((t) => {
    const pts = radialPts(R_NOW, R_EDGE + STUB, (rad) => threadA(t, rad), 6);
    t.stub = svgEl('path', { class: 'stub', d: toD(pts) }, next);
    const e = pts[pts.length - 1];
    t.stubEnd = e;
    t.stubNode = svgEl('circle', { class: 'stub-node', cx: e[0], cy: e[1], r: 3 }, next);
    t.nextText = svgEl('text', { class: 'next-label' }, next);
    t.nextText.textContent = 'next.swayam';
  });
  const unknownTexts = regions.filter((r, i) => i % 2 === 0).map((r) => {
    const tx = svgEl('text', { class: 'unknown-label', 'text-anchor': 'middle' }, next);
    tx.textContent = 'unknown';
    tx.angle = r.a0;
    return tx;
  });

  // thread labels sit along the last stretch of their own line
  const labels = svgEl('g', {}, overlay);
  threads.forEach((t) => {
    t.label = svgEl('text', { class: 'label', opacity: 0 }, labels);
    t.labelName = svgEl('tspan', { class: 'name' }, t.label);
    t.labelName.textContent = t.file;
    t.labelSize = svgEl('tspan', { class: 'size', dx: '0.7em' }, t.label);
    t.tipDot = svgEl('circle', { class: 'tipdot', r: 2.5, opacity: 0 }, labels);
  });

  // handwritten margin notes
  const notes = svgEl('g', {}, overlay);
  threads.filter((t) => t.scribble).forEach((t) => {
    const at = clamp(t.scribble.at, t.start + 0.2, t.end);
    const p = atR(t.pts, R(at));
    const sideSign = t.angle >= t.zone.mid ? 1 : -1;
    const g = svgEl('g', { class: 'scribble', opacity: 0 }, notes);
    const arrow = svgEl('path', {}, g);
    const text = svgEl('text', {}, g);
    text.textContent = t.scribble.text;
    t.note = t.note || '';
    t.scrib = { at, p, sideSign, g, arrow, text };
  });

  // self at the centre
  const centre = svgEl('g', {}, overlay);
  const halo = svgEl('circle', { class: 'head-halo', r: 16 }, centre);
  const centreRing = svgEl('circle', { class: 'centre-ring', r: 11 }, centre);
  const centreDot = svgEl('circle', { class: 'head-dot', r: 5 }, centre);
  const centreLabel = svgEl('text', { class: 'core-label', 'text-anchor': 'middle' }, overlay);
  centreLabel.textContent = 'self.swayam';

  // ---------------------------------------------------------------- HUD
  const lettersEl = $('letters');
  const letterLis = D.letters.map((l) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="ch">${l.ch}</span><span class="w">${l.word}</span>`;
    li.title = l.line;
    lettersEl.appendChild(li);
    return li;
  });

  const segs = [{ kind: 'intro', weight: 0.06, from: D.start, to: D.start }];
  D.beats.forEach((b, i) => segs.push({ kind: 'beat', beat: b, index: i, weight: b.weight, from: b.from, to: b.to }));
  segs.push({ kind: 'end', weight: 0.04, from: D.now, to: D.now });
  const total = segs.reduce((s, g) => s + g.weight, 0);
  let acc = 0;
  segs.forEach((g) => { g.p0 = acc / total; acc += g.weight; g.p1 = acc / total; });
  const finalBeat = segs.find((g) => g.kind === 'beat' && g.beat.from >= D.now - 0.01);

  function sample(p) {
    const g = segs.find((s) => p <= s.p1) || segs[segs.length - 1];
    const u = clamp((p - g.p0) / (g.p1 - g.p0));
    return { seg: g, u, year: lerp(g.from, g.to, ease(u)) };
  }

  // ---------------------------------------------------------------- input
  const pointer = { x: innerWidth * 0.5, y: innerHeight * 0.5, moved: -1e9 };
  const cursor = $('cursor');
  if (finePointer && !reduced) document.documentElement.classList.add('has-cursor');
  const tip = $('tip');
  let hot = null, tipTimer = 0;

  addEventListener('pointermove', (e) => {
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.moved = performance.now();
    if (hot) placeTip();
  }, { passive: true });

  function placeTip() {
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = pointer.x + 18, y = pointer.y + 18;
    if (x + w > innerWidth - 12) x = pointer.x - w - 18;
    if (y + h > innerHeight - 12) y = pointer.y - h - 18;
    tip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  }
  function showTip(t) {
    if (hot && hot !== t) hot.g.classList.remove('hot');
    hot = t;
    t.g.classList.add('hot');
    cursor.classList.add('hot');
    const st = stateAt(t, state.year) || 'glow';
    const onward = !t.ended && state.year >= D.now - 0.01 ? '<div class="m">continues as next.swayam · 0 KB</div>' : '';
    tip.innerHTML =
      `<div class="f">${t.region}/<b>${t.file}</b></div>` +
      `<div class="m">${span(t)} · ${STATE_WORD[st]} · ${fmt(sizeAt(t, state.year))}</div>` + onward +
      (t.note ? `<div class="n">${t.note}</div>` : '');
    tip.classList.add('on');
    placeTip();
  }
  function hideTip() {
    if (hot) hot.g.classList.remove('hot');
    hot = null;
    cursor.classList.remove('hot');
    tip.classList.remove('on');
  }
  svg.addEventListener('pointerover', (e) => { const t = e.target.__thread; if (t && e.pointerType === 'mouse') showTip(t); });
  svg.addEventListener('pointerout', (e) => { if (e.target.__thread && e.pointerType === 'mouse') hideTip(); });
  svg.addEventListener('pointerdown', (e) => {
    const t = e.target.__thread;
    if (!t || e.pointerType === 'mouse') return;
    pointer.x = e.clientX; pointer.y = e.clientY;
    showTip(t);
    clearTimeout(tipTimer);
    tipTimer = setTimeout(hideTip, 3200);
  });

  // ---------------------------------------------------------------- camera
  const journey = $('journey');
  const filesEl = $('files'), beatEl = $('beat'), introEl = $('intro'), legendEl = $('legend');
  const yearEl = $('year'), scaleBar = $('scalebar'), scaleText = $('scaletext');
  const state = { p: 0, year: D.start, view: null, beatIndex: -2, filesKey: '' };

  function scrollP() {
    const r = journey.getBoundingClientRect();
    const span = r.height - innerHeight;
    return span > 0 ? clamp(-r.top / span) : 0;
  }

  // screen space the HUD keeps for itself in the final, whole-map view
  function finalBand() {
    if (innerWidth >= 1080 && innerWidth / innerHeight > 1.2) return { top: 110, bottom: 44, maxD: innerWidth - 2 * 360 };
    if (innerWidth <= 720) return { top: 150, bottom: 262, maxD: innerWidth - 16 };
    return { top: 120, bottom: 262, maxD: innerWidth - 40 };
  }
  const tagsOn = () => innerWidth > 720;

  function targetView(year, s) {
    const W = innerWidth, H = innerHeight;
    // during the journey the map fills the screen: centred, the explored
    // radius reaching the far corners, so the edge stays out of sight
    const shift = W <= 720 ? -60 : 0;
    const halfMin = Math.min(W / 2, H / 2 - Math.abs(shift));
    const halfDiag = Math.hypot(W / 2, H / 2 + Math.abs(shift));
    const kJourney = Math.max(170 / halfMin, (R(year) * 1.04) / halfDiag);
    // at Meaning the camera pulls right back until the outline and the unknown show
    const B = finalBand();
    const bandH = Math.max(180, H - B.top - B.bottom);
    const half = Math.max(90, Math.min(bandH, B.maxD) / 2);
    const kFinal = (R_EDGE + STUB) / Math.max(40, half - (tagsOn() ? 100 : 40));
    let pull = 0;
    if (finalBeat && s.seg === finalBeat) pull = ease(clamp(s.u / 0.6));
    if (s.seg.kind === 'end') pull = 1;
    const k = lerp(kJourney, Math.max(kJourney, kFinal), pull);
    const finalShift = B.top + bandH / 2 - H / 2;
    const sh = lerp(shift, finalShift, pull);
    const w = k * W;
    return { cx: 0, cy: -sh * k, w, h: w / (W / H), pull };
  }

  function setBeat(i) {
    if (i === state.beatIndex) return;
    state.beatIndex = i;
    beatEl.classList.add('out');
    clearTimeout(setBeat.t);
    setBeat.t = setTimeout(() => {
      if (i < 0) { beatEl.innerHTML = ''; return; }
      const b = D.beats[i], l = D.letters[b.letter];
      const end = b.to >= D.now - 0.01 ? 'now' : yearLabel(b.to);
      const yrs = b.from >= D.now - 0.01 ? 'Today' : yearLabel(b.from) === end ? end : `${yearLabel(b.from)} to ${end}`;
      beatEl.innerHTML =
        `<div class="big"><span class="ch">${l.ch}</span><span class="word">${l.word}</span></div>` +
        `<p class="line">${l.line}</p><p class="cap">${b.caption}</p><p class="yr">${yrs}</p>`;
      beatEl.classList.remove('out');
    }, reduced ? 0 : 260);
  }

  function renderFiles(year, final) {
    const active = threads
      .filter((t) => year >= t.start && (!t.ended || year <= t.end + 0.9))
      .sort((a, b) => b.start - a.start);
    const shown = active.slice(0, final ? 3 : 4);
    const savedCount = threads.filter((t) => t.ended && year > t.end + 0.15).length;
    const rows = shown.map((t) => {
      const st = stateAt(t, year);
      const glyph = st === 'saved' ? '○' : st === 'blink' ? '◐' : '●';
      return `<div class="row"><span><span class="st ${st === 'blink' ? 'blink' : st === 'saved' ? 'saved' : ''}">${glyph}</span>${t.file}</span><span class="sz">${fmt(sizeAt(t, year))}</span></div>`;
    });
    if (final) rows.push(`<div class="row nextrow"><span><span class="st">◌</span>next.swayam</span><span class="sz">0 KB × ${live.length}</span></div>`);
    const more = active.length - shown.length;
    const tail = [];
    if (more > 0) tail.push(`${more} more open`);
    if (savedCount) tail.push(`${savedCount} saved`);
    const html =
      `<div class="row self"><span>self.swayam</span><span class="sz">${fmt(selfSize(year))}</span></div>` +
      rows.join('') + (tail.length ? `<div class="row more"><span>${tail.join(', ')}</span></div>` : '');
    if (html !== state.filesKey) { filesEl.innerHTML = html; state.filesKey = html; }
  }

  // text that runs along a radius, kept upright
  function alongRadius(el, x, y, a, outward, k, gap) {
    const right = Math.cos(a) >= 0;
    const deg = a * DEG + (right ? 0 : 180);
    const anchor = outward === right ? 'start' : 'end';
    const d = (outward ? 1 : -1) * gap * k;
    el.setAttribute('text-anchor', anchor);
    el.setAttribute('transform', `translate(${(x + Math.cos(a) * d).toFixed(1)} ${(y + Math.sin(a) * d).toFixed(1)}) rotate(${deg.toFixed(2)})`);
  }

  // ---------------------------------------------------------------- frame loop
  let last = performance.now();
  let lastK = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const a = reduced ? 1 : 1 - Math.exp(-dt * 7);

    state.p = lerp(state.p, scrollP(), reduced ? 1 : 1 - Math.exp(-dt * 9));
    const s = sample(state.p);
    state.year = s.year;
    const tv = targetView(s.year, s);
    const v = state.view
      ? { cx: lerp(state.view.cx, tv.cx, a), cy: lerp(state.view.cy, tv.cy, a), w: lerp(state.view.w, tv.w, a), pull: tv.pull }
      : tv;
    v.h = v.w / (innerWidth / innerHeight);
    state.view = v;
    const k = v.w / innerWidth;
    const vx = v.cx - v.w / 2, vy = v.cy - v.h / 2;
    svg.setAttribute('viewBox', `${vx.toFixed(2)} ${vy.toFixed(2)} ${v.w.toFixed(2)} ${v.h.toFixed(2)}`);
    svg.style.setProperty('--k', k.toFixed(4));

    const known = R(state.year);
    revealCircle.setAttribute('r', known.toFixed(1));
    const final = v.pull > 0.5;
    if (!drawn || Math.abs(drawn.vx - vx) > k * 0.3 || Math.abs(drawn.vy - vy) > k * 0.3 || Math.abs(drawn.w - v.w) > k * 0.3) {
      drawTerrain(vx, vy, v.w, v.h, R_EDGE);
      drawn = { vx, vy, w: v.w, known };
    }
    let tx = pointer.x, ty = pointer.y;
    if (!finePointer && now - pointer.moved > 2500) {
      const t = now / 1000;
      tx = innerWidth * (0.5 + 0.26 * Math.sin(t * 0.31));
      ty = innerHeight * (0.42 + 0.2 * Math.sin(t * 0.47 + 1));
    }
    lCan.style.setProperty('--tx', tx.toFixed(0) + 'px');
    lCan.style.setProperty('--ty', ty.toFixed(0) + 'px');
    if (finePointer) cursor.style.transform = `translate(${pointer.x}px, ${pointer.y}px)`;

    if (Math.abs(k - lastK) / k > 0.01) {
      lastK = k;
      nodes.forEach((n) => n.setAttribute('r', (3.2 * k).toFixed(2)));
      live.forEach((t) => {
        t.stubNode.setAttribute('r', (3.4 * k).toFixed(2));
        alongRadius(t.nextText, t.stubEnd[0], t.stubEnd[1], t.stubEnd[3], true, k, 8);
      });
      threads.forEach((t) => t.tipDot.setAttribute('r', (2.6 * k).toFixed(2)));
      halo.setAttribute('r', (17 * k).toFixed(2));
      centreRing.setAttribute('r', (11 * k).toFixed(2));
      centreDot.setAttribute('r', (5 * k).toFixed(2));
      centreLabel.setAttribute('y', (26 * k).toFixed(1));
      unknownTexts.forEach((tx) => {
        const [x, y] = polar(R_EDGE + STUB + (tagsOn() ? 100 : 34) * k, tx.angle);
        tx.setAttribute('x', x.toFixed(1));
        tx.setAttribute('y', (y + 4 * k).toFixed(1));
      });
    }

    // zones: lettered inside their territory at a steady place on screen
    const halfMinNow = Math.min(innerWidth, innerHeight) / 2;
    regions.forEach((r) => {
      const rr = lerp(Math.min(R_NOW * 0.6, k * halfMinNow * 0.6), R_NOW * 0.6, v.pull);
      const a = (r.a0 + r.mid) / 2;
      const [x, y] = polar(Math.max(70, rr), a);
      r.text.setAttribute('text-anchor', 'middle');
      r.text.setAttribute('x', x.toFixed(1));
      r.text.setAttribute('y', (y + 5 * k).toFixed(1));
      r.text.classList.toggle('lit', state.year >= r.start);
    });

    // handwritten notes show for a few years after their moment
    threads.forEach((t) => {
      const sc = t.scrib;
      if (!sc) return;
      const on = !final && state.year >= sc.at && state.year <= sc.at + 4.2 && 1 / k > 0.22;
      sc.g.setAttribute('opacity', on ? 1 : 0);
      if (!on) return;
      const [px, py, , pa] = sc.p;
      const tx = Math.cos(pa + Math.PI / 2) * sc.sideSign, ty = Math.sin(pa + Math.PI / 2) * sc.sideSign;
      const rx = Math.cos(pa), ry = Math.sin(pa);
      const sx = px + tx * 46 * k - rx * 10 * k, sy = py + ty * 46 * k - ry * 10 * k;   // where the text starts
      const ex = px + tx * 7 * k, ey = py + ty * 7 * k;                                    // arrow tip, just off the line
      const cxp = (sx + ex) / 2 + rx * 16 * k, cyp = (sy + ey) / 2 + ry * 16 * k;
      const ang = Math.atan2(ey - cyp, ex - cxp), hl = 7 * k;
      sc.arrow.setAttribute('d',
        `M${(sx - tx * 4 * k).toFixed(1)} ${(sy - ty * 4 * k).toFixed(1)} Q${cxp.toFixed(1)} ${cyp.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}` +
        ` M${ex.toFixed(1)} ${ey.toFixed(1)} l${(-Math.cos(ang - 0.5) * hl).toFixed(1)} ${(-Math.sin(ang - 0.5) * hl).toFixed(1)}` +
        ` M${ex.toFixed(1)} ${ey.toFixed(1)} l${(-Math.cos(ang + 0.5) * hl).toFixed(1)} ${(-Math.sin(ang + 0.5) * hl).toFixed(1)}`);
      const leftward = tx < 0;
      sc.text.setAttribute('text-anchor', leftward ? 'end' : 'start');
      sc.text.setAttribute('transform', `translate(${(sx + tx * 4 * k).toFixed(1)} ${(sy + ty * 4 * k + 6 * k).toFixed(1)}) rotate(-3)`);
    });

    // threads and their labels
    const showLabels = !final && 1 / k > 0.22;
    let storm = false;
    threads.forEach((t) => {
      const st = stateAt(t, state.year);
      t.g.classList.toggle('saved', st === 'saved');
      t.g.classList.toggle('flickering', st === 'flicker');
      if (st === 'flicker') storm = true;
      const writing = st && st !== 'saved';
      const tipR = Math.min(known, R(t.end));
      const p = atR(t.pts, tipR);
      if (writing) {
        t.tipDot.setAttribute('cx', p[0].toFixed(1));
        t.tipDot.setAttribute('cy', p[1].toFixed(1));
      }
      t.tipDot.setAttribute('opacity', writing && known > R(t.start) + 3 ? 1 : 0);
      const visible = showLabels && st && known >= t.bendR && (writing || state.year <= t.end + 0.9);
      if (visible) {
        // run the label inward along the line, just off to one side of it
        const off = 5 * k;
        const px = p[0] + Math.cos(p[3] - Math.PI / 2) * off, py = p[1] + Math.sin(p[3] - Math.PI / 2) * off;
        alongRadius(t.label, px, py, p[3], false, k, 6);
        const sz = fmt(sizeAt(t, state.year));
        if (t.labelSize.textContent !== sz) t.labelSize.textContent = sz;
      }
      t.label.classList.toggle('saved', st === 'saved');
      t.label.setAttribute('opacity', visible ? 1 : 0);
    });
    stage.classList.toggle('storm', storm);
    svg.classList.toggle('final', final);

    // HUD: the charted year and a scale bar that follows the zoom
    const yr = state.year >= D.now - 0.01 ? 'now' : yearLabel(state.year);
    if (yearEl.textContent !== yr) yearEl.textContent = yr;
    const pxPerYear = RPY / k;
    const unit = [1, 2, 5, 10].find((u) => u * pxPerYear >= 34) || 10;
    scaleBar.style.width = Math.min(130, unit * pxPerYear).toFixed(0) + 'px';
    const st = unit === 1 ? '1 year' : unit + ' years';
    if (scaleText.textContent !== st) scaleText.textContent = st;

    introEl.style.opacity = (1 - clamp((state.p - 0.01) / 0.04)).toFixed(3);
    segs.forEach((g) => {
      if (g.kind !== 'beat') return;
      const on = state.p >= g.p0 + (g.p1 - g.p0) * (g === finalBeat ? 0.45 : 0.2);
      letterLis[g.beat.letter].classList.toggle('lit', on);
    });
    setBeat(s.seg.kind === 'beat' ? s.seg.index : -1);
    // panels leave with the map once the journey is over
    const jr = journey.getBoundingClientRect();
    const leave = clamp((jr.bottom - innerHeight * 0.55) / (innerHeight * 0.45));
    const enter = s.seg.kind === 'intro' ? clamp(s.u * 3) : 1;
    legendEl.style.opacity = (enter * leave).toFixed(3);
    $('charted').style.opacity = leave.toFixed(3);
    beatEl.style.opacity = leave.toFixed(3);
    renderFiles(state.year, final);

    requestAnimationFrame(frame);
  }

  addEventListener('resize', () => { lastK = 0; sizeCanvases(); });
  requestAnimationFrame(frame);
})();
