import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { normalizePreferences, readPreferences, savePreferences, DEFAULT_PREFERENCES } from '../src/preferences.js';

const output=new URL('../test-results/',import.meta.url);
await mkdir(output,{recursive:true});
const report={started:new Date().toISOString(),url:process.env.GAME_URL||'http://127.0.0.1:5173/',checks:[],errors:[],fixture:'Independent render and interaction scenarios; not a full campaign or real-device performance test.'};
const pass=(name,detail={})=>{report.checks.push({name,...detail});console.log(`PASS ${name}`);};
assert.deepEqual(readPreferences({getItem:()=>'{broken'}),DEFAULT_PREFERENCES);
assert.deepEqual(readPreferences({getItem:()=>{throw Error('blocked')}}),DEFAULT_PREFERENCES);
assert.doesNotThrow(()=>savePreferences(DEFAULT_PREFERENCES,{setItem:()=>{throw Error('blocked')}}));
assert.deepEqual(normalizePreferences({effects:'__proto__',shake:NaN,sensitivity:900,music:-5,sfx:'wrong'}),{...DEFAULT_PREFERENCES,sensitivity:2,music:0});
pass('invalid, corrupt and blocked storage preserves safe usable settings');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
let page;
const watch=p=>{p.on('pageerror',e=>report.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});};
const ready=()=>page.waitForFunction(()=>!!window.__STAR_RIFT__);
const tap=(action,value)=>page.locator(`[data-action="${action}"]${value==null?'':`[data-value="${value}"]`}`).first().click();
const shot=name=>page.screenshot({path:fileURLToPath(new URL(name,output))});
const snapshot=()=>page.evaluate(()=>window.__STAR_RIFT__.snapshot());
async function range(action,value) {
  const input=page.locator(`input[data-action="${action}"]`);
  await input.scrollIntoViewIfNeeded();await input.focus();await input.press('Home');
  const {min,step}=await input.evaluate(el=>({min:Number(el.min),step:Number(el.step)}));
  for(let i=0;i<Math.round((value-min)/step);i++)await input.press('ArrowRight');
  assert.ok(Math.abs(Number(await input.inputValue())-value)<.001);
}
async function fixture(sector=1) {
  await page.evaluate(sector=>{
    const {game:g,renderer:r}=window.__STAR_RIFT__;
    if(!window.__renderStep){window.__renderStep=r.update.bind(r);r.update=()=>{};}
    for(const e of r.effects)r.disposeEffect(e);r.effects=[];r.lastFx.clear();
    g.start(314159);if(sector===2)g.nextSector();
    const node=g.map.nodes.find(n=>n.type==='combat');g.currentNode=node.id;g.enterCombat(node);
    g.enemies=[];g.bullets=[];g.obstacles=[];g.drops=[];g.fx=[];g.autoFire=false;g.update=()=>{};
    g.player.x=0;g.player.z=9;g.player.inv=0;g.player.roll=0;r.time=3;r.shake=0;
    window.__renderStep(g,0);document.getElementById('toast').classList.remove('visible');
  },sector);
}
const step=dt=>page.evaluate(dt=>window.__renderStep(window.__STAR_RIFT__.game,dt),dt);
try {
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  page=await context.newPage();watch(page);await page.goto(report.url);await ready();await tap('settings');
  assert.equal(await page.locator('input[type="range"]').count(),4);
  await tap('graphicsQuality','balanced');await tap('effects','standard');
  await range('shake',0);await range('sensitivity',1.5);await range('volumeMusic',.21);await range('volumeSfx',.38);
  let state=await snapshot();assert.deepEqual(state.preferences,{effects:'standard',shake:0,sensitivity:1.5,music:.21,sfx:.38});
  assert.equal(await page.locator('[data-action="sensitivity"]').evaluate(el=>el.closest('.setting-row').querySelector('output').textContent),'1.5×');
  pass('all settings respond to real keyboard range input and display correct percentages or multipliers',state.preferences);
  const input=page.locator('[data-action="sensitivity"]');await input.scrollIntoViewIfNeeded();const box=await input.boundingBox();
  await page.mouse.click(box.x+box.width*.7,box.y+box.height/2);
  state=await snapshot();assert.ok(state.preferences.sensitivity>=1.4&&state.preferences.sensitivity<=1.6);
  assert.equal(Number(await input.inputValue()),state.preferences.sensitivity);
  pass('clicking a slider retains the new value after its input and click events');
  const saved=state.preferences;await page.reload();await ready();assert.deepEqual((await snapshot()).preferences,saved);
  await tap('settings');assert.equal(await page.locator('[data-action="effects"][data-value="standard"]').getAttribute('aria-pressed'),'true');
  assert.deepEqual(await page.evaluate(()=>window.__STAR_RIFT__.game.volume),{music:.21,sfx:.38});
  pass('effects, shake, sensitivity, quality and both audio volumes survive refresh');
  for(const size of [{width:320,height:568},{width:844,height:390},{width:768,height:1024},{width:1024,height:768}]) {
    await page.setViewportSize(size);
    for(const selector of ['[data-action="sensitivity"]','[data-action="volumeSfx"]','[data-action="resetSettings"]','#ui .panel-footer button']) {
      const el=page.locator(selector);await el.scrollIntoViewIfNeeded();const b=await el.boundingBox();
      assert.ok(b.x>=0&&b.x+b.width<=size.width+1&&b.y>=0&&b.y+b.height<=size.height+1,`accessible setting at ${size.width}x${size.height}`);
    }
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  pass('new settings remain reachable and avoid horizontal overflow on small phones and both tablet orientations');
  await page.setViewportSize({width:390,height:844});await tap('resetSettings');assert.deepEqual((await snapshot()).preferences,DEFAULT_PREFERENCES);assert.equal((await snapshot()).graphicsQuality,'high');
  await page.locator('.panel-screen,.small-panel-screen').first().evaluate(el=>el.scrollTop=0);await shot('future-settings-phone.png');
  pass('restore defaults updates controls, renderer and storage together');
  await fixture(1);
  await page.evaluate(()=>window.__STAR_RIFT__.game.update=(_dt,input)=>{window.__STAR_RIFT__.game.testInput=input;});
  const cdp=await context.newCDPSession(page);
  const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:[{x,y,id:11,radiusX:8,radiusY:8}]});
  for(const sensitivity of [.5,1.5,2]) {
    await page.evaluate(()=>window.__STAR_RIFT__.game.pause());await tap('settings');await range('sensitivity',sensitivity);await tap('back');await tap('resume');
    await page.waitForTimeout(70);const box=await page.locator('#world').boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
    await touch('touchStart',x,y);await page.waitForFunction(()=>window.__STAR_RIFT__.game.testInput?.dragTarget);
    assert.equal(await page.evaluate(()=>window.__STAR_RIFT__.game.testInput.dragTarget.x),0);
    await touch('touchMove',x+20,y);await page.waitForFunction(()=>window.__STAR_RIFT__.game.testInput?.dragTarget?.x>0);
    const movement=await page.evaluate(()=>{const {game:g,renderer:r}=window.__STAR_RIFT__;return {target:g.testInput.dragTarget.x,unit:r.screenDeltaToWorld(20,0).x};});
    assert.ok(Math.abs(movement.target-movement.unit*sensitivity)<.01);
    await touch('touchEnd',x+20,y);
  }
  await cdp.detach();await page.evaluate(()=>window.__STAR_RIFT__.game.pause());await tap('settings');await tap('resetSettings');await tap('back');await tap('resume');
  pass('actual phone drag honors 0.5x, 1.5x and 2x sensitivity without teleporting on touch-down');
  await fixture(1);
  const weaponRows=await page.evaluate(async()=>{
    const {WEAPONS}=await import('/src/content.js');const {game:g,renderer:r}=window.__STAR_RIFT__;g.weapons=WEAPONS.map(w=>w.id);
    return WEAPONS.map((w,index)=>{
      g.bullets=[];g.fx=[];g.weaponIndex=index;g.firePlayer();window.__renderStep(g,0);
      const b=g.bullets[0],m=r.entities.get(`b${b.id}`),signature=[];let finite=true;
      m.traverse(o=>{if(o.geometry)signature.push([o.geometry.type,o.geometry.parameters,o.material?.color?.getHex()]);if(o.matrixWorld)finite&&=o.matrixWorld.elements.every(Number.isFinite)});
      return {id:w.id,visual:m.userData.weaponVisual,count:g.bullets.length,shots:w.shots,damage:b.damage,expectedDamage:w.damage,speed:Math.hypot(b.vx,b.vz),expectedSpeed:w.speed,muzzle:g.fx.some(f=>f.type==='muzzle'&&f.weapon===w.id),signature:JSON.stringify(signature),finite};
    });
  });
  for(const w of weaponRows){assert.equal(w.id,w.visual);assert.equal(w.count,w.shots);assert.equal(w.damage,w.expectedDamage);assert.ok(Math.abs(w.speed-w.expectedSpeed)<.001);assert.ok(w.muzzle&&w.finite);pass(`weapon ${w.id} has an independent actual-fired model and matching ballistics`,{id:w.id,shots:w.count});}
  assert.equal(new Set(weaponRows.map(w=>w.signature)).size,8);pass('all eight weapon structures are visually distinct');
  const support=await page.evaluate(()=>{
    const {game:g,renderer:r}=window.__STAR_RIFT__;g.bullets=[];
    for(const options of [{weapon:'escort'},{type:'pierce'},{type:'laser'}])g.bullet(0,0,0,-30,options);
    window.__renderStep(g,0);return g.bullets.map(b=>({visual:r.entities.get(`b${b.id}`).userData.weaponVisual,parts:r.entities.get(`b${b.id}`).children.length}));
  });
  assert.deepEqual(support.map(v=>v.visual),['vulcan','rail','beam']);assert.ok(support.every(v=>v.parts>0));
  pass('drone fire and module synergy projectiles retain visible upgraded models', {support});
  await fixture(2);
  const models=await page.evaluate(()=>{
    const {game:g,renderer:r}=window.__STAR_RIFT__;
    for(const [i,type]of ['scout','wing','gunner','tank','laser','carrier','elite','boss'].entries())g.spawnEnemy(type,(i%3-1)*6,-12+Math.floor(i/3)*5);
    for(const [i,type]of ['cover','crate','barrel','mine'].entries())g.makeObstacle(type,-9+i*6,5);
    window.__renderStep(g,0);
    return {aircraft:[r.player,...r.escorts,...[...r.entities].filter(([id])=>id[0]==='e').map(([,m])=>m)].map(m=>m.userData.modelRevision),obstacles:[...r.entities].filter(([id])=>id[0]==='o').map(([,m])=>m.userData.modelRevision),calls:r.renderer.info.render.calls};
  });
  assert.equal(models.aircraft.length,11);assert.ok([...models.aircraft,...models.obstacles].every(v=>v==='future-2'));assert.equal(models.obstacles.length,4);
  pass('player, two drones, seven enemy classes, Boss and four obstacle classes use upgraded assembled models',models);
  for(const skill of ['emp','shield','bomb','drone']) {
    await fixture(2);
    const result=await page.evaluate(skill=>{
      const {game:g,renderer:r}=window.__STAR_RIFT__;g.skill=skill;g.skillCooldown=0;g.player.shield=5;
      const enemy=g.spawnEnemy('tank',0,-8);enemy.hp=enemy.maxHp=600;g.bullet(-6,0,0,8,{enemy:true});g.useSkill();window.__renderStep(g,.08);
      const fx=r.effects.find(e=>e.type===`skill-${skill}`);
      return {effect:fx?.type,parts:fx?.parts.length,hp:enemy.hp,enemyShots:g.bullets.filter(b=>b.enemy).length,shield:g.player.shield,inv:g.player.inv,droneTime:g.droneTime,visibleDrones:r.escorts.filter(d=>d.visible).length};
    },skill);
    assert.equal(result.effect,`skill-${skill}`);assert.ok(result.parts>0);
    if(skill==='emp'){assert.equal(result.hp,510);assert.equal(result.enemyShots,0);}
    if(skill==='shield'){assert.equal(result.shield,40);assert.equal(result.inv,3.5);}
    if(skill==='bomb'){assert.equal(result.hp,390);assert.equal(result.enemyShots,0);}
    if(skill==='drone'){assert.equal(result.droneTime,12);assert.equal(result.visibleDrones,2);}
    await shot(`future-skill-${skill}.png`);
    const paused=await page.evaluate(()=>{const {game:g,renderer:r}=window.__STAR_RIFT__;g.pause();window.__renderStep(g,.3);return r.effects.find(e=>e.kind==='skill-visual')?.t;});
    assert.ok(Math.abs(paused-.08)<.001);
    await page.evaluate(()=>window.__STAR_RIFT__.game.resume());await step(1);assert.equal(await page.evaluate(()=>window.__STAR_RIFT__.renderer.effects.length),0);
    pass(`skill ${skill} has a unique real activation, unchanged gameplay, pause safety and cleanup`,result);
  }
  await fixture(2);
  const low=await page.evaluate(()=>{
    const {game:g,renderer:r}=window.__STAR_RIFT__;r.setPreferences({effects:'simple',shake:0});g.weaponIndex=0;g.firePlayer();g.skill='shield';g.useSkill();const hostile=g.bullet(5,2,0,7,{enemy:true});window.__renderStep(g,.05);
    const b=r.entities.get(`b${g.bullets.find(b=>!b.enemy).id}`),h=r.entities.get(`b${hostile.id}`);
    r.shake=2;window.__renderStep(g,.1);
    return {hiddenDetails:b.userData.details.filter(o=>!o.visible).length,coreVisible:b.children[0].visible,hostileVisible:h.children[0].visible,forceField:r.player.userData.shield.visible,camera:[r.camera.position.x,r.camera.position.z]};
  });
  assert.ok(low.hiddenDetails>0&&low.coreVisible&&low.hostileVisible&&low.forceField);assert.deepEqual(low.camera,[0,15]);
  pass('minimal effects and zero shake preserve physical projectiles and protection visibility',low);
  await fixture(1);
  const resources=async()=>page.evaluate(()=>{const r=window.__STAR_RIFT__.renderer;return {...r.renderer.info.memory,effects:r.effects.length,children:r.particles.children.length,gl:r.renderer.getContext().getError()};});
  // Warm both sectors and all effect variants before checking bounded reuse.
  async function cycle() {await page.evaluate(()=>{const {game:g,renderer:r}=window.__STAR_RIFT__;r.setPreferences(DEFAULT_PREFERENCES);for(const sector of [2,1]){g.sector=sector;window.__renderStep(g,0);}for(const skill of ['emp','shield','bomb','drone']){g.skill=skill;g.skillCooldown=0;g.useSkill();}g.fx.push({id:++g.id,type:'arc',x:0,z:2,targetX:4,targetZ:-4});window.__renderStep(g,.1);window.__renderStep(g,1);g.fx=[];g.bullets=[];window.__renderStep(g,0);});}
  // Browser scope cannot import the Node constant implicitly.
  await page.evaluate(defaults=>window.DEFAULT_PREFERENCES=defaults,DEFAULT_PREFERENCES);
  await cycle();const before=await resources();for(let i=0;i<6;i++)await cycle();const after=await resources();
  assert.equal(after.geometries,before.geometries);assert.equal(after.textures,before.textures);assert.equal(after.children,0);assert.equal(after.effects,0);assert.equal(after.gl,0);
  pass('repeated skill activation and sector rebuilds release temporary geometry and textures', {before,after});
  // Native gameplay screenshots, using independent deterministic display fixtures.
  for(const sector of [1,2]) {
    await fixture(sector);await page.evaluate(()=>{
      const {game:g,renderer:r}=window.__STAR_RIFT__;r.setPreferences(window.DEFAULT_PREFERENCES);
      g.weapons=['nova','rail','rocket'];g.weaponIndex=0;g.skill='drone';g.droneTime=12;
      g.spawnEnemy('wing',-5,-10);g.spawnEnemy('laser',5,-6);g.spawnEnemy('elite',0,-12);g.spawnEnemy('scout',-6,-1);
      g.makeObstacle('crate',6,3);g.makeObstacle('barrel',-7,-7);g.makeObstacle('cover',-5,5);
      g.firePlayer();g.bullets[0].z=1;
      g.bullet(-4,-1,0,7,{enemy:true,r:.22});g.bullet(4,2,0,7,{enemy:true,r:.22});g.uiVersion++;window.__renderStep(g,.1);
    });
    await page.waitForTimeout(180);
    await shot(`future-sector-${sector}-phone.png`);
  }
  await context.close();
  const desktop=await browser.newContext({viewport:{width:1200,height:760}});page=await desktop.newPage();watch(page);await page.goto(report.url);await ready();await fixture(2);
  await page.evaluate(()=>{
    const {game:g,renderer:r}=window.__STAR_RIFT__;g.spawnEnemy('boss',0,-8);g.weapons=['rail'];g.skill='shield';g.useSkill();g.firePlayer();g.bullets[0].z=0;window.__renderStep(g,.1);
  });await shot('future-boss-desktop.png');
  await fixture(1);
  await page.evaluate(async()=>{
    const {WEAPONS}=await import('/src/content.js');const {game:g,renderer:r}=window.__STAR_RIFT__;
    document.getElementById('ui').style.display='none';document.getElementById('touch-controls').style.display='none';
    g.weapons=WEAPONS.map(w=>w.id);g.bullets=[];g.fx=[];
    WEAPONS.forEach((w,i)=>{g.weaponIndex=i;g.player.x=-4.5+i%4*3;g.player.z=(i<4?-2.2:3.2)+1.1;g.firePlayer();if(w.id==='scatter')for(const b of g.bullets.filter(b=>b.weapon===w.id)){b.x+=b.vx*.045;b.z+=b.vz*.045;}});
    g.fx=[];r.camera.left=-6.3;r.camera.right=6.3;r.camera.top=6;r.camera.bottom=-6;r.camera.updateProjectionMatrix();window.__renderStep(g,0);r.player.visible=false;window.__renderStep(g,0);r.player.visible=false;r.composer.render(0);
    const captions=document.createElement('div');captions.id='visual-captions';captions.style.cssText='position:fixed;inset:0;pointer-events:none;color:#d9ebf1;font:13px Microsoft YaHei,sans-serif';
    for(const [i,w]of WEAPONS.entries()){const p=new r.player.position.constructor(-4.5+i%4*3,.4,i<4?-2.2:3.2).project(r.camera);const label=document.createElement('span');label.textContent=w.name;label.style.cssText=`position:absolute;left:${(p.x+1)*innerWidth/2}px;top:${(-p.y+1)*innerHeight/2+85}px;transform:translateX(-50%);white-space:nowrap`;captions.append(label);}document.body.append(captions);
  });await shot('future-weapons-atlas.png');
  await page.locator('#visual-captions').evaluate(el=>el.remove());
  await page.setViewportSize({width:360,height:280});await page.waitForTimeout(100);
  const catalog=[['player','游隼突击机'],['drone','护航无人机'],['scout','裂翼截击机'],['wing','针蜂无人机'],['gunner','哨戒炮艇'],['tank','堡垒轰炸机'],['laser','棱镜浮游炮'],['carrier','蜂巢支援舰'],['elite','黑曜近卫'],['boss','天穹裁决者'],['cover','装甲残骸'],['crate','运输箱'],['barrel','能量燃料舱'],['mine','感应地雷']];
  const modelImages=[];
  for(const [type,label]of catalog) {
    await fixture(2);await page.evaluate(type=>{
      const {game:g,renderer:r}=window.__STAR_RIFT__;g.enemies=[];g.obstacles=[];g.bullets=[];g.fx=[];g.player.x=g.player.z=0;g.droneTime=type==='drone'?12:0;
      if(['cover','crate','barrel','mine'].includes(type))g.makeObstacle(type,0,0);else if(!['player','drone'].includes(type))g.spawnEnemy(type,0,0);
      window.__renderStep(g,0);r.world.visible=false;r.decor.visible=false;r.player.visible=type==='player';
      for(const d of r.escorts)d.visible=false;
      if(type==='drone'){r.escorts[0].visible=true;r.escorts[0].position.set(0,.25,0);}
      const half=type==='boss'?8.5:type==='drone'?1.4:2.4;r.camera.left=-half;r.camera.right=half;r.camera.top=half*280/360;r.camera.bottom=-half*280/360;r.camera.updateProjectionMatrix();r.composer.render(0);
    },type);
    await shot(`future-model-${type}.png`);modelImages.push({label,data:(await readFile(new URL(`future-model-${type}.png`,output))).toString('base64')});
  }
  await desktop.close();
  const modelPreview=await browser.newPage({viewport:{width:1000,height:935}});
  await modelPreview.setContent(`<html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:20px;background:#0a1b27;color:#d6e8ee;font:12px Microsoft YaHei,sans-serif}header{font-size:18px;margin-bottom:16px}main{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}section{border-bottom:1px solid #29424f;padding-bottom:8px}img{display:block;width:100%;margin-bottom:7px}span{color:#96b9c5}</style><header>STAR RIFT · 战机与设施模型一览</header><main>${modelImages.map(({label,data})=>`<section><img src="data:image/png;base64,${data}"><span>${label}</span></section>`).join('')}</main></html>`);
  await modelPreview.screenshot({path:fileURLToPath(new URL('future-models-atlas.png',output))});await modelPreview.close();
  assert.deepEqual(report.errors,[]);pass('phone and desktop presentations render without JavaScript or WebGL errors');report.status='passed';
  const preview=await browser.newPage({viewport:{width:1000,height:660}});
  const pics=await Promise.all(['future-sector-1-phone.png','future-sector-2-phone.png','future-boss-desktop.png'].map(n=>readFile(new URL(n,output))));
  await preview.setContent(`<html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:20px;background:#0a1b27;color:#d1e6eb;font:13px Microsoft YaHei,sans-serif}header{font-size:18px;margin-bottom:14px}.grid{display:grid;grid-template-columns:230px 230px 1fr;gap:16px}h2{font-size:12px;font-weight:400;margin:0 0 8px}img{display:block;width:100%;border:1px solid #28424f}.note{font-size:12px;line-height:1.8;color:#95b2c1;margin-top:22px}</style><header>STAR RIFT · 未来科技视觉升级</header><div class="grid"><section><h2>云海防线 · 手机竖屏</h2><img src="data:image/png;base64,${pics[0].toString('base64')}"></section><section><h2>失控轨道 · 手机竖屏</h2><img src="data:image/png;base64,${pics[1].toString('base64')}"></section><section><h2>母舰与棱镜护盾 · 桌面</h2><img src="data:image/png;base64,${pics[2].toString('base64')}"><p class="note">原项目中的真实三维渲染。<br>独立展示场景，用于核对外观。<br>完整两区通关与真机性能仍需验证。</p></section></div></html>`);
  await preview.screenshot({path:fileURLToPath(new URL('future-upgrade-preview.png',output))});await preview.close();
} catch(error) {report.status='failed';report.failure=error.stack;if(page)await shot('presentation-failure.png').catch(()=>{});throw error;}
finally {await writeFile(new URL('presentation-report.json',output),JSON.stringify(report,null,2));await browser.close();}
console.log(`Presentation checks passed: ${report.checks.length}`);
