// Light or dark. index.html sets data-theme on <html> before the first paint; this keeps it in step afterwards.
// The system's choice applies until the learner picks one with the header button; picking the system's own
// theme again goes back to following the system.
import { useEffect, useState } from 'react';
import { load, save } from './storage';

export type Theme = 'light' | 'dark';

const system = matchMedia('(prefers-color-scheme: dark)');
const systemTheme = (): Theme => (system.matches ? 'dark' : 'light');

function picked(): Theme | null {
  const theme = load<unknown>('theme', null);
  return theme === 'light' || theme === 'dark' ? theme : null;
}

/** Switches the page at once: without this every color transition fires together and the switch smears. */
function apply(theme: Theme) {
  const root = document.documentElement;
  const freeze = document.createElement('style');
  freeze.textContent = '*,*::before,*::after{transition:none!important}';
  document.head.appendChild(freeze);
  root.dataset.theme = theme;
  void root.offsetHeight;
  requestAnimationFrame(() => freeze.remove());
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => picked() ?? systemTheme());

  useEffect(() => {
    const follow = () => {
      if (picked()) return;
      apply(systemTheme());
      setTheme(systemTheme());
    };
    system.addEventListener('change', follow);
    return () => system.removeEventListener('change', follow);
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    apply(next);
    save('theme', next === systemTheme() ? null : next);
    setTheme(next);
  }

  return [theme, toggle];
}
