#!/usr/bin/env python3
"""Build dist/index.html: the whole game in one file (code, styles, 3D library, car models, music).

Run from the repo root:  python3 tools/build-single.py
Needs esbuild on PATH or in node_modules/.bin (npm i esbuild) to bundle the 3D modules.
Online features (sign-in, cloud saves, multiplayer) and the fonts still load from the internet.
"""
import base64, mimetypes, os, re, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'dist', 'index.html')
read = lambda p: open(os.path.join(ROOT, p), encoding='utf-8').read()
mimetypes.add_type('model/gltf-binary', '.glb')
mimetypes.add_type('audio/mpeg', '.mp3')
mimetypes.add_type('font/woff2', '.woff2')


def data_url(path):
    mt = mimetypes.guess_type(path)[0] or 'application/octet-stream'
    return 'data:%s;base64,%s' % (mt, base64.b64encode(open(os.path.join(ROOT, path), 'rb').read()).decode())


def safe(js):  # keep code from closing the <script> tag early
    return js.replace('</script', '<\\/script').replace('<!--', '<\\!--')


def esbuild():
    for c in [shutil.which('esbuild'), os.path.join(ROOT, 'node_modules', '.bin', 'esbuild'), os.environ.get('ESBUILD')]:
        if c and os.path.exists(c):
            return c
    sys.exit('esbuild not found: run  npm i esbuild  (or set ESBUILD=/path/to/esbuild)')


# 1. bundle the 3D view with Three.js. cloud.js stays its own module (Firebase loads from its CDN),
#    so being offline only turns off the online features, not the 3D view
tmp = tempfile.mkdtemp()
entry = os.path.join(ROOT, 'js', '_single_entry.js')
open(entry, 'w').write("import './view3d.js';\n")
try:
    subprocess.run(
        [esbuild(), entry, '--bundle', '--format=esm', '--minify', '--external:https://*',
         '--alias:three=./js/vendor/three/three.module.min.js', '--alias:three/addons=./js/vendor/three/addons',
         '--outfile=' + os.path.join(tmp, 'mods.js'), '--log-level=warning'],
        cwd=ROOT, check=True)
finally:
    os.remove(entry)
mods = open(os.path.join(tmp, 'mods.js'), encoding='utf-8').read()

# 2. every asset as base64, served by small hooks on fetch / <img> / <audio>
assets = {}
for d, _, files in os.walk(os.path.join(ROOT, 'assets')):
    for f in files:
        if f.endswith(('.glb', '.png', '.jpg', '.mp3', '.ogg', '.wav')):
            rel = os.path.relpath(os.path.join(d, f), ROOT).replace(os.sep, '/')
            assets[rel] = data_url(rel)
hooks = """(() => {
  const A = %s, blobs = {}, keys = Object.keys(A);
  const res = u => {
    if (typeof u !== 'string') return null;
    const p = u.split('?')[0], k = keys.find(k => p.endsWith(k));
    if (!k) return null;
    if (!blobs[k]) {
      const [h, b] = A[k].split(','), s = atob(b), a = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
      blobs[k] = URL.createObjectURL(new Blob([a], { type: h.slice(5).split(';')[0] }));
      delete A[k];
    }
    return blobs[k];
  };
  const f = window.fetch.bind(window);
  window.fetch = (u, o) => f(res(typeof u === 'string' ? u : u && u.url) || u, o);
  for (const P of [HTMLImageElement.prototype, HTMLMediaElement.prototype]) {
    const d = Object.getOwnPropertyDescriptor(P, 'src');
    Object.defineProperty(P, 'src', { get() { return d.get.call(this); }, set(v) { d.set.call(this, res(v) || v); } });
  }
})();""" % ('{' + ','.join('"%s":"%s"' % kv for kv in assets.items()) + '}')

# 3. stitch the page together
html = read('index.html')
html = re.sub(r'\s*<link rel="(manifest|apple-touch-icon)"[^>]*>', '', html)
html = html.replace('href="favicon.svg"', 'href="%s"' % data_url('favicon.svg'))
html = re.sub(r'\s*<link rel="preload" href="assets/fonts/[^>]*>', '', html)
css = read('css/style.css').replace('url(../assets/fonts/big-shoulders-display.woff2)', 'url(%s)' % data_url('assets/fonts/big-shoulders-display.woff2'))
html = html.replace('<link rel="stylesheet" href="css/style.css" />', '<style>\n%s\n</style>' % css)
html = re.sub(r'\s*<script src="js/(cars|game)\.js" defer></script>', '', html)
html = re.sub(r'\s*<!-- 3D view:.*?</script>\s*<script type="module" src="js/view3d.js"></script>\s*<script type="module" src="js/cloud.js"></script>',
              '', html, flags=re.S)
html = html.replace('<head>', '<head>\n<script>%s</script>' % safe(hooks), 1)
tail = '<script>%s</script>\n<script>%s</script>\n<script type="module">%s</script>\n<script type="module">%s</script>\n' % (
    safe(read('js/cars.js')), safe(read('js/game.js').replace("navigator.serviceWorker.register('sw.js')", 'Promise.resolve()')), safe(mods), safe(read('js/cloud.js')))
html = html.replace('</body>', tail + '</body>', 1)
for bad in ['src="js/', 'href="css/', 'importmap']:
    if bad in html:
        sys.exit('leftover reference: ' + bad)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, 'w', encoding='utf-8').write(html)
print('wrote %s (%.1f MB)' % (os.path.relpath(OUT, ROOT), os.path.getsize(OUT) / 1e6))
