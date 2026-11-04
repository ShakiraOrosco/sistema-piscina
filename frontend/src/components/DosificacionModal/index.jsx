import { useState, useId } from 'react'
import { monitoringApi } from '../../services/api'

// Factores de conversión según la regla requerida:
// Cloro: 100g = 10L (0.1 L/g)
// Otros: 1000g = 15L (0.015 L/g)
export function calcularLitrosSolucion(quimico, cantidadGramos) {
  const q = (quimico || '').toLowerCase()
  const esCloro = q.includes('cloro')
  const g = Math.max(0, parseFloat(cantidadGramos) || 0)

  if (esCloro) {
    const litros = (g / 100.0) * 10.0
    return {
      litros: Number(litros.toFixed(3)),
      pulsos: Math.round(litros * 380),
      regla: '100g = 10L (0.10 L/g)',
      factor: 0.1,
      esCloro: true,
    }
  } else {
    const litros = (g / 1000.0) * 15.0
    return {
      litros: Number(litros.toFixed(3)),
      pulsos: Math.round(litros * 380),
      regla: '1000g = 15L (0.015 L/g)',
      factor: 0.015,
      esCloro: false,
    }
  }
}

export default function DosificacionModal({
  isOpen,
  onClose,
  quimicoInicial = 'Cloro',
  cantidadInicial = 25,
  tipoInicial = 'parcial', // 'parcial' o 'final'
  prediccion = null,
  dosisAplicadas = null,
  onDosificacionIniciada = null,
}) {
  const [quimico, setQuimico] = useState(quimicoInicial)
  const [cantidadGramos, setCantidadGramos] = useState(cantidadInicial)
  const [tipo, setTipo] = useState(tipoInicial) // 'parcial' | 'final'
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const quimicoSelectId = useId()
  const tipoSelectId = useId()
  const cantidadInputId = useId()

  if (!isOpen) return null

  // Calcular litros en tiempo real
  const calculo = calcularLitrosSolucion(quimico, cantidadGramos)

  // Obtener saldo restante si es dosificación final
  const getRestante = (nombreQuimico) => {
    if (!prediccion) return 0
    let predVal = 0
    const qLower = nombreQuimico.toLowerCase()
    if (qLower.includes('aluminio')) predVal = prediccion.aluminio_pred || 0
    else if (qLower.includes('cobre')) predVal = prediccion.cobre_pred || 0
    else if (qLower.includes('cloro')) predVal = prediccion.cloro_pred || 0

    const aplicado = dosisAplicadas?.[qLower] || 0
    return Math.max(0, Number(predVal) - aplicado)
  }

  const handleSeleccionarTipo = (nuevoTipo) => {
    setTipo(nuevoTipo)
    if (nuevoTipo === 'final') {
      const rest = getRestante(quimico)
      setCantidadGramos(rest > 0 ? Number(rest.toFixed(1)) : 50)
    } else {
      setCantidadGramos(quimico.toLowerCase().includes('cloro') ? 25 : 100)
    }
  }

  const handleSeleccionarQuimico = (nuevoQuimico) => {
    setQuimico(nuevoQuimico)
    if (tipo === 'final') {
      const rest = getRestante(nuevoQuimico)
      setCantidadGramos(rest > 0 ? Number(rest.toFixed(1)) : 50)
    }
  }

  const handleIniciar = async () => {
    setErrorMsg('')
    if (calculo.litros <= 0) {
      setErrorMsg('La cantidad a dosificar debe ser mayor a 0.')
      return
    }

    setLoading(true)
    try {
      const payload = {
        quimico,
        cantidad_g: parseFloat(cantidadGramos),
        tipo,
        descontar_inventario: true,
      }

      const res = await monitoringApi.post('/api/dosificacion/iniciar', payload)
      if (onDosificacionIniciada) {
        onDosificacionIniciada(res.data)
      }
      onClose()
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Error al iniciar la dosificación'
      setErrorMsg(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-[#313D4A] dark:bg-[#24303F] transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera con degradado */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-violet-600/10 via-sky-600/10 to-transparent p-5 dark:border-[#313D4A]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 to-sky-600 text-white shadow-md shadow-violet-500/20">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                Dosificación de Químicos
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Activación de Bomba (Pin 26) y Electroválvula (Pin 25)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-[#313D4A] dark:hover:text-white"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Selector de Modo: Parcial vs Final */}
          <div>
            <label htmlFor={tipoSelectId} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Tipo de Dosificación
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSeleccionarTipo('parcial')}
                className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition-all ${
                  tipo === 'parcial'
                    ? 'border-violet-500 bg-violet-50 text-violet-700 shadow-sm dark:border-violet-400 dark:bg-violet-900/30 dark:text-violet-300'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-[#313D4A] dark:text-slate-400 dark:hover:border-slate-600'
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${tipo === 'parcial' ? 'bg-violet-600' : 'bg-slate-400'}`} />
                Dosificación Parcial
              </button>
              <button
                type="button"
                onClick={() => handleSeleccionarTipo('final')}
                className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition-all ${
                  tipo === 'final'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm dark:border-emerald-400 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-[#313D4A] dark:text-slate-400 dark:hover:border-slate-600'
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${tipo === 'final' ? 'bg-emerald-600' : 'bg-slate-400'}`} />
                Dosificación Final
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
              {tipo === 'parcial'
                ? 'Aplica micro-dosis correctivas durante la jornada según aforo o turbidez.'
                : 'Aplica el saldo remanente diario calculado por el modelo LSTM al cierre.'}
            </p>
          </div>

          {/* Selector de Químico */}
          <div>
            <label htmlFor={quimicoSelectId} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Químico a Dosificar
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { nombre: 'Cloro', sigla: 'Cl', color: 'violet' },
                { nombre: 'Sulfato de Aluminio', sigla: 'Al', color: 'sky' },
                { nombre: 'Sulfato de Cobre', sigla: 'Cu', color: 'teal' },
              ].map((item) => {
                const activo = quimico.toLowerCase().includes(item.sigla.toLowerCase()) || quimico === item.nombre
                return (
                  <button
                    key={item.nombre}
                    type="button"
                    onClick={() => handleSeleccionarQuimico(item.nombre)}
                    className={`flex flex-col items-center justify-center rounded-xl border p-2.5 transition-all ${
                      activo
                        ? 'border-violet-500 bg-violet-50/50 shadow-sm dark:border-violet-400 dark:bg-violet-900/20'
                        : 'border-slate-200 hover:border-slate-300 dark:border-[#313D4A] dark:hover:border-slate-600'
                    }`}
                  >
                    <span className="text-base font-bold text-slate-800 dark:text-white">
                      {item.sigla}
                    </span>
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-full">
                      {item.nombre.replace('Sulfato de ', '')}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Cantidad en Gramos */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor={cantidadInputId} className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Cantidad a Dosificar
              </label>
              {tipo === 'final' && (
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  Saldo LSTM: {getRestante(quimico).toFixed(1)} g
                </span>
              )}
            </div>

            <div className="relative">
              <input
                id={cantidadInputId}
                type="number"
                min="0.1"
                step="0.5"
                value={cantidadGramos}
                onChange={(e) => setCantidadGramos(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 pr-12 text-lg font-bold text-slate-800 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:border-[#313D4A] dark:bg-[#1A222C] dark:text-white"
                placeholder="0"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                gramos
              </span>
            </div>

            {/* Accesos rápidos */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(calculo.esCloro ? [10, 25, 50, 100] : [10, 50, 200, 500, 1000]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setCantidadGramos(g)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-[#313D4A] dark:bg-[#1A222C] dark:text-slate-300 dark:hover:bg-[#2A3444]"
                >
                  +{g}g
                </button>
              ))}
            </div>
          </div>

          {/* TARJETA DE CÁLCULO DE LITROS (REGLA SOLICITADA) */}
          <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/70 via-sky-50/50 to-transparent p-4 dark:border-violet-500/20 dark:bg-violet-950/20">
            <div className="flex items-center justify-between text-xs text-violet-700 dark:text-violet-300 font-semibold mb-2">
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                Fórmula de Conversión Automática
              </span>
              <span className="rounded-md bg-white/80 dark:bg-[#24303F] px-2 py-0.5 text-[10px] font-bold shadow-xs">
                {calculo.regla}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="rounded-xl bg-white/90 p-3 shadow-xs dark:bg-[#1A222C]">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Volumen a Bombear
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-black text-violet-600 dark:text-violet-400">
                    {calculo.litros}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">Litros</span>
                </div>
              </div>

              <div className="rounded-xl bg-white/90 p-3 shadow-xs dark:bg-[#1A222C]">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Pulsos Sensor Flujo
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-black text-sky-600 dark:text-sky-400">
                    {calculo.pulsos}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">pulsos (Pin 27)</span>
                </div>
              </div>
            </div>

            <div className="mt-2.5 text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
              {calculo.esCloro ? (
                <span>
                  Para <strong>Cloro</strong>: ({cantidadGramos}g / 100) × 10 = <strong>{calculo.litros} Litros</strong>
                </span>
              ) : (
                <span>
                  Para <strong>{quimico}</strong>: ({cantidadGramos}g / 1000) × 15 = <strong>{calculo.litros} Litros</strong>
                </span>
              )}
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-xl bg-red-50 p-3 text-xs font-medium text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Pie con botones de acción */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/50 p-5 dark:border-[#313D4A] dark:bg-[#1A222C]">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-[#313D4A]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleIniciar}
            disabled={loading || calculo.litros <= 0}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-violet-500/20 transition-all hover:shadow-lg hover:shadow-violet-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Activando Actuadores…</span>
              </>
            ) : (
              <>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>Activar Dosificación ({calculo.litros} L)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
