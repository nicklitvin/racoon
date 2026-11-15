// Talking to Alarmie's live talk from the pet, on a Mac where Alarmie is. Shared by the main
// process (which finds Alarmie and does the talking) and the page (the settings and the chat).
// The Swift app (mac/) speaks the same way; docs/ALARMIE.md describes it for Alarmie's side.

/** Where Alarmie's live talk listens unless the settings say otherwise. */
export const ALARMIE_DEFAULT_ENDPOINT = 'http://127.0.0.1:4318/live-talk';

/** Longest endpoint the settings keep. */
const MAX_ENDPOINT_LENGTH = 300;
/** Longest message sent in one go, and longest reply shown. */
export const MAX_MESSAGE_LENGTH = 4000;

/** Where to look for Alarmie, and what it's called there. */
export const ALARMIE_APP_NAME = 'Alarmie';
export const ALARMIE_BUNDLE_IDS = ['com.nicklitvin.alarmie', 'com.nicklitvin.Alarmie'] as const;

export interface AlarmieStatus {
  /** Alarmie's app is installed (found in Applications, or by Spotlight). */
  installed: boolean;
  /** Its live talk answered at the endpoint. */
  reachable: boolean;
  /** Clicking the pet can open the chat: on a Mac, with Alarmie found either way. */
  available: boolean;
}

export const NO_ALARMIE: AlarmieStatus = { installed: false, reachable: false, available: false };

/** One line of the chat. */
export interface ChatMessage {
  from: 'me' | 'alarmie';
  text: string;
}

/** What's sent to the endpoint, as JSON. */
export interface LiveTalkRequest {
  message: string;
  /** Alarmie's id for the conversation so far, from its last reply; null to start a new one. */
  conversationId: string | null;
  /** Who's asking, so Alarmie can tell the pet from its own app. */
  client: 'my-pet';
}

export type ChatResult = { ok: true; reply: string; conversationId: string | null } | { ok: false; error: string };

/** A usable http(s) endpoint, trimmed, or null. */
export function cleanEndpoint(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value || value.length > MAX_ENDPOINT_LENGTH) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

export function liveTalkRequest(message: string, conversationId: string | null): LiveTalkRequest {
  return { message: message.slice(0, MAX_MESSAGE_LENGTH), conversationId, client: 'my-pet' };
}

/**
 * Alarmie's answer, from the body of its response: JSON with `reply` (or `message` or `text`)
 * and maybe a `conversationId`, or else the plain text of the body.
 */
export function readReply(body: string, contentType: string | null): { reply: string; conversationId: string | null } | null {
  const text = body.trim();
  if (!text) return null;
  const json = /json/i.test(contentType ?? '') || text.startsWith('{');
  if (json) {
    try {
      const data = JSON.parse(text) as Record<string, unknown>;
      const reply = [data.reply, data.message, data.text].find((v): v is string => typeof v === 'string' && v.trim() !== '');
      const id = data.conversationId ?? data.conversation_id;
      if (reply) {
        return {
          reply: reply.trim().slice(0, MAX_MESSAGE_LENGTH),
          conversationId: typeof id === 'string' && id ? id : typeof id === 'number' ? String(id) : null,
        };
      }
      return null;
    } catch {
      // Not JSON after all: the text is the reply.
    }
  }
  return { reply: text.slice(0, MAX_MESSAGE_LENGTH), conversationId: null };
}
