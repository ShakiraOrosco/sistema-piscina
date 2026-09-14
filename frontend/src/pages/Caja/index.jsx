import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { monitoringApi } from '../../services/api'

// ─── Íconos ──────────────────────────────────────────────────────────────────
const IconTicket = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
  </svg>
)
const IconUsers = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
)
const IconMoney = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)
const IconClock = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)
const IconCheck = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

// ─── Contador de Boletos ──────────────────────────────────────────────────────
function TicketCounter({ label, price, color, count, onChange }) {
  return (
    <div className={`rounded-2xl border-2 ${color.border} bg-white p-6 flex flex-col gap-4 shadow-sm`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold tracking-widest uppercase text-slate-400">{label}</p>
          <p className={`text-3xl font-black mt-1 ${color.text}`}>Bs. {price}</p>
        </div>
        <div className={`flex items-center justify-center w-14 h-14 rounded-xl ${color.bg}`}>
          <IconTicket />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <button
          id={`btn-decrease-${price}`}
          onClick={() => onChange(Math.max(0, count - 1))}
          className={`w-12 h-12 rounded-xl text-2xl font-bold border-2 ${color.border} ${color.text} hover:${color.bg} transition-all duration-200 flex items-center justify-center`}
          disabled={count === 0}
          style={{ opacity: count === 0 ? 0.3 : 1 }}
        >
          −
        </button>

        <div className="flex-1 text-center">
          <span className={`text-5xl font-black tabular-nums ${color.text}`}>{count}</span>
          <p className="text-xs text-slate-400 mt-1">personas</p>
        </div>

        <button
          id={`btn-increase-${price}`}
          onClick={() => onChange(count + 1)}
          className={`w-12 h-12 rounded-xl text-2xl font-bold ${color.bg} ${color.text} border-2 ${color.border} hover:opacity-80 transition-all duration-200 flex items-center justify-center`}
        >
          +
        </button>
      </div>

      <div className={`text-center py-2 rounded-lg ${color.bg}`}>
        <span className={`text-sm font-bold ${color.text}`}>
          Subtotal: Bs. {(count * price).toFixed(2)}
        </span>
      </div>
    </div>
  )
}

// ─── Fila de historial ────────────────────────────────────────────────────────
function HistorialRow({ registro, index }) {
  let horaStr = '—'
  if (registro.hora_entrada) {
    if (typeof registro.hora_entrada === 'string' && registro.hora_entrada.includes('T')) {
      horaStr = registro.hora_entrada.split('T')[1].substring(0, 8)
    } else {
      horaStr = new Date(registro.hora_entrada).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    }
  }

  return (
    <tr className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
      <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <IconClock />
          {horaStr}
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
          {registro.cantidad_tarifa_15} × 15
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
          {registro.cantidad_tarifa_20} × 20
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-200 text-slate-700 text-sm font-bold">
          {registro.total_personas}
        </span>
      </td>
      <td className="px-4 py-3 text-right font-bold text-slate-800">
        Bs. {parseFloat(registro.total_recaudado).toFixed(2)}
      </td>
    </tr>
  )
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function CajaPage() {
  const { session } = useAuth()
  const [tarifa15, setTarifa15] = useState(0)
  const [tarifa20, setTarifa20] = useState(0)
  const [observaciones, setObservaciones] = useState('')
  const [loading, setLoading] = useState(false)
  const [historial, setHistorial] = useState([])
  const [resumen, setResumen] = useState(null)
  const [notification, setNotification] = useState(null) // { type: 'success'|'error', msg }
  const [loadingHistorial, setLoadingHistorial] = useState(true)

  // Hora actual en tiempo real
  const [horaActual, setHoraActual] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setHoraActual(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const fetchHistorial = useCallback(async () => {
    try {
      setLoadingHistorial(true)
      const { data } = await monitoringApi.get('/api/caja/historial')
      setHistorial(data.registros || [])
      setResumen(data.resumen || null)
    } catch (e) {
      console.error('Error cargando historial:', e)
    } finally {
      setLoadingHistorial(false)
    }
  }, [])

  useEffect(() => {
    fetchHistorial()
  }, [fetchHistorial])

  const totalPersonas = tarifa15 + tarifa20
  const totalRecaudado = tarifa15 * 15 + tarifa20 * 20

  const handleRegistrar = async () => {
    if (totalPersonas === 0) return
    setLoading(true)
    try {
      await monitoringApi.post('/api/caja/registro', {
        cantidad_tarifa_15: tarifa15,
        cantidad_tarifa_20: tarifa20,
        id_usuario: session?.usuario?.id_usuario || null,
        observaciones: observaciones.trim() || null,
      })
      setNotification({ type: 'success', msg: `✓ ${totalPersonas} persona(s) registrada(s) — Bs. ${totalRecaudado.toFixed(2)} recaudado` })
      setTarifa15(0)
      setTarifa20(0)
      setObservaciones('')
      fetchHistorial()
    } catch (e) {
      const msg = e.response?.data?.detail || 'Error al registrar entrada'
      setNotification({ type: 'error', msg: `✗ ${msg}` })
    } finally {
      setLoading(false)
      setTimeout(() => setNotification(null), 4000)
    }
  }

  const handleReset = () => {
    setTarifa15(0)
    setTarifa20(0)
    setObservaciones('')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Header de página ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs font-bold tracking-widest uppercase text-blue-500 mb-1">Módulo de Caja</p>
            <h1 className="text-2xl font-bold text-slate-800">Control de Ingresos</h1>
            <p className="text-sm text-slate-400 mt-0.5">Registro de entrada de bañistas a la piscina</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-black tabular-nums text-slate-800">
              {horaActual.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
            <p className="text-xs text-slate-400 mt-0.5 capitalize">
              {horaActual.toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
        </div>
      </div>

      {/* ── Notificación ── */}
      {notification && (
        <div className={`mx-6 mt-4 max-w-6xl mx-auto px-4 py-3 rounded-xl font-semibold text-sm flex items-center gap-3 shadow-md
          ${notification.type === 'success'
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
            : 'bg-red-50 border border-red-200 text-red-700'
          }`}
          style={{ maxWidth: 'calc(100% - 3rem)', margin: '1rem 1.5rem 0' }}
        >
          {notification.type === 'success' ? <IconCheck /> : '⚠'}
          {notification.msg}
        </div>
      )}

      <div className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Panel izquierdo: Registro ── */}
        <div className="lg:col-span-2 flex flex-col gap-5">

          {/* Tarjetas de tipo de entrada */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TicketCounter
              label="Tarifa Estándar"
              price={15}
              count={tarifa15}
              onChange={setTarifa15}
              color={{
                border: 'border-blue-200',
                text: 'text-blue-600',
                bg: 'bg-blue-50',
              }}
            />
            <TicketCounter
              label="Tarifa Especial"
              price={20}
              count={tarifa20}
              onChange={setTarifa20}
              color={{
                border: 'border-emerald-200',
                text: 'text-emerald-600',
                bg: 'bg-emerald-50',
              }}
            />
          </div>

          {/* Resumen de transacción actual */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4">Resumen de esta transacción</h2>
            <div className="grid grid-cols-3 gap-4 mb-5">
              <div className="text-center p-4 rounded-xl bg-slate-50">
                <p className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">Personas</p>
                <p className="text-4xl font-black text-slate-700">{totalPersonas}</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-blue-50">
                <p className="text-xs text-blue-400 uppercase font-bold tracking-wider mb-1">Tarifa 15</p>
                <p className="text-4xl font-black text-blue-600">{tarifa15}</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-emerald-50">
                <p className="text-xs text-emerald-400 uppercase font-bold tracking-wider mb-1">Tarifa 20</p>
                <p className="text-4xl font-black text-emerald-600">{tarifa20}</p>
              </div>
            </div>

            {/* Total a cobrar */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white mb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider opacity-75">Total a cobrar</p>
                <p className="text-4xl font-black mt-1">Bs. {totalRecaudado.toFixed(2)}</p>
              </div>
              <div className="opacity-30 text-6xl">Bs.</div>
            </div>

            {/* Observaciones */}
            <div className="mb-4">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Observaciones (opcional)
              </label>
              <input
                id="input-observaciones"
                type="text"
                value={observaciones}
                onChange={e => setObservaciones(e.target.value)}
                placeholder="Ej: grupo escolar, evento especial..."
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent"
              />
            </div>

            {/* Botones de acción */}
            <div className="flex gap-3">
              <button
                id="btn-reset"
                onClick={handleReset}
                className="px-5 py-3 rounded-xl border-2 border-slate-200 text-slate-500 font-bold text-sm hover:bg-slate-50 transition-colors duration-200"
              >
                Limpiar
              </button>
              <button
                id="btn-registrar"
                onClick={handleRegistrar}
                disabled={totalPersonas === 0 || loading}
                className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md shadow-blue-200"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Registrando...
                  </>
                ) : (
                  <>
                    <IconCheck />
                    Registrar Ingreso ({totalPersonas} persona{totalPersonas !== 1 ? 's' : ''})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ── Panel derecho: Resumen del día ── */}
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-slate-600">
                <IconMoney />
              </div>
              <h2 className="font-bold text-slate-700 text-sm">Resumen de Hoy</h2>
            </div>

            {resumen ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                    <span className="text-xs text-slate-500">Total personas</span>
                  </div>
                  <span className="font-black text-xl text-slate-800">{resumen.total_personas ?? 0}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                    <span className="text-xs text-slate-500">Tarifa 15 Bs</span>
                  </div>
                  <span className="font-bold text-blue-600">{resumen.total_tarifa_15 ?? 0} personas</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <span className="text-xs text-slate-500">Tarifa 20 Bs</span>
                  </div>
                  <span className="font-bold text-emerald-600">{resumen.total_tarifa_20 ?? 0} personas</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-violet-400"></span>
                    <span className="text-xs text-slate-500">Registros</span>
                  </div>
                  <span className="font-bold text-slate-600">{resumen.cantidad_registros ?? 0}</span>
                </div>

                <div className="mt-3 p-4 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white text-center">
                  <p className="text-xs font-bold opacity-75 uppercase tracking-wider mb-1">Caja del día</p>
                  <p className="text-3xl font-black">Bs. {parseFloat(resumen.total_recaudado ?? 0).toFixed(2)}</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-slate-100 mx-auto mb-3">
                  <IconUsers />
                </div>
                <p className="text-sm">Sin registros hoy</p>
              </div>
            )}
          </div>

          {/* Atajos rápidos */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Combos rápidos</h3>
            <div className="space-y-2">
              {[
                { label: '1 adulto', t15: 0, t20: 1 },
                { label: '1 niño', t15: 1, t20: 0 },
                { label: 'Pareja (2×20)', t15: 0, t20: 2 },
                { label: 'Familia (2×20 + 2×15)', t15: 2, t20: 2 },
              ].map(({ label, t15, t20 }) => (
                <button
                  key={label}
                  id={`btn-combo-${label.replace(/\s+/g, '-').toLowerCase()}`}
                  onClick={() => { setTarifa15(t15); setTarifa20(t20) }}
                  className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-slate-100 hover:bg-blue-50 hover:border-blue-200 transition-all duration-200 text-left group"
                >
                  <span className="text-sm text-slate-600 font-medium group-hover:text-blue-700">{label}</span>
                  <span className="text-xs font-bold text-slate-400 group-hover:text-blue-500">
                    Bs. {(t15 * 15 + t20 * 20).toFixed(0)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Historial del día ── */}
      <div className="max-w-6xl mx-auto px-6 pb-10">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <h2 className="font-bold text-slate-700">Historial de hoy</h2>
            </div>
            <span className="text-xs text-slate-400">{historial.length} registro(s)</span>
          </div>

          {loadingHistorial ? (
            <div className="flex items-center justify-center py-16">
              <svg className="animate-spin w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            </div>
          ) : historial.length === 0 ? (
            <div className="text-center py-16">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mx-auto mb-4">
                <IconTicket />
              </div>
              <p className="text-slate-500 font-medium">Sin registros en esta jornada</p>
              <p className="text-slate-400 text-sm mt-1">Los ingresos que registres aparecerán aquí</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400">Hora</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400 text-center">Tarifa 15</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400 text-center">Tarifa 20</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400 text-center">Total</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400 text-right">Recaudado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {historial.map((reg, i) => (
                    <HistorialRow key={reg.id_registro} registro={reg} index={i} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
