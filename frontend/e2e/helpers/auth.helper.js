export const API_BASE_V1 = 'http://127.0.0.1:8000/api/v1'
export const API_BASE_ROOT = 'http://127.0.0.1:8000'

export const TEST_CREDENTIALS = {
  correo: process.env.E2E_USER_EMAIL || 'shakiraog2005@gmail.com',
  password: process.env.E2E_USER_PASSWORD || 'admin1234',
}

let cachedSession = null

/**
 * Inicia sesión real contra POST /api/v1/auth/login (sin tokens falsos ni mocks)
 * e inyecta la sesión real devuelta por el backend en localStorage.
 */
export async function setupSession(page) {
  if (!cachedSession) {
    const response = await page.request.post(`${API_BASE_V1}/auth/login`, {
      data: TEST_CREDENTIALS,
    })

    if (!response.ok()) {
      throw new Error(`Login E2E fallido (${response.status()}): ${await response.text()}`)
    }

    cachedSession = await response.json()
  }

  await page.addInitScript((session) => {
    localStorage.setItem('piscina_session', JSON.stringify(session))
    localStorage.setItem('piscina_last_activity', Date.now().toString())
  }, cachedSession)

  return cachedSession
}

/**
 * Ejecuta una petición HTTP real contra el backend FastAPI (sin mocks).
 */
export async function realApiFetch(page, endpoint, options = {}) {
  const isRootEndpoint = endpoint.startsWith('/api/') && !endpoint.startsWith('/api/v1/')
  const baseUrl = (isRootEndpoint || endpoint === '/health' || endpoint === '/lecturas')
    ? API_BASE_ROOT
    : API_BASE_V1
  const url = `${baseUrl}${endpoint}`
  const method = (options.method || 'GET').toUpperCase()
  const headers = { ...(options.headers || {}) }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`
  }

  const response = await page.request.fetch(url, {
    method,
    headers,
    data: options.data,
  })

  let data = null
  const contentType = response.headers()['content-type'] || ''
  if (contentType.includes('application/json')) {
    data = await response.json()
  } else {
    data = await response.text()
  }

  return { status: response.status(), data }
}
