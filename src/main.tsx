import { render } from 'preact';
// The look before any screen's own styles, which build on it.
import './ui/theme.css';
import './ui/app.css';
import { App } from './ui/App';

const root = document.getElementById('app');
if (!root) throw new Error('index.html is missing the #app element');
render(<App />, root);
