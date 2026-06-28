import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  name: string
  email: string
  subscription_tier?: 'standard' | 'premium'
}

interface Journey {
  id: string
  track: string
  status: string
  current_affirmation_day: number
  current_calendar_day: number
  transformation_score: number | null
}

interface AuthState {
  _hasHydrated: boolean
  user: User | null
  activeJourney: Journey | null
  setHasHydrated: (v: boolean) => void
  setUser: (user: User | null) => void
  setActiveJourney: (j: Journey | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      _hasHydrated: false,
      user: null,
      activeJourney: null,
      setHasHydrated: (v) => set({ _hasHydrated: v }),
      setUser: (user) => set({ user }),
      setActiveJourney: (activeJourney) => set({ activeJourney }),
      logout: () => {
        if (typeof window !== 'undefined') localStorage.removeItem('access_token')
        set({ user: null, activeJourney: null })
      },
    }),
    {
      name: 'auth-store',
      partialize: (s) => ({ user: s.user, activeJourney: s.activeJourney }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
