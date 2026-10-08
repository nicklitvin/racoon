import { useEffect, useState } from 'react';
import { SETTING_RANGES, type KeyboardStatus, type Settings } from '../../shared/settings';
import type { Host } from '../host';

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

interface SliderProps {
  id: keyof typeof SETTING_RANGES;
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}

function Slider({ id, label, hint, value, onChange, format = (v) => `${v.toFixed(1)}×` }: SliderProps) {
  const range = SETTING_RANGES[id];
  return (
    <div className="field">
      <div className="field-row">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{format(value)}</output>
      </div>
      <input
        id={id}
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <p className="hint">{hint}</p>
    </div>
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

      <Slider
        id="sensitivity"
        label="Activity sensitivity"
        hint="How easily fast mouse movement and typing set the raccoon off."
        value={settings.sensitivity}
        onChange={(sensitivity) => update({ sensitivity })}
      />
      <Slider
        id="size"
        label="Size"
        hint="How big the raccoon is drawn."
        value={settings.size}
        onChange={(size) => update({ size })}
      />
      <Slider
        id="speed"
        label="Speed"
        hint="How fast it walks, runs and floats."
        value={settings.speed}
        onChange={(speed) => update({ speed })}
      />

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
          <p>
            {desktop
              ? 'Counting works system-wide while this is on, and stops completely when you switch it off.'
              : 'In the browser this only counts key presses while this tab is focused.'}
          </p>
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

      {desktop && (
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
      )}

      <p className="hint footer">
        {desktop
          ? 'Tip: drag the raccoon to move it, click to startle it, double-click for these settings.'
          : 'Tip: drag the raccoon, click it, or wave your mouse around wildly.'}
      </p>
    </section>
  );
}
