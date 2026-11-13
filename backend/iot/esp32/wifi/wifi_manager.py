import network
import time


class WiFiManager:
    """Gestión sencilla de conexión Wi‑Fi del ESP32."""

    def __init__(self, ssid: str, password: str, timeout: int = 20):
        self.ssid = ssid
        self.password = password
        self.timeout = timeout

    def connect(self):
        sta = network.WLAN(network.STA_IF)
        sta.active(True)

        if not sta.isconnected():
            print(f"Conectando a Wi‑Fi: {self.ssid}")
            sta.connect(self.ssid, self.password)
            deadline = time.time() + self.timeout
            while not sta.isconnected() and time.time() < deadline:
                time.sleep(0.5)

        if sta.isconnected():
            print("Wi‑Fi conectado. IP:", sta.ifconfig()[0])
            return True

        print("No se pudo conectar a Wi‑Fi.")
        return False

    def status(self):
        sta = network.WLAN(network.STA_IF)
        if sta and sta.isconnected():
            return sta.ifconfig()
        return None
