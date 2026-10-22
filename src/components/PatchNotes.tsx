import { PATCH_NOTES } from '../lib/patchNotes';
import { BUILD_DATE } from '../lib/version';

function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

interface PatchNotesProps {
  onBack: () => void;
  /** Whether beta pets are switched on, and switching them. */
  beta: boolean;
  onBeta: (on: boolean) => void;
}

/** What's changed, newest first, inside the settings panel, under the switch to try beta pets. */
export function PatchNotes({ onBack, beta, onBeta }: PatchNotesProps) {
  return (
    <div className="patch-notes">
      <header className="patch-notes-header">
        <button type="button" className="text-button" onClick={onBack}>
          ← Back
        </button>
        <h2>What&rsquo;s new</h2>
        <p className="hint">Running v{BUILD_DATE}</p>
      </header>

      <label className="switch beta-switch">
        <span className="switch-label">
          Try beta pets<span className="beta-tag">Beta</span>
        </span>
        <input type="checkbox" role="switch" checked={beta} onChange={(e) => onBeta(e.target.checked)} />
      </label>

      <ol className="patch-notes-list">
        {PATCH_NOTES.map((note) => (
          <li key={`${note.date} ${note.title}`} className={note.beta ? 'patch-note beta' : 'patch-note'}>
            <time className="patch-note-date" dateTime={note.date}>
              {formatDate(note.date)}
            </time>
            <h3>
              {note.title}
              {note.beta && <span className="beta-tag">Beta</span>}
            </h3>
            <ul>
              {note.changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The build currently running, linking to what changed. */
export function VersionChip({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="version-chip" onClick={onClick} title="What's new">
      v{BUILD_DATE}
    </button>
  );
}
