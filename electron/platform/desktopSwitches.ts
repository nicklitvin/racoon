/**
 * Notices Windows switching virtual desktop (Ctrl+Win+arrows, Task View, a four-finger swipe).
 *
 * The pet's window is on every desktop, so while the old desktop slides away and the new one
 * slides in, he's carried off with it and comes back from the other side. Explorer writes the
 * desktop it's switching to in the registry as the slide starts (about 20 ms after the keys),
 * so reading that often is enough to put him away before the slide shows him.
 *
 * Only reads one registry value: nothing about the user's windows or input.
 */

type Koffi = typeof import('koffi');

const HKCU = 0x80000001;
const RRF_RT_REG_BINARY = 0x00000008;
const VALUE = 'CurrentVirtualDesktop';
const EXPLORER = 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer';
const POLL_MS = 15;

/** Calls `onSwitch` each time the desktop changes. Returns a function that stops watching, or null if it can't watch. */
export function watchDesktopSwitches(onSwitch: () => void): (() => void) | null {
  let read: () => string;
  try {
    read = desktopReader(require('koffi') as Koffi);
  } catch {
    return null;
  }
  let last = read();
  const timer = setInterval(() => {
    const now = read();
    if (now === last) return;
    last = now;
    onSwitch();
  }, POLL_MS);
  return () => clearInterval(timer);
}

/** Reads which desktop is showing, as a string that changes whenever it does (empty with only one desktop). */
function desktopReader(koffi: Koffi): () => string {
  const kernel32 = koffi.load('kernel32.dll');
  const advapi32 = koffi.load('advapi32.dll');
  const ProcessIdToSessionId = kernel32.func('bool __stdcall ProcessIdToSessionId(uint32_t pid, _Out_ uint32_t *session)');
  const RegGetValueW = advapi32.func(
    'long __stdcall RegGetValueW(uintptr_t key, str16 subKey, str16 value, uint32_t flags, _Out_ uint32_t *type, _Out_ uint8_t *data, _Inout_ uint32_t *size)',
  );
  const session = [0];
  ProcessIdToSessionId(process.pid, session);
  // Windows 10 keeps it per sign-in session; Windows 11 in the one place.
  const places = [`${EXPLORER}\\SessionInfo\\${session[0]}\\VirtualDesktops`, `${EXPLORER}\\VirtualDesktops`];
  const data = Buffer.alloc(16);
  return () => {
    for (const place of places) {
      const size = [data.length];
      if (RegGetValueW(HKCU, place, VALUE, RRF_RT_REG_BINARY, [0], data, size) === 0) return data.toString('hex', 0, size[0]);
    }
    return '';
  };
}
