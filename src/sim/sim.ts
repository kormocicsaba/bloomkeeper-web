import { CROPS, regrowStart, type CropId } from '../data/crops';
import type { LevelDef } from '../data/levels';
import { COMPANIONS, CRITTERS, SOILS, TOOL_DAMAGE, type CompanionId, type CritterId, type SoilId } from '../data/world';
import { Rng } from './rng';
import { evaluateSynergy, neighbours } from './synergy';
import {
  PITCH, type Boss, type ComboKey, type ComboLink, type Critter, type FailReason, type LoseReason, type Plant,
  type SimEvent, type Tile, type Veggie,
} from './types';

export const CAN_MAX = 5;
export const CAN_REFILL = 1.55;
const DRINK_SCALE = 0.62;
const POP_DUR = 0.55;
const ROLL_SPEED = 2.1;
const LANE_TIME = 4.6;
const CHAIN_WINDOW = 3;
const WILT_YELLOW = 5;
const WILT_ROT = 10;
const THIRSTY_AT = 0.28;
const TORTOISE_SAVE_CD = 9;

export type SimStatus = 'playing' | 'boss' | 'won' | 'lost';

export interface StarResult {
  finish: boolean;
  par: boolean;
  noLoss: boolean;
  bonus: boolean;
}

export class Sim {
  readonly level: LevelDef;
  readonly cols: number;
  readonly rows: number;
  readonly tiles: Tile[] = [];
  readonly rng: Rng;
  readonly companions: CompanionId[];

  t = 0;
  timeLeft: number;
  timeMax: number;
  status: SimStatus = 'playing';
  loseReason: LoseReason | null = null;
  coins: number;
  coinsEarned = 0;

  can = CAN_MAX;
  canTimer = 0;

  veggies: Veggie[] = [];
  critters: Critter[] = [];
  boss: Boss | null = null;
  links: ComboLink[] = [];
  combosSeen = new Set<ComboKey>();

  billsPaid = 0;
  orderCount = 0;
  perfects = 0;

  // stats
  plantsLost = 0;
  missed = 0;
  caught = 0;
  perfectStreak = 0;
  bestPerfect = 0;
  chain = 0;
  bestChain = 0;
  lastCatchCrop: CropId | null = null;
  lastCatchT = -99;
  clocksSpawned = 0;
  perfectsSinceClock = 0;
  harvests = 0;

  tortoiseSaveCd = 0;
  dashCd = 0;

  events: SimEvent[] = [];

  private nextId = 1;
  private synergyTimer = 0;
  private waves: { type: CritterId; next: number; interval: number; max: number }[] = [];
  private weedNext = Infinity;
  private goalsAnnounced = false;

  readonly frontZ: number;
  readonly backZ: number;
  readonly laneZ: number;
  readonly halfW: number;

  constructor(level: LevelDef, seed = 1, companions?: CompanionId[]) {
    this.level = level;
    this.rng = new Rng(seed);
    this.rows = level.garden.length;
    this.cols = level.garden[0].length;
    this.coins = level.startCoins ?? 0;
    this.timeMax = level.time ?? 0;
    this.timeLeft = this.timeMax;
    this.companions = companions ?? level.companions ?? [];
    this.halfW = (this.cols * PITCH) / 2;
    this.frontZ = ((this.rows - 1) / 2) * PITCH + PITCH / 2;
    this.backZ = -this.frontZ;
    this.laneZ = this.frontZ + 0.82;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const ch = level.garden[r][c];
        const soil: SoilId = ch === 's' ? 'sandy' : ch === 'c' ? 'clay' : 'loam';
        this.tiles.push({
          i: r * this.cols + c, c, r,
          x: (c - (this.cols - 1) / 2) * PITCH,
          z: (r - (this.rows - 1) / 2) * PITCH,
          soil,
          rock: ch === 'r' ? 3 : 0,
          moisture: 0.5 + this.rng.range(-0.05, 0.1),
          plant: null, weed: null, smothered: false,
        });
        if (ch === '#') this.tiles[this.tiles.length - 1].rock = -1;
      }
    }

    for (const s of level.starters) {
      const want = s.soil === 's' ? 'sandy' : s.soil === 'c' ? 'clay' : null;
      let pool = this.tiles.filter((t) => this.isEmpty(t) && (!want || t.soil === want));
      if (!want) {
        const loam = pool.filter((t) => t.soil === 'loam');
        if (loam.length) pool = loam;
      }
      // prefer back rows so the first veggies have a long, readable roll
      if (!pool.length) continue;
      pool.sort((a, b) => a.r - b.r + this.rng.range(-1.2, 1.2));
      const t = pool[Math.min(pool.length - 1, this.rng.int(Math.max(1, Math.ceil(pool.length / 2))))];
      const p = this.makePlant(s.crop, t.i);
      p.growth = s.growth ?? 0.5;
      t.moisture = s.moisture ?? 0.85;
      t.plant = p;
    }

    for (const w of level.critters ?? []) this.waves.push({ type: w.type, next: w.firstAt, interval: w.interval, max: w.max });
    if (level.weeds) this.weedNext = level.weeds.firstAt;
    this.refreshSynergy(true);
  }

  // ───────────────────────── queries ─────────────────────────

  get timed(): boolean {
    return this.level.time !== null && this.level.time > 0;
  }

  isEmpty(t: Tile): boolean {
    return !t.plant && !t.weed && t.rock === 0;
  }

  isPlot(i: number): boolean {
    return this.tiles[i].rock >= 0;
  }

  bills(): number[] {
    return this.level.goals.bills ?? [];
  }

  nextBill(): number | null {
    const b = this.bills();
    return this.billsPaid < b.length ? b[this.billsPaid] : null;
  }

  canPay(): boolean {
    const n = this.nextBill();
    return n !== null && this.coins >= n && (this.status === 'playing');
  }

  goalsDone(): boolean {
    const g = this.level.goals;
    if (g.bills && this.billsPaid < g.bills.length) return false;
    if (g.order && this.orderCount < g.order.count) return false;
    if (g.perfect && this.perfects < g.perfect) return false;
    return true;
  }

  progress(): number {
    const g = this.level.goals;
    const parts: number[] = [];
    if (g.bills) {
      const total = g.bills.reduce((a, b) => a + b, 0);
      const paid = g.bills.slice(0, this.billsPaid).reduce((a, b) => a + b, 0);
      parts.push(paid / total);
    }
    if (g.order) parts.push(Math.min(1, this.orderCount / g.order.count));
    if (g.perfect) parts.push(Math.min(1, this.perfects / g.perfect));
    if (!parts.length) return 0;
    return parts.reduce((a, b) => a + b, 0) / parts.length;
  }

  stars(): StarResult {
    const won = this.status === 'won';
    const par = this.level.par ?? 0;
    const limit = this.level.time ?? 0;
    return {
      finish: won,
      par: won && (!this.timed || this.timeLeft >= limit - par),
      noLoss: won && this.plantsLost === 0 && this.missed === 0,
      bonus: won && (this.level.bonus === 'chain5' ? this.bestChain >= 5 : this.bestPerfect >= 5),
    };
  }

  // ───────────────────────── actions ─────────────────────────

  plant(i: number, crop: CropId): boolean {
    if (this.status === 'won' || this.status === 'lost') return false;
    const t = this.tiles[i];
    if (!this.isEmpty(t)) return this.fail('blocked', i);
    if (!this.level.seeds.includes(crop)) return this.fail('noSeed', i);
    const cost = CROPS[crop].seed;
    if (this.coins < cost) return this.fail('coins', i);
    this.coins -= cost;
    t.plant = this.makePlant(crop, i);
    t.moisture = Math.max(t.moisture, 0.72);
    this.emit({ type: 'plant', tile: i, crop, cost });
    this.refreshSynergy();
    return true;
  }

  water(i: number): boolean {
    if (this.status === 'won' || this.status === 'lost') return false;
    const t = this.tiles[i];
    if (!t.plant) return this.fail('blocked', i);
    if (t.moisture > 0.86 && t.plant.mood === 'ok') return this.fail('notThirsty', i);
    if (this.can < 1) return this.fail('can', i);
    this.can -= 1;
    t.moisture = 1;
    t.plant.dryTime = 0;
    this.setMood(t, 'ok');
    this.emit({ type: 'water', tile: i });
    return true;
  }

  catchVeggie(id: number, by: 'player' | 'tortoise' = 'player'): boolean {
    const idx = this.veggies.findIndex((v) => v.id === id);
    if (idx < 0) return false;
    const v = this.veggies[idx];
    this.veggies.splice(idx, 1);

    if (v.kind === 'clock') {
      this.timeLeft += 10;
      this.emit({ type: 'catch', id, x: v.x, y: v.y, z: v.z, coins: 0, perfect: false, chain: 0, golden: false, crop: v.crop, kind: 'clock', by, mult: 1 });
      return true;
    }

    const rolling = v.phase !== 'lane';
    const perfect = rolling && by === 'player';
    let mult = 1;
    if (rolling) {
      const total = v.popDur + v.rollDur;
      mult = 1.5 - 0.5 * Math.min(1, v.age / total);
    }
    if (by === 'player') {
      if (this.lastCatchCrop === v.crop && this.t - this.lastCatchT <= CHAIN_WINDOW) this.chain += 1;
      else this.chain = 1;
      this.lastCatchCrop = v.crop;
      this.lastCatchT = this.t;
      this.bestChain = Math.max(this.bestChain, this.chain);
    }
    const chainMult = by !== 'player' ? 1 : this.chain >= 5 ? 1.5 : this.chain >= 3 ? 1.25 : this.chain >= 2 ? 1.1 : 1;
    const coins = Math.max(1, Math.round(v.base * mult * chainMult * (v.golden ? 3 : 1)));
    this.coins += coins;
    this.coinsEarned += coins;
    this.caught += 1;

    if (perfect) {
      this.perfects += 1;
      this.perfectStreak += 1;
      this.bestPerfect = Math.max(this.bestPerfect, this.perfectStreak);
      this.perfectsSinceClock += 1;
    } else if (by === 'player') {
      this.perfectStreak = 0;
    }

    const g = this.level.goals;
    if (g.order && g.order.crop === v.crop && this.orderCount < g.order.count) {
      this.orderCount += 1;
      this.emit({ type: 'orderStep', count: this.orderCount, need: g.order.count });
    }

    this.emit({ type: 'catch', id, x: v.x, y: v.y, z: v.z, coins, perfect, chain: by === 'player' ? this.chain : 0, golden: v.golden, crop: v.crop, kind: 'veggie', by, mult: mult * chainMult });

    // Clock flower: 8% on a Perfect, guaranteed after 15 dry Perfects or on a 5-chain, max 2 per level
    if (perfect && this.timed && this.clocksSpawned < 2 && this.status === 'playing') {
      if (this.rng.chance(0.08) || this.perfectsSinceClock >= 15 || this.chain === 5) {
        this.clocksSpawned += 1;
        this.perfectsSinceClock = 0;
        this.spawnClock(v.x, v.z);
      }
    }
    return true;
  }

  hitCritter(id: number): boolean {
    const c = this.critters.find((k) => k.id === id);
    if (!c || c.phase === 'flee') return false;
    c.hp -= TOOL_DAMAGE;
    c.hitFlash = 1;
    if (c.phase === 'eat') c.eatT = Math.max(0, c.eatT - 0.7);
    if (c.hp <= 0.001) {
      this.flee(c, true);
    } else {
      this.emit({ type: 'critterHit', id, hp: c.hp, x: c.x, y: c.y, z: c.z });
    }
    return true;
  }

  hitBoss(): boolean {
    const b = this.boss;
    if (!b || b.phase === 'defeated') return false;
    if (b.phase !== 'perch') {
      this.emit({ type: 'bossBlocked' });
      return false;
    }
    b.hp -= TOOL_DAMAGE;
    b.hitFlash = 1;
    this.emit({ type: 'bossHit', hp: b.hp });
    if (b.hp <= 0.001) {
      b.hp = 0;
      this.setBossPhase('defeated', 2.2);
      b.fx = b.x; b.fy = b.y; b.fz = b.z;
      b.tx = b.x + 6; b.ty = 8; b.tz = b.z - 6;
      for (const c of this.critters) if (c.phase !== 'flee') this.flee(c, true);
    } else if (b.t > b.dur - 0.6) {
      b.dur += 0.4; // stagger
    }
    return true;
  }

  tapWeed(i: number): boolean {
    const t = this.tiles[i];
    const w = t.weed;
    if (!w) return false;
    if (w.growth < 1) {
      t.weed = null;
      this.emit({ type: 'weedPulled', tile: i, cost: 0 });
      this.refreshSmother();
      return true;
    }
    const cost = 3;
    if (w.taps <= 1 && this.coins < cost) return this.fail('coins', i);
    w.taps -= 1;
    if (w.taps <= 0) {
      this.coins -= cost;
      t.weed = null;
      this.emit({ type: 'weedPulled', tile: i, cost });
      this.refreshSmother();
    } else {
      this.emit({ type: 'weedTap', tile: i });
    }
    return true;
  }

  digRock(i: number): boolean {
    const t = this.tiles[i];
    if (t.rock <= 0) return false;
    t.rock -= 1;
    if (t.rock === 0) t.moisture = 0.5;
    this.emit({ type: 'rockHit', tile: i, left: t.rock });
    return true;
  }

  payBill(): boolean {
    if (!this.canPay()) return false;
    const amount = this.nextBill()!;
    this.coins -= amount;
    this.emit({ type: 'pay', index: this.billsPaid, amount });
    this.billsPaid += 1;
    return true;
  }

  dash(): boolean {
    if (!this.companions.includes('tortoise') || this.dashCd > 0) return false;
    if (this.status !== 'playing' && this.status !== 'boss') return false;
    const lane = this.veggies.filter((v) => v.phase === 'lane' || (v.phase === 'roll' && v.z > this.frontZ - 0.2));
    for (const v of lane) this.catchVeggie(v.id, 'tortoise');
    this.dashCd = COMPANIONS.tortoise.cooldown;
    this.emit({ type: 'dash', count: lane.length });
    return true;
  }

  // ───────────────────────── tick ─────────────────────────

  step(dt: number): void {
    if (this.status === 'won' || this.status === 'lost') {
      this.tickVeggies(dt, true);
      this.tickCritters(dt);
      if (this.boss) this.tickBoss(dt);
      return;
    }
    this.t += dt;

    if (this.timed && this.status === 'playing') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.lose('time');
        return;
      }
    }

    // watering can
    if (this.can < CAN_MAX) {
      this.canTimer += dt;
      if (this.canTimer >= CAN_REFILL) {
        this.canTimer -= CAN_REFILL;
        this.can += 1;
        this.emit({ type: 'canRefill', charges: this.can });
      }
    } else this.canTimer = 0;

    this.tortoiseSaveCd = Math.max(0, this.tortoiseSaveCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);

    this.synergyTimer -= dt;
    if (this.synergyTimer <= 0) {
      this.synergyTimer = 0.4;
      this.refreshSynergy();
    }

    this.tickTiles(dt);
    this.tickVeggies(dt, false);
    if (this.status === 'playing') this.tickWaves();
    this.tickWeeds(dt);
    this.tickCritters(dt);
    if (this.boss) this.tickBoss(dt);

    if (this.status === 'playing' && this.goalsDone()) {
      if (!this.goalsAnnounced) {
        this.goalsAnnounced = true;
        this.emit({ type: 'goalsMet' });
      }
      if (this.level.boss) this.startBoss();
      else this.win();
    }
  }

  private tickTiles(dt: number): void {
    const lvl = this.level;
    for (const t of this.tiles) {
      if (t.rock !== 0) continue;
      const p = t.plant;
      const soil = SOILS[t.soil];
      if (!p) {
        if (!lvl.noThirst) t.moisture = Math.max(0, t.moisture - 0.012 * soil.drain * dt);
        continue;
      }
      p.age += dt;
      if (!lvl.noThirst) {
        const drink = CROPS[p.crop].waterUse * DRINK_SCALE * soil.drain * p.drinkMult;
        t.moisture = Math.max(0, t.moisture - drink * dt);
      } else t.moisture = Math.max(t.moisture, 0.8);

      // thirst & wilting
      if (t.moisture <= 0) {
        p.dryTime += dt;
        if (p.dryTime >= WILT_ROT && !lvl.gentle) {
          this.losePlant(t, 'rot');
          continue;
        }
        this.setMood(t, p.dryTime >= WILT_YELLOW ? 'yellow' : 'wilt');
      } else if (t.moisture < THIRSTY_AT) {
        this.setMood(t, 'thirsty');
      } else {
        this.setMood(t, 'ok');
      }

      // growth
      if (p.growth >= 1) {
        p.ripeHold -= dt;
        if (p.ripeHold <= 0) this.harvest(t);
        continue;
      }
      if (t.moisture <= 0 || t.smothered || p.eatenBy) continue;
      const def = CROPS[p.crop];
      const soilMult = soil.friends.includes(p.crop) ? soil.friendGrowth : soil.growth;
      const rate = (1 / def.grow) * soilMult * p.growMult;
      p.growth = Math.min(1, p.growth + rate * dt);
      if (p.growth >= 1) {
        p.ripeHold = 0.65;
        this.emit({ type: 'ripe', tile: t.i });
      }
    }
  }

  private harvest(t: Tile): void {
    const p = t.plant!;
    const def = CROPS[p.crop];
    const soil = SOILS[t.soil];
    const soilSell = soil.friends.includes(p.crop) ? soil.friendSell : 1;
    const golden = this.rng.chance(0.05);
    const v = this.spawnVeggie(t.x, t.z, p.crop, def.sell * soilSell * p.sellMult, golden);
    this.harvests += 1;
    this.emit({ type: 'pop', id: v.id, tile: t.i });
    p.harvestsLeft -= 1;
    p.fruited = true;
    if (p.harvestsLeft <= 0) {
      t.plant = null;
      this.emit({ type: 'plantDone', tile: t.i, crop: p.crop });
      this.releaseCritters(t.i);
      this.refreshSynergy();
    } else {
      p.growth = regrowStart(def);
    }
  }

  private spawnVeggie(x: number, z: number, crop: CropId, base: number, golden: boolean): Veggie {
    const lx = Math.max(-this.halfW + 0.3, Math.min(this.halfW - 0.3, x + this.rng.range(-0.28, 0.28)));
    const sz = z + 0.42;
    const lz = this.laneZ + this.rng.range(-0.1, 0.12);
    const rollDur = Math.max(0.35, (lz - sz) / ROLL_SPEED);
    const v: Veggie = {
      id: this.nextId++, kind: 'veggie', crop, golden, phase: 'pop', t: 0, age: 0,
      x, y: 0.6, z, sx: x, sz, lx, lz,
      popDur: POP_DUR, rollDur, laneLeft: this.level.gentle ? Infinity : LANE_TIME, laneMax: LANE_TIME,
      spin: this.rng.range(-1, 1), base,
    };
    // keep lane neighbours apart
    for (const o of this.veggies) {
      if (Math.abs(o.lx - v.lx) < 0.32) v.lx += o.lx > v.lx ? -0.34 : 0.34;
    }
    v.lx = Math.max(-this.halfW + 0.2, Math.min(this.halfW - 0.2, v.lx));
    this.veggies.push(v);
    return v;
  }

  private spawnClock(x: number, z: number): void {
    const v = this.spawnVeggie(x, Math.min(z, this.frontZ - 0.8), 'radish', 0, false);
    v.kind = 'clock';
    v.y = 1.2;
    this.emit({ type: 'clockBonus', x, z });
  }

  private tickVeggies(dt: number, frozen: boolean): void {
    for (let k = this.veggies.length - 1; k >= 0; k--) {
      const v = this.veggies[k];
      v.t += dt;
      v.age += dt;
      if (v.phase === 'pop') {
        const u = Math.min(1, v.t / v.popDur);
        v.x = v.x + (v.sx + (v.lx - v.sx) * 0.15 - v.x) * Math.min(1, dt * 12);
        v.z = v.z + (v.sz - v.z) * Math.min(1, dt * 10);
        v.y = 0.2 + 0.5 * (1 - u) + Math.sin(u * Math.PI) * 1.25;
        if (u >= 1) {
          v.phase = 'roll';
          v.t = 0;
          v.x = v.sx + (v.lx - v.sx) * 0.15;
          v.z = v.sz;
          v.y = 0.2;
        }
      } else if (v.phase === 'roll') {
        const u = Math.min(1, v.t / v.rollDur);
        const e = u; // constant roll speed reads as "rolling downhill"
        const fromX = v.sx + (v.lx - v.sx) * 0.15;
        v.x = fromX + (v.lx - fromX) * e;
        v.z = v.sz + (v.lz - v.sz) * e;
        v.y = 0.2 + Math.abs(Math.sin(u * Math.PI * 2.2)) * 0.16 * (1 - u);
        if (u >= 1) {
          v.phase = 'lane';
          v.t = 0;
          v.y = 0.2;
        }
      } else if (!frozen) {
        v.laneLeft -= dt;
        if (this.companions.includes('tortoise') && v.laneLeft < 1.1 && this.tortoiseSaveCd <= 0 && v.kind === 'veggie' && this.status !== 'lost') {
          this.tortoiseSaveCd = TORTOISE_SAVE_CD;
          this.catchVeggie(v.id, 'tortoise');
          continue;
        }
        if (v.laneLeft <= 0) {
          this.veggies.splice(k, 1);
          if (v.kind === 'veggie') {
            this.missed += 1;
            this.perfectStreak = 0;
            this.chain = 0;
          }
          this.emit({ type: 'miss', id: v.id, x: v.x, z: v.z });
        }
      }
    }
  }

  private tickWaves(): void {
    for (const w of this.waves) {
      if (this.t < w.next) continue;
      const alive = this.critters.filter((c) => c.type === w.type && !c.fromBoss && c.phase !== 'flee').length;
      if (alive >= w.max) {
        w.next = this.t + 1.5;
        continue;
      }
      const ok = this.spawnCritter(w.type, false);
      w.next = this.t + (ok ? w.interval * this.rng.range(0.85, 1.15) : 2);
    }
  }

  private pickTarget(type: CritterId): Tile | null {
    const taken = new Set(this.critters.filter((c) => c.phase !== 'flee').map((c) => c.target));
    const cands = this.tiles.filter((t) => t.plant && !taken.has(t.i));
    if (!cands.length) return null;
    if (type === 'rabbit') {
      const young = cands.filter((t) => !t.plant!.fruited && t.plant!.growth < 0.9);
      if (young.length) return this.rng.pick(young);
    }
    // crows like plants that are nearly ripe
    cands.sort((a, b) => b.plant!.growth - a.plant!.growth + this.rng.range(-0.4, 0.4));
    return cands[0];
  }

  spawnCritter(type: CritterId, fromBoss: boolean, origin?: { x: number; y: number; z: number }): boolean {
    const target = this.pickTarget(type);
    if (!target) return false;
    const def = CRITTERS[type];
    const side = this.rng.chance(0.5) ? -1 : 1;
    let fx: number, fy: number, fz: number, dur: number;
    if (type === 'crow') {
      fx = origin?.x ?? side * (this.halfW + 4);
      fy = origin?.y ?? 5.5;
      fz = origin?.z ?? target.z - 3;
      dur = 1.7;
    } else {
      fx = side * (this.halfW + 2.4);
      fy = 0.2;
      fz = target.z + this.rng.range(-0.6, 0.6);
      dur = 2.4;
    }
    const c: Critter = {
      id: this.nextId++, type, hp: def.hp, maxHp: def.hp, phase: 'arrive', t: 0, dur,
      x: fx, y: fy, z: fz, fx, fy, fz,
      tx: target.x + (type === 'rabbit' ? side * 0.32 : 0), ty: type === 'crow' ? 0.72 : 0.18, tz: target.z + (type === 'rabbit' ? 0.12 : 0.05),
      target: target.i, eatT: 0, eatTime: def.eatTime, hitFlash: 0, fromBoss,
    };
    this.critters.push(c);
    this.emit({ type: 'critterSpawn', id: c.id, critter: type });
    return true;
  }

  private flee(c: Critter, shooed: boolean): void {
    if (c.phase === 'flee') return;
    const t = this.tiles[c.target];
    if (t?.plant && t.plant.eatenBy === c.id) t.plant.eatenBy = 0;
    c.phase = 'flee';
    c.t = 0;
    c.dur = c.type === 'crow' ? 1.3 : 1.4;
    c.fx = c.x; c.fy = c.y; c.fz = c.z;
    const side = c.x >= 0 ? 1 : -1;
    if (c.type === 'crow') {
      c.tx = side * (this.halfW + 5); c.ty = 6.5; c.tz = c.z - 4;
    } else {
      c.tx = side * (this.halfW + 3); c.ty = 0.2; c.tz = c.z + 0.3;
    }
    this.emit({ type: 'critterFlee', id: c.id, shooed });
  }

  private releaseCritters(tile: number): void {
    for (const c of this.critters) {
      if (c.target !== tile || c.phase === 'flee') continue;
      const nt = this.pickTarget(c.type);
      if (nt && c.phase === 'arrive') {
        c.target = nt.i;
        c.fx = c.x; c.fy = c.y; c.fz = c.z;
        c.tx = nt.x; c.tz = nt.z + 0.05;
        c.t = 0;
        c.dur = 1.1;
      } else this.flee(c, false);
    }
  }

  private tickCritters(dt: number): void {
    for (let k = this.critters.length - 1; k >= 0; k--) {
      const c = this.critters[k];
      c.t += dt;
      c.hitFlash = Math.max(0, c.hitFlash - dt * 4);
      if (c.phase === 'arrive' || c.phase === 'flee') {
        const u = Math.min(1, c.t / c.dur);
        const e = c.phase === 'arrive' ? 1 - (1 - u) * (1 - u) : u * u;
        c.x = c.fx + (c.tx - c.fx) * e;
        c.z = c.fz + (c.tz - c.fz) * e;
        if (c.type === 'crow') {
          c.y = c.fy + (c.ty - c.fy) * e + Math.sin(u * Math.PI) * 0.8;
        } else {
          c.y = 0.18 + Math.abs(Math.sin(u * Math.PI * (c.phase === 'arrive' ? 4 : 3))) * 0.45;
        }
        if (u >= 1) {
          if (c.phase === 'flee') {
            this.critters.splice(k, 1);
            this.emit({ type: 'critterGone', id: c.id });
            continue;
          }
          const t = this.tiles[c.target];
          if (!t.plant || (this.status !== 'playing' && this.status !== 'boss')) {
            this.flee(c, false);
            continue;
          }
          c.phase = 'eat';
          c.t = 0;
          t.plant.eatenBy = c.id;
        }
      } else if (c.phase === 'eat') {
        const t = this.tiles[c.target];
        if (!t.plant) {
          this.flee(c, false);
          continue;
        }
        if (this.status !== 'playing' && this.status !== 'boss') continue;
        c.eatT += dt;
        if (c.eatT >= c.eatTime) {
          this.losePlant(t, c.type);
          this.flee(c, false);
        }
      }
    }
  }

  private tickWeeds(dt: number): void {
    if (this.status === 'playing' && this.t >= this.weedNext && this.level.weeds) {
      const empty = this.tiles.filter((t) => this.isEmpty(t));
      if (empty.length) {
        const t = this.rng.pick(empty);
        t.weed = { growth: 0, taps: 2 };
        this.emit({ type: 'weedSprout', tile: t.i });
        this.weedNext = this.t + this.level.weeds.interval * this.rng.range(0.8, 1.2);
      } else this.weedNext = this.t + 3;
    }
    let changed = false;
    for (const t of this.tiles) {
      if (!t.weed || t.weed.growth >= 1) continue;
      t.weed.growth = Math.min(1, t.weed.growth + dt / 8);
      if (t.weed.growth >= 1) {
        changed = true;
        this.emit({ type: 'weedGrown', tile: t.i });
      }
    }
    if (changed) this.refreshSmother();
  }

  private refreshSmother(): void {
    for (const t of this.tiles) t.smothered = false;
    for (const t of this.tiles) {
      if (!t.weed || t.weed.growth < 1) continue;
      for (const n of neighbours(this.tiles, this.cols, this.rows, t.i)) this.tiles[n].smothered = true;
    }
  }

  // ───────────────────────── boss ─────────────────────────

  private startBoss(): void {
    this.status = 'boss';
    this.boss = {
      kind: 'crowKing', hp: 12, maxHp: 12, phase: 'enter', t: 0, dur: 2.4,
      x: 0, y: 9, z: this.backZ - 6, fx: 0, fy: 9, fz: this.backZ - 6, tx: 0, ty: 4.2, tz: this.backZ - 0.8,
      angle: 0, hitFlash: 0, plantsLost: 0,
    };
    this.emit({ type: 'bossStart' });
  }

  private setBossPhase(phase: Boss['phase'], dur: number): void {
    const b = this.boss!;
    b.phase = phase;
    b.t = 0;
    b.dur = dur;
    this.emit({ type: 'bossPhase', phase });
  }

  private tickBoss(dt: number): void {
    const b = this.boss!;
    b.t += dt;
    b.hitFlash = Math.max(0, b.hitFlash - dt * 4);
    const u = Math.min(1, b.t / b.dur);
    const ease = 1 - Math.pow(1 - u, 3);
    switch (b.phase) {
      case 'enter':
      case 'swoop':
      case 'rise':
        b.x = b.fx + (b.tx - b.fx) * ease;
        b.y = b.fy + (b.ty - b.fy) * ease;
        b.z = b.fz + (b.tz - b.fz) * ease;
        if (u >= 1) {
          if (b.phase === 'swoop') this.setBossPhase('perch', 3.4);
          else {
            this.setBossPhase('high', 4.2);
            b.angle = Math.atan2(b.z - (this.backZ + 0.6), b.x);
            this.emit({ type: 'bossCall' });
            const n = b.hp > b.maxHp / 2 ? 1 : 2;
            for (let i = 0; i < n; i++) this.spawnCritter('crow', true, { x: b.x + (i ? 1 : -1), y: b.y, z: b.z });
          }
        }
        break;
      case 'high': {
        b.angle += dt * 0.9;
        const cx = 0;
        const cz = this.backZ + 0.6;
        b.x = cx + Math.cos(b.angle) * (this.halfW * 0.8);
        b.z = cz + Math.sin(b.angle) * 1.2 - 0.6;
        b.y = 4.2 + Math.sin(b.t * 2.2) * 0.25;
        if (u >= 1) {
          b.fx = b.x; b.fy = b.y; b.fz = b.z;
          b.tx = this.rng.range(-this.halfW * 0.6, this.halfW * 0.6);
          b.ty = 0.55;
          b.tz = this.laneZ + 0.55;
          this.setBossPhase('swoop', 0.95);
        }
        break;
      }
      case 'perch':
        b.y = 0.55 + Math.abs(Math.sin(b.t * 3)) * 0.05;
        if (u >= 1) {
          b.fx = b.x; b.fy = b.y; b.fz = b.z;
          b.tx = this.rng.range(-1.5, 1.5); b.ty = 4.2; b.tz = this.backZ - 0.6;
          this.setBossPhase('rise', 1.1);
        }
        break;
      case 'defeated':
        b.x = b.fx + (b.tx - b.fx) * u * u;
        b.y = b.fy + (b.ty - b.fy) * u * u;
        b.z = b.fz + (b.tz - b.fz) * u * u;
        if (u >= 1 && this.status === 'boss') this.win();
        break;
    }
  }

  // ───────────────────────── helpers ─────────────────────────

  private makePlant(crop: CropId, tile: number): Plant {
    return {
      id: this.nextId++, crop, tile, growth: 0, harvestsLeft: CROPS[crop].harvests, fruited: false, ripeHold: 0,
      dryTime: 0, mood: 'ok', age: 0, trellisBonus: false, growMult: 1, drinkMult: 1, sellMult: 1, eatenBy: 0,
    };
  }

  private losePlant(t: Tile, cause: 'rot' | 'crow' | 'rabbit'): void {
    const p = t.plant;
    if (!p) return;
    t.plant = null;
    this.plantsLost += 1;
    this.emit({ type: 'plantLost', tile: t.i, crop: p.crop, cause });
    if (this.boss && this.status === 'boss') {
      this.boss.plantsLost += 1;
      if (this.boss.plantsLost >= 3) this.lose('overrun');
    }
    // a plant that rots next to a grown weed turns into a weed
    if (cause === 'rot' && this.level.weeds) {
      const nearWeed = neighbours(this.tiles, this.cols, this.rows, t.i).some((n) => this.tiles[n].weed?.growth === 1);
      if (nearWeed) {
        t.weed = { growth: 1, taps: 2 };
        this.emit({ type: 'weedSprout', tile: t.i });
        this.refreshSmother();
      }
    }
    this.releaseCritters(t.i);
    this.refreshSynergy();
  }

  private setMood(t: Tile, mood: Plant['mood']): void {
    const p = t.plant!;
    if (p.mood !== mood) {
      p.mood = mood;
      this.emit({ type: 'mood', tile: t.i, mood });
    }
  }

  private refreshSynergy(silent = false): void {
    const res = evaluateSynergy(this.tiles, this.cols, this.rows, (i) => this.tiles[i].rock === 0);
    this.links = res.links;
    for (const key of res.active) {
      if (!this.combosSeen.has(key)) {
        this.combosSeen.add(key);
        if (!silent) this.emit({ type: 'combo', key, tiles: res.tiles.get(key) ?? [] });
      }
    }
  }

  private win(): void {
    if (this.status === 'won' || this.status === 'lost') return;
    this.status = 'won';
    for (const c of this.critters) this.flee(c, false);
    this.emit({ type: 'won' });
  }

  private lose(reason: LoseReason): void {
    if (this.status === 'won' || this.status === 'lost') return;
    this.status = 'lost';
    this.loseReason = reason;
    this.emit({ type: 'lost', reason });
  }

  private fail(reason: FailReason, tile?: number): false {
    this.emit({ type: 'fail', reason, tile });
    return false;
  }

  private emit(e: SimEvent): void {
    this.events.push(e);
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
