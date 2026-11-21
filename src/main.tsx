import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Press Esc to close the top-most popup (clicks its Cancel/Close/X button).
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
  const top = dialogs[dialogs.length - 1];
  if (!top) return;
  const buttons = Array.from(top.querySelectorAll<HTMLButtonElement>('button'));
  const closeBtn =
    buttons.find((b) => /^(cancel|close|minimi[sz]e)$/i.test((b.textContent || '').trim())) ||
    top.querySelector<HTMLButtonElement>('button[aria-label*="lose" i]') ||
    buttons.find((b) => b.type === 'button' && !(b.textContent || '').trim());
  if (closeBtn) {
    e.preventDefault();
    closeBtn.click();
  }
});

createRoot(document.getElementById('root')!).render(<App />);