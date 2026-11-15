import { MAX_MESSAGE_LENGTH, MAX_RECORDING_MS, type ChatResult, type SpokenClip } from '../../shared/alarmie';
import type { Rect } from '../../shared/ipc';
import type { TalkPhase } from '../core/behavior/brain';

export interface TalkHooks {
  /** Where the talk is at, for the pet to act it out (null: it's over). */
  phase(phase: TalkPhase | null): void;
  /** Sends what you typed to Alarmie. */
  send(message: string, conversationId: string | null, audio?: SpokenClip | null): Promise<ChatResult>;
  /** The page needs the keyboard (true) while the bubble's open, and can let it go after. */
  keyboard(on: boolean): void;
  /** Something changed that the page should look at again (what to hold the mouse over). */
  changed(): void;
}

/** How long an answer stays up once you've gone back to something else: long enough to read. */
const READ_MS = { min: 6000, perChar: 60, max: 30_000 };
/** Room to leave between the bubble and the edges of the screen. */
const EDGE_PX = 8;

/** The sound types to record in, best first (whichever the system has). */
const RECORD_TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];

/**
 * Talking to Alarmie through the pet: his speech bubble with a box to type in. You type,
 * press Enter, and he thinks (dots in the bubble, his head tilting); Alarmie's answer comes
 * back in the same bubble, with the box under it to answer back. Or press the mic and say
 * it: press it again (or Enter) to send what you said, for Alarmie to hear. Escape, the ×,
 * or clicking somewhere else puts it away. The conversation carries on until it closes.
 */
export class TalkBubble {
  readonly el: HTMLElement;
  private readonly said: HTMLElement;
  private readonly input: HTMLTextAreaElement;
  private readonly mic: HTMLButtonElement;
  /** Recording from the mic, while you speak. */
  private recording: { recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; send: boolean; timer: ReturnType<typeof setTimeout> } | null = null;
  private phase: TalkPhase | null = null;
  private conversation: string | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | undefined;
  /** Counts sends, so an answer to a bubble since closed is dropped. */
  private asking = 0;
  private readonly cleanups: (() => void)[] = [];

  constructor(
    private readonly doc: Document,
    parent: HTMLElement,
    private readonly stage: HTMLElement,
    private readonly hooks: TalkHooks,
  ) {
    const el = doc.createElement('div');
    el.className = 'talk';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Talk to Alarmie');
    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'talk-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '×';
    const said = doc.createElement('p');
    said.className = 'talk-said';
    said.setAttribute('aria-live', 'polite');
    const thinking = doc.createElement('div');
    thinking.className = 'talk-thinking';
    thinking.setAttribute('aria-label', 'Thinking');
    thinking.append(doc.createElement('span'), doc.createElement('span'), doc.createElement('span'));
    const input = doc.createElement('textarea');
    input.className = 'talk-input';
    input.rows = 1;
    input.maxLength = MAX_MESSAGE_LENGTH;
    input.spellcheck = true;
    input.setAttribute('aria-label', 'Message to Alarmie');
    const mic = doc.createElement('button');
    mic.type = 'button';
    mic.className = 'talk-mic';
    mic.setAttribute('aria-label', 'Speak');
    mic.title = 'Speak to Alarmie';
    mic.innerHTML =
      '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" fill="currentColor"/>' +
      '<path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5M5.5 14.5h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
    const row = doc.createElement('div');
    row.className = 'talk-row';
    row.append(input, mic);
    el.append(close, said, thinking, row);
    this.mic = mic;
    parent.append(el);
    this.el = el;
    this.said = said;
    this.input = input;

    // The bubble is his, but clicks in it aren't pats or drags.
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click'] as const) {
      const stop = (e: Event) => e.stopPropagation();
      el.addEventListener(type, stop);
      this.cleanups.push(() => el.removeEventListener(type, stop));
    }
    const onClose = () => this.close();
    close.addEventListener('click', onClose);
    const onMic = () => (this.recording ? this.stopRecording(true) : void this.startRecording());
    mic.addEventListener('click', onMic);
    const onKey = (e: KeyboardEvent) => this.onKey(e);
    input.addEventListener('keydown', onKey);
    const onInput = () => this.grow();
    input.addEventListener('input', onInput);
    const view = doc.defaultView;
    const onBlur = () => this.onBlur();
    const onFocus = () => this.phase !== 'think' && this.phase !== null && input.focus();
    view?.addEventListener('blur', onBlur);
    view?.addEventListener('focus', onFocus);
    this.cleanups.push(() => {
      close.removeEventListener('click', onClose);
      mic.removeEventListener('click', onMic);
      input.removeEventListener('keydown', onKey);
      input.removeEventListener('input', onInput);
      view?.removeEventListener('blur', onBlur);
      view?.removeEventListener('focus', onFocus);
    });
  }

  get isOpen(): boolean {
    return this.phase !== null;
  }

  /** Opens the bubble to type in, or (open already) puts the cursor back in it. */
  open(): void {
    clearTimeout(this.closeTimer);
    if (!this.phase) {
      this.conversation = null;
      this.said.textContent = '';
      this.input.value = '';
      this.setPhase('listen');
    }
    this.hooks.keyboard(true);
    if (this.phase !== 'think') this.focusInput();
  }

  /** Puts the bubble away; the talk is over. */
  close(): void {
    if (!this.phase) return;
    clearTimeout(this.closeTimer);
    this.stopRecording(false);
    this.asking++;
    this.input.blur();
    this.setPhase(null);
    this.hooks.keyboard(false);
  }

  /** The bubble's box on the page, for the mouse to be caught over it, or null if it's shut. */
  rect(): Rect | null {
    if (!this.phase) return null;
    const r = this.el.getBoundingClientRect();
    return r.width ? { x: r.left, y: r.top, width: r.width, height: r.height } : null;
  }

  /**
   * Keeps it on the screen: above his head, or under him if there's no room above, and slid
   * along to stay clear of the sides. Called as he moves.
   */
  fit(): void {
    if (!this.phase) return;
    const area = this.stage.getBoundingClientRect();
    const el = this.el;
    // Measured where it would be with no adjustments.
    const shift = parseFloat(el.style.getPropertyValue('--talk-shift')) || 0;
    const r = el.getBoundingClientRect();
    const left = r.left - shift;
    const right = r.right - shift;
    let next = 0;
    if (left < area.left + EDGE_PX) next = area.left + EDGE_PX - left;
    else if (right > area.right - EDGE_PX) next = area.right - EDGE_PX - right;
    if (Math.abs(next - shift) > 0.5) el.style.setProperty('--talk-shift', `${Math.round(next)}px`);
    const below = el.classList.contains('below');
    const parent = el.parentElement?.getBoundingClientRect();
    if (!parent) return;
    // Room for it above his head (where it would go), from the top of the screen.
    const height = r.height;
    const above = parent.top + parent.height * 0.12 - height - 10;
    const fitsAbove = above >= area.top + EDGE_PX;
    if (fitsAbove === below) el.classList.toggle('below', !fitsAbove);
  }

  destroy(): void {
    clearTimeout(this.closeTimer);
    this.stopRecording(false);
    this.cleanups.splice(0).forEach((off) => off());
    this.el.remove();
  }

  private setPhase(phase: TalkPhase | null): void {
    this.phase = phase;
    const el = this.el;
    el.classList.toggle('show', phase !== null);
    for (const p of ['listen', 'think', 'answer'] as const) el.classList.toggle(p, phase === p);
    this.input.disabled = phase === 'think';
    this.mic.disabled = phase === 'think';
    this.input.placeholder = phase === 'answer' ? 'Reply…' : 'Ask Alarmie…';
    this.hooks.phase(phase);
    this.hooks.changed();
    this.grow();
  }

  private focusInput(): void {
    // Once the page has the keyboard (just asked for).
    requestAnimationFrame(() => this.phase && this.phase !== 'think' && this.input.focus());
  }

  /** The box grows with what you type, up to a few lines. */
  private grow(): void {
    const input = this.input;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 96)}px`;
    this.hooks.changed();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      // Escape while speaking stops without sending; otherwise it puts the bubble away.
      if (this.recording) this.stopRecording(false);
      else this.close();
    } else if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (this.recording) this.stopRecording(true);
      else void this.send();
    }
  }

  private onBlur(): void {
    // Gone to another app. A box with nothing typed in it goes away; anything typed waits
    // for you to come back to it; an answer stays up long enough to read.
    if (this.recording) return;
    if (this.phase === 'listen' && !this.input.value.trim()) this.close();
    else if (this.phase === 'answer') this.closeAfterReading();
  }

  private closeAfterReading(): void {
    clearTimeout(this.closeTimer);
    const ms = Math.min(READ_MS.max, Math.max(READ_MS.min, (this.said.textContent?.length ?? 0) * READ_MS.perChar));
    this.closeTimer = setTimeout(() => {
      if (this.phase === 'answer' && !this.doc.hasFocus()) this.close();
    }, ms);
  }

  /** Starts listening to the mic. */
  private async startRecording(): Promise<void> {
    if (this.recording || this.phase === 'think' || !this.phase) return;
    const media = this.doc.defaultView?.navigator.mediaDevices;
    let stream: MediaStream;
    try {
      if (!media || typeof MediaRecorder === 'undefined') throw new Error('no mic');
      stream = await media.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      this.showError('Couldn’t use the microphone. Check that My Pet is allowed to use it (System Settings > Privacy & Security > Microphone).');
      return;
    }
    const now = this.phase as TalkPhase | null;
    if (!now || now === 'think') {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    const mimeType = RECORD_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const rec = { recorder, stream, chunks: [] as Blob[], send: false, timer: setTimeout(() => this.stopRecording(true), MAX_RECORDING_MS) };
    recorder.addEventListener('dataavailable', (e) => e.data.size && rec.chunks.push(e.data));
    recorder.addEventListener('stop', () => {
      stream.getTracks().forEach((t) => t.stop());
      if (rec.send && rec.chunks.length) void this.sendClip(new Blob(rec.chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }));
    });
    recorder.start();
    this.recording = rec;
    this.el.classList.remove('error');
    this.el.classList.add('recording');
    this.mic.setAttribute('aria-label', 'Send what you said');
    this.input.placeholder = 'Listening… press the mic again to send';
    this.input.focus();
  }

  /** Stops listening to the mic, and sends what you said (or throws it away). */
  private stopRecording(send: boolean): void {
    const rec = this.recording;
    if (!rec) return;
    this.recording = null;
    clearTimeout(rec.timer);
    rec.send = send;
    if (rec.recorder.state !== 'inactive') rec.recorder.stop();
    else rec.stream.getTracks().forEach((t) => t.stop());
    this.el.classList.remove('recording');
    this.mic.setAttribute('aria-label', 'Speak');
    if (this.phase) this.input.placeholder = this.phase === 'answer' ? 'Reply…' : 'Ask Alarmie…';
  }

  private async sendClip(blob: Blob): Promise<void> {
    const data = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
    if (!data) return this.showError('Couldn’t record that. Try again?');
    await this.ask('', { data, mimeType: blob.type.replace(/\s+/g, '') });
  }

  /** Something went wrong before Alarmie was even asked: said in the bubble, which stays open. */
  private showError(message: string): void {
    if (!this.phase) return;
    this.said.textContent = message;
    this.el.classList.add('error');
    this.setPhase(this.phase === 'think' ? 'answer' : this.phase);
  }

  private async send(): Promise<void> {
    const text = this.input.value.trim();
    if (!text) return;
    await this.ask(text, null);
  }

  private async ask(text: string, audio: SpokenClip | null): Promise<void> {
    if (this.phase === 'think' || !this.phase) return;
    clearTimeout(this.closeTimer);
    const ask = ++this.asking;
    this.el.classList.remove('error');
    this.said.textContent = '';
    this.setPhase('think');
    const result = await this.hooks.send(text, this.conversation, audio);
    // Closed (or something else asked) while Alarmie was answering.
    if (ask !== this.asking || (this.phase as TalkPhase | null) !== 'think') return;
    if (result.ok) {
      this.conversation = result.conversationId ?? this.conversation;
      this.said.textContent = result.reply;
      if (text) this.input.value = '';
    } else {
      // What you typed stays in the box, to send again.
      this.said.textContent = result.error;
      this.el.classList.add('error');
    }
    this.setPhase('answer');
    if (this.doc.hasFocus()) this.focusInput();
    else this.closeAfterReading();
  }
}
