import { useEffect, useState } from 'react'
import { monitoringApi } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine
} from 'recharts'

export default function Dashboard() {
  const { session, showError } = useAuth()
  const [sensorData, setSensorData] = useState(null)
  const [loadingSensors, setLoadingSensors] = useState(false)
  const [jornadaDisponible, setJornadaDisponible] = useState(true)
  const [selectedSensor, setSelectedSensor] = useState('ph') // 'ph' | 'turbidez' | 'temperatura' | 'todos'

  const loadSensorData = async () => {
    setLoadingSensors(true)
    try {
      const [{ data: state }, { data: alerts }] = await Promise.all([
        monitoringApi.get('/api/estado_actual'),
        monitoringApi.get('/api/alertas'),
      ])
      setSensorData({ ...state, alertas: alerts })
      setJornadaDisponible(true)
    } catch (requestError) {
      setSensorData(null)
      if (requestError.response?.status === 404) {
        setJornadaDisponible(false)
      } else if (showError) {
        showError(requestError.response?.data?.detail || 'No se pudieron cargar las lecturas de los sensores')
      }
    } finally {
      setLoadingSensors(false)
    }
  }

  useEffect(() => {
    loadSensorData()
    const intervalId = window.setInterval(loadSensorData, 10000)
    return () => window.clearInterval(intervalId)
  }, [])

  const measurement = sensorData?.ultima_medicion
  const summary = sensorData?.resumen
  const rawReadings = sensorData?.historial || []

  // Ordenar rawReadings de más reciente a más antigua para la tabla
  const sortedReadings = [...rawReadings].sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora))

  // Formatear lecturas para los gráficos (cronológico ascendente de izquierda a derecha)
  const chartData = [...sortedReadings].reverse().map((r) => ({
    hora: formatTime(r.fecha_hora),
    pH: r.ph !== null && r.ph !== undefined ? Number(Number(r.ph).toFixed(2)) : null,
    Turbidez: r.turbidez !== null && r.turbidez !== undefined ? Number(Number(r.turbidez).toFixed(2)) : null,
    Temperatura: r.temperatura !== null && r.temperatura !== undefined ? Number(Number(r.temperatura).toFixed(2)) : null,
  }))

  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const totalPages = Math.ceil(sortedReadings.length / itemsPerPage) || 1
  const paginatedReadings = sortedReadings.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  if (!jornadaDisponible) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center rounded-2xl border border-slate-200 dark:border-[#313D4A] bg-white dark:bg-[#24303F] p-8 text-center shadow-sm">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-500">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 8V12L15 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h3 className="mb-2 text-2xl font-bold text-slate-800 dark:text-white">No hay una jornada disponible</h3>
        <p className="max-w-md text-slate-500 dark:text-slate-400">
          Actualmente no hay ninguna jornada iniciada para el día de hoy. Los sensores comenzarán a registrar datos una vez que se inicie una nueva jornada.
        </p>
      </div>
    )
  }

  const sensorConfig = {
    ph: { 
      title: 'Monitoreo de pH', 
      color: '#2563eb', 
      unit: '', 
      dataKey: 'pH',
      minOpt: 7.0, 
      maxOpt: 7.6 
    },
    turbidez: { 
      title: 'Monitoreo de Turbidez', 
      color: '#ea580c', 
      unit: 'NTU', 
      dataKey: 'Turbidez',
      maxOpt: 5.0 
    },
    temperatura: { 
      title: 'Monitoreo de Temperatura', 
      color: '#10b981', 
      unit: '°C', 
      dataKey: 'Temperatura',
      minOpt: 24, 
      maxOpt: 30 
    },
  }

  return (
    <>
      {/* TARJETAS INTERACTIVAS */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        
        {/* pH Card */}
        <div 
          onClick={() => setSelectedSensor('ph')}
          className={`cursor-pointer rounded-2xl border p-5 shadow-sm transition-all ${selectedSensor === 'ph' ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20 dark:bg-blue-900/10' : 'border-slate-200 dark:border-[#313D4A] bg-white dark:bg-[#24303F] hover:border-blue-300'}`}
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-lg font-bold">
            pH
          </div>
          <div className="flex items-end justify-between">
            <div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Sensor de pH</span>
              <h4 className="mt-1 text-2xl font-bold text-slate-800 dark:text-white">
                {formatValue(measurement?.ph)}
              </h4>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${phState(measurement?.ph) === 'normal' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'}`}>
              {phState(measurement?.ph) === 'normal' ? 'Óptimo' : 'Alerta'}
            </span>
          </div>
        </div>

        {/* Turbidez Card */}
        <div 
          onClick={() => setSelectedSensor('turbidez')}
          className={`cursor-pointer rounded-2xl border p-5 shadow-sm transition-all ${selectedSensor === 'turbidez' ? 'border-orange-500 ring-2 ring-orange-500/20 bg-orange-50/20 dark:bg-orange-900/10' : 'border-slate-200 dark:border-[#313D4A] bg-white dark:bg-[#24303F] hover:border-orange-300'}`}
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8 14C8 14 9.5 16 12 16C14.5 16 16 14 16 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Sensor Turbidez</span>
              <h4 className="mt-1 text-2xl font-bold text-slate-800 dark:text-white">
                {formatValue(measurement?.turbidez)} <span className="text-xs font-medium text-slate-500 dark:text-slate-400">NTU</span>
              </h4>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${turbidityState(measurement?.turbidez) === 'normal' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'}`}>
              {turbidityState(measurement?.turbidez) === 'normal' ? 'Limpio' : 'Alerta'}
            </span>
          </div>
        </div>

        {/* Temperatura Card */}
        <div 
          onClick={() => setSelectedSensor('temperatura')}
          className={`cursor-pointer rounded-2xl border p-5 shadow-sm transition-all ${selectedSensor === 'temperatura' ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/20 dark:bg-emerald-900/10' : 'border-slate-200 dark:border-[#313D4A] bg-white dark:bg-[#24303F] hover:border-emerald-300'}`}
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14 14.76V3.5C14 2.67157 13.3284 2 12.5 2C11.6716 2 11 2.67157 11 3.5V14.76C9.20914 15.6318 8 17.5255 8 19.5C8 22.5376 10.0147 24 12.5 24C14.9853 24 17 22.5376 17 19.5C17 17.5255 15.7909 15.6318 14 14.76Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Sensor Temperatura</span>
              <h4 className="mt-1 text-2xl font-bold text-slate-800 dark:text-white">
                {formatValue(measurement?.temperatura)} <span className="text-xs font-medium text-slate-500 dark:text-slate-400">°C</span>
              </h4>
            </div>
          </div>
        </div>

        {/* Aforo Manual Card */}
        <div className="rounded-2xl border border-slate-200 dark:border-[#313D4A] bg-white dark:bg-[#24303F] p-5 shadow-sm">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M9 11C11.2091 11 13 9.20914 13 7C13 4.79086 11.2091 3 9 3C6.79086 3 5 4.79086 5 7C5 9.20914 6.79086 11 9 11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Aforo Manual</span>
              <h4 className="mt-1 text-2xl font-bold text-slate-800 dark:text-white">
                {sensorData?.aforo_manual ?? sensorData?.personas_hoy ?? summary?.total_personas ?? '0'}
              </h4>
            </div>
            <span className="rounded-full bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
              Taquilla
            </span>
          </div>
        </div>

        {/* Aforo Cámara Card */}
        <div className="rounded-2xl border border-slate-200 dark:border-[#313D4A] bg-white dark:bg-[#24303F] p-5 shadow-sm">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15 10L21 6V18L15 14M4 18H13C14.1046 18 15 17.1046 15 16V8C15 6.89543 14.1046 6 13 6H4C2.89543 6 2 6.89543 2 8V16C2 17.1046 2.89543 18 4 18Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Aforo Cámara</span>
              <h4 className="mt-1 text-2xl font-bold text-slate-800 dark:text-white">
                {sensorData?.aforo_camara ?? '0'}
              </h4>
            </div>
            <span className="rounded-full bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 text-[10px] font-semibold text-purple-600 dark:text-purple-400">
              Cámara IA
            </span>
          </div>
        </div>

      </div>

      {/* BOTONES DE SELECCIÓN DE SENSOR */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 dark:border-[#313D4A] bg-white dark:bg-[#24303F] p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-slate-700 dark:text-slate-200 mr-2">Ver Gráfico de:</span>
          
          <button
            onClick={() => setSelectedSensor('ph')}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${selectedSensor === 'ph' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}
          >
            💧 pH
          </button>
          
          <button
            onClick={() => setSelectedSensor('turbidez')}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${selectedSensor === 'turbidez' ? 'bg-orange-600 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}
          >
            🌊 Turbidez
          </button>
          
          <button
            onClick={() => setSelectedSensor('temperatura')}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${selectedSensor === 'temperatura' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}
          >
            🌡️ Temperatura
          </button>
        </div>

        <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span> Lecturas en tiempo real
        </span>
      </div>

      {/* SECCIÓN DE GRÁFICO INDIVIDUAL POR SENSOR */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        
        <div className="rounded-2xl border border-slate-200 dark:border-[#313D4A] bg-white dark:bg-[#24303F] p-7 shadow-sm xl:col-span-2">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xl font-bold text-slate-800 dark:text-white">
                {sensorConfig[selectedSensor]?.title}
              </h4>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                {`Historial de mediciones (${sensorConfig[selectedSensor]?.unit || 'unidades'})`}
              </p>
            </div>
          </div>

          <div className="h-80 w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 15, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.6} />
                  <XAxis dataKey="hora" stroke="#64748b" fontSize={11} />
                  <YAxis 
                    domain={[(dataMin) => Math.floor((dataMin - 0.2) * 10) / 10, (dataMax) => Math.ceil((dataMax + 0.2) * 10) / 10]} 
                    stroke={sensorConfig[selectedSensor].color} 
                    fontSize={11} 
                  />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', border: 'none', color: '#fff' }} />
                  <Legend />
                  
                  {sensorConfig[selectedSensor].minOpt && (
                    <ReferenceLine y={sensorConfig[selectedSensor].minOpt} label={{ value: 'Min Óptimo (7.0)', fill: '#10b981', fontSize: 10 }} stroke="#10b981" strokeDasharray="4 4" />
                  )}
                  {sensorConfig[selectedSensor].maxOpt && (
                    <ReferenceLine y={sensorConfig[selectedSensor].maxOpt} label={{ value: 'Max Óptimo (7.6)', fill: '#10b981', fontSize: 10 }} stroke="#10b981" strokeDasharray="4 4" />
                  )}
                  
                  <Line 
                    type="linear" 
                    name={sensorConfig[selectedSensor].title} 
                    dataKey={sensorConfig[selectedSensor].dataKey} 
                    stroke={sensorConfig[selectedSensor].color} 
                    strokeWidth={3} 
                    dot={{ r: 4, fill: sensorConfig[selectedSensor].color, strokeWidth: 1.5, stroke: '#fff' }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                Esperando primeras lecturas del sensor...
              </div>
            )}
          </div>
        </div>

        {/* Alertas */}
        <div className="rounded-2xl border border-slate-200 dark:border-[#313D4A] bg-white dark:bg-[#24303F] p-7 shadow-sm xl:col-span-1">
          <div className="mb-6 flex items-center justify-between">
            <h4 className="text-xl font-bold text-slate-800 dark:text-white">Alertas del Sistema</h4>
          </div>

          <div className="flex flex-col gap-4">
            {sensorData?.alertas?.length ? sensorData.alertas.map((alert, index) => (
              <div className={`flex items-start gap-3 rounded-lg border p-4 ${alert.tipo === 'ok' ? 'border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/50 dark:bg-emerald-900/10' : 'border-red-100 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/10'}`} key={index}>
                <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${alert.tipo === 'ok' ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400'}`}>
                  {alert.tipo === 'ok' ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                  )}
                </div>
                <p className={`text-sm font-medium leading-relaxed ${alert.tipo === 'ok' ? 'text-emerald-800 dark:text-emerald-400' : 'text-red-800 dark:text-red-400'}`}>
                  {alert.msg}
                </p>
              </div>
            )) : (
              <div className="flex items-center gap-3 rounded-lg border border-slate-100 dark:border-[#313D4A] bg-slate-50 dark:bg-[#1A222C] p-4">
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Sin alertas hoy.</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* TABLA CON PAGINACIÓN DE 10 REGISTROS */}
      <div className="mt-6">
        <div className="rounded-2xl border border-slate-200 dark:border-[#313D4A] bg-white dark:bg-[#24303F] p-7 shadow-sm">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h4 className="text-xl font-bold text-slate-800 dark:text-white">Historial de Lecturas Registradas</h4>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Mostrando {sortedReadings.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} - {Math.min(currentPage * itemsPerPage, sortedReadings.length)} de {sortedReadings.length} registros
              </p>
            </div>

            {/* CONTROLES DE PAGINACIÓN CON FLECHAS */}
            {rawReadings.length > 0 && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Página anterior"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M15 19L8 12L15 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Página {currentPage} de {totalPages}
                </span>

                <button
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Página siguiente"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 5L16 12L9 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            )}
          </div>

          <div className="max-w-full overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#313D4A] text-left">
                  <th className="py-3 pr-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">HORA</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">pH</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">TURBIDEZ (NTU)</th>
                  <th className="py-3 pl-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">TEMPERATURA (°C)</th>
                </tr>
              </thead>
              <tbody>
                {paginatedReadings.map((reading, index) => (
                  <tr key={index} className="border-b border-slate-100 dark:border-[#313D4A] last:border-0 hover:bg-slate-50 dark:hover:bg-[#313D4A] transition-colors">
                    <td className="py-3 pr-4 text-sm font-medium text-slate-700 dark:text-slate-300">
                      {formatTime(reading.fecha_hora)}
                    </td>
                    <td className="py-3 px-4 text-sm font-medium text-slate-800 dark:text-slate-200">
                      {formatValue(reading.ph)}
                    </td>
                    <td className="py-3 px-4 text-sm font-medium text-slate-800 dark:text-slate-200">
                      {formatValue(reading.turbidez)} NTU
                    </td>
                    <td className="py-3 pl-4 text-sm font-bold text-slate-800 dark:text-slate-200">
                      {formatValue(reading.temperatura)} °C
                    </td>
                  </tr>
                ))}
                {paginatedReadings.length === 0 && (
                  <tr>
                    <td colSpan="4" className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                      No hay lecturas registradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}

function formatValue(value) { return value === null || value === undefined ? '—' : Number(value).toFixed(2) }

function formatTime(value) {
  if (!value) return '—'
  // Extrae directamente la hora de la cadena (ej: '2026-09-13T20:30:15...' -> '20:30:15')
  if (typeof value === 'string' && value.includes('T')) {
    const timePart = value.split('T')[1]
    if (timePart) {
      return timePart.substring(0, 8)
    }
  }
  const dateObj = new Date(value)
  return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

function phState(value) { if (value === undefined || value === null) return 'empty'; return value < 7 || value > 7.6 ? 'warning' : 'normal' }
function turbidityState(value) { if (value === undefined || value === null) return 'empty'; return value > 10 ? 'danger' : value > 5 ? 'warning' : 'normal' }
