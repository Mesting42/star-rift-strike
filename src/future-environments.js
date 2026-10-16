import * as THREE from 'three';
import { assembleHardware } from './future-models.js';

const TAU=Math.PI*2;
function texture(size,draw) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  draw(canvas.getContext('2d'),size);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;return map;
}

function facility(r,type) {
  const g=new THREE.Group(), orbital=type==='orbital', c=orbital?0x7c91ae:0x8aabb5, glow=orbital?0xff9362:0x6df0e3;
  r.mesh(g,r.geo('facility-deck',()=>new THREE.CylinderGeometry(3.1,3.8,.65,8)),r.mat(0x203d50,.6,.55),0,0,0,[1,1,1.35]);
  r.mesh(g,r.geo('facility-top',()=>new THREE.CylinderGeometry(2.9,3,.12,8)),r.mat(c,.65,.4),0,.4,0,[1,1,1.35]);
  for(const s of [-1,1]) {
    r.block(g,s*1.85,.7,.3,.55,.52,3.8,0x29485e);
    for(let i=0;i<4;i++) {
      r.block(g,s*1.85,1,-1.2+i*.8,.39,.07,.43,c);
      r.block(g,s*2.34,.5,-1.4+i*.9,.08,.06,.48,glow).material=r.mat(glow,.1,.4,.85);
    }
    const panel=r.block(g,s*4.1,.17,.3,2.5,.08,3.1,orbital?0x142940:0x47788c);panel.rotation.z=s*.1;
    for(let j=0;j<5;j++)r.block(g,s*(3.1+j*.45),.27,.3,.025,.025,3.05,0x85a8be);
    r.block(g,s*3.2,.2,.3,.14,.2,4.3,0x426782);
    const brace=r.block(g,s*2.65,-.25,0,1.4,.16,.22,c);brace.rotation.z=s*.36;
  }
  r.block(g,0,.64,0,1.5,.34,4,0x193547);
  r.block(g,0,.85,-.3,.055,.035,2.7,glow).material=r.mat(glow,.1,.4,.9);
  r.block(g,0,1.2,1.6,1.4,1.25,1.6,c);
  r.block(g,0,1.9,1.6,1.7,.17,1.7,0x20364f);
  r.block(g,0,2.5,1.6,.1,1.1,.1,c);
  const scanner=new THREE.Group();scanner.position.set(0,3,1.6);scanner.userData.dynamic=true;g.add(scanner);
  const frame=r.mesh(scanner,r.geo('scanner-frame',()=>new THREE.TorusGeometry(.9,.045,4,16,Math.PI*1.5)),r.mat(glow,.5,.3,.85));frame.rotation.x=Math.PI/2;
  r.block(scanner,0,0,0,2,.07,.12,c);r.block(scanner,0,.08,0,.1,.08,1.3,glow).material=r.mat(glow,.2,.4,.8);
  r.sceneryAnim.push(scanner);
  if(orbital) {
    const ring=r.mesh(g,r.geo('orbital-structure-ring',()=>new THREE.TorusGeometry(4.2,.2,6,32,Math.PI*1.62)),r.mat(0x607f9e,.7,.4),0,.1,0);ring.rotation.x=Math.PI/2;ring.rotation.z=.28;
    for(let i=0;i<6;i++){const a=i*TAU/6;r.block(g,Math.cos(a)*3.85,.4,Math.sin(a)*3.85,.32,.36,.32,0xa0bbcc);}
  } else for(const s of [-1,1]) {
    r.mesh(g,r.geo('levitation-core',()=>new THREE.CylinderGeometry(.5,.8,.7,8)),r.mat(0x254152,.7,.4),s*1.7,-.63,.4);
    r.glow(g,s*1.7,-.9,.4,0x65dacb,2,.14);
  }
  return assembleHardware(r,g,`facility-${type}`);
}

export function buildFutureEnvironment(r,sector) {
  r.clearGroup(r.world);r.clearGroup(r.decor);
  r.landmarks=[];r.clouds=[];r.sceneryAnim=[];r.surfaceTexture=null;r.stars=null;
  r.world.userData.environment=sector===1?'cloud-megastructures':'orbital-ring';
  const sky=sector===1?0x153c4c:0x080f24;
  r.scene.background.set(sky);r.scene.fog.color.set(sky);
  r.sun.color.set(sector===1?0xcff1ff:0xa8c4ff);r.sun.intensity=sector===1?3.2:2.8;
  r.ambient.color.set(sector===1?0xa4daee:0x829fcc);r.ambient.intensity=sector===1?2:1.7;
  const surface=texture(768,(ctx,size)=>{
    if(sector===1) {
      ctx.fillStyle='#1e4857';ctx.fillRect(0,0,size,size);
      for(let i=0;i<2600;i++) {
        const x=Math.random()*size,y=Math.random()*size;ctx.strokeStyle=i%4?'rgba(133,210,223,.06)':'rgba(7,25,40,.12)';ctx.lineWidth=.5+Math.random();ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+3+Math.random()*23,y-1);ctx.stroke();
      }
    } else {
      ctx.fillStyle='#080f24';ctx.fillRect(0,0,size,size);
      for(const [x,y,radius,color]of [[.15,.2,.5,'rgba(41,65,109,.4)'],[.8,.8,.6,'rgba(21,73,98,.23)']]) {
        const gradient=ctx.createRadialGradient(x*size,y*size,0,x*size,y*size,radius*size);gradient.addColorStop(0,color);gradient.addColorStop(1,'rgba(8,15,36,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,size,size);
      }
    }
  });
  surface.anisotropy=Math.min(8,r.renderer.capabilities.getMaxAnisotropy());
  let ground;
  if(sector===1) {
    surface.wrapS=surface.wrapT=THREE.RepeatWrapping;surface.repeat.set(8,14);r.surfaceTexture=surface;
    ground=r.mesh(r.world,r.geo('ground',()=>new THREE.PlaneGeometry(150,240)),new THREE.MeshStandardMaterial({color:0x8fbdc5,map:surface,metalness:.4,roughness:.62}));
  } else {
    ground=r.mesh(r.world,r.geo('ground',()=>new THREE.PlaneGeometry(150,240)),new THREE.MeshBasicMaterial({map:surface}),0,-19,0);ground.castShadow=false;ground.receiveShadow=false;
  }
  ground.rotation.x=-Math.PI/2;ground.castShadow=false;
  for(let i=0;i<8;i++) {
    const g=facility(r,sector===1?'cloud':'orbital'),s=i%2?1:-1;
    g.position.set(s*(14.2+(i%3)*3.1),-3.15,-49+i*14);g.rotation.y=s*(sector===1?.22:.5);
    r.decor.add(g);r.landmarks.push(g);
  }
  if(sector===1) {
    const map=texture(256,(ctx,size)=>{
      for(let i=0;i<18;i++) {
        const x=size*.2+Math.random()*size*.6,y=size*.2+Math.random()*size*.6,rad=18+Math.random()*55;
        const grad=ctx.createRadialGradient(x,y,0,x,y,rad);grad.addColorStop(0,'rgba(188,226,237,.35)');grad.addColorStop(1,'rgba(188,226,237,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,size,size);
      }
      ctx.globalCompositeOperation='destination-in';const mask=ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size*.5);mask.addColorStop(0,'white');mask.addColorStop(1,'transparent');ctx.fillStyle=mask;ctx.fillRect(0,0,size,size);
    });
    for(let i=0;i<10;i++) {
      const m=new THREE.Mesh(r.geo('cloud-plane',()=>new THREE.PlaneGeometry(1,1)),new THREE.MeshBasicMaterial({map,transparent:true,opacity:.24,depthWrite:false}));
      m.rotation.x=-Math.PI/2;m.position.set((i%2?1:-1)*(8+(i%3)*7),-2.8,-50+i*11);m.scale.set(18+(i%3)*4,13+(i%4)*3,1);r.decor.add(m);r.clouds.push(m);
    }
    // Broken transit arches are scenery under the flight plane, never obstacles.
    for(let i=0;i<2;i++) {
      const arch=new THREE.Group();arch.position.set(i?18:-18,-3.6,-27+i*45);
      const arc=r.mesh(arch,r.geo('cloud-transit-arch',()=>new THREE.TorusGeometry(7,.18,6,36,Math.PI*1.4)),r.mat(0x6a9bad,.75,.4));arc.rotation.x=Math.PI/2;
      for(let j=0;j<5;j++){const a=j*Math.PI/4;r.block(arch,Math.cos(a)*7,.12,Math.sin(a)*7,.55,.14,.24,0x85eee5).material=r.mat(0x85eee5,.2,.4,.9);}
      assembleHardware(r,arch,`transit-arch`);r.decor.add(arch);r.landmarks.push(arch);
    }
  } else {
    const points=[];for(let i=0;i<420;i++)points.push((Math.random()-.5)*100,-5-Math.random()*12,(Math.random()-.5)*160);
    const geo=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    r.stars=new THREE.Points(geo,new THREE.PointsMaterial({color:0xb8d5ff,size:.065,transparent:true,opacity:.7,depthWrite:false}));r.decor.add(r.stars);
    // A distant planet and its atmosphere give depth to the orbital hullscape.
    const planetMap=texture(512,(ctx,size)=>{
      ctx.fillStyle='#132945';ctx.fillRect(0,0,size,size);ctx.filter='blur(5px)';
      for(let i=0;i<65;i++){ctx.fillStyle=i%3?'rgba(55,109,133,.22)':'rgba(174,196,214,.12)';ctx.beginPath();ctx.ellipse(Math.random()*size,Math.random()*size,10+Math.random()*80,5+Math.random()*15,Math.random(),0,TAU);ctx.fill();}
    });
    const planet=r.mesh(r.decor,r.geo('orbital-planet',()=>new THREE.SphereGeometry(1,40,24)),new THREE.MeshStandardMaterial({map:planetMap,color:0x718aab,roughness:.95}),-22,-19,-22,[14,14,14]);planet.castShadow=false;
    const atmosphere=r.mesh(r.decor,r.geo('planet-atmosphere',()=>new THREE.SphereGeometry(1,32,20)),new THREE.MeshBasicMaterial({color:0x5c93d7,transparent:true,opacity:.09,side:THREE.BackSide,depthWrite:false}),-22,-19,-22,[14.35,14.35,14.35]);atmosphere.castShadow=false;
    const spine=new THREE.Group();spine.position.set(19,-4,-12);
    const arc=r.mesh(spine,r.geo('orbital-mega-ring',()=>new THREE.TorusGeometry(16,.35,6,56,Math.PI*1.65)),r.mat(0x365975,.8,.45));arc.rotation.x=Math.PI/2;
    for(let i=0;i<9;i++){const a=i*TAU/11;r.block(spine,Math.cos(a)*16,.15,Math.sin(a)*16,.55,.23,.6,0xabc3d6);}
    assembleHardware(r,spine,'mega-ring');r.decor.add(spine);r.landmarks.push(spine);
  }
  r.beaconPhase=0;r.beaconTransform=new THREE.Object3D();r.beacons=[];
  const color=sector===1?0x81e4dc:0xc2916c;
  for(const [material,scale,y]of [[r.mat(0x254659,.45),[.24,.22,1.3],-2.55],[r.mat(color,.2,.5,.85),[.065,.025,.92],-2.38]]) {
    const mesh=new THREE.InstancedMesh(r.geo('box',()=>new THREE.BoxGeometry(1,1,1)),material,14);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;
    mesh.userData.beacon={scale,y};r.decor.add(mesh);r.beacons.push(mesh);
  }
  updateBeacons(r,0);
}

export function updateBeacons(r,dt) {
  r.beaconPhase=(r.beaconPhase+dt*(r.theme===1?3:4.5))%115;
  const transform=r.beaconTransform;
  for(const mesh of r.beacons||[]) {
    const {scale,y}=mesh.userData.beacon;transform.scale.set(...scale);
    for(let i=0;i<14;i++) {
      transform.position.set(i<7?-12.6:12.6,y,((i%7)*13+r.beaconPhase+14)%115-55);
      transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;
  }
}
