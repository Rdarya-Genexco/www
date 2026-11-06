/* Service worker: makes Worldwide Wheels installable and playable offline.
   On install it saves the whole game (code, 3D engine, music, icons). After that every request for a game
   file is answered from the saved copy straight away, while a fresh copy is fetched in the background, so
   updates arrive on the next launch. Online services (Firebase sign-in and saves) always go to the network. */
const CACHE = 'worldwide-wheels-v4';
const FILES = [
  'assets/fonts/big-shoulders-display.woff2',
  'assets/models/poly-pizza/lamborghini-aventador.glb',
  'assets/models/kenney/Textures/colormap.png',
  'assets/models/kenney/truck.glb',
  'assets/models/kenney/van.glb',
  'assets/models/kenney/hatchback-sports.glb',
  'assets/models/kenney/sedan-sports.glb',
  'assets/models/kenney/sedan.glb',
  'js/vendor/three/addons/math/SimplexNoise.js',
  'js/vendor/three/addons/shaders/PoissonDenoiseShader.js',
  'js/vendor/three/addons/shaders/GTAOShader.js',
  'js/vendor/three/addons/postprocessing/GTAOPass.js',
  'js/vendor/three/addons/utils/BufferGeometryUtils.js',
  'js/vendor/three/addons/loaders/GLTFLoader.js',
  './',
  'index.html',
  'manifest.json',
  'favicon.svg',
  'css/style.css',
  'js/cars.js',
  'js/cloud.js',
  'js/game.js',
  'js/view3d.js',
  'js/vendor/three/three.module.min.js',
  'js/vendor/three/addons/postprocessing/Pass.js',
  'js/vendor/three/addons/postprocessing/UnrealBloomPass.js',
  'js/vendor/three/addons/postprocessing/OutputPass.js',
  'js/vendor/three/addons/postprocessing/RenderPass.js',
  'js/vendor/three/addons/postprocessing/EffectComposer.js',
  'js/vendor/three/addons/postprocessing/ShaderPass.js',
  'js/vendor/three/addons/postprocessing/MaskPass.js',
  'js/vendor/three/addons/environments/RoomEnvironment.js',
  'js/vendor/three/addons/shaders/LuminosityHighPassShader.js',
  'js/vendor/three/addons/shaders/CopyShader.js',
  'js/vendor/three/addons/shaders/OutputShader.js',
  'js/vendor/three/addons/geometries/RoundedBoxGeometry.js',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', e => {
  // each file on its own, so one missing file can't stop the rest from being saved
  e.waitUntil(
    caches
      .open(CACHE)
      .then(c => Promise.allSettled(FILES.map(f => c.add(f))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', e => {
  // drop caches from older versions of this file
  e.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  const req = e.request,
    url = new URL(req.url);
  // only this site's own files (plus Google Fonts); Firebase and everything else go straight to the network
  const own = url.origin === location.origin,
    fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (req.method !== 'GET' || (!own && !fonts)) return;
  // network first: online you always get the newest version (no old copy flashing up first);
  // offline, or if the network fails, the saved copy is used
  e.respondWith(
    caches.open(CACHE).then(cache =>
      fetch(req)
        .then(res => {
          if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
          return res;
        })
        .catch(() => cache.match(req, { ignoreSearch: own }).then(hit => hit || Response.error())),
    ),
  );
});
