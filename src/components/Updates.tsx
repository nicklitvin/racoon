import { useEffect, useState } from 'react';
import { INITIAL_UPDATE_STATUS, type UpdateStatus } from '../../shared/update';
import type { Host } from '../host';

/** Where updates are at, kept up to date as the main process checks and downloads. */
export function useUpdateStatus(host: Host): UpdateStatus {
  const [status, setStatus] = useState<UpdateStatus>(INITIAL_UPDATE_STATUS);
  useEffect(() => {
    let alive = true;
    void host.getUpdateStatus().then((s) => alive && setStatus(s));
    const off = host.onUpdateStatusChanged(setStatus);
    return () => {
      alive = false;
      off();
    };
  }, [host]);
  return status;
}

function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
}

const megabytes = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

/**
 * At the top of the settings while a newer build is out: what it is, and a button that
 * downloads and installs it (with how far the download's got).
 */
export function UpdateBanner({ host, status }: { host: Host; status: UpdateStatus }) {
  const { state, release, progress, message } = status;
  if (!release || (state !== 'available' && state !== 'downloading' && state !== 'installing')) return null;
  const mac = host.platform === 'darwin';
  const released = when(release.time);
  return (
    <div className="notice update-banner" role="status">
      <p>
        <strong>A new version of My Pet is out</strong>
        {released && <> ({released})</>}.
      </p>
      {state === 'downloading' && (
        <>
          <div className="update-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <span style={{ width: `${(progress * 100).toFixed(1)}%` }} />
          </div>
          <p className="hint">
            Downloading… {Math.round(progress * 100)}% of {megabytes(release.size)}
          </p>
        </>
      )}
      {state === 'installing' && <p className="hint">{message ?? (mac ? 'Opening it…' : 'Installing: My Pet will close and open again by itself.')}</p>}
      {state === 'available' && message && <p className="hint">{message}</p>}
      {state === 'available' && (
        <div className="notice-actions">
          <button type="button" onClick={() => void host.installUpdate()}>
            {mac ? 'Download update' : 'Update now'}
          </button>
          <button type="button" className="secondary" onClick={() => host.openReleasesPage()}>
            Releases page
          </button>
        </div>
      )}
    </div>
  );
}

/** A line in the settings saying whether you're up to date, with a button to check now. */
export function UpdateRow({ host, status }: { host: Host; status: UpdateStatus }) {
  if (status.state === 'unsupported') return null;
  const { state, checkedAt, message } = status;
  const line =
    state === 'checking'
      ? 'Checking…'
      : state === 'current'
        ? `You have the latest version${checkedAt ? ` (checked ${when(checkedAt)})` : ''}.`
        : state === 'available' || state === 'downloading' || state === 'installing'
          ? 'A new version is out: see the top of this page.'
          : state === 'error'
            ? message
            : 'Checks for new versions by itself every few hours.';
  return (
    <div className="switch-row update-row">
      <div className="switch">
        <span className="switch-label">Updates</span>
        <button type="button" className="text-button" disabled={state === 'checking' || state === 'downloading' || state === 'installing'} onClick={() => void host.checkForUpdate()}>
          Check now
        </button>
      </div>
      <p className={state === 'error' ? 'hint error' : 'hint'}>{line}</p>
    </div>
  );
}
