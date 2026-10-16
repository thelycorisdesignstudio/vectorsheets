import type { AssistantReply, ConversationAdapter, PersonaBrief, Turn } from '../types';
import type { Behaviour, ReactionKind } from '../../alien/types';

const BEHAVIOURS: Behaviour[] = ['neutral', 'attentive', 'curious', 'excited', 'calm', 'playful', 'thoughtful', 'reassuring'];
const REACTIONS: ReactionKind[] = ['surprise', 'delight', 'curious', 'giggle', 'acknowledge', 'yield', 'empathy'];

export interface CompanionStatus {
  configured: boolean;
  provider: string;
  model?: string;
}

/**
 * Talks to the project's own server (`/api/companion/*`), which forwards to
 * whatever model provider the server is configured for. The client never
 * sees credentials or provider details.
 */
export class HttpChatAdapter implements ConversationAdapter {
  readonly id = 'http';
  readonly live = true;
  label = 'Server model';
  constructor(private base = '/api/companion') {}

  static async status(base = '/api/companion'): Promise<CompanionStatus | null> {
    try {
      const r = await fetch(`${base}/status`, { headers: { Accept: 'application/json' } });
      if (!r.ok) return null;
      return (await r.json()) as CompanionStatus;
    } catch {
      return null;
    }
  }

  async respond(history: Turn[], persona: PersonaBrief, signal: AbortSignal): Promise<AssistantReply> {
    const r = await fetch(`${this.base}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona, messages: history.slice(-16).map(({ role, text }) => ({ role, text })) }),
      signal,
    });
    const body = await r.json().catch(() => null);
    if (!r.ok || !body?.text) throw new Error(body?.error || `Companion service error (${r.status})`);
    return {
      text: String(body.text),
      behaviour: BEHAVIOURS.includes(body.behaviour) ? body.behaviour : undefined,
      reaction: REACTIONS.includes(body.reaction) ? body.reaction : undefined,
      endConversation: !!body.endConversation,
      provider: String(body.provider ?? 'server'),
    };
  }
}
