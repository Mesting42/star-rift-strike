// Muzzles point toward +z in world space after the enemy model's 180-degree rotation.
export const LASER_MOUNTS = {
  laser: [{ x: 0, z: 1.55, y: .47 }],
  boss: [{ x: -4.68, z: 2.8, y: 1.33 }, { x: 0, z: 4.55, y: .85 }, { x: 4.68, z: 2.8, y: 1.33 }],
};

// Original weapons, upgrades, encounters and deterministic route generation.
export const WEAPONS = [
  { id: 'vulcan', name: 'M4「雨燕」机炮', tag: 'KINETIC / 01', desc: '可靠的双联机炮。射速快，弹道集中，适合持续压制。', damage: 7, rate: .105, speed: 33, shots: 1, spread: .025, range: 35, color: '#ffd596', kind: 'bullet' },
  { id: 'scatter', name: 'S8「蜂群」散射炮', tag: 'SPREAD / 02', desc: '一次释放五枚钨弹。近距离覆盖宽，单轮爆发高。', damage: 6, rate: .43, speed: 29, shots: 5, spread: .20, range: 24, color: '#ffa967', kind: 'shotgun' },
  { id: 'rail', name: 'R3「长钉」轨道炮', tag: 'PIERCE / 03', desc: '贯穿多架敌机的高速穿甲弹。对装甲目标尤其有效。', damage: 28, rate: .55, speed: 58, shots: 1, spread: 0, range: 48, color: '#d7f5ff', kind: 'pierce' },
  { id: 'rocket', name: 'H6「烬火」导弹架', tag: 'EXPLOSIVE / 04', desc: '制导导弹会追踪前方目标，并在命中时引发范围爆炸。', damage: 22, rate: .58, speed: 19, shots: 1, spread: .07, range: 40, color: '#ff805c', kind: 'missile' },
  { id: 'beam', name: 'L2「日蚀」束流器', tag: 'ENERGY / 05', desc: '无限供能的高速脉冲束流，可持续贯穿多个目标。', damage: 5, rate: .075, speed: 100, shots: 1, spread: 0, range: 42, color: '#81e7e3', kind: 'laser' },
  { id: 'arc', name: 'E5「雷链」电弧炮', tag: 'CHAIN / 06', desc: '电弧跳向邻近敌人。密集编队越多，收益越高。', damage: 15, rate: .39, speed: 37, shots: 1, spread: .03, range: 31, color: '#b9a0ff', kind: 'arc' },
  { id: 'orbit', name: 'O9「回翼」刃盘', tag: 'RETURN / 07', desc: '双刃盘飞出后折返，同一目标在去程与回程各可被命中一次。', damage: 15, rate: .62, speed: 24, shots: 2, spread: .16, range: 27, color: '#aedf8c', kind: 'boomerang' },
  { id: 'nova', name: 'N1「超新星」主炮', tag: 'CHARGE / 08', desc: '低射速重型等离子炮。命中引爆能量冲击波，重创周围敌机。', damage: 58, rate: 1.3, speed: 23, shots: 1, spread: 0, range: 37, color: '#ffe8a5', kind: 'charge' },
];

export const ITEMS = [
  { id: 'caliber', name: '高密度弹芯', desc: '所有武器伤害提高 30%。', color: '#efb469', effect: 'damage' },
  { id: 'rapid', name: '超频供弹器', desc: '射速提高 25%。与「雨燕」组合时，每轮有 22% 概率发射额外穿甲弹。', color: '#f1c778', effect: 'rate' },
  { id: 'plating', name: '陶瓷复合装甲', desc: '最大装甲增加 35，立即修复 35 点装甲，受到的伤害减少 18%。', color: '#d5dad8', effect: 'health' },
  { id: 'capacitor', name: '聚能电容', desc: '所有武器射速提高 15%，可与超频供弹器叠加。', color: '#8ddedd', effect: 'rate' },
  { id: 'wing', name: '矢量控制翼', desc: '移动速度提高约 20%，闪避冷却由 3.5 秒缩短至 2.4 秒。', color: '#a9d7ee', effect: 'dash' },
  { id: 'salvage', name: '磁力回收臂', desc: '全空域物资自动靠近战机。击毁敌人所得货币增加 40%。', color: '#e1c07a', effect: 'money' },
  { id: 'splitter', name: '分裂弹头', desc: '爆炸范围提高 30%。与「烬火」组合时，每轮齐射三枚制导导弹。', color: '#eb9069', effect: 'explosion' },
  { id: 'conduct', name: '超导线圈', desc: '「雷链」传导范围提高约 33%，可跳向最多三架额外敌机。', color: '#b6a3e4', effect: 'chain' },
  { id: 'piercer', name: '钨钢贯穿套件', desc: '常规弹丸可额外贯穿一个目标，「长钉」轨道炮伤害提高 25%。', color: '#c7e0e5', effect: 'pierce' },
  { id: 'reactor', name: '零点反应炉', desc: '护盾容量增加 20，脱离受伤 6 秒后自动恢复护盾。与「日蚀」组合时，每秒发射侧向束流。', color: '#9fe2ce', effect: 'shield' },
  { id: 'escort', name: '护航僚机', desc: '两架自动射击的无人僚机伴随你作战。', color: '#bddca1', effect: 'drone' },
  { id: 'scanner', name: '宽频侦察雷达', desc: '揭示全部航线与隐藏空域。进入第二作战区域时额外获得 20 信用点。', color: '#e5d99a', effect: 'reveal' },
];

export const SKILLS = [
  { id: 'emp', name: '电磁脉冲', desc: '清除全空域敌方弹幕，对敌人造成 90 点伤害。', cooldown: 14, color: '#afc9ff' },
  { id: 'shield', name: '棱镜护盾', desc: '护盾立即充满，形成持续 3.5 秒的无敌防御场。', cooldown: 19, color: '#92e2dd' },
  { id: 'bomb', name: '轨道轰炸', desc: '清除敌方弹幕，对全空域敌人造成 210 伤害，同时摧毁环境设施。', cooldown: 22, color: '#f9b17c' },
  { id: 'drone', name: '蜂群支援', desc: '召来两架持续 12 秒的护航无人机，向前方持续射击。', cooldown: 24, color: '#b6d995' },
];

export const SYNERGIES = [
  { id: 'cluster', name: '集束协议', desc: '每轮齐射三枚导弹，爆炸范围扩大 30%。', weapon: 'rocket', item: 'splitter' },
  { id: 'storm', name: '雷暴回路', desc: '电弧向更远的最多三架额外敌机传导。', weapon: 'arc', item: 'conduct' },
  { id: 'overdrive', name: '交叉火力', desc: '机炮射击有 22% 概率额外发射一枚高伤穿甲弹。', weapon: 'vulcan', item: 'rapid' },
  { id: 'prism', name: '棱镜折射', desc: '激光周期性产生两道侧向束流。', weapon: 'beam', item: 'reactor' },
];

export const ENEMY_TYPES = {
  scout: { name: '裂翼截击机', hp: 24, r: .7, reward: 5, speed: 2.3, rate: 2.2 },
  wing: { name: '针蜂无人机', hp: 20, r: .65, reward: 4, speed: 3, rate: 2.8 },
  gunner: { name: '哨戒炮艇', hp: 55, r: 1, reward: 9, speed: 1.2, rate: 2.3 },
  tank: { name: '堡垒轰炸机', hp: 105, r: 1.5, reward: 15, speed: .55, rate: 3.3 },
  laser: { name: '棱镜浮游炮', hp: 48, r: .85, reward: 10, speed: 1.1, rate: 4.5 },
  carrier: { name: '蜂巢支援舰', hp: 90, r: 1.2, reward: 14, speed: .7, rate: 4 },
  elite: { name: '黑曜近卫', hp: 230, r: 1.7, reward: 32, speed: .8, rate: 1.7 },
};

export class RNG {
  constructor(seed = Date.now()) {
    if (typeof seed === 'string') {
      let h = 2166136261;
      for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
      this.state = h >>> 0;
    } else this.state = Number(seed) >>> 0;
  }
  next() {
    let t = this.state += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min, max) { return Math.floor(this.next() * (max - min + 1)) + min; }
  pick(arr) { return arr[this.int(0, arr.length - 1)]; }
  shuffle(arr) {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

const LABELS = {
  1: ['苍湾巡逻带', '镜海中继站', '北风货运廊', '晨曦防线', '银帆回收场', '风眼监听站', '潮汐舰桥', '鹭岛航道', '白塔空港', '碎云防区', '灯塔通讯站', '静海观测点', '锈港外缘', '远岸停泊区', '白鸥信标'],
  2: ['废轨九号', '暗面反应堆', '重力裂隙', '黑曜舰群', '断环哨站', '赤潮能源井', '湮星残骸带', '零光中继', '沉默舱段', '失控磁场', '铁幕航道', '回声禁区', '核心防御网', '锻炉脉冲区', '断电停泊场'],
};

function gridNeighbors(cell, cells) {
  const row = Math.floor(cell / 4), col = cell % 4;
  return [cell - 4, cell + 4, ...(col ? [cell - 1] : []), ...(col < 3 ? [cell + 1] : [])]
    .filter(n => n >= 0 && n < 16 && cells.has(n));
}

function connected(cells, start = 12) {
  const found = new Set([start]), todo = [start];
  for (let i = 0; i < todo.length; i++) {
    for (const n of gridNeighbors(todo[i], cells)) if (!found.has(n)) { found.add(n); todo.push(n); }
  }
  return found.size === cells.size;
}

export function generateSector(seed, sector = 1) {
  const rng = new RNG(`${seed}/sector/${sector}`);
  const startCell = 12;
  let allCells, hiddenCell, baseCells;
  // The hidden node is an optional leaf; it can never block the normal route.
  for (let attempt = 0; attempt < 100; attempt++) {
    allCells = new Set(Array.from({ length: 16 }, (_, i) => i));
    const removals = rng.shuffle([...allCells].filter(c => ![startCell, 8, 13].includes(c))).slice(0, 3);
    removals.forEach(c => allCells.delete(c));
    const candidates = rng.shuffle([...allCells].filter(c => ![startCell, 8, 13].includes(c) && (c % 4 === 0 || c % 4 === 3 || c < 4 || c > 11)));
    hiddenCell = candidates.find(c => {
      const base = new Set(allCells); base.delete(c);
      return connected(base, startCell) && gridNeighbors(c, base).length;
    });
    if (hiddenCell !== undefined) break;
  }
  if (hiddenCell === undefined) {
    allCells = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13]);
    hiddenCell = 3;
  }
  baseCells = new Set(allCells); baseCells.delete(hiddenCell);
  const sorted = [...allCells].sort((a, b) => a - b);
  const names = rng.shuffle(LABELS[sector === 2 ? 2 : 1]);
  const byCell = new Map();
  const nodes = sorted.map((cell, index) => {
    const node = {
      id: cell === startCell ? 'entry' : `n${cell}`,
      type: cell === startCell ? 'entry' : cell === hiddenCell ? 'hidden' : 'combat',
      name: names[index],
      x: 12 + (cell % 4) * 25 + rng.int(-3, 3),
      y: 12 + Math.floor(cell / 4) * 25 + rng.int(-3, 3),
      neighbors: [], visited: false, revealed: cell === startCell, cleared: false,
    };
    byCell.set(cell, node);
    return node;
  });
  const connect = (a, b) => {
    const na = byCell.get(a), nb = byCell.get(b);
    if (!na.neighbors.includes(nb.id)) na.neighbors.push(nb.id);
    if (!nb.neighbors.includes(na.id)) nb.neighbors.push(na.id);
  };
  const edges = [];
  for (const cell of baseCells) {
    for (const n of gridNeighbors(cell, baseCells)) if (cell < n) edges.push([cell, n]);
  }
  const parents = new Map([...baseCells].map(c => [c, c]));
  const find = c => {
    while (parents.get(c) !== c) c = parents.get(c);
    return c;
  };
  const spare = [];
  for (const [a, b] of rng.shuffle(edges)) {
    if (find(a) !== find(b)) { parents.set(find(a), find(b)); connect(a, b); }
    else spare.push([a, b]);
  }
  // Extra links vary the decision points and allow retreat / alternate routes.
  rng.shuffle(spare).slice(0, rng.int(2, 4)).forEach(([a, b]) => connect(a, b));
  if (byCell.get(startCell).neighbors.length < 2) {
    const neighbor = gridNeighbors(startCell, baseCells).find(n => !byCell.get(startCell).neighbors.includes(byCell.get(n).id));
    if (neighbor !== undefined) connect(startCell, neighbor);
  }
  connect(hiddenCell, rng.pick(gridNeighbors(hiddenCell, baseCells)));
  const byId = new Map(nodes.map(n => [n.id, n]));
  const depth = new Map([['entry', 0]]), queue = ['entry'];
  for (let i = 0; i < queue.length; i++) {
    const current = byId.get(queue[i]);
    for (const id of current.neighbors) if (!depth.has(id)) { depth.set(id, depth.get(current.id) + 1); queue.push(id); }
  }
  const ordinary = nodes.filter(n => n.type === 'combat');
  // A locked goal may not be a bridge to the fights needed to unlock it.
  // Preserve every ordinary route when the exit / Boss is temporarily blocked.
  const safeGoal = candidate => {
    const reached = new Set(['entry']), pending = ['entry'];
    for (let i = 0; i < pending.length; i++) {
      for (const id of byId.get(pending[i]).neighbors) {
        const next = byId.get(id);
        if (id === candidate.id || next.type === 'hidden' || reached.has(id)) continue;
        reached.add(id); pending.push(id);
      }
    }
    return reached.size === nodes.length - 2;
  };
  const far = ordinary.filter(n => depth.get(n.id) >= 3 && safeGoal(n));
  const goal = rng.pick(far.length ? far : ordinary.filter(n => depth.get(n.id) === Math.max(...ordinary.map(n => depth.get(n.id)))));
  goal.type = sector === 2 ? 'boss' : 'exit';
  goal.name = sector === 2 ? '「坠日」母舰信号' : '跃迁门 · 北极星';
  const oldGoalId = goal.id;
  goal.id = goal.type;
  nodes.forEach(n => { n.neighbors = n.neighbors.map(id => id === oldGoalId ? goal.id : id); });
  const available = rng.shuffle(ordinary.filter(n => n !== goal));
  const take = predicate => {
    const index = Math.max(0, available.findIndex(predicate));
    return available.splice(index, 1)[0];
  };
  const shop = take(n => depth.get(n.id) <= 2);
  shop.type = 'shop'; shop.name = sector === 2 ? '夜航商会 · 暗轨分站' : '夜航商会 · 云海分站';
  const reward = take(n => depth.get(n.id) <= 2);
  reward.type = 'reward'; reward.name = sector === 2 ? '高阶武备漂流舱' : '失联运输舰';
  const event = take(() => true); event.type = 'event';
  const elite = take(n => depth.get(n.id) >= 2); elite.type = 'elite'; elite.name = sector === 2 ? '黑曜近卫编队' : '铁隼拦截编队';
  if (available.length > 2) {
    const extra = available.pop(); extra.type = rng.pick(['reward', 'event', 'elite']);
  }
  byCell.get(startCell).name = sector === 2 ? '跃迁抵达 · 暗轨' : '起飞点 · 苍湾';
  const hidden = byCell.get(hiddenCell); hidden.name = sector === 2 ? '静默研究舱' : '云底秘密机库';
  return { seed, sector, nodes };
}
