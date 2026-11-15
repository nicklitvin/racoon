/**
 * Alarmie, on a Mac: finding it, and talking to its live talk. Alarmie is a separate app; the
 * pet only knows where it's installed and the endpoint its live talk listens on, and only sends
 * what you type into the chat. See docs/ALARMIE.md for what the endpoint takes and gives back.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ALARMIE_APP_NAME,
  ALARMIE_BUNDLE_IDS,
  NO_ALARMIE,
  liveTalkRequest,
  readReply,
  type AlarmieStatus,
  type ChatResult,
} from '../shared/alarmie';

/** How long the endpoint has to answer when we only want to know it's there. */
const PING_MS = 1500;
/** How long Alarmie has to answer a message. */
const REPLY_MS = 60_000;
/** How long Spotlight has to find the app. */
const SPOTLIGHT_MS = 3000;

function installedInApplications(): boolean {
  const name = `${ALARMIE_APP_NAME}.app`;
  return [path.join('/Applications', name), path.join(os.homedir(), 'Applications', name)].some((p) => fs.existsSync(p));
}

/** Spotlight, for an Alarmie.app anywhere else (a build folder, say). */
function foundBySpotlight(): Promise<boolean> {
  const ids = ALARMIE_BUNDLE_IDS.map((id) => `kMDItemCFBundleIdentifier == '${id}'c`).join(' || ');
  const query = `kMDItemContentType == 'com.apple.application-bundle' && (${ids} || kMDItemFSName == '${ALARMIE_APP_NAME}.app'c)`;
  return new Promise((resolve) => {
    execFile('mdfind', [query], { timeout: SPOTLIGHT_MS }, (error, stdout) => resolve(!error && stdout.trim() !== ''));
  });
}

/** Whether anything answers at the endpoint (any HTTP answer at all, even an error, counts). */
async function answers(endpoint: string): Promise<boolean> {
  try {
    await fetch(endpoint, { method: 'GET', signal: AbortSignal.timeout(PING_MS) });
    return true;
  } catch {
    return false;
  }
}

/**
 * Looks for Alarmie. Only on a Mac (`anyOs` lets a development build try it elsewhere): there it
 * counts as found if its app is installed, or if its live talk answers (while you're working
 * on Alarmie and running it from source).
 */
export async function findAlarmie(endpoint: string, anyOs = false): Promise<AlarmieStatus> {
  if (process.platform !== 'darwin' && !anyOs) return NO_ALARMIE;
  const [installed, reachable] = await Promise.all([
    process.platform === 'darwin' ? Promise.resolve(installedInApplications()).then((yes) => yes || foundBySpotlight()) : Promise.resolve(false),
    answers(endpoint),
  ]);
  return { installed, reachable, available: installed || reachable };
}

/** Sends one line of the chat and waits for Alarmie's answer. */
export async function sendToAlarmie(endpoint: string, message: string, conversationId: string | null): Promise<ChatResult> {
  const text = message.trim();
  if (!text) return { ok: false, error: 'Type something to say first.' };
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain' },
      body: JSON.stringify(liveTalkRequest(text, conversationId)),
      signal: AbortSignal.timeout(REPLY_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    return {
      ok: false,
      error: timedOut ? 'Alarmie took too long to answer.' : 'Couldn’t reach Alarmie. Is it open, with live talk on?',
    };
  }
  const body = await response.text().catch(() => '');
  if (!response.ok) return { ok: false, error: `Alarmie couldn’t answer (${response.status}${response.statusText ? ` ${response.statusText}` : ''}).` };
  const reply = readReply(body, response.headers.get('content-type'));
  return reply ? { ok: true, ...reply } : { ok: false, error: 'Alarmie answered with nothing to say.' };
}
