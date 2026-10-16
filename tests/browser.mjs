import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const output = new URL('../test-results/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = []; const report = { started: new Date().toISOString(), scenes: [], transitions: [], errors };
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });
await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5173/');
await page.waitForFunction(() => Boolean(window.__STAR_RIFT__), { timeout: 30000 });
await page.screenshot({ path: fileURLToPath(new URL('menu.png', output)) });
await page.locator('[data-action="start"]').first().click();
let last = '', lastNode = '', combats = 0, step = 0, keys = new Set();
const screenshots = new Set();
const weaponScore = { vulcan: 3, scatter: 2, rail: 5, rocket: 6, beam: 9, arc: 7, orbit: 4, nova: 8 };
const deadline = Date.now() + 18 * 60 * 1000;
while (Date.now() < deadline) {
  const state = await page.evaluate(() => {
    const g = window.__STAR_RIFT__.game;
    const p = g.player;
    let targetX = p.x, targetZ = 11;
    if (g.mode === 'combat') {
      const targets = g.enemies.filter(e => e.hp > 0).sort((a,b) => b.z-a.z);
      const target = g.boss || targets[0];
      let best = -Infinity;
      for (let x = -9.7; x <= 9.7; x += .8) {
        let score = -Math.abs(x - p.x) * .38 - (target ? Math.abs(x - target.x) * .42 : Math.abs(x) * .1);
        for (const b of g.bullets) if (b.enemy && b.vz > 0) {
          const t = (targetZ - b.z) / b.vz;
          if (t >= -.08 && t < 1.8) {
            const bx = b.x + b.vx * Math.max(0,t);
            score -= Math.max(0, 1.8-Math.abs(x-bx)) * (2.1-Math.max(0,t)) * 6;
          }
          if (Math.hypot(b.x-x,b.z-targetZ) < 2) score -= 12;
        }
        for (const h of g.hazards) if (h.warning < 1.8 && Math.abs(x-h.x)<h.width+1.2) score -= 70;
        for (const o of g.obstacles) if (o.hp>0 && Math.abs(o.z-targetZ)<3 && Math.abs(o.x-x)<o.r+1.3) score -= 50;
        if (score>best) { best=score; targetX=x; }
      }
    }
    return { mode:g.mode,sector:g.sector, currentNode:g.currentNode,progress:g.sectorProgress,
      player:{...p},targetX,targetZ,skillCooldown:g.skillCooldown,dashCooldown:g.dashCooldown,
      bullets:g.bullets.filter(b=>b.enemy&&b.z>0).length,boss:g.boss?{hp:g.boss.hp,maxHp:g.boss.maxHp,phase:g.boss.phase}:null,
      weapons:g.weapons,weaponIndex:g.weaponIndex,items:g.items,money:g.money,keys:g.keys,
      map:g.map,available:g.availableNodes(),offers:g.offers,choices:g.choices,event:g.eventData,
      snapshot:window.__STAR_RIFT__.snapshot() };
  });
  if (state.mode !== last || state.currentNode !== lastNode) {
    const transition = { mode:state.mode,sector:state.sector,node:state.currentNode,hp:Math.round(state.player.hp),time:Math.round(state.snapshot.elapsed) };
    report.transitions.push(transition); console.log(JSON.stringify(transition));
    last=state.mode; lastNode=state.currentNode;
  }
  const shotName = state.mode === 'combat' ? state.boss ? `boss-phase${state.boss.phase}` : `combat-sector${state.sector}` : state.mode;
  if (!screenshots.has(shotName) && (state.mode !== 'combat' || state.snapshot.enemies > 0)) {
    screenshots.add(shotName); report.scenes.push(shotName);
    await page.screenshot({ path: fileURLToPath(new URL(`${shotName}.png`,output)) });
  }
  if (state.mode === 'win' || state.mode === 'dead') { report.result=state.snapshot; break; }
  if (state.mode !== 'combat') {
    for (const key of keys) await page.keyboard.up(key.replace('Key','')); keys.clear();
  }
  if (state.mode === 'map') {
    let choices = state.available.filter(n => !n.cleared);
    const desired = state.progress >=3 ? (state.sector===1?'exit':'boss') : 'combat';
    let chosen = state.progress === 0 ? choices.find(n=>n.type==='shop') || choices.find(n=>n.type==='reward') : null;
    if (!chosen) chosen = choices.find(n=>n.type===desired);
    if (!chosen && state.progress<3) chosen = choices.find(n=>n.type==='reward') || choices.find(n=>n.type==='shop') || choices.find(n=>n.type==='event') || choices.find(n=>['combat','elite'].includes(n.type));
    if (!chosen && state.progress>=3) chosen = choices.find(n=>['reward','shop','event'].includes(n.type)) || choices.find(n=>!['exit','boss'].includes(n.type));
    if (!chosen) {
      // Choose a known cleared junction that leads to an unexplored reachable node.
      const byId = new Map(state.map.nodes.map(n=>[n.id,n]));
      const known = state.map.nodes.filter(n=>n.cleared);
      chosen = known.find(n=>n.id!==state.currentNode && n.neighbors.some(id=>{const t=byId.get(id); return t.revealed&&!t.cleared&&(!['boss','exit'].includes(t.type)||state.progress>=3); }));
    }
    if (chosen) await page.locator(`[data-action="chooseNode"][data-value="${chosen.id}"]`).first().click();
    else { report.stuck=state; break; }
  } else if (state.mode === 'shop') {
    let purchased = false;
    const scored = state.offers.map((o,i)=>({o,i,score:o.kind==='weapon'?weaponScore[o.id]+3:o.kind==='heal'?(state.player.hp<75?20:0):o.kind==='item'?7:o.kind==='skill'?1:0})).sort((a,b)=>b.score-a.score);
    for (const {o,i,score} of scored) if (!o.sold && o.cost<=state.money && score>0) {
      await page.locator(`[data-action="buy"][data-value="${i}"]`).first().click(); purchased=true; break;
    }
    if (!purchased) await page.locator('[data-action="continue"]').first().click();
  } else if (state.mode === 'event') {
    const idx = state.event.choices.findIndex(c=>!c.disabled);
    await page.locator(`[data-action="chooseEvent"][data-value="${idx}"]`).first().click();
  } else if (state.mode === 'reward') {
    const sorted = state.choices.map((o,i)=>({i,score:o.kind==='weapon'?weaponScore[o.id]+1:o.kind==='item'?6:o.kind==='heal'?(state.player.hp<65?15:3):4})).sort((a,b)=>b.score-a.score);
    await page.locator(`[data-action="takeReward"][data-value="${sorted[0].i}"]`).first().click();
    combats++;
  } else if (state.mode === 'pause') await page.locator('[data-action="resume"]').first().click();
  else if (state.mode === 'combat') {
    const best = state.weapons.reduce((a,w,i)=>weaponScore[w]>weaponScore[state.weapons[a]]?i:a,0);
    if (state.weaponIndex!==best) await page.keyboard.press(`Digit${best+1}`);
    const desiredKeys = new Set();
    if (Math.abs(state.targetX-state.player.x)>.3) desiredKeys.add(state.targetX>state.player.x?'KeyD':'KeyA');
    if (Math.abs(state.targetZ-state.player.z)>.3) desiredKeys.add(state.targetZ>state.player.z?'KeyS':'KeyW');
    for (const key of keys) if (!desiredKeys.has(key)) await page.keyboard.up(key.replace('Key',''));
    for (const key of desiredKeys) if (!keys.has(key)) await page.keyboard.down(key.replace('Key',''));
    keys=desiredKeys;
    if (state.skillCooldown<=0 && (state.bullets>15 || state.boss || state.player.shield<15)) await page.keyboard.press('e');
    if (state.dashCooldown<=0 && state.bullets>35) await page.keyboard.press('Shift');
  }
  step++;
  await page.waitForTimeout(state.mode==='combat'?110:170);
}
report.finished=new Date().toISOString(); report.final=await page.evaluate(()=>window.__STAR_RIFT__.snapshot());
await writeFile(new URL('browser-report.json',output),JSON.stringify(report,null,2));
await page.screenshot({path:fileURLToPath(new URL('final.png',output))});
await browser.close();
console.log(JSON.stringify({result:report.final,errors,scenes:report.scenes,stuck:Boolean(report.stuck)}));
if (errors.length || report.final.mode!=='win') process.exitCode=1;
