// Prints a release's notes as Markdown: what's new in it (the patch notes from
// src/lib/patchNotes.ts that the last release didn't have) and how to download it. Run with
// Node 24 or later, which reads the TypeScript files as they are.
//
//   node scripts/release-notes.mjs <commit> [last release's patchNotes.ts]
import { pathToFileURL } from 'node:url';
import { PATCH_NOTES } from '../src/lib/patchNotes.ts';

const [, , commit = '', before] = process.argv;
const seen = before ? new Set((await import(pathToFileURL(before).href)).PATCH_NOTES.map((note) => `${note.date} ${note.title}`)) : null;
// Without the last release's to go by, the newest day's.
const notes = seen ? PATCH_NOTES.filter((note) => !seen.has(`${note.date} ${note.title}`)) : PATCH_NOTES.filter((note) => note.date === PATCH_NOTES[0]?.date);

const lines = ["## What's new", ''];
for (const note of notes) {
  lines.push(`**${note.title}**${note.beta ? ' (beta: switch on "Try beta pets" in What\'s new)' : ''}`, '');
  for (const change of note.changes) lines.push(`- ${change}`);
  lines.push('');
}
if (!notes.length) lines.push('Small fixes and changes.', '');
lines.push(
  '## Download',
  '',
  '**Windows:** `My-Pet-Windows.exe`. Open it and My Pet sets itself up and starts (no admin rights needed). The app isn\'t code-signed, so Windows may say "Windows protected your PC": click **More info → Run anyway**. If you already have My Pet, it updates itself.',
  '',
  '**Mac:** `My-Pet-Mac.dmg` (Apple silicon, M1 and later). Open it and drag My Pet to Applications. It isn\'t notarized by Apple, so macOS blocks it at first (it may even say it\'s "damaged"). To let it run, open Terminal and run `xattr -cr "/Applications/My Pet.app"`, or try to open it once, then go to **System Settings → Privacy & Security** and click **Open Anyway**.',
  '',
);
if (commit) lines.push(`Built from ${commit}.`);
console.log(lines.join('\n'));
