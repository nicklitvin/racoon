import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ALARMIE_DEFAULT_ENDPOINT, NO_ALARMIE, cleanEndpoint, type AlarmieStatus } from '../../shared/alarmie';
import { BETA_TYPES, HATS, OUTFITS, PET_MODES, RACCOON_TYPES, type Hat, type KeyboardStatus, type Outfit, type PetMode, type RaccoonType, type Settings } from '../../shared/settings';
import type { Host } from '../host';
import { RACCOON_STYLES } from '../sprites';
import { HAT_ITEMS, OUTFIT_ITEMS, wearableIcon } from '../sprites/outfits';
import { ModeScene } from './ModeScene';
import { PatchNotes, VersionChip } from './PatchNotes';
import { UpdateBanner, UpdateRow, useUpdateStatus } from './Updates';

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

/** Whether Alarmie is here to talk to: looked for when the settings open, and kept up to date. */
function useAlarmie(host: Host) {
  const [status, setStatus] = useState<AlarmieStatus>(NO_ALARMIE);
  useEffect(() => {
    let alive = true;
    void host.getAlarmie().then((s) => alive && setStatus(s));
    const off = host.onAlarmieChanged(setStatus);
    return () => {
      alive = false;
      off();
    };
  }, [host]);
  return status;
}

/** "Pixel raccoon" is just "Raccoon" on its tile: they're all pixel pets. */
const shortName = (type: RaccoonType) => {
  const name = RACCOON_STYLES[type].label.replace(/^pixel\s+/i, '');
  return name.charAt(0).toUpperCase() + name.slice(1);
};

/** How far above the bottom of its tile a pet stands, px. */
const FLOOR_PX = 4;
/** How far over the top of its tile a pet may go before it's drawn smaller, px. */
const OVER_TOP_PX = 6;

/** A small still of the pet, drawn once. */
function PetPreview({ type }: { type: RaccoonType }) {
  const ref = useRef<HTMLSpanElement>(null);
  const scale = 2 / 3;
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const renderer = RACCOON_STYLES[type].create();
    const frame = { animation: 'idle', timeMs: 1000, keystrokes: 0, eyes: 'open', heading: 0.5 } as const;
    renderer.setScale(scale);
    renderer.draw(frame);
    let size = scale;
    // Stand every pet on the same floor, whatever empty space its drawing has below the feet
    // (and one that floats with its bottom there, its shadow out of sight). (Pixel pets come
    // out a little bigger than asked, on whole screen pixels.)
    const heightOf = () => parseFloat((renderer.element as HTMLElement).style.height) || renderer.baseSize.height * size;
    const belowOf = (height: number) => height * (1 - (renderer.anchor?.y ?? 1)) + ((renderer.hover ?? 0) * height) / renderer.baseSize.height;
    // A tall one (the goose, its neck up) is made smaller, so its head isn't cut off by the
    // top of the tile. (Not for the tip of an antenna: smaller is a whole screen pixel smaller.)
    const figure = renderer.figure as HTMLElement;
    for (let i = 0; i < 4 && host.clientHeight > 0; i++) {
      const height = heightOf();
      const tall = FLOOR_PX + height - belowOf(height) - (parseFloat(figure.style.top) || 0);
      if (tall <= host.clientHeight + OVER_TOP_PX) break;
      size *= Math.max(0.6, (host.clientHeight - FLOOR_PX) / (tall - FLOOR_PX)) * 0.98;
      renderer.setScale(size);
      renderer.draw(frame);
    }
    const height = heightOf();
    const below = belowOf(height);
    (renderer.element as HTMLElement | SVGElement).style.marginBottom = `${FLOOR_PX - below}px`;
    host.replaceChildren(renderer.element);
    return () => host.replaceChildren();
  }, [type]);
  return <span className="type-preview" ref={ref} aria-hidden="true" />;
}

/** A titled block of the panel; `aside` sits at the right of the title (what's picked). */
function Section({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <section className="settings-section" aria-label={title}>
      <h2 className="section-title">
        <span>{title}</span>
        {aside && <span className="section-aside">{aside}</span>}
      </h2>
      {children}
    </section>
  );
}

/** The pets, with those in beta only once it's switched on (from the patch notes). */
function TypePicker({ value, beta, onChange }: { value: RaccoonType; beta: boolean; onChange: (value: RaccoonType) => void }) {
  const types = RACCOON_TYPES.filter((type) => beta || !BETA_TYPES.includes(type));
  return (
    <div className={types.length > 3 ? 'type-grid four' : 'type-grid'} role="radiogroup" aria-label="Pet">
      {types.map((type) => (
        <label key={type} className={type === value ? 'tile type-option selected' : 'tile type-option'} title={RACCOON_STYLES[type].label}>
          <input type="radio" name="raccoonType" checked={type === value} onChange={() => onChange(type)} />
          <PetPreview type={type} />
          <span className="tile-name">{shortName(type)}</span>
          {BETA_TYPES.includes(type) && <span className="beta-tag">Beta</span>}
        </label>
      ))}
    </div>
  );
}

const MODE_NAMES: Record<PetMode, string> = { play: 'Play', work: 'Work', sleep: 'Sleep', hide: 'Hide' };

/** The modes, each a card with a picture of your pet at it and its name. */
function ModePicker({ settings, onChange }: { settings: Settings; onChange: (mode: PetMode) => void }) {
  const { mode: value, raccoonType, hat, outfit } = settings;
  return (
    <div className="mode-options" role="group" aria-label="Mode">
      {PET_MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          className={mode === value ? 'mode-option selected' : 'mode-option'}
          aria-pressed={mode === value}
          onClick={() => onChange(mode)}
        >
          <ModeScene mode={mode} type={raccoonType} hat={hat} outfit={outfit} />
          <span className="mode-name">{MODE_NAMES[mode]}</span>
        </button>
      ))}
    </div>
  );
}

/** A picture of a hat or a scarf on its own, for its tile. */
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

interface WearGridProps<T extends string> {
  kind: 'hat' | 'outfit';
  title: string;
  options: readonly T[];
  value: T;
  label: (id: T) => string;
  onChange: (id: T) => void;
}

/** Icon tiles to pick from; the name is in the tooltip, and over the grid for the one picked. */
function WearGrid<T extends Hat | Outfit>({ kind, title, options, value, label, onChange }: WearGridProps<T>) {
  return (
    <Section title={title} aside={label(value)}>
      <div className="wear-options" role="radiogroup" aria-label={title}>
        {options.map((id) => (
          <label key={id} className={id === value ? 'tile wear-option selected' : 'tile wear-option'} title={label(id)}>
            <input type="radio" name={kind} checked={id === value} onChange={() => onChange(id)} aria-label={label(id)} />
            <WearIcon kind={kind} id={id} />
          </label>
        ))}
      </div>
    </Section>
  );
}

/** An on/off row: the name, a switch, and maybe a line under it. */
function Switch({ label, checked, onChange, title, children }: { label: string; checked: boolean; onChange: (on: boolean) => void; title?: string; children?: ReactNode }) {
  return (
    <div className="switch-row" title={title}>
      <label className="switch">
        <span className="switch-label">{label}</span>
        <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      </label>
      {children}
    </div>
  );
}

/** Where Alarmie's live talk is: changed when you leave the box or press Enter. */
function EndpointField({ value, onChange }: { value: string; onChange: (endpoint: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const valid = cleanEndpoint(draft) !== null;
  const commit = () => {
    const endpoint = cleanEndpoint(draft);
    if (endpoint && endpoint !== value) onChange(endpoint);
  };
  return (
    <details className="privacy">
      <summary>Connection</summary>
      <label className="endpoint">
        <span>Live talk address</span>
        <input
          type="url"
          value={draft}
          spellCheck={false}
          aria-invalid={!valid}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
        />
      </label>
      {!valid && <p className="hint error">That isn’t an http:// or https:// address.</p>}
      {value !== ALARMIE_DEFAULT_ENDPOINT && (
        <button type="button" className="text-button" onClick={() => onChange(ALARMIE_DEFAULT_ENDPOINT)}>
          Back to the usual address
        </button>
      )}
    </details>
  );
}

/** Talking to Alarmie by clicking the pet: only offered on a Mac with Alarmie on it. */
function AlarmieRow({ settings, status, onChange }: { settings: Settings; status: AlarmieStatus; onChange: (patch: Partial<Settings>) => void }) {
  return (
    <Switch label="Click your pet to talk to Alarmie" checked={settings.alarmieChat} onChange={(alarmieChat) => onChange({ alarmieChat })}>
      <p className={status.reachable ? 'hint ok' : 'hint'}>
        {status.reachable
          ? 'Opens a chat with Alarmie’s live talk beside your pet.'
          : 'Alarmie is here, but its live talk isn’t answering yet. Open Alarmie and turn live talk on.'}
      </p>
      <EndpointField value={settings.alarmieEndpoint} onChange={(alarmieEndpoint) => onChange({ alarmieEndpoint })} />
    </Switch>
  );
}

export function SettingsPanel({ host, onClose }: SettingsPanelProps) {
  const { settings, keyboard } = useHostState(host);
  const alarmie = useAlarmie(host);
  const updates = useUpdateStatus(host);
  const [notes, setNotes] = useState(false);
  if (!settings) return null;

  const update = (patch: Partial<Settings>) => void host.updateSettings(patch);
  const desktop = host.kind === 'electron';
  const blocked = settings.keyboardReactions && keyboard && !keyboard.listening && keyboard.message;

  const header = (
    <header className="settings-header">
      <h1>My Pet</h1>
      <div className="settings-header-end">
        {!notes && <VersionChip onClick={() => setNotes(true)} />}
        {onClose && (
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        )}
      </div>
    </header>
  );

  if (notes) {
    return (
      <section className="settings" aria-label="My Pet settings">
        {header}
        <PatchNotes onBack={() => setNotes(false)} beta={settings.beta} onBeta={(beta) => update({ beta })} />
      </section>
    );
  }

  return (
    <section className="settings" aria-label="My Pet settings">
      {header}

      <UpdateBanner host={host} status={updates} />

      <Section title="Mode">
        <ModePicker settings={settings} onChange={(mode) => update({ mode })} />
      </Section>

      <Section title="Pet">
        <TypePicker value={settings.raccoonType} beta={settings.beta} onChange={(raccoonType) => update({ raccoonType })} />
      </Section>

      <WearGrid
        kind="hat"
        title="Hat"
        options={HATS}
        value={settings.hat}
        label={(id) => (id === 'none' ? 'None' : HAT_ITEMS[id].label)}
        onChange={(hat) => update({ hat })}
      />
      <WearGrid
        kind="outfit"
        title="Outfit"
        options={OUTFITS}
        value={settings.outfit}
        label={(id) => (id === 'none' ? 'None' : OUTFIT_ITEMS[id].label)}
        onChange={(outfit) => update({ outfit })}
      />

      {/* Everything else is desktop-only. */}
      {desktop && (
        <Section title="Desktop">
          <div className="switch-list">
            <Switch label="React to typing" checked={settings.keyboardReactions} onChange={(keyboardReactions) => update({ keyboardReactions })}>
              <details className="privacy">
                <summary>Counts key presses only, never which keys</summary>
                <p>
                  My Pet only notices <em>that</em> a key was pressed, and when, to work out your typing rate. It never
                  reads which keys or characters you press, and never records, stores, logs or sends them anywhere.
                  Timestamps older than a few seconds are thrown away, and nothing leaves your computer. Counting stops
                  completely when this is off.
                </p>
              </details>
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
            </Switch>
            <Switch
              label="Start at login"
              checked={settings.launchAtLogin}
              onChange={(launchAtLogin) => update({ launchAtLogin })}
              title="Applies to the installed app, not to development builds."
            />
            <UpdateRow host={host} status={updates} />
          </div>
        </Section>
      )}

      {desktop && alarmie.available && (
        <Section title="Alarmie">
          <div className="switch-list">
            <AlarmieRow settings={settings} status={alarmie} onChange={update} />
          </div>
        </Section>
      )}
    </section>
  );
}
