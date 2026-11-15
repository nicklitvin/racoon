// Writes the patch notes (src/lib/patchNotes.ts) out as Swift for the Mac app
// (mac/Sources/PetCore/App/PatchNotes.swift), so both apps show the same notes.
// Run after adding a note: node scripts/swift-patch-notes.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('../src/lib/patchNotes.ts', import.meta.url), 'utf8');
const js = transformSync(source, { loader: 'ts', format: 'esm' }).code;
const { PATCH_NOTES } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

const str = (s) => JSON.stringify(s);
const notes = PATCH_NOTES.map(
  (n) =>
    `    PatchNote(date: ${str(n.date)}, title: ${str(n.title)}, changes: [\n${n.changes.map((c) => `        ${str(c)},`).join('\n')}\n    ]${n.beta ? ', beta: true' : ''}),`,
).join('\n');

writeFileSync(
  new URL('../mac/Sources/PetCore/App/PatchNotes.swift', import.meta.url),
  `// Generated from src/lib/patchNotes.ts by scripts/swift-patch-notes.mjs. Don't edit by hand.

public struct PatchNote: Identifiable {
    public var id: String { date + " " + title }
    /// ISO date, newest first.
    public let date: String
    public let title: String
    public let changes: [String]
    /// Brings in something still in beta: the note gets a Beta tag and a switch to try it.
    public var beta = false
}

public let PATCH_NOTES: [PatchNote] = [
${notes}
]

/// The newest note: its date stands in for the version in the settings.
public let LATEST_PATCH_NOTE = PATCH_NOTES[0]
`,
);
console.log(`Wrote ${PATCH_NOTES.length} notes.`);
