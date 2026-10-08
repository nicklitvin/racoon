import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { getHost } from './host';
import './styles.css';

const host = getHost();
document.documentElement.dataset.host = host.kind;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App host={host} />
  </StrictMode>,
);
