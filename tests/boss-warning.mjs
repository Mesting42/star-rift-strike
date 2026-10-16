import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output=new URL('../test-results/',import.meta.url);
await mkdir(output,{recursive:true});
const report={started:new Date().toISOString(),url:process.env.GAME_URL||'http://127.0.0.1:5173/',checks:[],errors:[],layouts:[],
  fixture:'A prepared unlocked route with a real Boss-node click, real pause/settings/touch controls and live combat. Separate frozen layout scenes. Not a full campaign or a real-device test.'};
const pass=(name,detail={})=>{report.checks.push({name,...detail});console.log(`PASS ${name}`);};
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
  args:['--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
let page;
async function route() {
  const id=await page.evaluate(()=>{
    const {game:g}=window.__STAR_RIFT__;g.start(4861);g.nextSector();g.sectorProgress=3;
    const boss=g.map.nodes.find(n=>n.type==='boss');g.currentNode=boss.neighbors[0];g.map.nodes.forEach(n=>n.revealed=true);g.uiVersion++;
    return boss.id;
  });
  await page.waitForSelector(`[data-action="chooseNode"][data-value="${id}"]`);
  await page.locator(`[data-action="chooseNode"][data-value="${id}"]`).click();
  await page.waitForSelector('#boss-warning:not([hidden])');
}
try {
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
  await page.goto(report.url);await page.waitForFunction(()=>!!window.__STAR_RIFT__);
  await page.evaluate(()=>{
    const g=window.__STAR_RIFT__.game,simulate=g.update.bind(g),events=g.onEvent;
    window.__warningTicks=[];window.__warningSounds=[];
    g.onEvent=(type,value)=>{if(type==='sound'&&value==='bossWarning')window.__warningSounds.push(value);events(type,value);};
    g.update=(dt,input)=>{
      const warning=!!g.bossWarning;simulate(dt,input);
      if(warning&&g.mode==='combat')window.__warningTicks.push({x:g.player.x,z:g.player.z,hp:g.player.hp,shield:g.player.shield,inv:g.player.inv,
        combatTime:g.combatTime,shots:g.bullets.length});
    };
  });
  await route();
  assert.ok(await page.locator('#boss-warning').isVisible());
  assert.equal(await page.locator('.boss-warning-title strong').textContent(),'DANGER');
  assert.equal(await page.locator('.boss-warning-target b').textContent(),'天穹裁决者');
  const initial=await page.evaluate(()=>window.__STAR_RIFT__.snapshot());assert.ok(initial.bossWarning.remaining>1.4);
  pass('a real unlocked Boss-route click shows DANGER, the correct Boss name and a two-second alert');
  await page.locator('.pause-icon').click();
  const paused=await page.evaluate(()=>window.__STAR_RIFT__.game.bossWarning.remaining);
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(()=>window.__STAR_RIFT__.game.bossWarning.remaining),paused);
  await page.locator('[data-action="settings"]').click();
  await page.locator('[data-action="effects"][data-value="simple"]').click();
  await page.locator('input[data-action="volumeSfx"]').focus();await page.locator('input[data-action="volumeSfx"]').press('Home');
  assert.equal((await page.evaluate(()=>window.__STAR_RIFT__.snapshot())).preferences.sfx,0);
  assert.equal(await page.evaluate(()=>window.__STAR_RIFT__.game.bossWarning.remaining),paused);
  await page.locator('[data-action="back"]').first().click();await page.locator('[data-action="resume"]').click();
  assert.ok(await page.locator('#boss-warning').isVisible());
  assert.ok(Math.abs(await page.evaluate(()=>window.__STAR_RIFT__.game.bossWarning.remaining)-paused)<.2);
  pass('Pause and settings freeze the alert; resume preserves remaining time, including minimal effects and muted sound');
  const cdp=await context.newCDPSession(page),flight=await page.locator('#world').boundingBox();
  const point={id:1,x:flight.x+flight.width*.25,y:flight.y+flight.height*.6,radiusX:3,radiusY:3,force:1};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});point.x+=80;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[point]});await cdp.detach();
  await page.locator('[data-touch-action="dash"]').tap();await page.locator('[data-touch-action="useSkill"]').tap();
  const safe=await page.evaluate(()=>{const g=window.__STAR_RIFT__.game;return {x:g.player.x,z:g.player.z,hp:g.player.hp,shield:g.player.shield,shots:g.bullets.length,dash:g.dashCooldown,skill:g.skillCooldown,warning:!!g.bossWarning};});
  assert.deepEqual(safe,{x:0,z:10,hp:100,shield:40,shots:0,dash:0,skill:0,warning:true});
  pass('touch movement, dash and skills do not queue movement, attacks or consume cooldowns during the entry alert');
  await page.waitForFunction(()=>!window.__STAR_RIFT__.game.bossWarning);
  await page.waitForSelector('#boss-warning[hidden]',{state:'attached'});
  const ticks=await page.evaluate(()=>window.__warningTicks);
  assert.ok(ticks.length>150);assert.ok(ticks.every(t=>t.x===0&&t.z===10&&t.hp===100&&t.shield===40&&Math.abs(t.inv-1.8)<1e-7&&t.combatTime===0&&t.shots===0));
  assert.equal(await page.evaluate(()=>window.__warningSounds.length),3);
  pass('every warning tick freezes movement, both sides fire, damage, protection and combat clocks; three short alarm cues fire once');
  await page.waitForFunction(()=>window.__STAR_RIFT__.game.bullets.some(b=>b.enemy));
  const fight=await page.evaluate(()=>{
    const {game:g,renderer:r}=window.__STAR_RIFT__,shots=g.bullets.filter(b=>b.enemy);
    return {bossHp:g.boss.hp,phase:g.boss.phase,combatTime:g.combatTime,warning:g.bossWarning,models:shots.map(b=>r.entities.get(`b${b.id}`)?.userData.enemyVisual),x:g.player.x,z:g.player.z};
  });
  assert.ok(fight.combatTime>.4&&fight.phase===1&&fight.models.every(type=>type==='boss'));assert.equal(fight.warning,null);assert.equal(fight.x,0);assert.equal(fight.z,10);
  assert.ok(await page.locator('#boss-hud').isVisible());
  pass('the alert disappears automatically, combat and Boss volleys start, and old warning touches cannot jump the aircraft',fight);
  await page.locator('.pause-icon').click();await page.locator('[data-action="resume"]').click();
  assert.equal(await page.locator('#boss-warning:not([hidden])').count(),0);
  pass('resuming an already active Boss fight does not replay the entry warning');

  const sound=await page.evaluate(async()=>{
    const {AudioSystem}=await import('/src/audio.js');const audio=new AudioSystem();await audio.unlock();audio.setVolume(0,.4);
    const cues=[],tone=audio.tone.bind(audio);audio.tone=(...args)=>{cues.push(args.slice(0,4));tone(...args);};
    audio.play('bossWarning');const audible=audio.voices.size;audio.setVolume(0,0);audio.play('bossWarning');
    const result={audible,cues:cues.length,afterMute:audio.voices.size,sfxGain:audio.sfxVolume};
    await audio.ctx.close();return result;
  });
  assert.equal(sound.audible,2);assert.equal(sound.cues,2);assert.equal(sound.afterMute,2);assert.equal(sound.sfxGain,0);
  pass('the warning uses two short synthesized tones per cue and respects the existing SFX mute',sound);
  await route();await page.locator('.pause-icon').click();await page.locator('[data-action="restart"]').click();
  assert.equal(await page.evaluate(()=>window.__STAR_RIFT__.game.bossWarning),null);assert.equal(await page.locator('#boss-warning').count(),0);
  await page.evaluate(()=>{const g=window.__STAR_RIFT__.game;const node=g.map.nodes.find(n=>n.type==='combat');g.currentNode=node.id;g.enterCombat(node);});
  await page.waitForSelector('#boss-warning[hidden]',{state:'attached'});assert.equal(await page.evaluate(()=>window.__STAR_RIFT__.game.bossWarning),null);
  pass('restart clears the warning and ordinary combat never shows a Boss-entry alert');

  // Freeze separate render fixtures for exhaustive warning sizing and images.
  await page.evaluate(()=>{
    const {game:g,renderer:r}=window.__STAR_RIFT__;g.update=()=>{};
    window.__warningRender=r.update.bind(r);r.update=()=>{};
  });
  for(const [width,height] of [[320,568],[390,844],[430,932],[844,390],[768,1024],[1024,768],[1200,760]]) {
    await page.setViewportSize({width,height});
    await page.evaluate(()=>{
      const {game:g,renderer:r}=window.__STAR_RIFT__;g.start(4);g.nextSector();const node=g.map.nodes.find(n=>n.type==='boss');g.currentNode=node.id;g.enterCombat(node);
      document.getElementById('toast').classList.remove('visible');r.setPreferences({effects:'rich',shake:0});
    });
    await page.waitForSelector('#boss-warning:not([hidden])');await page.waitForTimeout(80);
    await page.evaluate(()=>{const {game:g,renderer:r}=window.__STAR_RIFT__;r.resize();window.__warningRender(g,0);});
    const layout=await page.evaluate(()=>{
      const flight=document.getElementById('world').getBoundingClientRect(),band=document.querySelector('.boss-warning-band').getBoundingClientRect();
      const items=[...document.querySelectorAll('.boss-warning-band svg,.boss-warning-band strong,.boss-warning-band b,.boss-warning-band span')].map(el=>{
        const r=el.getBoundingClientRect();return r.left>=flight.left-1&&r.right<=flight.right+1&&r.top>=flight.top-1&&r.bottom<=flight.bottom+1;
      });
      return {fits:items.every(Boolean)&&band.top>=flight.top-1&&band.bottom<=flight.bottom+1,overflow:document.documentElement.scrollWidth>innerWidth,
        band:{x:band.x,y:band.y,width:band.width,height:band.height}};
    });
    assert.ok(layout.fits&&!layout.overflow,JSON.stringify({width,height,...layout}));report.layouts.push({width,height,...layout});
    if(width===390)await page.screenshot({path:fileURLToPath(new URL('boss-warning-phone.png',output))});
    if(width===1024)await page.screenshot({path:fileURLToPath(new URL('boss-warning-tablet.png',output))});
  }
  pass('the warning stays inside the battlefield at seven phone, tablet and wide-screen sizes',{layouts:report.layouts.length});
  // A separate desktop context verifies the desktop HUD rather than keeping
  // the coarse-pointer layout on a resized touch device.
  const desktop=await browser.newContext({viewport:{width:1200,height:760}});const desktopPage=await desktop.newPage();
  desktopPage.on('pageerror',e=>report.errors.push(e.message));await desktopPage.goto(report.url);await desktopPage.waitForFunction(()=>!!window.__STAR_RIFT__);
  await desktopPage.evaluate(()=>{const {game:g,renderer:r}=window.__STAR_RIFT__;g.update=()=>{};g.start(4);g.nextSector();const n=g.map.nodes.find(n=>n.type==='boss');g.currentNode=n.id;g.enterCombat(n);r.setPreferences({shake:0});document.getElementById('toast').classList.remove('visible');});
  await desktopPage.waitForSelector('#boss-warning:not([hidden])');await desktopPage.screenshot({path:fileURLToPath(new URL('boss-warning-desktop.png',output))});
  assert.deepEqual(report.errors,[]);pass('desktop and touch warning scenes render without browser errors');
  const preview=await browser.newPage({viewport:{width:1000,height:650}}),pics=await Promise.all(['boss-warning-phone.png','boss-warning-desktop.png'].map(n=>readFile(new URL(n,output))));
  await preview.setContent(`<html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:20px;background:#071522;color:#dfd8d0;font:13px Microsoft YaHei,sans-serif}header{font-size:20px;margin-bottom:20px}.grid{display:grid;grid-template-columns:230px 1fr;gap:22px}h2{font-size:13px;font-weight:400;color:#d79881;margin:0 0 10px}img{width:100%;display:block}p{color:#a9a8a1;font-size:12px;line-height:1.9;margin-top:24px}</style><header>STAR RIFT · Boss 入场危险预警</header><div class="grid"><section><h2>手机 · 战场内显示</h2><img src="data:image/png;base64,${pics[0].toString('base64')}"></section><section><h2>桌面 · 核心母舰接战</h2><img src="data:image/png;base64,${pics[1].toString('base64')}"><p>红色 DANGER 横幅 · 天穹裁决者 · 三次短促警报<br>约 2 秒后开始战斗，预警期间暂停攻击与扣伤。<br>此图为原游戏的独立展示场景。</p></section></div></html>`);
  await preview.screenshot({path:fileURLToPath(new URL('boss-warning-preview.png',output))});await preview.close();report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;if(page)await page.screenshot({path:fileURLToPath(new URL('boss-warning-failure.png',output))}).catch(()=>{});throw error;}
finally{await writeFile(new URL('boss-warning-report.json',output),JSON.stringify(report,null,2));await browser.close();}
console.log(`Boss-warning checks passed: ${report.checks.length}; layouts: ${report.layouts.length}`);
