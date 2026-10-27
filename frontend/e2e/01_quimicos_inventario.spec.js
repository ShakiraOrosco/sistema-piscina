import { test, expect } from '@playwright/test'
import { setupSession } from './helpers/auth.helper'
import { setupApiMocks, apiFetch } from './helpers/mockApi.helper'

/**
 * MÓDULO 1: PRODUCTOS QUÍMICOS, INVENTARIO, DOSIFICACIÓN Y AUDITORÍA
 * Cobertura de las 19 pruebas de la Tabla 1
 */
test.describe('Tabla 1: Inventario de Químicos, Bombas y Dosificación', () => {

  test.beforeEach(async ({ page }) => {
    await setupSession(page, 'admin')
    await setupApiMocks(page)
    await page.goto('/')
  })

  test('Prueba 1: Registro de productos químicos', async ({ page }) => {
    // El sistema debe permitir registrar productos químicos con su unidad, cantidad inicial y responsable.
    const res = await apiFetch(page, '/inventario/quimicos', {
      method: 'POST',
      data: {
        nombre: 'Clarificante Polimérico',
        sigla: 'CLAR',
        unidad_medida: 'L',
        stock_actual: 30.0,
        stock_minimo: 10.0,
        responsable: 'admin@playaazul.bo'
      }
    })
    expect(res.status).toBe(201)
    expect(res.data.mensaje).toContain('registrado')
    expect(res.data.quimico.nombre).toBe('Clarificante Polimérico')
  })

  test('Prueba 2: Actualización de existencias', async ({ page }) => {
    // Las entradas y ajustes de inventario deben reflejarse correctamente en el stock disponible.
    const res = await apiFetch(page, '/inventario/movimientos', {
      method: 'POST',
      data: {
        id_quimico: 1, // Cloro Granulado inicial: 50.0
        tipo_movimiento: 'compra',
        cantidad: 20.0,
        observaciones: 'Compra de reposición semanal'
      }
    })
    expect(res.status).toBe(201)
    expect(res.data.movimiento.cantidad).toBe(20.0)

    // Al consultar químicos, el stock debe reflejarse actualizado (50 + 20 = 70)
    const getRes = await apiFetch(page, '/inventario/quimicos')
    const cloro = getRes.data.find(q => q.id_quimico === 1)
    expect(cloro.stock_actual).toBe(70.0)
  })

  test('Prueba 3: Alerta por stock crítico', async ({ page }) => {
    // El sistema debe generar una alerta cuando la existencia de un químico alcance el umbral mínimo.
    await page.goto('/inventario')
    // El Sulfato de Cobre en nuestro mock tiene stock_actual: 8.0 y stock_minimo: 10.0
    const alertaStock = page.locator('text=Stock Bajo').first()
    await expect(alertaStock).toBeVisible()
  })

  test('Prueba 4: Activación de bombas dosificadoras', async ({ page }) => {
    // Las bombas deben activarse y detenerse conforme a la dosis y al tiempo calculados por el sistema.
    const res = await apiFetch(page, '/api/dosificacion', {
      method: 'POST',
      data: {
        quimico: 'CL70',
        dosis_calculada_g: 450,
        tiempo_operacion_segundos: 120,
        comando: 'ACTIVAR_BOMBA'
      }
    })
    expect(res.status).toBe(200)
    expect(res.data.estado_bombas).toBe('ACTIVAS')
    expect(res.data.mensaje).toContain('Bombas activadas según cálculo')
  })

  test('Prueba 5: Descuento automático de inventario', async ({ page }) => {
    // Después de cada dosificación, el sistema debe descontar la cantidad aplicada y conservar el registro de la operación.
    const dosifRes = await apiFetch(page, '/inventario/movimientos', {
      method: 'POST',
      data: {
        id_quimico: 1,
        tipo_movimiento: 'dosificacion',
        cantidad: 5.0,
        observaciones: 'Dosificación automática nocturna'
      }
    })
    expect(dosifRes.status).toBe(201)
    expect(dosifRes.data.movimiento.tipo_movimiento).toBe('dosificacion')

    // Validar que el stock haya bajado a 45.0
    const quimicosRes = await apiFetch(page, '/inventario/quimicos')
    const cloro = quimicosRes.data.find(q => q.id_quimico === 1)
    expect(cloro.stock_actual).toBe(45.0)
  })

  test('Prueba 6: Generación de reportes históricos', async ({ page }) => {
    // El sistema debe generar reportes sobre calidad del agua, consumo de químicos y afluencia de bañistas.
    const reportRes = await apiFetch(page, '/reportes/resumen?periodo=2026-10')
    expect(reportRes.status).toBe(200)
    expect(reportRes.data.calidad_agua).toBeDefined()
    expect(reportRes.data.consumo_quimicos).toBeDefined()
    expect(reportRes.data.afluencia_banistas).toBeDefined()
  })

  test('Prueba 7: Exportación de reportes', async ({ page }) => {
    // Los reportes deben exportarse correctamente en el formato definido para su presentación.
    const exportRes = await apiFetch(page, '/reportes/pdf')
    expect(exportRes.status).toBe(200)
    expect(exportRes.headers['content-type']).toContain('application/pdf')
  })

  test('Prueba 8: Registro de auditoría', async ({ page }) => {
    // Cada operación relevante debe registrarse con usuario, fecha, hora, módulo y acción realizada.
    const auditRes = await apiFetch(page, '/auditoria/logs')
    expect(auditRes.status).toBe(200)
    const logs = auditRes.data
    expect(logs.length).toBeGreaterThan(0)
    const log = logs[0]
    expect(log).toHaveProperty('usuario')
    expect(log).toHaveProperty('fecha_hora')
    expect(log).toHaveProperty('modulo')
    expect(log).toHaveProperty('accion')
  })

  test('Prueba 9: Parada de emergencia y cooldown', async ({ page }) => {
    // El sistema debe detener la dosificación activa y bloquear un nuevo ciclo durante el periodo de reposo configurado.
    const stopRes = await apiFetch(page, '/api/dosificacion', {
      method: 'POST',
      data: { accion: 'parada_emergencia' }
    })
    expect(stopRes.status).toBe(200)
    expect(stopRes.data.cooldown_activo).toBe(true)
    expect(stopRes.data.mensaje).toContain('Bombas detenidas')
  })

  test('Prueba 10: Campos obligatorios incompletos', async ({ page }) => {
    // El sistema debe impedir registrar un producto cuando falte la unidad, cantidad inicial o responsable.
    const failRes = await apiFetch(page, '/inventario/quimicos', {
      method: 'POST',
      data: { nombre: 'Químico Incompleto' }
    })
    expect(failRes.status).toBe(422)
    expect(failRes.data.detail).toContain('Campos obligatorios incompletos')
  })

  test('Prueba 11: Cantidad o dosis inválida', async ({ page }) => {
    // El sistema debe rechazar cantidades negativas, cero cuando no corresponda o valores no numéricos.
    const invalidRes = await apiFetch(page, '/inventario/movimientos', {
      method: 'POST',
      data: {
        id_quimico: 1,
        tipo_movimiento: 'dosificacion',
        cantidad: -15.5
      }
    })
    expect(invalidRes.status).toBe(400)
    expect(invalidRes.data.detail).toContain('inválida')
  })

  test('Prueba 12: Producto químico duplicado', async ({ page }) => {
    // El sistema debe advertir o impedir registrar nuevamente un producto químico que ya exista en el inventario.
    const dupRes = await apiFetch(page, '/inventario/quimicos', {
      method: 'POST',
      data: {
        nombre: 'Cloro Granulado 70%', // Ya existente
        sigla: 'CL70',
        unidad_medida: 'kg'
      }
    })
    expect(dupRes.status).toBe(400)
    expect(dupRes.data.detail).toContain('ya existe')
  })

  test('Prueba 13: Descuento superior al stock disponible', async ({ page }) => {
    // El sistema no debe permitir una dosificación mayor a la existencia disponible ni generar valores negativos.
    const exceedRes = await apiFetch(page, '/inventario/movimientos', {
      method: 'POST',
      data: {
        id_quimico: 1,
        tipo_movimiento: 'dosificacion',
        cantidad: 9999.0
      }
    })
    expect(exceedRes.status).toBe(400)
    expect(exceedRes.data.detail).toContain('Descuento superior al stock disponible')
  })

  test('Prueba 14: Umbral mínimo de inventario', async ({ page }) => {
    // El sistema debe generar la alerta correspondiente cuando el stock sea igual o menor al nivel mínimo configurado.
    await page.goto('/inventario')
    const stockBajoBadge = page.locator('text=Stock Bajo').first()
    await expect(stockBajoBadge).toBeVisible()
  })

  test('Prueba 15: Producto inactivo o vencido', async ({ page }) => {
    // El sistema debe impedir la dosificación de productos marcados como inactivos o vencidos.
    const inactivoRes = await apiFetch(page, '/inventario/movimientos', {
      method: 'POST',
      data: {
        id_quimico: 4, // Alguicida Vencido
        tipo_movimiento: 'dosificacion',
        cantidad: 2.0
      }
    })
    expect(inactivoRes.status).toBe(400)
    expect(inactivoRes.data.detail).toContain('inactivo o vencido')
  })

  test('Prueba 16: Fallo de comunicación con la bomba', async ({ page }) => {
    // Ante una falla de comunicación, el sistema debe detener o cancelar la dosificación y registrar el incidente.
    const commFailRes = await apiFetch(page, '/api/dosificacion', {
      method: 'POST',
      data: {
        quimico: 'CL70',
        dosis_calculada_g: 300,
        simular_error_bomba: true
      }
    })
    expect(commFailRes.status).toBe(503)
    expect(commFailRes.data.detail).toContain('Fallo de comunicación con la bomba dosificadora')
  })

  test('Prueba 17: Cancelación de dosificación', async ({ page }) => {
    // Si el usuario cancela la operación, no debe descontarse inventario ni registrarse una dosificación como completada.
    const stockAntesRes = await apiFetch(page, '/inventario/quimicos')
    const cloroAntes = stockAntesRes.data.find(q => q.id_quimico === 1)

    await page.goto('/inventario')
    await page.click('button:has-text("Registrar Movimiento")')
    const botonCerrar = page.locator('button:has-text("Cancelar")').or(page.locator('text=✕'))
    if (await botonCerrar.count() > 0) {
      await botonCerrar.first().click()
    }

    const stockDespuesRes = await apiFetch(page, '/inventario/quimicos')
    const cloroDespues = stockDespuesRes.data.find(q => q.id_quimico === 1)
    expect(cloroDespues.stock_actual).toBe(cloroAntes.stock_actual)
  })

  test('Prueba 18: Permisos de operación', async ({ page }) => {
    // El sistema debe permitir registrar, modificar o ejecutar dosificaciones únicamente a usuarios con permisos autorizados.
    await setupSession(page, 'cajero')
    await page.goto('/inventario')
    // El usuario Cajero es redirigido a /caja
    await expect(page).toHaveURL(/.*caja/)
  })

  test('Prueba 19: Trazabilidad de movimientos', async ({ page }) => {
    // Cada entrada, salida, ajuste y dosificación debe conservar usuario, fecha, hora, cantidad y motivo de la operación.
    const movRes = await apiFetch(page, '/inventario/movimientos')
    expect(movRes.status).toBe(200)
    const mov = movRes.data[0]
    expect(mov).toHaveProperty('responsable')
    expect(mov).toHaveProperty('fecha_hora')
    expect(mov).toHaveProperty('cantidad')
    expect(mov).toHaveProperty('tipo_movimiento')
    expect(mov).toHaveProperty('observaciones')
  })

})
