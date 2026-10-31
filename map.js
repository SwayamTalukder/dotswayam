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
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(pointer: fine)').matches;

  // ---------------------------------------------------------------- geometry
  const YEAR_W = 160;
  const X = (year) => (year - D.start) * YEAR_W;
  const NOW_X = X(D.now);
  const FOG_X0 = NOW_X + 70;
  const FOG_X1 = NOW_X + 900;

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

  // regions → lanes. Overlapping threads in a region get their own slot.
  const SLOT = 26, GAP = 50, CORE = 84;
  const regions = D.regions.map((r) => ({ ...r, threads: threads.filter((t) => t.region === r.id) }));
  regions.forEach((r) => {
    const ends = [];
    r.threads.slice().sort((a, b) => a.start - b.start).forEach((t) => {
      let i = ends.findIndex((e) => e + 0.5 <= t.start);
      if (i < 0) { i = ends.length; ends.push(t.end); } else ends[i] = t.end;
      t.slot = i;
    });
    r.slots = Math.max(1, ends.length);
  });
  let up = -CORE, down = CORE;
  regions.filter((r) => r.side < 0).reverse().forEach((r) => {
    r.y = up; r.dir = -1; up -= (r.slots - 1) * SLOT + GAP;
  });
  regions.filter((r) => r.side > 0).forEach((r) => {
    r.y = down; r.dir = 1; down += (r.slots - 1) * SLOT + GAP;
  });
  const MIN_Y = up + GAP - 40;
  const MAX_Y = down - GAP + 40;
  const AXIS_Y = MAX_Y + 46;
  const CONTENT_H = AXIS_Y + 30 - MIN_Y;
  const CONTENT_CY = (MIN_Y + AXIS_Y + 30) / 2;
  const regionOf = Object.fromEntries(regions.map((r) => [r.id, r]));
  threads.forEach((t) => { const r = regionOf[t.region]; t.laneY = r.y + r.dir * t.slot * SLOT; });

  const yAt = (t, x) => t.laneY + 4 * Math.sin(x / 130 + t.seed) + 2.5 * Math.sin(x / 53 + t.seed * 1.9);

  function buildPoints(t) {
    const xs = X(t.start), xe = X(t.end);
    const parent = t.from ? byId[t.from] : null;
    const oy = parent ? yAt(parent, xs) : 0;
    const bend = Math.min(90, (xe - xs) * 0.55);
    const px = xs + bend, py = yAt(t, px);
    const pts = [];
    for (let i = 0; i <= 18; i++) {
      const u = i / 18, m = 1 - u;
      const bx = m * m * m * xs + 3 * m * m * u * (xs + bend * 0.5) + 3 * m * u * u * (px - bend * 0.5) + u * u * u * px;
      const by = (m * m * m + 3 * m * m * u) * oy + (3 * m * u * u + u * u * u) * py;
      pts.push([bx, by]);
    }
    for (let x = px + 12; x < xe; x += 12) pts.push([x, yAt(t, x)]);
    if (xe > px) pts.push([xe, yAt(t, xe)]);
    t.origin = [xs, oy];
    t.bendX = px;
    return pts;
  }

  function yOnPts(pts, x) {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (pts[i][0] >= x) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        return lerp(y0, y1, (x - x0) / Math.max(1e-6, x1 - x0));
      }
    }
    return pts[pts.length - 1][1];
  }

  function slicePts(pts, a, b) {
    const out = [[a, yOnPts(pts, a)]];
    pts.forEach((p) => { if (p[0] > a && p[0] < b) out.push(p); });
    out.push([b, yOnPts(pts, b)]);
    return out;
  }
  const toD = (pts) => 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');

  // ---------------------------------------------------------------- sizes
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

  // ---------------------------------------------------------------- noise + contours
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
  // Contour segments, bucketed per grid cell so only the visible part is drawn.
  function contourSegments() {
    const step = 32, x0 = -1100, x1 = FOG_X1 + 1100, y0 = MIN_Y - 2700, y1 = AXIS_Y + 2700;
    const nx = Math.ceil((x1 - x0) / step) + 1, ny = Math.ceil((y1 - y0) / step) + 1;
    const v = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = fbm((x0 + i * step) / 480, (y0 + j * step) / 480);
    const levels = [];
    for (let L = 0.28; L < 0.78; L += 0.05) levels.push(L);
    const cells = nx - 1, rows = ny - 1;
    const buckets = [[], []]; // minor, major: flat [x1,y1,x2,y2,...] per cell
    for (let c = 0; c < 2; c++) for (let n = 0; n < cells * rows; n++) buckets[c].push([]);
    levels.forEach((L, li) => {
      const cls = li % 3 === 1 ? 1 : 0;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cells; i++) {
          const a = v[j * nx + i], b = v[j * nx + i + 1], c = v[(j + 1) * nx + i + 1], d = v[(j + 1) * nx + i];
          const idx = (a > L) << 3 | (b > L) << 2 | (c > L) << 1 | (d > L);
          const pairs = EDGE_PAIRS[idx];
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

  // ---------------------------------------------------------------- terrain (canvas)
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
  function drawTerrain(vx, vy, w, h) {
    const s = (innerWidth * dpr) / w; // device px per world unit
    const i0 = clamp(Math.floor((vx - T.x0) / T.step) - 1, 0, T.cells - 1), i1 = clamp(Math.ceil((vx + w - T.x0) / T.step) + 1, 0, T.cells - 1);
    const j0 = clamp(Math.floor((vy - T.y0) / T.step) - 1, 0, T.rows - 1), j1 = clamp(Math.ceil((vy + h - T.y0) / T.step) + 1, 0, T.rows - 1);
    INK.forEach(({ ctx, minor, major }) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.setTransform(s, 0, 0, s, -vx * s, -vy * s);
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
      // the terrain thins out into the fog after "now"
      ctx.globalCompositeOperation = 'destination-in';
      const g = ctx.createLinearGradient(NOW_X, 0, FOG_X0 + 340, 0);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(vx, vy, w, h);
      ctx.globalCompositeOperation = 'source-over';
    });
  }

  // ---------------------------------------------------------------- build the SVG
  const svg = $('map');
  const stage = svg.parentElement;
    const defs = svgEl('defs', {}, svg);

  const fogBlob = svgEl('radialGradient', { id: 'fogBlob' }, defs);
  svgEl('stop', { offset: '0', 'stop-color': '#4A4236', 'stop-opacity': '.55' }, fogBlob);
  svgEl('stop', { offset: '1', 'stop-color': '#4A4236', 'stop-opacity': '0' }, fogBlob);
  const fogEdge = svgEl('linearGradient', { id: 'fogEdge', gradientUnits: 'userSpaceOnUse', x1: NOW_X - 40, x2: FOG_X0 + 260, y1: 0, y2: 0 }, defs);
  svgEl('stop', { offset: '0', 'stop-color': '#211E18', 'stop-opacity': '0' }, fogEdge);
  svgEl('stop', { offset: '1', 'stop-color': '#211E18', 'stop-opacity': '.9' }, fogEdge);

  const revealClip = svgEl('clipPath', { id: 'reveal' }, defs);
  const revealRect = svgEl('rect', { x: -3000, y: -6000, width: 3000, height: 12000 }, revealClip);

  // fog over the unknown
  const fog = svgEl('g', { class: 'fog' }, svg);
  svgEl('rect', { x: NOW_X - 40, y: -6000, width: FOG_X1 - NOW_X + 6000, height: 12000, fill: 'url(#fogEdge)' }, fog);
  const blobs = svgEl('g', {}, fog);
  for (let i = 0; i < 9; i++) {
    const r = noise2(i * 3.1, 7.7);
    svgEl('ellipse', {
      class: 'fog-blob',
      cx: (FOG_X0 + 40 + (i % 3) * 260 + r * 120).toFixed(0),
      cy: (MIN_Y + (CONTENT_H * (Math.floor(i / 3) + 0.5)) / 3 + (r - 0.5) * 120).toFixed(0),
      rx: (260 + r * 180).toFixed(0), ry: (150 + r * 110).toFixed(0), fill: 'url(#fogBlob)',
    }, blobs);
  }

  // axis
  const axis = svgEl('g', { class: 'axis' }, svg);
  const yearTexts = [];
  for (let y = D.start; y <= Math.floor(D.now); y++) {
    svgEl('line', { x1: X(y), x2: X(y), y1: AXIS_Y - 6, y2: AXIS_Y }, axis);
    yearTexts.push(Object.assign(svgEl('text', { x: X(y), y: AXIS_Y + 16, 'text-anchor': 'middle' }, axis), { textContent: y, year: y }));
  }
  svgEl('line', { class: 'now-line', x1: NOW_X, x2: NOW_X, y1: MIN_Y + 20, y2: AXIS_Y }, axis);
  const nowText = svgEl('text', { class: 'now-text', x: NOW_X, y: AXIS_Y + 16, 'text-anchor': 'middle' }, axis);
  nowText.textContent = 'now';

  // threads
  const lines = svgEl('g', { class: 'threads', 'clip-path': 'url(#reveal)' }, svg);
  svgEl('path', { class: 'core', d: `M${X(D.start)} 0 L${NOW_X} 0` }, lines);
  const overlay = svgEl('g', { class: 'overlay' }, svg);
  const nodes = [];

  threads.forEach((t) => {
    const pts = buildPoints(t);
    t.pts = pts;
    const g = svgEl('g', { class: 'thread' }, lines);
    t.g = g;
    t.phases.forEach((p) => {
      const seg = slicePts(pts, Math.max(X(p.from), pts[0][0]), X(p.to ?? D.now));
      if (p.state === 'glow') svgEl('path', { class: 'under', d: toD(seg) }, g);
      svgEl('path', { class: `ph ph-${p.state}`, d: toD(seg) }, g);
    });
    nodes.push(svgEl('circle', { class: 'node', cx: t.origin[0], cy: t.origin[1], r: 3 }, g));
    if (t.ended) nodes.push(svgEl('circle', { class: 'node', cx: X(t.end), cy: yOnPts(pts, X(t.end)), r: 3 }, g));
    t.hit = svgEl('path', { class: 'hit', d: toD(pts) }, g);
    t.hit.__thread = t;

    t.label = svgEl('text', { class: 'label', opacity: 0 }, overlay);
    t.labelName = svgEl('tspan', { class: 'name' }, t.label);
    t.labelName.textContent = t.file;
    t.labelSize = svgEl('tspan', { class: 'size', dx: '0.8em' }, t.label);
    t.tipDot = svgEl('circle', { class: 'tipdot', r: 2.5, opacity: 0 }, overlay);
  });

  // region + core labels (pinned to the left edge of the view)
  regions.forEach((r) => {
    const outer = r.y + r.dir * (r.slots - 1) * SLOT;
    r.topLane = r.dir < 0 ? outer : r.y;
    r.text = svgEl('text', { class: 'region-label' }, overlay);
    r.text.textContent = r.label;
  });
  const coreLabel = svgEl('text', { class: 'core-label', y: -10 }, overlay);
  coreLabel.textContent = 'self.swayam';

  // head
  const head = svgEl('g', {}, overlay);
  const halo = svgEl('circle', { class: 'head-halo', r: 16 }, head);
  const headDot = svgEl('circle', { class: 'head-dot', r: 5.5 }, head);

  // the unknown
  const next = svgEl('g', { class: 'next' }, overlay);
  const nextPath = svgEl('path', { class: 'next-path', d: `M${NOW_X} 0 L${FOG_X0 + 150} 0` }, next);
  const nextDot = svgEl('circle', { cx: FOG_X0 + 150, cy: 0, r: 4, fill: 'none', stroke: '#D4AF37', 'stroke-opacity': '.6' }, next);
  const nextName = svgEl('text', { class: 'next-label', x: FOG_X0 + 170, y: -6 }, next);
  nextName.textContent = 'next.swayam';
  const nextSize = svgEl('text', { class: 'next-label next-size', x: FOG_X0 + 170, y: 12 }, next);
  nextSize.textContent = '0 KB';
  const unknownLabel = svgEl('text', { class: 'region-label', x: FOG_X0 + 170, y: MIN_Y + 30 }, next);
  unknownLabel.textContent = 'unknown/';

  // ---------------------------------------------------------------- HUD
  const lettersEl = $('letters');
  const letterLis = D.letters.map((l) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="ch">${l.ch}</span><span class="w">${l.word}</span>`;
    lettersEl.appendChild(li);
    return li;
  });
  $('manifesto').innerHTML =
    '<div><ol>' +
    D.letters.map((l) => `<li><span class="ch">${l.ch}</span><span class="word">${l.word}</span><span class="line">${l.line}</span></li>`).join('') +
    '</ol><p class="close">I am my first project.</p><p class="after">next.swayam · 0 KB · the map is still being drawn</p></div>';

  // scroll segments: intro, the beats, then the manifesto
  const segs = [{ kind: 'intro', weight: 0.07, from: D.start, to: D.start }];
  D.beats.forEach((b, i) => segs.push({ kind: 'beat', beat: b, index: i, weight: b.weight, from: b.from, to: b.to }));
  segs.push({ kind: 'end', weight: 0.06, from: D.now, to: D.now });
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
  const pointer = { x: innerWidth * 0.62, y: innerHeight * 0.45, moved: -1e9 };
  const cursor = $('cursor');
  if (finePointer && !reduced) document.documentElement.classList.add('has-cursor');
  const tip = $('tip');
  let hot = null;
  let tipTimer = 0;

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
    tip.innerHTML =
      `<div class="f">${t.region}/<b>${t.file}</b></div>` +
      `<div class="m">${span(t)} · ${STATE_WORD[st]} · ${fmt(sizeAt(t, state.year))}</div>` +
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

  // ---------------------------------------------------------------- frame loop
  const state = { p: 0, year: D.start, view: null, k: 1, beatIndex: -2, filesKey: '' };
  const filesEl = $('files'), beatEl = $('beat'), introEl = $('intro'), manifestoEl = $('manifesto');

  function scrollP() {
    const max = document.documentElement.scrollHeight - innerHeight;
    return max > 0 ? clamp(scrollY / max) : 0;
  }

  // screen space reserved for the HUD above and below the map
  const pads = () => (innerWidth <= 720 ? { top: 150, bottom: 262 } : { top: 98, bottom: 252 });

  function targetView(year, s) {
    const aspect = innerWidth / innerHeight;
    const portrait = aspect < 1;
    const pad = pads();
    const bandH = Math.max(200, innerHeight - pad.top - pad.bottom);
    const bandShift = pad.top + bandH / 2 - innerHeight / 2; // px the band centre sits below screen centre
    const headX = X(year);
    const journeyW = clamp((CONTENT_H / bandH) * innerWidth, 480, 3200);
    const closeW = Math.min(journeyW, portrait ? 520 : 820);
    // zoom from the dot out to the journey during the first part of W
    let zoom = 0;
    if (s.seg.kind === 'beat' && s.seg.index >= 1) zoom = s.seg.index === 1 ? ease(clamp(s.u / 0.35)) : 1;
    if (s.seg.kind === 'end') zoom = 1;
    let w = lerp(closeW, journeyW, zoom);
    let cx = headX + w * (portrait ? 0.2 : 0.12);
    let cy = lerp(0, CONTENT_CY, zoom);
    // pull back at Meaning: the whole map on wide screens, the recent years plus the fog on phones
    let pull = 0;
    if (finalBeat && s.seg === finalBeat) pull = ease(clamp(s.u / 0.6));
    if (s.seg.kind === 'end') pull = 1;
    if (pull > 0) {
      const x0 = portrait ? X(D.now - 8) : X(D.start) - 160, x1 = FOG_X1 + 80;
      const fullW = Math.max((x1 - x0) * 1.02, (CONTENT_H / bandH) * innerWidth);
      w = lerp(w, fullW, pull);
      cx = lerp(cx, (x0 + x1) / 2, pull);
      cy = lerp(cy, CONTENT_CY, pull);
    }
    cy -= bandShift * (w / innerWidth);
    return { cx, cy, w, h: w / aspect, pull, zoom };
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
    const shown = active.slice(0, 4);
    const savedCount = threads.filter((t) => t.ended && year > t.end + 0.15).length;
    const rows = shown.map((t) => {
      const st = stateAt(t, year);
      const glyph = st === 'saved' ? '○' : st === 'blink' ? '◐' : '●';
      return `<div class="row"><span><span class="st ${st === 'blink' ? 'blink' : st === 'saved' ? 'saved' : ''}">${glyph}</span>${t.file}</span><span class="sz">${fmt(sizeAt(t, year))}</span></div>`;
    });
    const more = active.length - shown.length;
    if (final) rows.push('<div class="row"><span><span class="st">◌</span>next.swayam</span><span class="sz">0 KB</span></div>');
    const tail = [];
    if (more > 0) tail.push(`${more} more open`);
    if (savedCount) tail.push(`${savedCount} saved`);
    const html =
      `<div class="row self"><span>self.swayam</span><span class="sz">${fmt(selfSize(year))}</span></div>` +
      rows.join('') + (tail.length ? `<div class="row more"><span>${tail.join(', ')}</span></div>` : '');
    if (html !== state.filesKey) { filesEl.innerHTML = html; state.filesKey = html; }
  }

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
    const v = state.view ? {
      cx: lerp(state.view.cx, tv.cx, a), cy: lerp(state.view.cy, tv.cy, a),
      w: lerp(state.view.w, tv.w, a), h: 0, pull: tv.pull, zoom: tv.zoom,
    } : tv;
    v.h = v.w / (innerWidth / innerHeight);
    state.view = v;
    const k = v.w / innerWidth;
    const vx = v.cx - v.w / 2, vy = v.cy - v.h / 2;
    svg.setAttribute('viewBox', `${vx.toFixed(2)} ${vy.toFixed(2)} ${v.w.toFixed(2)} ${v.h.toFixed(2)}`);
    svg.style.setProperty('--k', k.toFixed(4));

    const headX = X(state.year);
    revealRect.setAttribute('width', (headX + 3000).toFixed(1));
    head.setAttribute('transform', `translate(${headX.toFixed(1)} 0)`);

    if (Math.abs(k - lastK) / k > 0.01) {
      lastK = k;
      nodes.forEach((n) => n.setAttribute('r', (3.2 * k).toFixed(2)));
      halo.setAttribute('r', (17 * k).toFixed(2));
      headDot.setAttribute('r', (5.5 * k).toFixed(2));
      nextDot.setAttribute('r', (4 * k).toFixed(2));
      nextPath.setAttribute('stroke-width', (1.6 * k).toFixed(2));
      nextPath.setAttribute('stroke-dasharray', `${(5 * k).toFixed(2)} ${(7 * k).toFixed(2)}`);
      threads.forEach((t) => t.tipDot.setAttribute('r', (2.6 * k).toFixed(2)));
      const every = 120 / k < 46 ? 2 : 1;
      yearTexts.forEach((tx) => tx.setAttribute('opacity', (tx.year - D.start) % every === 0 ? 1 : 0));
    }

    // terrain redraws only when the camera moves; the torch is a CSS mask over the lit copy
    if (!drawn || Math.abs(drawn.vx - vx) > k * 0.25 || Math.abs(drawn.vy - vy) > k * 0.25 || Math.abs(drawn.w - v.w) > k * 0.25) {
      drawTerrain(vx, vy, v.w, v.h);
      drawn = { vx, vy, w: v.w };
    }
    let tx = pointer.x, ty = pointer.y;
    if (!finePointer && now - pointer.moved > 2500) {
      const t = now / 1000;
      tx = innerWidth * (0.5 + 0.28 * Math.sin(t * 0.31));
      ty = innerHeight * (0.5 + 0.22 * Math.sin(t * 0.47 + 1));
    }
    lCan.style.setProperty('--tx', tx.toFixed(0) + 'px');
    lCan.style.setProperty('--ty', ty.toFixed(0) + 'px');
    if (finePointer) cursor.style.transform = `translate(${pointer.x}px, ${pointer.y}px)`;

    // threads, labels
    const showLabels = 1 / k > 0.62 && v.pull < 0.3;
    let storm = false;
    threads.forEach((t) => {
      const st = stateAt(t, state.year);
      t.g.classList.toggle('saved', st === 'saved');
      t.g.classList.toggle('flickering', st === 'flicker');
      if (st === 'flicker') storm = true;
      const writing = st && st !== 'saved';
      const visible = showLabels && st && headX >= t.bendX && (writing || state.year <= t.end + 0.9);
      if (writing) {
        const x = Math.min(headX, X(t.end));
        const y = yOnPts(t.pts, x);
        t.tipDot.setAttribute('cx', x.toFixed(1));
        t.tipDot.setAttribute('cy', y.toFixed(1));
      }
      t.tipDot.setAttribute('opacity', writing && headX > X(t.start) + 4 ? 1 : 0);
      if (visible) {
        const x = Math.min(headX, X(t.end));
        t.label.setAttribute('x', (x + 9 * k).toFixed(1));
        t.label.setAttribute('y', (yOnPts(t.pts, x) - 7 * k).toFixed(1));
        const sz = fmt(sizeAt(t, state.year));
        if (t.labelSize.textContent !== sz) t.labelSize.textContent = sz;
      }
      t.label.classList.toggle('saved', st === 'saved');
      t.label.setAttribute('opacity', visible ? 1 : 0);
    });
    stage.classList.toggle('storm', storm);
    axis.style.opacity = clamp(v.zoom * 1.4 - 0.4).toFixed(2);
    svg.classList.toggle('final', v.pull > 0.5);

    const leftX = vx + 22 * k;
    regions.forEach((r) => {
      r.text.setAttribute('x', leftX.toFixed(1));
      r.text.setAttribute('y', (r.topLane - 9 * k).toFixed(1));
    });
    nextName.setAttribute('x', (FOG_X0 + 150 + 12 * k).toFixed(1));
    nextName.setAttribute('y', (-4 * k).toFixed(1));
    nextSize.setAttribute('x', (FOG_X0 + 150 + 12 * k).toFixed(1));
    nextSize.setAttribute('y', (11 * k).toFixed(1));
    unknownLabel.setAttribute('x', (FOG_X0 + 150 + 12 * k).toFixed(1));
    unknownLabel.setAttribute('y', (MIN_Y + 10 * k).toFixed(1));
    coreLabel.setAttribute('x', Math.max(leftX, X(D.start) - 4).toFixed(1));
    coreLabel.setAttribute('y', (-10 * k).toFixed(1));

    // HUD
    introEl.style.opacity = (1 - clamp((state.p - 0.012) / 0.045)).toFixed(3);
    manifestoEl.style.opacity = clamp((state.p - (segs[segs.length - 1].p0 - 0.015)) / 0.04).toFixed(3);
    segs.forEach((g) => {
      if (g.kind !== 'beat') return;
      const on = state.p >= g.p0 + (g.p1 - g.p0) * (g === finalBeat ? 0.45 : 0.2);
      letterLis[g.beat.letter].classList.toggle('lit', on);
    });
    const inBeat = s.seg.kind === 'beat' ? s.seg.index : -1;
    setBeat(inBeat);
    filesEl.style.opacity = s.seg.kind === 'intro' ? clamp(s.u * 3) : s.seg.kind === 'end' ? 1 - clamp(s.u * 3) : 1;
    renderFiles(state.year, v.pull > 0.5);

    requestAnimationFrame(frame);
  }

  addEventListener('resize', () => { lastK = 0; sizeCanvases(); });
  requestAnimationFrame(frame);
})();
