import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hostileBoltShape } from './collision.js';
import { attachProjectilePlume } from './projectile-plumes.js';

const palettes = {
  scout: [0xab3928, 0xff8b45], wing: [0x9a3025, 0xff6438],
  gunner: [0xa5482b, 0xff9c4c], tank: [0x793629, 0xff793e],
  carrier: [0xa73429, 0xff8a4c], elite: [0x782c29, 0xff5034],
  boss: [0xae352d, 0xff713b],
};
export function hostileIdentity(b) { return Object.hasOwn(palettes, b.enemyVisual) ? b.enemyVisual : 'gunner'; }

function vertexMaterial(r, key, emissive) {
  if (!r.materials.has(key)) r.materials.set(key, new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, metalness: .48, roughness: .36,
    emissive: 0xd44b27, emissiveIntensity: emissive, flatShading: true,
    ...(key === 'hostile-shell-material' ? { transparent: true, opacity: .42, depthWrite: false } : {}),
  }));
  return r.materials.get(key);
}

// Keep every solid detail inside the shared capsule. Only translucent light
// and the attached fading trail extend beyond it, and neither deals damage.
// Each projectile uses two cached solid meshes, one trail and one small glow.
export function buildHostileShot(r, b) {
  const g = new THREE.Group(), id = hostileIdentity(b), shape = hostileBoltShape(b);
  const radius = shape.radius, shaft = shape.halfShaft, length = shaft + radius;
  const [bodyColor, hotColor] = palettes[id], sizeKey = `${radius}-${shaft}`;
  g.userData.enemyVisual = id;
  g.userData.details = [];
  const coreGeometry = r.geo(`hostile-core-${id}-${sizeKey}`, () => {
    const geometry = new THREE.CapsuleGeometry(radius, shaft * 2, 3, 8);
    const colors = [], body = new THREE.Color(bodyColor), hot = new THREE.Color(hotColor);
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const front = -position.getY(i) / length;
      let heat = front > .68 ? .82 : .12;
      if (id === 'wing') heat = front > .1 ? .68 : .1;
      if (id === 'carrier') heat = Math.abs(front) < .2 || front > .68 ? .8 : .08;
      if (id === 'elite') heat = front > .68 || Math.abs(front) < .08 ? .85 : .08;
      if (id === 'boss') heat = .55 + .35 * Math.cos(front * Math.PI * 3);
      const c = body.clone().lerp(hot, heat); colors.push(c.r, c.g, c.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  });
  // First child remains the visible solid capsule, shared with damage QA.
  const core = r.mesh(g, coreGeometry, vertexMaterial(r, 'hostile-shell-material', .38));
  core.rotation.x = Math.PI / 2;
  const hardwareGeometry = r.geo(`hostile-hardware-${id}-${sizeKey}`, () => {
    const parts = [];
    const unitBox = r.geo('box', () => new THREE.BoxGeometry(1, 1, 1));
    const unitCrystal = r.geo('hostile-crystal', () => new THREE.OctahedronGeometry(1, 0));
    const add = (source, x, y, z, sx, sy, sz, color, rz = 0) => {
      const part = source.index ? source.toNonIndexed() : source.clone();
      const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rz), new THREE.Vector3(sx, sy, sz));
      part.applyMatrix4(matrix);
      const c = new THREE.Color(color), colors = [];
      for (let i = 0; i < part.getAttribute('position').count; i++) colors.push(c.r, c.g, c.b);
      part.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); parts.push(part);
    };
    // A raised channel crosses the cylinder surface while remaining inside
    // its radial bound; the solid silhouette is always readable in low FX.
    const rail = (side, z, extent, color = hotColor) =>
      add(unitBox, side * radius * .48, radius * .66, z * shaft, radius * .28, radius * .2, extent * shaft, color);
    const collar = (z, extent = .1, color = hotColor) => {
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        add(unitBox, Math.sin(a) * radius * .72, Math.cos(a) * radius * .72, z * shaft,
          radius * .9, radius * .16, extent * shaft, color, -a);
      }
    };
    if (id === 'scout') {
      for (const s of [-1, 1]) rail(s, -.1, 1.4);
      add(unitCrystal, 0, radius * .62, -shaft * .68, radius * .36, radius * .28, shaft * .24, hotColor);
    } else if (id === 'wing') {
      for (let i = 0; i < 3; i++) {
        const z = (-.48 + i * .46) * shaft;
        for (const s of [-1, 1]) add(unitCrystal, s * radius * .4, radius * .6, z,
          radius * .35, radius * .28, shaft * .23, i === 0 ? 0xffa24c : hotColor);
      }
    } else if (id === 'gunner') {
      for (let i = 0; i < 5; i++) collar(-.72 + i * .34, .09, i % 2 ? 0xd16335 : hotColor);
      rail(0, 0, 1.5, 0x572b22);
    } else if (id === 'tank') {
      for (let i = 0; i < 3; i++) collar(-.6 + i * .6, .29, i === 0 ? hotColor : 0xb66135);
      for (const s of [-1, 1]) rail(s, -.3, .8, 0xffac4d);
    } else if (id === 'carrier') {
      for (const z of [-.4, .42]) {
        collar(z, .16, hotColor);
        add(unitCrystal, 0, radius * .68, z * shaft, radius * .62, radius * .26, shaft * .18, 0xffa352);
      }
      rail(0, 0, .62, 0xf25937);
    } else if (id === 'elite') {
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        add(unitCrystal, Math.sin(a) * radius * .6, Math.cos(a) * radius * .6, 0,
          radius * .28, radius * .28, shaft * .64, hotColor, -a);
      }
      collar(-.65, .14, 0xffa25c); collar(.65, .14, 0xff783b);
    } else {
      for (let i = 0; i < 4; i++) collar(-.72 + i * .48, .12, i % 2 ? 0xffa14b : hotColor);
      for (const s of [-1, 1]) rail(s, 0, 1.72, 0xff573b);
      add(unitCrystal, 0, radius * .67, -.38 * shaft, radius * .56, radius * .27, shaft * .3, 0xffa64d);
    }
    const geometry = mergeGeometries(parts, false); parts.forEach(part => part.dispose()); return geometry;
  });
  const hardware = r.mesh(g, hardwareGeometry, vertexMaterial(r, 'hostile-channel-material', .75));
  if (id === 'elite' || id === 'boss') g.userData.rotor = hardware;
  const trailLength = (id === 'scout' ? 1.5 : id === 'tank' ? .55 : id === 'boss' ? 1.05 : .85) * length;
  attachProjectilePlume(r,g,{width:radius*(id==='tank'?5.2:4.4),length:trailLength*1.4,start:length-.025,
    color:id==='elite'?0xff5034:0xff7a38,seed:b.id||0});
  const glow = r.glow(g, 0, .03, -shaft * .35, hotColor, radius * 5.5, .3);
  g.userData.details.push(glow);
  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return g;
}

export function updateHostileShot(r, g, b) {
  if (g.userData.rotor) g.userData.rotor.rotation.z = r.time * 5 + (b.id || 0) * .7;
  for (const part of g.userData.details) part.visible = r.preferences.effects !== 'simple';
}
