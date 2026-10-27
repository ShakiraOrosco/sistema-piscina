import { useState, useEffect, useCallback } from 'react'
import api from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts'

export default function ReportesPage() {
  const { session } = useAuth()

  // Filtros de navegación
  const [tipoReporte, setTipoReporte] = useState('calidad_agua') // 'calidad_agua', 'dosificacion', 'afluencia', 'completo'
  const [tipoRango, setTipoRango] = useState('semana') // 'hoy', 'semana', 'mes', 'personalizado'
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')

  // Estados de carga y datos
  const [loading, setLoading] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [dataCalidad, setDataCalidad] = useState(null)
  const [dataQuimicos, setDataQuimicos] = useState(null)
  const [dataAfluencia, setDataAfluencia] = useState(null)
  const [notification, setNotification] = useState(null)

  // Paginación para la tabla de mediciones
  const [paginaActual, setPaginaActual] = useState(1)
  const elementosPorPagina = 12

  // Establecer fechas iniciales para personalizado si están vacías
  useEffect(() => {
    const hoyStr = new Date().toISOString().split('T')[0]
    const hace7dias = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    setFechaInicio(hace7dias)
    setFechaFin(hoyStr)
  }, [])

  // Carga de datos
  const cargarReporte = useCallback(async () => {
    setLoading(true)
    setNotification(null)

    const params = {
      tipo_rango: tipoRango,
      fecha_inicio: tipoRango === 'personalizado' ? fechaInicio : undefined,
      fecha_fin: tipoRango === 'personalizado' ? fechaFin : undefined,
    }

    try {
      if (tipoReporte === 'calidad_agua' || tipoReporte === 'completo') {
        const { data } = await api.get('/reportes/calidad-agua', { params })
        setDataCalidad(data)
      }
      if (tipoReporte === 'dosificacion' || tipoReporte === 'completo') {
        const { data } = await api.get('/reportes/quimicos-dosificacion', { params })
        setDataQuimicos(data)
      }
      if (tipoReporte === 'afluencia' || tipoReporte === 'completo') {
        const { data } = await api.get('/reportes/afluencia', { params })
        setDataAfluencia(data)
      }
    } catch (error) {
      console.error('Error cargando reportes:', error)
      const errorMsg = error.response?.data?.detail || 'No se pudo cargar la información del reporte. Intente nuevamente.'
      setNotification({ type: 'error', msg: errorMsg })
    } finally {
      setLoading(false)
    }
  }, [tipoReporte, tipoRango, fechaInicio, fechaFin])

  useEffect(() => {
    cargarReporte()
  }, [cargarReporte])

  // Exportar PDF formal (RF-05 / RF-20)
  const handleExportarPdf = async () => {
    setExportingPdf(true)
    setNotification(null)
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
          usuario_generador: nombreUsuario || 'Administrador General',
        },
        responseType: 'blob',
      })

      // Crear enlace temporal de descarga
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

      setNotification({ type: 'success', msg: 'Reporte oficial en PDF generado y descargado exitosamente.' })
    } catch (error) {
      console.error('Error al exportar PDF:', error)
      setNotification({
        type: 'error',
        msg: 'Ocurrió un error al generar el archivo PDF. Verifique la conexión con el servidor.',
      })
    } finally {
      setExportingPdf(false)
    }
  }

  // Paginación de mediciones
  const mediciones = dataCalidad?.mediciones || []
  const totalPaginas = Math.ceil(mediciones.length / elementosPorPagina) || 1
  const medicionesPaginadas = mediciones.slice(
    (paginaActual - 1) * elementosPorPagina,
    paginaActual * elementosPorPagina
  )

  return (
    <div className="min-h-screen bg-slate-50 pb-16 dark:bg-[#1A222C]">
      {/* ── Encabezado Principal ── */}
      <div className="bg-white dark:bg-[#24303F] border-b border-slate-200 dark:border-[#313D4A] px-6 py-6 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse"></span>
              <p className="text-xs font-bold tracking-widest uppercase text-blue-600 dark:text-blue-400">
                Piscina Playa Azul — Reyes, Beni
              </p>
            </div>
            <h1 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-3">
              <span>📊 Módulo de Reportes Institucionales</span>
            </h1>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Documentación técnica, estadísticas fisicoquímicas, consumo de insumos y cumplimiento normativo (Ley Municipal 020 / RD 742/2013).
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={cargarReporte}
              disabled={loading}
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#313D4A] dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm disabled:opacity-50"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>{loading ? 'Actualizando...' : 'Actualizar'}</span>
            </button>

            <button
              onClick={handleExportarPdf}
              disabled={exportingPdf || loading}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-50"
            >
              {exportingPdf ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span>Generando PDF...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Exportar a PDF</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-6 space-y-6">
        {/* Notificaciones */}
        {notification && (
          <div
            className={`p-4 rounded-xl flex items-center justify-between text-sm font-medium ${
              notification.type === 'error'
                ? 'bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/30 dark:border-rose-900/50 dark:text-rose-400'
                : 'bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-900/50 dark:text-emerald-400'
            }`}
          >
            <div className="flex items-center gap-2">
              <span>{notification.type === 'error' ? '⚠️' : '✅'}</span>
              <span>{notification.msg}</span>
            </div>
            <button onClick={() => setNotification(null)} className="text-xs underline opacity-70 hover:opacity-100">
              Cerrar
            </button>
          </div>
        )}

        {/* ── Barra de Navegación de Pestañas y Filtros Temporales ── */}
        <div className="bg-white dark:bg-[#24303F] rounded-2xl p-5 border border-slate-200 dark:border-[#313D4A] shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          {/* Selector de Tipo de Reporte */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'calidad_agua', label: '💧 Calidad del Agua', desc: 'pH, Turbidez, Temp.' },
              { id: 'dosificacion', label: '🧪 Químicos y Dosis', desc: 'Cloro, Cobre, Aluminio' },
              { id: 'afluencia', label: '👥 Afluencia Bañistas', desc: 'Taquilla y Cámara' },
              { id: 'completo', label: '📑 Consolidado Global', desc: 'Informe Integral' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setTipoReporte(tab.id)
                  setPaginaActual(1)
                }}
                className={`px-4 py-2 rounded-xl text-xs md:text-sm font-bold transition-all flex flex-col text-left ${
                  tipoReporte === tab.id
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'bg-slate-50 dark:bg-[#1A222C] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[10px] font-normal ${tipoReporte === tab.id ? 'text-blue-100' : 'text-slate-400'}`}>
                  {tab.desc}
                </span>
              </button>
            ))}
          </div>

          {/* Selector de Rango Temporal */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-slate-100 dark:bg-[#1A222C] p-1 rounded-xl flex items-center gap-1 border border-slate-200 dark:border-[#313D4A]">
              {[
                { id: 'hoy', label: 'Hoy' },
                { id: 'semana', label: '7 Días' },
                { id: 'mes', label: '30 Días' },
                { id: 'personalizado', label: 'Rango libre' },
              ].map((rango) => (
                <button
                  key={rango.id}
                  onClick={() => {
                    setTipoRango(rango.id)
                    setPaginaActual(1)
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    tipoRango === rango.id
                      ? 'bg-white dark:bg-[#24303F] text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                  }`}
                >
                  {rango.label}
                </button>
              ))}
            </div>

            {tipoRango === 'personalizado' && (
              <div className="flex items-center gap-2 text-xs">
                <input
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#313D4A] bg-slate-50 dark:bg-[#1A222C] text-slate-800 dark:text-white"
                />
                <span className="text-slate-400">a</span>
                <input
                  type="date"
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#313D4A] bg-slate-50 dark:bg-[#1A222C] text-slate-800 dark:text-white"
                />
              </div>
            )}
          </div>
        </div>

        {/* ── SECCIÓN 1: REPORTE DE CALIDAD DEL AGUA (RF-05 / HU-005) ── */}
        {(tipoReporte === 'calidad_agua' || tipoReporte === 'completo') && dataCalidad && (
          <div className="space-y-6">
            {/* Tarjetas KPI de Calidad del Agua */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Tarjeta pH */}
              <div className="bg-white dark:bg-[#24303F] p-5 rounded-2xl border border-slate-200 dark:border-[#313D4A] shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">pH Promedio</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    Norma: 7.2 - 7.6
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-black text-slate-800 dark:text-white">
                    {dataCalidad.estadisticas.ph.promedio ?? '—'}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    (Mín: {dataCalidad.estadisticas.ph.min ?? '—'} / Máx: {dataCalidad.estadisticas.ph.max ?? '—'})
                  </span>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span className="text-slate-500">Cumplimiento:</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                      {dataCalidad.estadisticas.ph.pct_cumplimiento}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${dataCalidad.estadisticas.ph.pct_cumplimiento}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Tarjeta Turbidez */}
              <div className="bg-white dark:bg-[#24303F] p-5 rounded-2xl border border-slate-200 dark:border-[#313D4A] shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Turbidez Media</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                    Límite: &lt; 5.0 NTU
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-black text-slate-800 dark:text-white">
                    {dataCalidad.estadisticas.turbidez.promedio ?? '—'}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">NTU</span>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span className="text-slate-500">Cumplimiento:</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                      {dataCalidad.estadisticas.turbidez.pct_cumplimiento}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full"
                      style={{ width: `${dataCalidad.estadisticas.turbidez.pct_cumplimiento}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Tarjeta Temperatura */}
              <div className="bg-white dark:bg-[#24303F] p-5 rounded-2xl border border-slate-200 dark:border-[#313D4A] shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Temperatura Media</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400">
                    26°C - 28°C
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-black text-slate-800 dark:text-white">
                    {dataCalidad.estadisticas.temperatura.promedio ?? '—'}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">°C</span>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span className="text-slate-500">Cumplimiento:</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                      {dataCalidad.estadisticas.temperatura.pct_cumplimiento}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-500 rounded-full"
                      style={{ width: `${dataCalidad.estadisticas.temperatura.pct_cumplimiento}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Índice Global de Conformidad */}
              <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-5 rounded-2xl text-white shadow-md relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-200">Índice Sanitario Global</span>
                  <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-bold">
                    {dataCalidad.total_mediciones} muestras
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-4xl font-black">{dataCalidad.indice_global_cumplimiento}%</span>
                  <span className="text-xs text-blue-100 font-medium">conforme a norma</span>
                </div>
                <p className="mt-3 text-xs text-blue-100 leading-tight">
                  Evaluado con criterios de Ley Municipal N° 020 y Real Decreto 742/2013.
                </p>
              </div>
            </div>

            {/* Gráficos Recharts de Evolución Temporal */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Gráfico pH */}
              <div className="bg-white dark:bg-[#24303F] p-6 rounded-2xl border border-slate-200 dark:border-[#313D4A] shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-slate-800 dark:text-white">Evolución del pH del Agua</h3>
                    <p className="text-xs text-slate-400">Rango normativo óptimo entre 7.20 y 7.60</p>
                  </div>
                  <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                    Ideal: 7.4
                  </span>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dataCalidad.mediciones}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
                      <YAxis domain={[6.5, 9.0]} tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1E293B',
                          borderRadius: '8px',
                          border: 'none',
                          color: '#fff',
                          fontSize: '11px',
                        }}
                      />
                      <ReferenceLine y={7.2} stroke="#EF4444" strokeDasharray="4 4" label={{ value: 'Mín 7.2', fill: '#EF4444', fontSize: 10 }} />
                      <ReferenceLine y={7.6} stroke="#EF4444" strokeDasharray="4 4" label={{ value: 'Máx 7.6', fill: '#EF4444', fontSize: 10 }} />
                      <Line type="monotone" dataKey="ph" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 5 }} name="pH Medido" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Gráfico Turbidez */}
              <div className="bg-white dark:bg-[#24303F] p-6 rounded-2xl border border-slate-200 dark:border-[#313D4A] shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-slate-800 dark:text-white">Evolución de Turbidez (NTU)</h3>
                    <p className="text-xs text-slate-400">Límite normativo máximo: 5.0 NTU</p>
                  </div>
                  <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">
                    &lt; 5.0 NTU
                  </span>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dataCalidad.mediciones}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 15]} tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1E293B',
                          borderRadius: '8px',
                          border: 'none',
                          color: '#fff',
                          fontSize: '11px',
                        }}
                      />
                      <ReferenceLine y={5.0} stroke="#F59E0B" strokeDasharray="4 4" label={{ value: 'Límite 5.0', fill: '#F59E0B', fontSize: 10 }} />
                      <Line type="monotone" dataKey="turbidez" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 5 }} name="Turbidez (NTU)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Gráfico Temperatura */}
              <div className="bg-white dark:bg-[#24303F] p-6 rounded-2xl border border-slate-200 dark:border-[#313D4A] shadow-sm lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-slate-800 dark:text-white">Evolución de Temperatura del Agua (°C)</h3>
                    <p className="text-xs text-slate-400">Rango de confort recreativo entre 26.0 °C y 28.0 °C (Límites permitidos: 24.0 °C – 30.0 °C)</p>
                  </div>
                  <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-300">
                    Confort: 26°C - 28°C
                  </span>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dataCalidad.mediciones}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey={tipoRango === 'hoy' ? 'hora' : 'fecha_hora'} tick={{ fontSize: 10 }} />
                      <YAxis domain={[20, 35]} tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1E293B',
                          borderRadius: '8px',
                          border: 'none',
                          color: '#fff',
                          fontSize: '11px',
                        }}
                      />
                      <ReferenceLine y={24.0} stroke="#0D9488" strokeDasharray="4 4" label={{ value: 'Mín 24°C', fill: '#0D9488', fontSize: 10 }} />
                      <ReferenceLine y={30.0} stroke="#0D9488" strokeDasharray="4 4" label={{ value: 'Máx 30°C', fill: '#0D9488', fontSize: 10 }} />
                      <Line type="monotone" dataKey="temperatura" stroke="#0D9488" strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 5 }} name="Temperatura (°C)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Diagnóstico y Conclusiones Técnicas */}
            <div className="bg-white dark:bg-[#24303F] p-6 rounded-2xl border border-slate-200 dark:border-[#313D4A] shadow-sm">
              <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-3">
                <span>📋 Dictamen y Recomendaciones Técnicas</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#1A222C] border border-slate-100 dark:border-[#313D4A]">
                  <p className="text-xs text-slate-400">Alertas de pH ácido / alcalino</p>
                  <p className="text-xl font-bold text-slate-800 dark:text-white mt-1">
                    {dataCalidad.alertas.ph_acido + dataCalidad.alertas.ph_alcalino} eventos
                  </p>
                  <span className="text-[11px] text-slate-400">
                    ({dataCalidad.alertas.ph_acido} ácidos / {dataCalidad.alertas.ph_alcalino} alcalinos)
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#1A222C] border border-slate-100 dark:border-[#313D4A]">
                  <p className="text-xs text-slate-400">Alertas de turbidez (&ge; 5 NTU)</p>
                  <p className="text-xl font-bold text-slate-800 dark:text-white mt-1">
                    {dataCalidad.alertas.turbidez_alta + dataCalidad.alertas.turbidez_critica} eventos
                  </p>
                  <span className="text-[11px] text-slate-400">
                    ({dataCalidad.alertas.turbidez_critica} críticas &ge; 10 NTU)
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#1A222C] border border-slate-100 dark:border-[#313D4A]">
                  <p className="text-xs text-slate-400">Desviaciones de temperatura</p>
                  <p className="text-xl font-bold text-slate-800 dark:text-white mt-1">
                    {dataCalidad.alertas.temp_fuera_rango} eventos
                  </p>
                  <span className="text-[11px] text-slate-400">Fuera de 24°C - 30°C</span>
                </div>
              </div>
              <ul className="space-y-1.5 text-xs md:text-sm text-slate-600 dark:text-slate-300">
                {dataCalidad.evaluacion_tecnica?.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Tabla Detallada de Mediciones */}
            <div className="bg-white dark:bg-[#24303F] rounded-2xl border border-slate-200 dark:border-[#313D4A] shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-[#313D4A] flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-white">Registros de Muestreo de Calidad</h3>
                  <p className="text-xs text-slate-400">
                    Mostrando página {paginaActual} de {totalPaginas} ({mediciones.length} lecturas totales)
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-[#1A222C] border-b border-slate-100 dark:border-[#313D4A]">
                      <th className="px-5 py-3 text-slate-400 font-bold uppercase">Fecha y Hora</th>
                      <th className="px-5 py-3 text-slate-400 font-bold uppercase">pH</th>
                      <th className="px-5 py-3 text-slate-400 font-bold uppercase">Turbidez (NTU)</th>
                      <th className="px-5 py-3 text-slate-400 font-bold uppercase">Temperatura (°C)</th>
                      <th className="px-5 py-3 text-slate-400 font-bold uppercase">Estado Sanitario</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#313D4A]">
                    {medicionesPaginadas.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="text-center py-8 text-slate-400 font-medium">
                          No se encontraron lecturas en el rango seleccionado
                        </td>
                      </tr>
                    ) : (
                      medicionesPaginadas.map((m) => (
                        <tr key={m.id_medicion} className="hover:bg-slate-50 dark:hover:bg-[#313D4A]/30 transition-colors">
                          <td className="px-5 py-3 font-medium text-slate-700 dark:text-slate-300">
                            {m.fecha_hora}
                          </td>
                          <td className="px-5 py-3 font-semibold">
                            <span
                              className={`px-2 py-0.5 rounded-full font-bold ${
                                m.estado_ph === 'OPTIMO'
                                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                                  : 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400'
                              }`}
                            >
                              {m.ph !== null ? m.ph.toFixed(2) : '—'} ({m.estado_ph})
                            </span>
                          </td>
                          <td className="px-5 py-3 font-semibold">
                            <span
                              className={`px-2 py-0.5 rounded-full font-bold ${
                                m.estado_turbidez === 'OPTIMA'
                                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                                  : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
                              }`}
                            >
                              {m.turbidez !== null ? m.turbidez.toFixed(2) : '—'} NTU
                            </span>
                          </td>
                          <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                            {m.temperatura !== null ? `${m.temperatura.toFixed(1)} °C` : '—'}
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                m.conforme
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                                  : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${m.conforme ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                              {m.conforme ? 'CONFORME' : 'FUERA DE NORMA'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Controles de paginación */}
              {totalPaginas > 1 && (
                <div className="px-6 py-3 border-t border-slate-100 dark:border-[#313D4A] flex items-center justify-between">
                  <button
                    disabled={paginaActual === 1}
                    onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
                    className="px-3 py-1 rounded-lg border border-slate-200 dark:border-[#313D4A] text-xs font-semibold text-slate-600 dark:text-slate-300 disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <span className="text-xs text-slate-500">
                    Página {paginaActual} de {totalPaginas}
                  </span>
                  <button
                    disabled={paginaActual === totalPaginas}
                    onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))}
                    className="px-3 py-1 rounded-lg border border-slate-200 dark:border-[#313D4A] text-xs font-semibold text-slate-600 dark:text-slate-300 disabled:opacity-40"
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SECCIÓN 2: REPORTE DE DOSIFICACIÓN Y QUÍMICOS ── */}
        {(tipoReporte === 'dosificacion' || tipoReporte === 'completo') && dataQuimicos && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-[#24303F] p-5 rounded-2xl border border-slate-200 dark:border-[#313D4A] shadow-sm">
                <span className="text-xs font-bold uppercase text-slate-400">Cloro Aplicado</span>
                <p className="text-2xl font-black text-slate-800 dark:text-white mt-2">
                  {dataQuimicos.totales_dosificados_kg.cloro} kg
                </p>
                <div className="mt-2 text-xs flex justify-between text-slate-500">
                  <span>{dataQuimicos.conteo_activaciones.cloro} dosis</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">
                    Bs. {dataQuimicos.costos_estimados_bs.cloro.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="bg-white dark:bg-[#24303F] p-5 rounded-2xl border border-slate-200 dark:border-[#313D4A] shadow-sm">
                <span className="text-xs font-bold uppercase text-slate-400">Sulfato de Aluminio</span>
                <p className="text-2xl font-black text-slate-800 dark:text-white mt-2">
                  {dataQuimicos.totales_dosificados_kg['sulfato de aluminio']} kg
                </p>
                <div className="mt-2 text-xs flex justify-between text-slate-500">
                  <span>{dataQuimicos.conteo_activaciones['sulfato de aluminio']} dosis</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">
                    Bs. {dataQuimicos.costos_estimados_bs['sulfato de aluminio'].toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="bg-white dark:bg-[#24303F] p-5 rounded-2xl border border-slate-200 dark:border-[#313D4A] shadow-sm">
                <span className="text-xs font-bold uppercase text-slate-400">Sulfato de Cobre</span>
                <p className="text-2xl font-black text-slate-800 dark:text-white mt-2">
                  {dataQuimicos.totales_dosificados_kg['sulfato de cobre']} kg
                </p>
                <div className="mt-2 text-xs flex justify-between text-slate-500">
                  <span>{dataQuimicos.conteo_activaciones['sulfato de cobre']} dosis</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">
                    Bs. {dataQuimicos.costos_estimados_bs['sulfato de cobre'].toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-5 rounded-2xl text-white shadow-md">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-100">Costo Total de Insumos</span>
                <p className="text-3xl font-black mt-2">Bs. {dataQuimicos.costo_total_bs.toFixed(2)}</p>
                <p className="mt-2 text-xs text-emerald-100">
                  Total de {dataQuimicos.total_registros_dosificacion} dosificaciones en el período.
                </p>
              </div>
            </div>

            {/* Gráfico comparativo de químicos */}
            <div className="bg-white dark:bg-[#24303F] p-6 rounded-2xl border border-slate-200 dark:border-[#313D4A] shadow-sm">
              <h3 className="font-bold text-slate-800 dark:text-white mb-1">
                Comparativa de Consumo por Insumo Químico
              </h3>
              <p className="text-xs text-slate-400 mb-4">Gramos dosificados según registros del sistema</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      {
                        name: 'Cloro',
                        gramos: dataQuimicos.totales_dosificados_g.cloro,
                        costoBs: dataQuimicos.costos_estimados_bs.cloro,
                      },
                      {
                        name: 'Sulfato Aluminio',
                        gramos: dataQuimicos.totales_dosificados_g['sulfato de aluminio'],
                        costoBs: dataQuimicos.costos_estimados_bs['sulfato de aluminio'],
                      },
                      {
                        name: 'Sulfato Cobre',
                        gramos: dataQuimicos.totales_dosificados_g['sulfato de cobre'],
                        costoBs: dataQuimicos.costos_estimados_bs['sulfato de cobre'],
                      },
                    ]}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1E293B',
                        borderRadius: '8px',
                        border: 'none',
                        color: '#fff',
                        fontSize: '11px',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="gramos" fill="#0284C7" name="Gramos Dosificados" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="costoBs" fill="#10B981" name="Costo en Bolivianos (Bs.)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ── SECCIÓN 3: REPORTE DE AFLUENCIA DE BAÑISTAS (RF-16 / HU-016) ── */}
        {(tipoReporte === 'afluencia' || tipoReporte === 'completo') && dataAfluencia && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-[#24303F] p-5 rounded-2xl border border-slate-200 dark:border-[#313D4A] shadow-sm">
                <span className="text-xs font-bold uppercase text-slate-400">Total Bañistas</span>
                <p className="text-3xl font-black text-slate-800 dark:text-white mt-2">
                  {dataAfluencia.resumen.total_banistas}
                </p>
                <span className="text-xs text-slate-500">en {dataAfluencia.rango.dias} días</span>
              </div>

              <div className="bg-white dark:bg-[#24303F] p-5 rounded-2xl border border-slate-200 dark:border-[#313D4A] shadow-sm">
                <span className="text-xs font-bold uppercase text-slate-400">Recaudación Taquilla</span>
                <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-2">
                  Bs. {dataAfluencia.resumen.total_recaudado_bs.toFixed(2)}
                </p>
                <span className="text-xs text-slate-500">Ingreso por venta de boletos</span>
              </div>

              <div className="bg-white dark:bg-[#24303F] p-5 rounded-2xl border border-slate-200 dark:border-[#313D4A] shadow-sm">
                <span className="text-xs font-bold uppercase text-slate-400">Promedio Diario</span>
                <p className="text-3xl font-black text-slate-800 dark:text-white mt-2">
                  {dataAfluencia.resumen.promedio_diario_banistas}
                </p>
                <span className="text-xs text-slate-500">personas por jornada</span>
              </div>

              <div className="bg-white dark:bg-[#24303F] p-5 rounded-2xl border border-slate-200 dark:border-[#313D4A] shadow-sm">
                <span className="text-xs font-bold uppercase text-slate-400">Horario Pico</span>
                <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-2">
                  {dataAfluencia.resumen.hora_pico}
                </p>
                <span className="text-xs text-slate-500">
                  {dataAfluencia.resumen.personas_hora_pico} personas registradas
                </span>
              </div>
            </div>

            {/* Gráfica de distribución horaria de afluencia */}
            <div className="bg-white dark:bg-[#24303F] p-6 rounded-2xl border border-slate-200 dark:border-[#313D4A] shadow-sm">
              <h3 className="font-bold text-slate-800 dark:text-white mb-1">
                Curva de Afluencia por Horario del Día
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Permite correlacionar el flujo de personas con incrementos de turbidez y demanda de desinfectante
              </p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dataAfluencia.distribucion_por_hora}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1E293B',
                        borderRadius: '8px',
                        border: 'none',
                        color: '#fff',
                        fontSize: '11px',
                      }}
                    />
                    <Bar dataKey="personas" fill="#3B82F6" name="Bañistas ingresados" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
