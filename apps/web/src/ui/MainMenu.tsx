import { useUserStore } from '../store/userStore.js';
import { Sounds } from '../game/Sounds.js';

interface MainMenuProps {
  onPlay: (mode: 'online' | 'offline') => void;
}

export function MainMenu({ onPlay }: MainMenuProps) {
  const user = useUserStore((s) => s.user);
  if (!user) return null;
  const start = (mode: 'online' | 'offline') => {
    // First user gesture — unlock the AudioContext so SFX can play.
    Sounds.unlock();
    onPlay(mode);
  };
  return (
    <div style={wrapStyle}>
      <div style={headerStyle}>
        <div style={labelStyle}>HERO</div>
        <div style={nicknameStyle}>{user.nickname ?? '—'}</div>
      </div>
      <div style={buttonsStyle}>
        <button style={onlineBtn} onClick={() => start('online')}>
          ОНЛАЙН
        </button>
        <button style={offlineBtn} onClick={() => start('offline')}>
          ОФЛАЙН
        </button>
      </div>
    </div>
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
