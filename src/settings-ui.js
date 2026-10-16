import { GRAPHICS_PRESETS } from './graphics.js';
import { DEFAULT_PREFERENCES, EFFECT_LEVELS } from './preferences.js';

export function renderSettings(ui, game, button) {
  const p = ui.preferences || DEFAULT_PREFERENCES;
  const quality = GRAPHICS_PRESETS[ui.graphicsQuality] || GRAPHICS_PRESETS.high;
  const options = Object.entries(GRAPHICS_PRESETS).map(([id, preset]) => `<button data-action="graphicsQuality" data-value="${id}" aria-pressed="${ui.graphicsQuality === id}">${preset.label}</button>`).join('');
  const levels = Object.entries(EFFECT_LEVELS).map(([id, level]) => `<button data-action="effects" data-value="${id}" aria-pressed="${id === p.effects}">${level.label}</button>`).join('');
  const slider = (title, note, action, value, min=0, max=1, step=.01) => `<div class="setting-row"><div><h2>${title}</h2><p>${note}</p></div><input aria-label="${title}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-action="${action}"><output>${action === 'sensitivity' ? value.toFixed(1)+'×' : Math.round(value*100)+'%'}</output></div>`;
  return ui.panel(game, 'FLIGHT CONFIGURATION / 飞行设置', '游戏设置', `<div class="settings-content"><div class="setting-section-title">01 / 画面与反馈</div><div class="setting-row graphics-setting"><h2>画面清晰度</h2><div class="quality-options" role="group" aria-label="画面清晰度">${options}</div><p>${quality.description}</p></div><div class="setting-row graphics-setting"><h2>特效强度</h2><div class="quality-options" role="group" aria-label="特效强度">${levels}</div><p>${EFFECT_LEVELS[p.effects].detail}</p></div>${slider('镜头震动','击毁与受击时的反馈；设为 0% 关闭震动。','shake',p.shake)}<div class="setting-section-title">02 / 触控操作</div>${slider('触控灵敏度','控制拖动位移倍率，按下不瞬移；精细移动仍可进一步降低灵敏度。','sensitivity',p.sensitivity,.5,2,.1)}<div class="setting-section-title">03 / 声音</div>${slider('背景音乐','航行氛围与 Boss 战配乐','volumeMusic',p.music)}${slider('音效','武器、引擎与操作反馈','volumeSfx',p.sfx)}<div class="settings-bottom"><p class="settings-note">修改立即生效，并保存到当前浏览器。声音在首次交互后启用。</p>${button('恢复默认设置', 'resetSettings', '', 'line-button')}</div></div>`, `<span>按设备与操作习惯调整。</span>${button('返回 ↗', 'back', '', 'primary')}`, 'small-panel-screen');
}
