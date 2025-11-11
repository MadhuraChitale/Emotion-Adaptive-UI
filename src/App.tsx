// import { useEffect, useRef, useState } from 'react';
// import { applyAdaptation } from './adaptation';
// import { loadModels, startCamera, loop } from './emotionEngine';
// import type { HUD } from './emotionEngine';
// import './index.css';

// function DebugHUD({ hud }: { hud: HUD | null }) {
//   if (!hud) return null;
//   return (
//     <div className="hud">
//       <div><b>Emotion:</b> {hud.label}</div>
//       <div><b>Conf:</b> {hud.conf.toFixed(2)} {hud.cooling > 0 ? `(cooldown ${Math.ceil(hud.cooling/1000)}s)` : ''}</div>
//       <hr />
//       <div className="scores">
//         {Object.entries(hud.scores).map(([k,v]) => (
//           <div key={k}>{k}: {(v as number).toFixed(2)}</div>
//         ))}
//       </div>
//     </div>
//   );
// }

// function TaskArea() {
//   return (
//     <div className="task">
//       <h2 data-highlight>Configure Your Profile</h2>
//       <div className="row">
//         <label>Username</label>
//         <input placeholder="Pick a unique name" />
//       </div>
//       <div className="row">
//         <label>Email</label>
//         <input placeholder="you@example.com" />
//       </div>
//       <div className="row">
//         <label>Notifications</label>
//         <select>
//           <option>Important Only</option>
//           <option>All</option>
//           <option>None</option>
//         </select>
//       </div>
//       <div className="inline-tip" data-show-inline-tip>
//         Tip: Your username must be 6–12 chars, start with a letter.
//       </div>
//       <button className="primary">Save</button>
//       <button className="hint" data-show-hint>Show Hint</button>
//       <div className="guided" data-show-guided>
//         <p>Guided step: Fill username, then email, then choose notifications.</p>
//       </div>
//     </div>
//   );
// }

// export default function App() {
//   const videoRef = useRef<HTMLVideoElement>(null);
//   const [hud, setHud] = useState<HUD|null>(null);

//   // useEffect(() => {
//   //   (async () => {
//   //     await loadModels('/models');         // loads 2 models only
//   //     applyAdaptation('focused');          // default UI
//   //     if (videoRef.current) {
//   //       await startCamera(videoRef.current); // auto-start camera
//   //       await loop(videoRef.current, setHud);// start detection
//   //     }
//   //   })();
//   // }, []);

//   useEffect(() => {
//   (async () => {
//     await loadModels('/models');
//     applyAdaptation('focused');
//     if (videoRef.current) {
//       await startCamera(videoRef.current);     // start stream
//       await loop(videoRef.current, setHud);    // start detection
//     }
//   })();
//   }, []);

//   return (
//     <div className="app">
//       <header>
//         <h1>Emotion-Responsive UI</h1>
//       </header>

//       <main>
//         <section className="left">
//           <video
//             ref={videoRef}
//             autoPlay
//             muted
//             playsInline
//             className="video"
//           />
//           <DebugHUD hud={hud} />
//           <p className="privacy">All processing stays in your browser. No video is uploaded.</p>
//         </section>
//         <section className="right">
//           <TaskArea />
//         </section>
//       </main>
//     </div>
//   );
// }

// App.tsx — simple UI to load models, start camera, and show live HUD
import { useEffect, useRef, useState } from 'react';
import './App.css';
import { loadModels, startCamera, loop, stop, resetWindow } from './emotionEngine';
import type { HUD } from './emotionEngine';

function useToggle(initial=false) {
  const [v,setv] = useState(initial);
  return { v, on:()=>setv(true), off:()=>setv(false), set:setv };
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [hud, setHud] = useState<HUD| null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await loadModels('/models'); // ensure models are available here
        setReady(true);
      } catch (e:any) {
        setErr(`Model load failed: ${e?.message || e}`);
      }
    })();
  }, []);

  async function onStart() {
    if (!videoRef.current) return;
    setErr(null);
    try {
      await startCamera(videoRef.current);
      resetWindow();
      await loop(videoRef.current, setHud);
      setRunning(true);
    } catch (e:any) {
      setErr(`Camera start failed: ${e?.message || e}`);
    }
  }

  function onStop() {
    stop();
    const v = videoRef.current;
    const stream = (v?.srcObject as MediaStream | null);
    stream?.getTracks().forEach(t => t.stop());
    if (v) v.srcObject = null;
    setRunning(false);
  }

  const s = hud?.scores || {};
  const geom = hud?.geom || {};

  return (
    <div className="app">
      <header>
        <h1>Emotion Detection (HCI Demo – detection only)</h1>
      </header>

      <section className="controls">
        <button disabled={!ready || running} onClick={onStart}>
          {ready ? 'Start Detection' : 'Loading models…'}
        </button>
        <button disabled={!running} onClick={onStop}>Stop</button>
        {err && <div className="error">{err}</div>}
      </section>

      <section className="video-pane">
        <video ref={videoRef} playsInline muted className="video"></video>
      </section>

      <section className="hud">
        <div className="pill">
          <div className="pill-row">
            <span className="label">Label:</span>
            <span className="value">{hud?.label ?? '—'}</span>
            <span className="label small">conf</span>
            <span className="value small">{hud ? hud.conf.toFixed(2) : '—'}</span>
            <span className="label small">cooling</span>
            <span className="value small">{hud ? Math.ceil((hud.cooling||0)/1000)+'s' : '0s'}</span>
          </div>
          <div className="bar-group">
            {(['happy','focused','confused','frustrated'] as const).map(k => (
              <div key={k} className="bar-row">
                <div className="bar-label">{k}</div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${Math.round(((s as any)[k]||0)*100)}%`}}
                  />
                </div>
                <div className="bar-val">{((s as any)[k]||0).toFixed(2)}</div>
              </div>
            ))}
          </div>

          <div className="geom">
            <div>furrowN: <b>{geom.furrowN?.toFixed(2) ?? '—'}</b></div>
            <div>squintN: <b>{geom.squintN?.toFixed(2) ?? '—'}</b></div>
            <div>mouthOpenN: <b>{geom.mouthOpenN?.toFixed(2) ?? '—'}</b></div>
            <div>cornerDropN: <b>{geom.cornerDropN?.toFixed(2) ?? '—'}</b></div>
          </div>
        </div>
      </section>

      <footer>
        <p>Tip: squint/furrow should raise <b>confused</b>; corners down should raise <b>frustrated</b>.</p>
      </footer>
    </div>
  );
}

