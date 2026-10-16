/** True when the browser can create a WebGL context. */
export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** A conservative quality guess: phones and low-core devices get the lighter mesh. */
export function defaultQuality(): 'high' | 'balanced' | 'low' {
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (mobile) return cores >= 6 ? 'balanced' : 'low';
  return cores >= 8 ? 'high' : 'balanced';
}
