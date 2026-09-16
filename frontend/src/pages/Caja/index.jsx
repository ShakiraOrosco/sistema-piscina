import { useState, useEffect, useCallback } from 'react'
import { monitoringApi } from '../../services/api'
import { useAuth } from '../../context/AuthContext'

// ─── Íconos SVG ───────────────────────────────────────────────────────────────
function IconPlus() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
    </svg>
  )
}

function IconTicket() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function IconClock() {
  return (
    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function IconClose() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function IconEye() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  )
}

// ─── Componente Contador con Input Manual ─────────────────────────────────────
function TicketCounter({ label, price, count, onChange, color }) {
  const handleInputChange = (e) => {
    let rawVal = e.target.value
    // Limitar a máximo 2 dígitos en el string
    if (rawVal.length > 2) {
      rawVal = rawVal.slice(0, 2)
    }
    const val = parseInt(rawVal, 10)
    if (isNaN(val) || val < 0) {
      onChange(0)
    } else {
      onChange(Math.min(99, val))
    }
  }

  return (
    <div className={`bg-white rounded-2xl border ${color.border} p-5 flex flex-col justify-between shadow-sm transition-all duration-200 hover:shadow-md`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
          <p className={`text-2xl font-black ${color.text}`}>Bs. {price}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl ${color.bg} flex items-center justify-center`}>
          <IconTicket />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 mt-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, count - 1))}
          className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 font-bold text-xl hover:bg-slate-200 active:scale-95 transition-all flex items-center justify-center"
        >
          -
        </button>
        
        {/* Input directo para escribir la cantidad deseada por teclado (Máximo 99 / 2 dígitos, bloquea 'e', '+', '-') */}
        <input
          type="number"
          min="0"
          max="99"
          value={count === 0 ? '' : count}
          onChange={handleInputChange}
          onKeyDown={(e) => {
            if (['e', 'E', '+', '-', '.'].includes(e.key)) {
              e.preventDefault()
            }
          }}
          onInput={(e) => {
            if (e.target.value.length > 2) {
              e.target.value = e.target.value.slice(0, 2)
            }
          }}
          placeholder="0"
          className="w-16 h-10 text-center font-black text-xl text-slate-800 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
        />

        <button
          type="button"
          onClick={() => onChange(Math.min(99, count + 1))}
          className={`w-10 h-10 rounded-xl ${color.bg} ${color.text} font-bold text-xl hover:opacity-80 active:scale-95 transition-all flex items-center justify-center`}
        >
          +
        </button>
      </div>
    </div>
  )
}

// ─── Fila de historial ────────────────────────────────────────────────────────
function HistorialRow({ registro, index, onVerDetalle }) {
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
      <td className="px-5 py-4 text-sm text-slate-700 font-semibold whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <IconClock />
          {horaStr}
        </div>
      </td>
      <td className="px-5 py-4 text-center">
        <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm font-bold border border-blue-100">
          {registro.total_personas} pers.
        </span>
      </td>
      <td className="px-5 py-4 text-right font-black text-slate-800 text-base">
        Bs. {parseFloat(registro.total_recaudado).toFixed(2)}
      </td>
      <td className="px-5 py-4 text-center">
        <button
          onClick={() => onVerDetalle(registro)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 font-bold text-xs transition-all border border-slate-200 hover:border-blue-200"
        >
          <IconEye />
          Ver Detalle
        </button>
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
  const [notification, setNotification] = useState(null)
  const [loadingHistorial, setLoadingHistorial] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [registroDetalle, setRegistroDetalle] = useState(null)

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
      if (data.registros) setHistorial(data.registros)
      if (data.resumen) setResumen(data.resumen)
    } catch {
      setNotification({ type: 'error', msg: 'No se pudo cargar el historial de la jornada' })
    } finally {
      setLoadingHistorial(false)
    }
  }, [])

  useEffect(() => {
    fetchHistorial()
  }, [fetchHistorial])

  const totalPersonas = tarifa15 + tarifa20
  const totalRecaudado = tarifa15 * 15 + tarifa20 * 20

  const handleRegister = async (e) => {
    e.preventDefault()
    if (totalPersonas === 0) {
      setNotification({ type: 'error', msg: 'Debe ingresar al menos 1 persona' })
      return
    }

    setLoading(true)
    try {
      await monitoringApi.post('/api/caja/registro', {
        cantidad_tarifa_15: tarifa15,
        cantidad_tarifa_20: tarifa20,
        id_usuario: session?.usuario?.id_usuario || null,
        observaciones: observaciones.trim() || null,
      })
      setNotification({ type: 'success', msg: `✓ Registrado: ${totalPersonas} persona(s) — Bs. ${totalRecaudado.toFixed(2)}` })
      setTarifa15(0)
      setTarifa20(0)
      setObservaciones('')
      setShowModal(false)
      fetchHistorial()
    } catch (err) {
      const msg = err.response?.data?.detail || 'Error al registrar entrada'
      setNotification({ type: 'error', msg: `✗ ${msg}` })
    } finally {
      setLoading(false)
      setTimeout(() => setNotification(null), 4000)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* ── Header de página ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-6 shadow-sm">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-widest uppercase text-blue-500 mb-1">Módulo de Caja</p>
            <h1 className="text-2xl font-bold text-slate-800">Control de Ingresos y Aforo</h1>
            <p className="text-sm text-slate-500 mt-0.5">Registro de taquilla e historial diario</p>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl font-bold text-sm shadow-md shadow-blue-500/20 active:scale-95 transition-all"
            >
              <IconPlus />
              Registrar Ingreso
            </button>
          </div>
        </div>
      </div>

      {/* ── Notificación ── */}
      {notification && (
        <div className={`max-w-6xl mx-auto px-4 py-3 mt-4 rounded-xl font-semibold text-sm flex items-center gap-3 shadow-md
          ${notification.type === 'success'
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
            : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {notification.type === 'success' ? <IconCheck /> : '⚠'}
          {notification.msg}
        </div>
      )}

      {/* ── Resumen superior de Caja ── */}
      <div className="max-w-6xl mx-auto px-6 mt-6 grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Personas Hoy</p>
          <h3 className="text-3xl font-black text-slate-800 mt-2">{resumen?.total_personas ?? 0}</h3>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-blue-500">Tarifa 15 Bs</p>
          <h3 className="text-3xl font-black text-blue-600 mt-2">{resumen?.total_tarifa_15 ?? 0} <span className="text-sm font-semibold text-slate-400">pers.</span></h3>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-500">Tarifa 20 Bs</p>
          <h3 className="text-3xl font-black text-emerald-600 mt-2">{resumen?.total_tarifa_20 ?? 0} <span className="text-sm font-semibold text-slate-400">pers.</span></h3>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white p-5 rounded-2xl shadow-md">
          <p className="text-xs font-bold uppercase tracking-wider opacity-80">Total Recaudado</p>
          <h3 className="text-3xl font-black mt-2">Bs. {parseFloat(resumen?.total_recaudado ?? 0).toFixed(2)}</h3>
        </div>
      </div>

      {/* ── Tabla Principal de Registros del Día ── */}
      <div className="max-w-6xl mx-auto px-6 mt-8">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
              <h2 className="font-bold text-lg text-slate-800">Registros de Ingreso del Día</h2>
            </div>
            <span className="text-sm font-semibold text-slate-400">{historial.length} registro(s)</span>
          </div>

          {loadingHistorial ? (
            <div className="flex items-center justify-center py-16">
              <svg className="animate-spin w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            </div>
          ) : historial.length === 0 ? (
            <div className="text-center py-16">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mx-auto mb-4 text-slate-400">
                <IconTicket />
              </div>
              <p className="text-slate-700 font-bold">Sin registros de taquilla en esta jornada</p>
              <p className="text-slate-400 text-sm mt-1">Haz clic en &quot;+ Registrar Ingreso&quot; para añadir bañistas</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400">Hora</th>
                    <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400 text-center">Total Personas</th>
                    <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400 text-right">Monto Recaudado</th>
                    <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {historial.map((reg, i) => (
                    <HistorialRow key={reg.id_registro} registro={reg} index={i} onVerDetalle={setRegistroDetalle} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL PARA REGISTRAR INGRESO (z-[9999] PARA EVITAR TRASLAPES) ── */}
      {showModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 relative max-h-[90vh] overflow-y-auto">
            
            {/* Header Modal */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Registrar Nuevo Ingreso</h3>
                <p className="text-xs text-slate-400">Selecciona o escribe la cantidad de entradas vendidas</p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-all"
              >
                <IconClose />
              </button>
            </div>

            <form onSubmit={handleRegister} className="space-y-6">
              {/* Contadores con entrada de texto/número */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TicketCounter
                  label="Tarifa 15 Bs"
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
                  label="Tarifa 20 Bs"
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

              {/* Combos Rápidos */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Atajos Rápidos</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: '1 adulto', t15: 0, t20: 1 },
                    { label: '1 niño', t15: 1, t20: 0 },
                    { label: 'Pareja (2×20)', t15: 0, t20: 2 },
                    { label: 'Familia (2×20 + 2×15)', t15: 2, t20: 2 },
                  ].map(({ label, t15, t20 }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => { setTarifa15(t15); setTarifa20(t20) }}
                      className="px-3 py-2 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 text-xs font-semibold text-slate-600 text-center transition-all"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Observaciones */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Observaciones (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Grupo escolar, pago con QR, etc."
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              {/* Total y Botón */}
              <div className="bg-slate-50 p-4 rounded-2xl flex items-center justify-between border border-slate-200/60">
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase">Total a pagar</p>
                  <p className="text-2xl font-black text-emerald-600">Bs. {totalRecaudado.toFixed(2)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400 font-bold uppercase">Personas</p>
                  <p className="text-xl font-bold text-slate-700">{totalPersonas} pers.</p>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="w-1/3 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-100 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading || totalPersonas === 0}
                  className="w-2/3 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? 'Guardando...' : 'Confirmar e Inscribir'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL PARA VER DETALLES DE REGISTRO ── */}
      {registroDetalle && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Detalles del Registro</h3>
                <p className="text-xs text-slate-400">
                  Hora: {typeof registroDetalle.hora_entrada === 'string' && registroDetalle.hora_entrada.includes('T') ? registroDetalle.hora_entrada.split('T')[1].substring(0, 8) : '—'}
                </p>
              </div>
              <button
                onClick={() => setRegistroDetalle(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-all"
              >
                <IconClose />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50/70 border border-blue-100">
                <span className="text-sm font-semibold text-blue-700">Entradas 15 Bs</span>
                <span className="font-bold text-base text-blue-800">{registroDetalle.cantidad_tarifa_15} personas</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/70 border border-emerald-100">
                <span className="text-sm font-semibold text-emerald-700">Entradas 20 Bs</span>
                <span className="font-bold text-base text-emerald-800">{registroDetalle.cantidad_tarifa_20} personas</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-sm font-semibold text-slate-600">Total Personas</span>
                <span className="font-bold text-base text-slate-800">{registroDetalle.total_personas} pers.</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 text-white">
                <span className="text-sm font-semibold">Total Recaudado</span>
                <span className="font-black text-lg">Bs. {parseFloat(registroDetalle.total_recaudado).toFixed(2)}</span>
              </div>

              <div className="pt-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Observaciones</p>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 italic">
                  {registroDetalle.observaciones || 'Sin observaciones registradas'}
                </div>
              </div>
            </div>

            <button
              onClick={() => setRegistroDetalle(null)}
              className="w-full mt-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm transition-all"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

