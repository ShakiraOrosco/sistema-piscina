import { useState, useEffect, useCallback } from 'react'
import api from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { Navigate } from 'react-router-dom'

function getHoyISO() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatearFechaLegible(fechaStr) {
  if (!fechaStr) return ''
  const partes = fechaStr.split('-')
  if (partes.length !== 3) return fechaStr
  const [y, m, d] = partes.map(Number)
  const fecha = new Date(y, m - 1, d)
  return fecha.toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function AuditoriaPage() {
  const { session, authConfig, showError } = useAuth()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [logDetalle, setLogDetalle] = useState(null)

  // Filtro por fecha: por defecto hoy
  const [fechaFiltro, setFechaFiltro] = useState(getHoyISO())
  const esHoy = fechaFiltro === getHoyISO()

  // Paginación: 20 registros por página
  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 20

  useEffect(() => {
    setCurrentPage(1)
  }, [fechaFiltro, searchTerm])

  const fetchLogs = useCallback(async (targetFecha = fechaFiltro) => {
    setLoading(true)
    try {
      const params = {}
      if (targetFecha) {
        params.fecha = targetFecha
      }
      const { data } = await api.get('/auditoria/logs', {
        ...authConfig(),
        params,
      })
      setLogs(data)
    } catch (requestError) {
      showError(requestError)
    } finally {
      setLoading(false)
    }
  }, [authConfig, showError, fechaFiltro])

  useEffect(() => {
    if (session?.usuario?.sigla_rol === 'ADM') {
      fetchLogs(fechaFiltro)
    }
  }, [session, fechaFiltro, fetchLogs])

  if (session?.usuario?.sigla_rol !== 'ADM') {
    return <Navigate to="/dashboard" replace />
  }

  const filteredLogs = logs.filter((log) => {
    // 1. Filtrar por fecha seleccionada
    if (fechaFiltro) {
      if (!log.fecha_hora) return false

      let match = false
      const d = new Date(log.fecha_hora)
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        if (`${y}-${m}-${day}` === fechaFiltro) {
          match = true
        }
      }

      if (!match && typeof log.fecha_hora === 'string') {
        const rawDate = log.fecha_hora.split('T')[0].split(' ')[0]
        if (rawDate === fechaFiltro) {
          match = true
        }
      }

      if (!match) return false
    }

    // 2. Filtrar por término de búsqueda
    const query = searchTerm.toLowerCase().trim()
    if (!query) return true
    return (
      (log.entidad && log.entidad.toLowerCase().includes(query)) ||
      (log.accion && log.accion.toLowerCase().includes(query)) ||
      (log.nombre_usuario && log.nombre_usuario.toLowerCase().includes(query)) ||
      (log.correo_usuario && log.correo_usuario.toLowerCase().includes(query))
    )
  })

  const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE) || 1
  const validCurrentPage = Math.min(Math.max(currentPage, 1), totalPages)
  const startIndex = (validCurrentPage - 1) * ITEMS_PER_PAGE
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredLogs.length)
  const paginatedLogs = filteredLogs.slice(startIndex, endIndex)

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
              onClick={() => fetchLogs(fechaFiltro)}
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2.5 rounded-xl font-bold text-sm transition-all"
            >
              🔄 Actualizar Logs
            </button>
          </div>
        </div>
      </div>

      {/* ── Barra de Control de Fecha ── */}
      <div className="max-w-6xl mx-auto px-6 mt-6">
        <div className="bg-white dark:bg-[#24303F] p-4 rounded-2xl border border-slate-200 dark:border-[#313D4A] shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="fechaFiltroAuditoria" className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Filtrar por fecha:
              </label>
              <input
                id="fechaFiltroAuditoria"
                type="date"
                value={fechaFiltro}
                onChange={(e) => setFechaFiltro(e.target.value)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#313D4A] font-bold text-sm text-slate-800 dark:text-white bg-slate-50 dark:bg-[#1A222C] focus:bg-white dark:focus:bg-[#1A222C] focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
              />
            </div>

            {!esHoy && (
              <button
                type="button"
                onClick={() => setFechaFiltro(getHoyISO())}
                className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-black transition-all border border-blue-200 dark:border-blue-800 active:scale-95 flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Volver a Hoy
              </button>
            )}

            {fechaFiltro && (
              <button
                type="button"
                onClick={() => setFechaFiltro('')}
                className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold transition-all border border-slate-200 dark:border-slate-700"
                title="Ver todos los registros sin filtro de fecha"
              >
                Ver todos
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {fechaFiltro ? (
              <>
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 capitalize">
                  {formatearFechaLegible(fechaFiltro)}
                </span>
                {esHoy ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Hoy
                  </span>
                ) : (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    Fecha Seleccionada
                  </span>
                )}
              </>
            ) : (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
                Todos los registros recientes
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Filtro y Tabla de Logs ── */}
      <div className="max-w-6xl mx-auto px-6 mt-6">
        <div className="bg-white dark:bg-[#24303F] rounded-2xl border border-slate-200 dark:border-[#313D4A] shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5 border-b border-slate-100 dark:border-[#313D4A]">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-500"></span>
              <h2 className="font-bold text-lg text-slate-800 dark:text-white">
                {fechaFiltro ? (esHoy ? 'Registros de Hoy' : `Registros del ${fechaFiltro}`) : 'Todos los Registros'}
              </h2>
              <span className="ml-2 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {filteredLogs.length} {filteredLogs.length === 1 ? 'evento' : 'eventos'}
              </span>
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
            <div className="text-center py-16 text-slate-400 font-medium space-y-3">
              <p>
                {fechaFiltro
                  ? `No se encontraron registros de auditoría para el ${esHoy ? 'día de hoy' : fechaFiltro}`
                  : 'No se encontraron registros de auditoría'}
              </p>
              {!esHoy && (
                <div>
                  <button
                    type="button"
                    onClick={() => setFechaFiltro(getHoyISO())}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-bold hover:underline"
                  >
                    Volver a registros de hoy
                  </button>
                </div>
              )}
            </div>
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
                  {paginatedLogs.map((log, i) => {
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

          {/* ── Paginación de 20 registros ── */}
          {filteredLogs.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-t border-slate-100 dark:border-[#313D4A] bg-slate-50/50 dark:bg-[#1A222C]/50">
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Mostrando <span className="font-bold text-slate-700 dark:text-slate-200">{startIndex + 1}</span> a{' '}
                <span className="font-bold text-slate-700 dark:text-slate-200">{endIndex}</span> de{' '}
                <span className="font-bold text-slate-700 dark:text-slate-200">{filteredLogs.length}</span> registros
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={validCurrentPage <= 1}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#24303F] text-slate-700 dark:text-slate-200 text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm"
                  title="Página anterior"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
                  </svg>
                  Anterior
                </button>

                <div className="flex items-center gap-1 px-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Página {validCurrentPage} de {totalPages}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={validCurrentPage >= totalPages}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#24303F] text-slate-700 dark:text-slate-200 text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm"
                  title="Página siguiente"
                >
                  Siguiente
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
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
