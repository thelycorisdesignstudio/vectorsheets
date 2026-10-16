# Oru — embodied character platform

An original, real-time 3D companion character with a body that communicates
what the AI is doing: it listens, thinks, prepares, speaks, reacts, waits,
greets and says goodbye, using gaze, expression, posture and timing.

```bash
cd character
npm install
npm run dev      # http://127.0.0.1:5180   (studio: add ?dev, or press "d")
npm test         # unit tests (vitest)
npm run build    # type-check + production build
```

To use a real conversation model, run the main Vectorsheets server
(`npm run server:dev` at the repo root, port 8080) with `OPENAI_API_KEY` or the
Azure OpenAI variables set. The dev server proxies `/api` to it. Without
credentials the character runs a clearly labelled scripted demo.

## What is implemented

| Area | Status |
| --- | --- |
| 3D character (sculpted SDF body, skinned rig, per-lobe crown bones) | Implemented |
| Stylised key / fill / rim lighting, satin highlight, baked AO, contact shadows | Implemented |
| Expressive face: shader eyes with lids, crescents, slants and squash; bendable brows; parametric mouth with teeth and tongue; jaw and cheek deformation | Implemented |
| 15 expressions, 8 behaviours, 8 reactions, micro-expressions, hover response | Implemented |
| Animation controller with 10 explicit states and layered blending | Implemented, unit tested |
| Gaze: eye contact with the real camera, saccades, aversion, pointer interest, vergence | Implemented |
| Lip-sync: viseme timelines, word-boundary re-anchoring, amplitude, text estimate | Implemented, unit tested |
| Embodiment controller (semantic events → behaviour) | Implemented, unit tested |
| Conversation manager, interruption, cancellation, captions | Implemented, unit tested |
| Scripted demo backend (no credentials) | Implemented, tested in browser |
| Server model backend (`/api/companion/*`, OpenAI / Azure OpenAI Responses) | Implemented; tested against a local fake of the Responses API, **not** against a real model |
| Browser TTS (Web Speech) with word-boundary lip-sync | Implemented; needs a browser with voices (not testable headless) |
| Browser speech recognition (Web Speech) + mic barge-in | Implemented; needs microphone permission and a supporting browser (Chrome / Edge / Safari) — not tested automatically |
| Provider audio + exact viseme timing (e.g. Azure visemes) | Interface + playback implemented; no TTS provider is wired on the server yet |
| Studio (dev controls) and diagnostics | Implemented |
| GLB import (`GLBAlienCharacter`, bone / shape-key contract) | Implemented; no sculpted GLB exists yet to test it with |

## Architecture

```
src/
  alien/                         CharacterRenderer + CharacterRig
    AlienCharacter.tsx           R3F component: renders, collects camera/pointer input
    rig/AlienRig.ts              skinned body, eyes, brows, mouth, crown, colliders
    geometry/                    SDF anatomy → Surface Nets mesh (Web Worker) + baked weights/masks/AO
    materials/                   toon skin, single-shader eye, mouth decal, shared light rig
    animation/
      AnimationController.ts     AnimationController: states, layers, priorities, blending
      expression.ts              ExpressionController: expressions, behaviours, reactions, variation
      gaze.ts                    GazeController: fixations, saccades, policies
      speech/                    SpeechAnimationController + visemes + text timing
  embodiment/
    events.ts                    semantic event types
    EmbodimentController.ts      events → state / behaviour / reaction decisions
    profile.ts                   CharacterConfiguration (identity, persona, appearance, behaviour)
  conversation/
    types.ts                     provider-independent interfaces
    ConversationManager.ts       turn-taking, provider calls, speech, interruption
    adapters/                    ScriptedAdapter, HttpChatAdapter
    voice/                       WebSpeechSynthesizer, WebSpeechRecognizer, SimulatedSpeech, AudioClipSpeech
  audio/AudioController.ts       playback (Web Audio + analyser), mic capture + VAD
  platform/createPlatform.ts     wires everything once (no React)
  ui/                            ConversationDock, StudioPanel, Diagnostics
server/services/companion.js     (repo root) model call with bounded behaviour/reaction output
```

The renderer knows nothing about AI providers; the conversation layer knows
nothing about 3D. They meet only through **semantic events**:

`USER_STARTED_SPEAKING · USER_FINISHED_SPEAKING · USER_TYPING · AI_STARTED_THINKING ·
AI_RESPONSE_READY · AI_STARTED_SPEAKING · AI_FINISHED_SPEAKING · USER_INTERRUPTED ·
CHARACTER_GREETING · CONVERSATION_ENDED · USER_TOUCHED · USER_ACTIVITY · SET_BEHAVIOUR · REACT`

A model can only request a behaviour or reaction from a fixed, validated
list (checked on the server and again on the client) — never geometry or code.

## Animation system

**States** (each with intent, entry clip, behaviour, exit clip, minimum and
timed duration — see `config/states.ts`): idle, listening, thinking,
preparing, speaking, reacting, greeting, waiting, farewell, rest. Requests
made before a state's minimum duration are deferred, never dropped; one-shot
states return to the last persistent state.

**Layers** (low → high priority):

- Body: idle motion (breathing, weight shifts, fractal-noise drift) → held state
  and behaviour pose → gesture clips (with override masks, e.g. the greeting
  owns the waving arm) → speech beats → gaze head-follow → secondary motion
  (crown lobes, ears, antennae).
- Face: state expression → behaviour deltas (with controlled variation and
  mirroring) → reaction overlay → micro-expressions and hover → clip accents →
  speech (owns the mouth and keeps part of the smile) → blink.

Faces use slightly underdamped springs, so expressions land with a small,
lively overshoot instead of sliding in.

**What makes the face read as emotional:**

- Eye shape changes: crescents for joy, drooping outer corners for sadness,
  round and stretched for surprise.
- Brows bend at each end and arch, rather than rotating as rigid pills.
- Mouth range: grin, soft smile, wobbly, pout, smirk, frown.
- Cheeks lift, the jaw drops, blush rises, and pupils dilate with eye contact.
- The crown stands up and fans out when bright, droops when low, and ripples
  with delight.
- Idle micro-expressions: an eyebrow flash on eye contact, a soft smile, a
  content sigh.

## Connecting real AI and voice

- **Model:** set provider env vars for the server (`OPENAI_API_KEY`, or
  `AZURE_OPENAI_*` as documented in the repo README). `GET /api/companion/status`
  reports whether it is configured; the UI shows "Live model" or "Demo mode".
- **Your own backend:** implement `ConversationAdapter.respond()` and pass it to
  `conversation.setAdapter()`.
- **Better TTS with exact lip-sync:** return `audio: { data, timeline }` from an
  adapter; map provider visemes with `AZURE_VISEME_IDS` (or similar). Playback
  and exact-timeline sync are already handled by `AudioClipSpeech`.
- **Realtime speech-to-speech APIs:** feed their audio into `AudioController.play`
  (or `speech.begin({ amplitude })`) and dispatch the same semantic events.

## Performance and reliability

- One render loop drives the character, embodiment and secondary motion; React
  updates only on meaningful state changes. Diagnostics poll at 4 Hz.
- Mesh generation runs once per anatomy variant in a Web Worker and is cached;
  customisation changes uniforms only.
- Adaptive pixel ratio (`PerformanceMonitor`); transparent canvas over a CSS
  backdrop; GPU resources disposed on rebuild.
- Animation pauses on hidden tabs; speech sync is clock-based, so it realigns
  when the tab returns. Voices that fail or finish silently fall back to
  captioned speech.
- `prefers-reduced-motion` (or the studio toggle) scales idle motion, clips and
  hops down.
- Error boundaries isolate UI panels; there's a WebGL fallback screen.

## Tests

`npm test` runs 26 unit tests covering text→viseme timing, lip-sync sources and
boundary re-anchoring, state deferral and timed transitions, reactions,
expression blending, embodiment event mapping, interruption, cancellation,
voice fallback and conversation endings. Browser behaviour (rendering,
expressions, conversation flow, mobile layout) was checked with headless
Chromium screenshots; real audio input and output still need a manual check on
a device.
