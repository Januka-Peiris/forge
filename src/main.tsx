import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

(function migrateForgeToMnLocalStorage() {
  if (localStorage.getItem('mn:localStorage-migrated')) return;
  const keys = Object.keys(localStorage).filter(k => k.startsWith('forge:'));
  for (const key of keys) {
    const newKey = 'mn:' + key.slice('forge:'.length);
    if (!localStorage.getItem(newKey)) {
      localStorage.setItem(newKey, localStorage.getItem(key)!);
    }
    localStorage.removeItem(key);
  }
  localStorage.setItem('mn:localStorage-migrated', '1');
})();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
