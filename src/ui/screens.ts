import { sfx } from '../audio/audio';
import { CROPS } from '../data/crops';
import { LEVELS, type LevelDef } from '../data/levels';
import { COMPANIONS, CRITTERS, SOILS, type SoilId } from '../data/world';
import type { EndResult } from '../game/controller';
import { isUnlocked, persist, save, totalStars } from '../game/save';
import { icon } from '../render/icons';
import { h } from './hud';
import { coinSvg, ICON } from './svg';

type Btn = { label: string; cls?: string; icon?: string; on: () => void };

const button = (b: Btn) => {
  const el = h('button', `btn ${b.cls ?? ''}`, `${b.icon ?? ''}<span>${b.label}</span>`);
  el.addEventListener('click', () => {
    sfx.unlock();
    sfx.ui();
    b.on();
  });
  return el;
};

/** fade/slide a screen out, then remove it */
export const leave = (el: HTMLElement, ms = 260) => {
  el.classList.add('out');
  el.style.pointerEvents = 'none';
  setTimeout(() => el.remove(), ms);
};

export function audioToggles(): HTMLDivElement {
  const row = h('div', 'toggles');
  const mk = (key: 'music' | 'sound', ico: string, label: string) => {
    const b = h('button', 'round-btn toggle', ico);
    b.setAttribute('aria-label', label);
    const sync = () => b.classList.toggle('off', !save[key]);
    sync();
    b.addEventListener('click', () => {
      sfx.unlock();
      save[key] = !save[key];
      persist();
      if (key === 'music') sfx.music(save.music);
      else sfx.setSfx(save.sound ? 0.9 : 0);
      sync();
      sfx.ui();
    });
    return b;
  };
  row.append(mk('music', ICON.music, 'Music'), mk('sound', ICON.sound, 'Sound'));
  return row;
}

const starRow = (n: number, cls = '') => `<div class="stars ${cls}">${[0, 1, 2, 3].map((i) => `<i class="${i < n ? 'on' : ''}">${ICON.star}</i>`).join('')}</div>`;

// ───────────────────────── title ─────────────────────────

export function titleScreen(ui: HTMLElement, on: { play: () => void }): HTMLDivElement {
  const el = h('div', 'screen title');
  el.innerHTML = `
    <div class="logo">
      <div class="logo-leaf">${ICON.leaf}</div>
      <h1><span>Bloom</span><span>keeper</span></h1>
      <p>Granny’s cozy garden</p>
    </div>`;
  const foot = h('div', 'title-foot');
  foot.appendChild(button({ label: 'Play', cls: 'primary big', icon: ICON.play, on: on.play }));
  foot.appendChild(audioToggles());
  el.appendChild(foot);
  ui.appendChild(el);
  return el;
}

// ───────────────────────── map ─────────────────────────

const WORLDS: { id: number; name: string; sub: string }[] = [
  { id: 0, name: 'Granny’s Lessons', sub: 'Learn the ropes' },
  { id: 1, name: 'Spring Garden', sub: 'World 1' },
];

export function mapScreen(ui: HTMLElement, on: { pick: (l: LevelDef) => void; back: () => void }): HTMLDivElement {
  const el = h('div', 'screen map');
  const head = h('div', 'map-head');
  const back = h('button', 'round-btn', ICON.close);
  back.setAttribute('aria-label', 'Back');
  back.addEventListener('click', () => {
    sfx.ui();
    on.back();
  });
  head.appendChild(back);
  head.appendChild(h('div', 'pill total', `<i class="star-ico">${ICON.star}</i><span>${totalStars()}<small>/${LEVELS.length * 4}</small></span>`));
  head.appendChild(audioToggles());
  el.appendChild(head);

  const scroll = h('div', 'map-scroll');
  const tutorialDone = LEVELS.filter((l) => l.world === 0).every((l) => (save.stars[l.id] ?? 0) > 0);
  let current: HTMLElement | null = null;

  for (const w of WORLDS) {
    const levels = LEVELS.filter((l) => l.world === w.id);
    const sec = h('section', `world w${w.id}`);
    sec.appendChild(h('div', 'world-title', `<b>${w.name}</b><span>${w.sub}</span>`));
    if (w.id === 0 && !tutorialDone && !save.tutorialSkipped) {
      const skip = h('button', 'link-btn', 'Skip lessons');
      skip.addEventListener('click', () => {
        sfx.ui();
        save.tutorialSkipped = true;
        persist();
        const fresh = mapScreen(ui, on);
        el.replaceWith(fresh);
      });
      sec.appendChild(skip);
    }
    const path = h('div', 'path');
    const n = levels.length;
    const pts: [number, number][] = [];
    const stepY = 104;
    levels.forEach((l, i) => {
      const x = 50 + Math.sin(i * 1.05 + w.id) * 28;
      const y = 50 + i * stepY;
      pts.push([x, y]);
      const unlocked = isUnlocked(l.id);
      const stars = save.stars[l.id] ?? 0;
      const node = h('button', `node${unlocked ? '' : ' locked'}${stars ? ' done' : ''}${l.boss ? ' boss' : ''}`);
      node.style.left = `${x}%`;
      node.style.top = `${y}px`;
      node.style.setProperty('--d', `${i * 30}ms`);
      node.innerHTML = l.boss
        ? `<div class="disc"><img src="${icon('crowKing')}" alt=""></div>${starRow(stars)}`
        : `<div class="disc">${unlocked ? `<span>${l.world === 0 ? l.index : l.index}</span>` : ICON.lock}</div>${starRow(stars)}<div class="cap">${l.title}</div>`;
      if (unlocked) {
        node.addEventListener('click', () => {
          sfx.select();
          on.pick(l);
        });
        if (!stars && !current) current = node;
      }
      path.appendChild(node);
    });
    path.style.height = `${50 + (n - 1) * stepY + 90}px`;
    // dotted trail
    const svgH = 50 + (n - 1) * stepY + 90;
    let d = '';
    pts.forEach(([x, y], i) => {
      if (i === 0) d += `M ${x} ${y}`;
      else {
        const [px, py] = pts[i - 1];
        const my = (py + y) / 2;
        d += ` C ${px} ${my}, ${x} ${my}, ${x} ${y}`;
      }
    });
    path.insertAdjacentHTML(
      'afterbegin',
      `<svg class="trail" viewBox="0 0 100 ${svgH}" preserveAspectRatio="none"><path d="${d}" vector-effect="non-scaling-stroke"/></svg>`,
    );
    sec.appendChild(path);
    scroll.appendChild(sec);
  }
  el.appendChild(scroll);
  ui.appendChild(el);
  const cur = current as HTMLElement | null;
  if (cur) {
    cur.classList.add('current');
    requestAnimationFrame(() => {
      scroll.scrollTop = Math.max(0, cur.offsetTop + (cur.offsetParent as HTMLElement).offsetTop - scroll.clientHeight * 0.45);
    });
  }
  return el;
}

// ───────────────────────── level intro ─────────────────────────

const soilSwatch = (s: SoilId) =>
  `<i class="soil-sw ${s}"></i>`;

function newThings(l: LevelDef): string[] {
  const idx = LEVELS.indexOf(l);
  const prev = LEVELS.slice(0, idx);
  const had = <T,>(f: (p: LevelDef) => T[]) => new Set(prev.flatMap(f));
  const out: string[] = [];
  const seeds = had((p) => p.seeds);
  for (const s of l.seeds) if (!seeds.has(s)) out.push(`<div class="new-item"><img src="${icon(`veg:${s}`)}" alt=""><b>${CROPS[s].name}</b><span>${CROPS[s].blurb}</span></div>`);
  const crit = had((p) => (p.critters ?? []).map((c) => c.type));
  for (const c of l.critters ?? []) if (!crit.has(c.type)) out.push(`<div class="new-item"><img src="${icon(c.type)}" alt=""><b>${CRITTERS[c.type].name}</b><span>${CRITTERS[c.type].blurb}</span></div>`);
  const soilsOf = (p: LevelDef) => [...new Set(p.garden.join('').split('').filter((ch) => ch === 's' || ch === 'c'))].map((ch) => (ch === 's' ? 'sandy' : 'clay') as SoilId);
  const soils = had(soilsOf);
  for (const s of soilsOf(l)) if (!soils.has(s)) out.push(`<div class="new-item">${soilSwatch(s)}<b>${SOILS[s].name}</b><span>${SOILS[s].bonus} ${SOILS[s].downside}.</span></div>`);
  const comp = had((p) => p.companions ?? []);
  for (const c of l.companions ?? []) if (!comp.has(c)) out.push(`<div class="new-item"><img src="${icon('tortoise')}" alt=""><b>${COMPANIONS[c].name}</b><span>${COMPANIONS[c].blurb}</span></div>`);
  if (l.garden.join('').includes('r') && !prev.some((p) => p.garden.join('').includes('r'))) out.push(`<div class="new-item"><i class="soil-sw rock"></i><b>Rocks</b><span>Tap a rock three times to dig it out.</span></div>`);
  if (l.weeds && !prev.some((p) => p.weeds)) out.push(`<div class="new-item"><i class="soil-sw weed"></i><b>Weeds</b><span>Pull sprouts with one tap. Grown weeds take three taps and cost 3 coins.</span></div>`);
  if (l.boss) out.push(`<div class="new-item"><img src="${icon('crowKing')}" alt=""><b>The Crow King</b><span>Tap him only while he perches. Don’t lose 3 plants!</span></div>`);
  return out;
}

export function starLabels(l: LevelDef): string[] {
  return [
    'Finish the level',
    l.time ? `Finish in ${l.par}s` : 'Finish the level calmly',
    'Lose no plants or veggies',
    l.bonus === 'chain5' ? 'Catch a 5-veggie chain' : 'Catch 5 Perfects in a row',
  ];
}

export function introModal(ui: HTMLElement, l: LevelDef, on: { play: () => void; back: () => void }): HTMLDivElement {
  const el = h('div', 'modal-wrap');
  const card = h('div', 'card intro');
  const flags = save.flags[l.id] ?? [false, false, false, false];
  const g = l.goals;
  const goals: string[] = [];
  if (g.bills) goals.push(`<div class="goal-line"><span class="gi">${ICON.mail}</span>Pay ${g.bills.length} bill${g.bills.length > 1 ? 's' : ''}<b>${coinSvg(16)}${g.bills.reduce((a, b) => a + b, 0)}</b></div>`);
  if (g.order) goals.push(`<div class="goal-line"><img src="${icon(`veg:${g.order.crop}`)}" alt="">Deliver ${g.order.count} ${CROPS[g.order.crop].plural}</div>`);
  if (g.perfect) goals.push(`<div class="goal-line"><span class="gi spark">${ICON.sparkle}</span>Catch ${g.perfect} Perfects</div>`);
  if (l.boss) goals.push(`<div class="goal-line"><img src="${icon('crowKing')}" alt="">Then chase off the Crow King</div>`);
  if (l.time) goals.push(`<div class="goal-line"><span class="gi">${ICON.clock}</span>Within ${l.time}s</div>`);
  const news = newThings(l);
  card.innerHTML = `
    <div class="card-head"><span class="lvl-chip">${l.world === 0 ? 'Lesson' : 'Level'} ${l.id}</span><h2>${l.title}</h2><p>${l.intro}</p></div>
    <div class="goals-box">${goals.join('')}</div>
    ${news.length && l.world > 0 ? `<div class="new-box"><div class="sec-t">New here</div>${news.join('')}</div>` : ''}
    <div class="star-list">${starLabels(l).map((s, i) => `<div class="star-line ${flags[i] ? 'got' : ''}"><i>${ICON.star}</i><span>${s}</span></div>`).join('')}</div>
  `;
  const row = h('div', 'btn-row');
  row.appendChild(button({ label: 'Map', cls: 'ghost', icon: ICON.map, on: on.back }));
  row.appendChild(button({ label: 'Play', cls: 'primary', icon: ICON.play, on: on.play }));
  card.appendChild(row);
  el.appendChild(card);
  ui.appendChild(el);
  return el;
}

// ───────────────────────── pause ─────────────────────────

export function pauseModal(ui: HTMLElement, l: LevelDef, on: { resume: () => void; restart: () => void; map: () => void }): HTMLDivElement {
  const el = h('div', 'modal-wrap');
  const card = h('div', 'card pause');
  card.innerHTML = `<div class="card-head"><span class="lvl-chip">${l.id}</span><h2>Paused</h2><p>${l.title}</p></div>`;
  card.appendChild(audioToggles());
  const col = h('div', 'btn-col');
  col.appendChild(button({ label: 'Resume', cls: 'primary', icon: ICON.play, on: on.resume }));
  col.appendChild(button({ label: 'Restart', cls: 'ghost', icon: ICON.retry, on: on.restart }));
  col.appendChild(button({ label: 'Map', cls: 'ghost', icon: ICON.map, on: on.map }));
  card.appendChild(col);
  el.appendChild(card);
  ui.appendChild(el);
  return el;
}

// ───────────────────────── results ─────────────────────────

const fmt = (t: number) => {
  const s = Math.round(t);
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
};

export function resultsModal(
  ui: HTMLElement,
  r: EndResult,
  hasNext: boolean,
  on: { next: () => void; retry: () => void; map: () => void },
): HTMLDivElement {
  const el = h('div', 'modal-wrap results-wrap');
  const card = h('div', `card results ${r.won ? 'win' : 'lose'}`);
  const l = r.level;
  if (r.won) {
    const labels = starLabels(l);
    const titles = ['Lovely work!', 'Well tended!', 'Wonderful!', 'Blooming marvellous!', 'Perfect garden!'];
    const n = r.flags.filter(Boolean).length;
    card.innerHTML = `
      <div class="ribbon"><span>${l.world === 0 ? 'Lesson' : 'Level'} ${l.id} complete</span></div>
      <img class="granny-pic" src="${icon('granny')}" alt="">
      <h2>${titles[n]}</h2>
      <div class="big-stars">${r.flags.map((f) => `<i class="${f ? 'earn' : ''}">${ICON.star}</i>`).join('')}</div>
      <div class="star-list compact">${labels.map((s, i) => `<div class="star-line ${r.flags[i] ? 'got' : ''}" style="--d:${0.45 + i * 0.32}s"><i>${ICON.star}</i><span>${s}</span></div>`).join('')}</div>
      <div class="stats-row">
        <div><b>${fmt(r.time)}</b><span>time</span></div>
        <div><b>${r.caught}</b><span>caught</span></div>
        <div><b>${coinSvg(15)}${r.earned}</b><span>earned</span></div>
        <div><b>×${r.bestChain}</b><span>best chain</span></div>
      </div>`;
    const stars = card.querySelectorAll<HTMLElement>('.big-stars i');
    stars.forEach((s, i) => {
      s.style.setProperty('--d', `${0.45 + i * 0.32}s`);
      if (r.flags[i]) setTimeout(() => sfx.star(i), 450 + i * 320);
    });
  } else {
    const why =
      r.reason === 'overrun'
        ? ['The Crow King took the garden!', 'Keep plants safe: tap crows the moment they land, and hit the King only while he perches.']
        : ['Out of time!', 'Keep every plot busy, water before plants wilt, and catch veggies while they roll for Perfects.'];
    card.innerHTML = `
      <img class="granny-pic sad" src="${icon('granny')}" alt="">
      <h2>${why[0]}</h2>
      <p class="tip"><b>Granny’s tip:</b> ${why[1]}</p>`;
  }
  const row = h('div', 'btn-row');
  row.appendChild(button({ label: '', cls: 'ghost icon-only', icon: ICON.map, on: on.map }));
  row.appendChild(button({ label: 'Retry', cls: r.won && hasNext ? 'ghost' : 'primary', icon: ICON.retry, on: on.retry }));
  if (r.won && hasNext) row.appendChild(button({ label: 'Next', cls: 'primary', icon: ICON.play, on: on.next }));
  card.appendChild(row);
  el.appendChild(card);
  ui.appendChild(el);
  return el;
}

export function worldDoneModal(ui: HTMLElement, on: { map: () => void }): HTMLDivElement {
  const el = h('div', 'modal-wrap');
  const card = h('div', 'card results win');
  card.innerHTML = `
    <div class="ribbon"><span>Spring is saved</span></div>
    <img class="granny-pic" src="${icon('granny')}" alt="">
    <h2>Thank you, dear!</h2>
    <p class="tip">The Crow King has flown off and every bill is paid. More seasons are sprouting soon — try for four stars everywhere!</p>
    <div class="big-total"><i class="star-ico">${ICON.star}</i>${totalStars()} / ${LEVELS.length * 4}</div>`;
  const row = h('div', 'btn-row');
  row.appendChild(button({ label: 'Back to map', cls: 'primary', icon: ICON.map, on: on.map }));
  card.appendChild(row);
  el.appendChild(card);
  ui.appendChild(el);
  return el;
}
