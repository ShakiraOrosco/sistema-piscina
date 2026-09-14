import { useState, useEffect } from 'react'
import api from '../../services/api'
import { useAuth } from '../../context/AuthContext'

export default function Profile() {
  const { authConfig, showError, showMessage, session, updateSession } = useAuth()
  const [profile, setProfile] = useState(null)
  const [toggling2FA, setToggling2FA] = useState(false)

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await api.get('/auth/profile', authConfig())
        setProfile(response.data)
      } catch (err) {
        showError('No se pudo cargar la información del perfil')
      }
    }
    fetchProfile()
  }, [])

  const toggle2FA = async () => {
    if (!profile) return
    setToggling2FA(true)
    try {
      const newState = !profile.doble_factor_activo
      const response = await api.put('/auth/profile/2fa', { activo: newState }, authConfig())
      
      setProfile({ ...profile, doble_factor_activo: response.data.doble_factor_activo })
      showMessage(response.data.mensaje || 'Ajustes de seguridad actualizados')
      
      // Update session if it holds this data
      if (session?.usuario) {
        updateSession({ ...session, usuario: { ...session.usuario, doble_factor_activo: response.data.doble_factor_activo } })
      }
    } catch (err) {
      showError('No se pudo actualizar el estado de 2FA')
    } finally {
      setToggling2FA(false)
    }
  }

  if (!profile) return <div className="p-8 text-center text-sm font-medium text-slate-500 dark:text-slate-400">Cargando perfil...</div>
  
  const fullName = [profile.nombre, profile.primer_apellido, profile.segundo_apellido].filter(Boolean).join(' ')
  
  return (
    <>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Perfil de Usuario</h2>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Gestiona tus datos personales y ajustes de seguridad.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        
        {/* Información Personal */}
        <div className="rounded-2xl border border-slate-200 dark:border-[#313D4A] bg-white dark:bg-[#24303F] shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 dark:border-[#313D4A] px-7 py-5">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Información Personal</h3>
          </div>
          <div className="flex flex-col gap-5 p-7">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre Completo</label>
              <div className="w-full rounded-lg border border-slate-200 dark:border-[#313D4A] bg-slate-50 dark:bg-[#1A222C] px-4 py-2.5 text-slate-800 dark:text-white font-medium">
                {fullName}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Correo Electrónico</label>
              <div className="w-full rounded-lg border border-slate-200 dark:border-[#313D4A] bg-slate-50 dark:bg-[#1A222C] px-4 py-2.5 text-slate-800 dark:text-white font-medium">
                {profile.correo}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Rol de Acceso</label>
              <div className="w-full rounded-lg border border-slate-200 dark:border-[#313D4A] bg-slate-50 dark:bg-[#1A222C] px-4 py-2.5 text-slate-800 dark:text-white font-medium">
                {profile.sigla_rol === 'ADM' ? 'Administrador' : 'Operador'}
              </div>
            </div>
          </div>
        </div>

        {/* Seguridad */}
        <div className="rounded-2xl border border-slate-200 dark:border-[#313D4A] bg-white dark:bg-[#24303F] shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 dark:border-[#313D4A] px-7 py-5">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Seguridad</h3>
          </div>
          <div className="flex flex-col gap-6 p-7">
            <div>
              <h4 className="mb-1 text-sm font-bold text-slate-800 dark:text-white">Autenticación de Dos Factores (2FA)</h4>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Protege tu cuenta con un código temporal enviado a tu correo en cada inicio de sesión.</p>
            </div>
            
            <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-[#313D4A] bg-slate-50 dark:bg-[#1A222C] p-4">
              <div>
                <p className="font-semibold text-slate-800 dark:text-white">Estado del 2FA</p>
                <p className={`text-sm font-medium ${profile.doble_factor_activo ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {profile.doble_factor_activo ? 'Activado' : 'Desactivado'}
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input 
                  type="checkbox" 
                  className="peer sr-only" 
                  checked={profile.doble_factor_activo || false}
                  onChange={toggle2FA}
                  disabled={toggling2FA}
                />
                <div className="peer h-6 w-11 rounded-full bg-slate-200 dark:bg-[#313D4A] after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 dark:after:border-[#24303F] after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800/50 disabled:opacity-50"></div>
              </label>
            </div>
          </div>
        </div>

      </div>
    </>
  )
}
