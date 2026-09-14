import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { useAuth } from '../../context/AuthContext'

export default function SignIn() {
  const { updateSession, showError } = useAuth()
  const navigate = useNavigate()
  
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
          <label>
            Contraseña
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="primary" type="submit">Entrar al panel <span>→</span></button>
        </form>
      </section>
    </main>
  )
}
