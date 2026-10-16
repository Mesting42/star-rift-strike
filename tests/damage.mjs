import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../test-results/',import.meta.url);
await mkdir(output,{ recursive: true });
const report = { checks: [], errors: [] };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--enable-unsafe-swiftshader'] });
const devices = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'phone', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
];
try {
  for (const device of devices) {
    const { name, ...options } = device;
    const context = await browser.newContext(options), page = await context.newPage();
    page.on('pageerror',error => report.errors.push({ device: name, message: error.message }));
    page.on('console',message => { if (message.type() === 'error') report.errors.push({ device: name, message: message.text() }); });
    await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5174/');
    await page.waitForFunction(() => Boolean(window.__STAR_RIFT__));
    // Isolated hostile-shot reproductions advance in the actual browser frame loop.
    // Health, shields and invulnerability are set only to select the state under test.
    const arena = async (state = {}) => {
      await page.evaluate(state => {
        const g = window.__STAR_RIFT__.game; g.start(7419);
        const node = g.map.nodes.find(n => n.type === 'combat');
        g.currentNode = node.id; g.enterCombat(node); g.autoFire = false;
        g.waveAt = 100; g.environmentTimer = 100; g.obstacles = [];
        Object.assign(g.player,{ inv: 0, invReason: null, ...state });
      },state);
      await page.waitForFunction(() => document.getElementById('hud-shield')?.textContent !== '—');
    };
    const shell = async (x = .95, z = 0, damage = 12, speed = 7) => page.evaluate(({ x,z,damage,speed }) => {
      const g = window.__STAR_RIFT__.game;
      return g.bullet(g.player.x+x,g.player.z+z,0,speed,{ enemy: true, r: .22, damage }).id;
    },{ x,z,damage,speed });
    const state = () => page.evaluate(() => {
      const { game: g, renderer: r } = window.__STAR_RIFT__;
      return { hp: g.player.hp, shield: g.player.shield, inv: g.player.inv, reason: g.player.invReason,
        mode: g.mode, enemyShells: g.bullets.filter(b => b.enemy).length, hit: g.hitFeedback,
        hpText: document.getElementById('hud-hp')?.textContent,
        shieldText: document.getElementById('hud-shield')?.textContent,
        impactText: document.getElementById('hud-impact')?.textContent,
        protectionText: document.getElementById('hud-protection')?.textContent,
        forceFieldVisible: r.player.userData.shield.visible, aircraftVisible: r.player.visible,
        deflected: g.fx.some(f => f.type === 'deflect') };
    });
    const check = (label,data) => report.checks.push({ device: name, name: label, ...data });

    await arena(); const id = await shell(.95,-3);
    await page.waitForFunction(id => window.__STAR_RIFT__.renderer.entities.has(`b${id}`),id);
    const dimensions = await page.evaluate(async id => {
      const { renderer: r, game: g } = window.__STAR_RIFT__;
      const { hostileBoltShape, PLAYER_AIRFRAME } = await import('/src/collision.js');
      const b = g.bullets.find(b => b.id === id), geometry = r.entities.get(`b${id}`).children[0].geometry;
      geometry.computeBoundingBox();
      return { renderedHalfLength: geometry.boundingBox.max.y, renderedRadius: geometry.boundingBox.max.x,
        physical: hostileBoltShape(b), aircraftScale: r.player.scale.x, physicalScale: PLAYER_AIRFRAME.scale };
    },id);
    assert.ok(Math.abs(dimensions.renderedHalfLength-dimensions.physical.halfShaft-dimensions.physical.radius) < 1e-6);
    assert.ok(Math.abs(dimensions.renderedRadius-dimensions.physical.radius) < 1e-6);
    assert.equal(dimensions.aircraftScale,dimensions.physicalScale);
    check('solid cannon shell geometry and aircraft scale match the collision model',dimensions);

    await page.waitForFunction(() => window.__STAR_RIFT__.game.player.shield === 28 &&
      document.getElementById('hud-shield').textContent === '28');
    let actual = await state(); assert.equal(actual.hp,100); assert.equal(actual.enemyShells,0);
    assert.equal(actual.impactText,'护盾 −12'); assert.equal(actual.protectionText,'受击保护');
    assert.ok(actual.forceFieldVisible); assert.ok(actual.aircraftVisible);
    check('right-wing impact deducts shield and immediately updates the HUD',actual);
    await page.screenshot({ path: fileURLToPath(new URL(`damage-${name}-shield.png`,output)) });

    await shell(-.95);
    await page.waitForFunction(() => window.__STAR_RIFT__.game.bullets.every(b => !b.enemy));
    actual = await state(); assert.equal(actual.shield,28); assert.equal(actual.hp,100); assert.ok(actual.deflected);
    check('recovery protection visibly intercepts the next shell without double damage',actual);
    await page.waitForFunction(() => window.__STAR_RIFT__.game.player.inv <= 0);
    await shell(-.95);
    await page.waitForFunction(() => window.__STAR_RIFT__.game.player.shield === 16);
    actual = await state(); assert.equal(actual.hp,100); check('a shell after protection expiry damages the opposite wing',actual);

    await arena({ shield: 5 }); await shell();
    await page.waitForFunction(() => document.getElementById('hud-hp')?.textContent === '93 / 100');
    actual = await state(); assert.equal(actual.shield,0); assert.equal(actual.hp,93);
    assert.equal(actual.impactText,'护盾 −5 / 机体 −7'); check('shield depletion spills exactly the remainder into hull damage',actual);
    const layout = await page.evaluate(() => {
      const status = document.querySelector('.damage-readout').getBoundingClientRect();
      const pause = document.querySelector('.pause-icon').getBoundingClientRect();
      return { x: status.x, right: status.right, bottom: status.bottom, viewport: { width: innerWidth,height: innerHeight }, pauseX: pause.x };
    });
    assert.ok(layout.x >= 0 && layout.right <= layout.viewport.width && layout.bottom < layout.viewport.height);
    assert.ok(layout.right < layout.pauseX); check('damage feedback fits the viewport and leaves pause accessible',layout);
    await page.screenshot({ path: fileURLToPath(new URL(`damage-${name}-hull.png`,output)) });

    await arena(); await shell(0,-6,12,1200);
    await page.waitForFunction(() => window.__STAR_RIFT__.game.player.shield === 28);
    actual = await state(); assert.equal(actual.enemyShells,0); check('high-speed shell crossing between frames still hits',actual);

    for (const reason of ['entry','dash','skill']) {
      await arena();
      await page.evaluate(reason => {
        const g = window.__STAR_RIFT__.game;
        if (reason === 'entry') g.protect(1.8,'entry');
        if (reason === 'dash') g.dash({ right: true });
        if (reason === 'skill') { g.skill = 'shield'; g.useSkill(); }
        g.bullet(g.player.x+.95,g.player.z,0,7,{ enemy: true,r: .22,damage: 12 });
      },reason);
      await page.waitForFunction(() => window.__STAR_RIFT__.game.bullets.every(b => !b.enemy) &&
        document.getElementById('hud-protection')?.textContent);
      actual = await state(); assert.equal(actual.shield,40); assert.equal(actual.hp,100);
      assert.equal(actual.reason,reason); assert.ok(actual.forceFieldVisible); assert.ok(actual.deflected);
      check(`${reason} protection is visible and intercepts cannon shells`,actual);
    }

    await arena(); await shell(1.65,.6);
    await page.waitForTimeout(350);
    actual = await state(); assert.equal(actual.shield,40); assert.equal(actual.hp,100); assert.equal(actual.hit,null);
    check('glow grazing the outside of a wing causes no false damage',actual);
    await arena({ shield: 0,hp: 4 }); await shell();
    await page.waitForFunction(() => window.__STAR_RIFT__.game.mode === 'dead');
    actual = await state(); assert.equal(actual.hp,0); check('lethal cannon hit opens the defeat result',actual);
    await context.close();
  }
  assert.deepEqual(report.errors,[]); report.status = 'passed';
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, errors: report.errors },null,2));
} catch (error) { report.status = 'failed'; report.error = error.stack; throw error; }
finally {
  await writeFile(new URL('damage-report.json',output),JSON.stringify(report,null,2));
  await browser.close();
}
