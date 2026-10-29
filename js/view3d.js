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
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const G = window.__game;
const clamp3 = (v, a, b) => Math.max(a, Math.min(b, v));
/* game units -> metres: along the road, across it, and up (the 2D game exaggerates hills) */
/* FS is set so the motion on screen matches the speedometer (260 km/h at full speed) */
const FS = window.SPEED.base / 3.6 / 12000,
  LS = 0.005,
  YS = 0.0016,
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

  /* post-processing renders into multisampled targets, otherwise the glow pass turns off anti-aliasing */
  const msaa = () =>
    new THREE.WebGLRenderTarget(innerWidth, innerHeight, { samples: 4, type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, msaa());
  composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.4, 0.45, 0.98);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  /* final colour grade, like a console racer: a touch more contrast and colour, cool shadows, warm highlights */
  const GRADE = {
    uniforms: { tDiffuse: { value: null }, contrast: { value: 1.07 }, saturation: { value: 1.12 } },
    vertexShader:
      'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform sampler2D tDiffuse;uniform float contrast,saturation;varying vec2 vUv;
      void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;c=(c-.5)*contrast+.5;
        float l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,saturation);
        c+=vec3(.018,.006,-.012)*smoothstep(.5,1.,l)+vec3(-.01,0.,.018)*(1.-smoothstep(0.,.45,l));
        gl_FragColor=vec4(clamp(c,0.,1.),1.);}`,
  };
  const grade = new ShaderPass(GRADE);
  composer.addPass(grade);

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
    disc: new THREE.MeshStandardMaterial({ color: 0x6b6b74, metalness: 0.85, roughness: 0.35 }),
    sidewall: new THREE.MeshStandardMaterial({ color: 0x2a2830, roughness: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x0b0a14,
      metalness: 0,
      roughness: 0.32,
      clearcoat: 0.3,
      clearcoatRoughness: 0.3,
      envMapIntensity: 0.5,
      specularIntensity: 0.4,
    }),
    tail: new THREE.MeshStandardMaterial({ color: 0xff2030, emissive: 0xff1020, emissiveIntensity: 1.4 }),
    head: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 0.55 }),
    black: new THREE.MeshStandardMaterial({ color: 0x0e0d14, roughness: 0.6 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0x9a9aa8, metalness: 1, roughness: 0.2 }),
    plate: new THREE.MeshStandardMaterial({ color: 0xe8e2cf, roughness: 0.5 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.9 }),
    hay: new THREE.MeshStandardMaterial({ color: 0xd9b45a, roughness: 1 }),
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
  /* race cars reflect the real surroundings: a small cube camera at the player's car, refreshed every few
     frames, is the reflection map for their paint (showroom cars use the studio lighting instead) */
  const cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
  const cubeCam = new THREE.CubeCamera(1, 2500, cubeRT);
  let cubeTick = 0;
  const paintCache = new Map();
  const paint = (col, live = false) => {
    const key = col + (live ? '+' : '');
    if (!paintCache.has(key))
      paintCache.set(
        key,
        new THREE.MeshPhysicalMaterial({
          color: col,
          metalness: 0.25,
          roughness: 0.36,
          clearcoat: 0.8,
          clearcoatRoughness: 0.18,
          envMap: live ? cubeRT.texture : null,
          envMapIntensity: live ? 1.1 : 1,
          // fine metallic flake: tiny random bumps under the clear coat catch the light
          normalMap: TEX.flake,
          normalScale: new THREE.Vector2(0.06, 0.06),
        }),
      );
    return paintCache.get(key);
  };
  /* soft dark patch under each car: grounds it on the road like ambient occlusion */
  const SHADOW = new THREE.MeshBasicMaterial({
    map: (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d'),
        gr = x.createRadialGradient(32, 32, 4, 32, 32, 32);
      gr.addColorStop(0, 'rgba(0,0,0,.75)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gr;
      x.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })(),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  });
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
    const h = cyl(r * 0.66, r * 0.66, wdt * 1.02, M.black, 20);
    h.rotation.z = Math.PI / 2;
    g.add(t, h);
    // five-spoke rim on the outer face
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(wdt * 1.06, r * 1.25, r * 0.12), M.rim);
      sp.rotation.x = (i / 5) * Math.PI * 2;
      g.add(sp);
    }
    const hub = cyl(r * 0.16, r * 0.16, wdt * 1.1, M.rim, 10);
    hub.rotation.z = Math.PI / 2;
    g.add(hub);
    // brake disc behind the spokes and a raised sidewall ring on both tyre faces
    const disc = cyl(r * 0.58, r * 0.58, wdt * 0.5, M.disc, 24);
    disc.rotation.z = Math.PI / 2;
    g.add(disc);
    for (const sx of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.TorusGeometry(r * 0.83, r * 0.06, 6, 28), M.sidewall);
      wall.rotation.y = Math.PI / 2;
      wall.position.x = (sx * wdt) / 2;
      g.add(wall);
    }
    g.position.set(x, r, z);
    g.userData.spin = true;
    return g;
  };

  /* ---------- car models (metres; +z is the back of the car, facing the camera) ----------
     Each body is a smooth side profile (spline through the nose, hood, windscreen, roof, rear window and
     tail) extruded across the car with rounded edges, then narrowed above the waist like a real cabin.
     L length, W width, r ride height; heights above r: hood, roof, deck; u positions along the car (front
     is -L/2): ws windscreen base, rf/rr roof front/rear, rw rear window base. */
  /* body outlines and details come from js/cars.js (shape + style per car) */
  const SPEC = Object.fromEntries(window.CAR_LIST.map(c => [c.id, { ...c.shape, ...c.style }]));
  /* extrude a side profile (u along the car, v up) across width w, centred, rounded, with the cabin narrowed */
  function sculpt(pts, w, bevel, waist, roofV, opt = {}) {
    const tumble = opt.tumble ?? 0.2,
      flare = opt.flare || 0,
      fz = opt.flareZ || 0;
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
      const y = p.getY(i),
        z = p.getZ(i);
      if (y > waist) p.setX(i, p.getX(i) * (1 - tumble * Math.min(1, (y - waist) / (roofV - waist))));
      // wide hips over the rear wheels
      else if (flare) p.setX(i, p.getX(i) * (1 + flare * Math.exp(-(((z - fz) / 0.75) ** 2))));
    }
    g.computeVertexNormals();
    return g;
  }
  function makeCar(body, col, live = true, own = false) {
    const s = SPEC[body] || SPEC.coupe,
      g = new THREE.Group(),
      pm = own ? paint(col, live).clone() : paint(col, live), // own: the player's paint can scuff
      tail = M.tail.clone(), // own copy so its brake lights can brighten
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
    const so = { tumble: s.tumble, flare: s.flare, flareZ: L / 2 - 0.85 };
    const shell = mesh(sculpt(top, W, B, waist, r + s.roof, so), pm);
    g.add(shell);
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
      g.add(mesh(sculpt(gl, W + 0.02, B, waist, r + s.roof, so), M.glass));
      const mid = (s.rf + s.rr) / 2,
        roof = [
          [s.rf + 0.12, r + s.roof + 0.02],
          [s.rf + 0.16, r + s.roof + 0.06],
          [mid, r + s.roof + 0.085],
          [s.rr - 0.16, r + s.roof + 0.06],
          [s.rr - 0.12, r + s.roof + 0.02],
        ];
      g.add(
        mesh(
          sculpt(roof, W - 0.12 - (s.tumble ? 0.25 : 0), 0.05, waist, r + s.roof, so),
          s.two ? M.black : pm,
        ),
      );
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
    const acc =
      s.acc &&
      new THREE.MeshStandardMaterial({
        color: s.acc,
        emissive: s.acc,
        emissiveIntensity: s.acc === '#f2c418' ? 0.25 : 1.6,
      });
    if (s.sup) {
      // front splitter and carbon side skirts
      g.add(box(W * 0.92, 0.04, 0.34, M.black, 0, r + 0.02, f - B + 0.1));
      for (const sx of [-1, 1]) g.add(box(0.05, 0.12, L * 0.45, M.black, sx * (W / 2 + 0.02), r + 0.05, 0));
      if (s.two) {
        // two-tone: glowing C-curve along each side
        for (const sx of [-1, 1]) {
          const c = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.022, 6, 24, Math.PI * 1.15), acc);
          c.rotation.set(0, Math.PI / 2, Math.PI * 0.42);
          c.position.set(sx * (W / 2 + 0.03), r + 0.42, -0.25);
          g.add(c);
        }
      }
      if (s.fin) {
        // shark fin along the spine and glowing lower accents
        g.add(taper(0.04, 0.02, 0.26, 2.2, 1.6, M.black, 0, r + s.deck + 0.1, 1.0, 0.25));
        for (const sx of [-1, 1]) g.add(box(0.02, 0.025, L * 0.5, acc, sx * (W / 2 + 0.05), r + 0.12, -0.2));
      }
      if (s.rearFins) {
        // open rear grille with yellow fins
        g.add(box(W * 0.78, s.deck * 0.36, 0.04, M.black, 0, r + s.deck * 0.3, b + B));
        for (let i = -3; i <= 3; i++)
          g.add(box(0.035, s.deck * 0.34, 0.08, acc, i * 0.22, r + s.deck * 0.3, b + B + 0.02));
      }
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
    if (s.lights === 'bar') g.add(box(W * 0.8, 0.045, 0.03, tail, 0, ly + 0.06, rz));
    else if (s.lights === 'quad')
      for (const x of [-0.72, -0.48, 0.48, 0.72]) {
        const l = cyl(0.085, 0.085, 0.04, tail, 16);
        l.rotation.x = Math.PI / 2;
        l.position.set(x, ly, rz);
        g.add(l);
      }
    else if (s.lights === 'thin') g.add(box(W * 0.9, 0.035, 0.03, tail, 0, ly + 0.08, rz));
    else if (s.lights === 'x')
      // X-shaped lights, front and back
      for (const sx of [-1, 1])
        for (const [z, mat] of [
          [rz, tail],
          [f - B - 0.01, M.head],
        ])
          for (const a of [0.6, -0.6]) {
            const xb = box(0.36, 0.035, 0.03, mat, sx * 0.62, z === rz ? ly : r + s.hood * 0.55, z);
            xb.rotation.z = a;
            g.add(xb);
          }
    else if (s.lights === 'ring')
      // round ring tail lights, two each side
      for (const x of [-0.72, -0.45, 0.45, 0.72]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.022, 8, 20), tail);
        ring.position.set(x, ly, rz);
        g.add(ring);
      }
    else if (s.lights === 'y')
      for (const sx of [-1, 1]) {
        g.add(box(0.5, 0.04, 0.03, tail, sx * 0.6, ly, rz));
        g.add(box(0.04, 0.18, 0.03, tail, sx * 0.6, ly - 0.09, rz));
      }
    else for (const sx of [-1, 1]) g.add(rbox(0.4, 0.13, 0.04, tail, sx * (W / 2 - 0.32), ly, rz, 0.03));
    if (s.lights !== 'x')
      for (const sx of [-1, 1])
        if (s.horseshoe)
          // slim quad-LED headlights either side of the grille
          for (let i = 0; i < 4; i++)
            g.add(
              box(0.08, 0.05, 0.03, M.head, sx * (W / 2 - 0.5 + i * 0.1), r + s.hood * 0.62, f - B - 0.01),
            );
        else g.add(rbox(0.36, 0.1, 0.04, M.head, sx * (W / 2 - 0.32), r + s.hood * 0.6, f - B - 0.01, 0.03));
    if (s.horseshoe) {
      // horseshoe grille: a chrome arch around a dark mesh, open at the bottom
      const gy = r + s.hood * 0.38,
        gz = f - B - 0.015;
      g.add(blob(0.24, 1, 1.15, 0.12, M.black, 0, gy, gz + 0.01));
      const hs = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.035, 8, 28, Math.PI * 1.4), M.chrome);
      hs.rotation.z = -Math.PI * 0.2;
      hs.scale.y = 1.15;
      hs.position.set(0, gy, gz);
      g.add(hs);
    }
    if (s.stripes) {
      // racing stripes over the nose and hood, following its curve
      const sm = paint(s.stripes),
        sp = [
          [f + 0.15, r + 0.2],
          [f + 0.2, r + s.hood * 0.62 + B + 0.01],
          [f + 0.6, r + s.hood + B + 0.012],
          [s.ws, r + s.hood + 0.05 + B + 0.012],
          [s.ws, r + 0.2],
        ];
      for (const sx of [-1, 1]) {
        const st = mesh(sculpt(sp, 0.16, 0.02, waist, r + s.roof), sm);
        st.position.x = sx * 0.34;
        g.add(st);
      }
    }
    if (s.spine) g.add(taper(0.06, 0.03, 0.18, 1.4, 1.0, M.black, 0, r + s.roof + 0.1, s.rf + 0.7, 0.2));
    g.add(box(0.5, 0.13, 0.02, M.plate, 0, r + s.deck * 0.38, rz + 0.01));
    const ex = s.sup
      ? s.exhaust === 'quad'
        ? [-0.42, -0.3, 0.3, 0.42]
        : s.exhaust === 'twin'
          ? [-0.13, 0.13]
          : [0]
      : [0.55];
    for (const x of ex) {
      const big = s.sup && ex.length < 3,
        er = ex.length === 2 ? 0.08 : big ? 0.12 : 0.05,
        e = cyl(er, er, 0.2, M.chrome, 16);
      e.rotation.x = Math.PI / 2;
      // twin exhausts sit high in the tail (McLaren style)
      e.position.set(x, s.exhaust === 'twin' ? r + s.deck * 0.55 : r + 0.14, rz);
      g.add(e);
    }
    // wheels, slightly proud of the body
    const wr = s.sup ? 0.36 : 0.34,
      wx = W / 2 - 0.02,
      wz = L / 2 - 0.85;
    const cm = s.cal ? flat(s.cal) : s.sup ? flat('#c0262d') : null;
    for (const [x, z] of [
      [-wx, -wz],
      [wx, -wz],
      [-wx, wz],
      [wx, wz],
    ]) {
      g.add(wheel(wr, s.sup ? 0.3 : 0.25, x, z));
      // brake calipers behind the spokes
      if (cm) g.add(box(0.06, wr * 0.55, wr * 0.5, cm, x - Math.sign(x) * 0.02, wr + wr * 0.2, z + 0.08));
    }
    // side mirrors
    for (const sx of [-1, 1]) {
      g.add(box(0.1, 0.03, 0.05, M.black, sx * (W / 2 - 0.02), waist + 0.08, s.ws + 0.28));
      g.add(rbox(0.16, 0.1, 0.2, pm, sx * (W / 2 + 0.07), waist + 0.12, s.ws + 0.28, 0.04));
    }
    // dark wheel arches over each wheel
    for (const [x, z] of [
      [-wx, -wz],
      [wx, -wz],
      [-wx, wz],
      [wx, wz],
    ]) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(wr + 0.05, 0.05, 6, 18, Math.PI), M.black);
      arch.rotation.y = Math.PI / 2;
      arch.position.set(x + Math.sign(x) * 0.03, wr, z);
      g.add(arch);
    }
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.3, L * 1.1), SHADOW);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    g.add(shadow);
    g.userData.tail = tail;
    Object.assign(g.userData, {
      shell,
      paint: pm,
      base: pm.color.clone(),
      rough: pm.roughness,
      size: [L, W, r, s.hood],
    });
    g.scale.setScalar(CAR);
    return g;
  }
  /* an Indian zebu cow (metres, head toward -z): rounded body, shoulder hump, dewlap, long face, curved horns,
     ears, tufted tail, jointed legs with hooves. userData.legs / head drive the walk in frame() */
  const COW = {
    hide: new THREE.MeshStandardMaterial({ color: '#ece3d3', roughness: 0.85 }),
    shade: new THREE.MeshStandardMaterial({ color: '#cfc4b2', roughness: 0.9 }),
    muzzle: new THREE.MeshStandardMaterial({ color: '#3b302c', roughness: 0.6 }),
    hoof: new THREE.MeshStandardMaterial({ color: '#2a2420', roughness: 0.7 }),
    horn: new THREE.MeshStandardMaterial({ color: '#d8c49a', roughness: 0.5 }),
    eye: new THREE.MeshStandardMaterial({ color: '#141010', roughness: 0.2 }),
  };
  const blob = (r, sx, sy, sz, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  };
  const tube = (pts, r, mat) => {
    const m = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), 12, r, 8),
      mat,
    );
    m.castShadow = true;
    return m;
  };
  /* smooth capsule between two points (body parts that blend instead of looking like stacked balls) */
  function limb(a, b, r, mat, sx = 1) {
    const A = new THREE.Vector3(...a),
      B = new THREE.Vector3(...b),
      len = A.distanceTo(B),
      m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, len), 6, 14), mat);
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    m.scale.x = sx;
    m.castShadow = true;
    return m;
  }
  function makeCow(hornCol) {
    const g = new THREE.Group(),
      H = COW.hide,
      S = COW.shade;
    // one smooth barrel of a body, slightly deeper at the chest
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.0, 8, 20), H);
    body.rotation.x = Math.PI / 2;
    body.scale.set(0.95, 1, 1.08);
    body.position.set(0, 1.08, 0.08);
    body.castShadow = true;
    g.add(body);
    g.add(blob(0.36, 0.95, 1.05, 1.1, S, 0, 1.06, -0.38)); // greyer chest and front quarters
    g.add(blob(0.22, 0.8, 0.85, 1.3, S, 0, 1.4, -0.32)); // the zebu hump, blended into the shoulders
    // neck sloping down to the head, with a soft dewlap underneath
    g.add(limb([0, 1.28, -0.55], [0, 1.2, -0.95], 0.2, S, 0.9));
    g.add(blob(0.2, 0.32, 1.25, 1.2, S, 0, 0.92, -0.72));
    // head: long face angled down, dark muzzle, eyes, drooping ears, curved horns
    const head = new THREE.Group();
    head.add(limb([0, 0.05, 0.05], [0, -0.06, -0.38], 0.14, H, 0.95));
    head.add(blob(0.12, 1.05, 0.9, 1, COW.muzzle, 0, -0.08, -0.48));
    for (const sx of [-1, 1]) {
      head.add(blob(0.028, 1, 1, 1, COW.eye, sx * 0.125, 0.05, -0.12));
      const ear = blob(0.12, 0.28, 0.55, 1.1, S, sx * 0.2, -0.02, 0.06);
      ear.rotation.set(0.3, sx * 0.5, sx * 0.6);
      head.add(ear);
      head.add(
        tube(
          [
            [sx * 0.08, 0.12, 0.08],
            [sx * 0.2, 0.2, 0.1],
            [sx * 0.23, 0.36, 0.04],
            [sx * 0.16, 0.46, -0.04],
          ],
          0.026,
          hornCol,
        ),
      );
    }
    head.position.set(0, 1.24, -1.08);
    head.rotation.x = 0.25;
    g.add(head);
    // legs: sturdy upper leg, slimmer shin, hoof; pivot at the hip so they can swing
    const legs = [];
    for (const [lx, lz, front] of [
      [-0.2, -0.42, 1],
      [0.2, -0.42, 1],
      [-0.2, 0.6, 0],
      [0.2, 0.6, 0],
    ]) {
      const leg = new THREE.Group();
      leg.add(limb([0, 0, 0], [0, -0.36, front ? 0 : 0.04], front ? 0.1 : 0.12, front ? S : H));
      leg.add(limb([0, -0.36, front ? 0 : 0.04], [0, -0.74, 0], 0.055, front ? S : H));
      const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.1, 10), COW.hoof);
      hoof.position.y = -0.82;
      leg.add(hoof);
      leg.position.set(lx, 0.88, lz);
      g.add(leg);
      legs.push(leg);
    }
    // tail with a dark tuft
    g.add(
      tube(
        [
          [0, 1.3, 0.95],
          [0, 1.1, 1.05],
          [0.02, 0.75, 1.08],
          [0, 0.45, 1.06],
        ],
        0.024,
        H,
      ),
    );
    g.add(blob(0.07, 0.8, 1.7, 0.8, COW.muzzle, 0, 0.38, 1.06));
    g.userData = { legs, head };
    return g;
  }
  /* walk: legs swing in diagonal pairs and the head nods */
  function walk(m, t) {
    const u = m.userData;
    if (!u || !u.legs) return;
    u.legs.forEach((l, i) => (l.rotation.x = Math.sin(t + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.35));
    u.head.rotation.x = 0.25 + Math.sin(t * 2) * 0.06;
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
        const b = makeCow(COW.horn);
        b.scale.setScalar(0.85);
        (g.userData.cows = g.userData.cows || []).push(b);
        b.position.set(sx * 0.5, 0, -2.3);
        g.add(b);
      }
      g.add(box(0.1, 0.1, 2.2, M.wood, 0, 0.9, -1.4));
      g.scale.setScalar(CAR * 0.9);
    } else if (k === 'cow') {
      const c = makeCow(Math.random() < 0.4 ? flat('#ff9933') : COW.horn);
      g.add(c);
      g.userData = c.userData;
      g.scale.setScalar(CAR * 0.95);
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

  /* ---------- surface textures, drawn once in code (no image downloads) ---------- */
  function canvasTex(draw, size = 256) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  const TEX = {
    // asphalt: fine grain, darker tar patches and a few hairline cracks (kept light: it tints the road colour)
    asphalt: canvasTex((x, n) => {
      x.fillStyle = '#d8d8d8';
      x.fillRect(0, 0, n, n);
      for (let i = 0; i < 9000; i++) {
        const v = 150 + Math.random() * 105;
        x.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
        x.fillRect(Math.random() * n, Math.random() * n, 1 + Math.random(), 1 + Math.random());
      }
      for (let i = 0; i < 14; i++) {
        x.fillStyle = 'rgba(90,90,90,.12)';
        x.beginPath();
        x.ellipse(
          Math.random() * n,
          Math.random() * n,
          10 + Math.random() * 30,
          6 + Math.random() * 18,
          Math.random() * 3,
          0,
          7,
        );
        x.fill();
      }
      x.strokeStyle = 'rgba(70,70,70,.35)';
      for (let i = 0; i < 3; i++) {
        x.beginPath();
        let px = Math.random() * n,
          py = Math.random() * n;
        x.moveTo(px, py);
        for (let k = 0; k < 6; k++) x.lineTo((px += (Math.random() - 0.5) * 30), (py += Math.random() * 20));
        x.stroke();
      }
    }),
    // asphalt roughness: patches that are smoother (polished by tyres) or rougher, so light catches unevenly
    rough: canvasTex((x, n) => {
      x.fillStyle = '#d0d0d0';
      x.fillRect(0, 0, n, n);
      for (let i = 0; i < 40; i++) {
        const v = 170 + Math.random() * 85;
        x.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',.12)';
        x.beginPath();
        x.ellipse(
          Math.random() * n,
          Math.random() * n,
          6 + Math.random() * 18,
          4 + Math.random() * 12,
          Math.random() * 3,
          0,
          7,
        );
        x.fill();
      }
      for (let i = 0; i < 6000; i++) {
        const v = 140 + Math.random() * 115;
        x.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
        x.fillRect(Math.random() * n, Math.random() * n, 1, 1);
      }
    }),
    // paint flake normal map: random tiny tilts around "straight out" (128,128,255)
    flake: canvasTex((x, n) => {
      const img = x.createImageData(n, n);
      for (let i = 0; i < n * n; i++) {
        img.data[i * 4] = 128 + (Math.random() - 0.5) * 90;
        img.data[i * 4 + 1] = 128 + (Math.random() - 0.5) * 90;
        img.data[i * 4 + 2] = 255;
        img.data[i * 4 + 3] = 255;
      }
      x.putImageData(img, 0, 0);
    }, 128),
    // grass: mottled tones with short blade strokes
    grass: canvasTex((x, n) => {
      x.fillStyle = '#e4e4e4';
      x.fillRect(0, 0, n, n);
      for (let i = 0; i < 2200; i++) {
        const v = 170 + Math.random() * 85,
          px = Math.random() * n,
          py = Math.random() * n;
        x.strokeStyle = 'rgb(' + (v - 10) + ',' + v + ',' + (v - 20) + ')';
        x.beginPath();
        x.moveTo(px, py);
        x.lineTo(px + (Math.random() - 0.5) * 3, py - 3 - Math.random() * 5);
        x.stroke();
      }
    }),
  };

  // data textures (bumps, roughness) must not be colour-converted
  TEX.flake.colorSpace = TEX.rough.colorSpace = THREE.NoColorSpace;

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
      h += (segs[i].c - mean) * 0.0036 + (Math.PI * 2) / N;
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
    const groundY = minY - 0.6,
      BANK = 3.6; // banks reach the ground this many road half-widths from the centre
    /* drop = -1 or 1: that edge of the strip slopes down to the ground (embankments) */
    function ribbon(o1, o2, colorOf, yOff = 0, keep = () => true, drop = 0) {
      const pos = [],
        col = [],
        uv = [],
        c = new THREE.Color(),
        seg = SL * FS; // metres per segment
      for (let i = 0; i < N; i++) {
        const s = segs[i];
        if (!keep(s)) continue;
        // texture coordinates in metres / 3, so textures keep their real-world size
        const u1 = (o1 * W) / 3,
          u2 = (o2 * W) / 3,
          v1 = (i * seg) / 3,
          v2 = ((i + 1) * seg) / 3;
        uv.push(u1, v1, u1, v2, u2, v1, u2, v1, u1, v2, u2, v2);
        const a = P[i],
          b = P[(i + 1) % N];
        const pt = (p, o) => [
          p.x - p.fz * o * W,
          (drop && Math.sign(o) === drop && Math.abs(o) >= BANK ? groundY : p.y) + yOff,
          p.z + p.fx * o * W,
        ];
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
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      return g;
    }
    const vmat = (rough, metal = 0, map = null, roughnessMap = null) =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: rough,
        metalness: metal,
        map,
        roughnessMap,
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
      vmat(wet ? 0.35 : 0.95, wet ? 0.3 : 0, TEX.asphalt, TEX.rough),
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
      ribbon(
        -BANK,
        -1.17,
        s => TH.grass[s.k],
        -0.06,
        () => true,
        -1,
      ),
      vmat(1, 0, TEX.grass),
    );
    add(
      ribbon(
        1.17,
        BANK,
        s => TH.grass[s.k],
        -0.06,
        () => true,
        1,
      ),
      vmat(1, 0, TEX.grass),
    );
    const gt = TEX.grass.clone();
    gt.repeat.set(1500, 1500);
    gt.needsUpdate = true;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(9000, 9000),
      new THREE.MeshStandardMaterial({ color: TH.grass[1], map: gt, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, minY - 0.6, cz);
    ground.receiveShadow = true;
    world.add(ground);

    /* metal guardrails on both sides: a continuous beam with posts every few metres */
    const railMat = new THREE.MeshStandardMaterial({
      color: '#b9bec8',
      metalness: 0.85,
      roughness: 0.32,
      side: THREE.DoubleSide,
    });
    for (const o of [-G.FENCE, G.FENCE]) {
      const pos = [];
      for (let i = 0; i < N; i++) {
        const a = P[i],
          b = P[(i + 1) % N],
          ax = a.x - a.fz * o * W,
          az = a.z + a.fx * o * W,
          bx = b.x - b.fz * o * W,
          bz = b.z + b.fx * o * W;
        pos.push(ax, a.y + 0.5, az, bx, b.y + 0.5, bz, ax, a.y + 0.82, az);
        pos.push(ax, a.y + 0.82, az, bx, b.y + 0.5, bz, bx, b.y + 0.82, bz);
      }
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      rg.computeVertexNormals();
      const rail = new THREE.Mesh(rg, railMat);
      rail.castShadow = true;
      world.add(rail);
      const every = Math.max(1, Math.round(3 / (SL * FS))),
        posts = new THREE.InstancedMesh(
          new THREE.BoxGeometry(0.1, 0.85, 0.1).translate(0, 0.42, 0),
          M.black,
          Math.ceil(N / every),
        ),
        pm4 = new THREE.Matrix4();
      for (let i = 0, n = 0; i < N; i += every, n++) {
        const a = P[i];
        pm4.makeTranslation(
          a.x - a.fz * (o + Math.sign(o) * 0.01) * W,
          a.y,
          a.z + a.fx * (o + Math.sign(o) * 0.01) * W,
        );
        posts.setMatrixAt(n, pm4);
      }
      world.add(posts);
    }

    /* grass tufts on the verges: three crossed blade cards per tuft */
    {
      const bladeTex = canvasTex((x, n) => {
        x.clearRect(0, 0, n, n);
        for (let i = 0; i < 26; i++) {
          const bx = n * (0.1 + Math.random() * 0.8),
            h = n * (0.45 + Math.random() * 0.5),
            v = 150 + Math.random() * 100;
          x.strokeStyle = 'rgb(' + (v - 30) + ',' + v + ',' + (v - 60) + ')';
          x.lineWidth = 2 + Math.random() * 2;
          x.beginPath();
          x.moveTo(bx, n);
          x.quadraticCurveTo(
            bx + (Math.random() - 0.5) * 20,
            n - h * 0.6,
            bx + (Math.random() - 0.5) * 30,
            n - h,
          );
          x.stroke();
        }
      }, 128);
      const tm = new THREE.MeshStandardMaterial({
          map: bladeTex,
          color: TH.grass[0],
          alphaTest: 0.4,
          side: THREE.DoubleSide,
          roughness: 1,
        }),
        per = coarse ? 1 : 2,
        count = Math.ceil(N / 2) * per * 2,
        cards = [0, 1, 2].map(
          k =>
            new THREE.InstancedMesh(
              new THREE.PlaneGeometry(0.9, 0.6).translate(0, 0.28, 0).rotateY((k * Math.PI) / 3),
              tm,
              count,
            ),
        ),
        t4 = new THREE.Matrix4(),
        tq = new THREE.Quaternion(),
        ty = new THREE.Vector3(0, 1, 0);
      let n = 0;
      for (let i = 0; i < N; i += 2)
        for (let j = 0; j < per; j++)
          for (const side of [-1, 1]) {
            const p = P[i],
              o = side * (1.25 + Math.random() * 1.6),
              lat = o * W,
              y = p.y - (p.y - groundY) * Math.min(1, Math.max(0, (Math.abs(o) - 1.17) / (BANK - 1.17))),
              sc = 0.7 + Math.random() * 0.8;
            tq.setFromAxisAngle(ty, Math.random() * 3);
            t4.compose(
              new THREE.Vector3(p.x - p.fz * lat, y - 0.05, p.z + p.fx * lat),
              tq,
              new THREE.Vector3(sc, sc, sc),
            );
            for (const cm of cards) cm.setMatrixAt(n, t4);
            n++;
          }
      for (const cm of cards) {
        cm.count = n;
        cm.userData.detail = true; // hidden in Low quality
        world.add(cm);
      }
    }

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
    /* roadside models: [geometry, material] parts per kind. Foliage uses rounder, more detailed clusters */
    const leaf = (r, x, y, z, col, sy = 1) => [
      new THREE.IcosahedronGeometry(r, 1).scale(1, sy, 1).translate(x, y, z),
      flat(col),
    ];
    const T = {
      pine: [
        [new THREE.CylinderGeometry(0.22, 0.36, 3, 7).translate(0, 1.5, 0), flat(0x3a2a2e)],
        ...[
          [2.9, 3.2, 3.4, 0x1d4639],
          [2.4, 3, 5.1, 0x22503f],
          [1.95, 2.8, 6.6, 0x275a47],
          [1.5, 2.5, 8, 0x2c644f],
          [1.0, 2.2, 9.2, 0x316d56],
        ].map(([rr, h, y, c]) => [new THREE.ConeGeometry(rr, h, 9).translate(0, y, 0), flat(c)]),
      ],
      palm: [
        [
          new THREE.CylinderGeometry(0.16, 0.3, 7.4, 7)
            .translate(0, 3.7, 0)
            .applyMatrix4(new THREE.Matrix4().makeShear(0, 0, 0.06, 0, 0, 0)),
          flat(0x6b4a32),
        ],
        ...Array.from({ length: 10 }, (_, i) => [
          new THREE.BoxGeometry(0.55, 0.06, 3.4)
            .translate(0, 0, 1.6)
            .rotateX(0.35 + (i % 2) * 0.25)
            .rotateY((i / 10) * Math.PI * 2)
            .translate(0.44, 7.3, 0),
          flat(i % 2 ? 0x2f8a4a : 0x3fa05a),
        ]),
        [new THREE.SphereGeometry(0.35, 8, 6).translate(0.44, 7.2, 0), flat(0x5a4a2a)],
      ],
      broad: [
        [new THREE.CylinderGeometry(0.28, 0.42, 3.6, 7).translate(0, 1.8, 0), flat(0x4a3626)],
        leaf(2.5, 0, 5.2, 0, 0x2a7f3f, 0.85),
        leaf(1.9, 1.7, 4.4, 0.6, 0x237436),
        leaf(1.8, -1.6, 4.6, -0.5, 0x1d6a30),
        leaf(1.6, 0.4, 6.4, -0.9, 0x31894a),
        leaf(1.5, -0.6, 4.2, 1.5, 0x22703a),
        leaf(1.4, 0.9, 5.6, 1.4, 0x2b7f40),
      ],
      cactus: [
        [new THREE.CylinderGeometry(0.4, 0.45, 5, 10).translate(0, 2.5, 0), flat(0x3f7a45)],
        [new THREE.CapsuleGeometry(0.28, 1.4, 4, 10).translate(-1.1, 3.4, 0), flat(0x3f7a45)],
        [new THREE.CapsuleGeometry(0.28, 1.0, 4, 10).translate(1.1, 3.8, 0), flat(0x3f7a45)],
        [
          new THREE.CapsuleGeometry(0.24, 0.9, 4, 10).rotateZ(Math.PI / 2).translate(-0.6, 2.4, 0),
          flat(0x3f7a45),
        ],
        [
          new THREE.CapsuleGeometry(0.24, 0.9, 4, 10).rotateZ(Math.PI / 2).translate(0.6, 3.0, 0),
          flat(0x3f7a45),
        ],
      ],
      sakura: [
        [new THREE.CylinderGeometry(0.24, 0.36, 2.8, 7).translate(0, 1.4, 0), flat(0x4a3340)],
        leaf(2.3, 0, 4.4, 0, 0xf7b6cf, 0.85),
        leaf(1.7, 1.7, 3.8, 0.4, 0xf29bbd),
        leaf(1.6, -1.6, 4.0, -0.4, 0xfbd0e0),
        leaf(1.4, 0.3, 5.4, -0.8, 0xf6c2d6),
        leaf(1.3, -0.5, 3.6, 1.4, 0xf3a8c6),
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
          new THREE.Vector3(
            p.x - p.fz * lat,
            p.y -
              (p.y - groundY) * Math.min(1, Math.max(0, (Math.abs(lat) / W - 1.17) / (BANK - 1.17))) -
              0.05,
            p.z + p.fx * lat,
          ),
          q,
          new THREE.Vector3(sc, sc, sc),
        );
        put(kind, T[kind], m4.clone());
      }
    for (const k in parts) {
      const { list, m } = parts[k];
      for (const [geo, mat] of list) {
        const im = new THREE.InstancedMesh(geo, mat, m.length),
          tint = new THREE.Color();
        m.forEach((mm, i) => {
          im.setMatrixAt(i, mm);
          // natural variation: every tree slightly lighter or darker
          if (k !== 'lamp' && k !== 'pole') im.setColorAt(i, tint.setScalar(0.78 + Math.random() * 0.38));
        });
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
      // in thick mist the mountains are only faint shapes
      [TH.mtn[0], TH.mist ? 1.3 : 0.35, R0 + 500, 1.4, 34],
      [TH.mtn[1], TH.mist ? 1.2 : 0.15, R0, 1, 44],
    ].forEach(([col, k, R, hs, n]) => {
      // lit by the sun with flat facets (the haze tint is pre-mixed because fog is off for the far scenery)
      const mat = TH.mist
          ? new THREE.MeshBasicMaterial({ color: new THREE.Color(col).lerp(fogC, 0.88), fog: false }) // ghostly shapes in the mist
          : new THREE.MeshLambertMaterial({
              color: new THREE.Color(col).lerp(fogC, k * 0.7),
              fog: false,
              flatShading: true,
            }),
        snow = new THREE.MeshLambertMaterial({
          color: new THREE.Color('#f4f2ff').lerp(fogC, k * 0.5),
          fog: false,
          flatShading: true,
        });
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
        // snow on the taller peaks
        if (TH.shape !== 'dome' && TH.shape !== 'mesa' && hgt > 150 && !TH.stars) {
          const cap = new THREE.Mesh(
            new THREE.ConeGeometry(wd * 0.6 * 0.28, hgt * 0.28, 5).translate(0, hgt * 0.86 + 0.5, 0),
            snow,
          );
          cap.position.copy(m.position);
          cap.rotation.y = m.rotation.y;
          world.add(cap);
        }
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
    const mist = !!TH.mist;
    scene.fog = mist ? new THREE.Fog(TH.fog, 12, 230) : new THREE.Fog(TH.fog, 140, night ? 700 : 1100);
    scene.background = new THREE.Color(TH.fog);
    if (mist) {
      // monsoon murk: the sky fades to fog colour toward the horizon and the sun disappears
      skyMat.uniforms.c2.value.set(TH.fog);
      skyMat.uniforms.c3.value.set(TH.fog);
      skyMat.uniforms.c1.value.lerp(new THREE.Color(TH.fog), 0.6);
      skyMat.uniforms.sunCol.value.multiplyScalar(0.15);
    }
    sun.visible = !mist;
    sunLight.color.set(night ? 0x8fa0ff : TH.sun[1]);
    sunLight.intensity = night ? 0.5 : mist ? 0.45 : 1.9;
    hemi.color.set(S[1]);
    hemi.groundColor.set(TH.grass[0]);
    hemi.intensity = night ? 0.55 : mist ? 1.25 : 0.95;
    stars.visible = night;
    bloom.strength = night ? 0.5 : mist ? 0.45 : 0.22; // lamps glow through the mist
    renderer.toneMappingExposure = night ? 1.2 : 1.0;
    world.traverse(o => {
      if (o.userData.detail) o.visible = !lowGfx();
    });
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

  /* ---------- ghost car: a see-through glowing copy of your best Time Trial lap ---------- */
  function makeGhost(body, col) {
    const g = makeCar(body, col, false);
    const gm = new THREE.MeshStandardMaterial({
      color: col,
      emissive: col,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
    g.traverse(o => {
      if (o.isMesh) {
        o.material = o.material === SHADOW ? o.material : gm;
        o.castShadow = false;
      }
    });
    return g;
  }

  /* ---------- visible damage on your car: dents, scuffed paint, smoke ---------- */
  const SMOKE = new THREE.SpriteMaterial({
    map: SHADOW.map,
    color: 0x666670,
    transparent: true,
    depthWrite: false,
    opacity: 0.6,
  });
  const smoke = [];
  let lastDmg = 0,
    smokeT = 0;
  /* push the body in around a point: front for crashes, the side for wall hits */
  function dent(car, amount) {
    const u = car.userData,
      geo = u.shell.geometry,
      p = geo.attributes.position,
      [L, W, r, hood] = u.size,
      wallSide = Math.abs(G.px) > G.FENCE - 0.2 ? Math.sign(G.px) : 0,
      cx = wallSide ? (wallSide * W) / 2 : (Math.random() - 0.5) * W * 0.7,
      cz = wallSide ? (Math.random() - 0.5) * L * 0.7 : -L / 2,
      cy = r + hood * (0.4 + Math.random() * 0.4),
      R = 0.75,
      depth = Math.min(0.22, 0.08 + amount * 1.2);
    for (let i = 0; i < p.count; i++) {
      const dx = p.getX(i) - cx,
        dy = p.getY(i) - cy,
        dz = p.getZ(i) - cz,
        d = Math.hypot(dx, dy, dz);
      if (d > R) continue;
      const f = depth * (1 - d / R) ** 2,
        // push toward the middle of the car
        vx = -p.getX(i),
        vz = -p.getZ(i),
        vl = Math.hypot(vx, vz) || 1;
      p.setXYZ(i, p.getX(i) + (vx / vl) * f, p.getY(i) - f * 0.3, p.getZ(i) + (vz / vl) * f);
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
  }
  function damageLook(car, d, dt) {
    const u = car.userData;
    // scuffed, dulled paint as health drops
    u.paint.color.copy(u.base).lerp(new THREE.Color(0x2a2724), d * 0.65);
    u.paint.roughness = Math.min(0.95, u.rough + d * 0.45);
    u.paint.clearcoat = 0.8 * (1 - d);
    // smoke from the engine once badly damaged; black and with sparks near the end
    if (d > 0.35 && !G.reduce) {
      smokeT -= dt * (2 + d * 14);
      if (smokeT <= 0) {
        smokeT = 1;
        const sp = smoke.find(s => !s.visible) || (smoke.length < 50 && new THREE.Sprite(SMOKE.clone()));
        if (sp) {
          if (!sp.parent) {
            scene.add(sp);
            smoke.push(sp);
          }
          // from the engine bay at the front of the hood (car-local metres; localToWorld applies the car's scale)
          const [L, , r, hood] = u.size;
          sp.position.copy(
            car.localToWorld(new THREE.Vector3((Math.random() - 0.5) * 0.6, r + hood + 0.2, -L / 2 + 0.6)),
          );
          sp.userData = { t: 0, l: 1.2 + Math.random() * 0.6 };
          sp.material.color.set(d > 0.7 ? 0x1c1a1e : 0x77777f);
          sp.visible = true;
        }
      }
    }
    for (const sp of smoke) {
      if (!sp.visible) continue;
      const k = (sp.userData.t += dt) / sp.userData.l;
      if (k >= 1) {
        sp.visible = false;
        continue;
      }
      sp.position.y += dt * 2.2;
      sp.scale.setScalar(0.8 + k * 3.5);
      sp.material.opacity = 0.65 * (1 - k);
    }
  }

  /* ---------- per-frame ---------- */
  const look = new THREE.Vector3();
  let lastT = performance.now();
  function frame() {
    if (builtVer !== G.trackVer || !world) buildWorld();
    const now = performance.now(),
      dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    if (active()) return showroom(dt);
    watchFps(dt);
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
      player = makeCar(pl.body, pl.col, true, true);
      lastDmg = 0;
      scene.add(player);
      playerKey = key;
    }
    // body yaw follows steering and drift, and swings out when the tyres slide (slip); it leans into turns
    place(
      player,
      pos + G.PZ,
      px,
      -G.steer * 0.07 * sf - G.drift * 0.35 + clamp3(G.slip * 0.12, -0.35, 0.35),
      G.steer * 0.025 * sf + clamp3(G.slip * 0.02, -0.06, 0.06),
    );
    spin(player, sf * dt * 60);
    player.userData.tail.emissiveIntensity = G.braking ? 4.5 : 1.4;
    // damage: a fresh car when health resets, a dent for every hit
    const dm = G.invincible ? 0 : G.dmg;
    if (dm < lastDmg - 0.01) playerKey = '';
    else if (dm > lastDmg + 0.005) dent(player, dm - lastDmg);
    lastDmg = dm;
    damageLook(player, dm, dt);
    // refresh the reflections every few frames (the player's own car is hidden from its reflection)
    if (!lowGfx() && ++cubeTick % 20 === 0) {
      player.visible = false;
      cubeCam.position.copy(player.position).y += 1.4;
      cubeCam.update(renderer, scene);
      player.visible = true;
    }

    // rivals, traffic and hazards
    seen.clear();
    for (const c of G.cars) {
      seen.add(c);
      let m = meshes.get(c);
      if (!m) {
        m = c.hz ? makeHazard(c.hz, c.col) : c.ghost ? makeGhost(c.body, c.col) : makeCar(c.body, c.col);
        if (c.rv) m.add(label(c.name));
        scene.add(m);
        meshes.set(c, m);
      }
      let dz = c.z - (pos + G.PZ);
      if (dz > G.TL / 2) dz -= G.TL;
      if (dz < -G.TL / 2) dz += G.TL;
      m.visible = !c.hidden && dz > -40 / FS && dz < 700 / FS;
      if (!m.visible) continue;
      place(m, c.z, c.o, c.hz === 'cow' ? Math.cos(c.ph) * 1.3 : 0);
      if (c.hz === 'cow') walk(m, G.t * 3 + c.ph * 5);
      else if (c.hz === 'cart' && m.userData.cows)
        m.userData.cows.forEach((b, i) => walk(b, G.t * 4 + i * 0.5));
      if (!c.hz || c.hz === 'cyc' || c.hz === 'rick') spin(m, (c.sp / 12000) * dt * 60);
      if (m.userData.tail) m.userData.tail.emissiveIntensity = c.brk ? 4.5 : 1.4;
    }
    for (const [c, m] of meshes)
      if (!seen.has(c)) {
        scene.remove(m);
        disposeTree(m);
        meshes.delete(c);
      }

    // chase camera: behind and above the car, looking down the road
    // camera height: never below the car's own road height, so it can't dip into a crest
    const carY = at(pos + G.PZ, 0).y;
    const cam = at(pos + G.PZ - 12.5 / FS, px * 0.92);
    const camY = Math.max(cam.y, carY) + 4.2 + sf * 0.5;
    camera.position.set(cam.x, camY, cam.z);
    const ahead = at(pos + G.PZ + 20 / FS, px * 0.6);
    look.set(ahead.x, ahead.y + 0.8, ahead.z);
    camera.lookAt(look);
    const sh = G.reduce ? 0 : G.shake * 0.012;
    if (sh) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, 0));
    // optional orbit camera around the player's car (view3d.orbit = { a: angle, d: distance, h: height })
    const ob = window.view3d.orbit;
    if (ob) {
      // ob.hz: centre on the nearest visible hazard of that kind (e.g. 'cow') instead of the player
      let c = player.position;
      if (ob.hz)
        for (const [k, m] of meshes)
          if (k.hz === ob.hz && m.visible && m.position.distanceTo(player.position) < 120) {
            c = m.position;
            break;
          }
      camera.position.set(c.x + Math.sin(ob.a) * ob.d, c.y + ob.h, c.z + Math.cos(ob.a) * ob.d);
      camera.lookAt(c.x, c.y + 0.9, c.z);
    }
    const fov = ob ? 40 : 60 + sf * 8 + G.boost * 10;
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

  /* ---------- Garage showroom: a studio with the car on a turntable ---------- */
  const studio = new THREE.Scene(),
    scam = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.3, 200);
  studio.background = new THREE.Color('#120f24');
  studio.fog = new THREE.Fog('#120f24', 14, 34);
  studio.environment = scene.environment;
  const scomp = new EffectComposer(renderer, msaa());
  scomp.setSize(innerWidth, innerHeight);
  scomp.addPass(new RenderPass(studio, scam));
  scomp.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.5, 0.9));
  scomp.addPass(new OutputPass());
  scomp.addPass(new ShaderPass(GRADE));
  addEventListener('resize', () => scomp.setSize(innerWidth, innerHeight));
  {
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(40, 64),
      new THREE.MeshStandardMaterial({ color: '#1d1a33', roughness: 0.3, metalness: 0.5 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    studio.add(floor);
    const key = new THREE.SpotLight(0xffffff, 4, 40, 0.55, 0.6, 0);
    key.position.set(4, 12, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0004;
    const rimA = new THREE.PointLight('#ff7a3d', 2.2, 30, 0),
      rimB = new THREE.PointLight('#2fc9bd', 2.2, 30, 0);
    rimA.position.set(-7, 3, -5);
    rimB.position.set(7, 3, -5);
    studio.add(key, key.target, rimA, rimB, new THREE.HemisphereLight('#9a8cff', '#1a1530', 0.6));
  }
  const table = new THREE.Group();
  {
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(4.6, 4.8, 0.14, 64),
      new THREE.MeshStandardMaterial({ color: '#25213f', roughness: 0.25, metalness: 0.7 }),
    );
    disc.position.y = 0.07;
    disc.receiveShadow = true;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(4.7, 0.03, 8, 96),
      new THREE.MeshStandardMaterial({ color: '#ff7a3d', emissive: '#ff7a3d', emissiveIntensity: 2 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.15;
    table.add(disc, ring);
  }
  studio.add(table);
  let showCar = null,
    showKey = '',
    spinA = 0.6,
    spinV = 0,
    drag = null;
  /* drag anywhere on the garage background to spin the car */
  addEventListener('pointerdown', e => {
    if (!active() || e.target.closest('button,input,a,.sc,.card,.chips,.sws')) return;
    drag = { x: e.clientX, id: e.pointerId };
  });
  addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    drag.x = e.clientX;
    spinA += dx * 0.01;
    spinV = dx * 0.6;
  });
  addEventListener('pointerup', () => (drag = null));
  addEventListener('pointercancel', () => (drag = null));
  const ovEl = document.getElementById('ov');
  const active = () => !!(window.view3d.showroom && !ovEl.hidden);
  function showroom(dt) {
    const sr = window.view3d.showroom,
      key = sr.body + sr.col;
    if (key !== showKey) {
      if (showCar) {
        table.remove(showCar);
        disposeTree(showCar);
      }
      showCar = makeCar(sr.body, sr.col, false);
      showCar.position.y = 0.14;
      table.add(showCar);
      showKey = key;
    }
    if (!drag) {
      spinV *= Math.pow(0.05, dt);
      spinA += dt * (0.35 + spinV);
    }
    table.rotation.y = spinA;
    // frame the car in the free side of the screen: the right half on wide screens, the top on narrow ones
    const wide = innerWidth > 900;
    scam.aspect = innerWidth / innerHeight;
    if (wide)
      scam.setViewOffset(
        innerWidth,
        innerHeight,
        -innerWidth * 0.26,
        -innerHeight * 0.04,
        innerWidth,
        innerHeight,
      );
    else scam.setViewOffset(innerWidth, innerHeight, 0, innerHeight * 0.22, innerWidth, innerHeight);
    // far enough back that the whole car fits the screen width (portrait phones need more room)
    const d = wide ? 19 : Math.max(17, 4.1 / (Math.tan((17 * Math.PI) / 180) * scam.aspect));
    studio.fog.near = d - 3;
    studio.fog.far = d + 22;
    scam.position.set(0, 3.4, d);
    scam.lookAt(0, 0.9, 0);
    scam.updateProjectionMatrix();
    scomp.render();
  }

  /* ---------- graphics quality: 'auto' measures the frame rate early in a race and drops shadows,
     glow and resolution if the device can't keep up; 'high' / 'low' force it (Settings) ---------- */
  const LSget = (k, d) => {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch (e) {
      return d;
    }
  };
  function lowGfx() {
    return quality === 'low' || (quality === 'auto' && autoLow);
  }
  let quality = LSget('ghatrun-gfx', 'auto'),
    autoLow = LSget('ghatrun-gfx-autolow', false),
    fpsN = 0,
    fpsT = 0,
    measured = false;
  function applyQuality() {
    const low = lowGfx();
    // High renders at the screen's full sharpness (up to 2x on Retina / high-DPI screens) with finer shadows
    const hi = quality === 'high';
    renderer.setPixelRatio(low ? 1 : Math.min(devicePixelRatio, hi ? 2 : coarse ? 1.25 : 1.75));
    const sm = hi && !coarse ? 4096 : coarse ? 1024 : 2048;
    if (sunLight.shadow.mapSize.x !== sm) {
      sunLight.shadow.mapSize.set(sm, sm);
      if (sunLight.shadow.map) {
        sunLight.shadow.map.dispose();
        sunLight.shadow.map = null;
      }
    }
    renderer.shadowMap.enabled = !low;
    sunLight.castShadow = !low;
    bloom.enabled = !low;
    composer.setPixelRatio(renderer.getPixelRatio());
    scomp.setPixelRatio(renderer.getPixelRatio());
    scene.traverse(o => {
      if (o.material) o.material.needsUpdate = true;
      if (o.userData.detail) o.visible = !low;
    });
  }
  function watchFps(dt) {
    if (quality !== 'auto' || autoLow || measured || G.state !== 'race' || !dt) return;
    fpsN++;
    fpsT += dt;
    if (fpsT > 4) {
      if (fpsN / fpsT < 38) {
        autoLow = true;
        try {
          localStorage.setItem('ghatrun-gfx-autolow', 'true');
        } catch (e) {}
        applyQuality();
      }
      measured = true; // once per visit is enough
    }
  }
  applyQuality();

  window.view3d = {
    ready: true,
    frame,
    showroom: null,
    track: () => P,
    debug: () =>
      player && {
        dmg: G.dmg,
        last: lastDmg,
        color: player.userData.paint.color.getHexString(),
        smoke: smoke.filter(x => x.visible).length,
      },
    setQuality(q) {
      quality = q;
      if (q !== 'auto') autoLow = false;
      try {
        localStorage.setItem('ghatrun-gfx', JSON.stringify(q));
        localStorage.setItem('ghatrun-gfx-autolow', JSON.stringify(autoLow));
      } catch (e) {}
      applyQuality();
    },
    get quality() {
      return quality;
    },
  };
  document.body.classList.add('gl');
}
