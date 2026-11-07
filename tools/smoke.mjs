// Smoke test: open the game, start a race against bots, use every power-up, and fail on any page error.
// Run:  python3 -m http.server 8765 &  then  node tools/smoke.mjs   (needs: npm i playwright)
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');

const URL = process.env.GAME_URL || 'http://localhost:8765/index.html';
const errors = [];
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const page = await (
  await browser.newContext({ viewport: { width: 480, height: 300 }, serviceWorkers: 'block' })
).newPage();
page.on('pageerror', e => errors.push(e.message));
await page.route(/gstatic|googleapis|firebase/, r => r.abort()); // online features are optional
await page.goto(URL);
await page.evaluate(() => {
  localStorage.setItem(
    'ghatrun-profiles',
    JSON.stringify({
      t: { name: 'Test', color: '#ff5a5a', body: 'toro', owned: ['toro'], points: 0, upg: {}, history: [] },
    }),
  );
  localStorage.setItem('ghatrun-user', JSON.stringify('t'));
  localStorage.setItem('ghatrun-ctl', JSON.stringify('keys'));
});
await page.reload();
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
await page.click('[data-a=bots]');
await page.waitForFunction(() => window.__game.state === 'race', null, { timeout: 300000 });
await page.keyboard.down('ArrowUp');
for (const k of ['KeyR', 'KeyE', 'KeyF', 'KeyV', 'Space']) {
  await page.keyboard.press(k);
  await page.waitForTimeout(1500);
}
const st = await page.evaluate(() => ({
  state: window.__game.state,
  speed: window.__game.speed,
  has3d: !!(window.view3d && window.view3d.ready),
}));
await browser.close();
console.log(JSON.stringify(st));
if (errors.length) {
  console.error('Page errors:\n' + errors.join('\n'));
  process.exit(1);
}
if (st.state !== 'race' || !(st.speed > 0)) {
  console.error('The race did not run');
  process.exit(1);
}
console.log('Smoke test passed');
