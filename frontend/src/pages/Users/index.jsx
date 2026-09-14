import { useState, useEffect } from 'react'
import api from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { Navigate } from 'react-router-dom'

export default function UsersPage() {
  const { session, authConfig, showError, showMessage } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [userForm, setUserForm] = useState(null)

  const loadUsers = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/auth/users', authConfig())
      setUsers(data)
    } catch (requestError) {
      showError(requestError)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (session?.usuario?.sigla_rol === 'ADM') {
      loadUsers()
    }
  }, [session])

  if (session?.usuario?.sigla_rol !== 'ADM') {
    return <Navigate to="/dashboard" replace />
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
      showMessage(data.mensaje)
      await loadUsers()
    } catch (requestError) {
      showError(requestError)
    }
  }

  const disableUser = async (user) => {
    if (!window.confirm(`¿Eliminar a ${user.nombre} ${user.primer_apellido}?`)) return
    try {
      const { data } = await api.delete(`/auth/users/${user.id_usuario}`, authConfig())
      showMessage(data.mensaje)
      await loadUsers()
    } catch (requestError) {
      showError(requestError)
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Administración de Usuarios</h2>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Gestiona los accesos y permisos del equipo operativo.</p>
        </div>
        <button 
          onClick={() => setUserForm({})} 
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-2.5 text-center font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          + Nuevo Usuario
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-[#313D4A] bg-white dark:bg-[#24303F] p-7 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <h4 className="text-xl font-bold text-slate-800 dark:text-white">Lista de Usuarios</h4>
          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
            {users.length} usuarios
          </span>
        </div>

        <div className="max-w-full overflow-x-auto">
          <table className="w-full table-auto">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#313D4A] text-left">
                <th className="py-4 pr-4 text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Usuario</th>
                <th className="py-4 px-4 text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Rol</th>
                <th className="py-4 px-4 text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Estado</th>
                <th className="py-4 px-4 text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="4" className="py-8 text-center text-sm font-medium text-slate-500 dark:text-slate-400">Cargando usuarios...</td></tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id_usuario} className="border-b border-slate-100 dark:border-[#313D4A] last:border-0 hover:bg-slate-50 dark:hover:bg-[#313D4A]/50 transition-colors">
                    <td className="py-4 pr-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30 text-sm font-bold text-blue-600 dark:text-blue-400">
                          {user.nombre.slice(0,1).toUpperCase()}
                        </div>
                        <div>
                          <h5 className="font-semibold text-slate-800 dark:text-white">{user.nombre} {user.primer_apellido}</h5>
                          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{user.correo}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {user.sigla_rol === 'ADM' ? 'Administrador' : 'Operador'}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                        Activo
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-4">
                        <button onClick={() => setUserForm(user)} className="text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                          Editar
                        </button>
                        <button onClick={() => disableUser(user)} className="text-sm font-semibold text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300">
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {userForm && <UserModal user={userForm} onClose={() => setUserForm(null)} onSubmit={submitUser} />}
    </>
  )
}

function UserModal({ user, onClose, onSubmit }) {
  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4 py-5">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-[#313D4A] bg-white dark:bg-[#24303F] p-8 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-xl font-bold text-slate-800 dark:text-white">
            {user.id_usuario ? 'Editar Usuario' : 'Crear Usuario'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        
        <form onSubmit={onSubmit}>
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre</label>
            <input name="nombre" defaultValue={user.nombre || ''} required className="w-full rounded-lg border border-slate-300 dark:border-[#313D4A] bg-transparent dark:bg-[#1A222C] px-4 py-2.5 text-slate-800 dark:text-white outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600" />
          </div>
          
          <div className="mb-4 flex gap-4">
            <div className="flex-1">
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Primer Apellido</label>
              <input name="primer_apellido" defaultValue={user.primer_apellido || ''} required className="w-full rounded-lg border border-slate-300 dark:border-[#313D4A] bg-transparent dark:bg-[#1A222C] px-4 py-2.5 text-slate-800 dark:text-white outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600" />
            </div>
            <div className="flex-1">
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Segundo Apellido</label>
              <input name="segundo_apellido" defaultValue={user.segundo_apellido || ''} className="w-full rounded-lg border border-slate-300 dark:border-[#313D4A] bg-transparent dark:bg-[#1A222C] px-4 py-2.5 text-slate-800 dark:text-white outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600" />
            </div>
          </div>

          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Correo Electrónico</label>
            <input name="correo" type="email" defaultValue={user.correo || ''} required className="w-full rounded-lg border border-slate-300 dark:border-[#313D4A] bg-transparent dark:bg-[#1A222C] px-4 py-2.5 text-slate-800 dark:text-white outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600" />
          </div>

          <div className="mb-8">
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Rol</label>
            <select name="sigla_rol" defaultValue={user.sigla_rol || 'OPE'} className="w-full rounded-lg border border-slate-300 dark:border-[#313D4A] bg-transparent dark:bg-[#1A222C] px-4 py-2.5 text-slate-800 dark:text-white outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600">
              <option value="OPE">Operador</option>
              <option value="ADM">Administrador</option>
            </select>
          </div>

          <div className="flex gap-4">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-slate-300 dark:border-[#313D4A] py-2.5 font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#313D4A] transition-colors">
              Cancelar
            </button>
            <button type="submit" className="flex-1 rounded-lg bg-blue-600 py-2.5 font-medium text-white shadow-sm hover:bg-blue-700 transition-colors">
              Guardar Usuario
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
