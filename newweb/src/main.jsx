import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { DEMO, DemoStore, LiveStore } from './store';
import './styles.css';

const Store = DEMO ? DemoStore : LiveStore;
createRoot(document.getElementById('root')).render(<StrictMode><Store><App /></Store></StrictMode>);
