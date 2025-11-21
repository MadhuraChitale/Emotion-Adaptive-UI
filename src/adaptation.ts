// Adaptation.ts — global UI adaptation bus
export type EmotionLabel = 'focused' | 'happy' | 'confused' | 'frustrated';
export type UIMode = EmotionLabel;

type Listener = (mode: UIMode) => void;

let mode: UIMode = 'focused';
const listeners = new Set<Listener>();

export function subscribe(listener: Listener) {
  listeners.add(listener);
  // immediately push current
  listener(mode);
  // cleanup must return void
  return () => { listeners.delete(listener); };
}

function setMode(next: UIMode) {
  if (mode === next) return;
  mode = next;
  for (const l of listeners) l(mode);
}

export function applyAdaptation(label: EmotionLabel) {
  // map 1:1 for now
  setMode(label);
}

// Manual preview from UI
export function forceMode(next: UIMode) {
  setMode(next);
}

export function getMode() { return mode; }
