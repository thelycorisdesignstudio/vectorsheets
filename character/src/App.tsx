import { useCallback, useMemo, useState } from 'react';
import { AlienCharacter, PALETTES, type AnimationState } from './alien';
import { Stage, type CameraView } from './scene/Stage';
import { ControlPanel, StateBar, type Settings } from './ui/ControlPanel';
import { defaultQuality, hasWebGL } from './lib/webgl';

const BACKDROP = '#f4f0e6';

function readParams() {
  const q = new URLSearchParams(location.search);
  return {
    presentation: q.has('present'),
    view: (q.get('view') as CameraView) || 'three-quarter',
    state: (q.get('state') as AnimationState) || 'idle',
    still: q.has('still'),
  };
}

export default function App() {
  const params = useMemo(readParams, []);
  const [webgl] = useState(hasWebGL);
  const [quality] = useState(defaultQuality);
  const [presentation, setPresentation] = useState(params.presentation);
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth > 900);
  const [paused, setPaused] = useState(false);
  const [state, setState] = useState<AnimationState>(params.state);
  const [view, setView] = useState<CameraView>(params.view);
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => {
    const q = new URLSearchParams(location.search);
    return {
      palette: (q.get('palette') as Settings['palette']) || 'grape',
      eyeShape: (q.get('eyes') as Settings['eyeShape']) || 'oval',
      browShape: (q.get('brows') as Settings['browShape']) || 'pill',
      head: (q.get('head') as Settings['head']) || 'puck',
      ears: (q.get('ears') as Settings['ears']) || 'none',
      crown: (q.get('crown') as Settings['crown']) || 'fronds',
      accessories: q.get('acc') != null ? (q.get('acc')!.split(',').filter(Boolean) as Settings['accessories']) : ['collar'],
      style: 'playful',
      expression: (q.get('expr') as Settings['expression']) || 'auto',
      blinking: !params.still,
      tracking: !params.still,
      orbit: true,
    };
  });
  const set = useCallback(<K extends keyof Settings>(k: K, v: Settings[K]) => setSettings((s) => ({ ...s, [k]: v })), []);
  const palette = PALETTES[settings.palette];

  if (!webgl) {
    return (
      <main className="fallback">
        <div className="fallback-card">
          <div className="fallback-blob" style={{ background: `linear-gradient(170deg, ${palette.tip}, ${palette.base} 40%, ${palette.baseLow})` }}>
            <span className="fb-eye" />
            <span className="fb-eye" />
          </div>
          <h1>Oru needs WebGL</h1>
          <p>Your browser or device has 3D graphics turned off. Try a recent version of Chrome, Safari, Firefox or Edge with hardware acceleration enabled.</p>
        </div>
      </main>
    );
  }

  return (
    <main className={`app ${presentation ? 'presenting' : ''}`}>
      <div className="viewport">
        <Stage view={view} orbit={settings.orbit} background={BACKDROP}>
          <AlienCharacter
            animation={state}
            expression={settings.expression === 'auto' ? undefined : settings.expression}
            palette={settings.palette}
            eyeShape={settings.eyeShape}
            browShape={settings.browShape}
            head={settings.head}
            ears={settings.ears}
            crown={settings.crown}
            accessories={settings.accessories}
            animationStyle={settings.style}
            quality={quality}
            enableBlinking={settings.blinking}
            trackPointer={settings.tracking}
            greetOnMount={!params.still}
            paused={paused}
            restAfter={presentation ? 45 : 0}
            interactive
            shadowColor="#a07a70"
            onAnimationChange={setState}
            onReady={() => setReady(true)}
          />
        </Stage>
        {!ready && <div className="loading">Sculpting…</div>}
      </div>

      <header className="brand">
        <h1>Oru</h1>
        <p>A small, curious companion from somewhere else.</p>
      </header>

      <div className="top-actions">
        <button className="ghost" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button className="ghost" onClick={() => setPresentation((p) => !p)} aria-pressed={presentation}>
          {presentation ? 'Exit presentation' : 'Present'}
        </button>
        {!presentation && (
          <button className="ghost" onClick={() => setPanelOpen((o) => !o)} aria-expanded={panelOpen}>
            {panelOpen ? 'Close' : 'Customise'}
          </button>
        )}
      </div>

      {!presentation && <StateBar state={state} onPlay={(s) => setState(s)} />}

      {!presentation && panelOpen && (
        <aside className="panel">
          <ControlPanel settings={settings} set={set} view={view} setView={setView} />
        </aside>
      )}
      {!presentation && <p className="hint">Tap Oru · move your cursor · drag to turn</p>}
    </main>
  );
}
