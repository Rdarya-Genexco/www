/* 3D renderer for Worldwide Wheels.
   game.js runs the race (track, physics, rivals, menus); this module turns its state into a Three.js scene
   every frame. If WebGL is missing, window.view3d never becomes ready and game.js keeps its 2D renderer. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const G = window.__game;
/* game units -> metres: along the road, across it, and up (the 2D game exaggerates hills) */
const FS = 0.01,
  LS = 0.005,
  YS = 0.003,
  CAR = 1.35; // car models are scaled up to match the game's wide lanes
const coarse = matchMedia('(pointer:coarse)').matches;

/* ---------- renderer, camera, post-processing ---------- */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: !coarse, powerPreference: 'high-performance' });
} catch (e) {
  console.warn('WebGL unavailable, using the 2D renderer', e);
}
if (renderer && G) start();

function start() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.25 : 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const el = renderer.domElement;
  el.id = 'gl';
  document.body.prepend(el);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 4000);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.45, 0.96);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  /* ---------- lights and sky ---------- */
  const hemi = new THREE.HemisphereLight(0xffffff, 0x404030, 0.9);
  const sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  Object.assign(sunLight.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 400 });
  sunLight.shadow.bias = -0.0005;
  scene.add(hemi, sunLight, sunLight.target);

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      c0: { value: new THREE.Color() },
      c1: { value: new THREE.Color() },
      c2: { value: new THREE.Color() },
      c3: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3() },
      sunCol: { value: new THREE.Color() },
    },
    vertexShader:
      'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform vec3 c0,c1,c2,c3,sunDir,sunCol;varying vec3 vP;
      void main(){vec3 d=normalize(vP);float h=d.y;vec3 c;
        if(h>.45)c=mix(c1,c0,smoothstep(.45,1.,h));else if(h>.12)c=mix(c2,c1,smoothstep(.12,.45,h));else c=mix(c3,c2,smoothstep(-.02,.12,h));
        float s=max(dot(d,sunDir),0.);c+=sunCol*(pow(s,8.)*.35+pow(s,64.)*.6);
        gl_FragColor=vec4(c,1.);}`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 16), skyMat);
  sky.renderOrder = -1;
  scene.add(sky);
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(40, 24, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, toneMapped: false }),
  );
  scene.add(sun);
  const starGeo = new THREE.BufferGeometry();
  {
    const a = [];
    for (let i = 0; i < 900; i++) {
      const u = Math.random() * Math.PI * 2,
        v = 0.08 + Math.random() * 0.9;
      a.push(Math.cos(u) * Math.sqrt(1 - v * v) * 1900, v * 1900, Math.sin(u) * Math.sqrt(1 - v * v) * 1900);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
  }
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({
      color: 0xfff4e0,
      size: 2.2,
      sizeAttenuation: false,
      fog: false,
      transparent: true,
    }),
  );
  scene.add(stars);

  /* ---------- shared materials ---------- */
  const M = {
    rubber: new THREE.MeshStandardMaterial({ color: 0x141218, roughness: 0.85 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xb8bcc8, metalness: 1, roughness: 0.25 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0b0a14, metalness: 0.2, roughness: 0.05, clearcoat: 1 }),
    tail: new THREE.MeshStandardMaterial({ color: 0xff2030, emissive: 0xff1020, emissiveIntensity: 1.4 }),
    head: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 1.2 }),
    black: new THREE.MeshStandardMaterial({ color: 0x0e0d14, roughness: 0.6 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0x9a9aa8, metalness: 1, roughness: 0.2 }),
    plate: new THREE.MeshStandardMaterial({ color: 0xe8e2cf, roughness: 0.5 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.9 }),
    hay: new THREE.MeshStandardMaterial({ color: 0xd9b45a, roughness: 1 }),
    cowWhite: new THREE.MeshStandardMaterial({ color: 0xf1ebe0, roughness: 0.8 }),
    skin: new THREE.MeshStandardMaterial({ color: 0x6b4a3a, roughness: 0.8 }),
    pothole: new THREE.MeshStandardMaterial({
      color: 0x141218,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
    puddle: new THREE.MeshStandardMaterial({
      color: 0x7088a8,
      roughness: 0.05,
      metalness: 0.6,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    }),
  };
  const paintCache = new Map();
  const paint = col => {
    if (!paintCache.has(col))
      paintCache.set(
        col,
        new THREE.MeshPhysicalMaterial({
          color: col,
          metalness: 0.25,
          roughness: 0.32,
          clearcoat: 1,
          clearcoatRoughness: 0.06,
        }),
      );
    return paintCache.get(col);
  };
  const flat = col => new THREE.MeshStandardMaterial({ color: col, roughness: 0.85 });

  /* ---------- geometry helpers ---------- */
  const box = (w, h, l, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  };
  /* rounded slab for car bodies */
  const rbox = (w, h, l, mat, x = 0, y = 0, z = 0, r = 0.14) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, l, 3, Math.min(r, h / 2.2)), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  };
  /* a box whose top is narrower than its bottom (cabins, wedge noses) */
  const taper = (wb, wt, h, lb, lt, mat, x = 0, y = 0, z = 0, shiftZ = 0) => {
    const g = new THREE.BoxGeometry(1, 1, 1),
      p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const top = p.getY(i) > 0;
      p.setXYZ(
        i,
        p.getX(i) * (top ? wt : wb),
        p.getY(i) * h,
        p.getZ(i) * (top ? lt : lb) + (top ? shiftZ : 0),
      );
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  };
  const cyl = (rt, rb, h, mat, seg = 12) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.castShadow = true;
    return m;
  };
  const wheel = (r, wdt, x, z) => {
    const g = new THREE.Group();
    const t = cyl(r, r, wdt, M.rubber, 20);
    t.rotation.z = Math.PI / 2;
    const h = cyl(r * 0.62, r * 0.62, wdt * 1.02, M.rim, 10);
    h.rotation.z = Math.PI / 2;
    g.add(t, h);
    g.position.set(x, r, z);
    g.userData.spin = true;
    return g;
  };

  /* ---------- car models (metres; +z is the back of the car, facing the camera) ----------
     Each body is a smooth side profile (spline through the nose, hood, windscreen, roof, rear window and
     tail) extruded across the car with rounded edges, then narrowed above the waist like a real cabin.
     L length, W width, r ride height; heights above r: hood, roof, deck; u positions along the car (front
     is -L/2): ws windscreen base, rf/rr roof front/rear, rw rear window base. */
  const SPEC = {
    coupe: {
      L: 4.4,
      W: 1.86,
      r: 0.22,
      hood: 0.72,
      roof: 1.3,
      deck: 0.8,
      ws: -0.75,
      rf: -0.1,
      rr: 0.6,
      rw: 1.35,
    },
    hatch: {
      L: 3.95,
      W: 1.78,
      r: 0.24,
      hood: 0.74,
      roof: 1.42,
      deck: 0.95,
      ws: -0.75,
      rf: -0.15,
      rr: 1.15,
      rw: 1.75,
    },
    wedge: {
      L: 4.5,
      W: 1.94,
      r: 0.2,
      hood: 0.6,
      roof: 1.12,
      deck: 0.78,
      ws: -0.55,
      rf: 0.15,
      rr: 0.7,
      rw: 1.6,
      wing: 1,
    },
    van: {
      L: 4.7,
      W: 1.92,
      r: 0.28,
      hood: 0.9,
      roof: 1.95,
      deck: 1.4,
      ws: -1.65,
      rf: -1.05,
      rr: 2.15,
      rw: 2.3,
    },
    roadster: {
      L: 4.1,
      W: 1.8,
      r: 0.2,
      hood: 0.66,
      roof: 0.98,
      deck: 0.74,
      ws: -0.45,
      rf: -0.15,
      rr: 0.05,
      rw: 0.35,
      open: 1,
    },
    pickup: {
      L: 5.0,
      W: 1.96,
      r: 0.34,
      hood: 0.86,
      roof: 1.62,
      deck: 0.92,
      ws: -0.95,
      rf: -0.45,
      rr: 0.35,
      rw: 0.45,
      bed: 1,
    },
    toro: {
      L: 4.6,
      W: 2.04,
      r: 0.16,
      hood: 0.5,
      roof: 1.08,
      deck: 0.82,
      ws: -0.75,
      rf: 0.0,
      rr: 0.55,
      rw: 1.75,
      sup: 1,
    },
    rosso: {
      L: 4.6,
      W: 2.0,
      r: 0.17,
      hood: 0.56,
      roof: 1.16,
      deck: 0.84,
      ws: -0.6,
      rf: 0.1,
      rr: 0.65,
      rw: 1.6,
      sup: 1,
    },
    veyra: {
      L: 4.55,
      W: 2.04,
      r: 0.18,
      hood: 0.62,
      roof: 1.18,
      deck: 0.92,
      ws: -0.55,
      rf: 0.15,
      rr: 0.7,
      rw: 1.5,
      sup: 1,
      wing: 2,
    },
    phantom: {
      L: 4.7,
      W: 2.06,
      r: 0.15,
      hood: 0.48,
      roof: 1.04,
      deck: 0.8,
      ws: -0.8,
      rf: -0.05,
      rr: 0.5,
      rw: 1.8,
      sup: 1,
      wing: 3,
    },
  };
  /* extrude a side profile (u along the car, v up) across width w, centred, rounded, with the cabin narrowed */
  function sculpt(pts, w, bevel, waist, roofV) {
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    sh.splineThru(pts.slice(1, -1).map(p => new THREE.Vector2(p[0], p[1])));
    sh.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, {
      depth: w - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 4,
      curveSegments: 28,
    });
    g.translate(0, 0, -(w - bevel * 2) / 2);
    g.rotateY(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y > waist) p.setX(i, p.getX(i) * (1 - 0.2 * Math.min(1, (y - waist) / (roofV - waist))));
    }
    g.computeVertexNormals();
    return g;
  }
  function makeCar(body, col) {
    const s = SPEC[body] || SPEC.coupe,
      g = new THREE.Group(),
      pm = paint(col),
      { L, W, r } = s,
      B = s.sup ? 0.14 : 0.12, // rounded edge size: the extrusion grows outward by this much
      f = -L / 2,
      b = L / 2,
      waist = r + Math.max(s.hood, s.deck) + 0.02,
      mesh = (geo, mat) => {
        const m = new THREE.Mesh(geo, mat);
        m.castShadow = true;
        return m;
      };
    // painted body: bumper, nose, hood, windscreen, roof, rear window, deck, tail
    const top = [
      [f, r + 0.1],
      [f + 0.04, r + s.hood * 0.62],
      [f + 0.5, r + s.hood],
      [s.ws, r + s.hood + 0.05],
      [s.rf, r + s.roof],
      [(s.rf + s.rr) / 2, r + s.roof + 0.03],
      [s.rr, r + s.roof],
      [s.rw, r + s.deck + 0.04],
      [b - 0.3, r + s.deck],
      [b, r + s.deck * 0.72],
      [b, r + 0.1],
    ];
    if (s.open) top.splice(4, 3, [s.rf, r + s.roof], [s.rr, r + s.deck + 0.12]);
    g.add(mesh(sculpt(top, W, B, waist, r + s.roof), pm));
    // greenhouse glass: same lines, slightly proud of the pillars, roof stays painted
    if (!s.open) {
      // glass sits just outside the painted greenhouse; a painted roof panel goes back on top
      const gl = [
        [s.ws - 0.04, waist - 0.06],
        [s.ws - 0.03, r + s.hood + 0.07],
        [s.rf - 0.02, r + s.roof + 0.025],
        [s.rr + 0.02, r + s.roof + 0.025],
        [s.rw + 0.04, r + s.deck + 0.07],
        [s.rw + 0.05, waist - 0.06],
      ];
      g.add(mesh(sculpt(gl, W + 0.02, B, waist, r + s.roof), M.glass));
      const mid = (s.rf + s.rr) / 2,
        roof = [
          [s.rf + 0.12, r + s.roof + 0.02],
          [s.rf + 0.16, r + s.roof + 0.06],
          [mid, r + s.roof + 0.085],
          [s.rr - 0.16, r + s.roof + 0.06],
          [s.rr - 0.12, r + s.roof + 0.02],
        ];
      g.add(mesh(sculpt(roof, W - 0.12, 0.05, waist, r + s.roof), pm));
    } else {
      const ws = mesh(
        sculpt(
          [
            [s.rf - 0.05, waist - 0.02],
            [s.rf - 0.02, waist + 0.05],
            [s.rf + 0.05, r + s.roof],
            [s.rf + 0.1, waist - 0.02],
          ],
          W * 0.9,
          0.04,
          waist,
          r + s.roof,
        ),
        M.glass,
      );
      g.add(ws);
      g.add(box(0.42, 0.42, 0.42, M.skin, -0.42, waist + 0.2, s.rr + 0.15));
    }
    // dark sills between the wheels and a lower rear valance
    g.add(box(W + 0.02, 0.12, L * 0.5, M.black, 0, r - 0.04, 0));
    if (s.bed) g.add(box(W * 0.84, 0.06, 1.5, M.black, 0, r + s.deck - 0.02, b - 1.0));
    if (s.sup) {
      g.add(box(W * 0.84, 0.16, 0.3, M.black, 0, r + 0.1, b - 0.12));
      for (let i = -3; i <= 3; i++) g.add(box(0.025, 0.14, 0.32, M.black, i * 0.22, r + 0.12, b - 0.06));
      for (const sx of [-1, 1])
        g.add(box(0.06, 0.26, 0.9, M.black, sx * (W / 2 - 0.01), r + s.deck * 0.6, 0.6));
    }
    // rear wing
    if (s.wing) {
      const wy = r + s.deck + (s.wing === 3 ? 0.55 : s.wing === 2 ? 0.4 : 0.24);
      for (const sx of [-0.5, 0.5])
        g.add(box(0.05, wy - r - s.deck, 0.12, M.black, sx, (wy + r + s.deck) / 2, b - 0.35));
      g.add(
        rbox(
          W * (s.wing === 3 ? 1.04 : 0.92),
          0.06,
          0.42,
          s.wing === 3 ? pm : M.black,
          0,
          wy,
          b - 0.35,
          0.03,
        ),
      );
    }
    // lights, plate, exhausts
    const rz = b + B + 0.01,
      ly = r + s.deck * 0.68;
    if (body === 'veyra') g.add(box(W * 0.8, 0.045, 0.03, M.tail, 0, ly + 0.06, rz));
    else if (body === 'rosso')
      for (const x of [-0.72, -0.48, 0.48, 0.72]) {
        const l = cyl(0.085, 0.085, 0.04, M.tail, 16);
        l.rotation.x = Math.PI / 2;
        l.position.set(x, ly, rz);
        g.add(l);
      }
    else if (body === 'toro' || body === 'phantom')
      for (const sx of [-1, 1]) {
        g.add(box(0.5, 0.04, 0.03, M.tail, sx * 0.6, ly, rz));
        g.add(box(0.04, 0.18, 0.03, M.tail, sx * 0.6, ly - 0.09, rz));
      }
    else for (const sx of [-1, 1]) g.add(rbox(0.4, 0.13, 0.04, M.tail, sx * (W / 2 - 0.32), ly, rz, 0.03));
    for (const sx of [-1, 1])
      g.add(rbox(0.36, 0.1, 0.04, M.head, sx * (W / 2 - 0.32), r + s.hood * 0.6, f - B - 0.01, 0.03));
    g.add(box(0.5, 0.13, 0.02, M.plate, 0, r + s.deck * 0.38, rz + 0.01));
    const ex = s.sup ? (body === 'rosso' ? [-0.42, -0.3, 0.3, 0.42] : [0]) : [0.55];
    for (const x of ex) {
      const big = s.sup && ex.length === 1,
        e = cyl(big ? 0.12 : 0.05, big ? 0.12 : 0.05, 0.2, M.chrome, 16);
      e.rotation.x = Math.PI / 2;
      e.position.set(x, r + 0.14, rz);
      g.add(e);
    }
    // wheels, slightly proud of the body
    const wr = s.sup ? 0.36 : 0.34,
      wx = W / 2 - 0.02,
      wz = L / 2 - 0.85;
    for (const [x, z] of [
      [-wx, -wz],
      [wx, -wz],
      [-wx, wz],
      [wx, wz],
    ])
      g.add(wheel(wr, s.sup ? 0.3 : 0.25, x, z));
    g.scale.setScalar(CAR);
    return g;
  }
  function makeHazard(k, col) {
    const g = new THREE.Group();
    if (k === 'rick') {
      g.add(rbox(1.4, 0.8, 2.6, flat(0x1f6b3a), 0, 0.75, 0));
      g.add(taper(1.4, 1.2, 0.7, 2.6, 2.2, flat(0xf2c418), 0, 1.5, 0));
      g.add(box(1.0, 0.45, 0.05, M.glass, 0, 1.45, 1.31));
      for (const sx of [-1, 1]) g.add(box(0.2, 0.1, 0.03, M.tail, sx * 0.55, 0.6, 1.31));
      g.add(wheel(0.25, 0.15, -0.6, 0.8), wheel(0.25, 0.15, 0.6, 0.8), wheel(0.25, 0.15, 0, -1.1));
      g.scale.setScalar(CAR * 0.95);
    } else if (k === 'cart') {
      g.add(box(1.7, 0.5, 2.4, M.wood, 0, 1.0, 0.4));
      const hay = new THREE.Mesh(
        new THREE.SphereGeometry(0.95, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        M.hay,
      );
      hay.scale.set(0.9, 0.7, 1.2);
      hay.position.set(0, 1.25, 0.4);
      g.add(hay);
      for (const sx of [-1, 1]) {
        const w = wheel(0.7, 0.1, sx * 0.95, 0.4);
        g.add(w);
        // a bullock pulling on each side of the shaft
        const b = new THREE.Group();
        b.add(box(0.6, 0.65, 1.5, M.cowWhite, 0, 1.0, 0));
        b.add(box(0.36, 0.35, 0.5, M.cowWhite, 0, 1.25, -0.9));
        b.add(box(0.3, 0.3, 0.3, M.cowWhite, 0, 1.45, 0.25));
        for (const [lx, lz] of [
          [-0.2, -0.5],
          [0.2, -0.5],
          [-0.2, 0.5],
          [0.2, 0.5],
        ])
          b.add(box(0.12, 0.7, 0.12, M.cowWhite, lx, 0.35, lz));
        for (const hx of [-0.14, 0.14]) b.add(box(0.05, 0.3, 0.05, M.plate, hx, 1.55, -0.95));
        b.position.set(sx * 0.5, 0, -2.0);
        g.add(b);
      }
      g.add(box(0.1, 0.1, 2.2, M.wood, 0, 0.9, -1.4));
      g.scale.setScalar(CAR * 0.9);
    } else if (k === 'cow') {
      g.add(box(0.75, 0.75, 1.8, M.cowWhite, 0, 1.1, 0));
      g.add(box(0.4, 0.35, 0.4, M.cowWhite, 0, 1.6, -0.4));
      g.add(box(0.4, 0.42, 0.6, M.cowWhite, 0, 1.3, -1.15));
      for (const hx of [-0.15, 0.15]) g.add(box(0.06, 0.3, 0.06, M.plate, hx, 1.62, -1.2));
      for (const [lx, lz] of [
        [-0.25, -0.65],
        [0.25, -0.65],
        [-0.25, 0.65],
        [0.25, 0.65],
      ])
        g.add(box(0.15, 0.75, 0.15, M.cowWhite, lx, 0.37, lz));
      g.add(box(0.06, 0.6, 0.06, M.cowWhite, 0, 0.95, 0.95));
      g.add(box(0.1, 0.12, 0.1, flat(0xff9933), 0.3, 1.4, -0.9));
      g.scale.setScalar(CAR * 0.9);
    } else {
      // cyclist
      g.add(wheel(0.34, 0.05, 0, -0.55), wheel(0.34, 0.05, 0, 0.55));
      g.add(box(0.05, 0.05, 1.1, M.black, 0, 0.6, 0));
      g.add(box(0.05, 0.5, 0.05, M.black, 0, 0.85, 0.3));
      g.add(box(0.5, 0.04, 0.04, M.black, 0, 1.05, -0.45));
      g.add(taper(0.45, 0.4, 0.62, 0.3, 0.26, paint(col), 0, 1.35, 0.15));
      g.add(box(0.22, 0.24, 0.22, M.skin, 0, 1.8, 0.05));
      for (const sx of [-1, 1]) g.add(box(0.1, 0.55, 0.12, M.black, sx * 0.12, 0.8, 0.2));
      g.add(box(0.1, 0.05, 0.03, M.tail, 0, 0.7, 0.58));
      g.scale.setScalar(CAR * 0.95);
    }
    return g;
  }
  /* rival name tags */
  function label(text) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const x = c.getContext('2d');
    x.font = "800 40px 'Big Shoulders Display',Impact,sans-serif";
    x.textAlign = 'center';
    x.fillStyle = 'rgba(19,17,58,.6)';
    x.beginPath();
    x.roundRect(40, 6, 176, 52, 26);
    x.fill();
    x.fillStyle = '#e9dcc4';
    x.fillText(text, 128, 46);
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, fog: false }),
    );
    s.scale.set(2.8, 0.7, 1);
    s.position.y = 2.6;
    s.scale.multiplyScalar(1 / CAR);
    s.renderOrder = 5;
    return s;
  }

  /* ---------- world: built from the game's track whenever the map changes ---------- */
  let world = null,
    builtVer = -1,
    P = [];
  const disposeTree = o =>
    o.traverse(c => {
      if (c.geometry) c.geometry.dispose();
    });
  function buildWorld() {
    if (world) {
      scene.remove(world);
      disposeTree(world);
    }
    world = new THREE.Group();
    scene.add(world);
    const segs = G.segs,
      N = G.N,
      TH = G.TH,
      SL = G.SL;
    /* centre line: integrate the bends (plus one full turn so the course forms a loop), then pull the end
       back onto the start so the lap closes */
    let mean = 0;
    for (const s of segs) mean += s.c;
    mean /= N;
    let h = 0,
      x = 0,
      z = 0;
    P = [];
    for (let i = 0; i < N; i++) {
      P.push({ x, z, y: segs[i].p1.y * YS });
      h += (segs[i].c - mean) * 0.0062 + (Math.PI * 2) / N;
      x += Math.cos(h) * SL * FS;
      z += Math.sin(h) * SL * FS;
    }
    for (let i = 0; i < N; i++) {
      P[i].x -= (x * i) / N;
      P[i].z -= (z * i) / N;
    }
    for (let i = 0; i < N; i++) {
      const a = P[(i - 1 + N) % N],
        b = P[(i + 1) % N],
        dx = b.x - a.x,
        dz = b.z - a.z,
        l = Math.hypot(dx, dz) || 1;
      P[i].fx = dx / l;
      P[i].fz = dz / l;
    }
    let minY = 1e9,
      cx = 0,
      cz = 0;
    for (const p of P) {
      minY = Math.min(minY, p.y);
      cx += p.x / N;
      cz += p.z / N;
    }
    let rad = 0;
    for (const p of P) rad = Math.max(rad, Math.hypot(p.x - cx, p.z - cz));

    /* ribbons: strips along the whole track between two lateral offsets (in road half-widths) */
    const W = G.RW * LS;
    function ribbon(o1, o2, colorOf, yOff = 0, keep = () => true) {
      const pos = [],
        col = [],
        c = new THREE.Color();
      for (let i = 0; i < N; i++) {
        const s = segs[i];
        if (!keep(s)) continue;
        const a = P[i],
          b = P[(i + 1) % N];
        const pt = (p, o) => [p.x - p.fz * o * W, p.y + yOff, p.z + p.fx * o * W];
        const a1 = pt(a, o1),
          a2 = pt(a, o2),
          b1 = pt(b, o1),
          b2 = pt(b, o2);
        pos.push(...a1, ...b1, ...a2, ...a2, ...b1, ...b2);
        c.set(colorOf(s));
        for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.computeVertexNormals();
      return g;
    }
    const vmat = (rough, metal = 0) =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: rough,
        metalness: metal,
        side: THREE.DoubleSide,
      });
    const add = (geo, mat, recv = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = recv;
      world.add(m);
      return m;
    };
    const wet = TH.rain;
    add(
      ribbon(-1, 1, s => (s.i < 4 ? TH.road[0] : TH.road[s.k])),
      vmat(wet ? 0.35 : 0.88, wet ? 0.3 : 0),
    );
    add(
      ribbon(-1.17, -1, s => (s.i < 4 ? '#fff4e0' : TH.rum[s.k]), 0.015),
      vmat(0.7),
    );
    add(
      ribbon(1, 1.17, s => (s.i < 4 ? '#fff4e0' : TH.rum[s.k]), 0.015),
      vmat(0.7),
    );
    for (const o of [-1 / 3, 1 / 3])
      add(
        ribbon(
          o - 0.012,
          o + 0.012,
          () => '#e9e2d0',
          0.02,
          s => !s.k && s.i >= 4,
        ),
        vmat(0.6),
      );
    add(
      ribbon(-14, -1.17, s => TH.grass[s.k], -0.06),
      vmat(1),
    );
    add(
      ribbon(1.17, 14, s => TH.grass[s.k], -0.06),
      vmat(1),
    );
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), flat(TH.grass[1]));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, minY - 0.6, cz);
    ground.receiveShadow = true;
    world.add(ground);

    /* start gate and checkpoints */
    for (const s of segs) {
      if (!s.gate) continue;
      const p = P[s.i],
        cp = s.gate === 2,
        g = new THREE.Group(),
        hgt = cp ? 7 : 9,
        span = W * 2.5;
      const post = flat(cp ? 0x2fc9bd : 0xff7a3d);
      for (const sx of [-1, 1]) {
        const m = box(0.6, hgt, 0.6, post, (sx * span) / 2, hgt / 2, 0);
        g.add(m);
      }
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 32;
      const x2 = c.getContext('2d');
      for (let i = 0; i < 16; i++)
        for (let j = 0; j < 2; j++) {
          x2.fillStyle = (i + j) % 2 ? '#fff4e0' : cp ? '#0f5f5a' : '#1b1a3a';
          x2.fillRect(i * 16, j * 16, 16, 16);
        }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      g.add(
        box(span, 1.6, 0.3, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), 0, hgt - 0.8, 0),
      );
      g.position.set(p.x, p.y, p.z);
      g.rotation.y = -Math.atan2(p.fz, p.fx) + Math.PI / 2;
      world.add(g);
    }

    /* potholes (Mumbai) */
    const ph = [];
    for (const s of segs) if (s.ph) for (const q of s.ph) ph.push([s.i, q]);
    if (ph.length) {
      const geo = new THREE.CircleGeometry(1, 16);
      geo.rotateX(-Math.PI / 2);
      const holes = new THREE.InstancedMesh(geo, M.pothole, ph.length),
        wetH = new THREE.InstancedMesh(geo, M.puddle, ph.length),
        m4 = new THREE.Matrix4(),
        q4 = new THREE.Quaternion();
      ph.forEach(([i, q], n) => {
        const p = P[i],
          ox = -p.fz * q.o * W,
          oz = p.fx * q.o * W,
          r = q.w * W * 0.9;
        q4.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(p.fz, p.fx));
        m4.compose(new THREE.Vector3(p.x + ox, p.y + 0.03, p.z + oz), q4, new THREE.Vector3(r, 1, r * 0.7));
        holes.setMatrixAt(n, m4);
        m4.compose(
          new THREE.Vector3(p.x + ox, p.y + 0.035, p.z + oz),
          q4,
          new THREE.Vector3(r * 0.55, 1, r * 0.35),
        );
        wetH.setMatrixAt(n, m4);
      });
      world.add(holes, wetH);
    }

    /* roadside: trees, lamps, poles as instanced meshes */
    const parts = {};
    const put = (kind, list, mtx) => (parts[kind] = parts[kind] || { list, m: [] }).m.push(mtx);
    const T = {
      pine: [
        [new THREE.CylinderGeometry(0.25, 0.35, 2.4, 6).translate(0, 1.2, 0), flat(0x3a2a2e)],
        [new THREE.ConeGeometry(2.6, 4, 7).translate(0, 4, 0), flat(0x1f4a3e)],
        [new THREE.ConeGeometry(2.0, 3.4, 7).translate(0, 6, 0), flat(0x245544)],
        [new THREE.ConeGeometry(1.4, 2.8, 7).translate(0, 7.8, 0), flat(0x2c6450)],
      ],
      palm: [
        [new THREE.CylinderGeometry(0.18, 0.3, 7, 6).translate(0, 3.5, 0), flat(0x6b4a32)],
        ...[0, 1, 2, 3, 4, 5].map(i => [
          new THREE.BoxGeometry(0.5, 0.08, 3.2)
            .translate(0, 0, 1.5)
            .rotateX(0.45)
            .rotateY((i / 6) * Math.PI * 2)
            .translate(0, 7, 0),
          flat(i % 2 ? 0x2f8a4a : 0x3fa05a),
        ]),
      ],
      broad: [
        [new THREE.CylinderGeometry(0.3, 0.4, 3.5, 6).translate(0, 1.75, 0), flat(0x4a3626)],
        [new THREE.IcosahedronGeometry(2.6, 0).translate(0, 5, 0), flat(0x2a7f3f)],
        [new THREE.IcosahedronGeometry(1.8, 0).translate(1.6, 4.2, 0.5), flat(0x1f6b34)],
        [new THREE.IcosahedronGeometry(1.7, 0).translate(-1.5, 4.4, -0.4), flat(0x175a2b)],
      ],
      cactus: [
        [new THREE.CylinderGeometry(0.4, 0.45, 5, 8).translate(0, 2.5, 0), flat(0x3f7a45)],
        [new THREE.CylinderGeometry(0.28, 0.28, 1.8, 8).translate(-1.1, 3.2, 0), flat(0x3f7a45)],
        [new THREE.CylinderGeometry(0.28, 0.28, 1.4, 8).translate(1.1, 3.6, 0), flat(0x3f7a45)],
        [new THREE.BoxGeometry(1.2, 0.5, 0.5).translate(-0.6, 2.4, 0), flat(0x3f7a45)],
        [new THREE.BoxGeometry(1.2, 0.5, 0.5).translate(0.6, 3.0, 0), flat(0x3f7a45)],
      ],
      sakura: [
        [new THREE.CylinderGeometry(0.25, 0.35, 2.6, 6).translate(0, 1.3, 0), flat(0x4a3340)],
        [new THREE.IcosahedronGeometry(2.4, 1).translate(0, 4.2, 0), flat(0xf7b6cf)],
        [new THREE.IcosahedronGeometry(1.7, 1).translate(1.7, 3.6, 0.3), flat(0xf29bbd)],
        [new THREE.IcosahedronGeometry(1.6, 1).translate(-1.6, 3.8, -0.3), flat(0xfbd0e0)],
      ],
      lamp: [
        [new THREE.CylinderGeometry(0.1, 0.14, 8, 6).translate(0, 4, 0), M.black],
        [new THREE.BoxGeometry(0.12, 0.12, 2).translate(0, 8, 1), M.black],
        [
          new THREE.SphereGeometry(0.3, 10, 6).translate(0, 7.8, 2),
          new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xffc46e, emissiveIntensity: 4 }),
        ],
      ],
      pole: [
        [new THREE.CylinderGeometry(0.14, 0.18, 8, 6).translate(0, 4, 0), flat(0x4a3a32)],
        [new THREE.BoxGeometry(2.8, 0.14, 0.14).translate(0, 7.4, 0), flat(0x4a3a32)],
        [new THREE.BoxGeometry(2.0, 0.12, 0.12).translate(0, 6.5, 0), flat(0x4a3a32)],
      ],
    };
    const m4 = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      up = new THREE.Vector3(0, 1, 0);
    for (const s of segs)
      for (const o of s.sp) {
        const p = P[s.i],
          lat = o.o * W * (o.t === 'P' ? 1.6 : 1),
          kind = o.t === 'P' ? TH.trees[o.k] : TH.lamp === 2 ? 'pole' : 'lamp',
          sc = o.t === 'P' ? 0.8 + o.z * 0.6 : 1;
        q.setFromAxisAngle(
          up,
          o.t === 'P' ? s.i * 1.7 : -Math.atan2(p.fz, p.fx) + (o.o < 0 ? Math.PI : 0) + Math.PI / 2,
        );
        m4.compose(
          new THREE.Vector3(p.x - p.fz * lat, p.y - 0.05, p.z + p.fx * lat),
          q,
          new THREE.Vector3(sc, sc, sc),
        );
        put(kind, T[kind], m4.clone());
      }
    for (const k in parts) {
      const { list, m } = parts[k];
      for (const [geo, mat] of list) {
        const im = new THREE.InstancedMesh(geo, mat, m.length);
        m.forEach((mm, i) => im.setMatrixAt(i, mm));
        im.castShadow = k !== 'lamp';
        world.add(im);
      }
    }

    /* far scenery: two rings of mountains (pre-tinted by the haze), plus landmarks */
    const fogC = new THREE.Color(TH.fog);
    const far = (col, k) =>
      new THREE.MeshBasicMaterial({ color: new THREE.Color(col).lerp(fogC, k), fog: false });
    const R0 = rad + 700;
    [
      [TH.mtn[0], 0.35, R0 + 500, 1.4, 34],
      [TH.mtn[1], 0.15, R0, 1, 44],
    ].forEach(([col, k, R, hs, n]) => {
      const mat = far(col, k);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.1,
          hgt = (60 + Math.random() * 140) * hs,
          wd = hgt * (1.4 + Math.random());
        let geo;
        if (TH.shape === 'dome')
          geo = new THREE.SphereGeometry(wd * 0.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(
            1,
            hgt / (wd * 0.6),
            1,
          );
        else if (TH.shape === 'mesa')
          geo = new THREE.CylinderGeometry(wd * 0.4, wd * 0.55, hgt * 0.6, 7).translate(0, hgt * 0.3, 0);
        else geo = new THREE.ConeGeometry(wd * 0.6, hgt, 5).translate(0, hgt / 2, 0);
        const m = new THREE.Mesh(geo, mat);
        m.position.set(cx + Math.cos(a) * R, minY - 2, cz + Math.sin(a) * R);
        m.rotation.y = Math.random() * 3;
        world.add(m);
      }
    });
    const sunAng = 0.6;
    const ax = Math.cos(sunAng),
      az = Math.sin(sunAng),
      LR = R0 - 150;
    const at2 = (dx, dz) => [cx + ax * LR + dx, minY - 1, cz + az * LR + dz];
    if (TH.big) {
      const f = new THREE.Mesh(
        new THREE.ConeGeometry(520, 420, 24, 1, true).translate(0, 210, 0),
        far(TH.big, 0.25),
      );
      const cap = new THREE.Mesh(
        new THREE.ConeGeometry(160, 130, 24).translate(0, 355, 0),
        far('#fdf3f0', 0.15),
      );
      f.position.set(...at2(-200, 300));
      cap.position.copy(f.position);
      world.add(f, cap);
    }
    if (TH.lm === 'taj') {
      const g = new THREE.Group(),
        wm = far('#f4e6d6', 0.1);
      g.add(box(90, 4, 90, wm, 0, 2, 0), box(46, 34, 46, wm, 0, 21, 0));
      const d = new THREE.Mesh(new THREE.SphereGeometry(17, 20, 12), wm);
      d.scale.y = 1.3;
      d.position.y = 50;
      g.add(d);
      for (const [x, z] of [
        [-38, -38],
        [38, -38],
        [-38, 38],
        [38, 38],
      ]) {
        const mn = cyl(2, 2.6, 52, wm, 10);
        mn.position.set(x, 26, z);
        g.add(mn);
      }
      g.position.set(...at2(0, 0));
      world.add(g);
    }
    if (TH.lm === 'bom') {
      const g = new THREE.Group();
      for (let i = 0; i < 60; i++) {
        const hgt = 40 + Math.random() * 140,
          b = box(
            20 + Math.random() * 18,
            hgt,
            20 + Math.random() * 18,
            far(Math.random() > 0.5 ? '#8a6a78' : '#76596a', 0.2),
            (i - 30) * 26 + Math.random() * 10,
            hgt / 2,
            Math.random() * 120,
          );
        g.add(b);
      }
      const gm = far('#e6cfae', 0.1);
      g.add(box(60, 34, 14, gm, 40, 17, -120));
      for (const sx of [-1, 1])
        g.add(
          cyl(5, 5, 46, gm, 8)
            .translateX(40 + sx * 26)
            .translateY(23)
            .translateZ(-120),
        );
      g.position.set(...at2(0, 0));
      g.lookAt(cx, minY, cz);
      world.add(g);
    }

    /* sky, fog and light for this map */
    const S = TH.sky;
    skyMat.uniforms.c0.value.set(S[0]);
    skyMat.uniforms.c1.value.set(S[1]);
    skyMat.uniforms.c2.value.set(S[2]);
    skyMat.uniforms.c3.value.set(S[3]);
    const night = !!TH.stars;
    const elev = 0.06 + TH.sy * 1.6;
    sunDir
      .set(Math.cos(sunAng) * Math.cos(elev), Math.sin(elev), Math.sin(sunAng) * Math.cos(elev))
      .normalize();
    skyMat.uniforms.sunDir.value.copy(sunDir);
    skyMat.uniforms.sunCol.value.set(TH.sun[1]);
    sun.material.color.set(TH.sun[0]).multiplyScalar(night ? 1.2 : 3);
    sun.scale.setScalar(TH.sr * (night ? 0.7 : 1));
    scene.fog = new THREE.Fog(TH.fog, 70, night ? 520 : 650);
    scene.background = new THREE.Color(TH.fog);
    sunLight.color.set(night ? 0x8fa0ff : TH.sun[1]);
    sunLight.intensity = night ? 0.5 : 2.4;
    hemi.color.set(S[1]);
    hemi.groundColor.set(TH.grass[0]);
    hemi.intensity = night ? 0.55 : 0.95;
    stars.visible = night;
    bloom.strength = night ? 0.75 : 0.4;
    renderer.toneMappingExposure = night ? 1.25 : 1.05;
    builtVer = G.trackVer;
  }
  const sunDir = new THREE.Vector3();

  /* a point on the track: d along it (game units), o across it (road half-widths) */
  const out = { x: 0, y: 0, z: 0, fx: 1, fz: 0 };
  function at(d, o) {
    const N = G.N,
      TL = G.TL,
      SL = G.SL;
    d = ((d % TL) + TL) % TL;
    const f = d / SL,
      i = Math.floor(f) % N,
      t = f - Math.floor(f),
      a = P[i],
      b = P[(i + 1) % N];
    let fx = a.fx + (b.fx - a.fx) * t,
      fz = a.fz + (b.fz - a.fz) * t;
    const l = Math.hypot(fx, fz) || 1;
    fx /= l;
    fz /= l;
    const W = G.RW * LS;
    out.x = a.x + (b.x - a.x) * t - fz * o * W;
    out.z = a.z + (b.z - a.z) * t + fx * o * W;
    out.y = a.y + (b.y - a.y) * t;
    out.fx = fx;
    out.fz = fz;
    return out;
  }

  /* ---------- cars in the scene, matched to the game's car objects ---------- */
  const meshes = new Map();
  let player = null,
    playerKey = '';
  const seen = new Set();
  function place(obj, d, o, yaw, roll = 0) {
    const p = at(d, o);
    obj.position.set(p.x, p.y, p.z);
    obj.rotation.set(0, -Math.atan2(p.fz, p.fx) - Math.PI / 2 + yaw, roll, 'YXZ');
  }
  function spin(obj, v) {
    obj.traverse(c => {
      if (c.userData.spin) c.rotation.x -= v;
    });
  }

  /* ---------- per-frame ---------- */
  const look = new THREE.Vector3();
  let lastT = performance.now();
  function frame() {
    if (builtVer !== G.trackVer || !world) buildWorld();
    const now = performance.now(),
      dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    const pos = G.pos,
      px = G.px,
      sf = G.speed;

    // player car
    const pl = G.player,
      key = pl.body + pl.col;
    if (key !== playerKey) {
      if (player) {
        scene.remove(player);
        disposeTree(player);
      }
      player = makeCar(pl.body, pl.col);
      scene.add(player);
      playerKey = key;
    }
    place(player, pos + G.PZ, px, -G.steer * 0.07 * sf - G.drift * 0.35, G.steer * 0.025 * sf);
    spin(player, sf * dt * 60);

    // rivals, traffic and hazards
    seen.clear();
    for (const c of G.cars) {
      seen.add(c);
      let m = meshes.get(c);
      if (!m) {
        m = c.hz ? makeHazard(c.hz, c.col) : makeCar(c.body, c.col);
        if (c.rv) m.add(label(c.name));
        scene.add(m);
        meshes.set(c, m);
      }
      let dz = c.z - (pos + G.PZ);
      if (dz > G.TL / 2) dz -= G.TL;
      if (dz < -G.TL / 2) dz += G.TL;
      m.visible = dz > -40 / FS && dz < 700 / FS;
      if (!m.visible) continue;
      place(m, c.z, c.o, c.hz === 'cow' ? Math.cos(c.ph) * 1.3 : 0);
      if (!c.hz || c.hz === 'cyc' || c.hz === 'rick') spin(m, (c.sp / 12000) * dt * 60);
    }
    for (const [c, m] of meshes)
      if (!seen.has(c)) {
        scene.remove(m);
        disposeTree(m);
        meshes.delete(c);
      }

    // chase camera: behind and above the car, looking down the road
    const cam = at(pos - 420, px * 0.92);
    const camY = cam.y + 4.2 + sf * 0.5;
    camera.position.set(cam.x, camY, cam.z);
    const ahead = at(pos + G.PZ + 3000, px * 0.6);
    look.set(ahead.x, ahead.y + 0.8, ahead.z);
    camera.lookAt(look);
    const sh = G.reduce ? 0 : G.shake * 0.012;
    if (sh) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, 0));
    const fov = 60 + sf * 8 + G.boost * 10;
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
      camera.updateProjectionMatrix();
    }

    // sky dome, sun and shadows follow the camera
    sky.position.copy(camera.position);
    stars.position.copy(camera.position);
    sun.position.copy(camera.position).addScaledVector(sunDir, 1500);
    sunLight.position.copy(player.position).addScaledVector(sunDir, 150);
    sunLight.target.position.copy(player.position);
    composer.render();
  }

  window.view3d = { ready: true, frame };
  document.body.classList.add('gl');
}
