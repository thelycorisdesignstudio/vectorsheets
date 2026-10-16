import type { ReactNode } from 'react';
import {
  BROW_LABELS, EXPRESSION_LABELS, EYE_SHAPES, PALETTES, STATES, STATE_ORDER, ANIMATION_STYLES,
  type Accessory, type AnimationState, type AnimationStyle, type BrowShape, type CrownFeature, type EarStyle,
  type ExpressionName, type EyeShape, type HeadShape, type PaletteName,
} from '../alien';
import type { CameraView } from '../scene/Stage';

export interface Settings {
  palette: PaletteName;
  eyeShape: EyeShape;
  browShape: BrowShape;
  head: HeadShape;
  ears: EarStyle;
  crown: CrownFeature;
  accessories: Accessory[];
  style: AnimationStyle;
  expression: ExpressionName | 'auto';
  blinking: boolean;
  tracking: boolean;
  orbit: boolean;
}

const HEADS: Record<HeadShape, string> = { puck: 'Puck', pebble: 'Pebble', bun: 'Bun' };
const CROWNS: Record<CrownFeature, string> = { fronds: 'Fronds', buds: 'Buds', antennae: 'Antennae', ears: 'Ears', sprout: 'Sprout' };
const EARS: Record<EarStyle, string> = { none: 'None', nubs: 'Nubs', fins: 'Fins' };
const ACCESSORIES: Record<Accessory, string> = { collar: 'Collar', spectacles: 'Spectacles', bloom: 'Bloom' };
const VIEWS: Record<CameraView, string> = { 'three-quarter': '¾', front: 'Front', side: 'Side', back: 'Back', close: 'Close' };

function Row<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      <div className="seg">
        {(Object.keys(options) as T[]).map((k) => (
          <button key={k} className={k === value ? 'on' : ''} onClick={() => onChange(k)}>
            {options[k]}
          </button>
        ))}
      </div>
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

export function StateBar({ state, onPlay }: { state: AnimationState; onPlay: (s: AnimationState) => void }) {
  return (
    <nav className="state-bar" aria-label="Animation state">
      {STATE_ORDER.map((s) => (
        <button key={s} className={s === state ? 'on' : ''} onClick={() => onPlay(s)}>
          {STATES[s].label}
        </button>
      ))}
    </nav>
  );
}

export function ControlPanel({ settings, set, view, setView }: {
  settings: Settings;
  set: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  view: CameraView;
  setView: (v: CameraView) => void;
}) {
  const exprOptions = { auto: 'Auto', ...EXPRESSION_LABELS } as Record<ExpressionName | 'auto', string>;
  return (
    <div className="panel-body">
      <Section title="Palette">
        <div className="swatches">
          {(Object.keys(PALETTES) as PaletteName[]).map((k) => {
            const p = PALETTES[k];
            return (
              <button
                key={k}
                title={p.label}
                aria-label={p.label}
                className={`swatch ${k === settings.palette ? 'on' : ''}`}
                style={{ background: `linear-gradient(160deg, ${p.tip} 0%, ${p.base} 45%, ${p.baseLow} 80%, ${p.collarA} 80%)` }}
                onClick={() => set('palette', k)}
              />
            );
          })}
        </div>
      </Section>
      <Section title="Expression">
        <Row label="" value={settings.expression} options={exprOptions} onChange={(v) => set('expression', v)} />
      </Section>
      <Section title="Anatomy">
        <Row label="Head" value={settings.head} options={HEADS} onChange={(v) => set('head', v)} />
        <Row label="Crown" value={settings.crown} options={CROWNS} onChange={(v) => set('crown', v)} />
        <Row label="Ears" value={settings.ears} options={EARS} onChange={(v) => set('ears', v)} />
      </Section>
      <Section title="Face">
        <Row label="Eyes" value={settings.eyeShape} options={Object.fromEntries(Object.entries(EYE_SHAPES).map(([k, v]) => [k, v.label])) as Record<EyeShape, string>} onChange={(v) => set('eyeShape', v)} />
        <Row label="Brows" value={settings.browShape} options={BROW_LABELS} onChange={(v) => set('browShape', v)} />
      </Section>
      <Section title="Accessories">
        <div className="seg">
          {(Object.keys(ACCESSORIES) as Accessory[]).map((a) => {
            const on = settings.accessories.includes(a);
            return (
              <button key={a} className={on ? 'on' : ''} onClick={() => set('accessories', on ? settings.accessories.filter((x) => x !== a) : [...settings.accessories, a])}>
                {ACCESSORIES[a]}
              </button>
            );
          })}
        </div>
      </Section>
      <Section title="Motion">
        <Row label="Style" value={settings.style} options={Object.fromEntries(Object.entries(ANIMATION_STYLES).map(([k, v]) => [k, v.label])) as Record<AnimationStyle, string>} onChange={(v) => set('style', v)} />
        <div className="toggles">
          <label><input type="checkbox" checked={settings.blinking} onChange={(e) => set('blinking', e.target.checked)} /> Blinking</label>
          <label><input type="checkbox" checked={settings.tracking} onChange={(e) => set('tracking', e.target.checked)} /> Cursor tracking</label>
          <label><input type="checkbox" checked={settings.orbit} onChange={(e) => set('orbit', e.target.checked)} /> Rotate &amp; zoom</label>
        </div>
      </Section>
      <Section title="Camera">
        <Row label="" value={view} options={VIEWS} onChange={setView} />
      </Section>
    </div>
  );
}
