import { useState, useEffect, useCallback } from 'react'
import api from '../../services/api'
import { useAuth } from '../../context/AuthContext'

export default function InventarioPage() {
  const { session } = useAuth()
  const [quimicos, setQuimicos] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCompraModal, setShowCompraModal] = useState(false)
  const [showQuimicoModal, setShowQuimicoModal] = useState(false)

  // Form compra
  const [selectedQuimico, setSelectedQuimico] = useState('')
  const [cantidadCompra, setCantidadCompra] = useState('')
  const [observacionesCompra, setObservacionesCompra] = useState('')
  const [savingCompra, setSavingCompra] = useState(false)

  // Form nuevo químico
  const [nombreQuimico, setNombreQuimico] = useState('')
  const [siglaQuimico, setSiglaQuimico] = useState('')
  const [unidadMedida, setUnidadMedida] = useState('g')
  const [stockInicial, setStockInicial] = useState('0')
  const [stockMinimo, setStockMinimo] = useState('1000')
  const [savingQuimico, setSavingQuimico] = useState(false)

  const [notification, setNotification] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: qData }, { data: mData }] = await Promise.all([
        api.get('/inventario/quimicos'),
        api.get('/inventario/movimientos'),
      ])
      setQuimicos(qData)
      setMovimientos(mData)
    } catch {
      setNotification({ type: 'error', msg: 'Error al cargar los datos del inventario' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleRegistrarCompra = async (e) => {
    e.preventDefault()
    if (!selectedQuimico || !cantidadCompra || parseFloat(cantidadCompra) <= 0) {
      setNotification({ type: 'error', msg: 'Seleccione un químico e ingrese una cantidad válida' })
      return
    }

    setSavingCompra(true)
    try {
      const { data } = await api.post('/inventario/compras', {
        sigla_quimico: selectedQuimico,
        cantidad: parseFloat(cantidadCompra),
        observaciones: observacionesCompra.trim() || null,
        id_usuario: session?.usuario?.id_usuario || null,
      })
      setNotification({ type: 'success', msg: `✓ ${data.mensaje}` })
      setShowCompraModal(false)
      setSelectedQuimico('')
      setCantidadCompra('')
      setObservacionesCompra('')
      fetchData()
    } catch (err) {
      const msg = err.response?.data?.detail || 'Error al registrar la compra'
      setNotification({ type: 'error', msg: `✗ ${msg}` })
    } finally {
      setSavingCompra(false)
      setTimeout(() => setNotification(null), 4000)
    }
  }

  const handleCrearQuimico = async (e) => {
    e.preventDefault()
    if (!nombreQuimico || !siglaQuimico || !unidadMedida) {
      setNotification({ type: 'error', msg: 'Complete todos los campos requeridos' })
      return
    }

    setSavingQuimico(true)
    try {
      const { data } = await api.post('/inventario/quimicos', {
        nombre: nombreQuimico,
        sigla: siglaQuimico,
        unidad_medida: unidadMedida,
        stock_actual: parseFloat(stockInicial) || 0,
        stock_minimo: parseFloat(stockMinimo) || 0,
      })
      setNotification({ type: 'success', msg: `✓ ${data.mensaje}` })
      setShowQuimicoModal(false)
      setNombreQuimico('')
      setSiglaQuimico('')
      setUnidadMedida('g')
      setStockInicial('0')
      setStockMinimo('1000')
      fetchData()
    } catch (err) {
      const msg = err.response?.data?.detail || 'Error al registrar el químico'
      setNotification({ type: 'error', msg: `✗ ${msg}` })
    } finally {
      setSavingQuimico(false)
      setTimeout(() => setNotification(null), 4000)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-12 dark:bg-[#1A222C]">
      {/* ── Header ── */}
      <div className="bg-white dark:bg-[#24303F] border-b border-slate-200 dark:border-[#313D4A] px-6 py-6 shadow-sm">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-widest uppercase text-blue-500 mb-1">Módulo Operativo</p>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Inventario de Químicos e Insumos</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Control de existencias y registro de compras</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowQuimicoModal(true)}
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2.5 rounded-xl font-bold text-sm transition-all"
            >
              + Nuevo Químico
            </button>

            <button
              onClick={() => setShowCompraModal(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md shadow-blue-500/20 active:scale-95 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              Registrar Compra
            </button>
          </div>
        </div>
      </div>

      {/* ── Notificación ── */}
      {notification && (
        <div className={`max-w-6xl mx-auto px-4 py-3 mt-4 rounded-xl font-semibold text-sm flex items-center gap-3 shadow-md ${notification.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {notification.msg}
        </div>
      )}

      {/* ── Tarjetas de Stock de Químicos ── */}
      <div className="max-w-6xl mx-auto px-6 mt-6 grid grid-cols-1 md:grid-cols-3 gap-5">
        {quimicos.map((q) => {
          const bajoStock = parseFloat(q.stock_actual) <= parseFloat(q.stock_minimo)
          return (
            <div key={q.id_quimico} className="bg-white dark:bg-[#24303F] p-6 rounded-2xl border border-slate-200 dark:border-[#313D4A] shadow-sm relative overflow-hidden">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">{q.sigla}</span>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white mt-0.5">{q.nombre}</h3>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${bajoStock ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                  {bajoStock ? 'Stock Bajo' : 'Normal'}
                </span>
              </div>

              <div className="mt-4 flex items-baseline justify-between">
                <div>
                  <span className="text-3xl font-black text-slate-800 dark:text-white">{parseFloat(q.stock_actual).toFixed(1)}</span>
                  <span className="ml-1 text-sm font-semibold text-slate-400">{q.unidad_medida}</span>
                </div>
                <div className="text-right text-xs text-slate-400 font-medium">
                  Mínimo: {parseFloat(q.stock_minimo).toFixed(1)} {q.unidad_medida}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Historial de Movimientos de Inventario ── */}
      <div className="max-w-6xl mx-auto px-6 mt-8">
        <div className="bg-white dark:bg-[#24303F] rounded-2xl border border-slate-200 dark:border-[#313D4A] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-[#313D4A]">
            <div>
              <h2 className="font-bold text-lg text-slate-800 dark:text-white">Historial de Movimientos de Inventario</h2>
              <p className="text-xs text-slate-400">Entradas por compra y dosificaciones</p>
            </div>
            <span className="text-sm font-semibold text-slate-400">{movimientos.length} movimiento(s)</span>
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-400 font-medium">Cargando inventario...</div>
          ) : movimientos.length === 0 ? (
            <div className="text-center py-12 text-slate-400 font-medium">No hay movimientos registrados de insumos</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 dark:bg-[#1A222C] border-b border-slate-100 dark:border-[#313D4A]">
                    <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400">Fecha y Hora</th>
                    <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400">Químico</th>
                    <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400 text-center">Tipo / Origen</th>
                    <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400 text-right">Cantidad</th>
                    <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400 text-right">Stock Resultante</th>
                    <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-400">Observaciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#313D4A]">
                  {movimientos.map((m, i) => (
                    <tr key={m.id_movimiento} className={i % 2 === 0 ? 'bg-white dark:bg-[#24303F]' : 'bg-slate-50/50 dark:bg-[#1A222C]/50'}>
                      <td className="px-5 py-4 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {m.fecha_hora ? new Date(m.fecha_hora).toLocaleString() : '—'}
                      </td>
                      <td className="px-5 py-4 text-sm font-bold text-slate-800 dark:text-white">
                        {m.nombre_quimico || m.sigla_quimico}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${m.sigla_tipo_movimiento === 'ENT' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'}`}>
                          {m.tipo_movimiento || m.sigla_tipo_movimiento} ({m.origen_movimiento || m.sigla_origen})
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right font-black text-slate-800 dark:text-white text-sm">
                        {m.sigla_tipo_movimiento === 'ENT' ? '+' : '-'}{parseFloat(m.cantidad).toFixed(1)} {m.unidad_medida}
                      </td>
                      <td className="px-5 py-4 text-right text-xs font-bold text-slate-500 dark:text-slate-400">
                        {parseFloat(m.stock_resultante).toFixed(1)} {m.unidad_medida}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500 dark:text-slate-400 italic">
                        {m.observaciones || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL REGISTRAR COMPRA ── */}
      {showCompraModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#24303F] rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 dark:border-[#313D4A] relative">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-[#313D4A] mb-4">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">Registrar Compra de Químico</h3>
              <button onClick={() => setShowCompraModal(false)} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 flex items-center justify-center">✕</button>
            </div>

            <form onSubmit={handleRegistrarCompra} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Químico Insumo</label>
                <select
                  value={selectedQuimico}
                  onChange={(e) => setSelectedQuimico(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-[#313D4A] bg-transparent dark:bg-[#1A222C] text-sm text-slate-800 dark:text-white"
                >
                  <option value="">-- Seleccione químico --</option>
                  {quimicos.map((q) => (
                    <option key={q.sigla} value={q.sigla}>
                      {q.nombre} ({q.unidad_medida})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Cantidad Comprada</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  required
                  placeholder="Ej: 50.0"
                  value={cantidadCompra}
                  onChange={(e) => setCantidadCompra(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-[#313D4A] bg-transparent dark:bg-[#1A222C] text-sm text-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Observaciones / Proveedor</label>
                <input
                  type="text"
                  placeholder="Ej: Factura 4501 - Distribuidora Acqua"
                  value={observacionesCompra}
                  onChange={(e) => setObservacionesCompra(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-[#313D4A] bg-transparent dark:bg-[#1A222C] text-sm text-slate-800 dark:text-white"
                />
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button type="button" onClick={() => setShowCompraModal(false)} className="w-1/3 py-3 rounded-xl border border-slate-200 dark:border-[#313D4A] text-slate-600 dark:text-slate-300 font-bold text-sm">Cancelar</button>
                <button type="submit" disabled={savingCompra} className="w-2/3 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md">{savingCompra ? 'Guardando...' : 'Aumentar Stock'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL NUEVO QUÍMICO ── */}
      {showQuimicoModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#24303F] rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 dark:border-[#313D4A] relative">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-[#313D4A] mb-4">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">Registrar Nuevo Químico</h3>
              <button onClick={() => setShowQuimicoModal(false)} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 flex items-center justify-center">✕</button>
            </div>

            <form onSubmit={handleCrearQuimico} className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Nombre del Químico</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Algicida Concentrado"
                  value={nombreQuimico}
                  onChange={(e) => setNombreQuimico(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#313D4A] bg-transparent dark:bg-[#1A222C] text-sm text-slate-800 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Sigla (Cód.)</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: ALG"
                    value={siglaQuimico}
                    onChange={(e) => setSiglaQuimico(e.target.value.toUpperCase())}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#313D4A] bg-transparent dark:bg-[#1A222C] text-sm text-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Unidad Medida</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: L, kg, gal"
                    value={unidadMedida}
                    onChange={(e) => setUnidadMedida(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#313D4A] bg-transparent dark:bg-[#1A222C] text-sm text-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Stock Inicial</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={stockInicial}
                    onChange={(e) => setStockInicial(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#313D4A] bg-transparent dark:bg-[#1A222C] text-sm text-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Stock Mínimo Alerta</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={stockMinimo}
                    onChange={(e) => setStockMinimo(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#313D4A] bg-transparent dark:bg-[#1A222C] text-sm text-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button type="button" onClick={() => setShowQuimicoModal(false)} className="w-1/3 py-2.5 rounded-xl border border-slate-200 dark:border-[#313D4A] text-slate-600 dark:text-slate-300 font-bold text-sm">Cancelar</button>
                <button type="submit" disabled={savingQuimico} className="w-2/3 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md">{savingQuimico ? 'Guardando...' : 'Crear Químico'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
