"""Pruebas unitarias para el módulo de dosificación de químicos y control de actuadores."""

import pytest
from backend.app.services.dosificacion_service import (
    dosificacion_manager,
    FACTOR_CLORO_L_POR_G,
    FACTOR_OTROS_L_POR_G,
    PULSOS_POR_LITRO,
)


def test_calculo_volumen_cloro():
    """Para cloro: cada 100g son 10 litros (0.10 L/g)."""
    # 100g de cloro deben ser 10.0L
    c1 = dosificacion_manager.calcular_volumen("Cloro", 100.0)
    assert c1["litros_objetivo"] == 10.0
    assert c1["es_cloro"] is True
    assert c1["pulsos_estimados"] == int(10.0 * PULSOS_POR_LITRO)

    # 25g de cloro deben ser 2.5L
    c2 = dosificacion_manager.calcular_volumen("Cloro", 25.0)
    assert c2["litros_objetivo"] == 2.5

    # 50g de cloro deben ser 5.0L
    c3 = dosificacion_manager.calcular_volumen("cloro liquido", 50.0)
    assert c3["litros_objetivo"] == 5.0


def test_calculo_volumen_otros_quimicos():
    """Para otros químicos (ej. Sulfato de Aluminio, Sulfato de Cobre): cada 1000g son 50 litros."""
    # 1000g de sulfato de aluminio deben ser 50.0L
    c1 = dosificacion_manager.calcular_volumen("Sulfato de Aluminio", 1000.0)
    assert c1["litros_objetivo"] == 50.0
    assert c1["es_cloro"] is False
    assert c1["pulsos_estimados"] == int(50.0 * PULSOS_POR_LITRO)

    # 500g de sulfato de aluminio deben ser 25.0L
    c2 = dosificacion_manager.calcular_volumen("Sulfato de Aluminio", 500.0)
    assert c2["litros_objetivo"] == 25.0

    # 5g de sulfato de cobre deben ser 0.25L
    c3 = dosificacion_manager.calcular_volumen("Sulfato de Cobre", 5.0)
    assert c3["litros_objetivo"] == 0.25


def test_iniciar_y_detener_dosificacion():
    """Verifica que se inicie y se detenga correctamente el proceso de dosificación."""
    res_inicio = dosificacion_manager.iniciar(
        quimico="Cloro",
        cantidad_g=50.0,
        tipo="parcial",
        descontar_inventario=False,
        validar_cuota_maxima=False
    )
    assert res_inicio["ok"] is True
    assert res_inicio["calculo"]["litros_objetivo"] == 5.0

    estado = dosificacion_manager.obtener_estado()
    assert estado["activa"] is True
    assert estado["bomba_encendida"] is True
    assert estado["valvula_abierta"] is True
    assert estado["litros_objetivo"] == 5.0

    # Detener de emergencia
    res_stop = dosificacion_manager.detener("Prueba unitaria de parada")
    assert res_stop["ok"] is True

    estado_fin = dosificacion_manager.obtener_estado()
    assert estado_fin["activa"] is False
    assert estado_fin["bomba_encendida"] is False
    assert estado_fin["valvula_abierta"] is False


def test_api_endpoints_dosificacion():
    """Prueba las llamadas HTTP a los endpoints de dosificación."""
    from fastapi.testclient import TestClient
    from backend.app.main import app

    client = TestClient(app)

    # 1. Endpoint calcular
    res = client.get("/api/dosificacion/calcular?quimico=Cloro&cantidad_g=100")
    assert res.status_code == 200
    data = res.json()
    assert data["litros_objetivo"] == 10.0
    assert data["es_cloro"] is True

    res2 = client.get("/api/dosificacion/calcular?quimico=Sulfato+de+Aluminio&cantidad_g=1000")
    assert res2.status_code == 200
    assert res2.json()["litros_objetivo"] == 50.0

    # 2. Endpoint estado
    res_est = client.get("/api/dosificacion/estado")
    assert res_est.status_code == 200
    assert "activa" in res_est.json()

    # 3. Endpoint detener
    res_det = client.post("/api/dosificacion/detener", json={"motivo": "Test API"})
    assert res_det.status_code == 200
    assert res_det.json()["ok"] is True


def test_aluminio_solo_en_dosificacion_final():
    """El Sulfato de Aluminio solo debe permitirse en tipo='final', no en tipo='parcial'."""
    # Intentar como parcial debe fallar
    res_parcial = dosificacion_manager.iniciar(
        quimico="Sulfato de Aluminio",
        cantidad_g=100.0,
        tipo="parcial",
        descontar_inventario=False,
        validar_cuota_maxima=False
    )
    assert res_parcial["ok"] is False
    assert "solo se puede aplicar en la Dosificación Final" in res_parcial["error"]

    # Intentar como final debe tener éxito
    res_final = dosificacion_manager.iniciar(
        quimico="Sulfato de Aluminio",
        cantidad_g=100.0,
        tipo="final",
        descontar_inventario=False,
        validar_cuota_maxima=False
    )
    assert res_final["ok"] is True
    assert res_final["calculo"]["litros_objetivo"] == 5.0

    # Limpiar estado
    dosificacion_manager.detener("Fin prueba aluminio")


def test_notificacion_falla_monitoreo_y_dosificacion(monkeypatch):
    """Verifica que ante una falla de monitoreo o de dosificación se dispare la alerta a Correo y WhatsApp."""
    from fastapi.testclient import TestClient
    from backend.app.main import app
    from backend.app.services import notificacion_service

    envios_correo = []
    envios_whatsapp = []

    def mock_correo(**kwargs):
        envios_correo.append(kwargs)
        return {"enviado": True, "destinatarios": ["admin@piscina.com"]}

    def mock_whatsapp(**kwargs):
        envios_whatsapp.append(kwargs)
        return {"enviado": True, "telefono": "+59170000000"}

    monkeypatch.setattr(notificacion_service, "enviar_correo_alerta", mock_correo)
    monkeypatch.setattr(notificacion_service, "enviar_whatsapp_alerta", mock_whatsapp)
    notificacion_service.limpiar_cooldown_falla()

    # 1. Notificación síncrona directa por falla de sensor de monitoreo
    res = notificacion_service.notificar_falla_dispositivo(
        clave_falla="sensor_ph_sin_dato",
        titulo="Falla en Sensor de pH",
        modulo="Monitoreo",
        dispositivo="Sensor de pH (ESP32)",
        detalle="El sensor de pH no envió dato (NULL).",
        en_background=False,
    )
    assert res is not None
    assert res["correo"]["enviado"] is True
    assert res["whatsapp"]["enviado"] is True
    assert len(envios_correo) == 1
    assert len(envios_whatsapp) == 1

    # 2. Cooldown activo evita duplicar envío inmediato con la misma clave
    res_dup = notificacion_service.notificar_falla_dispositivo(
        clave_falla="sensor_ph_sin_dato",
        titulo="Falla en Sensor de pH",
        modulo="Monitoreo",
        dispositivo="Sensor de pH (ESP32)",
        detalle="El sensor de pH no envió dato (NULL).",
        en_background=False,
    )
    assert res_dup is None
    assert len(envios_correo) == 1

    # 3. Endpoint de reporte de falla de dosificación y reflejo en alertas del dashboard
    client = TestClient(app)
    res_api = client.post(
        "/api/dosificacion/reportar-falla",
        json={
            "dispositivo": "Bomba Dosificadora Pin 26",
            "detalle": "Sin respuesta del relé de la bomba dosificadora",
        },
    )
    assert res_api.status_code == 200
    assert res_api.json()["ok"] is True

    estado_actual = dosificacion_manager.obtener_estado()
    assert "Sin respuesta del relé" in (estado_actual.get("error_hardware") or "")

    # Limpiar error de hardware para no afectar otras pruebas
    with dosificacion_manager._lock:
        dosificacion_manager.estado["error_hardware"] = None
        dosificacion_manager.estado["modo"] = "listo"

