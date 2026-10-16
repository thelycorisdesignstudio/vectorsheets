import { useEffect, useRef, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

export type CameraView = 'three-quarter' | 'front' | 'side' | 'back' | 'close';

type Vec = [number, number, number];
export const VIEWS: Record<CameraView, { position: Vec; target: Vec }> = {
  'three-quarter': { position: [2.3, 1.75, 5.4], target: [0, 1.18, 0] },
  front: { position: [0, 1.4, 6], target: [0, 1.18, 0] },
  side: { position: [6, 1.45, 0.2], target: [0, 1.18, 0] },
  back: { position: [-1.6, 1.6, -5.8], target: [0, 1.18, 0] },
  close: { position: [0.95, 1.95, 3.9], target: [0, 1.62, 0] },
};

interface StageProps {
  children: ReactNode;
  view: CameraView;
  orbit: boolean;
  background: string;
  dpr?: [number, number];
}

/** Distance multiplier so the whole character fits narrow (portrait) screens. */
function fitScale(aspect: number) {
  const halfTan = Math.tan(THREE.MathUtils.degToRad(15));
  const needed = 1.25 / (halfTan * aspect);
  return Math.max(1, needed / 5.9);
}

/** Moves the camera smoothly toward the selected preset view. */
function CameraRig({ view, controls }: { view: CameraView; controls: React.RefObject<OrbitControlsImpl | null> }) {
  const { camera, size } = useThree();
  const goal = useRef(new THREE.Vector3());
  const target = useRef(new THREE.Vector3());
  const animating = useRef(true);
  const aspect = size.width / Math.max(1, size.height);
  useEffect(() => {
    target.current.set(...VIEWS[view].target);
    const k = view === 'close' ? Math.min(fitScale(aspect), 1.25) : fitScale(aspect);
    goal.current.set(...VIEWS[view].position).sub(target.current).multiplyScalar(k).add(target.current);
    animating.current = true;
  }, [view, aspect]);
  useFrame((_, dt) => {
    if (!animating.current) return;
    const k = 1 - Math.exp(-dt * 4);
    camera.position.lerp(goal.current, k);
    controls.current?.target.lerp(target.current, k);
    controls.current?.update();
    if (camera.position.distanceTo(goal.current) < 0.005 && (controls.current?.target.distanceTo(target.current) ?? 0) < 0.005) animating.current = false;
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
 * Warm, minimal studio: cream backdrop and a gentle three-quarter camera.
 * Lighting and the ground shadow belong to the character itself (stylised
 * shaders + blob shadow), so the stage stays clean and fast.
 */
export function Stage({ children, view, orbit, background, dpr = [1, 2] }: StageProps) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  return (
    <Canvas
      dpr={dpr}
      camera={{ position: VIEWS[view].position, fov: 30, near: 0.1, far: 60 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => gl.setClearColor(background)}
      style={{ touchAction: 'none' }}
    >
      <color attach="background" args={[background]} />
      {children}
      <OrbitControls
        ref={controls}
        target={VIEWS[view].target}
        enabled={orbit}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={2.6}
        maxDistance={14}
        minPolarAngle={0.35}
        maxPolarAngle={Math.PI / 2 - 0.02}
      />
      <CameraRig view={view} controls={controls} />
    </Canvas>
  );
}
