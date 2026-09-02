"""Firmware principal del ESP32.

Este archivo queda en la carpeta IoT y constituye el punto de entrada del
hardware, mientras que la API y la base de datos quedan en backend.
"""

from wifi.wifi_manager import WiFiManager
from sensors.pool_sensors import PoolSensors
from communication.api_client import ApiClient


SSID = "HONOR.Ayana"
PASSWORD = "12345hola"
API_URL = "http://10.140.108.219:8000/lecturas"


wifi = WiFiManager(SSID, PASSWORD)
sensors = PoolSensors()
api = ApiClient(API_URL)


def read_and_send():
    if not wifi.connect():
        print("No se pudo conectar a Wi‑Fi")
        return

    data = sensors.read_all()
    if not data:
        print("No hay datos para enviar")
        return

    status_code, result = api.send_reading(data)
    print("Status:", status_code)
    print("Respuesta:", result)


if __name__ == "__main__":
    read_and_send()
