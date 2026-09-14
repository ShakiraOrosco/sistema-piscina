import { useNavigate, Navigate } from 'react-router-dom'
import api from '../../services/api'
import { useAuth } from '../../context/AuthContext'

export default function ChangePassword() {
  const { session, updateSession, authConfig, showError, showMessage } = useAuth()
  const navigate = useNavigate()

  if (!session) {
    return <Navigate to="/auth/login" replace />
  }

  const submitChangePassword = async (event) => {
    event.preventDefault()
    try {
      const form = new FormData(event.currentTarget)
      const { data } = await api.post('/auth/change-password', Object.fromEntries(form), authConfig())
      
      const updatedSession = { ...session, must_change_password: false }
      updateSession(updatedSession)
      
      showMessage(data.mensaje)
      navigate('/dashboard')
    } catch (requestError) {
      showError(requestError)
    }
  }

  return (
    <main className="login-shell single">
      <section className="login-card">
        <div className="brand login-brand">
          <span className="brand-mark">PA</span>
          <div>
            <strong>Playa Azul</strong>
            <small>Control center</small>
          </div>
        </div>
        <form className="form" onSubmit={submitChangePassword}>
          <div>
            <span className="eyebrow">PRIMER ACCESO</span>
            <h2>Define tu contraseña</h2>
            <p className="muted">Cambia la contraseña temporal antes de continuar.</p>
          </div>
          <label>
            Contraseña temporal
            <input name="password_actual" type="password" autoComplete="current-password" required />
          </label>
          <label>
            Nueva contraseña
            <input name="password_nueva" type="password" minLength="8" autoComplete="new-password" required />
          </label>
          <label>
            Confirmar nueva contraseña
            <input name="confirmar_password_nueva" type="password" minLength="8" autoComplete="new-password" required />
          </label>
          <button className="primary" type="submit">Guardar contraseña <span>→</span></button>
        </form>
      </section>
    </main>
  )
}
