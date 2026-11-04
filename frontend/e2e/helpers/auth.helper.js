/**
 * Helper para autenticación rápida e inyección de sesiones en Playwright
 * para el Sistema de Piscina Olímpica Playa Azul
 */

export const USERS = {
  admin: {
    access_token: 'playwright_mock_token_admin',
    token_type: 'bearer',
    usuario: {
      id_usuario: 1,
      nombre: 'Administrador',
      primer_apellido: 'Playa Azul',
      correo: 'admin@playaazul.bo',
      sigla_rol: 'ADM',
      rol_nombre: 'Administrador General'
    }
  },
  operador: {
    access_token: 'playwright_mock_token_operador',
    token_type: 'bearer',
    usuario: {
      id_usuario: 2,
      nombre: 'Operador',
      primer_apellido: 'Piscina',
      correo: 'operador@playaazul.bo',
      sigla_rol: 'OPE',
      rol_nombre: 'Operador de Planta'
    }
  },
  cajero: {
    access_token: 'playwright_mock_token_cajero',
    token_type: 'bearer',
    usuario: {
      id_usuario: 3,
      nombre: 'Cajero',
      primer_apellido: 'Taquilla',
      correo: 'caja@playaazul.bo',
      sigla_rol: 'CAJ',
      rol_nombre: 'Cajero / Taquilla'
    }
  }
}

/**
 * Inyecta una sesión activa en el localStorage del navegador antes de cargar la página
 * @param {import('@playwright/test').Page} page
 * @param {'admin'|'operador'|'cajero'} role
 */
export async function setupSession(page, role = 'admin') {
  const sessionData = USERS[role] || USERS.admin
  await page.addInitScript((session) => {
    localStorage.setItem('piscina_session', JSON.stringify(session))
    localStorage.setItem('piscina_last_activity', Date.now().toString())
  }, sessionData)
}
