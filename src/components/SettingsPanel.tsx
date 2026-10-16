import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HATS, OUTFITS, PET_MODES, RACCOON_TYPES, type Hat, type KeyboardStatus, type Outfit, type PetMode, type RaccoonType, type Settings } from '../../shared/settings';
import type { Host } from '../host';
import { RACCOON_STYLES } from '../sprites';
import { HAT_ITEMS, OUTFIT_ITEMS, wearableIcon } from '../sprites/outfits';
import { PatchNotes, VersionChip } from './PatchNotes';

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

/** A small still of the pet, drawn once. */
function PetPreview({ type }: { type: RaccoonType }) {
  const ref = useRef<HTMLSpanElement>(null);
  const scale = 0.5;
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const renderer = RACCOON_STYLES[type].create();
    renderer.setScale(scale);
    renderer.draw({ animation: 'idle', timeMs: 1000, keystrokes: 0, eyes: 'open', heading: 0.5 });
    // Stand every pet on the same floor, whatever empty space its drawing has below the feet.
    const below = renderer.baseSize.height * scale * (1 - (renderer.anchor?.y ?? 1));
    (renderer.element as HTMLElement | SVGElement).style.marginBottom = `${6 - below}px`;
    host.replaceChildren(renderer.element);
    return () => host.replaceChildren();
  }, [type]);
  return <span className="type-preview" ref={ref} aria-hidden="true" />;
}

function TypePicker({ value, onChange }: TypePickerProps) {
  return (
    <fieldset className="field type-picker">
      <legend>Pet</legend>
      <div className="type-grid">
        {RACCOON_TYPES.map((type) => {
          const style = RACCOON_STYLES[type];
          return (
            <label key={type} className={type === value ? 'type-option selected' : 'type-option'} title={style.description}>
              <input type="radio" name="raccoonType" checked={type === value} onChange={() => onChange(type)} />
              <PetPreview type={type} />
              <span className="type-name">{style.label}</span>
              <span className="type-description">{style.description}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** The modes, each a button with a little picture and its name. */
const MODES: Record<PetMode, { label: string; hint: string; icon: ReactNode }> = {
  play: {
    label: 'Play',
    hint: 'Plays with its blocks, chases the pointer when you shake it, and watches you type.',
    icon: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="M9 16.5 12 8l3 8.5M10.1 13.5h3.8" />
      </>
    ),
  },
  work: {
    label: 'Work',
    hint: 'Sits at its desk in the corner and works away. Drag it off and it’ll go straight back, cross.',
    icon: (
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M12 16v4M8 20h8M7 8.5h5M7 11.5h7" />
      </>
    ),
  },
  sleep: {
    label: 'Sleep',
    hint: 'Curls up somewhere cosy and sleeps until you change the mode.',
    icon: (
      <>
        <path d="M19 14.5A7.5 7.5 0 1 1 10 5a6 6 0 0 0 9 9.5z" />
        <path d="M15 3h4l-4 4h4" />
      </>
    ),
  },
  hide: {
    label: 'Hide',
    hint: 'Runs off the edge of the screen and stays out of the way until you want it back.',
    icon: (
      <>
        <path d="M3 3l18 18" />
        <path d="M10.6 6.1A9 9 0 0 1 12 6c5 0 9 6 9 6a16 16 0 0 1-2.7 3.2M6.6 7.6C4.4 9.1 3 12 3 12s4 6 9 6c1.5 0 2.9-.4 4.1-1" />
        <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      </>
    ),
  },
};

function ModePicker({ value, onChange }: { value: PetMode; onChange: (mode: PetMode) => void }) {
  return (
    <fieldset className="field mode-picker">
      <legend>Mode</legend>
      <div className="mode-options">
        {PET_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            className={mode === value ? 'mode-option selected' : 'mode-option'}
            aria-pressed={mode === value}
            onClick={() => onChange(mode)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="mode-icon">
              {MODES[mode].icon}
            </svg>
            <span>{MODES[mode].label}</span>
          </button>
        ))}
      </div>
      <p className="hint">{MODES[value].hint}</p>
    </fieldset>
  );
}

/** A picture of a hat or a scarf on its own, for its button. */
function WearIcon({ kind, id }: { kind: 'hat' | 'outfit'; id: Hat | Outfit }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const item = id === 'none' ? null : kind === 'hat' ? HAT_ITEMS[id as Exclude<Hat, 'none'>] : OUTFIT_ITEMS[id as Exclude<Outfit, 'none'>];
    host.replaceChildren(...(item ? [wearableIcon(document, item)] : []));
  }, [kind, id]);
  return <span className={id === 'none' ? 'wear-glyph wear-none' : 'wear-glyph'} ref={ref} aria-hidden="true" />;
}

interface WearRowProps<T extends string> {
  kind: 'hat' | 'outfit';
  title: string;
  options: readonly T[];
  value: T;
  label: (id: T) => string;
  onChange: (id: T) => void;
}

function WearRow<T extends Hat | Outfit>({ kind, title, options, value, label, onChange }: WearRowProps<T>) {
  return (
    <div className="wear-row" role="radiogroup" aria-label={title}>
      <h2 className="type-group-title">{title}</h2>
      <div className="wear-options">
        {options.map((id) => (
          <label key={id} className={id === value ? 'wear-option selected' : 'wear-option'} title={label(id)}>
            <input type="radio" name={kind} checked={id === value} onChange={() => onChange(id)} />
            <WearIcon kind={kind} id={id} />
            <span className="wear-name">{label(id)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** A hat, and clothes or something round the neck: two lists to pick from. */
function DressUp({ settings, update }: { settings: Settings; update: (patch: Partial<Settings>) => void }) {
  return (
    <fieldset className="field dress-up">
      <legend>Dress up</legend>
      <div className="dress-up-body">
        <div className="dress-up-rows">
          <WearRow
            kind="hat"
            title="Hat"
            options={HATS}
            value={settings.hat}
            label={(id) => (id === 'none' ? 'No hat' : HAT_ITEMS[id].label)}
            onChange={(hat) => update({ hat })}
          />
          <WearRow
            kind="outfit"
            title="Outfit"
            options={OUTFITS}
            value={settings.outfit}
            label={(id) => (id === 'none' ? 'Nothing' : OUTFIT_ITEMS[id].label)}
            onChange={(outfit) => update({ outfit })}
          />
        </div>
      </div>
    </fieldset>
  );
}

export function SettingsPanel({ host, onClose }: SettingsPanelProps) {
  const { settings, keyboard } = useHostState(host);
  const [notes, setNotes] = useState(false);
  if (!settings) return null;

  const update = (patch: Partial<Settings>) => void host.updateSettings(patch);
  const desktop = host.kind === 'electron';
  const blocked = settings.keyboardReactions && keyboard && !keyboard.listening && keyboard.message;

  const header = (
    <header className="settings-header">
      <h1>Racoon settings</h1>
      {onClose && (
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close settings">
          ×
        </button>
      )}
    </header>
  );

  if (notes) {
    return (
      <section className="settings" aria-label="Racoon settings">
        {header}
        <PatchNotes onBack={() => setNotes(false)} />
      </section>
    );
  }

  return (
    <section className="settings" aria-label="Racoon settings">
      {header}

      <ModePicker value={settings.mode} onChange={(mode) => update({ mode })} />

      <TypePicker value={settings.raccoonType} onChange={(raccoonType) => update({ raccoonType })} />

      <DressUp settings={settings} update={update} />


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

      <div className="settings-footer">
        <p className="hint footer">
          {desktop
            ? 'Tip: drag your pet to move it, click to pet it, throw it one of its blocks. Settings live in the tray menu.'
            : 'Tip: drag your pet, tap to pet it, throw it a block, or swipe your finger (or mouse) around fast.'}
        </p>
        <VersionChip onClick={() => setNotes(true)} />
      </div>
    </section>
  );
}
