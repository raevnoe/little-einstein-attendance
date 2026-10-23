import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { AuthProvider } from './auth/AuthProvider.jsx';
import { registerServiceWorker } from './lib/serviceWorkerRegistration.js';
import { installAudioUnlock } from './lib/sounds.js';

// Production builds only: the dev server has no sw.js (see vite-plugins/serviceWorker.js).
registerServiceWorker({ enabled: import.meta.env.PROD, baseUrl: import.meta.env.BASE_URL });
// Notification sounds may only play after the first click/tap/key press (browser rule).
installAudioUnlock();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
