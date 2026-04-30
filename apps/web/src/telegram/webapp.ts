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
  disableVerticalSwipes?: () => void;
  enableClosingConfirmation?: () => void;
  requestFullscreen?: () => void;
  lockOrientation?: () => void;
  isExpanded?: boolean;
  isFullscreen?: boolean;
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
  // Bot API 7.7+: kill the swipe-to-close gesture
  wa.disableVerticalSwipes?.();
  // Bot API 8.0+: full-bleed display
  try { wa.requestFullscreen?.(); } catch { /* unsupported platform */ }
  // Bot API 8.0+: keep the current orientation locked (where supported)
  try { wa.lockOrientation?.(); } catch { /* unsupported platform */ }
}

/** Best-effort browser-level lock to landscape. Falls through silently
 *  on iOS / WebViews that don't expose the API. */
export async function lockLandscape(): Promise<void> {
  try {
    const orient = (screen as unknown as { orientation?: { lock?: (o: string) => Promise<void> } }).orientation;
    if (orient?.lock) {
      await orient.lock('landscape');
    }
  } catch {
    // ignore — overlay will prompt the user to rotate manually
  }
}

export function getTelegramInitData(): string {
  const wa = window.Telegram?.WebApp;
  if (wa?.initData) return wa.initData;
  const u = wa?.initDataUnsafe?.user;
  if (u) return new URLSearchParams({ user: JSON.stringify(u) }).toString();
  return new URLSearchParams({ user: JSON.stringify(getOrCreateGuestUser()) }).toString();
}

export function getTelegramUserId(): string | null {
  const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
  return u ? String(u.id) : null;
}

const GUEST_KEY = 'ml.guest.user';

function getOrCreateGuestUser(): TgUser {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    if (raw) return JSON.parse(raw) as TgUser;
  } catch {
    /* localStorage unavailable */
  }
  const guest: TgUser = {
    id: Math.floor(1_000_000 + Math.random() * 9_000_000_000),
    first_name: 'Guest',
  };
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(guest));
  } catch {
    /* ignore */
  }
  return guest;
}
