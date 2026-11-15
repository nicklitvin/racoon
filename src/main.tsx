import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AlarmieChat } from './components/AlarmieChat';
import { PetApp } from './components/PetApp';
import { SettingsPanel } from './components/SettingsPanel';
import { getHost } from './host';
import './styles.css';

const host = getHost();
// The Electron settings window loads this same page with #settings, and the Alarmie chat with #chat.
const view = window.location.hash === '#settings' ? 'settings' : window.location.hash === '#chat' ? 'chat' : 'pet';
document.documentElement.dataset.host = host.kind;
document.documentElement.dataset.view = view;

createRoot(document.getElementById('root')!).render(
  <StrictMode>{view === 'settings' ? <SettingsPanel host={host} /> : view === 'chat' ? <AlarmieChat host={host} /> : <PetApp host={host} />}</StrictMode>,
);
