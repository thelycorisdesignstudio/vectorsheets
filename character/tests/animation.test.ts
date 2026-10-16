import { describe, expect, it } from 'vitest';
import { AnimationController, type FrameInput } from '../src/alien/animation/AnimationController';

const input: FrameInput = { camera: { yaw: 0, pitch: 0, valid: true }, pointer: { yaw: 0, pitch: 0, active: false, speed: 0 } };
const run = (a: AnimationController, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) a.update(1 / 60, input);
};

describe('AnimationController state machine', () => {
  it('defers requests until the minimum duration and never drops them', () => {
    const a = new AnimationController();
    a.request('thinking');
    expect(a.state).toBe('thinking');
    expect(a.request('speaking')).toBe(false);
    expect(a.state).toBe('thinking');
    run(a, 0.5);
    expect(a.state).toBe('speaking');
  });

  it('timed transient states return to the last persistent state', () => {
    const a = new AnimationController();
    a.request('listening');
    a.request('greeting', { force: true });
    run(a, 3.2);
    expect(a.state).toBe('listening');
  });

  it('reactions pass through reacting and resume', () => {
    const a = new AnimationController();
    a.react('giggle');
    expect(a.state).toBe('reacting');
    run(a, 2);
    expect(a.state).toBe('idle');
  });

  it('reactions while speaking do not change state', () => {
    const a = new AnimationController();
    a.request('speaking');
    a.react('delight');
    expect(a.state).toBe('speaking');
  });

  it('waking from rest goes to idle with a wake clip', () => {
    const a = new AnimationController();
    a.request('sleep');
    run(a, 0.2);
    a.request('listening');
    expect(a.state).toBe('listening');
    expect(a.snapshot().clips).toContain('wake');
  });

  it('expressions blend smoothly (no jumps between frames)', () => {
    const a = new AnimationController();
    run(a, 1);
    a.configure({ expressionOverride: 'surprised' });
    let prev = a.pose.face.browRaise;
    let maxStep = 0;
    for (let i = 0; i < 60; i++) {
      a.update(1 / 60, input);
      maxStep = Math.max(maxStep, Math.abs(a.pose.face.browRaise - prev));
      prev = a.pose.face.browRaise;
    }
    expect(prev).toBeGreaterThan(0.8);
    expect(maxStep).toBeLessThan(0.15);
  });

  it('closes the eyes in rest and keeps them open while listening', () => {
    const a = new AnimationController();
    a.configure({ blinking: false });
    a.request('sleep');
    run(a, 3);
    expect(a.pose.face.lidUpper).toBeLessThan(0.1);
    a.request('listening');
    run(a, 3);
    expect(a.pose.face.lidUpper).toBeGreaterThan(0.85);
  });

  it('respects the approved expression set', () => {
    const a = new AnimationController();
    a.expressions.approved = new Set(['neutral']);
    a.configure({ expressionOverride: 'sad' });
    run(a, 0.1);
    expect(a.snapshot().expression).toBe('neutral');
  });
});
