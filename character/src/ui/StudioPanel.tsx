import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  BEHAVIOURS, BROW_LABELS, EXPRESSION_LABELS, EYE_SHAPES, PALETTES, REACTIONS, STATES, STATE_ORDER, ANIMATION_STYLES,
  textToTimeline,
  type Accessory, type AnimationStyle, type Behaviour, type BrowShape, type CrownFeature, type EarStyle,
  type ExpressionName, type EyeShape, type HeadShape, type PaletteName, type ReactionKind,
} from '../alien';
import type { EmbodimentEvent } from '../embodiment/events';
import type { Platform } from '../platform/createPlatform';
import type { CameraView } from '../scene/Stage';

export interface Appearance {
  kind?: 'alien' | 'human';
  figure?: 'lady' | 'man';
  palette: PaletteName;
  eyeShape: EyeShape;
  browShape: BrowShape;
  head: HeadShape;
  ears: EarStyle;
  crown: CrownFeature;
  accessories: Accessory[];
}

export interface AnimSettings {
  style: AnimationStyle;
  intensity: number;
  gesture: number;
  blinking: boolean;
  tracking: boolean;
  reducedMotion: boolean;
  expression: ExpressionName | 'auto';
}

const HEADS: Record<HeadShape, string> = { puck: 'Puck', pebble: 'Pebble', bun: 'Bun' };
const CROWNS: Record<CrownFeature, string> = { fronds: 'Fronds', buds: 'Buds', antennae: 'Antennae', ears: 'Ears', sprout: 'Sprout' };
const EARS: Record<EarStyle, string> = { none: 'None', nubs: 'Nubs', fins: 'Fins' };
const ACCESSORIES: Record<Accessory, string> = { collar: 'Collar', spectacles: 'Spectacles', bloom: 'Bloom' };
const VIEWS: Record<CameraView, string> = { hero: 'Hero', 'three-quarter': '¾', front: 'Front', side: 'Side', back: 'Back', close: 'Close' };
const EVENTS: EmbodimentEvent['type'][] = [
  'CHARACTER_GREETING', 'USER_STARTED_SPEAKING', 'USER_FINISHED_SPEAKING', 'AI_STARTED_THINKING',
  'AI_STARTED_SPEAKING', 'AI_FINISHED_SPEAKING', 'USER_INTERRUPTED', 'CONVERSATION_ENDED',
];

function Chips<T extends string>({ value, options, onChange }: { value?: T; options: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {(Object.keys(options) as T[]).map((k) => (
        <button key={k} className={k === value ? 'on' : ''} onClick={() => onChange(k)}>
          {options[k]}
        </button>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

const labels = <T extends string>(rec: Record<T, { label: string }>) =>
  Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, (v as { label: string }).label])) as Record<T, string>;

/** Gaze tester: drag inside the pad to aim the eyes. */
function GazePad({ platform }: { platform: Platform }) {
  const [on, setOn] = useState(false);
  const pad = useRef<HTMLDivElement>(null);
  const [dot, setDot] = useState({ x: 0.5, y: 0.5 });
  useEffect(() => () => platform.anim.configure({ gazeOverride: null }), [platform]);
  const aim = (cx: number, cy: number) => {
    const r = pad.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (cx - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (cy - r.top) / r.height));
    setDot({ x, y });
    platform.anim.configure({ gazeOverride: { yaw: (x - 0.5) * 1.4, pitch: (y - 0.5) * 0.9 } });
  };
  return (
    <div className="gaze">
      <label className="check">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            setOn(e.target.checked);
            platform.anim.configure({ gazeOverride: e.target.checked ? { yaw: 0, pitch: 0 } : null });
            setDot({ x: 0.5, y: 0.5 });
          }}
        />
        Manual gaze
      </label>
      <div
        ref={pad}
        className={`pad ${on ? '' : 'off'}`}
        onPointerDown={(e) => on && (e.currentTarget.setPointerCapture(e.pointerId), aim(e.clientX, e.clientY))}
        onPointerMove={(e) => on && e.buttons && aim(e.clientX, e.clientY)}
      >
        <span style={{ left: `${dot.x * 100}%`, top: `${dot.y * 100}%` }} />
      </div>
    </div>
  );
}

function SpeechTester({ platform }: { platform: Platform }) {
  const [text, setText] = useState('Hello! I can line my mouth up with speech timing, word by word.');
  const visemes = textToTimeline(text).cues.slice(0, 28).map((c) => c.viseme).join(' ');
  const simulate = () => {
    const anim = platform.anim;
    const tl = textToTimeline(text);
    platform.embodiment.dispatch({ type: 'AI_STARTED_SPEAKING' });
    anim.speech.begin({ timeline: tl, exactTiming: false });
    setTimeout(() => platform.embodiment.dispatch({ type: 'AI_FINISHED_SPEAKING' }), tl.duration * 1000);
  };
  const amplitude = () => {
    // Synthetic syllabic loudness: tests the amplitude-driven path without audio.
    const t0 = performance.now();
    platform.embodiment.dispatch({ type: 'AI_STARTED_SPEAKING' });
    platform.anim.speech.begin({
      amplitude: () => {
        const t = (performance.now() - t0) / 1000;
        return Math.max(0, Math.sin(t * 2 * Math.PI * 4.2)) * (0.6 + 0.4 * Math.sin(t * 1.3)) * (t % 2.2 < 1.8 ? 1 : 0);
      },
      clock: () => null,
    });
    setTimeout(() => platform.embodiment.dispatch({ type: 'AI_FINISHED_SPEAKING' }), 4000);
  };
  return (
    <>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} />
      <p className="mono">{visemes}…</p>
      <div className="seg">
        <button onClick={simulate}>Lip-sync (estimated)</button>
        <button onClick={amplitude}>Amplitude test</button>
        <button onClick={() => void platform.conversation.say(text, 'attentive')}>Speak via voice</button>
      </div>
    </>
  );
}

export function StudioPanel({ platform, appearance, setAppearance, anim, setAnim, view, setView, paused, setPaused }: {
  platform: Platform;
  appearance: Appearance;
  setAppearance: <K extends keyof Appearance>(k: K, v: Appearance[K]) => void;
  anim: AnimSettings;
  setAnim: <K extends keyof AnimSettings>(k: K, v: AnimSettings[K]) => void;
  view: CameraView;
  setView: (v: CameraView) => void;
  paused: boolean;
  setPaused: (p: boolean) => void;
}) {
  const [tab, setTab] = useState<'animate' | 'speech' | 'look'>('animate');
  const [state, setState] = useState(platform.anim.state);
  const [behaviour, setBehaviour] = useState<Behaviour>(platform.anim.behaviour);
  useEffect(() => platform.anim.onStateChange((s) => setState(s)), [platform]);
  const exprOptions = { auto: 'Auto', ...EXPRESSION_LABELS } as Record<ExpressionName | 'auto', string>;
  return (
    <div className="panel-body">
      <div className="tabs" role="tablist">
        {(['animate', 'speech', 'look'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {t === 'animate' ? 'Animate' : t === 'speech' ? 'Speech & events' : 'Appearance'}
          </button>
        ))}
      </div>
      {tab === 'animate' && (
        <>
          <Section title="State">
            <Chips value={state} options={labels(STATES)} onChange={(s) => platform.anim.request(s, { force: true, reason: 'studio' })} />
          </Section>
          <Section title="Reaction">
            <Chips<ReactionKind> options={labels(REACTIONS)} onChange={(r) => platform.anim.react(r)} />
          </Section>
          <Section title="Behaviour">
            <Chips<Behaviour>
              value={behaviour}
              options={labels(BEHAVIOURS)}
              onChange={(b) => {
                setBehaviour(b);
                platform.embodiment.dispatch({ type: 'SET_BEHAVIOUR', behaviour: b });
              }}
            />
          </Section>
          <Section title="Expression override">
            <Chips value={anim.expression} options={exprOptions} onChange={(v) => setAnim('expression', v)} />
          </Section>
          <Section title="Motion">
            <Row label="Style">
              <Chips value={anim.style} options={labels(ANIMATION_STYLES)} onChange={(v) => setAnim('style', v)} />
            </Row>
            <Row label="Intensity">
              <input type="range" min={0} max={1.5} step={0.05} value={anim.intensity} onChange={(e) => setAnim('intensity', +e.target.value)} />
            </Row>
            <Row label="Gestures">
              <input type="range" min={0} max={1.5} step={0.05} value={anim.gesture} onChange={(e) => setAnim('gesture', +e.target.value)} />
            </Row>
            <div className="toggles">
              <label><input type="checkbox" checked={anim.blinking} onChange={(e) => setAnim('blinking', e.target.checked)} /> Blinking</label>
              <label><input type="checkbox" checked={anim.tracking} onChange={(e) => setAnim('tracking', e.target.checked)} /> Pointer attention</label>
              <label><input type="checkbox" checked={anim.reducedMotion} onChange={(e) => setAnim('reducedMotion', e.target.checked)} /> Reduced motion</label>
              <label><input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} /> Paused</label>
            </div>
          </Section>
          <Section title="Gaze">
            <GazePad platform={platform} />
          </Section>
        </>
      )}
      {tab === 'speech' && (
        <>
          <Section title="Speech animation">
            <SpeechTester platform={platform} />
          </Section>
          <Section title="Semantic events">
            <div className="seg">
              {EVENTS.map((e) => (
                <button key={e} className="mono-btn" onClick={() => platform.embodiment.dispatch({ type: e } as EmbodimentEvent)}>
                  {e}
                </button>
              ))}
            </div>
          </Section>
        </>
      )}
      {tab === 'look' && (
        <>
          <Section title="Palette">
            <div className="swatches">
              {(Object.keys(PALETTES) as PaletteName[]).filter((k) => !!PALETTES[k].regions === (appearance.kind === 'human')).map((k) => {
                const p = PALETTES[k];
                return (
                  <button
                    key={k}
                    title={p.label}
                    aria-label={p.label}
                    className={`swatch ${k === appearance.palette ? 'on' : ''}`}
                    style={{ background: `linear-gradient(160deg, ${p.tip} 0%, ${p.base} 45%, ${p.baseLow} 80%, ${p.collarA} 80%)` }}
                    onClick={() => setAppearance('palette', k)}
                  />
                );
              })}
            </div>
          </Section>
          <Section title="Anatomy">
            <Row label="Head"><Chips value={appearance.head} options={HEADS} onChange={(v) => setAppearance('head', v)} /></Row>
            <Row label="Crown"><Chips value={appearance.crown} options={CROWNS} onChange={(v) => setAppearance('crown', v)} /></Row>
            <Row label="Ears"><Chips value={appearance.ears} options={EARS} onChange={(v) => setAppearance('ears', v)} /></Row>
          </Section>
          <Section title="Face">
            <Row label="Eyes"><Chips value={appearance.eyeShape} options={labels(EYE_SHAPES)} onChange={(v) => setAppearance('eyeShape', v)} /></Row>
            <Row label="Brows"><Chips value={appearance.browShape} options={BROW_LABELS} onChange={(v) => setAppearance('browShape', v)} /></Row>
          </Section>
          <Section title="Accessories">
            <div className="seg">
              {(Object.keys(ACCESSORIES) as Accessory[]).map((a) => {
                const on = appearance.accessories.includes(a);
                return (
                  <button key={a} className={on ? 'on' : ''} onClick={() => setAppearance('accessories', on ? appearance.accessories.filter((x) => x !== a) : [...appearance.accessories, a])}>
                    {ACCESSORIES[a]}
                  </button>
                );
              })}
            </div>
          </Section>
          <Section title="Camera">
            <Chips value={view} options={VIEWS} onChange={setView} />
          </Section>
        </>
      )}
    </div>
  );
}

export { STATE_ORDER };
