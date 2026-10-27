from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)


def test_listar_quimicos():
    response = client.get("/api/v1/inventario/quimicos")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_listar_movimientos_y_filtro_fechas():
    # 1. Listar todos
    response = client.get("/api/v1/inventario/movimientos")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)

    # 2. Filtrar por rango de fechas amplio
    resp_fechas = client.get(
        "/api/v1/inventario/movimientos",
        params={"fecha_desde": "2026-01-01", "fecha_hasta": "2026-12-31"},
    )
    assert resp_fechas.status_code == 200
    assert isinstance(resp_fechas.json(), list)

    # 3. Filtrar por rango de fechas futuro vacío
    resp_vacio = client.get(
        "/api/v1/inventario/movimientos",
        params={"fecha_desde": "2099-01-01", "fecha_hasta": "2099-01-02"},
    )
    assert resp_vacio.status_code == 200
    assert resp_vacio.json() == []


def test_movimiento_validacion_tipo():
    # Tipo no válido
    response = client.post(
        "/api/v1/inventario/movimientos",
        json={
            "sigla_quimico": "CLO",
            "tipo_movimiento": "invalido",
            "cantidad": 10.0,
        },
    )
    assert response.status_code == 400
    assert "no válido" in response.json()["detail"].lower()


def test_flujo_movimientos_y_stock():
    # 1. Obtener lista de químicos
    resp_q = client.get("/api/v1/inventario/quimicos")
    assert resp_q.status_code == 200
    quimicos = resp_q.json()
    assert len(quimicos) > 0
    q = quimicos[0]
    sigla = q["sigla"]
    stock_inicial = float(q["stock_actual"])

    # 2. Registrar movimiento tipo Compra
    resp_compra = client.post(
        "/api/v1/inventario/movimientos",
        json={
            "sigla_quimico": sigla,
            "tipo_movimiento": "compra",
            "cantidad": 5.0,
            "observaciones": "Test unitario de compra",
        },
    )
    assert resp_compra.status_code == 201
    assert resp_compra.json()["stock_nuevo"] == stock_inicial + 5.0

    # 3. Registrar movimiento tipo Dosificación
    resp_dosif = client.post(
        "/api/v1/inventario/movimientos",
        json={
            "sigla_quimico": sigla,
            "tipo_movimiento": "dosificacion",
            "cantidad": 2.0,
            "observaciones": "Test unitario de dosificación",
        },
    )
    assert resp_dosif.status_code == 201
    assert resp_dosif.json()["stock_nuevo"] == stock_inicial + 5.0 - 2.0

    # 4. Registrar movimiento tipo Merma
    resp_merma = client.post(
        "/api/v1/inventario/movimientos",
        json={
            "sigla_quimico": sigla,
            "tipo_movimiento": "merma",
            "cantidad": 1.0,
            "observaciones": "Test unitario de merma",
        },
    )
    assert resp_merma.status_code == 201
    assert resp_merma.json()["stock_nuevo"] == stock_inicial + 5.0 - 2.0 - 1.0

    # 5. Salida con stock excesivo debe fallar con 400
    resp_exceso = client.post(
        "/api/v1/inventario/movimientos",
        json={
            "sigla_quimico": sigla,
            "tipo_movimiento": "merma",
            "cantidad": 9999999.0,
            "observaciones": "Test exceso",
        },
    )
    assert resp_exceso.status_code == 400
    assert "insuficiente" in resp_exceso.json()["detail"].lower()

