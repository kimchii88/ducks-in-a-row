(() => {
  'use strict';

  // ---------- Sprites: [width, height, facing] (facing 1 = beak right, -1 = left) ----------
  const S = {
    idle: [80, 88, -1], walkR1: [80, 88, 1], walkR2: [83, 85, 1], squat: [86, 70, 1],
    swim1: [121, 83, 1], swim2: [129, 78, 1], peck1: [112, 95, 1], peck2: [120, 94, 1],
    quack: [114, 100, 1], restless1: [113, 97, -1], restless2: [94, 101, -1],
    angry1: [105, 106, 1], angry2: [86, 105, -1], happy: [72, 111, 1], lookup: [97, 107, 1],
    sleep: [101, 105, 1], run1: [112, 68, -1], run2: [131, 70, -1],
    egg2: [52, 66, 1],
    hatch1: [55, 66, 1], hatch2: [56, 66, 1], hatch3: [55, 66, 1], hatch4: [56, 76, 1],
    hatch5: [58, 85, 1], hatch6: [64, 100, 1], hatch7: [101, 108, 1],
    fly1: [77, 74, 1], fly2: [108, 95, 1], fly3: [96, 87, 1], fly4: [142, 99, 1],
  };
  const src = (k) => `assets/sprites/${k}.png`;
  Object.keys(S).forEach((k) => { new Image().src = src(k); });

  const A = {
    walk: ['walkR1', 'walkR2'],
    restless: ['restless1', 'restless2'],
    angry: ['angry1', 'angry2'],
    run: ['run1', 'run2'],
    peck: ['peck1', 'peck2'],
    swim: ['swim1', 'swim2'],
    hatch: ['hatch1', 'hatch2', 'hatch3', 'hatch4', 'hatch5', 'hatch6', 'hatch7'],
    fly: ['fly1', 'fly2', 'fly3', 'fly4'],
  };
  const IDLE_POSES = ['idle', 'idle', 'lookup', 'squat'];

  // Tiny pixel-art SVGs drawn from a character grid ('.' = empty)
  function pixelSvg(rows, colours) {
    const rects = [];
    rows.forEach((row, y) => [...row].forEach((c, x) => {
      if (colours[c]) rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${colours[c]}"/>`);
    }));
    return `<svg viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges">${rects.join('')}</svg>`;
  }
  const HEART = pixelSvg([
    '.BB...BB.',
    'BRRB.BRRB',
    'BRWRBRRRB',
    'BRRRRRRRB',
    '.BRRRRRB.',
    '..BRRRB..',
    '...BRB...',
    '....B....',
  ], { B: '#5c2a1c', R: '#e8505b', W: '#fff' });
  // Speech-bubble tail pointing left; the last column covers the card's border
  const TAIL = pixelSvg([
    '....BC',
    '...BCC',
    '..BCCC',
    '.BCCCC',
    'BCCCCC',
    '.BBCCC',
    '...BBC',
    '.....B',
  ], { B: 'var(--card-brown)', C: 'var(--card-bg)' });

  const MAX_RIVER = 10;
  const UNDO_MS = 5000;
  const TAG_CHARS = 14;
  const BUBBLE_CHARS = 60; // hover bubble shows a preview; the full task is in the card
  const SMART_DEFAULT_HOUR = 20;
  const CROSS_CHANCE = 0.2; // how often a wandering duck goes round to the other bank

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const stage = $('stage'), world = $('world'), bubble = $('bubble'), egg = $('egg');
  const farmBtn = $('farm'), scrim = $('scrim'), card = $('card'), toast = $('toast');
  $('cardTail').innerHTML = TAIL;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)');
  const isMobile = () => coarse.matches || innerWidth < 640;
  const maxActive = () => (isMobile() ? 8 : 15); // fewer ducks fit on a phone's meadow
  // isMobile is the single definition of "phone": styles hang off .mobile on <html>
  const syncMobile = () => document.documentElement.classList.toggle('mobile', isMobile());
  // Measure the on-screen keyboard (--kb) so pop-ups keep their content above it.
  // iOS doesn't resize the page for the keyboard, it just covers it.
  function syncViewport() {
    const vv = window.visualViewport;
    if (!vv) return;
    const kb = Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
    document.documentElement.style.setProperty('--kb', kb + 'px');
    document.documentElement.classList.toggle('kb-open', kb > 100);
    if (debugEl) debugEl.textContent = `screen ${innerHeight} · visible ${Math.round(vv.height)} · offset ${Math.round(vv.offsetTop)} · kb ${kb}`;
  }
  // Scroll lock for phones: while a pop-up is open, a drag may scroll the pop-up's
  // own content (or a notes box) but never the page behind it. Otherwise iPhone
  // browsers slide the whole page around under the keyboard and the pinned
  // Hatch button jitters while it catches up.
  let touchY = 0;
  document.addEventListener('touchstart', (ev) => { touchY = ev.touches[0].clientY; }, { passive: true });
  document.addEventListener('touchmove', (ev) => {
    if (!isMobile() || !ev.target.closest?.('.modal-wrap')) return;
    const dy = ev.touches[0].clientY - touchY; // > 0: finger moving down (scrolling up)
    let el = ev.target;
    for (; el && !el.classList?.contains('modal-wrap'); el = el.parentElement) {
      const scrollable = el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY);
      if (!scrollable) continue;
      const canUp = el.scrollTop > 0, canDown = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
      if ((dy > 0 && canUp) || (dy < 0 && canDown)) return; // let this box scroll
    }
    ev.preventDefault(); // nothing inside can scroll that way, so don't move the page
  }, { passive: false });

  // ?debug shows the keyboard measurements on screen (for testing on a real phone)
  let debugEl = null;
  if (new URLSearchParams(location.search).has('debug')) {
    debugEl = document.createElement('div');
    debugEl.style.cssText = 'position:fixed;top:0;left:0;z-index:99999;padding:2px 6px;font:12px/1.4 monospace;color:#fff;background:rgba(0,0,0,.75);pointer-events:none';
    document.body.appendChild(debugEl);
  }
  window.visualViewport?.addEventListener('resize', syncViewport);
  window.visualViewport?.addEventListener('scroll', syncViewport);

  // ---------- Time ----------
  let offsetDays = 0;
  const now = () => Date.now() + offsetDays * 864e5;
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const today = () => dateStr(now());
  const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return dateStr(new Date(y, m - 1, d + n).getTime()); };
  const smartDefaultDue = () => (new Date(now()).getHours() >= SMART_DEFAULT_HOUR ? addDays(today(), 1) : today());
  const prettyDate = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  // Prototype tools (fake dates, sample ducks) only on localhost or with ?dev
  const DEV = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || new URLSearchParams(location.search).has('dev');

  // ---------- Storage ----------
  const KEY = 'ducks-in-a-row-v1';
  let ducks = [];
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      // A delete still in its undo window when the page closed counts as deleted
      if (s) { ducks = (s.ducks || []).filter((d) => !d.pendingDelete); offsetDays = DEV ? s.offsetDays || 0 : 0; }
    } catch (e) { /* storage unavailable: start fresh */ }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ ducks, offsetDays })); } catch (e) { /* ignore */ }
    if (ducks.length) protectStorage();
  }
  // Ask the browser not to clear our data when it's short on space. Asked once the
  // first duck exists, since Firefox shows a prompt for it.
  let protectAsked = false;
  function protectStorage() {
    if (protectAsked || !navigator.storage?.persist) return;
    protectAsked = true;
    navigator.storage.persisted().then((yes) => yes || navigator.storage.persist()).catch(() => {});
  }

  // ---------- Duck helpers ----------
  const byId = (id) => ducks.find((d) => d.id === id);
  const active = () => ducks.filter((d) => !d.completedAt && !d.pendingDelete);
  const overdue = (d) => !d.completedAt && d.due < today();
  function madId() {
    const o = active().filter(overdue).sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.createdAt - b.createdAt));
    return o.length ? o[0].id : null;
  }
  function mood(d) {
    if (d.completedAt) return 'done';
    if (!overdue(d)) return 'waiting';
    return d.id === currentMad ? 'mad' : 'sulky';
  }
  function dueText(d) {
    if (overdue(d)) return `Overdue since ${prettyDate(d.due)}`;
    if (d.due === today()) return 'Due today';
    if (d.due === addDays(today(), 1)) return 'Due tomorrow';
    return `Due ${prettyDate(d.due)}`;
  }
  const doneText = (d) => (d.completedAt
    ? `Done at ${new Date(d.completedAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}`
    : 'Done'); // still in its undo window
  const isDone = (d) => !!d.completedAt || (pending?.type === 'done' && pending.id === d.id);

  // Cut at the last word break before the limit (or mid-word if there isn't one) and add …
  function clip(text, max) {
    const t = text.trim();
    if (t.length <= max) return t;
    let cut = t.slice(0, max + 1);
    const sp = cut.lastIndexOf(' ');
    cut = sp >= 4 ? cut.slice(0, sp) : cut.slice(0, max);
    return cut.trimEnd() + '…';
  }
  const tagText = (task) => clip(task, TAG_CHARS);

  // Ducks done today swim in the river (latest 10); after that they live in the farmhouse
  function riverDucks() {
    const t = today();
    return ducks.filter((d) => d.completedAt && !d.housed && dateStr(d.completedAt) === t)
      .sort((a, b) => b.completedAt - a.completedAt).slice(0, MAX_RIVER);
  }

  // ---------- Geometry ----------
  const G = {};
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function layout() {
    G.W = stage.clientWidth; G.H = stage.clientHeight;
    const sc = Math.max(G.W / 1672, G.H / 941);
    const oy = (G.H - 941 * sc) / 2;
    G.riverTop = oy + 398 * sc;
    G.riverBottom = oy + 556 * sc;
    G.scale = isMobile() ? 0.6 : 0.78;
    G.duckH = 90 * G.scale;
    // Farmhouse: top-right, sitting on the top bank
    const fw = Math.min(250, Math.max(130, G.W * 0.22));
    const fh = fw * 308 / 490;
    const fy = Math.max(isMobile() ? 56 : 14, G.riverTop - fh - 8);
    G.farm = { x: G.W - fw - 10, y: fy, w: fw, h: fh };
    Object.assign(farmBtn.style, { left: G.farm.x + 'px', top: G.farm.y + 'px', width: fw + 'px' });
    stage.style.setProperty('--tag-offset', Math.round(G.duckH + 4) + 'px');
    // Land zones (duck feet). Unfinished ducks never touch the river.
    const tagSpace = 26;
    const topMin = 70 + G.duckH + tagSpace, topMax = G.riverTop - 10;
    const botMin = G.riverBottom + G.duckH * 0.75 + tagSpace, botMax = G.H - 120;
    G.zones = {
      top: topMax - topMin > 20 ? { x0: 72, x1: G.W - 72, y0: topMin, y1: topMax } : null,
      bottom: botMax - botMin > 20 ? { x0: 72, x1: G.W - 72, y0: botMin, y1: botMax } : null,
    };
    if (!G.zones.top && !G.zones.bottom) G.zones.bottom = { x0: 72, x1: G.W - 72, y0: G.H * 0.3, y1: G.H - 120 };
    G.eggPos = { x: G.W / 2, y: G.H - 150 };
    G.front = { x: Math.max(60, G.W * 0.2), y: G.H - 70 };
  }
  const otherSide = (s) => (s === 'top' ? 'bottom' : 'top');
  const zone = (side) => G.zones[side] || G.zones[otherSide(side)];
  const realSide = (side) => (G.zones[side] ? side : otherSide(side));
  function blocked(x, y) {
    const f = G.farm;
    if (x > f.x - 30 && x < f.x + f.w + 30 && y > f.y - 10 && y < f.y + f.h + G.duckH + 30) return true;
    if (Math.abs(x - G.W / 2) < 90 && y > G.H - 180) return true;
    if (x < 230 && y < 70 + G.duckH + 30) return true; // HUD
    return false;
  }
  function randomPointIn(z) {
    for (let i = 0; i < 40; i++) {
      const p = { x: rand(z.x0, z.x1), y: rand(z.y0, z.y1) };
      if (!blocked(p.x, p.y)) return p;
    }
    return { x: G.W * 0.3, y: z.y1 };
  }
  // Pick the roomiest of a few random spots so ducks and their tags don't pile up
  function landPoint(selfId, side) {
    const z = zone(side);
    const others = [...rt.values()].filter((e) => e.id !== selfId && e.mode === 'land');
    let best = null, bestScore = -1;
    for (let i = 0; i < 8; i++) {
      const p = randomPointIn(z);
      const score = others.reduce((m, e) => Math.min(m, Math.hypot((e.tx - p.x) / 1.6, e.ty - p.y)), Infinity);
      if (score > bestScore) { best = p; bestScore = score; }
    }
    return best;
  }
  const inZone = (e) => { const z = zone(e.side); return e.x >= z.x0 && e.x <= z.x1 && e.y >= z.y0 && e.y <= z.y1 && !blocked(e.x, e.y); };

  // ---------- Runtime duck entities ----------
  const rt = new Map(); // id -> entity
  let currentMad = null;
  let openId = null;
  let hoverId = null;
  const pointer = { x: 0, y: 0, active: false };

  function makeEntity(d, opts = {}) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'duck';
    el.innerHTML = '<span class="tag"></span><img class="spr" alt="" draggable="false">';
    world.appendChild(el);
    const side = realSide(opts.side || (Math.random() < 0.5 ? 'top' : 'bottom'));
    const e = {
      id: d.id, el, img: el.querySelector('.spr'), tagEl: el.querySelector('.tag'),
      x: 0, y: 0, tx: 0, ty: 0, dir: 1, side, mode: 'land', route: null,
      t: 0, pause: rand(0.5, 3), pose: 'idle', sprite: null, timer: 0, bumpCd: 0,
      ...opts, side,
    };
    if (opts.mode === 'swim') {
      e.x = rand(40, G.W - 40); e.y = swimY(); e.dir = Math.random() < 0.5 ? -1 : 1;
      e.tagEl.remove(); e.tagEl = null;
    } else if (opts.x === undefined) { const p = landPoint(d.id, side); e.x = p.x; e.y = p.y; }
    e.tx = e.x; e.ty = e.y;
    el.addEventListener('click', (ev) => { ev.stopPropagation(); openCard(e.id); });
    el.addEventListener('pointerenter', () => { hoverId = e.id; showBubble(e.id); });
    el.addEventListener('pointerleave', () => { if (hoverId === e.id) hoverId = null; hideBubble(e.id); });
    el.addEventListener('focus', () => showBubble(e.id));
    el.addEventListener('blur', () => hideBubble(e.id));
    rt.set(d.id, e);
    refreshEntity(e);
    return e;
  }
  function refreshEntity(e) {
    const d = byId(e.id);
    if (!d) return;
    const m = mood(d);
    e.el.classList.toggle('sulky', m === 'sulky');
    e.el.classList.toggle('mad', m === 'mad');
    if (e.tagEl) e.tagEl.textContent = tagText(d.task);
    e.el.setAttribute('aria-label', `${d.task}. ${isDone(d) ? doneText(d) : dueText(d)}. Open task`);
  }
  function removeEntity(id) {
    const e = rt.get(id);
    if (!e) return;
    e.el.remove();
    rt.delete(id);
    if (bubble.dataset.id === id) hideBubble(id);
  }
  function makeSwimmer(e) { // done ducks in the pond can still be opened
    e.el.classList.remove('leaving');
    e.el.removeAttribute('aria-hidden');
    e.el.tabIndex = 0;
    refreshEntity(e);
  }
  function retire(e) { // not clickable while it leaves (heading to the pond, the farmhouse or flying away)
    if (hoverId === e.id) hoverId = null;
    hideBubble(e.id);
    e.el.tabIndex = -1;
    e.el.setAttribute('aria-hidden', 'true');
    e.el.classList.add('leaving');
  }

  function setSprite(e, key, wantDir) {
    if (e.sprite !== key) {
      e.sprite = key;
      e.img.src = src(key);
      e.img.style.width = Math.round(S[key][0] * G.scale) + 'px';
    }
    const flip = S[key][2] !== (wantDir ?? e.dir);
    e.img.style.transform = `translate(-50%, -100%) scaleX(${flip ? -1 : 1})`;
  }
  const frame = (e, frames, fps) => frames[Math.floor(e.t * fps) % frames.length];

  function moveToward(e, tx, ty, speed, dt) {
    const dx = tx - e.x, dy = ty - e.y, dist = Math.hypot(dx, dy);
    if (dist < 2) { e.x = tx; e.y = ty; return true; }
    const step = Math.min(dist, speed * dt);
    e.x += (dx / dist) * step; e.y += (dy / dist) * step;
    if (Math.abs(dx) > 1) e.dir = dx > 0 ? 1 : -1;
    return false;
  }

  // Routes: a list of waypoints. Going to the other bank means walking off the
  // nearest screen edge and coming back on at the same edge on the other side.
  function routeTo(e, p, side) {
    side = realSide(side);
    e.tx = p.x; e.ty = p.y;
    if (side === e.side) { e.route = [{ x: p.x, y: p.y }]; return; }
    const edge = e.x < G.W / 2 ? -70 : G.W + 70;
    const zs = zone(e.side), zt = zone(side);
    e.route = [
      { x: edge, y: clamp(e.y, zs.y0, zs.y1) },
      { x: edge, y: clamp(p.y, zt.y0, zt.y1), teleport: true, side },
      { x: p.x, y: p.y },
    ];
  }
  function followRoute(e, speed, dt) {
    while (e.route && e.route.length) {
      const p = e.route[0];
      if (p.teleport) { e.x = p.x; e.y = p.y; e.side = p.side; e.route.shift(); continue; }
      if (!moveToward(e, p.x, p.y, speed, dt)) return false;
      e.route.shift();
    }
    e.route = null;
    return true;
  }

  // ---------- Update loop ----------
  function updateLand(e, d, dt) {
    const m = mood(d);
    const still = reduceMotion.matches;
    const held = openId === e.id || hoverId === e.id;

    if (e.timer > 0) { // brief happy moment (e.g. after being calmed down)
      e.timer -= dt;
      setSprite(e, 'happy');
      return;
    }
    if (openId === e.id && e.stepTarget) {
      if (moveToward(e, e.stepTarget.x, e.stepTarget.y, still ? 9999 : 140, dt)) e.stepTarget = null;
      setSprite(e, frame(e, A.walk, 8));
      return;
    }
    if (m === 'mad') {
      if (held || still) { setSprite(e, held && !still ? frame(e, A.angry, 4) : 'angry1'); return; }
      if (isMobile()) {
        // Go to the front of the screen (round the river if needed) and peck
        const far = e.side !== realSide('bottom') || Math.hypot(e.x - G.front.x, e.y - G.front.y) > 3;
        if (!e.route && far) routeTo(e, { ...G.front }, 'bottom');
        if (e.route) { followRoute(e, 70, dt); setSprite(e, frame(e, A.walk, 7)); }
        else setSprite(e, frame(e, A.peck, 4), 1);
        return;
      }
      e.route = null;
      if (pointer.active) {
        // Chases the cursor but stays on its own bank
        const z = zone(e.side);
        const tx = clamp(pointer.x, 20, G.W - 20);
        const ty = clamp(pointer.y + 20, z.y0 - 20, z.y1);
        const dx = tx - e.x, dy = ty - e.y, dist = Math.hypot(dx, dy);
        if (Math.abs(pointer.x - e.x) > 1) e.dir = pointer.x > e.x ? 1 : -1;
        if (dist > 95) {
          const k = Math.min(dist - 95, 130 * dt) / dist;
          e.x += dx * k; e.y += dy * k;
          setSprite(e, frame(e, A.run, 9));
        } else setSprite(e, frame(e, A.angry, 4));
      } else setSprite(e, frame(e, A.angry, 3));
      return;
    }

    if (still) { setSprite(e, m === 'sulky' ? 'restless1' : 'idle'); return; }
    if (held) { setSprite(e, m === 'sulky' ? frame(e, A.restless, 3) : 'quack'); return; }

    if (e.pause > 0) {
      e.pause -= dt;
      setSprite(e, m === 'sulky' ? frame(e, A.restless, 2.5) : e.pose);
      if (e.pause <= 0) pickWander(e, m);
      return;
    }
    if (!e.route) pickWander(e, m);
    if (followRoute(e, m === 'sulky' ? 14 : 30, dt)) {
      e.pause = rand(2, 6);
      e.pose = IDLE_POSES[Math.floor(Math.random() * IDLE_POSES.length)];
    }
    setSprite(e, frame(e, A.walk, m === 'sulky' ? 3 : 5));
  }
  function pickWander(e, m) {
    if (m === 'sulky') { // sulky ducks don't go far
      const p = landPoint(e.id, e.side);
      routeTo(e, { x: e.x + (p.x - e.x) * 0.25, y: e.y + (p.y - e.y) * 0.25 }, e.side);
      return;
    }
    const cross = G.zones.top && G.zones.bottom && Math.random() < CROSS_CHANCE;
    const side = cross ? otherSide(e.side) : e.side;
    routeTo(e, landPoint(e.id, side), side);
  }

  // Ducks that touch bounce off and walk away from each other
  function bumpDucks() {
    const list = [...rt.values()].filter((e) => e.mode === 'land' && !reduceMotion.matches && e.x > 0 && e.x < G.W);
    const rx = 62 * G.scale, ry = 26 * G.scale;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.side !== b.side || a.bumpCd > 0 || b.bumpCd > 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        if ((dx / rx) ** 2 + (dy / ry) ** 2 >= 1) continue;
        const ang = Math.atan2(dy || 0.01, dx || (Math.random() - 0.5));
        [[a, -1], [b, 1]].forEach(([e, s]) => {
          e.bumpCd = 1.5;
          if (openId === e.id || hoverId === e.id || mood(byId(e.id)) === 'mad') return;
          const z = zone(e.side), dist = rand(70, 130);
          const p = { x: clamp(e.x + Math.cos(ang) * s * dist, z.x0, z.x1), y: clamp(e.y + Math.sin(ang) * s * dist * 0.6, z.y0, z.y1) };
          e.route = [p]; e.tx = p.x; e.ty = p.y; e.pause = 0; e.timer = 0;
          e.dir = p.x > e.x ? 1 : -1;
        });
      }
    }
  }

  const swimY = () => rand(G.riverTop + 72 * G.scale, Math.max(G.riverTop + 72 * G.scale + 1, G.riverBottom - 6));

  // Done ducks walk to the nearest bank and get in the river
  function startToRiver(e) {
    e.mode = 'toRiver'; e.t = 0; e.lift = 0;
    const x = clamp(e.x, 40, G.W - 40);
    const y = e.side === 'top' ? G.riverTop + 72 * G.scale : G.riverBottom - 6;
    e.route = [{ x, y }];
    if (e.tagEl) { e.tagEl.remove(); e.tagEl = null; }
  }
  // Only the latest 10 swim; older ones paddle off and move into the farmhouse
  function riverKeep() {
    const keep = new Set(riverDucks().map((d) => d.id));
    if (pending?.type === 'done') keep.add(pending.id);
    return keep;
  }
  function trimRiver() {
    const keep = riverKeep();
    rt.forEach((e) => {
      if (e.mode !== 'swim' || keep.has(e.id)) return;
      if (openId === e.id) closeCard(false);
      e.leaving = true;
      retire(e);
    });
  }

  function update(e, dt) {
    e.t += dt;
    if (e.bumpCd > 0) e.bumpCd -= dt;
    const d = byId(e.id);
    switch (e.mode) {
      case 'land':
        if (d) updateLand(e, d, dt);
        break;
      case 'hatch': {
        const i = Math.floor(e.t / 0.24);
        if (i >= A.hatch.length + 2) { e.mode = 'land'; e.t = 0; e.pause = 0; e.route = null; }
        else setSprite(e, A.hatch[Math.min(i, A.hatch.length - 1)], 1);
        break;
      }
      case 'love': // little happy hops under the hearts, then off to the pond
        setSprite(e, 'happy');
        e.lift = reduceMotion.matches ? 0 : Math.abs(Math.sin(e.t * Math.PI * 2.4)) * 10 * G.scale;
        if ((e.timer -= dt) <= 0) startToRiver(e);
        break;
      case 'toRiver':
        if (followRoute(e, reduceMotion.matches ? 9999 : 75, dt)) {
          e.mode = 'swim'; e.t = 0; e.dir = Math.random() < 0.5 ? -1 : 1;
          makeSwimmer(e);
          trimRiver();
        } else setSprite(e, frame(e, A.walk, 7));
        break;
      case 'swim':
        if (!reduceMotion.matches && openId !== e.id) { // holds still while its card is open
          e.x += e.dir * (e.leaving ? 60 : 16) * dt;
          if (e.leaving && (e.x < -80 || e.x > G.W + 80)) { removeEntity(e.id); return; }
          if (!e.leaving && (e.x < -70 || e.x > G.W + 70)) e.x = e.dir > 0 ? -60 : G.W + 60;
        }
        setSprite(e, frame(e, A.swim, 2));
        break;
      case 'toFarm': { // paddle out on the top bank, then waddle to the farmhouse door
        const wet = e.y > G.riverTop + 30 * G.scale;
        if (followRoute(e, reduceMotion.matches ? 9999 : (wet ? 55 : 75), dt)) { e.mode = 'enter'; e.t = 0; }
        setSprite(e, wet ? frame(e, A.swim, 3) : frame(e, A.walk, 7));
        break;
      }
      case 'enter': // goes in through the door
        e.el.style.opacity = Math.max(0, 1 - e.t / 0.4);
        if (e.t > 0.4 || reduceMotion.matches) { removeEntity(e.id); return; }
        break;
      case 'fly':
        e.x += 120 * dt; e.y -= 170 * dt;
        e.el.style.opacity = Math.max(0, 1 - e.t / 1.5);
        setSprite(e, frame(e, A.fly, 8), 1);
        if (e.t > 1.5) { removeEntity(e.id); return; }
        break;
    }
    e.el.style.transform = `translate(${e.x.toFixed(1)}px, ${(e.y - (e.lift || 0)).toFixed(1)}px)`;
    e.el.style.zIndex = e.mode === 'fly' ? 14000 : Math.round(e.y);
  }

  let last = performance.now();
  let lastDay = null;
  function tick(nowMs) {
    const rawDt = Math.min(1, (nowMs - last) / 1000);
    const dt = Math.min(0.05, rawDt);
    last = nowMs;
    const t = today();
    if (t !== lastDay) { lastDay = t; dailyReset(); }
    const m = madId();
    if (m !== currentMad) { currentMad = m; rt.forEach(refreshEntity); }
    rt.forEach((e) => update(e, dt));
    bumpDucks();
    if (bubble.dataset.id) positionBubble();
    tickPending(rawDt); // undo window runs on real time
    requestAnimationFrame(tick);
  }

  // Each day is a fresh start: yesterday's swimmers move into the farmhouse (no animation)
  function dailyReset() {
    const keep = riverKeep();
    rt.forEach((e, id) => {
      if (e.mode !== 'swim' || keep.has(id)) return;
      if (openId === id) closeCard(false);
      removeEntity(id);
    });
    rt.forEach(refreshEntity);
    renderHud();
  }

  // ---------- HUD + egg ----------
  function renderHud() {
    const todo = active().length;
    const doneToday = ducks.filter((d) => d.completedAt && dateStr(d.completedAt) === today()).length;
    $('hudCount').textContent = `${todo} to do · ${doneToday} done today`;
    const full = todo >= maxActive();
    egg.classList.toggle('full', full);
    egg.setAttribute('aria-disabled', String(full));
    $('eggLabel').textContent = full ? "Too many ducks! Let's finish some tasks first" : 'Add duck';
    const clock = $('toolsClock'); // only exists in dev
    if (clock) clock.textContent = offsetDays ? `Pretending it's ${prettyDate(today())}` : `Today is ${prettyDate(today())}`;
  }

  // ---------- Hover bubble ----------
  function showBubble(id) {
    const d = byId(id), e = rt.get(id);
    if (!d || !e || openId === id || e.el.classList.contains('leaving')) return;
    bubble.innerHTML = '';
    const task = document.createElement('span');
    task.textContent = clip(d.task, BUBBLE_CHARS);
    const md = document.createElement('span');
    if (isDone(d)) { md.className = 'b-mood done'; md.textContent = doneText(d); }
    else {
      md.className = 'b-mood ' + mood(d) + (d.due === today() && !overdue(d) ? ' today' : '');
      md.textContent = dueText(d);
    }
    bubble.append(task, md);
    bubble.dataset.id = id;
    bubble.hidden = false;
    positionBubble();
  }
  function hideBubble(id) {
    if (id && bubble.dataset.id !== id) return;
    bubble.hidden = true;
    delete bubble.dataset.id;
  }
  function positionBubble() {
    const e = rt.get(bubble.dataset.id);
    if (!e || openId === e.id) { hideBubble(); return; }
    const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    const x = clamp(e.x - bw / 2, 8, G.W - bw - 8);
    const y = Math.max(8, e.y - G.duckH - 30 - bh - 10);
    bubble.style.transform = `translate(${x}px, ${y}px)`;
  }

  // ---------- Card ----------
  function openCard(id) {
    const d = byId(id), e = rt.get(id);
    const ticked = isDone(d);
    if (!d || !e || e.el.classList.contains('leaving') || !(e.mode === 'land' || e.mode === 'swim' || ticked)) return;
    closeCard(false);
    openId = id;
    e.el.classList.add('open');
    hideBubble();
    $('cardTaskText').textContent = d.task;
    $('cardNotes').textContent = d.notes || '';
    const due = $('cardMood');
    if (ticked) { due.textContent = doneText(d); due.className = 'card-due done-at'; }
    else {
      due.textContent = dueText(d);
      due.className = 'card-due ' + mood(d) + (d.due === today() && !overdue(d) ? ' today' : '');
    }
    // Show the ticked state without replaying the animation
    card.classList.add('no-anim');
    card.classList.toggle('done', ticked);
    card.classList.toggle('reopenable', !!d.completedAt);
    $('checkTip').textContent = d.completedAt ? 'Move back to to-do' : 'Mark done';
    $('cardCheck').checked = ticked;
    requestAnimationFrame(() => card.classList.remove('no-anim'));
    card.hidden = false;
    scrim.hidden = false;
    const sheet = isMobile();
    card.classList.toggle('sheet', sheet);
    card.style.transform = '';
    if (sheet) {
      card.style.left = card.style.top = '';
      // The sheet covers the bottom of the screen, so the duck steps up into view
      // (staying on its own bank) so you can see it eat
      card.classList.remove('tail-right');
      card.style.setProperty('--tail-x', clamp(e.x - 12, 16, G.W - 40) + 'px');
      const want = G.H - card.offsetHeight - 16;
      if (e.mode === 'land' && e.y > want) {
        const minY = e.side === 'bottom' ? G.riverBottom + G.duckH * 0.7 : 0;
        e.stepTarget = { x: e.x, y: Math.max(minY, want) };
        e.route = null;
      }
    } else {
      // Next to the duck, never on top of it
      const cw = card.offsetWidth, ch = card.offsetHeight, gap = 46 * G.scale + 16;
      let x = e.x + gap;
      if (x + cw > G.W - 10) x = e.x - gap - cw;
      x = clamp(x, 10, G.W - cw - 10);
      const y = clamp(e.y - G.duckH - 20, 10, G.H - ch - 190); // keep clear of the undo bar
      card.style.left = x + 'px';
      card.style.top = y + 'px';
      // Speech-bubble tail points at the duck's head from whichever side it's on
      card.classList.toggle('tail-right', x < e.x);
      card.style.setProperty('--tail-y', clamp(e.y - G.duckH * 0.7 - y - 13, 10, ch - 34) + 'px');
    }
    placeToast();
    $('cardCheck').focus({ preventScroll: true });
  }
  function closeCard(restoreFocus = true) {
    if (!openId) return;
    const id = openId;
    openId = null;
    rt.get(id)?.el.classList.remove('open');
    card.hidden = true;
    scrim.hidden = true;
    placeToast();
    const e = rt.get(id);
    if (e) e.stepTarget = null;
    if (restoreFocus && e && !e.el.classList.contains('leaving')) e.el.focus({ preventScroll: true });
  }
  // While the mobile sheet is open the undo bar moves to the top, leaving the
  // space between them clear for the duck
  function placeToast() {
    const sheetOpen = !card.hidden && card.classList.contains('sheet');
    toast.classList.toggle('top', sheetOpen);
  }

  // Tapping outside closes the card on desktop; on phones only the × does
  scrim.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); if (!isMobile()) closeCard(); });
  $('cardClose').addEventListener('click', () => closeCard());
  $('cardEdit').addEventListener('click', () => {
    const id = openId;
    if (!id) return;
    if (pending?.type === 'done' && pending.id === id) undoPending(); // changing it means it isn't done yet
    closeCard(false);
    openForm(id);
  });
  $('cardCheck').addEventListener('change', (ev) => {
    if (!openId) return;
    if (ev.target.checked) { card.classList.add('done'); startDone(openId); }
    else if (pending?.type === 'done' && pending.id === openId) undoPending();
    else if (byId(openId)?.completedAt) reopen(openId);
  });

  $('cardHouse').addEventListener('click', () => { if (openId) sendHome(openId); });

  // A finished duck can leave the pond early and walk into the farmhouse
  function sendHome(id) {
    const d = byId(id), e = rt.get(id);
    if (!d?.completedAt) return;
    d.housed = true;
    save();
    closeCard(false);
    if (!e) return;
    retire(e);
    const f = G.farm;
    const door = { x: f.x + f.w * 0.47, y: f.y + f.h * 0.82 };
    e.mode = 'toFarm'; e.t = 0;
    e.route = [{ x: clamp(e.x, 20, G.W - 20), y: G.riverTop - 8 }, door];
  }

  // Unticking a duck from the pond puts the task back on the list:
  // it paddles to the nearest bank and walks back onto the grass
  function reopen(id) {
    const d = byId(id), e = rt.get(id);
    if (!d) return;
    d.completedAt = null;
    delete d.housed;
    save();
    closeCard(false);
    if (e) {
      const side = e.y - G.riverTop < G.riverBottom - e.y ? 'top' : 'bottom';
      const at = { x: e.x, y: e.y, side };
      removeEntity(id);
      const n = makeEntity(d, at);
      n.pause = 0;
      n.el.focus({ preventScroll: true });
    }
    currentMad = madId();
    rt.forEach(refreshEntity);
    renderHud();
  }


  // ---------- Timed undo (tick off and delete) ----------
  let pending = null; // { type: 'done' | 'delete', id, left, paused, ... }

  function startPending(p, text) {
    if (pending) finishPending();
    pending = { ...p, left: UNDO_MS, paused: false };
    $('toastText').textContent = text;
    toast.hidden = false;
    placeToast();
    toast.classList.remove('paused');
    $('toastFill').style.width = '100%';
  }
  function tickPending(dt) {
    if (!pending || pending.paused) return;
    pending.left -= dt * 1000;
    $('toastFill').style.width = Math.max(0, (pending.left / UNDO_MS) * 100) + '%';
    if (pending.left <= 0) finishPending();
  }
  function finishPending() {
    if (!pending) return;
    const p = pending;
    pending = null;
    toast.hidden = true;
    if (p.type === 'done') finishDone(p.id);
    if (p.type === 'delete') { ducks = ducks.filter((x) => x.id !== p.id); save(); }
    renderHud();
  }
  function undoPending() {
    if (!pending) return;
    const p = pending;
    pending = null;
    toast.hidden = true;
    if (p.type === 'done') {
      const e = rt.get(p.id), d = byId(p.id);
      if (openId === p.id) { card.classList.remove('done'); $('cardCheck').checked = false; }
      if (e && d) {
        const at = { x: e.x, y: e.y, side: e.side };
        removeEntity(p.id);
        makeEntity(d, at).pause = 0; // walks straight back out if it got to the water
      }
    }
    if (p.type === 'delete') {
      const d = byId(p.id);
      if (d) {
        delete d.pendingDelete;
        save();
        removeEntity(p.id);
        const e = makeEntity(d, { x: p.x, y: p.y, side: p.side });
        e.timer = 1;
        e.el.focus({ preventScroll: true });
      }
    }
    renderHud();
  }
  $('toastUndo').addEventListener('click', undoPending);
  $('toastDismiss').addEventListener('click', finishPending); // confirms it now instead of waiting
  const pause = (v) => { if (pending) { pending.paused = v; toast.classList.toggle('paused', v); } };
  toast.addEventListener('pointerenter', () => pause(true));
  toast.addEventListener('pointerleave', () => { if (!toast.contains(document.activeElement)) pause(false); });
  toast.addEventListener('focusin', () => pause(true));
  toast.addEventListener('focusout', () => pause(false));

  // Tick: the card strikes through, then closes so you can watch the duck pop
  // hearts and waddle into the pond. It's only saved as done when the undo window ends.
  function startDone(id) {
    const e = rt.get(id), d = byId(id);
    if (!e || !d) return;
    startPending({ type: 'done', id }, `“${tagText(d.task)}” done`);
    if (e.stepTarget) { e.x = e.stepTarget.x; e.y = e.stepTarget.y; e.stepTarget = null; }
    retire(e);
    e.mode = 'love'; e.t = 0; e.route = null;
    e.timer = reduceMotion.matches ? 0.3 : 1.4;
    popHearts(e);
    setTimeout(() => {
      if (openId === id && pending?.type === 'done' && pending.id === id) closeCard(false);
    }, reduceMotion.matches ? 300 : 800);
  }
  function popHearts(e) {
    if (reduceMotion.matches) return;
    [-14, 10, -2].forEach((dx, i) => {
      const h = document.createElement('div');
      h.className = 'heart';
      h.innerHTML = HEART;
      h.style.left = (e.x + dx * G.scale * 1.6) + 'px';
      h.style.top = (e.y - G.duckH - 4) + 'px';
      h.style.animationDelay = i * 0.22 + 's';
      h.addEventListener('animationend', () => h.remove());
      world.appendChild(h);
    });
  }
  function finishDone(id) {
    const d = byId(id), e = rt.get(id);
    if (!d) return;
    d.completedAt = now();
    save();
    if (openId === id) closeCard(false);
    if (e?.mode === 'swim') trimRiver();
  }

  // Delete: confirmation, then the duck flies away with a timed undo
  async function deleteDuck(id) {
    const d = byId(id);
    closeCard(false);
    const ok = await confirmDialog({
      title: 'Delete this duck?',
      body: `“${d.task}” will fly away.`,
      ok: 'Delete duck', cancel: 'Keep it',
    });
    const e = rt.get(id);
    if (!ok) { e?.el.focus({ preventScroll: true }); return; }
    if (pending) finishPending();
    d.pendingDelete = true;
    save();
    startPending({ type: 'delete', id, x: e?.x, y: e?.y, side: e?.side }, `“${tagText(d.task)}” flew away`);
    if (e) {
      retire(e);
      if (e.tagEl) { e.tagEl.remove(); e.tagEl = null; }
      if (reduceMotion.matches) removeEntity(id);
      else { e.mode = 'fly'; e.t = 0; }
    }
    renderHud();
  }

  // ---------- Confirm dialog ----------
  let lastFocus = null;
  function confirmDialog({ title, body, ok, cancel }) {
    return new Promise((resolve) => {
      const wrap = $('confirmWrap');
      $('confirmTitle').textContent = title;
      $('confirmBody').textContent = body;
      $('confirmOk').textContent = ok;
      $('confirmCancel').textContent = cancel;
      document.activeElement?.blur?.(); // put the phone keyboard away so the question isn't hidden behind it
      wrap.hidden = false;
      $('confirmCancel').focus(); // safe option is the default
      const done = (v) => {
        wrap.hidden = true;
        $('confirmOk').onclick = $('confirmCancel').onclick = wrap.onclick = null;
        wrap._esc = null;
        resolve(v);
      };
      $('confirmOk').onclick = () => done(true);
      $('confirmCancel').onclick = () => done(false);
      wrap.onclick = (ev) => { if (ev.target === wrap && !isMobile()) done(false); };
      wrap._esc = () => done(false);
    });
  }

  // ---------- Create / edit form ----------
  const form = $('form'), formWrap = $('formWrap');
  const fTask = $('fTask'), fNotes = $('fNotes'), fDate = $('fDate'), fErr = $('fErr');
  let editingId = null, formDue = null, formSnapshot = '';

  const formState = () => JSON.stringify([fTask.value.trim(), fNotes.value.trim(), formDue]);
  function setDue(due) {
    formDue = due;
    const t = today(), tm = addDays(t, 1);
    const which = due === t ? 'today' : due === tm ? 'tomorrow' : 'pick';
    form.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-checked', String(c.dataset.due === which)));
    $('pickLabel').textContent = which === 'pick' ? prettyDate(due) : 'Pick date';
    fDate.value = due;
  }
  function updatePreview() {
    const v = fTask.value.trim();
    $('previewTag').textContent = v ? tagText(v) : 'Your task';
  }
  function openForm(id = null) {
    if (!id && active().length >= maxActive()) { nope(); openList(); return; } // show what's left to finish
    editingId = id;
    const d = id ? byId(id) : null;
    lastFocus = document.activeElement;
    $('formTitle').textContent = d ? 'Edit duck' : 'New duck';
    $('fSubmit').textContent = d ? 'Save' : 'Hatch duck';
    $('fDelete').hidden = !d;
    $('previewImg').src = src(d ? 'idle' : 'egg2');
    fTask.value = d ? d.task : '';
    fNotes.value = d ? d.notes || '' : '';
    const hasNotes = !!fNotes.value;
    $('fNotesWrap').hidden = !hasNotes;
    $('fAddNotes').hidden = hasNotes;
    fDate.hidden = true;
    fDate.min = d ? '' : today();
    setDue(d ? d.due : smartDefaultDue());
    showError(false);
    updatePreview();
    formSnapshot = formState();
    formWrap.hidden = false;
    // The form slides in by itself; without preventScroll iPhone browsers scroll
    // the page towards the field while it's still off-screen, which throws off
    // the keyboard measurement and lets the meadow show behind the keyboard
    fTask.focus({ preventScroll: true });
  }
  function hideForm() {
    formWrap.hidden = true;
    const back = editingId ? rt.get(editingId)?.el : lastFocus;
    editingId = null;
    back?.focus?.({ preventScroll: true });
  }
  // New duck: only ask if something was typed (picking a date alone doesn't count).
  // Editing: ask if anything changed.
  function formDirty() {
    if (editingId) return formState() !== formSnapshot;
    return !!(fTask.value.trim() || fNotes.value.trim());
  }
  async function requestCloseForm() {
    if (formDirty()) {
      const discard = await confirmDialog({
        title: 'Discard changes?',
        body: "What you've typed won't be saved.",
        ok: 'Discard', cancel: 'Keep editing',
      });
      if (!discard) { fTask.focus(); return; }
    }
    hideForm();
  }
  function showError(on) {
    fErr.hidden = !on;
    fTask.setAttribute('aria-invalid', String(on));
  }

  fTask.addEventListener('input', () => { showError(false); updatePreview(); });
  $('fAddNotes').addEventListener('click', () => { $('fNotesWrap').hidden = false; $('fAddNotes').hidden = true; fNotes.focus(); });
  form.querySelector('.chips').addEventListener('click', (ev) => {
    const c = ev.target.closest('.chip');
    if (!c) return;
    if (c.dataset.due === 'today') { setDue(today()); fDate.hidden = true; }
    if (c.dataset.due === 'tomorrow') { setDue(addDays(today(), 1)); fDate.hidden = true; }
    if (c.dataset.due === 'pick') {
      fDate.hidden = false;
      fDate.focus();
      try { fDate.showPicker(); } catch (e) { /* inline input is the fallback */ }
    }
  });
  fDate.addEventListener('change', () => { if (fDate.value) setDue(fDate.value); });
  $('formClose').addEventListener('click', requestCloseForm);
  $('fDelete').addEventListener('click', () => { // deleting throws away any edits too
    const id = editingId;
    formWrap.hidden = true;
    editingId = null;
    deleteDuck(id);
  });
  formWrap.addEventListener('pointerdown', (ev) => { if (ev.target === formWrap && !isMobile()) requestCloseForm(); });

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const task = fTask.value.trim();
    if (!task) { showError(true); fTask.focus(); return; }
    const notes = fNotes.value.trim();
    if (editingId) {
      const d = byId(editingId);
      const wasOverdue = overdue(d);
      Object.assign(d, { task, notes, due: formDue });
      save();
      const e = rt.get(d.id);
      currentMad = madId();
      rt.forEach(refreshEntity);
      if (e && wasOverdue && !overdue(d)) { e.timer = 1.4; e.route = null; } // calmed down
      hideForm();
    } else {
      const d = { id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), task, notes, due: formDue, createdAt: now(), completedAt: null };
      ducks.push(d);
      save();
      formWrap.hidden = true;
      editingId = null;
      hatch(d);
      egg.focus({ preventScroll: true });
    }
    renderHud();
  });

  function hatch(d) {
    if (reduceMotion.matches) { makeEntity(d, { side: 'bottom' }); return; }
    makeEntity(d, { mode: 'hatch', x: G.eggPos.x, y: G.eggPos.y, dir: 1, side: 'bottom' });
  }

  function nope() {
    egg.classList.remove('nope');
    void egg.offsetWidth;
    egg.classList.add('nope');
  }
  egg.addEventListener('click', () => openForm());

  // ---------- To-do dropdown ----------
  // Every task left, soonest first. Tapping one opens that duck's card,
  // so ticking off still happens with the duck. History lives in the farmhouse.
  const hud = $('hud'), drop = $('drop');
  let dropTimer = 0;
  function openList() {
    closeCard(false);
    const body = $('dropBody');
    body.innerHTML = '';
    const ticking = pending?.type === 'done' ? pending.id : null;
    const todo = active().filter((d) => d.id !== ticking)
      .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.createdAt - b.createdAt));
    const t = today(), tm = addDays(t, 1);
    const group = (d) => (overdue(d) ? 'Overdue' : d.due === t ? 'Today' : d.due === tm ? 'Tomorrow' : 'Later');
    if (!todo.length) {
      body.innerHTML = '<div class="farm-empty"><p>Nothing to do. Tap the egg to add a duck.</p></div>';
    }
    let last = null;
    todo.forEach((d) => {
      if (group(d) !== last) {
        const h = document.createElement('h3');
        h.className = 'farm-day';
        h.textContent = last = group(d);
        body.appendChild(h);
      }
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'farm-item list-item';
      row.innerHTML = `<img src="${src(mood(d) === 'waiting' ? 'idle' : 'angry1')}" alt=""><span class="fi-task"></span><span class="fi-meta"></span>`;
      row.querySelector('.fi-task').textContent = d.task;
      const meta = row.querySelector('.fi-meta');
      if (d.due !== t && d.due !== tm) meta.textContent = prettyDate(d.due); // the heading already says Today/Tomorrow
      meta.classList.add(mood(d));
      row.addEventListener('click', () => { closeList(false); openCard(d.id); });
      body.appendChild(row);
    });
    hud.setAttribute('aria-expanded', 'true'); // widens the title card first so the list hangs straight off it
    stage.style.setProperty('--drop-top', Math.round(hud.getBoundingClientRect().bottom - stage.getBoundingClientRect().top) + 'px');
    clearTimeout(dropTimer);
    drop.classList.remove('closing');
    drop.hidden = false;
    $('dropBody').scrollTop = 0;
  }
  function closeList(restoreFocus = true) {
    if (drop.hidden) return;
    hud.setAttribute('aria-expanded', 'false');
    if (restoreFocus) hud.focus({ preventScroll: true });
    drop.classList.add('closing'); // slides back up, then hides
    clearTimeout(dropTimer);
    dropTimer = setTimeout(() => {
      if (drop.classList.contains('closing')) { drop.hidden = true; drop.classList.remove('closing'); }
    }, reduceMotion.matches ? 0 : 220);
  }
  hud.addEventListener('click', () => (hud.getAttribute('aria-expanded') === 'true' ? closeList() : openList()));
  // Clicking anywhere else closes it (and still does what was clicked)
  document.addEventListener('pointerdown', (ev) => {
    if (!drop.hidden && !drop.contains(ev.target) && !hud.contains(ev.target)) closeList(false);
  });

  // ---------- Farmhouse ----------
  function openFarm() {
    lastFocus = document.activeElement;
    const list = $('farmList');
    list.innerHTML = '';
    const inRiver = new Set(riverDucks().map((d) => d.id));
    const done = ducks.filter((d) => d.completedAt && !inRiver.has(d.id)).sort((a, b) => b.completedAt - a.completedAt);
    if (inRiver.size) {
      const n = document.createElement('p');
      n.className = 'farm-note';
      n.textContent = `${inRiver.size} ${inRiver.size === 1 ? 'duck is' : 'ducks are'} swimming in the pond today. They'll move in tomorrow.`;
      list.appendChild(n);
    }
    if (!done.length) {
      list.insertAdjacentHTML('beforeend', `<div class="farm-empty"><img src="${src('sleep')}" alt=""><p>No ducks are sleeping here yet! Finish some tasks and have them move in here soon.</p></div>`);
    }
    let day = null;
    done.forEach((d) => {
      const ds = dateStr(d.completedAt);
      if (ds !== day) {
        day = ds;
        const h = document.createElement('h3');
        h.className = 'farm-day';
        h.textContent = ds === today() ? 'Today' : ds === addDays(today(), -1) ? 'Yesterday' : prettyDate(ds);
        list.appendChild(h);
      }
      const row = document.createElement('div');
      row.className = 'farm-item';
      row.innerHTML = `<img src="${src('sleep')}" alt=""><span class="fi-task"></span><span class="fi-meta"></span>`;
      row.querySelector('.fi-task').textContent = d.task;
      row.querySelector('.fi-meta').textContent = new Date(d.completedAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
      list.appendChild(row);
    });
    $('farmWrap').hidden = false;
    $('farmClose').focus();
  }
  function closeFarm() { $('farmWrap').hidden = true; lastFocus?.focus?.({ preventScroll: true }); }
  farmBtn.addEventListener('click', openFarm);
  $('farmClose').addEventListener('click', closeFarm);
  $('farmWrap').addEventListener('pointerdown', (ev) => { if (ev.target === $('farmWrap') && !isMobile()) closeFarm(); });

  // ---------- Keyboard ----------
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      const cw = $('confirmWrap');
      if (!cw.hidden && cw._esc) return cw._esc();
      if (!formWrap.hidden) return requestCloseForm();
      if (!$('farmWrap').hidden) return closeFarm();
      if (!drop.hidden) return closeList();
      if (openId) return closeCard();
    }
    const typing = /INPUT|TEXTAREA/.test(document.activeElement?.tagName) && document.activeElement.type !== 'checkbox';
    const modalOpen = !formWrap.hidden || !$('confirmWrap').hidden || !$('farmWrap').hidden;
    if ((ev.key === 'n' || ev.key === 'N') && !typing && !modalOpen && !ev.metaKey && !ev.ctrlKey) {
      ev.preventDefault();
      closeCard(false);
      openForm();
    }
  });

  // ---------- Pointer (for the chasing duck) ----------
  stage.addEventListener('pointermove', (ev) => {
    if (ev.pointerType !== 'mouse') return;
    const r = stage.getBoundingClientRect();
    pointer.x = ev.clientX - r.left; pointer.y = ev.clientY - r.top; pointer.active = true;
  });
  document.documentElement.addEventListener('mouseleave', () => { pointer.active = false; });

  // ---------- Prototype tools (dev only) ----------
  if (!DEV) $('tools').remove();
  else $('tools').addEventListener('click', async (ev) => {
    const tool = ev.target.closest('button')?.dataset.tool;
    if (!tool) return;
    const t = today();
    if (tool === 'sample') {
      const base = now();
      [
        ['Email landlord about the leak', addDays(t, -2), 'Ask about the leak in the bathroom and attach photos.'],
        ['Book dentist', addDays(t, -1), ''],
        ['Gym', t, ''],
        ['Buy oat milk', t, ''],
        ['Call Mum', addDays(t, 1), 'Ask about Sunday lunch'],
        ['Finish portfolio case study', addDays(t, 3), 'Write up the Ducks in a row project'],
      ].forEach(([task, due, notes], i) => {
        if (active().length >= maxActive()) return;
        const d = { id: 's' + base.toString(36) + i + Math.random().toString(36).slice(2, 5), task, notes, due, createdAt: base + i, completedAt: null };
        ducks.push(d);
        makeEntity(d);
      });
    }
    if (tool === 'skip') offsetDays += 1;
    if (tool === 'today') offsetDays = 0;
    if (tool === 'clear') {
      const ok = await confirmDialog({ title: 'Clear everything?', body: 'Every duck, including the farmhouse, will be gone.', ok: 'Clear everything', cancel: 'Keep them' });
      if (!ok) return;
      closeCard(false);
      pending = null; toast.hidden = true;
      [...rt.keys()].forEach(removeEntity);
      ducks = [];
      offsetDays = 0;
    }
    save();
    currentMad = madId();
    rt.forEach(refreshEntity);
    renderHud();
  });

  // ---------- Boot ----------
  function relayout() {
    syncMobile();
    syncViewport();
    layout();
    rt.forEach((e) => {
      if (e.mode === 'land' && !e.route) {
        e.side = realSide(e.side);
        if (!inZone(e)) { const p = landPoint(e.id, e.side); e.x = p.x; e.y = p.y; e.tx = p.x; e.ty = p.y; }
      }
      if (e.mode === 'swim') e.y = clamp(e.y, G.riverTop + 72 * G.scale, G.riverBottom - 6);
      e.sprite = null;
    });
    if (openId) openCard(openId);
    renderHud(); // the duck limit depends on screen size
  }
  addEventListener('resize', relayout);
  // Fallback for browsers without overflow: clip — focus can scroll a hidden-overflow box
  stage.addEventListener('scroll', () => { stage.scrollTop = 0; stage.scrollLeft = 0; });

  load();
  syncMobile();
  syncViewport();
  layout();
  currentMad = madId();
  active().forEach((d) => makeEntity(d));
  riverDucks().forEach((d) => makeEntity(d, { mode: 'swim' }));
  lastDay = today();
  renderHud();
  requestAnimationFrame(tick);
})();
