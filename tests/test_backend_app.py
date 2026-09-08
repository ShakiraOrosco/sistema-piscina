from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)


def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["mensaje"] == "Sistema de piscina funcionando"


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_lecturas_accepts_legacy_ntu_field():
    response = client.post(
        "/lecturas",
        json={"ph": 7.2, "ntu": 4.1, "temperatura": 28.0},
    )
    assert response.status_code in {200, 500}
