import { useEffect, useRef, useState } from 'react'
import DosificacionModal, { calcularLitrosSolucion, obtenerDetalleQuimico } from '../DosificacionModal'

// Rangos máximos que usa el servicio LSTM (np.clip) para escalar las barras
const QUIMICOS = [
  {
    key: 'aluminio_pred',
    nombre: 'Sulfato de Aluminio',
    simbolo: 'Al',
    max: 1000,
    gradient: 'from-sky-400 to-blue-600',
    soft: 'bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-300',
    desc: 'Floculante · Solo dosificación final al cierre',
    dosisParcialSugerida: 100,
    solamenteFinal: true,
  },
  {
    key: 'cobre_pred',
    nombre: 'Sulfato de Cobre',
    simbolo: 'Cu',
    max: 1000,
    gradient: 'from-teal-400 to-emerald-600',
    soft: 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-300',
    desc: 'Alguicida · controla algas',
    dosisParcialSugerida: 5,
    solamenteFinal: false,
  },
  {
    key: 'cloro_pred',
    nombre: 'Cloro',
    simbolo: 'Cl',
    max: 200,
    gradient: 'from-violet-400 to-fuchsia-600',
    soft: 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300',
    desc: 'Desinfectante · elimina bacterias',
    dosisParcialSugerida: 25,
    solamenteFinal: false,
  },
]

export default function PrediccionPanel({ prediccion, detalle, dosisAplicadas, onPredecir, onDosificar }) {
  const [prediciendo, setPrediciendo] = useState(false)
  const [destello, setDestello] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalConfig, setModalConfig] = useState({
    quimico: 'Cloro',
    cantidad: 25,
    tipo: 'parcial',
  })
  const [modalSessionId, setModalSessionId] = useState(1)

  const ultimaFecha = useRef(prediccion?.fecha_prediccion)

  // Micro-animación cuando llega una predicción nueva
  useEffect(() => {
    const fecha = prediccion?.fecha_prediccion
    if (fecha && ultimaFecha.current && fecha !== ultimaFecha.current) {
      setDestello(true)
      const t = window.setTimeout(() => setDestello(false), 1400)
      ultimaFecha.current = fecha
      return () => window.clearTimeout(t)
    }
    ultimaFecha.current = fecha
  }, [prediccion?.fecha_prediccion])

  const handlePredecir = async () => {
    if (!onPredecir) return
    setPrediciendo(true)
    try {
      await onPredecir()
    } finally {
      setPrediciendo(false)
    }
  }

  const abrirModalDosificacion = (quimicoNombre, cantidadG, tipoDosif = 'parcial') => {
    setModalConfig({
      quimico: quimicoNombre,
      cantidad: cantidadG,
      tipo: tipoDosif,
    })
    setModalSessionId((prev) => prev + 1)
    setModalOpen(true)
  }

  const capturadas = detalle?.franjas_capturadas ?? 0
  const esFinal = detalle?.tipo === 'final'

  return (
    <section
      id="panel-prediccion-lstm"
      className={`relative mt-6 overflow-hidden rounded-2xl border bg-white dark:bg-[#24303F] p-7 shadow-sm transition-all duration-700 ${
        destello
          ? 'border-violet-400 ring-4 ring-violet-400/25'
          : 'border-slate-200 dark:border-[#313D4A]'
      }`}
    >
      {/* Halo decorativo */}
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-gradient-to-br from-violet-500/15 via-sky-400/10 to-transparent blur-2xl" />

      {/* Encabezado */}
      <div className="relative mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 text-white shadow-md shadow-violet-500/30">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9.5 2A2.5 2.5 0 0 0 7 4.5v.6A3 3 0 0 0 4.5 8a3 3 0 0 0 .4 1.5A3 3 0 0 0 3 12.3a3 3 0 0 0 2 2.8V16a3 3 0 0 0 3 3h.5a2.5 2.5 0 0 0 5 0V4.5A2.5 2.5 0 0 0 9.5 2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M14.5 2A2.5 2.5 0 0 1 17 4.5v.6A3 3 0 0 1 19.5 8a3 3 0 0 1-.4 1.5 3 3 0 0 1 1.9 2.8 3 3 0 0 1-2 2.8V16a3 3 0 0 1-3 3h-.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h4 className="text-xl font-bold text-slate-800 dark:text-white">
              Predicción y Dosificación de Químicos
            </h4>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Modelo LSTM · Activación de Bomba (Pin 26) y Electroválvula (Pin 25)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span
            id="badge-tipo-prediccion"
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              esFinal
                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${esFinal ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
            {esFinal ? 'Final' : 'Parcial'} · {capturadas}/3 franjas
          </span>

          {/* Botón de Dosificación Final */}
          <button
            type="button"
            id="btn-dosificacion-final"
            onClick={() => abrirModalDosificacion('Cloro', 50, 'final')}
            className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-50 px-3.5 py-2 text-sm font-semibold text-emerald-700 shadow-sm transition-all hover:bg-emerald-100 hover:shadow-md dark:border-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            <span>Dosificación Final</span>
          </button>

          <button
            id="btn-predecir-ahora"
            onClick={handlePredecir}
            disabled={prediciendo}
            className="group flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-violet-500/25 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-violet-500/30 disabled:cursor-wait disabled:opacity-70"
          >
            <svg
              className={`h-4 w-4 ${prediciendo ? 'animate-spin' : 'transition-transform group-hover:rotate-180'}`}
              viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M4 4v5h5M20 20v-5h-5M5.6 15a7 7 0 0 0 12.3 2.4M18.4 9A7 7 0 0 0 6.1 6.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {prediciendo ? 'Calculando…' : 'Predecir ahora'}
          </button>
        </div>
      </div>

      <div className="relative grid grid-cols-1 gap-6">
        {/* Tarjetas de químicos */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {QUIMICOS.map((q) => {
            const info = obtenerDetalleQuimico(q.nombre, prediccion, dosisAplicadas)
            const valorTotal = info.totalRecomendado
            const aplicado = info.aplicado
            const restante = info.restante
            const completado = info.completado
            const tiene = prediccion?.[q.key] !== null && prediccion?.[q.key] !== undefined

            const pctAplicado = tiene && valorTotal > 0 ? Math.min(100, (aplicado / valorTotal) * 100) : 0

            // Cantidad sugerida para la dosis parcial (no mayor al restante)
            const dosisSugerida = Math.min(q.dosisParcialSugerida, restante > 0 ? restante : q.dosisParcialSugerida)
            const calculoPreview = calcularLitrosSolucion(q.nombre, dosisSugerida)

            return (
              <div
                key={q.key}
                id={`card-pred-${q.simbolo.toLowerCase()}`}
                className={`group flex flex-col justify-between rounded-2xl border p-5 transition-all hover:-translate-y-0.5 hover:shadow-md ${
                  completado
                    ? 'border-emerald-300 dark:border-emerald-700/50 bg-emerald-50/25 dark:bg-[#1A222C]'
                    : 'border-slate-200 dark:border-[#313D4A] bg-slate-50/60 dark:bg-[#1A222C]'
                }`}
              >
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold ${q.soft}`}>
                      {q.simbolo}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      máx {q.max} g
                    </span>
                  </div>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{q.nombre}</span>
                  <div className="mt-1 flex items-end gap-2">
                    <h5 className="text-3xl font-bold text-slate-800 dark:text-white">
                      {tiene ? restante.toFixed(0) : '—'}
                      <span className="ml-1 text-sm font-medium text-slate-500 dark:text-slate-400">g</span>
                    </h5>
                    {completado ? (
                      <span className="mb-1 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full">
                        ✓ 100% Completado
                      </span>
                    ) : aplicado > 0 ? (
                      <span className="mb-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full">
                        Restante (de {valorTotal.toFixed(0)}g)
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-[10px] font-medium text-slate-500">
                    <span>Aplicado: {aplicado.toFixed(1)}g</span>
                    <span>Total: {tiene ? valorTotal.toFixed(1) : '0'}g</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${q.gradient} transition-[width] duration-1000 ease-out`}
                      style={{ width: `${pctAplicado}%` }}
                    />
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
                    <span>Regla: {q.nombre === 'Cloro' ? '100g = 10L' : '1000g = 50L'}</span>
                    <span className="font-semibold text-slate-600 dark:text-slate-300">
                      {completado ? 'Completado' : q.solamenteFinal ? `${restante.toFixed(0)}g (Final) → ${calcularLitrosSolucion(q.nombre, restante).litros}L` : `${dosisSugerida.toFixed(1)}g → ${calculoPreview.litros}L`}
                    </span>
                  </div>

                  {/* Botón de Dosificación con bloqueo si ya fue completado o modo solo final */}
                  {completado ? (
                    <button
                      type="button"
                      disabled
                      className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-100 dark:bg-[#1A222C] border border-slate-200 dark:border-[#313D4A] py-2 px-3 text-xs font-semibold text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-75"
                    >
                      <svg className="h-4 w-4 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Dosis Diaria Completada (0g rest.)</span>
                    </button>
                  ) : q.solamenteFinal ? (
                    <button
                      type="button"
                      onClick={() => abrirModalDosificacion(q.nombre, Number(restante.toFixed(1)), 'final')}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white font-bold py-2 px-3 text-xs shadow-md shadow-sky-500/20 transition-all hover:from-sky-600 hover:to-blue-700 hover:shadow-lg"
                    >
                      <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                      </svg>
                      <span>Dosificación Final {restante.toFixed(0)}g ({calcularLitrosSolucion(q.nombre, restante).litros} L)</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => abrirModalDosificacion(q.nombre, Number(dosisSugerida.toFixed(1)), 'parcial')}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white dark:bg-[#24303F] border border-slate-200 dark:border-[#313D4A] py-2 px-3 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-xs transition-all hover:border-violet-500 hover:text-violet-600 dark:hover:border-violet-400 dark:hover:text-violet-300 hover:shadow-sm"
                    >
                      <svg className="h-3.5 w-3.5 text-violet-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span>Dosificar {dosisSugerida.toFixed(1)}g ({calculoPreview.litros} L)</span>
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Modal interactivo de dosificación */}
      <DosificacionModal
        key={modalSessionId}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        quimicoInicial={modalConfig.quimico}
        cantidadInicial={modalConfig.cantidad}
        tipoInicial={modalConfig.tipo}
        prediccion={prediccion}
        dosisAplicadas={dosisAplicadas}
        onDosificacionIniciada={() => {
          if (onDosificar) onDosificar()
        }}
      />
    </section>
  )
}
