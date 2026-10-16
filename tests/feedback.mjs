import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output=new URL('../test-results/',import.meta.url);await mkdir(output,{recursive:true});
const report={started:new Date().toISOString(),url:process.env.GAME_URL||'http://127.0.0.1:5173/',checks:[],errors:[],layouts:[],
  fixture:'Actual enemy damage and renderer feedback in a prepared combat scene; not a full campaign or real-device benchmark.'};
const pass=(name,detail={})=>{report.checks.push({name,...detail});console.log(`PASS ${name}`);};
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
  args:['--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
let page;
try {
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
  await page.goto(report.url);await page.waitForFunction(()=>!!window.__STAR_RIFT__);
  await page.evaluate(()=>{
    const {game:g,renderer:r}=window.__STAR_RIFT__;g.start(8246);const n=g.map.nodes.find(n=>n.type==='combat');g.currentNode=n.id;g.enterCombat(n);
    g.update=()=>{};window.__simulate=g.update.bind(g); // overwritten below to keep the RAF harmless
    const simulate=window.__STAR_RIFT__.game.constructor.prototype.update.bind(g);window.__simulate=simulate;
    window.__render=r.update.bind(r);r.update=()=>{};g.enemies=[];g.bullets=[];g.obstacles=[];g.fx=[];g.hazards=[];g.autoFire=false;g.waveAt=g.environmentTimer=1000;
    g.player.x=0;g.player.z=8;g.player.inv=0;r.setPreferences({effects:'rich',shake:0});
  });
  const setup=await page.evaluate(()=>{
    const {game:g}=window.__STAR_RIFT__,e=g.spawnEnemy('gunner',0,-2);e.hp=e.maxHp=100;e.fire=100;
    return {id:e.id,x:e.x,z:e.z,hp:e.hp,maxHp:e.maxHp};
  });
  const hit=await page.evaluate(()=>{
    const {game:g,renderer:r}=window.__STAR_RIFT__,e=g.enemies[0];
    g.bullet(e.x,e.z,0,0,{damage:17,r:.17});window.__simulate(1/90,{});window.__render(g,0);
    return {enemy:{hp:e.hp,maxHp:e.maxHp,lastDamageAt:e.lastDamageAt},numbers:r.feedback.drawnNumbers.map(n=>({...n})),bars:r.feedback.bars.map(b=>({...b})),canvasHidden:r.feedback.canvas.hidden};
  });
  assert.equal(hit.enemy.hp,83);assert.equal(hit.numbers.length,1);assert.deepEqual(hit.numbers[0].text,'17');assert.equal(hit.numbers[0].amount,17);assert.equal(hit.bars.length,1);assert.equal(hit.bars[0].ratio,.83);assert.equal(hit.canvasHidden,false);
  pass('actual friendly projectile hit shows the exact removed health value and a temporary ordinary-enemy bar',hit);
  const burst=await page.evaluate(()=>{
    const {game:g,renderer:r}=window.__STAR_RIFT__,e=g.enemies[0];
    g.bullet(e.x,e.z,0,0,{damage:5,r:.17});window.__simulate(1/90,{});window.__render(g,0);
    return {numbers:r.feedback.drawnNumbers.map(n=>({...n})),bar:r.feedback.bars[0]};
  });
  assert.equal(burst.numbers.length,1);assert.equal(burst.numbers[0].text,'22');assert.equal(burst.numbers[0].amount,22);assert.equal(burst.bar.ratio,.78);
  pass('near-simultaneous hits merge into one readable number while the bar uses cumulative health',burst);
  const damagePosition=await page.evaluate(()=>{
    const {game:g,renderer:r}=window.__STAR_RIFT__,n=r.feedback.drawnNumbers[0];
    const point=r.feedback.project(g.enemies[0].x,g.enemies[0].z);return {distance:Math.hypot(n.x-point.x,n.y-point.y),point,number:{x:n.x,y:n.y}};
  });
  assert.ok(damagePosition.distance<70);pass('damage text starts at the rendered impact location and floats upward',{distance:damagePosition.distance});
  const faded=await page.evaluate(()=>{
    const {game:g,renderer:r}=window.__STAR_RIFT__;window.__simulate(.9,{});window.__render(g,.9);return {numbers:r.feedback.drawnNumbers.length,bars:r.feedback.bars.length};
  });
  assert.equal(faded.numbers,0);assert.equal(faded.bars,1);pass('damage numbers fade before the enemy health bar expires',faded);
  const hide=await page.evaluate(()=>{
    const {game:g,renderer:r}=window.__STAR_RIFT__;window.__simulate(2,{});window.__render(g,2);return {numbers:r.feedback.drawnNumbers.length,bars:r.feedback.bars.length};
  });
  assert.deepEqual(hide,{numbers:0,bars:0});pass('ordinary enemy bars hide after the short post-hit window');
  const boss=await page.evaluate(()=>{
    const {game:g,renderer:r}=window.__STAR_RIFT__;g.enemies=[];const b=g.spawnEnemy('boss',0,-3);b.hp=1200;b.maxHp=2600;g.damageEnemy(b,100,b);window.__render(g,0);
    return {bars:r.feedback.bars.length,numbers:r.feedback.drawnNumbers.length,bossHud:b.type,top:b.hp};
  });
  assert.equal(boss.bars,0);assert.equal(boss.numbers,1);assert.equal(boss.top,1100);pass('Boss keeps the top HUD bar and does not receive a duplicate floating health bar',boss);
  const lethal=await page.evaluate(()=>{
    const {game:g,renderer:r}=window.__STAR_RIFT__;g.enemies=[];const e=g.spawnEnemy('scout',0,-3);e.hp=12;e.maxHp=12;g.damageEnemy(e,50,e);window.__render(g,0);return {hp:e.hp,number:r.feedback.drawnNumbers.at(-1),bars:r.feedback.bars.length};
  });
  assert.equal(lethal.hp,0);assert.equal(lethal.number.amount,12);assert.equal(lethal.number.text,'12');assert.equal(lethal.bars,0);pass('lethal damage displays only remaining health and removes the floating bar immediately',lethal);
  const shield=await page.evaluate(()=>{
    const {game:g,renderer:r}=window.__STAR_RIFT__;r.feedback.reset();g.enemies=[];const e=g.spawnEnemy('scout',0,-3);e.hp=80;e.maxHp=80;g.bullet(e.x,e.z,0,0,{enemy:true,damage:12});window.__simulate(1/90,{});window.__render(g,0);return {numbers:r.feedback.drawnNumbers.length,bars:r.feedback.bars.length,shield:g.player.shield};
  });
  assert.equal(shield.numbers,0);assert.equal(shield.bars,0);assert.equal(shield.shield,40);pass('enemy fire and shield deflections do not create friendly damage numbers or enemy bars',shield);
  await page.setViewportSize({width:320,height:568});await page.evaluate(()=>{const {game:g,renderer:r}=window.__STAR_RIFT__;r.resize();g.enemies=[];const e=g.spawnEnemy('elite',0,-2);e.hp=200;e.maxHp=400;g.bullet(e.x,e.z,0,0,{damage:40});window.__simulate(1/90,{});window.__render(g,0);});
  const mobile=await page.evaluate(()=>{const r=window.__STAR_RIFT__.renderer;const box=r.feedback.canvas.getBoundingClientRect(),n=r.feedback.drawnNumbers[0],b=r.feedback.bars[0];return {box:{width:box.width,height:box.height},number:n,bar:b,overflow:document.documentElement.scrollWidth>innerWidth};});
  assert.ok(mobile.number&&mobile.bar&&mobile.overflow===false&&mobile.number.x>=0&&mobile.number.x<=mobile.box.width);report.layouts.push({width:320,height:568,...mobile});pass('mobile portrait feedback stays crisp, inside the canvas and free of horizontal overflow',mobile);
  await page.screenshot({path:fileURLToPath(new URL('feedback-phone.png',output))});
  await page.setViewportSize({width:1200,height:760});await page.evaluate(()=>{const {renderer:r}=window.__STAR_RIFT__;r.resize();});
  const desktop=await page.evaluate(()=>{const r=window.__STAR_RIFT__.renderer;const box=r.feedback.canvas.getBoundingClientRect(),world=r.canvas.getBoundingClientRect();return {width:box.width,height:box.height,worldWidth:world.width,worldHeight:world.height,dpr:r.feedback.ratio};});
  assert.equal(Math.round(desktop.width),Math.round(desktop.worldWidth));assert.equal(Math.round(desktop.height),Math.round(desktop.worldHeight));pass('desktop feedback canvas follows the full battlefield viewport',desktop);
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;if(page)await page.screenshot({path:fileURLToPath(new URL('feedback-failure.png',output))}).catch(()=>{});throw error;}
finally{await writeFile(new URL('feedback-report.json',output),JSON.stringify(report,null,2));await browser.close();}
console.log(`Combat-feedback checks passed: ${report.checks.length}`);
