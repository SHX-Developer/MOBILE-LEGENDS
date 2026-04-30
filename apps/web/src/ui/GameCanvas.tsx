import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createGame, type Game } from '../game/index.js';

const ASPECT = 16 / 9;

interface Frame {
  logicalW: number;
  logicalH: number;
  vpW: number;
  vpH: number;
}

type Team = 'blue' | 'red';
type SkillId = 'q' | 'e';

function computeFrame(): Frame {
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;
  const logicalH = Math.min(vpW, vpH / ASPECT);
  const logicalW = ASPECT * logicalH;
  return { logicalW, logicalH, vpW, vpH };
}

export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [frame, setFrame] = useState<Frame>(() => computeFrame());
  const [gameKey, setGameKey] = useState(0);
  const [matchEnd, setMatchEnd] = useState<Team | null>(null);

  useEffect(() => {
    const update = () => setFrame(computeFrame());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const game = createGame(containerRef.current);
    game.onMatchEnd = (winner) => setMatchEnd(winner);
    gameRef.current = game;
    return () => {
      game.destroy();
      gameRef.current = null;
    };
  }, [gameKey]);

  // Stable callbacks — keep memoised children from re-mounting on parent renders.
  const getGame = useCallback(() => gameRef.current, []);
  const onJoystickChange = useCallback(
    (x: number, z: number) => gameRef.current?.setJoystickAxis(x, z),
    [],
  );
  const onFirePress = useCallback(() => {
    gameRef.current?.fire();
    gameRef.current?.setFireHold(true);
  }, []);
  const onFireRelease = useCallback(() => {
    gameRef.current?.setFireHold(false);
  }, []);

  function restart() {
    setMatchEnd(null);
    setGameKey((k) => k + 1);
  }

  const left = (frame.vpW - frame.logicalW) / 2;
  const top = (frame.vpH - frame.logicalH) / 2;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        overflow: 'hidden',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left,
          top,
          width: frame.logicalW,
          height: frame.logicalH,
          transform: 'rotate(90deg)',
          transformOrigin: 'center center',
          touchAction: 'none',
        }}
      >
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        <Joystick onChange={onJoystickChange} />
        <FireButton onPress={onFirePress} onRelease={onFireRelease} />
        <SkillButton
          id="q"
          label="Q"
          subtitle="POWER"
          accent="#ff7a3d"
          right={36}
          bottom={150}
          size={84}
          totalMs={6000}
          getGame={getGame}
        />
        <SkillButton
          id="e"
          label="E"
          subtitle="SLOW"
          accent="#4ec9ff"
          right={140}
          bottom={92}
          size={84}
          totalMs={8000}
          getGame={getGame}
        />
      </div>

      {matchEnd && <MatchEndOverlay winner={matchEnd} onRestart={restart} />}
    </div>
  );
}

const JOY_BASE = 180;
const JOY_KNOB = 84;
const JOY_RADIUS = (JOY_BASE - JOY_KNOB) / 2;

const Joystick = memo(function Joystick({
  onChange,
}: {
  onChange: (x: number, z: number) => void;
}) {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const activePointer = useRef<number | null>(null);

  useEffect(() => {
    return () => onChange(0, 0);
  }, [onChange]);

  function setKnob(dx: number, dy: number) {
    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  }

  function handleMove(clientX: number, clientY: number) {
    const base = baseRef.current;
    if (!base) return;
    const r = base.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const vDx = clientX - cx;
    const vDy = clientY - cy;
    let lDx = vDy;
    let lDy = -vDx;
    const dist = Math.hypot(lDx, lDy);
    if (dist > JOY_RADIUS) {
      lDx = (lDx / dist) * JOY_RADIUS;
      lDy = (lDy / dist) * JOY_RADIUS;
    }
    setKnob(lDx, lDy);
    onChange(lDx / JOY_RADIUS, lDy / JOY_RADIUS);
  }

  function reset() {
    setKnob(0, 0);
    onChange(0, 0);
  }

  return (
    <div
      ref={baseRef}
      onPointerDown={(e) => {
        if (activePointer.current !== null) return;
        activePointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        handleMove(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (activePointer.current !== e.pointerId) return;
        handleMove(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (activePointer.current !== e.pointerId) return;
        activePointer.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        reset();
      }}
      onPointerCancel={() => {
        activePointer.current = null;
        reset();
      }}
      style={{
        position: 'absolute',
        left: 28,
        bottom: 28,
        width: JOY_BASE,
        height: JOY_BASE,
        borderRadius: '50%',
        background:
          'radial-gradient(circle at 50% 50%, rgba(60,70,95,0.55) 0%, rgba(20,24,36,0.55) 70%)',
        border: '3px solid rgba(255,255,255,0.45)',
        boxShadow: '0 4px 18px rgba(0,0,0,0.45), inset 0 0 0 8px rgba(255,255,255,0.05)',
        touchAction: 'none',
        display: 'grid',
        placeItems: 'center',
        contain: 'layout paint',
      }}
    >
      <div
        ref={knobRef}
        style={{
          width: JOY_KNOB,
          height: JOY_KNOB,
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 35% 30%, #f4f4ff 0%, #c2c4d6 70%, #8b8ea3 100%)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
          willChange: 'transform',
        }}
      />
    </div>
  );
});

const FireButton = memo(function FireButton({
  onPress,
  onRelease,
}: {
  onPress: () => void;
  onRelease: () => void;
}) {
  const activePointer = useRef<number | null>(null);
  return (
    <button
      onPointerDown={(e) => {
        if (activePointer.current !== null) return;
        activePointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
        onPress();
      }}
      onPointerUp={(e) => {
        if (activePointer.current !== e.pointerId) return;
        activePointer.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        onRelease();
      }}
      onPointerCancel={() => {
        activePointer.current = null;
        onRelease();
      }}
      style={{
        position: 'absolute',
        right: 28,
        bottom: 40,
        width: 96,
        height: 96,
        borderRadius: '50%',
        border: '2px solid rgba(255, 200, 80, 0.7)',
        background:
          'radial-gradient(circle at 35% 30%, #ffce5c 0%, #e48a1a 60%, #a14b00 100%)',
        color: '#1a1208',
        fontWeight: 800,
        fontSize: 16,
        letterSpacing: 1,
        cursor: 'pointer',
        boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
        touchAction: 'none',
        contain: 'layout paint',
      }}
    >
      FIRE
    </button>
  );
});

interface SkillProps {
  id: SkillId;
  label: string;
  subtitle: string;
  accent: string;
  right: number;
  bottom: number;
  size: number;
  totalMs: number;
  getGame: () => Game | null;
}

const SkillButton = memo(function SkillButton({
  id,
  label,
  subtitle,
  accent,
  right,
  bottom,
  size,
  totalMs,
  getGame,
}: SkillProps) {
  // Each skill button polls its own cooldown — keeps re-renders local.
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    const tick = () => {
      const g = getGame();
      if (!g) return;
      const cd = id === 'q' ? g.getQCooldownLeft() : g.getECooldownLeft();
      setCooldown((prev) => (Math.abs(prev - cd) > 30 || cd === 0 ? cd : prev));
    };
    const handle = window.setInterval(tick, 100);
    return () => window.clearInterval(handle);
  }, [id, getGame]);

  const onCooldown = cooldown > 0;
  const seconds = onCooldown ? Math.ceil(cooldown / 1000) : 0;
  const fillPct = onCooldown
    ? Math.min(100, ((totalMs - cooldown) / totalMs) * 100)
    : 100;

  const activePointer = useRef<number | null>(null);

  return (
    <button
      onPointerDown={(e) => {
        if (onCooldown) return;
        if (activePointer.current !== null) return;
        activePointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
        getGame()?.startAim(id);
      }}
      onPointerMove={(e) => {
        if (activePointer.current !== e.pointerId) return;
        const r = e.currentTarget.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        // Drag → world-direction. Same axis flip the joystick uses.
        const wx = e.clientY - cy;
        const wz = -(e.clientX - cx);
        if (Math.hypot(wx, wz) > 8) getGame()?.updateAim(id, wx, wz);
      }}
      onPointerUp={(e) => {
        if (activePointer.current !== e.pointerId) return;
        activePointer.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        getGame()?.releaseAim(id);
      }}
      onPointerCancel={(e) => {
        if (activePointer.current !== e.pointerId) return;
        activePointer.current = null;
        getGame()?.cancelAim(id);
      }}
      style={{
        position: 'absolute',
        right,
        bottom,
        width: size,
        height: size,
        borderRadius: '50%',
        border: `2px solid ${accent}`,
        background: onCooldown
          ? 'rgba(20, 24, 36, 0.7)'
          : `radial-gradient(circle at 35% 30%, ${accent} 0%, #1a1825 75%)`,
        color: '#fff',
        fontWeight: 800,
        fontSize: 22,
        letterSpacing: 1,
        cursor: onCooldown ? 'default' : 'pointer',
        boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
        touchAction: 'none',
        opacity: onCooldown ? 0.55 : 1,
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
        contain: 'layout paint',
      }}
    >
      {onCooldown && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `conic-gradient(${accent}66 ${fillPct}%, transparent ${fillPct}%)`,
            borderRadius: '50%',
            pointerEvents: 'none',
          }}
        />
      )}
      <div
        style={{
          position: 'relative',
          display: 'grid',
          placeItems: 'center',
          lineHeight: 1,
          pointerEvents: 'none',
        }}
      >
        <div>{onCooldown ? seconds : label}</div>
        <div style={{ fontSize: 9, opacity: 0.8, marginTop: 2 }}>{subtitle}</div>
      </div>
    </button>
  );
});

function MatchEndOverlay({
  winner,
  onRestart,
}: {
  winner: Team;
  onRestart: () => void;
}) {
  const isVictory = winner === 'blue';
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(6px)',
        zIndex: 20,
      }}
    >
      <div
        style={{
          display: 'grid',
          placeItems: 'center',
          gap: 24,
          padding: '32px 56px',
          borderRadius: 20,
          background: 'rgba(20, 22, 36, 0.88)',
          border: `2px solid ${isVictory ? '#7be38e' : '#e36b6b'}`,
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
        }}
      >
        <div
          style={{
            fontSize: 56,
            fontWeight: 900,
            letterSpacing: 4,
            color: isVictory ? '#7be38e' : '#e36b6b',
            textShadow: '0 4px 18px rgba(0,0,0,0.6)',
          }}
        >
          {isVictory ? 'VICTORY' : 'DEFEAT'}
        </div>
        <button
          onClick={onRestart}
          style={{
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 2,
            padding: '12px 36px',
            borderRadius: 999,
            border: '2px solid #ffce5c',
            background:
              'radial-gradient(circle at 35% 30%, #ffce5c 0%, #e48a1a 60%, #a14b00 100%)',
            color: '#1a1208',
            cursor: 'pointer',
            boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
          }}
        >
          PLAY AGAIN
        </button>
      </div>
    </div>
  );
}
