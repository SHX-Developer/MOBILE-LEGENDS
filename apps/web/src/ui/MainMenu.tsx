import { useEffect, useState } from 'react';
import { useUserStore } from '../store/userStore.js';
import { Sounds } from '../game/Sounds.js';
import type { HeroKind } from '../game/constants.js';
import {
  HERO_NAMES,
  accountXpToNext,
  heroXpToNext,
  rankTierFor,
  useProgressionStore,
} from '../store/progressionStore.js';

interface MainMenuProps {
  onPlay: (mode: 'online' | 'offline', heroKind: HeroKind) => void;
}

type MenuTab = 'play' | 'heroes' | 'settings' | 'profile';

/**
 * Cyber Legends — dark-purple liquid-glass menu inspired by the Nexarena
 * design brief. Same retention surface as the previous menu (account
 * level, rank, daily bonus, per-hero mastery), but rebodied in a
 * holographic / futuristic skin: violet → magenta gradients, frosted
 * glass panels with backdrop-blur, neon edge strokes, Space Grotesk
 * for headlines and Inter for body copy.
 */
export function MainMenu({ onPlay }: MainMenuProps) {
  const user = useUserStore((s) => s.user);
  const [picking, setPicking] = useState(false);
  const [tab, setTab] = useState<MenuTab>('play');
  if (!user) return null;
  const startOnline = () => {
    Sounds.unlock();
    onPlay('online', 'ranger');
  };
  const startOffline = (heroKind: HeroKind) => {
    Sounds.unlock();
    onPlay('offline', heroKind);
  };
  if (picking) {
    return <HeroPick onPick={startOffline} onBack={() => setPicking(false)} />;
  }
  return (
    <div style={shellStyle}>
      <BgGlow />
      <TopBar nickname={user.nickname ?? '—'} />
      <div style={contentStyle}>
        {tab === 'play' && <PlayTab startOnline={startOnline} startOffline={() => setPicking(true)} />}
        {tab === 'heroes' && <HeroBrowser />}
        {tab === 'settings' && <SettingsView />}
        {tab === 'profile' && <ProfileView nickname={user.nickname ?? '—'} />}
      </div>
      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Shell + ambient background
 * ----------------------------------------------------------------------- */

/** Slow-pulsing neon orbs behind the panels — pure CSS, no animation
 *  loops. Cheaper than a particle field and reads as the same kind of
 *  holographic ambience MOBA menus love. */
function BgGlow() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: '-12%',
          top: '-22%',
          width: '70%',
          height: '90%',
          background: 'radial-gradient(circle at center, rgba(157,108,255,0.35) 0%, transparent 60%)',
          filter: 'blur(40px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: '-15%',
          bottom: '-20%',
          width: '70%',
          height: '90%',
          background: 'radial-gradient(circle at center, rgba(255,77,210,0.28) 0%, transparent 60%)',
          filter: 'blur(40px)',
        }}
      />
      {/* Faint grid overlay — very subtle, gives the surface a cyber feel. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(157,108,255,0.06) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(157,108,255,0.06) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          maskImage:
            'radial-gradient(ellipse at center, rgba(0,0,0,0.6) 0%, transparent 75%)',
          WebkitMaskImage:
            'radial-gradient(ellipse at center, rgba(0,0,0,0.6) 0%, transparent 75%)',
        }}
      />
    </div>
  );
}

/** Top header bar — NEXARENA wordmark + account chip with nickname / level /
 *  rank tier. Reads from the progression store so the chip stays accurate
 *  match-to-match. */
function TopBar({ nickname }: { nickname: string }) {
  const accountLevel = useProgressionStore((s) => s.accountLevel);
  const mmr = useProgressionStore((s) => s.mmr);
  const tier = rankTierFor(mmr);
  return (
    <div style={topBarStyle}>
      <div style={{ display: 'grid', gap: 2 }}>
        <div style={brandStyle}>NEXARENA</div>
        <div style={{ fontSize: 10, letterSpacing: 4, color: 'rgba(245,234,254,0.5)', fontFamily: 'Inter, sans-serif' }}>
          CYBER LEGENDS · 5V5
        </div>
      </div>
      <div style={accountChipStyle}>
        <div style={accountAvatarStyle}>{(nickname[0] ?? 'P').toUpperCase()}</div>
        <div style={{ display: 'grid', gap: 2 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>{nickname}</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={chipPill('rgba(157,108,255,0.5)', '#ddd0ff')}>LV {accountLevel}</span>
            <span style={chipPill(tier.color, tier.color)}>{tier.name}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * PLAY tab
 * ----------------------------------------------------------------------- */

function PlayTab({ startOnline, startOffline }: { startOnline: () => void; startOffline: () => void }) {
  const lastDailyClaimDay = useProgressionStore((s) => s.lastDailyClaimDay);
  const todayKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  })();
  const dailyAvailable = lastDailyClaimDay !== todayKey;
  return (
    <div style={playLayoutStyle}>
      {/* Hero CTA — large play button. */}
      <button onClick={startOffline} style={megaCtaStyle}>
        <span style={megaCtaInnerStyle}>
          <span style={{ fontSize: 13, letterSpacing: 4, opacity: 0.85 }}>В БОЙ</span>
          <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: 2, fontFamily: 'Space Grotesk, sans-serif' }}>
            5V5 ARENA
          </span>
          <span style={{ fontSize: 11, letterSpacing: 2, opacity: 0.6, marginTop: 2 }}>
            ВЫБРАТЬ ГЕРОЯ → СТАРТ
          </span>
        </span>
        <CtaBlade />
      </button>
      {/* Secondary CTAs. */}
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={startOnline} style={secondaryCtaStyle}>
          <span style={{ fontSize: 11, letterSpacing: 3, color: 'rgba(72,231,255,0.85)' }}>ОНЛАЙН</span>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1.5 }}>1V1 RANKED</span>
        </button>
        <button onClick={startOffline} style={secondaryCtaStyle}>
          <span style={{ fontSize: 11, letterSpacing: 3, color: 'rgba(255,77,210,0.85)' }}>ОФЛАЙН</span>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1.5 }}>5V5 PRACTICE</span>
        </button>
      </div>
      {/* Daily reward strip. */}
      <div style={dailyStripStyle}>
        <div style={{ display: 'grid', gap: 2 }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: 'rgba(245,234,254,0.55)', fontWeight: 700 }}>
            ЕЖЕДНЕВНАЯ НАГРАДА
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.5 }}>
            {dailyAvailable
              ? '+200 XP · готова к получению на первом матче'
              : 'Получено сегодня. Возвращайся завтра.'}
          </div>
        </div>
        <div
          style={{
            ...statusDotStyle,
            background: dailyAvailable ? '#a4ff4d' : 'rgba(245,234,254,0.18)',
            boxShadow: dailyAvailable
              ? '0 0 12px rgba(164,255,77,0.7), 0 0 4px rgba(164,255,77,0.9)'
              : 'none',
          }}
        />
      </div>
    </div>
  );
}

/** Animated diagonal blade highlight on the mega CTA. Pure CSS keyframe
 *  injected once below; the mesh just sets a class. */
function CtaBlade() {
  return (
    <span
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 110,
        background: 'linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.18) 45%, transparent 90%)',
        pointerEvents: 'none',
      }}
    />
  );
}

/* -------------------------------------------------------------------------
 * HEROES tab
 * ----------------------------------------------------------------------- */

const ROLE_ACCENT: Record<HeroKind, string> = {
  ranger: '#48e7ff',
  mage: '#ff7a3d',
  fighter: '#e6a648',
  assassin: '#a470ff',
  tank: '#9aa6b8',
};

const HERO_BLURBS: Record<HeroKind, { name: string; tag: string; desc: string; stats: string[] }> = {
  ranger: {
    name: 'АРКШУТЕР',
    tag: 'Marksman · Sustained DPS',
    desc: 'Rapid Fire, Piercing Arrow, Focus Mode (+40% AS).',
    stats: ['HP 2200', 'DMG 180', 'PHYS'],
  },
  mage: {
    name: 'АРКАНИСТ',
    tag: 'Mage · Burst AoE',
    desc: 'Arcane Burst, Magic Trap, Meteor Call (450).',
    stats: ['HP 2000', 'DMG 220', 'MAG'],
  },
  fighter: {
    name: 'ВАРЛОРД',
    tag: 'Fighter · Гибрид',
    desc: 'Power Strike, Rage Mode, Spin Attack (AoE).',
    stats: ['HP 3000', 'DMG 170', 'MIX'],
  },
  assassin: {
    name: 'ТЕНЕКЛИНОК',
    tag: 'Assassin · Burst + Reset',
    desc: 'Shadow Dash, Backstab, Invisibility 3s.',
    stats: ['HP 1800', 'DMG 260', 'PHYS'],
  },
  tank: {
    name: 'СТРАЖ',
    tag: 'Tank · Контроль',
    desc: 'Shield Slam, Iron Wall (+600), Taunt (агр).',
    stats: ['HP 4200', 'DMG 120', 'PHYS'],
  },
};

function HeroBrowser() {
  return (
    <div style={heroGridStyle}>
      {(['ranger', 'mage', 'fighter', 'assassin', 'tank'] as HeroKind[]).map((k) => (
        <HeroCard key={k} kind={k} accent={ROLE_ACCENT[k]} onClick={() => undefined} />
      ))}
    </div>
  );
}

function HeroCard({
  kind,
  accent,
  onClick,
}: {
  kind: HeroKind;
  accent: string;
  onClick: () => void;
}) {
  const blurb = HERO_BLURBS[kind];
  return (
    <button onClick={onClick} style={heroCardStyle(accent)}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span
          style={{
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 2,
            fontFamily: 'Space Grotesk, sans-serif',
            color: accent,
          }}
        >
          {blurb.name}
        </span>
        <RoleHexIcon color={accent} />
      </div>
      <div style={{ fontSize: 11, letterSpacing: 2, color: 'rgba(245,234,254,0.55)', fontWeight: 600 }}>
        {blurb.tag}
      </div>
      <div style={{ fontSize: 12, color: 'rgba(245,234,254,0.85)', lineHeight: 1.45, marginTop: 6 }}>
        {blurb.desc}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 8 }}>
        {blurb.stats.map((s) => (
          <span key={s} style={statTagStyle}>
            {s}
          </span>
        ))}
      </div>
    </button>
  );
}

function RoleHexIcon({ color }: { color: string }) {
  return (
    <svg width={22} height={24} viewBox="0 0 22 24" fill="none">
      <polygon
        points="11,1 20,6 20,18 11,23 2,18 2,6"
        stroke={color}
        strokeWidth="1.4"
        fill="rgba(157,108,255,0.08)"
      />
      <polygon
        points="11,5 17,8 17,16 11,19 5,16 5,8"
        fill={color}
        opacity="0.55"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------
 * SETTINGS tab
 * ----------------------------------------------------------------------- */

function SettingsView() {
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem('ml_muted') === '1';
    setMuted(saved);
    Sounds.setMuted(saved);
  }, []);
  const toggle = () => {
    const next = !muted;
    setMuted(next);
    Sounds.setMuted(next);
    try {
      localStorage.setItem('ml_muted', next ? '1' : '0');
    } catch {
      /* private mode — best-effort */
    }
  };
  return (
    <div style={settingsLayoutStyle}>
      <div style={glassPanelStyle}>
        <div style={panelLabelStyle}>НАСТРОЙКИ</div>
        <div style={settingRowStyle}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1.5 }}>ЗВУК</div>
            <div style={{ fontSize: 11, color: 'rgba(245,234,254,0.55)', marginTop: 2 }}>
              Глушит автоатаку, скиллы и попадания
            </div>
          </div>
          <button onClick={toggle} style={cyberToggleStyle(!muted)}>
            <span style={cyberToggleHandle(!muted)} />
            <span
              style={{
                position: 'absolute',
                fontSize: 10,
                letterSpacing: 1.5,
                fontWeight: 700,
                top: '50%',
                transform: 'translateY(-50%)',
                left: muted ? 12 : 'auto',
                right: muted ? 'auto' : 12,
                color: muted ? '#ff7a8a' : '#a4ff4d',
              }}
            >
              {muted ? 'OFF' : 'ON'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * PROFILE tab
 * ----------------------------------------------------------------------- */

function ProfileView({ nickname }: { nickname: string }) {
  const accountLevel = useProgressionStore((s) => s.accountLevel);
  const accountXp = useProgressionStore((s) => s.accountXp);
  const mmr = useProgressionStore((s) => s.mmr);
  const matchesPlayed = useProgressionStore((s) => s.matchesPlayed);
  const wins = useProgressionStore((s) => s.wins);
  const losses = useProgressionStore((s) => s.losses);
  const heroes = useProgressionStore((s) => s.heroes);
  const tier = rankTierFor(mmr);
  const winRate = matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 100) : 0;
  const heroEntries = (Object.entries(heroes) as Array<[HeroKind, typeof heroes[HeroKind]]>)
    .sort((a, b) => b[1].level - a[1].level || b[1].xp - a[1].xp);
  const acctNext = accountXpToNext(accountLevel);
  return (
    <div style={profileLayoutStyle}>
      {/* Identity card. */}
      <div style={glassPanelStyle}>
        <div style={profileIdentityStyle}>
          <div
            style={{
              ...accountAvatarStyle,
              width: 56,
              height: 56,
              fontSize: 22,
              border: `1px solid ${tier.color}`,
              boxShadow: `0 0 18px ${tier.color}55`,
            }}
          >
            {(nickname[0] ?? 'P').toUpperCase()}
          </div>
          <div style={{ display: 'grid', gap: 4, flex: 1 }}>
            <div style={panelLabelStyle}>НИКНЕЙМ</div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1.5, fontFamily: 'Space Grotesk, sans-serif' }}>
              {nickname}
            </div>
          </div>
          <div style={tierBadgeStyle(tier.color)}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: 'rgba(7,3,15,0.7)', fontWeight: 800 }}>
              РАНГ
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 2, color: '#0d0420' }}>
              {tier.name}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(7,3,15,0.7)', fontWeight: 700 }}>
              {mmr} MMR
            </div>
          </div>
        </div>
        {/* Account level bar. */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
            <span style={{ color: 'rgba(245,234,254,0.55)', letterSpacing: 1.5, fontWeight: 700 }}>
              УРОВЕНЬ АККАУНТА · LV {accountLevel}
            </span>
            <span style={{ color: 'rgba(245,234,254,0.85)', fontWeight: 600 }}>
              {accountXp} / {acctNext} XP
            </span>
          </div>
          <NeonBar value={accountXp} max={acctNext} from="#9d6cff" to="#48e7ff" />
        </div>
      </div>
      {/* Stat tiles. */}
      <div style={{ display: 'flex', gap: 8 }}>
        <StatTile label="МАТЧИ" value={String(matchesPlayed)} accent="#9d6cff" />
        <StatTile label="ПОБЕДЫ" value={String(wins)} accent="#a4ff4d" />
        <StatTile label="ПОРАЖЕНИЯ" value={String(losses)} accent="#ff7a8a" />
        <StatTile label="WIN RATE" value={`${winRate}%`} accent="#48e7ff" />
      </div>
      {/* Hero mastery. */}
      <div style={glassPanelStyle}>
        <div style={panelLabelStyle}>МАСТЕРСТВО ГЕРОЕВ</div>
        <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
          {heroEntries.map(([kind, stats]) => {
            const next = heroXpToNext(stats.level);
            return (
              <div key={kind} style={masteryRowStyle}>
                <span style={{ ...masteryHexStyle, background: ROLE_ACCENT[kind] }} />
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, minWidth: 100 }}>
                  {HERO_NAMES[kind]}
                </div>
                <div style={{ flex: 1 }}>
                  <NeonBar value={stats.xp} max={next} from={ROLE_ACCENT[kind]} to="#ff4dd2" />
                </div>
                <div style={{ fontSize: 11, color: 'rgba(245,234,254,0.6)', minWidth: 78, textAlign: 'right', fontWeight: 700 }}>
                  LV {stats.level} · {stats.matches}м
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      style={{
        flex: 1,
        background:
          'linear-gradient(135deg, rgba(157,108,255,0.12) 0%, rgba(80,50,150,0.04) 100%)',
        border: `1px solid ${accent}33`,
        borderRadius: 10,
        padding: '10px 8px',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(180deg, ${accent}26 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'relative',
          fontSize: 9,
          color: 'rgba(245,234,254,0.55)',
          letterSpacing: 2,
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div
        style={{
          position: 'relative',
          fontSize: 20,
          fontWeight: 800,
          color: accent,
          marginTop: 2,
          fontFamily: 'Space Grotesk, sans-serif',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function NeonBar({
  value,
  max,
  from,
  to,
}: {
  value: number;
  max: number;
  from: string;
  to: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div
      style={{
        height: 6,
        borderRadius: 99,
        background: 'rgba(157,108,255,0.12)',
        border: '1px solid rgba(157,108,255,0.22)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          background: `linear-gradient(90deg, ${from}, ${to})`,
          boxShadow: `0 0 10px ${to}99`,
          transition: 'width 600ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Hero pick (full-screen)
 * ----------------------------------------------------------------------- */

function HeroPick({ onPick, onBack }: { onPick: (k: HeroKind) => void; onBack: () => void }) {
  return (
    <div style={shellStyle}>
      <BgGlow />
      <div style={pickHeaderStyle}>
        <button onClick={onBack} style={navBtnStyle}>← НАЗАД</button>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 4, fontFamily: 'Space Grotesk, sans-serif' }}>
          ВЫБОР ГЕРОЯ
        </div>
        <div style={{ width: 80 }} />
      </div>
      <div style={pickGridStyle}>
        {(['ranger', 'mage', 'fighter', 'assassin', 'tank'] as HeroKind[]).map((k) => (
          <HeroCard key={k} kind={k} accent={ROLE_ACCENT[k]} onClick={() => onPick(k)} />
        ))}
      </div>
      <div style={{ ...pickHintStyle }}>
        2 v 2 — союзник и соперники подберутся автоматически
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Bottom nav
 * ----------------------------------------------------------------------- */

function BottomNav({ active, onChange }: { active: MenuTab; onChange: (t: MenuTab) => void }) {
  const items: Array<{ id: MenuTab; label: string }> = [
    { id: 'play', label: 'PLAY' },
    { id: 'heroes', label: 'ГЕРОИ' },
    { id: 'settings', label: 'НАСТРОЙКИ' },
    { id: 'profile', label: 'ПРОФИЛЬ' },
  ];
  return (
    <div style={navStyle}>
      {items.map((it) => {
        const on = it.id === active;
        return (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
            style={{
              ...navTabStyle,
              color: on ? '#f5eafe' : 'rgba(245,234,254,0.5)',
              background: on
                ? 'linear-gradient(180deg, rgba(157,108,255,0.32) 0%, rgba(157,108,255,0.05) 100%)'
                : 'transparent',
              boxShadow: on ? 'inset 0 -2px 0 #9d6cff, 0 0 16px rgba(157,108,255,0.35)' : 'none',
            }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Styles
 * ----------------------------------------------------------------------- */

const shellStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  gridTemplateRows: 'auto 1fr auto',
  background:
    'radial-gradient(120% 80% at 50% 0%, #2a1352 0%, #0d0420 55%, #07030f 100%)',
  color: '#f5eafe',
  overflow: 'hidden',
  fontFamily: 'Inter, system-ui, sans-serif',
};

const topBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 22px 10px',
  borderBottom: '1px solid rgba(157,108,255,0.18)',
  background:
    'linear-gradient(180deg, rgba(157,108,255,0.12) 0%, rgba(157,108,255,0.0) 100%)',
  position: 'relative',
  zIndex: 2,
};

const brandStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  letterSpacing: 6,
  fontFamily: 'Space Grotesk, sans-serif',
  background: 'linear-gradient(90deg, #9d6cff 0%, #ff4dd2 50%, #48e7ff 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
  color: 'transparent',
};

const accountChipStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 14px 8px 8px',
  background:
    'linear-gradient(135deg, rgba(157,108,255,0.16) 0%, rgba(80,50,150,0.04) 100%)',
  border: '1px solid rgba(157,108,255,0.32)',
  borderRadius: 999,
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
};

const accountAvatarStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 999,
  display: 'grid',
  placeItems: 'center',
  background: 'linear-gradient(135deg, #9d6cff 0%, #ff4dd2 100%)',
  fontWeight: 800,
  fontFamily: 'Space Grotesk, sans-serif',
  fontSize: 16,
  color: '#0d0420',
  boxShadow: '0 0 14px rgba(157,108,255,0.45)',
};

const chipPill = (border: string, color: string): React.CSSProperties => ({
  fontSize: 9,
  letterSpacing: 1.5,
  fontWeight: 700,
  padding: '2px 7px',
  border: `1px solid ${border}`,
  borderRadius: 999,
  color,
  whiteSpace: 'nowrap',
});

const contentStyle: React.CSSProperties = {
  position: 'relative',
  display: 'grid',
  placeItems: 'center',
  padding: '20px 18px',
  zIndex: 1,
  overflow: 'auto',
};

const playLayoutStyle: React.CSSProperties = {
  display: 'grid',
  gap: 14,
  width: 'min(540px, 92vw)',
  justifyItems: 'stretch',
};

const megaCtaStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  padding: '22px 24px',
  background:
    'linear-gradient(135deg, #9d6cff 0%, #ff4dd2 50%, #ff8a3a 100%)',
  border: 'none',
  borderRadius: 16,
  color: '#0d0420',
  cursor: 'pointer',
  boxShadow:
    '0 16px 40px rgba(157,108,255,0.45), inset 0 0 0 1px rgba(255,255,255,0.18)',
  overflow: 'hidden',
};

const megaCtaInnerStyle: React.CSSProperties = {
  display: 'grid',
  gap: 4,
  textAlign: 'left',
  position: 'relative',
};

const secondaryCtaStyle: React.CSSProperties = {
  flex: 1,
  display: 'grid',
  gap: 4,
  padding: '14px 18px',
  background:
    'linear-gradient(135deg, rgba(157,108,255,0.18) 0%, rgba(80,50,150,0.06) 100%)',
  border: '1px solid rgba(157,108,255,0.34)',
  borderRadius: 14,
  color: '#f5eafe',
  cursor: 'pointer',
  textAlign: 'left',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
};

const dailyStripStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 18px',
  background:
    'linear-gradient(135deg, rgba(72,231,255,0.12) 0%, rgba(157,108,255,0.06) 100%)',
  border: '1px solid rgba(72,231,255,0.28)',
  borderRadius: 14,
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
};

const statusDotStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: 999,
};

const heroGridStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  overflowX: 'auto',
  padding: '4px 16px 12px',
  width: '100%',
  scrollSnapType: 'x mandatory',
};

const heroCardStyle = (accent: string): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  flex: '0 0 auto',
  width: 220,
  padding: '14px 16px',
  background:
    'linear-gradient(160deg, rgba(157,108,255,0.16) 0%, rgba(20,8,40,0.6) 100%)',
  border: `1px solid ${accent}55`,
  borderRadius: 16,
  color: '#f5eafe',
  textAlign: 'left',
  cursor: 'pointer',
  boxShadow: `0 8px 28px ${accent}22, inset 0 0 0 1px rgba(255,255,255,0.04)`,
  scrollSnapAlign: 'start',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
});

const statTagStyle: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: 1.5,
  fontWeight: 700,
  padding: '3px 7px',
  borderRadius: 99,
  background: 'rgba(157,108,255,0.15)',
  border: '1px solid rgba(157,108,255,0.25)',
  color: '#ddd0ff',
};

const settingsLayoutStyle: React.CSSProperties = {
  width: 'min(440px, 92vw)',
  display: 'grid',
  gap: 12,
};

const glassPanelStyle: React.CSSProperties = {
  padding: '16px 18px',
  background:
    'linear-gradient(135deg, rgba(157,108,255,0.14) 0%, rgba(20,8,40,0.55) 100%)',
  border: '1px solid rgba(157,108,255,0.28)',
  borderRadius: 16,
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  boxShadow: '0 12px 36px rgba(15,5,40,0.4)',
};

const panelLabelStyle: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: 4,
  color: 'rgba(245,234,254,0.55)',
  fontWeight: 700,
};

const settingRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: 10,
  gap: 16,
};

const cyberToggleStyle = (on: boolean): React.CSSProperties => ({
  position: 'relative',
  width: 88,
  height: 36,
  borderRadius: 999,
  border: `1px solid ${on ? 'rgba(164,255,77,0.6)' : 'rgba(255,122,138,0.45)'}`,
  background: on
    ? 'linear-gradient(135deg, rgba(164,255,77,0.18) 0%, rgba(72,231,255,0.08) 100%)'
    : 'linear-gradient(135deg, rgba(255,122,138,0.18) 0%, rgba(120,0,40,0.08) 100%)',
  cursor: 'pointer',
  padding: 0,
});

const cyberToggleHandle = (on: boolean): React.CSSProperties => ({
  position: 'absolute',
  top: 3,
  left: on ? 3 : 53,
  width: 30,
  height: 28,
  borderRadius: 999,
  background: on
    ? 'linear-gradient(135deg, #a4ff4d 0%, #48e7ff 100%)'
    : 'linear-gradient(135deg, #ff7a8a 0%, #ff4dd2 100%)',
  boxShadow: '0 0 14px rgba(157,108,255,0.4)',
  transition: 'left 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
});

const profileLayoutStyle: React.CSSProperties = {
  width: 'min(560px, 92vw)',
  display: 'grid',
  gap: 12,
};

const profileIdentityStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
};

const tierBadgeStyle = (color: string): React.CSSProperties => ({
  display: 'grid',
  gap: 2,
  padding: '8px 14px',
  background: `linear-gradient(135deg, ${color} 0%, #fff 80%)`,
  border: `1px solid ${color}`,
  borderRadius: 12,
  textAlign: 'right',
  boxShadow: `0 0 18px ${color}55`,
});

const masteryRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 8px',
  background: 'rgba(157,108,255,0.06)',
  border: '1px solid rgba(157,108,255,0.18)',
  borderRadius: 10,
};

const masteryHexStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 2,
  transform: 'rotate(45deg)',
  boxShadow: '0 0 10px rgba(255,255,255,0.18)',
};

const pickHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 22px',
  borderBottom: '1px solid rgba(157,108,255,0.18)',
  position: 'relative',
  zIndex: 2,
};

const pickGridStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  gap: 12,
  alignItems: 'stretch',
  overflowX: 'auto',
  overflowY: 'hidden',
  padding: '20px 18px',
  width: '100%',
  scrollSnapType: 'x mandatory',
  zIndex: 1,
};

const pickHintStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: 2,
  color: 'rgba(245,234,254,0.55)',
  textAlign: 'center',
  padding: '0 0 18px',
  position: 'relative',
  zIndex: 1,
};

const navStyle: React.CSSProperties = {
  display: 'flex',
  gap: 0,
  padding: '0 14px 12px',
  borderTop: '1px solid rgba(157,108,255,0.18)',
  background:
    'linear-gradient(0deg, rgba(157,108,255,0.10) 0%, rgba(157,108,255,0) 100%)',
  position: 'relative',
  zIndex: 2,
};

const navTabStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 3,
  padding: '14px 0 12px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'Inter, system-ui, sans-serif',
  borderRadius: '0 0 8px 8px',
  transition: 'background 220ms ease, color 220ms ease',
};

const navBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  fontSize: 11,
  letterSpacing: 2,
  fontWeight: 700,
  background: 'rgba(157,108,255,0.12)',
  border: '1px solid rgba(157,108,255,0.32)',
  borderRadius: 999,
  color: '#f5eafe',
  cursor: 'pointer',
  fontFamily: 'Inter, system-ui, sans-serif',
};
