import { useEffect } from 'react';
import { useUserStore } from './store/userStore.js';
import { initTelegramWebApp, getTelegramInitData } from './telegram/webapp.js';
import { authenticate } from './api/client.js';
import { NicknameForm } from './ui/NicknameForm.js';
import { GameCanvas } from './ui/GameCanvas.js';

export function App() {
  const { user, loading, error, setUser, setLoading, setError } = useUserStore();

  useEffect(() => {
    initTelegramWebApp();

    const initData = getTelegramInitData();
    if (!initData) {
      setError('Telegram init data not available');
      return;
    }

    setLoading(true);
    authenticate(initData)
      .then((res) => setUser(res.user))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [setUser, setLoading, setError]);

  if (loading) return <Centered>Loading…</Centered>;
  if (error) return <Centered>Error: {error}</Centered>;
  if (!user) return <Centered>No user</Centered>;
  if (!user.nickname) return <NicknameForm />;
  return <GameCanvas />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>{children}</div>
  );
}
