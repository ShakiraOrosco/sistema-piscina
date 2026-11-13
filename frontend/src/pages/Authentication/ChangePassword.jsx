import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import api from '../../services/api'
import { useAuth } from '../../context/AuthContext'

export default function ChangePassword() {
  const { session, updateSession, authConfig, showError, showMessage } = useAuth()
  const navigate = useNavigate()
  const [fieldErrors, setFieldErrors] = useState({})

  if (!session) {
    return <Navigate to="/auth/login" replace />
  }

  const clearFieldError = (field) => {
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: '' } : prev))
  }

  const submitChangePassword = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const values = Object.fromEntries(form)
    const errors = {}

    if (!values.password_actual) {
      errors.password_actual = 'La contraseña temporal es obligatoria.'
    }
    if (!values.password_nueva || values.password_nueva.length < 8) {
      errors.password_nueva = 'La nueva contraseña debe tener al menos 8 caracteres.'
    }
    if (!values.confirmar_password_nueva || values.confirmar_password_nueva.length < 8) {
      errors.confirmar_password_nueva = 'Confirma la nueva contraseña (mínimo 8 caracteres).'
    } else if (values.password_nueva && values.confirmar_password_nueva !== values.password_nueva) {
      errors.confirmar_password_nueva = 'Las contraseñas no coinciden.'
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setFieldErrors({})
    try {
      const { data } = await api.post('/auth/change-password', values, authConfig())
      
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
        <form className="form" onSubmit={submitChangePassword} noValidate>
          <div>
            <span className="eyebrow">PRIMER ACCESO</span>
            <h2>Define tu contraseña</h2>
            <p className="muted">Cambia la contraseña temporal antes de continuar.</p>
          </div>
          <label>
            Contraseña temporal
            <input
              name="password_actual"
              type="password"
              autoComplete="current-password"
              onChange={() => clearFieldError('password_actual')}
              className={fieldErrors.password_actual ? '!border-red-500' : ''}
              required
            />
            {fieldErrors.password_actual && (
              <span className="text-xs font-medium normal-case tracking-normal text-red-600">
                {fieldErrors.password_actual}
              </span>
            )}
          </label>
          <label>
            Nueva contraseña
            <input
              name="password_nueva"
              type="password"
              minLength="8"
              autoComplete="new-password"
              onChange={() => clearFieldError('password_nueva')}
              className={fieldErrors.password_nueva ? '!border-red-500' : ''}
              required
            />
            {fieldErrors.password_nueva && (
              <span className="text-xs font-medium normal-case tracking-normal text-red-600">
                {fieldErrors.password_nueva}
              </span>
            )}
          </label>
          <label>
            Confirmar nueva contraseña
            <input
              name="confirmar_password_nueva"
              type="password"
              minLength="8"
              autoComplete="new-password"
              onChange={() => clearFieldError('confirmar_password_nueva')}
              className={fieldErrors.confirmar_password_nueva ? '!border-red-500' : ''}
              required
            />
            {fieldErrors.confirmar_password_nueva && (
              <span className="text-xs font-medium normal-case tracking-normal text-red-600">
                {fieldErrors.confirmar_password_nueva}
              </span>
            )}
          </label>
          <button className="primary" type="submit">Guardar contraseña <span>→</span></button>
        </form>
      </section>
    </main>
  )
}
