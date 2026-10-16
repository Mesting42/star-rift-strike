import * as THREE from 'three';

// Three intersecting sheets carry a continuous turbulent density field. The
// visible shape comes entirely from animated density/temperature, not the
// mesh outline. All projectiles reuse the geometry and palette materials.
const vertexShader = /* glsl */`
  attribute float layer;
  uniform float uSeed;
  varying vec2 vUv;
  varying float vLayer;
  varying float vSeed;
  void main() {
    vUv = uv;
    vLayer = layer;
    vSeed = uSeed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const fragmentShader = /* glsl */`
  uniform float uTime;
  uniform float uStrength;
  uniform float uCombustion;
  uniform vec3 uEdge;
  uniform vec3 uHot;
  varying vec2 vUv;
  varying float vLayer;
  varying float vSeed;
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
  }
  float turbulence(vec2 p) {
    float n = .55 * noise(p);
    p = p * 2.07 + vec2(3.7, 1.8);
    n += .28 * noise(p);
    p = p * 2.11 + vec2(6.3, 4.1);
    return n + .17 * noise(p);
  }
  void main() {
    float y = vUv.y, x = (vUv.x - .5) * 2.0;
    float clock = uTime * 3.4 + vSeed + vLayer * 1.73;
    vec2 flow = vec2(x * 3.4 + vLayer * .8, y * 6.8 - clock);
    float rolling = turbulence(flow);
    float fine = noise(flow * 2.7 + vec2(2.0, -clock * .23));
    float bend = (noise(vec2(y * 5.0 - clock * .65, vSeed + vLayer)) - .5) * y * .56;
    float flare = .19 + .33 * sin(3.14159265 * pow(y, .72)) * (1.0 - y * .35);
    flare *= .72 + .67 * rolling;
    float lateral = abs(x - bend);
    float body = smoothstep(0.0, .19, flare - lateral + (fine - .5) * y * .15);
    float breaking = mix(1.0, smoothstep(.26, .68, rolling + .21 * fine), smoothstep(.18, .9, y));
    float endFade = 1.0 - smoothstep(.56, 1.0, y + (rolling - .5) * .17);
    float rootFade = smoothstep(0.0, .025, y);
    float density = body * breaking * endFade * rootFade;
    float heat = pow(max(0.0, 1.0 - lateral / max(.04, flare)), 1.8) * (1.0 - y);
    heat *= .65 + .35 * fine;
    vec3 ember = mix(uEdge * .24, vec3(.29, .045, .009), uCombustion);
    vec3 middle = mix(uEdge, vec3(1.8, .32, .035), uCombustion);
    vec3 hot = mix(uHot, vec3(2.3, 1.5, .58), uCombustion);
    vec3 color = mix(ember, middle, smoothstep(.05, .58, heat));
    color = mix(color, hot, smoothstep(.45, .9, heat));
    // Sparse embers advect away from the nozzle, including outside the main
    // flame. Their irregular positions never require per-frame allocations.
    vec2 cells = vec2(vUv.x * 11.0, y * 14.0 - clock * 2.2);
    vec2 cell = floor(cells), offset = vec2(hash(cell + vSeed), hash(cell.yx + 7.8 + vSeed));
    vec2 grain = fract(cells) - mix(vec2(.2), vec2(.8), offset);
    float spark = (1.0 - smoothstep(.035, .16, length(grain * vec2(1.1, .65)))) * step(.984, hash(cell + 19.2));
    spark *= smoothstep(.15, .35, y) * (1.0 - smoothstep(.8, 1.0, y)) * uCombustion;
    // A dim translucent wisp survives slightly beyond the burning gas.
    float smoke = smoothstep(.5, .85, y) * (1.0 - smoothstep(.86, 1.0, y));
    smoke *= (1.0 - smoothstep(.12, .48, lateral)) * rolling * .11 * uCombustion;
    float flameAlpha = density * (.79 - vLayer * .13) * uStrength;
    float alpha = clamp(flameAlpha + spark * .8 + smoke, 0.0, .93);
    if (alpha < .008) discard;
    color = (color * flameAlpha + hot * spark * .8 + vec3(.16, .115, .09) * smoke) / max(.001, alpha);
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function attachProjectilePlume(r, parent, { width, length, start = .3, color = 0xff7438, combustion = true, seed = 0 }) {
  const geometry = r.geo('projectile-plume-volume', () => {
    const positions = [], uvs = [], layers = [], indices = [];
    for (let sheet = 0; sheet < 3; sheet++) {
      const angle = [0, Math.PI / 3, -Math.PI / 3][sheet], base = sheet * 4;
      for (const [x,z] of [[-.5,0],[.5,0],[-.5,1],[.5,1]]) {
        positions.push(x * Math.cos(angle), x * Math.sin(angle), z);
        uvs.push(x + .5, z); layers.push(sheet);
      }
      indices.push(base,base+2,base+1,base+1,base+2,base+3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('layer', new THREE.Float32BufferAttribute(layers, 1));g.setIndex(indices);
    return g;
  });
  const edge = new THREE.Color(color), key = `projectile-plume-${edge.getHex()}-${combustion}`;
  if (!r.materials.has(key)) {
    const hot = edge.clone().lerp(new THREE.Color(0xf0f4df), .67).multiplyScalar(1.6);
    const material = new THREE.ShaderMaterial({vertexShader, fragmentShader,
      uniforms: { uTime: {value:r.time}, uSeed: {value:0}, uStrength: {value:.75+.25*r.effectLevel.glow}, uCombustion: {value:combustion?1:0},
        uEdge: {value:edge}, uHot: {value:hot} },
      transparent:true, depthWrite:false, side:THREE.DoubleSide, forceSinglePass:true, blending:THREE.NormalBlending,
    });
    material.userData.projectilePlume = true;r.materials.set(key,material);
  }
  const mesh = r.mesh(parent,geometry,r.materials.get(key),0,.025,start,[width,width,length]);
  mesh.name = 'projectile-plume';mesh.userData.visualOnly = true;
  mesh.userData.flameSeed = seed * .713;
  mesh.onBeforeRender = () => {
    mesh.material.uniforms.uSeed.value = mesh.userData.flameSeed;
    mesh.material.uniformsNeedUpdate = true;
  };
  mesh.castShadow = mesh.receiveShadow = false;
  parent.userData.details ||= [];parent.userData.details.push(mesh);
  return mesh;
}

export function updateProjectilePlumes(r) {
  for (const material of r.materials.values()) if (material.userData.projectilePlume) {
    material.uniforms.uTime.value = r.time;
    material.uniforms.uStrength.value = .75 + .25 * r.effectLevel.glow;
  }
}
