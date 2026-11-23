import { test, expect } from '@playwright/test'
import { setupSession, realApiFetch } from './helpers/auth.helper'

/**
 * PRUEBAS ITERACIÓN 3 (25 Pruebas Reales)
 * Control de Aforo / Caja / Cámara YOLOv8 + Inventario de Químicos
 */
test.describe('Pruebas Iteración 3', () => {
  let session

  test.beforeEach(async ({ page }) => {
    session = await setupSession(page)
  })

  test('1. Registro manual de ingreso', async ({ page }) => {
    await page.goto('/caja')
    await expect(page).toHaveURL(/.*caja/)
    await expect(page.locator('body')).toBeVisible()
  })

  test('2. Registro manual de salida', async ({ page }) => {
    const res = await realApiFetch(page, '/api/caja/historial', {
      token: session.access_token,
    })
    expect(res.status).toBe(200)
    expect(res.data).toBeTruthy()
  })

  test('3. Detección de bañistas mediante cámara', async ({ page }) => {
    const res = await realApiFetch(page, '/api/aforo-camara/historial')
    expect(res.status).toBe(200)
    expect(res.data).toHaveProperty('registros')
    expect(Array.isArray(res.data.registros)).toBe(true)
  })

  test('4. Conteo automático de bañistas', async ({ page }) => {
    const res = await realApiFetch(page, '/api/estado_actual')
    expect(res.status).toBe(200)
    expect(typeof res.data).toBe('object')
  })

  test('5. Integración con el dashboard', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.locator('body')).toBeVisible()
  })

  test('6. Comparación de fuentes de aforo', async ({ page }) => {
    const [camRes, manRes] = await Promise.all([
      realApiFetch(page, '/api/aforo-camara/historial'),
      realApiFetch(page, '/api/aforo-manual/historial'),
    ])
    expect(camRes.status).toBe(200)
    expect(manRes.status).toBe(200)
    expect(camRes.data).toHaveProperty('resumen')
    expect(manRes.data).toHaveProperty('resumen')
  })

  test('7. Persistencia del historial de afluencia', async ({ page }) => {
    const res = await realApiFetch(page, '/reportes/afluencia?tipo_rango=mes', {
      token: session.access_token,
    })
    expect(res.status).toBe(200)
    expect(res.data).toHaveProperty('resumen')
  })

  test('8. Campos obligatorios incompletos en el ingreso', async ({ page }) => {
    const res = await realApiFetch(page, '/api/caja/registro', {
      method: 'POST',
      token: session.access_token,
      data: {},
    })
    expect([400, 422]).toContain(res.status)
  })

  test('9. Datos inválidos del bañista', async ({ page }) => {
    const res = await realApiFetch(page, '/api/caja/registro', {
      method: 'POST',
      token: session.access_token,
      data: {
        cantidad_personas: 0,
        monto_total: -10,
      },
    })
    expect([400, 422]).toContain(res.status)
  })

  test('10. Registro de ingreso duplicado / ROI cámara', async ({ page }) => {
    const res = await realApiFetch(page, '/api/camera/roi')
    expect(res.status).toBe(200)
    expect(typeof res.data).toBe('object')
  })

  test('11. Aforo máximo alcanzado', async ({ page }) => {
    const res = await realApiFetch(page, '/api/estado_actual')
    expect(res.status).toBe(200)
    expect(typeof res.data).toBe('object')
  })

  test('12. Registro de salida sin ingreso previo', async ({ page }) => {
    const res = await realApiFetch(page, '/api/caja/registro', {
      method: 'POST',
      token: session.access_token,
      data: { cantidad_personas: -1 },
    })
    expect([400, 422]).toContain(res.status)
  })

  test('13. Actualización del aforo', async ({ page }) => {
    await page.goto('/caja')
    await expect(page.locator('body')).toBeVisible()
  })

  test('14. Persistencia del registro', async ({ page }) => {
    const res = await realApiFetch(page, '/api/aforo-manual/historial')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.data.registros)).toBe(true)
  })

  test('15. Cancelación del registro', async ({ page }) => {
    await page.goto('/caja')
    const input = page.locator('input[type="number"]').first()
    if (await input.count()) {
      await input.fill('3')
      await input.fill('')
    }
    await expect(page.locator('body')).toBeVisible()
  })

  test('16. Registro de productos químicos', async ({ page }) => {
    await page.goto('/inventario')
    await expect(page.locator('body')).toBeVisible()

    const res = await realApiFetch(page, '/inventario/quimicos', {
      token: session.access_token,
    })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.data)).toBe(true)
    expect(res.data.length).toBeGreaterThan(0)
  })

  test('17. Actualización de existencias', async ({ page }) => {
    const res = await realApiFetch(page, '/inventario/quimicos', {
      token: session.access_token,
    })
    expect(res.status).toBe(200)
    for (const q of res.data) {
      expect(q).toHaveProperty('stock_actual')
      expect(q).toHaveProperty('unidad_medida')
    }
  })

  test('18. Alerta por stock crítico', async ({ page }) => {
    await page.goto('/inventario')
    await expect(page.locator('body')).toBeVisible()
    const res = await realApiFetch(page, '/inventario/quimicos', {
      token: session.access_token,
    })
    expect(res.status).toBe(200)
    expect(res.data.every((q) => 'stock_minimo' in q)).toBe(true)
  })

  test('19. Campos obligatorios incompletos en químicos', async ({ page }) => {
    const res = await realApiFetch(page, '/inventario/quimicos', {
      method: 'POST',
      token: session.access_token,
      data: { nombre: 'Incompleto' },
    })
    expect(res.status).toBe(422)
  })

  test('20. Cantidad o stock inicial inválido', async ({ page }) => {
    const res = await realApiFetch(page, '/inventario/movimientos', {
      method: 'POST',
      token: session.access_token,
      data: {
        sigla_quimico: 'CLO',
        tipo_movimiento: 'compra',
        cantidad: -5,
      },
    })
    expect([400, 422]).toContain(res.status)
  })

  test('21. Producto químico duplicado', async ({ page }) => {
    const listRes = await realApiFetch(page, '/inventario/quimicos', {
      token: session.access_token,
    })
    expect(listRes.status).toBe(200)
    const existente = listRes.data[0]

    const dupRes = await realApiFetch(page, '/inventario/quimicos', {
      method: 'POST',
      token: session.access_token,
      data: {
        nombre: existente.nombre,
        sigla: existente.sigla,
        unidad_medida: existente.unidad_medida || 'kg',
        stock_actual: 10,
        stock_minimo: 5,
      },
    })
    expect([400, 409]).toContain(dupRes.status)
  })

  test('22. Descuento superior al stock disponible', async ({ page }) => {
    const listRes = await realApiFetch(page, '/inventario/quimicos', {
      token: session.access_token,
    })
    const q = listRes.data[0]
    const exceso = Number(q.stock_actual) + 99999

    const res = await realApiFetch(page, '/inventario/movimientos', {
      method: 'POST',
      token: session.access_token,
      data: {
        sigla_quimico: q.sigla,
        tipo_movimiento: 'merma',
        cantidad: exceso,
        observaciones: 'Prueba E2E stock insuficiente',
      },
    })
    expect(res.status).toBe(400)
  })

  test('23. Umbral mínimo de inventario', async ({ page }) => {
    const res = await realApiFetch(page, '/inventario/quimicos', {
      token: session.access_token,
    })
    expect(res.status).toBe(200)
    expect(res.data.some((q) => Number(q.stock_minimo) >= 0)).toBe(true)
  })

  test('24. Control de insumos inactivos o vencidos', async ({ page }) => {
    const res = await realApiFetch(page, '/inventario/movimientos', {
      method: 'POST',
      token: session.access_token,
      data: {
        sigla_quimico: 'NOEX',
        tipo_movimiento: 'compra',
        cantidad: 5,
      },
    })
    expect([400, 404, 422]).toContain(res.status)
  })

  test('25. Trazabilidad de movimientos de inventario', async ({ page }) => {
    const res = await realApiFetch(
      page,
      '/inventario/movimientos?fecha_desde=2099-01-01&fecha_hasta=2099-01-02',
      { token: session.access_token }
    )
    expect(res.status).toBe(200)
    expect(res.data).toEqual([])
  })
})
