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
          name="СТРЕЛОК"
          subtitle="Layla — лучник"
          desc="Дальние выстрелы, мощный Q (POWER), замедление E, оглушение C."
          stats={['HP 500', 'Урон 50', 'Дистанция 10']}
          onClick={() => onPick('ranger')}
        />
        <HeroCard
          accent="#ff7a3d"
          name="МАГ"
          subtitle="Огненная школа"
          desc="Q фаербол, E огненная стена со замедлением, C метеор по области (AoE)."
          stats={['HP 460', 'Урон 38', 'Дистанция 8.5']}
          onClick={() => onPick('mage')}
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
        borderRadius: 18,
        padding: '20px 22px',
        color: '#fff',
        textAlign: 'left',
        cursor: 'pointer',
        boxShadow: `0 10px 28px rgba(0,0,0,0.45), 0 0 0 4px ${accent}22`,
        display: 'grid',
        gap: 10,
        minWidth: 240,
        maxWidth: 280,
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 3, color: accent }}>{name}</div>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: '#a8b8d4' }}>
        {subtitle}
      </div>
      <div style={{ fontSize: 13, color: '#cbd5ec', lineHeight: 1.4 }}>{desc}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        {stats.map((s) => (
          <span
            key={s}
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 0.5,
              padding: '4px 8px',
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
  display: 'flex',
  gap: 18,
  flexWrap: 'wrap',
  justifyContent: 'center',
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
