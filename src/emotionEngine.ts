// emotionEngine.ts — detection + calibrated geometry + robust mapping
import * as faceapi from 'face-api.js';
import { applyAdaptation } from './adaptation';
import type { EmotionLabel } from './adaptation';

export type ExpressionProbs = Record<string, number>;

const WINDOW: ExpressionProbs[] = [];
const MAXW = 15;
const THRESH = 0.35;
const DWELL_MS = 1200;
const COOLDOWN_MS = 4500;

let currentLabel: EmotionLabel = 'focused';
let cooldownUntil = 0;
let lastCandidate: { label: EmotionLabel; since: number } | null = null;
let stopLoop = false;

// --- Calibration state (learn your neutral face for ~1–2s) ---
let calCount = 0;
let baseBetweenN = 0; // neutral inner-brow distance / IPD
let baseEAR = 0;      // neutral eye aspect ratio
const CAL_FRAMES = 90; // ~1.5s at 60fps

export async function loadModels(base = '/models') {
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(base),
    faceapi.nets.faceExpressionNet.loadFromUri(base),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri(base),
  ]);
}

export async function startCamera(videoEl: HTMLVideoElement) {
  // Stop old stream if any
  const old = videoEl.srcObject as MediaStream | null;
  old?.getTracks().forEach(t => t.stop());
  videoEl.srcObject = null;

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user' },
    audio: false
  });

  videoEl.srcObject = stream;
  await new Promise<void>((resolve) => {
    const onMeta = () => { videoEl.removeEventListener('loadedmetadata', onMeta); resolve(); };
    if ((videoEl as any).readyState >= 1) resolve();
    else videoEl.addEventListener('loadedmetadata', onMeta, { once: true });
  });

  try {
    await videoEl.play();
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      if (videoEl.paused) await videoEl.play().catch(() => {});
    } else throw e;
  }

  return stream;
}

// ---------- Geometry helpers ----------
function dist(a: {x:number;y:number}, b:{x:number;y:number}) {
  const dx = a.x - b.x, dy = a.y - b.y; return Math.hypot(dx, dy);
}

function updateCalibration(landmarks: any) {
  if (!landmarks || calCount >= CAL_FRAMES) return;
  const p = landmarks.positions;
  const lB = p[21], rB = p[22], L_in = p[39], R_in = p[42];
  const ipd = dist(L_in, R_in) + 1e-6;
  const betweenN_now = dist(lB, rB) / ipd;

  const L = [36,37,38,39,40,41].map(i => p[i]);
  const R = [42,43,44,45,46,47].map(i => p[i]);
  const ear = (eye:any[]) => {
    const v1 = dist(eye[1], eye[5]);
    const v2 = dist(eye[2], eye[4]);
    const h  = dist(eye[0], eye[3]);
    return (v1 + v2) / (2*h + 1e-6);
  };
  const ear_now = (ear(L) + ear(R)) / 2;

  calCount++;
  const k = 1 / calCount;
  baseBetweenN = baseBetweenN * (1 - k) + betweenN_now * k;
  baseEAR      = baseEAR * (1 - k) + ear_now * k;
}

// Calibrated brow furrow: how much current inner-brow distance shrinks vs baseline
function browFurrow(landmarks: any) {
  const p = landmarks?.positions; if (!p) return 0;
  const lB = p[21], rB = p[22], L_in = p[39], R_in = p[42], nose = p[27];
  const ipd = dist(L_in, R_in) + 1e-6;

  const betweenN_now = dist(lB, rB) / ipd;           // normalized inner-brow gap
  const browMidY = (lB.y + rB.y) / 2;
  const dropN = (browMidY - nose.y) / ipd;           // vertical drop vs nose

  const baseB = baseBetweenN || 0.48;                // fallback pivot if not calibrated yet
  const shrink = Math.max(0, baseB - betweenN_now);

  // Sensitivity: 0.09 IPD shrink ≈ strong furrow (tune as needed)
  const closeScore = Math.min(1, shrink / 0.09);
  const dropScore  = Math.min(1, Math.max(0, (dropN - 0.02) / 0.14));

  const furrow = Math.max(0, Math.min(1, 0.75*closeScore + 0.25*dropScore));
  return furrow;
}

// Lip corner drop: corners (48,54) lower than mouth center (51↔57 mid-Y)
function mouthCornerDrop(landmarks: any) {
  const p = landmarks?.positions; if (!p) return 0;
  const left = p[48], right = p[54], top = p[51], bottom = p[57];
  const centerY = (top.y + bottom.y) / 2;
  const drop = ((left.y - centerY) + (right.y - centerY)) / 2;
  const width = dist(left, right) + 1e-6;
  return Math.max(0, drop) / width; // 0..~0.15+
}

// Mouth opening: vertical gap (51↔57) / mouth width (48↔54)
function mouthOpen(landmarks: any) {
  const p = landmarks?.positions; if (!p) return 0;
  const top = p[51], bottom = p[57], left = p[48], right = p[54];
  const gap = Math.max(0, bottom.y - top.y);
  const width = dist(left, right) + 1e-6;
  return gap / width; // 0..~0.6
}

// Eye Aspect Ratio (EAR) — lower ⇒ squint/blink
function eyeAspectRatio(landmarks: any) {
  const p = landmarks?.positions; if (!p) return 0.30;
  const L = [36,37,38,39,40,41].map(i => p[i]);
  const R = [42,43,44,45,46,47].map(i => p[i]);
  const ear = (eye:any[]) => {
    const v1 = dist(eye[1], eye[5]);
    const v2 = dist(eye[2], eye[4]);
    const h  = dist(eye[0], eye[3]);
    return (v1 + v2) / (2*h + 1e-6);
  };
  return (ear(L) + ear(R)) / 2; // ~0.30 open, ~0.18 squint
}

function pushProbs(expr: ExpressionProbs) {
  WINDOW.push(expr);
  if (WINDOW.length > MAXW) WINDOW.shift();
}

// ---------- Mapping 7→4 with calibrated geometry ----------
function mapToFourWithHeur(
  avg: ExpressionProbs,
  heur: { furrow: number; cornerDrop: number; mOpen?: number; ear?: number }
): {
  label: EmotionLabel;
  conf: number;
  scores: Record<string, number>;
  geom: { furrowN: number; squintN: number; mouthOpenN: number; cornerDropN: number };
} {
  let neutral     = avg.neutral ?? 0;
  let happy       = avg.happy ?? 0;
  const sad       = avg.sad ?? 0;
  const angry     = avg.angry ?? 0;
  const fearful   = avg.fearful ?? 0;
  const disgusted = avg.disgusted ?? 0;
  const surprised = avg.surprised ?? 0;

  // Geometry normalization
  const furrowN     = Math.min(1, Math.max(0, heur.furrow));            // 0..1
  const cornerDropN = Math.min(1, Math.max(0, heur.cornerDrop));        // 0..1
  const mOpenRaw    = heur.mOpen ?? 0;                                   // 0..~0.6
  const mouthOpenN  = Math.min(1, Math.max(0, (mOpenRaw - 0.10) / 0.30));
  const earRaw      = heur.ear ?? (baseEAR || 0.30);
  const squintN     = Math.min(1, Math.max(0, ((baseEAR || 0.30) - earRaw) / 0.12)); // calibrated

  // Dampen neutral/happy under “thinking” geometry
  const thinkGeom = Math.min(1, 0.6*furrowN + 0.6*squintN + 0.2*cornerDropN - 0.2*mouthOpenN);
  const neutralDamp = 1 - 0.45*thinkGeom; // [0.55,1]
  neutral *= neutralDamp;
  happy   *= (1 - 0.35*(furrowN + squintN));

  // ============================================================
  // RULE-PRIORITY OVERRIDES
  // ============================================================

  // PURE FURROW ⇒ CONFUSED (just frowning eyebrows)
  const strongFurrow  = furrowN >= 0.45;   // calibrated threshold (tune 0.42–0.55)
  const mouthClosed   = mouthOpenN <= 0.30;
  const lowCornerDrop = cornerDropN <= 0.12; // ensure it's not a real mouth-down frown

  if (strongFurrow && mouthClosed && lowCornerDrop) {
    const geomConf = Math.min(1, 0.85*furrowN + 0.15*squintN);
    const forced: Record<EmotionLabel, number> = {
      happy: 0.03, focused: 0.12, confused: 0.76, frustrated: 0.09
    };
    const s = forced.happy + forced.focused + forced.confused + forced.frustrated;
    return {
      label: 'confused',
      conf: Math.max(geomConf, 0.78),
      scores: {
        happy: forced.happy/s, focused: forced.focused/s,
        confused: forced.confused/s, frustrated: forced.frustrated/s
      },
      geom: { furrowN, squintN, mouthOpenN, cornerDropN }
    };
  }

  // ============================================================
  // BASE SCORES (no override)
  // ============================================================

  // Frustrated needs real lip-corner drop; subtract furrow so frown alone doesn't leak here
  const frustratedCore =
      1.00*cornerDropN
    + 0.30*angry + 0.25*disgusted + 0.18*sad
    - 0.12*happy
    - 0.25*furrowN;
  const frustrated = (cornerDropN >= 0.12) ? frustratedCore : 0.02;

  // Confused prefers furrow; penalize mouth-open; never drop below a fraction of furrow
  const surprisedAssist = Math.min(0.03, 0.03*(fearful + surprised)); // tiny cap
  const confusedCore =
      1.05*furrowN
    + 0.25*squintN
    - 0.25*mouthOpenN
    + surprisedAssist
    - 0.06*happy;
  const confused = Math.max(confusedCore, 0.6 * furrowN);

  const focused =
      0.65*neutral * (1 - 0.60*(furrowN + squintN))
    - 0.10*(surprised + fearful + angry);

  const happyS =
      1.00*happy
    - 0.12*(angry + sad + disgusted + squintN + furrowN);

  const raw = { frustrated, confused, happy: happyS, focused };
  const min0 = Object.fromEntries(Object.entries(raw).map(([k,v]) => [k, Math.max(0, v as number)]));
  const sum  = Object.values(min0).reduce((a,b)=>a+(b as number),0) || 1;
  const scores = Object.fromEntries(Object.entries(min0).map(([k,v]) => [k, (v as number)/sum]));

  // Pick top label from fixed set (keeps typing narrow)
  const order = ['happy','focused','confused','frustrated'] as const;
  let top: EmotionLabel = 'focused';
  let topVal = -1;
  for (const k of order) {
    const v = (scores as Record<string, number>)[k] ?? 0;
    if (v > topVal) { top = k; topVal = v; }
  }

  return {
    label: top,
    conf: topVal,
    scores,
    geom: { furrowN, squintN, mouthOpenN, cornerDropN }
  };
}

function smoothedDecision(
  heur: { furrow: number; cornerDrop: number; mOpen?: number; ear?: number }
): { label: EmotionLabel; conf: number; scores: Record<string, number>; geom: any } {
  if (WINDOW.length < Math.floor(MAXW * 0.6)) {
    return { label: currentLabel, conf: 1, scores: {}, geom: {} }; // warmup
  }
  const avg: ExpressionProbs = {};
  for (const row of WINDOW) {
    for (const [k, v] of Object.entries(row)) {
      avg[k] = (avg[k] ?? 0) + (v as number) / WINDOW.length;
    }
  }
  return mapToFourWithHeur(avg, heur);
}

// ---------- HUD / loop ----------
export type HUD = {
  label: EmotionLabel;
  conf: number;
  scores: Record<string, number>;
  cooling: number;
  geom: { furrowN?: number; squintN?: number; mouthOpenN?: number; cornerDropN?: number };
};

export async function loop(videoEl: HTMLVideoElement, onHud?: (hud: HUD) => void) {
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

    let furrow = 0, cornerDrop = 0, mOpen = 0, ear = 0.30;
    if (det?.landmarks) {
      updateCalibration(det.landmarks);              // learn baseline early
      furrow     = browFurrow(det.landmarks);
      cornerDrop = mouthCornerDrop(det.landmarks);
      mOpen      = mouthOpen(det.landmarks);
      ear        = eyeAspectRatio(det.landmarks);
    }

    const { label, conf, scores, geom } = smoothedDecision({ furrow, cornerDrop, mOpen, ear });

    const now = Date.now();
    const cooling = Math.max(0, cooldownUntil - now);

    // dwell + cooldown state machine
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

    onHud?.({ label: currentLabel, conf, scores, cooling, geom });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function stop() { stopLoop = true; }

export function resetWindow() {
  WINDOW.length = 0;
  currentLabel = 'focused';
  lastCandidate = null;
  cooldownUntil = 0;
  // reset calibration so next start re-learns neutral
  calCount = 0;
  baseBetweenN = 0;
  baseEAR = 0;
}
