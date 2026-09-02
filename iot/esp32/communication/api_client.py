import json
import urequests


class ApiClient:
    """Cliente HTTP para enviar lecturas al backend FastAPI."""

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def send_reading(self, payload):
        if not isinstance(payload, dict):
            return 400, {"error": "Payload inválido"}

        data = dict(payload)
        if "turbidez" not in data and "ntu" in data:
            data["turbidez"] = data["ntu"]

        headers = {"Content-Type": "application/json"}

        try:
            response = urequests.post(
                f"{self.base_url}/lecturas",
                data=json.dumps(data),
                headers=headers,
                timeout=10,
            )
            try:
                body = response.json()
            except Exception:
                body = {"raw": response.text}

            status = response.status_code
            response.close()
            return status, body
        except Exception as exc:
            return -1, {
                "error": "Fallo de conexión HTTP",
                "detalle": str(exc),
            }
