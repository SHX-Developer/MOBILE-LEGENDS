import { create } from 'zustand';
import type { PublicUser } from '@ml/shared';

interface UserState {
  user: PublicUser | null;
  loading: boolean;
  error: string | null;
  setUser: (u: PublicUser | null) => void;
  setLoading: (b: boolean) => void;
  setError: (e: string | null) => void;
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  loading: false,
  error: null,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
