import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { AnimationController, type ControllerSettings } from './animation/AnimationController';
import { requestBodyMesh } from './geometry/meshCache';
import type { BodyMeshData } from './geometry/bodyMesh';
import { AlienRig } from './rig/AlienRig';
import { resolvePalette } from './config/palettes';
import { ANIMATION_STYLES } from './config/states';
import type {
  Accessory, AnimationState, Behaviour, BrowShape, CrownFeature, EarStyle, ExpressionName, EyeShape,
  HeadShape, Palette, PaletteName, RenderQuality, TouchZone,
} from './types';

export interface AlienCharacterProps {
  /**
   * Drive the character from outside (EmbodimentController). When omitted the
   * component owns a controller and `animation` / `behaviour` props steer it.
   */
  controller?: AnimationController;
  animation?: AnimationState;
  behaviour?: Behaviour;
  /** Facial expression override (art direction / dev tools). */
  expression?: ExpressionName;
  palette?: PaletteName | Palette;
  eyeShape?: EyeShape;
  browShape?: BrowShape;
  head?: HeadShape;
  ears?: EarStyle;
  crown?: CrownFeature;
  accessories?: Accessory[];
  quality?: RenderQuality;
  /** Animation settings forwarded to the controller (style, intensity, blinking…). */
  settings?: Partial<ControllerSettings>;
  interactive?: boolean;
  paused?: boolean;
  shadowColor?: string;
  /** Touch handler; defaults to a simple reaction on the internal controller. */
  onTouch?: (zone: TouchZone, side: 1 | -1) => void;
  onReady?: () => void;
  onError?: (error: unknown) => void;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}

/**
 * The embodied character: a procedurally sculpted, skinned 3D model driven
 * by an AnimationController. Frame-level work happens in `useFrame`; React
 * only re-renders on meaningful prop changes.
 *
 * ```tsx
 * <AlienCharacter animation="idle" behaviour="curious" interactive />
 * ```
 */
export function AlienCharacter({
  controller: external,
  animation,
  behaviour,
  expression,
  palette = 'grape',
  eyeShape = 'oval',
  browShape = 'pill',
  head = 'puck',
  ears = 'none',
  crown = 'fronds',
  accessories = ['collar'],
  quality = 'balanced',
  settings,
  interactive = true,
  paused = false,
  shadowColor = '#9c6f6a',
  onTouch,
  onReady,
  onError,
  position,
  rotation,
  scale,
}: AlienCharacterProps) {
  const spec = useMemo(() => ({ head, ears, crown }), [head, ears, crown]);
  const [data, setData] = useState<BodyMeshData | null>(null);
  const internal = useRef<AnimationController | null>(null);
  if (!external && !internal.current) internal.current = new AnimationController();
  const controller = external ?? internal.current!;
  const pointer = useRef({ x: 0, y: 0, moved: -1e9 });
  const callbacks = useRef({ onTouch, onReady, onError });
  callbacks.current = { onTouch, onReady, onError };
  const { camera, gl } = useThree();
  if (import.meta.env.DEV) (window as unknown as { __oru: AnimationController }).__oru = controller;

  useEffect(() => {
    let alive = true;
    requestBodyMesh(spec, quality)
      .then((mesh) => alive && setData(mesh))
      .catch((e) => callbacks.current.onError?.(e));
    return () => {
      alive = false;
    };
  }, [spec, quality]);

  const rig = useMemo(() => {
    if (!data) return null;
    try {
      return new AlienRig(spec, data, resolvePalette(palette));
    } catch (e) {
      callbacks.current.onError?.(e);
      return null;
    }
    // Palette changes are applied without rebuilding (below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    if (!rig) return;
    // Only invisible colliders take part in raycasting: pointer events stay cheap.
    const colliders = new Set(rig.colliders);
    rig.root.traverse((o) => {
      if (!colliders.has(o as THREE.Mesh)) o.raycast = () => {};
    });
    callbacks.current.onReady?.();
    return () => rig.dispose();
  }, [rig]);

  useEffect(() => rig?.setPalette(resolvePalette(palette)), [rig, palette]);
  useEffect(() => rig?.setShadowColor(shadowColor), [rig, shadowColor]);
  useEffect(() => rig?.setEyeShape(eyeShape), [rig, eyeShape]);
  useEffect(() => rig?.setBrowShape(browShape), [rig, browShape]);
  useEffect(() => rig?.setAccessories(accessories), [rig, accessories]);
  useEffect(() => {
    if (settings) controller.configure(settings);
    rig?.setJiggle(ANIMATION_STYLES[controller.settings.style].jiggle * (controller.settings.reducedMotion ? 0.4 : 1));
  }, [rig, controller, settings]);
  useEffect(() => controller.configure({ expressionOverride: expression ?? null }), [controller, expression]);
  useEffect(() => {
    if (animation) controller.request(animation, { reason: 'prop' });
  }, [controller, animation]);
  useEffect(() => {
    if (behaviour) controller.setBehaviour(behaviour);
  }, [controller, behaviour]);

  // Attention follows the pointer anywhere on the page, not just over the canvas.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const r = gl.domElement.getBoundingClientRect();
      pointer.current.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.current.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      pointer.current.moved = performance.now();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onMove);
    };
  }, [gl]);

  const scratch = useMemo(() => ({
    raycaster: new THREE.Raycaster(), plane: new THREE.Plane(), eye: new THREE.Vector3(), normal: new THREE.Vector3(),
    hit: new THREE.Vector3(), ndc: new THREE.Vector2(), last: { yaw: 0, pitch: 0 }, cam: new THREE.Vector3(),
  }), []);
  const input = useMemo(() => ({
    camera: { yaw: 0, pitch: 0, valid: false },
    pointer: { yaw: 0, pitch: 0, active: false, speed: 0 },
  }), []);

  useFrame((_, dt) => {
    if (!rig || paused || document.hidden) return;
    const now = performance.now();
    rig.root.updateMatrixWorld();
    // Eye contact: where the camera (the user) actually is.
    const c = rig.gazeAnglesTo(camera.getWorldPosition(scratch.cam));
    input.camera.yaw = c.yaw;
    input.camera.pitch = c.pitch;
    input.camera.valid = Math.abs(c.yaw) < 1.6;
    // Pointer: projected onto a plane just in front of the face.
    const active = now - pointer.current.moved < 2500;
    input.pointer.active = active;
    if (active) {
      scratch.eye.set(0, rig.anatomy.eyes[0].center[1], 0.4);
      rig.root.localToWorld(scratch.eye);
      camera.getWorldDirection(scratch.normal);
      scratch.plane.setFromNormalAndCoplanarPoint(scratch.normal, scratch.eye.addScaledVector(scratch.normal, -1.1));
      scratch.ndc.set(pointer.current.x, pointer.current.y);
      scratch.raycaster.setFromCamera(scratch.ndc, camera);
      if (scratch.raycaster.ray.intersectPlane(scratch.plane, scratch.hit)) {
        const g = rig.gazeAnglesTo(scratch.hit);
        input.pointer.speed = dt > 0 ? Math.hypot(g.yaw - scratch.last.yaw, g.pitch - scratch.last.pitch) / dt : 0;
        input.pointer.yaw = g.yaw;
        input.pointer.pitch = g.pitch;
        scratch.last = g;
      }
    }
    const pose = controller.update(dt, input);
    rig.update(pose, Math.min(dt, 1 / 20));
  });

  if (!rig) return null;

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    const hit = AlienRig.zoneOf(e.object);
    const zone = hit?.zone ?? 'belly';
    const side = hit?.side ?? 1;
    if (callbacks.current.onTouch) callbacks.current.onTouch(zone, side);
    else controller.react(zone === 'antenna' ? 'surprise' : zone === 'ear' ? 'flick' : 'giggle', { side });
  };

  return (
    <primitive
      object={rig.root}
      position={position}
      rotation={rotation}
      scale={scale}
      onPointerDown={onDown}
      onPointerOver={() => interactive && (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = '')}
    />
  );
}
