import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext()

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('piscina_session'))
    } catch {
      return null
    }
  })
  
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const showMessage = useCallback((text) => {
    setMessage(text)
    setError('')
    window.setTimeout(() => setMessage(''), 4000)
  }, [])

  const showError = useCallback((errorMsgOrObj) => {
    const text = typeof errorMsgOrObj === 'string' 
      ? errorMsgOrObj 
      : errorMsgOrObj?.response?.data?.detail || 'No se pudo completar la operación'
    setError(text)
    setMessage('')
    window.setTimeout(() => setError(''), 5000)
  }, [])

  const authConfig = () => ({ headers: { Authorization: `Bearer ${session?.access_token}` } })

  const logout = useCallback(() => {
    setSession(null)
    localStorage.removeItem('piscina_session')
    setMessage('')
  }, [])

  const updateSession = useCallback((newSession) => {
    setSession(newSession)
    if (newSession) {
      localStorage.setItem('piscina_session', JSON.stringify(newSession))
    } else {
      localStorage.removeItem('piscina_session')
    }
  }, [])

  const value = {
    session,
    error,
    setError,
    message,
    showMessage,
    showError,
    logout,
    updateSession,
    authConfig
  }

  // Auto-logout after 5 minutes of inactivity
  const resetTimer = useCallback(() => {
    if (session) {
      window.localStorage.setItem('piscina_last_activity', Date.now().toString())
    }
  }, [session])

  useEffect(() => {
    if (!session) return

    // Reinicia el timestamp al abrir/recargar la sesión para evitar
    // que un valor viejo en localStorage dispare el logout inmediatamente.
    window.localStorage.setItem('piscina_last_activity', Date.now().toString())

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart']
    events.forEach(event => document.addEventListener(event, resetTimer))

    const interval = setInterval(() => {
      const lastActivity = parseInt(window.localStorage.getItem('piscina_last_activity') || Date.now().toString())
      if (Date.now() - lastActivity > 5 * 60 * 1000) {
        logout()
        showError('Tu sesión ha expirado por inactividad (5 minutos).')
      }
    }, 10000) // Check every 10 seconds

    return () => {
      events.forEach(event => document.removeEventListener(event, resetTimer))
      clearInterval(interval)
    }
  }, [session, logout, showError, resetTimer])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
