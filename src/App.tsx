import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { loadModels, startCamera, loop, stop, resetWindow, type HUD } from './emotionEngine';
import { subscribe, forceMode, getMode, type UIMode } from './adaptation';

type Hotspot = { id: string; term: string; hint: string };

const HOTSPOTS: Hotspot[] = [
  { id: 'hs-1', term: 'Bayesian updating', hint: 'Prior × likelihood → posterior; update beliefs using evidence.' },
  { id: 'hs-2', term: 'Cognitive load',    hint: 'Mental effort needed to process content; reduce via chunking.' },
  { id: 'hs-3', term: 'Fitts’s Law',       hint: 'Pointing time depends on distance and size; bigger, closer targets are easier.' },
];

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);

  const [ready, setReady]       = useState(false);
  const [running, setRunning]   = useState(false);
  const [hud, setHud]           = useState<HUD | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [uiMode, setUIMode]     = useState<UIMode>(getMode());

  const [locked, setLocked]     = useState(false);
  const lockedRef               = useRef(false);

  const [sidebarOpen, setSidebarOpen] = useState(true);

  // keep ref synced so subscribe callback sees latest locked state
  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  // subscribe to adaptation bus
  useEffect(() => {
    const unsub = subscribe((m: UIMode) => {
      if (lockedRef.current) return; // when locked, ignore emotion changes
      setUIMode(m);
    });
    return () => { unsub(); };
  }, []);

  // load models on mount
  useEffect(() => {
    (async () => {
      try {
        await loadModels('/models');
        setReady(true);
      } catch (e: any) {
        setError(`Model load failed: ${e?.message || e}`);
      }
    })();
  }, []);

  // start detection
  async function onStart() {
    if (!videoRef.current) return;
    setError(null);
    try {
      await startCamera(videoRef.current);
      resetWindow();
      await loop(videoRef.current, setHud);
      setRunning(true);
    } catch (e: any) {
      setError(`Camera start failed: ${e?.message || e}`);
    }
  }

  // stop detection
  function onStop() {
    stop();
    const v = videoRef.current;
    const stream = (v?.srcObject as MediaStream | null);
    stream?.getTracks().forEach(t => t.stop());
    if (v) v.srcObject = null;
    setRunning(false);
  }

  // LOCK: freeze mode + close side panel
  // UNLOCK: reopen side panel (detector continues updating mode)
  function toggleLock() {
    if(!locked){
      setLocked(true);
      setSidebarOpen(false);
      if(running) onStop();
    } else{
      setLocked(false);
      setSidebarOpen(true);
      onStart();
    }
  }

  // Preview buttons: only work when NOT locked
  function preview(m: UIMode) {
    if (locked) return;
    forceMode(m);
  }

  // which hotspot is currently visible in viewport?
  const visibleHotspot = useVisibleHotspot();

  return (
    <div className={`app theme-${uiMode} ${locked ? 'locked' : ''}`}>
      {/* Header */}
      <header className="chrome">
        <div className="chrome-top">
          <div className="brand">Emotion-Responsive Reader</div>
          <div className="spacer" />
          <div className="controls">
            <button disabled={!ready || running} onClick={onStart}>
              {ready ? 'Start Detection' : 'Loading models…'}
            </button>
            <button disabled={!running} onClick={onStop}>Stop</button>
          </div>

        </div>
        
        {/* Toolbar */}
      <div className="toolbar">
        <div className='toolbar-left'>
          <span className="tag">Mode:</span>
          <b className="mode">{uiMode}</b>
  
          <button onClick={toggleLock}>{locked ? 'Unlock UI' : 'Lock UI'}</button>
  
          <span className="tag">Preview:</span>
          <div className="pill">
            <button onClick={() => preview('focused')}>Focused</button>
            <button onClick={() => preview('confused')}>Confused</button>
            <button onClick={() => preview('frustrated')}>Frustrated</button>
            <button onClick={() => preview('happy')}>Happy</button>
          </div>
  
  
          {error && <div className="error">{error}</div>}
        </div>
        <div className='toolbar-right'>
          <button onClick={() => setSidebarOpen(s => !s)}>
            {sidebarOpen ? 'Hide Side Panel' : 'Show Side Panel'}
          </button>
        </div>
        
      </div>
      </header>

      

      {/* Main layout */}
      <main className={`layout ${sidebarOpen ? 'layout--with-sidebar' : 'layout--no-sidebar'}`}>
        {/* LEFT: big article */}
        <article className="reader" id="reader">
          <h1>Designing for Cognitive Load: A Practical Guide</h1>

          <p>
            Effective interfaces minimize <HotspotSpan id="hs-2" term="Cognitive load" /> by chunking,
            progressive disclosure, and clear visual hierarchies. When too many elements compete for
            attention, people skim instead of reading and miss important cues. A tired or anxious
            reader hits this limit even faster.
          </p>

          <p>
            Under uncertainty, <HotspotSpan id="hs-1" term="Bayesian updating" /> can guide
            decision-making, but explanations must be simplified for non-experts. Designers rarely use
            probability notation, yet every progress bar and status message implicitly updates a user’s
            belief about “how close they are to success”. If that feedback is noisy or delayed, users
            experience confusion and mistrust.
          </p>

          <p>
            According to <HotspotSpan id="hs-3" term="Fitts’s Law" />, target size and distance strongly
            affect pointing time. Adaptive zoom and generous hit-areas can help when users squint, lean
            forward, or use a small trackpad. Instead of assuming ideal desktop conditions, an adaptive
            reader can react to real-time signals like facial tension and blink rate.
          </p>

          <p>
            In long-form reading, cognitive load is also about micro decisions: “Should I click this
            side link?”, “Is this term important?”, “Will something break if I press back?”. A good
            reading interface quietly answers these questions using headings, typography, and inline
            help chips that guide the eye through dense material.
          </p>

          <p>
            Emotion-responsive interfaces extend this idea by monitoring subtle signs of confusion and
            frustration. When the system detects a frown, it can increase line-height, slightly zoom
            the text, and surface a short explanation next to the most likely hotspot term. When the
            reader relaxes again, the interface gently returns to a compact layout, avoiding jarring
            jumps or playful animations that might distract.
          </p>

          <p>
            Over-helpful behaviour can itself become a source of cognitive load. If hints appear too
            often or in the wrong place, users may feel watched or interrupted. That’s why it is
            important to combine automatic adaptations with simple controls: the ability to lock the
            UI, collapse the side panel, or dismiss a hint with one click. These controls make the
            adaptation feel like a collaboration, not a black box.
          </p>

          <h2>Checklist</h2>
          <ul>
            <li>Use signaling (bold, color, icons) for key actions and definitions.</li>
            <li>Chunk dense sections; reveal examples and math details on demand.</li>
            <li>Offer inline help chips near terms that repeatedly cause confusion.</li>
            <li>Provide a visible way to lock the UI and pause adaptation.</li>
            <li>Let readers reopen support panels when they actively want extra help.</li>
          </ul>
        </article>

        {/* RIGHT: side panel (open/closable) */}
        {sidebarOpen && (
          <aside className="sidebar">
            <div className="sidebar-header">
              <h3>Notes</h3>
            </div>

            <p>Adaptive behaviors:</p>
            <ul>
              <li><b>Confused</b>: inline hint chip, zoom, increased line-height</li>
              <li><b>Frustrated</b>: simplified UI, muted colors</li>
              <li><b>Focused</b>: chrome dimming, minimal distractions</li>
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
                      <div className="track">
                        <div
                          className="fill"
                          style={{ width: `${Math.round(((hud.scores as any)[k] || 0) * 100)}%` }}
                        />
                      </div>
                      <span className="v">{((hud.scores as any)[k] || 0).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="camera">
              <video ref={videoRef} playsInline muted />
            </div>
          </aside>
        )}
      </main>

      {/* Hint chip – only when confused, unlocked, and a hotspot is visible */}
      <HintChip
        visible={!locked && uiMode === 'confused' && !!visibleHotspot}
        targetId={visibleHotspot?.id}
        text={useMemo(() => {
          const id = visibleHotspot?.id;
          const hs = HOTSPOTS.find(h => h.id === id);
          return hs ? `${hs.term}: ${hs.hint}` : '';
        }, [visibleHotspot])}
      />

      <footer className="chrome">
        <small>Static article · pre-annotated hotspots · on-device detection</small>
      </footer>
    </div>
  );
}

/* ---------- Small helpers ---------- */

function HotspotSpan({ id, term }: { id: string; term: string }) {
  return (
    <span className="hotspot" id={id} data-hsid={id}>
      {term}
    </span>
  );
}

function useVisibleHotspot(): { id: string } | null {
  const [current, setCurrent] = useState<{ id: string } | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        const onscreen = entries.find(
          e =>
            e.isIntersecting &&
            (e.target as HTMLElement).classList.contains('hotspot')
        );
        if (onscreen) {
          setCurrent({ id: (onscreen.target as HTMLElement).id });
        }
      },
      { threshold: 0.2, rootMargin: '-10% 0px -70% 0px' }
    );

    document.querySelectorAll('.hotspot').forEach(el => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return current;
}

function HintChip({
  visible,
  targetId,
  text,
}: {
  visible: boolean;
  targetId?: string;
  text: string;
}) {
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
    <div className={`hint-chip ${visible ? 'show' : ''}`} style={style}>
      <span className="dot" />
      <span className="text">{text}</span>
      <button className="btn" onClick={() => forceMode('focused')}>
        Got it
      </button>
    </div>
  );
}
