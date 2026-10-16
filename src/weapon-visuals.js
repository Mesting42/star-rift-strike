import * as THREE from 'three';
import { attachProjectilePlume } from './projectile-plumes.js';

const kindIds = { bullet: 'vulcan', shotgun: 'scatter', pierce: 'rail', missile: 'rocket', laser: 'beam', beam: 'beam', arc: 'arc', boomerang: 'orbit', charge: 'nova' };
const weaponIds=new Set(Object.values(kindIds));
export function weaponIdentity(b) { return weaponIds.has(b.weapon) ? b.weapon : kindIds[b.type] || 'vulcan'; }

// Each original projectile has a readable physical head plus optional energy
// layers. Trails are attached to the projectile, so homing and return flights
// cannot leave stale beams or unbounded particle streams behind them.
export function buildWeaponShot(r, b) {
  const g = new THREE.Group(), id = weaponIdentity(b);
  const color = b.color || 0x9aeeff;
  g.userData.weaponVisual = id;
  const details = g.userData.details = [];
  const box = (x,y,z,sx,sy,sz,c=color,e=1) => r.mesh(g,r.geo('box',()=>new THREE.BoxGeometry(1,1,1)),r.mat(c,.15,.28,e),x,y,z,[sx,sy,sz]);
  const crystal = (key,x,y,z,sx,sy,sz,c=color,e=1) => r.mesh(g,r.geo(key,()=>new THREE.OctahedronGeometry(1,0)),r.mat(c,.3,.25,e),x,y,z,[sx,sy,sz]);
  const trail = (width,length,c=color) => {
    const start={vulcan:.32,scatter:.31,rail:1.44,rocket:.29,beam:.245,arc:.68,orbit:.47,nova:.51}[id];
    return attachProjectilePlume(r,g,{width:width*1.8,length,start,color:c,
      combustion:['vulcan','scatter','rocket'].includes(id),seed:b.id||0});
  };
  const halo = (size,opacity=.3) => { const m=r.glow(g,0,.02,0,color,size,opacity);details.push(m);return m; };
  const ring = (radius,thickness,c=color) => r.mesh(g,r.geo(`shot-ring-${radius}-${thickness}`,()=>new THREE.TorusGeometry(radius,thickness,4,18)),r.mat(c,.25,.25,1.8));
  if(id==='vulcan') {
    crystal('kinetic-tip',0,0,-.15,.1,.08,.29,0xffe1a3,1.25);
    box(0,0,.16,.16,.14,.27,0x9c6331,.25);
    for(const s of [-1,1])details.push(box(s*.07,.015,.42,.025,.04,.58,0xffb759,2));
    trail(.11,.8);halo(.58,.22);
  } else if(id==='scatter') {
    const head=crystal('scatter-head',0,0,-.05,.16,.09,.22,0xffb278,1.1);head.rotation.z=Math.PI/4;
    for(const s of [-1,1]){const fin=box(s*.105,0,.16,.08,.055,.3,0xdb7c47,.5);fin.rotation.y=s*.3;}
    trail(.21,.58,0xff9651);halo(.7,.26);
  } else if(id==='rail') {
    crystal('rail-tip',0,.025,-.22,.075,.075,.54,0xd2eaff,1.7);
    box(0,0,.37,.065,.08,.55,0x98d6ec,2.3);
    for(const s of [-1,1])details.push(box(s*.13,0,.8,.035,.035,1.3,0x359bff,.75));
    for(let i=0;i<3;i++)details.push(box(0,.015,.35+i*.38,.31-i*.045,.03,.04,0xb6ebff,2));
    trail(.16,2.3,0x7fcfff);halo(.9,.2);
  } else if(id==='rocket') {
    const body=r.mesh(g,r.geo('future-missile',()=>new THREE.CylinderGeometry(.1,.13,.54,8)),r.mat(0xc5d9de,.7,.3),0,0,.02);body.rotation.x=Math.PI/2;
    const nose=r.mesh(g,r.geo('missile-nose',()=>new THREE.ConeGeometry(.105,.26,8)),r.mat(0x4a6b83,.65,.25),0,0,-.37);nose.rotation.x=-Math.PI/2;
    for(const s of [-1,1]){const fin=box(s*.155,0,.17,.17,.045,.26,0xb1c7d2,0);fin.rotation.y=s*.3;}
    box(0,.12,.1,.065,.025,.26,0xff995f,1.5);
    trail(.22,1.5,0xff8055);halo(.75,.25);
  } else if(id==='beam') {
    box(0,.025,-.63,.08,.08,1.75,0x8bfff0,1.45);
    for(const s of [-1,1]) {
      box(s*.12,0,-.55,.04,.06,1.45,0x35c9d5,1.5);
      for(let i=0;i<3;i++)details.push(box(s*(.16+i*.025),.01,-1+i*.48,.055,.04,.19,0x95ffef,1.5));
    }
    trail(.17,1.1,0x48b8d1);halo(.8,.2);
  } else if(id==='arc') {
    const node=crystal('arc-node',0,0,0,.15,.14,.23,0xccafff,1.2);g.userData.rotor=node;
    const geo=r.geo('arc-projectile-path',()=>new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-.17,0,-.21),new THREE.Vector3(-.29,0,.05),new THREE.Vector3(-.13,0,.14),new THREE.Vector3(-.24,0,.48),new THREE.Vector3(-.06,0,.68)]));
    for(const s of [-1,1]){const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color:0xd3aaff,transparent:true,opacity:.9,depthWrite:false}));line.scale.x=s;g.add(line);details.push(line);}
    for(const s of [-1,1])details.push(crystal('arc-satellite',s*.18,0,.07,.04,.04,.1,0xae87ff,2));
    trail(.15,1.05,0x8a69ff);halo(1.1,.35);
  } else if(id==='orbit') {
    const rotor=new THREE.Group();g.add(rotor);g.userData.rotor=rotor;
    const hub=r.mesh(rotor,r.geo('blade-hub',()=>new THREE.CylinderGeometry(.14,.14,.09,6)),r.mat(0x5dbfa3,.6,.25,.6));
    const rim=ring(.3,.026,0x6ae1b2);rim.rotation.x=Math.PI/2;
    for(let i=0;i<3;i++) {
      const a=i*Math.PI*2/3, blade=r.mesh(rotor,r.geo('swept-blade',()=>new THREE.OctahedronGeometry(1,0)),r.mat(0xdceac6,.8,.25),Math.sin(a)*.23,0,Math.cos(a)*.23,[.1,.045,.29]);blade.rotation.y=a+.7;
      const edge=r.mesh(rotor,r.geo('box',()=>new THREE.BoxGeometry(1,1,1)),r.mat(0x60e79d,.1,.3,.7),Math.sin(a)*.33,.02,Math.cos(a)*.33,[.04,.03,.22]);edge.rotation.y=a+.7;
    }
    details.push(rim);trail(.35,.85,0x6edba2);halo(1.05,.2);hub.name='blade-core';
  } else if(id==='nova') {
    const core=crystal('nova-core',0,0,-.05,.24,.23,.35,0xffd394,1.25);g.userData.core=core;
    const cage=new THREE.Group();g.add(cage);g.userData.rotor=cage;
    for(let i=0;i<3;i++) {
      const m=r.mesh(cage,r.geo('nova-orbit',()=>new THREE.TorusGeometry(.47,.025,4,6)),r.mat(i===0?0x46b9da:0xdfa14d,.7,.3,.65));m.rotation.set(Math.PI/2+i*.5,i*.7,i*.9);details.push(m);
    }
    for(let i=0;i<4;i++){const a=i*Math.PI/2;details.push(crystal('nova-shard',Math.cos(a)*.4,0,Math.sin(a)*.4,.055,.055,.12,0xa5faff,2));}
    trail(.54,1.8,0xf0b85c);halo(1.8,.45);
  }
  g.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});
  return g;
}

export function updateWeaponShot(r,g,b) {
  const data=g.userData, t=r.time+(b.id||0)*.31;
  if(data.rotor)data.rotor.rotation.y=t*(data.weaponVisual==='orbit'?22:7);
  if(data.core)data.core.rotation.z=t*2.4;
  for(const part of data.details||[])part.visible=r.preferences.effects!=='simple';
}
