import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output=new URL('../test-results/',import.meta.url);await mkdir(output,{recursive:true});
const report={started:new Date().toISOString(),url:process.env.GAME_URL||'http://127.0.0.1:5173/',checks:[],errors:[],
  fixture:'Independent real renderer/weapon scenarios with GPU pixel comparisons and native canvas recording. Not a full campaign or real-device benchmark.'};
const pass=(name,detail={})=>{report.checks.push({name,...detail});console.log(`PASS ${name}`);};
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
  args:['--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
let page;
try{
  page=await browser.newPage({viewport:{width:900,height:640},deviceScaleFactor:1});
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
  await page.goto(report.url);await page.waitForFunction(()=>!!window.__STAR_RIFT__);
  await page.evaluate(()=>{
    const {game:g,renderer:r}=window.__STAR_RIFT__;g.start(31415);g.enterCombat(g.map.nodes.find(n=>n.type==='combat'));
    g.update=()=>{};window.__plumeStep=r.update.bind(r);r.update=()=>{};
    g.bullets=[];g.enemies=[];g.obstacles=[];g.drops=[];g.fx=[];g.hazards=[];g.autoFire=false;
    r.setPreferences({effects:'rich',shake:0});r.time=2;r.shake=0;
    document.getElementById('ui').style.display='none';document.getElementById('touch-controls').style.display='none';document.getElementById('toast').style.visibility='hidden';
    r.world.visible=r.decor.visible=r.particles.visible=false;r.scene.background.set(0x010205);r.scene.fog=null;
    r.camera.left=-1.7;r.camera.right=1.7;r.camera.top=2.8;r.camera.bottom=-2.8;r.camera.updateProjectionMatrix();
    window.__plumeCapture=id=>{
      const mesh=r.entities.get(`b${id}`);
      for(const child of r.actors.children)child.visible=child===mesh;
      for(const child of mesh.children)child.visible=child.name==='projectile-plume';
      r.composer.render(0);const gl=r.renderer.getContext(),pixels=new Uint8Array(r.canvas.width*r.canvas.height*4);
      gl.readPixels(0,0,r.canvas.width,r.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;
    };
    window.__plumeDiff=(a,b)=>{let changed=0,lit=0;for(let i=0;i<a.length;i+=4){if(Math.max(a[i],a[i+1],a[i+2],b[i],b[i+1],b[i+2])>45){lit++;if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>10)changed++;}}return {changed,lit};};
  });
  // Let the application's queued combat layout resize finish before setting
  // the close-up camera used for pixel comparisons.
  await page.waitForTimeout(100);
  await page.evaluate(()=>{const r=window.__STAR_RIFT__.renderer;r.camera.left=-1.7;r.camera.right=1.7;r.camera.top=2.8;r.camera.bottom=-2.8;r.camera.updateProjectionMatrix();});
  const animation=await page.evaluate(()=>{
    const {game:g,renderer:r}=window.__STAR_RIFT__;
    const a=g.enemyShot({type:'gunner',x:0,z:-.5},0),b=g.enemyShot({type:'gunner',x:0,z:-.5},0);
    window.__plumeStep(g,0);const first=window.__plumeCapture(a.id),different=window.__plumeCapture(b.id);
    const phase=window.__plumeDiff(first,different);
    const m=r.entities.get(`b${a.id}`);m.position.x+=2;r.camera.position.x+=2;
    const translated=window.__plumeDiff(first,window.__plumeCapture(a.id));m.position.x-=2;r.camera.position.x-=2;
    window.__plumeStep(g,.16);const moved=window.__plumeCapture(a.id),motion=window.__plumeDiff(first,moved);
    const beforePause=r.time;g.mode='pause';window.__plumeStep(g,.7);const paused=window.__plumeDiff(moved,window.__plumeCapture(a.id));
    const heldTime=r.time;g.mode='combat';window.__plumeStep(g,.13);const resumed=window.__plumeDiff(moved,window.__plumeCapture(a.id));
    return {phase,translated,motion,paused,resumed,beforePause,heldTime,gl:r.renderer.getContext().getError()};
  });
  assert.ok(animation.motion.changed>500&&animation.resumed.changed>500);assert.equal(animation.gl,0);
  pass('actual GPU flame pixels roll and break up over time, then resume after pause',{motion:animation.motion,resumed:animation.resumed});
  assert.equal(animation.paused.changed,0);assert.equal(animation.beforePause,animation.heldTime);
  pass('pausing freezes the flame image and renderer clock exactly');
  assert.ok(animation.phase.changed>500);assert.ok(animation.translated.changed<animation.translated.lit*.015);
  pass('shared materials keep separate shot phases; projectile movement does not reset or reverse the fire field',{phase:animation.phase,translated:animation.translated});

  const weapons=await page.evaluate(async()=>{
    const {WEAPONS}=await import('/src/content.js'),{game:g,renderer:r}=window.__STAR_RIFT__;g.bullets=[];g.weapons=WEAPONS.map(w=>w.id);g.player.x=g.player.z=0;
    return WEAPONS.map((w,i)=>{
      g.bullets=[];g.fx=[];g.weaponIndex=i;g.firePlayer();window.__plumeStep(g,0);
      const b=g.bullets[0],mesh=r.entities.get(`b${b.id}`),plume=mesh.getObjectByName('projectile-plume'),at=plume.getWorldPosition(mesh.position.clone());
      return {id:w.id,plume:!!plume,shader:plume.material.isShaderMaterial,combustion:plume.material.uniforms.uCombustion.value,
        behind:(at.x-b.x)*b.vx+(at.z-b.z)*b.vz<0,visualOnly:plume.userData.visualOnly,casts:plume.castShadow};
    });
  });
  assert.ok(weapons.every(w=>w.plume&&w.shader&&w.behind&&w.visualOnly&&!w.casts));
  assert.deepEqual(weapons.filter(w=>w.combustion===1).map(w=>w.id),['vulcan','scatter','rocket']);
  pass('all eight actual-fired player weapons have a flowing plume behind the projectile, with appropriate flame/energy palettes',{weapons:weapons.map(w=>w.id)});
  const color=await page.evaluate(()=>{
    const {game:g,renderer:r}=window.__STAR_RIFT__;
    const stats=id=>{const pixels=window.__plumeCapture(id),rgb=[0,0,0];let count=0;for(let i=0;i<pixels.length;i+=4)if(Math.max(...pixels.subarray(i,i+3))>70){count++;for(let k=0;k<3;k++)rgb[k]+=pixels[i+k];}return {count,rgb:rgb.map(n=>n/Math.max(1,count))};};
    g.bullets=[];g.fx=[];const warm=g.enemyShot({type:'boss',x:0,z:-.5},.7,7,{r:.32});window.__plumeStep(g,0);const red=stats(warm.id);
    g.bullets=[];g.weaponIndex=g.weapons.indexOf('rail');g.firePlayer();const blue=g.bullets[0];blue.x=blue.z=0;window.__plumeStep(g,0);return {red,blue:stats(blue.id)};
  });
  assert.ok(color.red.count>500&&color.red.rgb[0]>color.red.rgb[1]&&color.red.rgb[1]>color.red.rgb[2],JSON.stringify(color));
  assert.ok(color.blue.count>500&&color.blue.rgb[2]>color.blue.rgb[0],JSON.stringify(color));pass('enemy burning gas reads red/orange while rail energy stays blue in rendered pixels',color);
  const low=await page.evaluate(()=>{
    const {game:g,renderer:r}=window.__STAR_RIFT__;for(const b of g.bullets)for(const c of r.entities.get(`b${b.id}`).children)c.visible=true;
    r.setPreferences({effects:'simple',shake:0});window.__plumeStep(g,0);
    return g.bullets.map(b=>{const m=r.entities.get(`b${b.id}`);return {plume:m.getObjectByName('projectile-plume').visible,body:m.children[0].visible};});
  });
  assert.ok(low.every(v=>!v.plume&&v.body));pass('minimal effects hide the flame workload and preserve the physical projectile');
  const reuse=await page.evaluate(()=>{
    const {game:g,renderer:r}=window.__STAR_RIFT__;r.setPreferences({effects:'rich',shake:0});
    const cycle=()=>{g.bullets=[];for(let i=0;i<140;i++)g.enemyShot({type:['scout','wing','gunner','tank','carrier','elite','boss'][i%7],x:(i%14-7)*.2,z:(Math.floor(i/14)-5)*.3},0);window.__plumeStep(g,0);const busy=r.renderer.info.render.calls;g.bullets=[];window.__plumeStep(g,0);return {busy,clear:r.renderer.info.render.calls};};
    const cost=cycle(),before={...r.renderer.info.memory,programs:r.renderer.info.programs.length};for(let i=0;i<4;i++)cycle();
    return {cost,before,after:{...r.renderer.info.memory,programs:r.renderer.info.programs.length},entities:[...r.entities.keys()].filter(k=>k.startsWith('b')).length,gl:r.renderer.getContext().getError()};
  });
  assert.deepEqual(reuse.before,reuse.after);assert.equal(reuse.entities,0);assert.equal(reuse.gl,0);assert.ok(reuse.cost.busy-reuse.cost.clear<=140*4+8);
  pass('140-shot bursts reuse flame geometry, shaders and programs with four draw calls per enemy shot and no retained entities',reuse);

  await page.evaluate(()=>{
    const {game:g,renderer:r}=window.__STAR_RIFT__;g.bullets=[];g.fx=[];g.weapons=['rocket','rail'];g.player.x=g.player.z=0;
    g.enemyShot({type:'scout',x:-3.15,z:-.5},0,7);
    for(const [i,x]of [[0,-1.05],[1,1.05]]){g.weaponIndex=i;g.firePlayer();const b=g.bullets.at(-1);b.x=x;b.z=0;}
    g.enemyShot({type:'boss',x:3.15,z:-.5},0,7,{r:.32});g.fx=[];
    r.camera.position.x=0;r.camera.left=-4.5;r.camera.right=4.5;r.camera.top=4;r.camera.bottom=-4;r.camera.updateProjectionMatrix();
    window.__galleryRender=dt=>{
      window.__plumeStep(g,dt);r.player.visible=false;for(const d of r.escorts)d.visible=false;
      for(const b of g.bullets){const m=r.entities.get(`b${b.id}`);m.visible=true;for(const c of m.children)c.visible=true;}
      r.composer.render(0);
    };window.__galleryRender(0);
    const labels=['敌方截击弹','玩家追踪导弹','轨道炮能量尾流','Boss 重型炮弹'];
    const overlay=document.createElement('canvas');overlay.id='plume-recording';overlay.width=900;overlay.height=640;overlay.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none';document.body.append(overlay);
    const ctx=overlay.getContext('2d');window.__composePlumePreview=()=>{
      ctx.drawImage(r.canvas,0,0,900,640);ctx.fillStyle='#d4dee0';ctx.font='22px Microsoft YaHei';ctx.fillText('STAR RIFT · 动态火焰与能量尾流',24,38);
      ctx.fillStyle='#819aa9';ctx.font='13px Microsoft YaHei';ctx.fillText('亮核 · 翻卷火舌 · 气流扰动 · 余焰衰减 · 原游戏近距离渲染',24,66);
      ctx.font='14px Microsoft YaHei';ctx.fillStyle='#d8c8b4';ctx.textAlign='center';labels.forEach((text,i)=>ctx.fillText(text,135+i*210,560));ctx.textAlign='left';
      ctx.fillStyle='#778c96';ctx.font='12px Microsoft YaHei';ctx.fillText('独立外观展示场景；不作为整局通关或真机性能证明。',24,614);
    };window.__composePlumePreview();
  });
  await page.screenshot({path:fileURLToPath(new URL('projectile-flames-preview.png',output))});
  const recording=await page.evaluate(async()=>{
    const canvas=document.getElementById('plume-recording'),stream=canvas.captureStream(24);
    const type=['video/webm;codecs=vp9','video/webm;codecs=vp8'].find(t=>MediaRecorder.isTypeSupported(t));
    const recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:1700000}),chunks=[];
    const ended=new Promise(resolve=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=resolve;});
    recorder.start();let start,last;
    await new Promise(resolve=>{function animate(now){start??=now;last??=now;window.__galleryRender(Math.min(.05,(now-last)/1000));last=now;window.__composePlumePreview();if(now-start<3200)requestAnimationFrame(animate);else resolve();}requestAnimationFrame(animate);});
    recorder.stop();await ended;stream.getTracks().forEach(t=>t.stop());
    const blob=new Blob(chunks,{type}),data=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob);});
    return {data,type,bytes:blob.size};
  });
  assert.ok(recording.bytes>10000);await writeFile(new URL('projectile-flames-preview.webm',output),Buffer.from(recording.data,'base64'));
  pass('native game flames render and record without JavaScript or WebGL shader errors',{videoBytes:recording.bytes,type:recording.type});
  const decoded=await page.evaluate(async url=>{
    const video=document.createElement('video');video.muted=true;video.playsInline=true;video.style.cssText='position:fixed;width:1px;height:1px;opacity:0;pointer-events:none';video.src=url;document.body.append(video);
    await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(Error('Preview video decode failed'));});
    const frame=document.createElement('canvas');frame.width=video.videoWidth;frame.height=video.videoHeight;const ctx=frame.getContext('2d');
    const sample=()=>{ctx.drawImage(video,0,0);return ctx.getImageData(0,0,frame.width,frame.height).data;};
    const reaches=seconds=>new Promise(resolve=>{video.ontimeupdate=()=>{if(video.currentTime>seconds)resolve();};});
    await video.play();await reaches(.3);const a=sample();await reaches(1.4);
    const difference=window.__plumeDiff(a,sample()),result={width:video.videoWidth,height:video.videoHeight,seconds:video.currentTime,...difference};
    video.pause();video.remove();return result;
  },`${report.url}test-results/projectile-flames-preview.webm`);
  assert.equal(decoded.width,900);assert.equal(decoded.height,640);assert.ok(decoded.changed>500);
  pass('the saved video decodes and shows changing flame pixels during actual playback',decoded);
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;if(page)await page.screenshot({path:fileURLToPath(new URL('plume-failure.png',output))}).catch(()=>{});throw error;}
finally{await writeFile(new URL('plume-report.json',output),JSON.stringify(report,null,2));await browser.close();}
console.log(`Projectile-plume checks passed: ${report.checks.length}`);
