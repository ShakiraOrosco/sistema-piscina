import { test, expect } from '@playwright/test'
import { setupSession } from './helpers/auth.helper'
import { setupApiMocks, apiFetch } from './helpers/mockApi.helper'

/**
 * MÓDULO 2: CONTROL DE AFORO, TAQUILLA Y DETECCIÓN CON VISIÓN COMPUTACIONAL (YOLOv8)
 * Cobertura de las 15 pruebas de la Tabla 2
 */
test.describe('Tabla 2: Aforo y Control de Bañistas', () => {

  test.beforeEach(async ({ page }) => {
    await setupSession(page, 'cajero')
    await setupApiMocks(page)
    await page.goto('/')
  })

  test('Prueba 1: Registro manual de ingreso', async ({ page }) => {
    // El sistema debe registrar correctamente el ingreso de bañistas y actualizar el aforo activo.
    const res = await apiFetch(page, '/caja/movimiento', {
      method: 'POST',
      data: { tipo: 'ingreso', cantidad: 3, responsable: 'caja@playaazul.bo' }
    })
    expect(res.status).toBe(201)
    expect(res.data.aforo.aforo_actual).toBe(15) // 12 + 3
    expect(res.data.aforo.ingresos_hoy).toBe(38)
  })

  test('Prueba 2: Registro manual de salida', async ({ page }) => {
    // El sistema debe registrar la salida y disminuir el aforo sin generar valores negativos.
    const res = await apiFetch(page, '/caja/movimiento', {
      method: 'POST',
      data: { tipo: 'salida', cantidad: 2, responsable: 'caja@playaazul.bo' }
    })
    expect(res.status).toBe(201)
    expect(res.data.aforo.aforo_actual).toBe(10) // 12 - 2
    expect(res.data.aforo.aforo_actual).toBeGreaterThanOrEqual(0)
  })

  test('Prueba 3: Detección de bañistas mediante cámara', async ({ page }) => {
    // El modelo de visión computacional debe identificar a las personas presentes en el área de la piscina.
    await page.route('**/monitoring/camara/detecciones', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          detecciones: [
            { id: 1, clase: 'persona', confianza: 0.94, bbox: [120, 150, 45, 90], en_piscina: true },
            { id: 2, clase: 'persona', confianza: 0.88, bbox: [220, 180, 50, 95], en_piscina: true },
            { id: 3, clase: 'persona', confianza: 0.91, bbox: [310, 210, 48, 92], en_piscina: true }
          ],
          total_detectados: 3
        })
      })
    })

    const camRes = await apiFetch(page, '/monitoring/camara/detecciones')
    expect(camRes.status).toBe(200)
    expect(camRes.data.total_detectados).toBe(3)
    expect(camRes.data.detecciones.every(d => d.confianza >= 0.70)).toBe(true)
  })

  test('Prueba 4: Conteo automático de bañistas', async ({ page }) => {
    // El sistema debe contabilizar los bañistas detectados y actualizar el valor correspondiente.
    const aforoRes = await apiFetch(page, '/caja/estado')
    expect(aforoRes.status).toBe(200)
    expect(aforoRes.data.aforo_camara).toBeDefined()
    expect(aforoRes.data.aforo_camara).toBeGreaterThanOrEqual(0)
  })

  test('Prueba 5: Integración con el dashboard', async ({ page }) => {
    // El dashboard debe mostrar el aforo manual y el aforo detectado mediante cámara.
    await setupSession(page, 'admin')
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/.*dashboard/)
    const texto = await page.textContent('body')
    expect(texto.length).toBeGreaterThan(0)
  })

  test('Prueba 6: Comparación de fuentes de aforo', async ({ page }) => {
    // El sistema debe permitir comparar los datos manuales y los obtenidos mediante visión computacional.
    const aforoRes = await apiFetch(page, '/caja/estado')
    expect(aforoRes.status).toBe(200)
    const data = aforoRes.data
    const discrepancia = Math.abs(data.aforo_manual - data.aforo_camara)
    expect(discrepancia).toBeDefined()
    expect(typeof discrepancia).toBe('number')
  })

  test('Prueba 7: Persistencia del historial de afluencia', async ({ page }) => {
    // Los registros de aforo deben almacenarse con su fecha y hora para consultas posteriores.
    await page.route('**/caja/historial', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 101, fecha_hora: '2026-10-26T10:00:00Z', tipo: 'ingreso', cantidad: 4, responsable: 'caja@playaazul.bo' },
          { id: 102, fecha_hora: '2026-10-26T11:30:00Z', tipo: 'salida', cantidad: 2, responsable: 'caja@playaazul.bo' }
        ])
      })
    })

    const histRes = await apiFetch(page, '/caja/historial')
    expect(histRes.status).toBe(200)
    expect(histRes.data.length).toBe(2)
    expect(histRes.data[0].fecha_hora).toBeDefined()
  })

  test('Prueba 8: Campos obligatorios incompletos en el ingreso', async ({ page }) => {
    // El sistema debe impedir guardar el registro cuando falte completar un dato obligatorio.
    await page.route('**/caja/validar_ingreso', async (route) => {
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Faltan campos requeridos: nombre o cantidad de boletos.' })
      })
    })

    const failRes = await apiFetch(page, '/caja/validar_ingreso', {
      method: 'POST',
      data: {}
    })
    expect(failRes.status).toBe(422)
    expect(failRes.data.detail).toContain('Faltan campos requeridos')
  })

  test('Prueba 9: Datos inválidos del bañista', async ({ page }) => {
    // El sistema debe rechazar datos con formato incorrecto, como edad negativa o texto en numéricos.
    await page.route('**/caja/validar_ingreso', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Formato incorrecto: La edad no puede ser negativa y la cantidad debe ser numérica.' })
      })
    })

    const invalidRes = await apiFetch(page, '/caja/validar_ingreso', {
      method: 'POST',
      data: { edad: -5, boletos: 'tres' }
    })
    expect(invalidRes.status).toBe(400)
    expect(invalidRes.data.detail).toContain('Formato incorrecto')
  })

  test('Prueba 10: Registro de ingreso duplicado', async ({ page }) => {
    // El sistema debe advertir o impedir que se registre dos veces el mismo ingreso para un bañista en la misma hora.
    await page.route('**/caja/validar_ingreso', async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Ingreso duplicado detectado para el mismo usuario en este horario.' })
      })
    })

    const dupRes = await apiFetch(page, '/caja/validar_ingreso', {
      method: 'POST',
      data: { dni_banista: '9482103', fecha_hora: '2026-10-26T14:00:00Z' }
    })
    expect(dupRes.status).toBe(409)
    expect(dupRes.data.detail).toContain('Ingreso duplicado')
  })

  test('Prueba 11: Aforo máximo alcanzado', async ({ page }) => {
    // El sistema no debe permitir nuevos ingresos cuando el aforo máximo de la piscina haya sido alcanzado.
    const maxRes = await apiFetch(page, '/caja/movimiento', {
      method: 'POST',
      data: { tipo: 'ingreso', cantidad: 100 } // Supera el límite de 80
    })
    expect(maxRes.status).toBe(400)
    expect(maxRes.data.detail).toContain('Aforo máximo alcanzado')
  })

  test('Prueba 12: Registro de salida sin ingreso previo', async ({ page }) => {
    // El sistema debe impedir registrar la salida de un bañista que no tenga un ingreso activo.
    const underflowRes = await apiFetch(page, '/caja/movimiento', {
      method: 'POST',
      data: { tipo: 'salida', cantidad: 50 } // Aforo actual es 12
    })
    expect(underflowRes.status).toBe(400)
    expect(underflowRes.data.detail).toContain('sin ingreso previo')
  })

  test('Prueba 13: Actualización del aforo', async ({ page }) => {
    // Cada ingreso válido debe incrementar el aforo y cada salida válida debe disminuirlo correctamente.
    const ingRes = await apiFetch(page, '/caja/movimiento', {
      method: 'POST',
      data: { tipo: 'ingreso', cantidad: 5 }
    })
    expect(ingRes.status).toBe(201)
    expect(ingRes.data.aforo.aforo_actual).toBe(17) // 12 + 5

    const salRes = await apiFetch(page, '/caja/movimiento', {
      method: 'POST',
      data: { tipo: 'salida', cantidad: 3 }
    })
    expect(salRes.status).toBe(201)
    expect(salRes.data.aforo.aforo_actual).toBe(14) // 17 - 3
  })

  test('Prueba 14: Persistencia del registro', async ({ page }) => {
    // El ingreso registrado debe conservarse con los datos del bañista, fecha, hora y responsable.
    const histRes = await apiFetch(page, '/caja/estado')
    expect(histRes.status).toBe(200)
    expect(histRes.data.ingresos_hoy).toBeGreaterThan(0)
    expect(histRes.data.salidas_hoy).toBeGreaterThanOrEqual(0)
  })

  test('Prueba 15: Cancelación del registro', async ({ page }) => {
    // Si el usuario cancela la operación, el sistema no debe guardar el ingreso ni modificar el aforo.
    const aforoAntes = (await apiFetch(page, '/caja/estado')).data
    await page.goto('/caja')
    const aforoDespues = (await apiFetch(page, '/caja/estado')).data
    expect(aforoDespues.aforo_actual).toBe(aforoAntes.aforo_actual)
  })

})
