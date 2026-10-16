/**
 * Critically damped springs. Every animated value in the character is driven
 * toward a target through one of these, which is what makes state changes blend
 * instead of snapping.
 */
export class Spring {
  value: number;
  velocity = 0;
  /**
   * @param zeta damping ratio: 1 = critically damped (no overshoot);
   *   ~0.7 gives the small, lively overshoot animators use for faces.
   */
  constructor(value = 0, public frequency = 8, public zeta = 1) {
    this.value = value;
  }
  update(target: number, dt: number, frequency = this.frequency) {
    if (dt <= 0) return this.value;
    const omega = frequency;
    if (this.zeta < 1) {
      // Underdamped: semi-implicit Euler in small, stable sub-steps.
      const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        const a = -2 * this.zeta * omega * this.velocity - omega * omega * (this.value - target);
        this.velocity += a * h;
        this.value += this.velocity * h;
      }
      return this.value;
    }
    // Exact integration of a critically damped oscillator (stable at any dt).
    const x = this.value - target;
    const exp = Math.exp(-omega * dt);
    const v = this.velocity;
    const temp = (v + omega * x) * dt;
    this.velocity = (v - omega * temp) * exp;
    this.value = target + (x + temp) * exp;
    return this.value;
  }
  snap(value: number) {
    this.value = value;
    this.velocity = 0;
  }
}

/** A keyed bank of springs that smooths a whole record of numbers at once. */
export class SpringRecord<K extends string> {
  private springs = {} as Record<K, Spring>;
  readonly value = {} as Record<K, number>;
  constructor(initial: Record<K, number>, frequency = 8, zeta = 1) {
    for (const key of Object.keys(initial) as K[]) {
      this.springs[key] = new Spring(initial[key], frequency, zeta);
      this.value[key] = initial[key];
    }
  }
  update(target: Record<K, number>, dt: number, frequency?: number) {
    for (const key in this.springs) {
      this.value[key] = this.springs[key].update(target[key], dt, frequency);
    }
    return this.value;
  }
}

/** Damped harmonic oscillator with configurable damping; used for jiggle / secondary motion. */
export class Jiggle {
  value = 0;
  velocity = 0;
  constructor(public stiffness = 120, public damping = 9) {}
  update(target: number, dt: number) {
    if (dt <= 0) return this.value;
    // Sub-step so large frames stay stable.
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = (target - this.value) * this.stiffness - this.velocity * this.damping;
      this.velocity += a * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }
  kick(impulse: number) {
    this.velocity += impulse;
  }
}
