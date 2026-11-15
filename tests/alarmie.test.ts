import { describe, expect, it } from 'vitest';
import { ALARMIE_DEFAULT_ENDPOINT, cleanEndpoint, liveTalkRequest, MAX_MESSAGE_LENGTH, readReply } from '../shared/alarmie';
import { DEFAULT_SETTINGS, normalizeSettings } from '../shared/settings';

describe('Alarmie settings', () => {
  it('keeps the chat off unless switched on', () => {
    expect(DEFAULT_SETTINGS.alarmieChat).toBe(false);
    expect(normalizeSettings({ alarmieChat: 'yes' }).alarmieChat).toBe(false);
    expect(normalizeSettings({ alarmieChat: true }).alarmieChat).toBe(true);
  });

  it('keeps only http and https endpoints, falling back to the usual one', () => {
    expect(DEFAULT_SETTINGS.alarmieEndpoint).toBe(ALARMIE_DEFAULT_ENDPOINT);
    expect(normalizeSettings({ alarmieEndpoint: ' http://localhost:9000/talk ' }).alarmieEndpoint).toBe('http://localhost:9000/talk');
    expect(normalizeSettings({ alarmieEndpoint: 'https://alarmie.example/live' }).alarmieEndpoint).toBe('https://alarmie.example/live');
    for (const bad of ['', 'localhost:9000', 'file:///etc/passwd', 'javascript:alert(1)', 42, null, `http://x/${'a'.repeat(400)}`]) {
      expect(normalizeSettings({ alarmieEndpoint: bad }).alarmieEndpoint, String(bad)).toBe(ALARMIE_DEFAULT_ENDPOINT);
    }
    expect(cleanEndpoint('ws://localhost:1')).toBeNull();
  });
});

describe('talking to Alarmie', () => {
  it('sends the message, the conversation so far and who it is from', () => {
    expect(liveTalkRequest('hi', null)).toEqual({ message: 'hi', conversationId: null, client: 'my-pet' });
    expect(liveTalkRequest('x'.repeat(MAX_MESSAGE_LENGTH + 10), 'c1').message).toHaveLength(MAX_MESSAGE_LENGTH);
  });

  it('reads a JSON reply and its conversation id', () => {
    expect(readReply('{"reply":" Morning! ","conversationId":"abc"}', 'application/json')).toEqual({ reply: 'Morning!', conversationId: 'abc' });
    expect(readReply('{"message":"Hey","conversation_id":7}', 'application/json; charset=utf-8')).toEqual({ reply: 'Hey', conversationId: '7' });
    expect(readReply('{"text":"Yo"}', null)).toEqual({ reply: 'Yo', conversationId: null });
  });

  it('takes a plain text body as the reply', () => {
    expect(readReply('Rise and shine', 'text/plain')).toEqual({ reply: 'Rise and shine', conversationId: null });
    expect(readReply('{not json', 'text/plain')).toEqual({ reply: '{not json', conversationId: null });
  });

  it('has nothing to show for an empty answer, or JSON without a reply', () => {
    expect(readReply('   ', 'text/plain')).toBeNull();
    expect(readReply('{"ok":true}', 'application/json')).toBeNull();
  });
});
