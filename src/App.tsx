import { useEffect, useState, useSyncExternalStore } from 'react';
import { api } from './api';
import { DictionaryPage, type DictionaryTab } from './components/DictionaryPage';
import { HistoryPage } from './components/History';
import { HomePage } from './components/Home';
import { GearIcon, MoonIcon, SunIcon } from './components/Marks';
import { Practice } from './components/Practice';
import { SettingsPage } from './components/SettingsPage';
import { useTheme } from './lib/theme';
import { useDictionary } from './state/dictionary';
import type { Status } from './types';

type Route = 'home' | 'practice' | 'history' | 'settings' | DictionaryTab;

const ROUTES: Record<string, Route> = {
  '#/practice': 'practice',
  '#/dictionary': 'words',
  '#/dictionary/sentences': 'sentences',
  '#/history': 'history',
  '#/settings': 'settings',
};
const routeFromHash = (): Route => ROUTES[location.hash] ?? 'home';

function onHashChange(notify: () => void) {
  window.addEventListener('hashchange', notify);
  return () => window.removeEventListener('hashchange', notify);
}

export function App() {
  // Read on every render rather than stored from a listener, so the page always matches the address bar.
  const route = useSyncExternalStore(onHashChange, routeFromHash);
  const [status, setStatus] = useState<Status | null>(null);
  const { entries } = useDictionary();
  const [theme, toggleTheme] = useTheme();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route]);

  useEffect(() => {
    api.status().then(setStatus).catch(() => setStatus(null));
  }, []);

  return (
    <div className="page">
      <header className="topbar">
        <a className="brand" href="#/">Тетрадь</a>
        <nav className="nav" aria-label="Разделы">
          {/* On phones the brand is the way home, so this item makes room for the other three */}
          <a className="nav__link nav__link--home" href="#/" aria-current={route === 'home' ? 'page' : undefined}>
            Главная
          </a>
          <a className="nav__link" href="#/practice" aria-current={route === 'practice' ? 'page' : undefined}>
            Практика
          </a>
          <a
            className="nav__link"
            href="#/dictionary"
            aria-current={route === 'words' || route === 'sentences' ? 'page' : undefined}
          >
            Словарь
            {entries.length > 0 && <span className="nav__count">{entries.length}</span>}
          </a>
          <a className="nav__link" href="#/history" aria-current={route === 'history' ? 'page' : undefined}>
            История
          </a>
          <button
            type="button"
            className="nav__link nav__link--icon"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <a
            className="nav__link nav__link--icon"
            href="#/settings"
            aria-label="Настройки"
            title="Настройки"
            aria-current={route === 'settings' ? 'page' : undefined}
          >
            <GearIcon />
          </a>
        </nav>
      </header>

      <main className="main">
        {route === 'home' ? (
          <HomePage />
        ) : route === 'practice' ? (
          <Practice status={status} />
        ) : route === 'history' ? (
          <HistoryPage />
        ) : route === 'settings' ? (
          <SettingsPage status={status} />
        ) : (
          <DictionaryPage tab={route} />
        )}
      </main>

      {status && (
        <footer className="footer">
          {status.demo ? 'Демо-режим: встроенные предложения, без OpenAI' : `Модель ${status.model}`}
        </footer>
      )}
    </div>
  );
}
