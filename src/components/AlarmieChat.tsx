import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { MAX_MESSAGE_LENGTH, type ChatMessage } from '../../shared/alarmie';
import type { Host } from '../host';

/**
 * The chat with Alarmie's live talk, in its own window, opened by clicking the pet. The
 * conversation lasts as long as the window: closing it starts afresh next time.
 */
export function AlarmieChat({ host }: { host: Host }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversation = useRef<string | null>(null);
  const log = useRef<HTMLOListElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    document.title = 'Talk to Alarmie';
    input.current?.focus();
  }, []);

  // Down to the newest line as they come in.
  useEffect(() => {
    log.current?.lastElementChild?.scrollIntoView({ block: 'end' });
  }, [messages, waiting]);

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || waiting) return;
    setMessages((m) => [...m, { from: 'me', text }]);
    setDraft('');
    setError(null);
    setWaiting(true);
    const result = await host.sendChat(text, conversation.current);
    setWaiting(false);
    if (result.ok) {
      conversation.current = result.conversationId ?? conversation.current;
      setMessages((m) => [...m, { from: 'alarmie', text: result.reply }]);
    } else {
      setError(result.error);
    }
    input.current?.focus();
  };

  // Enter sends; Shift+Enter for a new line.
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <section className="chat" aria-label="Talk to Alarmie">
      <header className="chat-header">
        <h1>Alarmie</h1>
        <span className="chat-sub">Live talk</span>
      </header>
      <ol className="chat-log" ref={log} aria-live="polite">
        {messages.length === 0 && !waiting && <li className="chat-empty">Say hi to Alarmie.</li>}
        {messages.map((m, i) => (
          <li key={i} className={m.from === 'me' ? 'chat-line me' : 'chat-line alarmie'}>
            {m.text}
          </li>
        ))}
        {waiting && (
          <li className="chat-line alarmie typing" aria-label="Alarmie is answering">
            <span />
            <span />
            <span />
          </li>
        )}
      </ol>
      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}
      <form className="chat-input" onSubmit={(e) => void send(e)}>
        <textarea
          ref={input}
          rows={2}
          value={draft}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="Message Alarmie"
          aria-label="Message"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
        />
        <button type="submit" disabled={!draft.trim() || waiting}>
          Send
        </button>
      </form>
    </section>
  );
}
