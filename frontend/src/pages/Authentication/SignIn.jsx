import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { useAuth } from '../../context/AuthContext'

export default function SignIn() {
  const { updateSession, showError, showMessage } = useAuth()
  const navigate = useNavigate()
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  
  const submitLogin = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      const { data } = await api.post('/auth/login', Object.fromEntries(form))
      
      if (data.requiere_2fa) {
        navigate('/auth/verify-2fa', { state: { challenge: data } })
        return
      }
      
      updateSession(data)
      navigate(data.must_change_password ? '/auth/change-password' : '/dashboard')
    } catch (requestError) {
      showError(requestError)
    }
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    if (!forgotEmail) return
    setForgotLoading(true)
    try {
      const { data } = await api.post('/auth/forgot-password', { correo: forgotEmail })
      showMessage(data.mensaje)
      setShowForgotModal(false)
      setForgotEmail('')
    } catch (requestError) {
      showError(requestError)
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <main className="login-shell">
      <section className="login-art">
        <span className="eyebrow">PLAYA AZUL / OPERACIONES</span>
        <h1>El agua, bajo control.</h1>
        <p>Monitoreo inteligente y operación clara para una piscina siempre lista.</p>
        <div className="pool-lines" />
      </section>
      <section className="login-card">
        <div className="brand login-brand">
          <span className="brand-mark">PA</span>
          <div>
            <strong>Playa Azul</strong>
            <small>Control center</small>
          </div>
        </div>
        <form className="form" onSubmit={submitLogin}>
          <div>
            <span className="eyebrow">BIENVENIDO DE VUELTA</span>
            <h2>Inicia sesión</h2>
            <p className="muted">Accede a tu centro de operaciones.</p>
          </div>
          <label>
            Correo
            <input name="correo" type="email" autoComplete="email" required />
          </label>
          <label className="relative">
            <div className="flex justify-between items-center mb-1">
              <span>Contraseña</span>
              <button
                type="button"
                onClick={() => setShowForgotModal(true)}
                className="text-xs text-blue-600 hover:text-blue-700 font-semibold focus:outline-none"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="primary" type="submit">Entrar al panel <span>→</span></button>
        </form>

        {/* Modal de Olvidé mi Contraseña */}
        {showForgotModal && (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Recuperar Contraseña</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Ingresa tu correo para enviarte una contraseña temporal</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-all"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Correo Registrado
                  </label>
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="ejemplo@piscina.com"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="w-1/3 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-100 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading || !forgotEmail}
                    className="w-2/3 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm shadow-md shadow-blue-500/20 transition-all"
                  >
                    {forgotLoading ? 'Enviando...' : 'Enviar Contraseña'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
