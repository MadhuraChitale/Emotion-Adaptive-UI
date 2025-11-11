// // Central mapping: 4 states → concrete UI decisions.
// export type EmotionLabel = 'frustrated' | 'confused' | 'focused' | 'happy';

// export const ADAPTATION = {
//   frustrated: {
//     theme: 'muted',
//     density: 'relaxed',
//     notifications: 'off',
//     help: { inlineTips: false, hintButton: true, guidedOverlay: false },
//     chrome: 'minimal',
//     highlightNext: false,
//     microInteractions: false,
//   },
//   confused: {
//     theme: 'neutral',
//     density: 'normal',
//     notifications: 'on',
//     help: { inlineTips: true, hintButton: true, guidedOverlay: true },
//     chrome: 'normal',
//     highlightNext: true,
//     microInteractions: false,
//   },
//   focused: {
//     theme: 'neutral',
//     density: 'compact',
//     notifications: 'off',
//     help: { inlineTips: false, hintButton: false, guidedOverlay: false },
//     chrome: 'minimal',
//     highlightNext: false,
//     microInteractions: false,
//   },
//   happy: {
//     theme: 'vibrant',
//     density: 'normal',
//     notifications: 'on',
//     help: { inlineTips: false, hintButton: false, guidedOverlay: false },
//     chrome: 'normal',
//     highlightNext: false,
//     microInteractions: true,
//   }
// } as const;

// // ---- CSS token setters ----
// export function setTheme(t: string) {
//   document.documentElement.setAttribute('data-theme', t);
// }
// export function setDensity(d: string) {
//   document.documentElement.setAttribute('data-density', d);
// }
// export function setNotifications(mode: 'on'|'off') {
//   document.documentElement.setAttribute('data-notifs', mode);
// }
// export function setChrome(mode: 'minimal'|'normal') {
//   document.documentElement.setAttribute('data-chrome', mode);
// }
// export function setHelp(cfg: { inlineTips: boolean; hintButton: boolean; guidedOverlay: boolean; }) {
//   document.documentElement.setAttribute('data-inline-tips', String(cfg.inlineTips));
//   document.documentElement.setAttribute('data-hint-btn', String(cfg.hintButton));
//   document.documentElement.setAttribute('data-guided', String(cfg.guidedOverlay));
// }
// export function setHighlightNext(v: boolean) {
//   document.documentElement.setAttribute('data-highlight-next', String(v));
// }
// export function setMicroInteractions(v: boolean) {
//   document.documentElement.setAttribute('data-micro', String(v));
// }

// export function applyAdaptation(label: EmotionLabel) {
//   const a = ADAPTATION[label];
//   setTheme(a.theme);
//   setDensity(a.density);
//   setNotifications(a.notifications as any);
//   setHelp(a.help);
//   setChrome(a.chrome as any);
//   setHighlightNext(a.highlightNext);
//   setMicroInteractions(a.microInteractions);
// }
export type EmotionLabel = 'focused' | 'happy' | 'confused' | 'frustrated';

export function applyAdaptation(label: EmotionLabel) {
  // No-op for now; useful later when we wire real UI changes.
  // Keep a console log so you can see label changes clearly.
  console.log('[applyAdaptation]', label);
}
