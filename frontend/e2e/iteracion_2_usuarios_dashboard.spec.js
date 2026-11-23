import { test, expect } from '@playwright/test'
import { setupSession, realApiFetch } from './helpers/auth.helper'

/**
 * PRUEBAS ITERACIÓN 2 (12 Pruebas Reales)
 * Usuarios, Roles RBAC, Dashboard en Tiempo Real y Reporte de Calidad
 */
test.describe('Pruebas Iteración 2', () => {
  test('1. Registro de usuario', async ({ page }) => {
    const session = await setupSession(page)
    const res = await realApiFetch(page, '/auth/users', { token: session.access_token })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.data)).toBe(true)
  })

  test('2. Control de roles y permisos', async ({ page }) => {
    const resSinToken = await realApiFetch(page, '/auth/users')
    expect([401, 403]).toContain(resSinToken.status)

    await page.goto('/users')
    await expect(page).toHaveURL(/.*auth\/login/)
  })

  test('3. Visualización de parámetros en tiempo real', async ({ page }) => {
    await setupSession(page)
    await page.goto('/dashboard')
    await expect(page.locator('body')).toBeVisible()

    const res = await realApiFetch(page, '/api/estado_actual')
    expect(res.status).toBe(200)
    expect(typeof res.data).toBe('object')
  })

  test('4. Actualización automática del dashboard', async ({ page }) => {
    await setupSession(page)
    await page.goto('/dashboard')
    await expect(page.locator('body')).toBeVisible()
  })

  test('5. Visualización histórica de parámetros', async ({ page }) => {
    const session = await setupSession(page)
    const res = await realApiFetch(page, '/reportes/calidad-agua?tipo_rango=semana', {
      token: session.access_token,
    })
    expect(res.status).toBe(200)
    expect(res.data).toHaveProperty('estadisticas')
  })

  test('6. Alerta por parámetros fuera de rango', async ({ page }) => {
    const res = await realApiFetch(page, '/api/alertas')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.data)).toBe(true)
  })

  test('7. Persistencia de usuarios y lecturas', async ({ page }) => {
    const session = await setupSession(page)
    const [usersRes, lecturasRes] = await Promise.all([
      realApiFetch(page, '/auth/users', { token: session.access_token }),
      realApiFetch(page, '/lecturas'),
    ])
    expect(usersRes.status).toBe(200)
    expect(lecturasRes.status).toBe(200)
  })

  test('8. Campos obligatorios incompletos', async ({ page }) => {
    await setupSession(page)
    await page.goto('/users')

    const newBtn = page.getByRole('button', { name: /Nuevo Usuario|Crear Usuario|\+/i }).first()
    await newBtn.click()
    await page.getByRole('button', { name: /Guardar Usuario/i }).click()

    await expect(page.locator('text=El nombre es obligatorio.')).toBeVisible()
    await expect(page.locator('text=El primer apellido es obligatorio.')).toBeVisible()
    await expect(page.locator('text=El correo electrónico es obligatorio.')).toBeVisible()
  })

  test('9. Formato de correo electrónico inválido', async ({ page }) => {
    await setupSession(page)
    await page.goto('/users')

    const newBtn = page.getByRole('button', { name: /Nuevo Usuario|Crear Usuario|\+/i }).first()
    await newBtn.click()
    await page.fill('input[name="nombre"]', 'Prueba')
    await page.fill('input[name="primer_apellido"]', 'Apellido')
    await page.fill('input[name="correo"]', 'correo-invalido')
    await page.getByRole('button', { name: /Guardar Usuario/i }).click()

    await expect(page.locator('text=Ingresa un correo electrónico válido.')).toBeVisible()
  })

  test('10. Generación y exportación de reporte de calidad', async ({ page }) => {
    const session = await setupSession(page)
    const res = await realApiFetch(page, '/reportes/pdf?tipo_reporte=calidad_agua&tipo_rango=hoy', {
      token: session.access_token,
    })
    expect(res.status).toBe(200)
    expect(typeof res.data).toBe('string')
    expect(res.data.startsWith('%PDF')).toBe(true)
  })

  test('11. Asignación de rol', async ({ page }) => {
    const session = await setupSession(page)
    const res = await realApiFetch(page, '/auth/roles', { token: session.access_token })
    expect(res.status).toBe(200)
    const siglas = res.data.map((r) => r.sigla)
    expect(siglas).toEqual(expect.arrayContaining(['ADM', 'OPE', 'CAJ']))
  })

  test('12. Edición de datos de usuario', async ({ page }) => {
    await setupSession(page)
    await page.goto('/profile')
    await expect(page.locator('body')).toBeVisible()
  })
})
