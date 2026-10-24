import * as THREE from 'three';
import { Anatomy, LOBE_BONE_BASE, MAX_LOBES, type AnatomySpec } from '../geometry/anatomy';
import { createAnatomy } from '../geometry/figures';
import type { BodyMeshData } from '../geometry/bodyMesh';
import type { V3 } from '../geometry/sdf';
import { roundedProfile, sweptTube } from '../geometry/tube';
import { createToonMaterial, shadowMultiplier, type ToonMaterial } from '../materials/toon';
import { createEyeMaterial, type EyeMaterial } from '../materials/eye';
import { createMouthMaterial } from '../materials/mouthMaterial';
import { LIGHT_RIG } from '../materials/lightRig';
import { Jiggle } from '../animation/springs';
import { clamp, lerp, smoothstep } from '../animation/math';
import type { Pose } from '../animation/AnimationController';
import type { Accessory, BrowShape, EyeShape, Palette, TouchZone } from '../types';
import { buildBrowGeometry, buildEyeDome, createGlowTexture, EYE_SHAPES } from './features';
import { buildAccessories, type AccessoryHandle } from './accessories';

const v3 = (a: V3) => new THREE.Vector3(a[0], a[1], a[2]);

interface EyeRig {
  side: 1 | -1;
  group: THREE.Group;
  mesh: THREE.Mesh;
  mat: EyeMaterial;
}

interface BrowRig {
  side: 1 | -1;
  anchor: THREE.Group;
  base: THREE.Vector3;
  up: THREE.Vector3;
  mesh: THREE.Mesh | null;
  mat: ToonMaterial;
}

interface LobeRig {
  bone: THREE.Bone;
  /** -1 left … 1 right: which way the lobe leans */
  lean: number;
  index: number;
  jx: Jiggle;
  jz: Jiggle;
}

const BROW_HALF: Record<BrowShape, number> = { pill: 0.125, arched: 0.1, tuft: 0.085, dots: 0.065, none: 0.1 };

interface AntennaRig {
  bones: THREE.Bone[];
  restTip: THREE.Vector3;
  length: number;
  sim: THREE.Vector3;
  vel: THREE.Vector3;
  bulbMat: THREE.MeshBasicMaterial;
  halo: THREE.Sprite;
  initialised: boolean;
}

const MOUTH_COLS = 30;
const MOUTH_ROWS = 8;
const PATCH_X = 23;
const PATCH_Y = 15;
const PATCH_W = 0.24;
const PATCH_Y0 = -0.17;
const PATCH_Y1 = 0.1;

/**
 * Turns a baked body mesh and an anatomy description into a living rig:
 * skinned body (hips, head, two-bone arms, ears, a jiggling crown), shader
 * eyes with lids, brows, a parametric mouth, optional antennae, accessories
 * and touch colliders. Consumes renderer-agnostic `Pose` frames.
 */
export class AlienRig {
  readonly root = new THREE.Group();
  readonly anatomy: Anatomy;
  readonly colliders: THREE.Mesh[] = [];

  private mover = new THREE.Group();
  private hips = new THREE.Bone();
  private head = new THREE.Bone();
  private armL = new THREE.Bone();
  private armR = new THREE.Bone();
  private foreL = new THREE.Bone();
  private foreR = new THREE.Bone();
  private handL = new THREE.Bone();
  private handR = new THREE.Bone();
  private earL = new THREE.Bone();
  private earR = new THREE.Bone();
  private crown = new THREE.Bone();
  private body: THREE.SkinnedMesh;
  private skinMat: ToonMaterial;
  private lobes: LobeRig[] = [];
  private browShape: BrowShape = 'pill';
  private antennaMat: ToonMaterial;
  private mouthMat: THREE.ShaderMaterial;
  private colliderMat = new THREE.MeshBasicMaterial({ visible: false });
  private glowTex = createGlowTexture();
  private eyeGeo = buildEyeDome();
  private eyes: EyeRig[] = [];
  private brows: BrowRig[] = [];
  private mouth: THREE.Mesh;
  private mouthPatch: Float32Array;
  private antennae: AntennaRig[] = [];
  private earJiggle = [new Jiggle(150, 8), new Jiggle(150, 8)];
  private crownJiggle = { x: new Jiggle(110, 6.5), z: new Jiggle(110, 6.5) };
  private headJiggle = new Jiggle(90, 10);
  // Overlapping action: the head trails the body's turns, then catches up.
  private headLag = { z: new Jiggle(70, 9), x: new Jiggle(70, 9) };
  private lastRoot = { z: 0, x: 0 };
  private wobble = { x: new Jiggle(120, 8), y: new Jiggle(140, 9), z: new Jiggle(120, 8) };
  private lastHeadQuat = new THREE.Quaternion();
  private lastHeadPos = new THREE.Vector3();
  private headVel = new THREE.Vector3();
  private accessories: Map<Accessory, AccessoryHandle>;
  private eyeShape: EyeShape = 'oval';
  private disposables: { dispose: () => void }[] = [];
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private neck: THREE.Vector3;
  private jiggleScale = 1;
  private shadow: THREE.Mesh;
  private shadowMat: THREE.MeshBasicMaterial;
  private feet: THREE.Mesh[] = [];
  private footMat: THREE.MeshBasicMaterial;

  constructor(spec: AnatomySpec, data: BodyMeshData, palette: Palette) {
    this.anatomy = createAnatomy(spec);
    const a = this.anatomy;
    this.neck = v3(a.neck);
    this.root.name = 'Character';
    this.root.add(this.mover);

    this.skinMat = createToonMaterial({ masks: true });
    this.skinMat.uniforms.uWobbleRange.value.set(...this.anatomy.wobbleRange);
    this.antennaMat = createToonMaterial({ gradient: [0, 0.3] });
    this.mouthMat = createMouthMaterial(palette);
    this.disposables.push(this.skinMat, this.antennaMat, this.mouthMat, this.colliderMat, this.glowTex, this.eyeGeo);

    // --- Skeleton --------------------------------------------------------
    const named = (b: THREE.Bone, n: string) => ((b.name = n), b);
    named(this.hips, 'hips');
    named(this.head, 'head').rotation.order = 'YXZ';
    named(this.armL, 'arm_L');
    named(this.armR, 'arm_R');
    named(this.foreL, 'forearm_L');
    named(this.foreR, 'forearm_R');
    named(this.handL, 'hand_L');
    named(this.handR, 'hand_R');
    named(this.earL, 'ear_L');
    named(this.earR, 'ear_R');
    named(this.crown, 'crown');
    this.head.position.copy(this.neck);
    this.armL.position.copy(v3(a.shoulders[0]));
    this.armR.position.copy(v3(a.shoulders[1]));
    this.foreL.position.copy(v3(a.elbows[0]).sub(v3(a.shoulders[0])));
    this.foreR.position.copy(v3(a.elbows[1]).sub(v3(a.shoulders[1])));
    this.handL.position.copy(v3(a.hands[0]).sub(v3(a.elbows[0])));
    this.handR.position.copy(v3(a.hands[1]).sub(v3(a.elbows[1])));
    this.earL.position.copy(v3(a.ears[0].root)).sub(this.neck);
    this.earR.position.copy(v3(a.ears[1].root)).sub(this.neck);
    this.crown.position.copy(v3(a.crownPivot)).sub(this.neck);
    this.mover.add(this.hips, this.head);
    this.hips.add(this.armL, this.armR);
    this.armL.add(this.foreL);
    this.armR.add(this.foreR);
    this.foreL.add(this.handL);
    this.foreR.add(this.handR);
    this.head.add(this.earL, this.earR, this.crown);
    // One bone per crown lobe so each can move with the mood and ripple on its own.
    a.lobes.slice(0, MAX_LOBES).forEach((l, i) => {
      const bone = new THREE.Bone();
      bone.name = `crown_${i}`;
      bone.position.copy(v3(l.a)).sub(v3(a.crownPivot));
      this.crown.add(bone);
      const len = Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1], l.b[2] - l.a[2]);
      const stiff = 150 / (0.6 + len * 2.2);
      this.lobes.push({ bone, lean: clamp((l.b[0] - l.a[0]) / Math.max(1e-3, len), -1, 1), index: i, jx: new Jiggle(stiff, 6), jz: new Jiggle(stiff, 6) });
    });

    // --- Body -----------------------------------------------------------
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(data.skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(data.skinWeight, 4));
    geo.setAttribute('aMask', new THREE.BufferAttribute(data.masks, 4));
    geo.setAttribute('aAO', new THREE.BufferAttribute(data.ao, 1));
    geo.setAttribute('aRegion', new THREE.BufferAttribute(data.regions, 4));
    geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geo.computeBoundingSphere();
    this.disposables.push(geo);
    this.body = new THREE.SkinnedMesh(geo, this.skinMat);
    this.body.name = 'body';
    this.body.frustumCulled = false;
    this.mover.add(this.body);

    this.buildEyes();
    this.buildBrows();
    this.mouthPatch = this.sampleMouthPatch();
    this.mouth = this.buildMouth();
    this.buildAntennae();
    this.buildColliders();
    // Soft blob shadow: matches the illustrated look and costs one quad.
    this.shadowMat = new THREE.MeshBasicMaterial({ map: this.glowTex, transparent: true, depthWrite: false, opacity: 0.32, toneMapped: false });
    const shadowGeo = new THREE.PlaneGeometry(1, 1);
    shadowGeo.rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(shadowGeo, this.shadowMat);
    this.shadow.position.y = 0.002;
    this.shadow.renderOrder = -1;
    this.root.add(this.shadow);
    // Tighter, darker contact under each foot grounds the character.
    this.footMat = new THREE.MeshBasicMaterial({ map: this.glowTex, transparent: true, depthWrite: false, opacity: 0.4, toneMapped: false });
    for (const side of [1, -1]) {
      const f = new THREE.Mesh(shadowGeo, this.footMat);
      f.position.set(a.footX * side, 0.003, 0.07);
      f.scale.set(0.34, 1, 0.4);
      f.renderOrder = -1;
      f.userData.x = a.footX * side;
      this.root.add(f);
      this.feet.push(f);
    }
    this.disposables.push(this.shadowMat, this.footMat, shadowGeo);

    this.accessories = buildAccessories(a, { mover: this.mover, head: this.head, crown: this.crown }, palette);
    this.buildBangles();

    this.mover.updateMatrixWorld(true);
    // Skeleton order must match the bone slots baked by bodyMesh (BONE + lobe bones).
    const bones = [this.hips, this.head, this.armL, this.armR, this.earL, this.earR, this.crown, this.foreL, this.foreR, this.handL, this.handR];
    for (let i = 0; i < MAX_LOBES; i++) bones[LOBE_BONE_BASE + i] = this.lobes[i]?.bone ?? this.crown;
    this.body.bind(new THREE.Skeleton(bones));
    this.setPalette(palette);
  }

  // --- Construction -------------------------------------------------------

  private toHead(p: V3) {
    return v3(p).sub(this.neck);
  }

  /** Bangles are separate rings riding on the forearm bones, each in its own colour. */
  private buildBangles() {
    const a = this.anatomy;
    for (const b of a.bangles) {
      const el = v3(a.elbows[b.arm]), hand = v3(a.hands[b.arm]);
      const axis = hand.clone().sub(el);
      const r = a.armRadiusAt(b.arm, b.t) + b.tube * 0.6;
      const geo = new THREE.TorusGeometry(r, b.tube, 10, 40);
      const color = new THREE.Color(b.color);
      const mat = createToonMaterial({ color: b.color, shadow: '#' + color.clone().multiplyScalar(0.62).getHexString(), shade: 0.85 });
      const ring = new THREE.Mesh(geo, mat);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis.clone().normalize());
      ring.position.copy(axis.multiplyScalar(b.t));
      (b.arm === 0 ? this.foreL : this.foreR).add(ring);
      this.disposables.push(geo, mat);
    }
  }

  private buildEyes() {
    for (const lm of this.anatomy.eyes) {
      const group = new THREE.Group();
      // Set into the face (not stuck on): sunk slightly and following the surface.
      group.position.copy(this.toHead(lm.center)).addScaledVector(v3(lm.normal), -0.013 * this.anatomy.face.scale);
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), v3(lm.normal).lerp(new THREE.Vector3(0, 0, 1), 0.3).normalize());
      const mat = createEyeMaterial(lm.side, 1);
      mat.uniforms.uLiner.value = this.anatomy.face.liner ?? 0;
      const flat = this.anatomy.face.eyeStyle === 'flat';
      mat.uniforms.uFlat.value = flat ? 1 : 0;
      mat.uniforms.uCatch.value = flat ? 0 : 0.35;
      const mesh = new THREE.Mesh(this.eyeGeo, mat);
      mesh.renderOrder = 1;
      group.add(mesh);
      this.head.add(group);
      this.disposables.push(mat);
      this.eyes.push({ side: lm.side, group, mesh, mat });
    }
  }

  private buildBrows() {
    const a = this.anatomy;
    for (const lm of a.eyes) {
      const c = lm.center;
      const hit = a.raycast([c[0] + lm.side * 0.014 * a.face.scale, c[1] + a.face.browOffset, 2], [0, 0, -1]);
      const p = hit ? hit.p : ([c[0], c[1] + 0.2, c[2]] as V3);
      const n = hit ? v3(hit.n) : new THREE.Vector3(0, 0, 1);
      const anchor = new THREE.Group();
      const base = this.toHead(p).addScaledVector(n, 0.012);
      anchor.position.copy(base);
      const x = new THREE.Vector3(1, 0, 0).addScaledVector(n, -n.x).normalize();
      const y = new THREE.Vector3().crossVectors(n, x);
      anchor.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, n));
      this.head.add(anchor);
      const mat = createToonMaterial({ shade: 0.7, brow: true });
      mat.uniforms.uBrowSide.value = lm.side;
      this.disposables.push(mat);
      this.brows.push({ side: lm.side, anchor, base, up: y, mesh: null, mat });
    }
  }

  private sampleMouthPatch() {
    const a = this.anatomy;
    const yc = a.head.c[1] - a.face.mouthOffset;
    // The patch spans the face in the character's own scale, while the mouth is
    // shaped in Oru-scale units: the lookup maps one onto the other.
    const fs = a.face.scale;
    const patch = new Float32Array(PATCH_X * PATCH_Y * 6);
    for (let j = 0; j < PATCH_Y; j++) {
      for (let i = 0; i < PATCH_X; i++) {
        const x = (-PATCH_W + (2 * PATCH_W * i) / (PATCH_X - 1)) * fs;
        const y = yc + (PATCH_Y0 + ((PATCH_Y1 - PATCH_Y0) * j) / (PATCH_Y - 1)) * fs;
        const hit = a.raycast([x, y, 2], [0, 0, -1]);
        const o = (j * PATCH_X + i) * 6;
        const p = hit ? hit.p : ([x, y, 0.3] as V3);
        const n = hit ? hit.n : ([0, 0, 1] as V3);
        patch[o] = p[0] - a.neck[0];
        patch[o + 1] = p[1] - a.neck[1];
        patch[o + 2] = p[2] - a.neck[2];
        patch[o + 3] = n[0];
        patch[o + 4] = n[1];
        patch[o + 5] = n[2];
      }
    }
    return patch;
  }

  private buildMouth() {
    const count = MOUTH_COLS * MOUTH_ROWS;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const uv = new Float32Array(count * 2);
    const idx: number[] = [];
    for (let j = 0; j < MOUTH_ROWS; j++)
      for (let i = 0; i < MOUTH_COLS; i++) {
        uv[(j * MOUTH_COLS + i) * 2] = (i / (MOUTH_COLS - 1)) * 2 - 1;
        uv[(j * MOUTH_COLS + i) * 2 + 1] = j / (MOUTH_ROWS - 1);
        if (i < MOUTH_COLS - 1 && j < MOUTH_ROWS - 1) {
          const k = j * MOUTH_COLS + i;
          idx.push(k, k + MOUTH_COLS, k + 1, k + 1, k + MOUTH_COLS, k + MOUTH_COLS + 1);
        }
      }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, this.mouthMat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    this.head.add(mesh);
    this.disposables.push(g);
    return mesh;
  }

  private patchAt(x: number, y: number, out: Float32Array) {
    const fx = clamp(((x + PATCH_W) / (2 * PATCH_W)) * (PATCH_X - 1), 0, PATCH_X - 1.001);
    const fy = clamp(((y - PATCH_Y0) / (PATCH_Y1 - PATCH_Y0)) * (PATCH_Y - 1), 0, PATCH_Y - 1.001);
    const i = Math.floor(fx), j = Math.floor(fy);
    const u = fx - i, v = fy - j;
    const P = this.mouthPatch;
    for (let k = 0; k < 6; k++) {
      const a = P[(j * PATCH_X + i) * 6 + k];
      const b = P[(j * PATCH_X + i + 1) * 6 + k];
      const c = P[((j + 1) * PATCH_X + i) * 6 + k];
      const d = P[((j + 1) * PATCH_X + i + 1) * 6 + k];
      out[k] = lerp(lerp(a, b, u), lerp(c, d, u), v);
    }
  }

  private buildAntennae() {
    for (const { base, dir } of this.anatomy.antennaBases()) {
      const up = v3(dir);
      const side = new THREE.Vector3(Math.sign(base[0]) || 1, 0, 0);
      const o = this.toHead(base).addScaledVector(up, -0.03);
      const P = (u: number, s: number, f: number) => o.clone().addScaledVector(up, u).addScaledVector(side, s).addScaledVector(new THREE.Vector3(0, 0, 1), f);
      const curve = new THREE.CatmullRomCurve3([P(0, 0, 0), P(0.13, 0.01, 0), P(0.25, 0.05, 0.02), P(0.33, 0.11, 0.06)], false, 'centripetal');
      const geo = sweptTube(curve, roundedProfile(0.04, 0.026, 0.001, 0.04), { segments: 36, radial: 16 });
      const length = curve.getLength();
      const stops = [0, 0.45, 0.8];
      const bones = stops.map(() => new THREE.Bone());
      const pts = stops.map((s) => curve.getPointAt(s));
      bones[0].position.copy(pts[0]);
      for (let i = 1; i < bones.length; i++) {
        bones[i].position.copy(pts[i]).sub(pts[i - 1]);
        bones[i - 1].add(bones[i]);
      }
      this.head.add(bones[0]);
      const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
      const si = new Uint16Array(uv.count * 4);
      const sw = new Float32Array(uv.count * 4);
      for (let v = 0; v < uv.count; v++) {
        const t = uv.getX(v);
        let k = 0;
        while (k < stops.length - 1 && t > stops[k + 1]) k++;
        const f = k < stops.length - 1 ? smoothstep(0, 1, (t - stops[k]) / (stops[k + 1] - stops[k])) : 0;
        si[v * 4] = k;
        si[v * 4 + 1] = Math.min(k + 1, stops.length - 1);
        sw[v * 4] = 1 - f;
        sw[v * 4 + 1] = f;
      }
      geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
      geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      const mesh = new THREE.SkinnedMesh(geo, this.antennaMat);
      mesh.frustumCulled = false;
      mesh.userData.bones = bones;
      this.head.add(mesh);
      this.disposables.push(geo);

      const tip = curve.getPointAt(1).addScaledVector(curve.getTangentAt(1), 0.05);
      const bulbGeo = new THREE.SphereGeometry(0.072, 32, 20);
      const bulbMat = new THREE.MeshBasicMaterial({ toneMapped: false });
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.copy(tip).sub(pts[pts.length - 1]);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      }));
      halo.scale.setScalar(0.32);
      halo.position.copy(bulb.position);
      bones[bones.length - 1].add(bulb, halo);
      const colliderGeo = new THREE.SphereGeometry(0.13, 8, 6);
      const collider = new THREE.Mesh(colliderGeo, this.colliderMat);
      collider.position.copy(bulb.position);
      collider.userData.zone = 'antenna' satisfies TouchZone;
      collider.visible = false;
      bones[bones.length - 1].add(collider);
      this.colliders.push(collider);
      this.disposables.push(bulbGeo, bulbMat, halo.material, colliderGeo);
      this.antennae.push({ bones, restTip: tip, length, sim: new THREE.Vector3(), vel: new THREE.Vector3(), bulbMat, halo, initialised: false });
    }
    this.mover.updateMatrixWorld(true);
    this.head.traverse((o) => {
      const sm = o as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh && o.userData.bones) sm.bind(new THREE.Skeleton(o.userData.bones as THREE.Bone[]));
    });
  }

  private buildColliders() {
    const a = this.anatomy;
    const make = (zone: TouchZone, parent: THREE.Object3D, pos: THREE.Vector3, scale: THREE.Vector3, side: 1 | -1 = 1) => {
      const geo = new THREE.SphereGeometry(1, 16, 12);
      const m = new THREE.Mesh(geo, this.colliderMat);
      m.position.copy(pos);
      m.scale.copy(scale);
      m.userData.zone = zone;
      m.userData.side = side;
      // Invisible to every render pass (including contact shadows) but still raycastable.
      m.visible = false;
      parent.add(m);
      this.colliders.push(m);
      this.disposables.push(geo);
    };
    const h = a.head;
    make('head', this.head, this.toHead(h.c), new THREE.Vector3(h.rx + 0.03, h.ry + 0.03, h.depth + 0.1));
    if (a.lobes.length) make('antenna', this.crown, new THREE.Vector3(0, 0.22, 0), new THREE.Vector3(h.rx * 0.95, 0.34, 0.22));
    const bc = a.bellyCollider;
    make('belly', this.hips, v3(bc.c), v3(bc.r));
    if (a.spec.ears !== 'none') {
      [this.earL, this.earR].forEach((bone, i) => {
        const L = a.ears[i];
        make('ear', bone, v3(L.u).multiplyScalar(L.length * 0.5), new THREE.Vector3(0.16, 0.16, 0.16), i === 0 ? 1 : -1);
      });
    }
  }

  // --- Customisation ------------------------------------------------------

  setShadowColor(color: THREE.ColorRepresentation) {
    this.shadowMat.color.set(color);
    this.footMat.color.set(color).multiplyScalar(0.8);
  }

  /** The body shader's blended skin colour at a rest-pose point (mirrors toon.ts). */
  private skinColorAt(pt: THREE.Vector3, p: Palette) {
    const u = this.skinMat.uniforms;
    const top = this.anatomy.head.c[1] + this.anatomy.head.ry;
    const w = smoothstep(0, top, pt.y);
    const c = new THREE.Color(p.baseLow).lerp(new THREE.Color(p.base), smoothstep(0, 0.55, w));
    c.lerp(new THREE.Color(p.high ?? p.base), smoothstep(0.5, 1, w));
    const fc = u.uFaceC.value, fr = u.uFaceR.value;
    const len = Math.hypot((pt.x - fc.x) / fr.x, (pt.y - fc.y) / fr.y);
    const fw = (1 - smoothstep(0.25, 1.05, len)) * smoothstep(fc.z - 0.05, fc.z + 0.22, pt.z);
    return c.lerp(new THREE.Color(p.face ?? p.base), fw * u.uFaceAmt.value);
  }

  setPalette(p: Palette) {
    const u = this.skinMat.uniforms;
    u.uColor.value.set(p.base);
    u.uColorLow.value.set(p.baseLow);
    u.uColorHigh.value.set(p.high ?? p.base);
    u.uFace.value.set(p.face ?? p.base);
    u.uFaceAmt.value = p.face ? 0.55 : 0;
    const h = this.anatomy.head;
    u.uFaceC.value.set(h.c[0], h.c[1] + this.anatomy.face.eyeLift * 0.5, h.c[2] + h.depth * 0.4);
    u.uFaceR.value.set(h.rx * 0.95, h.ry * 0.95);
    u.uSheen.value.set(p.sheen ?? '#000000');
    u.uTip.value.set(p.tip);
    u.uBlush.value.set(p.blush);
    shadowMultiplier(p.shadow, p.base, u.uShadowMul.value);
    if (p.regions) {
      // Clothing colours follow the outfit being worn (casual uses the base regions).
      const o = this.anatomy.spec.outfit;
      const wear = (o && o !== 'casual' && !(o === 'dress' && this.anatomy.spec.figure === 'man') && p.outfits?.[o]) || p.regions;
      u.uHair.value.set(p.regions.hair);
      u.uShirt.value.set(wear.shirt);
      u.uPants.value.set(wear.pants);
      u.uShoes.value.set(wear.shoes);
    }
    for (const b of this.brows) {
      const bu = b.mat.uniforms;
      bu.uColor.value.set(p.brow);
      bu.uColorLow.value.set(p.brow);
      shadowMultiplier(p.shadow, p.base, bu.uShadowMul.value);
    }
    const au = this.antennaMat.uniforms;
    au.uColor.value.set(p.base);
    au.uColorLow.value.set(p.base);
    shadowMultiplier(p.shadow, p.base, au.uShadowMul.value);
    for (const e of this.eyes) {
      e.mat.uniforms.uSclera.value.set(p.sclera);
      e.mat.uniforms.uPupil.value.set(p.pupil);
      // Lids must match the blended skin right around the eye, or they show as patches.
      e.mat.uniforms.uSkin.value.copy(this.skinColorAt(e.group.position.clone().add(this.neck), p));
      e.mat.uniforms.uLash.value.set(p.brow);
      shadowMultiplier(p.shadow, p.base, e.mat.uniforms.uShadowMul.value);
    }
    const m = this.mouthMat.uniforms;
    m.uLip.value.set(p.lip);
    m.uMouth.value.set(p.mouth);
    m.uTongue.value.set(p.tongue);
    m.uTeeth.value.set(p.teeth);
    for (const ant of this.antennae) {
      ant.bulbMat.color.set(p.tip);
      (ant.halo.material as THREE.SpriteMaterial).color.set(p.glow);
    }
    for (const acc of this.accessories.values()) acc.applyPalette(p);
  }

  setEyeShape(shape: EyeShape) {
    this.eyeShape = shape;
    const fs = this.anatomy.face.scale;
    const es = this.anatomy.face.eyeSize ?? 1;
    const [sx, sy] = EYE_SHAPES[shape].size.map((v) => v * fs * es);
    for (const e of this.eyes) {
      e.mesh.scale.set(sx, sy, 0.034 * fs);
      e.mat.uniforms.uAspect.value = sy / sx;
    }
  }

  setBrowShape(shape: BrowShape) {
    this.browShape = shape;
    const base = buildBrowGeometry(shape);
    for (const b of this.brows) {
      if (b.mesh) {
        b.anchor.remove(b.mesh);
        b.mesh.geometry.dispose();
        b.mesh = null;
      }
      if (!base) continue;
      const geo = base.clone();
      const fs = this.anatomy.face.scale;
      // Slimmer than sculpted: soft, friendly brows rather than heavy slabs.
      geo.scale(fs, fs * (this.anatomy.face.eyeStyle === 'flat' ? 1.05 : 0.8), fs);
      if (b.side < 0) {
        geo.scale(-1, 1, 1);
        // Mirroring flips the winding; restore it so the brow stays solid.
        const index = geo.getIndex()!;
        const arr = index.array as Uint16Array | Uint32Array;
        for (let i = 0; i < arr.length; i += 3) {
          const t = arr[i + 1];
          arr[i + 1] = arr[i + 2];
          arr[i + 2] = t;
        }
        index.needsUpdate = true;
      }
      b.mesh = new THREE.Mesh(geo, b.mat);
      b.mat.uniforms.uBrowHalf.value = BROW_HALF[shape] * this.anatomy.face.scale;
      b.anchor.add(b.mesh);
    }
    base?.dispose();
  }

  setAccessories(list: Accessory[]) {
    for (const [name, acc] of this.accessories) acc.object.visible = list.includes(name);
  }

  setJiggle(scale: number) {
    this.jiggleScale = scale;
  }

  /**
   * Places the soft box like a photographer would: up and to the left of the
   * camera, just in front of the face, so lighting stays flattering from any
   * orbit angle.
   */
  updateLighting(camera: THREE.Camera) {
    const head = this.head.getWorldPosition(this.tmp);
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const toward = camera.getWorldPosition(new THREE.Vector3()).sub(head).normalize();
    const key = head.clone().addScaledVector(right, -2.4).addScaledVector(up, 2.7).addScaledVector(toward, 2.3);
    LIGHT_RIG.uKeyPos.value.copy(key.applyMatrix4(camera.matrixWorldInverse));
  }

  /** Converts a world-space look target into yaw/pitch relative to the body. */
  gazeAnglesTo(target: THREE.Vector3) {
    const eye = this.tmp2.set(0, 0, 0);
    for (const e of this.eyes) eye.add(e.group.getWorldPosition(this.tmp));
    eye.multiplyScalar(1 / Math.max(1, this.eyes.length));
    const d = target.clone().sub(eye);
    d.applyQuaternion(this.root.getWorldQuaternion(this.tmpQ).invert());
    return { yaw: Math.atan2(d.x, d.z), pitch: -Math.atan2(d.y, Math.hypot(d.x, d.z)) };
  }

  // --- Per frame ------------------------------------------------------------

  update(pose: Pose, dt: number) {
    const b = pose.body;
    const f = pose.face;

    this.mover.position.set(b.rootX, b.rootY, b.rootZ);
    this.mover.rotation.set(b.rootRx, b.rootRy, b.rootRz);
    const s = 1 + b.squash;
    const xz = 1 / Math.sqrt(Math.max(0.5, s));
    this.mover.scale.set(xz, s, xz);

    const lift = clamp(b.rootY / 0.12, 0, 1);
    this.shadow.position.set(b.rootX, 0.002, b.rootZ + 0.03);
    this.shadow.scale.set(1.25 * (1 - lift * 0.18) * xz, 1, 0.78 * (1 - lift * 0.18) * xz);
    this.shadowMat.opacity = 0.3 * (1 - lift * 0.35);
    for (const f of this.feet) {
      f.position.set(f.userData.x * xz + b.rootX, 0.003, 0.07 + b.rootZ);
      f.scale.set(0.34 * (1 + lift * 0.6), 1, 0.4 * (1 + lift * 0.6));
      this.footMat.opacity = 0.42 * (1 - lift);
    }

    const hj = this.headJiggle.update(-b.rootRz * 0.4, dt);
    const rootVz = dt > 0 ? (b.rootRz - this.lastRoot.z) / dt : 0;
    const rootVx = dt > 0 ? (b.rootRx - this.lastRoot.x) / dt : 0;
    this.lastRoot.z = b.rootRz;
    this.lastRoot.x = b.rootRx;
    const lagZ = this.headLag.z.update(clamp(-rootVz * 0.12, -0.12, 0.12) * this.jiggleScale, dt);
    const lagX = this.headLag.x.update(clamp(-rootVx * 0.12, -0.12, 0.12) * this.jiggleScale, dt);
    this.head.rotation.set(b.headRx + lagX, b.headRy, b.headRz + hj * 0.3 + lagZ + (this.anatomy.restPose.headRz ?? 0));
    // Animation layers on top of the character's resting stance.
    const r = this.anatomy.restPose;
    const sw = this.anatomy.armSwing;
    this.armL.rotation.set(b.armLx + r.armLx, r.armLy ?? 0, b.armLz * sw + r.armLz);
    this.armR.rotation.set(b.armRx + r.armRx, r.armRy ?? 0, b.armRz * sw + r.armRz);
    this.foreL.rotation.set(b.elbowLx + r.elbowLx, r.elbowLy ?? 0, b.elbowL + r.elbowL);
    this.foreR.rotation.set(b.elbowRx + r.elbowRx, r.elbowRy ?? 0, b.elbowR + r.elbowR);
    this.handL.rotation.set(0, r.handLy ?? 0, 0);
    this.handR.rotation.set(0, r.handRy ?? 0, 0);

    // Secondary motion driven by the head's motion through space.
    this.head.updateMatrixWorld();
    const q = this.head.getWorldQuaternion(this.tmpQ);
    const hp = this.head.getWorldPosition(this.tmp);
    if (dt > 0) {
      this.headVel.copy(hp).sub(this.lastHeadPos).divideScalar(dt);
      const dq = q.clone().multiply(this.lastHeadQuat.clone().invert());
      const spinZ = (2 * dq.z) / dt;
      const spinX = (2 * dq.x) / dt;
      const js = this.jiggleScale;
      const cz = this.crownJiggle.z.update(clamp(-spinZ * 0.03 - this.headVel.x * 0.12, -0.3, 0.3) * js, dt);
      const cx = this.crownJiggle.x.update(clamp(-spinX * 0.03 + this.headVel.y * 0.18 - this.headVel.z * 0.1, -0.3, 0.3) * js, dt);
      if (pose.kick > 0) this.crownJiggle.x.kick(-3 * pose.kick);
      // Jelly lag of the upper head and crown, from the head's motion (mover space).
      const inv = this.mover.getWorldQuaternion(new THREE.Quaternion()).invert();
      const v = this.tmp2.copy(this.headVel).applyQuaternion(inv);
      const wu = this.skinMat.uniforms.uWobble.value;
      wu.set(
        this.wobble.x.update(clamp(-v.x * 0.035, -0.04, 0.04) * js, dt),
        this.wobble.y.update(clamp(-v.y * 0.05 - b.squash * 0.25, -0.05, 0.05) * js, dt),
        this.wobble.z.update(clamp(-v.z * 0.035, -0.04, 0.04) * js, dt),
      );
      if (pose.kick > 0) this.wobble.y.kick(0.6 * pose.kick);
      this.crown.rotation.set(cx, 0, cz);
      this.updateLobes(pose, dt, spinZ, b.earL);
      const jl = this.earJiggle[0].update(clamp(spinZ * 0.04 + this.headVel.y * 0.2, -0.4, 0.4) * js, dt);
      const jr = this.earJiggle[1].update(clamp(spinZ * 0.04 - this.headVel.y * 0.2, -0.4, 0.4) * js, dt);
      const perk = this.anatomy.spec.ears === 'fins' ? 0.3 : 0.15;
      this.earL.rotation.set(0, 0, b.earL * perk + jl);
      this.earR.rotation.set(0, 0, -b.earR * perk + jr);
    }
    this.lastHeadQuat.copy(q);
    this.lastHeadPos.copy(hp);

    this.updateEyes(pose, f);
    this.updateBrows(f);
    this.updateMouth(f);
    this.updateAntennae(pose, dt, f.glow + b.glow);
    this.skinMat.uniforms.uBlushAmount.value = clamp(0.55 + f.blush * 0.5, 0, 1) * this.anatomy.blushStrength;
    this.skinMat.uniforms.uJaw.value = clamp(f.jaw, 0, 1.2);
    this.skinMat.uniforms.uCheek.value = clamp(f.cheek, -0.5, 1.2);
  }

  /**
   * Crown lobes carry mood: they stand up and fan out when the character is
   * bright, droop and spread when it's low, ripple gently at rest and lag
   * behind fast head motion — each lobe a little differently.
   */
  private updateLobes(pose: Pose, dt: number, spinZ: number, perk: number) {
    const t = pose.time;
    const mood = clamp(perk, -1, 1.2);
    const ripple = (0.022 + pose.flourish * 0.08) * this.jiggleScale;
    for (const l of this.lobes) {
      const side = Math.sign(l.lean) || 0;
      const up = mood > 0 ? mood * 0.12 : mood * 0.28; // + toward upright, − droop outward
      const wave = Math.sin(t * (1.15 + pose.flourish * 4) - l.index * 0.95) * ripple;
      const sway = Math.sin(t * 0.85 - l.index * 0.7) * ripple * 0.7;
      const jz = l.jz.update(clamp(-spinZ * 0.035 - this.headVel.x * 0.15, -0.35, 0.35) * this.jiggleScale, dt);
      const jx = l.jx.update(clamp(this.headVel.y * 0.25 - this.headVel.z * 0.12, -0.35, 0.35) * this.jiggleScale, dt);
      if (pose.kick > 0) l.jx.kick((-2.5 - l.index * 0.4) * pose.kick);
      l.bone.rotation.set(
        (mood < 0 ? -mood * 0.22 : -mood * 0.06) + sway + jx,
        0,
        side * up + Math.abs(l.lean) * 0 + wave + jz,
      );
    }
  }

  private updateEyes(pose: Pose, f: Pose['face']) {
    const preset = EYE_SHAPES[this.eyeShape];
    const blink = pose.blink;
    const pitch = clamp(pose.eyePitch, -0.5, 0.5);
    const yaw = clamp(pose.eyeYaw, -0.6, 0.6);
    for (const e of this.eyes) {
      const u = e.mat.uniforms;
      const sc = f.eyeScale * (1 - blink * 0.06);
      const sq = clamp(f.eyeSquash, 0.75, 1.2);
      e.group.scale.set(sc * (1 + (1 - sq) * 0.35), sc * sq * (1 - blink * 0.1), 1);
      // Lower lid rises into a crescent for smiling eyes.
      // Flat graphic eyes rest as full circles: the lower lid only rises with a smile.
      const ll = clamp(f.lidLower - (this.anatomy.face.eyeStyle === 'flat' ? 0.14 : 0), 0, 1.1);
      const lower = lerp(-1.25, 0.12, ll);
      const curveU = 0.22 + 0.1 * (1 - clamp(f.lidUpper, 0, 1));
      const curveL = 0.18 + 0.62 * ll;
      // Fully closed: the upper lid edge tucks just under the lower lid everywhere.
      const closed = lower + Math.min(curveU, curveL) - 0.015;
      // Some faces rest with heavier upper lids (a calm, knowing look).
      const lidU = f.lidUpper * (this.anatomy.face.lidRest ?? 1);
      let upper = lerp(closed, 1.18, clamp(lidU, 0, 1.3)) - pitch * 0.25 * clamp(lidU, 0, 1);
      upper = lerp(upper, closed, blink);
      u.uLids.value.set(Math.max(upper, closed), lower, curveU, curveL);
      u.uClosed.value = clamp(1 - (upper - closed) / 0.35, 0, 1);
      // Lid slant: sad droops the outer corners, determined drops the inner ones.
      u.uLidTilt.value = preset.lidTilt + clamp(f.lidTilt, -1.2, 1.2) * 0.42;
      // Each eye converges slightly toward near targets (independent pupils).
      const px = clamp((yaw - pose.vergence * e.side) * 0.85, -0.42, 0.42);
      const py = clamp(-pitch * 0.85, -0.4, 0.4);
      u.uPupilPos.value.set(px, py);
      const base = this.anatomy.face.pupilBase ?? 0.28;
      u.uPupilSize.value = clamp(base + f.pupil * 0.5, base - 0.06, 0.86);
    }
  }

  private updateBrows(f: Pose['face']) {
    const scale = (BROW_HALF[this.browShape] / 0.11) * this.anatomy.face.scale;
    for (const b of this.brows) {
      const raise = (clamp(f.browRaise, -0.6, 1.3) * 0.044 + clamp(f.browAsym, -1.2, 1.2) * b.side * 0.026) * this.anatomy.face.scale;
      const tilt = clamp(f.browTilt, -1.2, 1.2);
      b.anchor.position.copy(b.base).addScaledVector(b.up, raise);
      const u = b.mat.uniforms;
      // Worried: inner ends lift, outer ends fall. Determined: inner ends press down.
      u.uBrowInner.value = (-tilt * 0.036) * scale;
      u.uBrowOuter.value = (tilt * 0.012 - Math.max(0, -tilt) * 0.012) * scale;
      u.uBrowArch.value = (clamp(f.browArch, -0.6, 1.2) * 0.018 + Math.max(0, f.browRaise) * 0.006) * scale;
      if (b.mesh) b.mesh.rotation.z = 0;
    }
  }

  private patchScratch = new Float32Array(6);

  private updateMouth(f: Pose['face']) {
    const pos = this.mouth.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const open = clamp(f.mouthOpen, 0, 1.1);
    const round = clamp(f.mouthRound, 0, 1);
    const smile = clamp(f.smile, -1, 1.4);
    const W = 0.14 * (this.anatomy.face.mouthScale ?? 1) * clamp(f.mouthWidth, 0.4, 1.6) * (1 - 0.22 * round) * (1 + 0.15 * open);
    const minT = 0.03;
    const out = this.patchScratch;
    for (let i = 0; i < MOUTH_COLS; i++) {
      const s = (i / (MOUTH_COLS - 1)) * 2 - 1;
      const s2 = s * s;
      const x = s * W;
      // Upper edge: smile lifts the corners; an open smile flattens the top (D shape).
      const wave = clamp(f.mouthWave, 0, 1) * 0.011 * Math.sin(s * Math.PI * 1.5) * (1 - open * 0.6);
      const upper = smile * 0.045 * s2 * (1 - 0.5 * open) - smile * 0.009 + f.mouthAsym * 0.024 * s + open * 0.01 + wave;
      const flat = Math.pow(Math.max(0, 1 - s2), 0.55);
      const ell = Math.sqrt(Math.max(0, 1 - s2));
      const closedProfile = Math.pow(Math.max(0, 1 - s2), 0.35);
      const profile = lerp(lerp(closedProfile, flat, smoothstep(0, 0.2, open)), ell, round);
      const depth = open * 0.15 * (1 + 0.3 * round) * (1 + 0.3 * Math.max(0, smile));
      const thick = (minT + depth) * profile;
      const lower = upper - thick;
      for (let j = 0; j < MOUTH_ROWS; j++) {
        const t = j / (MOUTH_ROWS - 1);
        this.patchAt(x, lerp(upper, lower, t), out);
        const k = (j * MOUTH_COLS + i) * 3;
        arr[k] = out[0] + out[3] * 0.004;
        arr[k + 1] = out[1] + out[4] * 0.004;
        arr[k + 2] = out[2] + out[5] * 0.004;
      }
    }
    pos.needsUpdate = true;
    this.mouthMat.uniforms.uOpen.value = open;
    this.mouthMat.uniforms.uTeethAmount.value = clamp(f.teeth, 0, 1) * (1 - round * 0.85);
    this.mouthMat.uniforms.uTongueUp.value = clamp(f.tongue, 0, 1);
  }

  private updateAntennae(pose: Pose, dt: number, glow: number) {
    const g = clamp(glow, 0, 1.6);
    for (const ant of this.antennae) {
      const target = this.head.localToWorld(this.tmp.copy(ant.restTip));
      if (!ant.initialised) {
        ant.sim.copy(target);
        ant.initialised = true;
      }
      if (pose.kick > 0) ant.vel.add(new THREE.Vector3(1.2, 1.4, 0.8).multiplyScalar(pose.kick));
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        ant.vel.x += ((target.x - ant.sim.x) * 150 - ant.vel.x * 6.5) * h;
        ant.vel.y += ((target.y - ant.sim.y) * 150 - ant.vel.y * 6.5) * h;
        ant.vel.z += ((target.z - ant.sim.z) * 150 - ant.vel.z * 6.5) * h;
        ant.sim.addScaledVector(ant.vel, h);
      }
      const local = this.head.worldToLocal(this.tmp2.copy(ant.sim)).sub(ant.restTip);
      const droop = (1 - smoothstep(0.1, 0.5, g)) * 0.3;
      const w = [0.25, 0.35, 0.4];
      ant.bones.forEach((bone, i) => {
        bone.rotation.z = clamp((-local.x / ant.length) * w[i] * this.jiggleScale, -0.6, 0.6);
        bone.rotation.x = clamp(((local.z / ant.length) * this.jiggleScale + droop) * w[i], -0.6, 0.8);
      });
      (ant.halo.material as THREE.SpriteMaterial).opacity = 0.1 + g * 0.4;
    }
  }

  static zoneOf(obj: THREE.Object3D | undefined): { zone: TouchZone; side: 1 | -1 } | null {
    let o: THREE.Object3D | null | undefined = obj;
    while (o) {
      if (o.userData.zone) return { zone: o.userData.zone as TouchZone, side: (o.userData.side as 1 | -1) ?? 1 };
      o = o.parent;
    }
    return null;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    for (const b of this.brows) b.mesh?.geometry.dispose();
    for (const acc of this.accessories.values()) acc.dispose();
    this.body.skeleton.dispose();
    this.root.removeFromParent();
  }
}

