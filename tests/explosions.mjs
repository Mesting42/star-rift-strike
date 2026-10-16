import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../test-results/', import.meta.url);
await mkdir(output, { recursive: true });
const report = { started: new Date().toISOString(), url: process.env.GAME_URL || 'http://127.0.0.1:5173/',
  scope: 'Independent weapon-hit and visual lifecycle fixtures; not a full completed run or physical phone performance test.', checks: [], errors: [] };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
let page;
const pass = (name, detail = {}) => { report.checks.push({ name, ...detail }); console.log(`PASS ${name}`); };
const ready = () => page.waitForFunction(() => Boolean(window.__STAR_RIFT__));
async function fixture(sector = 2) {
  await page.evaluate(sector => {
    const { game: g, renderer: r } = window.__STAR_RIFT__;
    for (const effect of r.effects) r.disposeEffect(effect); r.effects = []; r.lastFx.clear();
    g.start(78142); if (sector === 2) g.nextSector();
    const node = g.map.nodes.find(n => n.type === 'combat'); g.currentNode = node.id; g.enterCombat(node);
    g.enemies = []; g.bullets = []; g.obstacles = []; g.fx = []; g.drops = [];
    g.player.inv = 0; g.player.roll = 0; g.autoFire = false; g.waveAt = 100; g.environmentTimer = 100;
    g.player.x = 0; g.player.z = 10; g.update = () => {};
    if (!window.__explosionQA__) {
      window.__explosionQA__ = { render: r.update.bind(r) };
      r.update = game => window.__explosionQA__.render(game, 0);
    }
    document.getElementById('toast').classList.remove('visible');
    r.resize(); r.shake = 0; r.flashLight.intensity = 0;
  }, sector);
}
const step = dt => page.evaluate(dt => {
  const { game: g, renderer: r } = window.__STAR_RIFT__;
  r.shake = 0; window.__explosionQA__.render(g, dt);
}, dt);
const state = () => page.evaluate(() => {
  const r = window.__STAR_RIFT__.renderer;
  const effect = r.effects.find(e => e.kind === 'energy-explosion');
  return { count: r.effects.length, children: r.particles.children.length, calls: r.renderer.info.render.calls,
    visualRings: r.effects.reduce((count, effect) => count + effect.g.children.filter(child => child.geometry?.type === 'RingGeometry').length, 0),
    geometries: r.renderer.info.memory.geometries, textures: r.renderer.info.memory.textures, glError: r.renderer.getContext().getError(),
    effect: effect && { t: effect.t, max: effect.max, size: effect.size, coreVisible: effect.core.visible,
      sparkVisible: effect.sparkMesh.visible, fragments: effect.fragments.length, sparks: effect.sparks.length,
      coreOpacity: effect.core.material.opacity, fragmentOpacity: effect.fragmentMesh.material.opacity,
      hasRing: effect.g.children.some(child => child.geometry?.type === 'RingGeometry'),
      instanced: effect.sparkMesh.isInstancedMesh && effect.fragmentMesh.isInstancedMesh } };
});
const capture = filename => page.locator('#world').screenshot({ path: fileURLToPath(new URL(filename, output)) });

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  await context.addInitScript(() => {
    let seed = 89143; Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  });
  page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await page.goto(report.url); await ready(); await fixture();
  const kill = await page.evaluate(() => {
    const { game: g } = window.__STAR_RIFT__;
    const target = g.spawnEnemy('scout', 0, -3);
    const before = { kills: g.kills, money: g.money };
    g.bullet(0, -2, 0, -20, { damage: target.hp + 1, life: 4 });
    g.updateBullets(.05); g.enemies = g.enemies.filter(e => e.hp > 0);
    return { hp: target.hp, before, kills: g.kills, money: g.money, reward: target.reward,
      effects: g.fx.filter(f => f.type === 'explosion').length };
  });
  assert.ok(kill.hp <= 0); assert.equal(kill.effects, 1); assert.equal(kill.kills, kill.before.kills + 1);
  assert.equal(kill.money, kill.before.money + kill.reward); await step(.025);
  const flash = await state(); assert.equal(flash.effect.hasRing, false); assert.equal(flash.visualRings, 0); assert.ok(flash.effect.instanced);
  assert.ok(flash.effect.coreVisible && flash.effect.sparks > 0 && flash.effect.fragments > 0);
  await capture('explosion-phone-flash.png'); pass('a real projectile kill emits a bright-core burst without an expanding ring', { ...kill, ...flash });
  await step(.115); const fractured = await state(); await capture('explosion-phone-fracture.png');
  assert.equal(fractured.visualRings, 0, 'the accompanying hit flash does not restore the old circle');
  assert.ok(fractured.effect.coreOpacity < flash.effect.coreOpacity && fractured.effect.sparkVisible);
  pass('bright flash gives way to directional sparks and tumbling fragments', fractured);
  await step(.18); const fading = await state(); await capture('explosion-phone-fade.png');
  assert.equal(fading.effect.coreVisible, false); assert.ok(fading.effect.fragmentOpacity < fractured.effect.fragmentOpacity);
  pass('core disappears quickly while fragments fade instead of covering incoming fire', fading);
  await page.evaluate(() => window.__STAR_RIFT__.game.pause()); const paused = await state();
  await step(.2); assert.equal((await state()).effect.t, paused.effect.t);
  await page.evaluate(() => window.__STAR_RIFT__.game.resume()); await step(.6);
  assert.equal((await state()).count, 0); assert.equal((await state()).children, 0);
  pass('pause freezes the animation; resume completes it and releases particle objects');

  await fixture();
  for (const type of ['scout', 'gunner', 'tank', 'elite', 'boss']) {
    await page.evaluate(type => {
      const g = window.__STAR_RIFT__.game;
      const enemy = g.spawnEnemy(type, 0, -3); g.damageEnemy(enemy, enemy.hp); g.enemies = [];
    }, type);
    await step(.07); const m = await state(); assert.ok(m.effect && !m.effect.hasRing && m.effect.size <= 4.2);
    if (type === 'boss') await capture('explosion-boss.png');
    pass(`${type} destruction uses the same bounded energy burst`, m);
    await step(1); await page.evaluate(() => { const g = window.__STAR_RIFT__.game; g.mode = 'combat'; g.fx = []; });
  }
  await fixture(1);
  await page.evaluate(() => window.__STAR_RIFT__.game.particle('explosion', 0, -3, 4, '#ff805c'));
  await step(.12); assert.equal((await state()).effect.hasRing, false); await capture('explosion-clouds.png');
  pass('missile detonations also lose the ring and retain their weapon color'); await step(1);

  await fixture(); await page.evaluate(() => window.__STAR_RIFT__.game.particle('explosion', 0, -3, 2));
  await step(.08); await step(1); await page.evaluate(() => { window.__STAR_RIFT__.game.fx = []; });
  const before = await state();
  for (let cycle = 0; cycle < 8; cycle++) {
    await page.evaluate(() => {
      const g = window.__STAR_RIFT__.game;
      for (let i = 0; i < 12; i++) g.particle('explosion', (i % 4 - 1.5) * 4, Math.floor(i / 4) * 4 - 9, 1.8);
    });
    await step(.12); const active = await state(); assert.equal(active.count, 12); assert.ok(active.calls < 260, `bounded draw calls: ${active.calls}`);
    await step(1); assert.equal((await state()).count, 0);
    await page.evaluate(() => { window.__STAR_RIFT__.game.fx = []; });
  }
  const after = await state(); assert.equal(after.children, 0); assert.equal(after.glError, 0);
  assert.equal(after.geometries, before.geometries); assert.equal(after.textures, before.textures);
  pass('96 repeated explosions leave no growing geometry, texture or live particle counts', { before, after });
  await fixture(); await page.evaluate(() => { const r = window.__STAR_RIFT__.renderer; for (let i = 0; i < 100; i++) r.effect({ type: 'explosion', x: 0, z: -3, scale: 1.4 }); });
  assert.ok((await state()).count <= 66); await step(1); assert.equal((await state()).count, 0);
  pass('large chains respect the existing effect capacity and clear completely');
  await context.close();

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await desktop.newPage(); page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(report.url); await ready(); await fixture();
  await page.evaluate(() => window.__STAR_RIFT__.game.particle('explosion', 0, -3, 3));
  await step(.1); const desktopState = await state(); assert.equal(desktopState.glError, 0); await capture('explosion-desktop.png');
  pass('desktop uses the same effect without WebGL errors', desktopState); await desktop.close();
  const frames = await Promise.all(['flash', 'fracture', 'fade'].map(name => readFile(new URL(`explosion-phone-${name}.png`, output))));
  const preview = await browser.newContext({ viewport: { width: 906, height: 374 }, deviceScaleFactor: 1 });
  const previewPage = await preview.newPage();
  const labels = ['亮核闪爆 · 0.025 秒', '能量炸裂 · 0.140 秒', '碎片消散 · 0.320 秒'];
  await previewPage.setContent(`<html lang="zh-CN"><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;padding:24px;background:#0b1c24;color:#d7e0d5;font:14px "Microsoft YaHei",sans-serif}
    header{font-size:17px;margin-bottom:18px}main{display:flex;gap:18px}section{width:274px}h2{font-size:12px;font-weight:400;margin:0 0 12px}
    .crop{position:relative;width:274px;height:238px;overflow:hidden;border:1px solid #536a71}.crop img{position:absolute;max-width:none;width:1170px;height:1740px;left:-448px;top:-612px}
    footer{margin-top:16px;color:#93aab3;font-size:11px}</style><header>STAR RIFT · 科幻能量爆炸</header><main>
    ${frames.map((frame, index) => `<section><h2>${labels[index]}</h2><div class="crop"><img src="data:image/png;base64,${frame.toString('base64')}"></div></section>`).join('')}
    </main><footer>游戏引擎实际渲染 · 手机高清模拟场景的局部截图，未放大或添加图像特效。</footer></html>`);
  await previewPage.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
  await previewPage.screenshot({ path: fileURLToPath(new URL('explosion-sequence.png', output)) });
  await preview.close();
  assert.deepEqual(report.errors, []); report.status = 'passed'; console.log(`Explosion checks passed: ${report.checks.length}`);
} catch (error) {
  report.status = 'failed'; report.error = error.stack;
  if (page && !page.isClosed()) await page.screenshot({ path: fileURLToPath(new URL('explosion-failure.png', output)) }).catch(() => {});
  throw error;
} finally {
  await writeFile(new URL('explosion-report.json', output), JSON.stringify(report, null, 2));
  await browser.close();
}
