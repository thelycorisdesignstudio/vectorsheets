# Oru — an embodied 3D companion character

A real-time, procedurally sculpted 3D alien character built with React,
TypeScript, Three.js and React Three Fiber. Oru breathes, blinks, glances
around, follows the cursor, reacts to taps, talks, and moves between nine
animation states without ever snapping.

```bash
cd character
npm install
npm run dev        # http://127.0.0.1:5180
npm run build      # type-check + production build into character/dist
```

Useful URL parameters for reviews and screenshots: `?present` (clean
presentation mode), `?view=front|three-quarter|side|back|close`,
`?palette=grape|tangerine|mint|bubblegum|lagoon`, `?crown=fronds|buds|antennae|ears|sprout`,
`?head=puck|pebble|bun`, `?eyes=oval|round|almond|droplet`,
`?brows=pill|arched|tuft|dots|none`, `?ears=none|nubs|fins`,
`?acc=collar,spectacles,bloom`, `?expr=happy`, `?still` (no greeting, no tracking).

## 1. Reference study (tolans.com)

What makes those characters work, and what this project adopts as a *style*
(not their characters, colours or assets):

| Quality | Observation | How Oru applies it |
| --- | --- | --- |
| Silhouette | Oversized soft head on a small, blobby body; rubber-hose limbs; a crown of chunky rounded lobes | Same proportions system, our own crowns (fronds, buds, antennae, ears, sprout) and head shapes (puck, pebble, bun) |
| Head form | A thick, rounded "puck": flat friendly face plane, soft thick edges | SDF rounded-cylinder head with a gently domed face and rounder back |
| Colour | One saturated body hue, gentle vertical gradient, tips fading into a second hue, a contrasting collar | Five original palettes, tinted (never grey) shadows, tip gradients, collar gradient |
| Shading | Matte painted-vinyl look: very soft terminator, no gloss, crisp silhouette | Custom toon shader: wrapped light, tinted shadow multiplier, baked AO, deepened edges |
| Face | Flat white oval eyes with big charcoal pupils, pill brows in a deeper body tone, flat blush ovals, decal mouth with teeth & tongue | One-shader eyes with real lids, swept-tube brows, crisp signed-field blush, per-frame mouth geometry |
| Personality | Warm, slightly cheeky, expressive through small coordinated changes | Restrained expression presets; lids + brows + mouth + head move together |
| Staging | Warm cream backdrop, soft pinkish ground shadow, lots of air around the character | Minimal cream stage, blob shadow, three-quarter default camera |

## 2. Character concept

**Oru** is a small, curious being from somewhere else: a big soft puck of a
head, a crown that wobbles when it moves, and paddle hands it waves with its
whole body. It is friendly, observant and a little cheeky — it looks you in
the eye while listening, glances up and away while thinking, and giggles
when poked.

Proportions: head ≈ 45% of body height and ~1.6× the body width; the crown
adds ~25%. Limbs are short, soft and tapered so every pose stays readable.

## 3. Architecture

```
src/alien/
  AlienCharacter.tsx     React component (public API)
  GLBAlienCharacter.tsx  Same brain driving an imported, sculpted GLB
  types.ts               Typed vocabulary (states, expressions, variants, palette)
  config/                palettes · expressions · animation states & styles
  geometry/
    sdf.ts               distance primitives + smooth blending
    anatomy.ts           the species as a signed distance field (+ landmarks)
    surfaceNets.ts       isosurface extraction with Newton projection
    bodyMesh.ts          skin weights, colour masks and AO baked from the SDF
    mesh.worker.ts       builds meshes off the main thread (cached per variant)
  materials/             toon skin, single-shader eye, mouth decal
  animation/
    brain.ts             state machine + layered procedural behaviour
    keyframes.ts/clips.ts additive Catmull-Rom keyframe clips (greeting, happy…)
    springs.ts           critically damped springs, jiggle oscillators
    blink.ts gaze.ts talk.ts
  rig/
    AlienRig.ts          skinned body, face, antennae, colliders; consumes Pose
    GLBRig.ts            bone / shape-key adapter for imported models
    features.ts accessories.ts
```

The **brain** is renderer-agnostic: every frame it produces a `Pose`
(face parameters, gaze, blink, body channels). `AlienRig` renders the
procedural model; `GLBRig` drives an imported model with the same pose.

### Modelling

The body is one continuous surface sculpted from smooth-blended distance
fields (no seams at neck, shoulders or crown), extracted once with Surface
Nets, snapped onto the true surface, and shaded with analytic normals. Skin
weights come from proximity to each anatomical part (with elbows split by
projection), so the mesh bends softly. AO and colour zones are baked from the
same field. Meshes are built in a Web Worker and cached; palette, eyes, brows,
expression and accessories change without rebuilding anything.

### Animation

* **States:** idle, listening, thinking, speaking, happy, curious, surprised,
  greeting, sleep. One-shots (happy, surprised, greeting) return to the last
  persistent state; waking from sleep plays a stretch.
* **Layers:** expression targets → springs; held state pose → springs;
  procedural breathing, weight shifts and head drift (fractal noise, never
  periodic); additive keyframe clips; secondary motion (crown, ear and antenna
  jiggle driven by the head's real motion).
* **Eyes:** saccadic gaze toward the pointer / viewer / thinking targets,
  the head follows partially and slowly, lids follow vertical gaze, irregular
  blinks with occasional doubles and blinks on big gaze shifts.
* **Speech:** a procedural syllable/viseme generator, or pass `speechLevel`
  (0..1, e.g. from a Web Audio analyser) to sync with real audio.

## 4. Component API

```tsx
import { AlienCharacter } from './alien';

<AlienCharacter
  animation="idle"            // AnimationState
  expression="curious"        // optional override
  palette="grape"             // or a custom Palette object
  head="puck" crown="fronds" ears="none"
  eyeShape="oval" browShape="pill"
  accessories={['collar']}
  animationStyle="playful"    // gentle | playful | snappy
  enableBlinking
  interactive
  trackPointer
  speechLevel={null}
  onAnimationChange={(s) => {}}
  controllerRef={ref}         // play(), poke(), setSpeechLevel(), getState()
/>
```

### Importing a sculpted GLB

```tsx
<GLBAlienCharacter url="/models/my-character.glb" animation="listening" />
```

Bones (optional): `root, hips, head, arm_L, arm_R, forearm_L, forearm_R,
ear_L, ear_R, crown, eye_L, eye_R`. Shape keys (optional): `blink_L, blink_R,
squint, eyeWide, browUp, browDown, browSad, browAngry, smile, frown,
mouthOpen, mouthRound, mouthWide, blush`. See `src/alien/rig/GLBRig.ts`.

## 5. Performance

* ~25k–70k triangles depending on the automatically chosen quality tier.
* Mesh generation runs once per variant in a worker; nothing is recreated per frame.
* The mouth updates one small dynamic buffer; everything else is uniforms and bone transforms.
* Only invisible proxy colliders take part in raycasting.
* Custom shaders need no scene lights, no shadow maps and no environment maps.
* Responsive camera fitting for portrait screens; graceful fallback without WebGL.
