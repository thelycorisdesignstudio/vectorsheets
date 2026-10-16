import { useState, useSyncExternalStore, type FormEvent } from 'react';
import type { ConversationManager } from '../conversation/ConversationManager';

const PHASE_LABEL = {
  idle: 'Ready',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  ended: 'Conversation ended',
} as const;

/** Production conversation UI: captions, status, text + voice input. */
export function ConversationDock({ conversation, name, onFirstGesture }: { conversation: ConversationManager; name: string; onFirstGesture: () => void }) {
  const snap = useSyncExternalStore(conversation.subscribe, conversation.getSnapshot);
  const [text, setText] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onFirstGesture();
    const t = text;
    setText('');
    void conversation.send(t);
  };

  const caption = snap.phase === 'listening' || (snap.phase === 'thinking' && !snap.assistantCaption) ? snap.userCaption : snap.assistantCaption;
  const speaker = snap.phase === 'listening' || snap.phase === 'thinking' ? 'You' : name;

  return (
    <div className="dock">
      {caption && (
        <p className={`caption ${speaker === 'You' ? 'you' : ''}`} aria-live="polite">
          <span className="who">{speaker}</span>
          {caption}
        </p>
      )}
      <form className="composer" onSubmit={submit}>
        <span className={`phase phase-${snap.phase}`} aria-live="polite">
          <i />
          {PHASE_LABEL[snap.phase]}
        </span>
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            conversation.typing();
          }}
          placeholder={`Say something to ${name}…`}
          aria-label="Message"
        />
        {snap.voiceInput.available && (
          <button
            type="button"
            className={`icon ${snap.voiceInput.active ? 'on' : ''}`}
            aria-pressed={snap.voiceInput.active}
            title={snap.voiceInput.active ? 'Stop voice' : 'Talk with your voice'}
            onClick={() => {
              onFirstGesture();
              conversation.setVoiceInput(!snap.voiceInput.active);
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" /></svg>
          </button>
        )}
        <button type="submit" className="send" disabled={!text.trim()}>Send</button>
      </form>
      {snap.notice && <p className="notice">{snap.notice}</p>}
      <p className="mode-note">
        {snap.adapter.live ? snap.adapter.label : 'Demo mode · scripted replies'} · {snap.voice.audible ? snap.voice.label : 'captions only'}
      </p>
    </div>
  );
}
