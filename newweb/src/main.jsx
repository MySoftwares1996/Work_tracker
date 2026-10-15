import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { DEMO, DemoStore, LiveStore } from './store';
import './styles.css';
import { applyTheme, savedTheme } from './themes';

applyTheme(savedTheme());       // before the first paint, so there is no flash of the other look

const Store = DEMO ? DemoStore : LiveStore;
createRoot(document.getElementById('root')).render(<StrictMode><Store><App /></Store></StrictMode>);
