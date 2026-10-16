import { WEAPONS, ITEMS, SKILLS, SYNERGIES, LASER_MOUNTS, ENEMY_TYPES as ENEMIES, RNG, generateSector } from './content.js';
import { hostilePlayerImpact, hostileCoverImpact, playerTouchesBeam } from './collision.js';

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const movementVector = input => {
  const x = clamp((Number(input.moveX) || 0) + Number(input.right || false) - Number(input.left || false), -1, 1);
  const z = clamp((Number(input.moveZ) || 0) + Number(input.down || false) - Number(input.up || false), -1, 1);
  const length = Math.max(1, Math.hypot(x, z));
  return { x: x / length, z: z / length };
};
export class Game {
  constructor(onEvent = () => {}) {
    this.onEvent = onEvent;
    this.mode = 'menu';
    this.uiVersion = 0;
    this.volume = { music: .3, sfx: .55 };
    this.autoFire = true;
    this.time = 0;
    this.id = 0;
    this.sector = 1;
    this.seed = 0;
    this.elapsed = 0;
    this.player = { x: 0, z: 10, hp: 100, maxHp: 100, shield: 40, maxShield: 40, inv: 0, roll: 0 };
    this.hitFeedback = null;
    this.enemies = []; this.bullets = []; this.obstacles = []; this.drops = []; this.fx = [];
    this.weapons = ['vulcan']; this.weaponIndex = 0; this.items = []; this.skill = 'emp';
    this.dashCooldown = 0; this.skillCooldown = 0;
    this.money = 0; this.keys = 1; this.kills = 0; this.explored = 0; this.sectorProgress = 0;
    this.map = null; this.boss = null; this.bossWarning = null; this.rng = new RNG(1);
  }

  emit(type, value) { this.onEvent(type, value); }
  notify(text) { this.emit('toast', text); }
  sound(name) { this.emit('sound', name); }
  screen(mode) { this.mode = mode; this.uiVersion++; this.emit('screen', mode); }
  get weapon() { return WEAPONS.find(w => w.id === this.weapons[this.weaponIndex]) || WEAPONS[0]; }
  has(id) { return this.items.includes(id); }
  synergies() { return SYNERGIES.filter(s => this.weapons.includes(s.weapon) && this.has(s.item)); }
  get stats() {
    return { damage: this.has('caliber') ? 1.3 : 1,
      rate: (this.has('rapid') ? .8 : 1) / (this.has('capacitor') ? 1.15 : 1),
      speed: this.has('wing') ? 11 : 9.2, armor: this.has('plating') ? .82 : 1 };
  }

  start(seed) {
    this.seed = seed ?? (crypto.getRandomValues(new Uint32Array(1))[0] || Date.now());
    this.rng = new RNG(this.seed);
    this.sector = 1; this.elapsed = 0; this.time = 0; this.kills = 0; this.explored = 0;
    this.money = 75; this.keys = 1; this.items = []; this.weapons = ['vulcan']; this.weaponIndex = 0; this.hiddenFound = false;
    this.skill = 'emp';
    this.skillCooldown = 0; this.dashCooldown = 0; this.droneTime = 0; this.droneFire = 0;
    this.fireTimer = 0; this.lastDamage = -20; this.sectorProgress = 0;
    this.player = { x: 0, z: 10, hp: 100, maxHp: 100, shield: 40, maxShield: 40, inv: 0, roll: 0 };
    this.hitFeedback = null;
    this.clearCombat(); this.buildMap();
    this.emit('theme', { sector: 1, boss: false });
    this.sound('transition'); this.screen('map');
  }
  buildMap() {
    this.map = generateSector((this.seed + this.sector * 12737) >>> 0, this.sector);
    const entry = this.map.nodes.find(n => n.id === 'entry') || this.map.nodes[0];
    this.currentNode = entry.id; entry.visited = true; entry.cleared = true; entry.revealed = true;
    this.reveal(entry);
  }
  reveal(node) {
    for (const id of node.neighbors) {
      const n = this.map.nodes.find(n => n.id === id);
      if (n && (n.type !== 'hidden' || this.has('scanner') || this.hiddenFound)) n.revealed = true;
    }
    if (this.has('scanner')) for (const n of this.map.nodes) n.revealed = true;
  }
  availableNodes() {
    if (!this.map) return [];
    const current = this.map.nodes.find(n => n.id === this.currentNode);
    return this.map.nodes.filter(n => n.id !== this.currentNode && n.revealed &&
      (n.visited || current.neighbors.includes(n.id)));
  }
  chooseNode(id) {
    if (this.mode !== 'map') return;
    const node = this.availableNodes().find(n => n.id === id);
    if (!node) return;
    if (['boss', 'exit'].includes(node.type) && this.sectorProgress < 3) {
      this.notify(`完成 ${3 - this.sectorProgress} 处战斗空域以解除航道封锁。`); return;
    }
    this.currentNode = node.id;
    this.reveal(node);
    if (node.cleared) {
      if (node.type === 'shop') this.openShop(node);
      else { this.uiVersion++; this.sound('ui'); }
      return;
    }
    node.visited = true; this.explored++;
    if (node.type === 'shop') this.openShop(node);
    else if (node.type === 'reward' || node.type === 'hidden') this.openSalvage(node);
    else if (node.type === 'event') this.openEvent(node);
    else if (node.type === 'exit') this.nextSector();
    else this.enterCombat(node);
  }
  clearCombat() {
    this.enemies = []; this.bullets = []; this.obstacles = []; this.drops = []; this.fx = [];
    this.boss = null; this.bossWarning = null; this.hazards = []; this.combatTime = 0;
    this.emit('combatClear');
  }
  enterCombat(node) {
    this.clearCombat();
    this.player.x = 0; this.player.z = 10; this.player.inv = 0; this.player.roll = 0;
    this.protect(1.8, 'entry'); this.hitFeedback = null;
    this.combatTime = 0; this.lastDamage = -20; this.wave = 0; this.waveAt = 1.2; this.spawnedFinal = false;
    this.combatDuration = this.sector === 1 ? 42 : 48;
    if (node.type === 'elite') this.combatDuration += 8;
    this.encounterType = node.type; this.fireTimer = 0;
    this.escortTimer = .5; this.prismTimer = 1; this.environmentTimer = 5;
    this.emit('theme', { sector: this.sector, boss: node.type === 'boss' });
    if (node.type === 'boss') {
      this.boss = this.spawnEnemy('boss', 0, -10);
      this.boss.hp = this.boss.maxHp = 2600;
      this.boss.phase = 1; this.boss.fire = 2; this.boss.enter = 2.5;
      this.bossWarning = { name: '天穹裁决者', duration: 2, remaining: 2 };
      this.sound('bossWarning');
    } else {
      this.notify(node.type === 'elite' ? '精英空域 · 击溃重装编队' : '航道封锁 · 清除敌方编队');
      this.makeObstacle('cover', -6, -8);
      this.makeObstacle('barrel', -3.8, -8);
      this.makeObstacle('crate', 6, -12);
    }
    this.screen('combat');
  }
  nextSector() {
    this.clearCombat(); this.sector = 2; this.sectorProgress = 0; this.hiddenFound = false;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 35);
    this.player.shield = this.player.maxShield; this.skillCooldown = 0;
    this.buildMap(); this.money += this.has('scanner') ? 60 : 40;
    this.emit('theme', { sector: 2, boss: false }); this.sound('transition');
    this.notify('跃迁完成 · 失控轨道 / 装甲修复 +35'); this.screen('map');
  }

  makeOffer(kind, id, cost = 0) { return { kind, id, cost, sold: false }; }
  randomWeapon() { const pool = WEAPONS.filter(w => !this.weapons.includes(w.id)); return this.rng.pick(pool.length ? pool : WEAPONS).id; }
  randomItem() { const pool = ITEMS.filter(i => !this.has(i.id)); return this.rng.pick(pool.length ? pool : ITEMS).id; }
  openShop(node) {
    if (!node.offers) node.offers = [
      this.makeOffer('weapon', this.randomWeapon(), this.sector === 1 ? 65 : 90),
      this.makeOffer('item', this.randomItem(), 45),
      this.makeOffer('item', this.randomItem(), 55),
      this.makeOffer('skill', this.rng.pick(SKILLS.filter(s => s.id !== this.skill)).id, 50),
      this.makeOffer('heal', 'heal', 25), this.makeOffer('key', 'key', 20),
    ];
    this.offers = node.offers; this.screen('shop');
  }
  buy(index) {
    if (this.mode !== 'shop') return;
    const offer = this.offers[index]; if (!offer || offer.sold) return;
    if (this.money < offer.cost) { this.notify('余额不足 · 完成战斗或回收物资获取信用点'); return; }
    if (offer.kind === 'heal' && this.player.hp >= this.player.maxHp && this.player.shield >= this.player.maxShield) {
      this.notify('装甲与护盾均已满'); return;
    }
    this.money -= offer.cost; offer.sold = true; this.applyReward(offer); this.sound('buy'); this.uiVersion++;
  }
  openSalvage(node) {
    const locked = node.type === 'hidden' || this.rng.next() < .5;
    this.eventData = { title: node.type === 'hidden' ? '被遗忘的补给站' : '物资回收信号',
      text: locked ? '完整的军用货柜仍被加密锁保护。破解后可获得高价值装备，也可以只回收外围物资。' : '友军留下了完整的补给舱。选择一件装备，重新投入战斗。',
      choices: locked ? [
        { label: '消耗 1 枚通行芯片', detail: '打开补给舱，三选一装备', disabled: this.keys < 1, effect: 'unlock' },
        { label: '回收外围物资', detail: '获得 30 信用点与护盾补充', effect: 'scrap' },
      ] : [{ label: '打开补给舱', detail: '三选一装备', effect: 'free' }] };
    this.screen('event');
  }
  openEvent(node) {
    const pool = [
      { title: '失联的护航舰', text: '一艘友军运输舰正在向你发送求救信号。它的引擎过载，需要你分流能源。', choices: [
        { label: '转移护盾能源', detail: '消耗 20 护盾，获得护航无人机', effect: 'rescue', disabled: this.player.shield < 20 },
        { label: '交换物资', detail: '获得 35 信用点', effect: 'cash' }] },
      { title: '未知频率', text: '残骸中的记录仪保留着一条未登记的航线。它可能通往隐藏补给站。', choices: [
        { label: '解析坐标', detail: '揭示隐藏空域并获得 1 枚芯片', effect: 'scan' },
        { label: '拆解记录仪', detail: '获得 50 信用点', effect: 'cash50' }] },
      { title: '流动军械师', text: '独立军械师提出一次现场改装：强化你的武器，代价是交出部分备用装甲。', choices: [
        { label: '接受改装', detail: '损失 15 装甲，获得高密度弹芯', effect: 'modify', disabled: this.player.hp <= 20 },
        { label: '修复战机', detail: '恢复 25 装甲', effect: 'repair' }] },
      { title: '废弃应急电站', text: '最后一组能源电池仍在工作。你只能把它接入一个系统。', choices: [
        { label: '补充防御系统', detail: '护盾回满，装甲 +25', effect: 'repair' },
        { label: '改装武器电容', detail: '获得聚能电容，所有武器射速提高 15%', effect: 'capacitor' }] },
    ];
    this.eventData = this.rng.pick(pool); this.screen('event');
  }
  chooseEvent(index) {
    if (this.mode !== 'event') return;
    const choice = this.eventData.choices[index]; if (!choice || choice.disabled) return;
    switch (choice.effect) {
      case 'unlock': this.keys--; this.showReward(true); return;
      case 'free': this.showReward(true); return;
      case 'scrap': this.money += 30; this.player.shield = Math.min(this.player.maxShield, this.player.shield + 20); break;
      case 'rescue': this.player.shield -= 20; this.giveItem('escort'); break;
      case 'cash': this.money += 35; break;
      case 'cash50': this.money += 50; break;
      case 'scan': this.keys++; this.discoverHidden(); break;
      case 'modify': this.player.hp -= 15; this.giveItem('caliber'); break;
      case 'repair': this.player.hp = Math.min(this.player.maxHp, this.player.hp + 25); this.player.shield = this.player.maxShield; break;
      case 'capacitor': this.giveItem('capacitor'); break;
    }
    this.sound('pickup'); this.finishNode();
  }
  discoverHidden() {
    this.hiddenFound = true;
    for (const n of this.map.nodes) if (n.type === 'hidden') n.revealed = true;
    this.notify('隐藏坐标已加入航线图');
  }
  showReward(rich = false) {
    this.choices = [this.makeOffer('weapon', this.randomWeapon()), this.makeOffer('item', this.randomItem()),
      rich || this.sector === 2 ? this.makeOffer('item', this.randomItem()) : this.makeOffer('heal', 'heal')];
    if (this.choices[1].id === this.choices[2].id) this.choices[2] = this.makeOffer('skill', this.rng.pick(SKILLS).id);
    this.screen('reward');
  }
  takeReward(index) {
    if (this.mode !== 'reward') return;
    const choice = this.choices[index]; if (!choice) return;
    this.applyReward(choice); this.sound('pickup'); this.finishNode();
  }
  applyReward(offer) {
    if (offer.kind === 'weapon') {
      if (!this.weapons.includes(offer.id)) this.weapons.push(offer.id);
      else this.money += 20;
      this.switchWeapon(this.weapons.indexOf(offer.id));
      this.notify(`武器接入 · ${this.weapon.name}`);
    } else if (offer.kind === 'item') this.giveItem(offer.id);
    else if (offer.kind === 'skill') { this.skill = offer.id; this.skillCooldown = 0; this.notify(`主动模块 · ${SKILLS.find(s => s.id === offer.id).name}`); }
    else if (offer.kind === 'key') { this.keys++; this.notify('通行芯片 +1'); }
    else if (offer.kind === 'heal') {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 40); this.player.shield = this.player.maxShield;
      this.notify('装甲修复 +40 · 护盾充满');
    }
    for (const s of this.synergies()) this.notify(`协同生效 · ${s.name}`);
  }
  giveItem(id) {
    if (this.has(id)) { this.money += 25; this.notify('重复模块已回收 · +25 信用点'); return; }
    this.items.push(id);
    if (id === 'plating') { this.player.maxHp += 35; this.player.hp += 35; }
    if (id === 'reactor') { this.player.maxShield += 20; this.player.shield += 20; }
    if (id === 'scanner') { for (const n of this.map.nodes) n.revealed = true; }
    this.notify(`模块安装 · ${ITEMS.find(i => i.id === id)?.name || id}`);
  }
  finishNode() {
    const n = this.map.nodes.find(n => n.id === this.currentNode); n.cleared = true;
    this.reveal(n); this.clearCombat();
    this.emit('theme', { sector: this.sector, boss: false }); this.screen('map');
  }
  continue() {
    if (this.mode === 'shop') this.finishNode();
  }
  switchWeapon(index) {
    if (index < 0 || index >= this.weapons.length) return;
    this.weaponIndex = index;
    this.fireTimer = 0; this.uiVersion++;
  }
  pause() { if (this.mode === 'combat' || this.mode === 'map') { this.returnMode = this.mode; this.screen('pause'); } }
  resume() { if (this.mode === 'pause') this.screen(this.returnMode || 'combat'); }
  openMenu(mode) { this.previousMenu = this.mode; this.screen(mode); }
  back() { const mode = this.previousMenu || 'menu'; this.previousMenu = null; this.screen(mode); }
  handleAction(action, value) {
    switch (action) {
      case 'start': case 'restart': this.start(); break;
      case 'chooseNode': this.chooseNode(value); break;
      case 'pause': this.pause(); break;
      case 'resume': this.resume(); break;
      case 'inventory': case 'settings': case 'help': this.openMenu(action); break;
      case 'back': this.back(); break;
      case 'buy': this.buy(Number(value)); break;
      case 'takeReward': this.takeReward(Number(value)); break;
      case 'chooseEvent': this.chooseEvent(Number(value)); break;
      case 'continue': this.continue(); break;
      case 'switchWeapon': this.switchWeapon(Number(value)); break;
      case 'useSkill': this.useSkill(); break;
      case 'auto': this.autoFire = !this.autoFire; this.uiVersion++; break;
      case 'volumeMusic': this.volume.music = Number(value); this.emit('volume', this.volume); break;
      case 'volumeSfx': this.volume.sfx = Number(value); this.emit('volume', this.volume); break;
    }
  }

  particle(type, x, z, scale = 1, color, extra = {}) {
    if (this.fx.length > 110) return;
    const maxLife = type === 'emp' ? .7 : type === 'explosion' ? .65 : .22;
    this.fx.push({ id: ++this.id, type, x, z, scale, color, life: maxLife, maxLife, ...extra });
  }
  spawnEnemy(type, x, z) {
    const data = ENEMIES[type] || { hp: 2600, r: 3.1, reward: 200, speed: 0, rate: 2 };
    const mult = this.sector === 2 ? 1.35 : 1;
    const enemy = { id: ++this.id, type, x, z, originX: x, hp: data.hp * mult, maxHp: data.hp * mult,
      r: data.r, reward: data.reward, speed: data.speed, rate: data.rate, t: 0, fire: .8 + this.rng.next(), phase: 1, hit: 0 };
    this.enemies.push(enemy); return enemy;
  }
  makeObstacle(type, x, z) {
    const hp = type === 'cover' ? 140 : type === 'barrel' ? 24 : type === 'crate' ? 30 : 15;
    this.obstacles.push({ id: ++this.id, x, z, type, hp, maxHp: hp, r: type === 'cover' ? 1.35 : .7, t: 0 });
  }
  bullet(x, z, vx, vz, opts = {}) {
    if (this.bullets.length >= 450) return null;
    const b = { id: ++this.id, x, z, vx, vz, r: .17, damage: 10, enemy: false, life: 3.5, age: 0, type: 'bullet', ...opts };
    this.bullets.push(b); return b;
  }
  enemyShot(e, angle, speed = 6.5, extra = {}) {
    return this.bullet(e.x, e.z + .5, Math.sin(angle) * speed, Math.cos(angle) * speed,
      { enemy: true, enemyVisual: e.type || 'gunner', damage: this.sector === 1 ? 10 : 13, r: .22, color: '#ff653f', life: 7, ...extra });
  }
  aimed(e, count = 1, spread = .2, speed = 6.5) {
    const a = Math.atan2(this.player.x - e.x, this.player.z - e.z);
    for (let i = 0; i < count; i++) this.enemyShot(e, a + (i - (count - 1) / 2) * spread, speed);
  }
  spawnLaser(source, mountIndex = 0, options = {}) {
    const mount = LASER_MOUNTS[source.type][mountIndex];
    const hazard = { id: ++this.id, sourceId: source.id, mountIndex,
      x: source.x + mount.x, z: source.z + mount.z, y: mount.y,
      endZ: 18, life: 2.3, warning: 1.4, width: .65, type: 'beam', ...options };
    this.hazards.push(hazard); return hazard;
  }
  updateHazards(dt, playerStart = this.player) {
    for (const h of this.hazards) {
      h.life -= dt; h.warning -= dt;
      const source = this.enemies.find(e => e.id === h.sourceId && e.hp > 0);
      if (!source) { h.life = 0; continue; }
      const mount = LASER_MOUNTS[source.type][h.mountIndex];
      h.x = source.x + mount.x; h.z = source.z + mount.z; h.y = mount.y;
      if (h.z >= h.endZ) { h.life = 0; continue; }
      const p = this.player;
      if (h.life > 0 && h.warning <= 0 && playerTouchesBeam(p,h,playerStart)) this.hurt(18);
    }
    this.hazards = this.hazards.filter(h => h.life > 0);
  }
  spawnWave() {
    this.wave++;
    const types = this.sector === 1 ? ['scout', 'wing', 'gunner', 'tank', 'laser', 'carrier'] : Object.keys(ENEMIES);
    const main = this.rng.pick(types);
    const count = main === 'wing' || main === 'scout' ? 4 : main === 'tank' || main === 'elite' ? 1 : 2;
    for (let i = 0; i < count; i++) {
      this.spawnEnemy(main, count > 1 ? -8 + i * 16 / (count - 1) : this.rng.int(-7, 7), -15 - (i % 2) * 2);
    }
    if (this.wave % 2 === 0) this.spawnEnemy(this.rng.pick(['scout', 'wing', 'gunner']), this.rng.int(-8, 8), -17);
    if (this.encounterType === 'elite' && this.wave === 3) this.spawnEnemy('elite', 0, -15);
  }
  firePlayer() {
    if (this.bossWarning) return;
    const w = this.weapon;
    this.fireTimer = w.rate * this.stats.rate;
    const count = w.shots + (this.has('splitter') && w.id === 'rocket' ? 2 : 0);
    for (let i = 0; i < count; i++) {
      const angle = (i - (count - 1) / 2) * w.spread;
      const p = this.player;
      this.bullet(p.x + (w.id === 'vulcan' ? (i % 2 ? .42 : -.42) : 0), p.z - 1.1,
        Math.sin(angle) * w.speed, -Math.cos(angle) * w.speed,
        { damage: w.damage * this.stats.damage * (w.id === 'rail' && this.has('piercer') ? 1.25 : 1), r: w.kind === 'laser' ? .24 : w.kind === 'charge' ? .55 : .17,
          life: w.kind === 'boomerang' ? 1.9 : w.range / w.speed, type: w.kind, weapon: w.id, color: w.color,
          pierce: w.kind === 'pierce' || w.kind === 'boomerang' ? 4 : w.kind === 'laser' ? 2 : this.has('piercer') ? 1 : 0,
          homing: w.kind === 'missile', explosion: (w.kind === 'missile' ? 2.7 : w.kind === 'charge' ? 2.2 : 0) * (this.has('splitter') ? 1.3 : 1),
          hits: [] });
    }
    if (this.has('rapid') && w.id === 'vulcan' && this.rng.next() < .22) {
      this.bullet(this.player.x, this.player.z - 1.1, 0, -42, { damage: 18, type: 'pierce', color: '#ffeab2', pierce: 2, hits: [] });
    }
    this.particle('muzzle', this.player.x, this.player.z - 1.2, .45, w.color, { weapon: w.id });
    this.sound('fire');
  }
  dash(input = {}) {
    if (this.mode !== 'combat' || this.bossWarning || this.dashCooldown > 0) return;
    const { x: dx, z: dz } = movementVector(input);
    const len = Math.hypot(dx, dz) || 1;
    this.dashDirection = { x: dx / len, z: dz ? dz / len : dx ? 0 : -1 };
    this.player.roll = .32; this.protect(.48, 'dash');
    this.dashCooldown = this.has('wing') ? 2.4 : 3.5;
    if (this.has('wing') && this.has('reactor')) this.player.shield = Math.min(this.player.maxShield, this.player.shield + 8);
    this.particle('dash', this.player.x, this.player.z, 1.7, '#9deeff'); this.sound('skill');
  }
  useSkill() {
    if (this.mode !== 'combat' || this.bossWarning || this.skillCooldown > 0) return;
    const s = SKILLS.find(s => s.id === this.skill);
    this.skillCooldown = s.cooldown;
    const p = this.player;
    this.sound('skill');
    if (this.skill === 'emp') {
      this.bullets = this.bullets.filter(b => !b.enemy);
      for (const e of this.enemies) this.damageEnemy(e, 90);
      this.particle('skill-emp', p.x, p.z, 24, '#8ce4ff');
    } else if (this.skill === 'shield') {
      p.shield = p.maxShield; this.protect(3.5, 'skill'); this.particle('skill-shield', p.x, p.z, 5, '#96ebee');
    } else if (this.skill === 'bomb') {
      this.bullets = this.bullets.filter(b => !b.enemy);
      for (const e of this.enemies) this.damageEnemy(e, 210);
      for (const o of this.obstacles) this.damageObstacle(o, 200);
      this.particle('explosion', 0, -3, 18, '#ffae61');
      this.particle('skill-bomb', 0, -3, 18, '#ffae61');
    } else { this.droneTime = 12; this.particle('skill-drone', p.x, p.z, 1, '#b6ffd2'); }
  }
  protect(duration, reason) {
    if (duration >= this.player.inv) { this.player.inv = duration; this.player.invReason = reason; }
  }
  hurt(amount) {
    if (this.bossWarning) return false;
    const p = this.player; if (p.inv > 0 || this.mode !== 'combat' || amount <= 0) return false;
    amount *= this.stats.armor;
    const absorbed = Math.min(p.shield, amount), hullDamage = Math.min(p.hp, amount - absorbed);
    p.shield = Math.max(0, p.shield - absorbed); p.hp = Math.max(0, p.hp - hullDamage);
    this.protect(.85, 'hit'); this.lastDamage = this.combatTime;
    this.hitFeedback = { at: this.time, shield: absorbed, hull: hullDamage };
    this.particle('hit', p.x, p.z, 2.5, hullDamage > 0 ? '#ff714f' : '#9be5ee');
    this.sound('hurt'); this.emit('shake', .3); this.emit('damage', this.hitFeedback);
    if (p.hp <= 0) { p.hp = 0; this.particle('explosion', p.x, p.z, 5); this.sound('lose'); this.screen('dead'); }
    return true;
  }
  damageEnemy(e, damage, impact = e) {
    if (e.hp <= 0 || !Number.isFinite(damage) || damage <= 0) return 0;
    const amount = Math.min(e.hp, damage);
    e.hp = Math.max(0, e.hp - amount); e.hit = .12; e.lastDamageAt = this.combatTime;
    this.emit('enemyDamage', { enemyId: e.id, amount, x: impact.x, z: impact.z, hp: e.hp, maxHp: e.maxHp, type: e.type });
    this.particle('hit', e.x, e.z, .7, '#ffdea7'); this.sound('hit');
    if (e.hp <= 0) {
      this.kills++; this.money += Math.round(e.reward * (this.has('salvage') ? 1.4 : 1));
      this.particle('explosion', e.x, e.z, e.type === 'boss' ? 12 : e.r * 2);
      this.sound('explosion'); this.emit('shake', e.type === 'boss' ? 1 : .15);
      if (e.type === 'boss') { this.money += 200; this.sound('win'); this.screen('win'); }
      else if (this.rng.next() < .15) this.spawnDrop(this.rng.pick(['heal', 'shield', 'coin']), e.x, e.z);
    }
    return amount;
  }
  damageObstacle(o, damage) {
    if (o.hp <= 0) return;
    o.hp -= damage;
    if (o.hp <= 0) {
      this.particle('explosion', o.x, o.z, o.type === 'barrel' ? 5 : 2.3);
      this.sound('explosion');
      if (o.type === 'barrel' || o.type === 'mine') {
        for (const e of this.enemies) if (dist(e, o) < 5) this.damageEnemy(e, 85);
        if (dist(this.player, o) < 3) this.hurt(15);
        for (const b of this.bullets) if (dist(b, o) < 4) b.life = 0;
      }
      if (o.type === 'crate') {
        this.spawnDrop('coin', o.x, o.z); this.spawnDrop(this.rng.next() < .45 ? 'key' : 'heal', o.x + .5, o.z);
        if (this.rng.next() < .35) this.discoverHidden();
      }
    }
  }
  spawnDrop(type, x, z) { this.drops.push({ id: ++this.id, type, x, z, t: 0 }); }

  updateEnemy(e, dt) {
    e.t += dt; e.hit = Math.max(0, e.hit - dt); e.fire -= dt;
    if (e.type === 'boss') { this.updateBoss(e, dt); return; }
    e.z += e.speed * dt;
    if (e.type === 'scout') e.x = e.originX + Math.sin(e.t * 1.6) * 1.8;
    if (e.type === 'wing') e.x = e.originX + Math.sin(e.t * 1.5) * 2.2;
    if (e.type === 'elite') e.x = Math.sin(e.t * .7) * 7;
    e.x = clamp(e.x, -10, 10);
    if (e.fire <= 0 && e.z > -15 && e.z < 12) {
      e.fire = e.rate * (this.sector === 2 ? .85 : 1);
      switch (e.type) {
        case 'scout': this.aimed(e, 1, .1, 7); break;
        case 'wing': for (let i = -1; i <= 1; i++) this.enemyShot(e, i * .19, 7.5); break;
        case 'gunner': this.aimed(e, 3, .2, 7); break;
        case 'tank': for (let i = -3; i <= 3; i++) this.enemyShot(e, i * .23, 5.5); break;
        case 'laser': this.spawnLaser(e); this.notify('激光锁定 · 离开标记航道'); break;
        case 'carrier': this.aimed(e, 2, .3, 4.5); if (this.enemies.length < 16) this.spawnEnemy('wing', clamp(e.x + 2, -9, 9), e.z + 1); break;
        case 'elite': this.aimed(e, 5, .16, 6.8); for (let i = 0; i < 10; i++) this.enemyShot(e, i * Math.PI / 5 + e.t * .2, 4.2); break;
      }
    }
    if (dist(e, this.player) < e.r + .35) this.hurt(18);
    if (e.z > 19) e.hp = 0;
  }
  updateBoss(e, dt) {
    e.enter = Math.max(0, e.enter - dt);
    e.z = -9 + Math.sin(e.t * .3) * 1.4; e.x = Math.sin(e.t * .42) * 5.3;
    const phase = e.hp < e.maxHp * .32 ? 3 : e.hp < e.maxHp * .66 ? 2 : 1;
    if (phase !== e.phase) {
      e.phase = phase; e.fire = 1.8;
      this.bullets = this.bullets.filter(b => !b.enemy);
      this.particle('emp', e.x, e.z, 13, '#ff9b52'); this.emit('shake', .6);
      this.notify(phase === 2 ? '第二阶段 · 副炮阵列展开' : '最终阶段 · 核心过载'); this.sound('transition');
    }
    if (e.enter > 0 || e.fire > 0) return;
    e.attack = (e.attack || 0) + 1;
    e.fire = phase === 1 ? 1.65 : phase === 2 ? 1.35 : 1.05;
    switch (e.attack % 4) {
      case 0:
        for (let i = -4; i <= 4; i++) this.enemyShot(e, i * .16 + Math.sin(e.t) * .12, 5.8 + phase * .6);
        break;
      case 1:
        for (let i = 0; i < 14 + phase * 3; i++) this.enemyShot(e, i * Math.PI * 2 / (14 + phase * 3) + e.t * .2, 3.5 + phase * .45);
        break;
      case 2:
        for (const offset of [-3, 3]) this.aimed({ x: e.x + offset, z: e.z, type: e.type }, phase + 2, .14, 7);
        if (phase >= 2) {
          const mounts = LASER_MOUNTS.boss;
          let closest = 0;
          for (let i = 1; i < mounts.length; i++) {
            if (Math.abs(e.x + mounts[i].x - this.player.x) < Math.abs(e.x + mounts[closest].x - this.player.x)) closest = i;
          }
          this.spawnLaser(e, closest, { life: 2.2, warning: 1.5, width: .9 });
        }
        break;
      case 3:
        for (let i = -3; i <= 3; i++) this.enemyShot(e, i * .27, 4.8, { r: .32 });
        if (phase >= 2 && this.enemies.length < 5) for (const x of [-8, 8]) this.spawnEnemy('scout', x, -13);
        if (phase === 3) for (let i = 0; i < 3; i++) this.spawnLaser(e, i, { life: 2.4, warning: 1.6, width: .7 });
    }
  }
  updateBullets(dt, playerStart = this.player) {
    for (const b of this.bullets) {
      if (b.life <= 0) continue;
      b.age += dt; b.life -= dt;
      if (b.homing && !b.enemy) {
        const target = this.enemies.filter(e => e.hp > 0).sort((a, c) => dist(a, b) - dist(c, b))[0];
        if (target) {
          const d = dist(target, b) || 1, speed = Math.hypot(b.vx, b.vz);
          b.vx += ((target.x - b.x) / d * speed - b.vx) * Math.min(1, dt * 3);
          b.vz += ((target.z - b.z) / d * speed - b.vz) * Math.min(1, dt * 3);
        }
      }
      if (b.type === 'boomerang' && b.age > .55) {
        b.vz += dt * 70;
        if (b.vz >= 0 && !b.returning) { b.returning = true; b.hits = []; }
      }
      const start = { x: b.x, z: b.z };
      b.x += b.vx * dt; b.z += b.vz * dt;
      if (b.enemy) {
        const end = { x: b.x, z: b.z };
        const playerImpact = hostilePlayerImpact(b,start,end,playerStart,this.player);
        let coverImpact = null;
        for (const o of this.obstacles) {
          if (o.hp <= 0 || o.type === 'mine') continue;
          const impact = hostileCoverImpact(b,start,end,o);
          if (impact !== null && (coverImpact === null || impact < coverImpact)) coverImpact = impact;
        }
        // Resolve the first surface crossed, including a shell crossing cover and aircraft in one tick.
        const hitCover = coverImpact !== null && (playerImpact === null || coverImpact <= playerImpact);
        const impact = hitCover ? coverImpact : playerImpact;
        if (impact !== null) {
          b.x = start.x + (end.x-start.x)*impact; b.z = start.z + (end.z-start.z)*impact;
          b.life = 0;
          if (hitCover) this.particle('hit',b.x,b.z,.45,'#f3ba81');
          else if (!this.hurt(b.damage)) this.particle('deflect',b.x,b.z,.7,'#9be5ee');
        }
      } else {
        for (const e of this.enemies) {
          if (e.hp <= 0 || b.hits?.includes(e.id)) continue;
          if (dist(b, e) < e.r + b.r) {
            this.damageEnemy(e, b.damage, b);
            b.hits?.push(e.id);
            if (b.type === 'arc') {
              const count = this.has('conduct') ? 3 : 1;
              const others = this.enemies.filter(t => t.id !== e.id && t.hp > 0 && dist(t, e) < (this.has('conduct') ? 8 : 6)).slice(0, count);
              for (const t of others) {
                this.damageEnemy(t, b.damage * .65);
                this.fx.push({ id: ++this.id, type: 'arc', x: e.x, z: e.z, targetX: t.x, targetZ: t.z, life: .18, maxLife: .18, scale: 1, color: '#a9bdff' });
              }
            }
            if (b.explosion) {
              this.particle('explosion', b.x, b.z, b.explosion * 1.5, b.color);
              for (const t of this.enemies) if (t.id !== e.id && t.hp > 0 && dist(t, b) < b.explosion) this.damageEnemy(t, b.damage * .7);
              for (const o of this.obstacles) if (dist(o, b) < b.explosion) this.damageObstacle(o, b.damage);
              if (b.type === 'charge') for (const other of this.bullets) if (other.enemy && dist(other, b) < b.explosion) other.life = 0;
            }
            if (b.pierce > 0) b.pierce--; else b.life = 0;
            break;
          }
        }
      }
      for (const o of b.enemy || b.life <= 0 ? [] : this.obstacles) {
        if (o.hp <= 0 || o.type === 'mine') continue;
        if (dist(b, o) < o.r + b.r) {
          if (!b.enemy) this.damageObstacle(o, b.damage);
          b.life = 0; break;
        }
      }
      if (Math.abs(b.x) > 26 || Math.abs(b.z) > 24) b.life = 0;
    }
    this.bullets = this.bullets.filter(b => b.life > 0);
  }
  update(dt, input = {}) {
    if (this.mode === 'combat' && this.bossWarning) {
      const warning = this.bossWarning, previous = warning.remaining;
      warning.remaining = Math.max(0, previous - dt);
      for (const beat of [1.35, .7]) if (previous > beat && warning.remaining <= beat) this.sound('bossWarning');
      if (warning.remaining < 1e-6) {
        this.bossWarning = null;
        if (this.boss) { this.boss.enter = 0; this.boss.fire = .5; }
        this.uiVersion++; this.emit('combatReady');
      }
      // Only the alert clock runs. Keep entry protection, cooldowns, movement,
      // projectiles and combat clocks intact until the warning completes.
      return;
    }
    this.time += dt;
    for (const f of this.fx) f.life -= dt;
    this.fx = this.fx.filter(f => f.life > 0);
    if (['combat','map','shop','event','reward'].includes(this.mode)) this.elapsed += dt;
    if (this.mode !== 'combat') return;
    this.combatTime += dt;
    const p = this.player;
    const playerStart = { x: p.x, z: p.z };
    p.inv = Math.max(0, p.inv - dt); p.roll = Math.max(0, p.roll - dt);
    if (p.inv <= 0) p.invReason = null;
    this.dashCooldown = Math.max(0, this.dashCooldown - dt); this.skillCooldown = Math.max(0, this.skillCooldown - dt);
    this.fireTimer -= dt;
    let { x: dx, z: dz } = movementVector(input);
    if (p.roll > 0) { dx = this.dashDirection.x; dz = this.dashDirection.z; }
    this.precision = Boolean(input.slow);
    const speed = p.roll > 0 ? 31 : this.stats.speed * (input.slow ? .45 : 1);
    const target = input.dragTarget;
    if (p.roll <= 0 && Number.isFinite(target?.x) && Number.isFinite(target?.z) &&
        !input.left && !input.right && !input.up && !input.down) {
      // Apply the touch displacement in this simulation tick, before the
      // relative-motion collision sweep. Do not queue a speed-limited chase.
      p.x = clamp(target.x, -10.6, 10.6);
      p.z = clamp(target.z, -13.5, 14.5);
    } else {
      p.x = clamp(p.x + dx * speed * dt, -10.6, 10.6);
      p.z = clamp(p.z + dz * speed * dt, -13.5, 14.5);
    }
    if ((this.autoFire || input.fire) && this.fireTimer <= 0) this.firePlayer();
    if (this.has('reactor') && this.combatTime - this.lastDamage > 6) p.shield = Math.min(p.maxShield, p.shield + dt * 2.7);
    if (this.has('reactor') && this.weapon.id === 'beam') {
      this.prismTimer -= dt;
      if (this.prismTimer <= 0) {
        this.prismTimer = 1;
        for (const angle of [-.22, .22]) this.bullet(p.x, p.z - 1, Math.sin(angle) * 65, -Math.cos(angle) * 65,
          { damage: 22, color: '#bcefea', type: 'laser', pierce: 3, hits: [], life: .65 });
      }
    }
    if (this.has('escort') || this.droneTime > 0) {
      this.droneTime = Math.max(0, this.droneTime - dt); this.escortTimer -= dt;
      if (this.escortTimer <= 0) {
        this.escortTimer = .38;
        for (const x of [-1.6, 1.6]) this.bullet(p.x + x, p.z - .1, 0, -32, { damage: 9, color: '#ffd39a', weapon: 'escort' });
      }
    }
    if (!this.boss) {
      this.waveAt -= dt;
      if (this.waveAt <= 0 && this.combatTime < this.combatDuration) { this.spawnWave(); this.waveAt = this.sector === 1 ? 7.8 : 6.8; }
      this.environmentTimer -= dt;
      if (this.environmentTimer <= 0 && this.combatTime < this.combatDuration) {
        this.environmentTimer = 8 + this.rng.next() * 5;
        const type = this.rng.pick(this.sector === 1 ? ['barrel', 'crate', 'cover'] : ['barrel', 'mine', 'cover', 'crate']);
        this.makeObstacle(type, this.rng.int(-8, 8), -18);
      }
    }
    for (const e of [...this.enemies]) if (e.hp > 0) this.updateEnemy(e, dt);
    this.updateBullets(dt, playerStart);
    for (const o of this.obstacles) {
      o.t += dt; o.z += dt * 1.4;
      if (o.type === 'mine' && o.z > -13 && dist(o, p) < 2) this.damageObstacle(o, 100);
      if (o.hp > 0 && o.type !== 'mine' && dist(o, p) < o.r + .35) {
        this.hurt(12); const d = dist(o, p) || 1; p.x = clamp(p.x + (p.x - o.x) / d * dt * 10, -10.6, 10.6);
        p.z = clamp(p.z + (p.z - o.z) / d * dt * 10, -13.5, 14.5);
      }
    }
    this.updateHazards(dt, playerStart);
    this.enemies = this.enemies.filter(e => e.hp > 0);
    this.obstacles = this.obstacles.filter(o => o.hp > 0 && o.z < 20);
    for (const d of this.drops) {
      d.t += dt; d.z += dt * 2;
      const distance = dist(d, p);
      if (distance < 5 || this.has('salvage')) {
        d.x += (p.x - d.x) * dt * 4; d.z += (p.z - d.z) * dt * 4;
      }
      if (distance < .9) {
        d.t = 100;
        if (d.type === 'coin') this.money += 12;
        if (d.type === 'heal') p.hp = Math.min(p.maxHp, p.hp + 12);
        if (d.type === 'shield') p.shield = Math.min(p.maxShield, p.shield + 18);
        if (d.type === 'key') { this.keys++; this.notify('回收通行芯片 +1'); }
        this.sound('pickup');
      }
    }
    this.drops = this.drops.filter(d => d.t < 16 && d.z < 20);
    if (this.mode !== 'combat') return;
    if (!this.boss && this.combatTime > this.combatDuration && this.enemies.length === 0) {
      this.money += 25; this.sectorProgress++;
      p.shield = Math.min(p.maxShield, p.shield + 15);
      this.notify('航道清空 · +25 信用点 / 护盾 +15');
      this.showReward(this.encounterType === 'elite');
    }
  }
}
