import { useEffect, useRef, useState } from 'react';
import { createGame, type Game } from '../game/index.js';

const ASPECT = 16 / 9;

interface Frame {
  logicalW: number;
  logicalH: number;
  vpW: number;
  vpH: number;
}

type Team = 'blue' | 'red';

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
  const [cooldowns, setCooldowns] = useState({ q: 0, e: 0 });

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

  useEffect(() => {
    const id = setInterval(() => {
      const g = gameRef.current;
      if (!g) return;
      setCooldowns({ q: g.getQCooldownLeft(), e: g.getECooldownLeft() });
    }, 100);
    return () => clearInterval(id);
  }, []);

  function restart() {
    setMatchEnd(null);
    setCooldowns({ q: 0, e: 0 });
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
        <Joystick onChange={(x, z) => gameRef.current?.setJoystickAxis(x, z)} />
        <FireButton onFire={() => gameRef.current?.fire()} />
        <SkillButton
          label="Q"
          subtitle="POWER"
          accent="#ff7a3d"
          right={36}
          bottom={150}
          size={72}
          cooldownLeftMs={cooldowns.q}
          totalMs={6000}
          onUse={() => gameRef.current?.useQ()}
        />
        <SkillButton
          label="E"
          subtitle="SLOW"
          accent="#4ec9ff"
          right={130}
          bottom={92}
          size={72}
          cooldownLeftMs={cooldowns.e}
          totalMs={8000}
          onUse={() => gameRef.current?.useE()}
        />
      </div>

      {matchEnd && <MatchEndOverlay winner={matchEnd} onRestart={restart} />}
    </div>
  );
}

const JOY_BASE = 130;
const JOY_KNOB = 60;
const JOY_RADIUS = (JOY_BASE - JOY_KNOB) / 2;

function Joystick({ onChange }: { onChange: (x: number, z: number) => void }) {
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
        left: 24,
        bottom: 24,
        width: JOY_BASE,
        height: JOY_BASE,
        borderRadius: '50%',
        background: 'rgba(20, 24, 36, 0.45)',
        border: '2px solid rgba(255,255,255,0.35)',
        backdropFilter: 'blur(4px)',
        touchAction: 'none',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div
        ref={knobRef}
        style={{
          width: JOY_KNOB,
          height: JOY_KNOB,
          borderRadius: '50%',
          background: 'rgba(220, 220, 240, 0.85)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          pointerEvents: 'none',
          transition: 'transform 0.05s linear',
        }}
      />
    </div>
  );
}

function FireButton({ onFire }: { onFire: () => void }) {
  return (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        onFire();
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
      }}
    >
      FIRE
    </button>
  );
}

interface SkillProps {
  label: string;
  subtitle: string;
  accent: string;
  right: number;
  bottom: number;
  size: number;
  cooldownLeftMs: number;
  totalMs: number;
  onUse: () => void;
}

function SkillButton({
  label,
  subtitle,
  accent,
  right,
  bottom,
  size,
  cooldownLeftMs,
  totalMs,
  onUse,
}: SkillProps) {
  const onCooldown = cooldownLeftMs > 0;
  const seconds = onCooldown ? Math.ceil(cooldownLeftMs / 1000) : 0;
  const fillPct = onCooldown
    ? Math.min(100, ((totalMs - cooldownLeftMs) / totalMs) * 100)
    : 100;

  return (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        if (!onCooldown) onUse();
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
        }}
      >
        <div>{onCooldown ? seconds : label}</div>
        <div style={{ fontSize: 9, opacity: 0.8, marginTop: 2 }}>{subtitle}</div>
      </div>
    </button>
  );
}

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
