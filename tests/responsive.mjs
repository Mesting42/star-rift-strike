import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../test-results/', import.meta.url);
await mkdir(output, { recursive: true });
const url = process.env.GAME_URL || 'http://127.0.0.1:5173/';
const report = { url, checks: [], layouts: [], errors: [] };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
let page;
const pass = (name, detail = {}) => { report.checks.push({ name, ...detail }); console.log(`PASS ${name}`); };
const mode = name => page.waitForFunction(name => window.__STAR_RIFT__.game.mode === name, name);
const screenshot = name => page.screenshot({ path: fileURLToPath(new URL(name, output)) });
const tapAction = (action, value) => page.locator(`[data-action="${action}"]${value == null ? '' : `[data-value="${value}"]`}`).first().tap();
const center = async selector => {
  const bounds = await page.locator(selector).first().boundingBox();
  assert.ok(bounds, `visible touch target ${selector}`);
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
};
async function layout(scene, touch, strict = false) {
  const metrics = await page.evaluate(() => {
    const visible = el => Boolean(el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden';
    const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const controls = [...document.querySelectorAll('#ui button:not(:disabled), #ui .map-node.available .node-target, #touch-controls button')]
      .filter(visible).map(el => ({ action: el.dataset.action || el.dataset.touchAction || 'map', ...rect(el) }));
    const overlaps = [];
    const canvas = document.getElementById('world');
    const battlefield = rect(canvas);
    for (const el of document.querySelectorAll('#touch-controls button')) if (visible(el)) {
      const r = rect(el);
      if (r.x < battlefield.right && r.right > battlefield.x && r.y < battlefield.bottom && r.bottom > battlefield.y) overlaps.push(el.className);
    }
    const { game, renderer } = window.__STAR_RIFT__;
    renderer.scene.updateMatrixWorld(true); renderer.camera.updateMatrixWorld(true);
    const corners = [[-10.6, -13.5], [10.6, -13.5], [-10.6, 14.5], [10.6, 14.5]].map(([x, z]) => {
      const v = renderer.player.position.clone().set(x, .35, z).project(renderer.camera);
      return { x: v.x, y: v.y };
    });
    return { width: innerWidth, height: innerHeight, rootWidth: document.getElementById('ui').scrollWidth,
      bodyWidth: document.documentElement.scrollWidth, bodyHeight: document.documentElement.scrollHeight,
      mode: game.mode, controls, overlaps, battlefield, corners,
      pixelRatio: renderer.renderer.getPixelRatio(), bufferPixels: canvas.width * canvas.height,
      quality: renderer.quality, deviceRatio: devicePixelRatio,
      bossHUD: visible(document.getElementById('boss-hud') || document.createElement('div')) ? rect(document.getElementById('boss-hud')) : null,
      safeLeft: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-left')) || 0,
      safeRight: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-right')) || 0 };
  });
  assert.ok(metrics.rootWidth <= metrics.width + 1, `${scene} horizontal UI overflow`);
  assert.ok(metrics.bodyWidth <= metrics.width + 1 && metrics.bodyHeight <= metrics.height + 1, `${scene} document overflow`);
  for (const control of metrics.controls) {
    assert.ok(control.x >= -1 && control.right <= metrics.width + 1, `${scene} horizontal clipping ${control.action}`);
    if (strict) assert.ok(control.y >= -1 && control.bottom <= metrics.height + 1, `${scene} vertical clipping ${control.action}`);
    if (touch) assert.ok(control.width >= 43 && control.height >= 43, `${scene} small touch target ${control.action}: ${control.width}×${control.height}`);
    if (touch) assert.ok(control.x >= metrics.safeLeft - 1 && control.right <= metrics.width - metrics.safeRight + 1, `${scene} control inside notch region`);
  }
  if (['combat', 'boss'].includes(scene) && touch) {
    assert.equal(await page.locator('.touch-stick').count(), 0, 'no movement wheel is rendered');
    assert.deepEqual(metrics.overlaps, [], 'controls do not cover the battlefield');
    assert.ok(metrics.battlefield.width >= 200 && metrics.battlefield.height >= 210, 'usable battlefield size');
    const pixelBudget = { high: 6000000, balanced: 3200000, smooth: 1600000 }[metrics.quality];
    assert.ok(pixelBudget && metrics.bufferPixels <= pixelBudget, 'mobile drawing buffer stays within selected quality budget');
    assert.ok(metrics.pixelRatio <= metrics.deviceRatio, 'drawing buffer does not exceed native screen density');
    if (metrics.quality === 'high' && metrics.deviceRatio === 3 && metrics.battlefield.width * metrics.battlefield.height <= 6000000 / 9)
      assert.equal(metrics.pixelRatio, 3, 'HD uses native 3x screen density within its budget');
  }
  if (['combat', 'boss'].includes(scene)) for (const corner of metrics.corners) {
    assert.ok(Math.abs(corner.x) < 1 && Math.abs(corner.y) < 1, 'all playable coordinates remain visible');
  }
  if (scene === 'boss' && touch) {
    assert.ok(metrics.bossHUD, 'Boss status visible');
    assert.ok(metrics.bossHUD.x >= metrics.battlefield.x && metrics.bossHUD.right <= metrics.battlefield.right, 'Boss HUD fits the flight surface');
  }
  if (!strict) {
    const last = page.locator('#ui button:not(:disabled)').last();
    if (await last.count()) {
      await last.scrollIntoViewIfNeeded();
      const box = await last.boundingBox();
      assert.ok(box.y >= -1 && box.y + box.height <= metrics.height + 1, `${scene} final action is reachable by scrolling`);
    }
  }
  report.layouts.push({ scene, touch, viewport: `${metrics.width}×${metrics.height}`, controls: metrics.controls.length,
    battlefield: scene === 'combat' ? metrics.battlefield : undefined });
}

async function enterNormalShop() {
  const route = () => page.evaluate(() => {
    const g = window.__STAR_RIFT__.game, nodes = new Map(g.map.nodes.map(n => [n.id, n]));
    const paths = [[g.currentNode]], seen = new Set([g.currentNode]);
    for (const path of paths) {
      const current = nodes.get(path.at(-1));
      if (current.type === 'shop') return path.slice(1);
      for (const id of current.neighbors) if (!seen.has(id) && ['entry', 'reward', 'event', 'shop'].includes(nodes.get(id).type)) {
        seen.add(id); paths.push([...path, id]);
      }
    }
    return null;
  });
  let path = await route();
  for (let i = 0; !path && i < 30; i++) {
    await tapAction('pause'); await mode('pause'); await tapAction('restart'); await mode('map'); path = await route();
  }
  assert.ok(path, 'normal random map has a supply route');
  for (const node of path) {
    const target = await center(`[data-action="chooseNode"][data-value="${node}"] .node-target`);
    await page.touchscreen.tap(target.x, target.y);
    for (let i = 0; i < 5; i++) {
      const state = await page.evaluate(() => ({ mode: window.__STAR_RIFT__.game.mode, event: window.__STAR_RIFT__.game.eventData }));
      if (['map', 'shop'].includes(state.mode)) break;
      if (state.mode === 'event') await tapAction('chooseEvent', state.event.choices.findIndex(choice => !choice.disabled));
      else if (state.mode === 'reward') await tapAction('takeReward', 0);
      else throw new Error(`Unexpected normal route mode ${state.mode}`);
    }
  }
  await mode('shop');
}

async function liveTouchTest() {
  await tapAction('start'); await mode('map'); await enterNormalShop();
  const offer = await page.evaluate(() => {
    const g = window.__STAR_RIFT__.game;
    return g.offers.findIndex(o => o.kind === 'weapon' && o.cost <= g.money && !o.sold);
  });
  assert.ok(offer >= 0);
  const before = await page.evaluate(() => window.__STAR_RIFT__.game.money);
  await tapAction('buy', offer);
  assert.ok(await page.evaluate(before => window.__STAR_RIFT__.game.money < before, before));
  await tapAction('continue'); await mode('map');
  await tapAction('inventory'); await mode('inventory'); await tapAction('back'); await mode('map');
  const combatPath = await page.evaluate(() => {
    const g = window.__STAR_RIFT__.game, nodes = new Map(g.map.nodes.map(n => [n.id, n]));
    const paths = [[g.currentNode]], seen = new Set([g.currentNode]);
    for (const path of paths) {
      const current = nodes.get(path.at(-1));
      if (current.type === 'combat' && !current.cleared) return path.slice(1);
      for (const id of current.neighbors) if (!seen.has(id) && ['entry', 'reward', 'event', 'shop', 'combat'].includes(nodes.get(id).type)) {
        seen.add(id); paths.push([...path, id]);
      }
    }
    return null;
  });
  assert.ok(combatPath, 'normal graph has a combat route');
  for (const id of combatPath) {
    const node = await center(`[data-action="chooseNode"][data-value="${id}"] .node-target`);
    await page.touchscreen.tap(node.x, node.y);
    for (let i = 0; i < 5; i++) {
      const state = await page.evaluate(() => ({ mode: window.__STAR_RIFT__.game.mode, event: window.__STAR_RIFT__.game.eventData }));
      if (['map', 'combat'].includes(state.mode)) break;
      if (state.mode === 'event') await tapAction('chooseEvent', state.event.choices.findIndex(choice => !choice.disabled));
      else if (state.mode === 'reward') await tapAction('takeReward', 0);
      else if (state.mode === 'shop') await tapAction('continue');
      else throw new Error(`Unexpected combat route mode ${state.mode}`);
    }
  }
  await mode('combat');
  await page.waitForSelector('#touch-controls:not([hidden])');
  await layout('combat', true, true);
  pass('normal touch menu, route, interlude, actual shop purchase, inventory and combat entry');
  const cdp = await page.context().newCDPSession(page), fingers = new Map();
  const dispatch = type => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...fingers].map(([id, p]) => ({ id, ...p, radiusX: 3, radiusY: 3, force: 1 })) });
  const down = async (id, p) => { fingers.set(id, p); await dispatch('touchStart'); };
  const move = async (id, p) => { fingers.set(id, p); await dispatch('touchMove'); };
  // This Chromium's touchEnd payload describes the released sources, rather
  // than the stationary fingers. An empty payload ends the entire sequence.
  const up = async id => {
    const p = fingers.get(id); fingers.delete(id);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ id, ...p, radiusX: 3, radiusY: 3, force: 1 }] });
  };
  const tap = async selector => { await down(2, await center(selector)); await up(2); };
  const flight = await page.locator('#world').boundingBox();
  const anchor = { x: flight.x + flight.width * .3, y: flight.y + flight.height * .6 };
  await page.evaluate(() => {
    const g = window.__STAR_RIFT__.game, original = g.onEvent;
    window.__touchFireCount = 0;
    window.__touchEvents = [];
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'lostpointercapture']) document.addEventListener(type,
      event => window.__touchEvents.push({ type, id: event.pointerId, target: event.target.className?.baseVal || event.target.className }), true);
    const logResize = event => window.__touchEvents.push({ type: event.type, width: innerWidth, height: innerHeight, visual: visualViewport.height });
    window.addEventListener('resize', logResize); visualViewport.addEventListener('resize', logResize); window.addEventListener('blur', logResize);
    g.onEvent = (type, value) => { if (type === 'sound' && value === 'fire') window.__touchFireCount++; original(type, value); };
  });
  const position = () => page.evaluate(() => ({ x: window.__STAR_RIFT__.game.player.x, z: window.__STAR_RIFT__.game.player.z }));
  const initial = await position();
  await down(1, anchor); await page.waitForTimeout(80); assert.deepEqual(await position(), initial);
  pass('touching an arbitrary battlefield point does not teleport the aircraft');
  await move(1, { x: anchor.x + 36, y: anchor.y }); await page.waitForTimeout(240);
  const right = await position(); assert.ok(right.x > initial.x + .5);
  await move(1, anchor); await page.waitForTimeout(240); assert.ok((await position()).x < right.x - .5);
  const beforeUp = await position();
  await move(1, { x: anchor.x, y: anchor.y - 32 }); await page.waitForTimeout(240);
  const upwards = await position(); assert.ok(upwards.z < beforeUp.z - .5);
  await move(1, anchor); await page.waitForTimeout(240); assert.ok((await position()).z > upwards.z + .5);
  pass('relative screen dragging moves right, left, up and down');
  await move(1, { x: anchor.x + 36, y: anchor.y }); await page.waitForTimeout(340);
  const stoppedFinger = await position(); await page.waitForTimeout(160); assert.deepEqual(await position(), stoppedFinger);
  pass('a stationary drag finger stops the ship after it reaches the target');
  await down(3, { x: anchor.x + 100, y: anchor.y - 70 });
  await move(3, { x: anchor.x + 130, y: anchor.y - 95 }); await page.waitForTimeout(100);
  assert.deepEqual(await position(), stoppedFinger); await up(3);
  assert.equal(await page.locator('#world.dragging').count(), 1);
  pass('a second battlefield finger cannot steal the active movement gesture');
  await tap('[data-touch-action="dash"]');
  assert.ok(await page.evaluate(() => {
    const g = window.__STAR_RIFT__.game; return g.dashCooldown > 0 && g.dashDirection.x > .9;
  }));
  assert.equal(await page.locator('#world.dragging').count(), 1);
  pass('a second finger triggers directional dash while the movement finger stays captured');
  await page.waitForTimeout(440); const afterDash = await position();
  await page.waitForTimeout(160); assert.deepEqual(await position(), afterDash);
  pass('dash completion rebases dragging and does not pull the ship back');
  const weaponIndex = await page.evaluate(() => window.__STAR_RIFT__.game.weaponIndex);
  await tap('[data-touch-action="nextWeapon"]');
  assert.notEqual(await page.evaluate(() => window.__STAR_RIFT__.game.weaponIndex), weaponIndex);
  assert.equal(await page.locator('#world.dragging').count(), 1);
  await tap('[data-touch-action="useSkill"]');
  assert.ok(await page.evaluate(() => window.__STAR_RIFT__.game.skillCooldown > 0));
  pass('weapon switching and active skill keep movement intact across HUD re-renders');
  await up(1); await page.waitForTimeout(450);
  const releasedX = await page.evaluate(() => window.__STAR_RIFT__.game.player.x);
  await page.waitForTimeout(140);
  assert.equal(await page.evaluate(() => window.__STAR_RIFT__.game.player.x), releasedX);
  await tap('[data-touch-action="precision"]'); await page.waitForTimeout(60);
  assert.equal(await page.locator('[data-touch-action="precision"]').getAttribute('aria-pressed'), 'true');
  assert.ok(await page.evaluate(() => window.__STAR_RIFT__.game.precision));
  await tap('[data-touch-action="precision"]');
  await tap('[data-touch-action="auto"]');
  assert.equal(await page.evaluate(() => window.__STAR_RIFT__.game.autoFire), false);
  await page.waitForTimeout(150);
  const shots = await page.evaluate(() => window.__touchFireCount);
  await down(1, anchor); await move(1, { x: anchor.x - 34, y: anchor.y });
  await down(2, await center('[data-touch-action="fire"]')); await page.waitForTimeout(420);
  assert.ok(await page.evaluate(shots => window.__touchFireCount > shots, shots));
  await up(2);
  assert.equal(await page.locator('#world.dragging').count(), 1);
  const stoppedShots = await page.evaluate(() => window.__touchFireCount);
  await page.waitForTimeout(160);
  assert.equal(await page.evaluate(() => window.__touchFireCount), stoppedShots);
  pass('manual held fire works alongside movement and releasing the firing finger preserves movement');
  await down(2, await center('[data-touch-action="fire"]'));
  fingers.clear(); await dispatch('touchCancel'); await page.waitForTimeout(80);
  assert.equal(await page.locator('#world.dragging,.touch-fire.held').count(), 0);
  const cancelX = await page.evaluate(() => window.__STAR_RIFT__.game.player.x);
  await page.waitForTimeout(160);
  assert.equal(await page.evaluate(() => window.__STAR_RIFT__.game.player.x), cancelX);
  pass('pointer cancellation clears movement and held fire without sticking');
  await down(1, anchor); await move(1, { x: anchor.x + 30, y: anchor.y });
  await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(180);
  assert.equal(await page.locator('#world.dragging,.touch-fire.held').count(), 0);
  await up(1); await layout('combat', true, true); await screenshot('responsive-phone-landscape.png');
  pass('rotation retains the current run, releases old captures and fits the battlefield');
  await tapAction('pause'); await mode('pause');
  const paused = await page.evaluate(() => window.__STAR_RIFT__.game.combatTime);
  await page.waitForTimeout(160);
  assert.equal(await page.evaluate(() => window.__STAR_RIFT__.game.combatTime), paused);
  assert.equal(await page.locator('#touch-controls').isVisible(), false);
  await tapAction('resume'); await mode('combat');
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(120);
  await screenshot('responsive-phone-portrait.png');
  pass('touch pause freezes combat, hides controls and resumes without restarting');
}

// Display fixtures inspect every menu at many dimensions. These are independent
// of the normal-input gameplay test above and never claim a completed run.
async function fixture(scene) {
  await page.evaluate(async scene => {
    const g = window.__STAR_RIFT__.game;
    const { WEAPONS, ITEMS } = await import('/src/content.js');
    g.start(57419); g.weapons = WEAPONS.slice(0, 4).map(w => w.id); g.items = ITEMS.slice(0, 5).map(i => i.id); g.money = 180;
    if (scene === 'combat' || scene === 'boss') {
      if (scene === 'boss') g.nextSector();
      const n = g.map.nodes.find(n => n.type === scene); g.currentNode = n.id; g.enterCombat(n); g.pause();
      g.mode = 'combat'; g.uiVersion++; g.waveAt = 100; g.environmentTimer = 100;
      if (g.boss) { g.boss.hp = g.boss.maxHp * .2; g.boss.phase = 3; g.boss.fire = 100; }
    } else if (scene === 'shop') { const n = g.map.nodes.find(n => n.type === 'shop'); g.currentNode = n.id; g.openShop(n); }
    else if (scene === 'reward') g.showReward();
    else if (scene === 'event') g.openEvent(g.map.nodes.find(n => n.type === 'event'));
    else if (scene === 'pause') g.pause();
    else g.screen(scene);
  }, scene);
  await mode(scene === 'boss' ? 'combat' : scene); await page.waitForTimeout(100);
}

async function dragAtCurrentSize() {
  const box = await page.locator('#world').boundingBox();
  const origin = { x: box.x + box.width * .3, y: box.y + box.height * .65 };
  const delta = { x: 34, y: -24 };
  const expected = await page.evaluate(delta => {
    const { game, renderer } = window.__STAR_RIFT__;
    return { x: game.player.x, z: game.player.z, ...{ displacement: renderer.screenDeltaToWorld(delta.x, delta.y) } };
  }, delta);
  const session = await page.context().newCDPSession(page);
  const point = { id: 5, ...origin, radiusX: 3, radiusY: 3, force: 1 };
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await page.waitForTimeout(60);
  assert.deepEqual(await page.evaluate(() => ({ x: window.__STAR_RIFT__.game.player.x, z: window.__STAR_RIFT__.game.player.z })), { x: expected.x, z: expected.z });
  point.x += delta.x; point.y += delta.y;
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
  await page.waitForFunction(expected => {
    const p = window.__STAR_RIFT__.game.player;
    return Math.abs(p.x - expected.x - expected.displacement.x) < .02 && Math.abs(p.z - expected.z - expected.displacement.z) < .02;
  }, expected);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [point] });
  assert.equal(await page.locator('#world.dragging').count(), 0);
  await session.detach();
  pass(`screen dragging matches the rendered flight plane at ${await page.evaluate(() => `${innerWidth}×${innerHeight}`)}`);
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(url); await page.waitForFunction(() => Boolean(window.__STAR_RIFT__));
  await liveTouchTest();
  const sizes = [[320, 568], [390, 844], [430, 932], [844, 390], [768, 1024], [1024, 768]];
  const scenes = ['menu', 'map', 'combat', 'boss', 'pause', 'shop', 'reward', 'event', 'inventory', 'help', 'settings', 'win', 'dead'];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    for (const scene of scenes) {
      await fixture(scene); await layout(scene, true, ['menu', 'map', 'combat', 'boss', 'pause'].includes(scene));
      if (scene === 'combat') await dragAtCurrentSize();
      if (width === 768 && scene === 'combat') await screenshot('responsive-tablet-portrait.png');
      if (width === 1024 && scene === 'combat') await screenshot('responsive-tablet-landscape.png');
    }
    pass(`touch layout matrix ${width}×${height}`, { scenes: scenes.length });
  }
  // Emulate notches and home-indicator insets as CSS variables to verify that
  // every combat control and the actual canvas remain inside the usable area.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const s = document.documentElement.style;
    s.setProperty('--safe-top', '44px'); s.setProperty('--safe-bottom', '34px');
  });
  await fixture('combat'); await page.evaluate(() => window.__STAR_RIFT__.renderer.resize());
  await layout('combat', true, true); pass('portrait notch and home indicator retain visible controls and play area');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => {
    const s = document.documentElement.style;
    s.setProperty('--safe-top', '0px'); s.setProperty('--safe-bottom', '21px');
    s.setProperty('--safe-left', '44px'); s.setProperty('--safe-right', '44px');
  });
  for (const scene of scenes) {
    await fixture(scene); await page.evaluate(() => window.__STAR_RIFT__.renderer.resize());
    await layout(scene, true, ['menu', 'map', 'combat', 'boss', 'pause'].includes(scene));
  }
  pass('landscape notches do not clip combat, Boss HUD or menu controls');
  await context.close();

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: false });
  page = await desktop.newPage(); page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(url); await page.waitForFunction(() => Boolean(window.__STAR_RIFT__));
  for (const [width, height] of [[1024, 768], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    for (const scene of scenes) { await fixture(scene); await layout(scene, false, ['menu', 'map', 'combat', 'boss', 'pause'].includes(scene)); }
    pass(`desktop layout matrix ${width}×${height}`, { scenes: scenes.length });
  }
  assert.equal(await page.locator('#touch-controls').isVisible(), false);
  await desktop.close(); assert.deepEqual(report.errors, []);
  const previewImages = await Promise.all(['responsive-phone-portrait.png', 'responsive-tablet-landscape.png'].map(name => readFile(new URL(name, output))));
  const preview = await browser.newContext({ viewport: { width: 1000, height: 734 }, deviceScaleFactor: 1 });
  const previewPage = await preview.newPage();
  await previewPage.setContent(`<html lang="zh-CN"><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;padding:22px;background:#0b1c24;color:#d7e0d5;font:14px "Microsoft YaHei",sans-serif}
    header{font-size:17px;margin-bottom:18px}main{display:flex;gap:24px}h2{font-size:12px;font-weight:400;margin:0 0 12px}
    img{display:block;border:1px solid #536a71}.phone img{width:286px}.tablet img{width:646px}p{color:#93aab3;font-size:11px;line-height:1.9;margin-top:16px}
    </style><header>STAR RIFT · 手机与平板直接拖动操作</header><main>
    <section class="phone"><h2>手机竖屏 · 两行紧凑按钮</h2><img src="data:image/png;base64,${previewImages[0].toString('base64')}"></section>
    <section class="tablet"><h2>平板横屏 · 一行操作按钮</h2><img src="data:image/png;base64,${previewImages[1].toString('base64')}"><p>按住战场任意位置并拖动，战机跟随手指位移。<br>按下不瞬移，松手即停；另一根手指可同时切武器、闪避、使用技能和开火。<br>图中为浏览器手机／平板模拟的游戏实际界面。</p></section></main></html>`);
  await previewPage.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
  await previewPage.screenshot({ path: fileURLToPath(new URL('responsive-touch-layouts.png', output)) }); await preview.close();
  report.status = 'passed'; console.log(`Responsive checks passed: ${report.checks.length}; layouts: ${report.layouts.length}`);
} catch (error) {
  report.status = 'failed'; report.error = error.stack;
  if (page && !page.isClosed()) report.touchEvents = await page.evaluate(() => window.__touchEvents || []);
  if (page && !page.isClosed()) await screenshot('responsive-failure.png').catch(() => {});
  throw error;
} finally {
  await writeFile(new URL('responsive-report.json', output), JSON.stringify(report, null, 2));
  await browser.close();
}
