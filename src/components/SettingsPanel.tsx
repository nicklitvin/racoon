import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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

/** "Pixel raccoon" is just "Raccoon" on its tile: they're all pixel pets. */
const shortName = (type: RaccoonType) => {
  const name = RACCOON_STYLES[type].label.replace(/^pixel\s+/i, '');
  return name.charAt(0).toUpperCase() + name.slice(1);
};

interface StageProps {
  type: RaccoonType;
  hat: Hat;
  outfit: Outfit;
  mode: PetMode;
}

/** Your pet, big, in what it's wearing, breathing and blinking (or asleep, in sleep mode). */
function PetStage({ type, hat, outfit, mode }: StageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const renderer = useMemo(() => RACCOON_STYLES[type].create(), [type]);
  // Three screen pixels to each of its pixels, as on the screen: big, and still crisp.
  const scale = 1;

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    renderer.setScale(scale);
    const below = renderer.baseSize.height * scale * (1 - (renderer.anchor?.y ?? 1));
    (renderer.element as HTMLElement | SVGElement).style.marginBottom = `${10 - below}px`;
    host.replaceChildren(renderer.element);
    return () => host.replaceChildren();
  }, [renderer]);

  useEffect(() => {
    renderer.dress?.({ hat, outfit });
    const asleep = mode === 'sleep';
    const start = performance.now();
    const draw = (now: number) =>
      renderer.draw({
        animation: asleep ? 'sleep' : 'idle',
        timeMs: now - start + 1000,
        clockMs: now,
        keystrokes: 0,
        eyes: asleep ? 'closed' : 'open',
        heading: 0.5,
      });
    draw(start);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let frame = requestAnimationFrame(function tick(now) {
      draw(now);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [renderer, hat, outfit, mode]);

  return (
    <div className={`pet-stage pet-stage-${mode}`} aria-hidden="true">
      <div className="pet-stage-pet" ref={ref} />
    </div>
  );
}

/** A small still of the pet, drawn once. */
function PetPreview({ type }: { type: RaccoonType }) {
  const ref = useRef<HTMLSpanElement>(null);
  const scale = 2 / 3;
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const renderer = RACCOON_STYLES[type].create();
    renderer.setScale(scale);
    renderer.draw({ animation: 'idle', timeMs: 1000, keystrokes: 0, eyes: 'open', heading: 0.5 });
    // Stand every pet on the same floor, whatever empty space its drawing has below the feet.
    const below = renderer.baseSize.height * scale * (1 - (renderer.anchor?.y ?? 1));
    (renderer.element as HTMLElement | SVGElement).style.marginBottom = `${4 - below}px`;
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

function TypePicker({ value, onChange }: { value: RaccoonType; onChange: (value: RaccoonType) => void }) {
  return (
    <div className="type-grid" role="radiogroup" aria-label="Pet">
      {RACCOON_TYPES.map((type) => (
        <label key={type} className={type === value ? 'tile type-option selected' : 'tile type-option'} title={RACCOON_STYLES[type].label}>
          <input type="radio" name="raccoonType" checked={type === value} onChange={() => onChange(type)} />
          <PetPreview type={type} />
          <span className="tile-name">{shortName(type)}</span>
        </label>
      ))}
    </div>
  );
}

/** The modes, each a button with a little picture and its name. */
const MODES: Record<PetMode, { label: string; icon: ReactNode }> = {
  play: {
    label: 'Play',
    icon: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="M9 16.5 12 8l3 8.5M10.1 13.5h3.8" />
      </>
    ),
  },
  work: {
    label: 'Work',
    icon: (
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M12 16v4M8 20h8M7 8.5h5M7 11.5h7" />
      </>
    ),
  },
  sleep: {
    label: 'Sleep',
    icon: (
      <>
        <path d="M19 14.5A7.5 7.5 0 1 1 10 5a6 6 0 0 0 9 9.5z" />
        <path d="M15 3h4l-4 4h4" />
      </>
    ),
  },
  hide: {
    label: 'Hide',
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
    <div className="mode-options" role="group" aria-label="Mode">
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

export function SettingsPanel({ host, onClose }: SettingsPanelProps) {
  const { settings, keyboard } = useHostState(host);
  const [notes, setNotes] = useState(false);
  if (!settings) return null;

  const update = (patch: Partial<Settings>) => void host.updateSettings(patch);
  const desktop = host.kind === 'electron';
  const blocked = settings.keyboardReactions && keyboard && !keyboard.listening && keyboard.message;

  const header = (
    <header className="settings-header">
      <h1>Racoon</h1>
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
      <section className="settings" aria-label="Racoon settings">
        {header}
        <PatchNotes onBack={() => setNotes(false)} />
      </section>
    );
  }

  return (
    <section className="settings" aria-label="Racoon settings">
      {header}

      <PetStage type={settings.raccoonType} hat={settings.hat} outfit={settings.outfit} mode={settings.mode} />

      <ModePicker value={settings.mode} onChange={(mode) => update({ mode })} />

      <Section title="Pet">
        <TypePicker value={settings.raccoonType} onChange={(raccoonType) => update({ raccoonType })} />
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
                  Racoon only notices <em>that</em> a key was pressed, and when, to work out your typing rate. It never
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
          </div>
        </Section>
      )}
    </section>
  );
}
