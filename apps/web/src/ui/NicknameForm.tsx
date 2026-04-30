import { useState } from 'react';
import { useUserStore } from '../store/userStore.js';
import { createNickname } from '../api/client.js';

export function NicknameForm() {
  const { user, setUser } = useUserStore();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!user) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim().length < 3) {
      setError('Минимум 3 символа');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const updated = await createNickname({
        telegramId: user.telegramId,
        nickname: value.trim(),
      });
      setUser(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      style={{
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
      }}
    >
      <div style={{ display: 'grid', gap: 12, width: '100%', maxWidth: 320 }}>
        <h2 style={{ margin: 0 }}>Придумайте никнейм</h2>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Имя героя"
          style={inputStyle}
        />
        {error && <div style={{ color: '#ff6b6b' }}>{error}</div>}
        <button type="submit" disabled={submitting} style={buttonStyle}>
          {submitting ? 'Сохраняем…' : 'Продолжить'}
        </button>
      </div>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: 16,
  borderRadius: 8,
  border: '1px solid #2c3e50',
  background: '#11141a',
  color: '#fff',
};

const buttonStyle: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: 16,
  borderRadius: 8,
  border: 'none',
  background: '#4a90e2',
  color: '#fff',
  cursor: 'pointer',
};
