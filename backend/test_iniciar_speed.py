import time
from backend.app.services.dosificacion_service import dosificacion_manager

t0 = time.time()
print("Llamando a dosificacion_manager.iniciar()...")
res = dosificacion_manager.iniciar("Cloro", 25.0, "parcial", descontar_inventario=False)
print("Resultado:", res, "Tiempo:", round(time.time() - t0, 3), "segundos")
