import { useEffect, useState } from 'react';
import { GameCanvas } from './ui/GameCanvas.js';
import { NicknameForm } from './ui/NicknameForm.js';
import { MainMenu } from './ui/MainMenu.js';
import { useUserStore } from './store/userStore.js';
import { authenticate } from './api/client.js';
import {
  getTelegramInitData,
  initTelegramWebApp,
  lockLandscape,
} from './telegram/webapp.js';

type Screen = 'menu' | 'playing';

export function App() {
  const { user, loading, error, setUser, setLoading, setError } = useUserStore();
  const [screen, setScreen] = useState<Screen>('menu');

  useEffect(() => {
    initTelegramWebApp();
    void lockLandscape();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    authenticate(getTelegramInitData())
      .then((res) => {
        if (!cancelled) setUser(res.user);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Auth failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setUser, setLoading, setError]);

  let content: JSX.Element;
  if (loading && !user) content = <Centered>Загрузка…</Centered>;
  else if (error && !user) content = <Centered>{error}</Centered>;
  else if (!user) content = <Centered>Загрузка…</Centered>;
  else if (!user.nickname) content = <NicknameForm />;
  else if (screen === 'menu') content = <MainMenu onPlay={() => setScreen('playing')} />;
  else content = <GameCanvas onExit={() => setScreen('menu')} />;

  return content;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: '#0a0d18',
        color: '#fff',
        fontWeight: 700,
        letterSpacing: 2,
      }}
    >
      {children}
    </div>
  );
}
