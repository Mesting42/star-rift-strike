import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { LASER_MOUNTS } from './content.js';
import { PLAYER_AIRFRAME } from './collision.js';
import { GRAPHICS_PRESETS, isGraphicsQuality, readGraphicsQuality, saveGraphicsQuality } from './graphics.js';
import { EnergyExplosions } from './explosion-effects.js';
import { DEFAULT_PREFERENCES, EFFECT_LEVELS, normalizePreferences } from './preferences.js';
import { buildWeaponShot, updateWeaponShot } from './weapon-visuals.js';
import { buildHostileShot, updateHostileShot } from './hostile-visuals.js';
import { upgradeAircraft, upgradeObstacle } from './future-models.js';
import { buildFutureEnvironment, updateBeacons } from './future-environments.js';
import { SkillVisuals } from './skill-visuals.js';
import { updateProjectilePlumes } from './projectile-plumes.js';
import { CombatFeedback } from './combat-feedback.js';

// All of the aircraft and scenery are original, procedural hard-surface models.
const TAU = Math.PI * 2;
const palette = { hull: 0xd1d0c3, dark: 0x202c32, steel: 0x687a81, orange: 0xf09843, cyan: 0x87e9e7, red: 0xf55d35 };

function textureCanvas(size, draw) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

function polygon(points, thickness = .18) {
  const shape = new THREE.Shape();
  points.forEach(([x,z], i) => i ? shape.lineTo(x, -z) : shape.moveTo(x, -z));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: .055, bevelSize: .045, bevelSegments: 1, steps: 1 });
  geometry.rotateX(-Math.PI / 2); geometry.computeVertexNormals(); return geometry;
}

export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas; this.time = 0; this.theme = 0; this.lastFx = new Set(); this.entities = new Map(); this.effects = []; this.shake = 0;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.info.autoReset=false;
    this.preferences = { ...DEFAULT_PREFERENCES }; this.effectLevel = EFFECT_LEVELS.rich;
    this.quality = readGraphicsQuality();
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.17;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x183b46);
    this.scene.fog = new THREE.Fog(0x183b46, 48, 100);
    this.camera = new THREE.OrthographicCamera(-14, 14, 19, -19, .1, 160);
    this.camera.position.set(0, 38, 15); this.camera.lookAt(0, 0, 0);
    this.materials = new Map(); this.geometries = new Map();
    this.glowTexture = textureCanvas(64, (ctx,s) => { const g = ctx.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2); g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(.17,'rgba(255,255,255,.8)'); g.addColorStop(.42,'rgba(255,255,255,.21)'); g.addColorStop(1,'rgba(255,255,255,0)'); ctx.fillStyle=g;ctx.fillRect(0,0,s,s); });
    this.ambient = new THREE.HemisphereLight(0xb4e6ee, 0x19212a, 2.1); this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xffe9c9, 3.5); this.sun.position.set(-15,30,-18); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024,1024); this.sun.shadow.camera.left=-25;this.sun.shadow.camera.right=25;this.sun.shadow.camera.top=30;this.sun.shadow.camera.bottom=-30;this.sun.shadow.normalBias=.055; this.scene.add(this.sun);
    const rim = new THREE.DirectionalLight(0x7dd8e4, 1.3); rim.position.set(12,8,10); this.scene.add(rim);
    this.world = new THREE.Group(); this.world.position.y=-3.4; this.scene.add(this.world);
    this.decor = new THREE.Group(); this.scene.add(this.decor);
    this.actors = new THREE.Group(); this.scene.add(this.actors);
    this.particles = new THREE.Group(); this.scene.add(this.particles);
    this.player = this.buildPlayer(); this.actors.add(this.player);
    this.escorts = [-1,1].map(side=>{const m=this.buildDrone();m.userData.side=side;this.actors.add(m);return m;});
    this.shipLight = new THREE.PointLight(0x84ede4, 6, 6, 2); this.scene.add(this.shipLight);
    this.flashLight = new THREE.PointLight(0xff8240, 0, 15, 2); this.scene.add(this.flashLight);
    this.bossLight = new THREE.PointLight(0xff7249,0,22,2);this.scene.add(this.bossLight);
    this.explosions = new EnergyExplosions(this);
    this.skillVisuals = new SkillVisuals(this);
    // Canvas antialiasing does not cover the composer's offscreen scene. Use
    // MSAA on both HDR targets, restricted to sample counts the GPU supports.
    const gl = this.renderer.getContext();
    const colorSamples = Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES) || []);
    const depthSamples = Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, gl.SAMPLES) || []);
    this.supportedSamples = colorSamples.filter(samples => depthSamples.includes(samples));
    this.composer = new EffectComposer(this.renderer); this.composer.addPass(new RenderPass(this.scene,this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(600,800), .42, .33, 1.25); this.composer.addPass(this.bloom);
    this.feedback = new CombatFeedback(this);
    this.setTheme(1); this.resize();
  }

  mat(color, metal=.3, rough=.55, emissive=0) {
    const key = `${color}_${metal}_${rough}_${emissive}`;
    if (!this.materials.has(key)) this.materials.set(key,new THREE.MeshStandardMaterial({color,metalness:metal,roughness:rough,emissive:emissive?color:0,emissiveIntensity:emissive,flatShading:true}));
    return this.materials.get(key);
  }
  geo(key, create) { if(!this.geometries.has(key)) this.geometries.set(key,create());return this.geometries.get(key); }
  mesh(parent, geometry, material, x=0,y=0,z=0, scale=null) { const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);if(scale)m.scale.set(...scale);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m; }
  block(parent,x,y,z,sx,sy,sz,color,metal=.45) { return this.mesh(parent,this.geo('box',()=>new THREE.BoxGeometry(1,1,1)),this.mat(color,metal),x,y,z,[sx,sy,sz]); }
  plate(parent, key, points, color, y=.12, thick=.18) { return this.mesh(parent,this.geo(key,()=>polygon(points,thick)),this.mat(color,.55,.45),0,y,0); }
  glow(parent,x,y,z,color,size=1,opacity=.65) { const m=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowTexture,color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending}));m.position.set(x,y,z);m.scale.set(size,size,1);parent.add(m);return m; }
  engine(parent,x,z,size=.45,color=0x76eceb,y=.2) {
    const casing=this.mesh(parent,this.geo('engine',()=>new THREE.CylinderGeometry(.72,1,1,8)),this.mat(palette.dark,.75,.3),x,y,z,[size,size*2,size]);casing.rotation.x=Math.PI/2;
    const ring=this.mesh(parent,this.geo('ring',()=>new THREE.TorusGeometry(.5,.11,4,12)),this.mat(palette.steel,.7,.4),x,y,z+size,[size,size,size]);
    ring.rotation.x=0;
    this.mesh(parent,this.geo('flame',()=>new THREE.ConeGeometry(.48,1,7)),this.mat(color,.05,.25,3),x,y,z+size*1.6,[size*.7,size*2,size*.7]).rotation.x=Math.PI/2;
    const plume=this.glow(parent,x,y,z+size*2,color,size*3,.7);
    parent.userData.plumes ||= [];parent.userData.plumes.push(plume);
  }
  gun(parent,x,z,scale=1,color=palette.dark) {
    this.block(parent,x,.19,z,.24*scale,.24*scale,.8*scale,color);
    const barrel=this.mesh(parent,this.geo('barrel',()=>new THREE.CylinderGeometry(.09,.12,1,6)),this.mat(palette.steel,.8,.35),x,.2,z-.5*scale,[scale,.8*scale,scale]);barrel.rotation.x=Math.PI/2;
    this.block(parent,x,.2,z-.85*scale,.18*scale,.18*scale,.16*scale,palette.orange);
  }
  buildPlayer() {
    const group=new THREE.Group();
    this.plate(group,'player-hull',PLAYER_AIRFRAME.hull,0xb5cedc,.05,.32);
    this.plate(group,'player-wing',PLAYER_AIRFRAME.wings,0x8daabc,.08,.12);
    this.plate(group,'player-armor',[[-.3,1.65],[-.45,.5],[-.24,-1.3],[0,-1.95],[.24,-1.3],[.45,.5],[.3,1.65]],palette.dark,.4,.12);
    this.plate(group,'player-canopy',[[-.24,-.5],[-.2,-1.45],[0,-1.8],[.2,-1.45],[.24,-.5],[0,-.25]],0x6ab2c3,.55,.22);
    for(const side of [-1,1]) {
      this.plate(group,`player-orange-${side}`,[[side*.85,.55],[side*1.8,1.0],[side*1.85,1.19],[side*.8,.76]],0x49a4c8,.27,.06);
      this.block(group,side*1.05,.2,.95,.52,.48,1.2,palette.dark);
      this.block(group,side*1.08,.46,.85,.34,.08,.64,palette.steel);
      this.engine(group,side*1.05,1.55,.38);
      this.gun(group,side*1.5,.8,.8);
      const fin=this.plate(group,`player-fin-${side}`,[[side*.52,.3],[side*.85,1.5],[side*.48,1.6]],0x6597b9,.62,.1);fin.rotation.z=side*.5;
      this.glow(group,side*2.12,.28,1.02,side===1?0x70efb7:0xee7755,.3,.8);
    }
    for(let i=0;i<3;i++)this.block(group,0,.55,.35+i*.29,.43,.06,.09,palette.steel);
    const shield=this.mesh(group,this.geo('shield',()=>new THREE.IcosahedronGeometry(2.5,1)),new THREE.MeshBasicMaterial({color:0x8cdeed,transparent:true,opacity:.14,depthWrite:false}),0,0,0,[1,.32,1]);shield.visible=false;shield.castShadow=false;shield.receiveShadow=false; group.userData.shield=shield;
    shield.add(new THREE.LineSegments(this.geo('shield-facets',()=>new THREE.EdgesGeometry(shield.geometry)),new THREE.LineBasicMaterial({color:0x92f6ff,transparent:true,opacity:.4,depthWrite:false})));
    const outline=new THREE.Group();
    for(const [index,points] of [PLAYER_AIRFRAME.hull,PLAYER_AIRFRAME.wings].entries()) {
      const geometry=this.geo(`airframe-outline-${index}`,()=>new THREE.BufferGeometry().setFromPoints(points.map(([x,z])=>new THREE.Vector3(x,.79,z))));
      outline.add(new THREE.LineLoop(geometry,new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.9,depthWrite:false})));
    }
    outline.visible=false;group.add(outline);group.userData.core=outline;
    group.scale.setScalar(PLAYER_AIRFRAME.scale);return upgradeAircraft(this,group,'player');
  }

  buildEnemy(type) {
    if(type==='boss')return this.buildBoss();
    const group=new THREE.Group(); const heavy=type==='tank'||type==='carrier'||type==='elite';
    const colors={scout:0x596b8b,wing:0x6379a0,gunner:0x657b91,tank:0x46566f,laser:0x5c8392,carrier:0x4f6985,elite:0x77789a};
    const color=colors[type]||0xa86853;
    const hullPoints=heavy?[[-.7,1.7],[-1.0,.4],[-.68,-1.5],[0,-2],[.68,-1.5],[1,.4],[.7,1.7]]:[[-.36,1.5],[-.55,.5],[-.28,-1.7],[0,-2],[.28,-1.7],[.55,.5],[.36,1.5]];
    this.plate(group,`enemy-hull-${heavy}`,hullPoints,color,.03,heavy?.4:.25);
    this.plate(group,'enemy-canopy',[[-.27,-.5],[-.2,-1.3],[0,-1.65],[.2,-1.3],[.27,-.5]],palette.dark,.45,.16);
    this.glow(group,0,.65,-.8,0xff6238,.65,.7);
    let span=type==='wing'?2.25:heavy?2:1.3;
    this.plate(group,`enemy-wings-${span}`,[[-.2,-.7],[-span,-.1],[-span-.2,.7],[-.7,.65],[-.4,1.4],[.4,1.4],[.7,.65],[span+.2,.7],[span,-.1],[.2,-.7]],color,.03,.12);
    for(const s of [-1,1]){
      this.gun(group,s*(heavy?1.25:.85),-.5,heavy?1.1:.65);
      this.engine(group,s*(heavy?.85:.45),1.5,heavy?.4:.23,0xff6945);
      this.block(group,s*span*.73,.3,.3,.35,.13,.8,palette.dark);
      this.block(group,s*span*.73,.4,.35,.22,.08,.28,palette.orange);
    }
    if(type==='gunner'||type==='tank'){
      this.mesh(group,this.geo('turret',()=>new THREE.CylinderGeometry(.53,.68,.4,8)),this.mat(palette.steel,.7),0,.65,.3);
      this.gun(group,0,-.4,1.4); this.block(group,0,.7,-.35,.5,.45,1.4,palette.dark);
    }
    if(type==='laser'){
      this.block(group,0,.45,-.55,.6,.55,1.5,palette.dark);this.block(group,0,.78,-.45,.25,.08,1.2,0x6ad9ae);
      const muzzle = new THREE.Group();muzzle.position.set(0,.5,-LASER_MOUNTS.laser[0].z/.67);group.add(muzzle);
      this.block(muzzle,0,0,.28,.28,.28,.56,palette.dark);
      this.block(muzzle,0,0,0,.34,.3,.08,0x85cfae);
      this.glow(muzzle,0,0,-.03,0x99ffd0,.62,.65);
      group.userData.laserMuzzles=[muzzle];
    }
    if(type==='carrier')for(const s of [-1,1]){
      this.block(group,s*1.25,.2,.1,.7,.65,2.7,palette.dark);
      for(let i=0;i<3;i++)this.block(group,s*1.25,.57,-.8+i*.65,.5,.07,.25,palette.orange);
    }
    if(type==='elite'){
      this.plate(group,'elite-wing',[[-.8,-.4],[-3.0,-.1],[-2.7,1.5],[-1.4,1.2],[1.4,1.2],[2.7,1.5],[3,-.1],[.8,-.4]],palette.dark,-.06,.14);
      for(const s of [-1,1])this.gun(group,s*2.4,.1,1);
      this.glow(group,0,.75,.1,palette.orange,1.6,.4);
    }
    group.userData.hitGlow=this.glow(group,0,.9,0,0xffe8ac,2.6,.7);group.userData.hitGlow.visible=false;
    group.rotation.y=Math.PI;group.scale.setScalar(heavy?.78:.67);return upgradeAircraft(this,group,type);
  }
  buildDrone(){
    const g=new THREE.Group();
    this.plate(g,'drone-hull',[[-.3,1],[-.48,-.2],[0,-1.3],[.48,-.2],[.3,1]],0xb9c5b3,.05,.22);
    this.plate(g,'drone-wing',[[-.2,-.5],[-1.4,.35],[-1.2,.95],[-.3,.6],[.3,.6],[1.2,.95],[1.4,.35],[.2,-.5]],0x3e514b,.05,.1);
    this.block(g,0,.32,-.3,.23,.2,.65,0x8ed9bf);
    for(const s of [-1,1]){this.engine(g,s*.52,.74,.24,0xa7d880);this.gun(g,s*.84,.4,.5);}
    g.scale.setScalar(.42);g.visible=false;return upgradeAircraft(this,g,'drone');
  }
  buildBoss() {
    const group=new THREE.Group();
    this.plate(group,'boss-main',[[-1.2,4],[-2,2.2],[-1.8,-1.8],[-.8,-3.8],[0,-4.8],[.8,-3.8],[1.8,-1.8],[2,2.2],[1.2,4]],0x666e79,.1,.7);
    this.plate(group,'boss-wings',[[-1,-1.7],[-4.4,-.7],[-7,-1.8],[-7.6,1.8],[-5.8,3.3],[-2.2,2],[2.2,2],[5.8,3.3],[7.6,1.8],[7,-1.8],[4.4,-.7],[1,-1.7]],0x333e49,-.1,.45);
    this.plate(group,'boss-top',[[-.5,3.6],[-1.15,1.7],[-.8,-2],[0,-3.6],[.8,-2],[1.15,1.7],[.5,3.6]],0xb7b0a0,.88,.22);
    this.plate(group,'boss-core-frame',[[-.9,1.5],[-1.2,0],[-.7,-1.8],[.7,-1.8],[1.2,0],[.9,1.5]],palette.dark,1.15,.2);
    const core=this.mesh(group,this.geo('boss-core',()=>new THREE.IcosahedronGeometry(.75,1)),this.mat(0xfd9250,.35,.22,3.3),0,1.6,-.15,[1,.45,1.6]);group.userData.core=core;
    this.glow(group,0,1.8,-.15,0xff763d,4,.45);
    const turrets=[];
    for(const s of [-1,1]){
      this.block(group,s*5,.4,.5,1.4,.85,3.4,0x697983);
      this.block(group,s*5,.95,.8,1,.13,2.2,0xa4a69c);
      this.block(group,s*3.2,.45,1,1.5,.6,2.3,palette.dark);
      for(let i=0;i<4;i++)this.block(group,s*3.2,.8,.2+i*.45,1.1,.08,.15,palette.orange);
      const turret=new THREE.Group();turret.position.set(s*5.2,1.15,-.8);group.add(turret);
      this.mesh(turret,this.geo('boss-turret',()=>new THREE.CylinderGeometry(.65,.9,.5,8)),this.mat(0x303a43,.65),0,0,0);
      this.gun(turret,-.25,-.7,1.7);this.gun(turret,.25,-.7,1.7);turrets.push(turret);
      const mountIndex=s<0?2:0;
      const muzzle=new THREE.Group();muzzle.position.set(0,.2,-LASER_MOUNTS.boss[mountIndex].z/.9+.8);turret.add(muzzle);
      this.block(muzzle,0,0,.2,.4,.28,.5,palette.dark);this.glow(muzzle,0,0,0,0xffb46e,.9,.45);
      group.userData.laserMuzzles ||= [];group.userData.laserMuzzles[mountIndex]=muzzle;
      this.engine(group,s*5,2.2,.8,0xfe7b43,.35);
      this.engine(group,s*1.2,3.9,.7,0xfe7b43,.4);
      this.plate(group,`boss-tip-${s}`,[[s*6,-1],[s*7,-1.7],[s*7.4,.5],[s*6.4,1.5]],palette.orange,.52,.16);
      this.glow(group,s*7.1,.7,.4,0xff4032,1,.7);
    }
    const coreMuzzle=new THREE.Group();coreMuzzle.position.set(0,.81,-LASER_MOUNTS.boss[1].z/.9);group.add(coreMuzzle);
    this.block(coreMuzzle,0,0,.2,.55,.35,.6,palette.dark);this.glow(coreMuzzle,0,0,0,0xffb46e,1.2,.45);
    group.userData.laserMuzzles[1]=coreMuzzle;
    for(let i=0;i<5;i++)this.block(group,0,1.15,1.4+i*.39,.65,.1,.12,palette.dark);
    group.userData.hitGlow=this.glow(group,0,2,0,0xffe8ac,6,.55);group.userData.hitGlow.visible=false;
    group.userData.turrets=turrets;group.rotation.y=Math.PI;group.scale.setScalar(.9);return upgradeAircraft(this,group,'boss');
  }

  buildObstacle(type) {
    const g=new THREE.Group();
    if(type==='cover'){
      this.plate(g,'cover-shape',[[-1.4,-1.0],[-.7,-1.35],[1.1,-1.15],[1.45,-.6],[1.2,1.1],[-1.2,.9]],0x46505a,-1,.55);
      this.block(g,.1,-.45,0,2.2,.32,.6,palette.steel);this.block(g,-.6,-.2,0,.18,.2,1.6,palette.orange);
      for(let i=0;i<3;i++)this.block(g,.4+i*.28,-.23,0,.09,.08,.53,palette.dark);
    }else if(type==='barrel'){
      const glass=this.mesh(g,this.geo('fuelcell',()=>new THREE.CylinderGeometry(.64,.64,1.2,10)),new THREE.MeshStandardMaterial({color:0x6c9cb0,metalness:.15,roughness:.25,transparent:true,opacity:.25,depthWrite:false}),0,-.8,0);glass.castShadow=false;
      for(const y of [-1.25,-.4])this.mesh(g,this.geo('fuel-ring',()=>new THREE.TorusGeometry(.64,.085,4,10)),this.mat(palette.dark,.6),0,y,0).rotation.x=Math.PI/2;
      this.block(g,0,-.32,0,.5,.06,.32,palette.orange);this.glow(g,0,-.4,0,palette.orange,1.5,.24);
    }else if(type==='crate'){
      this.block(g,0,-.9,0,1.5,.75,1.4,0x818477);this.block(g,0,-.46,0,1.65,.1,1.5,palette.dark);
      for(const s of [-1,1])this.block(g,s*.46,-.38,0,.16,.09,1.5,palette.orange);
      this.block(g,0,-.25,0,.35,.18,.4,0xabbcaf);this.glow(g,0,-.05,0,0xb2e3a8,.8,.25);
    }else if(type==='mine'){
      this.mesh(g,this.geo('mine',()=>new THREE.IcosahedronGeometry(.6,0)),this.mat(palette.dark,.75),0,-.15,0);
      for(let i=0;i<6;i++){const a=i*TAU/6;const fin=this.block(g,Math.sin(a)*.55,-.15,Math.cos(a)*.55,.17,.22,.65,palette.steel);fin.rotation.y=a;}
      this.glow(g,0,.4,0,0xff5739,1.1,.65);
    }else{
      this.block(g,0,-1,0,2,.65,1,palette.dark);this.block(g,0,-.63,0,1.7,.1,.3,0xfd6e49);
      for(const s of [-1,1])this.block(g,s*.75,-.2,0,.3,.8,.5,palette.steel);
    }
    return upgradeObstacle(this,g,type);
  }
  buildDrop(type) {
    const g=new THREE.Group();const c=type==='heal'?0xa4e388:type==='key'?0xffce76:type==='shield'?0x84dfdd:0xffd185;
    if(type==='coin'){
      const body=this.mesh(g,this.geo('coin',()=>new THREE.CylinderGeometry(.25,.25,.1,6)),this.mat(c,.8,.25,1.15));body.rotation.x=Math.PI/2;
      this.block(g,0,.08,0,.05,.06,.32,0x654619);
    }else{
      this.mesh(g,this.geo('dropbox',()=>new THREE.OctahedronGeometry(.4,0)),this.mat(0x29373c,.7));
      if(type==='heal'){this.block(g,0,.4,0,.14,.08,.5,c);this.block(g,0,.4,0,.5,.08,.14,c);}
      else if(type==='key'){this.mesh(g,this.geo('keyring',()=>new THREE.TorusGeometry(.22,.06,4,8)),this.mat(c,.5,.3,1),0,.2,-.1).rotation.x=-Math.PI/2;this.block(g,0,.2,.27,.1,.1,.4,c);}
      else this.mesh(g,this.geo('shieldui',()=>new THREE.TorusGeometry(.25,.04,4,6)),this.mat(c,.5,.3,1),0,.3,0).rotation.x=-Math.PI/2;
    }
    this.glow(g,0,.1,0,c,1.4,.5);return g;
  }

  setTheme(sector) {
    if(this.theme===sector)return;this.theme=sector;
    buildFutureEnvironment(this,sector);
  }
  clearGroup(group){
    const cachedMaterials=new Set(this.materials.values()),cachedGeometry=new Set(this.geometries.values()),materials=new Set(),textures=new Set(),geometries=new Set();
    group.traverse(obj=>{if(obj.isInstancedMesh)obj.dispose();if(obj.geometry&&!cachedGeometry.has(obj.geometry))geometries.add(obj.geometry);for(const mat of Array.isArray(obj.material)?obj.material:obj.material?[obj.material]:[])if(!cachedMaterials.has(mat))materials.add(mat);});
    for(const mat of materials){if(mat.map&&mat.map!==this.glowTexture)textures.add(mat.map);mat.dispose();}for(const tex of textures)tex.dispose();for(const geo of geometries)geo.dispose();
    while(group.children.length)group.remove(group.children[0]);
  }
  bulletMesh(b) {
    return b.enemy ? buildHostileShot(this,b) : buildWeaponShot(this,b);
  }
  buildHazard(h){
    const g=new THREE.Group();const length=Math.max(.01,h.endZ-h.z);g.userData.initialLength=length;
    const warning=new THREE.Group();g.add(warning);
    const lineMat=new THREE.MeshBasicMaterial({color:0xf79555,transparent:true,opacity:.48,depthWrite:false});
    this.mesh(warning,this.geo('box',()=>new THREE.BoxGeometry(1,1,1)),lineMat,0,-.7,length/2,[h.width*2,.02,length]);
    for(let z=.36;z<length-.36;z+=1.45)this.mesh(warning,this.geo('box',()=>new THREE.BoxGeometry(1,1,1)),this.mat(0xffaa67,.1,.5,1.2),0,.12,z,[.055,.03,.72]);
    const beam=new THREE.Group();g.add(beam);beam.visible=false;
    this.mesh(beam,this.geo('box',()=>new THREE.BoxGeometry(1,1,1)),this.mat(0xfd6039,.05,.2,4),0,.1,length/2,[h.width*2,.18,length]);
    this.mesh(beam,this.geo('box',()=>new THREE.BoxGeometry(1,1,1)),this.mat(0xffedca,.05,.2,4),0,.18,length/2,[h.width*.42,.2,length]);
    for(let z=0;z<length;z+=3)this.glow(beam,0,.2,z,0xff6840,2.7,.4);
    g.userData.warning=warning;g.userData.beam=beam;return g;
  }
  effect(fx) {
    if(this.effects.length>65){
      if(!fx.type?.startsWith('skill-'))return;
      this.disposeEffect(this.effects.shift());
    }
    if(this.skillVisuals.handles(fx.type)){
      const effect=this.skillVisuals.create(fx);this.particles.add(effect.g);this.effects.push(effect);return;
    }
    if(fx.type==='explosion'){
      const effect=this.explosions.create(fx);this.particles.add(effect.g);this.effects.push(effect);return;
    }
    const g=new THREE.Group();g.position.set(fx.x||0,.45,fx.z||0);const type=fx.type||'hit';const col=fx.color|| (type==='emp'?0x93f0dd:0xff9e52);const scale=fx.scale||1;
    const burst=this.glow(g,0,0,0,col,1.7*scale,1);
    // Impact flashes accompany explosions, so they must not add a second
    // expanding circle. Rings remain for field / protection abilities.
    const shock=type==='hit'?null:this.mesh(g,this.geo('shock-ring',()=>new THREE.RingGeometry(.84,1,40)),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
    if(shock){shock.rotation.x=-Math.PI/2;shock.castShadow=false;shock.receiveShadow=false;}
    const bits=[];const count=type==='emp'?0:Math.max(2,Math.round(5*this.effectLevel.density));
    for(let i=0;i<count;i++){
      const m=this.mesh(g,this.geo('debris',()=>new THREE.TetrahedronGeometry(.13,0)),this.mat(i%3?0xb5aa8c:col,.4,.4,i%3?0:1.5));const a=Math.random()*TAU;const speed=2+Math.random()*6;bits.push({m,vx:Math.cos(a)*speed,vz:Math.sin(a)*speed,vy:1+Math.random()*6});
    }
    this.particles.add(g);this.effects.push({g,burst,shock,bits,t:0,max:type==='emp'?.7:.32,scale});
  }
  disposeEffect(e){
    this.particles.remove(e.g);
    if(e.kind==='energy-explosion'){this.explosions.dispose(e);return;}
    if(e.kind==='skill-visual'){this.skillVisuals.dispose(e);return;}
    e.burst.material.dispose();e.shock?.material.dispose();
    if(e.g.userData.bolt){e.g.userData.bolt.geometry.dispose();e.g.userData.bolt.material.dispose();}
  }
  sync(kind,list,build){
    const present=new Set();for(const item of list||[]){const key=`${kind}${item.id}`;present.add(key);let mesh=this.entities.get(key);
      if(!mesh){mesh=build.call(this,item);this.entities.set(key,mesh);this.actors.add(mesh);}
      mesh.position.x=item.x||0;mesh.position.z=item.z||0;mesh.visible=true;
      if(kind==='e'){
        mesh.position.y=.12+Math.sin(this.time*2+(Number(item.id)||0))*.1;
        mesh.rotation.z=Math.sin(this.time*2+(Number(item.id)||0))*(item.type==='boss'?.016:.04);
        if(mesh.userData.core){mesh.userData.core.rotation.y=this.time*(item.phase||1);mesh.userData.core.scale.y=.45+Math.sin(this.time*8)*.04;mesh.userData.core.material.emissiveIntensity=2.2+(item.phase||1);}
        if(mesh.userData.turrets)for(const t of mesh.userData.turrets)t.rotation.y=0;
        mesh.userData.hitGlow.visible=item.hit>0;
        mesh.scale.setScalar(item.type==='boss'?.9:((item.type==='tank'||item.type==='carrier'||item.type==='elite')?.78:.67)*(item.hit>0?1+Math.sin(this.time*80)*.025:1));
      }else if(kind==='b'){
        mesh.position.y=.4;mesh.rotation.y=Math.atan2(-(item.vx||0),-(item.vz||-1));
        if(item.enemy)updateHostileShot(this,mesh,item);else updateWeaponShot(this,mesh,item);
      }else if(kind==='d'){mesh.position.y=.35+Math.sin(this.time*3+(Number(item.id)||0))*.18;mesh.rotation.y=this.time*1.2;}
      else if(kind==='h'){
        mesh.position.y=(item.y??.47)-.1;
        mesh.scale.z=Math.max(.01,item.endZ-item.z)/mesh.userData.initialLength;
        mesh.userData.warning.visible=item.warning>0;mesh.userData.beam.visible=item.warning<=0;
        mesh.userData.warning.children[0].material.opacity=.17+.15*Math.sin(this.time*15);
      }
      if(mesh.userData.plumes)for(const p of mesh.userData.plumes)p.material.opacity=.6+Math.sin(this.time*21)*.14;
      this.animateHardware(mesh);
    }
    for(const [key,mesh]of this.entities)if(key.startsWith(kind)&&!present.has(key)){this.actors.remove(mesh);this.clearGroup(mesh);this.entities.delete(key);}
  }
  screenDeltaToWorld(dx,dy){
    const rect=this.canvas.getBoundingClientRect();
    const camera=this.camera;
    // Convert a screen-space drag to the actual X/Z flight plane. Camera
    // translation (including shake) cancels out; portrait and landscape agree.
    const delta=new THREE.Vector3(dx/Math.max(1,rect.width)*(camera.right-camera.left)/camera.zoom,
      -dy/Math.max(1,rect.height)*(camera.top-camera.bottom)/camera.zoom,0).applyQuaternion(camera.quaternion);
    const forward=camera.getWorldDirection(new THREE.Vector3());
    delta.addScaledVector(forward,-delta.y/forward.y);
    return {x:delta.x,z:delta.z};
  }
  setQuality(value){
    if(!isGraphicsQuality(value))return false;
    this.quality=value;saveGraphicsQuality(value);this.resize();return true;
  }
  setPreferences(value){
    this.preferences=normalizePreferences(value);this.effectLevel=EFFECT_LEVELS[this.preferences.effects];
    this.bloom.strength=.28+.14*this.effectLevel.glow;
    if(this.preferences.shake===0){this.camera.position.x=0;this.camera.position.z=15;}
  }
  animateHardware(group){
    for(const rotor of group.userData.reactors||[])rotor.rotation.y=this.time*1.4;
    if(group.userData.energyCage)group.userData.energyCage.rotation.y=this.time*.65;
  }
  applyGlowIntensity(group){
    group.traverse(obj=>{if(obj.isSprite){
      const m=obj.material;
      m.userData.baseOpacity=m.opacity;m.opacity*=this.effectLevel.glow;
    }});
  }
  restoreGlowIntensity(group){
    group.traverse(obj=>{if(obj.isSprite&&obj.material.userData.baseOpacity!==undefined)obj.material.opacity=obj.material.userData.baseOpacity;});
  }
  resize(){
    const rect=this.canvas.getBoundingClientRect();const w=Math.max(1,Math.round(rect.width||innerWidth)),h=Math.max(1,Math.round(rect.height||innerHeight));
    this.feedback?.resize(rect);
    const touch=document.documentElement.dataset.input==='touch';
    const preset=GRAPHICS_PRESETS[this.quality];
    // HD follows native screen density, with a total pixel budget for large
    // tablets. Quality changes resolution, never the logical flight area.
    const budget=touch?preset.touchPixels:preset.desktopPixels;
    const maxSize=this.renderer.capabilities.maxTextureSize;
    const ratio=Math.min(devicePixelRatio||1,touch?(preset.touchRatio||preset.maxRatio):preset.maxRatio,Math.sqrt(budget/(w*h)),maxSize/w,maxSize/h);
    const samples=Math.max(0,...this.supportedSamples.filter(count=>count<=preset.samples));
    for(const target of [this.composer.renderTarget1,this.composer.renderTarget2])if(target.samples!==samples){target.dispose();target.samples=samples;}
    this.renderer.setPixelRatio(ratio);this.composer.setPixelRatio(ratio);
    this.renderer.setSize(w,h,false);this.composer.setSize(w,h);
    const aspect=w/h;const halfHeight=Math.max(18.5,12.5/aspect);this.camera.left=-halfHeight*aspect;this.camera.right=halfHeight*aspect;this.camera.top=halfHeight;this.camera.bottom=-halfHeight;this.camera.updateProjectionMatrix();
  }
  update(game,dt=1/60){
    this.restoreGlowIntensity(this.actors);this.restoreGlowIntensity(this.particles);this.restoreGlowIntensity(this.decor);
    if(game.mode==='pause'||game.mode==='help'||game.mode==='settings'||game.mode==='inventory')dt=0;
    this.time+=dt;this.setTheme(game.sector||1);
    updateBeacons(this,dt);
    if(this.surfaceTexture)this.surfaceTexture.offset.y-=dt*(this.theme===1?.028:.04);
    for(const g of this.landmarks||[]){g.position.z+=dt*(this.theme===1?3:4.5);if(g.position.z>52)g.position.z-=115;}
    for(const c of this.clouds||[]){c.position.z+=dt*1.8;if(c.position.z>52)c.position.z-=100;}
    for(const scanner of this.sceneryAnim||[])scanner.rotation.y=this.time*.3;
    const p=game.player||{};const menu=game.mode==='menu';
    this.player.position.set(menu?5.2:(p.x??0),menu?1.3:.35,menu?-1:(p.z??9));
    this.player.scale.setScalar(menu?1.35:PLAYER_AIRFRAME.scale);
    this.bank=THREE.MathUtils.lerp(this.bank||0,dt>0?THREE.MathUtils.clamp(((p.x||0)-(this.prevX||0))/dt*.025,-.32,.32):this.bank||0,Math.min(1,dt*9));this.prevX=p.x||0;
    this.player.rotation.y=menu?-.32:0;this.player.rotation.z=menu?Math.sin(this.time*.8)*.07:-this.bank-(p.roll||0)*.35;
    this.player.rotation.x=menu?.1:Math.sin(this.time*3)*.015;
    this.player.visible=!(game.mode==='dead');
    const protectedNow=game.mode==='combat'&&p.inv>0;
    this.player.userData.shield.visible=protectedNow;this.player.userData.shield.rotation.y=this.time*.7;
    this.player.userData.shield.material.opacity=(p.invReason==='skill'?.15:.1)+Math.sin(this.time*18)*.025;
    this.player.userData.core.visible=!menu&&game.mode!=='dead'&&(protectedNow||game.precision||game.input?.slow||false);
    for(const line of this.player.userData.core.children) { line.material.color.set(protectedNow?0x9be5ee:0xffffff);line.material.opacity=protectedNow?.55+Math.sin(this.time*22)*.25:.85; }
    for(const glow of this.player.userData.plumes||[])glow.scale.y=1.14+.22*Math.sin(this.time*30);
    this.animateHardware(this.player);
    this.shipLight.position.set(this.player.position.x,.8,this.player.position.z+1.1);this.shipLight.intensity=menu?10:4;
    const boss=(game.enemies||[]).find(e=>e.type==='boss');this.bossLight.intensity=boss?15+boss.phase*5:0;if(boss)this.bossLight.position.set(boss.x,2,boss.z);
    const escortActive=game.items?.includes('escort')||game.has?.('escort')||game.droneTime>0;
    for(const drone of this.escorts){drone.visible=!menu&&escortActive;const s=drone.userData.side;drone.position.set((p.x||0)+s*(1.8+Math.sin(this.time*2)*.1),.25,(p.z||0)+.65);drone.rotation.z=-this.bank;this.animateHardware(drone);}
    this.sync('e',menu?[]:game.enemies,e=>this.buildEnemy(e.type));
    this.sync('b',menu?[]:game.bullets,e=>this.bulletMesh(e));
    this.sync('o',menu?[]:game.obstacles,e=>this.buildObstacle(e.type));
    this.sync('d',menu?[]:game.drops,e=>this.buildDrop(e.type));
    this.sync('h',menu?[]:game.hazards,e=>this.buildHazard(e));
    const ids=new Set();for(const f of game.fx||[]){ids.add(f.id);if(!this.lastFx.has(f.id))this.effect(f);}this.lastFx=ids;
    for(let i=this.effects.length-1;i>=0;i--){const e=this.effects[i];
      if(e.kind==='energy-explosion'){
        if(this.explosions.update(e,dt)){this.disposeEffect(e);this.effects.splice(i,1);}
        continue;
      }
      if(e.kind==='skill-visual'){
        if(this.skillVisuals.update(e,dt,game)){this.disposeEffect(e);this.effects.splice(i,1);}
        continue;
      }
      e.t+=dt;const q=e.t/e.max;
      e.burst.material.opacity=Math.max(0,1-q)*.9;e.burst.scale.setScalar((1+q*1.5)*e.scale*(e.max>.5?3:1));
      if(e.shock){e.shock.scale.setScalar((.2+q*5)*e.scale);e.shock.material.opacity=Math.max(0,1-q)*.75;}
      for(const b of e.bits){b.m.position.x+=b.vx*dt;b.m.position.z+=b.vz*dt;b.m.position.y+=b.vy*dt;b.vy-=12*dt;b.m.rotation.x+=dt*8;b.m.scale.setScalar(Math.max(.1,1-q));}
      if(q>=1){this.disposeEffect(e);this.effects.splice(i,1);}
    }
    this.flashLight.intensity*=Math.pow(.02,dt);this.shake*=Math.pow(.008,dt);
    this.applyGlowIntensity(this.actors);this.applyGlowIntensity(this.particles);this.applyGlowIntensity(this.decor);
    updateProjectilePlumes(this);
    if(dt>0){
      const amplitude=this.shake*this.preferences.shake;
      this.camera.position.x=amplitude?(Math.random()-.5)*amplitude:0;this.camera.position.z=15+(amplitude?(Math.random()-.5)*amplitude:0);
    }
    this.renderer.info.reset();this.composer.render(dt);
    this.feedback.update(game,dt);
  }
  dispose(){this.feedback.dispose();for(const e of this.effects)this.disposeEffect(e);this.effects=[];this.clearGroup(this.actors);this.clearGroup(this.decor);this.clearGroup(this.world);this.entities.clear();this.glowTexture.dispose();this.bloom.dispose();this.renderer.dispose();this.composer.dispose();for(const m of this.materials.values())m.dispose();for(const g of this.geometries.values())g.dispose();}
}
