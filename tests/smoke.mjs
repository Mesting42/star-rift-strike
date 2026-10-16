import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../test-results/', import.meta.url);
await mkdir(output, { recursive: true });
const report = { started: new Date().toISOString(), url: process.env.GAME_URL || 'http://127.0.0.1:5173/', checks: [], layouts: [], browserErrors: [], screenshots: [] };
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
let page;
const check = (label, detail = {}) => { report.checks.push({ label, ...detail }); console.log(`PASS ${label}`); };
const snapshot = () => page.evaluate(() => window.__STAR_RIFT__.snapshot());
const mode = expected => page.waitForFunction(value => window.__STAR_RIFT__.game.mode === value, expected);
const click = async (action, value) => {
  const selector = `[data-action="${action}"]${value == null ? '' : `[data-value="${value}"]`}`;
  await page.locator(selector).first().click();
};
const screenshot = async filename => {
  await page.screenshot({ path: fileURLToPath(new URL(filename, output)) });
  report.screenshots.push(filename);
};
const layout = async (label, strictButtons = false) => {
  const metrics = await page.evaluate(() => {
    const actions = [...document.querySelectorAll('#ui button:not(:disabled), #ui [role="button"][data-action]')]
      .filter(el => !el.closest('[hidden]') && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none')
      .map(el => {
        const r = el.getBoundingClientRect();
        return { label: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 70), action: el.dataset.action, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      });
    return { width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight,
      rootWidth: document.querySelector('#ui').scrollWidth, actions };
  });
  assert.ok(metrics.documentWidth <= metrics.width + 1, `${label}: document horizontal overflow ${metrics.documentWidth} > ${metrics.width}`);
  assert.ok(metrics.documentHeight <= metrics.height + 1, `${label}: page overflow ${metrics.documentHeight} > ${metrics.height}`);
  assert.ok(metrics.rootWidth <= metrics.width + 1, `${label}: UI horizontal overflow ${metrics.rootWidth} > ${metrics.width}`);
  for (const action of metrics.actions) {
    assert.ok(action.width > 0 && action.height > 0, `${label}: zero-size control ${action.label}`);
    assert.ok(action.left >= -1 && action.right <= metrics.width + 1, `${label}: horizontal control clipping ${action.label}: ${action.left} / ${action.right}`);
    if (strictButtons) assert.ok(action.top >= -1 && action.bottom <= metrics.height + 1, `${label}: vertical control clipping ${action.label}: ${action.top} / ${action.bottom}`);
  }
  report.layouts.push({ label, viewport: `${metrics.width}×${metrics.height}`, controls: metrics.actions.length, overflow: false });
  check(`${label} layout`, { controls: metrics.actions.length });
};
const viewports = [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }];
const viewportMatrix = async (scene, strictButtons = false) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(150);
    await layout(`${scene} ${viewport.width}×${viewport.height}`, strictButtons);
    if (viewport.width === 390 && ['menu', 'map'].includes(scene)) await screenshot(`smoke-mobile-${scene}.png`);
  }
  await page.setViewportSize(viewports[0]);
};
// Read the generated graph, then navigate through the same visible route controls as a player.
// There are no direct game-state writes, debug grants, skips or fixture replacements.
const safeShopPath = () => page.evaluate(() => {
  const game = window.__STAR_RIFT__.game;
  const safe = new Set(['entry', 'reward', 'event', 'shop']);
  const nodes = new Map(game.map.nodes.map(node => [node.id, node]));
  const paths = [[game.currentNode]], seen = new Set([game.currentNode]);
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i], current = nodes.get(path.at(-1));
    if (current.type === 'shop') return { seed: game.seed, path: path.slice(1) };
    for (const id of current.neighbors) if (!seen.has(id) && safe.has(nodes.get(id)?.type)) {
      seen.add(id); paths.push([...path, id]);
    }
  }
  return null;
});
const resolveInterlude = async () => {
  for (let step = 0; step < 5; step++) {
    const state = await page.evaluate(() => {
      const g = window.__STAR_RIFT__.game;
      return { mode: g.mode, event: g.eventData, choices: g.choices, items: g.items.length, weapons: g.weapons.length, money: g.money };
    });
    if (['map', 'shop'].includes(state.mode)) return;
    if (state.mode === 'event') {
      const index = state.event.choices.findIndex(choice => !choice.disabled);
      assert.ok(index >= 0, 'event has a usable choice');
      await click('chooseEvent', index);
      check('normal event choice', { title: state.event.title, index });
    } else if (state.mode === 'reward') {
      const index = Math.max(0, state.choices.findIndex(choice => choice.kind === 'weapon' || choice.kind === 'item'));
      await click('takeReward', index);
      await mode('map');
      const after = await snapshot();
      assert.ok(after.items.length > state.items || after.weapons.length > state.weapons || after.money > state.money, 'reward changes the real loadout or resources');
      check('actual reward acquisition', { kind: state.choices[index].kind, id: state.choices[index].id });
    } else throw new Error(`Unexpected scene on safe supply route: ${state.mode}`);
  }
  throw new Error('Interlude did not complete');
};

try {
  page = await browser.newPage({ viewport: viewports[0] });
  page.on('pageerror', error => report.browserErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('favicon')) report.browserErrors.push(message.text()); });
  await page.goto(report.url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__STAR_RIFT__), { timeout: 30000 });
  await mode('menu');
  assert.match(await page.locator('h1').textContent(), /STAR.*RIFT/s);
  check('title and game initialized');
  await viewportMatrix('menu', true);

  await click('help');
  await mode('help');
  assert.match(await page.locator('.controls-table').textContent(), /SHIFT/);
  assert.match(await page.locator('.controls-table').textContent(), /CTRL/);
  await viewportMatrix('help');
  await click('back');
  await mode('menu');
  check('help opens and returns');

  await click('settings');
  await mode('settings');
  const music = page.locator('input[data-action="volumeMusic"]');
  await music.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 22; i++) await page.keyboard.press('ArrowRight');
  const sfx = page.locator('input[data-action="volumeSfx"]');
  await sfx.focus();
  await page.keyboard.press('End');
  for (let i = 0; i < 32; i++) await page.keyboard.press('ArrowLeft');
  const volume = await page.evaluate(() => ({ ...window.__STAR_RIFT__.game.volume }));
  assert.ok(Math.abs(volume.music - .22) < .02, `music slider applies: ${volume.music}`);
  assert.ok(Math.abs(volume.sfx - .68) < .02, `sound slider applies: ${volume.sfx}`);
  await viewportMatrix('settings');
  await click('back');
  await mode('menu');
  check('settings sliders change actual volume and return', volume);

  await click('start');
  await mode('map');
  await viewportMatrix('map', true);
  let path = await safeShopPath();
  for (let attempt = 0; !path && attempt < 24; attempt++) {
    await click('pause'); await mode('pause');
    await click('restart'); await mode('map');
    path = await safeShopPath();
  }
  assert.ok(path, 'new games produce a normally navigable short supply route');
  check('random new game and supply route', path);
  for (const node of path.path) {
    await click('chooseNode', node);
    await resolveInterlude();
  }
  await mode('shop');
  await viewportMatrix('shop');
  const beforeBuy = await page.evaluate(() => {
    const g = window.__STAR_RIFT__.game;
    return { money: g.money, weapons: [...g.weapons], offers: g.offers };
  });
  const purchase = beforeBuy.offers.findIndex(offer => offer.kind === 'weapon' && !offer.sold && offer.cost <= beforeBuy.money);
  assert.ok(purchase >= 0, 'shop offers an affordable weapon');
  await click('buy', purchase);
  const afterBuy = await page.evaluate(() => {
    const g = window.__STAR_RIFT__.game;
    return { money: g.money, weapons: [...g.weapons], sold: g.offers.map(offer => offer.sold) };
  });
  assert.equal(afterBuy.money, beforeBuy.money - beforeBuy.offers[purchase].cost);
  assert.ok(afterBuy.weapons.includes(beforeBuy.offers[purchase].id));
  assert.equal(afterBuy.sold[purchase], true);
  assert.ok(await page.locator(`[data-action="buy"][data-value="${purchase}"]`).isDisabled());
  check('actual purchase spends money and equips weapon', { id: beforeBuy.offers[purchase].id, moneyBefore: beforeBuy.money, moneyAfter: afterBuy.money });
  await click('continue'); await mode('map');

  await click('inventory'); await mode('inventory');
  assert.equal(await page.locator('.loadout-weapon').count(), afterBuy.weapons.length);
  await viewportMatrix('inventory');
  const inventoryWeapon = await page.evaluate(() => {
    const g = window.__STAR_RIFT__.game;
    return (g.weaponIndex + 1) % g.weapons.length;
  });
  await click('switchWeapon', inventoryWeapon);
  assert.equal(await page.evaluate(() => window.__STAR_RIFT__.game.weaponIndex), inventoryWeapon);
  await click('back'); await mode('map');
  check('inventory reflects purchased weapons and switches active weapon');
  await click('pause'); await mode('pause');
  await viewportMatrix('pause', true);
  await click('resume'); await mode('map');
  check('map pause and resume');

  const combatPath = await page.evaluate(() => {
    const g = window.__STAR_RIFT__.game, nodes = new Map(g.map.nodes.map(n => [n.id, n]));
    const paths = [[g.currentNode]], seen = new Set([g.currentNode]);
    for (const path of paths) {
      const current = nodes.get(path.at(-1));
      if (['combat', 'elite'].includes(current.type) && !current.cleared) return path.slice(1);
      for (const id of current.neighbors) if (!seen.has(id) && ['entry', 'reward', 'event', 'shop', 'combat', 'elite'].includes(nodes.get(id).type)) {
        seen.add(id); paths.push([...path, id]);
      }
    }
    return null;
  });
  assert.ok(combatPath, 'a normal combat route is accessible');
  for (const node of combatPath) {
    await click('chooseNode', node);
    const currentMode = (await snapshot()).mode;
    if (currentMode === 'combat') break;
    if (currentMode === 'shop') await click('continue');
    else await resolveInterlude();
  }
  await mode('combat');
  await page.waitForTimeout(500);
  const autoBefore = await page.evaluate(() => window.__STAR_RIFT__.game.autoFire);
  await page.keyboard.press('f');
  assert.notEqual(await page.evaluate(() => window.__STAR_RIFT__.game.autoFire), autoBefore);
  await page.keyboard.press('f');
  const weaponBefore = await page.evaluate(() => window.__STAR_RIFT__.game.weaponIndex);
  const combatWeaponCount = await page.evaluate(() => window.__STAR_RIFT__.game.weapons.length);
  await page.keyboard.press('q');
  assert.equal(await page.evaluate(() => window.__STAR_RIFT__.game.weaponIndex), (weaponBefore + 1) % combatWeaponCount);
  await page.keyboard.press('Shift');
  assert.ok(await page.evaluate(() => window.__STAR_RIFT__.game.dashCooldown > 0));
  await page.keyboard.press('e');
  assert.ok(await page.evaluate(() => window.__STAR_RIFT__.game.skillCooldown > 0));
  await page.keyboard.press('Escape'); await mode('pause');
  const pausedTime = (await snapshot()).elapsed;
  await page.waitForTimeout(350);
  assert.equal((await snapshot()).elapsed, pausedTime);
  await click('resume'); await mode('combat');
  await page.waitForTimeout(250);
  assert.ok((await snapshot()).elapsed > pausedTime);
  await layout('combat 1440×900', true);
  await page.keyboard.press('Digit1');
  assert.equal(await page.locator('#hud-ammo').innerText(), '∞ 无限弹药');
  await page.evaluate(() => {
    const g = window.__STAR_RIFT__.game, original = g.onEvent;
    window.__continuousFireShots = [];
    g.onEvent = (type, value) => {
      if (type === 'sound' && value === 'fire') window.__continuousFireShots.push(g.combatTime);
      original(type, value);
    };
  });
  let movementKey = 'a';
  await page.keyboard.down(movementKey);
  for (let i = 0; i < 80; i++) {
    if ([8, 24, 40, 56, 72].includes(i)) {
      await page.keyboard.up(movementKey); movementKey = movementKey === 'a' ? 'd' : 'a';
      await page.keyboard.down(movementKey);
    }
    if (i === 40) { await page.keyboard.press('f'); await page.keyboard.down('Space'); }
    if (i % 16 === 0) await page.keyboard.press('r');
    if (i === 56) await page.keyboard.press('e');
    await page.waitForTimeout(250);
  }
  await page.keyboard.up(movementKey); await page.keyboard.up('Space');
  const firing = await page.evaluate(() => {
    const timestamps = window.__continuousFireShots;
    const gaps = timestamps.slice(1).map((t, i) => t - timestamps[i]);
    return { mode: window.__STAR_RIFT__.game.mode, shots: timestamps.length,
      seconds: timestamps.at(-1) - timestamps[0], biggestGap: Math.max(...gaps),
      hud: document.querySelector('#hud-ammo')?.textContent,
      obsoleteHints: /换弹|装填中|高温|弹仓/.test(document.querySelector('#ui').textContent) };
  });
  assert.equal(firing.mode, 'combat'); assert.ok(firing.shots > 150);
  assert.ok(firing.biggestGap < .15, `Unexpected reload gap: ${firing.biggestGap}`);
  assert.equal(firing.hud, '∞ 无限弹药'); assert.equal(firing.obsoleteHints, false);
  check('20 seconds of real automatic and held manual fire have no reload pause, including R presses', firing);
  await screenshot('smoke-combat.png');
  await page.keyboard.press('Escape'); await mode('pause');
  check('normal combat keys, active skill, dash, pause freeze and resume');
  assert.deepEqual(report.browserErrors, [], 'no browser errors');
  report.status = 'passed';
  report.finished = new Date().toISOString();
  console.log(`Smoke checks passed: ${report.checks.length}; responsive layouts: ${report.layouts.length}`);
} catch (error) {
  report.status = 'failed';
  report.error = error.stack || String(error);
  if (page) {
    try { await screenshot('smoke-failure.png'); report.lastState = await snapshot(); } catch { /* Preserve the original failure when a page is already gone. */ }
  }
  throw error;
} finally {
  await writeFile(new URL('smoke-report.json', output), JSON.stringify(report, null, 2));
  await browser.close();
}
