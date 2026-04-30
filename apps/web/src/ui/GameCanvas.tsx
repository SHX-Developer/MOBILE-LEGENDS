import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createGame, type Game } from '../game/index.js';

interface Frame {
  logicalW: number;
  logicalH: number;
  vpW: number;
  vpH: number;
}

type Team = 'blue' | 'red';
type SkillId = 'q' | 'e' | 'c';

function computeFrame(): Frame {
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;
  const portrait = vpH > vpW;
  // In portrait we rotate 90° and want the rotated content to fully fill the
  // viewport, so the pre-rotation width = vpH, height = vpW. The camera aspect
  // floats slightly off 16:9; the camera FOV soaks up the difference cleanly.
  const logicalW = portrait ? vpH : vpW;
  const logicalH = portrait ? vpW : vpH;
  return { logicalW, logicalH, vpW, vpH };
}

interface GameCanvasProps {
  mode: 'online' | 'offline';
  onExit?: () => void;
}

export function GameCanvas({ mode, onExit }: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [frame, setFrame] = useState<Frame>(() => computeFrame());
  const [gameKey, setGameKey] = useState(0);
  const [matchEnd, setMatchEnd] = useState<Team | null>(null);
  const [matchMs, setMatchMs] = useState(0);
  const [respawnMs, setRespawnMs] = useState(0);
  const [onlineStatus, setOnlineStatus] = useState('connecting');

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
    const game = createGame(containerRef.current, { mode });
    game.onMatchEnd = (winner) => setMatchEnd(winner);
    gameRef.current = game;
    return () => {
      game.destroy();
      gameRef.current = null;
    };
  }, [gameKey, mode]);

  useEffect(() => {
    setMatchMs(0);
    setRespawnMs(0);
    const handle = window.setInterval(() => {
      const game = gameRef.current;
      if (!game) return;
      setMatchMs(game.getMatchElapsedMs());
      setRespawnMs(game.getPlayerRespawnLeft());
      setOnlineStatus(game.getOnlineStatus());
    }, 250);
    return () => window.clearInterval(handle);
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
        <MatchTimer elapsedMs={matchMs} respawnMs={respawnMs} />
        {mode === 'online' && <OnlineStatus status={onlineStatus} />}
        {/* Invisible safety nets around the controls — empty taps inside
            these zones don't reach the camera-pan listener on the canvas. */}
        <ControlZone left={130} bottom={24} width={210} height={210} />
        <ControlZone right={20} bottom={20} width={300} height={260} />
        <BottomCenterZone />

        <Joystick onChange={onJoystickChange} />
        <FireButton onPress={onFirePress} onRelease={onFireRelease} />
        {/* Three skills wrap around FIRE (which sits in the corner). Q above,
            E top-left diagonal, C straight left — like a fan. */}
        <SkillButton
          id="q"
          label=""
          subtitle="POWER"
          accent="#ff7a3d"
          right={28}
          bottom={210}
          size={86}
          totalMs={6000}
          getGame={getGame}
        />
        <SkillButton
          id="e"
          label=""
          subtitle="SLOW"
          accent="#4ec9ff"
          right={170}
          bottom={186}
          size={86}
          totalMs={8000}
          getGame={getGame}
        />
        <SkillButton
          id="c"
          label=""
          subtitle="STUN"
          accent="#b56cff"
          right={232}
          bottom={70}
          size={86}
          totalMs={10000}
          getGame={getGame}
        />
        <TriangleAttackButton
          variant="tower"
          right={148}
          bottom={36}
          getGame={getGame}
        />
        <TriangleAttackButton
          variant="minion"
          right={56}
          bottom={144}
          getGame={getGame}
        />
        <UtilityButton
          label="HEAL"
          accent="#6cff8a"
          totalMs={22000}
          centerOffsetX={-46}
          getGame={getGame}
          getCooldown={(g) => g.getHealCooldownLeft()}
          getChannelLeft={() => 0}
          onPress={(g) => g.tryHeal()}
        />
        <UtilityButton
          label="HOME"
          accent="#9fd8ff"
          totalMs={30000}
          centerOffsetX={46}
          getGame={getGame}
          getCooldown={(g) => g.getRecallCooldownLeft()}
          getChannelLeft={(g) => g.getRecallChannelLeft()}
          onPress={(g) => g.startRecall()}
        />
        {/* Death dim — soft black wash while waiting on respawn. */}
        {!matchEnd && respawnMs > 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.32)',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          />
        )}
        {matchEnd && (
          <MatchEndOverlay winner={matchEnd} onRestart={restart} onExit={onExit} />
        )}
        {mode === 'online' && !matchEnd && onlineStatus !== 'playing' && (
          <QueueOverlay status={onlineStatus} onCancel={onExit} />
        )}
      </div>
    </div>
  );
}

const TriangleAttackButton = memo(function TriangleAttackButton({
  variant,
  right,
  bottom,
  getGame,
}: {
  variant: 'tower' | 'minion';
  right: number;
  bottom: number;
  getGame: () => Game | null;
}) {
  const accent = variant === 'tower' ? '#f0b04a' : '#7be38e';
  const label = variant === 'tower' ? 'БАШНЯ' : 'МИНЬОН';
  return (
    <button
      onPointerDown={(e) => {
        const g = getGame();
        if (!g) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        if (variant === 'tower') g.attackTower();
        else g.attackMinion();
      }}
      style={{
        position: 'absolute',
        right,
        bottom,
        width: 64,
        height: 64,
        // Triangle shape pointing inward toward FIRE — sharp tip at the
        // bottom-right corner so both buttons "lean" into the auto-attack.
        clipPath: variant === 'tower'
          ? 'polygon(50% 100%, 0% 0%, 100% 0%)' // pointing down (above-targets)
          : 'polygon(100% 50%, 0% 0%, 0% 100%)', // pointing right (left-targets)
        border: 'none',
        background: `linear-gradient(135deg, ${accent} 0%, #1a1825 100%)`,
        color: '#0a0e15',
        fontWeight: 900,
        fontSize: 9,
        letterSpacing: 1,
        cursor: 'pointer',
        boxShadow: `0 0 0 2px ${accent}66, 0 4px 14px rgba(0,0,0,0.45)`,
        touchAction: 'none',
        display: 'grid',
        placeItems: 'center',
        contain: 'layout paint',
      }}
    >
      <span
        style={{
          // Pull the label toward the centre of the triangle.
          transform: variant === 'tower' ? 'translateY(-8px)' : 'translateX(-8px)',
          pointerEvents: 'none',
        }}
      >
        {label}
      </span>
    </button>
  );
});

interface UtilityButtonProps {
  label: string;
  accent: string;
  totalMs: number;
  centerOffsetX: number;
  getGame: () => Game | null;
  getCooldown: (g: Game) => number;
  getChannelLeft: (g: Game) => number;
  onPress: (g: Game) => void;
}

const UtilityButton = memo(function UtilityButton({
  label,
  accent,
  totalMs,
  centerOffsetX,
  getGame,
  getCooldown,
  getChannelLeft,
  onPress,
}: UtilityButtonProps) {
  const [cooldown, setCooldown] = useState(0);
  const [channel, setChannel] = useState(0);
  useEffect(() => {
    const handle = window.setInterval(() => {
      const g = getGame();
      if (!g) return;
      setCooldown(getCooldown(g));
      setChannel(getChannelLeft(g));
    }, 120);
    return () => window.clearInterval(handle);
  }, [getGame, getCooldown, getChannelLeft]);

  const onCd = cooldown > 0;
  const channeling = channel > 0;
  const fillPct = onCd ? Math.min(100, ((totalMs - cooldown) / totalMs) * 100) : 100;
  return (
    <button
      onPointerDown={(e) => {
        if (onCd || channeling) return;
        const g = getGame();
        if (!g) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        onPress(g);
      }}
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 22,
        transform: `translateX(calc(-50% + ${centerOffsetX}px))`,
        width: 64,
        height: 64,
        borderRadius: '50%',
        border: `2px solid ${accent}`,
        background: onCd
          ? 'rgba(20, 24, 36, 0.7)'
          : `radial-gradient(circle at 35% 30%, ${accent} 0%, #1a1825 75%)`,
        color: '#0a0e15',
        fontWeight: 900,
        fontSize: 11,
        letterSpacing: 1.5,
        cursor: onCd ? 'default' : 'pointer',
        boxShadow: channeling
          ? `0 0 0 4px ${accent}99, 0 0 22px ${accent}aa`
          : '0 6px 18px rgba(0,0,0,0.45)',
        touchAction: 'none',
        opacity: onCd ? 0.55 : 1,
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
        contain: 'layout paint',
      }}
    >
      {onCd && (
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
      <div style={{ position: 'relative', pointerEvents: 'none', color: onCd ? '#fff' : '#0a0e15' }}>
        {onCd ? Math.ceil(cooldown / 1000) : channeling ? Math.ceil(channel / 1000) : label}
      </div>
    </button>
  );
});

function BottomCenterZone() {
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 14,
        transform: 'translateX(-50%)',
        width: 200,
        height: 80,
        pointerEvents: 'auto',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

function ControlZone({
  left,
  right,
  bottom,
  width,
  height,
}: {
  left?: number;
  right?: number;
  bottom: number;
  width: number;
  height: number;
}) {
  // A transparent absorber: receives pointer events that miss the buttons it
  // wraps, so the canvas pan listener underneath never sees them. Buttons sit
  // on top in DOM order and still receive their own taps.
  return (
    <div
      style={{
        position: 'absolute',
        left,
        right,
        bottom,
        width,
        height,
        pointerEvents: 'auto',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

function QueueOverlay({ status, onCancel }: { status: string; onCancel?: () => void }) {
  const label =
    status === 'queued'
      ? 'ИЩЕМ ИГРОКОВ'
      : status === 'offline'
        ? 'НЕТ СОЕДИНЕНИЯ'
        : 'ПОДКЛЮЧЕНИЕ';
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 30,
        display: 'grid',
        placeItems: 'center',
        gap: 24,
        background:
          'radial-gradient(ellipse at center, #1c2238 0%, #0a0d18 70%, #050709 100%)',
        color: '#fff',
      }}
    >
      <div style={{ display: 'grid', placeItems: 'center', gap: 18 }}>
        <Spinner />
        <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 6 }}>{label}</div>
        {status === 'queued' && (
          <div style={{ fontSize: 13, color: '#7a8aab', letterSpacing: 2 }}>
            ОЖИДАЕМ ВТОРОГО ИГРОКА
          </div>
        )}
        {onCancel && (
          <button
            onClick={onCancel}
            style={{
              marginTop: 16,
              padding: '12px 32px',
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: 3,
              borderRadius: 999,
              border: '2px solid rgba(255,255,255,0.4)',
              background: 'rgba(20, 22, 36, 0.7)',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            ОТМЕНА
          </button>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div
      style={{
        width: 56,
        height: 56,
        borderRadius: '50%',
        border: '4px solid rgba(255,255,255,0.15)',
        borderTopColor: '#ffce5c',
        animation: 'ml-spin 1s linear infinite',
      }}
    >
      <style>{`@keyframes ml-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function OnlineStatus({ status }: { status: string }) {
  if (status === 'playing') return null;
  const label =
    status === 'queued'
      ? 'SEARCHING 1V1'
      : status === 'connecting'
        ? 'CONNECTING'
        : status === 'offline'
          ? 'OFFLINE MODE'
          : '';
  if (!label) return null;
  return (
    <div
      style={{
        position: 'absolute',
        top: 58,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        padding: '6px 12px',
        borderRadius: 8,
        background: 'rgba(8, 12, 18, 0.68)',
        border: '1px solid rgba(255, 255, 255, 0.16)',
        color: status === 'offline' ? '#ffcd66' : '#9fd8ff',
        fontSize: 12,
        fontWeight: 900,
        letterSpacing: 1,
        pointerEvents: 'none',
      }}
    >
      {label}
    </div>
  );
}

function MatchTimer({ elapsedMs, respawnMs }: { elapsedMs: number; respawnMs: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        minWidth: 112,
        height: respawnMs > 0 ? 50 : 34,
        padding: respawnMs > 0 ? '6px 14px' : '4px 14px',
        borderRadius: 8,
        background: 'rgba(8, 12, 18, 0.72)',
        border: '1px solid rgba(255, 255, 255, 0.18)',
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        pointerEvents: 'none',
        boxShadow: '0 5px 18px rgba(0,0,0,0.35)',
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1 }}>{formatMatchTime(elapsedMs)}</div>
      {respawnMs > 0 && (
        <div style={{ marginTop: 4, fontSize: 11, fontWeight: 800, color: '#ffcd66', lineHeight: 1 }}>
          RESPAWN {Math.ceil(respawnMs / 1000)}s
        </div>
      )}
    </div>
  );
}

function formatMatchTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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
        left: 150,
        bottom: 36,
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
        right: 30,
        bottom: 30,
        width: 102,
        height: 102,
        borderRadius: '50%',
        border: '3px solid rgba(255, 210, 100, 0.8)',
        background:
          'radial-gradient(circle at 35% 30%, #ffd96a 0%, #e48a1a 60%, #8a3d00 100%)',
        color: '#1a1208',
        fontWeight: 900,
        fontSize: 18,
        letterSpacing: 2,
        cursor: 'pointer',
        boxShadow: '0 8px 22px rgba(0,0,0,0.55), 0 0 0 4px rgba(255,206,92,0.18)',
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
  const [readyPulse, setReadyPulse] = useState(0);
  useEffect(() => {
    let prevCd = 0;
    const tick = () => {
      const g = getGame();
      if (!g) return;
      const cd =
        id === 'q' ? g.getQCooldownLeft() : id === 'e' ? g.getECooldownLeft() : g.getCCooldownLeft();
      // Pulse the button briefly the moment cooldown finishes.
      if (prevCd > 0 && cd === 0) setReadyPulse(Date.now());
      prevCd = cd;
      setCooldown((prev) => (Math.abs(prev - cd) > 30 || cd === 0 ? cd : prev));
    };
    const handle = window.setInterval(tick, 100);
    return () => window.clearInterval(handle);
  }, [id, getGame]);
  const pulsing = readyPulse > 0 && Date.now() - readyPulse < 420;

  const onCooldown = cooldown > 0;
  const seconds = onCooldown ? Math.ceil(cooldown / 1000) : 0;
  const fillPct = onCooldown
    ? Math.min(100, ((totalMs - cooldown) / totalMs) * 100)
    : 100;

  const activePointer = useRef<number | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const cancelRef = useRef<HTMLDivElement>(null);
  const [aiming, setAiming] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const DRAG_AIM_THRESHOLD = 14;

  function pointInCancel(clientX: number, clientY: number): boolean {
    const cancel = cancelRef.current;
    if (!cancel) return false;
    const r = cancel.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  }

  return (
    <>
      {aiming && (
        <div
          ref={cancelRef}
          style={{
            position: 'absolute',
            right: 240,
            bottom: 320,
            width: 78,
            height: 78,
            borderRadius: '50%',
            border: `3px solid ${canceling ? '#ff6b6b' : 'rgba(255,255,255,0.4)'}`,
            background: canceling ? 'rgba(190, 38, 38, 0.85)' : 'rgba(8, 12, 18, 0.78)',
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            fontSize: 12,
            fontWeight: 900,
            letterSpacing: 1.5,
            pointerEvents: 'none',
            boxShadow: '0 6px 22px rgba(0,0,0,0.5)',
            zIndex: 11,
          }}
        >
          ОТМЕНА
        </div>
      )}
      <button
        onPointerDown={(e) => {
          if (onCooldown) return;
          if (activePointer.current !== null) return;
          activePointer.current = e.pointerId;
          dragStart.current = { x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
          e.preventDefault();
          // Tap-vs-drag is decided in onPointerMove. Don't open aim UI yet.
        }}
        onPointerMove={(e) => {
          if (activePointer.current !== e.pointerId) return;
          const start = dragStart.current;
          if (!start) return;
          const dragDist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
          if (!aiming) {
            if (dragDist < DRAG_AIM_THRESHOLD) return;
            setAiming(true);
            setCanceling(false);
            getGame()?.startAim(id);
          }
          const r = e.currentTarget.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const shouldCancel = pointInCancel(e.clientX, e.clientY);
          setCanceling(shouldCancel);
          if (shouldCancel) return;
          // Drag -> world-direction. Same axis flip the joystick uses.
          const wx = e.clientY - cy;
          const wz = -(e.clientX - cx);
          if (Math.hypot(wx, wz) > 8) getGame()?.updateAim(id, wx, wz);
        }}
        onPointerUp={(e) => {
          if (activePointer.current !== e.pointerId) return;
          const wasAiming = aiming;
          const shouldCancel = canceling || (wasAiming && pointInCancel(e.clientX, e.clientY));
          activePointer.current = null;
          dragStart.current = null;
          e.currentTarget.releasePointerCapture(e.pointerId);
          setAiming(false);
          setCanceling(false);
          if (shouldCancel) {
            if (wasAiming) getGame()?.cancelAim(id);
            return;
          }
          if (wasAiming) {
            getGame()?.releaseAim(id);
          } else {
            // Plain tap → auto-aim and cast at nearest enemy.
            getGame()?.castAuto(id);
          }
        }}
        onPointerCancel={(e) => {
          if (activePointer.current !== e.pointerId) return;
          activePointer.current = null;
          setAiming(false);
          setCanceling(false);
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
          touchAction: 'none',
          opacity: onCooldown ? 0.55 : 1,
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
          contain: 'layout paint',
          transform: pulsing ? 'scale(1.12)' : 'scale(1)',
          transition: 'transform 180ms ease-out, box-shadow 180ms ease-out',
          boxShadow: pulsing
            ? `0 0 0 4px ${accent}99, 0 0 26px ${accent}aa`
            : '0 6px 18px rgba(0,0,0,0.45)',
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
          {onCooldown ? (
            <div style={{ fontSize: 22, fontWeight: 900 }}>{seconds}</div>
          ) : (
            <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1.5 }}>{subtitle}</div>
          )}
          {label && !onCooldown && (
            <div style={{ fontSize: 9, opacity: 0.7, marginTop: 2 }}>{label}</div>
          )}
        </div>
      </button>
    </>
  );
});

function MatchEndOverlay({
  winner,
  onRestart,
  onExit,
}: {
  winner: Team;
  onRestart: () => void;
  onExit?: () => void;
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
        <div style={{ display: 'flex', gap: 16 }}>
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
          {onExit && (
            <button
              onClick={onExit}
              style={{
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: 2,
                padding: '12px 36px',
                borderRadius: 999,
                border: '2px solid rgba(255,255,255,0.4)',
                background: 'rgba(20, 22, 36, 0.7)',
                color: '#fff',
                cursor: 'pointer',
                boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
              }}
            >
              MENU
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
