import { useEffect, useRef, useState } from 'react'

// Rangos máximos que usa el servicio LSTM (np.clip) para escalar las barras
const QUIMICOS = [
  {
    key: 'aluminio_pred',
    nombre: 'Sulfato de Aluminio',
    simbolo: 'Al',
    max: 1000,
    gradient: 'from-sky-400 to-blue-600',
    soft: 'bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-300',
    desc: 'Floculante · clarifica el agua',
  },
  {
    key: 'cobre_pred',
    nombre: 'Sulfato de Cobre',
    simbolo: 'Cu',
    max: 1000,
    gradient: 'from-teal-400 to-emerald-600',
    soft: 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-300',
    desc: 'Alguicida · controla algas',
  },
  {
    key: 'cloro_pred',
    nombre: 'Cloro',
    simbolo: 'Cl',
    max: 200,
    gradient: 'from-violet-400 to-fuchsia-600',
    soft: 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300',
    desc: 'Desinfectante · elimina bacterias',
  },
]

const FRANJAS_BASE = ['08:00', '12:00', '16:00']

export default function PrediccionPanel({ prediccion, detalle, dosisAplicadas, onPredecir }) {
  const [prediciendo, setPrediciendo] = useState(false)
  const [destello, setDestello] = useState(false)
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

  const franjas = detalle?.franjas?.length
    ? detalle.franjas
    : FRANJAS_BASE.map((hora) => ({ hora, capturada: false }))
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
              Predicción de dosificación
            </h4>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Modelo LSTM · Presupuesto de químicos del día
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
            const valorTotal = prediccion?.[q.key]
            const tiene = valorTotal !== null && valorTotal !== undefined
            
            const nombreQuimicoKey = q.nombre.toLowerCase()
            const aplicado = dosisAplicadas?.[nombreQuimicoKey] || 0
            const restante = tiene ? Math.max(0, Number(valorTotal) - aplicado) : 0
            
            const pctAplicado = tiene && Number(valorTotal) > 0 ? Math.min(100, (aplicado / Number(valorTotal)) * 100) : 0
            
            return (
              <div
                key={q.key}
                id={`card-pred-${q.simbolo.toLowerCase()}`}
                className="group flex flex-col justify-between rounded-2xl border border-slate-200 dark:border-[#313D4A] bg-slate-50/60 dark:bg-[#1A222C] p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
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
                    {aplicado > 0 && (
                      <span className="mb-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full">
                        Restante (de {Number(valorTotal).toFixed(0)}g)
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-[10px] font-medium text-slate-500">
                    <span>Aplicado: {aplicado.toFixed(1)}g</span>
                    <span>Total: {tiene ? Number(valorTotal).toFixed(1) : '0'}g</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${q.gradient} transition-[width] duration-1000 ease-out`}
                      style={{ width: `${pctAplicado}%` }}
                    />
                  </div>
                  <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">{q.desc}</p>
                </div>
              </div>
            )
          })}
        </div>

      </div>
    </section>
  )
}

function Dato({ etiqueta, valor }) {
  return (
    <div className="rounded-lg bg-slate-50 dark:bg-[#1A222C] px-2 py-1.5">
      <div className="text-slate-400">{etiqueta}</div>
      <div className="font-semibold text-slate-700 dark:text-slate-200">{valor}</div>
    </div>
  )
}

function fmt(v, d = 2) {
  return v === null || v === undefined ? '—' : Number(v).toFixed(d)
}

function formatHora(value) {
  if (!value) return '—'
  if (typeof value === 'string' && value.includes('T')) {
    const t = value.split('T')[1]
    if (t) return t.substring(0, 5)
  }
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}
