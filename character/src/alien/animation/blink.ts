import { createRandom } from './math';

/**
 * Natural blinking: irregular intervals, a fast close and slower open, the
 * occasional double blink, plus on-demand blinks (e.g. on big gaze shifts).
 */
export class BlinkController {
  private rnd = createRandom(7);
  private timer = 1.2;
  private phase = -1;
  private queued = 0;
  value = 0;

  trigger() {
    if (this.phase < 0) this.phase = 0;
  }

  update(dt: number, perMinute: number, enabled: boolean) {
    if (enabled && perMinute > 0) {
      this.timer -= dt;
      if (this.timer <= 0 && this.phase < 0) {
        this.phase = 0;
        if (this.rnd() < 0.18) this.queued = 1;
        const mean = 60 / perMinute;
        this.timer = mean * (0.45 + this.rnd() * 1.1);
      }
    }
    if (this.phase >= 0) {
      this.phase += dt;
      const close = 0.07;
      const hold = 0.03;
      const open = 0.14;
      const t = this.phase;
      if (t < close) this.value = (t / close) ** 2;
      else if (t < close + hold) this.value = 1;
      else if (t < close + hold + open) this.value = 1 - ((t - close - hold) / open) ** 0.8;
      else {
        this.value = 0;
        this.phase = -1;
        if (this.queued > 0) {
          // Double blink: a second one shortly after.
          this.queued--;
          this.timer = 0.09;
        }
      }
    } else this.value = 0;
    return this.value;
  }
}
