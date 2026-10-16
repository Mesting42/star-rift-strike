import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../test-results/', import.meta.url);
await mkdir(output, { recursive: true });
const baseline = process.argv.includes('--baseline');
const report = { started: new Date().toISOString(), url: process.env.GAME_URL || 'http://127.0.0.1:5173/', checks: [], errors: [] };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
let page;
const pass = (name, detail = {}) => { report.checks.push({ name, ...detail }); console.log(`PASS ${name}`); };
const ready = () => page.waitForFunction(() => Boolean(window.__STAR_RIFT__));
const tap = action => page.locator(`[data-action="${action}"]`).first().tap();
const metrics = () => page.evaluate(() => {
  const r = window.__STAR_RIFT__.renderer, c = r.canvas, box = c.getBoundingClientRect();
  return { quality: r.quality, dpr: devicePixelRatio, ratio: r.renderer.getPixelRatio(),
    cssWidth: box.width, cssHeight: box.height, width: c.width, height: c.height, pixels: c.width * c.height,
    samples: r.composer.renderTarget1.samples, targets: [r.composer.renderTarget1, r.composer.renderTarget2].map(t => ({ width: t.width, height: t.height, samples: t.samples })),
    camera: [r.camera.left, r.camera.right, r.camera.top, r.camera.bottom],
    mode: window.__STAR_RIFT__.game.mode, stored: localStorage.getItem('star-rift-graphics-quality'),
    glError: r.renderer.getContext().getError() };
});
// A frozen, seeded display fixture makes before/after comparisons fair. This
// is a graphics check, not normal gameplay or evidence of a completed run.
async function fixture() {
  await page.evaluate(() => {
    const { game: g, renderer: r } = window.__STAR_RIFT__;
    g.start(57419); g.nextSector();
    const node = g.map.nodes.find(n => n.type === 'combat'); g.currentNode = node.id; g.enterCombat(node);
    g.enemies = []; g.bullets = []; g.obstacles = []; g.fx = []; g.drops = [];
    g.player.x = 1.5; g.player.z = 9; g.player.inv = 0; g.player.roll = 0; g.hitFeedback = null;
    g.spawnEnemy('wing', -5, -7); g.spawnEnemy('gunner', 4, -12); g.spawnEnemy('scout', 6, -1);
    g.makeObstacle('cover', -7, 2); g.makeObstacle('crate', 7, -9);
    for (const x of [-.3, .3]) for (const z of [-11, -3, 5]) g.bullet(1.5 + x, z, 0, -26);
    for (const x of [-5.6, -5, -4.4]) g.bullet(x, -2, x + 5, 7, { enemy: true, r: .22 });
    g.update = () => {}; r.time = 4; r.shake = 0;
    const update = r.update.bind(r); r.update = game => update(game, 0);
    document.getElementById('toast').classList.remove('visible');
  });
  await page.waitForTimeout(200);
}
const capture = name => page.locator('#world').screenshot({ path: fileURLToPath(new URL(name, output)) });
async function selectQuality(value) {
  await page.locator(`[data-action="graphicsQuality"][data-value="${value}"]`).tap();
  await page.waitForFunction(value => window.__STAR_RIFT__.renderer.quality === value, value);
  assert.equal(await page.locator(`[data-action="graphicsQuality"][data-value="${value}"]`).getAttribute('aria-pressed'), 'true');
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  await context.addInitScript(() => {
    let seed = 71359; Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  });
  page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await page.goto(report.url); await ready(); await fixture();
  if (baseline) {
    const before = await metrics(); await capture('graphics-phone-before.png');
    pass('original phone rendering captured before source changes', before);
  } else {
    const high = await metrics();
    assert.equal(high.quality, 'high'); assert.equal(high.ratio, 3);
    assert.ok(high.samples > 0, 'postprocessed scene has multisample antialiasing');
    assert.equal(high.glError, 0);
    for (const t of high.targets) { assert.equal(t.width, high.width); assert.equal(t.height, high.height); }
    await capture('graphics-phone-high.png'); pass('3x phone defaults to native-resolution HD with antialiasing', high);
    await tap('pause'); await tap('settings');
    await selectQuality('smooth'); const smoothMenu = await metrics();
    assert.equal(smoothMenu.ratio, 1.25); assert.equal(smoothMenu.samples, 0);
    assert.equal(smoothMenu.stored, 'smooth'); await tap('back'); await tap('resume');
    const smooth = await metrics(); assert.deepEqual(smooth.camera, high.camera);
    assert.ok(high.pixels >= smooth.pixels * 5.7); await capture('graphics-phone-smooth.png');
    pass('smooth mode lowers GPU work without changing combat camera or restarting', smooth);
    await tap('pause'); await tap('settings'); await selectQuality('balanced');
    assert.equal((await metrics()).ratio, 2); await tap('back'); await tap('resume');
    const balanced = await metrics(); assert.deepEqual(balanced.camera, high.camera);
    assert.ok(balanced.pixels > smooth.pixels && balanced.pixels < high.pixels);
    pass('balanced mode provides intermediate resolution', balanced);
    await page.reload(); await ready(); assert.equal((await metrics()).quality, 'balanced');
    await tap('settings'); assert.equal(await page.locator('[data-value="balanced"][data-action="graphicsQuality"]').getAttribute('aria-pressed'), 'true');
    pass('quality selection survives refresh and settings reflects the saved choice');
    await selectQuality('high');
    await page.screenshot({ path: fileURLToPath(new URL('graphics-phone-settings.png', output)) });
    await tap('back'); await fixture();
    for (const size of [{ width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }]) {
      await page.setViewportSize(size); await page.waitForTimeout(160);
      const m = await metrics(); assert.ok(m.pixels <= 6000000); assert.ok(m.ratio <= m.dpr);
      assert.ok(m.ratio >= 2, 'HD remains sharp across phone and tablet orientations');
      assert.equal(m.glError, 0); for (const t of m.targets) { assert.equal(Math.floor(t.width), m.width); assert.equal(Math.floor(t.height), m.height); }
      pass(`HD rotation and pixel budget ${size.width}×${size.height}`, m);
    }
    await page.evaluate(() => localStorage.setItem('star-rift-graphics-quality', 'invalid'));
    await page.reload(); await ready(); assert.equal((await metrics()).quality, 'high');
    pass('invalid saved preference falls back to HD');
    await context.close();
    const lowDPR = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    page = await lowDPR.newPage(); page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(report.url); await ready(); assert.equal((await metrics()).ratio, 1);
    pass('1x screens do not allocate unnecessary resolution'); await lowDPR.close();
    const noStorage = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
    await noStorage.addInitScript(() => {
      Storage.prototype.getItem = () => { throw new DOMException('Storage unavailable', 'SecurityError'); };
      Storage.prototype.setItem = () => { throw new DOMException('Storage unavailable', 'SecurityError'); };
    });
    page = await noStorage.newPage(); page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(report.url); await ready(); await tap('settings'); await selectQuality('smooth');
    assert.equal(await page.evaluate(() => window.__STAR_RIFT__.renderer.quality), 'smooth');
    pass('unavailable browser storage does not prevent playing or switching quality'); await noStorage.close();
    const noMSAA = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
    await noMSAA.addInitScript(() => {
      const query = WebGL2RenderingContext.prototype.getInternalformatParameter;
      WebGL2RenderingContext.prototype.getInternalformatParameter = function (target, format, parameter) {
        if (format === this.RGBA16F && parameter === this.SAMPLES) return new Int32Array();
        return query.call(this, target, format, parameter);
      };
    });
    page = await noMSAA.newPage(); page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(report.url); await ready();
    const fallback = await metrics(); assert.equal(fallback.ratio, 3); assert.equal(fallback.samples, 0); assert.equal(fallback.glError, 0);
    pass('GPUs without HDR multisampling keep native HD resolution', fallback); await noMSAA.close();
    let before;
    try { before = await readFile(new URL('graphics-phone-before.png', output)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    let sameLayout = false;
    if (before) {
      try {
        const previous = JSON.parse(await readFile(new URL('graphics-baseline-report.json', output), 'utf8')).checks[0];
        sameLayout = previous.cssWidth === high.cssWidth && previous.cssHeight === high.cssHeight;
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    // Old screenshots from a different control layout are historical evidence,
    // not a fair same-size comparison with the current battlefield projection.
    if (before && sameLayout) {
      const after = await readFile(new URL('graphics-phone-high.png', output));
      const comparison = await browser.newContext({ viewport: { width: 768, height: 490 }, deviceScaleFactor: 1 });
      const comparisonPage = await comparison.newPage();
      // Display equal-size native screenshot crops; do not rescale or sharpen.
      await comparisonPage.setContent(`<html lang="zh-CN"><meta charset="utf-8"><style>
        *{box-sizing:border-box}body{margin:0;padding:24px;background:#0b1c24;color:#d7e0d5;font:14px "Microsoft YaHei",sans-serif}
        header{font-size:17px;margin-bottom:20px}main{display:flex;gap:24px}section{width:348px}h2{font-size:14px;font-weight:400;margin:0 0 12px}
        .crop{position:relative;width:348px;height:340px;overflow:hidden;border:1px solid #536a71}.crop img{position:absolute;max-width:none;width:1170px;height:1740px;left:-482px;top:-1010px}
        footer{margin-top:18px;color:#93aab3;font-size:11px}</style><header>STAR RIFT · 手机战场清晰度对比</header><main>
        <section><h2>修改前 · 1.25 倍渲染</h2><div class="crop"><img src="data:image/png;base64,${before.toString('base64')}"></div></section>
        <section><h2>修改后 · 3 倍高清 + 抗锯齿</h2><div class="crop"><img src="data:image/png;base64,${after.toString('base64')}"></div></section>
        </main><footer>同一固定场景、相同截图显示比例 · Chromium 手机模拟；实体手机效果待试玩确认。</footer></html>`);
      await comparisonPage.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
      await comparisonPage.screenshot({ path: fileURLToPath(new URL('graphics-comparison.png', output)) });
      await comparison.close();
    }
  }
  assert.deepEqual(report.errors, []); report.status = 'passed';
  console.log(`Graphics checks passed: ${report.checks.length}`);
} catch (error) {
  report.status = 'failed'; report.error = error.stack;
  if (page && !page.isClosed()) await page.screenshot({ path: fileURLToPath(new URL('graphics-failure.png', output)) }).catch(() => {});
  throw error;
} finally {
  await writeFile(new URL(baseline ? 'graphics-baseline-report.json' : 'graphics-report.json', output), JSON.stringify(report, null, 2));
  await browser.close();
}
