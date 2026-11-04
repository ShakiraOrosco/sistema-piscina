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
    """Para otros químicos (ej. Sulfato de Aluminio, Sulfato de Cobre): cada 1000g son 15 litros."""
    # 1000g de sulfato de aluminio deben ser 15.0L
    c1 = dosificacion_manager.calcular_volumen("Sulfato de Aluminio", 1000.0)
    assert c1["litros_objetivo"] == 15.0
    assert c1["es_cloro"] is False
    assert c1["pulsos_estimados"] == int(15.0 * PULSOS_POR_LITRO)

    # 500g de sulfato de aluminio deben ser 7.5L
    c2 = dosificacion_manager.calcular_volumen("Sulfato de Aluminio", 500.0)
    assert c2["litros_objetivo"] == 7.5

    # 5g de sulfato de cobre deben ser 0.075L
    c3 = dosificacion_manager.calcular_volumen("Sulfato de Cobre", 5.0)
    assert c3["litros_objetivo"] == 0.075


def test_iniciar_y_detener_dosificacion():
    """Verifica que se inicie y se detenga correctamente el proceso de dosificación."""
    res_inicio = dosificacion_manager.iniciar(
        quimico="Cloro",
        cantidad_g=50.0,
        tipo="parcial",
        descontar_inventario=False
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
    assert res2.json()["litros_objetivo"] == 15.0

    # 2. Endpoint estado
    res_est = client.get("/api/dosificacion/estado")
    assert res_est.status_code == 200
    assert "activa" in res_est.json()

    # 3. Endpoint detener
    res_det = client.post("/api/dosificacion/detener", json={"motivo": "Test API"})
    assert res_det.status_code == 200
    assert res_det.json()["ok"] is True
