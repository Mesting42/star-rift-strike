import './style.css';
import { Game } from './game.js';
import { GameRenderer } from './renderer.js';
import { AudioSystem } from './audio.js';
import { UI } from './ui.js';
import { TouchControls } from './touch-controls.js';
import { readPreferences, savePreferences, normalizePreferences, DEFAULT_PREFERENCES } from './preferences.js';

const canvas = document.getElementById('world');
const audio = new AudioSystem();
const keys = new Set();
let renderer;
let touch;
let resizeFrame;
let preferences = readPreferences();
function resizeLayout() {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => renderer?.resize());
}
function syncViewport() {
  const height = window.visualViewport?.scale === 1 ? window.visualViewport.height : innerHeight;
  document.documentElement.style.setProperty('--viewport-height', `${Math.round(height)}px`);
  touch?.reset();
  resizeLayout();
}
async function unlockAudio() {
  await audio.unlock();
  if (['pause','settings','help','inventory'].includes(game.mode)) audio.suspend();
}
const ui = new UI(document.getElementById('ui'), (action, value) => {
  unlockAudio();
  if (action === 'graphicsQuality') {
    if (renderer?.setQuality(value)) { ui.graphicsQuality = renderer.quality; game.uiVersion++; }
  } else if (['effects', 'shake', 'sensitivity', 'volumeMusic', 'volumeSfx', 'resetSettings'].includes(action)) {
    if (action === 'resetSettings') {
      preferences = { ...DEFAULT_PREFERENCES };
      renderer.setQuality('high'); ui.graphicsQuality = renderer.quality;
    } else {
      const key = action === 'volumeMusic' ? 'music' : action === 'volumeSfx' ? 'sfx' : action;
      preferences = normalizePreferences({ ...preferences, [key]: value });
    }
    savePreferences(preferences);
    applyPreferences();
    if (action === 'effects' || action === 'resetSettings') game.uiVersion++;
  } else game.handleAction(action, value);
  ui.update(game);
});
const game = new Game((event, value) => {
  if (event === 'toast') ui.toast(value);
  if (event === 'sound') audio.play(value);
  if (event === 'theme') { renderer?.setTheme(value.sector); audio.setTheme(value.sector, value.boss); }
  if (event === 'volume') audio.setVolume(value.music, value.sfx);
  if (event === 'shake' && renderer) renderer.shake = Math.max(renderer.shake || 0, value);
  if (event === 'damage') ui.updateHUD(game);
  if (event === 'enemyDamage') renderer?.feedback.hit(value);
  if (event === 'combatClear') renderer?.feedback.reset();
  if (event === 'combatReady') { keys.clear(); touch?.reset(); }
  if (event === 'screen') {
    keys.clear();
    touch?.setMode(value);
    if (['pause', 'settings', 'help', 'inventory'].includes(value)) audio.suspend();
    else if (audio.ctx) audio.resume();
  }
});

function applyPreferences() {
  ui.preferences = { ...preferences };
  game.volume = { music: preferences.music, sfx: preferences.sfx };
  audio.setVolume(preferences.music, preferences.sfx);
  renderer?.setPreferences(preferences);
  if (touch) touch.sensitivity = preferences.sensitivity;
}

try {
  renderer = new GameRenderer(canvas);
  ui.graphicsQuality = renderer.quality;
  applyPreferences();
} catch (error) {
  document.getElementById('ui').innerHTML = '<div class="fatal"><h1>无法初始化三维画面</h1><p>请在 Chrome 或 Edge 中开启硬件加速，刷新后重试。</p><pre></pre></div>';
  document.querySelector('.fatal pre').textContent = error.message;
  throw error;
}

const getInput = (consumeDrag = true) => ({
  left: keys.has('KeyA') || keys.has('ArrowLeft'),
  right: keys.has('KeyD') || keys.has('ArrowRight'),
  up: keys.has('KeyW') || keys.has('ArrowUp'),
  down: keys.has('KeyS') || keys.has('ArrowDown'),
  moveX: touch?.axes.x || 0,
  moveZ: touch?.axes.z || 0,
  dragTarget: touch?.getTarget(consumeDrag) || null,
  fire: keys.has('Space') || keys.has('Mouse0') || touch?.fire,
  slow: keys.has('ControlLeft') || keys.has('ControlRight') || touch?.precision,
});

touch = new TouchControls(document.getElementById('touch-controls'), action => {
  if (action === 'dash') game.dash(getInput(false));
  else if (action === 'nextWeapon') game.switchWeapon((game.weaponIndex + 1) % game.weapons.length);
  else game.handleAction(action);
  ui.update(game);
}, resizeLayout, unlockAudio, { surface: canvas,
  projectDelta: (x, y) => renderer.screenDeltaToWorld(x, y),
  getPlayer: () => game.player,
});
touch.sensitivity = preferences.sensitivity;
touch.update(game);
syncViewport();

window.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return;
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code) || (game.mode === 'combat' && e.ctrlKey)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  unlockAudio();
  if (e.code === 'Escape') {
    if (game.mode === 'pause') game.resume();
    else if (['help','settings','inventory'].includes(game.mode)) game.back();
    else game.pause();
  }
  if (game.mode === 'combat') {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') game.dash(getInput(false));
    if (e.code === 'KeyE') game.useSkill();
    if (e.code === 'KeyQ') game.switchWeapon((game.weaponIndex + 1) % game.weapons.length);
    if (/^Digit[1-8]$/.test(e.code)) game.switchWeapon(Number(e.code.slice(-1)) - 1);
    if (e.code === 'KeyF') { game.autoFire = !game.autoFire; game.uiVersion++; }
  }
  if (e.code === 'Tab' && ['combat','map'].includes(game.mode)) game.openMenu('inventory');
});
window.addEventListener('keyup', e => keys.delete(e.code));
canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button === 0) keys.add('Mouse0'); unlockAudio(); });
window.addEventListener('pointerup', () => keys.delete('Mouse0'));
window.addEventListener('pointercancel', () => keys.delete('Mouse0'));
window.addEventListener('blur', () => { keys.clear(); touch.reset(); game.pause(); ui.update(game); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); touch.reset(); game.pause(); ui.update(game); } });
window.addEventListener('resize', syncViewport);
window.visualViewport?.addEventListener('resize', syncViewport);

let last = performance.now(), accumulator = 0, frames = 0, frameMs = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, .05); last = now;
  accumulator += dt;
  while (accumulator >= 1 / 90) { game.update(1 / 90, getInput()); accumulator -= 1 / 90; }
  touch.update(game);
  renderer.update(game, ['pause','inventory','settings','help'].includes(game.mode) ? 0 : dt);
  audio.update(dt);
  ui.update(game);
  frames++; frameMs += dt * 1000;
  requestAnimationFrame(frame);
}
ui.update(game);
requestAnimationFrame(frame);

// Read-only diagnostics plus normal game controls for reproducible browser QA.
// No invulnerability, skip-level or victory shortcut is exposed.
window.__STAR_RIFT__ = {
  game, renderer,
  snapshot: () => ({ mode: game.mode, sector: game.sector, seed: game.seed, hp: game.player.hp,
    shield: game.player.shield, money: game.money, weapons: [...game.weapons], items: [...game.items],
    kills: game.kills, elapsed: game.elapsed, enemies: game.enemies.length, bullets: game.bullets.length,
    renderCalls: renderer.renderer.info.render.calls, geometries: renderer.renderer.info.memory.geometries,
    averageFrameMs: frames ? frameMs / frames : 0, bossPhase: game.boss?.phase || 0,
    graphicsQuality: renderer.quality, renderPixelRatio: renderer.renderer.getPixelRatio(),
    renderWidth: canvas.width, renderHeight: canvas.height, antialiasSamples: renderer.composer.renderTarget1.samples,
    preferences: { ...preferences }, activeEffects: renderer.effects.length,
    bossWarning: game.bossWarning ? { ...game.bossWarning } : null }),
};
