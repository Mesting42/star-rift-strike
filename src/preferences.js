export const PREFERENCES_KEY = 'star-rift-flight-settings';
export const DEFAULT_PREFERENCES = Object.freeze({ effects: 'rich', shake: 1, sensitivity: 1, music: .3, sfx: .55 });
export const EFFECT_LEVELS = Object.freeze({
  simple: { label: '精简', detail: '保留弹体、技能范围和保护提示，减少光晕与装饰粒子。', density: .45, glow: .4 },
  standard: { label: '标准', detail: '完整武器与技能外观，适量能量尾迹与碎片。', density: .75, glow: .7 },
  rich: { label: '丰富', detail: '完整能量层次、飞行尾迹和技能动画，适合画面优先。', density: 1, glow: 1 },
});
const ranges = { shake: [0, 1], sensitivity: [.5, 2], music: [0, 1], sfx: [0, 1] };
export function normalizePreferences(value) {
  const result = { ...DEFAULT_PREFERENCES };
  if (!value || typeof value !== 'object') return result;
  if (Object.hasOwn(EFFECT_LEVELS, value.effects)) result.effects = value.effects;
  for (const [key, [min, max]] of Object.entries(ranges)) {
    if (typeof value[key] === 'number' && Number.isFinite(value[key])) result[key] = Math.max(min, Math.min(max, value[key]));
  }
  return result;
}
export function readPreferences(storage) {
  try { return normalizePreferences(JSON.parse((storage || globalThis.localStorage).getItem(PREFERENCES_KEY))); }
  catch { return { ...DEFAULT_PREFERENCES }; }
}
export function savePreferences(value, storage) {
  try { (storage || globalThis.localStorage).setItem(PREFERENCES_KEY, JSON.stringify(normalizePreferences(value))); } catch { /* Session changes still work with blocked storage. */ }
}
