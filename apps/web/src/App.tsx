import { useEffect, useState } from 'react';
import { GameCanvas } from './ui/GameCanvas.js';
import { NicknameForm } from './ui/NicknameForm.js';
import { MainMenu } from './ui/MainMenu.js';
import { LandscapeStage } from './ui/LandscapeStage.js';
import { useUserStore } from './store/userStore.js';
import { authenticate } from './api/client.js';
import type { HeroKind } from './game/constants.js';
import {
  getTelegramInitData,
  initTelegramWebApp,
  lockLandscape,
} from './telegram/webapp.js';

type Screen =
  | { kind: 'menu' }
  | { kind: 'playing'; mode: 'online' | 'offline'; heroKind: HeroKind };

export function App() {
  const { user, loading, error, setUser, setLoading, setError } = useUserStore();
  const [screen, setScreen] = useState<Screen>({ kind: 'menu' });

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

  if (loading && !user) return <Stage><Centered>Загрузка…</Centered></Stage>;
  if (error && !user) return <Stage><Centered>{error}</Centered></Stage>;
  if (!user) return <Stage><Centered>Загрузка…</Centered></Stage>;
  if (!user.nickname) return <Stage><NicknameForm /></Stage>;

  if (screen.kind === 'menu') {
    // Menu uses the fullscreen stage so the cyber background reaches
    // edge-to-edge — no 16:9 letterbox bars. The MainMenu itself adds
    // a left safe-area inset so the Telegram WebApp close/back buttons
    // (top-left) don't sit on top of our content.
    return (
      <Stage fullscreen>
        <MainMenu
          onPlay={(mode, heroKind) => setScreen({ kind: 'playing', mode, heroKind })}
        />
      </Stage>
    );
  }
  // The game canvas owns its own landscape rotation, so it isn't wrapped.
  return (
    <GameCanvas
      mode={screen.mode}
      heroKind={screen.heroKind}
      onExit={() => setScreen({ kind: 'menu' })}
    />
  );
}

function Stage({ children, fullscreen }: { children: React.ReactNode; fullscreen?: boolean }) {
  return <LandscapeStage fullscreen={fullscreen}>{children}</LandscapeStage>;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'absolute',
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
