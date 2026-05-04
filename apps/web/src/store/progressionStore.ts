import { create } from 'zustand';
import type { HeroKind } from '../game/constants.js';

/** Per-hero mastery + lifetime stats. */
export interface HeroStats {
  level: number;
  xp: number;
  matches: number;
  wins: number;
  losses: number;
  kills: number;
}

/** Snapshot of what the player just earned, displayed by the match-end
 *  overlay. Pre-state fields drive the "old XP → new XP" bar animation. */
export interface MatchReward {
  baseXp: number;
  winBonus: number;
  dailyBonus: number;
  totalXp: number;
  mmrDelta: number;
  victory: boolean;
  hero: HeroKind;
  preAccountLevel: number;
  preAccountXp: number;
  preAccountXpToLevel: number;
  preHeroLevel: number;
  preHeroXp: number;
  preHeroXpToLevel: number;
}

interface MatchResultParams {
  hero: HeroKind;
  victory: boolean;
  durationMs: number;
  kills: number;
}

interface ProgressionState {
  accountLevel: number;
  accountXp: number;
  mmr: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  heroes: Record<HeroKind, HeroStats>;
  /** YYYY-M-D string of the last day the daily bonus was claimed. */
  lastDailyClaimDay: string;
  /** Set on match end, cleared once the overlay is dismissed. Never
   *  persisted to localStorage so reloading mid-overlay doesn't re-show
   *  yesterday's reward. */
  lastMatchReward: MatchReward | null;

  awardMatchResult: (p: MatchResultParams) => void;
  clearLastMatchReward: () => void;
}

const HERO_KINDS: readonly HeroKind[] = ['ranger', 'mage', 'fighter', 'assassin', 'tank'];
const STORAGE_KEY = 'ml_progression_v1';

function emptyHeroStats(): HeroStats {
  return { level: 1, xp: 0, matches: 0, wins: 0, losses: 0, kills: 0 };
}

function defaultHeroes(): Record<HeroKind, HeroStats> {
  const out = {} as Record<HeroKind, HeroStats>;
  for (const k of HERO_KINDS) out[k] = emptyHeroStats();
  return out;
}

type Persistable = Omit<ProgressionState, 'awardMatchResult' | 'clearLastMatchReward'>;

const initial: Persistable = {
  accountLevel: 1,
  accountXp: 0,
  mmr: 1000,
  matchesPlayed: 0,
  wins: 0,
  losses: 0,
  heroes: defaultHeroes(),
  lastDailyClaimDay: '',
  lastMatchReward: null,
};

function loadInitial(): Persistable {
  try {
    const raw = typeof localStorage !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY)
      : null;
    if (!raw) return initial;
    const parsed = JSON.parse(raw) as Partial<Persistable>;
    // Merge persisted heroes with defaults so newly-added archetypes get
    // a fresh stats record on first run after an update.
    const heroes = { ...defaultHeroes(), ...(parsed.heroes ?? {}) };
    for (const k of HERO_KINDS) {
      if (!heroes[k]) heroes[k] = emptyHeroStats();
    }
    return {
      accountLevel: parsed.accountLevel ?? 1,
      accountXp: parsed.accountXp ?? 0,
      mmr: parsed.mmr ?? 1000,
      matchesPlayed: parsed.matchesPlayed ?? 0,
      wins: parsed.wins ?? 0,
      losses: parsed.losses ?? 0,
      heroes,
      lastDailyClaimDay: parsed.lastDailyClaimDay ?? '',
      lastMatchReward: null,
    };
  } catch {
    return initial;
  }
}

function persist(state: Persistable): void {
  try {
    const persistable: Persistable = { ...state, lastMatchReward: null };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
  } catch {
    /* private mode / disabled storage — silent best effort. */
  }
}

/** XP needed for the next account level. Curves up linearly so early
 *  levels feel quick and later levels are a long-term grind. */
export function accountXpToNext(level: number): number {
  return 200 + level * 50;
}

/** Per-hero mastery cost — slightly cheaper than the account level so
 *  individual heroes hit big milestones (level 5, 10) faster. */
export function heroXpToNext(level: number): number {
  return 120 + level * 30;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export interface RankTier {
  id: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
  name: string;
  color: string;
  minMmr: number;
  maxMmr: number;
}

const RANK_TIERS: RankTier[] = [
  { id: 'bronze', name: 'БРОНЗА', color: '#c08358', minMmr: 0, maxMmr: 1000 },
  { id: 'silver', name: 'СЕРЕБРО', color: '#c8d2e0', minMmr: 1000, maxMmr: 1500 },
  { id: 'gold', name: 'ЗОЛОТО', color: '#ffd17a', minMmr: 1500, maxMmr: 2000 },
  { id: 'platinum', name: 'ПЛАТИНА', color: '#a4e3c5', minMmr: 2000, maxMmr: 2500 },
  { id: 'diamond', name: 'АЛМАЗ', color: '#9bd9ff', minMmr: 2500, maxMmr: 4000 },
];

/** Rank tier for an MMR value — Bronze through Diamond. */
export function rankTierFor(mmr: number): RankTier {
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (mmr >= RANK_TIERS[i].minMmr) return RANK_TIERS[i];
  }
  return RANK_TIERS[0];
}

/** Display labels for HeroKind ids. UI uses these everywhere instead of
 *  the internal slugs. */
export const HERO_NAMES: Record<HeroKind, string> = {
  ranger: 'АРКШУТЕР',
  mage: 'АРКАНИСТ',
  fighter: 'ВАРЛОРД',
  assassin: 'ТЕНЕКЛИНОК',
  tank: 'СТРАЖ',
};

export const useProgressionStore = create<ProgressionState>((set, get) => ({
  ...loadInitial(),

  awardMatchResult(params): void {
    const state = get();
    const { hero, victory, durationMs, kills } = params;

    // Base XP from duration: ~30 XP per minute, capped at 30 minutes so
    // a brutally long match still tops out somewhere reasonable.
    const minutes = Math.min(30, durationMs / 60000);
    const baseXp = Math.max(20, Math.round(minutes * 30));
    const winBonus = victory ? Math.round(baseXp * 0.5) : 0;

    // Daily login bonus — once per calendar day, awarded on the first
    // finished match of the day. Treats the date in local time.
    const today = todayKey();
    const dailyBonus = state.lastDailyClaimDay !== today ? 200 : 0;
    const totalXp = baseXp + winBonus + dailyBonus;

    // MMR swing: ±25 baseline plus a small kill-based bump so the better
    // performer climbs faster even on a loss.
    const mmrDelta = victory
      ? 25 + Math.min(20, kills * 2)
      : -25 + Math.min(15, kills * 2);

    const heroPre = state.heroes[hero];
    const preAccountXpToLevel = accountXpToNext(state.accountLevel);
    const preHeroXpToLevel = heroXpToNext(heroPre.level);

    // Apply account XP, climbing levels until the remainder fits.
    let accountLevel = state.accountLevel;
    let accountXp = state.accountXp + totalXp;
    while (accountXp >= accountXpToNext(accountLevel)) {
      accountXp -= accountXpToNext(accountLevel);
      accountLevel += 1;
    }

    // Apply hero XP.
    let heroLevel = heroPre.level;
    let heroXp = heroPre.xp + totalXp;
    while (heroXp >= heroXpToNext(heroLevel)) {
      heroXp -= heroXpToNext(heroLevel);
      heroLevel += 1;
    }

    const newHeroes = { ...state.heroes };
    newHeroes[hero] = {
      level: heroLevel,
      xp: heroXp,
      matches: heroPre.matches + 1,
      wins: heroPre.wins + (victory ? 1 : 0),
      losses: heroPre.losses + (victory ? 0 : 1),
      kills: heroPre.kills + Math.max(0, kills),
    };

    const reward: MatchReward = {
      baseXp,
      winBonus,
      dailyBonus,
      totalXp,
      mmrDelta,
      victory,
      hero,
      preAccountLevel: state.accountLevel,
      preAccountXp: state.accountXp,
      preAccountXpToLevel,
      preHeroLevel: heroPre.level,
      preHeroXp: heroPre.xp,
      preHeroXpToLevel,
    };

    const next: Persistable = {
      accountLevel,
      accountXp,
      mmr: Math.max(0, state.mmr + mmrDelta),
      matchesPlayed: state.matchesPlayed + 1,
      wins: state.wins + (victory ? 1 : 0),
      losses: state.losses + (victory ? 0 : 1),
      heroes: newHeroes,
      lastDailyClaimDay: today,
      lastMatchReward: reward,
    };

    set(next);
    persist(next);
  },

  clearLastMatchReward(): void {
    set((s) => {
      const next: Persistable = { ...s, lastMatchReward: null };
      persist(next);
      return { lastMatchReward: null };
    });
  },
}));
