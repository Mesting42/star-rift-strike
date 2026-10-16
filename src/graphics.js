export const GRAPHICS_PRESETS = Object.freeze({
  high: { label: '高清', description: '优先呈现机体细节与清晰边缘，耗电较高。', maxRatio: 4, touchPixels: 6000000, desktopPixels: 8000000, samples: 4 },
  balanced: { label: '均衡', description: '兼顾画面细节、流畅度与耗电。', maxRatio: 2, touchPixels: 3200000, desktopPixels: 4800000, samples: 2 },
  smooth: { label: '流畅', description: '降低画面分辨率，适合发热或运行吃力时使用。', maxRatio: 1.6, touchRatio: 1.25, touchPixels: 1600000, desktopPixels: 3200000, samples: 0 },
});

const storageKey = 'star-rift-graphics-quality';
export const isGraphicsQuality = value => Object.hasOwn(GRAPHICS_PRESETS, value);

export function readGraphicsQuality() {
  try {
    const saved = localStorage.getItem(storageKey);
    if (isGraphicsQuality(saved)) return saved;
  } catch { /* Private browsers may disable storage; rendering still works. */ }
  return 'high';
}

export function saveGraphicsQuality(value) {
  try { localStorage.setItem(storageKey, value); }
  catch { /* Keep the selected quality for this session when storage is blocked. */ }
}
