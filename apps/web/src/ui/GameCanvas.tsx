import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createGame, type Game } from '../game/index.js';
import type { HeroKind } from '../game/constants.js';

interface Frame {
  logicalW: number;
  logicalH: number;
  vpW: number;
  vpH: number;
}

type Team = 'blue' | 'red';
type SkillId = 'q' | 'e' | 'c';

interface SkillProfile {
  /** Short name shown on the button face. */
  subtitle: string;
  /** Border / fill accent colour. Differs per skill so the player can recognise
   *  each button at a glance even after a quick UI change. */
  accent: string;
  /** Total cooldown the progress ring fills against. Must match the matching
   *  cooldown in the hero's SkillConfig — otherwise the ring desyncs from
   *  the actual cast availability. */
  totalMs: number;
}

/**
 * Per-hero skill button presentation. The position of each button is fixed
 * (the user wants a consistent layout across heroes), but the labels, colour
 * accents, and cooldown ring totals branch per archetype:
 *
 *   ranger — Q POWER (heavy), E SLOW (cyan), C STUN (purple)
 *   mage   — Q ОГОНЬ (fireball), E СТЕНА (flame wave), C МЕТЕОР (AoE)
 *
 * Keep these numbers in sync with the matching MAGE_*_COOLDOWN_MS / SKILL_*
 * constants — the ring is purely cosmetic and won't gate the actual cast.
 */
const SKILL_PROFILES: Record<HeroKind, Record<SkillId, SkillProfile>> = {
  ranger: {
    q: { subtitle: 'POWER', accent: '#ff7a3d', totalMs: 10000 },
    e: { subtitle: 'SLOW', accent: '#4ec9ff', totalMs: 3000 },
    c: { subtitle: 'STUN', accent: '#b56cff', totalMs: 5000 },
  },
  mage: {
    q: { subtitle: 'ОГОНЬ', accent: '#ff5a18', totalMs: 7000 },
    e: { subtitle: 'СТЕНА', accent: '#ff9a3a', totalMs: 8000 },
    c: { subtitle: 'МЕТЕОР', accent: '#ffd852', totalMs: 12000 },
  },
  fighter: {
    q: { subtitle: 'СЕЧЕНИЕ', accent: '#e6a648', totalMs: 6000 },
    e: { subtitle: 'РЫВОК', accent: '#ffd17a', totalMs: 9000 },
    c: { subtitle: 'ВИХРЬ', accent: '#dc4f2a', totalMs: 11000 },
  },
  assassin: {
    q: { subtitle: 'ЛЕЗВИЯ', accent: '#a470ff', totalMs: 5000 },
    e: { subtitle: 'ТЕНЬ', accent: '#7c4ad8', totalMs: 8000 },
    c: { subtitle: 'КАЗНЬ', accent: '#ff3a86', totalMs: 10000 },
  },
  tank: {
    q: { subtitle: 'УДАР', accent: '#9aa6b8', totalMs: 7000 },
    e: { subtitle: 'ЩИТ', accent: '#7ee06f', totalMs: 14000 },
    c: { subtitle: 'ЗЕМЛЕТРЯС', accent: '#c99650', totalMs: 14000 },
  },
};

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
  heroKind?: HeroKind;
  onExit?: () => void;
}

export function GameCanvas({ mode, heroKind = 'ranger', onExit }: GameCanvasProps) {
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
    const game = createGame(containerRef.current, { mode, heroKind });
    game.onMatchEnd = (winner) => setMatchEnd(winner);
    gameRef.current = game;
    return () => {
      game.destroy();
      gameRef.current = null;
    };
  }, [gameKey, mode, heroKind]);

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
        <Minimap getGame={getGame} />
        <MatchTimer elapsedMs={matchMs} respawnMs={respawnMs} />
        {mode === 'online' && <OnlineStatus status={onlineStatus} />}
        {/* Invisible safety nets around the controls — empty taps inside
            these zones don't reach the camera-pan listener on the canvas. */}
        <ControlZone left={130} bottom={24} width={210} height={210} />
        {/* Right-side absorber covers the skill column (which now climbs to
            ~bottom=412), MINION, TOWER and FIRE. */}
        <ControlZone right={20} bottom={20} width={310} height={420} />
        <BottomCenterZone />

        <Joystick onChange={onJoystickChange} />
        <FireButton onPress={onFirePress} onRelease={onFireRelease} />
        {/* Skills fan around the action area instead of stacking in one
            row. Anchored to the new (post-swap) MINION/TOWER positions:
              • Q (1st) — to the LEFT of MINION on the same row.
              • E (2nd) — diagonally BETWEEN MINION (top) and TOWER
                (bottom-left), slightly inset from both.
              • C (3rd) — directly ABOVE TOWER.
            Labels, accent colours, and cooldown ring durations come from
            SKILL_PROFILES so each hero's loadout reads differently. */}
        <SkillButton
          id="q"
          label=""
          subtitle={SKILL_PROFILES[heroKind].q.subtitle}
          accent={SKILL_PROFILES[heroKind].q.accent}
          right={240}
          bottom={36}
          size={80}
          totalMs={SKILL_PROFILES[heroKind].q.totalMs}
          getGame={getGame}
        />
        <SkillButton
          id="e"
          label=""
          subtitle={SKILL_PROFILES[heroKind].e.subtitle}
          accent={SKILL_PROFILES[heroKind].e.accent}
          right={140}
          bottom={130}
          size={80}
          totalMs={SKILL_PROFILES[heroKind].e.totalMs}
          getGame={getGame}
        />
        <SkillButton
          id="c"
          label=""
          subtitle={SKILL_PROFILES[heroKind].c.subtitle}
          accent={SKILL_PROFILES[heroKind].c.accent}
          right={56}
          bottom={240}
          size={80}
          totalMs={SKILL_PROFILES[heroKind].c.totalMs}
          getGame={getGame}
        />
        {/* MINION and TOWER swapped per the latest layout pass —
            the player wants the minion-attack closer to the FIRE side
            because it gets used more often than the tower lock. */}
        <TargetAttackButton
          variant="minion"
          right={148}
          bottom={36}
          getGame={getGame}
        />
        <TargetAttackButton
          variant="tower"
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
          getChannelLeft={(g) => g.getHealChannelLeft()}
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

const TargetAttackButton = memo(function TargetAttackButton({
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
  const label = variant === 'tower' ? 'TOWER' : 'MINION';
  const icon = variant === 'tower' ? 'T' : 'M';
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
        width: 76,
        height: 76,
        borderRadius: '50%',
        border: `2px solid ${accent}`,
        background: `radial-gradient(circle at 35% 28%, #ffffff 0%, ${accent} 28%, #192033 78%)`,
        color: '#071015',
        fontWeight: 900,
        fontSize: 10,
        letterSpacing: 0.8,
        cursor: 'pointer',
        boxShadow: `0 8px 20px rgba(0,0,0,0.5), 0 0 0 4px ${accent}33`,
        touchAction: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        contain: 'layout paint',
      }}
    >
      <span
        style={{
          fontSize: 22,
          lineHeight: 1,
          color: '#0b1220',
          textShadow: '0 1px 0 rgba(255,255,255,0.45)',
          pointerEvents: 'none',
        }}
      >
        {icon}
      </span>
      <span
        style={{
          fontSize: 9,
          lineHeight: 1,
          color: '#fff',
          textShadow: '0 1px 4px rgba(0,0,0,0.7)',
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
  const disabled = onCd || channeling;
  return (
    <button
      onPointerDown={(e) => {
        if (disabled) return;
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
        background: onCd && !channeling
          ? 'rgba(20, 24, 36, 0.7)'
          : `radial-gradient(circle at 35% 30%, ${accent} 0%, #1a1825 75%)`,
        color: '#0a0e15',
        fontWeight: 900,
        fontSize: 11,
        letterSpacing: 1.5,
        cursor: disabled ? 'default' : 'pointer',
        boxShadow: channeling
          ? `0 0 0 4px ${accent}99, 0 0 22px ${accent}aa`
          : '0 6px 18px rgba(0,0,0,0.45)',
        touchAction: 'none',
        opacity: onCd && !channeling ? 0.55 : 1,
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
        contain: 'layout paint',
      }}
    >
      {onCd && !channeling && (
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
      <div style={{ position: 'relative', pointerEvents: 'none', color: onCd && !channeling ? '#fff' : '#0a0e15' }}>
        {channeling ? Math.ceil(channel / 1000) : onCd ? Math.ceil(cooldown / 1000) : label}
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

/**
 * Top-down minimap pinned to the top-left of the landscape view. Polls the
 * game's world snapshot ~6 Hz and re-renders dots for every alive hero,
 * minion, tower and base. Cheap (small SVG, low refresh rate) and lets the
 * player track lane pressure without panning the camera. Tapping anywhere
 * inside it eases the camera to that world point for ~2s.
 *
 * The 90° rotation that matches in-game camera orientation is BAKED INTO
 * the world→pixel mapping rather than applied as a CSS transform, so tap
 * coordinates land in pixel space directly without inverse-rotation math.
 */
const Minimap = memo(function Minimap({ getGame }: { getGame: () => Game | null }) {
  type Snap = ReturnType<NonNullable<ReturnType<typeof getGame>>['getMinimapState']>;
  const [snap, setSnap] = useState<Snap | null>(null);
  useEffect(() => {
    const tick = () => {
      const g = getGame();
      if (!g) return;
      setSnap(g.getMinimapState());
    };
    tick();
    const handle = window.setInterval(tick, 160);
    return () => window.clearInterval(handle);
  }, [getGame]);
  if (!snap) return null;
  const size = 132;
  const padding = 6;
  const inner = size - padding * 2;
  // World → minimap pixel. The "rotate the visual -90deg around the centre"
  // step is folded into the formula: visualX = inner * (1 - (z + mapH/2)/mapH);
  // visualY = inner * (1 - (x + mapW/2)/mapW). Result: world +x reads UP on
  // the minimap, world +z reads LEFT — the same orientation the camera
  // shows the player.
  const norm = (x: number, z: number): [number, number] => {
    const px = inner * (1 - (z + snap.mapH / 2) / snap.mapH);
    const py = inner * (1 - (x + snap.mapW / 2) / snap.mapW);
    return [padding + px, padding + py];
  };
  // Inverse of `norm` — converts a minimap-local pixel back to world (x, z).
  const minimapToWorld = (lx: number, ly: number): [number, number] => {
    const px = lx - padding;
    const py = ly - padding;
    const z = (1 - px / inner) * snap.mapH - snap.mapH / 2;
    const x = (1 - py / inner) * snap.mapW - snap.mapW / 2;
    return [x, z];
  };
  // Per-role dot colour — distinct hue per archetype so the player can
  // read the team comp at a glance from the minimap. Allies/enemies get
  // a coloured fill plus a team-coloured stroke so role AND team both
  // read.
  const ROLE_COLOR: Record<string, string> = {
    ranger: '#5fc7ff',
    mage: '#ff7a3d',
    fighter: '#e6a648',
    assassin: '#a470ff',
    tank: '#9aa6b8',
  };
  const TOWER_COLOR = '#dabd6e';
  const blueStroke = '#7be38e';
  const redStroke = '#ff5050';
  const dim = (alive: boolean) => (alive ? 1 : 0.28);
  return (
    <div
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const lx = e.clientX - rect.left;
        const ly = e.clientY - rect.top;
        // Ignore taps in the surrounding padding/border area.
        if (lx < padding || lx > padding + inner) return;
        if (ly < padding || ly > padding + inner) return;
        const [wx, wz] = minimapToWorld(lx, ly);
        getGame()?.peekAt(wx, wz);
      }}
      style={{
        position: 'absolute',
        top: 14,
        // Tucked further from the left edge — clears the system header
        // / status banners on portrait notch devices.
        left: 140,
        width: size,
        height: size,
        zIndex: 10,
        background: 'rgba(8, 12, 18, 0.78)',
        border: '1px solid rgba(255, 255, 255, 0.18)',
        borderRadius: 10,
        boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
        // Tap-to-peek wants pointer events; the canvas underneath is
        // protected by the size of the element being small.
        pointerEvents: 'auto',
        touchAction: 'none',
        overflow: 'hidden',
        cursor: 'pointer',
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Diagonal lane hint — single stroke from blue base to red base. */}
        {(() => {
          const [bx, bz] = norm(-snap.mapW / 2 * 0.4, snap.mapH / 2 * 0.4);
          const [rx, rz] = norm(snap.mapW / 2 * 0.4, -snap.mapH / 2 * 0.4);
          return (
            <line
              x1={bx}
              y1={bz}
              x2={rx}
              y2={rz}
              stroke="rgba(220, 200, 140, 0.18)"
              strokeWidth={2}
            />
          );
        })()}
        {/* Bases — bigger team-coloured squares with a dark outline. */}
        {snap.bases.map((b, i) => {
          const [x, y] = norm(b.x, b.z);
          const c = b.team === 'blue' ? blueStroke : redStroke;
          return (
            <rect
              key={`base-${i}`}
              x={x - 5}
              y={y - 5}
              width={10}
              height={10}
              fill={c}
              opacity={dim(b.alive)}
              stroke="rgba(0,0,0,0.6)"
              strokeWidth={1}
            />
          );
        })}
        {/* Towers — stylised turret silhouette in gold. Two-rect "watchtower"
            shape so they're visibly different from heroes/bases. The thin
            team-coloured stroke shows whose tower it is. */}
        {snap.towers.map((t, i) => {
          const [x, y] = norm(t.x, t.z);
          const stroke = t.team === 'blue' ? blueStroke : redStroke;
          return (
            <g key={`tower-${i}`} opacity={dim(t.alive)}>
              <rect
                x={x - 3}
                y={y - 1}
                width={6}
                height={6}
                fill={TOWER_COLOR}
                stroke={stroke}
                strokeWidth={0.8}
              />
              <rect
                x={x - 2}
                y={y - 5}
                width={4}
                height={4}
                fill={TOWER_COLOR}
                stroke={stroke}
                strokeWidth={0.8}
              />
            </g>
          );
        })}
        {/* Minions — tiny dots. */}
        {snap.minions.map((m, i) => {
          if (!m.alive) return null;
          const [x, y] = norm(m.x, m.z);
          const c = m.team === 'blue' ? blueStroke : redStroke;
          return <circle key={`minion-${i}`} cx={x} cy={y} r={1.6} fill={c} opacity={0.85} />;
        })}
        {/* Allies — fill is per-role, stroke is the team colour. */}
        {snap.allies.map((a, i) => {
          if (!a.alive) return null;
          const [x, y] = norm(a.x, a.z);
          return (
            <circle
              key={`ally-${i}`}
              cx={x}
              cy={y}
              r={3.2}
              fill={ROLE_COLOR[a.heroKind] ?? '#cfd6e0'}
              stroke={blueStroke}
              strokeWidth={1}
              opacity={dim(a.alive)}
            />
          );
        })}
        {/* Enemies — fill is per-role, stroke is the enemy team colour. */}
        {snap.enemies.map((e, i) => {
          if (!e.alive) return null;
          const [x, y] = norm(e.x, e.z);
          return (
            <circle
              key={`enemy-${i}`}
              cx={x}
              cy={y}
              r={3.2}
              fill={ROLE_COLOR[e.heroKind] ?? '#ffb0b0'}
              stroke={redStroke}
              strokeWidth={1}
              opacity={dim(e.alive)}
            />
          );
        })}
        {/* Player — drawn last so it sits on top. Bright yellow halo +
            the player's own role colour as the inner fill. */}
        {snap.player.alive && (() => {
          const [x, y] = norm(snap.player.x, snap.player.z);
          const fill = ROLE_COLOR[snap.player.heroKind] ?? '#ffe066';
          return (
            <g>
              <circle cx={x} cy={y} r={5.2} fill="none" stroke="#ffe066" strokeWidth={1.6} />
              <circle cx={x} cy={y} r={3.4} fill={fill} stroke="rgba(0,0,0,0.6)" strokeWidth={1} />
            </g>
          );
        })()}
      </svg>
    </div>
  );
});

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
  // Lower threshold (was 14) so the aim indicator appears almost the moment
  // the finger leaves the button — a tap-then-flick should immediately let
  // the player steer, not fight a deadzone first.
  const DRAG_AIM_THRESHOLD = 7;

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
          // Tiny deadzone (was 8) — direction is normalized inside updateAim,
          // so what mattered here was cutting off finger jitter. 3px is enough
          // to ignore the shake of a stationary thumb without making the user
          // shove the finger across the screen to retarget.
          if (Math.hypot(wx, wz) > 3) getGame()?.updateAim(id, wx, wz);
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
