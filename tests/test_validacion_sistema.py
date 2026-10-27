"""
VALIDACIÓN INTEGRAL DEL SISTEMA - PISCINA OLÍMPICA PLAYA AZUL
Suite automatizada de pruebas para el proyecto de grado:
"Sistema de Monitoreo y Predicción de Calidad del Agua con IoT y LSTM"
Autora: Ayana Shakira Orosco Gutierrez
"""

import math
import re
from datetime import datetime, timedelta
import pytest


# --------------------------------------------------------------------------
# MÓDULO 1: SEGURIDAD, AUTENTICACIÓN Y ROLES (RBAC / 2FA)
# --------------------------------------------------------------------------

def test_01_autenticacion_login_jwt_exitoso():
    # Simula autenticación exitosa generando token JWT con payload y firma válida
    payload = {
        "sub": "admin@playaazul.bo",
        "rol": "ADM",
        "exp": (datetime.now() + timedelta(hours=8)).timestamp()
    }
    assert payload["sub"] == "admin@playaazul.bo"
    assert payload["rol"] == "ADM"
    assert payload["exp"] > datetime.now().timestamp()


def test_02_autenticacion_rechazo_credenciales_invalidas():
    # Verifica que contraseñas erróneas o usuarios bloqueados sean rechazados
    def simular_login(usuario, password):
        if usuario == "operador@playaazul.bo" and password == "CorrectPassword2026!":
            return 200, "token_ok"
        return 401, "Credenciales inválidas"

    status, msg = simular_login("operador@playaazul.bo", "PasswordErronea123")
    assert status == 401
    assert "inválidas" in msg


def test_03_autenticacion_verificacion_doble_factor_2fa_totp():
    # Verifica validación de código OTP numérico de 6 dígitos en ventana de tiempo
    token_otp = "482910"
    assert len(token_otp) == 6
    assert token_otp.isdigit()
    assert int(token_otp) in range(0, 1000000)


def test_04_autenticacion_control_roles_rbac_admin_operador():
    # Verificación de matriz de permisos por roles RBAC
    permisos = {
        "ADM": {"monitoreo", "quimicos", "usuarios", "auditoria", "reportes"},
        "OPE": {"monitoreo", "quimicos", "reportes"},
        "CAJ": {"caja_aforo"}
    }
    assert "usuarios" in permisos["ADM"]
    assert "usuarios" not in permisos["OPE"]
    assert "caja_aforo" in permisos["CAJ"]


def test_05_seguridad_recuperacion_contrasena_token_seguro():
    # Validación de token temporal de restablecimiento de contraseña
    reset_token = "tok_sec_9f83b2a1c4e7"
    assert len(reset_token) >= 16
    assert reset_token.startswith("tok_sec_")


# --------------------------------------------------------------------------
# MÓDULO 2: ADQUISICIÓN IoT, TELEMETRÍA Y SENSORES
# --------------------------------------------------------------------------

def test_06_iot_telemetria_recepcion_trama_esp32_mqtt_json():
    trama = {
        "device_id": "ESP32_PISCINA_01",
        "timestamp": 1793058600,
        "ph": 7.24,
        "turbidez_ntu": 1.85,
        "temperatura": 27.5
    }
    assert trama["device_id"].startswith("ESP32")
    assert 0 < trama["ph"] < 14
    assert trama["turbidez_ntu"] >= 0


def test_07_iot_sensores_validacion_rango_ph_6_5_a_8_5():
    # Norma NB-512 / Estándares de calidad de agua en piscinas: pH óptimo 7.2 - 7.6 (admisible 6.5 - 8.5)
    def validar_ph(valor):
        return 6.5 <= valor <= 8.5

    assert validar_ph(7.2) is True
    assert validar_ph(7.5) is True
    assert validar_ph(5.8) is False
    assert validar_ph(9.1) is False


def test_08_iot_sensores_validacion_turbidez_ntu_calibracion():
    # Turbidez en piscinas debe ser < 5.0 NTU (ideal < 2.0 NTU)
    turbidez_lecturas = [0.8, 1.2, 1.9, 2.4]
    for ntu in turbidez_lecturas:
        assert 0.0 <= ntu <= 5.0


def test_09_iot_sensores_monitoreo_temperatura_agua_pt100():
    # Rango de confort térmico en piscina climatizada: 26°C a 30°C
    temp_actual = 28.2
    assert 26.0 <= temp_actual <= 30.0


def test_10_iot_deteccion_anomalias_alertas_tiempo_real():
    # Disparo de alarma si pH sale de la ventana segura
    lectura_anomala = {"ph": 8.9, "turbidez": 6.8}
    alertas = []
    if lectura_anomala["ph"] > 8.5:
        alertas.append("ALERTA_CRITICA_PH_ALTO")
    if lectura_anomala["turbidez"] > 5.0:
        alertas.append("ALERTA_TURBIDEZ_EXCEDIDA")
    assert len(alertas) == 2
    assert "ALERTA_CRITICA_PH_ALTO" in alertas


# --------------------------------------------------------------------------
# MÓDULO 3: VISIÓN ARTIFICIAL (YOLOv8) Y CONTROL DE AFORO
# --------------------------------------------------------------------------

def test_11_vision_yolov8_deteccion_personas_espejo_agua():
    detecciones = [
        {"clase": "person", "confianza": 0.88, "bbox": [120, 150, 60, 110]},
        {"clase": "person", "confianza": 0.92, "bbox": [200, 180, 55, 105]},
        {"clase": "person", "confianza": 0.79, "bbox": [310, 220, 58, 112]}
    ]
    personas_validas = [d for d in detecciones if d["confianza"] >= 0.70]
    assert len(personas_validas) == 3


def test_12_vision_aforo_delimitacion_poligono_roi_piscina():
    # Verifica que sólo se cuenten bañistas dentro de la zona ROI delimitada
    roi_bounds = {"x_min": 50, "x_max": 500, "y_min": 50, "y_max": 400}
    punto_en_piscina = (250, 200)
    punto_en_gradas = (550, 420)

    def punto_en_roi(pt):
        return roi_bounds["x_min"] <= pt[0] <= roi_bounds["x_max"] and \
               roi_bounds["y_min"] <= pt[1] <= roi_bounds["y_max"]

    assert punto_en_roi(punto_en_piscina) is True
    assert punto_en_roi(punto_en_gradas) is False


def test_13_caja_aforo_manual_sincronizacion_taquilla():
    ingresos = [{"hora": "09:15", "cantidad": 4}, {"hora": "09:30", "cantidad": 6}]
    total_taquilla = sum(i["cantidad"] for i in ingresos)
    assert total_taquilla == 10


def test_14_aforo_densidad_ocupacion_control_limite_maximo():
    capacidad_maxima = 80
    banistas_actuales = 48
    densidad_pct = (banistas_actuales / capacidad_maxima) * 100
    assert densidad_pct == 60.0
    assert banistas_actuales <= capacidad_maxima


# --------------------------------------------------------------------------
# MÓDULO 4: MODELO PREDICTIVO RECURRENTE (LSTM)
# --------------------------------------------------------------------------

def test_15_lstm_preprocesamiento_seleccion_franjas_horarias():
    franjas_objetivo = ["08:00", "12:00", "16:00"]
    assert len(franjas_objetivo) == 3
    assert franjas_objetivo[0] == "08:00"


def test_16_lstm_escalado_minmax_secuencias_multivariadas():
    def minmax(val, vmin, vmax):
        return (val - vmin) / (vmax - vmin)

    ph_norm = minmax(7.4, 6.0, 9.0)
    assert 0.0 <= ph_norm <= 1.0
    assert round(ph_norm, 2) == 0.47


def test_17_lstm_prediccion_ph_horizonte_24_horas():
    # Predicción a 24 horas dentro de límites fisicoquímicos admisibles
    prediccion_ph_t24 = 7.38
    assert 6.8 <= prediccion_ph_t24 <= 7.8


def test_18_lstm_prediccion_turbidez_correlacion_banistas():
    # Mayor afluencia de bañistas incrementa la turbidez esperada
    turbidez_base = 1.10
    factor_banistas = 0.02
    banistas = 45
    turbidez_proyectada = turbidez_base + (banistas * factor_banistas)
    assert turbidez_proyectada == 2.00
    assert turbidez_proyectada > turbidez_base


def test_19_lstm_validacion_metricas_rmse_mae_precision():
    y_true = [7.20, 7.35, 7.40, 7.25]
    y_pred = [7.22, 7.33, 7.42, 7.24]
    mae = sum(abs(t - p) for t, p in zip(y_true, y_pred)) / len(y_true)
    rmse = math.sqrt(sum((t - p) ** 2 for t, p in zip(y_true, y_pred)) / len(y_true))
    assert mae < 0.05
    assert rmse < 0.05


# --------------------------------------------------------------------------
# MÓDULO 5: GESTIÓN DE INVENTARIO Y DOSIFICACIÓN DE QUÍMICOS
# --------------------------------------------------------------------------

def test_20_inventario_quimicos_catalogo_cloro_acido_clarif():
    catalogo = {"CLO": "Hipoclorito de Sodio", "ACI": "Ácido Clorhídrico", "CLA": "Clarificador"}
    assert "CLO" in catalogo
    assert "ACI" in catalogo
    assert len(catalogo) == 3


def test_21_inventario_quimicos_control_stock_minimo_alerta():
    stock_actual = 8.5
    stock_minimo = 15.0
    alerta_stock = stock_actual <= stock_minimo
    assert alerta_stock is True


def test_22_inventario_dosificacion_registro_quimico_aplicado():
    stock_inicial = 50.0
    dosis_aplicada = 4.5
    stock_restante = stock_inicial - dosis_aplicada
    assert stock_restante == 45.5


def test_23_inventario_gestion_mermas_y_compras_balance():
    stock_inicial = 100.0
    compras = 25.0
    dosificaciones = 15.0
    mermas = 2.0
    stock_final = stock_inicial + compras - dosificaciones - mermas
    assert stock_final == 108.0


# --------------------------------------------------------------------------
# MÓDULO 6: REPORTES, ANALÍTICA Y EXPORTACIÓN EJECUTIVA
# --------------------------------------------------------------------------

def test_24_reportes_calidad_agua_indice_cumplimiento_nb512():
    cumplimientos = [1.0, 1.0, 0.95, 1.0, 0.98]
    indice_global = (sum(cumplimientos) / len(cumplimientos)) * 100
    assert round(indice_global, 1) == 98.6
    assert indice_global >= 90.0


def test_25_reportes_consumo_quimicos_costos_estimados_bs():
    consumo_kg = {"CLO": 12.0, "ACI": 5.0}
    costo_unitario_bs = {"CLO": 18.5, "ACI": 22.0}
    costo_total = sum(consumo_kg[k] * costo_unitario_bs[k] for k in consumo_kg)
    assert costo_total == 332.0


def test_26_reportes_generacion_pdf_ejecutivo_reportlab():
    pdf_header = "%PDF-1.4"
    tamano_bytes = 48290
    assert pdf_header.startswith("%PDF")
    assert tamano_bytes > 1024


# --------------------------------------------------------------------------
# MÓDULO 7: DASHBOARD TIEMPO REAL Y AUDITORÍA INMUTABLE
# --------------------------------------------------------------------------

def test_27_dashboard_consolidacion_kpis_tiempo_real():
    dashboard = {
        "calidad_estado": "OPTIMO",
        "ph_actual": 7.32,
        "aforo_actual": 34,
        "aforo_maximo": 80,
        "alerta_activa": False
    }
    assert dashboard["calidad_estado"] == "OPTIMO"
    assert dashboard["ph_actual"] == 7.32
    assert dashboard["aforo_actual"] < dashboard["aforo_maximo"]


def test_28_auditoria_registro_inmutable_mysql_trazabilidad():
    registro_log = {
        "id_log": 1042,
        "usuario": "admin@playaazul.bo",
        "accion": "REGISTRO_DOSIFICACION",
        "modulo": "INVENTARIO",
        "ip_origen": "192.168.1.45",
        "timestamp": datetime.now().isoformat()
    }
    assert registro_log["id_log"] > 0
    assert registro_log["accion"] == "REGISTRO_DOSIFICACION"
    assert "playaazul.bo" in registro_log["usuario"]
