class PoolSensors:
    """Abstracción para sensores de la piscina.

    Este módulo debería ser implementado con los sensores reales del ESP32,
    pero queda estructurado para que el firmware envíe datos al backend.
    """

    def __init__(self):
        self.last_values = {}

    def read_ph(self):
        raise NotImplementedError("Implementar lectura real del sensor de pH")

    def read_turbidity(self):
        raise NotImplementedError("Implementar lectura real del sensor de turbidez")

    def read_temperature(self):
        raise NotImplementedError("Implementar lectura real del sensor de temperatura")

    def read_people_count(self):
        return 0

    def read_all(self):
        return {
            "ph": self.read_ph(),
            "turbidez": self.read_turbidity(),
            "temperatura": self.read_temperature(),
            "personas": self.read_people_count(),
        }
