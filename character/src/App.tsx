import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { AlienCharacter, PALETTES } from './alien';
import { Stage, type CameraView } from './scene/Stage';
import { ConversationDock } from './ui/ConversationDock';
import { Diagnostics } from './ui/Diagnostics';
import { StudioPanel, type AnimSettings, type Appearance } from './ui/StudioPanel';
import { defaultQuality, hasWebGL } from './lib/webgl';
import { createPlatform, type Platform } from './platform/createPlatform';
import { ORU_PROFILE } from './embodiment/profile';
import { ErrorBoundary } from './ui/ErrorBoundary';

function readParams() {
  const q = new URLSearchParams(location.search);
  return {
    present: q.has('present'),
    studio: q.has('dev') || q.has('studio'),
    view: (q.get('view') as CameraView) || 'hero',
    still: q.has('still'),
    q,
  };
}

/** Drives the embodiment controller from the render loop (one loop for everything). */
function EmbodimentTicker({ platform, paused }: { platform: Platform; paused: boolean }) {
  useFrame((_, dt) => {
    if (!paused && !document.hidden) platform.embodiment.update(Math.min(dt, 1 / 20));
  });
  return null;
}

export default function App() {
  const params = useMemo(readParams, []);
  const [webgl] = useState(hasWebGL);
  const [quality] = useState(defaultQuality);
  const platform = useMemo(() => createPlatform(ORU_PROFILE), []);
  const [presentation, setPresentation] = useState(params.present);
  const [studio, setStudio] = useState(params.studio && !params.present);
  const [paused, setPaused] = useState(false);
  const [view, setView] = useState<CameraView>(params.view);
  const [ready, setReady] = useState(false);
  // The camera leans in while a conversation is under way.
  const [engaged, setEngaged] = useState(false);
  useEffect(
    () => platform.anim.onStateChange((s) => setEngaged(['listening', 'thinking', 'preparing', 'speaking', 'waiting'].includes(s))),
    [platform],
  );
  const [failed, setFailed] = useState<string | null>(null);
  const [appearance, setAppearanceState] = useState<Appearance>(() => {
    const q = params.q;
    const a = ORU_PROFILE.appearance;
    return {
      palette: (q.get('palette') as Appearance['palette']) || a.palette,
      eyeShape: (q.get('eyes') as Appearance['eyeShape']) || a.eyeShape,
      browShape: (q.get('brows') as Appearance['browShape']) || a.browShape,
      head: (q.get('head') as Appearance['head']) || a.head,
      ears: (q.get('ears') as Appearance['ears']) || a.ears,
      crown: (q.get('crown') as Appearance['crown']) || a.crown,
      accessories: q.get('acc') != null ? (q.get('acc')!.split(',').filter(Boolean) as Appearance['accessories']) : a.accessories,
    };
  });
  const [anim, setAnimState] = useState<AnimSettings>(() => ({
    style: ORU_PROFILE.behaviour.animationStyle,
    intensity: ORU_PROFILE.behaviour.movementIntensity,
    gesture: ORU_PROFILE.behaviour.speakingGestureIntensity,
    blinking: !params.still,
    tracking: !params.still,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    expression: (params.q.get('expr') as AnimSettings['expression']) || 'auto',
  }));
  const setAppearance = useCallback(<K extends keyof Appearance>(k: K, v: Appearance[K]) => setAppearanceState((s) => ({ ...s, [k]: v })), []);
  const setAnim = useCallback(<K extends keyof AnimSettings>(k: K, v: AnimSettings[K]) => setAnimState((s) => ({ ...s, [k]: v })), []);
  const settings = useMemo(
    () => ({ style: anim.style, intensity: anim.intensity, gesture: anim.gesture, blinking: anim.blinking, tracking: anim.tracking, reducedMotion: anim.reducedMotion }),
    [anim.style, anim.intensity, anim.gesture, anim.blinking, anim.tracking, anim.reducedMotion],
  );
  const unlocked = useRef(false);
  const firstGesture = useCallback(() => {
    if (unlocked.current) return;
    unlocked.current = true;
    void platform.audio.unlock();
  }, [platform]);

  useEffect(() => {
    void platform.connect();
    // The platform lives as long as the page (StrictMode remounts must not tear it down).
    const bye = () => platform.dispose();
    window.addEventListener('pagehide', bye);
    return () => window.removeEventListener('pagehide', bye);
  }, [platform]);

  useEffect(() => {
    if (ready && ORU_PROFILE.behaviour.greeting.onLoad && !params.still) platform.conversation.greet();
  }, [ready, platform, params.still]);

  // Activity keeps the character awake; throttled to a few calls a second.
  useEffect(() => {
    let last = 0;
    const onAct = () => {
      const now = performance.now();
      if (now - last < 250) return;
      last = now;
      platform.embodiment.noteActivity();
    };
    window.addEventListener('pointermove', onAct, { passive: true });
    window.addEventListener('keydown', onAct);
    return () => {
      window.removeEventListener('pointermove', onAct);
      window.removeEventListener('keydown', onAct);
    };
  }, [platform]);

  // Keyboard: "d" toggles the studio (not in presentation mode).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'd' && !presentation) setStudio((s) => !s);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presentation]);

  const palette = PALETTES[appearance.palette];

  if (!webgl) {
    return (
      <main className="fallback">
        <div className="fallback-card">
          <div className="fallback-blob" style={{ background: `linear-gradient(170deg, ${palette.tip}, ${palette.base} 40%, ${palette.baseLow})` }}>
            <span className="fb-eye" />
            <span className="fb-eye" />
          </div>
          <h1>{ORU_PROFILE.name} needs 3D graphics</h1>
          <p>Your browser or device has WebGL turned off. Try a recent version of Chrome, Safari, Firefox or Edge with hardware acceleration enabled.</p>
        </div>
      </main>
    );
  }

  return (
    <main className={`app ${presentation ? 'presenting' : ''} ${studio ? 'with-studio' : ''}`}>
      <div className="viewport">
        <Stage view={view} orbit={!presentation || studio} focus={engaged && !anim.reducedMotion ? 1 : 0}>
          <AlienCharacter
            controller={platform.anim}
            expression={anim.expression === 'auto' ? undefined : anim.expression}
            {...appearance}
            quality={quality}
            settings={settings}
            paused={paused}
            interactive
            shadowColor="#a07a70"
            onTouch={(zone, side) => {
              firstGesture();
              platform.embodiment.dispatch({ type: 'USER_TOUCHED', zone, side });
            }}
            onReady={() => setReady(true)}
            onError={(e) => setFailed(e instanceof Error ? e.message : 'The character could not be built.')}
          />
          <EmbodimentTicker platform={platform} paused={paused} />
        </Stage>
        {!ready && !failed && <div className="loading">Waking {ORU_PROFILE.name}…</div>}
        {failed && <div className="loading error">Something went wrong: {failed}</div>}
      </div>

      <header className="brand">
        <h1>{ORU_PROFILE.name}</h1>
        <p>{ORU_PROFILE.tagline}</p>
      </header>

      <div className="top-actions">
        {!presentation && (
          <button className="ghost" onClick={() => setStudio((s) => !s)} aria-pressed={studio}>
            {studio ? 'Close studio' : 'Studio'}
          </button>
        )}
        <button className="ghost" onClick={() => setPresentation((p) => !p)} aria-pressed={presentation}>
          {presentation ? 'Exit presentation' : 'Present'}
        </button>
      </div>

      {!params.still && (
        <ErrorBoundary label="conversation">
          <ConversationDock conversation={platform.conversation} name={ORU_PROFILE.name} onFirstGesture={firstGesture} />
        </ErrorBoundary>
      )}

      {studio && !presentation && (
        <ErrorBoundary label="studio">
          <aside className="panel">
            <StudioPanel
              platform={platform}
              appearance={appearance}
              setAppearance={setAppearance}
              anim={anim}
              setAnim={setAnim}
              view={view}
              setView={setView}
              paused={paused}
              setPaused={setPaused}
            />
          </aside>
          <Diagnostics platform={platform} />
        </ErrorBoundary>
      )}
    </main>
  );
}
