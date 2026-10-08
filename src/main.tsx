import { render } from 'preact';
// The look before any screen's own styles, which build on it.
import './ui/theme.css';
import './ui/app.css';
import { applyTheme, storedTheme } from './platform/theme';
import { App } from './ui/App';

// The theme kept on this device, before the first render: no flash of the other (T3.11).
applyTheme(storedTheme());

const root = document.getElementById('app');
if (!root) throw new Error('index.html is missing the #app element');
render(<App />, root);
