import { useState, useEffect } from 'react'
import api, { monitoringApi } from '../../services/api'
import { useAuth } from '../../context/AuthContext'

export default function Profile() {
  const { authConfig, showError, showMessage, session, updateSession } = useAuth()
  const [profile, setProfile] = useState(null)
  const [toggling2FA, setToggling2FA] = useState(false)
  const [notifConfig, setNotifConfig] = useState(null)
  const [whatsappPhone, setWhatsappPhone] = useState('')
  const [whatsappApikey, setWhatsappApikey] = useState('')
  const [emailExtra, setEmailExtra] = useState('')
  const [savingNotif, setSavingNotif] = useState(false)
  const [testingNotif, setTestingNotif] = useState(false)

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await api.get('/auth/profile', authConfig())
        setProfile(response.data)
      } catch (err) {
        showError('No se pudo cargar la información del perfil')
      }
    }
    const fetchNotifConfig = async () => {
      try {
        const { data } = await monitoringApi.get('/api/notificaciones/config')
        setNotifConfig(data)
        setWhatsappPhone(data.whatsapp_phone || '')
        setEmailExtra(data.email_extra || '')
      } catch {
        // Ignorar si aún no está disponible
      }
    }
    fetchProfile()
    fetchNotifConfig()
  }, [])

  const guardarConfigNotif = async (e) => {
    e.preventDefault()
    setSavingNotif(true)
    try {
      const payload = {
        whatsapp_phone: whatsappPhone.trim(),
        email_extra: emailExtra.trim(),
      }
      if (whatsappApikey.trim()) {
        payload.whatsapp_apikey = whatsappApikey.trim()
      }
      const { data } = await monitoringApi.put('/api/notificaciones/config', payload)
      setNotifConfig(data.config)
      setWhatsappApikey('')
      showMessage(data.mensaje || 'Configuración de alertas guardada')
    } catch (err) {
      showError('No se pudo guardar la configuración de notificaciones')
    } finally {
      setSavingNotif(false)
    }
  }

  const probarNotifAlerta = async () => {
    setTestingNotif(true)
    try {
      const { data } = await monitoringApi.post('/api/notificaciones/probar', {
        modulo: 'Monitoreo y Dosificación',
        dispositivo: 'Sensor / Bomba ESP32 (Prueba de sistema)',
        titulo: 'Prueba de Alerta de Falla en Dispositivo',
        detalle: 'Simulación de falla enviada desde el panel de Perfil para verificar la entrega por Correo y WhatsApp.',
      })
      const okEmail = data?.resultado?.correo?.enviado
      const okWa = data?.resultado?.whatsapp?.enviado
      if (okEmail && okWa) {
        showMessage('Alerta enviada exitosamente por Correo Electrónico y WhatsApp')
      } else if (okEmail) {
        showMessage(`Correo enviado correctamente. WhatsApp: ${data?.resultado?.whatsapp?.error || 'no configurado'}`)
      } else if (okWa) {
        showMessage(`WhatsApp enviado correctamente. Correo: ${data?.resultado?.correo?.error || 'no configurado'}`)
      } else {
        showError(`Aviso: Correo (${data?.resultado?.correo?.error || 'falló'}) | WhatsApp (${data?.resultado?.whatsapp?.error || 'falló'})`)
      }
      const resCfg = await monitoringApi.get('/api/notificaciones/config')
      setNotifConfig(resCfg.data)
    } catch (err) {
      showError('Error al enviar la prueba de notificación')
    } finally {
      setTestingNotif(false)
    }
  }

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

      {/* Alertas de Fallas de Dispositivos (Correo y WhatsApp - CallMeBot) */}
      <div className="mt-6 rounded-2xl border border-slate-200 dark:border-[#313D4A] bg-white dark:bg-[#24303F] shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-[#313D4A] px-7 py-5">
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">
              Alertas de Falla de Dispositivos (Correo y WhatsApp)
            </h3>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Cuando un sensor de monitoreo (pH, Turbidez, Temperatura) o un actuador de dosificación (Bomba, Electroválvula, ESP32) falla, el sistema alerta en el Dashboard y envía un mensaje automático por Correo y WhatsApp.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              notifConfig?.smtp_configurado
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
            }`}>
              Correo SMTP: {notifConfig?.smtp_configurado ? 'Activo' : 'Pendiente'}
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              notifConfig?.whatsapp_configurado
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
            }`}>
              WhatsApp: {notifConfig?.whatsapp_configurado ? 'Activo' : 'Sin API Key'}
            </span>
          </div>
        </div>

        <form onSubmit={guardarConfigNotif} className="p-7">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Número de WhatsApp (con código de país)
              </label>
              <input
                type="text"
                placeholder="Ej. +59170000000"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-[#313D4A] bg-slate-50 dark:bg-[#1A222C] px-4 py-2.5 text-sm text-slate-800 dark:text-white outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                CallMeBot API Key {notifConfig?.whatsapp_apikey_mascarada ? `(Actual: ${notifConfig.whatsapp_apikey_mascarada})` : ''}
              </label>
              <input
                type="password"
                placeholder="Ingresa tu API Key de CallMeBot"
                value={whatsappApikey}
                onChange={(e) => setWhatsappApikey(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-[#313D4A] bg-slate-50 dark:bg-[#1A222C] px-4 py-2.5 text-sm text-slate-800 dark:text-white outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Correo adicional de alertas (además de Administradores)
              </label>
              <input
                type="text"
                placeholder="correo@ejemplo.com"
                value={emailExtra}
                onChange={(e) => setEmailExtra(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-[#313D4A] bg-slate-50 dark:bg-[#1A222C] px-4 py-2.5 text-sm text-slate-800 dark:text-white outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-blue-100 dark:border-blue-900/30 bg-blue-50/50 dark:bg-blue-900/10 p-3.5 text-xs text-slate-600 dark:text-slate-300">
            <strong>¿Cómo activar CallMeBot para WhatsApp gratis?</strong> Agrega el número <code>+34 644 71 81 99</code> a tus contactos de WhatsApp y envíale el mensaje <code>I allow callmebot to send me messages</code>. Recibirás tu <strong>API Key</strong> en segundos para pegarla aquí.
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={probarNotifAlerta}
              disabled={testingNotif}
              className="rounded-xl border border-slate-300 dark:border-[#313D4A] bg-slate-100 dark:bg-[#1A222C] px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#313D4A] transition-colors disabled:opacity-50"
            >
              {testingNotif ? 'Enviando prueba...' : 'Enviar Alerta de Prueba'}
            </button>
            <button
              type="submit"
              disabled={savingNotif}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {savingNotif ? 'Guardando...' : 'Guardar Configuración'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
