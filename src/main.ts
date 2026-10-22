import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { app } from './lib/state/app.svelte';

app.init();
// Installable app (installed apps are granted persistent storage). Not in dev, to keep HMR simple.
if (!import.meta.env.DEV && 'serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
if (import.meta.env.DEV) (window as any).dfc = app;

export default mount(App, { target: document.getElementById('app')! });
