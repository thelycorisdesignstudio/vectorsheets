import type { GazeMode } from '../config/states';
import { createRandom } from './math';

/**
 * Decides where Oru looks. Output is a yaw/pitch target (radians, head
 * space). Eyes move in quick saccades toward it; the head follows partially
 * and slowly (handled by the brain's springs).
 */
export class GazeController {
  private rnd = createRandom(23);
  private holdTimer = 0;
  private wanderYaw = 0;
  private wanderPitch = 0;
  private thinkPhase = 0;
  yaw = 0;
  pitch = 0;
  /** Set when a large jump happens, so a blink can accompany it. */
  jumped = false;

  update(
    dt: number,
    mode: GazeMode,
    pointer: { yaw: number; pitch: number; active: boolean },
    tracking: boolean,
  ) {
    this.jumped = false;
    const prevYaw = this.yaw, prevPitch = this.pitch;
    this.holdTimer -= dt;
    switch (mode) {
      case 'track':
        if (tracking && pointer.active) {
          this.yaw = pointer.yaw;
          this.pitch = pointer.pitch;
          this.holdTimer = Math.min(this.holdTimer, 1.2);
        } else this.wander(0.6);
        break;
      case 'viewer':
        // Eye contact with tiny micro-saccades so the gaze never freezes.
        if (this.holdTimer <= 0) {
          this.wanderYaw = (this.rnd() - 0.5) * 0.05;
          this.wanderPitch = (this.rnd() - 0.5) * 0.04;
          this.holdTimer = 0.6 + this.rnd() * 1.4;
        }
        this.yaw = this.wanderYaw;
        this.pitch = this.wanderPitch;
        break;
      case 'think': {
        // Look up and away, linger, glance back briefly, repeat.
        this.thinkPhase += dt;
        const cycle = this.thinkPhase % 5.2;
        if (cycle < 3.6) {
          this.yaw = -0.36 + Math.sin(this.thinkPhase * 0.7) * 0.05;
          this.pitch = -0.3 + Math.sin(this.thinkPhase * 0.9) * 0.04;
        } else if (cycle < 4.4) {
          this.yaw = 0.02;
          this.pitch = 0;
        } else {
          this.yaw = 0.25;
          this.pitch = -0.18;
        }
        break;
      }
      case 'wander':
        this.wander(1);
        break;
      case 'closed':
        this.yaw *= 0.98;
        this.pitch = 0.1;
        break;
    }
    if (Math.hypot(this.yaw - prevYaw, this.pitch - prevPitch) > 0.28) this.jumped = true;
    return this;
  }

  private wander(range: number) {
    if (this.holdTimer <= 0) {
      // Mostly back to the viewer, occasionally a curious glance aside.
      const glance = this.rnd() < 0.45;
      this.wanderYaw = glance ? (this.rnd() - 0.5) * 0.7 * range : (this.rnd() - 0.5) * 0.08;
      this.wanderPitch = glance ? (this.rnd() - 0.6) * 0.35 * range : (this.rnd() - 0.5) * 0.06;
      this.holdTimer = glance ? 0.7 + this.rnd() * 1.2 : 1.5 + this.rnd() * 2.5;
    }
    this.yaw = this.wanderYaw;
    this.pitch = this.wanderPitch;
  }
}
