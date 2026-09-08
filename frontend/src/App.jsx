import { useState } from 'react'
import api from './services/api'
import './App.css'

function App() {
  const [session, setSession] = useState(null)
  const [view, setView] = useState('dashboard')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [users, setUsers] = useState([])
  const [userForm, setUserForm] = useState(null)
  const [loadingUsers, setLoadingUsers] = useState(false)

  const authConfig = () => ({ headers: { Authorization: `Bearer ${session.access_token}` } })

  const showError = (requestError) => {
    setError(requestError.response?.data?.detail || 'No se pudo completar la operación')
    setMessage('')
  }

  const loadUsers = async (accessToken = session?.access_token) => {
    setLoadingUsers(true)
    try {
      const { data } = await api.get('/auth/users', { headers: { Authorization: `Bearer ${accessToken}` } })
      setUsers(data)
    } catch (requestError) {
      showError(requestError)
    } finally {
      setLoadingUsers(false)
    }
  }

  const submitLogin = async (event) => {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      const { data } = await api.post('/auth/login', Object.fromEntries(form))
      setSession(data)
      setView(data.must_change_password ? 'change-password' : 'dashboard')
      if (data.usuario.sigla_rol === 'ADM') await loadUsers(data.access_token)
    } catch (requestError) {
      showError(requestError)
    }
  }

  const submitChangePassword = async (event) => {
    event.preventDefault()
    try {
      const form = new FormData(event.currentTarget)
      const { data } = await api.post('/auth/change-password', Object.fromEntries(form), authConfig())
      setSession({ ...session, must_change_password: false })
      setView('dashboard')
      setMessage(data.mensaje)
    } catch (requestError) { showError(requestError) }
  }

  const submitUser = async (event) => {
    event.preventDefault()
    try {
      const form = new FormData(event.currentTarget)
      const payload = Object.fromEntries(form)
      const request = userForm.id_usuario
        ? api.put(`/auth/users/${userForm.id_usuario}`, payload, authConfig())
        : api.post('/auth/users', payload, authConfig())
      const { data } = await request
      setUserForm(null)
      setMessage(data.mensaje)
      await loadUsers()
    } catch (requestError) { showError(requestError) }
  }

  const disableUser = async (user) => {
    if (!window.confirm(`¿Desactivar a ${user.nombre} ${user.primer_apellido}?`)) return
    try {
      const { data } = await api.delete(`/auth/users/${user.id_usuario}`, authConfig())
      setMessage(data.mensaje)
      await loadUsers()
    } catch (requestError) { showError(requestError) }
  }

  const logout = () => {
    setSession(null)
    setView('dashboard')
    setMessage('')
  }

  if (!session) return <Login error={error} onSubmit={submitLogin} />
  if (view === 'change-password') return <ChangePassword error={error} onSubmit={submitChangePassword} />

  const activeUsers = users.filter((user) => user.activo).length
  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">PA</span><div><strong>Playa Azul</strong><small>Control center</small></div></div>
      <div className="side-label">MENÚ PRINCIPAL</div>
      <button className={`nav-item ${view === 'dashboard' ? 'selected' : ''}`} onClick={() => setView('dashboard')}><span>▦</span> Dashboard</button>
      {session.usuario.sigla_rol === 'ADM' && <button className={`nav-item ${view === 'users' ? 'selected' : ''}`} onClick={() => setView('users')}><span>♙</span> Usuarios</button>}
      <div className="sidebar-footer"><div className="avatar">{session.usuario.nombre.slice(0, 1).toUpperCase()}</div><div><strong>{session.usuario.nombre}</strong><small>{session.usuario.sigla_rol === 'ADM' ? 'Administrador' : 'Operador'}</small></div><button className="logout" onClick={logout} title="Cerrar sesión">↪</button></div>
    </aside>
    <section className="workspace">
      <header className="topbar"><div><span className="crumb">OPERACIONES / {view === 'users' ? 'USUARIOS' : 'RESUMEN'}</span><h1>{view === 'users' ? 'Usuarios' : 'Buenos días, ' + session.usuario.nombre.split(' ')[0]}</h1></div><div className="top-actions"><span className="date">{new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</span><span className="notification">●</span></div></header>
      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice success">{message}</div>}
      {view === 'dashboard' && <Dashboard activeUsers={activeUsers} totalUsers={users.length} onUsers={() => setView('users')} />}
      {view === 'users' && <UsersPage users={users} loading={loadingUsers} onNew={() => setUserForm({})} onEdit={setUserForm} onDisable={disableUser} />}
    </section>
    {userForm && <UserModal user={userForm} onClose={() => setUserForm(null)} onSubmit={submitUser} />}
  </main>
}

function Login({ error, onSubmit }) {
  return <main className="login-shell"><section className="login-art"><span className="eyebrow">PLAYA AZUL / OPERACIONES</span><h1>El agua, bajo control.</h1><p>Monitoreo inteligente y operación clara para una piscina siempre lista.</p><div className="pool-lines" /></section><section className="login-card"><div className="brand login-brand"><span className="brand-mark">PA</span><div><strong>Playa Azul</strong><small>Control center</small></div></div>{error && <div className="notice error">{error}</div>}<form className="form" onSubmit={onSubmit}><div><span className="eyebrow">BIENVENIDO DE VUELTA</span><h2>Inicia sesión</h2><p className="muted">Accede a tu centro de operaciones.</p></div><label>Correo<input name="correo" type="email" autoComplete="email" required /></label><label>Contraseña<input name="password" type="password" autoComplete="current-password" required /></label><button className="primary" type="submit">Entrar al panel <span>→</span></button></form></section></main>
}

function ChangePassword({ error, onSubmit }) {
  return <main className="login-shell single"><section className="login-card"><div className="brand login-brand"><span className="brand-mark">PA</span><div><strong>Playa Azul</strong><small>Control center</small></div></div>{error && <div className="notice error">{error}</div>}<form className="form" onSubmit={onSubmit}><div><span className="eyebrow">PRIMER ACCESO</span><h2>Define tu contraseña</h2><p className="muted">Cambia la contraseña temporal antes de continuar.</p></div><label>Contraseña temporal<input name="password_actual" type="password" required /></label><label>Nueva contraseña<input name="password_nueva" type="password" minLength="8" required /></label><button className="primary" type="submit">Guardar contraseña <span>→</span></button></form></section></main>
}

function Dashboard({ activeUsers, totalUsers, onUsers }) {
  return <div className="dashboard-content"><div className="welcome-banner"><div><span className="eyebrow">MARTES, 08 SEPTIEMBRE 2026</span><h2>Resumen operativo</h2><p>Todo en orden. Revisa el estado de tu operación.</p></div><div className="water-symbol">◒</div></div><div className="stat-grid"><article className="stat-card accent"><span className="stat-icon">♙</span><div><small>USUARIOS ACTIVOS</small><strong>{activeUsers || '—'}</strong><p>de {totalUsers || 0} registrados</p></div></article><article className="stat-card"><span className="stat-icon green">◌</span><div><small>ESTADO DE PISCINA</small><strong className="status-text">Estable</strong><p>Última revisión hoy</p></div></article><article className="stat-card"><span className="stat-icon orange">◷</span><div><small>ÚLTIMA ACTIVIDAD</small><strong className="status-text">En línea</strong><p>Conexión operativa</p></div></article></div><section className="dashboard-grid"><div className="panel-card chart-card"><div className="card-heading"><div><small>MONITOREO</small><h3>Calidad del agua</h3></div><span className="live-dot">● En vivo</span></div><div className="empty-chart"><div className="chart-grid" /><strong>Sin lecturas registradas</strong><span>Las métricas aparecerán aquí cuando el sistema reciba datos.</span></div></div><div className="panel-card quick-card"><small>ACCESOS RÁPIDOS</small><h3>Administración</h3><button className="quick-action" onClick={onUsers}><span>♙</span><div><strong>Gestionar usuarios</strong><small>Crear, editar o desactivar accesos</small></div><b>→</b></button></div></section></div>
}

function UsersPage({ users, loading, onNew, onEdit, onDisable }) {
  return <div className="users-content"><div className="page-actions"><div><p className="muted">Administra los accesos del equipo y sus permisos.</p></div><button className="primary" onClick={onNew}>+ Nuevo usuario</button></div><section className="panel-card table-card"><div className="table-toolbar"><div className="search">⌕ <input placeholder="Buscar usuario..." onChange={(event) => { event.currentTarget.closest('.table-card').querySelectorAll('tbody tr').forEach((row) => { row.hidden = !row.innerText.toLowerCase().includes(event.target.value.toLowerCase()) }) }} /></div><span>{users.length} usuarios</span></div><div className="table-wrap"><table><thead><tr><th>USUARIO</th><th>ROL</th><th>ESTADO</th><th>CONTRASEÑA</th><th /></tr></thead><tbody>{loading ? <tr><td colSpan="5" className="table-empty">Cargando usuarios...</td></tr> : users.map((user) => <tr key={user.id_usuario}><td><div className="user-cell"><span className="avatar small">{user.nombre.slice(0, 1).toUpperCase()}</span><div><strong>{user.nombre} {user.primer_apellido} {user.segundo_apellido}</strong><small>{user.correo}</small></div></div></td><td><span className="role">{user.sigla_rol === 'ADM' ? 'Administrador' : 'Operador'}</span></td><td><span className={`status ${user.activo ? 'active' : 'inactive'}`}><i />{user.activo ? 'Activo' : 'Inactivo'}</span></td><td><span className="password-state">{user.debe_cambiar_password ? 'Temporal' : 'Definida'}</span></td><td><div className="row-actions"><button onClick={() => onEdit(user)} title="Editar usuario">Editar</button>{user.activo && <button className="danger" onClick={() => onDisable(user)} title="Desactivar usuario">Desactivar</button>}</div></td></tr>)}</tbody></table></div></section></div>
}

function UserModal({ user, onClose, onSubmit }) {
  return <div className="modal-backdrop"><form className="modal" onSubmit={onSubmit}><div className="modal-header"><div><span className="eyebrow">{user.id_usuario ? 'EDITAR ACCESO' : 'NUEVO ACCESO'}</span><h2>{user.id_usuario ? 'Editar usuario' : 'Crear usuario'}</h2></div><button type="button" className="close" onClick={onClose}>×</button></div><p className="muted">{user.id_usuario ? 'Actualiza los datos y permisos del usuario.' : 'Se generará una contraseña temporal y se enviará por correo.'}</p><label>Nombre<input name="nombre" defaultValue={user.nombre || ''} maxLength="60" required /></label><label>Primer apellido<input name="primer_apellido" defaultValue={user.primer_apellido || ''} maxLength="60" required /></label><label>Segundo apellido<input name="segundo_apellido" defaultValue={user.segundo_apellido || ''} maxLength="60" /></label><label>Correo electrónico<input name="correo" type="email" defaultValue={user.correo || ''} required /></label><label>Rol<select name="sigla_rol" defaultValue={user.sigla_rol || 'OPE'}><option value="OPE">Operador</option><option value="ADM">Administrador</option></select></label><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" type="submit">{user.id_usuario ? 'Guardar cambios' : 'Crear usuario'}</button></div></form></div>
}

export default App
