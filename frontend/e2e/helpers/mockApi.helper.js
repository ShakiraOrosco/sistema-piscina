/**
 * Interceptores y Mocks completos para los endpoints de la API en Playwright
 * Mapea exactamente las llamadas de Axios en api y monitoringApi:
 * - http://127.0.0.1:8000/api/v1/* (api)
 * - http://127.0.0.1:8000/api/* (monitoringApi)
 */

export async function setupApiMocks(page, overrides = {}) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }

  const state = {
    quimicos: [
      { id_quimico: 1, nombre: 'Cloro Granulado 70%', sigla: 'CL70', unidad_medida: 'kg', stock_actual: 50.0, stock_minimo: 15.0, activo: true },
      { id_quimico: 2, nombre: 'Sulfato de Cobre', sigla: 'CU', unidad_medida: 'kg', stock_actual: 8.0, stock_minimo: 10.0, activo: true }, // Crítico
      { id_quimico: 3, nombre: 'Reductor de pH (Ácido)', sigla: 'PH-', unidad_medida: 'L', stock_actual: 25.0, stock_minimo: 5.0, activo: true },
      { id_quimico: 4, nombre: 'Alguicida Concentrado Vencido', sigla: 'ALG_V', unidad_medida: 'L', stock_actual: 0.0, stock_minimo: 5.0, activo: false }
    ],
    movimientos: [
      { id_movimiento: 1, fecha_hora: new Date().toISOString(), quimico_nombre: 'Cloro Granulado 70%', sigla: 'CL70', tipo_movimiento: 'compra', cantidad: 50, unidad_medida: 'kg', observaciones: 'Ingreso inicial por compra', responsable: 'Administrador' }
    ],
    usuarios: [
      { id_usuario: 1, nombre: 'Administrador', primer_apellido: 'Playa Azul', segundo_apellido: 'General', correo: 'admin@playaazul.bo', sigla_rol: 'ADM', activo: true },
      { id_usuario: 2, nombre: 'Carlos', primer_apellido: 'Mendoza', segundo_apellido: 'Pérez', correo: 'operador@playaazul.bo', sigla_rol: 'OPE', activo: true }
    ],
    roles: [
      { id_rol: 1, sigla: 'ADM', nombre: 'Administrador General' },
      { id_rol: 2, sigla: 'OPE', nombre: 'Operador de Planta' },
      { id_rol: 3, sigla: 'CAJ', nombre: 'Cajero / Taquilla' }
    ],
    aforo: {
      aforo_actual: 12,
      aforo_maximo: 80,
      aforo_camara: 14,
      aforo_manual: 12,
      ingresos_hoy: 35,
      salidas_hoy: 23,
      ocupacion_porcentaje: 15.0
    },
    caja_historial: [
      { id_registro: 1, fecha_hora: new Date().toISOString(), tipo: 'ingreso', cantidad: 3, monto: 45.0, banista: 'Bañista General', responsable: 'caja@playaazul.bo' }
    ],
    telemetria_actual: {
      ph: 7.35,
      turbidez_ntu: 1.45,
      temperatura: 28.0,
      timestamp: new Date().toISOString(),
      estado_conexion: 'CONECTADO',
      device_id: 'ESP32_PISCINA_01',
      aforo_camara: 14,
      aforo_manual: 12,
      cooldown_activo: false
    },
    alertas: [
      { id_alerta: 1, tipo: 'warning', parametro: 'CU', mensaje: 'Sulfato de Cobre cerca del nivel mínimo', fecha_hora: new Date().toISOString() }
    ],
    auditoria_logs: [
      { id_auditoria: 1, fecha_hora: new Date().toISOString(), usuario: 'admin@playaazul.bo', modulo: 'INVENTARIO', accion: 'REGISTRO_PRODUCTO', detalle: 'Creación de insumo químico' }
    ],
    ...overrides
  }

  // Interceptar peticiones
  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = request.url()
    const method = request.method()
    const resourceType = request.resourceType()

    // No interceptar navegación HTML ni recursos estáticos del Frontend
    if (resourceType === 'document' || resourceType === 'script' || resourceType === 'stylesheet' || resourceType === 'image' || resourceType === 'font') {
      await route.continue()
      return
    }

    // Manejar preflight OPTIONS
    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders })
      return
    }

    // AUTH LOGIN
    if (url.includes('/auth/login')) {
      const postData = request.postDataJSON() || {}
      if (postData.correo === 'admin@playaazul.bo' && postData.password === 'Admin123*') {
        await route.fulfill({
          status: 200,
          headers: corsHeaders,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token: 'playwright_mock_token_admin',
            token_type: 'bearer',
            must_change_password: false,
            requiere_2fa: false,
            usuario: {
              id_usuario: 1,
              nombre: 'Administrador',
              primer_apellido: 'Playa Azul',
              correo: 'admin@playaazul.bo',
              sigla_rol: 'ADM',
              rol_nombre: 'Administrador General'
            }
          })
        })
      } else {
        await route.fulfill({
          status: 401,
          headers: corsHeaders,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Credenciales inválidas. Verifique su correo y contraseña.' })
        })
      }
      return
    }

    // AUTH USERS
    if (url.includes('/auth/users')) {
      if (method === 'GET') {
        await route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(state.usuarios) })
      } else if (method === 'POST') {
        const data = request.postDataJSON() || {}
        if (/\d/.test(data.nombre || '')) {
          await route.fulfill({ status: 400, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ detail: 'El nombre no debe contener números.' }) })
          return
        }
        if (!data.correo || !data.nombre) {
          await route.fulfill({ status: 400, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ detail: 'Complete todos los campos obligatorios.' }) })
          return
        }
        if (state.usuarios.some(u => u.correo === data.correo)) {
          await route.fulfill({ status: 400, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ detail: 'El usuario o correo ya se encuentra registrado.' }) })
          return
        }
        const newUser = { id_usuario: state.usuarios.length + 1, ...data, activo: true }
        state.usuarios.push(newUser)
        await route.fulfill({ status: 201, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ mensaje: 'Usuario registrado exitosamente', usuario: newUser }) })
      } else if (method === 'PUT') {
        await route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ mensaje: 'Usuario actualizado correctamente' }) })
      } else if (method === 'DELETE') {
        await route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ mensaje: 'Usuario eliminado del sistema' }) })
      }
      return
    }

    // AUTH ROLES
    if (url.includes('/auth/roles')) {
      await route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(state.roles) })
      return
    }

    // AUTH VALIDAR PASSWORD
    if (url.includes('/auth/validar_password')) {
      const { password } = request.postDataJSON() || {}
      if (!password || password.length < 8) {
        await route.fulfill({ status: 400, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ detail: 'La contraseña debe tener al menos 8 caracteres.' }) })
      } else {
        await route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      }
      return
    }

    // INVENTARIO QUIMICOS
    if (url.includes('/inventario/quimicos')) {
      if (method === 'GET') {
        await route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(state.quimicos) })
      } else if (method === 'POST') {
        const payload = request.postDataJSON() || {}
        if (!payload.nombre || !payload.unidad_medida) {
          await route.fulfill({ status: 422, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ detail: 'Campos obligatorios incompletos' }) })
          return
        }
        if (state.quimicos.some(q => q.nombre.toLowerCase() === payload.nombre.toLowerCase())) {
          await route.fulfill({ status: 400, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ detail: 'El producto químico ya existe en el inventario' }) })
          return
        }
        const nuevo = { id_quimico: state.quimicos.length + 1, ...payload, activo: true }
        state.quimicos.push(nuevo)
        await route.fulfill({ status: 201, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ mensaje: 'Producto químico registrado exitosamente', quimico: nuevo }) })
      }
      return
    }

    // INVENTARIO MOVIMIENTOS
    if (url.includes('/inventario/movimientos')) {
      if (method === 'GET') {
        await route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(state.movimientos) })
      } else if (method === 'POST') {
        const payload = request.postDataJSON() || {}
        const target = state.quimicos.find(q => q.id_quimico === Number(payload.id_quimico))
        if (payload.cantidad <= 0 || isNaN(payload.cantidad)) {
          await route.fulfill({ status: 400, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ detail: 'Cantidad inválida: debe ser mayor a 0' }) })
          return
        }
        if (payload.tipo_movimiento === 'dosificacion') {
          if (target && !target.activo) {
            await route.fulfill({ status: 400, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ detail: 'No se puede dosificar un producto químico inactivo o vencido' }) })
            return
          }
          if (target && payload.cantidad > target.stock_actual) {
            await route.fulfill({ status: 400, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ detail: 'Descuento superior al stock disponible. No se permiten valores negativos.' }) })
            return
          }
          if (target) target.stock_actual -= payload.cantidad
        } else if (payload.tipo_movimiento === 'compra') {
          if (target) target.stock_actual += payload.cantidad
        }
        const mov = {
          id_movimiento: state.movimientos.length + 1,
          fecha_hora: new Date().toISOString(),
          quimico_nombre: target ? target.nombre : 'Insumo',
          sigla: target ? target.sigla : 'GEN',
          tipo_movimiento: payload.tipo_movimiento,
          cantidad: payload.cantidad,
          unidad_medida: target ? target.unidad_medida : 'kg',
          observaciones: payload.observaciones || 'Registro de movimiento',
          responsable: 'Operador Activo'
        }
        state.movimientos.unshift(mov)
        await route.fulfill({ status: 201, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ mensaje: 'Movimiento registrado correctamente', movimiento: mov }) })
      }
      return
    }

    // MONITORING DASHBOARD (ESTADO ACTUAL Y ALERTAS)
    if (url.includes('/api/estado_actual') || url.includes('/monitoring/sensores') || url.includes('/monitoring/actual')) {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        contentType: 'application/json',
        body: JSON.stringify({
          ...state.telemetria_actual,
          historial_reciente: [
            { timestamp: new Date(Date.now() - 300000).toISOString(), ph: 7.30, turbidez: 1.40, temperatura: 27.9 },
            { timestamp: new Date(Date.now() - 150000).toISOString(), ph: 7.33, turbidez: 1.42, temperatura: 28.0 },
            { timestamp: new Date().toISOString(), ph: 7.35, turbidez: 1.45, temperatura: 28.0 }
          ]
        })
      })
      return
    }

    if (url.includes('/api/alertas')) {
      await route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(state.alertas) })
      return
    }

    // MONITORING CAMARA DETECCIONES
    if (url.includes('/monitoring/camara/detecciones') || url.includes('/camara/detecciones')) {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
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
      return
    }

    // MONITORING DOSIFICACIÓN PARCIAL / BOMBAS
    if (url.includes('/api/dosificacion_parcial') || url.includes('/api/dosificacion')) {
      const payload = request.postDataJSON() || {}
      if (payload.accion === 'parada_emergencia') {
        await route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ mensaje: 'Parada de emergencia activada. Bombas detenidas y cooldown de 15 minutos activado.', cooldown_activo: true }) })
      } else if (payload.simular_error_bomba) {
        await route.fulfill({ status: 503, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ detail: 'Fallo de comunicación con la bomba dosificadora. Operación abortada.' }) })
      } else {
        await route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ mensaje: 'Dosificación iniciada correctamente. Bombas activadas según cálculo.', estado_bombas: 'ACTIVAS' }) })
      }
      return
    }

    // CAJA Y AFORO
    if (url.includes('/api/caja/historial') || url.includes('/caja/historial')) {
      await route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(state.caja_historial) })
      return
    }

    if (url.includes('/api/caja/registro') || url.includes('/caja/movimiento')) {
      const data = request.postDataJSON() || {}
      if (data.tipo === 'ingreso') {
        if (state.aforo.aforo_actual + (data.cantidad || 1) > state.aforo.aforo_maximo) {
          await route.fulfill({ status: 400, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ detail: 'Aforo máximo alcanzado. No se permiten más ingresos.' }) })
          return
        }
        state.aforo.aforo_actual += data.cantidad || 1
        state.aforo.aforo_manual += data.cantidad || 1
        state.aforo.ingresos_hoy += data.cantidad || 1
      } else if (data.tipo === 'salida') {
        if (state.aforo.aforo_actual - (data.cantidad || 1) < 0) {
          await route.fulfill({ status: 400, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ detail: 'No se puede registrar salida sin ingreso previo.' }) })
          return
        }
        state.aforo.aforo_actual -= data.cantidad || 1
        state.aforo.salidas_hoy += data.cantidad || 1
      }
      await route.fulfill({ status: 201, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ mensaje: 'Aforo actualizado con éxito', aforo: state.aforo }) })
      return
    }

    if (url.includes('/caja/estado') || url.includes('/api/caja/estado')) {
      await route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(state.aforo) })
      return
    }

    if (url.includes('/caja/validar_ingreso')) {
      const data = request.postDataJSON() || {}
      if (data.dni_banista === '9482103') {
        await route.fulfill({ status: 409, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ detail: 'Ingreso duplicado detectado para el mismo usuario en este horario.' }) })
        return
      }
      if (data.edad < 0 || typeof data.boletos !== 'number') {
        await route.fulfill({ status: 400, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ detail: 'Formato incorrecto: La edad no puede ser negativa y la cantidad debe ser numérica.' }) })
        return
      }
      if (!data.nombre && !data.boletos) {
        await route.fulfill({ status: 422, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ detail: 'Faltan campos requeridos: nombre o cantidad de boletos.' }) })
        return
      }
      await route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      return
    }

    // REPORTES
    if (url.includes('/reportes/pdf') || url.includes('/reportes/exportar')) {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="reporte_playa_azul.pdf"' },
        body: '%PDF-1.4 Mock PDF Content para prueba de reporte'
      })
      return
    }

    if (url.includes('/reportes/')) {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        contentType: 'application/json',
        body: JSON.stringify({
          periodo: '2026-10',
          calidad_agua: { promedio_ph: 7.32, promedio_turbidez: 1.4, cumplimiento_norma: '98.5%' },
          consumo_quimicos: { cloro_kg: 24.5, sulfato_kg: 4.2 },
          afluencia_banistas: { total: 420, pico_maximo: 68 }
        })
      })
      return
    }

    // AUDITORÍA
    if (url.includes('/auditoria/logs')) {
      await route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(state.auditoria_logs) })
      return
    }

    // Continuar con cualquier otra petición no interceptada (scripts, estilos, vite, etc.)
    await route.continue()
  })

  return state
}

/**
 * Realiza una petición fetch dentro del contexto del navegador (Page)
 * garantizando que pase por todos los interceptores y mocks de Playwright.
 */
export async function apiFetch(page, url, options = {}) {
  return await page.evaluate(async ({ url, options }) => {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      body: options.data ? JSON.stringify(options.data) : undefined,
    })
    const text = await res.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
    return {
      status: res.status,
      ok: res.ok,
      headers: Object.fromEntries(res.headers.entries()),
      data
    }
  }, { url, options })
}
