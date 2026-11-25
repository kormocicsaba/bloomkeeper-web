import { CROPS } from '../data/crops';
import type { ComboKey, ComboLink, Tile } from './types';

export function neighbours(tiles: Tile[], cols: number, rows: number, i: number): number[] {
  const t = tiles[i];
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const c = t.c + dc;
      const r = t.r + dr;
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
      out.push(r * cols + c);
    }
  }
  return out;
}

export interface SynergyResult {
  links: ComboLink[];
  active: Set<ComboKey>;
  /** tiles per combo key, for announcements */
  tiles: Map<ComboKey, number[]>;
}

/**
 * Reads the board and writes growMult / drinkMult / sellMult onto each plant.
 * Neighbours are the eight plots around a tile. Each kind of combo counts once per tile.
 */
export function evaluateSynergy(tiles: Tile[], cols: number, rows: number, valid: (i: number) => boolean): SynergyResult {
  const links: ComboLink[] = [];
  const active = new Set<ComboKey>();
  const comboTiles = new Map<ComboKey, number[]>();
  const add = (key: ComboKey, a: number, b: number) => {
    active.add(key);
    if (a < b || !links.some((l) => l.key === key && l.a === b && l.b === a)) links.push({ a, b, key });
    const arr = comboTiles.get(key) ?? [];
    if (!arr.includes(a)) arr.push(a);
    if (!arr.includes(b)) arr.push(b);
    comboTiles.set(key, arr);
  };

  for (const t of tiles) {
    if (t.plant) {
      t.plant.growMult = 1;
      t.plant.drinkMult = 1;
      t.plant.sellMult = 1;
    }
  }

  for (const t of tiles) {
    const p = t.plant;
    if (!p || !valid(t.i)) continue;
    const def = CROPS[p.crop];
    const nb = neighbours(tiles, cols, rows, t.i).filter(valid);
    const nbPlants = nb.map((i) => tiles[i]).filter((n) => n.plant);
    let radish = false;
    let tall = false;
    let mulch = false;
    for (const n of nbPlants) {
      const nd = CROPS[n.plant!.crop];
      if (p.crop === 'carrot' && n.plant!.crop === 'radish') {
        radish = true;
        add('radishCarrot', n.i, t.i);
      }
      if (nd.tall && (p.crop === 'lettuce' || def.climber)) {
        tall = true;
        add(p.crop === 'lettuce' ? 'coolLettuce' : 'trellis', n.i, t.i);
      }
      if (n.plant!.crop === 'pumpkin') {
        mulch = true;
        add('pumpkinMulch', n.i, t.i);
      }
    }
    if (radish) p.growMult *= 1.2;
    if (tall && p.crop === 'lettuce') p.drinkMult *= 0.7;
    if (tall && def.climber && !p.trellisBonus) {
      p.trellisBonus = true;
      p.harvestsLeft += 1;
    }
    if (mulch) p.drinkMult *= 0.8;
  }

  // Root Cellar: connected groups of 3+ roots
  const seen = new Set<number>();
  for (const t of tiles) {
    if (!t.plant || !CROPS[t.plant.crop].root || seen.has(t.i) || !valid(t.i)) continue;
    const group: number[] = [];
    const stack = [t.i];
    seen.add(t.i);
    while (stack.length) {
      const i = stack.pop()!;
      group.push(i);
      for (const n of neighbours(tiles, cols, rows, i)) {
        const nt = tiles[n];
        if (!seen.has(n) && nt.plant && CROPS[nt.plant.crop].root && valid(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    if (group.length >= 3) {
      for (const i of group) {
        tiles[i].plant!.sellMult *= 1.15;
        for (const n of neighbours(tiles, cols, rows, i)) {
          if (n > i && group.includes(n)) add('rootCellar', i, n);
        }
      }
    }
  }

  return { links, active, tiles: comboTiles };
}
