import * as THREE from 'three';
import { sfx } from '../audio/audio';
import { CROPS, type CropId } from '../data/crops';
import type { CoachStep, LevelDef } from '../data/levels';
import { icon } from '../render/icons';
import { GameView } from '../render/gameView';
import type { Stage } from '../render/scene';
import { Sim, type StarResult } from '../sim/sim';
import { COMBO_BRIEFS, COMBO_NAMES, type LoseReason, type SimEvent } from '../sim/types';
import { CoachUi } from '../ui/coach';
import { Hud } from '../ui/hud';
import { coinSvg } from '../ui/svg';

export interface EndResult {
  level: LevelDef;
  won: boolean;
  reason: LoseReason | null;
  stars: StarResult;
  flags: boolean[];
  time: number;
  caught: number;
  bestChain: number;
  bestPerfect: number;
  earned: number;
}

export interface GameHooks {
  onEnd(r: EndResult): void;
  onPause(): void;
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * One playable level: owns the Sim, its 3D view and HUD, routes input, runs Granny's
 * tutorial script, controls time-scale (freeze / bullet-time) and turns sim events into juice.
 */
export class Game {
  readonly sim: Sim;
  readonly view: GameView;
  readonly hud: Hud;
  readonly coach: CoachUi;
  paused = false;

  private stage: Stage;
  private hooks: GameHooks;
  private canvas: HTMLCanvasElement;
  ended = false;
  private endTimer = -1;
  private drag: { id: number; x: number; y: number } | null = null;

  private coachIdx = 0;
  private coachCount = 0;
  private coachActive = false;
  private coachTimer = 0;
  private sayTimer = 0;
  private scale = 1;
  private pp = { x: 0, y: 0, visible: true };

  constructor(stage: Stage, ui: HTMLElement, level: LevelDef, hooks: GameHooks, seed = (Math.random() * 1e9) | 0) {
    this.stage = stage;
    this.hooks = hooks;
    this.canvas = stage.renderer.domElement;
    this.sim = new Sim(level, seed);
    this.view = new GameView(stage, this.sim);
    stage.world.add(this.view.root);
    stage.setOrbit(0);

    this.hud = new Hud(ui, this.sim, {
      pause: () => {
        sfx.ui();
        hooks.onPause();
      },
      select: (c) => this.select(c),
      pay: () => this.pay(),
      dash: () => this.dash(),
    });
    this.coach = new CoachUi(ui);

    stage.setFit(this.view.fitPoints(), true);
    this.layout(true);
    // fonts & images settle a frame or two later
    requestAnimationFrame(() => this.layout(true));
    setTimeout(() => this.layout(false), 350);

    this.canvas.addEventListener('pointerdown', this.onDown);
    this.canvas.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
  }

  layout(snap = false) {
    this.stage.setInsets(this.hud.insets(), snap);
  }

  // ───────────────────────── input ─────────────────────────

  private onDown = (e: PointerEvent) => {
    if (this.paused || this.ended) return;
    e.preventDefault();
    sfx.unlock();
    this.hud.hideTip();
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    const p = this.view.pick(e.clientX, e.clientY);
    if (!p) return;
    switch (p.kind) {
      case 'veggie':
        this.sim.catchVeggie(p.id);
        break;
      case 'critter':
        this.sim.hitCritter(p.id);
        break;
      case 'boss':
        this.sim.hitBoss();
        break;
      case 'tile':
        this.tileAction(p.i);
        break;
    }
    this.flush();
  };

  private onMove = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.id || this.paused || this.ended) return;
    // swipe-catch along the whole segment so fast flicks don't skip veggies
    const { x: x0, y: y0 } = this.drag;
    const x1 = e.clientX;
    const y1 = e.clientY;
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 18));
    const r = Math.max(36, this.stage.pixelScale(v3(0, 0, 0)) * 0.34);
    let any = false;
    for (let k = 1; k <= steps; k++) {
      const x = x0 + ((x1 - x0) * k) / steps;
      const y = y0 + ((y1 - y0) * k) / steps;
      for (const id of this.view.veggiesNear(x, y, r)) any = this.sim.catchVeggie(id) || any;
    }
    this.drag.x = x1;
    this.drag.y = y1;
    if (any) this.flush();
  };

  private onUp = (e: PointerEvent) => {
    if (this.drag && e.pointerId === this.drag.id) this.drag = null;
  };

  private tileAction(i: number) {
    const s = this.sim;
    const t = s.tiles[i];
    if (t.rock > 0) s.digRock(i);
    else if (t.weed) s.tapWeed(i);
    else if (t.plant) {
      const eater = t.plant.eatenBy ? s.critters.find((c) => c.id === t.plant!.eatenBy && c.phase !== 'flee') : null;
      if (eater) s.hitCritter(eater.id);
      else s.water(i);
    } else if (!this.hud.selected) {
      if (s.level.seeds.length) this.say('pick', i);
    } else s.plant(i, this.hud.selected);
  }

  select(c: CropId) {
    sfx.select();
    this.hud.setSelected(c);
  }

  pay() {
    if (this.paused || this.ended) return;
    if (!this.sim.payBill()) {
      const r = this.hud.billRect();
      const need = this.sim.nextBill();
      if (r && need !== null) this.hud.float(r.left + r.width / 2, r.bottom + 18, `Need ${coinSvg(16)}${need}`, 'warn small');
      sfx.fail();
    }
    this.flush();
  }

  dash() {
    if (this.paused || this.ended) return;
    if (!this.sim.dash()) sfx.fail();
    this.flush();
  }

  // ───────────────────────── coach ─────────────────────────

  private step(): CoachStep | null {
    return this.sim.level.coach?.[this.coachIdx] ?? null;
  }

  private ready(st: CoachStep): boolean {
    const s = this.sim;
    switch (st.until) {
      case 'catch':
        return s.veggies.some((v) => v.phase === 'roll' && v.kind === 'veggie');
      case 'plant': {
        const cheapest = Math.min(...s.level.seeds.map((c) => CROPS[c].seed));
        return s.coins >= cheapest && s.tiles.some((t) => t.rock >= 0 && s.isEmpty(t));
      }
      case 'water':
        return s.tiles.some((t) => t.plant && t.moisture < 0.86);
      case 'pay':
        return s.canPay();
      case 'hush':
        return s.critters.length > 0;
      default:
        return true;
    }
  }

  private target(st: CoachStep): { x: number; y: number; r: number } | null {
    const s = this.sim;
    const unit = this.stage.pixelScale(v3(0, 0, 0));
    const at = (w: THREE.Vector3 | null, r: number) => {
      if (!w) return null;
      const p = this.stage.project(w, this.pp);
      return { x: p.x, y: p.y, r };
    };
    switch (st.ring) {
      case 'veggie': {
        const v = s.veggies.find((q) => q.phase === 'roll' && q.kind === 'veggie') ?? s.veggies[0];
        return v ? at(this.view.veggieWorld(v.id), unit * 0.34) : null;
      }
      case 'emptyPlot': {
        const empties = s.tiles.filter((t) => t.rock >= 0 && s.isEmpty(t));
        if (!empties.length) return null;
        empties.sort((a, b) => Math.abs(a.x) + Math.abs(a.z) * 0.5 - (Math.abs(b.x) + Math.abs(b.z) * 0.5));
        return at(this.view.tileWorld(empties[0].i, 0.25), unit * 0.5);
      }
      case 'thirstyPlot': {
        const pl = s.tiles.filter((t) => t.plant).sort((a, b) => a.moisture - b.moisture)[0];
        return pl ? at(this.view.tileWorld(pl.i, 0.45), unit * 0.52) : null;
      }
      case 'critter': {
        const c = s.critters[0];
        return c ? at(this.view.critterWorld(c.id), unit * 0.4) : null;
      }
      case 'bill': {
        const r = this.hud.billRect();
        return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.max(r.width, r.height) * 0.62 } : null;
      }
      default:
        return null;
    }
  }

  private advanceCoach() {
    this.coachIdx++;
    this.coachActive = false;
    this.coachCount = 0;
    this.coach.hideRing();
    if (!this.step()) this.coach.hide();
  }

  private countCoach(kind: CoachStep['until']) {
    const st = this.step();
    if (!st || !this.coachActive || st.until !== kind) return;
    this.coachCount++;
    if (this.coachCount >= (st.count ?? 1)) this.advanceCoach();
  }

  private runCoach(dt: number) {
    this.scale = 1;
    const st = this.step();
    if (!st || this.ended) {
      this.coach.hideRing();
      return;
    }
    if (!this.coachActive) {
      if (!this.ready(st)) {
        if (this.coach.visible && this.sayTimer <= 0) this.coach.hide();
        return;
      }
      this.coachActive = true;
      this.coachCount = 0;
      this.coachTimer = 0;
      this.sayTimer = 0;
      this.coach.say(st.say, st.until === 'next' ? () => this.advanceCoach() : null);
      if (st.until === 'next') sfx.ui();
    }
    this.coachTimer += dt;
    if (st.until === 'next') {
      this.scale = 0;
      return;
    }
    if (st.until === 'goal' && this.coachTimer > 6) {
      this.advanceCoach();
      return;
    }
    const tg = st.ring ? this.target(st) : null;
    if (tg) {
      this.coach.ringAt(tg.x, tg.y, tg.r);
      if (st.freeze) this.scale = st.ring === 'veggie' ? 0.12 : 0;
    } else this.coach.hideRing();
  }

  // ───────────────────────── frame ─────────────────────────

  update(dt: number) {
    if (this.paused) return;
    this.runCoach(dt);
    this.coach.update(dt);
    if (this.sayTimer > 0) {
      this.sayTimer -= dt;
      if (this.sayTimer <= 0 && !this.coachActive) this.coach.hide();
    }

    this.sim.step(Math.min(dt, 1 / 20) * this.scale);
    this.flush();
    this.view.update(dt * (this.scale === 0 ? 0.35 : Math.max(this.scale, 0.35)));
    this.hud.update(dt, (id) => {
      const w = this.view.critterWorld(id);
      return w ? this.stage.project(w, { x: 0, y: 0, visible: true }) : null;
    });

    if (this.endTimer > 0) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.finish();
    }
  }

  private finish() {
    const s = this.sim;
    const stars = s.stars();
    this.hooks.onEnd({
      level: s.level,
      won: s.status === 'won',
      reason: s.loseReason,
      stars,
      flags: [stars.finish, stars.par, stars.noLoss, stars.bonus],
      time: s.timed ? s.timeMax - s.timeLeft : s.t,
      caught: s.caught,
      bestChain: s.bestChain,
      bestPerfect: s.bestPerfect,
      earned: s.coinsEarned,
    });
  }

  /** drain sim events into the view, sound and HUD */
  private flush() {
    const ev = this.sim.drainEvents();
    if (!ev.length) return;
    this.view.handle(ev);
    for (const e of ev) this.react(e);
  }

  private screen(x: number, y: number, z: number) {
    const p = this.stage.project(v3(x, y, z), this.pp);
    return { x: p.x, y: p.y };
  }

  private tileScreen(i: number, y = 0.7) {
    const w = this.view.tileWorld(i, y);
    return this.screen(w.x, w.y, w.z);
  }

  private say(kind: 'pick', tile: number) {
    const p = this.tileScreen(tile);
    if (kind === 'pick') this.hud.float(p.x, p.y, 'Pick a seed below', 'warn small');
    sfx.fail();
  }

  private react(e: SimEvent) {
    const s = this.sim;
    switch (e.type) {
      case 'plant': {
        sfx.plant();
        const p = this.tileScreen(e.tile, 0.5);
        this.hud.float(p.x, p.y, `−${e.cost}`, 'spend small');
        this.hud.bumpCoins(false);
        this.countCoach('plant');
        break;
      }
      case 'water':
        sfx.water();
        this.countCoach('water');
        break;
      case 'pop':
        sfx.pop();
        break;
      case 'ripe':
        sfx.ripe();
        break;
      case 'catch': {
        if (e.kind === 'clock') break;
        sfx.catchV(e.chain, e.perfect, e.golden);
        setTimeout(() => sfx.coin(), 90);
        const p = this.screen(e.x, e.y + 0.3, e.z);
        const tags: string[] = [];
        if (e.golden) tags.push('<em class="gold">Golden!</em>');
        else if (e.perfect) tags.push('<em>Perfect!</em>');
        if (e.chain >= 2) tags.push(`<em class="chain">Chain ×${e.chain}</em>`);
        if (e.by === 'tortoise') tags.push('<em class="turtle">Saved!</em>');
        this.hud.float(p.x, p.y, `<b>+${e.coins}</b>${tags.join('')}`, `gain${e.golden ? ' golden' : e.perfect ? ' perfect' : ''}`);
        this.hud.bumpCoins(true);
        if (e.perfect && s.level.goals.perfect) this.hud.bumpPerfect();
        if (e.by === 'player') this.countCoach('catch');
        break;
      }
      case 'miss': {
        sfx.miss();
        const p = this.screen(e.x, 0.4, e.z);
        this.hud.float(p.x, p.y, 'Missed', 'miss small');
        break;
      }
      case 'plantLost': {
        sfx.lostPlant();
        const p = this.tileScreen(e.tile, 0.8);
        this.hud.float(p.x, p.y, e.cause === 'rot' ? 'Rotted!' : 'Eaten!', 'bad');
        break;
      }
      case 'critterSpawn':
        if (e.critter === 'crow') sfx.caw();
        else sfx.hop();
        break;
      case 'critterHit':
        sfx.hit();
        this.stage.shake(0.02);
        break;
      case 'critterFlee':
        if (e.shooed) {
          sfx.shoo();
          const w = this.view.critterWorld(e.id);
          if (w) {
            const p = this.stage.project(w, this.pp);
            this.hud.float(p.x, p.y - 20, 'Shoo!', 'shoo');
          }
          this.countCoach('hush');
        }
        break;
      case 'weedTap':
        sfx.weed();
        break;
      case 'weedPulled': {
        sfx.weed();
        const p = this.tileScreen(e.tile, 0.5);
        this.hud.float(p.x, p.y, e.cost ? `Pulled! −${e.cost}` : 'Pulled!', 'small');
        if (e.cost) this.hud.bumpCoins(false);
        break;
      }
      case 'rockHit': {
        sfx.dig();
        if (e.left === 0) {
          const p = this.tileScreen(e.tile, 0.4);
          this.hud.float(p.x, p.y, 'Cleared!', 'small');
        }
        break;
      }
      case 'pay':
        sfx.pay();
        this.hud.stampBill(e.index);
        this.hud.bumpCoins(false);
        this.countCoach('pay');
        break;
      case 'orderStep':
        this.hud.bumpOrder();
        break;
      case 'combo':
        sfx.combo();
        this.hud.toast(COMBO_NAMES[e.key], COMBO_BRIEFS[e.key], 'combo');
        break;
      case 'goalsMet':
        if (s.level.boss) {
          sfx.goals();
          this.hud.toast('Bills paid!', 'Now protect the garden…', 'good');
        }
        break;
      case 'bossStart':
        setTimeout(() => sfx.boss(), 500);
        this.hud.showBoss();
        this.hud.toast('The Crow King!', 'Tap him while he perches', 'boss', icon('crowKing'));
        if (s.level.bossLine) {
          this.coach.say(s.level.bossLine.replace(/^Boss:\s*(.)/, (_, c: string) => c.toUpperCase()));
          this.sayTimer = 7;
        }
        this.layout(false);
        break;
      case 'bossPhase':
        if (e.phase === 'perch') sfx.ripe();
        else if (e.phase === 'rise' || e.phase === 'swoop') sfx.caw();
        break;
      case 'bossHit': {
        sfx.bossHit();
        this.hud.bossHit();
        const w = this.view.bossWorld();
        if (w) {
          const p = this.stage.project(w, this.pp);
          this.hud.float(p.x, p.y - 30, 'Bonk!', 'shoo');
        }
        break;
      }
      case 'bossBlocked': {
        sfx.fail();
        const w = this.view.bossWorld();
        if (w) {
          const p = this.stage.project(w, this.pp);
          this.hud.float(p.x, p.y - 30, 'Wait till he perches!', 'warn small');
        }
        break;
      }
      case 'bossCall':
        sfx.caw();
        break;
      case 'clockBonus': {
        sfx.clock();
        const p = this.screen(e.x, 0.6, e.z);
        this.hud.float(p.x, p.y, '<b>+10s</b>', 'time');
        this.hud.flashTimer();
        break;
      }
      case 'dash': {
        sfx.dash();
        if (this.view.tortoise) {
          const p = this.stage.project(this.view.tortoise.position.clone().add(v3(0, 0.6, 0)), this.pp);
          this.hud.float(p.x + 30, p.y, e.count ? `Shell Dash ×${e.count}` : 'Shell Dash!', 'turtle');
        }
        break;
      }
      case 'fail': {
        if (e.reason === 'blocked') break;
        const p = e.tile !== undefined ? this.tileScreen(e.tile) : { x: innerWidth / 2, y: innerHeight / 2 };
        if (e.reason === 'coins') {
          const t = e.tile !== undefined ? s.tiles[e.tile] : null;
          const need = t?.weed ? 3 : this.hud.selected ? CROPS[this.hud.selected].seed : 0;
          this.hud.float(p.x, p.y, `Need ${coinSvg(16)}${need}`, 'warn small');
          this.hud.bumpCoins(false);
          sfx.fail();
        } else if (e.reason === 'can') {
          this.hud.float(p.x, p.y, 'The can is empty!', 'warn small');
          this.hud.shakeCan();
          sfx.fail();
        } else if (e.reason === 'notThirsty') {
          this.hud.float(p.x, p.y, 'Not thirsty yet', 'small soft');
          sfx.ui();
        } else if (e.reason === 'noSeed') this.say('pick', e.tile ?? 0);
        break;
      }
      case 'won':
        this.ended = true;
        this.drag = null;
        this.coach.hide();
        this.coach.hideRing();
        sfx.win();
        this.endTimer = 1.9;
        break;
      case 'lost':
        this.ended = true;
        this.drag = null;
        this.coach.hide();
        this.coach.hideRing();
        sfx.lose();
        this.endTimer = 1.3;
        break;
      default:
        break;
    }
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    this.stage.world.remove(this.view.root);
    this.view.dispose();
    this.hud.dispose();
    this.coach.dispose();
  }
}
