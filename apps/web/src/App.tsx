import { useEffect, useState } from 'react';
import { GameCanvas } from './ui/GameCanvas.js';
import { initTelegramWebApp, lockLandscape } from './telegram/webapp.js';

export function App() {
  useEffect(() => {
    initTelegramWebApp();
    void lockLandscape();
    const onOrient = () => void lockLandscape();
    window.addEventListener('orientationchange', onOrient);
    return () => window.removeEventListener('orientationchange', onOrient);
  }, []);

  return (
    <>
      <GameCanvas />
      <PortraitNudge />
    </>
  );
}

function PortraitNudge() {
  const [portrait, setPortrait] = useState(() => isPortrait());
  useEffect(() => {
    const update = () => setPortrait(isPortrait());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  if (!portrait) return null;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(11, 13, 18, 0.97)',
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1000,
        padding: 24,
        textAlign: 'center',
      }}
      onClick={() => void lockLandscape()}
    >
      <div>
        <div style={{ fontSize: 96, lineHeight: 1, animation: 'rotate-hint 1.8s ease-in-out infinite' }}>📱</div>
        <div style={{ marginTop: 24, fontSize: 20, fontWeight: 600 }}>Поверни телефон</div>
        <div style={{ marginTop: 8, fontSize: 14, opacity: 0.7 }}>горизонтально для игры</div>
      </div>
      <style>{`
        @keyframes rotate-hint {
          0%, 20%   { transform: rotate(0deg); }
          50%, 70%  { transform: rotate(-90deg); }
          100%      { transform: rotate(0deg); }
        }
      `}</style>
    </div>
  );
}

function isPortrait(): boolean {
  return window.innerHeight > window.innerWidth;
}
