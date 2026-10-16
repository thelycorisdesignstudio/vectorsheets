import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Pose } from '../animation/AnimationController';
import { clamp } from '../animation/math';

/**
 * Drives an imported, hand-sculpted GLB with the same `Pose` stream as the
 * procedural rig. Authoring contract (all optional — missing pieces are
 * simply skipped):
 *
 * Bones / nodes (names, case-insensitive):
 *   root, hips, head, arm_L, arm_R, forearm_L, forearm_R, ear_L, ear_R,
 *   crown, eye_L, eye_R
 *
 * Shape keys (morph targets) on any mesh:
 *   blink_L, blink_R      eyelids closed
 *   squint                lower lids raised (smiling eyes)
 *   eyeWide               eyes widened
 *   browUp, browDown      both brows
 *   browSad, browAngry    inner brow ends up / down
 *   smile, frown
 *   mouthOpen             jaw / mouth open
 *   mouthRound            "oo" shape
 *   mouthWide             wide "ee" shape
 *   blush                 cheek blush layer
 */
export class GLBRig {
  readonly root: THREE.Object3D;
  private nodes = new Map<string, THREE.Object3D>();
  private rest = new Map<THREE.Object3D, THREE.Euler>();
  private restRootPos = new THREE.Vector3();
  private restScale = new THREE.Vector3(1, 1, 1);
  private morphs: { mesh: THREE.Mesh; dict: Record<string, number> }[] = [];

  constructor(scene: THREE.Object3D) {
    this.root = cloneSkinned(scene);
    this.root.traverse((o) => {
      const key = o.name.toLowerCase();
      if (key && !this.nodes.has(key)) this.nodes.set(key, o);
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.morphTargetDictionary) {
        const dict: Record<string, number> = {};
        for (const [k, v] of Object.entries(mesh.morphTargetDictionary)) dict[k.toLowerCase()] = v;
        this.morphs.push({ mesh, dict });
      }
    });
    for (const o of this.nodes.values()) this.rest.set(o, o.rotation.clone());
    const r = this.node('root') ?? this.root;
    this.restRootPos.copy(r.position);
    this.restScale.copy(r.scale);
  }

  private node(name: string) {
    return this.nodes.get(name.toLowerCase());
  }

  private rotate(name: string, x: number, y: number, z: number) {
    const n = this.node(name);
    if (!n) return;
    const r = this.rest.get(n)!;
    n.rotation.set(r.x + x, r.y + y, r.z + z);
  }

  private setMorph(name: string, value: number) {
    const key = name.toLowerCase();
    for (const { mesh, dict } of this.morphs) {
      const i = dict[key];
      if (i !== undefined && mesh.morphTargetInfluences) mesh.morphTargetInfluences[i] = clamp(value, 0, 1);
    }
  }

  update(pose: Pose) {
    const b = pose.body;
    const f = pose.face;
    const root = this.node('root') ?? this.root;
    root.position.set(this.restRootPos.x + b.rootX, this.restRootPos.y + b.rootY, this.restRootPos.z + b.rootZ);
    const r = this.rest.get(root);
    root.rotation.set((r?.x ?? 0) + b.rootRx, (r?.y ?? 0) + b.rootRy, (r?.z ?? 0) + b.rootRz);
    const s = 1 + b.squash;
    const xz = 1 / Math.sqrt(Math.max(0.5, s));
    root.scale.set(this.restScale.x * xz, this.restScale.y * s, this.restScale.z * xz);

    this.rotate('head', b.headRx, b.headRy, b.headRz);
    this.rotate('arm_L', b.armLx, 0, b.armLz);
    this.rotate('arm_R', b.armRx, 0, b.armRz);
    this.rotate('forearm_L', b.elbowLx, 0, b.elbowL);
    this.rotate('forearm_R', b.elbowRx, 0, b.elbowR);
    this.rotate('ear_L', 0, 0, b.earL * 0.3);
    this.rotate('ear_R', 0, 0, -b.earR * 0.3);
    this.rotate('eye_L', pose.eyePitch, pose.eyeYaw, 0);
    this.rotate('eye_R', pose.eyePitch, pose.eyeYaw, 0);

    const closed = 1 - clamp(f.lidUpper, 0, 1);
    this.setMorph('blink_L', Math.max(closed, pose.blink));
    this.setMorph('blink_R', Math.max(closed, pose.blink));
    this.setMorph('squint', f.lidLower);
    this.setMorph('eyeWide', (f.lidUpper - 1) / 0.3 + (f.eyeScale - 1) * 5);
    this.setMorph('browUp', f.browRaise);
    this.setMorph('browDown', -f.browRaise);
    this.setMorph('browSad', -f.browTilt);
    this.setMorph('browAngry', f.browTilt);
    this.setMorph('smile', f.smile);
    this.setMorph('frown', -f.smile);
    this.setMorph('mouthOpen', f.mouthOpen);
    this.setMorph('mouthRound', f.mouthRound);
    this.setMorph('mouthWide', f.mouthWidth - 1);
    this.setMorph('blush', f.blush);
  }
}
