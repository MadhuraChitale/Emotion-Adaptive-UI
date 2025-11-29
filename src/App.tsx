// App.tsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import './App.css';
import {
  loadModels,
  startCamera,
  loop,
  stop,
  resetWindow,
  type HUD,
} from './emotionEngine';
import { subscribe, forceMode, getMode, type UIMode } from './adaptation';
import { askLLM } from './llmClient';

/** ------------------------------------------------------------------ */
/** Hotspots (for hint chips)                                          */
/** ------------------------------------------------------------------ */

type Hotspot = { id: string; term: string; hint: string };

const HOTSPOTS: Hotspot[] = [
  { id: 'hs-crypto-1', term: 'RSA encryption', hint: 'A public-key system based on factoring large primes.' },
  { id: 'hs-crypto-2', term: 'Elliptic Curve Cryptography', hint: 'Efficient public-key cryptography using elliptic curves.' },
  { id: 'hs-crypto-3', term: 'prime factorization problem', hint: 'Hard problem: finding prime factors of a large integer.' },
  { id: 'hs-crypto-4', term: 'one-way function', hint: 'Easy to compute but hard to invert without a secret.' },
  { id: 'hs-crypto-5', term: 'computational asymmetry', hint: 'A task that is easy one way but expensive in reverse.' },
  { id: 'hs-crypto-6', term: 'public key infrastructure', hint: 'System for verifying identities across the internet.' },
  { id: 'hs-crypto-7', term: 'certificate authorities', hint: 'Trusted organizations that issue digital certificates.' },
  { id: 'hs-crypto-8', term: 'hash functions', hint: 'Algorithms that map input to fixed-length output.' },
  { id: 'hs-crypto-9', term: 'collision resistance', hint: 'Hard to find two inputs producing the same hash.' },
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

/** ------------------------------------------------------------------ */
/** Article text (plain) for LLM – paragraph-wise                      */
/** ------------------------------------------------------------------ */

const ARTICLE_PARAGRAPHS_TEXT: string[] = [
  `Modern cryptography is built on the idea that certain mathematical problems are computationally expensive to solve. The security of systems like RSA encryption and Elliptic Curve Cryptography depends on how difficult it is to reverse a function without a secret key. These systems rely on assumptions like the prime factorization problem being computationally intractable.`,
  `At the heart of secure digital communication lies the concept of a one-way function, which is easy to compute but hard to invert. For example, multiplying two large primes is easy, but deriving those primes back from the product is extremely difficult. This is known as computational asymmetry, a foundational idea in cryptography.`,
  `Another important idea is public key infrastructure, a system that helps verify identities online. Websites use it when they present you with a certificate proving they are who they claim to be. These certificates depend on certificate authorities, which act as trusted third parties.`,
  `However, not all cryptographic tools provide the same type of protection. For example, hash functions are used for verifying integrity rather than confidentiality. A good hash function has the property of collision resistance, meaning it is extremely unlikely for two different inputs to produce the same hash. Achieving collision resistance requires careful design and mathematical rigor.`,
  `As computing power increases, especially with the rise of quantum algorithms, traditional systems may become vulnerable. For example, Shor’s algorithm can theoretically break RSA by factoring large numbers efficiently on a quantum computer. This has led to the development of post-quantum cryptography, which focuses on designing systems resistant to quantum attacks.`,
  `A particularly challenging area is zero-knowledge proofs, which allow one party to prove they know something without revealing the information itself. This idea powers privacy-focused systems such as anonymous credentials and cryptocurrency protocols. One widely used system is the zk-SNARK, which enables efficient verification of complex statements.`,
  `Despite their usefulness, zero-knowledge systems can be fragile. They require precise implementation to avoid vulnerabilities. A mistake in the trusted setup ceremony can compromise the entire system. This is why researchers invest heavily in audits and formal verification.`,
  `The field continues to evolve rapidly. New approaches such as homomorphic encryption allow computations to be performed on encrypted data without needing to decrypt it first — a breakthrough for secure cloud computing. Another emerging idea is secure multi-party computation, enabling multiple parties to collaborate on a computation without revealing their private inputs.`,
  `Modern cryptography is not just about mathematics. Human factors also matter significantly. Many real-world attacks exploit weaknesses in key management or poor implementation practices. Even the strongest encryption fails if a private key is stored insecurely.`,
  `Understanding these concepts requires substantial effort. But by mastering the building blocks — from RSA to homomorphic encryption — one gains a deeper appreciation of how digital security is achieved in the modern world.`,
];

const CHECKLIST_SECTION_TEXT = ARTICLE_PARAGRAPHS_TEXT.join('\n\n');

/** ------------------------------------------------------------------ */
/** LLM prompt helpers                                                 */
/** ------------------------------------------------------------------ */

function buildParagraphClarifyPrompt(): string {
  const numbered = ARTICLE_PARAGRAPHS_TEXT.map(
    (p, i) => `Paragraph ${i + 1}:\n${p.trim()}`
  ).join('\n\n');

  return `
You are helping a student understand a dense article about modern cryptography.

Below is the full section, followed by the same text split into numbered paragraphs.

Full section:
${CHECKLIST_SECTION_TEXT}

Now here is the article split into paragraphs:

${numbered}

For each paragraph i, write a short clarification in plain language (1–2 sentences).
Return your result as pure JSON with this exact shape, and nothing else:

{
  "clarifications": [
    "Clarification for paragraph 1 ...",
    "Clarification for paragraph 2 ...",
    "... (and so on, one string per paragraph in order)"
  ]
}
`.trim();
}

function parseClarificationsFromResponse(
  answer: string,
  expectedCount: number
): string[] {
  try {
    const start = answer.indexOf('{');
    const end = answer.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const jsonStr = answer.slice(start, end + 1);
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed.clarifications)) {
        const arr = parsed.clarifications.map((x: any) => String(x));
        if (arr.length === expectedCount) return arr;
        if (arr.length > expectedCount) return arr.slice(0, expectedCount);
        while (arr.length < expectedCount) arr.push('');
        return arr;
      }
    }
  } catch (e) {
    console.warn('Failed to parse clarifications JSON', e);
  }

  const chunks = answer
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!chunks.length) {
    return Array(expectedCount).fill('');
  }
  if (chunks.length >= expectedCount) {
    return chunks.slice(0, expectedCount);
  }
  while (chunks.length < expectedCount) chunks.push('');
  return chunks;
}

/** ------------------------------------------------------------------ */
/** Deep dive (happy) helpers                                          */
/** ------------------------------------------------------------------ */

type DeepLink = {
  title: string;
  url: string;
  blurb: string;
};

function buildDeepDivePrompt(): string {
  const numbered = ARTICLE_PARAGRAPHS_TEXT.map(
    (p, i) => `Paragraph ${i + 1}:\n${p.trim()}`
  ).join('\n\n');

  return `
You are an AI assistant that recommends high-level follow-up readings.

The user is reading an article about modern cryptography. The article is split into numbered paragraphs:

${numbered}

For each paragraph i, suggest 2–3 external readings (articles, blog posts, or intro resources) that would help a curious student "dive deeper" into that paragraph's topic.

You may invent plausible example URLs (e.g., "https://example.com/...") if you don't know real ones, but they should look realistic and be specific to the topic.

Return ONLY pure JSON, with this exact structure:

{
  "links": [
    [
      { "title": "Title for p1 link 1", "url": "https://...", "blurb": "1–2 sentence description" },
      { "title": "Title for p1 link 2", "url": "https://...", "blurb": "..." }
    ],
    [
      { "title": "Title for p2 link 1", "url": "https://...", "blurb": "..." }
    ],
    ...
  ]
}

There must be exactly one inner array of link objects per paragraph, in order.
`.trim();
}

function parseDeepLinksFromResponse(
  answer: string,
  expectedParagraphs: number
): DeepLink[][] {
  try {
    const start = answer.indexOf('{');
    const end = answer.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const jsonStr = answer.slice(start, end + 1);
      const parsed = JSON.parse(jsonStr);

      if (Array.isArray(parsed.links)) {
        const linksRaw = parsed.links as any[];
        const result: DeepLink[][] = [];

        for (let i = 0; i < expectedParagraphs; i++) {
          const item = linksRaw[i];
          if (Array.isArray(item)) {
            result.push(
              item.map((obj: any) => ({
                title: String(obj?.title ?? 'Further reading'),
                url: String(obj?.url ?? '#'),
                blurb: String(obj?.blurb ?? ''),
              }))
            );
          } else if (item && typeof item === 'object') {
            result.push([
              {
                title: String(item.title ?? 'Further reading'),
                url: String(item.url ?? '#'),
                blurb: String(item.blurb ?? ''),
              },
            ]);
          } else {
            result.push([]);
          }
        }
        return result;
      }
    }
  } catch (e) {
    console.warn('Failed to parse deep links JSON', e);
  }

  // Fallback: no structured links
  return Array.from({ length: expectedParagraphs }, () => [] as DeepLink[]);
}

/** ------------------------------------------------------------------ */
/** Main App                                                           */
/** ------------------------------------------------------------------ */

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);

  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [hud, setHud] = useState<HUD | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uiMode, setUIMode] = useState<UIMode>(getMode());

  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);

  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [hoveredHotspot, setHoveredHotspot] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Confused → clarifications
  const [paragraphClarifications, setParagraphClarifications] = useState<
    string[] | null
  >(null);
  const [paragraphClarifyLoading, setParagraphClarifyLoading] = useState(false);
  const [paragraphClarifyError, setParagraphClarifyError] = useState<
    string | null
  >(null);
  const [activeParagraphIndex, setActiveParagraphIndex] = useState<number | null>(
    null
  );

  // Happy → deep dive links
  const [deepLinks, setDeepLinks] = useState<DeepLink[][] | null>(null);
  const [deepLinksLoading, setDeepLinksLoading] = useState(false);
  const [deepLinksError, setDeepLinksError] = useState<string | null>(null);
  const [activeDeepParagraphIndex, setActiveDeepParagraphIndex] = useState<
    number | null
  >(null);

  // paragraph refs
  const paragraphRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const registerParagraphRef =
    (index: number) => (el: HTMLParagraphElement | null) => {
      paragraphRefs.current[index] = el;
    };

  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  useEffect(() => {
    const unsub = subscribe((m: UIMode) => {
      if (lockedRef.current) return;
      setUIMode(m);
    });
    return () => {
      unsub();
    };
  }, []);

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

  useEffect(() => {
    const update = () => {
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop || 0;
      const height = doc.scrollHeight - window.innerHeight;
      const pct = height > 0 ? (scrollTop / height) * 100 : 0;
      setProgress(pct);
    };
    update();
    window.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  // Enter/leave confused → prefetch clarifications
  useEffect(() => {
    if (uiMode === 'confused') {
      void ensureParagraphClarifications();
    } else {
      setActiveParagraphIndex(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiMode]);

  // Enter/leave happy → prefetch deep links
  useEffect(() => {
    if (uiMode === 'happy') {
      void ensureDeepLinks();
    } else {
      setActiveDeepParagraphIndex(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiMode]);

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

  function onStop() {
    stop();
    const v = videoRef.current;
    const stream = v?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (v) v.srcObject = null;
    setRunning(false);
  }

  function toggleLock() {
    if (!locked) {
      setLocked(true);
      setSidebarOpen(false);
      if (running) onStop();
    } else {
      setLocked(false);
      setSidebarOpen(true);
      if (ready && !running) {
        void onStart();
      }
    }
  }

  function preview(m: UIMode) {
    if (locked) return;
    forceMode(m);
  }

  /** -------------------------------------------------------------- */
  /** LLM clarify + deep dive helpers                                */
  /** -------------------------------------------------------------- */

  async function ensureParagraphClarifications() {
    if (paragraphClarifications) return;

    setParagraphClarifyLoading(true);
    setParagraphClarifyError(null);
    try {
      const prompt = buildParagraphClarifyPrompt();
      const answer = await askLLM(prompt);
      const clarifications = parseClarificationsFromResponse(
        answer,
        ARTICLE_PARAGRAPHS_TEXT.length
      );
      setParagraphClarifications(clarifications);
    } catch (e: any) {
      setParagraphClarifyError(
        typeof e?.message === 'string'
          ? e.message
          : 'Something went wrong while asking the AI helper.'
      );
    } finally {
      setParagraphClarifyLoading(false);
    }
  }

  async function ensureDeepLinks() {
    if (deepLinks) return;

    setDeepLinksLoading(true);
    setDeepLinksError(null);
    try {
      const prompt = buildDeepDivePrompt();
      const answer = await askLLM(prompt);
      const parsed = parseDeepLinksFromResponse(
        answer,
        ARTICLE_PARAGRAPHS_TEXT.length
      );
      setDeepLinks(parsed);
    } catch (e: any) {
      setDeepLinksError(
        typeof e?.message === 'string'
          ? e.message
          : 'Something went wrong while asking the AI for links.'
      );
    } finally {
      setDeepLinksLoading(false);
    }
  }

  function getCurrentParagraphIndex(): number | null {
    const refs = paragraphRefs.current;
    if (!refs.length) return null;

    const viewportMid = window.innerHeight / 2;
    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;

    refs.forEach((el, idx) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const paraMid = rect.top + rect.height / 2;
      const dist = Math.abs(paraMid - viewportMid);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
      }
    });

    return bestIdx;
  }

  function handleMainClarifyClick() {
    if (uiMode !== 'confused') return;
    const idx = getCurrentParagraphIndex();
    if (idx === null) return;
    setActiveParagraphIndex(idx);
    void ensureParagraphClarifications();
  }

  function handleDeepDiveClick() {
    if (uiMode !== 'happy') return;
    const idx = getCurrentParagraphIndex();
    if (idx === null) return;
    setActiveDeepParagraphIndex(idx);
    void ensureDeepLinks();
  }

  /** ---------------------------------------------------------------- */
  /** Render                                                           */
  /** ---------------------------------------------------------------- */

  return (
    <>
      {uiMode === 'confused' && (
        <div className="progress-bar" style={{ width: `${progress}%` }} />
      )}

      <div className={`app theme-${uiMode} ${locked ? 'locked' : ''}`}>
        <header className="chrome">
          <div className="chrome-top">
            <div className="brand">Emotion-Responsive Reader</div>
            <div className="spacer" />
            <div className="controls">
              <button disabled={!ready || running} onClick={onStart}>
                {ready ? 'Start Detection' : 'Loading models…'}
              </button>
              <button disabled={!running} onClick={onStop}>
                Stop
              </button>
            </div>
          </div>

          <div className="toolbar">
            <div className="toolbar-left">
              <span className="tag">Mode:</span>
              <b className="mode">{uiMode}</b>

              <button onClick={toggleLock}>
                {locked ? 'Unlock UI' : 'Lock UI'}
              </button>

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
              <button onClick={() => setSidebarOpen((s) => !s)}>
                {sidebarOpen ? 'Hide Side Panel' : 'Show Side Panel'}
              </button>
            </div>
          </div>
        </header>

        <main
          className={`layout ${
            sidebarOpen ? 'layout--with-sidebar' : 'layout--no-sidebar'
          }`}
        >
          <article className="reader" id="reader">
            <h1>Understanding Modern Cryptography: A Deep Dive into Digital Security</h1>

            <p ref={registerParagraphRef(0)}>
              Modern cryptography is built on the idea that certain mathematical problems
              are computationally expensive to solve. The security of systems like{' '}
              <HotspotSpan
                id="hs-crypto-1"
                term="RSA encryption"
                onHover={setHoveredHotspot}
              />{' '}
              and{' '}
              <HotspotSpan
                id="hs-crypto-2"
                term="Elliptic Curve Cryptography"
                onHover={setHoveredHotspot}
              />{' '}
              depends on how difficult it is to reverse a function without a secret key.
              These systems rely on assumptions like the{' '}
              <HotspotSpan
                id="hs-crypto-3"
                term="prime factorization problem"
                onHover={setHoveredHotspot}
              />{' '}
              being computationally intractable.
            </p>

            <p ref={registerParagraphRef(1)}>
              At the heart of secure digital communication lies the concept of a{' '}
              <HotspotSpan
                id="hs-crypto-4"
                term="one-way function"
                onHover={setHoveredHotspot}
              />
              , which is easy to compute but hard to invert. For example, multiplying two
              large primes is easy, but deriving those primes back from the product is
              extremely difficult. This is known as{' '}
              <HotspotSpan
                id="hs-crypto-5"
                term="computational asymmetry"
                onHover={setHoveredHotspot}
              />
              , a foundational idea in cryptography.
            </p>

            <p ref={registerParagraphRef(2)}>
              Another important idea is{' '}
              <HotspotSpan
                id="hs-crypto-6"
                term="public key infrastructure"
                onHover={setHoveredHotspot}
              />
              , a system that helps verify identities online. Websites use it when they
              present you with a certificate proving they are who they claim to be. These
              certificates depend on{' '}
              <HotspotSpan
                id="hs-crypto-7"
                term="certificate authorities"
                onHover={setHoveredHotspot}
              />
              , which act as trusted third parties.
            </p>

            <p ref={registerParagraphRef(3)}>
              However, not all cryptographic tools provide the same type of protection. For
              example,{' '}
              <HotspotSpan
                id="hs-crypto-8"
                term="hash functions"
                onHover={setHoveredHotspot}
              />{' '}
              are used for verifying integrity rather than confidentiality. A good hash
              function has the property of{' '}
              <HotspotSpan
                id="hs-crypto-9"
                term="collision resistance"
                onHover={setHoveredHotspot}
              />
              , meaning it is extremely unlikely for two different inputs to produce the
              same hash. Achieving collision resistance requires careful design and
              mathematical rigor.
            </p>

            <p ref={registerParagraphRef(4)}>
              As computing power increases, especially with the rise of{' '}
              <HotspotSpan
                id="hs-crypto-10"
                term="quantum algorithms"
                onHover={setHoveredHotspot}
              />
              , traditional systems may become vulnerable. For example,{' '}
              <HotspotSpan
                id="hs-crypto-11"
                term="Shor’s algorithm"
                onHover={setHoveredHotspot}
              />{' '}
              can theoretically break RSA by factoring large numbers efficiently on a
              quantum computer. This has led to the development of{' '}
              <HotspotSpan
                id="hs-crypto-12"
                term="post-quantum cryptography"
                onHover={setHoveredHotspot}
              />
              , which focuses on designing systems resistant to quantum attacks.
            </p>

            <p ref={registerParagraphRef(5)}>
              A particularly challenging area is{' '}
              <HotspotSpan
                id="hs-crypto-13"
                term="zero-knowledge proofs"
                onHover={setHoveredHotspot}
              />
              , which allow one party to prove they know something without revealing the
              information itself. This idea powers privacy-focused systems such as
              anonymous credentials and cryptocurrency protocols. One widely used system is
              the{' '}
              <HotspotSpan
                id="hs-crypto-14"
                term="zk-SNARK"
                onHover={setHoveredHotspot}
              />
              , which enables efficient verification of complex statements.
            </p>

            <p ref={registerParagraphRef(6)}>
              Despite their usefulness, zero-knowledge systems can be fragile. They require
              precise implementation to avoid vulnerabilities. A mistake in the{' '}
              <HotspotSpan
                id="hs-crypto-15"
                term="trusted setup ceremony"
                onHover={setHoveredHotspot}
              />{' '}
              can compromise the entire system. This is why researchers invest heavily in
              audits and formal verification.
            </p>

            <p ref={registerParagraphRef(7)}>
              The field continues to evolve rapidly. New approaches such as{' '}
              <HotspotSpan
                id="hs-crypto-16"
                term="homomorphic encryption"
                onHover={setHoveredHotspot}
              />{' '}
              allow computations to be performed on encrypted data without needing to
              decrypt it first — a breakthrough for secure cloud computing. Another
              emerging idea is{' '}
              <HotspotSpan
                id="hs-crypto-17"
                term="secure multi-party computation"
                onHover={setHoveredHotspot}
              />
              , enabling multiple parties to collaborate on a computation without revealing
              their private inputs.
            </p>

            <p ref={registerParagraphRef(8)}>
              Modern cryptography is not just about mathematics. Human factors also matter
              significantly. Many real-world attacks exploit weaknesses in{' '}
              <HotspotSpan
                id="hs-crypto-18"
                term="key management"
                onHover={setHoveredHotspot}
              />{' '}
              or poor implementation practices. Even the strongest encryption fails if a
              private key is stored insecurely.
            </p>

            <p ref={registerParagraphRef(9)}>
              Understanding these concepts requires substantial effort. But by mastering
              the building blocks — from{' '}
              <HotspotSpan id="hs-crypto-1" term="RSA" onHover={setHoveredHotspot} /> to{' '}
              <HotspotSpan
                id="hs-crypto-16"
                term="homomorphic encryption"
                onHover={setHoveredHotspot}
              />
              — one gains a deeper appreciation of how digital security is achieved in the
              modern world.
            </p>
          </article>

          {sidebarOpen && (
            <aside className="sidebar">
              {hud && (
                <div className="hud">
                  <div className="row">
                    <span>Emotion</span>
                    <b>{hud.label}</b>
                    {/* <span>Conf:</span>
                    <b>{hud.conf.toFixed(2)}</b> */}
                  </div>
                  {/* <div className="bars">
                    {(['happy', 'focused', 'confused', 'frustrated'] as const).map(
                      (k) => (
                        <div key={k} className="bar">
                          <span className="k">{k}</span>
                          <div className="track">
                            <div
                              className="fill"
                              style={{
                                width: `${Math.round(
                                  ((hud.scores as any)[k] || 0) * 100
                                )}%`,
                              }}
                            />
                          </div>
                          <span className="v">
                            {((hud.scores as any)[k] || 0).toFixed(2)}
                          </span>
                        </div>
                      )
                    )}
                  </div> */}
                </div>
              )}

              <div className="camera">
                <video ref={videoRef} playsInline muted />
              </div>
            </aside>
          )}
        </main>

        <HintChip
          visible={!locked && uiMode === 'confused' && !!hoveredHotspot}
          targetId={hoveredHotspot ?? undefined}
          text={useMemo(() => {
            const hs = HOTSPOTS.find((h) => h.id === hoveredHotspot);
            return hs ? `${hs.term}: ${hs.hint}` : '';
          }, [hoveredHotspot])}
        />

        {/* BUTTONS + OVERLAYS in one portal so they stay fixed */}
        {typeof document !== 'undefined' &&
          createPortal(
            <>
              {/* Confused → clarify */}
              {uiMode === 'confused' && (
                <button className="clarify-main-btn" onClick={handleMainClarifyClick}>
                  🤔 Clarify?
                </button>
              )}

              {uiMode === 'confused' && activeParagraphIndex !== null && (
                <ClarifyOverlay
                  paragraphIndex={activeParagraphIndex}
                  loading={paragraphClarifyLoading}
                  error={paragraphClarifyError}
                  clarification={
                    paragraphClarifications
                      ? paragraphClarifications[activeParagraphIndex] ||
                        'No AI clarification available for this paragraph.'
                      : ''
                  }
                  onClose={() => setActiveParagraphIndex(null)}
                />
              )}

              {/* Happy → dive deeper */}
              {uiMode === 'happy' && (
                <button className="deep-main-btn" onClick={handleDeepDiveClick}>
                 📚 Dive deeper?
                </button>
              )}

              {uiMode === 'happy' && activeDeepParagraphIndex !== null && (
                <DeepDiveOverlay
                  paragraphIndex={activeDeepParagraphIndex}
                  links={
                    deepLinks
                      ? deepLinks[activeDeepParagraphIndex] ?? []
                      : []
                  }
                  loading={deepLinksLoading}
                  error={deepLinksError}
                  onClose={() => setActiveDeepParagraphIndex(null)}
                />
              )}
            </>,
            document.body
          )}
      </div>
    </>
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
  const [style, setStyle] = useState<CSSProperties>({});

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

function ClarifyOverlay({
  paragraphIndex,
  clarification,
  loading,
  error,
  onClose,
}: {
  paragraphIndex: number;
  clarification: string;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <div className="clarify-overlay">
      <div className="clarify-overlay-panel">
        <div className="clarify-overlay-header">
          <div>
            <div className="clarify-overlay-title">
              ❓Help
            </div>
            {/* <div className="clarify-overlay-subtitle">
              AI helper (confused mode)
            </div> */}
          </div>
          <button className="clarify-overlay-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="clarify-overlay-body">
          {loading ? (
            <p>Summarising this paragraph in simpler language…</p>
          ) : error ? (
            <p className="clarify-error">Error: {error}</p>
          ) : clarification ? (
            <p>{clarification}</p>
          ) : (
            <p>No AI clarification available for this paragraph.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function DeepDiveOverlay({
  paragraphIndex,
  links,
  loading,
  error,
  onClose,
}: {
  paragraphIndex: number;
  links: DeepLink[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <div className="clarify-overlay">
      <div className="clarify-overlay-panel">
        <div className="clarify-overlay-header">
          <div>
            <div className="clarify-overlay-title">
              📚 Dive Deeper
            </div>
          </div>
          <button className="clarify-overlay-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="clarify-overlay-body">
          {loading ? (
            <p>Finding extra readings for this topic…</p>
          ) : error ? (
            <p className="clarify-error">Error: {error}</p>
          ) : links && links.length > 0 ? (
            <ul className="deep-links-list">
              {links.map((link, i) => (
                <li key={i} className="deep-link-item">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="deep-link-title"
                  >
                    {link.title}
                  </a>
                  {link.blurb && (
                    <p className="deep-link-blurb">{link.blurb}</p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>No extra readings available for this paragraph.</p>
          )}
        </div>
      </div>
    </div>
  );
}
