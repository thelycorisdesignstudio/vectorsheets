import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { AlienBrain } from './animation/brain';
import { requestBodyMesh } from './geometry/meshCache';
import type { BodyMeshData } from './geometry/bodyMesh';
import { AlienRig } from './rig/AlienRig';
import { resolvePalette } from './config/palettes';
import { ANIMATION_STYLES } from './config/states';
import type {
  Accessory, AlienController, AnimationState, AnimationStyle, BrowShape, CrownFeature, EarStyle,
  ExpressionName, EyeShape, HeadShape, Palette, PaletteName, RenderQuality, TouchZone,
} from './types';

export interface AlienCharacterProps {
  /** Requested animation state. One-shot states return to the last persistent state. */
  animation?: AnimationState;
  /** Facial expression override; `undefined` lets the animation state decide. */
  expression?: ExpressionName;
  palette?: PaletteName | Palette;
  eyeShape?: EyeShape;
  browShape?: BrowShape;
  head?: HeadShape;
  ears?: EarStyle;
  crown?: CrownFeature;
  accessories?: Accessory[];
  animationStyle?: AnimationStyle;
  quality?: RenderQuality;
  enableBlinking?: boolean;
  /** Reacts to clicks / taps. */
  interactive?: boolean;
  /** Eyes and head follow the pointer. */
  trackPointer?: boolean;
  paused?: boolean;
  /** Plays the greeting once the model is ready. */
  greetOnMount?: boolean;
  /** Falls asleep after this many idle seconds without interaction (0 = never). */
  restAfter?: number;
  /** External speech amplitude 0..1 (e.g. from an audio analyser). `null` = procedural. */
  speechLevel?: number | null;
  /** Colour of the soft ground shadow. */
  shadowColor?: string;
  onAnimationChange?: (state: AnimationState) => void;
  onPoke?: (zone: TouchZone) => void;
  onReady?: () => void;
  controllerRef?: Ref<AlienController>;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}

/**
 * An embodied, procedurally sculpted alien companion.
 *
 * ```tsx
 * <AlienCharacter expression="curious" animation="idle" enableBlinking interactive />
 * ```
 */
export function AlienCharacter({
  animation = 'idle',
  expression,
  palette = 'grape',
  eyeShape = 'oval',
  browShape = 'pill',
  head = 'puck',
  ears = 'none',
  crown = 'fronds',
  accessories = ['collar'],
  animationStyle = 'playful',
  quality = 'balanced',
  enableBlinking = true,
  interactive = true,
  trackPointer = true,
  paused = false,
  greetOnMount = true,
  restAfter = 0,
  speechLevel = null,
  shadowColor = '#9c6f6a',
  onAnimationChange,
  onPoke,
  onReady,
  controllerRef,
  position,
  rotation,
  scale,
}: AlienCharacterProps) {
  const spec = useMemo(() => ({ head, ears, crown }), [head, ears, crown]);
  const [data, setData] = useState<{ key: string; mesh: BodyMeshData } | null>(null);
  const brain = useRef<AlienBrain>(null!);
  if (!brain.current) brain.current = new AlienBrain();
  if (import.meta.env.DEV) (window as unknown as { __oru: AlienBrain }).__oru = brain.current;
  const greeted = useRef(false);
  const lastInteraction = useRef(performance.now());
  const pointer = useRef({ x: 0, y: 0, moved: -1e9 });
  const speech = useRef<number | null>(speechLevel);
  speech.current = speechLevel;
  const callbacks = useRef({ onAnimationChange, onPoke, onReady });
  callbacks.current = { onAnimationChange, onPoke, onReady };
  const { camera, gl } = useThree();

  // Build (or fetch from cache) the sculpted body mesh off the main thread.
  useEffect(() => {
    let alive = true;
    const key = `${head}|${ears}|${crown}|${quality}`;
    requestBodyMesh(spec, quality).then((mesh) => alive && setData({ key, mesh }));
    return () => {
      alive = false;
    };
  }, [spec, quality, head, ears, crown]);

  const rig = useMemo(() => (data ? new AlienRig(spec, data.mesh, resolvePalette(palette)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data]);

  useEffect(() => {
    if (!rig) return;
    // Only colliders take part in raycasting: keeps pointer events cheap.
    const colliders = new Set(rig.colliders);
    rig.root.traverse((o) => {
      if (!colliders.has(o as THREE.Mesh)) o.raycast = () => {};
    });
    callbacks.current.onReady?.();
    if (greetOnMount && !greeted.current) {
      greeted.current = true;
      brain.current.setState('greeting', true);
    }
    return () => rig.dispose();
  }, [rig, greetOnMount]);

  // Cheap customisation: no rebuilds.
  useEffect(() => rig?.setPalette(resolvePalette(palette)), [rig, palette]);
  useEffect(() => rig?.setShadowColor(shadowColor), [rig, shadowColor]);
  useEffect(() => rig?.setEyeShape(eyeShape), [rig, eyeShape]);
  useEffect(() => rig?.setBrowShape(browShape), [rig, browShape]);
  useEffect(() => rig?.setAccessories(accessories), [rig, accessories]);
  useEffect(() => rig?.setJiggle(ANIMATION_STYLES[animationStyle].jiggle), [rig, animationStyle]);

  useEffect(() => {
    brain.current.onStateChange = (s) => callbacks.current.onAnimationChange?.(s);
  }, []);

  useEffect(() => {
    if (brain.current.state !== animation) brain.current.setState(animation);
    lastInteraction.current = performance.now();
  }, [animation]);

  // Track the pointer across the whole page, not just over the canvas.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const r = gl.domElement.getBoundingClientRect();
      pointer.current.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.current.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      pointer.current.moved = performance.now();
      lastInteraction.current = pointer.current.moved;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onMove);
    };
  }, [gl]);

  useImperativeHandle(controllerRef, () => ({
    play: (s) => brain.current.setState(s, true),
    poke: (zone = 'belly') => brain.current.poke(zone),
    setSpeechLevel: (level) => {
      speech.current = level;
    },
    getState: () => brain.current.state,
  }), []);

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const plane = useMemo(() => new THREE.Plane(), []);
  const scratch = useMemo(() => ({ eye: new THREE.Vector3(), normal: new THREE.Vector3(), hit: new THREE.Vector3(), ndc: new THREE.Vector2() }), []);

  useFrame((_, dt) => {
    if (!rig || paused) return;
    const now = performance.now();
    if (restAfter > 0 && brain.current.state === 'idle' && now - lastInteraction.current > restAfter * 1000) {
      brain.current.setState('sleep', true);
    }
    // Project the pointer onto a plane facing the camera just in front of the face.
    let yaw = 0, pitch = 0;
    const active = trackPointer && now - pointer.current.moved < 2600;
    if (active) {
      rig.root.updateMatrixWorld();
      scratch.eye.set(0, rig.anatomy.eyes[0].center[1], 0.4);
      rig.root.localToWorld(scratch.eye);
      camera.getWorldDirection(scratch.normal);
      plane.setFromNormalAndCoplanarPoint(scratch.normal, scratch.eye.clone().addScaledVector(scratch.normal, -1.1));
      scratch.ndc.set(pointer.current.x, pointer.current.y);
      raycaster.setFromCamera(scratch.ndc, camera);
      if (raycaster.ray.intersectPlane(plane, scratch.hit)) {
        const g = rig.gazeAnglesTo(scratch.hit);
        yaw = g.yaw;
        pitch = g.pitch;
      }
    }
    const pose = brain.current.update(dt, {
      pointer: { yaw, pitch, active },
      blinking: enableBlinking,
      tracking: trackPointer,
      expression: expression ?? null,
      style: animationStyle,
      speechLevel: speech.current,
    });
    rig.update(pose, Math.min(dt, 1 / 20));
  });

  if (!rig) return null;

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    const hit = AlienRig.zoneOf(e.object);
    const zone = hit?.zone ?? 'belly';
    brain.current.poke(zone, hit?.side ?? 1);
    lastInteraction.current = performance.now();
    callbacks.current.onPoke?.(zone);
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
