import * as THREE from 'three';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

// Original procedural energy bursts. Shared geometry and instanced particles
// keep simultaneous kills inexpensive on mobile; no ring or smoke wall.
export class EnergyExplosions {
  constructor(renderer) {
    this.renderer = renderer;
    this.transform = new THREE.Object3D();
    this.direction = new THREE.Vector3();
  }

  create(fx) {
    const r = this.renderer;
    const size = Math.min(4.2, Math.max(.7, (fx.scale || 1) * .75));
    const max = .58 + Math.min(.24, size * .055);
    const accent = new THREE.Color(fx.color || 0x8adfff);
    const g = new THREE.Group(); g.position.set(fx.x || 0, .55, fx.z || 0);
    g.userData.effect = 'energy-explosion';
    const materials = [];
    const luminous = (color, opacity = 1) => {
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity,
        blending: THREE.AdditiveBlending, depthWrite: false });
      materials.push(material); return material;
    };
    const core = new THREE.Mesh(r.geo('energy-core', () => new THREE.IcosahedronGeometry(1, 1)), luminous(new THREE.Color(0xe4f8ff).multiplyScalar(2.5)));
    core.rotation.set(.4, .7, .2); g.add(core);
    const fracture = new THREE.Mesh(r.geo('energy-fracture', () => new THREE.OctahedronGeometry(1, 0)), luminous(accent.clone().multiplyScalar(1.8), .65));
    fracture.rotation.set(.2, .3, .7); g.add(fracture);
    const glow = r.glow(g, 0, .1, 0, accent, size * 2, .6);
    const flare = r.glow(g, 0, .12, 0, 0xdaf7ff, 1, .9);
    materials.push(glow.material, flare.material);

    const sparkCount = Math.max(4,Math.ceil(Math.min(18, 9 + Math.ceil(size * 2))*r.effectLevel.density));
    const sparkMesh = new THREE.InstancedMesh(r.geo('energy-spark', () => new THREE.CapsuleGeometry(.5, 1, 2, 5)), luminous(0xffffff), sparkCount);
    sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); sparkMesh.frustumCulled = false;
    const sparks = [];
    const phase = Math.random() * TAU;
    for (let i = 0; i < sparkCount; i++) {
      const angle = phase + i * TAU / sparkCount + (Math.random() - .5) * .32;
      const speed = (7 + Math.random() * 7) * Math.sqrt(size);
      sparks.push({ vx: Math.cos(angle) * speed, vz: Math.sin(angle) * speed, vy: .5 + Math.random() * 3,
        length: (.35 + Math.random() * .5) * Math.sqrt(size), width: .035 + Math.random() * .028,
        life: .3 + Math.random() * .25 });
      sparkMesh.setColorAt(i, new THREE.Color(i % 4 === 0 ? 0xffb778 : i % 3 === 0 ? 0xe4f8ff : accent).multiplyScalar(2.2));
    }
    g.add(sparkMesh);

    const fragmentCount = Math.max(2,Math.ceil(Math.min(10, 4 + Math.ceil(size * 1.3))*r.effectLevel.density));
    const fragmentMaterial = new THREE.MeshStandardMaterial({ color: 0x9bb8ca, metalness: .65, roughness: .35,
      emissive: accent, emissiveIntensity: .65, transparent: true, opacity: 1, depthWrite: false });
    materials.push(fragmentMaterial);
    const fragmentMesh = new THREE.InstancedMesh(r.geo('energy-fragment', () => new THREE.TetrahedronGeometry(1, 0)), fragmentMaterial, fragmentCount);
    fragmentMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); fragmentMesh.frustumCulled = false;
    const fragments = [];
    for (let i = 0; i < fragmentCount; i++) {
      const angle = phase + i * TAU / fragmentCount + Math.random() * .5;
      const speed = (2.5 + Math.random() * 3.2) * Math.sqrt(size);
      fragments.push({ vx: Math.cos(angle) * speed, vz: Math.sin(angle) * speed, vy: 1.5 + Math.random() * 3,
        spin: 6 + Math.random() * 9, phase: Math.random() * TAU, width: (.09 + Math.random() * .07) * Math.sqrt(size),
        length: (.22 + Math.random() * .2) * Math.sqrt(size) });
    }
    g.add(fragmentMesh);
    const effect = { kind: 'energy-explosion', g, core, fracture, glow, flare, sparkMesh, sparks,
      fragmentMesh, fragments, materials, t: 0, max, size };
    this.update(effect, 0);
    r.shake = Math.max(r.shake, .045 * Math.min(size, 3));
    r.flashLight.position.copy(g.position); r.flashLight.color.copy(accent);
    r.flashLight.intensity = Math.min(22, 8 * size);
    return effect;
  }

  update(e, dt) {
    e.t += dt;
    const t = e.t, q = Math.min(1, t / e.max), size = e.size;
    const flash = Math.pow(Math.max(0, 1 - t / .17), 1.5);
    e.core.scale.setScalar(size * (.13 + Math.sin(Math.min(1, t / .19) * Math.PI) * .48));
    e.core.material.opacity = flash; e.core.visible = flash > 0;
    e.fracture.scale.set(size * (.3 + t * 2.5), size * (.2 + t), size * (.35 + t * 2.1));
    e.fracture.rotation.y += dt * 7; e.fracture.rotation.z += dt * 3;
    e.fracture.material.opacity = Math.pow(Math.max(0, 1 - t / .24), 2) * .6;
    e.fracture.visible = t < .24;
    e.glow.scale.set(size * (1.8 + t * 2), size * (1.5 + t * 2), 1);
    e.glow.material.opacity = Math.pow(Math.max(0, 1 - t / .3), 2) * .55;
    e.glow.visible = t < .3;
    e.flare.scale.set(size * (2.8 + t * 6), size * .12, 1);
    e.flare.material.opacity = Math.pow(Math.max(0, 1 - t / .085), 2) * .75;
    e.flare.visible = t < .085;

    const m = this.transform;
    for (let i = 0; i < e.sparks.length; i++) {
      const s = e.sparks[i];
      const fade = Math.max(0, 1 - t / s.life);
      const travel = (1 - Math.exp(-t * 3.8)) / 3.8;
      m.position.set(s.vx * travel, .05 + s.vy * travel, s.vz * travel);
      this.direction.set(s.vx, s.vy, s.vz).normalize(); m.quaternion.setFromUnitVectors(UP, this.direction);
      m.scale.set(s.width * fade, s.length * (.4 + fade) * fade, s.width * fade);
      m.updateMatrix(); e.sparkMesh.setMatrixAt(i, m.matrix);
    }
    e.sparkMesh.instanceMatrix.needsUpdate = true;
    e.sparkMesh.visible = t < .55;
    e.sparkMesh.material.opacity = Math.max(0, 1 - t / .6);

    const shrink = Math.pow(Math.max(0, 1 - q), .55);
    for (let i = 0; i < e.fragments.length; i++) {
      const f = e.fragments[i];
      const travel = (1 - Math.exp(-t * 3.2)) / 3.2;
      m.position.set(f.vx * travel, Math.max(-.3, f.vy * t - 5 * t * t), f.vz * travel + t * .6);
      m.rotation.set(f.phase + t * f.spin, f.phase - t * f.spin * .7, t * f.spin * .4);
      m.scale.set(f.width * shrink, f.width * .35 * shrink, f.length * shrink);
      m.updateMatrix(); e.fragmentMesh.setMatrixAt(i, m.matrix);
    }
    e.fragmentMesh.instanceMatrix.needsUpdate = true;
    e.fragmentMesh.material.opacity = Math.pow(1 - q, 1.4);
    e.fragmentMesh.material.emissiveIntensity = .7 * Math.max(0, 1 - t / .32);
    return e.t >= e.max;
  }

  dispose(e) {
    e.sparkMesh.dispose(); e.fragmentMesh.dispose();
    for (const material of e.materials) material.dispose();
  }
}
