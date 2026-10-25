/* =====================================================================================================
   CARS: every car in the game, in one place. Edit this file to rename cars, change prices or stats.
   The game (js/game.js) and the 3D renderer (js/view3d.js) both read from here.
   ===================================================================================================== */

/* Show the real-world names (realName) in the game instead of the made-up ones (name).
   Off by default: real car brand names are trademarks, so publishing a game that uses them without a
   licence can get it taken down. Turn on at your own risk, e.g. for a private build. */
const USE_REAL_NAMES = true;

/* Speed limits in km/h. Nothing in the game goes faster than MAX_KMH, not even with upgrades or nitro. */
const MAX_KMH = 300;

/* Top speed of each car in km/h (before Garage upgrades). Upgrades add up to +20%, capped at MAX_KMH. */
const TOP_SPEEDS = {
  coupe: 230,
  hatch: 221,
  wedge: 244,
  van: 214,
  roadster: 230,
  pickup: 223,
  toro: 255,
  rosso: 262,
  mclaren720: 266,
  veyra: 282,
  divo: 278,
  phantom: 286,
  senna: 288,
  regera: 291,
  sport300: 296,
  jesko: 298,
  bolide: 300,
};

/* Price of each supercar in points. Starter cars are free. */
const PRICES = {
  toro: 150,
  rosso: 300,
  mclaren720: 450,
  veyra: 600,
  divo: 900,
  phantom: 1000,
  senna: 1100,
  sport300: 1200,
  regera: 1300,
  jesko: 1400,
  bolide: 1500,
};

/* Fields
   id        internal key (used in saves: don't change it once players own the car)
   name      name shown in the game
   realName  the real car it is styled after
   stats     accel / handling: 1 = the starter coupe, higher is better (top speed is in TOP_SPEEDS)
             damage: share of crash damage taken (0.5 = half, 1.35 = more)
   desc      one-line description in the Garage
   shape     3D body outline in metres: L length, W width, r ride height; heights hood / roof / deck;
             positions along the car (front is -L/2): ws windscreen base, rf/rr roof front/rear,
             rw rear window base. Optional: flare (wide rear hips), tumble (narrow cabin), open, bed
   style     3D details: sup (supercar parts), wing 0-3, lights (pair|quad|y|bar|thin|x|ring),
             exhaust (side|center|quad|twin), two (two-tone), acc (glow/accent colour), cal (brake calipers),
             fin (shark fin + glow strips), spine (roof scoop), rearFins, horseshoe (grille), stripes
   look2d    which 2D drawing to use when the device has no 3D (WebGL) support */
const CAR_LIST = [
  // ---------------- starter cars (free) ----------------
  {
    id: 'coupe',
    name: 'Coupe',
    realName: 'Generic sports coupe',
    stats: { accel: 1, handling: 1, damage: 1 },
    desc: 'Balanced all-rounder',
    shape: { L: 4.4, W: 1.86, r: 0.22, hood: 0.72, roof: 1.3, deck: 0.8, ws: -0.75, rf: -0.1, rr: 0.6, rw: 1.35 },
    style: {},
  },
  {
    id: 'hatch',
    name: 'Hatch',
    realName: 'Generic hot hatch',
    stats: { accel: 1.1, handling: 1.12, damage: 1 },
    desc: 'Quick off the line and agile, a little slower flat out',
    shape: { L: 3.95, W: 1.78, r: 0.24, hood: 0.74, roof: 1.42, deck: 0.95, ws: -0.75, rf: -0.15, rr: 1.15, rw: 1.75 },
    style: {},
  },
  {
    id: 'wedge',
    name: 'Wedge',
    realName: 'Generic 80s wedge sports car',
    stats: { accel: 0.95, handling: 0.9, damage: 1 },
    desc: 'Highest top speed of the starters, but heavy in the bends',
    shape: { L: 4.5, W: 1.94, r: 0.2, hood: 0.6, roof: 1.12, deck: 0.78, ws: -0.55, rf: 0.15, rr: 0.7, rw: 1.6 },
    style: { wing: 1 },
  },
  {
    id: 'van',
    name: 'Van',
    realName: 'Generic minivan',
    stats: { accel: 0.9, handling: 0.95, damage: 0.5 },
    desc: 'Slow and steady, takes half damage',
    shape: { L: 4.7, W: 1.92, r: 0.28, hood: 0.9, roof: 1.95, deck: 1.4, ws: -1.65, rf: -1.05, rr: 2.15, rw: 2.3 },
    style: {},
  },
  {
    id: 'roadster',
    name: 'Roadster',
    realName: 'Generic open-top roadster',
    stats: { accel: 1.05, handling: 1.2, damage: 1.35 },
    desc: 'Sharpest handling, but fragile',
    shape: { L: 4.1, W: 1.8, r: 0.2, hood: 0.66, roof: 0.98, deck: 0.74, ws: -0.45, rf: -0.15, rr: 0.05, rw: 0.35, open: 1 },
    style: {},
  },
  {
    id: 'pickup',
    name: 'Pickup',
    realName: 'Generic pickup truck',
    stats: { accel: 0.92, handling: 1, damage: 0.65 },
    desc: 'Tough and steady, takes less damage',
    shape: { L: 5.0, W: 1.96, r: 0.34, hood: 0.86, roof: 1.62, deck: 0.92, ws: -0.95, rf: -0.45, rr: 0.35, rw: 0.45, bed: 1 },
    style: {},
  },

  // ---------------- supercars (bought in the Garage showroom) ----------------
  {
    id: 'toro',
    name: 'Toro V12',
    realName: 'Lamborghini Centenario',
    stats: { accel: 1.18, handling: 1.04, damage: 1.05 },
    desc: 'Angular V12 bull with brutal acceleration',
    shape: { L: 4.7, W: 2.06, r: 0.14, hood: 0.38, roof: 0.98, deck: 0.6, ws: -0.85, rf: -0.15, rr: 0.3, rw: 0.95, flare: 0.08 },
    style: { sup: 1, wing: 2, lights: 'y', exhaust: 'center', acc: '#f2c418', cal: '#f2c418', rearFins: 1 },
  },
  {
    id: 'rosso',
    name: 'Rosso GT',
    realName: 'Ferrari 812 Superfast',
    stats: { accel: 1.2, handling: 1.18, damage: 1 },
    desc: 'Italian thoroughbred, fast and razor sharp in bends',
    shape: { L: 4.65, W: 2.02, r: 0.16, hood: 0.46, roof: 1.06, deck: 0.66, ws: -0.45, rf: 0.15, rr: 0.65, rw: 1.25, flare: 0.07 },
    style: { sup: 1, lights: 'quad', exhaust: 'quad', cal: '#f2c418' },
  },
  {
    id: 'veyra',
    name: 'Veyra 16',
    realName: 'Bugatti Chiron',
    stats: { accel: 1.26, handling: 1.1, damage: 0.85 },
    desc: 'Quad-turbo W16 hypercar with an enormous top speed',
    shape: { L: 4.55, W: 2.06, r: 0.17, hood: 0.52, roof: 1.08, deck: 0.72, ws: -0.55, rf: 0.0, rr: 0.55, rw: 1.1, flare: 0.05 },
    style: { sup: 1, wing: 2, lights: 'bar', exhaust: 'center', acc: '#5fd0ff', two: 1, horseshoe: 1 },
  },
  {
    id: 'divo',
    name: 'Veyra Dive',
    realName: 'Bugatti Divo',
    stats: { accel: 1.25, handling: 1.22, damage: 0.9 },
    desc: 'Corner-carving W16 with a roof scoop and teal highlights',
    shape: { L: 4.64, W: 2.08, r: 0.15, hood: 0.48, roof: 1.04, deck: 0.7, ws: -0.6, rf: -0.05, rr: 0.5, rw: 1.15, flare: 0.07 },
    style: { sup: 1, wing: 2, lights: 'thin', exhaust: 'quad', acc: '#2fd5d0', cal: '#2fd5d0', spine: 1, horseshoe: 1 },
  },
  {
    id: 'phantom',
    name: 'Phantom X',
    realName: 'Hypercar concept (not a real model)',
    stats: { accel: 1.34, handling: 1.24, damage: 0.85 },
    desc: 'Track-bred hypercar with a shark fin and blue glow',
    shape: { L: 4.95, W: 2.08, r: 0.13, hood: 0.36, roof: 0.96, deck: 0.58, ws: -0.95, rf: -0.3, rr: 0.2, rw: 1.0, flare: 0.09, tumble: 0.4 },
    style: { sup: 1, wing: 3, lights: 'thin', exhaust: 'center', acc: '#4db8ff', fin: 1 },
  },
  {
    id: 'sport300',
    name: 'Veyra 300+',
    realName: 'Bugatti Chiron Super Sport 300+',
    stats: { accel: 1.3, handling: 1.08, damage: 0.85 },
    desc: 'Longtail record breaker, built for top speed, orange racing stripes',
    shape: { L: 4.95, W: 2.06, r: 0.15, hood: 0.5, roof: 1.06, deck: 0.66, ws: -0.6, rf: -0.05, rr: 0.5, rw: 1.3, flare: 0.05 },
    style: { sup: 1, lights: 'bar', exhaust: 'quad', acc: '#ff7a1a', cal: '#ff7a1a', stripes: '#ff7a1a', horseshoe: 1 },
  },
  {
    id: 'mclaren720',
    name: 'Orbit 720',
    realName: 'McLaren 720S',
    stats: { accel: 1.24, handling: 1.2, damage: 0.95 },
    desc: 'Teardrop carbon cabin, twin high exhausts and a pop-up air brake',
    shape: { L: 4.55, W: 2.0, r: 0.15, hood: 0.44, roof: 1.06, deck: 0.66, ws: -0.75, rf: -0.05, rr: 0.45, rw: 1.45, flare: 0.06, tumble: 0.32 },
    style: { sup: 1, wing: 1, lights: 'thin', exhaust: 'twin', cal: '#ff8000' },
    look2d: 'rosso',
  },
  {
    id: 'senna',
    name: 'Orbit S',
    realName: 'McLaren Senna',
    stats: { accel: 1.32, handling: 1.32, damage: 0.85 },
    desc: 'Track weapon with a towering rear wing and yellow detailing',
    shape: { L: 4.74, W: 2.02, r: 0.12, hood: 0.36, roof: 1.02, deck: 0.62, ws: -0.85, rf: -0.15, rr: 0.35, rw: 1.25, flare: 0.08, tumble: 0.36 },
    style: { sup: 1, wing: 3, lights: 'thin', exhaust: 'twin', acc: '#ffd400', cal: '#ffd400' },
    look2d: 'phantom',
  },
  {
    id: 'regera',
    name: 'Spectre R',
    realName: 'Koenigsegg Regera',
    stats: { accel: 1.36, handling: 1.15, damage: 0.85 },
    desc: 'Smooth hybrid megacar with no gears and ring tail lights',
    shape: { L: 4.56, W: 2.05, r: 0.14, hood: 0.44, roof: 1.08, deck: 0.7, ws: -0.7, rf: -0.05, rr: 0.5, rw: 1.2, flare: 0.07 },
    style: { sup: 1, lights: 'ring', exhaust: 'center', cal: '#c0262d' },
    look2d: 'rosso',
  },
  {
    id: 'jesko',
    name: 'Spectre J',
    realName: 'Koenigsegg Jesko',
    stats: { accel: 1.38, handling: 1.28, damage: 0.8 },
    desc: 'Twin-turbo V8 monster with a swan-neck wing and ring tail lights',
    shape: { L: 4.61, W: 2.06, r: 0.13, hood: 0.42, roof: 1.06, deck: 0.66, ws: -0.75, rf: -0.1, rr: 0.42, rw: 1.15, flare: 0.08 },
    style: { sup: 1, wing: 3, lights: 'ring', exhaust: 'center', acc: '#ff4d4d', cal: '#c0262d' },
    look2d: 'phantom',
  },
  {
    id: 'bolide',
    name: 'Veyra Bolt',
    realName: 'Bugatti Bolide',
    stats: { accel: 1.4, handling: 1.3, damage: 0.7 },
    desc: 'Track-only W16 with X-shaped lights: the fastest car in the game',
    shape: { L: 4.76, W: 2.1, r: 0.11, hood: 0.34, roof: 0.92, deck: 0.62, ws: -0.8, rf: -0.25, rr: 0.15, rw: 0.85, flare: 0.1, tumble: 0.42 },
    style: { sup: 1, wing: 3, lights: 'x', exhaust: 'quad', acc: '#7fd7ff', cal: '#7fd7ff', fin: 1, horseshoe: 1 },
    look2d: 'phantom',
  },
];

/* ---------- derived values (no need to edit below) ---------- */
for (const c of CAR_LIST) {
  c.price = PRICES[c.id] || 0;
  c.topKmh = Math.min(MAX_KMH, TOP_SPEEDS[c.id] || TOP_SPEEDS.coupe);
  c.stats.speed = c.topKmh / TOP_SPEEDS.coupe; // relative to the starter coupe
  // real names only for cars based on a real model (starters and the concept keep their game name)
  c.show = USE_REAL_NAMES && c.price && !/not a real/i.test(c.realName) ? c.realName : c.name;
  c.look2d = c.look2d || (c.price && !['toro', 'rosso', 'veyra', 'phantom'].includes(c.id) ? 'veyra' : c.id);
}
window.CAR_LIST = CAR_LIST;
/* the coupe's top speed is the game's reference speed; MAX_KMH is the hard limit */
window.SPEED = { base: TOP_SPEEDS.coupe, max: MAX_KMH };
