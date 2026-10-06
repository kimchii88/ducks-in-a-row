(() => {
  'use strict';

  // ---------- Sprites: [width, height, facing] (facing 1 = beak right, -1 = left) ----------
  const S = {
    idle: [80, 88, -1], walkR1: [80, 88, 1], walkR2: [83, 85, 1], squat: [86, 70, 1],
    swim1: [121, 83, 1], swim2: [129, 78, 1], peck1: [112, 95, 1], peck2: [120, 94, 1],
    quack: [114, 100, 1], restless1: [113, 97, -1], restless2: [94, 101, -1],
    angry1: [105, 106, 1], angry2: [86, 105, -1], happy: [72, 111, 1], lookup: [97, 107, 1],
    sleep: [101, 105, 1], shake: [158, 106, 1], run1: [112, 68, -1], run2: [131, 70, -1],
    egg2: [52, 66, 1],
    hatch1: [55, 66, 1], hatch2: [56, 66, 1], hatch3: [55, 66, 1], hatch4: [56, 76, 1],
    hatch5: [58, 85, 1], hatch6: [64, 100, 1], hatch7: [101, 108, 1],
    feed: [70, 42, 1], fly1: [77, 74, 1], fly2: [108, 95, 1], fly3: [96, 87, 1], fly4: [142, 99, 1],
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

  const MAX_ACTIVE = 20;
  const MAX_RIVER = 10;
  const UNDO_MS = 5000;
  const TAG_CHARS = 14;
  const SMART_DEFAULT_HOUR = 20;

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const stage = $('stage'), world = $('world'), bubble = $('bubble'), egg = $('egg');
  const farmBtn = $('farm'), scrim = $('scrim'), card = $('card');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)');
  const isMobile = () => coarse.matches || innerWidth < 640;

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

  // ---------- Storage ----------
  const KEY = 'ducks-in-a-row-v1';
  let ducks = [];
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s) { ducks = s.ducks || []; offsetDays = s.offsetDays || 0; }
    } catch (e) { /* storage unavailable: start fresh */ }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ ducks, offsetDays })); } catch (e) { /* ignore */ }
  }

  // ---------- Duck helpers ----------
  const byId = (id) => ducks.find((d) => d.id === id);
  const active = () => ducks.filter((d) => !d.completedAt);
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
  function moodText(d) {
    const m = mood(d);
    if (m === 'done') return 'Fed and swimming';
    if (m === 'mad') return `Overdue since ${prettyDate(d.due)} · very cross`;
    if (m === 'sulky') return `Overdue since ${prettyDate(d.due)} · sulking`;
    if (d.due === today()) return 'Due today';
    if (d.due === addDays(today(), 1)) return 'Due tomorrow';
    return `Due ${prettyDate(d.due)}`;
  }
  function tagText(task) {
    const t = task.trim();
    if (t.length <= TAG_CHARS) return t;
    let cut = t.slice(0, TAG_CHARS + 1);
    const sp = cut.lastIndexOf(' ');
    cut = sp >= 4 ? cut.slice(0, sp) : cut.slice(0, TAG_CHARS);
    return cut.trimEnd() + '…';
  }
  function riverDucks() {
    const t = today();
    return ducks.filter((d) => d.completedAt && dateStr(d.completedAt) === t)
      .sort((a, b) => b.completedAt - a.completedAt).slice(0, MAX_RIVER);
  }

  // ---------- Geometry ----------
  const G = {};
  const rand = (a, b) => a + Math.random() * (b - a);
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
    // Land zones (duck feet coordinates)
    const tagSpace = 26;
    G.zones = [];
    const topMin = 70 + G.duckH + tagSpace, topMax = G.riverTop - 10;
    if (topMax - topMin > 20) G.zones.push({ x0: 72, x1: G.W - 72, y0: topMin, y1: topMax });
    const botMin = G.riverBottom + G.duckH * 0.75 + tagSpace, botMax = G.H - 120;
    if (botMax - botMin > 20) G.zones.push({ x0: 72, x1: G.W - 72, y0: botMin, y1: botMax });
    if (!G.zones.length) G.zones.push({ x0: 72, x1: G.W - 72, y0: G.H * 0.3, y1: G.H - 120 });
    G.eggPos = { x: G.W / 2, y: G.H - 150 };
    G.front = { x: Math.max(60, G.W * 0.2), y: G.H - 70 };
  }
  function blocked(x, y) {
    const f = G.farm;
    if (x > f.x - 30 && x < f.x + f.w + 30 && y > f.y - 10 && y < f.y + f.h + G.duckH + 30) return true;
    if (Math.abs(x - G.W / 2) < 90 && y > G.H - 180) return true;
    if (x < 230 && y < 70 + G.duckH + 30) return true; // HUD
    return false;
  }
  function randomLandPoint() {
    const area = (z) => (z.x1 - z.x0) * (z.y1 - z.y0);
    const total = G.zones.reduce((s, z) => s + area(z), 0);
    for (let i = 0; i < 40; i++) {
      let r = Math.random() * total, z = G.zones[0];
      for (const zz of G.zones) { if ((r -= area(zz)) <= 0) { z = zz; break; } }
      const p = { x: rand(z.x0, z.x1), y: rand(z.y0, z.y1) };
      if (!blocked(p.x, p.y)) return p;
    }
    return { x: G.W * 0.3, y: G.zones[0].y1 };
  }
  // Pick the roomiest of a few random spots so ducks and their tags don't pile up
  function landPoint(selfId) {
    const others = [...rt.values()].filter((e) => e.id !== selfId && e.mode === 'land');
    let best = null, bestScore = -1;
    for (let i = 0; i < 8; i++) {
      const p = randomLandPoint();
      const score = others.reduce((m, e) => Math.min(m, Math.hypot((e.tx - p.x) / 1.6, e.ty - p.y)), Infinity);
      if (score > bestScore) { best = p; bestScore = score; }
    }
    return best;
  }
  const inLand = (x, y) => G.zones.some((z) => x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1) && !blocked(x, y);
  const swimY = () => rand(G.riverTop + 72 * G.scale, Math.max(G.riverTop + 72 * G.scale + 1, G.riverBottom - 6));

  // ---------- Runtime duck entities ----------
  const rt = new Map(); // id -> entity
  let currentMad = null;
  let openId = null;
  let hoverId = null;
  const pointer = { x: 0, y: 0, active: false };

  function makeEntity(d, opts = {}) {
    const done = !!d.completedAt;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'duck' + (done ? ' done' : '');
    el.innerHTML = `${done ? '' : '<span class="tag"></span>'}<img class="spr" alt="" draggable="false">`;
    if (done) { el.tabIndex = -1; el.setAttribute('aria-hidden', 'true'); }
    world.appendChild(el);
    const e = {
      id: d.id, el, img: el.querySelector('.spr'), tagEl: el.querySelector('.tag'),
      x: 0, y: 0, tx: 0, ty: 0, dir: 1, mode: done ? 'swim' : 'land',
      t: 0, pause: rand(0.5, 3), pose: 'idle', sprite: null, timer: 0, opacity: 1,
      ...opts,
    };
    if (e.mode === 'land' && !opts.x) { const p = landPoint(); e.x = p.x; e.y = p.y; e.tx = p.x; e.ty = p.y; }
    if (e.mode === 'swim' && !opts.x) { e.x = rand(40, G.W - 40); e.y = swimY(); e.dir = Math.random() < 0.5 ? -1 : 1; }
    el.addEventListener('click', (ev) => { ev.stopPropagation(); if (!byId(e.id)?.completedAt) openCard(e.id); });
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
    e.el.setAttribute('aria-label', `${d.task}. ${moodText(d)}. Open task`);
  }
  function removeEntity(id) {
    const e = rt.get(id);
    if (!e) return;
    e.el.remove();
    if (e.feedEl) e.feedEl.remove();
    rt.delete(id);
    if (bubble.dataset.id === id) hideBubble(id);
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
    if (m === 'mad') {
      if (held || still) { setSprite(e, held && !still ? frame(e, A.angry, 4) : 'angry1'); return; }
      if (isMobile()) {
        // Drift to the front of the screen and peck
        if (moveToward(e, G.front.x, G.front.y, 70, dt)) setSprite(e, frame(e, A.peck, 4), 1);
        else setSprite(e, frame(e, A.walk, 7));
        return;
      }
      if (pointer.active) {
        const dx = pointer.x - e.x, dy = pointer.y + 20 - e.y, dist = Math.hypot(dx, dy);
        if (dist > 95) {
          const k = Math.min(dist - 95, 130 * dt) / dist;
          e.x += dx * k; e.y += dy * k;
          e.dir = dx > 0 ? 1 : -1;
          setSprite(e, frame(e, A.run, 9));
        } else {
          e.dir = dx > 0 ? 1 : -1;
          setSprite(e, frame(e, A.angry, 4));
        }
      } else {
        setSprite(e, frame(e, A.angry, 3));
      }
      return;
    }

    if (still) { setSprite(e, m === 'sulky' ? 'restless1' : 'idle'); return; }
    if (held) { setSprite(e, m === 'sulky' ? frame(e, A.restless, 3) : 'quack'); return; }

    if (e.pause > 0) {
      e.pause -= dt;
      setSprite(e, m === 'sulky' ? frame(e, A.restless, 2.5) : e.pose);
      if (e.pause <= 0) {
        const p = landPoint(e.id);
        // Sulky ducks don't wander far
        if (m === 'sulky') { p.x = e.x + (p.x - e.x) * 0.25; p.y = e.y + (p.y - e.y) * 0.25; }
        e.tx = p.x; e.ty = p.y;
      }
      return;
    }
    if (moveToward(e, e.tx, e.ty, m === 'sulky' ? 14 : 30, dt)) {
      e.pause = rand(2, 6);
      e.pose = IDLE_POSES[Math.floor(Math.random() * IDLE_POSES.length)];
    }
    setSprite(e, frame(e, A.walk, m === 'sulky' ? 3 : 5));
  }

  function update(e, dt) {
    e.t += dt;
    const d = byId(e.id);
    switch (e.mode) {
      case 'land':
        if (d) updateLand(e, d, dt);
        break;
      case 'hatch': {
        const i = Math.floor(e.t / 0.24);
        if (i >= A.hatch.length + 2) {
          e.mode = 'land'; e.t = 0; e.pause = 0;
          const p = landPoint(); e.tx = p.x; e.ty = p.y;
          e.el.classList.remove('hatching');
        } else setSprite(e, A.hatch[Math.min(i, A.hatch.length - 1)], 1);
        break;
      }
      case 'eat':
        setSprite(e, frame(e, A.peck, 3.5), e.dir);
        break;
      case 'happy':
        setSprite(e, 'happy');
        if ((e.timer -= dt) <= 0) {
          e.mode = 'toRiver'; e.t = 0;
          const intoTop = e.y < (G.riverTop + G.riverBottom) / 2;
          e.tx = e.x; e.ty = intoTop ? G.riverTop + 80 * G.scale : G.riverBottom - 6;
          if (e.tagEl) { e.tagEl.remove(); e.tagEl = null; }
        }
        break;
      case 'toRiver':
        if (moveToward(e, e.tx, e.ty, reduceMotion.matches ? 9999 : 70, dt)) {
          e.mode = 'swim'; e.t = 0; e.dir = Math.random() < 0.5 ? -1 : 1;
          e.el.classList.add('done'); e.el.tabIndex = -1; e.el.setAttribute('aria-hidden', 'true');
          trimRiver();
        } else setSprite(e, frame(e, A.walk, 7));
        break;
      case 'swim': {
        if (!reduceMotion.matches) {
          const speed = e.leaving ? 60 : 16;
          e.x += e.dir * speed * dt;
          if (e.leaving && (e.x < -80 || e.x > G.W + 80)) { removeEntity(e.id); return; }
          if (!e.leaving && (e.x < -70 || e.x > G.W + 70)) e.x = e.dir > 0 ? -60 : G.W + 60;
        }
        setSprite(e, e.shakeT > 0 ? 'shake' : frame(e, A.swim, 2));
        if (e.shakeT > 0) e.shakeT -= dt;
        else if (Math.random() < dt / 25) e.shakeT = 0.9;
        break;
      }
      case 'fly': {
        e.x += 120 * dt; e.y -= 170 * dt;
        e.opacity = Math.max(0, 1 - e.t / 1.5);
        setSprite(e, frame(e, A.fly, 8), 1);
        if (e.t > 1.5) { removeEntity(e.id); return; }
        break;
      }
    }
    e.el.style.transform = `translate(${e.x.toFixed(1)}px, ${e.y.toFixed(1)}px)`;
    e.el.style.zIndex = e.mode === 'fly' ? 14000 : Math.round(e.y);
    if (e.mode === 'fly') e.el.style.opacity = e.opacity;
  }

  function trimRiver() {
    const swimming = [...rt.values()].filter((e) => e.mode === 'swim' && !e.leaving);
    const keep = new Set(riverDucks().map((d) => d.id));
    swimming.forEach((e) => { if (!keep.has(e.id)) e.leaving = true; });
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
    if (bubble.dataset.id) positionBubble();
    tickToast(rawDt); // undo window runs on real time
    requestAnimationFrame(tick);
  }

  // Each day is a fresh checklist: yesterday's fed ducks retire to the farmhouse
  function dailyReset() {
    const keep = new Set(riverDucks().map((d) => d.id));
    rt.forEach((e, id) => { if (e.mode === 'swim' && !keep.has(id)) removeEntity(id); });
    rt.forEach(refreshEntity);
    renderHud();
  }

  // ---------- HUD + egg ----------
  function renderHud() {
    const todo = active().length;
    const doneToday = ducks.filter((d) => d.completedAt && dateStr(d.completedAt) === today()).length;
    $('hudCount').textContent = `${todo} to do · ${doneToday} fed today`;
    const full = todo >= MAX_ACTIVE;
    egg.classList.toggle('full', full);
    egg.setAttribute('aria-disabled', String(full));
    $('eggLabel').textContent = full ? 'Too many ducks! Feed one first' : 'Add duck';
    $('toolsClock').textContent = offsetDays ? `Pretending it's ${prettyDate(today())}` : `Today is ${prettyDate(today())}`;
  }

  // ---------- Hover bubble ----------
  function showBubble(id) {
    if (openId === id) return;
    const d = byId(id);
    if (!d) return;
    const m = mood(d);
    bubble.innerHTML = '';
    const task = document.createElement('span');
    task.textContent = d.task;
    const md = document.createElement('span');
    md.className = 'b-mood ' + m;
    md.textContent = moodText(d);
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
    const above = e.tagEl ? G.duckH + 30 : G.duckH + 6;
    const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    const x = Math.min(G.W - bw - 8, Math.max(8, e.x - bw / 2));
    const y = Math.max(8, e.y - above - bh - 10);
    bubble.style.transform = `translate(${x}px, ${y}px)`;
  }

  // ---------- Card ----------
  function openCard(id) {
    const d = byId(id), e = rt.get(id);
    if (!d || !e || e.mode !== 'land') return;
    closeCard(false);
    openId = id;
    hideBubble();
    $('cardTask').textContent = d.task;
    $('cardNotes').textContent = d.notes || '';
    const md = $('cardMood');
    md.textContent = moodText(d);
    md.className = 'card-mood ' + mood(d);
    $('cardCheck').checked = false;
    closeMenu();
    card.hidden = false;
    scrim.hidden = false;
    const sheet = isMobile();
    card.classList.toggle('sheet', sheet);
    card.style.transform = '';
    if (sheet) {
      card.style.left = card.style.top = '';
    } else {
      // Next to the duck, never on top of it
      const cw = card.offsetWidth, ch = card.offsetHeight, gap = 46 * G.scale + 16;
      let x = e.x + gap;
      if (x + cw > G.W - 10) x = e.x - gap - cw;
      x = Math.max(10, Math.min(G.W - cw - 10, x));
      const y = Math.max(10, Math.min(G.H - ch - 10, e.y - G.duckH - 20));
      card.style.left = x + 'px';
      card.style.top = y + 'px';
    }
    $('cardCheck').focus({ preventScroll: true });
  }
  function closeCard(restoreFocus = true) {
    if (!openId) return;
    const id = openId;
    openId = null;
    card.hidden = true;
    scrim.hidden = true;
    closeMenu();
    if (restoreFocus) rt.get(id)?.el.focus({ preventScroll: true });
  }
  function openMenu() { $('cardMenu').hidden = false; $('cardMore').setAttribute('aria-expanded', 'true'); $('cardMenu').querySelector('button').focus(); }
  function closeMenu() { $('cardMenu').hidden = true; $('cardMore').setAttribute('aria-expanded', 'false'); }

  scrim.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); closeCard(); });
  $('cardClose').addEventListener('click', () => closeCard());
  $('cardMore').addEventListener('click', () => ($('cardMenu').hidden ? openMenu() : closeMenu()));
  $('cardMenu').addEventListener('click', (ev) => {
    const act = ev.target.closest('button')?.dataset.act;
    const id = openId;
    if (!act || !id) return;
    closeMenu();
    if (act === 'edit') { closeCard(false); openForm(id); }
    if (act === 'delete') deleteDuck(id);
  });
  $('cardCheck').addEventListener('change', (ev) => {
    if (!ev.target.checked || !openId) return;
    const id = openId;
    setTimeout(() => { closeCard(false); feedDuck(id); }, 180); // let the tick register visually
  });

  // Swipe the bottom sheet down to close
  let swipe = null;
  card.addEventListener('touchstart', (ev) => {
    if (!card.classList.contains('sheet') || ev.target.closest('button, label')) return;
    swipe = { y: ev.touches[0].clientY, dy: 0 };
  }, { passive: true });
  card.addEventListener('touchmove', (ev) => {
    if (!swipe) return;
    swipe.dy = Math.max(0, ev.touches[0].clientY - swipe.y);
    card.style.transform = `translateY(${swipe.dy}px)`;
  }, { passive: true });
  card.addEventListener('touchend', () => {
    if (!swipe) return;
    if (swipe.dy > 70) closeCard(); else card.style.transform = '';
    swipe = null;
  });

  // ---------- Feeding + undo countdown ----------
  let pending = null; // { id, left, paused }
  const toast = $('toast');

  function feedDuck(id) {
    if (pending) finishFeed();
    const e = rt.get(id);
    if (!e) return;
    e.mode = 'eat'; e.t = 0;
    const fx = Math.max(30, Math.min(G.W - 30, e.x + e.dir * 46 * G.scale));
    const feed = document.createElement('img');
    feed.className = 'feed';
    feed.src = src('feed');
    feed.alt = '';
    feed.style.width = Math.round(S.feed[0] * G.scale * 0.8) + 'px';
    feed.style.left = fx + 'px';
    feed.style.top = e.y + 'px';
    feed.style.zIndex = Math.round(e.y) - 1;
    world.appendChild(feed);
    e.feedEl = feed;
    pending = { id, left: UNDO_MS, paused: false };
    $('toastText').textContent = `${tagText(byId(id).task)} fed`;
    toast.hidden = false;
    toast.classList.remove('paused');
    $('toastFill').style.width = '100%';
  }
  function tickToast(dt) {
    if (!pending || pending.paused) return;
    pending.left -= dt * 1000;
    $('toastFill').style.width = Math.max(0, (pending.left / UNDO_MS) * 100) + '%';
    if (pending.left <= 0) finishFeed();
  }
  function finishFeed() {
    if (!pending) return;
    const { id } = pending;
    pending = null;
    toast.hidden = true;
    const d = byId(id), e = rt.get(id);
    if (!d) return;
    d.completedAt = now();
    save();
    if (e) {
      if (e.feedEl) { const f = e.feedEl; f.style.opacity = '0'; setTimeout(() => f.remove(), 400); e.feedEl = null; }
      e.mode = 'happy'; e.timer = 0.8; e.t = 0;
    }
    renderHud();
  }
  function undoFeed() {
    if (!pending) return;
    const e = rt.get(pending.id);
    pending = null;
    toast.hidden = true;
    if (e) {
      if (e.feedEl) { e.feedEl.remove(); e.feedEl = null; }
      e.mode = 'land'; e.t = 0; e.pause = 1.5;
      e.el.focus({ preventScroll: true });
    }
  }
  $('toastUndo').addEventListener('click', undoFeed);
  const pause = (p) => { if (pending) { pending.paused = p; toast.classList.toggle('paused', p); } };
  toast.addEventListener('pointerenter', () => pause(true));
  toast.addEventListener('pointerleave', () => { if (!toast.contains(document.activeElement)) pause(false); });
  toast.addEventListener('focusin', () => pause(true));
  toast.addEventListener('focusout', () => pause(false));

  // ---------- Delete (confirmation, then fly away) ----------
  async function deleteDuck(id) {
    const d = byId(id);
    closeCard(false);
    const ok = await confirmDialog({
      title: 'Delete this duck?',
      body: `“${d.task}” will fly away for good.`,
      ok: 'Delete duck', cancel: 'Keep it',
    });
    if (!ok) { rt.get(id)?.el.focus({ preventScroll: true }); return; }
    ducks = ducks.filter((x) => x.id !== id);
    save();
    const e = rt.get(id);
    if (e) {
      if (e.tagEl) { e.tagEl.remove(); e.tagEl = null; }
      e.mode = reduceMotion.matches ? 'gone' : 'fly'; e.t = 0;
      e.el.tabIndex = -1;
      if (e.mode === 'gone') removeEntity(id);
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
      wrap.onclick = (ev) => { if (ev.target === wrap) done(false); };
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
    if (!id && active().length >= MAX_ACTIVE) { nope(); return; }
    editingId = id;
    const d = id ? byId(id) : null;
    lastFocus = document.activeElement;
    $('formTitle').textContent = d ? 'Edit duck' : 'New duck';
    $('fSubmit').textContent = d ? 'Save' : 'Hatch duck';
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
    fTask.focus();
  }
  function hideForm() {
    formWrap.hidden = true;
    const back = editingId ? rt.get(editingId)?.el : lastFocus;
    editingId = null;
    back?.focus?.({ preventScroll: true });
  }
  async function requestCloseForm() {
    if (formState() !== formSnapshot) {
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
  formWrap.addEventListener('pointerdown', (ev) => { if (ev.target === formWrap) requestCloseForm(); });

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
      if (e && wasOverdue && !overdue(d)) { e.timer = 1.4; } // calmed down
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
    const e = makeEntity(d, { mode: reduceMotion.matches ? 'land' : 'hatch', x: G.eggPos.x, y: G.eggPos.y, dir: 1 });
    if (reduceMotion.matches) { const p = landPoint(); e.x = p.x; e.y = p.y; }
    else e.el.classList.add('hatching');
  }

  function nope() {
    egg.classList.remove('nope');
    void egg.offsetWidth;
    egg.classList.add('nope');
  }
  egg.addEventListener('click', () => openForm());

  // ---------- Farmhouse ----------
  function openFarm() {
    lastFocus = document.activeElement;
    const list = $('farmList');
    list.innerHTML = '';
    const done = ducks.filter((d) => d.completedAt).sort((a, b) => b.completedAt - a.completedAt);
    if (!done.length) {
      list.innerHTML = `<div class="farm-empty"><img src="${src('sleep')}" alt=""><p>No ducks here yet. Feed your first duck and it'll end up here.</p></div>`;
    }
    const inRiver = new Set(riverDucks().map((d) => d.id));
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
      row.innerHTML = `<img src="${src(inRiver.has(d.id) ? 'swim1' : 'sleep')}" alt=""><span class="fi-task"></span><span class="fi-meta"></span>`;
      row.querySelector('.fi-task').textContent = d.task;
      row.querySelector('.fi-meta').textContent = inRiver.has(d.id) ? 'In the river' : new Date(d.completedAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
      list.appendChild(row);
    });
    $('farmWrap').hidden = false;
    $('farmClose').focus();
  }
  function closeFarm() { $('farmWrap').hidden = true; lastFocus?.focus?.({ preventScroll: true }); }
  farmBtn.addEventListener('click', openFarm);
  $('farmClose').addEventListener('click', closeFarm);
  $('farmWrap').addEventListener('pointerdown', (ev) => { if (ev.target === $('farmWrap')) closeFarm(); });

  // ---------- Keyboard ----------
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      const cw = $('confirmWrap');
      if (!cw.hidden && cw._esc) return cw._esc();
      if (!formWrap.hidden) return requestCloseForm();
      if (!$('farmWrap').hidden) return closeFarm();
      if (!$('cardMenu').hidden) { closeMenu(); $('cardMore').focus(); return; }
      if (openId) return closeCard();
    }
    const typing = /INPUT|TEXTAREA/.test(document.activeElement?.tagName);
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
  document.addEventListener('pointerleave', () => { pointer.active = false; });
  document.documentElement.addEventListener('mouseleave', () => { pointer.active = false; });

  // ---------- Prototype tools ----------
  $('tools').addEventListener('click', async (ev) => {
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
        if (active().length >= MAX_ACTIVE) return;
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
    layout();
    rt.forEach((e) => {
      if (e.mode === 'land' && !inLand(e.x, e.y)) { const p = landPoint(); e.x = p.x; e.y = p.y; e.tx = p.x; e.ty = p.y; }
      if (e.mode === 'swim') e.y = Math.min(Math.max(e.y, G.riverTop + 72 * G.scale), G.riverBottom - 6);
      e.sprite = null;
    });
    if (openId) openCard(openId);
  }
  addEventListener('resize', relayout);
  // Fallback for browsers without overflow: clip — focus can scroll a hidden-overflow box
  stage.addEventListener('scroll', () => { stage.scrollTop = 0; stage.scrollLeft = 0; });

  load();
  layout();
  currentMad = madId();
  active().forEach((d) => makeEntity(d));
  riverDucks().forEach((d) => makeEntity(d));
  lastDay = today();
  renderHud();
  requestAnimationFrame(tick);
})();
