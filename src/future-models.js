import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU=Math.PI*2;

// Bake static panels by material. Small structural details do not each cost a
// draw call; animated reactors, turrets, shields and lights remain independent.
export function assembleHardware(r,root,key) {
  root.updateMatrixWorld(true);
  const inverse=root.matrixWorld.clone().invert(), batches=new Map();
  const cached=new Set(r.materials.values());
  root.traverse(obj=>{
    if(!obj.isMesh||!cached.has(obj.material))return;
    for(let parent=obj;parent&&parent!==root;parent=parent.parent)if(parent.userData.dynamic)return;
    if(!batches.has(obj.material))batches.set(obj.material,[]);
    batches.get(obj.material).push(obj);
  });
  let index=0;
  for(const [material,parts]of batches) {
    if(parts.length<2)continue;
    const geometry=r.geo(`assembly-${key}-${index++}`,()=>{
      const clones=parts.map(part=>{
        let geo=part.geometry.clone();
        if(geo.index){const expanded=geo.toNonIndexed();geo.dispose();geo=expanded;}
        // All procedural hardware needs position, normal and UV attributes.
        for(const name of Object.keys(geo.attributes))if(!['position','normal','uv'].includes(name))geo.deleteAttribute(name);
        return geo.applyMatrix4(inverse.clone().multiply(part.matrixWorld));
      });
      const merged=mergeGeometries(clones,false);for(const clone of clones)clone.dispose();
      if(!merged)throw new Error(`Unable to assemble ${key}`);return merged;
    });
    for(const part of parts)part.removeFromParent();
    r.mesh(root,geometry,material);
  }
  root.userData.modelRevision='future-2';
  return root;
}

function reactor(r,g,x,y,z,size,color) {
  const hub=new THREE.Group();hub.position.set(x,y,z);hub.userData.dynamic=true;g.add(hub);
  const rotor=r.mesh(hub,r.geo('reactor-poly',()=>new THREE.CylinderGeometry(1,1,.18,6)),r.mat(0x1c2b3d,.8,.25),0,0,0,[size,size,size]);
  rotor.userData.dynamic=true;
  r.mesh(hub,r.geo('reactor-lens',()=>new THREE.OctahedronGeometry(1,0)),r.mat(color,.25,.2,2),0,.12*size,0,[size*.43,size*.25,size*.43]);
  for(let i=0;i<6;i++) {
    const a=i*TAU/6,bar=r.block(hub,Math.cos(a)*size*.76,.13*size,Math.sin(a)*size*.76,size*.22,.07*size,size*.12,color,.4);bar.rotation.y=-a;
    bar.material=r.mat(color,.3,.25,1.2);
  }
  g.userData.reactors ||= [];g.userData.reactors.push(rotor);
  assembleHardware(r,hub,`reactor-${size}-${color}`);
  return hub;
}

export function upgradeAircraft(r,g,type) {
  const player=type==='player', drone=type==='drone', boss=type==='boss';
  const light=player?0x74dfff:drone?0xa4fbc5:0xff784c;
  const armor=player?0xb5cedc:drone?0x769d9e:0x546a86;
  const dark=0x172a3d;
  if(boss) {
    for(const s of [-1,1]) {
      for(let i=0;i<3;i++) {
        const x=s*(2.4+i*1.4);
        r.plate(g,`boss-future-plate-${s}-${i}`,[[x-s*.46,-1.3],[x+s*.5,-1.1],[x+s*.66,1.25],[x-s*.38,1.6]],i%2?0x7990aa:dark,.95,.12);
        r.block(g,x,1.17,.35,.09,.045,1.8,light).material=r.mat(light,.15,.3,1.3);
      }
      reactor(r,g,s*3.25,1.16,.35,.56,light);
      for(let i=0;i<3;i++)r.block(g,s*5.5,1.16,-.7+i*.53,.6,.12,.16,0xa5bdd3);
      const fin=r.block(g,s*6.15,.85,.95,.1,.9,1.9,dark);fin.rotation.z=s*.4;
      r.plate(g,`boss-front-armor-${s}`,[[s*1.05,-3.5],[s*1.7,-1.7],[s*1.3,-.8],[s*.8,-2.2]],0x5e7c99,1.2,.16);
    }
    const cage=new THREE.Group();cage.position.set(0,1.5,-.15);cage.userData.dynamic=true;g.add(cage);
    for(let i=0;i<3;i++){const ring=r.mesh(cage,r.geo('boss-reactor-frame',()=>new THREE.TorusGeometry(1.25,.065,4,6)),r.mat(0xe8915d,.65,.3,.5));ring.rotation.set(Math.PI/2,i*.7,i*.65);}
    g.userData.energyCage=cage;
    g.userData.core.userData.dynamic=true;
    for(const turret of g.userData.turrets)turret.userData.dynamic=true;
  } else {
    const span=player?1.55:drone?.85:type==='wing'?1.75:['tank','carrier','elite'].includes(type)?1.55:1;
    for(const s of [-1,1]) {
      r.plate(g,`${type}-armor-wing-${s}`,[[s*.58,-.24],[s*(span+.23),.64],[s*(span+.3),1.02],[s*.84,.76]],armor,.31,.075);
      r.plate(g,`${type}-wing-channel-${s}`,[[s*.72,.24],[s*(span+.17),.8],[s*(span+.16),.9],[s*.74,.37]],dark,.42,.025);
      const strip=r.block(g,s*(span*.7),.47,.64,.06,.026,.47,light);strip.material=r.mat(light,.2,.25,1.25);strip.rotation.y=-s*.85;
      r.block(g,s*.29,.57,.53,.09,.055,.93,dark);
      r.block(g,s*.27,.62,.02,.035,.025,.3,light).material=r.mat(light,.1,.3,1);
      for(let i=0;i<3;i++)r.block(g,s*(player?1.03:.55),.58,.6+i*.17,player?.27:.17,.045,.06,0x36506a);
    }
    r.plate(g,`${type}-visor`,[[-.16,-.66],[0,-1.61],[.16,-.66],[0,-.4]],player?0x72d9ed:0x975463,.73,.08);
    r.block(g,0,.82,-.8,.04,.025,.67,light).material=r.mat(light,.2,.3,1.1);
    reactor(r,g,0,.65,.7,drone?.17:player?.23:.3,light);
    if(type==='wing')for(const s of [-1,1]) {
      const fin=r.plate(g,`wing-future-fin-${s}`,[[s*1.4,.15],[s*2.2,.55],[s*2.08,1.01],[s*1.68,.65]],dark,.4,.08);fin.rotation.z=s*.18;
    }
    if(type==='scout')for(const s of [-1,1])r.plate(g,`scout-canard-${s}`,[[s*.25,-1.1],[s*.84,-.75],[s*.7,-.45],[s*.25,-.73]],dark,.33,.07);
    if(type==='gunner'||type==='tank') {
      for(const s of [-1,1]) {
        r.block(g,s*.55,.72,-.5,.3,.28,.9,dark);
        for(let i=0;i<3;i++)r.block(g,s*.55,.88,-.67+i*.2,.24,.06,.05,light).material=r.mat(light,.15,.3,.9);
      }
    }
    if(type==='carrier')for(const s of [-1,1]) {
      r.block(g,s*1.25,.68,.1,.72,.13,2.25,armor);
      for(let i=0;i<3;i++){r.block(g,s*1.25,.78,-.55+i*.67,.47,.08,.4,dark);r.block(g,s*1.25,.83,-.56+i*.67,.27,.025,.05,light).material=r.mat(light,.15,.3,1);}
    }
    if(type==='laser') {
      for(const s of [-1,1]) {
        r.block(g,s*.35,.74,-.83,.13,.1,.87,dark);
        for(let i=0;i<3;i++)r.block(g,s*.35,.81,-1.13+i*.22,.13,.035,.08,light).material=r.mat(light,.2,.25,1.2);
      }
    }
    if(type==='elite')for(const s of [-1,1]) {
      r.plate(g,`elite-floating-armor-${s}`,[[s*1.4,.4],[s*2.6,.1],[s*2.52,1.15],[s*1.65,1.1]],0x8e91af,.56,.16);
      reactor(r,g,s*2,.8,.7,.25,light);
    }
  }
  return assembleHardware(r,g,`aircraft-${type}`);
}

export function upgradeObstacle(r,g,type) {
  if(type==='cover') {
    for(const s of [-1,1]){r.block(g,s*.8,-.12,0,.45,.22,1.22,0x708ca0);r.block(g,s*.8,.025,.1,.055,.035,.8,0x9bc0d4);}
    const spar=r.block(g,.2,.03,0,1.6,.14,.13,0x1b3040);spar.rotation.y=.45;
    r.block(g,-.5,.15,.15,.18,.035,.42,0xebae64);
  } else if(type==='barrel') {
    for(let i=0;i<6;i++){const a=i*TAU/6;r.block(g,Math.cos(a)*.53,-.71,Math.sin(a)*.53,.13,.68,.13,0x183346);}
    r.mesh(g,r.geo('fuel-glass',()=>new THREE.CylinderGeometry(.42,.42,.7,12)),r.mat(0xfbb45f,.15,.3,1),0,-.7,0);
    r.block(g,0,-.25,0,.2,.1,.3,0x99afbd);
  } else if(type==='crate') {
    for(const s of [-1,1]) {
      r.block(g,s*.66,-.85,0,.15,.6,1.52,0x385369);
      r.block(g,0,-.35,s*.55,1.13,.08,.13,0x9faeba);
      r.block(g,s*.58,-.28,0,.035,.025,.7,0x77ead1).material=r.mat(0x77ead1,.1,.3,1);
    }
    r.block(g,0,-.22,0,.48,.1,.5,0x284459);
    r.block(g,0,-.15,0,.29,.025,.12,0x9febcd).material=r.mat(0x9febcd,.1,.3,1.4);
  } else if(type==='mine') {
    r.mesh(g,r.geo('mine-collar',()=>new THREE.TorusGeometry(.45,.08,4,8)),r.mat(0x8ca5b9,.75,.3),0,.13,0).rotation.x=Math.PI/2;
    for(let i=0;i<4;i++){const a=i*TAU/4;r.mesh(g,r.geo('mine-sensor',()=>new THREE.OctahedronGeometry(.1)),r.mat(0xff8862,.15,.3,1.7),Math.cos(a)*.38,.18,Math.sin(a)*.38);}
  }
  return assembleHardware(r,g,`obstacle-${type}`);
}
