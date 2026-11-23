"""
VALIDACIÓN INTEGRAL DEL SISTEMA - PISCINA OLÍMPICA PLAYA AZUL
Suite automatizada de pruebas reales de integración y unidad contra el backend FastAPI,
servicios de autenticación, dosificación, inventario, reportes, auditoría y modelo LSTM.
Autora: Ayana Shakira Orosco Gutierrez
"""

from datetime import datetime
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.routers.auth import (
    DURACION_BLOQUEO_MINUTOS,
    MAX_INTENTOS_FALLIDOS,
    _limpiar_intentos_login,
)
from backend.app.services.auth_service import (
    generar_codigo_2fa,
    hash_password,
    verificar_password,
)
from backend.app.services.dosificacion_service import dosificacion_manager
from backend.lstm.src.prediction.prediccion_service import (
    predecir_cierre_dia,
    seleccionar_franjas,
)

client = TestClient(app)
CREDENCIALES_PRUEBA = {"correo": "shakiraog2005@gmail.com", "password": "admin1234"}


# --------------------------------------------------------------------------
# MÓDULO 1: SEGURIDAD, AUTENTICACIÓN Y ROLES (RBAC / 2FA / BLOQUEO)
# --------------------------------------------------------------------------

def test_01_autenticacion_login_exitoso():
    resp = client.post("/api/v1/auth/login", json=CREDENCIALES_PRUEBA)
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["usuario"]["correo"] == CREDENCIALES_PRUEBA["correo"]
    assert data["usuario"]["sigla_rol"] == "ADM"


def test_02_autenticacion_rechazo_credenciales_y_bloqueo_3_intentos():
    correo_prueba = "oroscoshakira43@gmail.com"
    _limpiar_intentos_login(correo_prueba)
    try:
        for _ in range(1, MAX_INTENTOS_FALLIDOS):
            resp = client.post(
                "/api/v1/auth/login",
                json={"correo": correo_prueba, "password": "PasswordErronea123"},
            )
            assert resp.status_code == 401
            assert "inválidos" in resp.json()["detail"].lower()

        # 3er intento fallido debe disparar bloqueo temporal (HTTP 429)
        resp_bloqueo = client.post(
            "/api/v1/auth/login",
            json={"correo": correo_prueba, "password": "PasswordErronea123"},
        )
        assert resp_bloqueo.status_code == 429
        assert "bloqueado" in resp_bloqueo.json()["detail"].lower()
        assert str(DURACION_BLOQUEO_MINUTOS) in resp_bloqueo.json()["detail"]
    finally:
        _limpiar_intentos_login(correo_prueba)


def test_03_autenticacion_generacion_codigo_2fa_6_digitos():
    codigo = generar_codigo_2fa()
    assert len(codigo) == 6
    assert codigo.isdigit()
    hashed = hash_password(codigo)
    assert verificar_password(codigo, hashed) is True
    assert verificar_password("000000" if codigo != "000000" else "111111", hashed) is False


def test_04_autenticacion_control_roles_rbac_endpoints_protegidos():
    # Sin token debe rechazar con 401/403
    resp_sin_token = client.get("/api/v1/auth/users")
    assert resp_sin_token.status_code in {401, 403}

    # Con token real obtenido por /login de administrador debe permitir acceso (200)
    login_resp = client.post("/api/v1/auth/login", json=CREDENCIALES_PRUEBA)
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    resp_adm = client.get(
        "/api/v1/auth/users",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp_adm.status_code == 200


def test_05_autenticacion_change_password_sin_sesion_rechazado():
    resp = client.post(
        "/api/v1/auth/change-password",
        json={
            "password_actual": "Temp1234",
            "password_nueva": "NuevaClave123!",
            "confirmar_password_nueva": "NuevaClave123!",
        },
    )
    assert resp.status_code in {401, 403}


# --------------------------------------------------------------------------
# MÓDULO 2: ADQUISICIÓN IoT, TELEMETRÍA Y SENSORES
# --------------------------------------------------------------------------

def test_06_iot_health_y_estado_actual_real():
    resp_health = client.get("/health")
    assert resp_health.status_code == 200
    assert resp_health.json()["status"] == "ok"

    resp_estado = client.get("/api/estado_actual")
    assert resp_estado.status_code == 200
    data = resp_estado.json()
    assert isinstance(data, dict)


def test_07_iot_lecturas_historicas_endpoint_real():
    resp = client.get("/lecturas")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, (list, dict))


def test_08_iot_alertas_tiempo_real():
    resp = client.get("/api/alertas")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


# --------------------------------------------------------------------------
# MÓDULO 3: VISIÓN ARTIFICIAL (YOLOv8) Y CONTROL DE AFORO
# --------------------------------------------------------------------------

def test_09_vision_roi_camara_configuracion_real():
    resp = client.get("/api/camera/roi")
    assert resp.status_code == 200
    assert isinstance(resp.json(), dict)


def test_10_vision_aforo_camara_historial_real():
    resp = client.get("/api/aforo-camara/historial")
    assert resp.status_code == 200
    data = resp.json()
    assert "registros" in data
    assert "resumen" in data


def test_11_caja_aforo_manual_historial_real():
    resp = client.get("/api/aforo-manual/historial")
    assert resp.status_code == 200
    data = resp.json()
    assert "registros" in data
    assert "resumen" in data


# --------------------------------------------------------------------------
# MÓDULO 4: MODELO PREDICTIVO RECURRENTE (LSTM)
# --------------------------------------------------------------------------

def test_12_lstm_seleccion_franjas_real():
    mediciones = [
        {"fecha_hora": datetime(2026, 10, 6, 8, 5), "ph": 7.2, "turbidez": 1.5, "temperatura": 27.5},
        {"fecha_hora": datetime(2026, 10, 6, 12, 0), "ph": 7.3, "turbidez": 1.8, "temperatura": 28.0},
        {"fecha_hora": datetime(2026, 10, 6, 16, 10), "ph": 7.4, "turbidez": 2.0, "temperatura": 28.2},
    ]
    franjas = seleccionar_franjas(mediciones)
    assert len(franjas) == 3
    assert [f["hora"] for f in franjas] == ["08:00", "12:00", "16:00"]
    assert all(f["capturada"] for f in franjas)


def test_13_lstm_prediccion_modelo_real():
    mediciones = [
        {"fecha_hora": datetime(2026, 10, 6, 8, 0), "ph": 7.25, "turbidez": 1.4, "temperatura": 27.5},
        {"fecha_hora": datetime(2026, 10, 6, 12, 0), "ph": 7.32, "turbidez": 1.7, "temperatura": 28.0},
        {"fecha_hora": datetime(2026, 10, 6, 16, 0), "ph": 7.38, "turbidez": 1.9, "temperatura": 28.1},
    ]
    resumen_parcial = {
        "ph_prom": 7.32,
        "turbidez_prom": 1.67,
        "temp_prom": 27.9,
        "banistas_total": 30,
    }
    resultado = predecir_cierre_dia(mediciones, resumen_parcial)
    assert isinstance(resultado, dict)
    assert len(resultado) > 0


def test_14_lstm_endpoint_pronostico_real():
    resp = client.get("/api/pronostico")
    assert resp.status_code == 200
    assert isinstance(resp.json(), dict)


# --------------------------------------------------------------------------
# MÓDULO 5: GESTIÓN DE INVENTARIO Y DOSIFICACIÓN DE QUÍMICOS
# --------------------------------------------------------------------------

def test_15_inventario_quimicos_catalogo_real():
    resp = client.get("/api/v1/inventario/quimicos")
    assert resp.status_code == 200
    quimicos = resp.json()
    assert isinstance(quimicos, list)
    assert len(quimicos) > 0


def test_16_dosificacion_calculo_real_cloro_y_otros():
    calc_cloro = dosificacion_manager.calcular_volumen("Cloro", 100.0)
    assert calc_cloro["litros_objetivo"] == 10.0
    assert calc_cloro["es_cloro"] is True

    calc_aluminio = dosificacion_manager.calcular_volumen("Sulfato de Aluminio", 1000.0)
    assert calc_aluminio["litros_objetivo"] == 50.0
    assert calc_aluminio["es_cloro"] is False


def test_17_dosificacion_endpoint_estado_real():
    resp = client.get("/api/dosificacion/estado")
    assert resp.status_code == 200
    data = resp.json()
    assert "activa" in data
    assert "bomba_encendida" in data


# --------------------------------------------------------------------------
# MÓDULO 6: REPORTES, ANALÍTICA Y EXPORTACIÓN PDF REAL
# --------------------------------------------------------------------------

def test_18_reportes_calidad_agua_real():
    resp = client.get("/api/v1/reportes/calidad-agua?tipo_rango=hoy")
    assert resp.status_code == 200
    data = resp.json()
    assert "estadisticas" in data
    assert "indice_global_cumplimiento" in data


def test_19_reportes_quimicos_dosificacion_real():
    resp = client.get("/api/v1/reportes/quimicos-dosificacion?tipo_rango=semana")
    assert resp.status_code == 200
    data = resp.json()
    assert "costo_total_bs" in data


def test_20_reportes_pdf_generacion_real():
    resp = client.get("/api/v1/reportes/pdf?tipo_reporte=calidad_agua&tipo_rango=hoy")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF")


# --------------------------------------------------------------------------
# MÓDULO 7: AUDITORÍA REAL
# --------------------------------------------------------------------------

def test_21_auditoria_logs_consulta_real():
    login_resp = client.post("/api/v1/auth/login", json=CREDENCIALES_PRUEBA)
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]

    resp = client.get(
        "/api/v1/auditoria/logs",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
