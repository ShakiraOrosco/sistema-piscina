import { useState, useEffect, useCallback } from 'react'
import api from '../../services/api'
import { useAuth } from '../../context/AuthContext'

export default function InventarioPage() {
  const { session } = useAuth()
  const [quimicos, setQuimicos] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMovimientos, setLoadingMovimientos] = useState(false)
  const [showMovimientoModal, setShowMovimientoModal] = useState(false)
  const [showQuimicoModal, setShowQuimicoModal] = useState(false)

  // Filtros de fecha para el historial
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')

  // Paginación: 20 registros por página
  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 20

  useEffect(() => {
    setCurrentPage(1)
  }, [fechaDesde, fechaHasta, movimientos.length])

  // Form movimiento
  const [tipoMovimiento, setTipoMovimiento] = useState('compra') // 'compra', 'dosificacion', 'merma'
  const [selectedQuimico, setSelectedQuimico] = useState('')
  const [cantidadMovimiento, setCantidadMovimiento] = useState('')
  const [observacionesMovimiento, setObservacionesMovimiento] = useState('')
  const [savingMovimiento, setSavingMovimiento] = useState(false)

  // Form nuevo químico
  const [nombreQuimico, setNombreQuimico] = useState('')
  const [siglaQuimico, setSiglaQuimico] = useState('')
  const [unidadMedida, setUnidadMedida] = useState('g')
  const [stockInicial, setStockInicial] = useState('0')
  const [stockMinimo, setStockMinimo] = useState('1000')
  const [savingQuimico, setSavingQuimico] = useState(false)

  const [notification, setNotification] = useState(null)

  // Carga solo los movimientos (para filtrado sin recargar tarjetas de químicos)
  const fetchMovimientos = useCallback(async (desde = fechaDesde, hasta = fechaHasta) => {
    setLoadingMovimientos(true)
    try {
      const params = {}
      if (desde) params.fecha_desde = desde
      if (hasta) params.fecha_hasta = hasta
      const { data } = await api.get('/inventario/movimientos', { params })
      setMovimientos(data)
    } catch {
      setNotification({ type: 'error', msg: 'Error al filtrar los movimientos del inventario' })
    } finally {
      setLoadingMovimientos(false)
    }
  }, [fechaDesde, fechaHasta])

  // Carga químicos y movimientos iniciales
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (fechaDesde) params.fecha_desde = fechaDesde
      if (fechaHasta) params.fecha_hasta = fechaHasta

      const [{ data: qData }, { data: mData }] = await Promise.all([
        api.get('/inventario/quimicos'),
        api.get('/inventario/movimientos', { params }),
      ])
      setQuimicos(qData)
      setMovimientos(mData)
    } catch {
      setNotification({ type: 'error', msg: 'Error al cargar los datos del inventario' })
    } finally {
      setLoading(false)
    }
  }, [fechaDesde, fechaHasta])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Filtrado de fechas
  const handleFiltrarFechas = (e) => {
    if (e) e.preventDefault()
    fetchMovimientos(fechaDesde, fechaHasta)
  }

  const handleLimpiarFiltroFechas = () => {
    setFechaDesde('')
    setFechaHasta('')
    fetchMovimientos('', '')
  }

  // Químico actualmente seleccionado en el modal
  const selectedQuimicoInfo = quimicos.find((q) => q.sigla === selectedQuimico)

  // Registrar Movimiento (Compra, Dosificación o Merma)
  const handleRegistrarMovimiento = async (e) => {
    e.preventDefault()
    if (!selectedQuimico || !cantidadMovimiento || parseFloat(cantidadMovimiento) <= 0) {
      setNotification({ type: 'error', msg: 'Seleccione un químico e ingrese una cantidad válida' })
      return
    }

    const cantidadNum = parseFloat(cantidadMovimiento)

    // Validación preventiva en frontend de stock suficiente para salidas
    if (
      (tipoMovimiento === 'dosificacion' || tipoMovimiento === 'merma') &&
      selectedQuimicoInfo &&
      cantidadNum > parseFloat(selectedQuimicoInfo.stock_actual)
    ) {
      setNotification({
        type: 'error',
        msg: `Stock insuficiente: el stock actual de ${selectedQuimicoInfo.nombre} es ${parseFloat(selectedQuimicoInfo.stock_actual).toFixed(1)} ${selectedQuimicoInfo.unidad_medida}`,
      })
      return
    }

    setSavingMovimiento(true)
    try {
      const { data } = await api.post('/inventario/movimientos', {
        sigla_quimico: selectedQuimico,
        tipo_movimiento: tipoMovimiento,
        cantidad: cantidadNum,
        observaciones: observacionesMovimiento.trim() || null,
        id_usuario: session?.usuario?.id_usuario || null,
      })
      setNotification({ type: 'success', msg: `✓ ${data.mensaje}` })
      setShowMovimientoModal(false)
      setSelectedQuimico('')
      setCantidadMovimiento('')
      setObservacionesMovimiento('')
      setTipoMovimiento('compra')
      fetchData()
    } catch (err) {
      const msg = err.response?.data?.detail || 'Error al registrar el movimiento'
      setNotification({ type: 'error', msg: `✗ ${msg}` })
    } finally {
      setSavingMovimiento(false)
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

  const totalPages = Math.ceil(movimientos.length / ITEMS_PER_PAGE) || 1
  const validCurrentPage = Math.min(Math.max(currentPage, 1), totalPages)
  const startIndex = (validCurrentPage - 1) * ITEMS_PER_PAGE
  const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, movimientos.length)
  const paginatedMovimientos = movimientos.slice(startIndex, endIndex)

  return (
    <div className="min-h-screen bg-slate-50 pb-12 dark:bg-[#1A222C]">
      {/* ── Header ── */}
      <div className="bg-white dark:bg-[#24303F] border-b border-slate-200 dark:border-[#313D4A] px-6 py-6 shadow-sm">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-widest uppercase text-blue-500 mb-1">Módulo Operativo</p>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Inventario de Químicos e Insumos</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Control de existencias y registro de movimientos</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowMovimientoModal(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md shadow-blue-500/20 active:scale-95 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              Registrar Movimiento
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
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5 border-b border-slate-100 dark:border-[#313D4A]">
            <div>
              <h2 className="font-bold text-lg text-slate-800 dark:text-white">Historial de Movimientos de Inventario</h2>
              <p className="text-xs text-slate-400">Entradas por compra, dosificaciones y mermas</p>
            </div>

            {/* ── Barra de Filtrado por Fechas ── */}
            <form onSubmit={handleFiltrarFechas} className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#1A222C] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#313D4A]">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Desde:</label>
                <input
                  type="date"
                  value={fechaDesde}
                  onChange={(e) => setFechaDesde(e.target.value)}
                  className="bg-transparent text-xs text-slate-700 dark:text-slate-200 outline-none"
                />
              </div>

              <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#1A222C] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#313D4A]">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Hasta:</label>
                <input
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => setFechaHasta(e.target.value)}
                  className="bg-transparent text-xs text-slate-700 dark:text-slate-200 outline-none"
                />
              </div>

              <button
                type="submit"
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filtrar
              </button>

              {(fechaDesde || fechaHasta) && (
                <button
                  type="button"
                  onClick={handleLimpiarFiltroFechas}
                  className="flex items-center gap-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold transition-all"
                >
                  ✕ Limpiar
                </button>
              )}

              <span className="text-xs font-semibold text-slate-400 ml-1">
                {movimientos.length} movimiento(s)
              </span>
            </form>
          </div>

          {(fechaDesde || fechaHasta) && (
            <div className="bg-blue-50/50 dark:bg-blue-950/20 px-6 py-2 border-b border-blue-100 dark:border-blue-900/30 text-xs text-blue-700 dark:text-blue-300 flex items-center justify-between">
              <span>
                Filtro activo: {fechaDesde ? `desde ${fechaDesde}` : ''} {fechaHasta ? `hasta ${fechaHasta}` : ''}
              </span>
              <button
                onClick={handleLimpiarFiltroFechas}
                className="underline hover:text-blue-900 dark:hover:text-white"
              >
                Ver todo el historial
              </button>
            </div>
          )}

          {loading || loadingMovimientos ? (
            <div className="text-center py-12 text-slate-400 font-medium">Cargando movimientos...</div>
          ) : movimientos.length === 0 ? (
            <div className="text-center py-12 text-slate-400 font-medium">
              {fechaDesde || fechaHasta
                ? 'No se encontraron movimientos registrados en el rango de fechas seleccionado'
                : 'No hay movimientos registrados de insumos'}
            </div>
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
                  {paginatedMovimientos.map((m, i) => {
                    const isEntrada = m.sigla_tipo_movimiento === 'ENT'
                    const isMerma =
                      m.sigla_origen === 'MER' ||
                      (m.origen_movimiento && m.origen_movimiento.toLowerCase().includes('merma'))
                    const isDosificacion =
                      m.sigla_origen === 'DOS' ||
                      (m.origen_movimiento && m.origen_movimiento.toLowerCase().includes('dosific'))

                    let badgeColor = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    let cantidadSign = '-'
                    let cantidadColor = 'text-slate-800 dark:text-white'

                    if (isEntrada) {
                      badgeColor = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      cantidadSign = '+'
                      cantidadColor = 'text-emerald-600 dark:text-emerald-400'
                    } else if (isMerma) {
                      badgeColor = 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                      cantidadSign = '-'
                      cantidadColor = 'text-rose-600 dark:text-rose-400'
                    } else if (isDosificacion) {
                      badgeColor = 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      cantidadSign = '-'
                      cantidadColor = 'text-amber-600 dark:text-amber-400'
                    }

                    return (
                      <tr key={m.id_movimiento} className={i % 2 === 0 ? 'bg-white dark:bg-[#24303F]' : 'bg-slate-50/50 dark:bg-[#1A222C]/50'}>
                        <td className="px-5 py-4 text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {m.fecha_hora ? new Date(m.fecha_hora).toLocaleString() : '—'}
                        </td>
                        <td className="px-5 py-4 text-sm font-bold text-slate-800 dark:text-white">
                          {m.nombre_quimico || m.sigla_quimico}
                        </td>
                        <td className="px-5 py-4 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${badgeColor}`}>
                            {m.tipo_movimiento || m.sigla_tipo_movimiento} ({m.origen_movimiento || m.sigla_origen})
                          </span>
                        </td>
                        <td className={`px-5 py-4 text-right font-black text-sm ${cantidadColor}`}>
                          {cantidadSign}{parseFloat(m.cantidad).toFixed(1)} {m.unidad_medida}
                        </td>
                        <td className="px-5 py-4 text-right text-xs font-bold text-slate-500 dark:text-slate-400">
                          {parseFloat(m.stock_resultante).toFixed(1)} {m.unidad_medida}
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-500 dark:text-slate-400 italic">
                          {m.observaciones || '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Paginación de 20 registros ── */}
          {movimientos.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-t border-slate-100 dark:border-[#313D4A] bg-slate-50/50 dark:bg-[#1A222C]/50">
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Mostrando <span className="font-bold text-slate-700 dark:text-slate-200">{startIndex + 1}</span> a{' '}
                <span className="font-bold text-slate-700 dark:text-slate-200">{endIndex}</span> de{' '}
                <span className="font-bold text-slate-700 dark:text-slate-200">{movimientos.length}</span> registros
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

      {/* ── MODAL REGISTRAR MOVIMIENTO ── */}
      {showMovimientoModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#24303F] rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 dark:border-[#313D4A] relative">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-[#313D4A] mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">Registrar Movimiento</h3>
                <p className="text-xs text-slate-400 mt-0.5">Entrada o salida de químicos e insumos</p>
              </div>
              <button
                onClick={() => setShowMovimientoModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRegistrarMovimiento} className="space-y-4">
              {/* Select tipo de movimiento */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Tipo de Movimiento
                </label>
                <select
                  value={tipoMovimiento}
                  onChange={(e) => setTipoMovimiento(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-[#313D4A] bg-transparent dark:bg-[#1A222C] text-sm text-slate-800 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="compra" className="dark:bg-[#1A222C]">Compra (+ Entrada)</option>
                  <option value="dosificacion" className="dark:bg-[#1A222C]">Dosificación (- Salida por aplicación)</option>
                  <option value="merma" className="dark:bg-[#1A222C]">Merma (- Salida por pérdida)</option>
                </select>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  {tipoMovimiento === 'compra' && 'Aumenta el stock del químico al registrar un nuevo ingreso.'}
                  {tipoMovimiento === 'dosificacion' && 'Descuenta insumo aplicado al tratamiento de la piscina.'}
                  {tipoMovimiento === 'merma' && 'Descuenta insumo por derrame, rotura, vencimiento o merma física.'}
                </p>
              </div>

              {/* Select químico */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Químico Insumo
                </label>
                <select
                  value={selectedQuimico}
                  onChange={(e) => setSelectedQuimico(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-[#313D4A] bg-transparent dark:bg-[#1A222C] text-sm text-slate-800 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="" className="dark:bg-[#1A222C]">-- Seleccione químico --</option>
                  {quimicos.map((q) => (
                    <option key={q.sigla} value={q.sigla} className="dark:bg-[#1A222C]">
                      {q.nombre} ({q.unidad_medida}) — Stock: {parseFloat(q.stock_actual).toFixed(1)} {q.unidad_medida}
                    </option>
                  ))}
                </select>
                {selectedQuimicoInfo && (
                  <div className="mt-1.5 flex items-center justify-between text-xs px-1">
                    <span className="text-slate-400">Stock disponible:</span>
                    <span className={`font-bold ${parseFloat(selectedQuimicoInfo.stock_actual) <= parseFloat(selectedQuimicoInfo.stock_minimo) ? 'text-red-500' : 'text-emerald-500'}`}>
                      {parseFloat(selectedQuimicoInfo.stock_actual).toFixed(1)} {selectedQuimicoInfo.unidad_medida}
                    </span>
                  </div>
                )}
              </div>

              {/* Cantidad */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  {tipoMovimiento === 'compra'
                    ? 'Cantidad Comprada'
                    : tipoMovimiento === 'dosificacion'
                    ? 'Cantidad a Dosificar'
                    : 'Cantidad de Merma'}{' '}
                  {selectedQuimicoInfo ? `(${selectedQuimicoInfo.unidad_medida})` : ''}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="Ej: 50.0"
                  value={cantidadMovimiento}
                  onChange={(e) => setCantidadMovimiento(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-[#313D4A] bg-transparent dark:bg-[#1A222C] text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Observaciones */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Observaciones / Detalle
                </label>
                <input
                  type="text"
                  placeholder={
                    tipoMovimiento === 'compra'
                      ? 'Ej: Factura 4501 - Distribuidora Acqua'
                      : tipoMovimiento === 'dosificacion'
                      ? 'Ej: Tratamiento preventivo nocturno'
                      : 'Ej: Envase dañado en bodega'
                  }
                  value={observacionesMovimiento}
                  onChange={(e) => setObservacionesMovimiento(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-[#313D4A] bg-transparent dark:bg-[#1A222C] text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Botones de acción */}
              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowMovimientoModal(false)}
                  className="w-1/3 py-3 rounded-xl border border-slate-200 dark:border-[#313D4A] text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingMovimiento}
                  className={`w-2/3 py-3 rounded-xl text-white font-bold text-sm shadow-md transition-all active:scale-95 ${
                    tipoMovimiento === 'compra'
                      ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
                      : tipoMovimiento === 'dosificacion'
                      ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-500/20'
                      : 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/20'
                  }`}
                >
                  {savingMovimiento
                    ? 'Guardando...'
                    : tipoMovimiento === 'compra'
                    ? 'Registrar Entrada'
                    : tipoMovimiento === 'dosificacion'
                    ? 'Registrar Dosificación'
                    : 'Registrar Merma'}
                </button>
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
              <button
                onClick={() => setShowQuimicoModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
              >
                ✕
              </button>
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
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#313D4A] bg-transparent dark:bg-[#1A222C] text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#313D4A] bg-transparent dark:bg-[#1A222C] text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#313D4A] bg-transparent dark:bg-[#1A222C] text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#313D4A] bg-transparent dark:bg-[#1A222C] text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#313D4A] bg-transparent dark:bg-[#1A222C] text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowQuimicoModal(false)}
                  className="w-1/3 py-2.5 rounded-xl border border-slate-200 dark:border-[#313D4A] text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingQuimico}
                  className="w-2/3 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition-all active:scale-95"
                >
                  {savingQuimico ? 'Guardando...' : 'Crear Químico'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
