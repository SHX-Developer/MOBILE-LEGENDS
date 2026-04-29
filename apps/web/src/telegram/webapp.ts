interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TgWebApp {
  initData: string;
  initDataUnsafe: { user?: TgUser };
  ready: () => void;
  expand: () => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export function initTelegramWebApp(): void {
  const wa = window.Telegram?.WebApp;
  if (!wa) return;
  wa.ready();
  wa.expand();
}

export function getTelegramInitData(): string | null {
  const wa = window.Telegram?.WebApp;
  if (!wa) return null;
  if (wa.initData) return wa.initData;
  // fallback for local dev: synthetic initData with the unsafe user
  const u = wa.initDataUnsafe?.user;
  if (!u) return null;
  return new URLSearchParams({ user: JSON.stringify(u) }).toString();
}

export function getTelegramUserId(): string | null {
  const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
  return u ? String(u.id) : null;
}
