import { Vector3 } from 'three';

const BAR_LIFETIME = 2.2;
const NUMBER_LIFETIME = .86;
const MAX_NUMBERS = 80;
const heldScreens = new Set(['pause', 'settings', 'help', 'inventory']);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function formatDamage(amount) {
  const value = Math.max(.1, Math.round(amount * 10) / 10);
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

// A separate transparent HUD canvas keeps small text sharp at native device
// density. It never receives input or joins the frequently rebuilt menu DOM.
// Numbers use actual health removed; short simultaneous hits share a popup.
export class CombatFeedback {
  constructor(renderer) {
    this.renderer = renderer;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'combat-feedback';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.hidden = true;
    renderer.canvas.insertAdjacentElement('afterend', this.canvas);
    this.context = this.canvas.getContext('2d');
    this.point = new Vector3();
    this.numbers = []; this.bars = []; this.drawnNumbers = [];
    this.sequence = 0; this.width = this.height = 1; this.ratio = 1;
  }

  resize(rect) {
    this.width = Math.max(1, rect.width); this.height = Math.max(1, rect.height);
    this.ratio = Math.min(devicePixelRatio || 1, 4, Math.sqrt(4000000 / (this.width * this.height)));
    Object.assign(this.canvas.style, { left: `${rect.left}px`, top: `${rect.top}px`,
      width: `${this.width}px`, height: `${this.height}px` });
    const width = Math.round(this.width * this.ratio), height = Math.round(this.height * this.ratio);
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
  }

  hit(event) {
    if (!Number.isFinite(event.amount) || event.amount <= 0 || !Number.isFinite(event.x) || !Number.isFinite(event.z)) return;
    const previous = [...this.numbers].reverse().find(n => n.enemyId === event.enemyId && n.age < .06 && !n.lethal);
    if (previous) {
      previous.amount += event.amount; previous.text = formatDamage(previous.amount);
      previous.lethal = event.hp <= 0;
      return;
    }
    // Keep rapid fire readable: older numbers from the same target finish
    // fading sooner once three newer hits are present.
    const siblings = this.numbers.filter(n => n.enemyId === event.enemyId);
    if (siblings.length >= 3) for (const old of siblings.slice(0, -2)) old.lifetime = Math.min(old.lifetime, old.age + .12);
    if (this.numbers.length >= MAX_NUMBERS) this.numbers.shift();
    const lane = [0, -10, 10, -5, 5][this.sequence++ % 5];
    this.numbers.push({ enemyId: event.enemyId, x: event.x, z: event.z, amount: event.amount,
      text: formatDamage(event.amount), lethal: event.hp <= 0, age: 0, lifetime: NUMBER_LIFETIME, lane });
  }

  reset() {
    this.numbers.length = this.bars.length = this.drawnNumbers.length = 0;
    this.context.clearRect(0, 0, this.width, this.height);
  }

  project(x, z, y = .65) {
    this.point.set(x, y, z).project(this.renderer.camera);
    return { x: (this.point.x + 1) * this.width / 2, y: (1 - this.point.y) * this.height / 2 };
  }

  update(game, dt) {
    const active = game.mode === 'combat' && !game.bossWarning;
    this.canvas.hidden = !active;
    if (!active) {
      if (!heldScreens.has(game.mode)) this.reset();
      return;
    }
    const ctx = this.context;
    ctx.clearRect(0, 0, this.width, this.height);
    this.bars.length = this.drawnNumbers.length = 0;
    const touch = document.documentElement.dataset.input === 'touch';
    for (const enemy of game.enemies || []) {
      const age = game.combatTime - enemy.lastDamageAt;
      if (enemy.type === 'boss' || enemy.hp <= 0 || enemy.hp >= enemy.maxHp || !Number.isFinite(age) || age >= BAR_LIFETIME) continue;
      const mesh = this.renderer.entities.get(`e${enemy.id}`);
      const at = this.project(enemy.x, enemy.z - enemy.r - .65, (mesh?.position.y || .12) + .5);
      const width = enemy.type === 'elite' ? 62 : touch ? 44 : 50;
      if (at.x < -width / 2 || at.x > this.width + width / 2 || at.y < -5 || at.y > this.height + 5) continue;
      const x = Math.round(clamp(at.x - width / 2, 3, this.width - width - 3));
      const y = Math.round(clamp(at.y, 3, this.height - 9));
      const ratio = clamp(enemy.hp / enemy.maxHp, 0, 1), alpha = clamp((BAR_LIFETIME - age) / .3, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#06101fe8'; ctx.fillRect(x - 1, y - 2, width + 2, 8);
      ctx.fillStyle = '#65433a'; ctx.fillRect(x, y, width, 4);
      ctx.fillStyle = enemy.type === 'elite' ? '#f0b45b' : ratio < .25 ? '#ff5f49' : '#f79870';
      ctx.fillRect(x, y, width * ratio, 4);
      ctx.fillStyle = '#ffe4be'; ctx.fillRect(x + Math.max(0, width * ratio - 1), y, Math.min(1, width * ratio), 4);
      this.bars.push({ enemyId: enemy.id, ratio, x, y, width, alpha });
    }
    ctx.globalAlpha = 1;
    for (const number of this.numbers) number.age += dt;
    this.numbers = this.numbers.filter(n => n.age < n.lifetime);
    for (const number of this.numbers) {
      const at = this.project(number.x, number.z);
      if (at.x < -32 || at.x > this.width + 32 || at.y < -50 || at.y > this.height + 60) continue;
      const q = clamp(number.age / NUMBER_LIFETIME, 0, 1);
      const heavy = number.amount >= 50;
      const fontSize = (touch ? 14 : 17) + (heavy ? 3 : 0) + (number.lethal ? 1 : 0);
      ctx.font = `700 ${fontSize}px "Cascadia Mono", Consolas, monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      const half = ctx.measureText(number.text).width / 2 + 3;
      const x = clamp(at.x + number.lane * (.35 + q * .65), half, this.width - half);
      const y = clamp(at.y - 13 - 44 * (1 - (1 - q) ** 2), fontSize / 2 + 2, this.height - fontSize / 2 - 2);
      const alpha = Math.min(1, Math.max(0, (number.lifetime - number.age) / .23));
      ctx.globalAlpha = alpha; ctx.lineWidth = 3;
      ctx.strokeStyle = '#07101bf2'; ctx.strokeText(number.text, x, y);
      ctx.fillStyle = heavy || number.lethal ? '#ffd08d' : '#fff1d0'; ctx.fillText(number.text, x, y);
      this.drawnNumbers.push({ enemyId: number.enemyId, amount: number.amount, text: number.text, x, y, alpha });
    }
    ctx.globalAlpha = 1;
  }

  dispose() { this.reset(); this.canvas.remove(); }
}
