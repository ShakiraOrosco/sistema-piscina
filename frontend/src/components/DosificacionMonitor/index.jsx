import { useEffect, useState, useRef } from 'react'
import { monitoringApi } from '../../services/api'

export default function DosificacionMonitor({ onCambioEstado = null }) {
  const [estado, setEstado] = useState(null)
  const [deteniendo, setDeteniendo] = useState(false)
  const timerRef = useRef(null)

  const consultarEstado = async () => {
    try {
      const res = await monitoringApi.get('/api/dosificacion/estado')
      setEstado(res.data)
      if (onCambioEstado) {
        onCambioEstado(res.data)
      }
    } catch {
      // Ignorar errores de red transitorios en polling
    }
  }

  useEffect(() => {
    consultarEstado()

    // Polling adaptativo: más rápido si está activa
    const intervalMs = estado?.activa ? 500 : 2500
    timerRef.current = setInterval(consultarEstado, intervalMs)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [estado?.activa])

  const handleDetener = async () => {
    setDeteniendo(true)
    try {
      const res = await monitoringApi.post('/api/dosificacion/detener', {
        motivo: 'Parada manual de emergencia desde el panel',
      })
      setEstado(res.data.estado)
    } catch (err) {
      console.error('Error al detener dosificación:', err)
    } finally {
      setDeteniendo(false)
    }
  }

  // Si no está activa y no hay un mensaje reciente de completado, no mostrar
  if (!estado?.activa && estado?.modo !== 'completado' && estado?.modo !== 'detenido') {
    return null
  }

  const esActiva = estado?.activa
  const esCompletado = estado?.modo === 'completado'
  const esDetenido = estado?.modo === 'detenido'

  return (
    <div
      id="banner-dosificacion-en-vivo"
      className={`relative mb-6 overflow-hidden rounded-2xl border p-5 shadow-lg transition-all duration-500 animate-slide-down ${
        esActiva
          ? 'border-violet-400 bg-gradient-to-br from-violet-600/10 via-sky-600/10 to-transparent ring-4 ring-violet-500/15 dark:border-violet-500/40 dark:bg-[#1f2937]'
          : esCompletado
          ? 'border-emerald-400 bg-emerald-50/80 dark:border-emerald-600 dark:bg-emerald-950/20'
          : 'border-amber-400 bg-amber-50/80 dark:border-amber-600 dark:bg-amber-950/20'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Lado izquierdo: Estado y Químico */}
        <div className="flex items-center gap-3.5">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-xl shadow-md ${
              esActiva
                ? 'bg-gradient-to-tr from-violet-600 to-sky-600 text-white animate-pulse'
                : esCompletado
                ? 'bg-emerald-600 text-white'
                : 'bg-amber-600 text-white'
            }`}
          >
            {esActiva ? (
              <svg className="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M5.6 15a7 7 0 0012.3 2.4M18.4 9A7 7 0 006.1 6.6" />
              </svg>
            ) : esCompletado ? (
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                  esActiva
                    ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300'
                    : esCompletado
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${esActiva ? 'bg-violet-500 animate-ping' : esCompletado ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                {esActiva ? 'Dosificación en Curso' : esCompletado ? 'Dosificación Finalizada' : 'Dosificación Detenida'}
              </span>

              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 capitalize">
                · {estado.tipo || 'parcial'}
              </span>
            </div>

            <h5 className="text-base font-bold text-slate-800 dark:text-white mt-0.5">
              {estado.quimico} ({estado.cantidad_g}g)
            </h5>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {estado.mensaje}
            </p>
          </div>
        </div>

        {/* Centro: Indicadores de Hardware (Pines) */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-semibold ${
            estado.bomba_encendida 
              ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' 
              : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-[#313D4A] dark:bg-[#1A222C]'
          }`}>
            <span className={`h-2 w-2 rounded-full ${estado.bomba_encendida ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            Bomba (Pin 26): {estado.bomba_encendida ? 'ON' : 'OFF'}
          </div>

          <div className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-semibold ${
            estado.valvula_abierta 
              ? 'border-sky-400 bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300' 
              : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-[#313D4A] dark:bg-[#1A222C]'
          }`}>
            <span className={`h-2 w-2 rounded-full ${estado.valvula_abierta ? 'bg-sky-500 animate-pulse' : 'bg-slate-400'}`} />
            Válvula (Pin 25): {estado.valvula_abierta ? 'ABIERTA' : 'CERRADA'}
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-600 dark:border-[#313D4A] dark:bg-[#1A222C] dark:text-slate-300">
            <span>Flujo (Pin 27): {estado.pulsos} pulsos</span>
          </div>
        </div>

        {/* Lado derecho: Métricas y Botón de Parada */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Volumen medido
            </div>
            <div className="text-lg font-black text-slate-800 dark:text-white">
              {estado.litros_actuales?.toFixed(3)} <span className="text-xs font-normal text-slate-400">/ {estado.litros_objetivo?.toFixed(3)} L</span>
            </div>
          </div>

          {esActiva && (
            <button
              onClick={handleDetener}
              disabled={deteniendo}
              className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-red-500/20 hover:bg-red-700 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              <span>{deteniendo ? 'Parando…' : 'Parada de Emergencia'}</span>
            </button>
          )}

          {!esActiva && (
            <button
              onClick={() => setEstado((prev) => ({ ...prev, modo: 'listo' }))}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-[#313D4A]"
              title="Cerrar aviso"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Barra de Progreso */}
      <div className="mt-4">
        <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
          <span>Progreso de dosificación</span>
          <span>{estado.progreso_pct}%</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            className={`h-full transition-all duration-300 ${
              esCompletado
                ? 'bg-emerald-500'
                : esDetenido
                ? 'bg-amber-500'
                : 'bg-gradient-to-r from-violet-600 via-sky-500 to-emerald-400'
            }`}
            style={{ width: `${estado.progreso_pct || 0}%` }}
          />
        </div>
      </div>
    </div>
  )
}
