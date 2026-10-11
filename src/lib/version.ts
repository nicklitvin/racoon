import { LATEST_PATCH_NOTE } from './patchNotes';

declare const __BUILD_DATE__: string | undefined;

// Stamped at build time by vite.config.mts, so what the settings show is the date of the
// build actually running, which is the question you're asking when you look at it after an
// update ("is my change in?").
//
// In dev there is no stamp, so it falls back to the newest patch note.
export const BUILD_DATE: string = typeof __BUILD_DATE__ === 'string' && __BUILD_DATE__ ? __BUILD_DATE__ : LATEST_PATCH_NOTE.date;
