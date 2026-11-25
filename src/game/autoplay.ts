import { CROPS, regrowStart, type CropId } from '../data/crops';
import type { Sim } from '../sim/sim';

/** The same simple, human-paced policy the balance bot uses. Drives the title-screen garden. */
function score(c: CropId, timeLeft: number): number {
  const d = CROPS[c];
  const life = d.grow + d.grow * (1 - regrowStart(d)) * (d.harvests - 1);
  if (life > timeLeft * 0.9) return -1;
  return (d.sell * d.harvests - d.seed) / life;
}

export function act(sim: Sim): boolean {
  const b = sim.boss;
  if (b && b.phase === 'perch') return sim.hitBoss();
  const critter = sim.critters.find((c) => c.phase !== 'flee' && (c.phase === 'eat' || c.t > c.dur * 0.6));
  if (critter) return sim.hitCritter(critter.id);

  const rolling = sim.veggies.filter((v) => v.phase !== 'lane' && v.t > 0.15).sort((a, b) => b.z - a.z);
  if (rolling.length) return sim.catchVeggie(rolling[0].id);
  const lane = sim.veggies.filter((v) => v.phase === 'lane').sort((a, b) => a.laneLeft - b.laneLeft);
  if (lane.length && lane[0].laneLeft < 3.5) return sim.catchVeggie(lane[0].id);

  const empties = sim.tiles.filter((t) => sim.isEmpty(t));
  const bill = sim.nextBill();
  if (bill !== null && sim.coins >= bill) {
    const lastBills = sim.bills().length - sim.billsPaid <= 1;
    if (!empties.length || sim.coins >= bill + 12 || lastBills) return sim.payBill();
  }

  const dry = sim.tiles.filter((t) => t.plant && t.moisture < 0.34).sort((a, c) => a.moisture - c.moisture);
  if (dry.length && sim.can >= 1) return sim.water(dry[0].i);

  const weed = sim.tiles.find((t) => t.weed && (t.weed.growth < 1 || sim.coins >= 3));
  if (weed) return sim.tapWeed(weed.i);

  const tl = sim.timed ? sim.timeLeft : 200;
  const order = sim.level.goals.order;
  if (empties.length) {
    let crop: CropId | null = null;
    if (order && sim.orderCount < order.count && sim.coins >= CROPS[order.crop].seed) {
      const planted = sim.tiles.filter((t) => t.plant?.crop === order.crop).length;
      if (planted * CROPS[order.crop].harvests + sim.orderCount < order.count + 2) crop = order.crop;
    }
    if (!crop) {
      const opts = sim.level.seeds.filter((c) => CROPS[c].seed <= sim.coins && score(c, tl) > 0).sort((a, c) => score(c, tl) - score(a, tl));
      crop = opts[0] ?? null;
    }
    if (crop) {
      // prefer friends' soils
      const t = empties.find((e) => (e.soil === 'sandy' && (crop === 'carrot' || crop === 'radish')) || (e.soil === 'clay' && (crop === 'lettuce' || crop === 'pumpkin'))) ?? empties.find((e) => e.soil === 'loam') ?? empties[0];
      return sim.plant(t.i, crop);
    }
  }
  const rock = sim.tiles.find((t) => t.rock > 0);
  if (rock) return sim.digRock(rock.i);
  return false;
}

