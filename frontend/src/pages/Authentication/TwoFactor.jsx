import { useLocation, useNavigate, Navigate } from 'react-router-dom'
import api from '../../services/api'
import { useAuth } from '../../context/AuthContext'

export default function TwoFactor() {
  const { updateSession, showError } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  
  const challenge = location.state?.challenge

  if (!challenge) {
    return <Navigate to="/auth/login" replace />
  }

  const submitTwoFactor = async (event) => {
    event.preventDefault()
    try {
      const form = new FormData(event.currentTarget)
      const { data } = await api.post('/auth/verify-2fa', {
        desafio: challenge.desafio,
        codigo: form.get('codigo'),
      })
      
      const authenticatedSession = { ...data, usuario: challenge.usuario }
      updateSession(authenticatedSession)
      navigate(data.must_change_password ? '/auth/change-password' : '/dashboard')
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
        <form className="form" onSubmit={submitTwoFactor}>
          <div>
            <span className="eyebrow">VERIFICACIÓN DE SEGURIDAD</span>
            <h2>Confirma tu acceso</h2>
            <p className="muted">Enviamos un código de 6 dígitos a {challenge?.correo_mascarado || 'tu correo'}.</p>
          </div>
          <label>
            Código de verificación
            <input name="codigo" inputMode="numeric" pattern="[0-9]{6}" maxLength="6" autoComplete="one-time-code" required />
          </label>
          <button className="primary" type="submit">Verificar código <span>→</span></button>
          <button className="secondary" type="button" onClick={() => navigate('/auth/login')}>Volver al inicio</button>
        </form>
      </section>
    </main>
  )
}
