import { describe, expect, it } from 'vitest';
import { AnimationController } from '../src/alien/animation/AnimationController';
import { EmbodimentController } from '../src/embodiment/EmbodimentController';
import { ORU_PROFILE } from '../src/embodiment/profile';
import { ConversationManager } from '../src/conversation/ConversationManager';
import { ScriptedAdapter } from '../src/conversation/adapters/ScriptedAdapter';
import type { SpeakOptions, SpeechHandle, SpeechSynthesizer } from '../src/conversation/types';

/** A controllable fake voice: starts immediately, ends when told. */
class FakeVoice implements SpeechSynthesizer {
  readonly id = 'fake';
  readonly label = 'Fake';
  readonly audible = true;
  last: { finish: (r: 'ended' | 'error') => void; cancelled: boolean } | null = null;
  constructor(private failToStart = false) {}
  speak(text: string, _opts?: SpeakOptions): SpeechHandle {
    let resolve!: (r: 'ended' | 'cancelled' | 'error') => void;
    const done = new Promise<'ended' | 'cancelled' | 'error'>((r) => (resolve = r));
    const state = { finish: (r: 'ended' | 'error') => resolve(r), cancelled: false };
    this.last = state;
    let startCb = () => {};
    setTimeout(() => (this.failToStart ? resolve('error') : startCb()), 0);
    return {
      text, exactTiming: false, clock: () => 0, done,
      cancel: () => {
        state.cancelled = true;
        resolve('cancelled');
      },
      onStart: (cb) => (startCb = cb),
      onBoundary: () => {},
    };
  }
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function setup(voice = new FakeVoice()) {
  const anim = new AnimationController();
  const embodiment = new EmbodimentController(anim, ORU_PROFILE);
  const conversation = new ConversationManager({ adapter: new ScriptedAdapter([0, 0]), synth: voice, embodiment, anim, profile: ORU_PROFILE });
  const events = () => embodiment.log.map((e) => e.type).reverse();
  return { anim, embodiment, conversation, voice, events };
}

describe('ConversationManager', () => {
  it('runs a full scripted turn through semantic events', async () => {
    const { conversation, voice, events, anim } = setup();
    const p = conversation.send('Hello there');
    expect(conversation.getSnapshot().phase).toBe('thinking');
    await tick(450);
    expect(conversation.getSnapshot().phase).toBe('speaking');
    expect(anim.state).toBe('speaking');
    expect(anim.speech.active).toBe(true);
    voice.last!.finish('ended');
    await p;
    expect(conversation.getSnapshot().phase).toBe('idle');
    expect(anim.state).toBe('waiting');
    expect(events()).toEqual([
      'USER_STARTED_SPEAKING', 'USER_FINISHED_SPEAKING', 'AI_STARTED_THINKING', 'AI_RESPONSE_READY', 'AI_STARTED_SPEAKING', 'AI_FINISHED_SPEAKING',
    ]);
    expect(conversation.getSnapshot().history).toHaveLength(2);
  });

  it('interrupts speech when the user takes the floor', async () => {
    const { conversation, voice, events, anim } = setup();
    void conversation.send('tell me a joke');
    await tick(450);
    expect(conversation.getSnapshot().phase).toBe('speaking');
    conversation.interrupt('user spoke');
    expect(voice.last!.cancelled).toBe(true);
    expect(anim.state).toBe('listening');
    expect(events()).toContain('USER_INTERRUPTED');
    expect(conversation.getSnapshot().phase).toBe('listening');
  });

  it('a new message cancels a pending reply', async () => {
    const { conversation, voice } = setup();
    void conversation.send('first');
    void conversation.send('second');
    await tick(450);
    voice.last!.finish('ended');
    await tick(10);
    const hist = conversation.getSnapshot().history.map((t) => t.role);
    expect(hist.filter((r) => r === 'assistant')).toHaveLength(1);
  });

  it('falls back to captions when the voice cannot start', async () => {
    const { conversation, anim } = setup(new FakeVoice(true));
    void conversation.send('hi');
    await tick(500);
    expect(conversation.getSnapshot().notice).toMatch(/captions/);
    expect(anim.state).toBe('speaking');
  });

  it('treats an instant, silent "finish" as an unavailable voice', async () => {
    const instant: SpeechSynthesizer = {
      id: 'instant', label: 'Instant', audible: true,
      speak: (text) => {
        let startCb = () => {};
        let resolve!: (r: 'ended') => void;
        const done = new Promise<'ended' | 'cancelled' | 'error'>((r) => (resolve = r));
        setTimeout(() => {
          startCb();
          resolve('ended');
        }, 0);
        return {
          text, exactTiming: false, clock: () => 0, done, cancel: () => {}, onBoundary: () => {},
          timeline: { cues: [], words: [], duration: 3 },
          onStart: (cb) => (startCb = cb),
        };
      },
    };
    const { conversation, anim } = setup(instant as unknown as FakeVoice);
    void conversation.send('tell me something');
    await tick(500);
    expect(conversation.getSnapshot().notice).toMatch(/captions/);
    expect(anim.state).toBe('speaking');
  });

  it('ends the conversation on goodbye', async () => {
    const { conversation, voice, anim } = setup();
    void conversation.send('ok bye');
    await tick(450);
    voice.last!.finish('ended');
    await tick(10);
    expect(conversation.getSnapshot().phase).toBe('ended');
    expect(anim.state).toBe('farewell');
  });
});
