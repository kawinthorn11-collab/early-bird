import { createRoot } from 'react-dom/client';
import '@fontsource/chonburi/400.css';
import '@fontsource/prompt/500.css';
import '@fontsource/prompt/700.css';
import '@fontsource/sarabun/400.css';
import '@fontsource/sarabun/600.css';
import App from './App';
import { StoreProvider } from './store';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StoreProvider><App /></StoreProvider>);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}));
}
