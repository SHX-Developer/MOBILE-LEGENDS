import { useEffect, useRef } from 'react';
import { createGame, type Game } from '../game/index.js';

export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    gameRef.current = createGame(containerRef.current);
    return () => {
      gameRef.current?.destroy();
      gameRef.current = null;
    };
  }, []);

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
      <JoystickPlaceholder />
    </div>
  );
}

function JoystickPlaceholder() {
  return (
    <div
      style={{
        position: 'absolute',
        left: 24,
        bottom: 24,
        width: 96,
        height: 96,
        borderRadius: '50%',
        border: '2px dashed rgba(255,255,255,0.4)',
        display: 'grid',
        placeItems: 'center',
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
        pointerEvents: 'none',
      }}
    >
      joystick
    </div>
  );
}
