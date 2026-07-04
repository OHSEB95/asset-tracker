import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AuthUser } from '@shared/types'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  forcedLogoutMessage: string | null
  clearForcedLogoutMessage: () => void
  login: (email: string, password: string, rememberEmail: boolean, autoLogin: boolean) => Promise<string | null>
  register: (
    email: string,
    password: string,
    name: string,
    phoneNumber: string,
    rememberEmail: boolean,
    autoLogin: boolean
  ) => Promise<string | null>
  logout: () => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<string | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [forcedLogoutMessage, setForcedLogoutMessage] = useState<string | null>(null)

  useEffect(() => {
    window.api.auth.getCurrentUser().then((u) => {
      setUser(u)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    const unsubscribe = window.api.auth.onForceLogout(() => {
      setUser(null)
      setForcedLogoutMessage('다른 기기에서 로그인되어 이 기기는 로그아웃되었습니다.')
    })
    return unsubscribe
  }, [])

  const login = useCallback(async (email: string, password: string, rememberEmail: boolean, autoLogin: boolean) => {
    const result = await window.api.auth.login(email, password, rememberEmail, autoLogin)
    if (result.error) return result.error as string
    setUser(result.user ?? null)
    setForcedLogoutMessage(null)
    return null
  }, [])

  const register = useCallback(
    async (
      email: string,
      password: string,
      name: string,
      phoneNumber: string,
      rememberEmail: boolean,
      autoLogin: boolean
    ) => {
      const result = await window.api.auth.register(
        email,
        password,
        name,
        phoneNumber,
        rememberEmail,
        autoLogin
      )
      if (result.error) return result.error as string
      setUser(result.user ?? null)
      setForcedLogoutMessage(null)
      return null
    },
    []
  )

  const logout = useCallback(async () => {
    await window.api.auth.logout()
    setUser(null)
  }, [])

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const result = await window.api.auth.changePassword(currentPassword, newPassword)
    return result.error ?? null
  }, [])

  const clearForcedLogoutMessage = useCallback(() => setForcedLogoutMessage(null), [])

  const value = useMemo(
    () => ({
      user,
      loading,
      forcedLogoutMessage,
      clearForcedLogoutMessage,
      login,
      register,
      logout,
      changePassword
    }),
    [user, loading, forcedLogoutMessage, clearForcedLogoutMessage, login, register, logout, changePassword]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider')
  return ctx
}
