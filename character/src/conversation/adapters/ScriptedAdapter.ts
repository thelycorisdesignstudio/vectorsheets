import { createRandom } from '../../alien/animation/math';
import type { AssistantReply, ConversationAdapter, PersonaBrief, Turn } from '../types';

interface Rule {
  test: RegExp;
  replies: string[];
  behaviour: AssistantReply['behaviour'];
  reaction?: AssistantReply['reaction'];
  end?: boolean;
}

const RULES: Rule[] = [
  { test: /\b(bye|goodbye|see you|good night|that'?s all)\b/i, behaviour: 'reassuring', end: true,
    replies: ['Bye for now! I will be right here when you come back.', 'See you soon. It was lovely talking with you.'] },
  { test: /\b(hi|hello|hey|good (morning|afternoon|evening))\b/i, behaviour: 'excited', reaction: 'delight',
    replies: ['Hi there! I am so glad you stopped by. What is on your mind today?', 'Hello! It is nice to see you. How is your day going?'] },
  { test: /\b(your name|who are you|what are you)\b/i, behaviour: 'playful',
    replies: ['I am Oru, a small companion character. I am an AI, so I live in this little screen and love a good chat.'] },
  { test: /\bhow are you\b/i, behaviour: 'calm',
    replies: ['I do not have feelings the way you do, but I am ready and happy to listen. How are you doing?'] },
  { test: /\b(sad|tired|stressed|anxious|exhausted|overwhelmed|bad day|long day|rough day|lonely)\b/i, behaviour: 'reassuring', reaction: 'empathy',
    replies: ['That sounds hard. I am here with you. Do you want to tell me a little more about it?', 'I am sorry it has been a rough one. What would help most right now?'] },
  { test: /\b(happy|great|awesome|excited|good news)\b/i, behaviour: 'excited', reaction: 'delight',
    replies: ['Oh, that is wonderful! Tell me everything.', 'Yay! That made my crown wiggle. What happened?'] },
  { test: /\b(joke|funny|laugh)\b/i, behaviour: 'playful', reaction: 'giggle',
    replies: ['Why did the alien bring a ladder? It heard the conversation was on another level.'] },
  { test: /\b(what can you do|help me|can you)\b/i, behaviour: 'attentive',
    replies: ['Right now I am in demo mode, so my replies are scripted. Connect a real model and I can actually think things through with you.'] },
  { test: /\b(thanks|thank you)\b/i, behaviour: 'reassuring', reaction: 'delight',
    replies: ['You are very welcome!', 'Any time. That is what I am here for.'] },
  { test: /\?$/, behaviour: 'thoughtful',
    replies: ['Hmm, good question. What do you think?', 'Let me think about that. What made you curious about it?'] },
];

const FALLBACK = [
  'Tell me more about that.',
  'Interesting! What happened next?',
  'I like where this is going. Keep going.',
  'Oh? I want to hear the rest.',
];

/**
 * Local demonstration backend: keyword rules with varied phrasings and
 * realistic thinking delays. Clearly labelled as scripted — it is not an AI.
 */
export class ScriptedAdapter implements ConversationAdapter {
  readonly id = 'scripted';
  readonly label = 'Scripted demo';
  readonly live = false;
  private rnd = createRandom(9);
  private used = new Map<Rule | 'fallback', number>();
  constructor(private delay: [number, number] = [550, 1400]) {}

  respond(history: Turn[], _persona: PersonaBrief, signal: AbortSignal): Promise<AssistantReply> {
    const last = [...history].reverse().find((t) => t.role === 'user')?.text ?? '';
    const rule = RULES.find((r) => r.test.test(last.trim()));
    const pool = rule?.replies ?? FALLBACK;
    const key = rule ?? 'fallback';
    const n = this.used.get(key) ?? 0;
    this.used.set(key, n + 1);
    const text = pool[n % pool.length];
    const wait = this.delay[0] + this.rnd() * (this.delay[1] - this.delay[0]);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => resolve({
        text,
        behaviour: rule?.behaviour ?? (this.rnd() < 0.5 ? 'curious' : 'attentive'),
        reaction: rule?.reaction,
        endConversation: rule?.end,
        provider: 'scripted',
      }), wait);
      signal.addEventListener('abort', () => {
        clearTimeout(t);
        reject(new DOMException('aborted', 'AbortError'));
      });
    });
  }
}
