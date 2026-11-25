import { CROPS, type CropId } from '../data/crops';
import { COMPANIONS } from '../data/world';
import { icon } from '../render/icons';
import { CAN_MAX, CAN_REFILL, type Sim } from '../sim/sim';
import { coinSvg, ICON } from './svg';

export const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html) el.innerHTML = html;
  return el;
};

/** restart a CSS animation class on an element */
export const pulse = (el: Element, cls: string) => {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
};

export interface HudHandlers {
  pause(): void;
  select(crop: CropId): void;
  pay(): void;
  dash(): void;
}

interface Marker {
  el: HTMLDivElement;
  ring: SVGCircleElement;
  pips: HTMLDivElement;
  hp: number;
  seen: boolean;
}

const RING_C = 2 * Math.PI * 15;

/**
 * The DOM overlay for a level: top bar (coins, goals, timer), seed tray, can meter,
 * Shell Dash, world-anchored markers, floating text, toasts and Granny's coach bubble.
 */
export class Hud {
  readonly el: HTMLDivElement;
  private sim: Sim;

  private top: HTMLDivElement;
  private coinsEl: HTMLDivElement;
  private coinsNum: HTMLSpanElement;
  private shownCoins: number;
  private timerEl: HTMLDivElement | null = null;
  private timerRing: SVGCircleElement | null = null;
  private timerText: HTMLSpanElement | null = null;
  private billEls: HTMLButtonElement[] = [];
  private orderEl: HTMLDivElement | null = null;
  private orderNum: HTMLSpanElement | null = null;
  private perfectEl: HTMLDivElement | null = null;
  private perfectNum: HTMLSpanElement | null = null;
  private bottom: HTMLDivElement;
  private seedCards = new Map<CropId, HTMLButtonElement>();
  private tip: HTMLDivElement;
  private tipTimer = 0;
  private drops: HTMLDivElement[] = [];
  private dashBtn: HTMLButtonElement | null = null;
  private dashRing: SVGCircleElement | null = null;
  private layer: HTMLDivElement;
  private markers = new Map<number, Marker>();
  private bossBar: HTMLDivElement | null = null;
  private bossFill: HTMLDivElement | null = null;
  private bossHearts: HTMLDivElement | null = null;
  private toasts: HTMLDivElement;
  private lastCan = -1;
  private lastBillsKey = '';
  private pp = { x: 0, y: 0, visible: true };

  selected: CropId | null;

  constructor(parent: HTMLElement, sim: Sim, on: HudHandlers) {
    this.sim = sim;
    this.el = h('div', 'hud');
    parent.appendChild(this.el);
    this.shownCoins = sim.coins;

    // ── top bar
    this.top = h('div', 'hud-top');
    const row = h('div', 'hud-row');
    this.coinsEl = h('div', 'pill coins', coinSvg(24));
    this.coinsNum = h('span', 'num', String(sim.coins));
    this.coinsEl.appendChild(this.coinsNum);
    row.appendChild(this.coinsEl);

    const lvl = h('div', 'pill level-pill', `<span class="lvl-id">${sim.level.id}</span><span class="lvl-title">${sim.level.title}</span>`);
    row.appendChild(lvl);

    if (sim.timed) {
      this.timerEl = h(
        'div',
        'timer',
        `<svg viewBox="0 0 36 36"><circle class="track" cx="18" cy="18" r="15"/><circle class="bar" cx="18" cy="18" r="15" stroke-dasharray="${RING_C}" stroke-dashoffset="0"/></svg><span class="t"></span><i class="par-star">${ICON.star}</i>`,
      );
      this.timerRing = this.timerEl.querySelector('.bar');
      this.timerText = this.timerEl.querySelector('.t');
      row.appendChild(this.timerEl);
    }
    const pause = h('button', 'round-btn pause-btn', ICON.pause);
    pause.setAttribute('aria-label', 'Pause');
    pause.addEventListener('click', () => on.pause());
    row.appendChild(pause);
    this.top.appendChild(row);

    const goals = h('div', 'goals');
    const g = sim.level.goals;
    (g.bills ?? []).forEach((amt, i) => {
      const b = h('button', 'goal bill', `<span class="bill-ico">${ICON.mail}</span><span class="amt">${coinSvg(15)}${amt}</span><span class="stamp">${ICON.check}</span>`);
      b.addEventListener('click', () => {
        if (i === this.sim.billsPaid) on.pay();
      });
      this.billEls.push(b);
      goals.appendChild(b);
    });
    if (g.order) {
      this.orderEl = h('div', 'goal order', `<img src="${icon(`veg:${g.order.crop}`)}" alt="">`);
      this.orderNum = h('span', 'amt', `0/${g.order.count}`);
      this.orderEl.appendChild(this.orderNum);
      goals.appendChild(this.orderEl);
    }
    if (g.perfect) {
      this.perfectEl = h('div', 'goal perfect', `<span class="spark">${ICON.sparkle}</span>`);
      this.perfectNum = h('span', 'amt', `0/${g.perfect}`);
      this.perfectEl.appendChild(this.perfectNum);
      goals.appendChild(this.perfectEl);
    }
    this.top.appendChild(goals);
    this.el.appendChild(this.top);

    // ── world-anchored layer (markers, floats, coach ring)
    this.layer = h('div', 'hud-layer');
    this.el.appendChild(this.layer);

    // ── bottom: tools + seed tray
    this.bottom = h('div', 'hud-bottom');
    const tools = h('div', 'tools');
    const can = h('div', 'can-meter');
    for (let i = 0; i < CAN_MAX; i++) {
      const d = h('div', 'drop', `${ICON.drop}<i class="fill">${ICON.drop}</i>`);
      this.drops.push(d);
      can.appendChild(d);
    }
    tools.appendChild(can);
    if (sim.companions.includes('tortoise')) {
      const c = COMPANIONS.tortoise;
      this.dashBtn = h(
        'button',
        'dash-btn',
        `<svg class="cd" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" stroke-dasharray="${RING_C}" stroke-dashoffset="0"/></svg><img src="${icon('tortoise')}" alt=""><span class="lbl">${c.ability}</span>`,
      );
      this.dashRing = this.dashBtn.querySelector('circle');
      this.dashBtn.addEventListener('click', () => on.dash());
      tools.appendChild(this.dashBtn);
    }
    this.bottom.appendChild(tools);

    const seeds = sim.level.seeds;
    this.selected = seeds[0] ?? null;
    if (seeds.length) {
      const tray = h('div', 'tray');
      for (const s of seeds) {
        const cd = CROPS[s];
        const card = h('button', 'seed', `<img src="${icon(`veg:${s}`)}" alt=""><span class="name">${cd.name}</span><span class="cost">${coinSvg(14)}${cd.seed}</span>`);
        card.style.setProperty('--accent', cd.color);
        card.addEventListener('click', () => {
          if (this.selected === s) this.showTip(s);
          else this.hideTip();
          on.select(s);
        });
        this.seedCards.set(s, card);
        tray.appendChild(card);
      }
      this.bottom.appendChild(tray);
    } else this.bottom.classList.add('no-tray');
    this.tip = h('div', 'seed-tip');
    this.bottom.appendChild(this.tip);
    this.el.appendChild(this.bottom);

    this.toasts = h('div', 'toasts');
    this.el.appendChild(this.toasts);

    this.setSelected(this.selected);
    requestAnimationFrame(() => this.el.classList.add('in'));
  }

  /** the safe area between HUD chrome where the garden is framed */
  insets() {
    const t = this.top.getBoundingClientRect();
    const b = this.bottom.getBoundingClientRect();
    return { top: t.bottom + 6, bottom: Math.max(0, window.innerHeight - b.top) + 4, left: 0, right: 0 };
  }

  setSelected(crop: CropId | null) {
    this.selected = crop;
    for (const [k, el] of this.seedCards) el.classList.toggle('sel', k === crop);
  }

  billRect(): DOMRect | null {
    const el = this.billEls[this.sim.billsPaid];
    return el ? el.getBoundingClientRect() : null;
  }

  private showTip(crop: CropId) {
    const c = CROPS[crop];
    const card = this.seedCards.get(crop)!;
    this.tip.innerHTML = `<b>${c.name}</b> <span class="fam">${c.family}</span><p>${c.blurb}</p><div class="stats"><span>${ICON.clock}${c.grow}s</span><span>${coinSvg(14)}${c.sell} each</span><span>×${c.harvests}</span></div>`;
    const br = this.bottom.getBoundingClientRect();
    const cr = card.getBoundingClientRect();
    this.tip.style.left = `${Math.max(12, Math.min(br.width - 232, cr.left - br.left + cr.width / 2 - 110))}px`;
    pulse(this.tip, 'show');
    this.tipTimer = 3.2;
  }

  hideTip() {
    this.tip.classList.remove('show');
    this.tipTimer = 0;
  }

  // ───────────────────────── reactions ─────────────────────────

  bumpCoins(gain: boolean) {
    pulse(this.coinsEl, gain ? 'bump' : 'dip');
  }

  bumpOrder() {
    if (this.orderEl) pulse(this.orderEl, 'bump');
  }

  bumpPerfect() {
    if (this.perfectEl) pulse(this.perfectEl, 'bump');
  }

  stampBill(i: number) {
    const b = this.billEls[i];
    if (b) pulse(b, 'stamped');
  }

  flashTimer() {
    if (this.timerEl) pulse(this.timerEl, 'bonus');
  }

  shakeCan() {
    pulse(this.drops[0].parentElement!, 'shake');
  }

  float(x: number, y: number, html: string, cls = '') {
    const f = h('div', `float ${cls}`, html);
    f.style.left = `${x}px`;
    f.style.top = `${y}px`;
    this.layer.appendChild(f);
    f.addEventListener('animationend', () => f.remove());
  }

  toast(title: string, sub = '', cls = '', img = '') {
    const t = h('div', `toast ${cls}`, `${img ? `<img src="${img}" alt="">` : ''}<div><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</div>`);
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 2) this.toasts.firstElementChild!.remove();
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 400);
    }, 2600);
  }

  showBoss() {
    if (this.bossBar) return;
    this.bossBar = h(
      'div',
      'boss-bar',
      `<img src="${icon('crowKing')}" alt=""><div class="bb-main"><div class="bb-name">The Crow King</div><div class="bb-track"><div class="bb-fill"></div></div></div><div class="bb-hearts"></div>`,
    );
    this.bossFill = this.bossBar.querySelector('.bb-fill');
    this.bossHearts = this.bossBar.querySelector('.bb-hearts');
    this.top.appendChild(this.bossBar);
  }

  bossHit() {
    if (this.bossBar) pulse(this.bossBar, 'hit');
  }

  // ───────────────────────── per frame ─────────────────────────

  update(dt: number, project: (id: number) => { x: number; y: number } | null) {
    const s = this.sim;

    // coins tween
    const diff = s.coins - this.shownCoins;
    if (Math.abs(diff) > 0.01) {
      this.shownCoins += diff * (1 - Math.exp(-dt * 12));
      if (Math.abs(s.coins - this.shownCoins) < 0.5) this.shownCoins = s.coins;
      this.coinsNum.textContent = String(Math.round(this.shownCoins));
    }

    // timer
    if (this.timerEl && this.timerRing && this.timerText) {
      const frac = s.timeMax ? s.timeLeft / s.timeMax : 0;
      this.timerRing.setAttribute('stroke-dashoffset', String(RING_C * (1 - frac)));
      const secs = Math.ceil(s.timeLeft);
      const txt = secs >= 60 ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : String(secs);
      if (this.timerText.textContent !== txt) this.timerText.textContent = txt;
      const elapsed = s.timeMax - s.timeLeft;
      this.timerEl.classList.toggle('par', elapsed <= (s.level.par ?? 0));
      this.timerEl.classList.toggle('low', s.timeLeft < 15 && s.status === 'playing');
    }

    // bills
    const key = `${s.billsPaid}|${s.canPay() ? 1 : 0}`;
    if (key !== this.lastBillsKey) {
      this.lastBillsKey = key;
      this.billEls.forEach((b, i) => {
        b.classList.toggle('paid', i < s.billsPaid);
        b.classList.toggle('next', i === s.billsPaid);
        b.classList.toggle('ready', i === s.billsPaid && s.canPay());
        b.classList.toggle('locked', i > s.billsPaid);
      });
    }
    const g = s.level.goals;
    if (this.orderNum && g.order) {
      const t = `${Math.min(s.orderCount, g.order.count)}/${g.order.count}`;
      if (this.orderNum.textContent !== t) this.orderNum.textContent = t;
      this.orderEl!.classList.toggle('done', s.orderCount >= g.order.count);
    }
    if (this.perfectNum && g.perfect) {
      const t = `${Math.min(s.perfects, g.perfect)}/${g.perfect}`;
      if (this.perfectNum.textContent !== t) this.perfectNum.textContent = t;
      this.perfectEl!.classList.toggle('done', s.perfects >= g.perfect);
    }

    // seeds
    for (const [k, el] of this.seedCards) el.classList.toggle('poor', s.coins < CROPS[k].seed);
    if (this.tipTimer > 0) {
      this.tipTimer -= dt;
      if (this.tipTimer <= 0) this.hideTip();
    }

    // can
    const canKey = s.can + s.canTimer;
    if (canKey !== this.lastCan) {
      this.lastCan = canKey;
      const refill = s.can < CAN_MAX ? s.canTimer / CAN_REFILL : 0;
      this.drops.forEach((d, i) => {
        const f = i < s.can ? 1 : i === s.can ? refill : 0;
        d.style.setProperty('--f', f.toFixed(3));
        d.classList.toggle('full', i < s.can);
      });
    }

    // dash
    if (this.dashBtn && this.dashRing) {
      const cd = s.dashCd / COMPANIONS.tortoise.cooldown;
      this.dashRing.setAttribute('stroke-dashoffset', String(RING_C * cd));
      const ready = s.dashCd <= 0;
      this.dashBtn.classList.toggle('ready', ready);
      this.dashBtn.classList.toggle('cooling', !ready);
    }

    // critter markers
    for (const m of this.markers.values()) m.seen = false;
    for (const c of s.critters) {
      if (c.phase === 'flee') continue;
      const p = project(c.id);
      if (!p) continue;
      let m = this.markers.get(c.id);
      if (!m) {
        const el = h(
          'div',
          `critter-mark ${c.type}`,
          `<svg viewBox="0 0 36 36"><circle class="track" cx="18" cy="18" r="15"/><circle class="bar" cx="18" cy="18" r="15" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"/></svg><div class="pips"></div>`,
        );
        m = { el, ring: el.querySelector('.bar')!, pips: el.querySelector('.pips')!, hp: -1, seen: true };
        this.layer.appendChild(el);
        this.markers.set(c.id, m);
      }
      m.seen = true;
      m.el.style.transform = `translate(${p.x}px, ${p.y - 34}px)`;
      m.el.classList.toggle('eating', c.phase === 'eat');
      const eat = c.phase === 'eat' && c.eatTime > 0 ? Math.min(1, c.eatT / c.eatTime) : 0;
      m.ring.setAttribute('stroke-dashoffset', String(RING_C * (1 - eat)));
      m.el.classList.toggle('danger', eat > 0.6);
      const hp = Math.ceil(c.hp);
      if (hp !== m.hp) {
        m.hp = hp;
        const pips = Math.ceil(c.maxHp / 1.5);
        const left = Math.ceil(c.hp / 1.5);
        m.pips.innerHTML = Array.from({ length: pips }, (_, i) => `<i class="${i < left ? 'on' : ''}"></i>`).join('');
      }
    }
    for (const [id, m] of this.markers) {
      if (!m.seen) {
        m.el.classList.add('gone');
        setTimeout(() => m.el.remove(), 300);
        this.markers.delete(id);
      }
    }

    // boss
    if (this.bossBar && s.boss && this.bossFill && this.bossHearts) {
      this.bossFill.style.width = `${(Math.max(0, s.boss.hp) / s.boss.maxHp) * 100}%`;
      const lives = 3 - s.boss.plantsLost;
      const hk = String(lives);
      if (this.bossHearts.dataset.k !== hk) {
        this.bossHearts.dataset.k = hk;
        this.bossHearts.innerHTML = [0, 1, 2].map((i) => `<i class="${i < lives ? 'on' : ''}">${ICON.leaf}</i>`).join('');
      }
      this.bossBar.classList.toggle('perched', s.boss.phase === 'perch');
    }
    void this.pp;
  }

  dispose() {
    this.el.remove();
  }
}
