import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../test-results/', import.meta.url);
await mkdir(output, { recursive: true });
const report = { checks: [], errors: [] };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5173/');
  await page.waitForFunction(() => Boolean(window.__STAR_RIFT__));
  // Isolated reproduction fixture using the actual game and renderer, not a full-run shortcut.
  await page.evaluate(() => {
    const g = window.__STAR_RIFT__.game;
    g.start(7419);
    const node = g.map.nodes.find(n => n.type === 'combat');
    g.currentNode = node.id; g.enterCombat(node);
    g.autoFire = false; g.obstacles = []; g.waveAt = 100; g.environmentTimer = 100;
    g.player.x = -8;
    const e = g.spawnEnemy('laser', 2, -8); e.fire = 100;
    g.spawnLaser(e);
  });
  const geometry = () => page.evaluate(() => {
    const { game: g, renderer: r } = window.__STAR_RIFT__;
    r.scene.updateMatrixWorld(true);
    return g.hazards.map(h => {
      const source = g.enemies.find(e => e.id === h.sourceId), model = r.entities.get(`e${h.sourceId}`);
      const hazard = r.entities.get(`h${h.id}`), beam = hazard.userData.beam.children[0];
      const muzzle = model.userData.laserMuzzles[h.mountIndex];
      const port = muzzle.getWorldPosition(muzzle.position.clone());
      const start = beam.localToWorld(beam.position.clone().set(0, 0, -.5));
      const end = beam.localToWorld(beam.position.clone().set(0, 0, .5));
      return { mount: h.mountIndex, sourceZ: source.z, sourceX: source.x,
        muzzle: { x: port.x, y: port.y, z: port.z },
        start: { x: start.x, y: start.y, z: start.z }, endZ: end.z,
        damageStartZ: h.z, damageEndZ: h.endZ, warning: h.warning,
        visible: hazard.userData.beam.visible };
    });
  });
  function verify(rows, count) {
    assert.equal(rows.length, count);
    for (const row of rows) {
      assert.ok(row.start.z > row.sourceZ, 'Beam starts in front of the aircraft');
      assert.ok(Math.abs(row.start.z - row.muzzle.z) < .06, 'Beam starts at the physical cannon');
      assert.ok(Math.abs(row.start.x - row.muzzle.x) < .07, 'Cannon and beam share their horizontal position');
      assert.ok(Math.abs(row.start.y - row.muzzle.y) < .2, 'Cannon and beam share their height');
      assert.ok(Math.abs(row.start.z - row.damageStartZ) < 1e-6, 'Rendered and damage origins match');
      assert.ok(Math.abs(row.endZ - row.damageEndZ) < 1e-6, 'Rendered and damage endpoints match');
    }
  }
  await page.waitForFunction(() => window.__STAR_RIFT__.renderer.entities.size > 0);
  let rows = await geometry(); verify(rows, 1); assert.equal(rows[0].visible, false);
  report.checks.push({ name: 'normal enemy warning is attached to the front cannon', rows });
  await page.waitForFunction(() => window.__STAR_RIFT__.game.hazards.some(h => h.warning <= 0));
  rows = await geometry(); verify(rows, 1); assert.equal(rows[0].visible, true);
  report.checks.push({ name: 'active beam follows aircraft movement and retains matching damage bounds', rows });
  await page.screenshot({ path: fileURLToPath(new URL('laser-front-fixed.png', output)) });
  await page.evaluate(() => {
    const g = window.__STAR_RIFT__.game, e = g.enemies.find(e => e.type === 'laser');
    g.damageEnemy(e, e.hp);
  });
  await page.waitForFunction(() => window.__STAR_RIFT__.game.hazards.length === 0 &&
    ![...window.__STAR_RIFT__.renderer.entities.keys()].some(key => key.startsWith('h')));
  report.checks.push({ name: 'destroyed emitter leaves no hazardous or visible ghost beam' });
  await page.evaluate(() => {
    const g = window.__STAR_RIFT__.game;
    g.nextSector(); const node = g.map.nodes.find(n => n.type === 'boss');
    g.currentNode = node.id; g.enterCombat(node); g.autoFire = false; g.player.x = 10;
    const e = g.boss; e.hp = e.maxHp * .2; e.phase = 3; e.enter = 0; e.fire = 0; e.attack = 2;
    g.updateBoss(e, 0); e.fire = 100;
  });
  await page.waitForFunction(() => window.__STAR_RIFT__.game.hazards.length === 3 &&
    window.__STAR_RIFT__.game.hazards.every(h => h.warning <= 0));
  rows = await geometry(); verify(rows, 3);
  report.checks.push({ name: 'all three Boss beams originate from physical forward cannons', rows });
  await page.screenshot({ path: fileURLToPath(new URL('boss-laser-muzzles.png', output)) });
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.status = 'failed'; report.error = error.stack; throw error;
} finally {
  await writeFile(new URL('laser-report.json', output), JSON.stringify(report, null, 2));
  await browser.close();
}
