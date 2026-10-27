import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DictionaryProvider } from './state/dictionary';
import { HistoryProvider } from './state/history';
import { SavedProvider } from './state/saved';
import { ToastProvider } from './state/toast';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <DictionaryProvider>
        <SavedProvider>
          <HistoryProvider>
            <App />
          </HistoryProvider>
        </SavedProvider>
      </DictionaryProvider>
    </ToastProvider>
  </StrictMode>,
);
