import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PetApp } from './components/PetApp';
import { SettingsPanel } from './components/SettingsPanel';
import { getHost } from './host';
import './styles.css';

const host = getHost();
// The Electron settings window loads this same page with #settings.
const view = window.location.hash === '#settings' ? 'settings' : 'pet';
document.documentElement.dataset.host = host.kind;
document.documentElement.dataset.view = view;

createRoot(document.getElementById('root')!).render(
  <StrictMode>{view === 'settings' ? <SettingsPanel host={host} /> : <PetApp host={host} />}</StrictMode>,
);
