import { useEffect } from 'react';
import { GameCanvas } from './ui/GameCanvas.js';
import { initTelegramWebApp, lockLandscape } from './telegram/webapp.js';

export function App() {
  useEffect(() => {
    initTelegramWebApp();
    void lockLandscape();
  }, []);
  return <GameCanvas />;
}
