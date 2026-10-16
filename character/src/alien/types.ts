/** Public, typed vocabulary of the Oru character system. */

export type AnimationState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'happy'
  | 'curious'
  | 'surprised'
  | 'greeting'
  | 'sleep';

export type ExpressionName =
  | 'neutral'
  | 'happy'
  | 'curious'
  | 'surprised'
  | 'sleepy'
  | 'thinking'
  | 'listening'
  | 'concerned'
  | 'playful';

export type PaletteName = 'grape' | 'tangerine' | 'mint' | 'bubblegum' | 'lagoon';
export type EyeShape = 'oval' | 'round' | 'almond' | 'droplet';
export type BrowShape = 'pill' | 'arched' | 'tuft' | 'dots' | 'none';
export type HeadShape = 'puck' | 'pebble' | 'bun';
export type EarStyle = 'none' | 'nubs' | 'fins';
export type CrownFeature = 'fronds' | 'buds' | 'antennae' | 'ears' | 'sprout';
export type Accessory = 'collar' | 'spectacles' | 'bloom';
export type AnimationStyle = 'gentle' | 'playful' | 'snappy';
export type RenderQuality = 'high' | 'balanced' | 'low';

/** Where on the body the visitor touched. */
export type TouchZone = 'head' | 'belly' | 'antenna' | 'ear' | 'face';

/** Every number that shapes the face. Expressions are presets of this record. */
export interface FaceParams {
  /** -1 lowered … 1 raised */
  browRaise: number;
  /** -1 left lower … 1 left higher (asymmetric quirk) */
  browAsym: number;
  /** -1 worried (inner ends up) … 1 determined (inner ends down) */
  browTilt: number;
  /** 0 closed … 1 relaxed open … 1.3 wide */
  lidUpper: number;
  /** 0 resting … 1 pushed up by the cheeks (smiling eyes) */
  lidLower: number;
  /** Uniform eye scale, >1 widens */
  eyeScale: number;
  /** Pupil size as a fraction of the iris */
  pupil: number;
  /** -1 frown … 1 smile */
  smile: number;
  /** 0 closed … 1 wide open */
  mouthOpen: number;
  /** Width multiplier */
  mouthWidth: number;
  /** 0 flat … 1 rounded "o" */
  mouthRound: number;
  /** -1 … 1 lopsided */
  mouthAsym: number;
  /** Cheek blush intensity */
  blush: number;
  /** -1 drooped … 1 perked ears */
  earPerk: number;
  /** Antenna bulb glow */
  glow: number;
  /** Bias for head roll (rad) */
  headTilt: number;
  /** Bias for head pitch (rad), positive looks down */
  headPitch: number;
}

export type FaceParamKey = keyof FaceParams;

export interface Palette {
  label: string;
  /** Head / upper body colour */
  base: string;
  /** Lower body colour (vertical gradient end) */
  baseLow: string;
  /** Crown tips gradient colour */
  tip: string;
  /** Tint multiplied into shaded areas (keeps shadows colourful, never grey) */
  shadow: string;
  blush: string;
  brow: string;
  sclera: string;
  pupil: string;
  /** Closed-mouth lip stroke */
  lip: string;
  /** Mouth interior */
  mouth: string;
  tongue: string;
  teeth: string;
  /** Collar gradient */
  collarA: string;
  collarB: string;
  /** Antenna bulbs / glow details */
  glow: string;
}

export interface CharacterAppearance {
  palette: PaletteName | Palette;
  eyeShape: EyeShape;
  browShape: BrowShape;
  head: HeadShape;
  ears: EarStyle;
  crown: CrownFeature;
  accessories: Accessory[];
}

export interface AlienController {
  /** Plays an animation state, returning to the resting state afterwards if it is a one-shot. */
  play: (state: AnimationState) => void;
  /** Simulates a touch reaction. */
  poke: (zone?: TouchZone) => void;
  /** Sets the current speech amplitude (0..1). Call every frame from an audio analyser. */
  setSpeechLevel: (level: number | null) => void;
  /** Current state of the internal state machine. */
  getState: () => AnimationState;
}
