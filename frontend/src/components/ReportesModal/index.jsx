import { useState, useEffect, useCallback } from 'react'
import api from '../../services/api'
import { useAuth } from '../../context/AuthContext'

export default function ReportesModal({ isOpen, onClose }) {
  const { session } = useAuth()

  const [tipoReporte, setTipoReporte] = useState('calidad_agua')
  const [tipoRango, setTipoRango] = useState('semana')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')

  const [loading, setLoading] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [reporteData, setReporteData] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  useEffect(() => {
    const hoyStr = new Date().toISOString().split('T')[0]
    const hace7dias = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    setFechaInicio(hace7dias)
    setFechaFin(hoyStr)
  }, [])

  const fetchResumen = useCallback(async () => {
    if (!isOpen) return
    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    const params = {
      tipo_rango: tipoRango,
      fecha_inicio: tipoRango === 'personalizado' ? fechaInicio : undefined,
      fecha_fin: tipoRango === 'personalizado' ? fechaFin : undefined,
    }

    try {
      let endpoint = '/reportes/calidad-agua'
      if (tipoReporte === 'dosificacion') endpoint = '/reportes/quimicos-dosificacion'
      if (tipoReporte === 'afluencia') endpoint = '/reportes/afluencia'

      const { data } = await api.get(endpoint, { params })
      setReporteData(data)
    } catch (err) {
      console.error('Error al consultar datos de reporte:', err)
      setErrorMsg(err.response?.data?.detail || 'No se pudieron obtener los datos para el reporte.')
    } finally {
      setLoading(false)
    }
  }, [isOpen, tipoReporte, tipoRango, fechaInicio, fechaFin])

  useEffect(() => {
    if (isOpen) {
      fetchResumen()
    }
  }, [isOpen, fetchResumen])

  const handleDescargarPdf = async () => {
    setExportingPdf(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const nombreUsuario = session?.usuario
        ? `${session.usuario.nombre || ''} ${session.usuario.primer_apellido || ''}`.trim()
        : 'Administrador'

      const response = await api.get('/reportes/pdf', {
        params: {
          tipo_reporte: tipoReporte,
          tipo_rango: tipoRango,
          fecha_inicio: tipoRango === 'personalizado' ? fechaInicio : undefined,
          fecha_fin: tipoRango === 'personalizado' ? fechaFin : undefined,
          usuario_generador: nombreUsuario || 'Administrador',
        },
        responseType: 'blob',
      })

      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const hoyStr = new Date().toISOString().split('T')[0]
      a.download = `reporte_playa_azul_${tipoReporte}_${hoyStr}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      a.remove()

      setSuccessMsg('Reporte en PDF generado y descargado correctamente.')
    } catch (err) {
      console.error('Error al exportar PDF:', err)
      setErrorMsg('No se pudo generar el archivo PDF. Intente nuevamente.')
    } finally {
      setExportingPdf(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-99999 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-2xl bg-white dark:bg-[#24303F] border border-slate-200 dark:border-[#313D4A] shadow-2xl overflow-hidden my-8">
        {/* Cabecera del Modal */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#313D4A] px-6 py-5 bg-slate-50 dark:bg-[#1A222C]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-lg shadow-md shadow-blue-500/20">
              📊
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                Generar y Exportar Reporte Oficial
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Piscina Playa Azul · Cumplimiento Normativo Ley Municipal 020 & RD 742/2013
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-white transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Contenido del Modal */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Mensajes de Estado */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/30 dark:border-rose-900/50 dark:text-rose-400 text-xs font-semibold flex items-center gap-2">
              <span>⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-900/50 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
              <span>✅</span>
              <span>{successMsg}</span>
            </div>
          )}

          {/* Selector de Tipo de Reporte */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              1. Seleccione el Tipo de Reporte
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {[
                { id: 'calidad_agua', label: '💧 Calidad del Agua', desc: 'pH, Turbidez, Temp. y Cumplimiento' },
                { id: 'dosificacion', label: '🧪 Químicos y Costos', desc: 'Cloro, Cobre, Aluminio y Gastos (Bs)' },
                { id: 'afluencia', label: '👥 Afluencia de Bañistas', desc: 'Taquilla, Horarios Pico y Aforo' },
              ].map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setTipoReporte(r.id)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    tipoReporte === r.id
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 ring-2 ring-blue-500/20'
                      : 'border-slate-200 dark:border-[#313D4A] hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <p className="text-xs font-bold text-slate-800 dark:text-white">{r.label}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{r.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Selector de Rango de Fechas */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              2. Período a Evaluar
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: 'hoy', label: 'Hoy' },
                { id: 'semana', label: 'Últimos 7 Días' },
                { id: 'mes', label: 'Últimos 30 Días' },
                { id: 'personalizado', label: 'Rango Personalizado' },
              ].map((rg) => (
                <button
                  key={rg.id}
                  type="button"
                  onClick={() => setTipoRango(rg.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    tipoRango === rg.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {rg.label}
                </button>
              ))}
            </div>

            {tipoRango === 'personalizado' && (
              <div className="mt-3 grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#1A222C] border border-slate-200 dark:border-[#313D4A]">
                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">Fecha de Inicio:</span>
                  <input
                    type="date"
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#313D4A] bg-white dark:bg-[#24303F] text-xs text-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">Fecha de Fin:</span>
                  <input
                    type="date"
                    value={fechaFin}
                    onChange={(e) => setFechaFin(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#313D4A] bg-white dark:bg-[#24303F] text-xs text-slate-800 dark:text-white"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Vista Previa de Resumen Estadístico */}
          <div className="rounded-xl border border-slate-200 dark:border-[#313D4A] p-4 bg-slate-50 dark:bg-[#1A222C]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Resumen Preliminar del Período
              </span>
              {loading && <span className="text-xs text-blue-500 animate-pulse font-medium">Cargando métricas...</span>}
            </div>

            {tipoReporte === 'calidad_agua' && reporteData?.estadisticas && (
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-white dark:bg-[#24303F] p-2.5 rounded-lg border border-slate-200 dark:border-[#313D4A]">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">pH Promedio</p>
                  <p className="text-lg font-black text-blue-600 dark:text-blue-400">
                    {reporteData.estadisticas.ph.promedio ?? '—'}
                  </p>
                  <p className="text-[10px] text-emerald-600 font-bold">
                    {reporteData.estadisticas.ph.pct_cumplimiento}% norma
                  </p>
                </div>
                <div className="bg-white dark:bg-[#24303F] p-2.5 rounded-lg border border-slate-200 dark:border-[#313D4A]">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Turbidez Media</p>
                  <p className="text-lg font-black text-amber-600 dark:text-amber-400">
                    {reporteData.estadisticas.turbidez.promedio ?? '—'} <span className="text-xs font-normal">NTU</span>
                  </p>
                  <p className="text-[10px] text-emerald-600 font-bold">
                    {reporteData.estadisticas.turbidez.pct_cumplimiento}% &lt; 5 NTU
                  </p>
                </div>
                <div className="bg-white dark:bg-[#24303F] p-2.5 rounded-lg border border-slate-200 dark:border-[#313D4A]">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Índice Global</p>
                  <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                    {reporteData.indice_global_cumplimiento}%
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium">
                    {reporteData.total_mediciones} muestras
                  </p>
                </div>
              </div>
            )}

            {tipoReporte === 'dosificacion' && reporteData?.totales_dosificados_kg && (
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-white dark:bg-[#24303F] p-2.5 rounded-lg border border-slate-200 dark:border-[#313D4A]">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Cloro</p>
                  <p className="text-base font-bold text-slate-800 dark:text-white">
                    {reporteData.totales_dosificados_kg.cloro} kg
                  </p>
                  <p className="text-[10px] text-blue-500">Bs. {reporteData.costos_estimados_bs.cloro.toFixed(2)}</p>
                </div>
                <div className="bg-white dark:bg-[#24303F] p-2.5 rounded-lg border border-slate-200 dark:border-[#313D4A]">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Sulfato Aluminio</p>
                  <p className="text-base font-bold text-slate-800 dark:text-white">
                    {reporteData.totales_dosificados_kg['sulfato de aluminio']} kg
                  </p>
                  <p className="text-[10px] text-blue-500">Bs. {reporteData.costos_estimados_bs['sulfato de aluminio'].toFixed(2)}</p>
                </div>
                <div className="bg-white dark:bg-[#24303F] p-2.5 rounded-lg border border-slate-200 dark:border-[#313D4A]">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Costo Total</p>
                  <p className="text-base font-black text-emerald-600 dark:text-emerald-400">
                    Bs. {reporteData.costo_total_bs.toFixed(2)}
                  </p>
                  <p className="text-[10px] text-slate-400">Inversión en insumos</p>
                </div>
              </div>
            )}

            {tipoReporte === 'afluencia' && reporteData?.resumen && (
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-white dark:bg-[#24303F] p-2.5 rounded-lg border border-slate-200 dark:border-[#313D4A]">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Total Bañistas</p>
                  <p className="text-base font-bold text-slate-800 dark:text-white">
                    {reporteData.resumen.total_banistas} personas
                  </p>
                </div>
                <div className="bg-white dark:bg-[#24303F] p-2.5 rounded-lg border border-slate-200 dark:border-[#313D4A]">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Recaudación</p>
                  <p className="text-base font-black text-emerald-600 dark:text-emerald-400">
                    Bs. {reporteData.resumen.total_recaudado_bs.toFixed(2)}
                  </p>
                </div>
                <div className="bg-white dark:bg-[#24303F] p-2.5 rounded-lg border border-slate-200 dark:border-[#313D4A]">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Horario Pico</p>
                  <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                    {reporteData.resumen.hora_pico}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Pie del Modal con Botones */}
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-[#313D4A] px-6 py-4 bg-slate-50 dark:bg-[#1A222C]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
          >
            Cerrar
          </button>

          <button
            type="button"
            onClick={handleDescargarPdf}
            disabled={exportingPdf || loading}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs transition-all shadow-md hover:shadow-lg disabled:opacity-50"
          >
            {exportingPdf ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Generando Documento...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Descargar Reporte PDF Oficial</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
