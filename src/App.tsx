import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { loadModels, startCamera, loop, stop, resetWindow } from './emotionEngine';
import type { HUD } from './emotionEngine';
import { subscribe, forceMode, getMode, type UIMode } from './adaptation';

type Hotspot = { id: string; term: string; hint: string };

const HOTSPOTS: Hotspot[] = [
  { id: 'hs-1', term: 'Bayesian updating', hint: 'Update beliefs with evidence; prior × likelihood → posterior.' },
  { id: 'hs-2', term: 'Cognitive load',    hint: 'Mental effort to process info; reduce via chunking & signaling.' },
  { id: 'hs-3', term: 'Fitts’s Law',       hint: 'Pointing time ∝ distance/size; bigger/closer targets are faster.' },
];

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady]   = useState(false);
  const [running, setRun]   = useState(false);
  const [hud, setHud]       = useState<HUD | null>(null);
  const [err, setErr]       = useState<string | null>(null);
  const [uiMode, setUIMode] = useState<UIMode>(getMode());
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const unsub = subscribe(setUIMode);
    return () => { unsub(); };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await loadModels('/models');
        setReady(true);
      } catch (e:any) { setErr(`Model load failed: ${e?.message || e}`); }
    })();
  }, []);

  async function onStart() {
    if (!videoRef.current) return;
    setErr(null);
    try {
      await startCamera(videoRef.current);
      resetWindow();
      await loop(videoRef.current, setHud);
      setRun(true);
    } catch (e:any) { setErr(`Camera start failed: ${e?.message || e}`); }
  }
  function onStop() {
    stop();
    const v = videoRef.current;
    const stream = (v?.srcObject as MediaStream | null);
    stream?.getTracks().forEach(t => t.stop());
    if (v) v.srcObject = null;
    setRun(false);
  }

  // For confused hint placement
  const firstVisibleHotspot = useVisibleHotspot();

  // Manual preview buttons
  const preview = (m: UIMode) => { setLocked(false); forceMode(m); };

  return (
    <div className={`app theme-${uiMode} ${locked ? 'locked' : ''}`}>
      <header className="chrome">
        <div className="brand">Emotion-Responsive Reader</div>
        <div className="spacer" />
        <div className="controls">
          <button disabled={!ready || running} onClick={onStart}>
            {ready ? 'Start Detection' : 'Loading models…'}
          </button>
          <button disabled={!running} onClick={onStop}>Stop</button>
        </div>
      </header>

      <div className="toolbar">
        <span className="tag">Mode:</span>
        <b className="mode">{uiMode}</b>
        <button onClick={()=>setLocked(l=>!l)}>{locked ? 'Unlock UI' : 'Lock UI'}</button>
        <span className="tag">Preview:</span>
        <div className="pill">
          <button onClick={()=>preview('focused')}>Focused</button>
          <button onClick={()=>preview('confused')}>Confused</button>
          <button onClick={()=>preview('frustrated')}>Frustrated</button>
          <button onClick={()=>preview('happy')}>Happy</button>
        </div>
        {err && <div className="error">{err}</div>}
      </div>

      <main className="layout">
        <article className="reader" id="reader">
          <h1>Designing for Cognitive Load: A Practical Guide</h1>
          <p>
            Effective interfaces minimize <HotspotSpan id="hs-2" term="Cognitive load" /> by chunking,
            progressive disclosure, and clear visual hierarchies.
          </p>
          <p>
            Under uncertainty, <HotspotSpan id="hs-1" term="Bayesian updating" /> can guide decision-making,
            but explanations must be simplified for non-experts.
          </p>
          <p>
            According to <HotspotSpan id="hs-3" term="Fitts’s Law" />, target size and distance
            strongly affect pointing time; adaptive zoom can help when users squint.
          </p>
          <h2>Checklist</h2>
          <ul>
            <li>Use signaling (bold, color, icons) for key actions.</li>
            <li>Chunk dense sections; reveal details on demand.</li>
            <li>Offer inline help chips near terms that spike confusion.</li>
          </ul>
        </article>

        <aside className="sidebar">
          <h3>Notes</h3>
          <p>Adaptive behaviors:</p>
          <ul>
            <li><b>Confused</b>: inline hint chip, zoom + line-height</li>
            <li><b>Frustrated</b>: simplified UI (sidebar hides, colors mute)</li>
            <li><b>Focused</b>: chrome dims, minimal distractions</li>
            <li><b>Happy</b>: vivid colors, subtle flourish</li>
          </ul>

          {hud && (
            <div className="hud">
              <div className="row">
                <span>Label:</span><b>{hud.label}</b>
                <span>Conf:</span><b>{hud.conf.toFixed(2)}</b>
              </div>
              <div className="bars">
                {(['happy','focused','confused','frustrated'] as const).map(k => (
                  <div key={k} className="bar">
                    <span className="k">{k}</span>
                    <div className="track"><div className="fill" style={{width:`${Math.round(((hud.scores as any)[k]||0)*100)}%`}}/></div>
                    <span className="v">{((hud.scores as any)[k]||0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="camera">
            <video ref={videoRef} playsInline muted />
          </div>
        </aside>
      </main>

      {/* Inline hint chip (visible in 'confused') */}
      <HintChip visible={!locked && uiMode==='confused' && !!firstVisibleHotspot}
                targetId={firstVisibleHotspot?.id}
                text={useMemo(() => {
                  const id = firstVisibleHotspot?.id;
                  const hs = HOTSPOTS.find(h => h.id === id);
                  return hs ? `${hs.term}: ${hs.hint}` : '';
                }, [firstVisibleHotspot])}
      />

      <footer className="chrome">
        <small>Static article · pre-annotated hotspots · on-device detection</small>
      </footer>
    </div>
  );
}

/* ---------- Helpers ---------- */

function HotspotSpan({ id, term }: { id: string; term: string }) {
  return <span className="hotspot" data-hsid={id} id={id}>{term}</span>;
}

function useVisibleHotspot(): { id: string } | null {
  const [current, setCurrent] = useState<{ id: string } | null>(null);
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      const onscreen = entries.filter(e => e.isIntersecting && (e.target as HTMLElement).classList.contains('hotspot'));
      if (onscreen[0]) setCurrent({ id: (onscreen[0].target as HTMLElement).id });
    }, { rootMargin: '-10% 0px -70% 0px', threshold: 0.2 });
    document.querySelectorAll('.hotspot').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);
  return current;
}

function HintChip({ visible, targetId, text }: { visible: boolean; targetId?: string; text: string }) {
  const [style, setStyle] = useState<React.CSSProperties>({});
  useEffect(() => {
    if (!visible || !targetId) return;
    const el = document.getElementById(targetId);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const top = rect.top + window.scrollY - 8;
    const left = rect.left + window.scrollX + rect.width + 8;
    setStyle({ top, left });
  }, [visible, targetId, text]);

  return (
    <div className={`hint-chip ${visible ? 'show' : ''}`} style={style} role="status" aria-live="polite">
      <span className="dot" />
      <span className="text">{text}</span>
      <button className="btn" onClick={() => forceMode('focused')}>Got it</button>
    </div>
  );
}
