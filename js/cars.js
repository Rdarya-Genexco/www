/* =====================================================================================================
   CARS: every car in the game, in one place. Edit this file to rename cars, change prices or stats.
   The game (js/game.js) and the 3D renderer (js/view3d.js) both read from here.
   ===================================================================================================== */

/* Show the real-world names (realName) in the game instead of the made-up ones (name).
   Off by default: real car brand names are trademarks, so publishing a game that uses them without a
   licence can get it taken down. Turn on at your own risk, e.g. for a private build. */
const USE_REAL_NAMES = true;

/* Quick price list (points). Starter cars are free (0). */
const PRICES = {
  toro: 150,
  rosso: 300,
  veyra: 600,
  divo: 900,
  phantom: 1000,
  sport300: 1200,
  bolide: 1500,
};

/* Fields
   id        internal key (used in saves: don't change it once players own the car)
   name      name shown in the game
   realName  the real car it is styled after
   stats     speed / accel / handling: 1 = the starter coupe, higher is better
             damage: share of crash damage taken (0.5 = half, 1.35 = more)
   desc      one-line description in the Garage
   shape     3D body outline in metres: L length, W width, r ride height; heights hood / roof / deck;
             positions along the car (front is -L/2): ws windscreen base, rf/rr roof front/rear,
             rw rear window base. Optional: flare (wide rear hips), tumble (narrow cabin), open, bed
   style     3D details: sup (supercar parts), wing 0-3, lights (pair|quad|y|bar|thin|x),
             exhaust (side|center|quad), two (two-tone), acc (glow/accent colour), cal (brake calipers),
             fin (shark fin + glow strips), spine (roof scoop), rearFins, horseshoe (grille), stripes
   look2d    which 2D drawing to use when the device has no 3D (WebGL) support */
const CAR_LIST = [
  // ---------------- starter cars (free) ----------------
  {
    id: 'coupe',
    name: 'Coupe',
    realName: 'Generic sports coupe',
    stats: { speed: 1, accel: 1, handling: 1, damage: 1 },
    desc: 'Balanced all-rounder',
    shape: { L: 4.4, W: 1.86, r: 0.22, hood: 0.72, roof: 1.3, deck: 0.8, ws: -0.75, rf: -0.1, rr: 0.6, rw: 1.35 },
    style: {},
  },
  {
    id: 'hatch',
    name: 'Hatch',
    realName: 'Generic hot hatch',
    stats: { speed: 0.96, accel: 1.1, handling: 1.12, damage: 1 },
    desc: 'Quick off the line and agile, a little slower flat out',
    shape: { L: 3.95, W: 1.78, r: 0.24, hood: 0.74, roof: 1.42, deck: 0.95, ws: -0.75, rf: -0.15, rr: 1.15, rw: 1.75 },
    style: {},
  },
  {
    id: 'wedge',
    name: 'Wedge',
    realName: 'Generic 80s wedge sports car',
    stats: { speed: 1.06, accel: 0.95, handling: 0.9, damage: 1 },
    desc: 'Highest top speed of the starters, but heavy in the bends',
    shape: { L: 4.5, W: 1.94, r: 0.2, hood: 0.6, roof: 1.12, deck: 0.78, ws: -0.55, rf: 0.15, rr: 0.7, rw: 1.6 },
    style: { wing: 1 },
  },
  {
    id: 'van',
    name: 'Van',
    realName: 'Generic minivan',
    stats: { speed: 0.93, accel: 0.9, handling: 0.95, damage: 0.5 },
    desc: 'Slow and steady, takes half damage',
    shape: { L: 4.7, W: 1.92, r: 0.28, hood: 0.9, roof: 1.95, deck: 1.4, ws: -1.65, rf: -1.05, rr: 2.15, rw: 2.3 },
    style: {},
  },
  {
    id: 'roadster',
    name: 'Roadster',
    realName: 'Generic open-top roadster',
    stats: { speed: 1, accel: 1.05, handling: 1.2, damage: 1.35 },
    desc: 'Sharpest handling, but fragile',
    shape: { L: 4.1, W: 1.8, r: 0.2, hood: 0.66, roof: 0.98, deck: 0.74, ws: -0.45, rf: -0.15, rr: 0.05, rw: 0.35, open: 1 },
    style: {},
  },
  {
    id: 'pickup',
    name: 'Pickup',
    realName: 'Generic pickup truck',
    stats: { speed: 0.97, accel: 0.92, handling: 1, damage: 0.65 },
    desc: 'Tough and steady, takes less damage',
    shape: { L: 5.0, W: 1.96, r: 0.34, hood: 0.86, roof: 1.62, deck: 0.92, ws: -0.95, rf: -0.45, rr: 0.35, rw: 0.45, bed: 1 },
    style: {},
  },

  // ---------------- supercars (bought in the Garage showroom) ----------------
  {
    id: 'toro',
    name: 'Toro V12',
    realName: 'Lamborghini Centenario',
    stats: { speed: 1.12, accel: 1.18, handling: 1.04, damage: 1.05 },
    desc: 'Angular V12 bull with brutal acceleration',
    shape: { L: 4.7, W: 2.06, r: 0.14, hood: 0.38, roof: 0.98, deck: 0.6, ws: -0.85, rf: -0.15, rr: 0.3, rw: 0.95, flare: 0.08 },
    style: { sup: 1, wing: 2, lights: 'y', exhaust: 'center', acc: '#f2c418', cal: '#f2c418', rearFins: 1 },
  },
  {
    id: 'rosso',
    name: 'Rosso GT',
    realName: 'Ferrari 812 Superfast',
    stats: { speed: 1.16, accel: 1.2, handling: 1.18, damage: 1 },
    desc: 'Italian thoroughbred, fast and razor sharp in bends',
    shape: { L: 4.65, W: 2.02, r: 0.16, hood: 0.46, roof: 1.06, deck: 0.66, ws: -0.45, rf: 0.15, rr: 0.65, rw: 1.25, flare: 0.07 },
    style: { sup: 1, lights: 'quad', exhaust: 'quad', cal: '#f2c418' },
  },
  {
    id: 'veyra',
    name: 'Veyra 16',
    realName: 'Bugatti Chiron',
    stats: { speed: 1.24, accel: 1.26, handling: 1.1, damage: 0.85 },
    desc: 'Quad-turbo W16 hypercar with an enormous top speed',
    shape: { L: 4.55, W: 2.06, r: 0.17, hood: 0.52, roof: 1.08, deck: 0.72, ws: -0.55, rf: 0.0, rr: 0.55, rw: 1.1, flare: 0.05 },
    style: { sup: 1, wing: 2, lights: 'bar', exhaust: 'center', acc: '#5fd0ff', two: 1, horseshoe: 1 },
  },
  {
    id: 'divo',
    name: 'Veyra Dive',
    realName: 'Bugatti Divo',
    stats: { speed: 1.22, accel: 1.25, handling: 1.22, damage: 0.9 },
    desc: 'Corner-carving W16 with a roof scoop and teal highlights',
    shape: { L: 4.64, W: 2.08, r: 0.15, hood: 0.48, roof: 1.04, deck: 0.7, ws: -0.6, rf: -0.05, rr: 0.5, rw: 1.15, flare: 0.07 },
    style: { sup: 1, wing: 2, lights: 'thin', exhaust: 'quad', acc: '#2fd5d0', cal: '#2fd5d0', spine: 1, horseshoe: 1 },
  },
  {
    id: 'phantom',
    name: 'Phantom X',
    realName: 'Hypercar concept (not a real model)',
    stats: { speed: 1.3, accel: 1.34, handling: 1.24, damage: 0.85 },
    desc: 'Track-bred hypercar with a shark fin and blue glow',
    shape: { L: 4.95, W: 2.08, r: 0.13, hood: 0.36, roof: 0.96, deck: 0.58, ws: -0.95, rf: -0.3, rr: 0.2, rw: 1.0, flare: 0.09, tumble: 0.4 },
    style: { sup: 1, wing: 3, lights: 'thin', exhaust: 'center', acc: '#4db8ff', fin: 1 },
  },
  {
    id: 'sport300',
    name: 'Veyra 300+',
    realName: 'Bugatti Chiron Super Sport 300+',
    stats: { speed: 1.32, accel: 1.3, handling: 1.08, damage: 0.85 },
    desc: 'Longtail record breaker, built for top speed, orange racing stripes',
    shape: { L: 4.95, W: 2.06, r: 0.15, hood: 0.5, roof: 1.06, deck: 0.66, ws: -0.6, rf: -0.05, rr: 0.5, rw: 1.3, flare: 0.05 },
    style: { sup: 1, lights: 'bar', exhaust: 'quad', acc: '#ff7a1a', cal: '#ff7a1a', stripes: '#ff7a1a', horseshoe: 1 },
  },
  {
    id: 'bolide',
    name: 'Veyra Bolt',
    realName: 'Bugatti Bolide',
    stats: { speed: 1.34, accel: 1.4, handling: 1.3, damage: 0.7 },
    desc: 'Track-only W16 with X-shaped lights: the fastest car in the game',
    shape: { L: 4.76, W: 2.1, r: 0.11, hood: 0.34, roof: 0.92, deck: 0.62, ws: -0.8, rf: -0.25, rr: 0.15, rw: 0.85, flare: 0.1, tumble: 0.42 },
    style: { sup: 1, wing: 3, lights: 'x', exhaust: 'quad', acc: '#7fd7ff', cal: '#7fd7ff', fin: 1, horseshoe: 1 },
    look2d: 'phantom',
  },
];

/* ---------- derived values (no need to edit below) ---------- */
for (const c of CAR_LIST) {
  c.price = PRICES[c.id] || 0;
  c.show = USE_REAL_NAMES ? c.realName : c.name;
  c.look2d = c.look2d || (c.price && !['toro', 'rosso', 'veyra', 'phantom'].includes(c.id) ? 'veyra' : c.id);
}
window.CAR_LIST = CAR_LIST;
