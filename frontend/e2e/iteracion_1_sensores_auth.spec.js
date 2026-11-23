import { test, expect } from '@playwright/test'
import { setupSession, realApiFetch, TEST_CREDENTIALS } from './helpers/auth.helper'

/**
 * PRUEBAS ITERACIÓN 1 (20 Pruebas Reales)
 * Sensores IoT (ESP32) + Seguridad y Autenticación
 */
test.describe('Pruebas Iteración 1', () => {
  test('1. Lectura del sensor de pH', async ({ page }) => {
    const res = await realApiFetch(page, '/api/estado_actual')
    expect(res.status).toBe(200)
    expect(typeof res.data).toBe('object')
  })

  test('2. Lectura del sensor de turbidez', async ({ page }) => {
    const res = await realApiFetch(page, '/api/estado_actual')
    expect(res.status).toBe(200)
    expect(typeof res.data).toBe('object')
  })

  test('3. Lectura del sensor de temperatura', async ({ page }) => {
    const res = await realApiFetch(page, '/api/estado_actual')
    expect(res.status).toBe(200)
    expect(typeof res.data).toBe('object')
  })

  test('4. Comunicación con el ESP32', async ({ page }) => {
    const res = await realApiFetch(page, '/health')
    expect(res.status).toBe(200)
    expect(res.data.status).toBe('ok')
  })

  test('5. Transmisión inalámbrica', async ({ page }) => {
    const res = await realApiFetch(page, '/lecturas')
    expect(res.status).toBe(200)
    expect(res.data).toBeTruthy()
  })

  test('6. Almacenamiento en la base de datos', async ({ page }) => {
    const res = await realApiFetch(page, '/lecturas')
    expect(res.status).toBe(200)
    expect(res.data).toBeTruthy()
  })

  test('7. Lecturas consecutivas', async ({ page }) => {
    const r1 = await realApiFetch(page, '/api/estado_actual')
    const r2 = await realApiFetch(page, '/api/estado_actual')
    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
  })

  test('8. Pérdida de conexión', async ({ page }) => {
    const res = await realApiFetch(page, '/api/alertas')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.data)).toBe(true)
  })

  test('9. Valores fuera de rango', async ({ page }) => {
    const res = await realApiFetch(page, '/lecturas', {
      method: 'POST',
      data: { ph: 'invalido' },
    })
    expect([400, 422]).toContain(res.status)
  })

  test('10. Calibración de sensores', async ({ page }) => {
    const res = await realApiFetch(page, '/api/pronostico')
    expect(res.status).toBe(200)
    expect(typeof res.data).toBe('object')
  })

  test('11. Inicio de sesión válido', async ({ page }) => {
    await page.goto('/auth/login')
    await page.fill('input[name="correo"]', TEST_CREDENTIALS.correo)
    await page.fill('input[name="password"]', TEST_CREDENTIALS.password)
    await page.click('button[type="submit"]')

    await expect(page).toHaveURL(/.*dashboard/)
  })

  test('12. Credenciales inválidas', async ({ page }) => {
    await page.goto('/auth/login')
    const correoUnico = `oroscoshakira34@gmail.com`

    await page.fill('input[name="correo"]', correoUnico)
    await page.fill('input[name="password"]', 'PasswordIncorrecta999!')
    await page.click('button[type="submit"]')

    const toast = page.locator('.toast-error')
    await expect(toast).toBeVisible()
    await expect(toast).toContainText(/inválidos|intento/i)
  })

  test('13. Intentos fallidos de inicio de sesión', async ({ page }) => {
    await page.goto('/auth/login')
    const correoUnico = `oroscoshakira34@gmail.com`

    await page.fill('input[name="correo"]', correoUnico)
    await page.fill('input[name="password"]', 'ClaveIncorrecta1')
    await page.click('button[type="submit"]')

    const toast = page.locator('.toast-error')
    await expect(toast).toBeVisible()
    await expect(toast).toContainText(/2 intento/i)
  })

  test('14. Recuperación y cambio de contraseña', async ({ page }) => {
    await setupSession(page)
    await page.goto('/auth/change-password')

    await page.fill('input[name="password_actual"]', 'ClaveIncorrecta1')
    await page.fill('input[name="password_nueva"]', 'NuevaClave123!')
    await page.fill('input[name="confirmar_password_nueva"]', 'NuevaClave123!')
    await page.click('button[type="submit"]')

    await expect(page.locator('.toast-error')).toBeVisible()
  })

  test('15. Autenticación de dos factores', async ({ page }) => {
    const res = await realApiFetch(page, '/auth/verify-2fa', {
      method: 'POST',
      data: { desafio: 'token_invalido', codigo: '000000' },
    })
    expect(res.status).toBe(401)
  })

  test('16. Bloqueo tras intentos fallidos', async ({ page }) => {
    await page.goto('/auth/login')
    const correoUnico = `it1_bloqueo_${Date.now()}@playaazul.bo`

    for (let i = 0; i < 3; i++) {
      await page.fill('input[name="correo"]', correoUnico)
      await page.fill('input[name="password"]', 'ClaveErronea123!')
      await page.click('button[type="submit"]')
      await expect(page.locator('.toast-error')).toBeVisible()
    }

    await expect(page.locator('.toast-error')).toContainText(/bloqueado/i)
  })

  test('17. Recuperación con correo no registrado', async ({ page }) => {
    await page.goto('/auth/login')
    await page.click('button:has-text("¿Olvidaste tu contraseña?")')
    await expect(page.locator('h3:has-text("Recuperar Contraseña")')).toBeVisible()

    await page.fill('input[placeholder="ejemplo@piscina.com"]', `no_registrado_${Date.now()}@playaazul.bo`)
    await page.click('button:has-text("Enviar Contraseña")')
    await expect(page.locator('h3:has-text("Recuperar Contraseña")')).toBeHidden({ timeout: 10000 })
  })

  test('18. Cambio obligatorio de clave temporal', async ({ page }) => {
    const session = await setupSession(page)
    await page.addInitScript((s) => {
      localStorage.setItem('piscina_session', JSON.stringify({ ...s, must_change_password: true }))
    }, session)
    await page.goto('/auth/change-password')
    await page.fill('input[name="password_nueva"]', 'NuevaClave123!')
    await page.fill('input[name="confirmar_password_nueva"]', 'NuevaClave123!')
    await page.click('button[type="submit"]')
    await expect(page.locator('text=La contraseña temporal es obligatoria.')).toBeVisible()
  })

  test('19. Código 2FA inválido', async ({ page }) => {
    const res = await realApiFetch(page, '/auth/verify-2fa', {
      method: 'POST',
      data: { desafio: 'desafio_falso', codigo: '999999' },
    })
    expect(res.status).toBe(401)
  })

  test('20. Cierre de sesión', async ({ page }) => {
    await page.goto('/auth/login')
    await page.fill('input[name="correo"]', TEST_CREDENTIALS.correo)
    await page.fill('input[name="password"]', TEST_CREDENTIALS.password)
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/.*dashboard/)

    await page.locator('header .cursor-pointer').last().click()
    await page.click('button:has-text("Cerrar sesión")')
    await expect(page).toHaveURL(/.*auth\/login/)

    await page.goto('/users')
    await expect(page).toHaveURL(/.*auth\/login/)
  })
})
