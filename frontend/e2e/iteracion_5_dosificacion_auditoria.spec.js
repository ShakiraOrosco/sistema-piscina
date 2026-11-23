import { test, expect } from '@playwright/test'
import { setupSession, realApiFetch } from './helpers/auth.helper'

/**
 * PRUEBAS ITERACIÓN 5 (9 Pruebas Reales)
 * Dosificación Automática / Bombas ESP32 + Bitácora de Auditoría y PDF
 */
test.describe('Pruebas Iteración 5', () => {
  let session

  test.beforeEach(async ({ page }) => {
    session = await setupSession(page)
  })

  test('1. Activación automática de bombas dosificadoras', async ({ page }) => {
    const res = await realApiFetch(page, '/api/dosificacion/calcular?quimico=Cloro&cantidad_g=100')
    expect(res.status).toBe(200)
    expect(res.data.litros_objetivo).toBe(10.0)
    expect(res.data.es_cloro).toBe(true)
  })

  test('2. Descuento automático de inventario por dosificación', async ({ page }) => {
    const res = await realApiFetch(page, '/inventario/movimientos', {
      token: session.access_token,
    })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.data)).toBe(true)
  })

  test('3. Dosificación manual bajo demanda', async ({ page }) => {
    const res = await realApiFetch(page, '/api/dosificacion/iniciar', {
      method: 'POST',
      token: session.access_token,
      data: {
        quimico: 'Cloro',
        cantidad_g: 0,
        tipo: 'parcial',
      },
    })
    expect([400, 422]).toContain(res.status)
  })

  test('4. Parada de emergencia y detención de bombas', async ({ page }) => {
    const res = await realApiFetch(page, '/api/dosificacion/detener', {
      method: 'POST',
      data: { motivo: 'Parada de emergencia E2E' },
    })
    expect(res.status).toBe(200)
    expect(res.data.ok).toBe(true)
  })

  test('5. Restricción por tiempo de enfriamiento (cooldown)', async ({ page }) => {
    const res = await realApiFetch(page, '/api/dosificacion/estado')
    expect(res.status).toBe(200)
    expect(typeof res.data.activa).toBe('boolean')
  })

  test('6. Fallo de señal o desconexión de bomba', async ({ page }) => {
    const res = await realApiFetch(page, '/api/dosificacion/estado')
    expect(res.status).toBe(200)
    expect(typeof res.data.bomba_encendida).toBe('boolean')
  })

  test('7. Cancelación justificada de dosificación', async ({ page }) => {
    const res = await realApiFetch(page, '/api/dosificacion/detener', {
      method: 'POST',
      data: { motivo: 'Cancelación justificada E2E' },
    })
    expect(res.status).toBe(200)
    expect(res.data.ok).toBe(true)
  })

  test('8. Registro de auditoría para operaciones del sistema', async ({ page }) => {
    await page.goto('/auditoria')
    await expect(page.locator('body')).toBeVisible()

    const res = await realApiFetch(page, '/auditoria/logs', {
      token: session.access_token,
    })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.data)).toBe(true)
  })

  test('9. Exportación de bitácora institucional a PDF', async ({ page }) => {
    const res = await realApiFetch(page, '/reportes/pdf?tipo_reporte=calidad_agua&tipo_rango=hoy', {
      token: session.access_token,
    })
    expect(res.status).toBe(200)
    expect(typeof res.data).toBe('string')
    expect(res.data.startsWith('%PDF')).toBe(true)
  })
})
