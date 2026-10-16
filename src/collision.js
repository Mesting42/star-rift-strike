// The renderer and damage model share the aircraft's actual structural silhouette.
// Exhaust, bloom, shadows and navigation lights do not count as solid surfaces.
export const PLAYER_AIRFRAME = {
  scale: .64,
  hull: [[-.46,1.75],[-.72,.45],[-.44,-1.72],[0,-2.4],[.44,-1.72],[.72,.45],[.46,1.75]],
  wings: [[-.48,-.65],[-2.15,.64],[-2.28,1.33],[-.85,1.01],[-.43,1.5],[.43,1.5],[.85,1.01],[2.28,1.33],[2.15,.64],[.48,-.65]],
};
const airframe = [PLAYER_AIRFRAME.hull, PLAYER_AIRFRAME.wings].map(points =>
  points.map(([x,z]) => [x * PLAYER_AIRFRAME.scale, z * PLAYER_AIRFRAME.scale]));
const vertices = airframe.flat();
const bounds = { minX: Math.min(...vertices.map(point => point[0])), maxX: Math.max(...vertices.map(point => point[0])),
  minZ: Math.min(...vertices.map(point => point[1])), maxZ: Math.max(...vertices.map(point => point[1])) };
const EPS = 1e-9;

export function hostileBoltShape(bullet) {
  const size = Math.max(.06, Math.min(.32, bullet.r || .12));
  // A capsule with the same solid width and length as the rendered cannon shell.
  const radius = size / 2;
  return { radius, halfShaft: .55 + size * 1.6 - radius };
}

function pointSegmentDistance2(point, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], length2 = dx*dx + dz*dz;
  const t = length2 > EPS ? Math.max(0, Math.min(1, ((point[0]-a[0])*dx + (point[1]-a[1])*dz) / length2)) : 0;
  return (point[0]-a[0]-t*dx)**2 + (point[1]-a[1]-t*dz)**2;
}
function inside(point, polygon) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
      point[0] < (b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1]) + a[0]) hit = !hit;
  }
  return hit;
}
const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]);
function segmentsIntersect(a,b,c,d) {
  const ac = cross(a,b,c), ad = cross(a,b,d), ca = cross(c,d,a), cb = cross(c,d,b);
  if (((ac > EPS && ad < -EPS) || (ac < -EPS && ad > EPS)) &&
    ((ca > EPS && cb < -EPS) || (ca < -EPS && cb > EPS))) return true;
  return (Math.abs(ac) <= EPS && pointSegmentDistance2(c,a,b) <= EPS) ||
    (Math.abs(ad) <= EPS && pointSegmentDistance2(d,a,b) <= EPS) ||
    (Math.abs(ca) <= EPS && pointSegmentDistance2(a,c,d) <= EPS) ||
    (Math.abs(cb) <= EPS && pointSegmentDistance2(b,c,d) <= EPS);
}
function segmentDistance2(a,b,c,d) {
  if (segmentsIntersect(a,b,c,d)) return 0;
  return Math.min(pointSegmentDistance2(a,c,d), pointSegmentDistance2(b,c,d),
    pointSegmentDistance2(c,a,b), pointSegmentDistance2(d,a,b));
}
function polygonsTouch(a,b,radius = 0) {
  if (a.some(point => inside(point,b)) || b.some(point => inside(point,a))) return true;
  const limit = radius*radius + EPS;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    if (segmentDistance2(a[i],a[(i+1)%a.length],b[j],b[(j+1)%b.length]) <= limit) return true;
  }
  return false;
}

function sweptShaft(start,end,offset,t) {
  const x = start[0] + (end[0]-start[0])*t, z = start[1] + (end[1]-start[1])*t;
  return [[start[0]-offset[0],start[1]-offset[1]], [start[0]+offset[0],start[1]+offset[1]],
    [x+offset[0],z+offset[1]], [x-offset[0],z-offset[1]]];
}
function firstImpact(test) {
  if (test(0)) return 0;
  if (!test(1)) return null;
  // Prefix sweeps are monotonic, including a fast projectile crossing the entire target.
  let lo = 0, hi = 1;
  for (let i = 0; i < 12; i++) { const mid = (lo+hi)/2; if (test(mid)) hi = mid; else lo = mid; }
  return hi;
}
function trajectory(bullet,start,end,originStart,originEnd) {
  const shape = hostileBoltShape(bullet), speed = Math.hypot(bullet.vx,bullet.vz);
  const direction = speed > EPS ? [bullet.vx/speed,bullet.vz/speed] : [0,1];
  return { start: [start.x-originStart.x,start.z-originStart.z],
    end: [end.x-originEnd.x,end.z-originEnd.z], radius: shape.radius,
    offset: direction.map(n => n * shape.halfShaft) };
}

export function hostilePlayerImpact(bullet,start,end,playerStart,playerEnd) {
  const path = trajectory(bullet,start,end,playerStart,playerEnd);
  const extraX = Math.abs(path.offset[0]) + path.radius, extraZ = Math.abs(path.offset[1]) + path.radius;
  if (Math.min(path.start[0],path.end[0])-extraX > bounds.maxX+EPS || Math.max(path.start[0],path.end[0])+extraX < bounds.minX-EPS ||
    Math.min(path.start[1],path.end[1])-extraZ > bounds.maxZ+EPS || Math.max(path.start[1],path.end[1])+extraZ < bounds.minZ-EPS) return null;
  return firstImpact(t => {
    const swept = sweptShaft(path.start,path.end,path.offset,t);
    return airframe.some(shape => polygonsTouch(swept,shape,path.radius));
  });
}

export function hostileCoverImpact(bullet,start,end,cover) {
  const path = trajectory(bullet,start,end,cover,cover), radius = cover.r + path.radius;
  if (pointSegmentDistance2([0,0],path.start,path.end) > (radius + Math.hypot(...path.offset))**2) return null;
  return firstImpact(t => {
    const swept = sweptShaft(path.start,path.end,path.offset,t);
    return inside([0,0],swept) || swept.some((point,i) =>
      pointSegmentDistance2([0,0],point,swept[(i+1)%swept.length]) <= radius*radius + EPS);
  });
}

export function playerTouchesBeam(player,beam,playerStart=player) {
  const rectangle = [[beam.x-beam.width-player.x,beam.z-player.z], [beam.x+beam.width-player.x,beam.z-player.z],
    [beam.x+beam.width-player.x,beam.endZ-player.z], [beam.x-beam.width-player.x,beam.endZ-player.z]];
  if(airframe.some(shape => polygonsTouch(shape,rectangle)))return true;
  const dx=playerStart.x-player.x,dz=playerStart.z-player.z;
  if(Math.abs(dx)+Math.abs(dz)<EPS)return false;
  // The union of the old silhouette, new silhouette and swept boundary edges
  // covers a translated concave wing exactly without filling its empty notches.
  return airframe.some(shape=>{
    const start=shape.map(([x,z])=>[x+dx,z+dz]);
    if(polygonsTouch(start,rectangle))return true;
    return shape.some((point,i)=>polygonsTouch([start[i],start[(i+1)%shape.length],shape[(i+1)%shape.length],point],rectangle));
  });
}
