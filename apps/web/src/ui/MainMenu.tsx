import { useState } from 'react';
import { useUserStore } from '../store/userStore.js';
import { Sounds } from '../game/Sounds.js';
import type { HeroKind } from '../game/constants.js';

interface MainMenuProps {
  onPlay: (mode: 'online' | 'offline', heroKind: HeroKind) => void;
}

export function MainMenu({ onPlay }: MainMenuProps) {
  const user = useUserStore((s) => s.user);
  const [picking, setPicking] = useState(false);
  if (!user) return null;
  const startOnline = () => {
    // First user gesture — unlock the AudioContext so SFX can play.
    Sounds.unlock();
    // Online server only knows the ranger today; offline lets the player pick.
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
    <div style={wrapStyle}>
      <div style={headerStyle}>
        <div style={labelStyle}>HERO</div>
        <div style={nicknameStyle}>{user.nickname ?? '—'}</div>
      </div>
      <div style={buttonsStyle}>
        <button style={onlineBtn} onClick={startOnline}>
          ОНЛАЙН
        </button>
        <button style={offlineBtn} onClick={() => setPicking(true)}>
          ОФЛАЙН
        </button>
      </div>
    </div>
  );
}

function HeroPick({ onPick, onBack }: { onPick: (k: HeroKind) => void; onBack: () => void }) {
  return (
    <div style={wrapStyle}>
      <div style={{ ...labelStyle, alignSelf: 'end' }}>ВЫБЕРИ ГЕРОЯ</div>
      <div style={pickGridStyle}>
        <HeroCard
          accent="#5fc7ff"
          name="АРКШУТЕР"
          subtitle="Marksman — sustained DPS"
          desc="Rapid Fire (3-shot burst), Piercing Arrow (пробивает строй), Focus Mode (+40% AS на 4с)."
          stats={['HP 2200', 'Урон 180', 'Тип: физ']}
          onClick={() => onPick('ranger')}
        />
        <HeroCard
          accent="#ff7a3d"
          name="АРКАНИСТ"
          subtitle="Mage — burst + AoE"
          desc="Arcane Burst (300 AoE), Magic Trap (slow 40%), Meteor Call (450 + стан 1.5с)."
          stats={['HP 2000', 'Урон 220', 'Тип: маг']}
          onClick={() => onPick('mage')}
        />
        <HeroCard
          accent="#e6a648"
          name="ВАРЛОРД"
          subtitle="Fighter — гибрид"
          desc="Power Strike (220), Rage Mode (+30% урона 5с), Spin Attack (180 AoE)."
          stats={['HP 3000', 'Урон 170', 'Тип: смеш']}
          onClick={() => onPick('fighter')}
        />
        <HeroCard
          accent="#a470ff"
          name="ТЕНЕКЛИНОК"
          subtitle="Assassin — burst + reset"
          desc="Shadow Dash (телепорт + AoE), Backstab (350), Invisibility (3с — пропадает с миникарты)."
          stats={['HP 1800', 'Урон 260', 'Тип: физ']}
          onClick={() => onPick('assassin')}
        />
        <HeroCard
          accent="#9aa6b8"
          name="СТРАЖ"
          subtitle="Tank — frontline + контроль"
          desc="Shield Slam (стан 1с), Iron Wall (щит 600 HP), Taunt — стан-аура 2с."
          stats={['HP 4200', 'Урон 120', 'Тип: физ']}
          onClick={() => onPick('tank')}
        />
      </div>
      <div style={{ ...buttonsStyle, alignSelf: 'start' }}>
        <button style={offlineBtn} onClick={onBack}>
          НАЗАД
        </button>
        <div style={teamHintStyle}>2 vs 2 — союзник и соперники подберутся автоматически</div>
      </div>
    </div>
  );
}

function HeroCard({
  accent,
  name,
  subtitle,
  desc,
  stats,
  onClick,
}: {
  accent: string;
  name: string;
  subtitle: string;
  desc: string;
  stats: string[];
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: `radial-gradient(circle at 30% 25%, ${accent}33 0%, #131826 70%)`,
        border: `2px solid ${accent}`,
        borderRadius: 16,
        padding: '14px 16px',
        color: '#fff',
        textAlign: 'left',
        cursor: 'pointer',
        boxShadow: `0 8px 22px rgba(0,0,0,0.45), 0 0 0 3px ${accent}22`,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        // Keep cards compact so all five fit in a single scrollable row.
        flex: '0 0 auto',
        width: 200,
        scrollSnapAlign: 'start',
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 2.5, color: accent }}>{name}</div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: '#a8b8d4' }}>
        {subtitle}
      </div>
      <div style={{ fontSize: 12, color: '#cbd5ec', lineHeight: 1.35 }}>{desc}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
        {stats.map((s) => (
          <span
            key={s}
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 0.4,
              padding: '3px 7px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.08)',
              color: '#e7eef9',
            }}
          >
            {s}
          </span>
        ))}
      </div>
    </button>
  );
}

const wrapStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  gridTemplateRows: '1fr auto 1fr',
  placeItems: 'center',
  padding: 32,
  background:
    'radial-gradient(ellipse at center, #1c2238 0%, #0a0d18 70%, #050709 100%)',
  color: '#fff',
};

const headerStyle: React.CSSProperties = {
  alignSelf: 'end',
  display: 'grid',
  placeItems: 'center',
  gap: 6,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: 4,
  color: '#7a8aab',
  fontWeight: 800,
};

const nicknameStyle: React.CSSProperties = {
  fontSize: 32,
  fontWeight: 900,
  letterSpacing: 2,
  textShadow: '0 4px 18px rgba(0,0,0,0.6)',
};

const buttonsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 18,
};

const baseBtn: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 900,
  letterSpacing: 4,
  padding: '16px 48px',
  borderRadius: 999,
  border: '2px solid',
  cursor: 'pointer',
  boxShadow: '0 8px 24px rgba(0,0,0,0.55)',
};

const onlineBtn: React.CSSProperties = {
  ...baseBtn,
  borderColor: '#ffce5c',
  background:
    'radial-gradient(circle at 35% 30%, #ffce5c 0%, #e48a1a 60%, #a14b00 100%)',
  color: '#1a1208',
};

const offlineBtn: React.CSSProperties = {
  ...baseBtn,
  borderColor: 'rgba(255,255,255,0.4)',
  background:
    'radial-gradient(circle at 35% 30%, #4a5d80 0%, #1f2a44 60%, #0e1424 100%)',
  color: '#fff',
};

const pickGridStyle: React.CSSProperties = {
  // Five hero cards laid out as a single scrollable row. Earlier this
  // was a wrapping flex grid which clipped the 5th card off-screen on
  // narrow / rotated viewports. Horizontal scrolling keeps every hero
  // reachable on every device.
  display: 'flex',
  gap: 14,
  alignItems: 'stretch',
  overflowX: 'auto',
  overflowY: 'hidden',
  paddingBottom: 12,
  paddingLeft: 16,
  paddingRight: 16,
  width: '100%',
  maxWidth: '100%',
  // The parent uses display:grid with placeItems:center; tell this row
  // to stretch horizontally so the scroll surface spans the viewport.
  justifySelf: 'stretch',
  scrollSnapType: 'x mandatory',
  WebkitOverflowScrolling: 'touch',
};

const teamHintStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: 1.5,
  color: '#7a8aab',
  fontWeight: 700,
  alignSelf: 'center',
  maxWidth: 260,
  textAlign: 'center',
};
