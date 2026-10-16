import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Platform } from '../platform/createPlatform';

/** Live diagnostics, polled a few times a second (never per frame). */
export function Diagnostics({ platform }: { platform: Platform }) {
  const conv = useSyncExternalStore(platform.conversation.subscribe, platform.conversation.getSnapshot);
  const [snap, setSnap] = useState(() => platform.anim.snapshot());
  const [fps, setFps] = useState(0);
  const [, force] = useState(0);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    let frames = 0;
    let raf = 0;
    const loop = () => {
      frames++;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const id = setInterval(() => {
      setSnap(platform.anim.snapshot());
      setFps(frames * 4);
      frames = 0;
      force((n) => n + 1);
    }, 250);
    return () => {
      clearInterval(id);
      cancelAnimationFrame(raf);
    };
  }, [platform]);
  const sync = snap.speech.source;
  const rows: [string, string][] = [
    ['Animation state', `${snap.state}${snap.pending ? ` → ${snap.pending}` : ''} (${snap.stateTime.toFixed(1)}s)`],
    ['Previous / resume', `${snap.previous} / ${snap.resume}`],
    ['Last transition', snap.lastReason],
    ['Expression', snap.expression],
    ['Behaviour', snap.behaviour],
    ['Reaction', snap.reaction ?? '—'],
    ['Gaze', snap.gaze],
    ['Gesture clips', snap.clips.join(', ') || '—'],
    ['Conversation', conv.phase],
    ['Backend', `${conv.adapter.label}${conv.lastProvider ? ` (${conv.lastProvider})` : ''}`],
    ['Voice out', conv.voice.audible ? conv.voice.label : 'silent (captions)'],
    ['Audio playback', platform.audio.status],
    ['Mic capture', platform.audio.capturing ? `on · level ${platform.audio.micLevel.toFixed(2)}` : 'off'],
    ['Speech sync', snap.speech.active ? `${sync}${sync === 'timeline' ? ' (exact)' : sync === 'boundary' ? ' (word-anchored)' : sync === 'estimated' ? ' (no timing data)' : ''}` : 'not speaking'],
    ['Viseme', `${snap.speech.viseme} · weight ${snap.speech.weight.toFixed(2)}`],
    ['Frame rate', `${fps} fps`],
  ];
  return (
    <section className={`diagnostics ${open ? '' : 'collapsed'}`} aria-label="Diagnostics">
      <h3>
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          Diagnostics {open ? '–' : '+'}
        </button>
      </h3>
      {open && (
        <>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <h4>Recent events</h4>
      <ol className="events">
        {platform.embodiment.log.slice(0, 7).map((e, i) => (
          <li key={i}>
            <code>{e.type}</code>
            {e.detail && <span> {e.detail}</span>}
          </li>
        ))}
      </ol>
        </>
      )}
    </section>
  );
}
