import type { ExpressionName, FaceParams } from '../types';

export const NEUTRAL_FACE: FaceParams = {
  browRaise: 0.05,
  browAsym: 0,
  browTilt: 0,
  lidUpper: 1,
  lidLower: 0.12,
  eyeScale: 1,
  pupil: 0.66,
  smile: 0.42,
  mouthOpen: 0,
  mouthWidth: 1,
  mouthRound: 0,
  mouthAsym: 0,
  blush: 0.6,
  earPerk: 0.05,
  glow: 0.6,
  headTilt: 0,
  headPitch: 0,
  jaw: 0,
  cheek: 0.1,
  teeth: 1,
  tongue: 0,
  lidTilt: 0,
  eyeSquash: 1,
  browArch: 0.15,
  mouthWave: 0,
  lookYaw: 0,
  lookPitch: 0,
};

const face = (overrides: Partial<FaceParams>): FaceParams => ({ ...NEUTRAL_FACE, ...overrides });

/**
 * Expression presets. Each one is a *coordinated* change of eyes (shape,
 * lids, pupils, look direction), brows (height, slant, arch), mouth, cheeks,
 * head and crown — that coordination is what makes an emotion read as
 * sincere rather than as a mask. Values were tuned against rendered output.
 */
export const EXPRESSIONS: Record<ExpressionName, FaceParams> = {
  neutral: NEUTRAL_FACE,
  happy: face({
    browRaise: 0.5, browArch: 0.55, browTilt: -0.2,
    lidLower: 0.78, eyeSquash: 0.9, pupil: 0.74,
    smile: 1.15, mouthOpen: 0.55, mouthWidth: 1.18,
    cheek: 0.95, blush: 1.2, earPerk: 0.7, glow: 1.1, headTilt: 0.06,
  }),
  content: face({
    browRaise: 0.12, browArch: 0.3, browTilt: -0.1,
    lidUpper: 0.72, lidLower: 0.55, eyeSquash: 0.94,
    smile: 0.8, mouthWidth: 1.05,
    cheek: 0.45, blush: 0.9, earPerk: 0.15, headTilt: 0.08,
  }),
  curious: face({
    browRaise: 0.42, browAsym: 1, browArch: 0.45, browTilt: -0.1,
    lidUpper: 1.06, pupil: 0.76,
    smile: 0.12, mouthOpen: 0.14, mouthWidth: 0.62, mouthRound: 0.65,
    earPerk: 0.45, glow: 0.85, headTilt: 0.22, lookYaw: 0.05,
  }),
  surprised: face({
    browRaise: 1.1, browArch: 0.9, browTilt: -0.2,
    lidUpper: 1.3, lidLower: 0, eyeScale: 1.14, eyeSquash: 1.08, pupil: 0.44,
    smile: 0, mouthOpen: 0.7, mouthWidth: 0.62, mouthRound: 1,
    blush: 0.7, earPerk: 1, glow: 1.3, headPitch: -0.08,
  }),
  sleepy: face({
    browRaise: -0.25, browTilt: -0.25, browArch: 0,
    lidUpper: 0, lidLower: 0.15,
    smile: 0.22, mouthWidth: 0.8,
    blush: 0.8, earPerk: -0.85, glow: 0.15, headTilt: 0.12, headPitch: 0.14,
  }),
  thinking: face({
    browRaise: 0.12, browAsym: -0.9, browTilt: 0.3, browArch: 0.1,
    lidUpper: 0.68, lidLower: 0.25,
    smile: 0, mouthWidth: 0.6, mouthAsym: 0.75, mouthRound: 0.2, mouthWave: 0.15,
    earPerk: 0.1, glow: 0.8, headTilt: -0.1, lookPitch: -0.12,
  }),
  listening: face({
    browRaise: 0.25, browArch: 0.25,
    lidUpper: 0.98, lidLower: 0.28, pupil: 0.74,
    smile: 0.5, mouthWidth: 0.95,
    cheek: 0.2, blush: 0.8, earPerk: 0.5, glow: 0.7, headTilt: 0.08,
  }),
  concerned: face({
    browRaise: 0.35, browTilt: -1, browArch: 0.2,
    lidUpper: 0.86, lidLower: 0.18, lidTilt: -0.5, pupil: 0.72,
    smile: -0.4, mouthOpen: 0.04, mouthWidth: 0.78, mouthWave: 0.25,
    earPerk: -0.5, glow: 0.35, headPitch: 0.06, headTilt: 0.06,
  }),
  sad: face({
    browRaise: 0.25, browTilt: -1, browArch: 0.35,
    lidUpper: 0.78, lidLower: 0.2, lidTilt: -0.9, pupil: 0.76,
    smile: -0.75, mouthWidth: 0.82, mouthWave: 0.22,
    blush: 0.5, earPerk: -0.85, glow: 0.2, headPitch: 0.13, headTilt: 0.1, lookPitch: 0.16,
  }),
  shy: face({
    browRaise: 0.15, browTilt: -0.45, browArch: 0.25,
    lidUpper: 0.8, lidLower: 0.42, eyeSquash: 0.95,
    smile: 0.5, mouthWidth: 0.72, mouthAsym: 0.2,
    cheek: 0.55, blush: 1.4, earPerk: -0.25, headTilt: 0.16, headPitch: 0.1, lookYaw: 0.3, lookPitch: 0.22,
  }),
  adoring: face({
    browRaise: 0.28, browTilt: -0.4, browArch: 0.45,
    lidUpper: 0.9, lidLower: 0.48, pupil: 0.92,
    smile: 0.72, mouthWidth: 0.95,
    cheek: 0.55, blush: 1.15, earPerk: 0.25, glow: 1, headTilt: 0.13,
  }),
  determined: face({
    browRaise: -0.25, browTilt: 0.95, browArch: -0.2,
    lidUpper: 0.8, lidLower: 0.25, lidTilt: 0.55, pupil: 0.6,
    smile: 0.2, mouthWidth: 0.85, mouthAsym: 0.25,
    earPerk: 0.4, glow: 0.9, headPitch: 0.05,
  }),
  confused: face({
    browRaise: 0.25, browAsym: 1, browTilt: -0.35, browArch: 0.35,
    lidUpper: 0.92, lidLower: 0.15, pupil: 0.68,
    smile: -0.1, mouthWidth: 0.75, mouthWave: 0.75, mouthAsym: 0.2,
    earPerk: 0.1, headTilt: 0.22, lookYaw: 0.12,
  }),
  playful: face({
    browRaise: 0.15, browAsym: 0.55, browTilt: 0.4, browArch: 0.2,
    lidUpper: 0.6, lidLower: 0.35, lidTilt: 0.3,
    smile: 1, mouthAsym: 0.45, mouthWidth: 1.05, mouthOpen: 0.25,
    cheek: 0.6, blush: 1, earPerk: 0.35, glow: 0.9, headTilt: -0.12,
  }),
};

export const EXPRESSION_LABELS: Record<ExpressionName, string> = {
  neutral: 'Neutral',
  happy: 'Happy',
  content: 'Content',
  curious: 'Curious',
  surprised: 'Surprised',
  sleepy: 'Sleepy',
  thinking: 'Thinking',
  listening: 'Listening',
  concerned: 'Concerned',
  sad: 'Sad',
  shy: 'Shy',
  adoring: 'Adoring',
  determined: 'Determined',
  confused: 'Confused',
  playful: 'Playful',
};
