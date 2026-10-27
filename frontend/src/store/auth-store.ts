'use client';

import { create } from 'zustand';
import type { Business, Device, User } from '@/lib/types';
import { normalizePermissions } from '@/lib/permissions';

interface AuthState {
  user: User | null;
  device: Device | null;
  business: Business | null;
  initialized: boolean;
  hasLocalAuth: boolean;
  offline: boolean;
  setSession: (input: {
    user: User;
    device: Device | null;
    business: Business | null;
    offline?: boolean;
  }) => void;
  setUser: (user: User) => void;
  setBusiness: (business: Business | null) => void;
  setInitialized: (value: boolean) => void;
  setHasLocalAuth: (value: boolean) => void;
  setOffline: (value: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  device: null,
  business: null,
  initialized: false,
  hasLocalAuth: false,
  offline: false,
  setSession: ({ user, device, business, offline = false }) =>
    set({
      user: { ...user, permissions: normalizePermissions(user.role, user.permissions) },
      device,
      business,
      offline,
      initialized: true
    }),
  setUser: (user) =>
    set({ user: { ...user, permissions: normalizePermissions(user.role, user.permissions) } }),
  setBusiness: (business) => set({ business }),
  setInitialized: (initialized) => set({ initialized }),
  setHasLocalAuth: (hasLocalAuth) => set({ hasLocalAuth }),
  setOffline: (offline) => set({ offline }),
  reset: () =>
    set({
      user: null,
      device: null,
      business: null,
      initialized: true,
      offline: false,
      hasLocalAuth: false
    })
}));
