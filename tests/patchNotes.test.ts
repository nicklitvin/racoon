import { describe, expect, it } from 'vitest';
import { LATEST_PATCH_NOTE, PATCH_NOTES } from '../src/lib/patchNotes';
import { BUILD_DATE } from '../src/lib/version';

describe('patch notes', () => {
  it('lists dated changes, newest first', () => {
    expect(PATCH_NOTES.length).toBeGreaterThan(0);
    expect(LATEST_PATCH_NOTE).toBe(PATCH_NOTES[0]);
    for (const note of PATCH_NOTES) {
      expect(note.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(note.title.trim()).not.toBe('');
      expect(note.changes.length).toBeGreaterThan(0);
    }
    const dates = PATCH_NOTES.map((note) => note.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('has a version: the build date', () => {
    expect(BUILD_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
