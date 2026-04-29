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
    <div
      style={{
        position: 'relative',
        height: '100%',
        overflow: 'hidden',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
      <Joystick onChange={(x, z) => gameRef.current?.setJoystickAxis(x, z)} />
      <FireButton onFire={() => gameRef.current?.fire()} />
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
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > JOY_RADIUS) {
      dx = (dx / dist) * JOY_RADIUS;
      dy = (dy / dist) * JOY_RADIUS;
    }
    setKnob(dx, dy);
    onChange(dx / JOY_RADIUS, dy / JOY_RADIUS);
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
        left: 32,
        bottom: 32,
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
        right: 36,
        bottom: 56,
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
