/* Race songs: played in order as a playlist, each one to the end, then loops */
const SONGS = ['assets/music/song-1.mp3', 'assets/music/song-2.mp3', 'assets/music/song-3.mp3'];
(() => {
  const $ = id => document.getElementById(id);
  const cv = $('c'),
    ov = $('ov'),
    mmc = $('mm'),
    mx = mmc.getContext('2d');
  /* the drawing context; the showroom points it at small preview canvases for a moment */
  let ctx = cv.getContext('2d');
  let reduce = matchMedia('(prefers-reduced-motion: reduce)').matches,
    auto = false,
    coarse = matchMedia('(pointer:coarse)').matches;
  let W = 0,
    H = 0,
    vig;
  function rs() {
    W = cv.width = innerWidth;
    H = cv.height = innerHeight;
    vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vig.addColorStop(0, 'rgba(10,6,30,0)');
    vig.addColorStop(1, 'rgba(10,6,30,.55)');
  }
  addEventListener('resize', rs);
  rs();

  const SL = 200,
    RW = 2000,
    CH = 1000,
    DRAW = 240,
    MAXS = 12000,
    ACC = MAXS / 5,
    BRK = -MAXS,
    DEC = -MAXS / 5,
    OFFD = -MAXS / 2,
    OFF = MAXS / 4,
    PZ = 840;
  let LAPS = 3,
    wx = 0;
  const PTS = [25, 15, 10, 5];
  let CD = 0.84;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)),
    lerp = (a, b, p) => a + (b - a) * p;
  const ease = (a, b, p) => a + (b - a) * (0.5 - Math.cos(p * Math.PI) / 2),
    eIn = (a, b, p) => a + (b - a) * p * p,
    eOut = (a, b, p) => a + (b - a) * (1 - (1 - p) * (1 - p));
  const esc = s =>
    String(s).replace(
      /[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

  /* ---------- persistence: drivers, league, upgrades ---------- */
  const LS = (k, d) => {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch (e) {
      return d;
    }
  };
  const SS = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {}
  };
  let profiles = LS('ghatrun-profiles', {}),
    curKey = LS('ghatrun-user', null),
    league = LS('ghatrun-league', { bots: {} }),
    diffSel = LS('ghatrun-diff', 0.5),
    musicOn = LS('ghatrun-music', true),
    ctl = LS('ghatrun-ctl', matchMedia('(pointer:coarse)').matches ? 'joy' : 'keys'),
    sensSel = LS('ghatrun-sens', 1),
    rivSel = LS('ghatrun-riv', 3),
    lapsSel = LS('ghatrun-laps', 3),
    mapSel = LS('ghatrun-map', 'in-ghat');
  let me = profiles[curKey] || null;
  /* several tabs share one saved profile: always read the latest copy before changing it, so one tab never overwrites another tab's points */
  function reloadStore() {
    const p = LS('ghatrun-profiles', null);
    if (p)
      for (const k in p) {
        if (profiles[k]) Object.assign(profiles[k], p[k]);
        else profiles[k] = p[k];
      }
    const l = LS('ghatrun-league', null);
    if (l && l.bots) league = l;
    if (curKey && profiles[curKey]) me = profiles[curKey];
  }
  addEventListener('storage', e => {
    if (e.key === 'ghatrun-profiles' || e.key === 'ghatrun-league') {
      reloadStore();
      if (typeof ov !== 'undefined' && !ov.hidden && document.querySelector('#ov [data-a=buy]')) showGarage();
    }
  });
  const save = () => {
    SS('ghatrun-profiles', profiles);
    SS('ghatrun-league', league);
    SS('ghatrun-user', curKey);
    SS('ghatrun-diff', diffSel);
    SS('ghatrun-music', musicOn);
    SS('ghatrun-ctl', ctl);
    SS('ghatrun-sens', sensSel);
    SS('ghatrun-riv', rivSel);
    SS('ghatrun-laps', lapsSel);
    SS('ghatrun-map', mapSel);
    cloudPush();
  };
  /* ---------- online account: same drivers on any browser or device ---------- */
  /* cReady: the online copy has been loaded and merged. Until then nothing is pushed, so a slow or failed
     load can never overwrite the online save with this browser's data */
  let cUser = null,
    cReady = false,
    cTimer = 0,
    cMsg = '';
  function cloudPush() {
    if (!cUser || !cReady || !window.cloud) return;
    clearTimeout(cTimer);
    cTimer = setTimeout(() => {
      window.cloud
        .save(cloudData())
        .then(() => {
          if (cMsg.startsWith('Online save failed')) cMsg = '';
        })
        .catch(e => {
          cMsg =
            'Online save failed (' + (e.code || e.message) + '). Progress is still saved in this browser.';
          console.warn('cloud save failed', e);
        });
    }, 1200);
  }
  function cloudData() {
    return {
      profiles,
      curKey,
      league,
      settings: { diff: diffSel, music: musicOn, riv: rivSel, laps: lapsSel, map: mapSel },
    };
  }
  /* sign out: send any unsaved progress first, then clear this account's drivers from the browser so the
     next person to sign in here doesn't inherit (and upload) them */
  async function cloudSignOut() {
    if (!window.cloud) return;
    clearTimeout(cTimer);
    if (cUser && cReady)
      await window.cloud.save(cloudData()).catch(e => console.warn('cloud save failed', e));
    cReady = false;
    await window.cloud.signOut().catch(() => {});
    cUser = null;
    for (const k in profiles) delete profiles[k];
    league = { bots: {} };
    ensureBots();
    curKey = null;
    me = null;
    save();
    showMenu();
  }
  /* keep whichever copy of each driver has done more (more races, then more points) */
  const better = (a, b) =>
    !a
      ? b
      : !b
        ? a
        : (b.races || 0) > (a.races || 0) ||
            ((b.races || 0) === (a.races || 0) && (b.careerPts || 0) > (a.careerPts || 0))
          ? b
          : a;
  async function cloudPull() {
    try {
      const d = await window.cloud.load();
      if (d && d.profiles) for (const k in d.profiles) profiles[k] = better(profiles[k], d.profiles[k]);
      if (d && d.curKey && profiles[d.curKey]) curKey = d.curKey;
      /* league: keep whichever copy of each bot has raced more this season */
      if (d && d.league && d.league.bots)
        for (const k in d.league.bots) league.bots[k] = better(league.bots[k], d.league.bots[k]);
      /* settings follow the account; steering controls stay per device (touch vs keyboard) */
      const S = d && d.settings;
      if (S) {
        if (S.diff != null) diffSel = S.diff;
        if (S.music != null) musicOn = S.music;
        if (S.riv != null) rivSel = S.riv;
        if (S.laps != null) lapsSel = S.laps;
        if (S.map && MAPS[S.map] && S.map !== mapSel) loadMap(S.map);
        muLbl();
      }
      ensureBots();
      me = profiles[curKey] || null;
      if (me) {
        roll(me);
        applyUp();
      }
      cReady = true;
      cMsg = '';
      save();
      if (typeof state !== 'undefined' && state === 'menu') showMenu();
    } catch (e) {
      cMsg = 'Could not load your online save (' + (e.code || e.message) + ')';
      console.warn(e);
    }
  }
  addEventListener('cloudauth', e => {
    const was = cUser;
    cUser = e.detail;
    if (!cUser) cReady = false;
    if (cUser && (!was || was.uid !== cUser.uid)) {
      cReady = false;
      cloudPull();
    } else if (
      typeof state !== 'undefined' &&
      state === 'menu' &&
      !ov.hidden &&
      document.querySelector('#ov [data-a=cloud],#ov #cem,#ov [data-a=cout]')
    )
      showMenu();
  });
  const AUTHERR = {
    'auth/invalid-credential': 'Wrong email or password',
    'auth/wrong-password': 'Wrong email or password',
    'auth/user-not-found': 'No account with that email',
    'auth/email-already-in-use': 'That email already has an account. Sign in instead',
    'auth/weak-password': 'Password needs at least 6 characters',
    'auth/invalid-email': 'That email address looks wrong',
    'auth/too-many-requests': 'Too many tries. Wait a minute and try again',
    'auth/network-request-failed': 'No internet connection',
  };
  async function cloudGo(how) {
    const em = $('cem'),
      pw = $('cpw');
    if (!window.cloud) {
      cMsg = 'Online saves are still loading. Try again in a moment';
      return showCloud();
    }
    const e = (em && em.value.trim()) || '',
      p = (pw && pw.value) || '';
    if (!e) {
      em && em.focus();
      return;
    }
    try {
      if (how === 'reset') {
        await window.cloud.reset(e);
        cMsg = 'Password reset email sent to ' + e;
        return showCloud(e);
      }
      if (!p) {
        pw.focus();
        return;
      }
      cMsg = '';
      await (how === 'up' ? window.cloud.signUp(e, p) : window.cloud.signIn(e, p));
    } catch (x) {
      cMsg = AUTHERR[x.code] || x.message;
      showCloud(e);
    }
  }
  function showCloud(em) {
    if (cUser)
      return ovSet(
        '<h1 class="sm">Online save</h1><p>Signed in as <b>' +
          esc(cUser.email) +
          '</b>.</p><span class="hint">Your drivers, points, upgrades, cars, league and settings are saved online. Signing out removes them from this browser until you sign in again. Sign in with this email on any browser or device to carry on.</span>' +
          (cMsg ? '<span class="hint err">' + esc(cMsg) + '</span>' : '') +
          '<div class="row"><button class="btn alt" data-a="cout">Sign out</button><button class="btn alt" data-a="menu">Back</button></div>',
      );
    ovSet(
      '<h1 class="sm">Online save</h1><span class="hint">Sign in to keep your drivers and points on any browser or device. Without an account they are only saved in this browser.</span>' +
        '<input id="cem" class="fld" type="email" placeholder="Email" autocomplete="email" aria-label="Email" value="' +
        esc(em || '') +
        '">' +
        '<input id="cpw" class="fld" type="password" placeholder="Password (6+ characters)" autocomplete="current-password" aria-label="Password">' +
        (cMsg ? '<span class="hint err" role="alert">' + esc(cMsg) + '</span>' : '') +
        '<div class="row"><button class="btn" data-a="cin">Sign in</button><button class="btn alt" data-a="cup">Create account</button></div>' +
        '<div class="row"><button class="lnk" data-a="creset">Forgot password?</button><button class="lnk" data-a="' +
        (me ? 'menu' : 'switch') +
        '">Back</button></div>',
    );
    cMsg = '';
    const f = $('cem');
    if (f && !em) f.focus();
  }
  const COLS = ['#19d3c5', '#ff4d4d', '#4d94ff', '#4dff88', '#ffe14d', '#a371f7'];
  const RIV = [
    { id: 'b0', name: 'Speedy', col: '#4d94ff', off: -0.03 },
    { id: 'b1', name: 'Turbo', col: '#4dff88', off: 0 },
    { id: 'b2', name: 'Nitro', col: '#ffe14d', off: 0.03 },
    { id: 'b3', name: 'Blaze', col: '#ff7a3d', off: 0.05 },
    { id: 'b4', name: 'Ghost', col: '#c99fff', off: 0.01 },
  ];
  const TIERS = [
    { id: 'rookie', label: 'Rookie', icon: '🏁', min: 0, c: '#a0a0b0' },
    { id: 'bronze', label: 'Bronze', icon: '🥉', min: 100, c: '#e88a45' },
    { id: 'silver', label: 'Silver', icon: '🥈', min: 300, c: '#c8d0e0' },
    { id: 'gold', label: 'Gold', icon: '🥇', min: 700, c: '#ffd966' },
    { id: 'champion', label: 'Champion', icon: '👑', min: 1500, c: '#c99fff' },
  ];
  const tierOf = p => {
    let t = TIERS[0];
    for (const x of TIERS) if (p >= x.min) t = x;
    return t;
  };
  const nextTier = p => TIERS.find(x => x.min > p) || null;
  const UPG = [
    { id: 'topspeed', name: 'Top Speed', desc: 'Raise max speed', max: 4, cost: [20, 60, 150, 300] },
    { id: 'accel', name: 'Acceleration', desc: 'Faster pick-up', max: 4, cost: [20, 50, 120, 240] },
    { id: 'handling', name: 'Handling', desc: 'Tighter steering', max: 3, cost: [20, 80, 200] },
    { id: 'grip', name: 'Grip', desc: 'Less grass drag', max: 3, cost: [20, 60, 140] },
  ];
  /* each car shape drives differently: ts = top speed, ac = acceleration, hd = handling, tf = damage taken */
  const CARS = {
    coupe: { ts: 1, ac: 1, hd: 1, tf: 1, d: 'Balanced all-rounder' },
    hatch: {
      ts: 0.96,
      ac: 1.1,
      hd: 1.12,
      tf: 1,
      d: 'Quick off the line and agile, a little slower flat out',
    },
    wedge: { ts: 1.06, ac: 0.95, hd: 0.9, tf: 1, d: 'Highest top speed, but heavy in the bends' },
    van: { ts: 0.93, ac: 0.9, hd: 0.95, tf: 0.5, d: 'Slow and steady, takes half damage' },
    roadster: { ts: 1, ac: 1.05, hd: 1.2, tf: 1.35, d: 'Sharpest handling, but fragile' },
    pickup: { ts: 0.97, ac: 0.92, hd: 1, tf: 0.65, d: 'Tough and steady, takes less damage' },
    /* supercars, bought in the Garage showroom */
    toro: { ts: 1.12, ac: 1.18, hd: 1.04, tf: 1.05, d: 'Angular V12 bull with brutal acceleration' },
    rosso: { ts: 1.16, ac: 1.2, hd: 1.18, tf: 1, d: 'Italian thoroughbred, fast and razor sharp in bends' },
    veyra: { ts: 1.24, ac: 1.26, hd: 1.1, tf: 0.85, d: 'Quad-turbo W16 hypercar with an enormous top speed' },
    phantom: {
      ts: 1.3,
      ac: 1.34,
      hd: 1.24,
      tf: 0.85,
      d: 'Track-bred hypercar, the fastest thing on four wheels',
    },
  };
  const UP = { ts: 1, ac: 1, hd: 1, gr: 0, tf: 1 };
  function applyUp() {
    const u = (me && me.upg) || {},
      C = CARS[(me && me.body) || 'coupe'] || CARS.coupe;
    UP.ts = (1 + 0.05 * (u.topspeed || 0)) * C.ts;
    UP.ac = (1 + 0.15 * (u.accel || 0)) * C.ac;
    UP.hd = (1 + 0.12 * (u.handling || 0)) * C.hd;
    UP.gr = u.grip || 0;
    UP.tf = C.tf;
  }
  const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  /* a new league starts every calendar month; the previous month's points are archived in p.past */
  function seasonId() {
    const n = new Date();
    return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0');
  }
  const seasonName = id => {
    const m = /^(\d{4})-(\d{2})$/.exec(id);
    return m ? MONTHS[+m[2] - 1] + ' ' + m[1] : String(id).replace(/^(\d+)-S(\d+)$/, 'Season $2 · $1');
  };
  function seasonLabel() {
    return seasonName(seasonId()) + ' League';
  }
  function daysLeft() {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate() - n.getDate() + 1;
  }
  function roll(o) {
    const s = seasonId();
    if (o.season !== s) {
      if (o.season && o.seasonPts > 0) {
        o.past = o.past || [];
        o.past.unshift({ s: o.season, pts: o.seasonPts });
        o.past = o.past.slice(0, 12);
      }
      o.season = s;
      o.seasonPts = 0;
    }
  }
  function ensureBots() {
    for (const b of RIV) {
      if (!league.bots[b.id])
        league.bots[b.id] = {
          name: b.name,
          col: b.col,
          seasonPts: 0,
          careerPts: 0,
          wins: 0,
          races: 0,
          season: seasonId(),
        };
      roll(league.bots[b.id]);
    }
  }
  function newProfile(name, color, body) {
    return {
      name,
      color,
      body: body || 'coupe',
      points: 0,
      upg: {},
      careerPts: 0,
      seasonPts: 0,
      season: seasonId(),
      races: 0,
      wins: 0,
      ttBest: null,
      bestLap: LS('ghatrun-best', 0) || 0,
      history: [],
    };
  }
  function signIn(k) {
    curKey = k;
    me = profiles[k];
    roll(me);
    applyUp();
    save();
    showMenu();
  }
  ensureBots();
  if (me) {
    roll(me);
    applyUp();
  }

  /* ---------- track ---------- */
  const segs = [];
  const lastY = () => (segs.length ? segs[segs.length - 1].p2.y : 0);
  function add(c, y) {
    const n = segs.length;
    segs.push({
      i: n,
      p1: { y: lastY(), z: n * SL },
      p2: { y, z: (n + 1) * SL },
      c,
      cars: [],
      sp: [],
      cl: 0,
      k: ((n / 3) | 0) % 2,
    });
  }
  function sect(e, h, l, c, y) {
    e *= 3;
    h *= 3;
    l *= 3;
    y *= 3;
    const sy = lastY(),
      ey = sy + y * SL,
      t = e + h + l;
    for (let n = 0; n < e; n++) add(eIn(0, c, n / e), ease(sy, ey, n / t));
    for (let n = 0; n < h; n++) add(c, ease(sy, ey, (e + n) / t));
    for (let n = 0; n < l; n++) add(eOut(c, 0, n / l), ease(sy, ey, (e + h + n) / t));
  }
  /* ---------- countries, maps, themes ---------- */
  const SKYS = {
    dusk: ['#13113a', '#6a2a6c', '#e2605f', '#ffb765'],
    day: ['#2f7fd1', '#6fb4e8', '#bfe3f5', '#f4f1d8'],
    night: ['#04051a', '#0d1240', '#1d2a63', '#3a4a86'],
    dawn: ['#2b2a6b', '#a05a9a', '#f4a07a', '#ffd9a0'],
    agra: ['#5f86c0', '#d9a4a8', '#f7c9a2', '#ffe6bd'],
    grey: ['#4a5f6e', '#7b95a0', '#a9bcc0', '#cfd9d2'],
    haze: ['#2b6fb8', '#79b3de', '#f3d9a4', '#ffd28a'],
    pastel: ['#6fa8e0', '#a9cdf0', '#e6e3f4', '#fbe7ef'],
    bay: ['#3d5f99', '#c98a8a', '#f2b48a', '#ffd9a6'],
  };
  const TB = {
    lm: 0,
    stars: 0,
    sun: ['#fff1b0', '#ff9a4d', [255, 200, 120]],
    sy: 0.03,
    sr: 1,
    shape: 'ridge',
    lamp: 0,
    rain: 0,
    big: 0,
  };
  const mkT = o => Object.assign({}, TB, o);
  const MOON = ['#f4f6ff', '#c9d2f0', [190, 205, 255]],
    SUN = ['#fffbe0', '#ffe27a', [255, 240, 160]];
  const THEMES = {
    'in-ghat': mkT({
      sky: SKYS.dusk,
      fog: '#e0795e',
      stars: 1,
      mtn: ['#7a3a6e', '#3a2358'],
      road: ['#4b4a5a', '#444352'],
      grass: ['#2a4743', '#253f3c'],
      rum: ['#e9e2d0', '#d6452b'],
      trees: ['pine'],
      lamp: 1,
    }),
    'in-konkan': mkT({
      sky: SKYS.grey,
      fog: '#a9bfba',
      sun: ['#f6f6e6', '#cfd8d0', [240, 240, 220]],
      sy: 0.1,
      mtn: ['#5f7f72', '#3f6154'],
      road: ['#3d4046', '#373a40'],
      grass: ['#2f6a3c', '#285c34'],
      rum: ['#e9e2d0', '#e0a030'],
      trees: ['palm', 'pine'],
      lamp: 2,
      rain: 1,
    }),
    'in-agra': mkT({
      sky: SKYS.agra,
      fog: '#f3d3b4',
      sun: ['#fff3d0', '#ffb25a', [255, 205, 140]],
      sy: 0.05,
      sr: 1.1,
      lm: 'taj',
      mtn: ['#dcbba5', '#c9a68f'],
      shape: 'dome',
      road: ['#4f4d52', '#48464b'],
      grass: ['#b0b86e', '#a3ac62'],
      rum: ['#ffffff', '#ff9933'],
      trees: ['broad', 'palm'],
      lamp: 2,
    }),
    'br-rio': mkT({
      sky: SKYS.day,
      fog: '#c4e6ee',
      sun: SUN,
      sy: 0.14,
      mtn: ['#5d9a78', '#3a7558'],
      shape: 'dome',
      road: ['#52555c', '#4a4d54'],
      grass: ['#ecd9a3', '#e2cd92'],
      rum: ['#ffd400', '#1d9e4a'],
      trees: ['palm'],
      lamp: 2,
    }),
    'br-amazon': mkT({
      sky: SKYS.dawn,
      fog: '#b6c9a2',
      sun: ['#fff6d0', '#ffb347', [255, 210, 120]],
      sy: 0.04,
      mtn: ['#3f7a55', '#2a5d3f'],
      shape: 'dome',
      road: ['#5a4c42', '#52443b'],
      grass: ['#20602e', '#1a5226'],
      rum: ['#e9e2d0', '#e9e2d0'],
      trees: ['broad', 'palm'],
      lamp: 0,
    }),
    'mx-baja': mkT({
      sky: SKYS.haze,
      fog: '#ebc58e',
      sun: ['#ffffff', '#ffe9b0', [255, 235, 170]],
      sy: 0.15,
      mtn: ['#c4835a', '#9a5f3e'],
      shape: 'mesa',
      road: ['#4e4a48', '#47433f'],
      grass: ['#d8b574', '#cca967'],
      rum: ['#f2e6c8', '#c8472b'],
      trees: ['cactus'],
      lamp: 2,
    }),
    'mx-sierra': mkT({
      sky: SKYS.night,
      fog: '#1d2a63',
      stars: 1,
      sun: MOON,
      sy: 0.12,
      sr: 0.8,
      mtn: ['#2b2250', '#181237'],
      road: ['#3a3848', '#34323f'],
      grass: ['#2a3a2f', '#243229'],
      rum: ['#ff9a1f', '#7a3cff'],
      trees: ['cactus', 'pine'],
      lamp: 1,
    }),
    'jp-fuji': mkT({
      sky: SKYS.dawn,
      fog: '#f0b8a8',
      sun: ['#fff0e0', '#ff5a4d', [255, 130, 100]],
      sy: 0.02,
      sr: 1.15,
      mtn: ['#8a6fa0', '#5a4a82'],
      big: '#5d4d86',
      road: ['#3f3f4a', '#3a3a45'],
      grass: ['#3c6a4a', '#355f42'],
      rum: ['#ffffff', '#d6283b'],
      trees: ['pine', 'sakura'],
      lamp: 1,
    }),
    'in-mumbai': mkT({
      sky: SKYS.bay,
      fog: '#e9b98f',
      sun: ['#fff4d8', '#ffb35c', [255, 196, 130]],
      sy: 0.06,
      sr: 1.05,
      lm: 'bom',
      mtn: ['#b98d86', '#9c706f'],
      shape: 'dome',
      road: ['#46434a', '#403d44'],
      grass: ['#8e8a6a', '#85815f'],
      rum: ['#f2d24b', '#2b2a30'],
      trees: ['palm', 'broad'],
      lamp: 2,
      hz: 1,
    }),
    'jp-sakura': mkT({
      sky: SKYS.pastel,
      fog: '#f3dfe8',
      sun: SUN,
      sy: 0.13,
      mtn: ['#a9b6dc', '#8294c4'],
      big: '#7a8cc0',
      road: ['#4a4a55', '#44444f'],
      grass: ['#7cc08a', '#70b57e'],
      rum: ['#ffffff', '#f08ab0'],
      trees: ['sakura'],
      lamp: 2,
    }),
  };
  const FL = {
    in: '<rect width="30" height="7" fill="#ff9933"/><rect y="7" width="30" height="6" fill="#fff"/><rect y="13" width="30" height="7" fill="#138808"/><circle cx="15" cy="10" r="2.6" fill="none" stroke="#000080" stroke-width=".7"/><circle cx="15" cy="10" r=".7" fill="#000080"/>',
    br: '<rect width="30" height="20" fill="#009c3b"/><path d="M15 2 28 10 15 18 2 10z" fill="#ffdf00"/><circle cx="15" cy="10" r="4.6" fill="#002776"/><path d="M10.6 9.2q4.6-1.4 8.8 1.6" stroke="#fff" stroke-width=".9" fill="none"/>',
    mx: '<rect width="10" height="20" fill="#006847"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#ce1126"/><circle cx="15" cy="10" r="2.6" fill="#a8742a"/><circle cx="15" cy="10" r="1.4" fill="#4d8a3a"/>',
    jp: '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#bc002d"/>',
  };
  const flag = id =>
    '<svg class="fl" viewBox="0 0 30 20" width="30" height="20" aria-hidden="true">' + FL[id] + '</svg>';
  const COUNTRIES = [
    { id: 'in', name: 'India', flag: '🇮🇳' },
    { id: 'br', name: 'Brazil', flag: '🇧🇷' },
    { id: 'mx', name: 'Mexico', flag: '🇲🇽' },
    { id: 'jp', name: 'Japan', flag: '🇯🇵' },
  ];
  /* layout rows: [enter, hold, leave, curve, hill] */
  const MAPS = {
    'in-ghat': {
      c: 'in',
      name: 'Ghat Run',
      dif: 2,
      desc: 'Sunset climb through the Western Ghats',
      lay: [
        [25, 25, 25, 0, 0],
        [30, 40, 30, 3, 8],
        [25, 30, 25, -4, 20],
        [20, 20, 20, 0, -14],
        [30, 30, 30, 5, 0],
        [15, 15, 15, -5, -6],
        [20, 25, 20, 2, 25],
        [30, 10, 30, -3, -25],
        [40, 60, 40, 0, 0],
        [25, 25, 25, 5, 0],
        [25, 25, 25, -5, 0],
      ],
    },
    'in-konkan': {
      c: 'in',
      name: 'Konkan Monsoon',
      dif: 3,
      cap: 3.2,
      desc: 'Wet hairpins down the Konkan coast',
      lay: [
        [25, 25, 25, 0, 0],
        [20, 40, 20, 5, 15],
        [15, 20, 15, -5, 22],
        [20, 30, 20, 5, 8],
        [15, 15, 15, -5, -12],
        [20, 30, 20, 4, 28],
        [25, 10, 25, -5, -22],
        [30, 40, 30, 0, -30],
        [18, 20, 18, 5, 0],
        [18, 20, 18, -5, 0],
        [25, 30, 25, 3, 8],
      ],
    },
    'in-agra': {
      c: 'in',
      name: 'Agra Expressway',
      dif: 1,
      cap: 2.5,
      desc: 'Hazy golden morning past the Taj Mahal',
      lay: [
        [30, 50, 30, 0, 0],
        [30, 40, 30, 2, 1],
        [30, 40, 30, -2, -1],
        [25, 60, 25, 0, 2],
        [30, 40, 30, 3, 0],
        [30, 40, 30, -3, -2],
        [40, 70, 40, 0, 0],
      ],
    },
    'in-mumbai': {
      c: 'in',
      name: 'Mumbai Mayhem',
      dif: 3,
      cap: 3,
      hz: 1,
      desc: 'Marine Drive at golden hour: rickshaws, cyclists, bullock carts, cows and potholes',
      lay: [
        [25, 30, 25, 0, 0],
        [20, 30, 20, 3, 2],
        [20, 25, 20, -3, -1],
        [25, 40, 25, 0, 3],
        [18, 20, 18, 4, 0],
        [18, 20, 18, -4, -3],
        [25, 30, 25, 2, 0],
        [30, 50, 30, 0, -1],
        [20, 20, 20, -3, 0],
        [20, 25, 20, 3, 0],
      ],
    },
    'br-rio': {
      c: 'br',
      name: 'Rio Coast',
      dif: 1,
      cap: 2.5,
      desc: 'Fast, flowing beach road with long straights',
      lay: [
        [30, 40, 30, 0, 0],
        [30, 50, 30, 2, 2],
        [30, 40, 30, -2, -2],
        [25, 60, 25, 0, 4],
        [30, 30, 30, 3, 0],
        [30, 30, 30, -3, -4],
        [40, 80, 40, 0, 0],
        [25, 25, 25, 4, 0],
        [25, 25, 25, -4, 0],
      ],
    },
    'br-amazon': {
      c: 'br',
      name: 'Amazon Highway',
      dif: 2,
      cap: 3,
      desc: 'Misty dawn drive through the rainforest',
      lay: [
        [25, 25, 25, 0, 0],
        [25, 35, 25, 3, 6],
        [25, 30, 25, -3, -3],
        [20, 20, 20, 0, 10],
        [30, 30, 30, 4, -6],
        [20, 25, 20, -4, 4],
        [25, 40, 25, 0, -8],
        [25, 25, 25, 3, 0],
        [25, 25, 25, -3, 0],
        [30, 50, 30, 0, 6],
      ],
    },
    'mx-baja': {
      c: 'mx',
      name: 'Baja Desert',
      dif: 2,
      cap: 3.5,
      desc: 'Long burning straights, sudden hard corners',
      lay: [
        [30, 70, 30, 0, 0],
        [15, 15, 15, 5, 0],
        [40, 80, 40, 0, 6],
        [15, 15, 15, -5, -2],
        [25, 40, 25, 2, 10],
        [25, 40, 25, -2, -12],
        [40, 80, 40, 0, 0],
        [15, 15, 15, 5, 0],
        [15, 15, 15, -5, 0],
      ],
    },
    'mx-sierra': {
      c: 'mx',
      name: 'Sierra Madre Night',
      dif: 3,
      cap: 3.4,
      desc: 'Moonlit mountain switchbacks',
      lay: [
        [25, 25, 25, 0, 0],
        [25, 40, 25, -3, 12],
        [20, 25, 20, 4, 18],
        [20, 25, 20, -4, -6],
        [25, 30, 25, 3, 20],
        [20, 20, 20, -5, -18],
        [25, 40, 25, 0, -20],
        [25, 25, 25, 5, 0],
        [25, 25, 25, -5, 0],
      ],
    },
    'jp-fuji': {
      c: 'jp',
      name: 'Fuji Touge',
      dif: 3,
      cap: 3.5,
      desc: 'Tight dawn mountain pass under Mt. Fuji',
      lay: [
        [20, 20, 20, 0, 0],
        [20, 30, 20, 4, 10],
        [15, 20, 15, -5, 14],
        [15, 20, 15, 5, 0],
        [15, 20, 15, -5, -10],
        [20, 20, 20, 4, 16],
        [15, 15, 15, -5, -14],
        [25, 40, 25, 0, -16],
        [18, 20, 18, 5, 0],
        [18, 20, 18, -5, 0],
      ],
    },
    'jp-sakura': {
      c: 'jp',
      name: 'Sakura Pass',
      dif: 1,
      cap: 2.5,
      desc: 'Easy spring cruise between cherry trees',
      lay: [
        [30, 40, 30, 0, 0],
        [30, 40, 30, 3, 4],
        [30, 40, 30, -3, -2],
        [25, 40, 25, 2, 8],
        [25, 40, 25, -2, -8],
        [30, 50, 30, 0, 0],
        [25, 30, 25, 4, 2],
        [25, 30, 25, -4, -4],
      ],
    },
  };
  if (!MAPS[mapSel]) mapSel = 'in-ghat';
  let TH = THEMES[mapSel];
  const bestLap = p => (mapSel === 'in-ghat' ? p.bestLap || 0 : (p.lapBy || {})[mapSel] || 0);
  const setBestLap = (p, t) => {
    if (mapSel === 'in-ghat') p.bestLap = t;
    else (p.lapBy = p.lapBy || {})[mapSel] = t;
  };
  /* time-trial records are kept per map and per race length */
  const bk = () => mapSel + (lapsSel === 3 ? '' : '#' + lapsSel);
  const bestTT = p => (bk() === 'in-ghat' ? p.ttBest || null : (p.ttBy || {})[bk()] || null);
  const setBestTT = (p, t) => {
    if (bk() === 'in-ghat') p.ttBest = t;
    else (p.ttBy = p.ttBy || {})[bk()] = t;
  };

  /* ---------- track ---------- */
  let N = 0,
    trackVer = 0,
    TL = 0,
    cpPos = [];
  const CPF = [0.25, 0.5, 0.75],
    mmP = [];
  function buildTrack(lay) {
    segs.length = 0;
    /* cap = sharpest bend allowed on this map, so it stays drivable at speed (Ghat Run keeps its original bends) */
    const cap = MAPS[mapSel].cap || 5;
    for (const r of lay) sect(r[0], r[1], r[2], clamp(r[3], -cap, cap), r[4]);
    sect(30, 20, 30, 0, -lastY() / (SL * 3));
    segs[segs.length - 1].p2.y = 0;
    N = segs.length;
    TL = N * SL;
    for (const s of segs) {
      if (TH.lamp && s.i % 14 === 0) {
        s.sp.push({ t: 'L', o: -1.3 }, { t: 'L', o: 1.3 });
      } else if (s.i % 4 === 2 && Math.random() < 0.6) {
        const d = Math.random() < 0.5 ? -1 : 1;
        s.sp.push({
          t: 'P',
          o: d * (1.6 + Math.random() * 3.5),
          z: 0.7 + Math.random() * 0.7,
          k: (Math.random() * TH.trees.length) | 0,
        });
      }
    }
    /* Mumbai: potholes everywhere (never on the start straight or under a gate) */
    if (MAPS[mapSel].hz)
      for (const s of segs) {
        s.ph = [];
        if (s.i > 24 && s.i < N - 6 && Math.random() < 0.06) {
          const n = 1;
          for (let j = 0; j < n; j++)
            s.ph.push({
              o: (Math.random() * 2 - 1) * 0.85,
              w: 0.12 + Math.random() * 0.1,
              f: Math.random() * 0.5 + 0.25,
            });
        }
      }
    segs[8].gate = 1;
    CPF.forEach(f => {
      const g = segs[Math.floor(N * f)];
      if (g) g.ph = [];
    });
    segs[8].ph = [];
    cpPos = CPF.map(f => Math.floor(N * f) * SL);
    CPF.forEach(f => {
      segs[Math.floor(N * f)].gate = 2;
    });
    /* minimap path: integrate curvature, remove mean turn, close the loop */
    mmP.length = 0;
    let mean = 0;
    for (const s of segs) mean += s.c;
    mean /= N;
    let h = 0,
      x = 0,
      y = 0;
    for (const s of segs) {
      h += (s.c - mean) * 0.0022 * 3.2;
      x += Math.cos(h);
      y += Math.sin(h);
      mmP.push([x, y]);
    }
    const ex = mmP[N - 1][0],
      ey = mmP[N - 1][1];
    mmP.forEach((p, i) => {
      p[0] -= (ex * i) / (N - 1);
      p[1] -= (ey * i) / (N - 1);
    });
    let a = 1e9,
      b = -1e9,
      c = 1e9,
      d = -1e9;
    for (const p of mmP) {
      a = Math.min(a, p[0]);
      b = Math.max(b, p[0]);
      c = Math.min(c, p[1]);
      d = Math.max(d, p[1]);
    }
    const pad = 12,
      sc = Math.min((mmc.width - pad * 2) / (b - a || 1), (mmc.height - pad * 2) / (d - c || 1)),
      ox = (mmc.width - (b - a) * sc) / 2,
      oy = (mmc.height - (d - c) * sc) / 2;
    for (const p of mmP) {
      p[0] = ox + (p[0] - a) * sc;
      p[1] = oy + (p[1] - c) * sc;
    }
  }
  function loadMap(id) {
    mapSel = MAPS[id] ? id : 'in-ghat';
    TH = THEMES[mapSel];
    buildTrack(MAPS[mapSel].lay);
    trackVer++;
  }
  loadMap(mapSel);

  /* ---------- traffic + rivals ---------- */
  const cars = [],
    TC = ['#d9d4c7', '#7a8fb8', '#c9a24a', '#8c3f5b', '#5f7a58', '#e6e6e6', '#b5603a'];
  function spawn(rivals, traffic = true) {
    segs.forEach(s => (s.cars.length = 0));
    cars.length = 0;
    for (let i = 0; i < (traffic ? 70 : 0); i++) {
      const c = {
        z: 1800 + Math.random() * (TL - 3600),
        o: [-0.7, 0, 0.7][(Math.random() * 3) | 0] + (Math.random() - 0.5) * 0.2,
        sp: MAXS * (0.22 + Math.random() * 0.3),
        col: TC[i % TC.length],
        body: ['coupe', 'hatch', 'wedge', 'van'][(i * 7 + 3) % 4],
        pd: 0,
      };
      c.s = Math.floor(c.z / SL) % N;
      segs[c.s].cars.push(c);
      cars.push(c);
    }
    /* Mumbai street life: slow rickshaws and bullock carts in the lanes, cows that wander about (in every mode, including time trial) */
    if (MAPS[mapSel].hz && state !== 'menu') {
      const K = ['rick', 'cyc', 'rick', 'cart', 'cow', 'rick', 'cyc', 'cow'],
        CYC = ['#e8433f', '#2f7de1', '#f2b705', '#3bb273'];
      for (let i = 0; i < 40; i++) {
        const k = K[i % K.length],
          c = {
            hz: k,
            z: 2600 + ((i + Math.random() * 0.6) / 40) * (TL - 4200),
            o: k === 'cow' ? Math.random() * 1.6 - 0.8 : [-0.7, 0, 0.7][(Math.random() * 3) | 0],
            sp:
              MAXS *
              (k === 'rick'
                ? 0.2 + Math.random() * 0.12
                : k === 'cyc'
                  ? 0.1 + Math.random() * 0.05
                  : k === 'cart'
                    ? 0.06 + Math.random() * 0.03
                    : 0),
            col: k === 'cyc' ? CYC[i % CYC.length] : k === 'rick' ? '#f2c418' : '#7a5a3a',
            ph: Math.random() * 6.3,
            pd: 0,
          };
        c.base = c.o;
        c.s = Math.floor(c.z / SL) % N;
        segs[c.s].cars.push(c);
        cars.push(c);
      }
    }
    if (rivals)
      RIV.slice(0, rivSel).forEach((b, i) => {
        const home = [-0.55, 0.55, 0, -0.25, 0.3][i],
          d = [300, 520, 740, 930, 1120][i];
        const c = {
          rv: 1,
          id: b.id,
          name: b.name,
          col: b.col,
          body: ['wedge', 'hatch', 'van', 'roadster', 'pickup'][i % 5],
          tr: ['', 'block', 'swipe', 'block', 'swipe'][i],
          d,
          z: (d + PZ) % TL,
          o: home,
          home,
          tgtO: home,
          sp: 0,
          top:
            MAXS *
            clamp((0.55 + 0.45 * diffSel + b.off) * [0.97, 1, 1.03][(MAPS[mapSel].dif || 2) - 1], 0.4, 1.04),
          cu: [0.045, 0.02, 0.03, 0.025, 0.035][i],
          pd: 0,
          fin: false,
          ft: 0,
        };
        c.s = Math.floor(c.z / SL) % N;
        segs[c.s].cars.push(c);
        cars.push(c);
      });
  }
  function ahead(c, lane, maxd, back) {
    let best = null;
    const chk = (z, o, sp) => {
      let dz = z - c.z;
      if (dz < -TL / 2) dz += TL;
      if (dz > TL / 2) dz -= TL;
      if (dz > -back && dz < maxd && Math.abs(o - lane) < 0.42 && (!best || dz < best.dz)) best = { dz, sp };
    };
    for (const k of cars) if (k !== c) chk(k.z, k.o, k.sp);
    chk(pos + PZ, px, speed);
    return best;
  }
  function rivalStep(c, dt) {
    const seg = segs[Math.floor(c.z / SL) % N];
    let tgt = state === 'count' ? 0 : c.top * (1 - Math.min(0.22, Math.abs(seg.c) * c.cu));
    /* Speedy brakes early for bends, Turbo carries speed through them, Nitro goes in short bursts */
    if (c.id === 'b2') {
      c.bt = (c.bt == null ? 6 : c.bt) - dt;
      if (c.bt <= 0) {
        c.bt = 8 + Math.random() * 6;
        c.bb = 2.5;
      }
      if (c.bb > 0) {
        c.bb -= dt;
        tgt *= 1.09;
      }
    }
    const ob = ahead(c, c.o, SL * 7, 0);
    if (ob) {
      const alts = [-0.7, 0, 0.7]
        .filter(l => Math.abs(l - c.o) > 0.3 && !ahead(c, l, SL * 9, SL * 0.7))
        .sort((a, b) => Math.abs(a - c.o) - Math.abs(b - c.o));
      if (alts.length) c.tgtO = alts[0];
      else tgt = Math.min(tgt, Math.max(ob.sp * 0.97, c.top * 0.3));
    } else if (!ahead(c, c.home, SL * 9, SL * 0.7)) c.tgtO = c.home;
    /* Turbo and Blaze slide into your lane to block when you are close behind; Nitro and Ghost lean into you when you are alongside. Only at 50% pace and above. */
    if (diffSel >= 0.5 && state === 'race' && !pFin && c.tr) {
      let dzp = c.z - (pos + PZ);
      if (dzp > TL / 2) dzp -= TL;
      if (dzp < -TL / 2) dzp += TL;
      if (c.tr === 'block' && dzp > SL * 3 && dzp < SL * 9 && c.sp >= speed * 0.9)
        c.tgtO = clamp(px, -0.8, 0.8);
      else if (c.tr === 'swipe' && Math.abs(dzp) < SL * 1.2 && Math.abs(px - c.o) < 0.6)
        c.tgtO = clamp(px, -0.8, 0.8);
    }
    if (c.sw > 0) c.sw -= dt;
    const ls = c.tr ? 0.95 : 0.7;
    c.o += clamp(c.tgtO - c.o, -dt * ls, dt * ls);
    c.sp = Math.max(0, c.sp + clamp(tgt - c.sp, -MAXS * dt, ACC * 0.85 * dt));
    if (seg.ph && seg.ph.length && c.lph !== seg.i) {
      c.lph = seg.i;
      for (const h of seg.ph)
        if (Math.abs(c.o - h.o) < h.w + 0.1) {
          c.sp *= 0.9;
          break;
        }
    }
    c.d += c.sp * dt;
    c.z = (c.d + PZ) % TL;
    if (!c.fin && c.d >= LAPS * TL) {
      c.fin = true;
      c.ft = time;
    }
  }

  /* ---------- state ---------- */
  let state = 'menu',
    mode = 'bots',
    pos = 0,
    speed = 0,
    px = 0,
    steer = 0,
    nit = 100,
    boost = 0,
    shake = 0,
    cd = 0,
    goT = 0,
    time = 0,
    lapStart = 0,
    laps = [],
    lap = 1,
    close = 0,
    tg = 0,
    off1 = 0,
    toastT = 0,
    muted = false,
    gasOn = false,
    cpNext = 0,
    pFin = false,
    pFt = 0,
    lastCd = 4,
    hudT = 1,
    runId = 0,
    selCol = COLS[0],
    placeNow = 0,
    loginOpen = false,
    selBody = 'coupe';
  const BODIES = [
    ['coupe', 'Coupe'],
    ['hatch', 'Hatch'],
    ['wedge', 'Wedge'],
    ['van', 'Van'],
    ['roadster', 'Roadster'],
    ['pickup', 'Pickup'],
  ];
  /* supercars: [id, name, price in points] */
  const SUPER = [
    ['toro', 'Toro V12', 150],
    ['rosso', 'Rosso GT', 300],
    ['veyra', 'Veyra 16', 600],
    ['phantom', 'Phantom X', 1000],
  ];
  const isSuper = b => SUPER.some(s => s[0] === b);
  const owns = (p, b) => !isSuper(b) || ((p && p.owned) || []).includes(b);
  const inp = { L: 0, R: 0, G: 0, B: 0, N: 0, X: 0, D: 0 };
  let dLock = false,
    wreck = false,
    lph = -1,
    holes = 0,
    dmg = 0,
    da = 0,
    drifting = false,
    dfx = 0,
    tour = null,
    chal = null;
  /* Mumbai: the car can't be damaged. Everywhere else, reaching 0% wrecks it and you lose the race */
  const inv = () => !!MAPS[mapSel].hz;
  function hurt(x) {
    if (!inv()) dmg = Math.min(1, dmg + x * UP.tf);
  }
  /* D switches drift on and stays on until D is pressed again */
  function setDriftLock(on) {
    dLock = on;
    document.querySelector('#tc .dr').classList.toggle('on', on);
    if (state === 'race' || state === 'count') toast(on ? 'Drift on' : 'Drift off', 0, 'cp');
  }
  const vib = ms => {
    try {
      navigator.vibrate && navigator.vibrate(ms);
    } catch (e) {}
  };
  /* shows the on-screen controls on every device (touch or mouse); 'keys' hides them on computers */
  function tui() {
    const on = ctl !== 'keys' || coarse;
    document.body.classList.toggle('tui', on);
    document.body.classList.toggle('joy', ctl === 'joy');
    auto = on;
  }
  tui();
  /* on-screen steering joystick: drag left or right, the further you push the harder it steers */
  {
    const joy = $('joy'),
      jk = joy.firstElementChild;
    let jid = null;
    const jset = e => {
      const r = joy.getBoundingClientRect(),
        cx = r.left + r.width / 2,
        cy = r.top + r.height / 2;
      let dx = e.clientX - cx,
        dy = e.clientY - cy;
      const R = r.width / 2 - 33,
        d = Math.hypot(dx, dy);
      if (d > R) {
        dx *= R / d;
        dy *= R / d;
      }
      jk.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      const x = dx / R,
        ax = Math.abs(x);
      inp.X = ax < 0.1 ? 0 : clamp(Math.sign(x) * ax * (0.55 + 0.45 * ax) * sensSel, -1, 1);
    };
    joy.addEventListener('pointerdown', e => {
      e.preventDefault();
      jid = e.pointerId;
      try {
        joy.setPointerCapture(jid);
      } catch (_) {}
      jset(e);
    });
    joy.addEventListener('pointermove', e => {
      if (e.pointerId === jid) jset(e);
    });
    const jend = e => {
      if (e.pointerId !== jid) return;
      jid = null;
      inp.X = 0;
      jk.style.transform = '';
    };
    joy.addEventListener('pointerup', jend);
    joy.addEventListener('pointercancel', jend);
  }
  const stars = Array.from({ length: 50 }, () => [Math.random(), Math.random(), Math.random() < 0.2 ? 2 : 1]);
  const sparks = [];
  spawn(false);

  /* ---------- input ---------- */
  const KM = {
    ArrowLeft: 'L',
    ArrowRight: 'R',
    ArrowUp: 'G',
    KeyW: 'G',
    ArrowDown: 'B',
    KeyS: 'B',
    Space: 'N',
    ShiftLeft: 'N',
    ShiftRight: 'N',
    KeyZ: 'D',
    KeyC: 'D',
  };
  addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') {
      if (e.code === 'Enter') {
        if (e.target.id === 'nm') createDriver();
        else if (e.target.id === 'cpw') cloudGo('in');
      }
      return;
    }
    const k = KM[e.code];
    if (k) {
      inp[k] = 1;
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    }
    if (e.code === 'KeyD' && !e.repeat && (state === 'race' || state === 'count')) setDriftLock(!dLock);
    if (e.code === 'KeyM') {
      muted = !muted;
      muLbl();
    }
    if (e.code === 'Escape' && (state === 'race' || state === 'count' || state === 'done')) showMenu();
  });
  addEventListener('keyup', e => {
    const k = KM[e.code];
    if (k) inp[k] = 0;
  });
  document.querySelectorAll('#tc button').forEach(b => {
    const k = b.dataset.k,
      on = e => {
        e.preventDefault();
        inp[k] = 1;
        b.classList.add('on');
      },
      offf = () => {
        inp[k] = 0;
        b.classList.remove('on');
      };
    b.addEventListener('pointerdown', on);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => b.addEventListener(t, offf));
  });
  addEventListener('contextmenu', e => e.preventDefault());

  /* ---------- audio: engine, sfx, music ---------- */
  let ac,
    o1,
    o2,
    fl,
    ga,
    mg,
    mNext = 0,
    mStep = 0;
  const MEL = [220, 277, 329, 392, 440, 392, 329, 277, 246, 329, 392, 466, 523, 466, 392, 329],
    BAS = [110, 110, 87.3, 98];
  function audio() {
    if (ac) {
      if (ac.state === 'suspended') ac.resume();
      return;
    }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      o1 = ac.createOscillator();
      o2 = ac.createOscillator();
      o1.type = 'sawtooth';
      o2.type = 'square';
      fl = ac.createBiquadFilter();
      fl.type = 'lowpass';
      ga = ac.createGain();
      ga.gain.value = 0;
      o1.connect(fl);
      o2.connect(fl);
      fl.connect(ga);
      ga.connect(ac.destination);
      o1.start();
      o2.start();
      mg = ac.createGain();
      mg.gain.value = 0.07;
      mg.connect(ac.destination);
      mNext = ac.currentTime + 0.1;
      musicTick();
    } catch (e) {
      ac = null;
    }
  }
  function note(f, t, d, ty, v) {
    const o = ac.createOscillator(),
      g = ac.createGain();
    o.type = ty;
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g);
    g.connect(mg);
    o.start(t);
    o.stop(t + d + 0.02);
  }
  function musicTick() {
    if (!ac) return;
    if (musicOn && !muted && state === 'menu' && sp.paused) {
      while (mNext < ac.currentTime + 0.3) {
        const s = mStep % 16;
        note(MEL[s], mNext, 0.2, 'triangle', 0.9);
        if (s % 4 === 0) note(BAS[((mStep / 4) | 0) % 4], mNext, 0.5, 'sawtooth', 0.5);
        mNext += 60 / 140 / 2;
        mStep++;
      }
    } else mNext = ac.currentTime + 0.05;
    setTimeout(musicTick, 100);
  }
  const SV = 0.7;
  let sp = new Audio(),
    plIdx = 0,
    plLoad = true,
    sv = 0;
  sp.loop = false;
  sp.preload = 'auto';
  sp.volume = 0;
  /* playlist: every song plays to the end, then the next one starts; after the last it goes back to the first */
  sp.onended = () => {
    plIdx = (plIdx + 1) % SONGS.length;
    plLoad = true;
    syncSong();
  };
  function syncSong() {
    if (document.hidden) {
      sp.pause();
      return;
    }
    /* the playlist never stops on its own: it plays through menu, race and results, and goes back to song 1 after the last one */
    const want = musicOn && !muted,
      tv = state === 'count' || state === 'race' ? SV : SV * 0.55;
    if (want) {
      if (plLoad) {
        sp.src = SONGS[plIdx];
        sp.currentTime = 0;
        plLoad = false;
        sv = 0;
      }
      sv = sv < tv ? Math.min(tv, sv + 0.1) : Math.max(tv, sv - 0.05);
      if (sp.paused) sp.play().catch(() => {});
    } else {
      if (sv > 0.04) sv = Math.max(0, sv - 0.14);
      else {
        sp.pause();
        sv = 0;
      }
    }
    sp.volume = sv;
  }
  setInterval(syncSong, 100);
  /* browsers (iPhone/Safari especially) only allow sound to start inside a tap or key press, so try to start the song right there */
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach(t => addEventListener(t, () => syncSong(), true));
  function snd() {
    if (!ac) return;
    const t = ac.currentTime,
      sg = Math.min(5.99, (speed / MAXS) * 6),
      gr = Math.floor(sg),
      rp = sg - gr,
      fq = 48 + rp * 95 + gr * 10 + boost * 25;
    o1.frequency.setTargetAtTime(fq, t, 0.02);
    o2.frequency.setTargetAtTime(fq * 0.5, t, 0.02);
    fl.frequency.setTargetAtTime(350 + rp * 700 + boost * 900, t, 0.05);
    ga.gain.setTargetAtTime(
      muted ? 0 : state === 'menu' ? 0.015 : 0.06 + (gasOn ? 0.04 : 0) + boost * 0.04,
      t,
      0.05,
    );
  }
  function blip(f, d, ty, v) {
    if (!ac || muted) return;
    const o = ac.createOscillator(),
      g = ac.createGain(),
      t = ac.currentTime;
    o.type = ty;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * (ty === 'sine' ? 1.5 : 0.4), t + d);
    g.gain.setValueAtTime(v || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g);
    g.connect(ac.destination);
    o.start();
    o.stop(t + d);
  }
  function arp(fs, gap, d) {
    fs.forEach((f, i) => setTimeout(() => blip(f, d, 'sine', 0.14), i * gap));
  }
  const beep = () => blip(440, 0.15, 'sine', 0.16),
    goSnd = () => arp([523, 659, 784, 1047], 60, 0.18),
    cpSnd = () => arp([880, 1320], 50, 0.12),
    fanfare = () => arp([523, 659, 784, 1047, 1318], 90, 0.3);
  function muLbl() {
    const on = musicOn && !muted,
      b = $('mu');
    b.textContent = '♪ Music ' + (on ? 'On' : 'Off');
    b.classList.toggle('off', !on);
    b.setAttribute('aria-pressed', on);
  }
  $('mu').onclick = () => {
    audio();
    if (muted) muted = false;
    else musicOn = !musicOn;
    if (musicOn) muted = false;
    save();
    muLbl();
    syncSong();
  };
  muLbl();

  /* ---------- helpers ---------- */
  const fmt = t => Math.floor(t / 60) + ':' + (t % 60).toFixed(2).padStart(5, '0');
  function toast(t, bad, cls) {
    const e = $('toast');
    e.textContent = t;
    e.className = 'on' + (bad ? ' bad' : '') + (cls ? ' ' + cls : '');
    toastT = cls === 'cp' ? 1.2 : 0.9;
  }
  function confetti(n) {
    if (reduce) return;
    const cs = ['#ff7a3d', '#ffc15e', '#4d94ff', '#4dff88', '#ff4d88', '#a371f7', '#fff4e0'];
    for (let i = 0; i < n; i++)
      setTimeout(() => {
        const e = document.createElement('div');
        e.className = 'cf';
        const w = 6 + Math.random() * 8,
          d = 2 + Math.random() * 2;
        e.style.cssText =
          'left:' +
          (10 + Math.random() * 80) +
          'vw;width:' +
          w +
          'px;height:' +
          w * 1.6 +
          'px;background:' +
          cs[(Math.random() * cs.length) | 0] +
          ';animation-duration:' +
          d +
          's';
        document.body.appendChild(e);
        setTimeout(() => e.remove(), d * 1000 + 200);
      }, i * 30);
  }
  const dist = () => (pFin ? LAPS * TL : laps.length * TL + pos);
  function ranking() {
    const L = [
      { me: 1, name: me ? me.name : 'You', col: me ? me.color : COLS[0], d: dist(), fin: pFin, ft: pFt },
    ];
    for (const c of cars)
      if (c.rv) L.push({ id: c.id, name: c.name, col: c.col, d: c.d, fin: c.fin, ft: c.ft });
    L.sort((a, b) => (a.fin && b.fin ? a.ft - b.ft : a.fin ? -1 : b.fin ? 1 : b.d - a.d));
    return L;
  }

  /* ---------- race flow ---------- */
  function begin(m) {
    loginOpen = false;
    audio();
    mode = m;
    runId++;
    LAPS = chal ? chal.laps : lapsSel;
    wx = TH.rain ? 0 : chal ? (chal.wx ? 1 : 0) : Math.random() < 0.25 ? 1 : 0;
    ov.hidden = true;
    document.body.classList.add('play');
    document.body.classList.toggle('tt', m === 'tt');
    pos = 0;
    speed = 0;
    px = 0;
    steer = 0;
    time = 0;
    lapStart = 0;
    laps = [];
    lap = 1;
    nit = 100;
    dmg = 0;
    lph = -1;
    holes = 0;
    wreck = false;
    dLock = false;
    document.querySelector('#tc .dr').classList.remove('on');
    da = 0;
    dfx = 0;
    boost = 0;
    close = 0;
    cpNext = 0;
    pFin = false;
    pFt = 0;
    sparks.length = 0;
    lastCd = 4;
    hudT = 1;
    applyUp();
    state = 'count';
    spawn(m === 'bots', false);
    cd = 3.2;
    goT = 0;
    syncSong();
    if (tour)
      setTimeout(() => {
        if (state === 'count')
          toast('Race ' + (tour.i + 1) + ' of ' + tour.maps.length + ' · ' + MAPS[mapSel].name, 0, 'cp');
      }, 100);
    if (wx)
      setTimeout(() => {
        if (state === 'count') toast('Rain · less grip', 0, 'cp');
      }, 1400);
  }
  function lapDone() {
    const lt = time - lapStart;
    lapStart = time;
    laps.push(lt);
    cpNext = 0;
    if (me) {
      const bl = bestLap(me);
      if (!bl || lt < bl) {
        setBestLap(me, lt);
        save();
      }
    }
    if (laps.length >= LAPS) {
      pFin = true;
      pFt = time;
      state = 'done';
      const pl = ranking().findIndex(r => r.me);
      toast(mode !== 'tt' ? ORD[Math.min(pl, 5)] + ' · Chequered flag' : 'Chequered flag');
      fanfare();
      const id = runId,
        t0 = Date.now(),
        chk = () => {
          if (id !== runId) return;
          finish();
        };
      setTimeout(chk, 4000);
    } else {
      lap = laps.length + 1;
      toast('Lap ' + laps.length + ' done');
    }
  }
  function settle() {
    reloadStore();
    const rk = ranking();
    let place = rk.findIndex(r => r.me),
      pts = 0,
      nb = false;
    if (wreck) {
      if (place < rk.length - 1) {
        rk.push(rk.splice(place, 1)[0]);
        place = rk.length - 1;
      }
      roll(me);
      me.races++;
      if (chal) chal.res = { ok: false, got: false };
    } else if (mode !== 'tt') {
      pts = PTS[Math.min(place, 3)];
      roll(me);
      me.points += pts;
      me.careerPts += pts;
      me.seasonPts += pts;
      me.races++;
      if (place === 0) me.wins++;
      rk.forEach((r, i) => {
        if (r.me) return;
        const b = league.bots[r.id];
        if (!b) return;
        roll(b);
        const p = PTS[Math.min(i, 3)];
        b.seasonPts += p;
        b.careerPts += p;
        b.races++;
        if (i === 0) b.wins++;
      });
    } else if (chal) {
      const ok = pFt <= chal.par,
        got = ok && !(me.daily && me.daily.d === chal.key && me.daily.done);
      if (got) {
        roll(me);
        me.daily = { d: chal.key, done: 1 };
        me.points += 20;
        me.careerPts += 20;
        me.seasonPts += 20;
      }
      nb = false;
      chal.res = { ok, got };
    } else {
      const ob = bestTT(me);
      nb = !ob || pFt < ob;
      if (nb) setBestTT(me, pFt);
    }
    me.history.unshift({
      place: place + 1,
      pts,
      time: wreck ? 0 : pFt,
      wreck: wreck || undefined,
      mode,
      map: mapSel,
      ts: Date.now(),
      laps: laps.slice(),
    });
    me.history = me.history.slice(0, 10);
    save();
    return { rk, place, pts, nb };
  }
  function finish() {
    const R = settle();
    state = 'menu';
    spawn(false);
    document.body.classList.remove('play');
    const top = !wreck && R.place < 3 && mode !== 'tt';
    if (top) confetti(R.place === 0 ? 80 : R.place === 1 ? 35 : 15);
    let h,
      tourHtml = '',
      row =
        '<div class="row"><button class="btn" data-a="again" id="go2">Race again</button><button class="btn alt" data-a="menu">Menu</button></div>';
    if (tour && mode === 'bots') {
      const T = tourDone(R);
      tourHtml = T.html;
      row = T.row;
    }
    if (wreck) {
      h =
        '<h2>Wrecked</h2><p class="big">You lose</p><p>Your car hit 0%. No points this time. Upgrade in the Garage or pick a tougher car.</p>' +
        (mode !== 'tt'
          ? '<ul>' +
            R.rk
              .map(
                (r, i) =>
                  '<li class="' +
                  (r.me ? 'me' : '') +
                  '"><span><i style="background:' +
                  r.col +
                  '"></i>' +
                  (r.me ? 'DNF' : i + 1 + '.') +
                  ' ' +
                  esc(r.name) +
                  (r.me ? ' (you)' : '') +
                  '</span><b>' +
                  (r.fin ? fmt(r.ft) : '—') +
                  '</b></li>',
              )
              .join('') +
            '</ul>'
          : '');
    } else if (mode !== 'tt') {
      h =
        '<h2>' +
        (R.place === 0 ? 'Victory' : 'Chequered flag') +
        '</h2><p class="big">' +
        ORD[Math.min(R.place, 5)] +
        ' · ' +
        fmt(pFt) +
        '</p><ul>' +
        R.rk
          .map(
            (r, i) =>
              '<li class="' +
              (r.me ? 'me' : '') +
              '"><span><i style="background:' +
              r.col +
              '"></i>' +
              (i + 1) +
              '. ' +
              esc(r.name) +
              (r.me ? ' (you)' : '') +
              '</span><b>' +
              (r.fin ? fmt(r.ft) : '—') +
              '</b></li>',
          )
          .join('') +
        '</ul>' +
        '<div class="banner"><small>Points earned</small><b>+' +
        R.pts +
        '</b><small>Total ' +
        me.points +
        ' pts</small></div>';
    } else {
      const lapList =
        '<ul>' +
        laps.map((l, i) => '<li><span>Lap ' + (i + 1) + '</span><b>' + fmt(l) + '</b></li>').join('') +
        '</ul>';
      if (chal) {
        const r = chal.res || {};
        h =
          '<h2>' +
          (r.ok ? 'Target beaten' : 'Missed it') +
          '</h2><p class="big">' +
          fmt(pFt) +
          '</p>' +
          lapList +
          '<div class="banner tt"><small>Daily challenge · target ' +
          fmt(chal.par) +
          '</small><b>' +
          (r.ok
            ? r.got
              ? '+20 pts'
              : 'Already claimed today'
            : '+' + (pFt - chal.par).toFixed(1) + 's over') +
          '</b><small>Total ' +
          me.points +
          ' pts</small></div>';
        if (r.got) confetti(60);
      } else {
        h =
          '<h2>Time trial</h2><p class="big">' +
          fmt(pFt) +
          '</p>' +
          lapList +
          '<div class="banner tt"><small>Personal best</small><b>' +
          fmt(bestTT(me)) +
          '</b><small>' +
          (R.nb ? 'New personal best' : 'Not beaten this time') +
          '</small></div>';
        if (R.nb) confetti(40);
      }
    }
    h +=
      tourHtml +
      '<p>' +
      close +
      ' close passes.' +
      (MAPS[mapSel].hz ? ' ' + holes + (holes === 1 ? ' pothole.' : ' potholes.') : '') +
      ' Best lap ' +
      (bestLap(me) ? fmt(bestLap(me)) : '–') +
      '.</p>' +
      row;
    ovSet(h);
    const g = $('go2');
    if (g) g.focus();
  }

  /* ---------- tours, daily challenge, settings, help ---------- */
  const TOURS = [
    {
      id: 'world',
      name: 'World Tour',
      desc: 'One race in every country',
      maps: ['in-ghat', 'br-rio', 'mx-baja', 'jp-fuji'],
    },
    {
      id: 'india',
      name: 'India Cup',
      desc: 'Ghats, Konkan rain, the road to Agra and Mumbai traffic',
      maps: ['in-ghat', 'in-konkan', 'in-agra', 'in-mumbai'],
    },
    {
      id: 'dusk',
      name: 'Night and Rain',
      desc: 'Moonlit mountains, rainforest and monsoon',
      maps: ['mx-sierra', 'br-amazon', 'in-konkan'],
    },
  ];
  const TP = [10, 7, 5, 3, 2, 1];
  function showTours() {
    reloadStore();
    ovSet(
      '<h1 class="sm">Tours</h1><p>Race a series of maps. Each race scores 10 · 7 · 5 · 3 · 2 · 1. The top three overall win bonus points.</p><div class="menu">' +
        TOURS.map(t => {
          const b = me.tours && me.tours[t.id];
          return (
            '<button class="mb" data-a="tour" data-v="' +
            t.id +
            '"><b>' +
            t.name +
            '</b><small>' +
            t.desc +
            ' · ' +
            t.maps.length +
            ' races' +
            (b ? ' · best ' + ORD[Math.min(b - 1, 5)] : '') +
            '</small></button>'
          );
        }).join('') +
        '</div>' +
        '<button class="btn alt" data-a="menu">Back</button>',
    );
  }
  function startTour(id) {
    const t = TOURS.find(x => x.id === id);
    if (!t) return;
    tour = { id: t.id, name: t.name, maps: t.maps, i: 0, pts: {}, nm: {}, col: {} };
    chal = null;
    loadMap(t.maps[0]);
    pos = 0;
    px = 0;
    cpNext = 0;
    save();
    begin('bots');
  }
  function nextTour() {
    if (!tour) return;
    tour.i++;
    loadMap(tour.maps[tour.i]);
    pos = 0;
    px = 0;
    cpNext = 0;
    save();
    begin('bots');
  }
  function tourDone(R) {
    R.rk.forEach((r, i) => {
      const k = r.me ? 'me' : r.id;
      tour.pts[k] = (tour.pts[k] || 0) + TP[Math.min(i, 5)];
      tour.nm[k] = r.name;
      tour.col[k] = r.col;
    });
    const st = Object.keys(tour.pts)
        .map(k => ({ k, pts: tour.pts[k] }))
        .sort((a, b) => b.pts - a.pts || (a.k === 'me' ? -1 : 1)),
      last = tour.i >= tour.maps.length - 1,
      mp = st.findIndex(x => x.k === 'me');
    let html =
      '<div class="sec">' +
      esc(tour.name) +
      ' · race ' +
      (tour.i + 1) +
      ' of ' +
      tour.maps.length +
      '</div><ul>' +
      st
        .map(
          (x, i) =>
            '<li class="' +
            (x.k === 'me' ? 'me' : '') +
            '"><span><i style="background:' +
            tour.col[x.k] +
            '"></i>' +
            (i + 1) +
            '. ' +
            esc(tour.nm[x.k]) +
            (x.k === 'me' ? ' (you)' : '') +
            '</span><b>' +
            x.pts +
            ' pts</b></li>',
        )
        .join('') +
      '</ul>';
    if (!last)
      return {
        html,
        row:
          '<div class="row"><button class="btn" data-a="tournext" id="go2">Next race · ' +
          esc(MAPS[tour.maps[tour.i + 1]].name) +
          '</button><button class="btn alt" data-a="menu">Quit tour</button></div>',
      };
    const bonus = [50, 30, 15][mp] || 0;
    if (bonus) {
      roll(me);
      me.points += bonus;
      me.careerPts += bonus;
      me.seasonPts += bonus;
    }
    me.tours = me.tours || {};
    if (!me.tours[tour.id] || mp + 1 < me.tours[tour.id]) me.tours[tour.id] = mp + 1;
    save();
    if (mp === 0) confetti(100);
    html =
      '<div class="banner"><small>Tour complete · ' +
      esc(tour.name) +
      '</small><b>' +
      ORD[Math.min(mp, 5)] +
      ' overall</b><small>' +
      (bonus ? '+' + bonus + ' bonus pts · ' : '') +
      'Total ' +
      me.points +
      ' pts</small></div>' +
      html;
    return {
      html,
      row: '<div class="row"><button class="btn" data-a="tours" id="go2">Tours</button><button class="btn alt" data-a="menu">Menu</button></div>',
    };
  }
  /* daily challenge: one map, lap count and weather per day (the same for everyone); beat the target time for 20 points, once a day */
  function dayKey() {
    const n = new Date();
    return (
      n.getFullYear() +
      '-' +
      String(n.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(n.getDate()).padStart(2, '0')
    );
  }
  function mapLen(id) {
    let n = 80;
    for (const r of MAPS[id].lay) n += r[0] + r[1] + r[2];
    return n * 3 * SL;
  }
  function dailyPick() {
    const k = dayKey();
    let h = 7;
    for (const c of k) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const ids = Object.keys(MAPS),
      id = ids[h % ids.length],
      laps = [1, 2, 3][(h >> 3) % 3];
    return { key: k, map: id, laps, wx: (h >> 5) % 4 === 0, par: (laps * mapLen(id)) / (MAXS * 0.82) };
  }
  function dailyText() {
    const d = dailyPick(),
      done = me.daily && me.daily.d === d.key && me.daily.done;
    return (
      MAPS[d.map].name +
      ' · ' +
      d.laps +
      (d.laps === 1 ? ' lap' : ' laps') +
      (d.wx || THEMES[d.map].rain ? ' · rain' : '') +
      ' · beat ' +
      fmt(d.par) +
      (done ? ' · done today' : ' · +20 pts')
    );
  }
  function startDaily() {
    const d = dailyPick();
    tour = null;
    loadMap(d.map);
    pos = 0;
    px = 0;
    cpNext = 0;
    chal = { key: d.key, laps: d.laps, wx: d.wx, par: d.par };
    save();
    begin('tt');
  }
  function showSettings() {
    ovSet(
      '<h1 class="sm">Settings</h1>' +
        '<div class="chips">Steering <button class="chip' +
        (ctl === 'joy' ? ' on' : '') +
        '" data-a="ctl" data-v="joy">Joystick</button><button class="chip' +
        (ctl === 'btns' ? ' on' : '') +
        '" data-a="ctl" data-v="btns">Buttons</button>' +
        (coarse
          ? ''
          : '<button class="chip' +
            (ctl === 'keys' ? ' on' : '') +
            '" data-a="ctl" data-v="keys">Keys only</button>') +
        '</div>' +
        '<div class="chips">Joystick sensitivity ' +
        [
          ['Low', 0.8],
          ['Normal', 1],
          ['High', 1.25],
        ]
          .map(
            a =>
              '<button class="chip' +
              (sensSel === a[1] ? ' on' : '') +
              '" data-a="sens" data-v="' +
              a[1] +
              '">' +
              a[0] +
              '</button>',
          )
          .join('') +
        '</div>' +
        '<div class="chips">Music <button class="chip' +
        (musicOn ? ' on' : '') +
        '" data-a="music">' +
        (musicOn ? 'On' : 'Off') +
        '</button></div>' +
        '<div class="row"><button class="btn alt" data-a="help">How to play</button><button class="btn alt" data-a="menu">Back</button></div>',
    );
  }
  const key = k => '<kbd>' + k + '</kbd>';
  function showHelp() {
    const row = (k, t) => '<li><span>' + k + '</span><b>' + t + '</b></li>';
    ovSet(
      '<h1 class="sm">How to play</h1>' +
        '<p>Race the rivals, finish on the podium and spend your points in the Garage.</p>' +
        '<div class="help">' +
        '<section class="card"><b>Keyboard</b><ul class="keys">' +
        row(key('←') + key('→'), 'Steer') +
        row(key('↑') + ' or ' + key('W'), 'Gas') +
        row(key('↓') + ' or ' + key('S'), 'Brake') +
        row(key('Space'), 'Nitro (hold)') +
        row(key('D'), 'Drift on / off') +
        row(key('Z') + ' ' + key('C'), 'Drift (hold)') +
        row(key('M'), 'Mute') +
        row(key('Esc'), 'Quit race') +
        '</ul></section>' +
        '<section class="card"><b>Touch</b><small>Drag the joystick or hold the arrows to steer. Gas is automatic. Hold Nitro to boost and Drift in bends. Switch control style in Settings.</small></section>' +
        '<section class="card"><b>Drift &amp; nitro</b><small>Drift through bends to hold your line and refill nitro. Passing close to another car refills it too.</small></section>' +
        '<section class="card"><b>Damage</b><small>Crashes and side swipes damage your car and cut its top speed. If it reaches 0% you are wrecked and lose the race.</small></section>' +
        '<section class="card"><b>Mumbai Mayhem</b><small>Dodge rickshaws, cyclists, bullock carts, wandering cows and potholes. Your car is invincible here, but every hit slows you down.</small></section>' +
        '<section class="card"><b>Points</b><small>1st 25 · 2nd 15 · 3rd 10 · 4th 5. Spend them on upgrades and supercars in the Garage showroom. The Daily Challenge gives 20 points once a day.</small></section>' +
        '<section class="card"><b>Online save</b><small>Sign in with email to keep your drivers, points, league and settings on any device.</small></section>' +
        '</div>' +
        '<div class="row"><button class="btn" data-a="menu">Let\'s race</button><button class="btn alt" data-a="settings">Settings</button></div>',
    );
  }

  /* ---------- menus ---------- */
  function pickMap(id) {
    loadMap(id);
    pos = 0;
    px = 0;
    cpNext = 0;
    save();
    showMenu();
  }
  function ovSet(h) {
    ov.innerHTML = h;
    ov.hidden = false;
    ov.scrollTop = 0;
  }
  function showMenu() {
    if (state === 'done' && (pFin || wreck) && me) settle();
    else reloadStore();
    wreck = false;
    tour = null;
    chal = null;
    loginOpen = false;
    runId++;
    state = 'menu';
    spawn(false);
    document.body.classList.remove('play');
    if (!me) return showLogin();
    const t = tierOf(me.careerPts);
    ovSet(
      '<h1>Worldwide<br>Wheels</h1><div class="who"><span class="tier" style="--c:' +
        t.c +
        '">' +
        t.icon +
        ' ' +
        t.label +
        '</span><b>' +
        esc(me.name) +
        '</b><span class="pt">' +
        me.points +
        ' pts</span><button class="lnk" data-a="switch">Switch driver</button><button class="lnk" data-a="cloud">' +
        (cUser ? '☁ ' + esc(cUser.email) : '☁ Sign in to save online') +
        '</button></div>' +
        '<div class="chips" role="radiogroup" aria-label="Country">Country ' +
        COUNTRIES.map(
          c =>
            '<button class="chip cc' +
            (c.id === MAPS[mapSel].c ? ' on' : '') +
            '" data-a="country" data-v="' +
            c.id +
            '">' +
            flag(c.id) +
            c.name +
            '</button>',
        ).join('') +
        '</div>' +
        '<div class="maps" role="radiogroup" aria-label="Map">' +
        Object.keys(MAPS)
          .filter(k => MAPS[k].c === MAPS[mapSel].c)
          .map(k => {
            const T = THEMES[k];
            return (
              '<button class="mc' +
              (k === mapSel ? ' on' : '') +
              '" role="radio" aria-checked="' +
              (k === mapSel) +
              '" data-a="map" data-v="' +
              k +
              '" style="--s1:' +
              T.sky[1] +
              ';--s2:' +
              T.sky[2] +
              ';--s3:' +
              T.road[0] +
              '"><b>' +
              MAPS[k].name +
              '</b><small>' +
              MAPS[k].desc +
              '</small><span class="df" aria-label="Difficulty ' +
              MAPS[k].dif +
              ' of 3">' +
              '<i class="f"></i>'.repeat(MAPS[k].dif) +
              '<i></i>'.repeat(3 - MAPS[k].dif) +
              '</span></button>'
            );
          })
          .join('') +
        '</div>' +
        '<div class="menu">' +
        '<button class="mb" data-a="bots"><b>vs Bots</b><small>Race ' +
        rivSel +
        ' rivals over ' +
        lapsSel +
        (lapsSel === 1 ? ' lap' : ' laps') +
        ' · 1st 25 · 2nd 15 · 3rd 10 · 4th 5 pts</small></button>' +
        '<button class="mb" data-a="tt"><b>Time Trial</b><small>Solo run, no rivals · best ' +
        (bestTT(me) ? fmt(bestTT(me)) : '–') +
        '</small></button>' +
        '<button class="mb" data-a="tours"><b>Tours</b><small>Multi-race championships · trophies and bonus points</small></button>' +
        '<button class="mb" data-a="daily"><b>Daily Challenge</b><small>' +
        dailyText() +
        '</small></button>' +
        '<button class="mb" data-a="garage"><b>Garage</b><small>Spend points to upgrade your car</small></button>' +
        '<button class="mb" data-a="league"><b>League</b><small>Monthly league · leaderboard · race history</small></button>' +
        '<button class="mb" data-a="help"><b>How to Play</b><small>Controls, drifting, damage and tips</small></button></div>' +
        '<div class="chips">Laps ' +
        [1, 3, 5]
          .map(
            v =>
              '<button class="chip' +
              (lapsSel === v ? ' on' : '') +
              '" data-a="laps" data-v="' +
              v +
              '">' +
              v +
              '</button>',
          )
          .join('') +
        '</div>' +
        '<div class="chips">Rivals ' +
        [3, 5]
          .map(
            v =>
              '<button class="chip' +
              (rivSel === v ? ' on' : '') +
              '" data-a="riv" data-v="' +
              v +
              '">' +
              v +
              '</button>',
          )
          .join('') +
        '</div>' +
        '<div class="chips">Rival pace ' +
        [0.25, 0.5, 0.75, 1]
          .map(
            v =>
              '<button class="chip' +
              (diffSel === v ? ' on' : '') +
              '" data-a="diff" data-v="' +
              v +
              '">' +
              v * 100 +
              '%</button>',
          )
          .join('') +
        '</div>' +
        '<div class="row"><button class="chip" data-a="settings">Settings</button></div>' +
        '<span class="hint k">Steer with the arrow keys. Space nitro, S brake, D drift on/off, M mute, Esc quit.</span>' +
        '<span class="hint t">Drag the joystick (or hold the arrows) to steer and press Nitro to boost. Gas is automatic.</span>',
    );
  }
  function showLogin(sw) {
    loginOpen = true;
    const ks = Object.keys(profiles);
    ovSet(
      '<h1 class="sm">Worldwide<br>Wheels</h1><p>' +
        (ks.length
          ? 'Pick a driver or create a new one.'
          : 'Create your driver. Points, upgrades and times are saved on this device.') +
        '</p>' +
        (ks.length
          ? '<div class="chips">' +
            ks
              .map(
                k =>
                  '<button class="chip" data-a="pick" data-v="' +
                  esc(k) +
                  '">' +
                  esc(profiles[k].name) +
                  '</button>',
              )
              .join('') +
            '</div>'
          : '') +
        '<input id="nm" maxlength="16" placeholder="Driver name" autocomplete="off" aria-label="Driver name">' +
        '<div class="sws" role="radiogroup" aria-label="Car colour">' +
        COLS.map(
          c =>
            '<button class="sw' +
            (c === selCol ? ' on' : '') +
            '" data-a="col" data-v="' +
            c +
            '" style="background:' +
            c +
            '" aria-label="Car colour ' +
            c +
            '"></button>',
        ).join('') +
        '</div>' +
        '<div class="chips" role="radiogroup" aria-label="Car shape">' +
        BODIES.map(
          b =>
            '<button class="chip' +
            (b[0] === selBody ? ' on' : '') +
            '" data-a="body" data-v="' +
            b[0] +
            '">' +
            b[1] +
            '</button>',
        ).join('') +
        '</div>' +
        '<span class="hint" id="cdesc">' +
        CARS[selBody].d +
        '</span>' +
        '<div class="row"><button class="btn" data-a="create">Start career</button>' +
        (me && sw ? '<button class="btn alt" data-a="menu">Back</button>' : '') +
        '</div>' +
        '<button class="lnk" data-a="cloud">' +
        (cUser ? '☁ Signed in as ' + esc(cUser.email) : '☁ Already have an account? Sign in') +
        '</button>',
    );
  }
  function createDriver() {
    const el = $('nm');
    if (!el) return;
    const name = el.value.trim();
    if (!name) {
      el.focus();
      return;
    }
    const k = name.toLowerCase(),
      fresh = !profiles[k];
    if (fresh) profiles[k] = newProfile(name, selCol, selBody);
    else {
      profiles[k].color = selCol;
      profiles[k].body = selBody;
    }
    signIn(k);
    if (fresh) showHelp();
  }
  function showGarage() {
    reloadStore();
    const C = CARS[me.body] || CARS.coupe;
    ovSet(
      '<h1 class="sm">Garage</h1><p>' +
        me.points +
        ' pts to spend</p>' +
        '<div class="sec">Your car</div><div class="chips" role="radiogroup" aria-label="Car shape">' +
        BODIES.concat(SUPER.filter(s => owns(me, s[0])))
          .map(
            b =>
              '<button class="chip' +
              (b[0] === me.body ? ' on' : '') +
              '" data-a="gbody" data-v="' +
              b[0] +
              '">' +
              b[1] +
              '</button>',
          )
          .join('') +
        '</div>' +
        '<div class="sws" role="radiogroup" aria-label="Car colour">' +
        COLS.map(
          c =>
            '<button class="sw' +
            (c === me.color ? ' on' : '') +
            '" data-a="gcol" data-v="' +
            c +
            '" style="background:' +
            c +
            '" aria-label="Car colour ' +
            c +
            '"></button>',
        ).join('') +
        '</div>' +
        '<span class="hint">' +
        C.d +
        '</span><div class="sec">Showroom</div><div class="show">' +
        SUPER.map(([id, name, price]) => {
          const c = CARS[id],
            mine = owns(me, id),
            bar = (l, v) =>
              '<div class="st"><span>' +
              l +
              '</span><i><u style="width:' +
              Math.round(v * 100) +
              '%"></u></i></div>';
          return (
            '<div class="sc' +
            (me.body === id ? ' on' : '') +
            '"><canvas class="pv" width="320" height="170" data-b="' +
            id +
            '"></canvas><b>' +
            name +
            '</b><small>' +
            c.d +
            '</small>' +
            bar('Speed', (c.ts - 0.9) / 0.42) +
            bar('Acceleration', (c.ac - 0.85) / 0.5) +
            bar('Handling', (c.hd - 0.85) / 0.4) +
            bar('Toughness', (1.4 - c.tf) / 0.9) +
            (mine
              ? me.body === id
                ? '<button class="btn" disabled>Driving</button>'
                : '<button class="btn alt" data-a="gbody" data-v="' + id + '">Drive</button>'
              : '<button class="btn" data-a="buycar" data-v="' +
                id +
                '"' +
                (me.points < price ? ' disabled' : '') +
                '>' +
                price +
                ' pts</button>') +
            '</div>'
          );
        }).join('') +
        '</div><div class="sec">Upgrades</div><div class="grid">' +
        UPG.map(u => {
          const lv = me.upg[u.id] || 0,
            mx = lv >= u.max,
            c = mx ? 0 : u.cost[lv];
          return (
            '<div class="card"><b>' +
            u.name +
            '</b><small>' +
            u.desc +
            '</small><div class="pips">' +
            Array.from({ length: u.max }, (_, i) => '<i class="' + (i < lv ? 'f' : '') + '"></i>').join('') +
            '</div>' +
            (mx
              ? '<button class="btn" disabled>MAX</button>'
              : '<button class="btn" data-a="buy" data-v="' +
                u.id +
                '"' +
                (me.points < c ? ' disabled' : '') +
                '>' +
                c +
                ' pts</button>') +
            '</div>'
          );
        }).join('') +
        '</div>' +
        '<button class="btn alt" data-a="menu">Back</button>',
    );
    ov.querySelectorAll('canvas.pv').forEach(c => preview(c, c.dataset.b, me.color));
  }
  /* draw a car into a small canvas for the showroom */
  function preview(c, body, col) {
    const main = ctx,
      g = c.getContext('2d'),
      bg = g.createLinearGradient(0, 0, 0, c.height);
    bg.addColorStop(0, '#2a2552');
    bg.addColorStop(0.62, '#4a2f5e');
    bg.addColorStop(0.63, '#1c1a30');
    bg.addColorStop(1, '#0f0e1c');
    g.fillStyle = bg;
    g.fillRect(0, 0, c.width, c.height);
    const sp = g.createRadialGradient(
      c.width / 2,
      c.height * 0.63,
      4,
      c.width / 2,
      c.height * 0.63,
      c.width * 0.45,
    );
    sp.addColorStop(0, 'rgba(255,193,94,.45)');
    sp.addColorStop(1, 'rgba(255,193,94,0)');
    g.fillStyle = sp;
    g.fillRect(0, 0, c.width, c.height);
    ctx = g;
    try {
      car(c.width / 2, c.height * 0.86, c.width * 0.62, col, 0, 0, 1, body);
    } finally {
      ctx = main;
    }
  }
  function buyCar(id) {
    reloadStore();
    const s = SUPER.find(x => x[0] === id);
    if (!s || owns(me, id) || me.points < s[2]) return;
    me.points -= s[2];
    me.owned = (me.owned || []).concat(id);
    me.body = id;
    applyUp();
    save();
    fanfare();
    confetti(50);
    toast(s[1] + ' is yours');
    showGarage();
  }
  function buy(id) {
    reloadStore();
    const u = UPG.find(x => x.id === id),
      lv = me.upg[id] || 0;
    if (!u || lv >= u.max || me.points < u.cost[lv]) return;
    me.points -= u.cost[lv];
    me.upg[id] = lv + 1;
    applyUp();
    save();
    blip(700, 0.14, 'sine');
    showGarage();
  }
  function showLeague() {
    reloadStore();
    roll(me);
    ensureBots();
    const t = tierOf(me.careerPts),
      n = nextTier(me.careerPts),
      pr = n ? Math.round(((me.careerPts - t.min) / (n.min - t.min)) * 100) : 100;
    const rows = [];
    for (const k in profiles) {
      const p = profiles[k];
      roll(p);
      rows.push({ name: p.name, col: p.color, pts: p.seasonPts, tier: tierOf(p.careerPts), me: p === me });
    }
    for (const k in league.bots) {
      const b = league.bots[k];
      rows.push({ name: b.name, col: b.col, pts: b.seasonPts, tier: tierOf(b.careerPts), bot: 1 });
    }
    rows.sort((a, b) => b.pts - a.pts);
    const H = me.history.length
      ? me.history
          .map(
            r =>
              '<li><span>' +
              (r.mode === 'tt' ? 'Time trial' : ORD[Math.min(r.place - 1, 5)] + ' · vs Bots') +
              (r.map && MAPS[r.map] ? ' · ' + MAPS[r.map].name : '') +
              '</span><b>' +
              fmt(r.time) +
              (r.mode !== 'tt' ? ' · +' + r.pts : '') +
              '</b></li>',
          )
          .join('')
      : '<li><span>No races yet</span></li>';
    ovSet(
      '<h1 class="sm">League</h1><div class="sec">' +
        seasonLabel() +
        ' · ' +
        daysLeft() +
        (daysLeft() === 1 ? ' day' : ' days') +
        ' left</div><div class="who"><span class="tier" style="--c:' +
        t.c +
        '">' +
        t.icon +
        ' ' +
        t.label +
        '</span><span>' +
        me.careerPts +
        ' career pts' +
        (n ? ' · next ' + n.label + ' at ' + n.min : ' · top tier') +
        '</span></div>' +
        '<div class="bar" style="--c:' +
        t.c +
        '"><i style="width:' +
        pr +
        '%"></i></div>' +
        '<div class="stats"><div><b>' +
        me.seasonPts +
        '</b><small>This month</small></div><div><b>' +
        me.races +
        '</b><small>Races</small></div><div><b>' +
        me.wins +
        '</b><small>Wins</small></div></div>' +
        '<div class="sec">Monthly leaderboard</div><ul>' +
        rows
          .slice(0, 8)
          .map(
            (r, i) =>
              '<li class="' +
              (r.me ? 'me' : '') +
              '"><span><i style="background:' +
              r.col +
              '"></i>' +
              (i + 1) +
              '. ' +
              esc(r.name) +
              (r.bot ? ' (bot)' : '') +
              (r.me ? ' (you)' : '') +
              ' ' +
              r.tier.icon +
              '</span><b>' +
              r.pts +
              '</b></li>',
          )
          .join('') +
        '</ul>' +
        '<div class="sec">Past leagues</div><ul>' +
        (me.past && me.past.length
          ? me.past
              .map(r => '<li><span>' + esc(seasonName(r.s)) + '</span><b>' + r.pts + ' pts</b></li>')
              .join('')
          : '<li><span>None yet</span></li>') +
        '</ul>' +
        '<div class="sec">Recent races</div><ul>' +
        H +
        '</ul><button class="btn alt" data-a="menu">Back</button>',
    );
  }
  ov.addEventListener('click', e => {
    audio();
    const b = e.target.closest('[data-a]');
    if (!b || b.disabled) return;
    const a = b.dataset.a,
      v = b.dataset.v;
    if (a === 'bots' || a === 'tt') begin(a);
    else if (a === 'again') begin(mode);
    else if (a === 'garage') showGarage();
    else if (a === 'league') showLeague();
    else if (a === 'menu') showMenu();
    else if (a === 'buy') buy(v);
    else if (a === 'switch') showLogin(true);
    else if (a === 'pick') signIn(v);
    else if (a === 'create') createDriver();
    else if (a === 'cloud') showCloud();
    else if (a === 'cin') cloudGo('in');
    else if (a === 'cup') cloudGo('up');
    else if (a === 'creset') cloudGo('reset');
    else if (a === 'cout') cloudSignOut();
    else if (a === 'col') {
      selCol = v;
      ov.querySelectorAll('.sw').forEach(s => s.classList.toggle('on', s.dataset.v === v));
    } else if (a === 'body') {
      selBody = v;
      ov.querySelectorAll('[data-a=body]').forEach(s => s.classList.toggle('on', s.dataset.v === v));
      const cd = $('cdesc');
      if (cd) cd.textContent = CARS[v].d;
    } else if (a === 'buycar') buyCar(v);
    else if (a === 'gbody') {
      if (!owns(me, v)) return;
      me.body = v;
      save();
      applyUp();
      showGarage();
    } else if (a === 'gcol') {
      me.color = v;
      save();
      showGarage();
    } else if (a === 'country') {
      const k = Object.keys(MAPS).find(k => MAPS[k].c === v);
      if (k) pickMap(k);
    } else if (a === 'map') pickMap(v);
    else if (a === 'ctl') {
      ctl = v;
      save();
      tui();
      showSettings();
    } else if (a === 'sens') {
      sensSel = +v;
      save();
      showSettings();
    } else if (a === 'settings') showSettings();
    else if (a === 'help') showHelp();
    else if (a === 'tours') showTours();
    else if (a === 'tour') startTour(v);
    else if (a === 'tournext') nextTour();
    else if (a === 'daily') startDaily();
    else if (a === 'laps') {
      lapsSel = +v;
      save();
      showMenu();
    } else if (a === 'riv') {
      rivSel = +v;
      save();
      showMenu();
    } else if (a === 'diff') {
      diffSel = +v;
      save();
      showMenu();
    } else if (a === 'music') {
      musicOn = !musicOn;
      save();
      muLbl();
      syncSong();
      showSettings();
    }
  });

  /* ---------- update ---------- */
  function spark(x, y, n, s) {
    if (reduce) return;
    for (let i = 0; i < n; i++)
      sparks.push({
        x,
        y,
        vx: (Math.random() - 0.5) * s,
        vy: -Math.random() * s * 0.9,
        l: 0.3 + Math.random() * 0.3,
        t: 0,
      });
  }
  function update(dt) {
    tg += dt;
    const seg = segs[Math.floor(pos / SL) % N];
    let sf = speed / MAXS,
      L = 0,
      R = 0,
      G = 0,
      B = 0,
      NT = 0,
      X = 0,
      D = 0;
    if (state === 'race') {
      D = inp.D || dLock;
      X = inp.X;
      L = inp.L;
      R = inp.R;
      G = inp.G || auto;
      B = inp.B;
      NT = inp.N;
    }
    gasOn = !!G;
    drifting = false;
    if (state === 'menu') {
      speed = MAXS * 0.5;
      sf = 0.5;
      px += (Math.sin(tg * 0.5) * 0.55 - px) * dt * 1.5;
      steer = 0;
      boost = 0;
    } else {
      if (state === 'count') {
        cd -= dt;
        const ci = Math.ceil(cd);
        if (ci !== lastCd && ci >= 1 && ci <= 3) beep();
        lastCd = ci;
        if (cd <= 0) {
          state = 'race';
          goT = 0.8;
          goSnd();
        }
      }
      if (goT > 0) goT -= dt;
      const bo = NT && nit > 1 && speed > MAXS * 0.2;
      boost = bo ? Math.min(1, boost + dt * 4) : Math.max(0, boost - dt * 4);
      const DR = !!D && sf > 0.4 && (Math.abs(steer) > 0.25 || Math.abs(seg.c) > 1.2);
      drifting = DR;
      const dxs = dt * 2.4 * sf * UP.hd * (DR ? 1.25 : 1);
      if (L) px -= dxs;
      if (R) px += dxs;
      px += X * dxs;
      px -= (dxs * sf * seg.c * 0.22 * (TH.rain || wx ? 1.12 : 1) * (DR ? 0.4 : 1)) / UP.hd;
      if (G) speed += ACC * UP.ac * dt;
      else if (!B) speed += DEC * dt * (state === 'done' ? 2 : 1);
      if (B) speed += BRK * dt;
      /* drift: hold Z / C / the Drift button, or press D to keep it on, while steering. It carries you round bends, scrubs a little speed and refills nitro */
      if (DR && !reduce && Math.random() < dt * 30) {
        const pw = Math.min(W * 0.24, H * 0.42);
        for (const sx of [-0.4, 0.4])
          sparks.push({
            x: W / 2 + pw * sx,
            y: H * 0.95,
            vx: (Math.random() - 0.5) * 60 - Math.sign(steer) * 40,
            vy: -40 - Math.random() * 40,
            l: 0.9,
            t: 0,
            g: -20,
            col: 'rgba(225,220,230,.5)',
            sz: 12 + Math.random() * 10,
          });
      }
      if (DR) {
        speed -= MAXS * 0.1 * dt;
        nit = Math.min(100, nit + dt * 16);
        dfx -= dt;
        if (dfx <= 0) {
          dfx = 0.07;
          const pw = Math.min(W * 0.24, H * 0.42);
          spark(W / 2 - pw * 0.4, H * 0.955, 2, 200);
          spark(W / 2 + pw * 0.4, H * 0.955, 2, 200);
          if (!muted && ac) blip(240 + Math.random() * 50, 0.07, 'sawtooth', 0.05);
        }
      }
      if (bo) {
        speed += ACC * UP.ac * 1.8 * dt;
        nit -= dt * 30;
      } else nit = Math.min(100, nit + dt * 2.5);
      if (Math.abs(px) > 1.05 && speed > OFF) {
        speed += OFFD * (1 - 0.25 * UP.gr) * dt;
        shake = Math.max(shake, 3);
        const pw = Math.min(W * 0.24, H * 0.42);
        spark(W / 2 + (px > 0 ? 1 : -1) * pw * 0.42, H * 0.955, 2, 260);
      }
      px = clamp(px, -2.6, 2.6);
      const lim = MAXS * UP.ts * (1 + 0.35 * boost) * (1 - 0.18 * dmg);
      if (speed > lim) speed = Math.max(lim, speed - MAXS * 0.4 * dt);
      speed = Math.max(0, speed);
      steer += (R - L + X - steer) * Math.min(1, dt * 8);
    }
    CD = 0.84 - 0.12 * boost;
    const np = pos + dt * speed;
    if (np >= TL) {
      pos = np - TL;
      if (state === 'race') lapDone();
    } else pos = np;
    if (state === 'race') {
      const ps = segs[Math.floor((pos + PZ) / SL) % N];
      if (ps.ph && ps.ph.length && lph !== ps.i) {
        lph = ps.i;
        for (const h of ps.ph)
          if (Math.abs(px - h.o) < h.w + 0.06) {
            speed *= 0.85;
            hurt(0.012);
            shake = reduce ? 0 : 10;
            vib(60);
            holes++;
            toast('Pothole', 1);
            blip(70, 0.18, 'square', 0.14);
            const pw = Math.min(W * 0.24, H * 0.42);
            sparks.push({
              x: W / 2,
              y: H * 0.93,
              vx: 0,
              vy: -60,
              l: 0.6,
              t: 0,
              g: -20,
              col: 'rgba(140,120,100,.6)',
              sz: 22,
            });
            break;
          }
      }
    }
    if (state === 'race') {
      time += dt;
      if (cpNext < 3 && pos >= cpPos[cpNext] && pos < TL * 0.9) {
        cpNext++;
        toast('Checkpoint ' + cpNext + ' · ' + fmt(time - lapStart), 0, 'cp');
        cpSnd();
      }
    }
    off1 += seg.c * sf * dt * 50;
    shake = Math.max(0, shake - dt * 40);
    if (boost > 0.5) shake = Math.max(shake, boost * 2);
    if (reduce) shake = 0;
    da += ((drifting ? Math.sign(steer) || -Math.sign(seg.c) || 0 : 0) - da) * Math.min(1, dt * 6);
    if (dmg > 0.35 && !reduce && (state === 'race' || state === 'done') && Math.random() < dt * dmg * 30) {
      const pw = Math.min(W * 0.24, H * 0.42);
      sparks.push({
        x: W / 2 + (Math.random() - 0.5) * pw * 0.3,
        y: H * 0.86,
        vx: (Math.random() - 0.5) * 40,
        vy: -70,
        l: 0.8,
        t: 0,
        g: -30,
        col: 'rgba(80,80,92,.55)',
        sz: 16,
      });
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.t += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += (s.g == null ? 900 : s.g) * dt;
      if (s.t > s.l) sparks.splice(i, 1);
    }
    const pp = pos + PZ;
    for (const c of cars) {
      if (c.rv) {
        if (state === 'race' || state === 'count' || state === 'done') rivalStep(c, dt);
      } else {
        c.z = (c.z + dt * c.sp) % TL;
        if (c.hz === 'cow') {
          c.ph += dt * 0.35;
          c.o = clamp(c.base + Math.sin(c.ph) * 0.35, -0.9, 0.9);
        }
      }
      const ns = Math.floor(c.z / SL) % N;
      if (ns !== c.s) {
        const a = segs[c.s].cars;
        a.splice(a.indexOf(c), 1);
        segs[ns].cars.push(c);
        c.s = ns;
      }
      let dz = c.z - pp;
      if (dz > TL / 2) dz -= TL;
      if (dz < -TL / 2) dz += TL;
      if (state === 'race') {
        const dxo = Math.abs(c.o - px);
        if (dz > 0 && dz < SL * 1.5 && dxo < 0.34 && speed > c.sp) {
          speed = Math.max(c.sp, MAXS * 0.16) * 0.5;
          shake = reduce ? 0 : 14;
          px += px > c.o ? 0.12 : -0.12;
          hurt(0.1);
          vib(140);
          toast(
            c.hz === 'cyc'
              ? 'Cyclist!'
              : c.hz === 'cow'
                ? 'Holy cow!'
                : c.hz === 'cart'
                  ? 'Bullock cart!'
                  : c.hz === 'rick'
                    ? 'Rickshaw!'
                    : 'Crash',
            1,
          );
          blip(90, 0.3, 'sawtooth');
          spark(W / 2, H * 0.9, 24, 520);
        } else if (c.rv && c.tr === 'swipe' && !(c.sw > 0) && Math.abs(dz) < SL * 1.2 && dxo < 0.3) {
          c.sw = 1.2;
          px += px > c.o ? 0.14 : -0.14;
          speed *= 0.96;
          hurt(0.03);
          vib(70);
          shake = reduce ? 0 : 6;
          toast('Side swipe', 1);
          blip(150, 0.15, 'sawtooth');
          spark(W / 2, H * 0.92, 10, 300);
        }
        if (c.pd > 0 && dz <= 0 && c.pd < SL * 6 && dxo < 0.6) {
          nit = Math.min(100, nit + 14);
          close++;
          toast('Close pass');
          blip(700, 0.14, 'sine');
        }
      }
      c.pd = dz;
    }
    if (state === 'race' && dmg >= 1 && !inv()) {
      wreck = true;
      state = 'done';
      toast('Wrecked · you lose', 1);
      blip(60, 0.6, 'sawtooth', 0.2);
      vib(300);
      const id = runId;
      setTimeout(() => {
        if (id === runId) finish();
      }, 3000);
    }
    if (toastT > 0) {
      toastT -= dt;
      if (toastT <= 0) $('toast').className = '';
    }
    snd();
    $('kmh').textContent = Math.round((speed / MAXS) * 260);
    $('nf').style.width = clamp(nit, 0, 100) + '%';
    $('df').style.width = Math.round(100 - dmg * 100) + '%';
    $('df').style.background = dmg > 0.65 ? '#ff5a5a' : dmg > 0.35 ? '#ffc15e' : '#6ff0e4';
    $('dl').textContent = inv() ? 'INVINCIBLE' : Math.round(100 - dmg * 100) + '%';
    $('nl').textContent = boost > 0.3 ? 'BOOST' : dLock ? 'DRIFT ON' : nit < 20 ? 'LOW' : 'READY';
    $('lap').textContent =
      innerWidth < 520
        ? 'Lap ' + Math.min(lap, LAPS) + '/' + LAPS
        : 'Lap ' +
          Math.min(lap, LAPS) +
          ' of ' +
          LAPS +
          ' · ' +
          Math.min(100, Math.floor((dist() / (LAPS * TL)) * 100)) +
          '%';
    $('tm').textContent = fmt(time);
    $('bst').textContent = me && bestLap(me) ? fmt(bestLap(me)) : '–';
    hudT += dt;
    if (hudT > 0.2 && document.body.classList.contains('play')) {
      hudT = 0;
      hud2();
    }
    if (document.body.classList.contains('play')) drawMM();
  }
  function hud2() {
    $('pts').textContent = me ? me.points + ' pts' : '';
    if (mode === 'tt') {
      $('gap').textContent = '';
      return;
    }
    const rk = ranking(),
      i = rk.findIndex(r => r.me);
    placeNow = i;
    $('pos').textContent = ORD[i] + ' of ' + rk.length;
    const tot = LAPS * TL;
    let g = '';
    if (i > 0 && !rk[i].fin)
      g = '+' + (((Math.min(rk[0].d, tot) - rk[i].d) / tot) * 100).toFixed(1) + '% behind';
    else if (i === 0 && rk.length > 1 && !rk[i].fin)
      g = '+' + (((rk[0].d - rk[1].d) / tot) * 100).toFixed(1) + '% ahead';
    $('gap').textContent = g;
    $('st').innerHTML = rk
      .map(
        (r, j) =>
          '<div class="' +
          (r.me ? 'me' : '') +
          '"><span>' +
          (j + 1) +
          ' ' +
          esc(r.name) +
          '</span><i style="background:' +
          r.col +
          '"></i></div>',
      )
      .join('');
  }
  function drawMM() {
    mx.clearRect(0, 0, mmc.width, mmc.height);
    mx.lineJoin = 'round';
    mx.lineCap = 'round';
    mx.beginPath();
    mmP.forEach((p, i) => (i ? mx.lineTo(p[0], p[1]) : mx.moveTo(p[0], p[1])));
    mx.closePath();
    mx.strokeStyle = 'rgba(10,6,30,.9)';
    mx.lineWidth = 9;
    mx.stroke();
    mx.strokeStyle = 'rgba(255,244,224,.55)';
    mx.lineWidth = 5;
    mx.stroke();
    const f = mmP[0];
    mx.fillStyle = '#ff7a3d';
    mx.fillRect(f[0] - 6, f[1] - 2, 12, 4);
    CPF.forEach(c => {
      const p = mmP[Math.floor(N * c)];
      mx.fillStyle = '#6ff0e4';
      mx.beginPath();
      mx.arc(p[0], p[1], 2.5, 0, 7);
      mx.fill();
    });
    const dot = (d, col, r) => {
      const p = mmP[Math.floor((((d % TL) + TL) % TL) / SL) % N];
      mx.fillStyle = col;
      mx.strokeStyle = '#13113a';
      mx.lineWidth = 2;
      mx.beginPath();
      mx.arc(p[0], p[1], r, 0, 7);
      mx.stroke();
      mx.fill();
    };
    for (const c of cars) if (c.rv) dot(c.d, c.col, 4.5);
    dot(dist(), me ? me.color : COLS[0], 6);
  }

  /* ---------- drawing ---------- */
  function proj(p, cx, cy, cz) {
    p.cz = p.z - cz;
    p.s = CD / p.cz;
    p.sx = W / 2 - (p.s * cx * W) / 2;
    p.sy = H / 2 - (p.s * (p.y - cy) * H) / 2;
    p.sw = (p.s * RW * W) / 2;
  }
  function poly(a, b, c, d, e, f, g, h, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(a, b);
    ctx.lineTo(c, d);
    ctx.lineTo(e, f);
    ctx.lineTo(g, h);
    ctx.closePath();
    ctx.fill();
  }
  function mtn(off, amp, col, k) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, H / 2 + 2);
    for (let x = 0; x <= W + 8; x += 8) {
      const u = (x + off) * k;
      let v = 0.6 * (1 - Math.abs(Math.sin(u + 1))) + 0.4 * (1 - Math.abs(Math.sin(u * 2.7 + 3)));
      if (TH.shape === 'dome')
        v = 0.7 * (0.5 + 0.5 * Math.sin(u * 0.9 + 1)) + 0.3 * (0.5 + 0.5 * Math.sin(u * 2.3 + 2));
      else if (TH.shape === 'mesa') v = Math.min(v, 0.5) * 1.8;
      ctx.lineTo(x, H / 2 - amp * v);
    }
    ctx.lineTo(W + 8, H / 2 + 2);
    ctx.fill();
  }
  function fuji() {
    const M = W * 1.5,
      cx = ((((W * 0.35 - off1 * 0.2) % M) + M) % M) - W * 0.3,
      w = W * 0.5,
      h = H * 0.27,
      y = H / 2;
    ctx.fillStyle = TH.big;
    ctx.beginPath();
    ctx.moveTo(cx - w, y + 2);
    ctx.quadraticCurveTo(cx - w * 0.25, y - h * 0.55, cx - w * 0.1, y - h);
    ctx.lineTo(cx + w * 0.1, y - h);
    ctx.quadraticCurveTo(cx + w * 0.25, y - h * 0.55, cx + w, y + 2);
    ctx.fill();
    ctx.fillStyle = '#fdf3f0';
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.1, y - h);
    ctx.lineTo(cx - w * 0.19, y - h * 0.74);
    ctx.lineTo(cx - w * 0.1, y - h * 0.8);
    ctx.lineTo(cx - w * 0.03, y - h * 0.7);
    ctx.lineTo(cx + w * 0.05, y - h * 0.8);
    ctx.lineTo(cx + w * 0.12, y - h * 0.72);
    ctx.lineTo(cx + w * 0.1, y - h);
    ctx.fill();
  }
  function taj() {
    const M = W * 1.6,
      cx = ((((W * 0.98 - off1 * 0.15) % M) + M) % M) - W * 0.3,
      y = H / 2 + 2,
      k = H * 0.0105;
    const R = (x, t, w, h, c) => {
      ctx.fillStyle = c;
      ctx.fillRect(cx + x * k, y - (t + h) * k, w * k, h * k);
    };
    const dome = (x, b, r, hh, c) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(cx + (x - r) * k, y - b * k);
      ctx.bezierCurveTo(
        cx + (x - r * 1.45) * k,
        y - (b + hh * 0.62) * k,
        cx + (x - r * 0.35) * k,
        y - (b + hh * 0.9) * k,
        cx + x * k,
        y - (b + hh) * k,
      );
      ctx.bezierCurveTo(
        cx + (x + r * 0.35) * k,
        y - (b + hh * 0.9) * k,
        cx + (x + r * 1.45) * k,
        y - (b + hh * 0.62) * k,
        cx + (x + r) * k,
        y - b * k,
      );
      ctx.closePath();
      ctx.fill();
    };
    const W1 = '#f4e6d6',
      W2 = '#d8c4b0',
      DK = '#8c7b74';
    R(-33, 0, 66, 1.4, W2);
    R(-31, 1.4, 62, 1, W1);
    for (const sx of [-1, 1]) {
      const x = sx * 27;
      R(x - 1.1, 2.4, 2.2, 20, W1);
      R(sx > 0 ? x : x - 1.1, 2.4, 1.1, 20, W2);
      R(x - 1.5, 10, 3, 0.6, W2);
      R(x - 1.5, 17, 3, 0.6, W2);
      R(x - 1.6, 22.4, 3.2, 0.7, W1);
      dome(x, 23.1, 1.5, 2.2, W1);
    }
    R(-14, 2.4, 28, 15, W1);
    R(-14, 2.4, 3, 15, W2);
    R(11, 2.4, 3, 15, W2);
    R(-4.6, 2.4, 9.2, 13, DK);
    ctx.fillStyle = DK;
    ctx.beginPath();
    ctx.arc(cx, y - 15.4 * k, 4.6 * k, Math.PI, 0);
    ctx.fill();
    R(-3.2, 2.4, 6.4, 12.5, '#b9a79c');
    for (const sx of [-1, 1]) {
      for (const o of [7.5, 11]) {
        R(sx * o - 0.9, 4, 1.8, 6, DK);
        R(sx * o - 0.9, 11, 1.8, 3.5, DK);
      }
    }
    R(-5.5, 17.4, 11, 0.8, W2);
    R(-5.4, 15.2, 10.8, 0.5, W2);
    for (const sx of [-1, 1]) {
      const x = sx * 10;
      R(x - 1.9, 17.4, 3.8, 0.9, W2);
      for (const p of [-1.6, 1.6]) R(x + p - 0.2, 18.3, 0.4, 2, W2);
      dome(x, 20.3, 2.2, 2.6, W1);
    }
    dome(0, 17.4, 6.4, 9.6, W1);
    ctx.fillStyle = W2;
    ctx.beginPath();
    ctx.moveTo(cx, y - 27 * k);
    ctx.bezierCurveTo(cx + 4.6 * k, y - 25.5 * k, cx + 8 * k, y - 22 * k, cx + 6.4 * k, y - 17.4 * k);
    ctx.lineTo(cx + 3 * k, y - 17.4 * k);
    ctx.bezierCurveTo(cx + 4.4 * k, y - 22 * k, cx + 2.5 * k, y - 25 * k, cx, y - 27 * k);
    ctx.fill();
    R(-0.18, 26.6, 0.36, 3.2, W2);
    ctx.fillStyle = W1;
    ctx.beginPath();
    ctx.arc(cx, y - 30.2 * k, 0.45 * k, 0, 7);
    ctx.fill();
  }
  /* Mumbai skyline: towers along the bay and the Gateway of India */
  const BT = Array.from({ length: 26 }, (_, i) => [
    i / 26,
    0.06 + Math.random() * 0.16,
    0.018 + Math.random() * 0.02,
    Math.random(),
  ]);
  function bom() {
    const M = W * 1.8,
      base = ((((W * 0.2 - off1 * 0.12) % M) + M) % M) - W * 0.4,
      y = H / 2 + 2;
    for (const t of BT) {
      const x = base + t[0] * W * 1.1,
        h = H * t[1],
        w = W * t[2];
      ctx.fillStyle = t[3] > 0.5 ? '#8a6a78' : '#76596a';
      ctx.fillRect(x, y - h, w, h);
      ctx.fillStyle = 'rgba(255,214,150,.55)';
      for (let wy = y - h + H * 0.012; wy < y - H * 0.01; wy += H * 0.018)
        for (let wx2 = x + w * 0.2; wx2 < x + w * 0.8; wx2 += w * 0.3)
          if (((wx2 * 7 + wy * 3) | 0) % 5 < 2)
            ctx.fillRect(wx2, wy, Math.max(1, w * 0.1), Math.max(1, H * 0.005));
    }
    const gx = base + W * 1.25,
      k = H * 0.009,
      G = '#e6cfae',
      D = '#b9997c';
    ctx.fillStyle = G;
    ctx.fillRect(gx - 14 * k, y - 16 * k, 28 * k, 16 * k);
    ctx.fillStyle = D;
    ctx.fillRect(gx - 14 * k, y - 17.5 * k, 28 * k, 1.5 * k);
    for (const sx of [-1, 1]) {
      ctx.fillStyle = G;
      ctx.fillRect(gx + sx * 12 * k - 2 * k, y - 21 * k, 4 * k, 21 * k);
      ctx.beginPath();
      ctx.arc(gx + sx * 12 * k, y - 21 * k, 2.2 * k, Math.PI, 0);
      ctx.fill();
    }
    ctx.fillStyle = G;
    ctx.beginPath();
    ctx.arc(gx, y - 17.5 * k, 4 * k, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#7d5f55';
    ctx.beginPath();
    ctx.moveTo(gx - 4 * k, y);
    ctx.lineTo(gx - 4 * k, y - 9 * k);
    ctx.arc(gx, y - 9 * k, 4 * k, Math.PI, 0);
    ctx.lineTo(gx + 4 * k, y);
    ctx.fill();
    for (const sx of [-8, 8]) {
      ctx.beginPath();
      ctx.moveTo(gx + sx * k - 1.6 * k, y);
      ctx.lineTo(gx + sx * k - 1.6 * k, y - 7 * k);
      ctx.arc(gx + sx * k, y - 7 * k, 1.6 * k, Math.PI, 0);
      ctx.lineTo(gx + sx * k + 1.6 * k, y);
      ctx.fill();
    }
  }
  /* soft drifting clouds (x, height, size, puffs) and the sun's screen position for flares and road glare */
  const CLOUDS = Array.from({ length: 9 }, (_, i) => [
    i / 9 + Math.random() * 0.08,
    0.06 + Math.random() * 0.22,
    0.6 + Math.random() * 0.9,
    3 + ((Math.random() * 3) | 0),
  ]);
  let sunX = 0,
    sunY = 0,
    sunR = 0;
  function clouds() {
    const tint = TH.stars ? 'rgba(200,190,255,' : 'rgba(255,248,240,';
    for (const c of CLOUDS) {
      const M = W * 1.4,
        x = ((((c[0] * M - off1 * 0.05 - tg * 6) % M) + M) % M) - W * 0.2,
        y = H * c[1],
        r = H * 0.05 * c[2];
      for (let i = 0; i < c[3]; i++) {
        const px = x + (i - c[3] / 2) * r * 0.9,
          py = y + Math.sin(i * 2.3) * r * 0.2,
          rad = r * (0.8 + 0.4 * Math.sin(i * 1.7 + c[2])),
          g = ctx.createRadialGradient(px, py, 0, px, py, rad);
        g.addColorStop(0, tint + (TH.stars ? 0.1 : 0.32) + ')');
        g.addColorStop(1, tint + '0)');
        ctx.fillStyle = g;
        ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
      }
    }
  }
  function sky() {
    const S = TH.sky,
      g = ctx.createLinearGradient(0, 0, 0, H / 2);
    g.addColorStop(0, S[0]);
    g.addColorStop(0.5, S[1]);
    g.addColorStop(0.82, S[2]);
    g.addColorStop(1, S[3]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H / 2 + 1);
    if (TH.stars) {
      ctx.fillStyle = 'rgba(255,240,220,' + 0.7 * TH.stars + ')';
      for (const s of stars) ctx.fillRect(s[0] * W, s[1] * H * 0.28, s[2], s[2]);
    }
    const M = W * 1.5,
      sx = ((((W * 0.62 - off1 * 0.1) % M) + M) % M) - W * 0.25,
      sy = H / 2 - H * TH.sy,
      r = H * 0.11 * TH.sr,
      gc = TH.sun[2];
    const sg = ctx.createRadialGradient(sx, sy, r * 0.2, sx, sy, r * 2.6);
    sg.addColorStop(0, 'rgba(' + gc + ',.55)');
    sg.addColorStop(1, 'rgba(' + gc + ',0)');
    ctx.fillStyle = sg;
    ctx.fillRect(sx - r * 3, sy - r * 3, r * 6, r * 6);
    const sd = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    sd.addColorStop(0, TH.sun[0]);
    sd.addColorStop(1, TH.sun[1]);
    ctx.fillStyle = sd;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, 7);
    ctx.fill();
    sunX = sx;
    sunY = sy;
    sunR = r;
    if (!reduce) clouds();
    mtn(off1 * 0.5, H * 0.14, TH.mtn[0], 0.006);
    if (TH.big) fuji();
    if (TH.lm === 'taj') taj();
    if (TH.lm === 'bom') bom();
    mtn(off1 * 1.1, H * 0.09, TH.mtn[1], 0.011);
  }
  function drawSeg(s, n) {
    const a = s.p1,
      b = s.p2,
      c =
        s.i < 4
          ? { road: TH.road[0], grass: TH.grass[0], rum: '#fff4e0' }
          : { road: TH.road[s.k], grass: TH.grass[s.k], rum: TH.rum[s.k] };
    ctx.fillStyle = c.grass;
    ctx.fillRect(0, b.sy, W, a.sy - b.sy + 1);
    const r1 = a.sw / 6,
      r2 = b.sw / 6;
    poly(a.sx - a.sw - r1, a.sy, a.sx - a.sw, a.sy, b.sx - b.sw, b.sy, b.sx - b.sw - r2, b.sy, c.rum);
    poly(a.sx + a.sw + r1, a.sy, a.sx + a.sw, a.sy, b.sx + b.sw, b.sy, b.sx + b.sw + r2, b.sy, c.rum);
    poly(a.sx - a.sw, a.sy, a.sx + a.sw, a.sy, b.sx + b.sw, b.sy, b.sx - b.sw, b.sy, c.road);
    if (!s.k && s.i >= 4) {
      const l1 = a.sw / 32,
        l2 = b.sw / 32,
        w1 = (a.sw * 2) / 3,
        w2 = (b.sw * 2) / 3;
      let x1 = a.sx - a.sw + w1,
        x2 = b.sx - b.sw + w2;
      for (let i = 1; i < 3; i++) {
        poly(x1 - l1 / 2, a.sy, x1 + l1 / 2, a.sy, x2 + l2 / 2, b.sy, x2 - l2 / 2, b.sy, '#e9e2d0');
        x1 += w1;
        x2 += w2;
      }
    }
    if (s.ph && s.ph.length) {
      const my = (a.sy + b.sy) / 2,
        ms = (a.sw + b.sw) / 2,
        mx0 = (a.sx + b.sx) / 2,
        hh0 = Math.max(1, (a.sy - b.sy) * 0.42);
      for (const h of s.ph) {
        const X = mx0 + h.o * ms,
          rx = h.w * ms * 0.9,
          hh = Math.min(hh0, rx * 0.3);
        if (rx < 1.2) continue;
        ctx.fillStyle = '#24222a';
        ctx.beginPath();
        ctx.ellipse(X, my, rx, hh, 0, 0, 7);
        ctx.fill();
        ctx.fillStyle = '#141218';
        ctx.beginPath();
        ctx.ellipse(X, my + hh * 0.2, rx * 0.75, hh * 0.6, 0, 0, 7);
        ctx.fill();
        if (TH.rain || wx || h.f > 0.6) {
          ctx.fillStyle = 'rgba(170,190,215,.35)';
          ctx.beginPath();
          ctx.ellipse(X - rx * 0.15, my, rx * 0.45, hh * 0.35, 0, 0, 7);
          ctx.fill();
        }
      }
    }
    const f = Math.min(1, Math.pow(n / DRAW, 1.6));
    ctx.globalAlpha = f;
    ctx.fillStyle = TH.fog;
    ctx.fillRect(0, b.sy, W, a.sy - b.sy + 1);
    ctx.globalAlpha = 1;
  }
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  }
  function car(cx, by, w, col, flame, rot, glow, body) {
    body = body || 'coupe';
    const h = w * 0.52,
      big = w > 26,
      wd = body === 'wedge',
      vn = body === 'van',
      hb = body === 'hatch',
      rs = body === 'roadster',
      pu = body === 'pickup';
    ctx.save();
    ctx.translate(cx, by);
    if (rot) ctx.rotate(rot);
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.55, h * 0.14, 0, 0, 7);
    ctx.fill();
    if (isSuper(body)) {
      supercar(w, h, col, glow, body, big, flame);
      ctx.restore();
      return;
    }
    const th = vn ? 0.38 : wd ? 0.3 : rs ? 0.28 : pu ? 0.42 : 0.32;
    ctx.fillStyle = '#0d0b16';
    rr(-w * 0.5, -h * th, w * 0.15, h * th, w * 0.03);
    rr(w * 0.35, -h * th, w * 0.15, h * th, w * 0.03);
    if (big) {
      ctx.fillStyle = '#2b2740';
      ctx.fillRect(-w * 0.46, -h * th * 0.7, w * 0.04, h * th * 0.5);
      ctx.fillRect(w * 0.42, -h * th * 0.7, w * 0.04, h * th * 0.5);
    }
    const bx = wd ? 0.5 : rs ? 0.5 : pu ? 0.49 : 0.48,
      bt = wd ? 0.6 : rs ? 0.56 : vn ? 0.72 : pu ? 0.66 : 0.64,
      bh = wd ? 0.44 : rs ? 0.4 : vn ? 0.56 : pu ? 0.5 : 0.48;
    ctx.fillStyle = col;
    rr(-w * bx, -h * bt, w * bx * 2, h * bh, w * 0.08);
    if (big) {
      ctx.fillStyle = gloss(-h * bt, -h * (bt - bh));
      rr(-w * bx, -h * bt, w * bx * 2, h * bh, w * 0.08);
    }
    // cabin
    const cab = (x, t, wd2, hh, r) => {
      ctx.fillStyle = col;
      rr(-w * x, -h * t, w * x * 2, h * hh, w * r);
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      rr(-w * x, -h * t, w * x * 2, h * hh, w * r);
    };
    if (wd) {
      const tz = (a, b, t, u) => {
        ctx.beginPath();
        ctx.moveTo(-w * a, -h * u);
        ctx.lineTo(-w * b, -h * t);
        ctx.lineTo(w * b, -h * t);
        ctx.lineTo(w * a, -h * u);
        ctx.closePath();
        ctx.fill();
      };
      ctx.fillStyle = col;
      tz(0.42, 0.2, 0.95, 0.6);
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      tz(0.42, 0.2, 0.95, 0.6);
      ctx.fillStyle = '#17101f';
      tz(0.34, 0.15, 0.9, 0.64);
      ctx.fillStyle = col;
      ctx.fillRect(-w * 0.5, -h * 1.08, w, h * 0.09);
      ctx.fillRect(-w * 0.4, -h * 1.0, w * 0.06, h * 0.42);
      ctx.fillRect(w * 0.34, -h * 1.0, w * 0.06, h * 0.42);
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(-w * 0.5, -h * 0.99, w, h * 0.03);
    } else if (rs) {
      ctx.fillStyle = col;
      rr(-w * 0.36, -h * 0.86, w * 0.72, h * 0.3, w * 0.06);
      ctx.fillStyle = '#17101f';
      rr(-w * 0.3, -h * 0.84, w * 0.6, h * 0.2, w * 0.05);
      ctx.fillStyle = col;
      rr(-w * 0.28, -h * 0.98, w * 0.2, h * 0.22, w * 0.05);
      rr(w * 0.08, -h * 0.98, w * 0.2, h * 0.22, w * 0.05);
      ctx.fillStyle = '#e8c9a0';
      ctx.beginPath();
      ctx.arc(-w * 0.18, -h * 0.9, h * 0.1, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#2b2740';
      ctx.fillRect(-w * 0.36, -h * 1.04, w * 0.72, h * 0.05);
    } else if (pu) {
      cab(0.3, 1.2, 0, 0.6, 0.07);
      ctx.fillStyle = '#17101f';
      rr(-w * 0.24, -h * 1.12, w * 0.48, h * 0.3, w * 0.04);
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      rr(-w * 0.42, -h * 0.7, w * 0.84, h * 0.12, w * 0.02);
      ctx.fillStyle = 'rgba(255,255,255,.14)';
      ctx.fillRect(-w * 0.46, -h * 0.5, w * 0.92, h * 0.04);
    } else if (hb) {
      cab(0.4, 1.12, 0, 0.56, 0.08);
      ctx.fillStyle = '#17101f';
      rr(-w * 0.33, -h * 1.05, w * 0.66, h * 0.38, w * 0.05);
      if (big) {
        ctx.fillStyle = 'rgba(255,255,255,.10)';
        rr(-w * 0.3, -h * 1.03, w * 0.22, h * 0.12, w * 0.03);
      }
    } else if (vn) {
      cab(0.46, 1.42, 0, 0.88, 0.06);
      ctx.fillStyle = '#17101f';
      rr(-w * 0.38, -h * 1.34, w * 0.76, h * 0.4, w * 0.04);
      if (big) {
        ctx.fillStyle = '#17101f';
        ctx.fillRect(-w * 0.02, -h * 0.88, w * 0.04, h * 0.12);
        ctx.fillStyle = 'rgba(255,255,255,.10)';
        rr(-w * 0.35, -h * 1.31, w * 0.2, h * 0.14, w * 0.03);
      }
    } else {
      cab(0.34, 1.02, 0, 0.44, 0.1);
      ctx.fillStyle = '#17101f';
      rr(-w * 0.28, -h * 0.96, w * 0.56, h * 0.31, w * 0.06);
      if (big) {
        ctx.fillStyle = 'rgba(255,255,255,.10)';
        rr(-w * 0.25, -h * 0.94, w * 0.18, h * 0.1, w * 0.03);
      }
    }
    // body highlight, bumper, plate
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    rr(-w * bx + w * 0.02, -h * bt + h * 0.02, w * bx * 2 - w * 0.04, h * 0.07, w * 0.03);
    // tail lights
    ctx.fillStyle = '#ff2f3f';
    if (glow) {
      ctx.shadowColor = '#ff2f3f';
      ctx.shadowBlur = w * 0.18;
    }
    if (wd) {
      ctx.fillRect(-w * 0.44, -h * 0.52, w * 0.88, h * 0.08);
    } else if (rs) {
      ctx.fillRect(-w * 0.46, -h * 0.46, w * 0.2, h * 0.1);
      ctx.fillRect(w * 0.26, -h * 0.46, w * 0.2, h * 0.1);
    } else if (vn || pu) {
      ctx.fillRect(-w * 0.46, -h * 0.7, w * 0.07, h * 0.34);
      ctx.fillRect(w * 0.39, -h * 0.7, w * 0.07, h * 0.34);
    } else if (hb) {
      ctx.fillRect(-w * 0.46, -h * 0.58, w * 0.16, h * 0.2);
      ctx.fillRect(w * 0.3, -h * 0.58, w * 0.16, h * 0.2);
    } else {
      ctx.fillRect(-w * 0.44, -h * 0.56, w * 0.24, h * 0.13);
      ctx.fillRect(w * 0.2, -h * 0.56, w * 0.24, h * 0.13);
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(-w * bx, -h * 0.2, w * bx * 2, h * 0.06);
    if (big) {
      ctx.fillStyle = '#e8e2cf';
      rr(-w * 0.09, -h * 0.46, w * 0.18, h * 0.08, w * 0.01);
      ctx.fillStyle = '#07060c';
      ctx.fillRect(-w * 0.32, -h * 0.14, w * 0.1, h * 0.05);
      ctx.fillRect(w * 0.22, -h * 0.14, w * 0.1, h * 0.05);
    }
    if (flame) {
      for (const sx of [-0.3, 0.3]) {
        const fh = w * (0.16 + Math.random() * 0.12);
        const g = ctx.createLinearGradient(0, -h * 0.1, 0, fh);
        g.addColorStop(0, '#bfe9ff');
        g.addColorStop(0.4, '#ffb04a');
        g.addColorStop(1, 'rgba(255,90,40,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(sx * w, fh * 0.35, w * 0.06, fh * 0.7, 0, 0, 7);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  /* lighten (a > 0) or darken (a < 0) a #rrggbb colour */
  function shade(hex, a) {
    const n = parseInt(hex.slice(1), 16),
      t = a > 0 ? 255 : 0,
      k = Math.abs(a),
      m = v => Math.round(v + (t - v) * k);
    return 'rgb(' + m(n >> 16) + ',' + m((n >> 8) & 255) + ',' + m(n & 255) + ')';
  }
  /* clear-coat: a soft light band on top and shade underneath, laid over any paint */
  function gloss(y0, y1) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, 'rgba(255,255,255,.38)');
    g.addColorStop(0.18, 'rgba(255,255,255,.08)');
    g.addColorStop(0.55, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.38)');
    return g;
  }
  function path(pts, w, h) {
    ctx.beginPath();
    pts.forEach((p, i) =>
      p.length === 2
        ? (i ? ctx.lineTo : ctx.moveTo).call(ctx, w * p[0], -h * p[1])
        : ctx.quadraticCurveTo(w * p[0], -h * p[1], w * p[2], -h * p[3]),
    );
    ctx.closePath();
  }
  const mirror = pts =>
    pts.concat(
      pts
        .slice()
        .reverse()
        .map(p => (p.length === 2 ? [-p[0], p[1]] : [-p[2], p[3], -p[0], p[1]])),
    );
  /* supercars, seen from behind: wide and low, metallic paint, LED lights, diffusers */
  const SHAPE = {
    toro: mirror([
      [-0.55, 0.15],
      [-0.56, 0.5],
      [-0.42, 0.64],
      [-0.2, 0.8],
    ]),
    rosso: mirror([
      [-0.54, 0.15],
      [-0.6, 0.6, -0.38, 0.66],
      [-0.24, 0.86, 0, 0.86],
    ]),
    veyra: mirror([
      [-0.55, 0.15],
      [-0.56, 0.58],
      [-0.52, 0.74, -0.3, 0.76],
      [-0.14, 0.92, 0, 0.92],
    ]),
    phantom: mirror([
      [-0.56, 0.15],
      [-0.57, 0.46],
      [-0.44, 0.6],
      [-0.18, 0.74],
    ]),
  };
  function supercar(w, h, col, glow, b, big, flame) {
    const lw = v => Math.max(1, w * v);
    // tyres
    ctx.fillStyle = '#0b0a12';
    rr(-w * 0.53, -h * 0.3, w * 0.18, h * 0.3, w * 0.035);
    rr(w * 0.35, -h * 0.3, w * 0.18, h * 0.3, w * 0.035);
    // body in metallic paint
    const top = { toro: 0.8, rosso: 0.86, veyra: 0.92, phantom: 0.74 }[b];
    const pg = ctx.createLinearGradient(0, -h * top, 0, -h * 0.12);
    pg.addColorStop(0, shade(col, 0.45));
    pg.addColorStop(0.35, col);
    pg.addColorStop(0.7, shade(col, -0.25));
    pg.addColorStop(1, shade(col, -0.6));
    ctx.fillStyle = pg;
    path(SHAPE[b], w, h);
    ctx.fill();
    // Veyra: two-tone dark upper body
    if (b === 'veyra') {
      ctx.save();
      path(SHAPE[b], w, h);
      ctx.clip();
      ctx.fillStyle = '#121019';
      ctx.fillRect(-w * 0.6, -h * 1, w * 1.2, h * 0.36);
      ctx.restore();
    }
    // rear glass with a sky reflection
    const gl = {
      toro: [0.16, 0.1, 0.76, 0.6],
      rosso: [0.2, 0.12, 0.83, 0.64],
      veyra: [0.22, 0.12, 0.9, 0.7],
      phantom: [0.14, 0.08, 0.71, 0.58],
    }[b];
    const gg = ctx.createLinearGradient(0, -h * gl[2], 0, -h * gl[3]);
    gg.addColorStop(0, '#3a3a5a');
    gg.addColorStop(0.5, '#120f1c');
    gg.addColorStop(1, '#07060c');
    ctx.fillStyle = gg;
    path(
      [
        [-gl[0], gl[3]],
        [-gl[1], gl[2]],
        [gl[1], gl[2]],
        [gl[0], gl[3]],
      ],
      w,
      h,
    );
    ctx.fill();
    if (big) {
      ctx.strokeStyle = 'rgba(255,255,255,.18)';
      ctx.lineWidth = lw(0.012);
      ctx.beginPath();
      ctx.moveTo(-w * gl[1] * 0.6, -h * (gl[2] - 0.02));
      ctx.lineTo(-w * gl[0] * 0.3, -h * (gl[3] + 0.02));
      ctx.stroke();
    }
    // engine-cover louvres (Toro, Phantom)
    if (big && (b === 'toro' || b === 'phantom')) {
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      for (let i = 0; i < 4; i++)
        ctx.fillRect(-w * 0.13, -h * (gl[3] - 0.04 - i * 0.035), w * 0.26, h * 0.016);
    }
    // clear-coat and a bright shoulder line
    ctx.fillStyle = gloss(-h * top, -h * 0.15);
    path(SHAPE[b], w, h);
    ctx.fill();
    if (big) {
      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      ctx.lineWidth = lw(0.01);
      ctx.beginPath();
      ctx.moveTo(-w * 0.5, -h * 0.5);
      ctx.lineTo(-w * 0.3, -h * 0.58);
      ctx.moveTo(w * 0.5, -h * 0.5);
      ctx.lineTo(w * 0.3, -h * 0.58);
      ctx.stroke();
    }
    // rear lights
    ctx.fillStyle = '#ff2f3f';
    ctx.strokeStyle = '#ff2f3f';
    if (glow) {
      ctx.shadowColor = '#ff3040';
      ctx.shadowBlur = w * 0.22;
    }
    if (b === 'toro') {
      ctx.lineWidth = lw(0.022);
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sx * w * 0.5, -h * 0.5);
        ctx.lineTo(sx * w * 0.36, -h * 0.44);
        ctx.lineTo(sx * w * 0.22, -h * 0.5);
        ctx.moveTo(sx * w * 0.36, -h * 0.44);
        ctx.lineTo(sx * w * 0.36, -h * 0.34);
        ctx.stroke();
      }
    } else if (b === 'rosso') {
      for (const x of [-0.42, -0.28, 0.28, 0.42]) {
        ctx.beginPath();
        ctx.arc(w * x, -h * 0.5, w * 0.045, 0, 7);
        ctx.fill();
      }
    } else if (b === 'veyra') {
      rr(-w * 0.5, -h * 0.6, w, h * 0.045, w * 0.02);
    } else {
      ctx.lineWidth = lw(0.02);
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(sx * w * 0.38, -h * 0.44, w * 0.09, h * 0.06, 0, 0, 7);
        ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;
    // diffuser with fins
    ctx.fillStyle = '#0d0c14';
    path(
      [
        [-0.46, 0.13],
        [-0.4, 0.3],
        [0.4, 0.3],
        [0.46, 0.13],
      ],
      w,
      h,
    );
    ctx.fill();
    if (big) {
      ctx.fillStyle = '#2b2838';
      for (let i = -3; i <= 3; i++) ctx.fillRect(w * i * 0.1 - w * 0.008, -h * 0.3, w * 0.016, h * 0.17);
    }
    // exhausts
    ctx.fillStyle = '#4a4656';
    const ex = {
      toro: [[0, 0.07]],
      rosso: [
        [-0.2, 0.04],
        [-0.12, 0.04],
        [0.12, 0.04],
        [0.2, 0.04],
      ],
      veyra: [[0, 0.09]],
      phantom: [[0, 0.06]],
    }[b];
    for (const [x, r] of ex) {
      ctx.beginPath();
      ctx.ellipse(w * x, -h * 0.36, w * r, h * r * 1.3, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#07060c';
      ctx.beginPath();
      ctx.ellipse(w * x, -h * 0.36, w * r * 0.65, h * r * 0.85, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#4a4656';
    }
    // rear wing (Veyra, Phantom)
    if (b === 'veyra' || b === 'phantom') {
      const wy = b === 'phantom' ? 1.06 : 0.98;
      ctx.fillStyle = '#121019';
      ctx.fillRect(-w * 0.26, -h * wy, w * 0.03, h * (wy - 0.7));
      ctx.fillRect(w * 0.23, -h * wy, w * 0.03, h * (wy - 0.7));
      const wg = ctx.createLinearGradient(0, -h * (wy + 0.08), 0, -h * wy);
      wg.addColorStop(0, b === 'phantom' ? shade(col, 0.3) : '#2b2838');
      wg.addColorStop(1, b === 'phantom' ? shade(col, -0.4) : '#0b0a12');
      ctx.fillStyle = wg;
      rr(-w * 0.52, -h * (wy + 0.08), w * 1.04, h * 0.08, w * 0.02);
    }
    if (big) {
      ctx.fillStyle = '#e8e2cf';
      rr(-w * 0.08, -h * 0.25, w * 0.16, h * 0.06, w * 0.01);
    }
    if (flame) {
      for (const [x] of ex) {
        const fh = w * (0.18 + Math.random() * 0.14),
          g = ctx.createLinearGradient(0, -h * 0.36, 0, fh);
        g.addColorStop(0, '#bfe9ff');
        g.addColorStop(0.4, '#ffb04a');
        g.addColorStop(1, 'rgba(255,90,40,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(w * x, -h * 0.36 + fh * 0.4, w * 0.05, fh * 0.7, 0, 0, 7);
        ctx.fill();
      }
    }
  }
  /* Mumbai hazards, seen from behind */
  function rick(cx, by, w) {
    const h = w * 0.9;
    ctx.save();
    ctx.translate(cx, by);
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.55, h * 0.08, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#0d0b16';
    rr(-w * 0.5, -h * 0.24, w * 0.16, h * 0.24, w * 0.04);
    rr(w * 0.34, -h * 0.24, w * 0.16, h * 0.24, w * 0.04);
    ctx.fillStyle = '#1f6b3a';
    rr(-w * 0.46, -h * 0.62, w * 0.92, h * 0.44, w * 0.08);
    ctx.fillStyle = '#f2c418';
    ctx.beginPath();
    ctx.moveTo(-w * 0.48, -h * 0.6);
    ctx.lineTo(-w * 0.44, -h * 0.96);
    ctx.quadraticCurveTo(0, -h * 1.12, w * 0.44, -h * 0.96);
    ctx.lineTo(w * 0.48, -h * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#17101f';
    rr(-w * 0.32, -h * 0.92, w * 0.64, h * 0.26, w * 0.05);
    ctx.fillStyle = '#0f1a14';
    ctx.fillRect(-w * 0.46, -h * 0.42, w * 0.92, h * 0.05);
    ctx.fillStyle = '#ff2f3f';
    ctx.fillRect(-w * 0.42, -h * 0.34, w * 0.1, h * 0.07);
    ctx.fillRect(w * 0.32, -h * 0.34, w * 0.1, h * 0.07);
    if (w > 30) {
      ctx.fillStyle = '#fff4e0';
      rr(-w * 0.12, -h * 0.3, w * 0.24, h * 0.08, w * 0.01);
    }
    ctx.restore();
  }
  function cart(cx, by, w) {
    const h = w * 0.8;
    ctx.save();
    ctx.translate(cx, by);
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.6, h * 0.08, 0, 0, 7);
    ctx.fill();
    for (const sx of [-1, 1]) {
      ctx.fillStyle = '#e8e0cf';
      ctx.beginPath();
      ctx.ellipse(sx * w * 0.32, -h * 1.05, w * 0.09, h * 0.12, 0, 0, 7);
      ctx.fill();
      ctx.strokeStyle = '#d9cfb8';
      ctx.lineWidth = Math.max(1, w * 0.025);
      ctx.beginPath();
      ctx.moveTo(sx * w * 0.28, -h * 1.12);
      ctx.quadraticCurveTo(sx * w * 0.36, -h * 1.32, sx * w * 0.26, -h * 1.36);
      ctx.stroke();
    }
    ctx.fillStyle = '#d9b45a';
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.82, w * 0.42, h * 0.28, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#8a5a32';
    ctx.fillRect(-w * 0.44, -h * 0.84, w * 0.88, h * 0.3);
    ctx.fillStyle = '#6b4426';
    for (let i = 0; i < 4; i++) ctx.fillRect(-w * 0.44, -h * (0.8 - i * 0.07), w * 0.88, h * 0.015);
    for (const sx of [-1, 1]) {
      const wx = sx * w * 0.46,
        wy = -h * 0.32,
        r = h * 0.32;
      ctx.strokeStyle = '#4a3020';
      ctx.lineWidth = Math.max(1, w * 0.04);
      ctx.beginPath();
      ctx.ellipse(wx, wy, r * 0.28, r, 0, 0, 7);
      ctx.stroke();
      ctx.lineWidth = Math.max(1, w * 0.015);
      ctx.beginPath();
      ctx.moveTo(wx, wy - r);
      ctx.lineTo(wx, wy + r);
      ctx.moveTo(wx - r * 0.28, wy);
      ctx.lineTo(wx + r * 0.28, wy);
      ctx.stroke();
    }
    ctx.restore();
  }
  function cyclist(cx, by, w, col, t) {
    const h = w * 1.45,
      pd = Math.sin(t * 9);
    ctx.save();
    ctx.translate(cx, by);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.3, h * 0.03, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#17141c';
    rr(-w * 0.06, -h * 0.3, w * 0.12, h * 0.3, w * 0.05);
    ctx.strokeStyle = '#3a3540';
    ctx.lineWidth = Math.max(1, w * 0.05);
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.3);
    ctx.lineTo(0, -h * 0.42);
    ctx.stroke();
    ctx.strokeStyle = '#2a2430';
    ctx.lineWidth = Math.max(1, w * 0.12);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-w * 0.1, -h * 0.44);
    ctx.lineTo(-w * 0.12, -h * (0.26 + pd * 0.06));
    ctx.moveTo(w * 0.1, -h * 0.44);
    ctx.lineTo(w * 0.12, -h * (0.26 - pd * 0.06));
    ctx.stroke();
    ctx.fillStyle = col;
    rr(-w * 0.24, -h * 0.78, w * 0.48, h * 0.38, w * 0.14);
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(1, w * 0.09);
    ctx.beginPath();
    ctx.moveTo(-w * 0.22, -h * 0.72);
    ctx.lineTo(-w * 0.4, -h * 0.62);
    ctx.moveTo(w * 0.22, -h * 0.72);
    ctx.lineTo(w * 0.4, -h * 0.62);
    ctx.stroke();
    ctx.strokeStyle = '#3a3540';
    ctx.lineWidth = Math.max(1, w * 0.05);
    ctx.beginPath();
    ctx.moveTo(-w * 0.42, -h * 0.62);
    ctx.lineTo(w * 0.42, -h * 0.62);
    ctx.stroke();
    ctx.fillStyle = '#6b4a3a';
    ctx.beginPath();
    ctx.arc(0, -h * 0.86, w * 0.15, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#ff2f3f';
    ctx.fillRect(-w * 0.05, -h * 0.36, w * 0.1, h * 0.03);
    ctx.lineCap = 'butt';
    ctx.restore();
  }
  function cow(cx, by, w, f) {
    const h = w * 0.55;
    ctx.save();
    ctx.translate(cx, by);
    if (f < 0) ctx.scale(-1, 1);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.5, h * 0.1, 0, 0, 7);
    ctx.fill();
    ctx.strokeStyle = '#d8d0c4';
    ctx.lineWidth = Math.max(1, w * 0.06);
    ctx.lineCap = 'round';
    for (const lx of [-0.3, -0.18, 0.2, 0.32]) {
      ctx.beginPath();
      ctx.moveTo(w * lx, -h * 0.5);
      ctx.lineTo(w * lx, -h * 0.04);
      ctx.stroke();
    }
    ctx.fillStyle = '#f1ebe0';
    rr(-w * 0.42, -h * 1.0, w * 0.8, h * 0.55, h * 0.25);
    ctx.beginPath();
    ctx.ellipse(w * 0.18, -h * 1.02, w * 0.12, h * 0.16, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#e4dccf';
    ctx.beginPath();
    ctx.ellipse(w * 0.46, -h * 0.92, w * 0.11, h * 0.17, 0.4, 0, 7);
    ctx.fill();
    ctx.strokeStyle = '#e8d9b0';
    ctx.lineWidth = Math.max(1, w * 0.025);
    ctx.beginPath();
    ctx.moveTo(w * 0.44, -h * 1.06);
    ctx.quadraticCurveTo(w * 0.42, -h * 1.3, w * 0.5, -h * 1.32);
    ctx.stroke();
    ctx.fillStyle = '#2a2430';
    ctx.beginPath();
    ctx.arc(w * 0.5, -h * 0.96, Math.max(0.6, w * 0.015), 0, 7);
    ctx.fill();
    ctx.strokeStyle = '#cfc6b8';
    ctx.lineWidth = Math.max(1, w * 0.02);
    ctx.beginPath();
    ctx.moveTo(-w * 0.42, -h * 0.85);
    ctx.quadraticCurveTo(-w * 0.52, -h * 0.6, -w * 0.48, -h * 0.35);
    ctx.stroke();
    ctx.fillStyle = '#ff9933';
    ctx.fillRect(w * 0.3, -h * 0.82, w * 0.05, h * 0.14);
    ctx.lineCap = 'butt';
    ctx.restore();
  }
  function lamp(x, y, u, d) {
    const h = 2400 * u,
      hx = x + d * u * 500,
      hy = y - h - u * 120;
    ctx.strokeStyle = '#2a2438';
    ctx.lineWidth = Math.max(1, u * 90);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - h);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,196,110,.28)';
    ctx.beginPath();
    ctx.arc(hx, hy, u * 420, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#ffe2a8';
    ctx.beginPath();
    ctx.arc(hx, hy, u * 110, 0, 7);
    ctx.fill();
  }
  function pine(x, y, u) {
    ctx.fillStyle = '#2a1e2e';
    ctx.fillRect(x - u * 70, y - u * 400, u * 140, u * 400);
    const cs = ['#1c3d38', '#22493f', '#2a5a4a'];
    for (let i = 0; i < 3; i++) {
      const w = u * (700 - i * 160),
        b = y - u * (300 + i * 600);
      ctx.fillStyle = cs[i];
      ctx.beginPath();
      ctx.moveTo(x - w, b);
      ctx.lineTo(x + w, b);
      ctx.lineTo(x, b - u * 900);
      ctx.fill();
    }
  }
  function pole(x, y, u, d) {
    const h = 2200 * u;
    ctx.strokeStyle = '#4a3a32';
    ctx.lineWidth = Math.max(1, u * 80);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - h);
    ctx.moveTo(x - u * 420, y - h + u * 160);
    ctx.lineTo(x + u * 420, y - h + u * 160);
    ctx.moveTo(x - u * 300, y - h + u * 500);
    ctx.lineTo(x + u * 300, y - h + u * 500);
    ctx.stroke();
  }
  function palm(x, y, u) {
    const tx = x + u * 160,
      ty = y - u * 1700;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#6b4a32';
    ctx.lineWidth = Math.max(1, u * 100);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + u * 20, y - u * 900, tx, ty);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, u * 80);
    for (let i = 0; i < 7; i++) {
      const a = (i / 6 - 0.5) * 2.6,
        dx = Math.sin(a) * u * 900;
      ctx.strokeStyle = i % 2 ? '#2f8a4a' : '#3fa05a';
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(
        tx + dx * 0.6,
        ty - u * 350 * Math.cos(a) - u * 100,
        tx + dx,
        ty + u * 250 + Math.abs(dx) * 0.12,
      );
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }
  function broad(x, y, u) {
    ctx.fillStyle = '#4a3626';
    ctx.fillRect(x - u * 90, y - u * 1100, u * 180, u * 1100);
    const cs = ['#1f6b34', '#2a7f3f', '#175a2b'];
    [
      [0, -1600, 700],
      [-480, -1350, 520],
      [480, -1380, 540],
      [-170, -2000, 480],
      [260, -1950, 440],
    ].forEach((b, i) => {
      ctx.fillStyle = cs[i % 3];
      ctx.beginPath();
      ctx.arc(x + u * b[0], y + u * b[1], u * b[2], 0, 7);
      ctx.fill();
    });
  }
  function cactus(x, y, u) {
    const r = (a, b, w, h) => {
      ctx.beginPath();
      ctx.roundRect(a, b, w, h, w / 2);
      ctx.fill();
    };
    ctx.fillStyle = '#3f7a45';
    r(x - u * 100, y - u * 1900, u * 200, u * 1900);
    r(x - u * 480, y - u * 1000, u * 400, u * 150);
    r(x - u * 480, y - u * 1450, u * 150, u * 600);
    r(x + u * 80, y - u * 1250, u * 400, u * 150);
    r(x + u * 330, y - u * 1700, u * 150, u * 600);
    ctx.fillStyle = '#2f6338';
    ctx.fillRect(x - u * 12, y - u * 1850, u * 24, u * 1800);
  }
  function sakura(x, y, u) {
    ctx.fillStyle = '#4a3340';
    ctx.fillRect(x - u * 80, y - u * 900, u * 160, u * 900);
    const cs = ['#f7b6cf', '#f29bbd', '#fbd0e0'];
    [
      [0, -1500, 650],
      [-420, -1250, 480],
      [430, -1280, 500],
      [-150, -1850, 450],
      [250, -1800, 420],
    ].forEach((b, i) => {
      ctx.fillStyle = cs[i % 3];
      ctx.beginPath();
      ctx.arc(x + u * b[0], y + u * b[1], u * b[2], 0, 7);
      ctx.fill();
    });
  }
  const TREES = { pine, palm, broad, cactus, sakura };
  function gate(s) {
    const u = (s.p1.s * W) / 2,
      y = s.p1.sy,
      cp = s.gate === 2,
      xl = s.p1.sx - u * RW * 1.25,
      xr = s.p1.sx + u * RW * 1.25,
      top = y - u * (cp ? 2600 : 3400);
    ctx.fillStyle = cp ? '#2fc9bd' : '#ff7a3d';
    ctx.fillRect(xl - u * 120, top, u * 240, y - top);
    ctx.fillRect(xr - u * 120, top, u * 240, y - top);
    const bh = u * 700,
      n = cp ? 10 : 16,
      bw = (xr - xl) / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#fff4e0' : cp ? '#0f5f5a' : '#1b1a3a';
        ctx.fillRect(xl + i * bw, top + (j * bh) / 2, bw + 1, bh / 2 + 1);
      }
  }

  /* light on the road: warm glare under the sun and a haze band that melts the horizon into the sky */
  function roadLight() {
    const hz = H / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gl = ctx.createRadialGradient(sunX, hz, 0, sunX, hz, W * 0.55);
    gl.addColorStop(0, 'rgba(' + TH.sun[2] + ',' + (TH.stars ? 0.08 : 0.2) + ')');
    gl.addColorStop(1, 'rgba(' + TH.sun[2] + ',0)');
    ctx.fillStyle = gl;
    ctx.fillRect(0, hz, W, H - hz);
    ctx.restore();
    const hzg = ctx.createLinearGradient(0, hz - H * 0.03, 0, hz + H * 0.09);
    hzg.addColorStop(0, 'rgba(255,255,255,0)');
    hzg.addColorStop(0.35, TH.fog + '88');
    hzg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hzg;
    ctx.fillRect(0, hz - H * 0.03, W, H * 0.12);
  }
  /* lens flare: ghosts along the line from the sun through the centre of the screen */
  function flare() {
    if (reduce || TH.stars || sunX < -sunR || sunX > W + sunR) return;
    const cx = W / 2,
      cy = H / 2,
      dx = cx - sunX,
      dy = cy - sunY,
      vis = 1 - Math.min(1, Math.abs(sunX - cx) / (W * 0.8));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [t, r, a, c] of [
      [0.5, 0.05, 0.1, '255,210,150'],
      [0.9, 0.09, 0.07, '255,150,90'],
      [1.3, 0.03, 0.12, '180,220,255'],
      [1.6, 0.14, 0.05, '255,190,120'],
    ]) {
      const x = sunX + dx * t,
        y = sunY + dy * t,
        rad = H * r,
        g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(' + c + ',' + a * vis + ')');
      g.addColorStop(0.7, 'rgba(' + c + ',' + a * vis * 0.5 + ')');
      g.addColorStop(1, 'rgba(' + c + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, 7);
      ctx.fill();
    }
    // light streak through the sun
    const st = ctx.createLinearGradient(sunX - W * 0.4, 0, sunX + W * 0.4, 0);
    st.addColorStop(0, 'rgba(255,220,180,0)');
    st.addColorStop(0.5, 'rgba(255,220,180,' + 0.09 * vis + ')');
    st.addColorStop(1, 'rgba(255,220,180,0)');
    ctx.fillStyle = st;
    ctx.fillRect(sunX - W * 0.4, sunY - 1, W * 0.8, 2);
    ctx.restore();
  }
  /* rushing streaks at the screen edges once you are flying */
  function speedLines(sf) {
    if (reduce || sf < 0.7 || state === 'menu') return;
    const a = (sf - 0.7) / 0.5;
    ctx.strokeStyle = 'rgba(255,244,224,' + 0.22 * a + ')';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1,
        y = H * (0.55 + Math.random() * 0.45),
        x = W / 2 + side * W * (0.32 + Math.random() * 0.2),
        len = W * (0.06 + Math.random() * 0.1) * a;
      ctx.moveTo(x, y);
      ctx.lineTo(x + side * len, y + len * 0.35);
    }
    ctx.stroke();
  }
  function render() {
    /* 3D: the WebGL view draws the world; this canvas only carries the overlay effects */
    if (window.view3d && window.view3d.ready) {
      ctx.clearRect(0, 0, W, H);
      window.view3d.frame();
      overlayFx(false);
      return;
    }
    ctx.save();
    if (shake > 0.1) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    sky();
    ctx.fillStyle = TH.fog;
    ctx.fillRect(0, H / 2, W, H / 2);
    const bs = segs[Math.floor(pos / SL) % N],
      bp = (pos % SL) / SL,
      py = bs.p1.y + (bs.p2.y - bs.p1.y) * bp;
    let x = 0,
      dx = -bs.c * bp,
      maxy = H;
    for (let n = 0; n < DRAW; n++) {
      const s = segs[(bs.i + n) % N],
        lp = s.i < bs.i ? TL : 0;
      proj(s.p1, px * RW - x, CH + py, pos - lp);
      proj(s.p2, px * RW - x - dx, CH + py, pos - lp);
      x += dx;
      dx += s.c;
      s.cl = maxy;
      if (s.p1.cz <= CD || s.p2.sy >= s.p1.sy || s.p2.sy >= maxy) continue;
      drawSeg(s, n);
      maxy = s.p2.sy;
    }
    roadLight();
    for (let n = DRAW - 1; n >= 0; n--) {
      const s = segs[(bs.i + n) % N];
      if (s.p1.cz <= CD || (!s.sp.length && !s.cars.length && !s.gate)) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, s.cl);
      ctx.clip();
      ctx.globalAlpha = 1 - Math.min(0.95, Math.pow(n / DRAW, 1.6));
      const sc = s.p1.s,
        u = (sc * W) / 2;
      if (s.gate) gate(s);
      for (const o of s.sp) {
        const X = s.p1.sx + (sc * o.o * RW * W) / 2;
        if (o.t === 'P') TREES[TH.trees[o.k]](X, s.p1.sy, u * o.z);
        else (TH.lamp === 2 ? pole : lamp)(X, s.p1.sy, u, o.o < 0 ? 1 : -1);
      }
      for (const c of s.cars) {
        const pc = (c.z % SL) / SL,
          k = lerp(s.p1.s, s.p2.s, pc),
          X = lerp(s.p1.sx, s.p2.sx, pc) + (k * c.o * RW * W) / 2,
          Y = lerp(s.p1.sy, s.p2.sy, pc),
          w = ((k * W) / 2) * 720;
        if (w > 2 && c.hz) {
          if (c.hz === 'rick') rick(X, Y, w * 0.85);
          else if (c.hz === 'cyc') cyclist(X, Y, w * 0.55, c.col, tg + c.ph);
          else if (c.hz === 'cart') cart(X, Y, w * 1.05);
          else cow(X, Y, w * 1.1, Math.cos(c.ph));
        } else if (w > 2) {
          car(X, Y, w, c.col, 0, 0, c.rv ? 1 : 0, c.body);
          if (c.rv && w > 34) {
            ctx.font =
              '800 ' + Math.max(12, Math.round(w * 0.17)) + "px 'Big Shoulders Display',Impact,sans-serif";
            ctx.textAlign = 'center';
            ctx.fillStyle = '#fff4e0';
            ctx.shadowColor = '#13113a';
            ctx.shadowBlur = 6;
            ctx.fillText(c.name, X, Y - w * 0.6);
            ctx.shadowBlur = 0;
          }
        }
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (boost > 0.1 && !reduce) {
      ctx.strokeStyle = 'rgba(255,230,180,' + 0.5 * boost + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * 6.283,
          r1 = Math.min(W, H) * (0.3 + Math.random() * 0.2),
          r2 = r1 + Math.min(W, H) * (0.15 + Math.random() * 0.25);
        ctx.moveTo(W / 2 + Math.cos(a) * r1 * 1.4, H * 0.55 + Math.sin(a) * r1);
        ctx.lineTo(W / 2 + Math.cos(a) * r2 * 1.4, H * 0.55 + Math.sin(a) * r2);
      }
      ctx.stroke();
    }
    const sf = speed / MAXS,
      pw = Math.min(W * 0.24, H * 0.42),
      bob = Math.sin(tg * 45) * sf * 2;
    speedLines(sf);
    car(
      W / 2,
      H - H * 0.045 + bob,
      pw,
      loginOpen || !me ? selCol : me.color,
      boost > 0.3,
      steer * 0.05 * sf - bs.c * 0.006 * sf + da * 0.2,
      1,
      loginOpen || !me ? selBody : me.body,
    );
    ctx.restore();
    overlayFx(true);
  }
  /* sparks, smoke, boost glow, rain, vignette and the countdown, drawn over either renderer */
  function overlayFx(flat) {
    if (sparks.length) {
      for (const s of sparks) {
        ctx.globalAlpha = (1 - s.t / s.l) * (s.col ? 0.7 : 1);
        ctx.fillStyle = s.col || '#ffc15e';
        if (s.sz) {
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.sz * (1 + s.t), 0, 7);
          ctx.fill();
        } else ctx.fillRect(s.x, s.y, 3, 3);
      }
      ctx.globalAlpha = 1;
    }
    if (boost > 0.05 && !reduce) {
      const g = ctx.createRadialGradient(
        W / 2,
        H / 2,
        Math.min(W, H) * 0.3,
        W / 2,
        H / 2,
        Math.max(W, H) * 0.7,
      );
      g.addColorStop(0, 'rgba(255,122,61,0)');
      g.addColorStop(1, 'rgba(255,150,60,' + 0.4 * boost + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if ((TH.rain || wx) && !reduce) {
      ctx.strokeStyle = 'rgba(220,235,245,.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 80; i++) {
        const x0 = Math.random() * W,
          y0 = Math.random() * H;
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 - 6, y0 + 24);
      }
      ctx.stroke();
    }
    if (flat) flare();
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
    if (state === 'count' || goT > 0) {
      const fr = state === 'count' ? cd % 1 : goT / 0.8,
        t = state === 'count' ? String(Math.min(3, Math.ceil(cd))) : 'Go';
      ctx.font =
        '900 ' + Math.round(H * 0.22 * (1 + fr * 0.25)) + "px 'Big Shoulders Display',Impact,sans-serif";
      ctx.textAlign = 'center';
      ctx.globalAlpha = state === 'count' ? 1 : Math.min(1, goT * 3);
      ctx.fillStyle = '#fff4e0';
      ctx.shadowColor = '#ff7a3d';
      ctx.shadowBlur = 40;
      ctx.fillText(t, W / 2, H * 0.4);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
  }

  let lt = 0;
  function loop(t) {
    const dt = clamp((t - lt) / 1000 || 0, 0, 0.05);
    lt = t;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }
  showMenu();
  requestAnimationFrame(loop);
  /* read-only view of the game for the 3D renderer (js/view3d.js) */
  window.__game = {
    SL,
    RW,
    PZ,
    CH,
    get N() {
      return N;
    },
    get TL() {
      return TL;
    },
    get trackVer() {
      return trackVer;
    },
    get segs() {
      return segs;
    },
    get TH() {
      return TH;
    },
    get map() {
      return mapSel;
    },
    get cars() {
      return cars;
    },
    get pos() {
      return pos;
    },
    get px() {
      return px;
    },
    get speed() {
      return speed / MAXS;
    },
    get steer() {
      return steer;
    },
    get drift() {
      return da;
    },
    get boost() {
      return boost;
    },
    get shake() {
      return shake;
    },
    get rain() {
      return !!(TH.rain || wx);
    },
    get state() {
      return state;
    },
    get t() {
      return tg;
    },
    get player() {
      return loginOpen || !me ? { col: selCol, body: selBody } : { col: me.color, body: me.body };
    },
    get reduce() {
      return reduce;
    },
  };
  window.__ghat = {
    hurt,
    get dmg() {
      return dmg;
    },
    get drifting() {
      return drifting;
    },
    get nit() {
      return nit;
    },
    inp,
    get px() {
      return px;
    },
    get cars() {
      return cars;
    },
    setMap: pickMap,
    get map() {
      return mapSel;
    },
    warp(p) {
      pos = p;
    },
    get state() {
      return state;
    },
    get me() {
      return me;
    },
    ranking,
    begin,
    get pos() {
      return pos;
    },
    get speed() {
      return speed;
    },
    TL,
  };
})();
