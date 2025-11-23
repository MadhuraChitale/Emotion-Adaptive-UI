import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { loadModels, startCamera, loop, stop, resetWindow, type HUD } from './emotionEngine';
import { subscribe, forceMode, getMode, type UIMode } from './adaptation';

type Hotspot = { id: string; term: string; hint: string };

const HOTSPOTS: Hotspot[] = [
  { id: 'hs-crypto-1',  term: 'RSA encryption', hint: 'A public-key system based on factoring large primes.' },
  { id: 'hs-crypto-2',  term: 'Elliptic Curve Cryptography', hint: 'Efficient public-key cryptography using elliptic curves.' },
  { id: 'hs-crypto-3',  term: 'prime factorization problem', hint: 'Hard problem: finding prime factors of a large integer.' },
  { id: 'hs-crypto-4',  term: 'one-way function', hint: 'Easy to compute but hard to invert without a secret.' },
  { id: 'hs-crypto-5',  term: 'computational asymmetry', hint: 'A task that is easy one way but expensive in reverse.' },
  { id: 'hs-crypto-6',  term: 'public key infrastructure', hint: 'System for verifying identities across the internet.' },
  { id: 'hs-crypto-7',  term: 'certificate authorities', hint: 'Trusted organizations that issue digital certificates.' },
  { id: 'hs-crypto-8',  term: 'hash functions', hint: 'Algorithms that map input to fixed-length output.' },
  { id: 'hs-crypto-9',  term: 'collision resistance', hint: 'Hard to find two inputs producing the same hash.' },
  { id: 'hs-crypto-10', term: 'quantum algorithms', hint: 'Algorithms that leverage quantum computing power.' },
  { id: 'hs-crypto-11', term: 'Shor’s algorithm', hint: 'Quantum algorithm that factors integers efficiently.' },
  { id: 'hs-crypto-12', term: 'post-quantum cryptography', hint: 'Cryptosystems designed to resist quantum attacks.' },
  { id: 'hs-crypto-13', term: 'zero-knowledge proofs', hint: 'Prove knowledge without revealing information.' },
  { id: 'hs-crypto-14', term: 'zk-SNARK', hint: 'Efficient zero-knowledge proof system.' },
  { id: 'hs-crypto-15', term: 'trusted setup ceremony', hint: 'Process that initializes certain ZK systems.' },
  { id: 'hs-crypto-16', term: 'homomorphic encryption', hint: 'Compute on encrypted data without decrypting it.' },
  { id: 'hs-crypto-17', term: 'secure multi-party computation', hint: 'Collaborative computation without revealing secrets.' },
  { id: 'hs-crypto-18', term: 'key management', hint: 'Practices around generating and storing cryptographic keys.' },
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

  // NEW: hovered hotspot id for hover-based hints
  const [hoveredHotspot, setHoveredHotspot] = useState<string | null>(null);

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
  // UNLOCK: reopen side panel (detector continues updating mode) – current behavior
  function toggleLock() {
    if (!locked) {
      console.log(uiMode);
      setLocked(true);
      setSidebarOpen(false);
      if (running) onStop();
    } else {
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
          <div className="toolbar-left">
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
          <div className="toolbar-right">
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
          <h1>Understanding Modern Cryptography: A Deep Dive into Digital Security</h1>

          <p>
            Modern cryptography is built on the idea that certain mathematical problems are
            computationally expensive to solve. The security of systems like{' '}
            <HotspotSpan id="hs-crypto-1" term="RSA encryption" onHover={setHoveredHotspot} /> and{' '}
            <HotspotSpan id="hs-crypto-2" term="Elliptic Curve Cryptography" onHover={setHoveredHotspot} /> depends on
            how difficult it is to reverse a function without a secret key. These systems
            rely on assumptions like the{' '}
            <HotspotSpan id="hs-crypto-3" term="prime factorization problem" onHover={setHoveredHotspot} /> being
            computationally intractable.
          </p>

          <p>
            At the heart of secure digital communication lies the concept of a{' '}
            <HotspotSpan id="hs-crypto-4" term="one-way function" onHover={setHoveredHotspot} />, which is easy to compute
            but hard to invert. For example, multiplying two large primes is easy, but
            deriving those primes back from the product is extremely difficult. This is
            known as{' '}
            <HotspotSpan id="hs-crypto-5" term="computational asymmetry" onHover={setHoveredHotspot} />, a foundational
            idea in cryptography.
          </p>

          <p>
            Another important idea is{' '}
            <HotspotSpan id="hs-crypto-6" term="public key infrastructure" onHover={setHoveredHotspot} />, a system that
            helps verify identities online. Websites use it when they present you with a
            certificate proving they are who they claim to be. These certificates depend on{' '}
            <HotspotSpan id="hs-crypto-7" term="certificate authorities" onHover={setHoveredHotspot} />, which act as
            trusted third parties.
          </p>

          <p>
            However, not all cryptographic tools provide the same type of protection. For
            example, <HotspotSpan id="hs-crypto-8" term="hash functions" onHover={setHoveredHotspot} /> are used for
            verifying integrity rather than confidentiality. A good hash function has the
            property of <HotspotSpan id="hs-crypto-9" term="collision resistance" onHover={setHoveredHotspot} />, meaning
            it is extremely unlikely for two different inputs to produce the same hash.
            Achieving collision resistance requires careful design and mathematical rigor.
          </p>

          <p>
            As computing power increases, especially with the rise of{' '}
            <HotspotSpan id="hs-crypto-10" term="quantum algorithms" onHover={setHoveredHotspot} />, traditional systems
            may become vulnerable. For example,{' '}
            <HotspotSpan id="hs-crypto-11" term="Shor’s algorithm" onHover={setHoveredHotspot} /> can theoretically
            break RSA by factoring large numbers efficiently on a quantum computer. This
            has led to the development of{' '}
            <HotspotSpan id="hs-crypto-12" term="post-quantum cryptography" onHover={setHoveredHotspot} />, which focuses
            on designing systems resistant to quantum attacks.
          </p>

          <p>
            A particularly challenging area is{' '}
            <HotspotSpan id="hs-crypto-13" term="zero-knowledge proofs" onHover={setHoveredHotspot} />, which allow one
            party to prove they know something without revealing the information itself.
            This idea powers privacy-focused systems such as anonymous credentials and
            cryptocurrency protocols. One widely used system is the{' '}
            <HotspotSpan id="hs-crypto-14" term="zk-SNARK" onHover={setHoveredHotspot} />, which enables efficient
            verification of complex statements.
          </p>

          <p>
            Despite their usefulness, zero-knowledge systems can be fragile. They require
            precise implementation to avoid vulnerabilities. A mistake in the{' '}
            <HotspotSpan id="hs-crypto-15" term="trusted setup ceremony" onHover={setHoveredHotspot} /> can compromise
            the entire system. This is why researchers invest heavily in audits and
            formal verification.
          </p>

          <p>
            The field continues to evolve rapidly. New approaches such as{' '}
            <HotspotSpan id="hs-crypto-16" term="homomorphic encryption" onHover={setHoveredHotspot} /> allow
            computations to be performed on encrypted data without needing to decrypt it
            first — a breakthrough for secure cloud computing. Another emerging idea is{' '}
            <HotspotSpan id="hs-crypto-17" term="secure multi-party computation" onHover={setHoveredHotspot} />, enabling
            multiple parties to collaborate on a computation without revealing their private
            inputs.
          </p>

          <p>
            Modern cryptography is not just about mathematics. Human factors also matter
            significantly. Many real-world attacks exploit weaknesses in{' '}
            <HotspotSpan id="hs-crypto-18" term="key management" onHover={setHoveredHotspot} /> or poor implementation
            practices. Even the strongest encryption fails if a private key is stored
            insecurely.
          </p>

          <p>
            Understanding these concepts requires substantial effort. But by mastering the
            building blocks — from <HotspotSpan id="hs-crypto-1" term="RSA" onHover={setHoveredHotspot} /> to{' '}
            <HotspotSpan id="hs-crypto-16" term="homomorphic encryption" onHover={setHoveredHotspot} /> — one gains a
            deeper appreciation of how digital security is achieved in the modern world.
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
              <h3>Emotion Detection</h3>
            </div>

            {/* <p>Adaptive behaviors:</p>
            <ul>
              <li><b>Confused</b>: inline hint chip, zoom, increased line-height</li>
              <li><b>Frustrated</b>: simplified UI, muted colors</li>
              <li><b>Focused</b>: chrome dimming, minimal distractions</li>
              <li><b>Happy</b>: vivid colors, subtle flourish</li>
            </ul> */}

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

      {/* Hint chip – only when confused, unlocked, AND hovering a hotspot */}
      <HintChip
        visible={uiMode === 'confused' && !!hoveredHotspot}
        targetId={hoveredHotspot ?? undefined}
        text={useMemo(() => {
          const hs = HOTSPOTS.find(h => h.id === hoveredHotspot);
          return hs ? `${hs.term}: ${hs.hint}` : '';
        }, [hoveredHotspot])}
      />
    </div>
  );
}

/* ---------- Small helpers ---------- */

function HotspotSpan({
  id,
  term,
  onHover,
}: {
  id: string;
  term: string;
  onHover: (id: string | null) => void;
}) {
  return (
    <span
      className="hotspot"
      id={id}
      data-hsid={id}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
    >
      {term}
    </span>
  );
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

  if (!visible) return null;

  return (
    <div className={`hint-chip ${visible ? 'show' : ''}`} style={style}>
      <span className="dot" />
      <span className="text">{text}</span>
    </div>
  );
}
