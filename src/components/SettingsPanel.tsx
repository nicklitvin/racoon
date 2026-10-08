import { useEffect, useState } from 'react';
import { RACCOON_TYPES, type KeyboardStatus, type RaccoonType, type Settings } from '../../shared/settings';
import type { Host } from '../host';
import { RACCOON_STYLES } from '../sprites';

interface SettingsPanelProps {
  host: Host;
  onClose?: () => void;
}

function useHostState(host: Host) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [keyboard, setKeyboard] = useState<KeyboardStatus | null>(null);

  useEffect(() => {
    let alive = true;
    void host.getSettings().then((s) => alive && setSettings(s));
    void host.getKeyboardStatus().then((s) => alive && setKeyboard(s));
    const offSettings = host.onSettingsChanged(setSettings);
    const offKeyboard = host.onKeyboardStatusChanged(setKeyboard);
    return () => {
      alive = false;
      offSettings();
      offKeyboard();
    };
  }, [host]);

  return { settings, keyboard };
}

interface TypePickerProps {
  value: RaccoonType;
  onChange: (value: RaccoonType) => void;
}

function TypePicker({ value, onChange }: TypePickerProps) {
  return (
    <fieldset className="field type-picker">
      <legend>Raccoon type</legend>
      {RACCOON_TYPES.map((type) => {
        const style = RACCOON_STYLES[type];
        return (
          <label key={type} className={type === value ? 'type-option selected' : 'type-option'}>
            <input type="radio" name="raccoonType" checked={type === value} onChange={() => onChange(type)} />
            <span className="type-name">{style.label}</span>
            <span className="type-description">{style.description}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

export function SettingsPanel({ host, onClose }: SettingsPanelProps) {
  const { settings, keyboard } = useHostState(host);
  if (!settings) return null;

  const update = (patch: Partial<Settings>) => void host.updateSettings(patch);
  const desktop = host.kind === 'electron';
  const blocked = settings.keyboardReactions && keyboard && !keyboard.listening && keyboard.message;

  return (
    <section className="settings" aria-label="Racoon settings">
      <header className="settings-header">
        <h1>Racoon settings</h1>
        {onClose && (
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        )}
      </header>

      <TypePicker value={settings.raccoonType} onChange={(raccoonType) => update({ raccoonType })} />

      {/* Everything else is desktop-only: the web gear just picks the raccoon. */}
      {desktop && (
        <>
          <div className="field">
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.keyboardReactions}
                onChange={(e) => update({ keyboardReactions: e.target.checked })}
              />
              <span>React to typing</span>
            </label>
            <div className="privacy">
              <p>
                <strong>What this measures:</strong> only <em>that</em> a key was pressed, and when. Racoon counts key presses
                over the last few seconds to work out your typing rate. When you type steadily, the raccoon peeks up from the
                bottom of the screen and watches.
              </p>
              <p>
                <strong>What it never does:</strong> it never reads which keys or characters you press, and never records,
                stores, logs or sends them anywhere. Timestamps older than a few seconds are thrown away. Nothing leaves
                your computer.
              </p>
              <p>Counting works system-wide while this is on, and stops completely when you switch it off.</p>
            </div>
            {blocked && (
              <div className="notice" role="status">
                <p>{keyboard.message}</p>
                {keyboard.access === 'denied' && (
                  <div className="notice-actions">
                    <button type="button" onClick={() => host.openKeyboardPrivacySettings()}>
                      Open System Settings
                    </button>
                    <button type="button" onClick={() => void host.recheckKeyboardAccess()}>
                      Check again
                    </button>
                  </div>
                )}
              </div>
            )}
            {settings.keyboardReactions && keyboard?.listening && <p className="hint ok">Counting key presses.</p>}
          </div>
          <div className="field">
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.launchAtLogin}
                onChange={(e) => update({ launchAtLogin: e.target.checked })}
              />
              <span>Start when I log in</span>
            </label>
            <p className="hint">Applies to the installed app, not to development builds.</p>
          </div>
        </>
      )}

      <p className="hint footer">
        {desktop
          ? 'Tip: drag the raccoon to move it, click to startle it, double-click for these settings.'
          : 'Tip: drag the raccoon, tap it, or swipe your finger (or mouse) around fast.'}
      </p>
    </section>
  );
}
