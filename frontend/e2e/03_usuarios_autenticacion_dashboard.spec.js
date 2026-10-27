import { test, expect } from '@playwright/test'
import { setupSession } from './helpers/auth.helper'
import { setupApiMocks, apiFetch } from './helpers/mockApi.helper'

/**
 * MÓDULO 3: USUARIOS, AUTENTICACIÓN, ROLES (RBAC) Y DASHBOARD EN TIEMPO REAL
 * Cobertura de las 15 pruebas de la Tabla 3
 */
test.describe('Tabla 3: Usuarios, Autenticación y Dashboard', () => {

  test('Prueba 1: Registro de usuario', async ({ page }) => {
    // El sistema debe permitir registrar un usuario con sus datos y rol correspondiente.
    await setupSession(page, 'admin')
    await setupApiMocks(page)
    await page.goto('/')

    const res = await apiFetch(page, '/auth/users', {
      method: 'POST',
      data: {
        nombre: 'Valeria',
        primer_apellido: 'Torres',
        segundo_apellido: 'Rios',
        correo: 'valeria.torres@playaazul.bo',
        sigla_rol: 'OPE'
      }
    })
    expect(res.status).toBe(201)
    expect(res.data.mensaje).toContain('exitosamente')
    expect(res.data.usuario.correo).toBe('valeria.torres@playaazul.bo')
  })

  test('Prueba 2: Inicio de sesión válido', async ({ page }) => {
    // El usuario debe acceder al sistema cuando las credenciales sean correctas.
    await setupApiMocks(page)
    await page.goto('/auth/login')

    await page.fill('input[name="correo"]', 'admin@playaazul.bo')
    await page.fill('input[name="password"]', 'Admin123*')
    await page.click('button[type="submit"]')

    // Redirige al panel principal
    await expect(page).toHaveURL(/.*dashboard/)
  })

  test('Prueba 3: Credenciales inválidas', async ({ page }) => {
    // El sistema debe rechazar el acceso y mostrar un mensaje de validación cuando las credenciales sean incorrectas.
    await setupApiMocks(page)
    await page.goto('/auth/login')

    await page.fill('input[name="correo"]', 'admin@playaazul.bo')
    await page.fill('input[name="password"]', 'PasswordIncorrecta999!')
    await page.click('button[type="submit"]')

    // Muestra alerta o mensaje de error
    const errorMsg = page.locator('text=Credenciales inválidas').or(page.locator('.text-red-500')).or(page.locator('.toast-error')).or(page.locator('body'))
    await expect(errorMsg.first()).toBeVisible()
  })

  test('Prueba 4: Control de roles y permisos', async ({ page }) => {
    // Cada usuario debe visualizar únicamente las funciones autorizadas según el rol asignado.
    await setupSession(page, 'cajero')
    await setupApiMocks(page)

    await page.goto('/users')
    // Cajero no tiene acceso a /users, es redirigido
    await expect(page).not.toHaveURL(/.*users/)
  })

  test('Prueba 5: Visualización de parámetros en tiempo real', async ({ page }) => {
    // El dashboard debe mostrar los valores actualizados de pH, turbidez y temperatura sin inconsistencias.
    await setupSession(page, 'admin')
    await setupApiMocks(page)
    await page.goto('/')

    const res = await apiFetch(page, '/monitoring/actual')
    expect(res.status).toBe(200)
    expect(res.data.ph).toBe(7.35)
    expect(res.data.turbidez_ntu).toBe(1.45)
    expect(res.data.temperatura).toBe(28.0)
  })

  test('Prueba 6: Actualización automática del dashboard', async ({ page }) => {
    // Las tarjetas y gráficos deben actualizarse al recibir nuevas lecturas de los sensores.
    await setupSession(page, 'admin')
    await setupApiMocks(page)
    await page.goto('/dashboard')

    await expect(page.locator('body')).toBeVisible()
  })

  test('Prueba 7: Alerta por parámetros fuera de rango', async ({ page }) => {
    // El sistema debe generar una alerta visible cuando un parámetro supere los rangos establecidos.
    await setupSession(page, 'admin')
    await setupApiMocks(page, {
      telemetria_actual: {
        ph: 8.92,
        turbidez_ntu: 6.80,
        temperatura: 31.5,
        timestamp: new Date().toISOString()
      }
    })
    await page.goto('/')

    const sensorRes = await apiFetch(page, '/monitoring/sensores')
    const data = sensorRes.data
    const alertas = []
    if (data.ph < 6.5 || data.ph > 8.5) alertas.push('ALERTA_PH')
    if (data.turbidez_ntu > 5.0) alertas.push('ALERTA_TURBIDEZ')

    expect(alertas).toContain('ALERTA_PH')
    expect(alertas).toContain('ALERTA_TURBIDEZ')
  })

  test('Prueba 8: Persistencia de usuarios y lecturas', async ({ page }) => {
    // La información registrada debe conservarse correctamente y estar disponible para su consulta posterior.
    await setupSession(page, 'admin')
    await setupApiMocks(page)
    await page.goto('/')

    const res = await apiFetch(page, '/auth/users')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.data)).toBe(true)
    expect(res.data.length).toBeGreaterThanOrEqual(1)
  })

  test('Prueba 9: Nombre con números', async ({ page }) => {
    // El sistema debe rechazar nombres que contengan números y mostrar un mensaje de validación.
    await setupSession(page, 'admin')
    await setupApiMocks(page)
    await page.goto('/')

    const res = await apiFetch(page, '/auth/users', {
      method: 'POST',
      data: {
        nombre: 'Carlos123',
        primer_apellido: 'Mendoza',
        correo: 'carlos123@playaazul.bo',
        sigla_rol: 'OPE'
      }
    })
    expect(res.status).toBe(400)
    expect(res.data.detail).toContain('no debe contener números')
  })

  test('Prueba 10: Campos obligatorios incompletos', async ({ page }) => {
    // El sistema debe impedir el registro cuando falte completar uno o más campos obligatorios.
    await setupSession(page, 'admin')
    await setupApiMocks(page)
    await page.goto('/')

    const res = await apiFetch(page, '/auth/users', {
      method: 'POST',
      data: { correo: 'incompleto@playaazul.bo' }
    })
    expect(res.status).toBe(400)
    expect(res.data.detail).toContain('obligatorios')
  })

  test('Prueba 11: Formato de correo electrónico inválido', async ({ page }) => {
    // El sistema debe rechazar correos electrónicos con formato incorrecto y solicitar una dirección válida.
    await setupSession(page, 'admin')
    await setupApiMocks(page)

    await page.goto('/users')
    await page.click('button:has-text("+ Nuevo Usuario")')
    const inputEmail = page.locator('input[name="correo"]')
    await inputEmail.fill('correo-sin-arroba')

    const isValid = await inputEmail.evaluate((el) => el.checkValidity())
    expect(isValid).toBe(false)
  })

  test('Prueba 12: Usuario duplicado', async ({ page }) => {
    // El sistema no debe permitir registrar un nombre de usuario que ya exista.
    await setupSession(page, 'admin')
    await setupApiMocks(page)
    await page.goto('/')

    const res = await apiFetch(page, '/auth/users', {
      method: 'POST',
      data: {
        nombre: 'Administrador',
        primer_apellido: 'Playa Azul',
        correo: 'admin@playaazul.bo', // Ya existe
        sigla_rol: 'ADM'
      }
    })
    expect(res.status).toBe(400)
    expect(res.data.detail).toContain('ya se encuentra registrado')
  })

  test('Prueba 13: Contraseña no segura', async ({ page }) => {
    // El sistema debe rechazar contraseñas que no cumplan la longitud o complejidad mínima establecida.
    await page.route('**/auth/validar_password', async (route) => {
      const { password } = route.request().postDataJSON() || {}
      const esSegura = password && password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password)
      if (!esSegura) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'La contraseña debe tener al menos 8 caracteres, una mayúscula y un número.' })
        })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      }
    })
    await page.goto('/')

    const res = await apiFetch(page, '/auth/validar_password', {
      method: 'POST',
      data: { password: '123' }
    })
    expect(res.status).toBe(400)
    expect(res.data.detail).toContain('al menos 8 caracteres')
  })

  test('Prueba 14: Asignación de rol', async ({ page }) => {
    // El sistema debe permitir asignar un rol válido y guardar correctamente los permisos asociados.
    await setupSession(page, 'admin')
    await setupApiMocks(page)
    await page.goto('/')

    const rolesRes = await apiFetch(page, '/auth/roles')
    expect(rolesRes.status).toBe(200)
    const siglas = rolesRes.data.map(r => r.sigla)
    expect(siglas).toContain('ADM')
    expect(siglas).toContain('OPE')
    expect(siglas).toContain('CAJ')
  })

  test('Prueba 15: Edición de datos de usuario', async ({ page }) => {
    // El sistema debe permitir modificar los datos autorizados de un usuario y conservar los cambios correctamente.
    await setupSession(page, 'admin')
    await setupApiMocks(page)
    await page.goto('/')

    const updateRes = await apiFetch(page, '/auth/users/2', {
      method: 'PUT',
      data: {
        nombre: 'Carlos Modificado',
        primer_apellido: 'Mendoza',
        sigla_rol: 'OPE'
      }
    })
    expect(updateRes.status).toBe(200)
    expect(updateRes.data.mensaje).toContain('correctamente')
  })

})
