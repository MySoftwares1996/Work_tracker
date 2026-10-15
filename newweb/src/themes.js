/**
 * The colour themes offered in Config > Appearance. The CSS for each is in styles.css (:root[data-theme="<id>"]); the swatch
 * values here only draw the small preview. The choice is kept on this device (localStorage).
 */
export const THEMES = [
  { id: 'violet', name: 'Vivid Violet', note: 'The original, follows your device', swatch: { bg: '#f5f2ff', card: '#ffffff', accent: '#6a3df5', tiles: ['#ff6a6f', '#ffb81f', '#7a4cf6', '#3d86ff'], tileInk: ['#fff', '#3b2a00', '#fff', '#fff'] } },
  { id: 'aqua', name: 'Aqua Green', note: 'Clean, calm', swatch: {"bg": "#f1f4f3", "card": "#ffffff", "accent": "#0aa56d", "tiles": ["#fde4e2", "#fdf0d2", "#d9f3e8", "#dfe9fb"], "tileInk": ["#d93a3a", "#a8650a", "#0aa56d", "#2457c5"]} },
  { id: 'ocean', name: 'Ocean Blue', note: 'Crisp, familiar', swatch: {"bg": "#eff3fa", "card": "#ffffff", "accent": "#1f6bff", "tiles": ["#fde3e6", "#fdf0d4", "#dbe7ff", "#dbe7ff"], "tileInk": ["#d63a4a", "#a86a0a", "#1f6bff", "#1f6bff"]} },
  { id: 'sunset', name: 'Sunset Orange', note: 'Warm, energetic', swatch: {"bg": "#f7f3ef", "card": "#ffffff", "accent": "#f2631b", "tiles": ["#fde2df", "#fcefcf", "#ffe5d6", "#e0e9fa"], "tileInk": ["#d33a3a", "#9b6208", "#f2631b", "#2b5fc4"]} },
  { id: 'lilac', name: 'Lilac Mist', note: 'Soft, modern', swatch: {"bg": "#f4f2fa", "card": "#ffffff", "accent": "#7b5cf5", "tiles": ["#fde3ea", "#fcefd3", "#e6dfff", "#e0e8fb"], "tileInk": ["#d23b5a", "#a1660b", "#7b5cf5", "#3a64d6"]} },
  { id: 'night', name: 'Midnight Black', note: 'Dark, true black', swatch: {"bg": "#000000", "card": "#17181b", "accent": "#34d9a0", "tiles": ["#3b1a19", "#3a2d0e", "#10382b", "#17284a"], "tileInk": ["#ff8a80", "#ffcc66", "#34d9a0", "#8fb5ff"]} },
];

const KEY = 'wd-theme';
export const themeIds = THEMES.map((t) => t.id);

export function savedTheme() {
  try { const v = localStorage.getItem(KEY); return themeIds.includes(v) ? v : 'violet'; } catch { return 'violet'; }
}

export function applyTheme(id) {
  const v = themeIds.includes(id) ? id : 'violet';
  document.documentElement.setAttribute('data-theme', v);
  try { localStorage.setItem(KEY, v); } catch { /* the choice just is not remembered */ }
  return v;
}
