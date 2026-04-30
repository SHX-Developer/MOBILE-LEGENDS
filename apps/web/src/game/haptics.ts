/**
 * Tiny haptic-feedback wrapper. Prefers Telegram WebApp's native HapticFeedback
 * (works on iOS where navigator.vibrate is blocked); falls back to the standard
 * Vibration API on Android browsers.
 */
type ImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';

interface TgHaptic {
  impactOccurred?: (style: ImpactStyle) => void;
  notificationOccurred?: (kind: 'error' | 'success' | 'warning') => void;
}

function getTgHaptics(): TgHaptic | null {
  const w = window as unknown as {
    Telegram?: { WebApp?: { HapticFeedback?: TgHaptic } };
  };
  return w.Telegram?.WebApp?.HapticFeedback ?? null;
}

function buzz(style: ImpactStyle, fallbackMs: number): void {
  const tg = getTgHaptics();
  if (tg?.impactOccurred) {
    try {
      tg.impactOccurred(style);
      return;
    } catch {
      /* fall through */
    }
  }
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try { navigator.vibrate(fallbackMs); } catch { /* ignore */ }
  }
}

export const Haptics = {
  /** Light tick when one of your shots connects. */
  hitEnemy(): void {
    buzz('light', 12);
  },
  /** Stronger thump when something hits the player. */
  takeDamage(): void {
    buzz('medium', 30);
  },
};
