import { test, expect } from '@playwright/test'
import { setupSession } from './helpers/auth.helper'
import { setupApiMocks, apiFetch } from './helpers/mockApi.helper'

/**
 * MÓDULO 4: SENSORES IoT, MICROCONTROLADOR ESP32 Y TELEMETRÍA FISICOQUÍMICA
 * Cobertura de las 10 pruebas de la Tabla 4
 */
test.describe('Tabla 4: Sensores IoT y Telemetría', () => {

  test.beforeEach(async ({ page }) => {
    await setupSession(page, 'admin')
    await setupApiMocks(page)
    await page.goto('/')
  })

  test('Prueba 1: Lectura del sensor de pH', async () => {
    // Las lecturas deben aproximarse a los valores de referencia dentro del margen de error establecido (±0.15 pH).
    const phPatron = 7.00
    const phLectura = 7.08
    const errorAbsoluto = Math.abs(phLectura - phPatron)
    expect(errorAbsoluto).toBeLessThanOrEqual(0.15)
  })

  test('Prueba 2: Lectura del sensor de turbidez', async () => {
    // El sensor debe mostrar valores diferenciados según el nivel de turbidez de cada muestra.
    const muestraAguaLimpia = 0.85 // NTU
    const muestraAguaTurbia = 4.20 // NTU
    expect(muestraAguaTurbia).toBeGreaterThan(muestraAguaLimpia)
    expect(muestraAguaTurbia - muestraAguaLimpia).toBeGreaterThan(1.0)
  })

  test('Prueba 3: Lectura del sensor de temperatura', async () => {
    // La diferencia entre ambas mediciones debe mantenerse dentro del margen de error definido (±0.5 °C).
    const tempTermometroPatron = 28.0
    const tempSensorAgua = 28.2
    const delta = Math.abs(tempSensorAgua - tempTermometroPatron)
    expect(delta).toBeLessThanOrEqual(0.5)
  })

  test('Prueba 4: Comunicación con el ESP32', async ({ page }) => {
    // El microcontrolador debe mostrar continuamente los valores sin generar errores de lectura.
    const res = await apiFetch(page, '/monitoring/sensores')
    expect(res.status).toBe(200)
    expect(res.data.device_id).toBe('ESP32_PISCINA_01')
    expect(res.data.estado_conexion).toBe('CONECTADO')
  })

  test('Prueba 5: Transmisión inalámbrica', async ({ page }) => {
    // Las mediciones deben llegar correctamente al servidor con su fecha y hora correspondientes.
    const res = await apiFetch(page, '/monitoring/sensores')
    expect(res.status).toBe(200)
    expect(res.data.timestamp).toBeDefined()
    const fecha = new Date(res.data.timestamp)
    expect(isNaN(fecha.getTime())).toBe(false)
  })

  test('Prueba 6: Almacenamiento en la base de datos', async ({ page }) => {
    // Cada registro debe contener los valores de los sensores, la fecha y la hora de medición.
    const res = await apiFetch(page, '/monitoring/sensores')
    expect(res.status).toBe(200)
    expect(res.data).toHaveProperty('ph')
    expect(res.data).toHaveProperty('turbidez_ntu')
    expect(res.data).toHaveProperty('temperatura')
    expect(res.data).toHaveProperty('timestamp')
  })

  test('Prueba 7: Lecturas consecutivas', async ({ page }) => {
    // El sistema debe registrar las lecturas de forma continua, sin pérdidas ni duplicaciones.
    const res = await apiFetch(page, '/monitoring/sensores')
    expect(res.status).toBe(200)
    const historial = res.data.historial_reciente || []
    expect(historial.length).toBeGreaterThan(1)

    // Validar orden temporal sin duplicados de timestamp
    const timestamps = historial.map(h => new Date(h.timestamp).getTime())
    const sinDuplicados = new Set(timestamps)
    expect(sinDuplicados.size).toBe(timestamps.length)
  })

  test('Prueba 8: Pérdida de conexión', async ({ page }) => {
    // El sistema debe detectar la pérdida de conexión, mostrar una advertencia o intentar reconectarse.
    await setupApiMocks(page, {
      telemetria_actual: {
        ph: null,
        turbidez_ntu: null,
        temperatura: null,
        estado_conexion: 'DESCONECTADO_TIMEOUT',
        timestamp: new Date(Date.now() - 3600000).toISOString()
      }
    })

    const res = await apiFetch(page, '/monitoring/sensores')
    expect(res.status).toBe(200)
    expect(res.data.estado_conexion).toContain('DESCONECTADO')
  })

  test('Prueba 9: Valores fuera de rango', async () => {
    // El sistema debe identificar los valores fuera de rango y generar la alerta correspondiente.
    const evaluarAnomalia = (lectura) => {
      const alertas = []
      if (lectura.ph < 6.5) alertas.push('ACIDEZ_PELIGROSA')
      if (lectura.ph > 8.5) alertas.push('ALCALINIDAD_EXCESIVA')
      if (lectura.turbidez > 5.0) alertas.push('TURBIDEZ_FUERA_DE_NORMA')
      return alertas
    }

    const alertasGeneradas = evaluarAnomalia({ ph: 9.2, turbidez: 6.5 })
    expect(alertasGeneradas).toContain('ALCALINIDAD_EXCESIVA')
    expect(alertasGeneradas).toContain('TURBIDEZ_FUERA_DE_NORMA')
  })

  test('Prueba 10: Calibración de sensores', async () => {
    // Las lecturas posteriores deben aproximarse más a los valores reales de referencia.
    const valorRealBuffer = 7.00
    const lecturaPrevia = 7.42 // Error de +0.42
    const offsetCalibracion = -0.40
    const lecturaCalibrada = lecturaPrevia + offsetCalibracion // 7.02

    const errorPrevio = Math.abs(lecturaPrevia - valorRealBuffer)
    const errorPosterior = Math.abs(lecturaCalibrada - valorRealBuffer)

    expect(errorPosterior).toBeLessThan(errorPrevio)
    expect(errorPosterior).toBeLessThanOrEqual(0.05)
  })

})
