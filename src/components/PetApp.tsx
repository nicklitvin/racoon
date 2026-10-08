import { useEffect, useRef, useState } from 'react';
import type { DisplayInfo } from '../../shared/ipc';
import type { Settings } from '../../shared/settings';
import { onOpenSettingsRequest, type Host } from '../host';
import { PetRuntime } from '../runtime/petRuntime';
import { SettingsPanel } from './SettingsPanel';

interface PetAppProps {
  host: Host;
}

/**
 * The raccoon's page. React only builds the static elements; the runtime animates
 * them directly, so nothing here re-renders per frame.
 */
export function PetApp({ host }: PetAppProps) {
  const [display, setDisplay] = useState<DisplayInfo | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const petRef = useRef<HTMLDivElement>(null);
  const spriteRef = useRef<HTMLDivElement>(null);
  const emoteRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<PetRuntime | null>(null);

  useEffect(() => {
    let alive = true;
    void host.getDisplay().then((d) => alive && setDisplay(d));
    void host.getSettings().then((s) => alive && setSettings(s));
    const offDisplay = host.onDisplayChanged(setDisplay);
    const offSettings = host.onSettingsChanged(setSettings);
    const offOpen = onOpenSettingsRequest(() => setPanelOpen(true));
    return () => {
      alive = false;
      offDisplay();
      offSettings();
      offOpen();
    };
  }, [host]);

  const ready = display !== null && settings !== null;

  // Create the runtime once everything it needs exists.
  useEffect(() => {
    if (!ready || runtimeRef.current) return;
    const stage = stageRef.current;
    const pet = petRef.current;
    const sprite = spriteRef.current;
    const emote = emoteRef.current;
    if (!stage || !pet || !sprite || !emote) return;
    const runtime = new PetRuntime(host, { stage, pet, sprite, emote }, display, settings);
    runtime.start();
    runtimeRef.current = runtime;
    return () => {
      runtime.stop();
      runtimeRef.current = null;
    };
    // Display and settings changes are pushed into the running runtime by the effects below,
    // so they're deliberately not dependencies here.
  }, [ready, host]);

  useEffect(() => {
    if (display) runtimeRef.current?.setDisplay(display);
  }, [display]);

  useEffect(() => {
    if (settings) runtimeRef.current?.setSettings(settings);
  }, [settings]);

  const web = host.kind === 'web';

  return (
    <>
      {web && (
        <div className="web-chrome">
          <p className="web-hint">
            Meet the raccoon. Drag it, click it, or shake your mouse to start a chase.
          </p>
          <button type="button" className="gear" onClick={() => setPanelOpen((o) => !o)} aria-label="Settings">
            ⚙
          </button>
        </div>
      )}
      <div className="stage" ref={stageRef}>
        {ready && (
          <div className="pet" ref={petRef}>
            <div className="emote" ref={emoteRef} aria-hidden="true" />
            <div className="sprite" ref={spriteRef} />
          </div>
        )}
      </div>
      {web && panelOpen && (
        <div className="panel-overlay">
          <SettingsPanel host={host} onClose={() => setPanelOpen(false)} />
        </div>
      )}
    </>
  );
}
