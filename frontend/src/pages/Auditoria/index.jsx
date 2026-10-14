import { useState, useEffect, useCallback } from 'react'
import api from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { Navigate } from 'react-router-dom'

export default function AuditoriaPage() {
  const { session, authConfig, showError } = useAuth()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [logDetalle, setLogDetalle] = useState(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/auditoria/logs', authConfig())
      setLogs(data)
    } catch (requestError) {
      showError(requestError)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (session?.usuario?.sigla_rol === 'ADM') {
      fetchLogs()
    }
  }, [session, fetchLogs])

  if (session?.usuario?.sigla_rol !== 'ADM') {
    return <Navigate to="/dashboard" replace />
  }

  const filteredLogs = logs.filter((log) => {
    const query = searchTerm.toLowerCase()
    return (
      (log.entidad && log.entidad.toLowerCase().includes(query)) ||
      (log.accion && log.accion.toLowerCase().includes(query)) ||
      (log.nombre_usuario && log.nombre_usuario.toLowerCase().includes(query)) ||
      (log.correo_usuario && log.correo_usuario.toLowerCase().includes(query))
    )
  })

  return (
    <div className="min-h-screen bg-slate-50 pb-12 dark:bg-[#1A222C]">
      {/* ── Header ── */}
      <div className="bg-white dark:bg-[#24303F] border-b border-slate-200 dark:border-[#313D4A] px-6 py-6 shadow-sm">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-widest uppercase text-blue-500 mb-1">Módulo de Administración</p>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Auditoría y Bitácora de Eventos</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Seguimiento detallado de cambios y operaciones del sistema</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchLogs}
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2.5 rounded-xl font-bold text-sm transition-all"
            >
              🔄 Actualizar Logs
            </button>
          </div>
        </div>
      </div>

      {/* ── Filtro y Tabla de Logs ── */}
      <div className="max-w-6xl mx-auto px-6 mt-8">
        <div className="bg-white dark:bg-[#24303F] rounded-2xl border border-slate-200 dark:border-[#313D4A] shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5 border-b border-slate-100 dark:border-[#313D4A]">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-500"></span>
              <h2 className="font-bold text-lg text-slate-800 dark:text-white">Registros de Actividad</h2>
            </div>
            
            <input
              type="text"
              placeholder="Buscar por usuario, acción o módulo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-[#313D4A] bg-slate-50 dark:bg-[#1A222C] text-sm text-slate-800 dark:text-white w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {loading ? (
            <div className="text-center py-16 text-slate-400 font-medium">Cargando bitácora de auditoría...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-16 text-slate-400 font-medium">No se encontraron registros de auditoría</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 dark:bg-[#1A222C] border-b border-slate-100 dark:border-[#313D4A]">
                    <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400">Fecha y Hora</th>
                    <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400">Usuario Responsable</th>
                    <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400">IP Dispositivo</th>
                    <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400">Acción</th>
                    <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400">Módulo / Entidad</th>
                    <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400 text-center">Detalles</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#313D4A]">
                  {filteredLogs.map((log, i) => {
                    const esInsert = log.accion === 'INSERT'
                    const esUpdate = log.accion === 'UPDATE'
                    const esDelete = log.accion === 'DELETE'
                    const esLoginOK = log.accion === 'LOGIN_SUCCESS'
                    const esLoginFail = log.accion === 'LOGIN_FAILED'

                    const usuarioNombre = log.nombre_usuario 
                      ? `${log.nombre_usuario} ${log.apellido_usuario || ''}`
                      : log.detalle?.nuevo?.id_usuario 
                        ? `Usuario #${log.detalle.nuevo.id_usuario}`
                        : 'Sistema / Automático'

                    return (
                      <tr key={log.id_log} className={i % 2 === 0 ? 'bg-white dark:bg-[#24303F]' : 'bg-slate-50/50 dark:bg-[#1A222C]/50'}>
                        <td className="px-5 py-4 text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {log.fecha_hora ? new Date(log.fecha_hora).toLocaleString() : '—'}
                        </td>
                        <td className="px-5 py-4 text-sm font-bold text-slate-800 dark:text-white">
                          {usuarioNombre}
                          <span className="block text-xs font-medium text-slate-400">
                            {log.correo_usuario || log.detalle?.correo_intentado || (log.sigla_rol ? `Rol: ${log.sigla_rol}` : 'Sistema IoT')}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs font-mono font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {log.ip_origen || '127.0.0.1 (Localhost)'}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-black ${
                            esLoginOK ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' :
                            esLoginFail ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' :
                            esInsert ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                            esUpdate ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                            'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }`}>
                            {log.accion}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                          {log.modulo || log.entidad}
                        </td>
                        <td className="px-5 py-4 text-center">
                          <button
                            onClick={() => setLogDetalle(log)}
                            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-blue-600 font-bold text-xs transition-all border border-slate-200 dark:border-slate-700"
                          >
                            Ver Datos
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL VER DETALLES DE AUDITORÍA ── */}
      {logDetalle && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#24303F] rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 dark:border-[#313D4A] relative">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-[#313D4A] mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">Detalle de Auditoría #{logDetalle.id_log}</h3>
                <p className="text-xs text-slate-400">Tabla: {logDetalle.entidad} | Acción: {logDetalle.accion}</p>
              </div>
              <button onClick={() => setLogDetalle(null)} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 flex items-center justify-center">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Payload JSON de Cambios</p>
                <pre className="p-4 rounded-xl bg-slate-900 text-emerald-400 text-xs font-mono overflow-x-auto max-h-60">
                  {JSON.stringify(logDetalle.detalle, null, 2)}
                </pre>
              </div>

              <button
                onClick={() => setLogDetalle(null)}
                className="w-full mt-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
