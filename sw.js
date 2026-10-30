/* Service worker: makes Worldwide Wheels installable and playable offline.
   On install it saves the whole game (code, 3D engine, music, icons). After that every request for a game
   file is answered from the saved copy straight away, while a fresh copy is fetched in the background, so
   updates arrive on the next launch. Online services (Firebase sign-in and saves) always go to the network. */
const CACHE = 'worldwide-wheels-v1';
const FILES = [
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
  'assets/music/song-1.mp3',
  'assets/music/song-2.mp3',
  'assets/music/song-3.mp3',
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
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const hit = await cache.match(req, { ignoreSearch: own });
      const fresh = fetch(req)
        .then(res => {
          if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit || fresh;
    }),
  );
});
