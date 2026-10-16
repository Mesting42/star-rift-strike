import * as THREE from 'three';

const TAU=Math.PI*2;
export class SkillVisuals {
  constructor(renderer) { this.r=renderer; }
  handles(type) { return ['skill-emp','skill-shield','skill-bomb','skill-drone','dash','muzzle','arc'].includes(type); }
  create(fx) {
    const r=this.r,type=fx.type,g=new THREE.Group(),materials=[],ownedGeometry=[];
    g.position.set(fx.x||0,.55,fx.z||0);g.userData.effect=type;
    const mat=(color=fx.color||0x9ae8ff,opacity=1)=>{
      const m=new THREE.MeshBasicMaterial({color,transparent:true,opacity,blending:THREE.AdditiveBlending,depthWrite:false});materials.push(m);return m;
    };
    const mesh=(key,make,material,x=0,y=0,z=0,scale=[1,1,1])=>{
      const m=new THREE.Mesh(r.geo(key,make),material);m.position.set(x,y,z);m.scale.set(...scale);g.add(m);return m;
    };
    const glow=r.glow(g,0,0,0,fx.color||0x8ce4ff,1,.6);materials.push(glow.material);
    const parts=[];
    let max=.65;
    if(type==='skill-emp') {
      max=.78;
      for(let i=0;i<2;i++) {
        const ring=mesh('emp-hex-wave',()=>new THREE.TorusGeometry(1,.012,3,6),mat(i?0x8397ff:0x9afffa,.55));ring.rotation.x=Math.PI/2;parts.push({m:ring,kind:'wave',offset:i*.09});
      }
      for(let i=0;i<12;i++) {
        const a=i*TAU/12;
        const m=mesh('emp-scan-shard',()=>new THREE.OctahedronGeometry(1,0),mat(0x85b9ff,.65));m.rotation.y=-a;parts.push({m,kind:'spoke',angle:a});
      }
    } else if(type==='skill-shield') {
      for(let i=0;i<8;i++) {
        const a=i*TAU/8,m=mesh('shield-injection',()=>new THREE.OctahedronGeometry(1,0),mat(0x8affec,.8));parts.push({m,kind:'shield',angle:a});
      }
      const cage=mesh('shield-activation',()=>new THREE.IcosahedronGeometry(1,1),new THREE.MeshBasicMaterial({color:0x81ddff,wireframe:true,transparent:true,opacity:.5,depthWrite:false}));materials.push(cage.material);parts.push({m:cage,kind:'cage'});
    } else if(type==='skill-bomb') {
      max=.72;
      for(const [x,z]of [[-7,3],[0,0],[7,-4]]) {
        const beam=mesh('orbital-strike',()=>new THREE.CylinderGeometry(.07,.24,1,6),mat(0xf8dca8,.95),x,6,z,[1,12,1]);parts.push({m:beam,kind:'beam',x,z});
        const flare=r.glow(g,x,.02,z,0xffad75,3,.6);materials.push(flare.material);parts.push({m:flare,kind:'bomb-flare'});
        const crown=mesh('strike-shards',()=>new THREE.OctahedronGeometry(1,0),mat(0xff9c68,.65),x,.1,z);parts.push({m:crown,kind:'crown'});
      }
    } else if(type==='skill-drone') {
      max=.72;
      for(const s of [-1,1])for(let i=0;i<3;i++) {
        const shard=mesh('drone-assembly',()=>new THREE.OctahedronGeometry(1,0),mat(0xbaffce,.75));parts.push({m:shard,kind:'drone',side:s,offset:i});
      }
    } else if(type==='dash') {
      max=.32;
      for(const s of [-1,1])for(let i=0;i<3;i++) {
        const m=mesh('dash-streak',()=>new THREE.OctahedronGeometry(1,0),mat(0x8ae7ff,.5),s*(.4+i*.17),0,.7+i*.4,[.045,.025,1.2-i*.2]);parts.push({m,kind:'dash'});
      }
    } else if(type==='arc') {
      max=.2;
      const dx=(fx.targetX??fx.x)-fx.x,dz=(fx.targetZ??fx.z)-fx.z;
      for(let layer=0;layer<2;layer++) {
        const points=[];
        for(let i=0;i<=9;i++){const q=i/9,jitter=i===0||i===9?0:Math.sin(i*13.1+layer)*.32;points.push(new THREE.Vector3(dx*q+jitter,.05+layer*.04,dz*q-jitter));}
        const geometry=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),18,layer?.018:.04,3,false);ownedGeometry.push(geometry);
        const line=new THREE.Mesh(geometry,mat(layer?0xf1e2ff:0x9577ff,.9));g.add(line);parts.push({m:line,kind:'arc'});
      }
    } else {
      max=.09;
      const width=fx.weapon==='nova'?.28:fx.weapon==='scatter'?.18:.085;
      mesh('muzzle-flash',()=>new THREE.OctahedronGeometry(1,0),mat(0xeeffff,.9),0,0,-.1,[width,.08,fx.weapon==='rail'?.65:.25]);
      for(const s of [-1,1])parts.push({m:mesh('muzzle-wing',()=>new THREE.OctahedronGeometry(1,0),mat(fx.color,.65),s*width,0,.05,[width*.45,.035,.17]),kind:'muzzle'});
    }
    const e={kind:'skill-visual',g,type,materials,ownedGeometry,parts,glow,t:0,max,scale:fx.scale||1,follow:type==='skill-shield'||type==='skill-drone',origin:{x:fx.x||0,z:fx.z||0}};
    this.update(e,0);return e;
  }
  update(e,dt,game) {
    const r=this.r;e.t+=dt;const t=e.t,q=Math.min(1,t/e.max),fade=Math.pow(1-q,1.3),density=r.effectLevel.density;
    if(e.follow&&game?.player)e.g.position.set(game.player.x,.55,game.player.z);
    e.glow.material.opacity=(e.type==='skill-bomb'?.3:.45)*fade;
    e.glow.scale.setScalar(e.type==='muzzle'?.48:e.type==='skill-bomb'?3:e.type==='skill-emp'?1.8:1.4);
    for(let i=0;i<e.parts.length;i++) {
      const p=e.parts[i],m=p.m;
      m.material.opacity=fade*(p.kind==='beam'?.85:.65);
      // The major skill shape survives the minimal preset; only secondary shards disappear.
      m.visible=!['spoke','muzzle'].includes(p.kind)||i<Math.ceil(e.parts.length*density);
      if(p.kind==='wave') {
        const radius=Math.max(.05,t-p.offset)*38;m.scale.setScalar(radius);m.material.opacity=Math.max(0,1-radius/29)*.48*density;
      } else if(p.kind==='spoke') {
        const radius=t*32;m.position.set(Math.sin(p.angle)*radius,.03,Math.cos(p.angle)*radius);m.scale.set(.025,.025,1.8*(1-q));m.material.opacity*=density;
      } else if(p.kind==='shield') {
        const radius=1.55+(1-q)*1.4;m.position.set(Math.sin(p.angle)*radius,.3+Math.sin(p.angle*2)*.2,Math.cos(p.angle)*radius);m.rotation.y=-p.angle;m.scale.set(.11,.15,.34*(1-q));
      } else if(p.kind==='cage') {m.scale.set(1.55+q*.12,.45,1.65+q*.12);m.rotation.y=t*2;m.material.opacity=fade*.35;}
      else if(p.kind==='beam') {m.scale.set(.65+q*1.4,12,.65+q*1.4);m.material.opacity=Math.pow(Math.max(0,1-t/.3),1.5)*.85;}
      else if(p.kind==='bomb-flare') {m.scale.set(2+q*3,.55+q*.2,1);m.material.opacity=fade*.4*density;}
      else if(p.kind==='crown') {m.scale.set(.25+q*1.5,.3+q*1.3,.25+q*1.5);m.rotation.y=t*4;m.material.opacity=fade*.36*density;}
      else if(p.kind==='drone') {m.position.set(p.side*(1.8+(1-q)*.6),.1+p.offset*.16,.65+(1-q)*(1+p.offset*.4));m.scale.set(.07,.035,.45*(1-q));}
      else if(p.kind==='dash') {m.position.z+=dt*5;m.scale.z=Math.max(0,1.2*(1-q));}
      else if(p.kind==='arc')m.material.opacity=fade*.9;
    }
    return q>=1;
  }
  dispose(e) { for(const geo of e.ownedGeometry)geo.dispose();for(const material of e.materials)material.dispose(); }
}
