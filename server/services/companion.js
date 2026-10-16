import { z } from 'zod';
import { aiConfig, generateStructured } from './aiGenerator.js';

/**
 * Conversation endpoint for the embodied companion character.
 * The model chooses words plus a bounded presentation hint (behaviour /
 * reaction) — never animation code or geometry.
 */

const BEHAVIOURS = ['neutral', 'attentive', 'curious', 'excited', 'calm', 'playful', 'thoughtful', 'reassuring'];
const REACTIONS = ['none', 'surprise', 'delight', 'curious', 'giggle', 'acknowledge', 'empathy'];

export const companionRequestSchema = z.object({
  persona: z.object({
    name: z.string().trim().min(1).max(60),
    summary: z.string().trim().max(1200),
    style: z.string().trim().max(600)
  }),
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().trim().min(1).max(2000) }))
    .min(1)
    .max(24)
});

const replySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'behaviour', 'reaction', 'end_conversation'],
  properties: {
    reply: { type: 'string', minLength: 1, maxLength: 600 },
    behaviour: { type: 'string', enum: BEHAVIOURS },
    reaction: { type: 'string', enum: REACTIONS },
    end_conversation: { type: 'boolean' }
  }
};

export function companionStatus() {
  const config = aiConfig();
  return { configured: config.configured, provider: config.provider, model: config.configured ? config.model : undefined };
}

export async function companionReply({ persona, messages }) {
  const instructions = [
    `You are ${persona.name}, an embodied AI companion character shown as an animated 3D character.`,
    persona.summary,
    persona.style,
    'Your reply will be spoken aloud. Never claim to have human feelings, a body, or experiences you do not have.',
    'Also choose a presentation behaviour and an optional short reaction that fit your reply.',
    'Set end_conversation to true only if the user is clearly saying goodbye.'
  ].join('\n');
  const input = messages.map((m) => ({
    role: m.role,
    content: [{ type: m.role === 'user' ? 'input_text' : 'output_text', text: m.text }]
  }));
  const result = await generateStructured({
    instructions,
    input,
    schemaName: 'companion_reply',
    schema: replySchema,
    maxOutputTokens: 400,
    temperature: 0.8
  });
  if (!result) return null;
  const { payload } = result;
  return {
    text: String(payload.reply).trim(),
    behaviour: BEHAVIOURS.includes(payload.behaviour) ? payload.behaviour : 'attentive',
    reaction: payload.reaction && payload.reaction !== 'none' ? payload.reaction : undefined,
    endConversation: Boolean(payload.end_conversation),
    provider: `${result.provider}:${result.model}`
  };
}
