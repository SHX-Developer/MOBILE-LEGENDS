import { useEffect, useRef, useState } from 'react';
import { createGame, type Game } from '../game/index.js';

const ASPECT = 16 / 9;

interface Frame {
  logicalW: number;
  logicalH: number;
  vpW: number;
  vpH: number;
}

/**
 * Game is always rendered as a 16:9 frame rotated 90° CW. The frame's
 * logical width/height are picked so the rotated AABB fills as much of
 * the viewport as possible while keeping aspect.
 */
function computeFrame(): Frame {
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;
  // After rotate(90deg): visual_w = logicalH, visual_h = logicalW.
  // Aspect: logicalW / logicalH = ASPECT.
  // Fit:    logicalH ≤ vpW AND ASPECT*logicalH ≤ vpH.
  const logicalH = Math.min(vpW, vpH / ASPECT);
  const logicalW = ASPECT * logicalH;
  return { logicalW, logicalH, vpW, vpH };
}

export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [frame, setFrame] = useState<Frame>(() => computeFrame());

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
    gameRef.current = createGame(containerRef.current);
    return () => {
      gameRef.current?.destroy();
      gameRef.current = null;
    };
  }, []);

  // Centre the pre-rotation frame at the viewport centre. After rotation
  // around its own centre the visual AABB is still centred in the viewport.
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
          transform: 'rotate(-90deg)',
          transformOrigin: 'center center',
          touchAction: 'none',
        }}
      >
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        <Joystick onChange={(x, z) => gameRef.current?.setJoystickAxis(x, z)} />
        <FireButton onFire={() => gameRef.current?.fire()} />
      </div>
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
    // viewport-space delta from joystick centre
    const vDx = clientX - cx;
    const vDy = clientY - cy;
    // wrapper rotated 90° CCW → invert with: local = (vDy, -vDx)
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
