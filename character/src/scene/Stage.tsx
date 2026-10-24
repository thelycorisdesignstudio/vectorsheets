import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

export type CameraView = 'hero' | 'three-quarter' | 'front' | 'side' | 'back' | 'close';

type Vec = [number, number, number];
export const VIEWS: Record<CameraView, { position: Vec; target: Vec }> = {
  // Targets sit a little low so the character floats above the conversation dock.
  // Hero: an intimate head-and-shoulders shot from slightly to the side.
  hero: { position: [2.3, 2.55, 6.3], target: [0.12, 1.8, 0] },
  'three-quarter': { position: [2.85, 2.05, 7.4], target: [0, 1.3, 0] },
  front: { position: [0, 1.7, 8], target: [0, 1.32, 0] },
  side: { position: [7.6, 1.9, 0.3], target: [0, 1.45, 0] },
  back: { position: [-2, 2.1, -7.3], target: [0, 1.45, 0] },
  close: { position: [1.15, 2.4, 4.8], target: [0, 2.02, 0] },
};

interface StageProps {
  children: ReactNode;
  view: CameraView;
  orbit: boolean;
  /** 0 = full body, 1 = conversational close-up */
  focus?: number;
  /** height of the character's head centre (framing adapts per character) */
  headY?: number;
}

/** Distance multiplier so the whole character fits narrow (portrait) screens. */
function fitScale(aspect: number) {
  const halfTan = Math.tan(THREE.MathUtils.degToRad(15));
  const needed = 1.45 / (halfTan * aspect);
  return Math.max(1, needed / 7.4);
}

/**
 * Moves the camera smoothly toward the selected preset view. `focus` (0..1)
 * leans the shot in toward the face during conversation — slowly, like a
 * camera operator — and back out when it ends. Manual orbiting takes over
 * until the next view or focus change.
 */
function CameraRig({ view, focus, headY, controls }: { view: CameraView; focus: number; headY: number; controls: React.RefObject<OrbitControlsImpl | null> }) {
  const { camera, size } = useThree();
  const goal = useRef(new THREE.Vector3());
  const target = useRef(new THREE.Vector3());
  const animating = useRef(true);
  const fast = useRef(true);
  const aspect = size.width / Math.max(1, size.height);
  useEffect(() => {
    fast.current = true;
  }, [view]);
  useEffect(() => {
    const v0 = VIEWS[view];
    // Face-led shots follow the head; full-body shots move a little with it.
    const dy = (headY - 1.86) * (view === 'hero' || view === 'close' ? 1 : 0.25);
    const v = {
      position: [v0.position[0], v0.position[1] + dy, v0.position[2]] as Vec,
      target: [v0.target[0], v0.target[1] + dy, v0.target[2]] as Vec,
    };
    const k = view === 'close' || view === 'hero' ? Math.min(fitScale(aspect) * (view === 'hero' ? 0.82 : 1), 1.3) : fitScale(aspect);
    const f = view === 'close' || view === 'hero' ? 0 : focus;
    // Conversation framing: closer, aimed at the face.
    target.current.set(v.target[0], v.target[1] + (1.72 + (headY - 1.86) - v.target[1]) * f, v.target[2]);
    const dist = k * (1 - 0.24 * f);
    goal.current.set(...v.position).sub(new THREE.Vector3(...v.target)).multiplyScalar(dist).add(target.current);
    animating.current = true;
  }, [view, aspect, focus, headY]);
  useFrame((_, dt) => {
    if (!animating.current) return;
    // Preset changes move briskly; conversational lean-ins drift in gently.
    const k = 1 - Math.exp(-dt * (fast.current ? 4 : 0.9));
    camera.position.lerp(goal.current, k);
    controls.current?.target.lerp(target.current, k);
    controls.current?.update();
    if (camera.position.distanceTo(goal.current) < 0.005 && (controls.current?.target.distanceTo(target.current) ?? 0) < 0.005) {
      animating.current = false;
      fast.current = false;
    }
  });
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const stop = () => (animating.current = false);
    c.addEventListener('start', stop);
    return () => c.removeEventListener('start', stop);
  }, [controls]);
  return null;
}

/**
 * Warm, minimal studio and a gentle three-quarter camera. Adaptive pixel ratio
 * keeps frame rate stable on weaker devices.
 * Lighting and the ground shadow belong to the character itself (stylised
 * shaders + blob shadow), so the stage stays clean and fast.
 */
export function Stage({ children, view, orbit, focus = 0, headY = 1.86 }: StageProps) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  // Start at the device ratio (capped at 2) and step down if frames drop.
  const maxDpr = Math.min(2, window.devicePixelRatio || 1);
  const [dpr, setDpr] = useState(maxDpr);
  return (
    <Canvas
      dpr={dpr}
      camera={{ position: VIEWS[view].position, fov: 30, near: 0.1, far: 60 }}
      // Transparent canvas: the warm studio backdrop is a CSS gradient behind it.
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      style={{ touchAction: 'none' }}
    >
      <PerformanceMonitor onDecline={() => setDpr((d) => Math.max(1, d - 0.5))} onIncline={() => setDpr((d) => Math.min(maxDpr, d + 0.25))} />
      {children}
      <OrbitControls
        ref={controls}
        target={VIEWS[view].target}
        enabled={orbit}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={3.2}
        maxDistance={17}
        minPolarAngle={0.35}
        maxPolarAngle={Math.PI / 2 - 0.02}
      />
      <CameraRig view={view} focus={focus} headY={headY} controls={controls} />
    </Canvas>
  );
}
