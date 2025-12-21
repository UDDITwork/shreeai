import { create } from 'zustand'

interface AuthState {
  isAuthenticated: boolean
  token: string | null
  user: { id: string; email: string } | null
  setAuth: (token: string, user: { id: string; email: string }) => void
  clearAuth: () => void
  checkAuth: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  token: null,
  user: null,
  setAuth: (token, user) => {
    localStorage.setItem('token', token)
    set({ isAuthenticated: true, token, user })
  },
  clearAuth: () => {
    localStorage.removeItem('token')
    set({ isAuthenticated: false, token: null, user: null })
  },
  checkAuth: () => {
    const token = localStorage.getItem('token')
    if (token) {
      // Verify token is still valid by checking expiry
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        if (payload.exp * 1000 > Date.now()) {
          set({ isAuthenticated: true, token })
        } else {
          localStorage.removeItem('token')
          set({ isAuthenticated: false, token: null, user: null })
        }
      } catch {
        localStorage.removeItem('token')
        set({ isAuthenticated: false, token: null, user: null })
      }
    }
  },
}))

