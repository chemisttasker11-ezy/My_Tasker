import React from 'react';
import '@fontsource/nunito-sans/400.css';
import '@fontsource/nunito-sans/700.css';
import '@fontsource/nunito-sans/800.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/700.css';
import '@fontsource/outfit/800.css';
import ReactDOM from 'react-dom/client';
import { AuthGate } from './components/AuthGate';
import './styles.css';
import './styles/foundations.css';
import './styles/weekly.css';
import './styles/energy.css';
import './styles/planning.css';
import './styles/energetic-pro.css';
import './styles/auth-admin.css';
import './styles/sync-recovery.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthGate />
  </React.StrictMode>
);
