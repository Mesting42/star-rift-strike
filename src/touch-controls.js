import { WEAPONS, SKILLS } from './content.js';
import { equipmentArt } from './equipment-art.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Keep the controls outside the menu tree: switching weapons must not destroy
// an active movement pointer. Every finger retains its own capture and role.
export class TouchControls {
  constructor(root, onAction, onLayout, unlockAudio, { surface, projectDelta, getPlayer }) {
    this.root = root;
    this.onAction = onAction;
    this.onLayout = onLayout;
    this.unlockAudio = unlockAudio;
    this.axes = { x: 0, z: 0 };
    this.fire = false;
    this.precision = false;
    this.sensitivity = 1;
    this.mode = '';
    this.blocked = false;
    this.surface = surface;
    this.projectDelta = projectDelta;
    this.getPlayer = getPlayer;
    this.dragPointer = null;
    this.dragTarget = null;
    this.releasedTarget = null;
    this.lastPoint = null;
    this.wasDashing = false;
    this.firePointers = new Set();
    this.coarsePointer = matchMedia('(pointer: coarse)');
    this.enabled = this.coarsePointer.matches;
    document.documentElement.dataset.input = this.enabled ? 'touch' : 'keyboard';
    this.root.innerHTML = `<div class="touch-dock-content"><div class="touch-toolbar">
      <button class="touch-weapon" data-touch-action="nextWeapon" aria-label="切换主武器"><span>切换武器</span><strong id="touch-weapon-name"></strong><small id="touch-weapon-number"></small></button>
      <button class="touch-loadout" data-touch-action="inventory" aria-label="查看装备">装配<span id="touch-item-count">0 件</span></button>
      <button class="touch-auto" data-touch-action="auto" aria-pressed="true">自动<span id="touch-auto-state">开启</span></button>
    </div><div class="touch-actions">
        <button class="touch-action touch-dash" data-touch-action="dash" aria-label="闪避机动"><svg viewBox="0 0 40 24" aria-hidden="true"><path d="M3 3 17 3 28 12 17 21 3 21 14 12ZM22 3 29 3 40 12 29 21 22 21 33 12Z" fill="currentColor"/></svg><strong>闪避</strong><small id="touch-dash-cd">就绪</small><i id="touch-dash-progress"></i></button>
        <button class="touch-action touch-skill" data-touch-action="useSkill" aria-label="使用主动技能"><span id="touch-skill-art"></span><strong id="touch-skill-name">技能</strong><small id="touch-skill-cd">就绪</small><i id="touch-skill-progress"></i></button>
        <button class="touch-action touch-fire" data-touch-action="fire" aria-label="按住持续开火"><svg viewBox="0 0 34 25" aria-hidden="true"><path d="M8 0 12 7 12 24 4 24 4 7ZM25 0 29 7 29 24 21 24 21 7Z" fill="currentColor"/></svg><strong>开火</strong><small id="touch-fire-label">自动中</small></button>
        <button class="touch-action touch-precision" data-touch-action="precision" aria-label="切换精细移动" aria-pressed="false"><svg viewBox="0 0 34 25" aria-hidden="true"><path d="M12 2 22 2 22 8 28 8 28 18 22 18 22 24 12 24 12 18 6 18 6 8 12 8Z" fill="currentColor"/><path d="M13 9H21V17H13Z" fill="#172a34"/></svg><strong>精细</strong><small>低敏移动</small></button>
      </div>
    </div>`;
    this.fireButton = root.querySelector('.touch-fire');
    this.precisionButton = root.querySelector('.touch-precision');
    this.autoButton = root.querySelector('.touch-auto');

    this.surface.addEventListener('pointerdown', event => {
      if (!this.enabled || this.blocked || this.mode !== 'combat' || this.dragPointer !== null || !['touch', 'pen'].includes(event.pointerType)) return;
      event.preventDefault();
      this.unlockAudio();
      const player = this.getPlayer();
      this.dragPointer = event.pointerId;
      this.releasedTarget = null;
      this.dragTarget = { x: player.x, z: player.z };
      this.lastPoint = { x: event.clientX, y: event.clientY };
      this.axes.x = this.axes.z = 0;
      this.surface.setPointerCapture(event.pointerId);
      this.surface.classList.add('dragging');
    });
    this.surface.addEventListener('pointermove', event => {
      if (event.pointerId !== this.dragPointer) return;
      event.preventDefault();
      // The final coalesced sample is the freshest browser-provided position;
      // applying its delta once keeps sensitivity independent of event rate.
      const samples=event.getCoalescedEvents?.();
      this.moveDrag(samples?.length?samples[samples.length-1]:event);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.surface.addEventListener(type, event => {
        if (event.pointerId !== this.dragPointer) return;
        if (type === 'pointerup' && this.getPlayer().roll <= 0 && !this.wasDashing) {
          this.moveDrag(event);
          // A move and its release may both arrive between simulation ticks.
          // Commit that final displacement once, then stop; never chase it.
          this.releasedTarget = { ...this.dragTarget };
        }
        this.releaseDrag();
      });
    }
    this.root.addEventListener('pointerdown', event => {
      const button = event.target.closest('[data-touch-action]');
      if (!button || this.blocked || this.mode !== 'combat') return;
      event.preventDefault();
      this.unlockAudio();
      if (button.dataset.touchAction === 'fire') {
        this.firePointers.add(event.pointerId);
        button.setPointerCapture(event.pointerId);
        this.fire = true;
        button.classList.add('held');
      } else this.action(button.dataset.touchAction);
    });
    const stopFire = event => {
      this.firePointers.delete(event.pointerId);
      this.fire = this.firePointers.size > 0;
      this.fireButton.classList.toggle('held', this.fire);
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.root.addEventListener(type, stopFire);
    // Keyboard activation of native buttons uses a click without a pointer.
    this.root.addEventListener('click', event => {
      if (event.detail !== 0) return;
      const button = event.target.closest('[data-touch-action]');
      if (button && button.dataset.touchAction !== 'fire') this.action(button.dataset.touchAction);
    });
    document.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch' || event.pointerType === 'pen') this.setEnabled(true);
    }, { capture: true, passive: true });
    this.coarsePointer.addEventListener('change', event => this.setEnabled(event.matches));
  }

  setEnabled(enabled) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.reset();
    document.documentElement.dataset.input = enabled ? 'touch' : 'keyboard';
    this.root.hidden = !enabled || this.mode !== 'combat';
    this.onLayout();
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.reset();
    document.documentElement.dataset.gameMode = mode;
    this.root.hidden = !this.enabled || mode !== 'combat';
    this.onLayout();
  }

  action(action) {
    if (this.blocked || this.mode !== 'combat') return;
    if (action === 'precision') {
      this.precision = !this.precision;
      this.precisionButton.setAttribute('aria-pressed', String(this.precision));
    } else this.onAction(action);
  }

  moveDrag(event) {
    const delta = this.projectDelta(event.clientX - this.lastPoint.x, event.clientY - this.lastPoint.y);
    this.lastPoint = { x: event.clientX, y: event.clientY };
    const distance = Math.hypot(delta.x, delta.z);
    if (!distance) return;
    const sensitivity = this.sensitivity * (this.precision ? .45 : 1);
    this.dragTarget.x = clamp(this.dragTarget.x + delta.x * sensitivity, -10.6, 10.6);
    this.dragTarget.z = clamp(this.dragTarget.z + delta.z * sensitivity, -13.5, 14.5);
    // Retain the last gesture direction for a second finger's dash, even if
    // the ship has already caught up and the movement finger is stationary.
    this.axes.x = delta.x / distance; this.axes.z = delta.z / distance;
  }

  getTarget(consume = true) {
    if (this.dragPointer === null) {
      const target = this.releasedTarget;
      if (consume) this.releasedTarget = null;
      return target;
    }
    const player = this.getPlayer();
    if (player.roll > 0) {
      this.wasDashing = true;
      return null;
    }
    // A dash must not pull the ship back toward its pre-dash drag target.
    if (this.wasDashing) {
      this.dragTarget.x = player.x; this.dragTarget.z = player.z;
      this.wasDashing = false;
    }
    return this.dragTarget;
  }

  releaseDrag() {
    const pointer = this.dragPointer;
    this.dragPointer = null; this.dragTarget = null; this.lastPoint = null;
    this.wasDashing = false;
    this.axes.x = this.axes.z = 0;
    this.surface.classList.remove('dragging');
    if (pointer !== null && this.surface.hasPointerCapture(pointer)) this.surface.releasePointerCapture(pointer);
  }

  reset() {
    this.releasedTarget = null;
    this.releaseDrag();
    const pointers = [...this.firePointers];
    this.firePointers.clear(); this.fire = false; this.precision = false;
    this.fireButton.classList.remove('held');
    this.precisionButton.setAttribute('aria-pressed', 'false');
    for (const pointer of pointers) if (this.fireButton.hasPointerCapture(pointer)) this.fireButton.releasePointerCapture(pointer);
  }

  update(game) {
    this.setMode(game.mode);
    const blocked = Boolean(game.bossWarning);
    if (this.blocked !== blocked) {
      this.blocked = blocked; this.reset();
      this.root.classList.toggle('preparing', blocked);
      this.root.setAttribute('aria-busy', String(blocked));
    }
    if (!this.enabled || game.mode !== 'combat' || performance.now() - (this.lastUpdate || 0) < 85) return;
    this.lastUpdate = performance.now();
    const set = (id, value) => {
      const el = this.root.querySelector(`#${id}`);
      if (el.textContent !== String(value)) el.textContent = value;
    };
    const weapon = WEAPONS.find(weapon => weapon.id === game.weapons[game.weaponIndex]);
    set('touch-weapon-name', weapon?.name || '主武器');
    set('touch-weapon-number', `${game.weaponIndex + 1}/${game.weapons.length}`);
    set('touch-item-count', `${game.items.length} 件`);
    set('touch-auto-state', game.autoFire ? '开启' : '关闭');
    set('touch-fire-label', game.autoFire ? '自动中' : '按住发射');
    this.autoButton.setAttribute('aria-pressed', String(game.autoFire));
    const skill = SKILLS.find(skill => skill.id === game.skill);
    if (this.skillId !== game.skill) {
      this.skillId = game.skill;
      this.root.querySelector('#touch-skill-art').innerHTML = equipmentArt('skill', game.skill);
      this.root.querySelector('.touch-skill').setAttribute('aria-label', `使用${skill?.name || '主动技能'}`);
    }
    set('touch-skill-name', skill?.name || '技能');
    set('touch-skill-cd', game.skillCooldown > 0 ? `${Math.ceil(game.skillCooldown)}s` : '就绪');
    set('touch-dash-cd', game.dashCooldown > 0 ? `${game.dashCooldown.toFixed(1)}s` : '就绪');
    const dashMax = game.has('wing') ? 2.4 : 3.5;
    this.root.querySelector('#touch-dash-progress').style.width = `${clamp(1 - game.dashCooldown / dashMax, 0, 1) * 100}%`;
    this.root.querySelector('#touch-skill-progress').style.width = `${clamp(1 - game.skillCooldown / (skill?.cooldown || 14), 0, 1) * 100}%`;
    this.root.querySelector('.touch-dash').classList.toggle('cooling', game.dashCooldown > 0);
    this.root.querySelector('.touch-skill').classList.toggle('cooling', game.skillCooldown > 0);
  }
}
