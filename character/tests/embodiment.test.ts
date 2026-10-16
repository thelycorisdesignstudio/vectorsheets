import { describe, expect, it } from 'vitest';
import { AnimationController, type FrameInput } from '../src/alien/animation/AnimationController';
import { EmbodimentController } from '../src/embodiment/EmbodimentController';
import { ORU_PROFILE } from '../src/embodiment/profile';

const input: FrameInput = { camera: { yaw: 0, pitch: 0, valid: true }, pointer: { yaw: 0, pitch: 0, active: false, speed: 0 } };
function setup() {
  const anim = new AnimationController();
  const emb = new EmbodimentController(anim, ORU_PROFILE);
  const run = (s: number) => {
    for (let t = 0; t < s; t += 1 / 60) {
      emb.update(1 / 60);
      anim.update(1 / 60, input);
    }
  };
  return { anim, emb, run };
}

describe('EmbodimentController', () => {
  it('maps a full conversational turn onto states', () => {
    const { anim, emb, run } = setup();
    emb.dispatch({ type: 'USER_STARTED_SPEAKING' });
    expect(anim.state).toBe('listening');
    expect(anim.behaviour).toBe('attentive');
    emb.dispatch({ type: 'USER_FINISHED_SPEAKING', transcript: 'hello' });
    emb.dispatch({ type: 'AI_STARTED_THINKING' });
    run(0.6);
    expect(anim.state).toBe('thinking');
    emb.dispatch({ type: 'AI_RESPONSE_READY', behaviour: 'excited' });
    run(0.4);
    expect(anim.state).toBe('preparing');
    expect(anim.behaviour).toBe('excited');
    emb.dispatch({ type: 'AI_STARTED_SPEAKING' });
    expect(anim.state).toBe('speaking');
    emb.dispatch({ type: 'AI_FINISHED_SPEAKING' });
    expect(anim.state).toBe('waiting');
    run(15);
    expect(anim.state).toBe('idle');
  });

  it('skips the thinking pose for fast replies', () => {
    const { anim, emb, run } = setup();
    emb.dispatch({ type: 'AI_STARTED_THINKING' });
    run(0.1);
    emb.dispatch({ type: 'AI_RESPONSE_READY' });
    run(0.6);
    expect(emb.log.map((e) => e.type)).toContain('AI_RESPONSE_READY');
    expect(anim.previous).not.toBe('thinking');
  });

  it('yields to an interruption', () => {
    const { anim, emb } = setup();
    emb.dispatch({ type: 'AI_STARTED_SPEAKING' });
    anim.speech.begin({ clock: () => 0 });
    emb.dispatch({ type: 'USER_INTERRUPTED' });
    expect(anim.state).toBe('listening');
    expect(anim.speech.active).toBe(false);
    expect(anim.snapshot().clips).toContain('yield');
  });

  it('varies touch reactions with context', () => {
    const { anim, emb } = setup();
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      emb.dispatch({ type: 'USER_TOUCHED', zone: 'belly', side: 1 });
      seen.add(anim.snapshot().reaction ?? '');
    }
    expect(seen.size).toBeGreaterThan(1);
    emb.dispatch({ type: 'USER_TOUCHED', zone: 'ear', side: -1 });
    expect(anim.snapshot().clips).toContain('earFlickR');
  });

  it('ends a conversation with a farewell then idles', () => {
    const { anim, emb, run } = setup();
    emb.dispatch({ type: 'CONVERSATION_ENDED' });
    expect(anim.state).toBe('farewell');
    run(2.6);
    expect(anim.state).toBe('idle');
  });

  it('rests after inactivity and wakes on activity', () => {
    const { anim, emb, run } = setup();
    run(ORU_PROFILE.behaviour.restAfter + 1);
    expect(anim.state).toBe('sleep');
    emb.noteActivity();
    expect(anim.state).toBe('idle');
  });
});
