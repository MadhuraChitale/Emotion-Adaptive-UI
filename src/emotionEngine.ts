import * as faceapi from 'face-api.js';
import { applyAdaptation } from './adaptation';
import type { EmotionLabel } from './adaptation';

export type ExpressionProbs = Record<string, number>;

const WINDOW: ExpressionProbs[] = [];
const MAXW = 15;
const THRESH = 0.40;
const DWELL_MS = 1000;
const COOLDOWN_MS = 4000;

let currentLabel: EmotionLabel = 'focused';
let cooldownUntil = 0;
let lastCandidate: { label: EmotionLabel; since: number } | null = null;
let stopLoop = false;

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

// Brow furrow: inner brows (21,22) move inward relative to face width (0,16).
// We normalize brow distance by face width, then map a relaxed distance to 0
// and a "strong furrow" distance to 1.
function browFurrow(landmarks: any) {
  const p = landmarks?.positions;
  if (!p) return 0;

  const l = p[21];
  const r = p[22];
  const jawL = p[0];
  const jawR = p[16];

  const faceWidth = dist(jawL, jawR) + 1e-6;
  const between = dist(l, r);

  const norm = between / faceWidth;

  // Heuristic thresholds – tune if needed:
  //  - RELAXED: typical neutral brow spacing
  //  - STRONG: brows drawn close together
  const RELAXED = 0.32;
  const STRONG = 0.20;

  const t = (RELAXED - norm) / (RELAXED - STRONG);
  const clamped = Math.max(0, Math.min(1, t));

  return clamped;
}

// Lip corner drop: corners (48,54) lower than mouth center (between 51 and 57).
function mouthCornerDrop(landmarks: any) {
  const p = landmarks?.positions;
  if (!p) return 0;
  const left = p[48];
  const right = p[54];
  const top = p[51];
  const bottom = p[57];
  const centerY = (top.y + bottom.y) / 2;
  const drop = ((left.y - centerY) + (right.y - centerY)) / 2; // >0 => corners below center
  const width = dist(left, right) + 1e-6; // scale-invariant
  return Math.max(0, drop) / width; // ~0.00 neutral/smile … 0.05–0.15+ strong corner drop
}

// ---------------------------------------------------------------------
// Camera + model loading
// ---------------------------------------------------------------------

export async function loadModels(base = '/models') {
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(base),
    faceapi.nets.faceExpressionNet.loadFromUri(base),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri(base),
  ]);
}

export async function startCamera(videoEl: HTMLVideoElement) {
  const old = videoEl.srcObject as MediaStream | null;
  old?.getTracks().forEach((t) => t.stop());
  videoEl.srcObject = null;

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user' },
    audio: false,
  });

  videoEl.srcObject = stream;

  await new Promise<void>((resolve) => {
    const onMeta = () => {
      videoEl.removeEventListener('loadedmetadata', onMeta);
      resolve();
    };
    if ((videoEl as any).readyState >= 1) resolve();
    else videoEl.addEventListener('loadedmetadata', onMeta, { once: true });
  });

  try {
    await videoEl.play();
  } catch (e: any) {
    if (e && e.name === 'AbortError') {
      if (videoEl.paused) await videoEl.play().catch(() => {});
    } else {
      throw e;
    }
  }

  return stream;
}

function pushProbs(expr: ExpressionProbs) {
  WINDOW.push(expr);
  if (WINDOW.length > MAXW) WINDOW.shift();
}

export function resetWindow() {
  WINDOW.length = 0;
}

export function stop() {
  stopLoop = true;
}

// ---------------------------------------------------------------------
// 7 → 4 mapping with heuristics
// ---------------------------------------------------------------------

function mapToFourWithHeur(
  avg: ExpressionProbs,
  heur: { furrow: number; cornerDrop: number }
) {
  let neutral = avg.neutral ?? 0;
  let happy = avg.happy ?? 0;
  const sad = avg.sad ?? 0;
  const angry = avg.angry ?? 0;
  const fearful = avg.fearful ?? 0;
  const disgusted = avg.disgusted ?? 0;
  const surprised = avg.surprised ?? 0;

  // Slightly damp neutral/happy if they dominate so negatives can win
  if (neutral + happy > 0.7) {
    neutral = neutral * 0.8;
    happy = happy * 0.85;
  }

  // Normalized/boosted heuristics
  const furrowN = Math.min(1, Math.max(0, heur.furrow)); // already 0..1
  const cornerDropN = Math.min(
    1,
    Math.max(0, (heur.cornerDrop - 0.03) / 0.10)
  );

  // Frustrated = corners down (geometry) + irritation signals
  const frustrated =
    0.90 * cornerDropN +
    0.35 * angry +
    0.30 * disgusted +
    0.20 * sad -
    0.10 * happy;

  // Confused = brow furrow (geometry) + a bit of surprised/fearful.
  // 🔼 boosted to 1.8 * furrowN so a strong furrow clearly dominates.
  const confused =
    1.8 * furrowN +
    0.15 * (fearful + surprised) +
    0.05 * neutral;

  // Focused: mostly neutral, but
  // 🔽 reduce it when furrow is high so it can't beat confused in that case.
  const focused =
    0.90 * neutral -
    0.10 * (surprised + fearful + angry + disgusted) -
    0.40 * furrowN;

  const happyScore =
    1.0 * happy -
    0.10 * (angry + sad + disgusted);

  const raw = {
    frustrated,
    confused,
    happy: happyScore,
    focused,
  };

  const min0 = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Math.max(0, v as number)])
  );
  const sum =
    Object.values(min0).reduce((a, b) => a + (b as number), 0) || 1;
  const scores = Object.fromEntries(
    Object.entries(min0).map(([k, v]) => [k, (v as number) / sum])
  );

  const entries = Object.entries(scores).sort(
    (a, b) => (b[1] as number) - (a[1] as number)
  ) as [EmotionLabel, number][];

  return { label: entries[0][0], conf: entries[0][1], scores };
}

function smoothedDecision(heur: {
  furrow: number;
  cornerDrop: number;
}): { label: EmotionLabel; conf: number; scores: Record<string, number> } {
  if (WINDOW.length < Math.floor(MAXW * 0.6)) {
    return { label: currentLabel, conf: 1, scores: {} }; // warmup
  }
  const avg: ExpressionProbs = {};
  for (const row of WINDOW) {
    for (const [k, v] of Object.entries(row)) {
      avg[k] = (avg[k] ?? 0) + (v as number) / WINDOW.length;
    }
  }
  return mapToFourWithHeur(avg, heur);
}

// ---------------------------------------------------------------------
// HUD type
// ---------------------------------------------------------------------

export type HUD = {
  label: EmotionLabel;
  conf: number;
  scores: Record<string, number>;
  cooling: number;
};

// ---------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------

export async function loop(
  videoEl: HTMLVideoElement,
  onHud?: (hud: HUD) => void
) {
  stopLoop = false;

  const tick = async () => {
    if (stopLoop) return;

    const det = await faceapi
      .detectSingleFace(
        videoEl,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 })
      )
      .withFaceLandmarks(true)
      .withFaceExpressions();

    if (det?.expressions) pushProbs(det.expressions as any);

    let furrow = 0;
    let cornerDrop = 0;
    if (det?.landmarks) {
      furrow = browFurrow(det.landmarks);
      cornerDrop = mouthCornerDrop(det.landmarks);

      // Uncomment to debug:
      // console.log('furrow:', furrow.toFixed(3), 'cornerDrop:', cornerDrop.toFixed(3));
    }

    const { label, conf, scores } = smoothedDecision({ furrow, cornerDrop });

    const now = Date.now();
    const cooling = Math.max(0, cooldownUntil - now);

    // dwell + cooldown
    if (now > cooldownUntil && conf >= THRESH && label !== currentLabel) {
      if (!lastCandidate || lastCandidate.label !== label) {
        lastCandidate = { label, since: now };
      } else if (now - lastCandidate.since >= DWELL_MS) {
        currentLabel = label;
        applyAdaptation(label);
        cooldownUntil = now + COOLDOWN_MS;
        lastCandidate = null;
      }
    } else if (label === currentLabel) {
      lastCandidate = null;
    }

    onHud?.({ label: currentLabel, conf, scores, cooling });
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}
