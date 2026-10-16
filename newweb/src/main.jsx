import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { DEMO, DemoStore, LiveStore } from './store';
import './styles.css';
import { applyTheme, savedTheme } from './themes';

applyTheme(savedTheme());       // before the first paint, so there is no flash of the other look

const Store = DEMO ? DemoStore : LiveStore;
// Offline start and quicker repeat opens (public/sw.js); not in the demo or while developing.
if ('serviceWorker' in navigator && import.meta.env.PROD && !DEMO) window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });

createRoot(document.getElementById('root')).render(<StrictMode><Store><App /></Store></StrictMode>);
