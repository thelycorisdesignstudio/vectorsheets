/** Public, typed vocabulary of the Oru character system. */

/** Explicit animation states. Each has entry, behaviour and exit rules (config/states.ts). */
export type AnimationState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'preparing'
  | 'speaking'
  | 'reacting'
  | 'greeting'
  | 'waiting'
  | 'farewell'
  | 'sleep';

/** Short, expressive reactions layered on top of a state. */
export type ReactionKind = 'surprise' | 'delight' | 'curious' | 'giggle' | 'acknowledge' | 'yield' | 'empathy' | 'flick';

/**
 * High-level presentation instructions. They translate into bounded
 * animation parameters — never into arbitrary geometry or code.
 */
export type Behaviour = 'neutral' | 'attentive' | 'curious' | 'excited' | 'calm' | 'playful' | 'thoughtful' | 'reassuring';

export type ExpressionName =
  | 'neutral'
  | 'happy'
  | 'curious'
  | 'surprised'
  | 'sleepy'
  | 'thinking'
  | 'listening'
  | 'concerned'
  | 'playful'
  | 'content'
  | 'sad'
  | 'shy'
  | 'adoring'
  | 'determined'
  | 'confused';

export type PaletteName = 'grape' | 'tangerine' | 'mint' | 'bubblegum' | 'lagoon' | 'mira' | 'theo' | 'noor';

/** Which character body to build. */
export type CharacterKind = 'alien' | 'human';
export type HumanFigure = 'lady' | 'man' | 'noor';
/** Human hairstyles (any figure can wear any style). */
export type HairStyle = 'bob' | 'lob' | 'waves' | 'ponytail' | 'crop' | 'curls' | 'buzz' | 'puff';
/** Human outfits: everyday clothes, gym wear, or a sundress. */
export type Outfit = 'casual' | 'workout' | 'dress';
export type EyeShape = 'oval' | 'round' | 'almond' | 'droplet';
export type BrowShape = 'pill' | 'arched' | 'tuft' | 'dots' | 'none';
export type HeadShape = 'puck' | 'pebble' | 'bun';
export type EarStyle = 'none' | 'nubs' | 'fins';
export type CrownFeature = 'fronds' | 'buds' | 'antennae' | 'ears' | 'sprout' | 'tendrils';
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
  /** Jaw drop deforming the lower face (speech) */
  jaw: number;
  /** Cheek lift / puff */
  cheek: number;
  /** Upper teeth visibility */
  teeth: number;
  /** Tongue visibility */
  tongue: number;
  /** -1 sad (outer lid corners droop) … 1 fierce (inner corners drop) */
  lidTilt: number;
  /** Vertical eye scale: <1 squints (joy), >1 stretches (surprise) */
  eyeSquash: number;
  /** -1 flat / kinked … 1 high arch */
  browArch: number;
  /** 0 steady … 1 wobbly, uncertain mouth line */
  mouthWave: number;
  /** Expression-level gaze bias (rad): shy looks down and away, sad looks down */
  lookYaw: number;
  lookPitch: number;
}

export type FaceParamKey = keyof FaceParams;

export interface Palette {
  label: string;
  /** Head / upper body colour */
  base: string;
  /** Lower body colour (vertical gradient end) */
  baseLow: string;
  /** Lightest shade at the top of the head (three-stop blend); defaults to base */
  high?: string;
  /** Soft lighter tint airbrushed over the face; omitted = none */
  face?: string;
  /** Soft-vinyl sheen colour glowing at grazing angles */
  sheen?: string;
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
  /** Clothed characters: colours for hair and clothing regions */
  regions?: { hair: string; shirt: string; pants: string; shoes: string };
  /** Clothing colours for the other outfits (hair comes from regions) */
  outfits?: Partial<Record<Outfit, { shirt: string; pants: string; shoes: string }>>;
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


