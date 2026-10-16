import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { generateSector, WEAPONS, ITEMS, SKILLS, SYNERGIES, LASER_MOUNTS, RNG } from '../src/content.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}\n${error.stack}`); process.exitCode = 1; }
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
function game(seed = 7419) { const g = new Game(); g.start(seed); return g; }
function arena(seed = 7419) {
  const g = game(seed);
  const n = g.map.nodes.find(n => n.type === 'combat');
  g.currentNode = n.id; n.visited = true; g.enterCombat(n);
  g.autoFire = false; g.player.inv = 0;
  g.waveAt = 100; g.environmentTimer = 100;
  g.obstacles = []; return g;
}
function graphDistances(map, allowHidden = true, allowGoal = true) {
  const nodes = new Map(map.nodes.map(n => [n.id, n]));
  const distances = new Map([['entry', 0]]), queue = ['entry'];
  for (let i = 0; i < queue.length; i++) {
    const node = nodes.get(queue[i]);
    for (const id of node.neighbors) {
      assert.ok(nodes.has(id), `Broken neighbor ${id}`);
      assert.ok(nodes.get(id).neighbors.includes(node.id), 'Link must be reciprocal');
      if (!allowHidden && nodes.get(id).type === 'hidden') continue;
      if (!allowGoal && ['exit', 'boss'].includes(nodes.get(id).type)) continue;
      if (!distances.has(id)) { distances.set(id, distances.get(node.id) + 1); queue.push(id); }
    }
  }
  return distances;
}

test('2,000 seeds in each region are connected, complete and independently explorable', () => {
  for (let seed = 0; seed < 2000; seed++) for (const sector of [1, 2]) {
    const map = generateSector(seed, sector), distances = graphDistances(map), normal = graphDistances(map, false);
    assert.equal(map.nodes.length, 13);
    assert.equal(new Set(map.nodes.map(n => n.id)).size, map.nodes.length);
    assert.equal(distances.size, map.nodes.length);
    assert.equal(normal.size, map.nodes.filter(n => n.type !== 'hidden').length);
    assert.ok(map.nodes.find(n => n.id === 'entry').neighbors.length >= 2);
    assert.ok(distances.get(sector === 1 ? 'exit' : 'boss') >= 3);
    assert.equal(map.nodes.filter(n => n.type === (sector === 1 ? 'exit' : 'boss')).length, 1);
    for (const type of ['shop', 'reward', 'event', 'elite', 'hidden']) assert.ok(map.nodes.some(n => n.type === type));
    assert.ok(map.nodes.some(n => n.type === 'shop' && distances.get(n.id) <= 2));
    assert.ok(map.nodes.some(n => n.type === 'reward' && distances.get(n.id) <= 2));
    assert.ok(map.nodes.filter(n => ['combat', 'elite'].includes(n.type) && normal.has(n.id)).length >= 3);
    const unlocked = graphDistances(map, false, false);
    assert.equal(unlocked.size, map.nodes.length - 2, 'Locked goal must never disconnect ordinary exploration');
    assert.ok(map.nodes.filter(n => ['combat', 'elite'].includes(n.type) && unlocked.has(n.id)).length >= 3,
      'All three required combat clears must be available without entering the locked goal');
    assert.equal(map.nodes.find(n => n.type === 'hidden').neighbors.length, 1);
  }
});

test('seed reproduction and substantial topology / goal position variation', () => {
  const graphSignatures = new Set(), bossPositions = new Set(), exitPositions = new Set();
  for (let seed = 0; seed < 500; seed++) {
    for (const sector of [1, 2]) {
      const map = generateSector(seed, sector);
      assert.deepEqual(map, generateSector(seed, sector));
      graphSignatures.add(map.nodes.map(n => `${n.id}:${[...n.neighbors].sort().join(',')}`).join('|'));
      const goal = map.nodes.find(n => n.type === (sector === 1 ? 'exit' : 'boss'));
      (sector === 1 ? exitPositions : bossPositions).add(`${Math.round((goal.x - 12) / 25)},${Math.round((goal.y - 12) / 25)}`);
    }
  }
  assert.ok(graphSignatures.size > 950);
  assert.ok(bossPositions.size >= 6);
  assert.ok(exitPositions.size >= 6);
  const a = new RNG('reproduction'), b = new RNG('reproduction');
  assert.deepEqual(Array.from({ length: 64 }, () => a.next()), Array.from({ length: 64 }, () => b.next()));
});

test('all weapon families have independent ballistics and complete catalogs', () => {
  assert.equal(WEAPONS.length, 8); assert.equal(ITEMS.length, 12); assert.equal(SKILLS.length, 4);
  assert.equal(new Set(WEAPONS.map(w => w.kind)).size, 8);
  assert.equal(new Set(WEAPONS.map(w => [w.damage, w.rate, w.speed, w.shots, w.range].join('|'))).size, 8);
  const g = game();
  for (const weapon of WEAPONS) { g.applyReward({ kind: 'weapon', id: weapon.id }); assert.equal(g.weapon.id, weapon.id); }
  assert.deepEqual(new Set(g.weapons), new Set(WEAPONS.map(w => w.id)));
  const nextWeapon = g.randomWeapon();
  assert.ok(WEAPONS.some(w => w.id === nextWeapon), 'Full ownership must not break future reward generation');
  g.showReward(true); assert.equal(g.choices.length, 3);
});

test('shop insufficiency preserves state and purchases are charged once', () => {
  const g = game(); g.mode = 'shop'; g.money = 30;
  g.offers = [g.makeOffer('weapon', 'rocket', 65), g.makeOffer('key', 'key', 20)];
  g.buy(0); assert.equal(g.money, 30); assert.equal(g.offers[0].sold, false); assert.ok(!g.weapons.includes('rocket'));
  g.money = 100; g.buy(0); assert.equal(g.money, 35); assert.ok(g.weapons.includes('rocket')); assert.equal(g.offers[0].sold, true);
  g.buy(0); assert.equal(g.money, 35);
  const keys = g.keys; g.buy(1); assert.equal(g.money, 15); assert.equal(g.keys, keys + 1);
});

test('healing is bounded and full-health purchases do not consume currency', () => {
  const g = game(); g.mode = 'shop'; g.money = 80; g.offers = [g.makeOffer('heal', 'heal', 25)];
  g.buy(0); assert.equal(g.money, 80); assert.equal(g.offers[0].sold, false);
  g.player.hp = 78; g.player.shield = 3; g.buy(0);
  assert.equal(g.money, 55); assert.equal(g.player.hp, g.player.maxHp); assert.equal(g.player.shield, g.player.maxShield);
});

test('passive installation changes damage, armor, sustained fire rate, speed and dash', () => {
  const g = arena();
  g.giveItem('caliber'); g.firePlayer(); near(g.bullets[0].damage, g.weapon.damage * 1.3);
  g.giveItem('rapid'); g.firePlayer(); near(g.fireTimer, g.weapon.rate * .8);
  const interval = g.fireTimer; g.giveItem('capacitor'); g.firePlayer(); near(g.fireTimer, interval / 1.15);
  g.giveItem('plating'); assert.equal(g.player.maxHp, 135); assert.equal(g.player.hp, 135);
  g.player.shield = 0; g.player.inv = 0; g.hurt(10); near(g.player.hp, 135 - 8.2);
  g.giveItem('wing'); assert.ok(g.stats.speed > 9.2); g.dash({ right: true }); near(g.dashCooldown, 2.4);
  g.giveItem('reactor'); assert.equal(g.player.maxShield, 60);
  const money = g.money; g.giveItem('reactor'); assert.equal(g.player.maxShield, 60); assert.equal(g.money, money + 25);
});

test('all four synergy definitions activate from actual ownership', () => {
  const g = game();
  for (const s of SYNERGIES) { g.applyReward({ kind: 'weapon', id: s.weapon }); g.giveItem(s.item); }
  assert.deepEqual(new Set(g.synergies().map(s => s.id)), new Set(SYNERGIES.map(s => s.id)));
});

test('splitter missiles, rail upgrades and piercing are effective during firing', () => {
  const g = arena();
  g.applyReward({ kind: 'weapon', id: 'rocket' }); g.giveItem('splitter'); g.firePlayer();
  assert.equal(g.bullets.filter(b => b.weapon === 'rocket').length, 3);
  assert.ok(g.bullets[0].explosion > 2.7);
  g.bullets = []; g.applyReward({ kind: 'weapon', id: 'rail' }); g.giveItem('piercer'); g.firePlayer();
  near(g.bullets[0].damage, WEAPONS.find(w => w.id === 'rail').damage * 1.25);
  g.bullets = []; g.switchWeapon(0); g.firePlayer(); assert.ok(g.bullets[0].pierce >= 1);
});

test('electromagnetic pulse clears enemy fire but preserves allied fire', () => {
  const g = arena();
  const e = g.spawnEnemy('tank', 0, -5); const hp = e.hp;
  g.bullet(4, 8, 0, 0, { enemy: true }); const allied = g.bullet(-4, 7, 0, 0);
  g.useSkill(); assert.equal(g.bullets.length, 1); assert.equal(g.bullets[0], allied); near(e.hp, hp - 90);
  assert.equal(g.skillCooldown, SKILLS.find(s => s.id === 'emp').cooldown);
  g.useSkill(); near(e.hp, hp - 90);
});

test('shield skill restores shield and protects during its invulnerability interval', () => {
  const g = arena(); g.skill = 'shield'; g.player.shield = 0; g.useSkill();
  assert.equal(g.player.shield, g.player.maxShield); near(g.player.inv, 3.5);
  g.hurt(1000); assert.equal(g.player.hp, 100); assert.equal(g.mode, 'combat');
});

test('all eight weapons sustain automatic and held manual fire for 60 seconds without magazine pauses', () => {
  const dt = 1 / 90;
  for (const weapon of WEAPONS) for (const autoFire of [true, false]) {
    const g = arena(); g.applyReward({ kind: 'weapon', id: weapon.id }); g.autoFire = autoFire;
    g.combatDuration = 120; g.waveAt = 120; g.environmentTimer = 120;
    const shots = [];
    g.onEvent = (type, value) => { if (type === 'sound' && value === 'fire') shots.push(g.combatTime); };
    for (let i = 0; i < 5400; i++) g.update(dt, { fire: !autoFire });
    assert.equal(g.mode, 'combat');
    assert.ok(shots.length >= Math.floor(60 / (weapon.rate + dt)), `${weapon.id} sustained shot count`);
    for (let i = 1; i < shots.length; i++) {
      assert.ok(shots[i] - shots[i - 1] <= weapon.rate + dt + 1e-8,
        `${weapon.id} ${autoFire ? 'auto' : 'manual'} unexpected firing pause`);
    }
    assert.ok(60 - shots.at(-1) <= weapon.rate + dt, `${weapon.id} keeps firing at end of minute`);
  }
});

test('beam with reactor and firing upgrades sustains fire and retains prism synergy', () => {
  const g = arena(); g.applyReward({ kind: 'weapon', id: 'beam' });
  g.giveItem('reactor'); g.giveItem('capacitor'); g.giveItem('rapid');
  g.autoFire = true; g.combatDuration = 120; g.waveAt = 120; g.environmentTimer = 120;
  let count = 0, previous = 0, biggestGap = 0, prismSeen = false;
  g.onEvent = (type, value) => {
    if (type === 'sound' && value === 'fire') {
      if (count) biggestGap = Math.max(biggestGap, g.combatTime - previous);
      previous = g.combatTime; count++;
    }
  };
  for (let i = 0; i < 5400; i++) {
    g.update(1 / 90);
    prismSeen ||= g.bullets.some(b => b.type === 'laser' && b.vx !== 0);
  }
  assert.ok(count > 900); assert.ok(biggestGap <= g.weapon.rate * g.stats.rate + 1 / 90 + 1e-8);
  assert.ok(prismSeen); assert.ok(g.synergies().some(s => s.id === 'prism'));
});

test('reactor regeneration uses the new room clock after a late previous hit', () => {
  const g = arena(); g.giveItem('reactor'); g.player.shield = 0; g.lastDamage = 35;
  g.enterCombat(g.map.nodes.find(n => n.type === 'combat'));
  g.autoFire = false; g.waveAt = 100; g.environmentTimer = 100; g.obstacles = []; g.player.shield = 0;
  for (let i = 0; i < 900; i++) g.update(1 / 90);
  assert.ok(g.player.shield > 0, 'Previous-room timestamps must not suppress recovery');
});

test('dash preserves longer active shield invulnerability', () => {
  const g = arena(); g.skill = 'shield'; g.useSkill(); const protection = g.player.inv;
  g.dash({ right: true }); assert.ok(g.player.inv >= protection);
});

test('bomb and drone active skills deliver their independent effects', () => {
  const g = arena(); g.skill = 'bomb';
  const e = g.spawnEnemy('elite', 0, -11), hp = e.hp;
  g.makeObstacle('cover', -7, -8); g.bullet(0, 0, 0, 0, { enemy: true }); g.useSkill();
  near(e.hp, hp - 210); assert.equal(g.bullets.filter(b => b.enemy).length, 0); assert.ok(g.obstacles[0].hp <= 0);
  g.skill = 'drone'; g.skillCooldown = 0; g.useSkill(); assert.equal(g.droneTime, 12);
  g.escortTimer = 0; g.update(.016); assert.equal(g.bullets.filter(b => b.weapon === 'escort').length, 2);
});

test('shield absorbs damage, invulnerability prevents repeated hits, zero armor ends run', () => {
  const g = arena(); g.hurt(25); assert.equal(g.player.shield, 15); assert.equal(g.player.hp, 100);
  g.hurt(1000); assert.equal(g.player.hp, 100); assert.equal(g.mode, 'combat');
  g.player.inv = 0; g.hurt(30); assert.equal(g.player.shield, 0); assert.equal(g.player.hp, 85);
  g.player.inv = 0; g.hurt(1000); assert.equal(g.player.hp, 0); assert.equal(g.mode, 'dead');
});

test('cannon shells contacting either wing consume shield and disappear on impact', () => {
  for (const x of [-.95,.95]) {
    const g = arena();
    g.bullet(x,g.player.z,0,7,{ enemy: true, r: .22, damage: 12 });
    g.update(1/90);
    near(g.player.shield,28); near(g.player.hp,100); assert.equal(g.bullets.length,0);
    assert.equal(g.hitFeedback.shield,12); assert.equal(g.player.invReason,'hit');
  }
});

test('the solid nose of a long shell hits before its center reaches the aircraft', () => {
  const g = arena();
  g.bullet(0,g.player.z-2.1,0,7,{ enemy: true, r: .22 });
  g.update(1/90);
  near(g.player.shield,30); assert.equal(g.bullets.length,0);
});

test('fast straight and diagonal shells cannot tunnel through the airframe', () => {
  for (const [x,z,vx,vz] of [[0,4,0,1200],[-6,4,1200,1200],[-6,10.6,1200,0]]) {
    const g = arena(); g.bullet(x,z,vx,vz,{ enemy: true, r: .22 });
    g.update(1/90); near(g.player.shield,30); assert.equal(g.bullets.length,0);
  }
});

test('relative collision sweep catches a moving aircraft crossing a stationary shell', () => {
  const g = arena(); g.player.x = -3;
  g.bullet(0,10.5,0,0,{ enemy: true, r: .22 });
  g.update(.65,{ right: true });
  assert.ok(g.player.x > 2.9); near(g.player.shield,30); assert.equal(g.bullets.length,0);
});

test('bloom beside the wing and empty space beside the nose are safe near misses', () => {
  for (const [x,z] of [[1.65,10.6],[1,7.7]]) {
    const g = arena(); g.bullet(x,z,0,7,{ enemy: true, r: .22 });
    g.update(1/90); near(g.player.shield,40); near(g.player.hp,100); assert.equal(g.bullets.length,1);
  }
});

test('shell damage exhausts shield then subtracts exactly the remaining hull damage', () => {
  const g = arena(); g.player.shield = 5;
  g.bullet(.95,10,0,7,{ enemy: true, r: .22, damage: 12 });
  g.update(1/90); near(g.player.shield,0); near(g.player.hp,93);
  assert.equal(g.hitFeedback.shield,5); assert.equal(g.hitFeedback.hull,7);
  g.player.inv = 0; g.bullet(-.95,10,0,7,{ enemy: true, r: .22, damage: 12 });
  g.update(1/90); near(g.player.hp,81); assert.equal(g.hitFeedback.hull,12);
});

test('recovery protection blocks a cluster once and expired protection permits the next hit', () => {
  const g = arena();
  for (const x of [-.95,0,.95]) g.bullet(x,10,0,7,{ enemy: true, r: .22 });
  g.update(1/90); near(g.player.shield,30); assert.equal(g.bullets.length,0);
  assert.ok(g.fx.some(effect => effect.type === 'deflect'));
  for (let i = 0; i < 80; i++) g.update(1/90);
  near(g.player.inv,0);
  g.bullet(.95,10,0,7,{ enemy: true, r: .22 }); g.update(1/90); near(g.player.shield,20);
});

test('entry, dash and active force field protection all intercept shells without damage', () => {
  for (const reason of ['entry','dash','skill']) {
    const g = arena();
    if (reason === 'entry') g.protect(1.8,'entry');
    if (reason === 'dash') g.dash({ right: true });
    if (reason === 'skill') { g.skill = 'shield'; g.useSkill(); }
    g.bullet(.95,10,0,7,{ enemy: true, r: .22 }); g.update(1/90);
    near(g.player.shield,40); near(g.player.hp,100); assert.equal(g.bullets.length,0);
    assert.equal(g.player.invReason,reason); assert.ok(g.fx.some(effect => effect.type === 'deflect'));
  }
});

test('continuous collision resolves cover before aircraft and aircraft before cover behind it', () => {
  for (const coverZ of [5,13]) {
    const g = arena(); g.makeObstacle('cover',0,coverZ);
    g.bullet(0,1,0,1200,{ enemy: true, r: .22 }); g.update(1/90);
    near(g.player.shield,coverZ === 5 ? 40 : 30); assert.equal(g.bullets.length,0);
    assert.equal(g.obstacles[0].hp,g.obstacles[0].maxHp);
  }
});

test('a lethal shell clamps hull to zero and enters the defeat screen', () => {
  const g = arena(); g.player.shield = 0; g.player.hp = 4;
  g.bullet(.95,10,0,7,{ enemy: true, r: .22, damage: 13 });
  g.update(1/90); near(g.player.hp,0); near(g.player.shield,0); assert.equal(g.mode,'dead');
});

test('cover blocks hostile fire and explosives affect nearby enemies', () => {
  const g = arena(); g.makeObstacle('cover', 0, 0);
  g.bullet(0, -.5, 0, 1, { enemy: true }); g.updateBullets(.05); assert.equal(g.bullets.length, 0);
  const e = g.spawnEnemy('tank', 1, 0), hp = e.hp; g.makeObstacle('barrel', .2, 0);
  g.damageObstacle(g.obstacles[1], 100); near(e.hp, hp - 85);
});

test('defeated enemies cannot be rewarded twice and salvage increases currency', () => {
  const g = arena(); g.giveItem('salvage'); const e = g.spawnEnemy('tank', 0, -5);
  const before = g.money; g.damageEnemy(e, 1000); assert.equal(g.money, before + Math.round(e.reward * 1.4));
  const after = g.money, kills = g.kills; g.damageEnemy(e, 1000); assert.equal(g.money, after); assert.equal(g.kills, kills);
});

test('locked salvage consumes one key and reward choice resolves the node', () => {
  const g = game(); const node = g.map.nodes.find(n => n.type === 'hidden');
  g.currentNode = node.id; node.visited = true; g.openSalvage(node);
  assert.equal(g.mode, 'event'); const keys = g.keys;
  g.chooseEvent(0); assert.equal(g.keys, keys - 1); assert.equal(g.mode, 'reward');
  const weaponId = g.choices[0].id; g.takeReward(0);
  assert.ok(g.weapons.includes(weaponId)); assert.equal(g.mode, 'map'); assert.equal(node.cleared, true);
});

test('no-key locked containers still provide a completable scrap route', () => {
  const g = game(); const node = g.map.nodes.find(n => n.type === 'hidden');
  g.currentNode = node.id; g.keys = 0; g.openSalvage(node); const before = g.money;
  g.chooseEvent(0); assert.equal(g.mode, 'event'); assert.equal(g.keys, 0);
  g.chooseEvent(1); assert.equal(g.money, before + 30); assert.equal(g.mode, 'map'); assert.equal(node.cleared, true);
});

test('scanner exposes the optional hidden branch and transfers exploration bonus', () => {
  const g = game(); assert.equal(g.map.nodes.find(n => n.type === 'hidden').revealed, false);
  g.giveItem('scanner'); assert.ok(g.map.nodes.every(n => n.revealed));
  const before = g.money; g.nextSector(); assert.equal(g.money, before + 60); assert.ok(g.map.nodes.every(n => n.revealed));
});

test('combat clear rewards advance progress and block premature sector entry', () => {
  const g = arena(); const current = g.map.nodes.find(n => n.id === g.currentNode);
  g.combatDuration = 0; g.update(.016); assert.equal(g.mode, 'reward'); assert.equal(g.sectorProgress, 1);
  g.takeReward(0); assert.equal(current.cleared, true); assert.equal(g.mode, 'map');
  const exit = g.map.nodes.find(n => n.type === 'exit');
  g.currentNode = exit.neighbors[0]; exit.revealed = true; g.chooseNode(exit.id); assert.equal(g.sector, 1);
  g.sectorProgress = 3; const owned = [...g.weapons]; g.chooseNode(exit.id);
  assert.equal(g.sector, 2); assert.equal(g.mode, 'map'); assert.equal(g.sectorProgress, 0); assert.deepEqual(g.weapons, owned);
});

test('enemy laser stays attached to its forward muzzle during warning and active flight', () => {
  const g = arena(), e = g.spawnEnemy('laser', 2, -8);
  e.fire = 100; g.player.x = -10;
  const h = g.spawnLaser(e), mount = LASER_MOUNTS.laser[0];
  let activeSeen = false;
  for (let i = 0; i < 180; i++) {
    g.update(1 / 90);
    near(h.x, e.x + mount.x); near(h.z, e.z + mount.z);
    assert.ok(h.z > e.z); activeSeen ||= h.warning <= 0;
  }
  assert.ok(activeSeen); assert.ok(e.z > -8); assert.ok(g.hazards.includes(h));
});

test('laser warnings are safe and damage is limited to the visible forward segment', () => {
  const g = arena(), e = g.spawnEnemy('laser', 0, 0), h = g.spawnLaser(e);
  e.fire = 100; g.player.x = 0; g.player.z = 5;
  const defense = () => g.player.hp + g.player.shield, before = defense();
  g.updateHazards(.01); near(defense(), before);
  h.warning = 0; g.player.z = h.z - 1.3; g.updateHazards(.01); near(defense(), before);
  g.player.z = h.endZ + 1.8; g.updateHazards(.01); near(defense(), before);
  g.player.z = 5; g.updateHazards(.01); assert.ok(defense() < before);
});

test('active laser detects a wing entering the beam while its center stays outside', () => {
  const g = arena(), e = g.spawnEnemy('laser',0,-8), h = g.spawnLaser(e);
  h.warning = 0; g.player.x = 2.2; g.player.z = 5;
  g.updateHazards(.01); near(g.player.shield,40);
  g.player.x = 1.7; g.updateHazards(.01); near(g.player.shield,22);
});

test('destroying a laser source removes its beam before it can damage the player', () => {
  const g = arena(), e = g.spawnEnemy('laser', 0, -8);
  e.fire = 100; const h = g.spawnLaser(e); h.warning = 0;
  g.player.x = 0; g.player.z = 5;
  const before = g.player.hp + g.player.shield;
  g.damageEnemy(e, e.hp); g.updateHazards(1 / 90);
  assert.equal(g.hazards.length, 0); near(g.player.hp + g.player.shield, before);
});

test('Boss laser attacks use its physical front cannons and follow the moving hull', () => {
  const g = game(); g.nextSector(); const n = g.map.nodes.find(n => n.type === 'boss');
  g.currentNode = n.id; g.enterCombat(n); const e = g.boss;
  e.hp = e.maxHp * .6; e.phase = 2; e.enter = 0; e.fire = 0; e.attack = 1; g.player.x = 9;
  g.updateBoss(e, .01); assert.equal(g.hazards.length, 1); assert.equal(g.hazards[0].mountIndex, 2);
  g.hazards = []; e.hp = e.maxHp * .2; e.phase = 3; e.fire = 0; e.attack = 2;
  g.updateBoss(e, .01); assert.equal(g.hazards.length, 3);
  assert.deepEqual(g.hazards.map(h => h.mountIndex), [0, 1, 2]);
  e.x += 2; e.z += 1; g.updateHazards(.01);
  for (const h of g.hazards) {
    const mount = LASER_MOUNTS.boss[h.mountIndex];
    near(h.x, e.x + mount.x); near(h.z, e.z + mount.z); assert.ok(h.z > e.z);
  }
});

test('Boss stage thresholds change attacks and defeating Boss resolves victory', () => {
  const g = game(); g.nextSector(); const node = g.map.nodes.find(n => n.type === 'boss');
  g.currentNode = node.id; g.enterCombat(node); const boss = g.boss;
  boss.hp = boss.maxHp * .6; g.updateBoss(boss, .016); assert.equal(boss.phase, 2);
  boss.hp = boss.maxHp * .2; g.updateBoss(boss, .016); assert.equal(boss.phase, 3);
  g.damageEnemy(boss, boss.hp + 1); assert.equal(g.mode, 'win'); assert.ok(g.kills >= 1);
});

test('pause freezes combat progression and resume restores previous mode', () => {
  const g = arena(); g.pause(); const elapsed = g.elapsed, time = g.combatTime;
  g.update(2, { right: true, fire: true }); assert.equal(g.elapsed, elapsed); assert.equal(g.combatTime, time);
  g.resume(); assert.equal(g.mode, 'combat'); g.update(.016); assert.ok(g.combatTime > time);
});

test('Boss entry warns for two seconds before movement, attacks, damage and clocks start', () => {
  const events=[],g=new Game((type,value)=>events.push([type,value]));g.start(4);g.nextSector();
  const node=g.map.nodes.find(n=>n.type==='boss');g.currentNode=node.id;g.enterCombat(node);
  assert.equal(g.bossWarning.name,'天穹裁决者');near(g.bossWarning.remaining,2);
  const clock=g.elapsed,inv=g.player.inv,hp=g.boss.hp;
  for(let i=0;i<179;i++)g.update(1/90,{right:true,fire:true,dragTarget:{x:8,z:4}});
  assert.ok(g.bossWarning);near(g.player.x,0);near(g.player.z,10);
  near(g.elapsed,clock);near(g.combatTime,0);near(g.player.inv,inv);
  g.dash({right:true});g.useSkill();g.firePlayer();assert.equal(g.bullets.length,0);
  near(g.dashCooldown,0);near(g.skillCooldown,0);near(g.boss.hp,hp);assert.equal(g.hurt(90),false);
  assert.equal(events.filter(([t,v])=>t==='sound'&&v==='bossWarning').length,3);
  g.update(1/90,{right:true});assert.equal(g.bossWarning,null);near(g.combatTime,0);
  g.update(1/90,{right:true,fire:true});assert.ok(g.player.x>0&&g.bullets.some(b=>!b.enemy));
  assert.ok(g.combatTime>0);assert.equal(events.filter(([t])=>t==='combatReady').length,1);
});

test('Boss warning pauses, resumes its remaining time, and clears on restart and ordinary combat', () => {
  const g=game();g.nextSector();const node=g.map.nodes.find(n=>n.type==='boss');g.enterCombat(node);
  g.update(.6);near(g.bossWarning.remaining,1.4);g.pause();g.update(8);near(g.bossWarning.remaining,1.4);
  g.resume();g.update(.7);near(g.bossWarning.remaining,.7);
  g.openMenu('settings');g.update(2);near(g.bossWarning.remaining,.7);g.back();g.update(.7);assert.equal(g.bossWarning,null);
  g.enterCombat(node);g.start(4);assert.equal(g.bossWarning,null);
  g.enterCombat(g.map.nodes.find(n=>n.type==='combat'));assert.equal(g.bossWarning,null);
  g.update(.1,{right:true});assert.ok(g.player.x>0);
});

test('restart clears build, damage, entities, map secrets and cooldowns', () => {
  const g = arena(); g.giveItem('reactor'); g.applyReward({ kind: 'weapon', id: 'rocket' });
  g.discoverHidden(); g.spawnEnemy('elite', 0, -5); g.bullet(0, 0, 0, 1);
  g.skillCooldown = 12; g.dashCooldown = 2; g.elapsed = 44; g.money = 999; g.player.hp = 2;
  g.start(888);
  assert.equal(g.mode, 'map'); assert.equal(g.sector, 1); assert.deepEqual(g.items, []); assert.deepEqual(g.weapons, ['vulcan']);
  assert.equal(g.money, 75); assert.equal(g.player.hp, 100); assert.equal(g.player.maxShield, 40);
  assert.equal(g.skillCooldown, 0); assert.equal(g.dashCooldown, 0); assert.equal(g.elapsed, 0);
  assert.equal(g.enemies.length, 0); assert.equal(g.bullets.length, 0); assert.equal(g.obstacles.length, 0);
  assert.equal(Boolean(g.hiddenFound), false); assert.equal(g.map.nodes.find(n => n.type === 'hidden').revealed, false);
});

test('analog movement preserves stick magnitude and caps diagonal / mixed-input speed', () => {
  const g = arena(); g.player.x = g.player.z = 0;
  g.update(.1, { moveX: .25 }); near(g.player.x, g.stats.speed * .1 * .25); near(g.player.z, 0);
  g.player.x = g.player.z = 0;
  g.update(.1, { moveX: 1, moveZ: 1 }); near(Math.hypot(g.player.x, g.player.z), g.stats.speed * .1);
  g.player.x = g.player.z = 0;
  g.update(.1, { moveX: 1, right: true, down: true }); near(Math.hypot(g.player.x, g.player.z), g.stats.speed * .1);
  g.player.x = g.player.z = 0;
  g.update(.1, { moveX: .8, slow: true }); near(g.player.x, g.stats.speed * .1 * .8 * .45);
});

test('analog dash follows the current stick direction and idle dash moves forward', () => {
  const g = arena(); g.dash({ moveX: .3, moveZ: -.4 });
  near(g.dashDirection.x, .6); near(g.dashDirection.z, -.8);
  g.dashCooldown = 0; g.dash({}); near(g.dashDirection.x, 0); near(g.dashDirection.z, -1);
});

test('relative drag targets stop exactly without overshoot or stationary-finger drift', () => {
  const g = arena(); g.player.x = g.player.z = 0;
  const input = { dragTarget: { x: .2, z: -.4 }, moveX: 1 };
  g.update(.1, input); near(g.player.x, .2); near(g.player.z, -.4);
  g.update(.1, input); near(g.player.x, .2); near(g.player.z, -.4);
});

test('touch drag reaches the latest target in one tick and respects battlefield boundaries', () => {
  const g = arena(); g.player.x = g.player.z = 0;
  g.update(1/90, { dragTarget: { x: 8, z: -8 } }); near(g.player.x,8);near(g.player.z,-8);
  g.player.x = g.player.z = 0;
  // TouchControls already scales the gesture for precision; do not delay or
  // multiply its finished world-space target a second time in the game loop.
  g.update(1/90, { dragTarget: { x: 4.5, z: 0 }, slow: true }); near(g.player.x,4.5);
  g.player.x = 10.55; g.player.z = 14.45;
  g.update(.1, { dragTarget: { x: 100, z: 100 } }); near(g.player.x, 10.6); near(g.player.z, 14.5);
});

test('direct dragging sweeps hostile shells across the entire movement path', () => {
  const g=arena();g.player.x=-5;g.player.z=8;
  g.bullet(0,8,0,1,{enemy:true,r:.22,damage:12});
  g.update(1/90,{dragTarget:{x:5,z:8}});near(g.player.x,5);near(g.player.shield,28);
  assert.equal(g.bullets.filter(b=>b.enemy).length,0);
});

test('direct dragging cannot cross an active laser between two safe endpoints', () => {
  const g=arena(),e=g.spawnEnemy('laser',0,-8),h=g.spawnLaser(e);
  e.fire=100;h.warning=0;g.player.x=-5;g.player.z=8;
  g.update(1/90,{dragTarget:{x:5,z:8}});near(g.player.shield,22);
  const safe=arena(),source=safe.spawnEnemy('laser',0,0),warning=safe.spawnLaser(source);
  source.fire=100;safe.player.x=-5;safe.player.z=8;
  safe.update(1/90,{dragTarget:{x:5,z:8}});near(safe.player.shield,40);
  warning.warning=0;safe.player.x=-5;safe.player.z=-3;
  safe.update(1/90,{dragTarget:{x:5,z:-3}});near(safe.player.shield,40);
});

test('enemy projectile identity survives aimed fire and every Boss side volley', () => {
  const g = arena();
  for (const type of ['scout','wing','gunner','tank','carrier','elite','boss']) {
    g.bullets=[];g.aimed({type,x:0,z:-8},3,.2,7);
    assert.equal(g.bullets.length,3);
    for(const b of g.bullets){assert.equal(b.enemyVisual,type);near(Math.hypot(b.vx,b.vz),7);near(b.damage,10);near(b.r,.22);}
  }
  const boss=g.spawnEnemy('boss',0,-9);boss.enter=0;boss.phase=1;
  for(const attack of [0,1,2,3]) {
    g.bullets=[];boss.fire=0;boss.attack=attack;g.updateBoss(boss,0);
    assert.ok(g.bullets.length>0);
    assert.ok(g.bullets.every(b=>b.enemyVisual==='boss'));
    if(attack===2)assert.ok(g.bullets.every(b=>b.r===.32));
  }
});

test('keyboard and an active dash retain priority over a drag target', () => {
  const g = arena(); g.player.x = g.player.z = 0;
  g.update(.1, { right: true, dragTarget: { x: -5, z: 0 } }); near(g.player.x, g.stats.speed * .1);
  g.player.x = g.player.z = 0; g.dash({ right: true });
  g.update(.1, { dragTarget: { x: -5, z: 0 } }); near(g.player.x, 3.1);
});

console.log(`\n${passed} logic suites passed${process.exitCode ? '; failures above.' : '.'}`);
