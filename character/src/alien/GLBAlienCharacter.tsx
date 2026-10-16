import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { AnimationController } from './animation/AnimationController';
import { GLBRig } from './rig/GLBRig';
import type { AnimationState, AnimationStyle, ExpressionName } from './types';

export interface GLBAlienCharacterProps {
  /** URL of an original GLB authored with the bone / shape-key contract in GLBRig. */
  url: string;
  animation?: AnimationState;
  expression?: ExpressionName;
  animationStyle?: AnimationStyle;
  enableBlinking?: boolean;
  trackPointer?: boolean;
  interactive?: boolean;
  paused?: boolean;
  speechLevel?: number | null;
  onAnimationChange?: (s: AnimationState) => void;
}

/**
 * Same character brain, sculpted body: loads a GLB (e.g. refined in Blender)
 * and animates it with the procedural/keyframe system used by
 * `AlienCharacter`.
 */
export function GLBAlienCharacter({
  url,
  animation = 'idle',
  expression,
  animationStyle = 'playful',
  enableBlinking = true,
  trackPointer = true,
  interactive = true,
  paused = false,
  speechLevel = null,
  onAnimationChange,
}: GLBAlienCharacterProps) {
  const gltf = useGLTF(url);
  const rig = useMemo(() => new GLBRig(gltf.scene), [gltf.scene]);
  const brain = useMemo(() => new AnimationController(), []);
  const { camera, pointer } = useThree();
  const moved = useRef(-1e9);
  const last = useRef(new THREE.Vector2());

  useEffect(() => brain.onStateChange((s) => onAnimationChange?.(s)), [brain, onAnimationChange]);
  useEffect(() => void brain.request(animation), [brain, animation]);
  useEffect(() => brain.configure({ style: animationStyle, blinking: enableBlinking, tracking: trackPointer, expressionOverride: expression ?? null }), [brain, animationStyle, enableBlinking, trackPointer, expression]);
  useEffect(() => {
    if (speechLevel == null) return;
    brain.speech.begin({ amplitude: () => speechLevel });
    return () => brain.speech.end();
  }, [brain, speechLevel]);

  useFrame((_, dt) => {
    if (paused) return;
    if (!pointer.equals(last.current)) {
      last.current.copy(pointer);
      moved.current = performance.now();
    }
    // Approximate gaze from pointer NDC relative to the camera's view.
    const active = trackPointer && performance.now() - moved.current < 2600;
    const fov = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov ?? 30);
    const pose = brain.update(dt, {
      camera: { yaw: 0, pitch: 0, valid: true },
      pointer: { yaw: pointer.x * fov * 0.9, pitch: -pointer.y * fov * 0.6, active, speed: 0 },
    });
    rig.update(pose);
  });

  return <primitive object={rig.root} onPointerDown={() => interactive && brain.react('giggle')} />;
}
