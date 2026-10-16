import * as THREE from 'three';
import type { Anatomy } from '../geometry/anatomy';
import { createToonMaterial, shadowMultiplier, type ToonMaterial } from '../materials/toon';
import type { Accessory, Palette } from '../types';

export interface AccessoryHandle {
  object: THREE.Object3D;
  applyPalette: (p: Palette) => void;
  dispose: () => void;
}

interface Attach {
  mover: THREE.Object3D;
  head: THREE.Object3D;
  crown: THREE.Object3D;
}

function handle(object: THREE.Object3D, mats: ToonMaterial[], geos: THREE.BufferGeometry[], apply: (p: Palette) => void): AccessoryHandle {
  return {
    object,
    applyPalette: apply,
    dispose: () => {
      mats.forEach((m) => m.dispose());
      geos.forEach((g) => g.dispose());
      object.removeFromParent();
    },
  };
}

const tint = (m: ToonMaterial, a: string, b: string, shadowOf = a) => {
  m.uniforms.uColor.value.set(a);
  m.uniforms.uColorLow.value.set(b);
  shadowMultiplier(new THREE.Color(shadowOf).multiplyScalar(0.72), a, m.uniforms.uShadowMul.value);
};

/**
 * Optional accessories. Each one is attached to the bone it belongs to and
 * re-tints with the palette, so they always feel part of the same design.
 */
export function buildAccessories(a: Anatomy, at: Attach, palette: Palette): Map<Accessory, AccessoryHandle> {
  const map = new Map<Accessory, AccessoryHandle>();
  const neckLocal = (p: THREE.Vector3) => p.sub(new THREE.Vector3(...a.neck));

  // Collar: a plump ring that hides the neck and frames the head.
  {
    const geo = new THREE.TorusGeometry(0.245, 0.1, 28, 72);
    geo.rotateX(Math.PI / 2);
    const mat = createToonMaterial({ gradientAxis: 'x', gradient: [-0.3, 0.3] });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.set(0, a.neck[1] + 0.01, 0.01);
    ring.rotation.x = 0.16;
    ring.scale.set(1.06, 1, 0.94);
    at.mover.add(ring);
    map.set('collar', handle(ring, [mat], [geo], (p) => tint(mat, p.collarA, p.collarB, p.collarB)));
  }

  // Round spectacles resting on the face plane.
  {
    const group = new THREE.Group();
    const mat = createToonMaterial({ shade: 0.6 });
    const rim = new THREE.TorusGeometry(0.15, 0.013, 12, 48);
    const bridge = new THREE.CylinderGeometry(0.011, 0.011, 0.13, 10);
    bridge.rotateZ(Math.PI / 2);
    for (const e of a.eyes) {
      const m = new THREE.Mesh(rim, mat);
      m.position.copy(neckLocal(new THREE.Vector3(...e.center))).add(new THREE.Vector3(0, 0, 0.05));
      group.add(m);
    }
    const br = new THREE.Mesh(bridge, mat);
    br.position.copy(neckLocal(new THREE.Vector3(0, a.eyes[0].center[1] + 0.04, a.eyes[0].center[2] + 0.07)));
    group.add(br);
    at.head.add(group);
    map.set('spectacles', handle(group, [mat], [rim, bridge], (p) => tint(mat, p.pupil, p.pupil)));
  }

  // A little bloom tucked into the crown.
  {
    const group = new THREE.Group();
    const petalMat = createToonMaterial({ shade: 0.8 });
    const coreMat = createToonMaterial({ shade: 0.8 });
    const petal = new THREE.SphereGeometry(1, 20, 14);
    petal.scale(0.06, 0.038, 0.02);
    petal.translate(0.055, 0, 0);
    const core = new THREE.SphereGeometry(0.036, 18, 12);
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(petal, petalMat);
      m.rotation.z = (i / 5) * Math.PI * 2;
      group.add(m);
    }
    const c = new THREE.Mesh(core, coreMat);
    c.position.z = 0.012;
    group.add(c);
    const h = a.head;
    const hit = a.raycast([h.c[0] + h.rx * 0.55, h.c[1] + h.ry * 0.62, 2], [0, 0, -1]);
    const p = hit ? new THREE.Vector3(...hit.p) : new THREE.Vector3(h.rx * 0.5, h.c[1] + h.ry * 0.6, h.depth);
    group.position.copy(neckLocal(p)).add(new THREE.Vector3(0, 0, 0.02));
    group.rotation.set(-0.25, 0.35, 0.3);
    at.head.add(group);
    map.set('bloom', handle(group, [petalMat, coreMat], [petal, core], (pal) => {
      tint(petalMat, pal.tip, pal.tip);
      tint(coreMat, pal.collarA, pal.collarA);
    }));
  }

  for (const acc of map.values()) {
    acc.applyPalette(palette);
    acc.object.visible = false;
  }
  return map;
}
