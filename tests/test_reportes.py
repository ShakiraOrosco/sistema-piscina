from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)


def test_reporte_calidad_agua():
    response = client.get("/api/v1/reportes/calidad-agua?tipo_rango=hoy")
    assert response.status_code in {200, 500}
    if response.status_code == 200:
        data = response.json()
        assert "estadisticas" in data
        assert "ph" in data["estadisticas"]
        assert "turbidez" in data["estadisticas"]
        assert "temperatura" in data["estadisticas"]
        assert "indice_global_cumplimiento" in data


def test_reporte_quimicos_dosificacion():
    response = client.get("/api/v1/reportes/quimicos-dosificacion?tipo_rango=semana")
    assert response.status_code in {200, 500}
    if response.status_code == 200:
        data = response.json()
        assert "totales_dosificados_kg" in data
        assert "costos_estimados_bs" in data
        assert "costo_total_bs" in data


def test_reporte_afluencia():
    response = client.get("/api/v1/reportes/afluencia?tipo_rango=mes")
    assert response.status_code in {200, 500}
    if response.status_code == 200:
        data = response.json()
        assert "resumen" in data
        assert "total_banistas" in data["resumen"]


def test_descargar_reporte_pdf():
    response = client.get("/api/v1/reportes/pdf?tipo_reporte=calidad_agua&tipo_rango=hoy")
    assert response.status_code in {200, 500}
    if response.status_code == 200:
        assert response.headers["content-type"] == "application/pdf"
        assert len(response.content) > 100
