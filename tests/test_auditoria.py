from datetime import date
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.routers.auth import administrador_actual

client = TestClient(app)


def setup_module():
    app.dependency_overrides[administrador_actual] = lambda: {
        "id_usuario": 1,
        "sigla_rol": "ADM",
        "correo": "admin@example.com",
    }


def teardown_module():
    app.dependency_overrides.pop(administrador_actual, None)


def test_listar_logs_auditoria_general():
    response = client.get("/api/v1/auditoria/logs")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_listar_logs_auditoria_filtro_fecha_hoy():
    hoy = date.today().isoformat()
    response = client.get("/api/v1/auditoria/logs", params={"fecha": hoy})
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    # Todos los logs devueltos deben pertenecer al día de hoy
    for log in data:
        if log.get("fecha_hora"):
            assert log["fecha_hora"].startswith(hoy)


def test_listar_logs_auditoria_filtro_fecha_futura_vacia():
    response = client.get("/api/v1/auditoria/logs", params={"fecha": "2099-12-31"})
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 0
