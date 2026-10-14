import { useEffect, useRef, useState } from 'react';
import { HATS, OUTFITS, RACCOON_TYPES, type Hat, type KeyboardStatus, type Outfit, type RaccoonType, type Settings } from '../../shared/settings';
import type { Host } from '../host';
import { RACCOON_STYLES, type Species } from '../sprites';
import { HAT_ITEMS, OUTFIT_ITEMS, wearableIcon, type Dress } from '../sprites/outfits';
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

const GROUPS: { group: Species | 'chibi' | 'pixel'; title: string }[] = [
  { group: 'raccoon', title: 'Raccoons' },
  { group: 'cat', title: 'Cats' },
  { group: 'fox', title: 'Foxes' },
  { group: 'otter', title: 'Otters' },
  { group: 'chibi', title: 'Chibi' },
  { group: 'pixel', title: 'Pixel art' },
];

/** A small still of the pet in what it's wearing, drawn once. */
function PetPreview({ type, dress, scale = 0.5, className = 'type-preview' }: { type: RaccoonType; dress: Dress; scale?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const renderer = RACCOON_STYLES[type].create();
    renderer.setScale(scale);
    renderer.dress?.(dress);
    renderer.draw({ animation: 'idle', timeMs: 1000, keystrokes: 0, eyes: 'open', heading: 0.5 });
    // Stand every pet on the same floor, whatever empty space its drawing has below the feet.
    const below = renderer.baseSize.height * scale * (1 - (renderer.anchor?.y ?? 1));
    (renderer.element as HTMLElement | SVGElement).style.marginBottom = `${6 - below}px`;
    host.replaceChildren(renderer.element);
    return () => host.replaceChildren();
  }, [type, dress.hat, dress.outfit, scale]);
  return <span className={className} ref={ref} aria-hidden="true" />;
}

function TypePicker({ value, onChange, dress }: TypePickerProps & { dress: Dress }) {
  return (
    <fieldset className="field type-picker">
      <legend>Pet</legend>
      {GROUPS.map(({ group, title }) => (
        <div key={group} className="type-group">
          <h2 className="type-group-title">{title}</h2>
          <div className="type-grid">
            {RACCOON_TYPES.filter((type) => (RACCOON_STYLES[type].group ?? RACCOON_STYLES[type].species) === group).map((type) => {
              const style = RACCOON_STYLES[type];
              return (
                <label key={type} className={type === value ? 'type-option selected' : 'type-option'} title={style.description}>
                  <input type="radio" name="raccoonType" checked={type === value} onChange={() => onChange(type)} />
                  <PetPreview type={type} dress={dress} />
                  <span className="type-name">{style.label}</span>
                  <span className="type-description">{style.description}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
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

/** Hats and things round the neck, with your pet modelling them. */
function DressUp({ settings, update }: { settings: Settings; update: (patch: Partial<Settings>) => void }) {
  const dress = { hat: settings.hat, outfit: settings.outfit };
  return (
    <fieldset className="field dress-up">
      <legend>Dress up</legend>
      <div className="dress-up-body">
        <PetPreview type={settings.raccoonType} dress={dress} scale={0.85} className="type-preview dress-preview" />
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
            title="Round the neck"
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

      <TypePicker value={settings.raccoonType} onChange={(raccoonType) => update({ raccoonType })} dress={{ hat: settings.hat, outfit: settings.outfit }} />

      <DressUp settings={settings} update={update} />

      <div className="field">
        <label className="toggle">
          <input type="checkbox" checked={settings.toys} onChange={(e) => update({ toys: e.target.checked })} />
          <span>Toy blocks</span>
        </label>
        <p className="hint">
          A few wooden blocks to play with: your pet swats them about and throws them. Pick one up and throw it, and
          it’ll chase after it.
        </p>
      </div>

      <div className="field">
        <label className="toggle">
          <input type="checkbox" checked={settings.workMode} onChange={(e) => update({ workMode: e.target.checked })} />
          <span>Work mode</span>
        </label>
        <p className="hint">
          Puts a little desk in the corner of the screen. Tap the desk three times and your pet sits down at it and
          types away while you work. After 20 minutes it decides it’s play time and comes to find you.
        </p>
      </div>

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
