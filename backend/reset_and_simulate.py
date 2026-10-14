import sys
import os
import requests
from datetime import datetime, date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.db import get_connection

def clean_todays_data():
    conn = get_connection()
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT id_jornada FROM jornada WHERE fecha = %s ORDER BY id_jornada DESC LIMIT 1", (date.today(),))
                row = cur.fetchone()
                if row:
                    id_jornada = row[0]
                    print(f"Limpiando datos de la jornada de hoy (id: {id_jornada})...")
                    cur.execute("DELETE FROM medicion WHERE id_jornada = %s", (id_jornada,))
                    cur.execute("DELETE FROM aforo_camara WHERE id_jornada = %s", (id_jornada,))
                    cur.execute("DELETE FROM prediccion WHERE id_jornada = %s", (id_jornada,))
                    cur.execute("DELETE FROM resumen_diario WHERE id_jornada = %s", (id_jornada,))
                    conn.commit()
                    print("Datos limpiados.")
                else:
                    print("No hay jornada para hoy, empezaremos una nueva.")
        except Exception as e:
            print(f"Error al limpiar BD: {e}")
        finally:
            conn.close()

def post_reading(hour, ph, turbidez, temperatura, personas):
    dt_str = f"{date.today().isoformat()}T{hour:02d}:00:00"
    payload = {
        "ph": ph,
        "turbidez": turbidez,
        "temperatura": temperatura,
        "personas": personas,
        "fecha_hora": dt_str
    }
    print(f"\n--- Enviando lectura de las {hour:02d}:00 ---")
    response = requests.post("http://localhost:8000/lecturas", json=payload)
    if response.status_code == 201:
        data = response.json()
        print("Guardado con éxito!")
        pred = data.get('prediccion', {})
        if pred:
            print(f"-> Predicción actualizada (Franjas capturadas: {pred.get('franjas_capturadas')} - {pred.get('tipo')})")
            print(f"   Cloro: {pred.get('cloro_g')}g | Aluminio: {pred.get('aluminio_g')}g | Cobre: {pred.get('cobre_g')}g")
    else:
        print("Error:", response.status_code, response.text)

if __name__ == "__main__":
    clean_todays_data()
    
    post_reading(8, 7.2, 1.2, 26.5, 5)
    post_reading(9, 7.25, 1.5, 27.0, 12)
    post_reading(10, 7.3, 1.8, 28.5, 25)
    post_reading(11, 7.35, 2.5, 29.5, 45)
    post_reading(12, 7.4, 3.2, 31.0, 60)
    
    print("\nProceso terminado. Ya puedes revisar el panel en el frontend.")
