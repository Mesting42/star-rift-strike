import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../test-results/', import.meta.url);
await mkdir(output, { recursive: true });
const report = { started: new Date().toISOString(), url: process.env.GAME_URL || 'http://127.0.0.1:5173/',
  checks: [], errors: [], fixture: 'Real CDP touch input in isolated live simulation; independent enemy firing and render scenarios. Not a campaign or physical-device latency test.' };
const pass = (name, detail = {}) => { report.checks.push({ name, ...detail }); console.log(`PASS ${name}`); };
const near = (a, b, epsilon = .0001) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
let page;
async function fixture(live = false) {
  await page.evaluate(live => {
    const { game: g, renderer: r } = window.__STAR_RIFT__;
    if (!window.__renderStep) { window.__renderStep = r.update.bind(r); r.update = () => {}; }
    if (!window.__simulationStep) window.__simulationStep = g.update.bind(g);
    g.update = () => {};
    g.start(78654);
    const node = g.map.nodes.find(n => n.type === 'combat'); g.currentNode = node.id; g.enterCombat(node);
    g.enemies = []; g.bullets = []; g.obstacles = []; g.drops = []; g.fx = []; g.hazards = [];
    g.autoFire = false; g.combatDuration = g.waveAt = g.environmentTimer = 10000;
    g.player.x = g.player.z = 0; g.player.roll = 0; g.player.inv = 0;
    r.shake = 0; r.setPreferences({ effects: 'rich', shake: 0 });
    window.__inputSamples = []; window.__pendingInput = false;
    if (!window.__watchInput) {
      document.getElementById('world').addEventListener('pointermove', () => { window.__pendingInput = true; }, true);
      window.__watchInput = true;
    }
    if (live) g.update = (dt, input) => {
      window.__simulationStep(dt, input);
      if (window.__pendingInput && input.dragTarget) {
        window.__inputSamples.push({ target: { ...input.dragTarget }, player: { x: g.player.x, z: g.player.z } });
        window.__pendingInput = false;
      }
    };
    r.resize(); window.__renderStep(g, 0); g.uiVersion++;
  }, live);
  await page.waitForSelector('#touch-controls:not([hidden])');
  await page.waitForTimeout(80);
}
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await page.goto(report.url); await page.waitForFunction(() => !!window.__STAR_RIFT__);
  const cdp = await context.newCDPSession(page);
  for (const [width, height] of [[320,568],[390,844],[430,932],[844,390],[768,1024],[1024,768]]) {
    await page.setViewportSize({ width, height }); await fixture(true);
    const box = await page.locator('#world').boundingBox();
    const origin = { x: Math.round(box.x + box.width * .4), y: Math.round(box.y + box.height * .52) };
    const point = { id: 1, ...origin, radiusX: 3, radiusY: 3, force: 1 };
    const touch = type => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [point] });
    await touch('touchStart'); await page.waitForTimeout(30);
    assert.deepEqual(await page.evaluate(() => ({ x: window.__STAR_RIFT__.game.player.x, z: window.__STAR_RIFT__.game.player.z })), { x: 0, z: 0 });
    const movements = [[70,0],[-55,0],[0,-40],[0,35],[50,-30],[0,0]];
    for (let i = 0; i < movements.length; i++) {
      point.x = origin.x + movements[i][0]; point.y = origin.y + movements[i][1];
      await touch('touchMove');
      await page.waitForFunction(count => window.__inputSamples.length >= count, i + 1);
      const sample = await page.evaluate(i => window.__inputSamples[i], i);
      const projected = await page.evaluate(delta => window.__STAR_RIFT__.renderer.screenDeltaToWorld(...delta), movements[i]);
      near(sample.target.x, projected.x); near(sample.target.z, projected.z);
      // Check the FIRST simulation tick that receives the movement, not an
      // eventual position after a permissive timeout or speed-limited chase.
      near(sample.player.x, projected.x); near(sample.player.z, projected.z);
    }
    await touch('touchEnd'); await page.waitForTimeout(30);
    const released = await page.evaluate(() => ({ x: window.__STAR_RIFT__.game.player.x, z: window.__STAR_RIFT__.game.player.z }));
    await page.waitForTimeout(100);
    assert.deepEqual(await page.evaluate(() => ({ x: window.__STAR_RIFT__.game.player.x, z: window.__STAR_RIFT__.game.player.z })), released);
    pass(`touch follows rapid reversals in the first input tick, no press jump or release drift: ${width}x${height}`, { moves: movements.length });
  }
  await cdp.detach();

  // Deterministic event bursts use the actual control class with a separate
  // surface, so down/move/up can occur before the next simulation tick.
  const burst = await page.evaluate(async () => {
    const { TouchControls } = await import('/src/touch-controls.js');
    const { Game } = await import('/src/game.js');
    const root = document.createElement('div'), surface = document.createElement('canvas');
    root.style.display = surface.style.display = 'none'; document.body.append(root, surface);
    surface.setPointerCapture = () => {}; surface.hasPointerCapture = () => false;
    const game = new Game(); game.start(1); game.enterCombat(game.map.nodes.find(n => n.type === 'combat'));
    game.enemies = []; game.obstacles = []; game.autoFire = false; game.waveAt = game.environmentTimer = 1000;
    game.player.x = game.player.z = 0;
    const controls = new TouchControls(root, () => {}, () => {}, () => {}, {
      surface, projectDelta: (x, y) => ({ x: x * .05, z: y * .05 }), getPlayer: () => game.player,
    });
    controls.setEnabled(true); controls.setMode('combat');
    const event = (type, x, y = 100) => surface.dispatchEvent(new PointerEvent(type, { pointerId: 100, pointerType: 'touch', clientX: x, clientY: y }));
    event('pointerdown', 100); event('pointermove', 200); event('pointerup', 240);
    const final = controls.getTarget(); game.update(1 / 90, { dragTarget: final });
    const stopped = controls.getTarget(); game.update(1 / 90, { dragTarget: stopped });
    const result = { final, position: game.player.x, next: stopped };
    controls.sensitivity = 2; controls.precision = true;
    event('pointerdown', 100); event('pointermove', 140);
    const precision = controls.getTarget(); game.update(1 / 90, { dragTarget: precision });
    result.precisionDelta = game.player.x - result.position;
    event('pointercancel', 140); result.cancelled = controls.getTarget();
    event('pointerdown', 100); event('pointermove', 300); event('pointerup', 300); controls.reset(); result.reset = controls.getTarget();
    controls.setMode('menu'); root.remove(); surface.remove(); return result;
  });
  near(burst.position, 7); assert.deepEqual(burst.final, { x: 7, z: 0 });
  assert.equal(burst.next, null); near(burst.precisionDelta, 1.8);
  assert.equal(burst.cancelled, null); assert.equal(burst.reset, null);
  pass('a move/release between ticks commits the final displacement once; precision, cancellation and reset remain correct', burst);

  await fixture(false);
  const firing = await page.evaluate(() => {
    const { game: g } = window.__STAR_RIFT__, types = ['scout','wing','gunner','tank','carrier','elite'];
    const expected = [[1,7],[3,7.5],[3,7],[7,5.5],[2,4.5],[15,6.8]];
    return types.map((type, i) => {
      g.enemies = []; g.bullets = []; const enemy = g.spawnEnemy(type, 0, -8); enemy.fire = 0;
      g.updateEnemy(enemy, 0);
      return { type, count: g.bullets.length, expected: expected[i][0], ids: [...new Set(g.bullets.map(b => b.enemyVisual))],
        speeds: g.bullets.map(b => Math.hypot(b.vx,b.vz)), expectedSpeed: expected[i][1], unchanged: g.bullets.every(b => b.r === .22 && b.damage === 10 && b.life === 7) };
    });
  });
  for (const f of firing) {
    assert.equal(f.count, f.expected); assert.deepEqual(f.ids, [f.type]); assert.ok(f.unchanged);
    near(f.speeds[0], f.expectedSpeed); if (f.type === 'elite') near(f.speeds[5], 4.2);
  }
  pass('all six projectile-firing enemy types select their own model without changing attacks', { types: firing.map(f => f.type) });
  const boss = await page.evaluate(() => {
    const { game: g } = window.__STAR_RIFT__; g.sector = 2; g.bullets = [];
    const e = g.spawnEnemy('boss', 0, -9); e.enter = 0; e.phase = 1;
    return [0,1,2,3].map(attack => {
      g.bullets = []; e.fire = 0; e.attack = attack; g.updateBoss(e, 0);
      return { pattern: (attack + 1) % 4, count: g.bullets.length, boss: g.bullets.every(b => b.enemyVisual === 'boss' && b.damage === 13),
        size: g.bullets[0].r, speed: Math.hypot(g.bullets[0].vx,g.bullets[0].vz) };
    });
  });
  for (const p of boss) { assert.ok(p.boss); assert.equal(p.count, [9,17,6,7][p.pattern]); near(p.size, p.pattern === 3 ? .32 : .22); }
  pass('Boss radial, fan, side-cannon and heavy volleys all retain Boss identity and original shot rules', { patterns: boss });

  const signatures = new Set();
  for (const type of ['scout','wing','gunner','tank','carrier','elite','boss']) {
    const geometry = await page.evaluate(async type => {
      const { game: g, renderer: r } = window.__STAR_RIFT__;
      const { hostileBoltShape } = await import('/src/collision.js');
      g.bullets = []; const b = g.enemyShot({ type, x: 0, z: -.5 }, .6, 7); window.__renderStep(g, .1);
      const mesh = r.entities.get(`b${b.id}`), core = mesh.children[0], hardware = mesh.children[1], shape = hostileBoltShape(b);
      core.geometry.computeBoundingBox(); const bounds = core.geometry.boundingBox;
      let solidInside = true, finite = true, warm = true;
      const positions = hardware.geometry.getAttribute('position'), colors = hardware.geometry.getAttribute('color');
      for (let i = 0; i < positions.count; i++) {
        const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i), axial=Math.max(0,Math.abs(z)-shape.halfShaft);
        solidInside &&= x*x+y*y+axial*axial <= shape.radius*shape.radius+1e-8;
        finite &&= Number.isFinite(x+y+z);
        warm &&= colors.getX(i) >= colors.getY(i) && colors.getY(i) >= colors.getZ(i);
      }
      const direction = mesh.position.clone().set(0,0,-1).applyQuaternion(mesh.quaternion);
      return { id: mesh.userData.enemyVisual, radius: bounds.max.x, halfLength: bounds.max.y,
        expectedRadius: shape.radius, expectedLength: shape.halfShaft+shape.radius,
        solidInside, finite, warm, direction: [direction.x,direction.z], velocity: [b.vx/7,b.vz/7],
        parts: mesh.children.length, signature: JSON.stringify(Array.from(positions.array)) };
    }, type);
    assert.equal(geometry.id, type); near(geometry.radius, geometry.expectedRadius); near(geometry.halfLength, geometry.expectedLength);
    assert.ok(geometry.solidInside && geometry.finite && geometry.warm); assert.equal(geometry.parts, 4);
    near(geometry.direction[0], geometry.velocity[0]); near(geometry.direction[1], geometry.velocity[1]);
    signatures.add(geometry.signature);
    pass(`${type} model fits the damage capsule, keeps warm danger colors and points along velocity`, { parts: geometry.parts });
  }
  assert.equal(signatures.size, 7); pass('seven enemy types have distinct combined hardware geometry');
  const minimal = await page.evaluate(() => {
    const { game:g,renderer:r }=window.__STAR_RIFT__;r.setPreferences({effects:'simple',shake:0});g.bullets=[];
    for(const type of ['scout','wing','gunner','tank','carrier','elite','boss'])g.enemyShot({type,x:0,z:0},0);
    window.__renderStep(g,0);
    return g.bullets.map(b=>{const m=r.entities.get(`b${b.id}`);return {solid:m.children.slice(0,2).every(p=>p.visible),details:m.userData.details.every(p=>!p.visible)};});
  });
  assert.ok(minimal.every(m=>m.solid&&m.details)); pass('minimal effects keep all seven physical danger models and hide only glow/trail');
  const resources = await page.evaluate(() => {
    const { game:g,renderer:r }=window.__STAR_RIFT__;r.setPreferences({effects:'rich',shake:0});
    const cycle=()=>{
      g.bullets=[];
      for(let i=0;i<140;i++)g.enemyShot({type:['scout','wing','gunner','tank','carrier','elite','boss'][i%7],x:(i%14-7)*1.3,z:(Math.floor(i/14)-5)*2.2},0);
      window.__renderStep(g,0);const crowded=r.renderer.info.render.calls;
      g.bullets=[];window.__renderStep(g,0);return crowded;
    };
    const crowded=cycle(),before={...r.renderer.info.memory},clear=r.renderer.info.render.calls;
    for(let i=0;i<5;i++)cycle();
    return {before,after:{...r.renderer.info.memory},crowded,clear,enemyEntities:[...r.entities.keys()].filter(k=>k.startsWith('b')).length,gl:r.renderer.getContext().getError()};
  });
  assert.deepEqual(resources.before,resources.after);assert.equal(resources.enemyEntities,0);assert.equal(resources.gl,0);
  assert.ok(resources.crowded-resources.clear<=140*4+8, JSON.stringify(resources));
  pass('140-shell bursts stay within four draws per shell, reuse cached geometry and release entities',resources);

  // Capture original game-rendered projectiles at a closer camera distance.
  // No image assets are generated or substituted into the game.
  await page.setViewportSize({width:390,height:720});await fixture(false);
  const pictures=[];
  const labels={scout:'侦察机 · 截击导轨弹',wing:'编队机 · 三段散射镖',gunner:'炮艇 · 铜色节段弹',tank:'重装机 · 装甲重炮弹',carrier:'母机 · 双脉冲弹芯',elite:'精英 · 旋转能量笼',boss:'Boss · 分段等离子弹',heavy:'Boss · 重型能量弹'};
  for(const type of [...Object.keys(labels)]) {
    await page.evaluate(type=>{
      const {game:g,renderer:r}=window.__STAR_RIFT__;g.bullets=[];g.enemies=[];g.fx=[];
      const b=g.enemyShot({type:type==='heavy'?'boss':type,x:0,z:-.5},0,7,type==='heavy'?{r:.32}:{});
      r.setPreferences({effects:'rich',shake:0});window.__renderStep(g,0);
      r.world.visible=r.decor.visible=r.player.visible=false;for(const d of r.escorts)d.visible=false;
      document.getElementById('toast').style.visibility='hidden';
      r.scene.background.set(0x071522);r.scene.fog=null;r.shipLight.intensity=r.bossLight.intensity=0;
      r.camera.position.set(0,38,15);r.camera.lookAt(0,0,0);r.camera.left=-.95;r.camera.right=.95;r.camera.top=2.6;r.camera.bottom=-2.1;r.camera.updateProjectionMatrix();
      r.composer.render(0);
    },type);
    const path=fileURLToPath(new URL(`hostile-${type}.png`,output));
    const clip=await page.locator('#world').boundingBox();
    const bytes=await page.screenshot({path,clip});pictures.push({label:labels[type],data:bytes.toString('base64')});
  }
  const preview=await browser.newPage({viewport:{width:1000,height:780}});
  await preview.setContent(`<html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:20px;background:#071522;color:#e5dbce;font:13px Microsoft YaHei,sans-serif}header{font-size:20px;margin-bottom:12px}p{font-size:12px;color:#a99381;margin:0 0 14px}main{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}section{border-bottom:1px solid #624338;padding-bottom:8px}img{display:block;width:100%;height:290px;object-fit:contain}span{display:block;margin-top:7px}</style><header>STAR RIFT · 敌方弹体升级</header><p>按发射器区分造型 · 红橙危险色 · 原游戏三维弹体近距离展示</p><main>${pictures.map(p=>`<section><img src="data:image/png;base64,${p.data}"><span>${p.label}</span></section>`).join('')}</main></html>`);
  await preview.screenshot({path:fileURLToPath(new URL('hostile-projectiles-atlas.png',output))});await preview.close();
  assert.deepEqual(report.errors,[]);pass('all upgraded enemy models render without JavaScript or WebGL errors');report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;if(page)await page.screenshot({path:fileURLToPath(new URL('controls-failure.png',output))}).catch(()=>{});throw error;}
finally{await writeFile(new URL('controls-report.json',output),JSON.stringify(report,null,2));await browser.close();}
console.log(`Control and hostile-visual checks passed: ${report.checks.length}`);
