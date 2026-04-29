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

export function getTelegramInitData(): string | null {
  const wa = window.Telegram?.WebApp;
  if (!wa) return null;
  if (wa.initData) return wa.initData;
  const u = wa.initDataUnsafe?.user;
  if (!u) return null;
  return new URLSearchParams({ user: JSON.stringify(u) }).toString();
}

export function getTelegramUserId(): string | null {
  const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
  return u ? String(u.id) : null;
}
